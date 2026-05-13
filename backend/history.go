package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
)

type historyRequest struct {
	UserID string `json:"user_id"`
}

type historyItem struct {
	LastEditTime   string `json:"last_edit_time"`
	Title          string `json:"title"`
	ConversationID int64  `json:"conversation_id"`
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

		var payload historyRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}
		payload.UserID = strings.TrimSpace(payload.UserID)
		if payload.UserID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_user_id",
			})
			return
		}

		var exists int
		err := store.db.QueryRow(
			"SELECT 1 FROM user WHERE user_id = ? LIMIT 1",
			payload.UserID,
		).Scan(&exists)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusNotFound, map[string]string{
					"error": "user_not_found",
				})
				return
			}
			log.Printf("history user lookup failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		rows, err := store.db.Query(
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
