package backend

import (
	"errors"
	"os"
)

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters,omitempty"`
	Required    []string               `json:"required,omitempty"`

	Function func(params map[string]interface{}) (*Message, error) `json:"-"`
}

var searchString Tool = Tool{
	Name:        "search",
	Description: "Search for information on the internet.",
	Parameters: map[string]interface{}{
		"query": "The search query.",
	},
	Required: []string{"query"},
	Function: func(params map[string]interface{}) (*Message, error) {

		query, ok := params["query"].(string)
		if !ok {
			return nil, errors.New("invalid parameters")
		}

		searchURL, ok := os.Getenv("SEARCH_URL")
		if !ok {
			return nil, errors.New("SEARCH_URL not set in environment variables")
		}

		return nil, nil
	},
}
