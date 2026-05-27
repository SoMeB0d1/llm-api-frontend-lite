# 前端与后端交互 API 一览

> 说明：所有请求都以 `baseUrl` 为前缀（来自本地缓存 `llm.baseUrl` 或设置页输入）。
> 前端页面会直接请求 `baseUrl`，也可以指向 `frontend/server.js` 的 Node 代理（它会转发 `/chat`、`/history`、`/history/topic`、`/v1/*`、`/auth/*` 到后端）。

## 认证相关

### POST /auth/login
- 用途：登录并获取令牌
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/login.go](backend/login.go)）
- 调用位置：
  - 登录页（[frontend/login/login.js](frontend/login/login.js)）
- 请求体（登录页）：
```json
{"user_name":"<string>","user_psw":"<string>"}
```
- 期望响应字段（登录页使用）：
```json
{"new_token":"<string>","user_ID":<number>,"user_exist":true,"psw_right":true}
```

### POST /auth/token
- 用途：校验当前 token，有时会刷新并返回新 token
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/login.go](backend/login.go)）
- 调用位置：
  - 主聊天页（[frontend/src/app.js](frontend/src/app.js)）
  - token 检查页（[frontend/token_check/token_check.js](frontend/token_check/token_check.js)）
- 请求体：
```json
{"token":"<string>"}
```
- 期望响应字段：
```json
{"token_valid":true,"new_token":"<string>","user_ID":<number>,"user_name":"<string>"}
```

## 聊天与历史

### POST /chat
- 用途：发送对话消息
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/chat_handlers.go](backend/chat_handlers.go)）
- 调用位置：主聊天页（[frontend/src/api.js](frontend/src/api.js) 中 `fetchStream` 和 `sendMessage`）
- 请求体：
```json
{
  "userId":<number>,
  "conversationId":<number>,
  "model":"<string>",
  "message":"<string>",
  "prompt":"<string>"  // 可选，仅新对话（conversationId==-1）时附带
}
```
- 响应（非流式 JSON）：
```json
{
  "answer":"<string>",
  "model":"<string>",
  "conversationId":<number>,
  "messageId":<number>,
  "userMessageId":<number>
}
```
- 说明：
  - 新对话时 `conversationId=-1`，后端会在 DB 中创建 conversation 并分配新的 `conversationId`
  - `prompt` 字段仅新对话时使用，作为 system prompt 存入 conversation 表
  - 后端优先尝试流式（SSE）响应，失败时自动回退到 JSON 响应
  - 流式响应头：
    - `X-Conversation-Id`: 会话 ID
    - `X-Message-Id`: LLM 回复的 message_id
    - `X-User-Message-Id`: 用户消息的 message_id
    - `Content-Type: text/event-stream`
  - 流式 SSE 数据格式遵循 OpenAI 标准：`data: {"choices":[{"delta":{"content":"..."}}]}`，结束标志 `data: [DONE]`
  - 前端收到流式头后：
    - 用 `X-Conversation-Id` 更新 `state.conversationId`
    - 用 `X-Message-Id` 设置 LLM 消息元素的 `data-message-id`
    - 用 `X-User-Message-Id` 设置用户消息元素的 `data-message-id`（查找前一个 `.message.user` 元素）
  - 非流式回退时，前端同样从 JSON 响应中提取 `conversationId`、`messageId`、`userMessageId` 并设置对应的 DOM 属性
  - 前端在收到错误响应时也会尝试提取 `conversationId`、`messageId`、`userMessageId`（若后端在错误 JSON 中返回了这些字段）

### POST /back
- 用途：回溯到指定消息，删除该消息时间**之后**（含同时刻但 message_id 更大）的所有消息及关联文件，并将 conversation 的 `last_edit_time` 回退到该消息的时间
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/chat_handlers.go](backend/chat_handlers.go)）
- 调用位置：主聊天页（[frontend/src/events.js](frontend/src/events.js) 和 [frontend/src/api.js](frontend/src/api.js) 中 `sendBack`）
- 请求体：
```json
{"userId":<number>,"messageId":<number>}
```
- 期望响应字段：
```json
{"ok":true}
```
- 后端处理细节：
  - 通过 `message_id` 查询该消息的 `conversation_id` 和 `time`
  - 校验 `conversation` 的 `user_id` 与请求中的 `userId` 是否匹配，不匹配返回 500 `{"error":"user_mismatch"}`
  - 事务中依次删除：
    1. `files` 表中 `message_id` 属于"该消息之后的 message"的记录
    2. `message` 表中 `conversation_id` 相同且 `time > 消息时间` 或 `(time == 消息时间 AND message_id > 传入的 messageId)` 的记录（即 **不删除** 传入 messageId 对应的那条消息本身）
    3. 更新 `conversation` 的 `last_edit_time` 为该消息的时间
  - 消息不存在时返回 500 `{"error":"message_not_found"}`
