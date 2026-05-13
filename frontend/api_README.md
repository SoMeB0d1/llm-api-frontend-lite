# 前端与后端交互 API 一览

> 说明：所有请求都以 `baseUrl` 为前缀（来自本地缓存 `llm.baseUrl` 或设置页输入）。
> 前端页面会直接请求 `baseUrl`，也可以指向 `frontend/server.js` 的 Node 代理（它会转发 `/chat`、`/v1/*`、`/auth/*` 到后端）。

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
{"userId":"<string>","topicId":"<string>","model":"<string>","message":"<string>"}
```
- 期望响应字段：
```json
{"answer":"<string>"}
```

### GET /history
- 用途：获取历史会话列表
- 后端实现情况：未实现（Go 后端未注册该路由）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）
- 期望响应字段：
```json
{"items":[{"...":"..."}]}
```

## 模型列表

### GET /v1/models
- 用途：获取可用模型列表
- 后端实现情况：已实现为代理转发（/v1/* 由 Go 代理上游，成功取决于上游与 API Key）
- 调用位置：主聊天页（[frontend/src/app.js](frontend/src/app.js)）
- 期望响应字段：
```json
{"data":[{"id":"<string>"}]}
```
