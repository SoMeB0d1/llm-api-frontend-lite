# llm-api-frontend-lite

LLM API 的轻量化前后端一体方案 —— 极简部署，开箱即用。

> 本仓库为 `lightest` 分支，追求最小资源占用与最简部署流程。主分支可能包含更多特性；若你只需要一个能跑、够用的 LLM 聊天下游，请使用本分支。
> 骗你的，现在 `main` 分支在开发，这里拿lightest分支顶包。

---

## 简要介绍

![index页面演示](./index_image.png)

**llm-api-frontend-lite** 是一个面向 OpenAI 兼容 API 的轻量级聊天前端。项目编译为**单一可执行文件**（`llm-server.exe`），同时提供 API 服务和静态前端页面，无需两个进程协同。

| 层 | 语言 | 功能 |
|----|------|------|
| **后端** | Go | 用户认证（用户名/密码 + Token）、会话管理、聊天历史持久化（SQLite）、OpenAI API 透明代理（`/v1/*`）、SSE 流式响应与非流式回退、静态文件服务（前端页面） |
| **前端** | HTML/CSS/JS | 桌面端优先的聊天界面，支持 Markdown（marked.js）与 LaTeX（KaTeX）渲染、会话历史管理、模型列表获取 |

**核心特点**：遵循 `lightest` 分支理念，零容器依赖、资源占用极低、代码简洁可读、不引入任何重型前端框架。适合个人或小团队快速部署私有 LLM 聊天服务。

---

## 部署方式

### 环境要求

- **Go** 1.21+
- **gcc**（Windows 下推荐安装 [MinGW-w64](https://www.mingw-w64.org/) 或 [TDM-GCC](https://jmeubank.github.io/tdm-gcc/)，SQLite 需要 CGO）

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
| `OPEN_PORT` | 否 | 服务端口，默认 `8787` |
| `TITLE_MODEL` | 是 | 自动生成会话标题的模型名，使用 API 中带有的模型 |
| `ROOT_PSW` | 是 | root 用户初始密码 |
| `LOG_PATH` | 是 | 日志输出路径，默认 `./log` |

> `.env` 文件必须与 `llm-server.exe` 放在同一目录。

### 3. 构建并运行

在 `backend/` 目录下执行对应平台的构建命令：

**Linux**：

```bash
cd backend
CGO_ENABLED=1 go build -ldflags="-s -w" -o ../llm-server
cd ..
./llm-server
```

**Windows（cmd）**：

```cmd
cd backend
set CGO_ENABLED=1 && go build -ldflags="-s -w" -o ../llm-server.exe
cd ..
llm-server.exe
```

**Windows（PowerShell）**：

```powershell
cd backend
$env:CGO_ENABLED=1; go build -ldflags="-s -w" -o ../llm-server.exe
cd ..
.\llm-server.exe
```

> `CGO_ENABLED=1` 必须开启（SQLite 依赖 CGO）。Linux 下通常已内置 gcc；Windows 需安装 [MinGW-w64](https://www.mingw-w64.org/) 或 [TDM-GCC](https://jmeubank.github.io/tdm-gcc/)。
>
> 构建产物 `llm-server`（Linux）或 `llm-server.exe`（Windows）位于项目根目录。运行时自动加载同级 `.env` 配置，并从 `frontend/` 目录提供静态文件。

### 4. （可选）安装为 Linux 系统服务

使用项目根目录的 `llm-server.service` 文件注册 systemd 服务：

```bash
# 1. 配置service中路径和运行用户
# 将仓库根目录路径替换service中/path/to/llm-api-frontend-lite
# 将运行用户替换<USER>
nano ./llm-server.service

# 2. 安装并启动服务
sudo cp llm-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable llm-server
sudo systemctl start llm-server

# 3. 查看状态与日志
systemctl status llm-server
journalctl -u llm-server -f
```

> 注意：若部署路径或运行用户与实际环境不同，请相应修改 `llm-server.service` 中的 `User`、`WorkingDirectory`、`ExecStart` 字段。

### 5. 访问

浏览器打开 `http://localhost:OPEN_PORT`，使用登录页进行认证（root, ROOT_PSW）。登录后即可开始对话。

---

## 详细介绍

### 项目架构

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器                         │
│              http://localhost:8787                   │
└─────────────────────┬───────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │   静态文件 (HTML/CSS)  │   API 请求 (/chat, /history, /v1/* ...)
          ▼                       ▼
┌─────────────────────────────────────────────────────┐
│              单一可执行文件 (llm-server.exe)           │
│            端口: OPEN_PORT (默认 8787)                 │
│  · 静态文件服务（frontend/ 目录）                      │
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

数据存储                     SQLite (database.db，位于 exe 同级目录)
                              · user 表 — 用户信息
                              · conversation 表 — 会话
                              · message 表 — 消息记录
```

### API 说明

> **注意**：以下 API 端点全部由单一 `llm-server.exe` 提供服务。前端静态文件由 `backend/static.go` 直接从 `frontend/` 目录读取并返回，API 路由在 `backend/main.go` 中直接注册处理。

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

后端使用 **SQLite** 存储所有数据，数据库文件 `database.db` 位于 **二进制文件所在目录**（即项目根目录），包含以下表：

| 表名 | 用途 |
|------|------|
| `user` | 用户信息（ID、用户名、密码、Token、Token 时间） |
| `conversation` | 会话（ID、所属用户、标题、模型、System Prompt、最后编辑时间） |
| `message` | 消息记录（ID、所属会话、时间、角色、内容） |
| `files` | 文件引用（预留，当前未启用） |

**注意**：当前项目**不提供数据库编辑的 Web 界面或 API**。如需手动管理用户、修改会话标题或清理数据，请直接使用 SQLite 命令行工具操作：

```bash
# 在 exe 所在目录执行
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
| `backend/main.go` | Go 后端入口，环境变量加载（`OPEN_PORT`）、路由注册、CORS 中间件、静态文件 fallback、优雅关闭 |
| `backend/static.go` | 静态文件服务模块，处理 SPA 路由（`/`、`/login`、`/token_check`）及路径遍历防护 |
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
- **路径安全**：静态文件模块通过 `filepath.Clean` + 目录前缀检查防止路径遍历攻击；所有路径均基于 `os.Executable()` 动态定位 exe 所在目录。

---

## 调试：backend 目录下数据库说明

`backend/` 目录下可能残留一份 `database.db`，这是**旧版后端独立运行时的数据库文件**。当前统一单 exe 版本中：

- **生产数据**位于 exe 同级目录（`database.db`）
- **backend/ 下的 database.db** 仅供开发调试使用，不会被 exe 加载

若需在开发时直接操作 backend 下的调试数据库：

```bash
cd backend
sqlite3 database.db
```

```sql
-- 查看所有用户
SELECT * FROM user;

-- 查看会话列表
SELECT conversation_id, user_id, title, last_edit_time FROM conversation;

-- 查看某会话的消息
SELECT message_id, time, roll, substr(context, 1, 80) FROM message WHERE conversation_id = 0;

-- 清空测试数据
DELETE FROM message;
DELETE FROM conversation;
DELETE FROM user;

-- 重置自增计数器
DELETE FROM sqlite_sequence;
```
