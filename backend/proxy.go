package main

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func newProxy(target *url.URL, apiKey string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"upstream_error","message":"%s"}`, err.Error())))
	}

	return proxy
}
