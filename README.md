# llm-api-frontend-lite

LLM API 的轻量化前后端一体方案 —— 极简部署，开箱即用。

> 本仓库为 `lightest` 分支，追求最小资源占用与最简部署流程。主分支可能包含更多特性；若你只需要一个能跑、够用的 LLM 聊天下游，请使用本分支。

---

## 简要介绍

![index页面演示](./index_image.png)

**llm-api-frontend-lite** 是一个面向 OpenAI 兼容 API 的轻量级聊天前端，由 **Go 后端** + **Go 前端代理层** + **纯静态前端** 三部分组成。

| 层 | 语言 | 功能 |
|----|------|------|
| **后端** | Go | 用户认证（用户名/密码 + Token）、会话管理、聊天历史持久化（SQLite）、OpenAI API 透明代理（`/v1/*`）、SSE 流式响应与非流式回退 |
| **代理层** | Go | 静态文件服务器、API 请求转发至 Go 后端、SSE 流式透传 |
| **前端** | HTML/CSS/JS | 桌面端优先的聊天界面，支持 Markdown（marked.js）与 LaTeX（KaTeX）渲染、会话历史管理、模型列表获取 |

**核心特点**：遵循 `lightest` 分支理念，零容器依赖、资源占用极低、代码简洁可读、不引入任何重型前端框架。适合个人或小团队快速部署私有 LLM 聊天服务。

---

## 部署方式

### 环境要求

- **Go** 1.21+

### 1. 克隆仓库并切换分支

```bash
git clone https://github.com/SoMeB0d1/llm-api-frontend-lite.git
cd llm-api-frontend-lite
git checkout lightest
```

### 2. 配置环境变量

将项目根目录下的 `.env.example` 复制为 `.env`，并填写配置：

```bash
cp .env.example .env
```

`.env` 文件内容说明：

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_BASE_URL` | 是 | 上游 OpenAI 兼容 API 地址 |
| `OPENAI_API_KEY` | 是 | 上游 API 密钥 |
| `BACKEND_PORT` | 否 | Go 后端端口，默认 `8787` |
| `FRONTEND_PORT` | 否 | Go 前端代理端口，默认 `3000` |
| `TITLE_MODEL` | 是 | 自动生成会话标题的模型名，使用API中带有的模型 |
| `ROOT_PSW` | 是 | root 用户初始密码 |
| `LOG_PATH` | 是 | 日志输出路径，默认 `./log` |

### 3. 构建并运行

```bash
# 启动 Go 后端（默认端口 8787）
cd backend
go build -o llm-frontend-lite-backend
./llm-frontend-lite-backend

# 启动 Go 前端代理（默认端口 3000）
cd ../frontend/golang-proxy
go build -o llm-frontend-proxy
./llm-frontend-proxy
```

> 也可使用 `go run .` 进行开发调试，无需预先编译。

### 4. 访问

浏览器打开 `http://localhost:3000`，使用登录页进行认证（若配置了 `ROOT_PSW`，用户名 `root`）。登录后即可开始对话。

---

## 详细介绍

### 项目架构

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器                         │
│              http://localhost:3000                   │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │   静态文件 (HTML/CSS/JS)   │   API 请求 (/chat, /history, /v1/* ...)
        ▼                           ▼
