package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type ChatRequest struct {
	UserID         int64  `json:"userId"`
	ConversationID int64  `json:"conversationId"`
	Model          string `json:"model"`
	Prompt         string `json:"prompt,omitempty"`
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

const defaultConversationPrompt = "You are an assistant. "

var errMessageIDRangeFull = errors.New("message_id_range_full")
var errConversationIDRangeFull = errors.New("conversation_id_range_full")

// buildUpstreamRequest 根据 ChatRequest 和数据库历史记录构建上游请求体。
// conversationId == -1 表示新对话，不查询数据库。
// 数据库查询失败时返回 error。
func buildUpstreamRequest(payload ChatRequest, store *loginStore, stream bool) (upstreamRequest, error) {
	messages := make([]upstreamMessage, 0)

	if payload.ConversationID == -1 {
		// 新对话：不使用数据库，仅将 prompt（若有）作为 system 和当前 message 作为 user
		if strings.TrimSpace(payload.Prompt) != "" {
			messages = append(messages, upstreamMessage{Role: "system", Content: payload.Prompt})
		}
		messages = append(messages, upstreamMessage{Role: "user", Content: payload.Message})
		return upstreamRequest{
			Model:    payload.Model,
			Messages: messages,
			User:     strconv.FormatInt(payload.UserID, 10),
			Stream:   stream,
		}, nil
	}

	// 已有对话：查询数据库获取 prompt 和历史消息
	if store == nil || store.db == nil {
		return upstreamRequest{}, errors.New("login store not initialized")
	}

	// 查询 conversation 的 prompt
	var prompt string
	err := store.db.QueryRow(
		`SELECT prompt FROM conversation WHERE conversation_id = ?`,
		payload.ConversationID,
	).Scan(&prompt)
	if err != nil {
		return upstreamRequest{}, fmt.Errorf("query conversation failed: %w", err)
	}

	// prompt 作为 system 在最开头
	if strings.TrimSpace(prompt) != "" {
		messages = append(messages, upstreamMessage{Role: "system", Content: prompt})
	}

	// 查询历史 message，按时间顺序
	rows, err := store.db.Query(
		`SELECT roll, context FROM message
		 WHERE conversation_id = ?
		 ORDER BY time ASC, message_id ASC`,
		payload.ConversationID,
	)
	if err != nil {
		return upstreamRequest{}, fmt.Errorf("query messages failed: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var roll, context string
		if scanErr := rows.Scan(&roll, &context); scanErr != nil {
			return upstreamRequest{}, fmt.Errorf("scan message failed: %w", scanErr)
		}
		role := roll
		if role == "llm" {
			role = "assistant"
		}
		messages = append(messages, upstreamMessage{Role: role, Content: context})
	}
	if err := rows.Err(); err != nil {
		return upstreamRequest{}, fmt.Errorf("iterate messages failed: %w", err)
	}

	return upstreamRequest{
		Model:    payload.Model,
		Messages: messages,
		User:     strconv.FormatInt(payload.UserID, 10),
		Stream:   stream,
	}, nil
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

func callUpstream(ctx context.Context, baseURL, apiKey string, payload ChatRequest, store *loginStore) (string, error) {
	reqBody, err := buildUpstreamRequest(payload, store, false)
	if err != nil {
		return "", err
	}
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
func streamUpstream(ctx context.Context, baseURL, apiKey string, payload ChatRequest, store *loginStore, w http.ResponseWriter) (bool, string, error) {
	reqBody, err := buildUpstreamRequest(payload, store, true)
	if err != nil {
		return false, "", err
	}
	data, err := json.Marshal(reqBody)
	if err != nil {
		return false, "", err
	}

	resp, err := doUpstream(ctx, baseURL, apiKey, data)
	if err != nil {
		return false, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return false, "", fmt.Errorf("upstream status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "text/event-stream") {
		// 上游返回非 SSE（JSON），直接解析 body 并回写，不回退到 callUpstream
		body, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return false, "", readErr
		}
		var parsed upstreamResponse
		if err := json.Unmarshal(body, &parsed); err != nil || len(parsed.Choices) == 0 {
			return false, "", fmt.Errorf("non-stream parse error: %w", err)
		}
		answer := parsed.Choices[0].Message.Content
		return false, answer, nil
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		return false, "", errors.New("response writer does not support flushing")
	}

	w.Header().Set("X-Conversation-Id", strconv.FormatInt(payload.ConversationID, 10))
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	buf := make([]byte, 4096)
	var remaining string
	var fullText strings.Builder
	type streamDelta struct {
		Choices []struct {
			Delta struct {
				Content string `json:"content"`
			} `json:"delta"`
		} `json:"choices"`
	}
	for {
		select {
		case <-ctx.Done():
			return true, fullText.String(), ctx.Err()
		default:
		}
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return true, fullText.String(), writeErr
			}
			flusher.Flush()

			chunk := remaining + string(buf[:n])
			lines := strings.Split(chunk, "\n")
			if !strings.HasSuffix(chunk, "\n") {
				remaining = lines[len(lines)-1]
				lines = lines[:len(lines)-1]
			} else {
				remaining = ""
			}
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				if payload == "[DONE]" {
					continue
				}
				var parsed streamDelta
				if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
					continue
				}
				if len(parsed.Choices) == 0 {
					continue
				}
				delta := parsed.Choices[0].Delta.Content
				if delta != "" {
					fullText.WriteString(delta)
				}
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				return true, fullText.String(), nil
			}
			return true, fullText.String(), readErr
		}
	}
}

