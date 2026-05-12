package main

import (
	"bufio"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func loadEnvFromFile() {
	cwd, _ := os.Getwd()
	path := filepath.Join(cwd, "..", ".env")
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		if key == "" {
			continue
		}
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("missing %s in environment", key)
	}
	return value
}

func main() {
	loadEnvFromFile()

	targetRaw := mustGetEnv("OPENAI_BASE_URL")
	apiKey := mustGetEnv("OPENAI_API_KEY")
	port := os.Getenv("BACKEND_PORT")
	if port == "" {
		port = "8787"
	}

	target, err := url.Parse(targetRaw)
	if err != nil {
		log.Fatalf("invalid OPENAI_BASE_URL: %v", err)
	}

	proxy := newProxy(target, apiKey)
	upstreamBase := strings.TrimRight(targetRaw, "/")

	store, err := openLoginStore()
	if err != nil {
		log.Printf("login db init failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	mux.Handle("/chat", withCORS(handleChat(upstreamBase, apiKey)))
	mux.Handle("/auth/token", withCORS(handleAuthToken(store)))
	mux.Handle("/v1/", withCORS(proxy))
	mux.Handle("/v1", withCORS(proxy))

	addr := ":" + port
	log.Printf("Go proxy listening on %s", addr)
	if err := http.ListenAndServe(addr, logRequests(mux)); err != nil {
		log.Fatal(err)
	}
}

func withCORS(next http.Handler) http.Handler {
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

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodPost {
			log.Printf("request %s %s", r.Method, r.URL.Path)
		}
		next.ServeHTTP(w, r)
	})
}