┌─────────────────────────────────────────────────────┐
│          Go 代理层 (frontend/golang-proxy/main.go)    │
│       端口: FRONTEND_PORT (默认 3000)                 │
│  · 静态文件服务（safePath 路径映射）                    │
│  · API 请求转发至 Go 后端                             │
│  · /chat → SSE 流式透传                              │
│  · /v1/* → 透明代理                                  │
│  · /auth/* → 认证代理                                │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Go 后端 (backend/main.go)                │
│       端口: BACKEND_PORT (默认 8787)                   │
│  · /auth/login  — 用户名密码登录，返回 Token           │
│  · /auth/token  — Token 校验与过期自动刷新             │
│  · /chat        — 聊天处理（SSE 流式 + 非流式回退）     │
│  · /title       — 自动生成会话标题                     │
│  · /history     — 获取用户所有会话列表                  │
│  · /history/topic — 获取指定会话完整消息               │
│  · /v1/models        — 查询模型列表                  │
│  · /health      — 健康检查                            │
│  · 结构化 JSON 日志 (logging.go)                       │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│           上游 OpenAI 兼容 API                        │
│          (OPENAI_BASE_URL)                          │
│  · /v1/chat/completions — 聊天补全                   │
│  · /v1/models           — 模型列表                   │
└─────────────────────────────────────────────────────┘

数据存储                     SQLite (backend/database.db)
                              · user 表 — 用户信息
                              · conversation 表 — 会话
                              · message 表 — 消息记录
```

### 前端代理层 API

Go `frontend/golang-proxy/main.go` 作为反向代理，提供路由。
[此处查看路由README。](./frontend/api_README.md)

| 端点 | 方法 | 用途 | 请求体关键字段 |
|------|------|------|----------------|
| `/auth/login` | POST | 用户名密码登录，返回 Token | `user_name`, `user_psw` |
| `/auth/token` | POST | 校验 Token 有效性，过期自动刷新 | `token` |
| `/chat` | POST | 发送对话消息，支持 SSE 流式响应 | `userId`, `conversationId`, `model`, `message` |
| `/title` | POST | 调用模型自动生成会话标题 | `userId`, `conversationId` |
| `/history` | POST | 获取当前用户的所有会话列表 | `user_id` |
| `/history/topic` | POST | 获取指定会话的完整消息记录 | `conversation_id` |
| `/v1/*` | ALL | OpenAI API 透明代理（如 `/v1/models`） | 透传至上游 |
| `/health` | GET | 健康检查 | 无 |

> 完整的前后端 API 交互说明见 [frontend/api_README.md](frontend/api_README.md)。

### 前端组件结构

```
frontend/
├── index.html                   # 主聊天页面（入口 HTML）
├── favicon.ico                  # 网站图标
├── api_README.md                # API 文档
├── login/
│   ├── login.html               # 登录页面
│   ├── login.js                 # 登录逻辑（表单提交、localStorage 持久化）
│   └── styles.css               # 登录页样式
├── token_check/
│   ├── token_check.html         # Token 校验中转页
│   └── token_check.js           # Token 校验逻辑
├── src/
│   ├── app.js                   # 聊天核心逻辑：API 调用、消息渲染（Markdown/LaTeX）、会话管理、流式 SSE 解析、本地历史缓存
│   ├── api.js                   # API 辅助模块
│   ├── events.js                # 事件绑定
│   ├── message.js               # 消息渲染工具
│   ├── sidebar.js               # 侧边栏交互逻辑
│   ├── state.js                 # 全局状态管理
│   ├── styles.css               # 主聊天样式
│   └── utils.js                 # 工具函数
├── golang-proxy/
│   ├── go.mod                   # Go 模块定义（零外部依赖）
│   ├── main.go                  # Go 静态服务器 + API 反向代理
└── resources/
    ├── logo.png                 # 侧边栏 Logo
    ├── send.svg                 # 发送按钮图标
    ├── loading.svg              # 加载动画图标
    ├── loading_token.svg        # Token 流式渲染中图标
    ├── copy.svg                 # 复制按钮图标
    ├── done.svg                 # 操作完成图标
    ├── edit.svg                 # 编辑按钮图标
    ├── hide.svg / show.svg      # 侧边栏折叠图标
    └── cross.svg                # 关闭图标
```

### 数据库说明

后端使用 **SQLite** 存储所有数据（文件位于 `backend/database.db`），包含以下表：

| 表名 | 用途 |
|------|------|
| `user` | 用户信息（ID、用户名、密码、Token、Token 时间） |
| `conversation` | 会话（ID、所属用户、标题、模型、System Prompt、最后编辑时间） |
| `message` | 消息记录（ID、所属会话、时间、角色、内容） |
| `files` | 文件引用（预留，当前未启用） |

**注意**：当前项目**不提供数据库编辑的 Web 界面或 API**。如需手动管理用户、修改会话标题或清理数据，请直接使用 SQLite 命令行工具操作：

```bash
cd backend
sqlite3 database.db
```

常用操作示例：

```sql
-- 查看所有用户
SELECT * FROM user;

-- 手动添加用户 (user_id 需在 0~63 范围内)
INSERT INTO user (user_id, user_name, user_password, user_token, token_time)
VALUES (1, 'alice', 'mypassword', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', datetime('now'));

-- 查看某用户的会话列表
SELECT * FROM conversation WHERE user_id = 0;

-- 删除某条消息
DELETE FROM message WHERE message_id = 123;
```

详细数据库文档见 [backend/database_README.md](backend/database_README.md)。

### 后端源文件速览

| 文件 | 说明 |
|------|------|
| `backend/main.go` | Go 后端入口，环境变量加载、路由注册、CORS 中间件、优雅关闭 |
| `backend/login.go` | SQLite 数据库初始化、用户增删查、Token 生成/校验/过期刷新（14 天有效期） |
| `backend/chat_handlers.go` | `/chat` 聊天处理（SSE 流式优先 + 非流式 JSON 回退）、`/title` 标题生成 |
| `backend/history.go` | `/history` 会话列表查询、`/history/topic` 消息历史查询 |
| `backend/proxy.go` | `/v1/*` 透明反向代理，附加 API Key 认证头 |
| `backend/logging.go` | 结构化 JSON 日志中间件（请求方法、路径、状态码、耗时） |
| `backend/file_hash.go` | 文件哈希工具函数 |

### 技术细节

- **流式优先策略**：`/chat` 端点优先尝试 SSE (`text/event-stream`) 流式传输；若上游返回非流式 JSON 响应，自动回退并直接解析返回。前端 `app.js` 在 SSE 流中断时同样自动降级为 JSON 请求，保证高可用。
- **Token 管理**：Token 为 32 位加密安全随机字符串，有效期 14 天。`/auth/token` 校验时若 Token 过期但用户存在，自动生成新 Token 一并返回，前端自动更新本地存储。
- **会话 ID 复用机制**：前端 `newConversationId()` 基于本地历史列表的最大 ID + 1 分配；后端在写入新会话时若 ID 已存在且属于其他用户，自动寻找可用槽位。配合 0~4095 的槽位池实现循环复用。
- **CORS 全开放**：所有 API 端点均设置 `Access-Control-Allow-Origin: *`，开发阶段无需处理跨域问题。
- **静态文件安全**：Go 代理层的 `resolveStaticPath()` 函数通过 `filepath.Clean` + 目录前缀检查防止路径遍历攻击。
