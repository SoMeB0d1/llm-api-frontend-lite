package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
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
	getJson  func() string                                         `json:"-"`
}

type searchResult struct {
	Rank    int    `json:"rank"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

func fillFailedMessage(toolName string, internal bool, errorMessage string) (*Message, error) {
	if internal {
		errorMessage = "tool internal error: " + errorMessage
	} else {
		errorMessage = "parameter error: " + errorMessage
	}
	returnMessage := Message{
		Role:        "ToolResult",
		Content:     errorMessage,
		Success:     false,
		Thinking:    "",
		ToolCall:    toolName,
		CreatedTime: time.Now(),
	}
	ok := returnMessage.getID()
	if !ok {
		return &returnMessage, errors.New("failed to get message ID")
	}
	return &returnMessage, nil
}

var search Tool = Tool{
	Name:        "search",
	Description: "Search for information on the internet.",
	Parameters: map[string]interface{}{
		"text":       "String: The search text.",
		"limit":      "Integer: The number of search results to return (optional, default is 10).",
		"region":     "String: The region of the search results (optional, default is 'CN', choose from 'CN', 'GB', 'US', 'KR', 'RU', 'JP').",
		"begin_date": "String: The date of the search results (optional, YYYYMMDD).",
		"end_date":   "String: The date of the search results (optional, YYYYMMDD).",
		"start":      "Integer: The starting index of the search results (optional).",
		"site":       "String: The site to search (optional).",
	},
	Required: []string{"text"},
	Function: func(params map[string]interface{}) (*Message, error) {
		//get parameters
		var text, region, site string
		var limit, start, begin_date, end_date int

		if params["text"] == nil {
			returnMessage, error := fillFailedMessage("search", false, "parameter 'text' is required")
			if error != nil {
				return nil, error
			}
			return returnMessage, nil
		}
		if v, ok := params["text"].(string); ok {
			text = v
		} else {
			returnMessage, error := fillFailedMessage("search", false, "parameter 'text' should be string")
			if error != nil {
				return nil, error
			}
			return returnMessage, nil
		}

		if params["region"] != nil {
			if v, ok := params["region"].(string); ok {
				region = v
			} else {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'region' should be string")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		if params["site"] != nil {
			if v, ok := params["site"].(string); ok {
				site = v
			} else {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'site' should be string")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		if params["limit"] != nil {
			if v, ok := params["limit"].(int); ok {
				limit = int(v)
			} else {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'limit' should be int")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		if params["start"] != nil {
			if v, ok := params["start"].(int); ok {
				start = int(v)
			} else {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'start' should be int")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		if params["begin_date"] != nil {
			if v, ok := params["begin_date"].(int); ok {
				begin_date = v
			} else {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'begin_date' should be int")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		if params["end_date"] != nil {
			if v, ok := params["end_date"].(int); ok {
				end_date = v
			} else {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'end_date' should be int")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		//test region value
		if region != "" {
			validRegions := map[string]bool{
				"CN": true,
				"GB": true,
				"US": true,
				"KR": true,
				"RU": true,
				"JP": true,
			}
			if !validRegions[region] {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'region' has an invalid value, only 'CN', 'GB', 'US', 'KR', 'RU', 'JP' are allowed")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		//test date value
		if (begin_date != 0 && end_date == 0) || (begin_date == 0 && end_date != 0) {
			returnMessage, error := fillFailedMessage("search", false, "parameters 'begin_date' and 'end_date' should be both provided or both not provided")
			if error != nil {
				return nil, error
			}
			return returnMessage, nil
		}
		if begin_date != 0 && end_date != 0 {
			if begin_date > end_date {
				returnMessage, error := fillFailedMessage("search", false, "parameter 'begin_date' should not be later than 'end_date'")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
			begin_month := begin_date % 10000 / 100
			begin_day := begin_date % 100
			end_month := end_date % 10000 / 100
			end_day := end_date % 100

			if begin_month < 1 || begin_month > 12 || end_month < 1 || end_month > 12 {
				returnMessage, error := fillFailedMessage("search", false, "parameters 'begin_date' and 'end_date' should have valid month value (1-12) and year value")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}

			DaysInMonth := map[int]int{
				1:  31,
				2:  29,
				3:  31,
				4:  30,
				5:  31,
				6:  30,
				7:  31,
				8:  31,
				9:  30,
				10: 31,
				11: 30,
				12: 31,
			}

			if begin_day < 1 || begin_day > DaysInMonth[begin_month] || end_day < 1 || end_day > DaysInMonth[end_month] {
				returnMessage, error := fillFailedMessage("search", false, "parameters 'begin_date' and 'end_date' should have valid day value")
				if error != nil {
					return nil, error
				}
				return returnMessage, nil
			}
		}

		//get searchURL from environment variable
		searchURL := os.Getenv("SEARCH_URL")
		if searchURL == "" {
			return nil, errors.New("SEARCH_URL environment variable not set")
		}

		//post request to searchURL with text and limit as parameters, and return the response
		base := strings.TrimRight(searchURL, "/")
		endpoint := base + "/search?"
		endpoint += "text=" + url.QueryEscape(text)
		if region != "" {
			endpoint += "&region=" + url.QueryEscape(region)
		}
		if site != "" {
			endpoint += "&site=" + url.QueryEscape(site)
		}
		if limit != 0 {
			endpoint += "&limit=" + fmt.Sprintf("%d", limit)
		} else {
			endpoint += "&limit=10"
		}
		if start != 0 {
			endpoint += "&start=" + fmt.Sprintf("%d", start)
		}
		if begin_date != 0 && end_date != 0 {
			endpoint += fmt.Sprintf("&date=%d..%d", begin_date, end_date)
		}
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

		//analyze body
		returnMessage := Message{
			Role:        "ToolResult",
			Success:     true,
			Thinking:    "",
			ToolCall:    "search",
			CreatedTime: time.Now(),
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			returnMessage, err := fillFailedMessage("search", true, fmt.Sprintf("search service returned status code %d", resp.StatusCode))
			if err != nil {
				return nil, err
			}
			log.Printf("ERROR: %s: %s", endpoint, resp.Status)
			return returnMessage, nil
		}

		type searchResponse struct {
			Results []searchResult `json:"results"`
			Result  []searchResult `json:"result"`
		}

		var response searchResponse
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, err
		}

		sourceResults := response.Results
		if len(sourceResults) == 0 {
			sourceResults = response.Result
		}

		simplifiedResults := make([]searchResult, 0, len(sourceResults))
		for _, result := range sourceResults {
			simplifiedResults = append(simplifiedResults, searchResult{
				Rank:    result.Rank,
				Title:   result.Title,
				URL:     result.URL,
				Snippet: result.Snippet,
			})
		}

		content, err := json.Marshal(simplifiedResults)
		if err != nil {
			rMessage, err := fillFailedMessage("search", true, fmt.Sprintf("failed to marshal search results: %v", err))
			if err != nil {
				return nil, err
			}
			return rMessage, nil
		}
		returnMessage.Content = string(content)

		return &returnMessage, nil
	},
	getJson: func() string {
		return `{"type":"function","function":{"name":"search","description":"Search for information on the internet.","parameters":{"type":"object","properties":{"text":{"type":"string","description":"The search text."},"limit":{"type":"integer","description":"The number of search results to return (optional, default is 10)."},"region":{"type":"string","description":"The region of the search results (optional, default is 'CN', choose from 'CN', 'GB', 'US', 'KR', 'RU', 'JP').","enum":["CN","GB","US","KR","RU","JP"]},"begin_date":{"type":"integer","description":"The date of the search results (optional, YYYYMMDD)."},"end_date":{"type":"integer","description":"The date of the search results (optional, YYYYMMDD)."},"start":{"type":"integer","description":"The starting index of the search results (optional)."},"site":{"type":"string","description":"The site to search (optional)."}},"required":["text"]}}}`
	},
}
