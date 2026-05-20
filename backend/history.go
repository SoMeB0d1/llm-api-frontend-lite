package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type historyRequest struct {
	UserID int64 `json:"user_id"`
}

type historyItem struct {
	LastEditTime   string `json:"last_edit_time"`
	Title          string `json:"title"`
	ConversationID int64  `json:"conversation_id"`
}

type historyTopicRequest struct {
	ConversationID int64 `json:"conversation_id"`
}

type historyTopicItem struct {
	MessageID int64  `json:"message_id"`
	Time      string `json:"time"`
	Roll      string `json:"roll"`
	Context   string `json:"context"`
}

func handleHistoryTopic(store *loginStore) http.Handler {
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

		db := store.db
		if store.ro != nil {
			db = store.ro
		}

		var payload historyTopicRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		rows, err := db.Query(
			`SELECT message_id, time, roll, context
			FROM message
			WHERE conversation_id = ?
			ORDER BY message_id ASC`,
			payload.ConversationID,
		)
		if err != nil {
			log.Printf("history topic query failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}
		defer rows.Close()

		items := make([]historyTopicItem, 0)
		for rows.Next() {
			var item historyTopicItem
			if err := rows.Scan(&item.MessageID, &item.Time, &item.Roll, &item.Context); err != nil {
				log.Printf("history topic scan failed: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "db_error",
				})
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			log.Printf("history topic rows failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(items)
	})
}

func handleHistory(store *loginStore) http.Handler {
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

		db := store.db
		if store.ro != nil {
			db = store.ro
		}

		var payload historyRequest
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

		var exists int
		err := db.QueryRow(
			"SELECT 1 FROM user WHERE user_id = ? LIMIT 1",
			payload.UserID,
		).Scan(&exists)
		if err != nil {
			log.Printf("history user lookup failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		rows, err := db.Query(
			`SELECT last_edit_time, title, conversation_id
			FROM conversation
			WHERE user_id = ?
			ORDER BY last_edit_time DESC`,
			payload.UserID,
		)
		if err != nil {
			log.Printf("history query failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}
		defer rows.Close()

		items := make([]historyItem, 0)
		for rows.Next() {
			var item historyItem
			if err := rows.Scan(&item.LastEditTime, &item.Title, &item.ConversationID); err != nil {
				log.Printf("history scan failed: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "db_error",
				})
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			log.Printf("history rows failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(items)
	})
}
