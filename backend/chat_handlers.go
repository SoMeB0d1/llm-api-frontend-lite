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
	UserID  string `json:"userId"`
	TopicID string `json:"topicId"`
	Model   string `json:"model"`
	Message string `json:"message"`
}

type ChatResponse struct {
	Answer string `json:"answer"`
	Model  string `json:"model"`
}

type upstreamMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type upstreamRequest struct {
	Model    string            `json:"model"`
	Messages []upstreamMessage `json:"messages"`
	User     string            `json:"user,omitempty"`
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

func callUpstream(ctx context.Context, baseURL, apiKey string, payload ChatRequest) (string, error) {
	translated := translate(payload.Message)
	systemNote := fmt.Sprintf("user_id=%s; topic_id=%s; requested_model=%s", payload.UserID, payload.TopicID, payload.Model)
	requestBody := upstreamRequest{
		Model: "deepseek-v4-flash",
		Messages: []upstreamMessage{
			{Role: "system", Content: systemNote},
			{Role: "user", Content: translated},
		},
		User: payload.UserID,
	}

	data, err := json.Marshal(requestBody)
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/v1/chat/completions"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(request)
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

		answer, err := callUpstream(r.Context(), baseURL, apiKey, payload)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"upstream_error","message":"%s"}`, err.Error())))
			return
		}

		response := ChatResponse{Answer: answer, Model: "deepseek-v4-flash"}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
}
