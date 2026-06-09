package main

type LLMContext struct {
	Prompt   string     `json:"prompt"`
	Messages []*Message `json:"messages"`
	Tools    []*Tool    `json:"tools"`
	// Files    []File            `json:"files"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// type Conversation struct {
// 	ID        string    `json:"id"`
// 	Title     string    `json:"title"`
// 	CreatedAt time.Time `json:"createdAt"`
// 	UpdatedAt time.Time `json:"updatedAt"`
// 	Tags      []string  `json:"tags,omitempty"`
// }

// type User struct {
// 	ID     string   `json:"id"`
// 	Name   string   `json:"name"`
// 	Email  string   `json:"email,omitempty"`
// 	Roles  []string `json:"roles,omitempty"`
// 	Locale string   `json:"locale,omitempty"`
// }

// type File struct {
// 	ID       string `json:"id"`
// 	Name     string `json:"name"`
// 	MIMEType string `json:"mimeType,omitempty"`
// 	Size     int64  `json:"size,omitempty"`
// 	URL      string `json:"url,omitempty"`
// 	Checksum string `json:"checksum,omitempty"`
// 	Content  string `json:"content,omitempty"`
// }
