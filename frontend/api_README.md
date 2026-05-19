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
{"new_token":"<string>","user_ID":"<string>","user_exist":true,"psw_right":true}
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
{"token_valid":true,"new_token":"<string>","user_ID":"<string>","user_name":"<string>"}
```

## 聊天与历史

### POST /chat
- 用途：发送对话消息
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/chat_handlers.go](backend/chat_handlers.go)）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）
- 请求体：
```json
{"userId":"<string>","conversationId":123,"model":"<string>","message":"<string>"}
```
- 期望响应字段：
```json
{"answer":"<string>","conversationId":123}
```

### POST /history
- 用途：获取历史会话列表
- 后端实现情况：已实现（路由见 [backend/main.go](backend/main.go)，处理见 [backend/history.go](backend/history.go)）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）
- 请求体：
```json
{"user_id":"<string>"}
```
- 期望响应字段（直接返回数组）：
```json
[{"last_edit_time":"<string>","title":"<string>","conversation_id":123}]
```

### POST /history/topic
- 用途：获取指定会话的全部消息记录
- 后端实现情况：待实现（需在 backend/history.go 中新增处理函数）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）历史列表按钮点击事件
- 请求体：
```json
{"conversation_id":123}
```
- 期望响应字段（直接返回数组）：
```json
[{"message_id":1,"time":"<string>","roll":"<string>","context":"<string>"}]
```
- 错误处理：
  - 后端数据库查询失败时返回 500 `{ "error": "db_error" }`
  - 前端收到 500 后弹窗提示“出现问题，请联系管理员”

## 模型列表

### GET /v1/models
- 用途：获取可用模型列表
- 后端实现情况：前端请求 `/v1/models`，由 Node 代理（`handleV1Proxy`）转发至 Go 后端 `/v1/models`，再由 Go 代理上游 API
- 调用位置：主聊天页（[src/app.js](src/app.js)）
- 期望响应字段：
```json
{"data":[{"id":"<string>"}]}
```
