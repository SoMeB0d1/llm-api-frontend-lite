package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

type loginStore struct {
	db *sql.DB
}

type authTokenRequest struct {
	Token string `json:"token"`
}

type authTokenResponse struct {
	TokenValid bool   `json:"token_valid"`
	UserID     string `json:"user_ID"`
	UserName   string `json:"user_name"`
	NewToken   string `json:"new_token"`
}

func openLoginStore() (*loginStore, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	dbPath := filepath.Join(cwd, "login.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	store := &loginStore{db: db}
	if err := store.ensureSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *loginStore) ensureSchema() error {
	if s == nil || s.db == nil {
		return errors.New("login store not initialized")
	}
	statements := []string{
		`CREATE TABLE IF NOT EXISTS user (
      user_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      user_password TEXT NOT NULL,
      user_token TEXT NOT NULL,
      CHECK (length(user_id) = 32),
      CHECK (length(user_name) <= 32),
      CHECK (length(user_password) = 32),
      CHECK (length(user_token) = 32)
    );`,
		`CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_date TEXT NOT NULL,
      history_json TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(user_id)
    );`,
		`CREATE INDEX IF NOT EXISTS idx_history_user_date ON history (user_id, chat_date);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_token ON user (user_token);`,
	}
	for _, stmt := range statements {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func handleAuthToken(store *loginStore) http.Handler {
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

		var payload authTokenRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}
		payload.Token = strings.TrimSpace(payload.Token)
		if payload.Token == "" {
			writeJSON(w, http.StatusOK, authTokenResponse{TokenValid: false})
			return
		}

		var userID string
		var userName string
		var userToken string
		err := store.db.QueryRow(
			"SELECT user_id, user_name, user_token FROM user WHERE user_token = ? LIMIT 1",
			payload.Token,
		).Scan(&userID, &userName, &userToken)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusOK, authTokenResponse{TokenValid: false})
				return
			}
			log.Printf("auth token query failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "db_error",
			})
			return
		}

		writeJSON(w, http.StatusOK, authTokenResponse{
			TokenValid: true,
			UserID:     userID,
			UserName:   userName,
			NewToken:   userToken,
		})
	})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