// rmPastMessage 删除时间最靠前的 conversation 及其所有 message 和关联 files。
// 返回被释放的 conversation_id，供 createConversation 复用。
func (s *loginStore) rmPastMessage() (int64, error) {
	if s == nil || s.db == nil {
		return 0, errors.New("login store not initialized")
	}
	var conversationID int64
	err := retryLocked(6, 400*time.Millisecond, func() error {
		tx, txErr := s.db.Begin()
		if txErr != nil {
			return txErr
		}
		defer func() {
			if txErr != nil {
				_ = tx.Rollback()
			}
		}()

		txErr = tx.QueryRow(
			`SELECT conversation_id FROM conversation
			 ORDER BY last_edit_time ASC
			 LIMIT 1`,
		).Scan(&conversationID)
		if txErr != nil {
			return txErr
		}

		_, txErr = tx.Exec(
			`DELETE FROM files WHERE message_id IN (
			 SELECT message_id FROM message WHERE conversation_id = ?
		 )`,
			conversationID,
		)
		if txErr != nil {
			return txErr
		}

		_, txErr = tx.Exec(
			`DELETE FROM message WHERE conversation_id = ?`,
			conversationID,
		)
		if txErr != nil {
			return txErr
		}

		_, txErr = tx.Exec(
			`DELETE FROM conversation WHERE conversation_id = ?`,
			conversationID,
		)
		if txErr != nil {
			return txErr
		}

		txErr = tx.Commit()
		return txErr
	})
	if err != nil {
		return 0, err
	}
	return conversationID, nil
}

