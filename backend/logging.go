package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	maxLogFileSize = int64(512 * 1024 * 1024)
	maxLogDirSize  = int64(8 * 1024 * 1024 * 1024)
)

type rotatingWriter struct {
	dir  string
	mu   sync.Mutex
	file *os.File
	size int64
	path string
}

var (
	fileLogger    *log.Logger
	consoleLogger *log.Logger
)

func initLogging() error {
	consoleLogger = log.New(os.Stdout, "", log.LstdFlags)
	log.SetOutput(os.Stdout)
	log.SetFlags(log.LstdFlags)

	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	logDir := filepath.Join(cwd, "log")
	writer, err := newRotatingWriter(logDir)
	if err != nil {
		return err
	}
	fileLogger = log.New(writer, "", log.LstdFlags)
	return nil
}

func newRotatingWriter(dir string) (*rotatingWriter, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	writer := &rotatingWriter{dir: dir}
	if err := writer.rotateLocked(); err != nil {
		return nil, err
	}
	return writer, nil
}

func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.file == nil {
		if err := w.rotateLocked(); err != nil {
			return 0, err
		}
	}
	if w.size+int64(len(p)) > maxLogFileSize {
		if err := w.rotateLocked(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(p)
	w.size += int64(n)
	if w.size >= maxLogFileSize {
		_ = w.rotateLocked()
	}
	return n, err
}

func (w *rotatingWriter) rotateLocked() error {
	if w.file != nil {
		_ = w.file.Close()
	}
	timestamp := time.Now().Format("20060102-150405")
	var path string
	for i := 0; i < 1000; i++ {
		name := fmt.Sprintf("server-%s-%03d.log", timestamp, i)
		candidate := filepath.Join(w.dir, name)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			path = candidate
			break
		}
	}
	if path == "" {
		return fmt.Errorf("unable to allocate log file")
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	w.file = file
	w.path = path
	w.size = 0
	w.cleanupLocked()
	return nil
}

func (w *rotatingWriter) cleanupLocked() {
	entries, err := os.ReadDir(w.dir)
	if err != nil {
		return
	}
	type fileEntry struct {
		path    string
		size    int64
		modTime time.Time
	}
	var files []fileEntry
	var total int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(w.dir, entry.Name())
		files = append(files, fileEntry{path: path, size: info.Size(), modTime: info.ModTime()})
		total += info.Size()
	}
	if total <= maxLogDirSize {
		return
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime.Before(files[j].modTime)
	})
	for _, file := range files {
		if total <= maxLogDirSize {
			break
		}
		if file.path == w.path {
			continue
		}
		if err := os.Remove(file.path); err == nil {
			total -= file.size
		}
	}
}

type responseRecorder struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(data []byte) (int, error) {
	r.body.Write(data)
	return r.ResponseWriter.Write(data)
}

func logJSONMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}

		logConsolef("request %s %s", r.Method, r.URL.Path)

		var requestBody []byte
		if r.Body != nil {
			requestBody, _ = io.ReadAll(r.Body)
			r.Body = io.NopCloser(bytes.NewReader(requestBody))
		}

		recorder := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)

		logJSONEvent("backend_exchange", map[string]interface{}{
			"method":        r.Method,
			"path":          r.URL.Path,
			"query":         r.URL.RawQuery,
			"request_body":  string(requestBody),
			"status":        recorder.status,
			"response_body": recorder.body.String(),
		})
	})
}

func logJSONEvent(event string, payload map[string]interface{}) {
	payload["event"] = event
	data, err := json.Marshal(payload)
	if err != nil {
		logConsolef("log_marshal_error event=%s err=%v", event, err)
		return
	}
	if fileLogger != nil {
		fileLogger.Printf("%s", data)
		return
	}
	logConsolef("%s", data)
}

func logConsolef(format string, args ...interface{}) {
	if consoleLogger != nil {
		consoleLogger.Printf(format, args...)
		return
	}
	log.Printf(format, args...)
}
