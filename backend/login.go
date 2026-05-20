package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type loginStore struct {
	db *sql.DB
	ro *sql.DB
}

type authTokenRequest struct {
	Token string `json:"token"`
}

type authLoginRequest struct {
	UserName string `json:"user_name"`
	UserPSW  string `json:"user_psw"`
}

type authTokenResponse struct {
	TokenValid bool   `json:"token_valid"`
	UserID     string `json:"user_ID"`
	UserName   string `json:"user_name"`
	NewToken   string `json:"new_token"`
}

type authLoginResponse struct {
	UserExist bool   `json:"user_exist"`
	PswRight  bool   `json:"psw_right"`
	UserID    string `json:"user_ID"`
	NewToken  string `json:"new_token"`
}

const (
	rootUserName = "root"
	rootUserID   = 0
	rootToken    = "00000000000000000000000000000000"
)

func openLoginStore() (*loginStore, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	dbPath := filepath.Join(cwd, "database.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := retryLocked(6, 400*time.Millisecond, func() error {
		_, execErr := db.Exec("PRAGMA journal_mode=WAL;")
		if execErr != nil {
			return execErr
		}
		_, execErr = db.Exec("PRAGMA busy_timeout=5000;")
		if execErr != nil {
			return execErr
		}
		return nil
	}); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	store := &loginStore{db: db}
	if err := retryLocked(6, 400*time.Millisecond, store.ensureSchema); err != nil {
		_ = db.Close()
		return nil, err
	}
	ro, err := openReadOnlyDB(dbPath)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	store.ro = ro
	return store, nil
}

func openReadOnlyDB(dbPath string) (*sql.DB, error) {
	uriPath := filepath.ToSlash(dbPath)
	if strings.HasPrefix(uriPath, "//") {
		uriPath = strings.TrimPrefix(uriPath, "/")
	}
	dsn := fmt.Sprintf("file:%s?mode=ro", uriPath)
	ro, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	ro.SetMaxOpenConns(1)
	ro.SetMaxIdleConns(1)
	if err := ro.Ping(); err != nil {
		_ = ro.Close()
		return nil, err
	}
	return ro, nil
}

