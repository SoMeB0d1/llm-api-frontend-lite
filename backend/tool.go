package backend

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters,omitempty"`
	Required    []string               `json:"required,omitempty"`

	Function func(params map[string]interface{}) (*Message, error) `json:"-"`
}

var search Tool = Tool{
	Name:        "search",
	Description: "Search for information on the internet.",
	Parameters: map[string]interface{}{
		"text":  "The search query.",
		"limit": "The number of search results to return (optional).",
		"lang":  "The language of the search results (optional).",
		"date":  "The date of the search results (optional).",
		"start": "The starting index of the search results (optional).",
		"site":  "The site to search (optional).",
	},
	Required: []string{"query"},
	Function: func(params map[string]interface{}) (*Message, error) {
		var returnMessage Message = Message{
			Role:        "ToolResult",
			Content:     "internal error: do not use this tool again! ",
			Success:     false,
			Thinking:    "",
			ToolCall:    "search",
			CreatedTime: time.Now(),
		}
		ok := returnMessage.getID()
		if !ok {
			return nil, errors.New("failed to get message ID")
		}

		//get parameters
		text, ok := params["text"].(string)
		if !ok {
			returnMessage.Content = "invalid parameters: text is required and must be a string"
			return &returnMessage, errors.New("invalid parameters")
		}
		limit, ok := params["limit"].(int)
		if !ok {
			returnMessage.Content = "invalid parameters: limit must be an integer"
			return &returnMessage, errors.New("invalid parameters")
		}
		if limit <= 0 {
			limit = 10 //default value
		}

		//get searchURL from environment variable
		searchURL := os.Getenv("SEARCH_URL")
		if searchURL == "" {
			return nil, errors.New("SEARCH_URL environment variable not set")
		}

		//post request to searchURL with text and limit as parameters, and return the response
		base := strings.TrimRight(searchURL, "/")
		q := url.QueryEscape(text)
		endpoint := base + "/bing/search?text=" + q + "&limit=" + fmt.Sprintf("%d", limit)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Get(endpoint)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, errors.New("search request failed with status: " + resp.Status)
		}

		msg := &Message{
			Role:        "ToolResult",
			Content:     string(body),
			CreatedTime: time.Now(),
		}
		return msg, nil
	},
}