func (s *loginStore) createConversation(userID int64, model, prompt string) (int64, error) {
	if s == nil || s.db == nil {
		return 0, errors.New("login store not initialized")
	}
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		prompt = defaultConversationPrompt
	}

	// 优先选取未使用过的 conversation（没有关联 message 即为未使用）
	var conversationID int64
	err := retryLocked(6, 400*time.Millisecond, func() error {
		tx, txErr := s.db.Begin()
		if txErr != nil {
			return txErr
		}
		defer func() {
			if txErr != nil {
				_ = tx.Rollback()
			}
		}()

		txErr = tx.QueryRow(
			`SELECT c.conversation_id FROM conversation c
			 LEFT JOIN message m ON c.conversation_id = m.conversation_id
			 WHERE m.conversation_id IS NULL
			 ORDER BY c.last_edit_time ASC
			 LIMIT 1`,
		).Scan(&conversationID)
		if txErr != nil {
			if errors.Is(txErr, sql.ErrNoRows) {
				var nextID int64
				txErr = tx.QueryRow(
					`SELECT COALESCE(
             (SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM conversation WHERE conversation_id = 0)),
             (SELECT c1.conversation_id + 1
              FROM conversation c1
              LEFT JOIN conversation c2 ON c2.conversation_id = c1.conversation_id + 1
              WHERE c2.conversation_id IS NULL AND c1.conversation_id < 4095
              ORDER BY c1.conversation_id ASC
              LIMIT 1),
             -1
           )`,
				).Scan(&nextID)
				if txErr != nil {
					return txErr
				}
				if nextID < 0 {
					return errConversationIDRangeFull
				}
				conversationID = nextID
				now := time.Now().UTC().Format(time.RFC3339)
				_, txErr = tx.Exec(
					`INSERT INTO conversation (conversation_id, user_id, last_edit_time, title, model, prompt)
            VALUES (?, ?, ?, ?, ?, ?)`,
					conversationID,
					userID,
					now,
					"new_conversation",
					model,
					prompt,
				)
				if txErr != nil {
					return txErr
				}
				txErr = tx.Commit()
				return txErr
			}
			return txErr
		}

		now := time.Now().UTC().Format(time.RFC3339)
		_, txErr = tx.Exec(
			`UPDATE conversation
			 SET user_id = ?, last_edit_time = ?, title = ?, model = ?, prompt = ?
			 WHERE conversation_id = ?`,
			userID,
			now,
			"new_conversation",
			model,
			prompt,
			conversationID,
		)
		if txErr != nil {
			return txErr
		}

		txErr = tx.Commit()
		return txErr
	})
	if err == nil {
		return conversationID, nil
	}

	if errors.Is(err, errConversationIDRangeFull) {
		// conversation_id 用尽：调用 rmPastMessage 释放一个，然后以此 ID 新建
		freedID, rmErr := s.rmPastMessage()
		if rmErr != nil {
			return 0, rmErr
		}

		err = retryLocked(6, 400*time.Millisecond, func() error {
			now := time.Now().UTC().Format(time.RFC3339)
			_, txErr := s.db.Exec(
				`INSERT INTO conversation (conversation_id, user_id, last_edit_time, title, model, prompt)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				freedID, userID, now, "new_conversation", model, prompt,
			)
			return txErr
		})
		if err != nil {
			return 0, err
		}
		return freedID, nil
	}

	return 0, err
}

func (s *loginStore) createMessage(conversationID int64, roll, context string) (int64, error) {
	if s == nil || s.db == nil {
		return 0, errors.New("login store not initialized")
	}
	for attempt := 0; attempt < 5; attempt++ {
		var messageID int64
		err := retryLocked(6, 400*time.Millisecond, func() error {
			tx, txErr := s.db.Begin()
			if txErr != nil {
				return txErr
			}
			defer func() {
				if txErr != nil {
					_ = tx.Rollback()
				}
			}()

			var exists int
			txErr = tx.QueryRow(
				"SELECT 1 FROM message WHERE message_id = 0 LIMIT 1",
			).Scan(&exists)
			if txErr != nil {
				if errors.Is(txErr, sql.ErrNoRows) {
					messageID = 0
				} else {
					return txErr
				}
			} else {
				var next sql.NullInt64
				txErr = tx.QueryRow(
					`SELECT m1.message_id + 1
      FROM message m1
      LEFT JOIN message m2 ON m2.message_id = m1.message_id + 1
      WHERE m2.message_id IS NULL AND m1.message_id < 8388607
      ORDER BY m1.message_id ASC
      LIMIT 1`,
				).Scan(&next)
				if txErr != nil {
					if errors.Is(txErr, sql.ErrNoRows) {
						return errors.New("message_id_range_full")
					}
					return txErr
				}
				if !next.Valid {
					return errMessageIDRangeFull
				}
				messageID = next.Int64
			}

			now := time.Now().UTC().Format(time.RFC3339)
			_, txErr = tx.Exec(
				`INSERT INTO message (message_id, conversation_id, time, roll, context)
     VALUES (?, ?, ?, ?, ?)`,
				messageID,
				conversationID,
				now,
				roll,
				context,
			)
			if txErr != nil {
				return txErr
			}

			_, txErr = tx.Exec(
				`UPDATE conversation SET last_edit_time = ? WHERE conversation_id = ?`,
				now,
				conversationID,
			)
			if txErr != nil {
				return txErr
			}

			txErr = tx.Commit()
			return txErr
		})
		if err == nil {
			return messageID, nil
		}
		if errors.Is(err, errMessageIDRangeFull) {
			if _, rmErr := s.rmPastMessage(); rmErr != nil {
				logConsolef("rmPastMessage failed: %v", rmErr)
			}
			continue
		}
		if isConstraintError(err) {
			continue
		}
		return 0, err
	}
	return 0, errors.New("unable to allocate message_id")
}

func isConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "constraint") || strings.Contains(msg, "unique")
}

type titleRequest struct {
	UserID         int64 `json:"userId"`
	ConversationID int64 `json:"conversationId"`
}

type titleResponse struct {
	Title          string `json:"title"`
	ConversationID int64  `json:"conversationId"`
}

func callTitleUpstream(ctx context.Context, baseURL, apiKey, model, text string) (string, error) {
	if strings.TrimSpace(model) == "" {
		return "", errors.New("title_model_missing")
	}
	requestBody := upstreamRequest{
		Model: model,
		Messages: []upstreamMessage{
			{Role: "system", Content: "你是摘要生成器。请用原文语言输出不超过32个字符的摘要，只输出摘要文本，不要解释或提问。若文本过短，直接复述并截断到32字符以内。"},
			{Role: "user", Content: text},
		},
	}
	// fmt.Printf("First message: %s\n", text)
	data, err := json.Marshal(requestBody)
	// fmt.Printf("Request body: %s\n", string(data))
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

func trimTitle(text string, limit int) string {
	trimmed := strings.TrimSpace(text)
	if limit <= 0 {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) <= limit {
		return trimmed
	}
	return string(runes[:limit])
}

func handleTitle(baseURL, apiKey, titleModel string, store *loginStore) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if store == nil || store.db == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "login_store_unavailable",
			})
			return
		}

		var payload titleRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}
		if payload.UserID < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_user_id",
			})
			return
		}

		var firstMessage string
		err := store.db.QueryRow(
			`SELECT m.context
      FROM conversation c
      JOIN message m ON m.conversation_id = c.conversation_id
      WHERE c.conversation_id = ? AND c.user_id = ? AND m.roll = 'user'
			ORDER BY m.time ASC, m.message_id ASC
      LIMIT 1`,
			payload.ConversationID,
			payload.UserID,
		).Scan(&firstMessage)
		if err != nil {
			logConsolef("title lookup failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}
		runes := []rune(firstMessage)
		preview := firstMessage
		if len(runes) > 64 {
			preview = string(runes[:64])
		}
		logJSONEvent("title_first_message", map[string]interface{}{
			"conversation_id": payload.ConversationID,
			"user_id":         payload.UserID,
			"length":          len(runes),
			"preview":         preview,
		})

		answer, err := callTitleUpstream(r.Context(), baseURL, apiKey, titleModel, firstMessage)
		if err != nil {
			logConsolef("title upstream failed: %v", err)
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"upstream_error","message":"%s"}`, err.Error())))
			return
		}
		title := trimTitle(answer, 32)
		if _, err := store.db.Exec(
			`UPDATE conversation SET title = ? WHERE conversation_id = ? AND user_id = ?`,
			title,
			payload.ConversationID,
			payload.UserID,
		); err != nil {
			logConsolef("title update failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		writeJSON(w, http.StatusOK, titleResponse{Title: title, ConversationID: payload.ConversationID})
	})
}

