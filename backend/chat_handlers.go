package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type ChatRequest struct {
	UserID         string `json:"userId"`
	ConversationID int64  `json:"conversationId"`
	Model          string `json:"model"`
	Message        string `json:"message"`
}

type ChatResponse struct {
	Answer         string `json:"answer"`
	Model          string `json:"model"`
	ConversationID int64  `json:"conversationId"`
}

type upstreamMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type upstreamRequest struct {
	Model    string            `json:"model"`
	Messages []upstreamMessage `json:"messages"`
	User     string            `json:"user,omitempty"`
	Stream   bool              `json:"stream,omitempty"`
}

type upstreamChoice struct {
	Message upstreamMessage `json:"message"`
}

type upstreamResponse struct {
	Choices []upstreamChoice `json:"choices"`
}

func translate(input string) string {
	// TODO: add history
	return input
}

func buildUpstreamRequest(payload ChatRequest, stream bool) upstreamRequest {
	translated := translate(payload.Message)
	systemNote := fmt.Sprintf("user_id=%s; conversation_id=%d; requested_model=%s", payload.UserID, payload.ConversationID, payload.Model)
	return upstreamRequest{
		Model: "deepseek-v4-flash",
		Messages: []upstreamMessage{
			{Role: "system", Content: systemNote},
			{Role: "user", Content: translated},
		},
		User:   payload.UserID,
		Stream: stream,
	}
}

func doUpstream(ctx context.Context, baseURL, apiKey string, body []byte) (*http.Response, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/v1/chat/completions"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	return client.Do(request)
}

func callUpstream(ctx context.Context, baseURL, apiKey string, payload ChatRequest) (string, error) {
	reqBody := buildUpstreamRequest(payload, false)
	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	resp, err := doUpstream(ctx, baseURL, apiKey, data)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("upstream status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed upstreamResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("upstream returned no choices")
	}
	return parsed.Choices[0].Message.Content, nil
}

// streamUpstream attempts SSE streaming from upstream.
// Returns (streamed=true, err) — if streamed, headers were already written.
// Returns (streamed=false, err) if caller should fall back to non-streaming.
func streamUpstream(ctx context.Context, baseURL, apiKey string, payload ChatRequest, w http.ResponseWriter) (bool, error) {
	reqBody := buildUpstreamRequest(payload, true)
	data, err := json.Marshal(reqBody)
	if err != nil {
		return false, err
	}

	resp, err := doUpstream(ctx, baseURL, apiKey, data)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("upstream status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "text/event-stream") {
		// 上游返回非 SSE（JSON），直接解析 body 并回写，不回退到 callUpstream
		body, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return false, readErr
		}
		var parsed upstreamResponse
		if err := json.Unmarshal(body, &parsed); err != nil || len(parsed.Choices) == 0 {
			return false, fmt.Errorf("non-stream parse error: %w", err)
		}
		answer := parsed.Choices[0].Message.Content
		response := ChatResponse{Answer: answer, Model: "deepseek-v4-flash", ConversationID: payload.ConversationID}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
		return false, nil
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		return false, errors.New("response writer does not support flushing")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	buf := make([]byte, 4096)
	for {
		select {
		case <-ctx.Done():
			return true, ctx.Err()
		default:
		}
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return true, writeErr
			}
			flusher.Flush()
		}
		if readErr != nil {
			if readErr == io.EOF {
				return true, nil
			}
			return true, readErr
		}
	}
}

func handleChat(baseURL, apiKey string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var payload ChatRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_json"}`))
			return
		}
		payload.Message = strings.TrimSpace(payload.Message)
		if payload.Message == "" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"empty_message"}`))
			return
		}

		// 1) 尝试流式输出（或自动回退并已写入 JSON）
		streamed, streamErr := streamUpstream(r.Context(), baseURL, apiKey, payload, w)
		if streamed {
			if streamErr != nil && !errors.Is(streamErr, context.Canceled) {
				logConsolef("stream error after headers: %v", streamErr)
			}
			return
		}
		// streamed=false 且 err==nil 表示 streamUpstream 已成功写入 JSON 响应
		if streamErr == nil {
			return
		}

		// 2) streamUpstream 失败，回退到非流式
		logConsolef("stream failed, fallback to non-stream: %v", streamErr)
		answer, err := callUpstream(r.Context(), baseURL, apiKey, payload)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"upstream_error","message":"%s"}`, err.Error())))
			return
		}

		response := ChatResponse{Answer: answer, Model: "deepseek-v4-flash", ConversationID: payload.ConversationID}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
}
