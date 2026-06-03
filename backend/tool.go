package backend

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters,omitempty"`
	Required    []string               `json:"required,omitempty"`

	Function func(params map[string]interface{}) (*Message, error) `json:"-"`
}

const searchString Tool = Tool{
	Name:        "search",
	Description: "Search for information on the internet.",
	Parameters: map[string]interface{}{
		"query": "The search query.",
	},
	Required: []string{"query"},
	Function: func(params map[string]interface{}) (*Message, error) {
		query, ok := params["query"].(string)
		if !ok {
			return nil, ErrInvalidParameters
		}
		// Implement your search logic here, e.g., call an external API or perform a database search.
	},
}