func handleChat(baseURL, apiKey string, store *loginStore) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if store == nil || store.db == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "login_store_unavailable",
			})
			return
		}

		var payload ChatRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_json"}`))
			return
		}
		payload.Message = strings.TrimSpace(payload.Message)
		payload.Prompt = strings.TrimSpace(payload.Prompt)
		if payload.Message == "" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"empty_message"}`))
			return
		}

		if payload.ConversationID == -1 {
			if payload.UserID < 0 {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"error": "invalid_user_id",
				})
				return
			}
			promptToStore := defaultConversationPrompt
			if payload.Prompt != "" {
				promptToStore = payload.Prompt
			}
			conversationID, err := store.createConversation(payload.UserID, payload.Model, promptToStore)
			if err != nil {
				logConsolef("create conversation failed: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "db_error",
				})
				return
			}
			payload.ConversationID = conversationID
		} else {
			var exists int
			if err := store.db.QueryRow(
				"SELECT 1 FROM conversation WHERE conversation_id = ? LIMIT 1",
				payload.ConversationID,
			).Scan(&exists); err != nil {
				logConsolef("conversation lookup failed: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "db_error",
				})
				return
			}
		}

		if _, err := store.createMessage(payload.ConversationID, "user", payload.Message); err != nil {
			logConsolef("insert user message failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		// 1) 尝试流式输出（或自动回退并已写入 JSON）
		streamed, streamAnswer, streamErr := streamUpstream(r.Context(), baseURL, apiKey, payload, store, w)
		if streamed {
			if streamErr != nil && !errors.Is(streamErr, context.Canceled) {
				logConsolef("stream error after headers: %v", streamErr)
			}
			if streamAnswer != "" {
				if _, err := store.createMessage(payload.ConversationID, "llm", streamAnswer); err != nil {
					logConsolef("insert llm message failed: %v", err)
				}
			}
			return
		}
		// streamed=false 且 err==nil 表示 streamUpstream 已成功写入 JSON 响应
		if streamErr == nil {
			if _, err := store.createMessage(payload.ConversationID, "llm", streamAnswer); err != nil {
				logConsolef("insert llm message failed: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "db_error",
				})
				return
			}
			response := ChatResponse{Answer: streamAnswer, Model: "deepseek-v4-flash", ConversationID: payload.ConversationID}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(response)
			return
		}

		// 2) streamUpstream 失败，回退到非流式
		logConsolef("stream failed, fallback to non-stream: %v", streamErr)
		answer, err := callUpstream(r.Context(), baseURL, apiKey, payload, store)
		if err != nil {
			status := http.StatusBadGateway
			errMsg := strings.ToLower(err.Error())
			if strings.Contains(errMsg, "query conversation failed") ||
				strings.Contains(errMsg, "query messages failed") ||
				strings.Contains(errMsg, "iterate messages failed") ||
				strings.Contains(errMsg, "scan message failed") ||
				strings.Contains(errMsg, "login store not initialized") {
				status = http.StatusInternalServerError
			}
			w.WriteHeader(status)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"upstream_error","message":"%s"}`, err.Error())))
			return
		}
		if _, err := store.createMessage(payload.ConversationID, "llm", answer); err != nil {
			logConsolef("insert llm message failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		response := ChatResponse{Answer: answer, Model: "deepseek-v4-flash", ConversationID: payload.ConversationID}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
}
