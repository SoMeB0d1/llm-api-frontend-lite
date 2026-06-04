package backend

import "time"

type Message struct {
	ID          int64     `json:"id"`      // Corrected type from string to int
	Role        string    `json:"role"`    //Role: llm, System, User, ToolResult
	Success     bool      `json:"Success"` //false if tool call failed or llm call failed
	Content     string    `json:"content"`
	Thinking    string    `json:"thinking,omitempty"`
	ToolCall    string    `json:"toolCallId,omitempty"`
	CreatedTime time.Time `json:"createdAt"`
}

func (this *Message) getID() bool {
	// TODO: get new ID
	return true
}
