package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func newProxy(target *url.URL, apiKey string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		// 移除上游 CORS 头，避免与 withCORS 中间件重复
		for key := range resp.Header {
			if strings.HasPrefix(strings.ToLower(key), "access-control-") {
				resp.Header.Del(key)
			}
		}
		return nil
	}

	proxy.Transport = &loggingTransport{base: http.DefaultTransport}

	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"upstream_error","message":"%s"}`, err.Error())))
	}

	return proxy
}

type loggingTransport struct {
	base http.RoundTripper
}

func (t *loggingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}

	logConsolef("proxy %s %s", req.Method, req.URL.String())

	var requestBody []byte
	if req.Body != nil {
		requestBody, _ = io.ReadAll(req.Body)
		_ = req.Body.Close()
		req.Body = io.NopCloser(bytes.NewReader(requestBody))
	}
	logJSONEvent("proxy_request", map[string]interface{}{
		"method": req.Method,
		"url":    req.URL.String(),
		"body":   string(requestBody),
	})

	resp, err := base.RoundTrip(req)
	if err != nil {
		logJSONEvent("proxy_error", map[string]interface{}{
			"method": req.Method,
			"url":    req.URL.String(),
			"error":  err.Error(),
		})
		return resp, err
	}

	// SSE 流式响应不消费 body，避免阻塞流传输
	isStream := strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream")
	if isStream {
		logJSONEvent("proxy_response_stream", map[string]interface{}{
			"method": req.Method,
			"url":    req.URL.String(),
			"status": resp.StatusCode,
		})
		return resp, nil
	}

	var responseBody []byte
	if resp.Body != nil {
		responseBody, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		resp.Body = io.NopCloser(bytes.NewReader(responseBody))
	}
	logJSONEvent("proxy_response", map[string]interface{}{
		"method": req.Method,
		"url":    req.URL.String(),
		"status": resp.StatusCode,
		"body":   string(responseBody),
	})

	return resp, nil
}