- 前端回溯逻辑：
  - 用户在 UI 点击回溯按钮时：
    1. 取按钮所在 `.message` 元素的 `data-message-id`
    2. 若该消息无 id（如占位补齐的 llm 消息），向上查找最近的前一个 `.message.user` 元素的 `data-message-id`
    3. 若仍未找到有效 id，提示"无法回溯该消息"
  - 回溯成功后调用 `loadConversation` 重新加载当前会话，展示回溯后的消息列表
  - 重新生成（regenerate）逻辑：
    - 先调用 `/back` 回溯到上一条 llm（assistant）消息的 messageId
    - 若上一条 llm 消息无 id（如占位补齐），按 back 按钮逻辑回退使用上一条 user 消息的 messageId
    - 回溯成功后重新发送上一条 user 消息的内容（prompt）

### POST /history
- 用途：获取历史会话列表
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/history.go](backend/history.go)）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）
- 请求体：
```json
{"user_id":<number>}
```
- 期望响应字段（直接返回数组）：
```json
[{"last_edit_time":"<string>","title":"<string>","conversation_id":123}]
```

### POST /history/topic
- 用途：获取指定会话的全部消息记录及模型名称
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/history.go](backend/history.go)）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）历史列表按钮点击事件
- 请求体：
```json
{"conversation_id":123}
```
- 期望响应字段（返回对象，包含 model 和 messages 数组）：
```json
{
  "model": "<string>",
  "messages": [
    {"message_id":1,"time":"<string>","roll":"<string>","context":"<string>"}
  ]
}
```
- 前端处理：
  - 解析 `data.model` 同步到 `state.model` 并更新 `modelSelect` 下拉框
  - 遍历 `data.messages` 逐条渲染消息，调用 `renderMessage(role, context, message_id)` 将 `message_id` 写入 DOM 元素的 `data-message-id` 属性（后续 `/back` 和 regenerate 操作依赖此属性获取 message id）
  - 加载完成后设置 `state.conversationId` 为当前会话 ID 并标记 `isNewChat = false`
  - 规范化规则：前端在渲染历史消息时会保证"每个 `user` 消息后面都有一条 `llm`（assistant）消息"。如果后端返回的消息序列中某个 `user` 消息后没有对应的 `llm` 消息，前端会在该处补上一条占位 `llm` 消息，内容为 `**Error**: Request not exist.`。补齐规则对对话末尾也生效（即最后一条是 user 时也会补齐）。补齐消息仅用于展示（没有 `message_id`，`data-message-id` 为空）
  - `/history/topic` 后端 SQL 查询按 `message_id ASC` 排序，保证消息顺序
- 错误处理：
  - 后端数据库查询失败时返回 500 `{ "error": "db_error" }`
  - 前端收到 500 后弹窗提示"出现问题，请联系管理员"

### POST /title
- 用途：生成并更新会话标题
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/chat_handlers.go](backend/chat_handlers.go)）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）新对话消息完成后
- 请求体：
```json
{"userId":<number>,"conversationId":123}
```
- 期望响应字段：
```json
{"title":"<string>","conversationId":123}
```
- 说明：
  - 标题生成提示语：将下面这段文字概括为32个字符并保持语言相同
  - 模型来自后端环境变量 `TITLE_MODEL`

## 模型列表

### GET /v1/models
- 用途：获取可用模型列表
- 后端实现情况：前端请求 `/v1/models`，由 Node 代理（`handleV1Proxy`）转发至 Go 后端 `/v1/models`，再由 Go 代理上游 API
- 调用位置：主聊天页（[src/app.js](src/app.js)）
- 期望响应字段：
```json
{"data":[{"id":"<string>"}]}