func (s *loginStore) ensureSchema() error {
	if s == nil || s.db == nil {
		return errors.New("login store not initialized")
	}
	statements := []string{
		`CREATE TABLE IF NOT EXISTS user (
      user_id INTEGER PRIMARY KEY,
      user_name TEXT NOT NULL,
      user_password TEXT NOT NULL,
      user_token TEXT NOT NULL,
	token_time TEXT NOT NULL,
	CHECK (user_id BETWEEN 0 AND 63),
	CHECK (length(user_name) <= 16),
	CHECK (length(user_password) <= 32),
      CHECK (length(user_token) = 32)
    );`,
		`CREATE TABLE IF NOT EXISTS conversation (
			conversation_id INTEGER PRIMARY KEY,
			user_id INTEGER NOT NULL,
			last_edit_time TEXT NOT NULL,
			title TEXT NOT NULL,
			model TEXT NOT NULL,
			prompt TEXT NOT NULL,
			CHECK (conversation_id BETWEEN 0 AND 4095),
			CHECK (length(title) <= 32),
			CHECK (length(model) <= 32),
			FOREIGN KEY (user_id) REFERENCES user(user_id)
		);`,
		`CREATE TABLE IF NOT EXISTS message (
			message_id INTEGER PRIMARY KEY,
			conversation_id INTEGER NOT NULL,
			time TEXT NOT NULL,
			roll TEXT NOT NULL,
			context TEXT NOT NULL,
			CHECK (message_id BETWEEN 0 AND 8388607),
			CHECK (roll IN ('user', 'llm')),
			FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id)
		);`,
		`CREATE TABLE IF NOT EXISTS files (
			files_id INTEGER PRIMARY KEY,
			message_id INTEGER NOT NULL,
			time TEXT NOT NULL,
			file_name TEXT NOT NULL,
			file_hash TEXT NOT NULL,
			CHECK (files_id BETWEEN 0 AND 1048575),
			FOREIGN KEY (message_id) REFERENCES message(message_id)
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_token ON user (user_token);`,
	}
	for _, stmt := range statements {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	if err := s.ensureTokenTimeColumn(); err != nil {
		return err
	}
	return s.ensureConversationSeed()
}

func (s *loginStore) ensureTokenTimeColumn() error {
	if s == nil || s.db == nil {
		return errors.New("login store not initialized")
	}
	rows, err := s.db.Query(`PRAGMA table_info(user);`)
	if err != nil {
		return err
	}
	columnExists := false
	for rows.Next() {
		var cid int
		var name string
		var colType string
		var notNull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dflt, &pk); err != nil {
			_ = rows.Close()
			return err
		}
		if name == "token_time" {
			columnExists = true
			break
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if !columnExists {
		if _, err := s.db.Exec(`ALTER TABLE user ADD COLUMN token_time TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(`UPDATE user SET token_time = ? WHERE token_time = '' OR token_time IS NULL`, now)
	return err
}

func (s *loginStore) ensureConversationSeed() error {
	if s == nil || s.db == nil {
		return errors.New("login store not initialized")
	}
	var count int
	if err := s.db.QueryRow("SELECT COUNT(1) FROM conversation").Scan(&count); err != nil {
		return err
	}
	if count != 0 {
		return nil
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO conversation (conversation_id, user_id, last_edit_time, title, model, prompt)
    VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()

	for id := 0; id <= 4095; id++ {
		title := fmt.Sprintf("notused_conversation_%d", id)
		if _, err := stmt.Exec(id, 0, now, title, "deepseek-v4-flash", "0"); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (s *loginStore) ensureRootUser(password string) error {
	if s == nil || s.db == nil {
		return errors.New("login store not initialized")
	}
	password = strings.TrimSpace(password)
	if password == "" {
		return errors.New("ROOT_PSW is empty")
	}
	if len(password) > 32 {
		return fmt.Errorf("ROOT_PSW must be <= 32 chars, got %d", len(password))
	}
	return retryLocked(6, 400*time.Millisecond, func() error {
		var existing string
		err := s.db.QueryRow(
			"SELECT user_id FROM user WHERE user_name = ? LIMIT 1",
			rootUserName,
		).Scan(&existing)
		if err == nil {
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		_, err = s.db.Exec(
			`INSERT INTO user (user_id, user_name, user_password, user_token, token_time)
     VALUES (?, ?, ?, ?, ?)`,
			rootUserID,
			rootUserName,
			password,
			rootToken,
			time.Now().UTC().Format(time.RFC3339),
		)
		return err
	})
}

func (s *loginStore) checkpointWAL() error {
	if s == nil || s.db == nil {
		return nil
	}
	return retryLocked(6, 400*time.Millisecond, func() error {
		_, err := s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE);")
		return err
	})
}

func (s *loginStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	if s.ro != nil {
		_ = s.ro.Close()
	}
	return s.db.Close()
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
		var tokenTime string
		err := store.db.QueryRow(
			"SELECT user_id, user_name, user_token, token_time FROM user WHERE user_token = ? LIMIT 1",
			payload.Token,
		).Scan(&userID, &userName, &userToken, &tokenTime)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusOK, authTokenResponse{TokenValid: false})
				return
			}
			log.Printf("auth token query failed: %v", err)
			writeJSON(w, http.StatusOK, authTokenResponse{TokenValid: false})
			return
		}

		newToken := userToken
		if tokenExpired(tokenTime, time.Now().UTC()) {
			replacement, err := store.generateUniqueToken(32)
			if err != nil {
				log.Printf("token rotate failed: %v", err)
			} else {
				if _, err := store.db.Exec(
					`UPDATE user SET user_token = ?, token_time = ? WHERE user_id = ?`,
					replacement,
					time.Now().UTC().Format(time.RFC3339),
					userID,
				); err != nil {
					log.Printf("token rotate update failed: %v", err)
				} else {
					newToken = replacement
				}
			}
		}

		writeJSON(w, http.StatusOK, authTokenResponse{
			TokenValid: true,
			UserID:     userID,
			UserName:   userName,
			NewToken:   newToken,
		})
	})
}

func handleAuthLogin(store *loginStore) http.Handler {
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

		var payload authLoginRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}
		payload.UserName = strings.TrimSpace(payload.UserName)
		payload.UserPSW = strings.TrimSpace(payload.UserPSW)
		if payload.UserName == "" || payload.UserPSW == "" {
			writeJSON(w, http.StatusOK, authLoginResponse{UserExist: false, PswRight: false})
			return
		}

		var userID string
		var userPassword string
		err := store.db.QueryRow(
			"SELECT user_id, user_password FROM user WHERE user_name = ? LIMIT 1",
			payload.UserName,
		).Scan(&userID, &userPassword)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusOK, authLoginResponse{UserExist: false, PswRight: false})
				return
			}
			log.Printf("auth login query failed: %v", err)
			writeJSON(w, http.StatusOK, authLoginResponse{UserExist: false, PswRight: false})
			return
		}

		if userPassword != payload.UserPSW {
			writeJSON(w, http.StatusOK, authLoginResponse{UserExist: true, PswRight: false})
			return
		}

		newToken, err := store.generateUniqueToken(32)
		if err != nil {
			log.Printf("login token generate failed: %v", err)
			writeJSON(w, http.StatusOK, authLoginResponse{UserExist: true, PswRight: false})
			return
		}
		if _, err := store.db.Exec(
			`UPDATE user SET user_token = ?, token_time = ? WHERE user_id = ?`,
			newToken,
			time.Now().UTC().Format(time.RFC3339),
			userID,
		); err != nil {
			log.Printf("login token update failed: %v", err)
			writeJSON(w, http.StatusOK, authLoginResponse{UserExist: true, PswRight: false})
			return
		}

		writeJSON(w, http.StatusOK, authLoginResponse{
			UserExist: true,
			PswRight:  true,
			UserID:    userID,
			NewToken:  newToken,
		})
	})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func tokenExpired(tokenTime string, now time.Time) bool {
	if tokenTime == "" {
		return true
	}
	parsed, err := time.Parse(time.RFC3339, tokenTime)
	if err != nil {
		return true
	}
	return now.Sub(parsed) >= 14*24*time.Hour
}

func (s *loginStore) generateUniqueToken(length int) (string, error) {
	if s == nil || s.db == nil {
		return "", errors.New("login store not initialized")
	}
	for i := 0; i < 10; i++ {
		candidate, err := randomToken(length)
		if err != nil {
			return "", err
		}
		var exists int
		err = s.db.QueryRow(
			"SELECT 1 FROM user WHERE user_token = ? LIMIT 1",
			candidate,
		).Scan(&exists)
		if errors.Is(err, sql.ErrNoRows) {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", errors.New("unable to generate unique token")
}

func randomToken(length int) (string, error) {
	const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	if length <= 0 {
		return "", errors.New("invalid token length")
	}
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := range buf {
		buf[i] = charset[int(buf[i])%len(charset)]
	}
	return string(buf), nil
}

func retryLocked(attempts int, delay time.Duration, fn func() error) error {
	var err error
	for i := 0; i < attempts; i++ {
		err = fn()
		if err == nil {
			return nil
		}
		if !isLockedError(err) {
			return err
		}
		time.Sleep(delay)
	}
	return err
}

func isLockedError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "database is locked") || strings.Contains(msg, "sqlite_busy")
}
