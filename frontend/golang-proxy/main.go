package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config holds all runtime configuration
type Config struct {
	FrontendPort int
	BackendPort  int
	BackendURL   string
	PublicDir    string
}

var config Config

var contentTypes = map[string]string{
	".html": "text/html; charset=utf-8",
	".js":   "text/javascript; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".svg":  "image/svg+xml",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".json": "application/json; charset=utf-8",
	".ico":  "image/x-icon",
}

func main() {
	config = loadConfig()
	log.Printf("Frontend proxy starting on port %d", config.FrontendPort)
	log.Printf("Backend target: %s", config.BackendURL)
	log.Printf("Public directory: %s", config.PublicDir)

	mux := http.NewServeMux()
	mux.HandleFunc("/", handler)

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", config.FrontendPort),
		Handler: corsMiddleware(mux),
	}

	log.Fatal(server.ListenAndServe())
}

func loadConfig() Config {
	// Load .env from parent directory (same path relative to golang-proxy/)
	loadEnvFile(filepath.Join("..", "..", ".env"))

	cfg := Config{
		FrontendPort: 3000,
		BackendPort:  8787,
	}
	if v := os.Getenv("FRONTEND_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.FrontendPort = p
		}
	}
	if v := os.Getenv("BACKEND_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.BackendPort = p
		}
	}
	cfg.BackendURL = os.Getenv("BACKEND_URL")
	if cfg.BackendURL == "" {
		cfg.BackendURL = fmt.Sprintf("http://localhost:%d", cfg.BackendPort)
	}

	// Public directory: golang-proxy's parent (frontend/)
	execDir, err := os.Getwd()
	if err != nil {
		execDir = "."
	}
	cfg.PublicDir = filepath.Join(execDir, "..")
	return cfg
}

func loadEnvFile(filePath string) {
	f, err := os.Open(filePath)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if key != "" && os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handler(w http.ResponseWriter, r *http.Request) {
	// Route matching (order matters)

	// POST /chat
	if r.URL.Path == "/chat" && r.Method == http.MethodPost {
		handleProxyWithSSE(w, r, "/chat")
		return
	}

	// POST /history
	if r.URL.Path == "/history" && r.Method == http.MethodPost {
		handleProxySimple(w, r, "/history")
		return
	}

	// POST /history/topic
	if r.URL.Path == "/history/topic" && r.Method == http.MethodPost {
		handleProxySimple(w, r, "/history/topic")
		return
	}

	// POST /title
	if r.URL.Path == "/title" && r.Method == http.MethodPost {
		handleProxySimple(w, r, "/title")
		return
	}

	// /v1/* and /auth/* proxy
	if strings.HasPrefix(r.URL.Path, "/v1") || strings.HasPrefix(r.URL.Path, "/auth") {
		handleProxyPassThrough(w, r)
		return
	}

	// Static file serving
	handleStatic(w, r)
}

func buildBackendURL(reqPath string) string {
	return strings.TrimRight(config.BackendURL, "/") + reqPath
}

// handleProxySimple forwards a request to backend and returns the response as-is.
func handleProxySimple(w http.ResponseWriter, r *http.Request, backendPath string) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read_body_error"})
		return
	}
	defer r.Body.Close()

	if len(body) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "empty_body"})
		return
	}

	targetURL := buildBackendURL(backendPath)
	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}
	proxyReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

// handleProxyPassThrough forwards any method/body to backend and returns the response.
func handleProxyPassThrough(w http.ResponseWriter, r *http.Request) {
	targetURL := buildBackendURL(r.URL.Path)
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read_body_error"})
		return
	}
	defer r.Body.Close()

	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = strings.NewReader(string(body))
	}

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, bodyReader)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}

	if ct := r.Header.Get("Content-Type"); ct != "" {
		proxyReq.Header.Set("Content-Type", ct)
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

// handleProxyWithSSE forwards a POST request to backend, supporting SSE streaming and x-conversation-id header.
func handleProxyWithSSE(w http.ResponseWriter, r *http.Request, backendPath string) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read_body_error"})
		return
	}
	defer r.Body.Close()

	if len(body) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "empty_body"})
		return
	}

	targetURL := buildBackendURL(backendPath)
	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}
	proxyReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	conversationID := resp.Header.Get("X-Conversation-Id")

	// SSE streaming passthrough
	if strings.HasPrefix(contentType, "text/event-stream") {
		flusher, ok := w.(http.Flusher)
		if !ok {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming_not_supported"})
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		if conversationID != "" {
			w.Header().Set("X-Conversation-Id", conversationID)
		}
		w.WriteHeader(resp.StatusCode)

		buf := make([]byte, 4096)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				_, writeErr := w.Write(buf[:n])
				if writeErr != nil {
					return
				}
				flusher.Flush()
			}
			if readErr != nil {
				break
			}
		}
		return
	}

	// Non-SSE response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "proxy_error", "message": err.Error()})
		return
	}

	if contentType == "" {
		contentType = "application/json"
	}
	w.Header().Set("Content-Type", contentType)
	if conversationID != "" {
		w.Header().Set("X-Conversation-Id", conversationID)
	}
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

// handleStatic serves static files from the public directory.
func handleStatic(w http.ResponseWriter, r *http.Request) {
	urlPath := r.URL.Path

	// Route rewriting (same as server.js safePath)
	filePath := resolveStaticPath(urlPath)
	if filePath == "" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Check if file exists
	info, err := os.Stat(filePath)
	if err != nil || info.IsDir() {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	ct, ok := contentTypes[ext]
	if !ok {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func resolveStaticPath(urlPath string) string {
	// Strip query string
	cleaned := strings.SplitN(urlPath, "?", 2)[0]

	relative := cleaned
	if cleaned == "/" || cleaned == "" {
		relative = "/token_check/token_check.html"
	} else if cleaned == "/login" || cleaned == "/login/" {
		relative = "/login/login.html"
	} else if cleaned == "/token_check" || cleaned == "/token_check/" {
		relative = "/token_check/token_check.html"
	}

	// Append index.html for directory-like paths
	if strings.HasSuffix(relative, "/") {
		relative = relative + "index.html"
	}

	decoded, err := url.PathUnescape(relative)
	if err != nil {
		return ""
	}

	// Clean and join with public dir, preventing traversal
	resolved := filepath.Clean(filepath.Join(config.PublicDir, filepath.FromSlash(decoded)))

	// Ensure resolved path starts with publicDir
	if !strings.HasPrefix(resolved, config.PublicDir) {
		return ""
	}
	return resolved
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
