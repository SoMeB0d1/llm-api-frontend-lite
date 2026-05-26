package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

// findProjectDir returns the best-guess project root directory.
// Priority: exeDir > parent(exeDir) > cwd > parent(cwd).
// This covers both production (exe in root) and go run . (exe in temp, cwd in backend/).
func findProjectDir() string {
	cwd, _ := os.Getwd()

	candidates := []string{
		exeDir(),
		filepath.Dir(exeDir()),
		cwd,
	}
	if cwd != "" {
		candidates = append(candidates, filepath.Dir(cwd))
	}

	for _, dir := range candidates {
		if dir == "" {
			continue
		}
		// Check for .env as a marker file
		if _, err := os.Stat(filepath.Join(dir, ".env")); err == nil {
			return dir
		}
		// Also accept frontend/ directory as marker
		if info, err := os.Stat(filepath.Join(dir, "frontend")); err == nil && info.IsDir() {
			return dir
		}
	}

	// Fallback: return exeDir()
	ed := exeDir()
	if ed != "" {
		return ed
	}
	return cwd
}

func loadEnvFromFile() {
	path := filepath.Join(findProjectDir(), ".env")
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
	if err := initLogging(); err != nil {
		log.New(os.Stderr, "", log.LstdFlags).Printf("log init failed: %v", err)
	}

	targetRaw := mustGetEnv("OPENAI_BASE_URL")
	apiKey := mustGetEnv("OPENAI_API_KEY")
	titleModel := os.Getenv("TITLE_MODEL")
	port := os.Getenv("OPEN_PORT")
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
	if store != nil {
		rootPassword := os.Getenv("ROOT_PSW")
		if rootPassword != "" {
			if err := store.ensureRootUser(rootPassword); err != nil {
				log.Printf("root user init failed: %v", err)
			}
		} else {
			log.Printf("ROOT_PSW is empty; root user not created")
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	mux.Handle("/chat", withCORS(handleChat(upstreamBase, apiKey, store)))
	mux.Handle("/title", withCORS(handleTitle(upstreamBase, apiKey, titleModel, store)))
	mux.Handle("/history", withCORS(handleHistory(store)))
	mux.Handle("/history/topic", withCORS(handleHistoryTopic(store)))
	mux.Handle("/back", withCORS(handleBack(store)))
	mux.Handle("/auth/login", withCORS(handleAuthLogin(store)))
	mux.Handle("/auth/token", withCORS(handleAuthToken(store)))
	mux.Handle("/v1/", withCORS(proxy))
	mux.Handle("/v1", withCORS(proxy))

	// 静态文件服务（fallback：未匹配 API 路由时）
	projectDir := findProjectDir()
	pubDir := filepath.Join(projectDir, "frontend")
	log.Printf("Serving static files from: %s", pubDir)
	staticHandler := withCORS(handleStatic(pubDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		staticHandler.ServeHTTP(w, r)
	})

	addr := ":" + port
	server := &http.Server{Addr: addr, Handler: logJSONMiddleware(mux)}
	log.Printf("Unified server listening on %s", addr)

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("server error: %v", err)
		}
	}()

	<-shutdown
	log.Printf("shutdown requested")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	if err := store.checkpointWAL(); err != nil {
		log.Printf("wal checkpoint error: %v", err)
	}
	if err := store.Close(); err != nil {
		log.Printf("db close error: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Expose-Headers", "X-Conversation-Id")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
