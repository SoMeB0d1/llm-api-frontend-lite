package backend

import "time"

type Message struct {
	ID          string    `json:"id"`
	Role        string    `json:"role"` //Role: llmSuccess, System, User, llmFailed, ToolResult
	Content     string    `json:"content"`
	Thinking    *Thinking `json:"thinking,omitempty"`
	ToolCallID  string    `json:"toolCallId,omitempty"`
	CreatedTime time.Time `json:"createdAt"`
}