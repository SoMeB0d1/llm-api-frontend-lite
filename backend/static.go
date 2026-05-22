package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

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

func handleStatic(publicDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		urlPath := r.URL.Path
		filePath := resolveStaticPath(publicDir, urlPath)
		if filePath == "" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

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
	})
}

func resolveStaticPath(publicDir, urlPath string) string {
	cleaned := strings.SplitN(urlPath, "?", 2)[0]

	relative := cleaned
	if cleaned == "/" || cleaned == "" {
		relative = "/token_check/token_check.html"
	} else if cleaned == "/login" || cleaned == "/login/" {
		relative = "/login/login.html"
	} else if cleaned == "/token_check" || cleaned == "/token_check/" {
		relative = "/token_check/token_check.html"
	}

	if strings.HasSuffix(relative, "/") {
		relative = relative + "index.html"
	}

	decoded, err := url.PathUnescape(relative)
	if err != nil {
		return ""
	}

	resolved := filepath.Clean(filepath.Join(publicDir, filepath.FromSlash(decoded)))
	if !strings.HasPrefix(resolved, publicDir) {
		return ""
	}
	return resolved
}

// writeJSON 用于处理错误响应（与 login.go 中的 writeJSON 相同）
// 已在 login.go 中定义，此处不重复。
func writeStaticJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
