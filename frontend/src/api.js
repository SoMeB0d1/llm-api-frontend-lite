/**
 * api.js — API 通信模块
 *
 * 封装与后端 HTTP 接口的所有通信逻辑，包括：
 *   - apiFetch：带超时、自动附加 Bearer token 的通用请求封装
 *   - validateToken：校验/刷新认证令牌
 *   - fetchModelsIfAllowed：获取可用模型列表并更新下拉框
 *   - loadHistory / loadConversation：加载对话历史
 *   - sendMessage / fetchStream：发送消息（优先流式 SSE，自动回退到 JSON）
 *   - sendBack：回溯到指定消息
 */

import { elements } from "./elements.js";
import { state, setUserId, setNewChatState, saveAuth } from "./state.js";
import { renderMarkdown } from "./markdown.js";
import { renderHistory, renderMessage, resetChat } from "./message.js";
import { sortHistoryByTime } from "./utils.js";
import { applyRootSettingsVisibility, getSystemPromptForNewConversation } from "./settings.js";
import { setStatus, showToast } from "./ui.js";
import { STORAGE_KEYS } from "./constants.js";

/** 服务器错误通用处理：显示 toast 提示管理员 */
function handleServerError() {
  showToast("出现问题，请联系管理员");
}

/** 从 state.history 中查找指定对话的标题，未找到时返回空字符串 */
function getConversationTitle(conversationId) {
  const target = Number(conversationId);
  if (!Number.isFinite(target)) {
    return "";
  }
  const entry = state.history.find(
    (item) => Number(item?.conversation_id) === target
  );
  return entry?.title || "";
}

/** 聊天完成后刷新历史列表，若新对话标题为 "new_conversation" 则请求后端生成标题 */
async function refreshHistoryAfterChat() {
  await loadHistory();
  if (
    state.conversationId >= 0 &&
    getConversationTitle(state.conversationId) === "new_conversation"
  ) {
    try {
      await apiFetch("/title", {
        method: "POST",
        body: JSON.stringify({
          userId: state.userId,
          conversationId: state.conversationId,
        }),
      });
    } catch (error) {
      if (error?.message !== "server_error") {
        console.error("Title update failed:", error);
      }
    }
    await loadHistory();
  }
}

/** 创建一个带超时的 AbortController，超时后自动 abort */
function getTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

/** 将 messageId 写入占位元素所在 .message 容器的 data-message-id 属性 */
function applyMessageIdToPlaceholder(placeholder, messageId) {
  const numericId = Number(messageId);
  if (!Number.isFinite(numericId) || !placeholder) {
    return;
  }
  const wrapper = placeholder.closest(".message");
  if (wrapper) {
    wrapper.dataset.messageId = String(numericId);
  }
}

/**
 * 通用 API 请求封装
 * - 自动附加 Content-Type、Bearer token
 * - 默认 20 秒超时
 * - 500 错误弹出管理员提示，其他错误截取 message
 * @param {string} path 接口路径
 * @param {object} [options] fetch 选项
 * @returns {Promise<object>} 解析后的 JSON 响应
 */
async function apiFetch(path, options = {}) {
  const timeoutMs = 20000;
  const { controller, timeout } = getTimeoutSignal(timeoutMs);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(`${state.baseUrl}${path}`, {
    ...options,
    headers,
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (!response.ok) {
    if (response.status === 500) {
      handleServerError();
      throw new Error("server_error");
    }
    let message = `HTTP ${response.status}`;
    let parsedJson = null;
    try {
      const text = await response.text();
      if (text) {
        try {
          parsedJson = JSON.parse(text);
          message = parsedJson.message || parsedJson.error || message;
        } catch (error) {
          message = text;
        }
      }
    } catch (error) {
      // Keep default message.
    }
    showToast(`请求失败: ${message}`);
    const err = new Error(message);
    if (parsedJson !== null) {
      err.responseJson = parsedJson;
    }
    throw err;
  }
  return response.json();
}

// 模型列表请求的防抖控制
let lastModelFetchAt = 0;
let modelFetchInFlight = false;

/** 标准化 /v1/models 响应，提取 id 字符串数组 */
function normalizeModelList(data) {
  if (data && Array.isArray(data.data)) {
    return data.data
      .map((item) => item.id)
      .filter((id) => typeof id === "string" && id.trim() !== "");
  }
  return [];
}

/** 将模型列表填充到 modelSelect 下拉框，优先保持当前选中的模型 */
function applyModelOptions(models) {
  if (!elements.modelSelect) {
    return;
  }
  const current = state.model;
  elements.modelSelect.innerHTML = "";
  if (!models.length) {
    const option = document.createElement("option");
    option.value = current || "deepseek-v4-flash";
    option.textContent = option.value;
    elements.modelSelect.appendChild(option);
    elements.modelSelect.value = option.value;
    state.model = option.value;
    return;
  }
  models.forEach((modelId) => {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    elements.modelSelect.appendChild(option);
  });
  if (current && models.includes(current)) {
    elements.modelSelect.value = current;
  } else {
    elements.modelSelect.value = models[0];
    state.model = models[0];
  }
}

/** 获取可用模型列表，带 1 秒防抖与并发飞行中的防护 */
async function fetchModelsIfAllowed() {
  if (modelFetchInFlight) {
    return;
  }
  const now = Date.now();
  if (now - lastModelFetchAt < 1000) {
    return;
  }
  lastModelFetchAt = now;
  modelFetchInFlight = true;
  try {
    const data = await apiFetch("/v1/models", { method: "GET" });
    const models = normalizeModelList(data);
    applyModelOptions(models);
  } catch (error) {
    if (error?.message === "server_error") {
      return;
    }
    showToast("模型列表获取失败");
    console.error(error);
  } finally {
    modelFetchInFlight = false;
  }
}

/**
 * 校验当前 token — POST /auth/token
 * 校验通过后同步服务端返回的用户信息并持久化
 * @returns {Promise<boolean>}
 */
async function validateToken() {
  if (!state.token) {
    return false;
  }
  try {
    const response = await fetch(`${state.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token }),
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = {};
      }
    }
    if (response.status === 500) {
      handleServerError();
      return false;
    }
    if (!response.ok || data.token_valid !== true) {
      return false;
    }
    if (data.new_token) {
      state.token = data.new_token;
    }
    const resolvedUserId = data.user_ID || state.userId;
    const resolvedUserName = data.user_name || state.userName || resolvedUserId;
    setUserId(resolvedUserId, resolvedUserName);
    saveAuth();
    applyRootSettingsVisibility();
    return true;
  } catch (error) {
    return false;
  }
}

/** 加载对话历史列表并渲染到侧边栏（POST /history），失败时显示 "History unavailable" */
async function loadHistory() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  renderHistory(loadConversation);
  const { controller, timeout } = getTimeoutSignal(20000);
  const headers = { "Content-Type": "application/json" };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  let response;
  try {
    response = await fetch(`${state.baseUrl}/history`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id: state.userId }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    setStatus("History unavailable");
    return;
  }
  clearTimeout(timeout);

  if (response.status === 500) {
    handleServerError();
    setStatus("History unavailable");
    return;
  }
  if (!response.ok) {
    setStatus("History unavailable");
    return;
  }

  let data = [];
  try {
    const text = await response.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        data = parsed;
      }
    }
  } catch (error) {
    data = [];
  }

  sortHistoryByTime(data);
  state.history = data;
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
  renderHistory(loadConversation);
}

/**
 * 加载指定对话的全部消息到聊天区（POST /history/topic），
 * 补齐缺失的 assistant 消息并同步模型选择
 * @param {number} conversationId 对话 ID
 */
async function loadConversation(conversationId) {
  resetChat();
  setStatus("Loading conversation...");
  try {
    const response = await fetch(`${state.baseUrl}/history/topic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: JSON.stringify({ conversation_id: conversationId }),
    });
    if (response.status === 500) {
      handleServerError();
      setStatus("Ready");
      return;
    }
    if (!response.ok) {
      showToast("加载对话失败");
      setStatus("Ready");
      return;
    }
    const data = await response.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.messages)) {
      showToast("加载对话失败");
      setStatus("Ready");
      return;
    }
    if (data.model && elements.modelSelect) {
      state.model = data.model;
      elements.modelSelect.value = data.model;
    }
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const normalizedMessages = [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      normalizedMessages.push(msg);
      if (msg && msg.roll === "user") {
        const next = messages[i + 1];
        if (!next || next.roll !== "llm") {
          // Ensure each user message is followed by an assistant response.
          normalizedMessages.push({ roll: "llm", context: "**Error**: Request not exist." });
        }
      }
    }

    normalizedMessages.forEach((msg) => {
      const role = msg.roll === "llm" ? "assistant" : "user";
      renderMessage(role, msg.context || "", msg.message_id);
    });
    const resolvedConversationId = Number(conversationId);
    state.conversationId = Number.isFinite(resolvedConversationId)
      ? resolvedConversationId
      : -1;
    setNewChatState(false);
    setStatus("Ready");
  } catch (error) {
    showToast("加载对话失败");
    setStatus("Ready");
  }
}

/**
 * 流式获取 LLM 回复
 * - Content-Type 为 text/event-stream 时，逐 chunk 实时渲染 Markdown
 * - 否则解析 JSON 回退，返回 answer 文本
 * - 从响应头/JSON 中提取 conversationId、messageId、userMessageId
 * @param {string} prompt 用户消息文本
 * @param {HTMLElement} placeholder assistant 消息的占位 bubble 元素
 * @param {HTMLElement} [userWrapper] 用户消息容器元素
 * @returns {Promise<string|null>} 累积的完整回复文本，失败返回 null
 */
async function fetchStream(prompt, placeholder, userWrapper) {
  const timeoutMs = 120000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { "Content-Type": "application/json" };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  let response;
  try {
    const requestBody = {
      userId: state.userId,
      conversationId: state.conversationId,
      model: state.model,
      message: prompt,
    };
    if (state.conversationId === -1) {
      requestBody.prompt = getSystemPromptForNewConversation();
    }
    response = await fetch(`${state.baseUrl}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return null;
  }
  clearTimeout(timeout);
  if (!response.ok) {
    if (response.status === 500) {
      handleServerError();
    }
    return null;
  }
  const headerConversationId = response.headers.get("x-conversation-id");
  if (headerConversationId) {
    const parsed = Number(headerConversationId);
    if (Number.isFinite(parsed)) {
      state.conversationId = parsed;
    }
  }
  const headerMessageId = response.headers.get("x-message-id");
  if (headerMessageId) {
    applyMessageIdToPlaceholder(placeholder, headerMessageId);
  }
  const headerUserMessageId = response.headers.get("x-user-message-id");
  if (headerUserMessageId) {
    const parsed = Number(headerUserMessageId);
    if (Number.isFinite(parsed)) {
      // prefer explicit userWrapper passed by caller
      if (userWrapper) {
        const wrapperEl = userWrapper.closest && userWrapper.closest(".message") ? userWrapper.closest(".message") : userWrapper;
        try {
          if (wrapperEl) wrapperEl.dataset.messageId = String(parsed);
        } catch (e) {
          // ignore
        }
      } else if (placeholder) {
        // fallback: find previous user message element before the assistant placeholder
        const msgNode = placeholder.closest && placeholder.closest(".message") ? placeholder.closest(".message") : null;
        if (msgNode) {
          let prev = msgNode.previousElementSibling;
          while (prev) {
            if (prev.classList && prev.classList.contains && prev.classList.contains("message") && prev.classList.contains("user")) {
              prev.dataset.messageId = String(parsed);
              break;
            }
            prev = prev.previousElementSibling;
          }
        }
      }
    }
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("text/event-stream")) {
    try {
      const json = await response.json();
      if (typeof json.conversationId === "number") {
        state.conversationId = json.conversationId;
      }
      if (typeof json.messageId === "number") {
        applyMessageIdToPlaceholder(placeholder, json.messageId);
      }
      if (typeof json.userMessageId === "number") {
        const parsed = Number(json.userMessageId);
        if (Number.isFinite(parsed)) {
          if (userWrapper) {
            const wrapperEl = userWrapper.closest && userWrapper.closest(".message") ? userWrapper.closest(".message") : userWrapper;
            try {
              if (wrapperEl) wrapperEl.dataset.messageId = String(parsed);
            } catch (e) {}
          } else if (placeholder) {
            const msgNode = placeholder.closest && placeholder.closest(".message") ? placeholder.closest(".message") : null;
            if (msgNode) {
              let prev = msgNode.previousElementSibling;
              while (prev) {
                if (prev.classList && prev.classList.contains && prev.classList.contains("message") && prev.classList.contains("user")) {
                  prev.dataset.messageId = String(parsed);
                  break;
                }
                prev = prev.previousElementSibling;
              }
            }
          }
        }
      }
      return json.answer || "(no response)";
    } catch (e) {
      return null;
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
            }
          } catch (e) {
            // 忽略部分 JSON 解析错误
          }
        }
      }
      if (placeholder && placeholder.parentElement) {
        placeholder.innerHTML = renderMarkdown(fullText);
        placeholder.dataset.raw = fullText;
        const wrapper = placeholder.closest(".message");
        if (wrapper) {
          wrapper.dataset.raw = fullText;
        }
        elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
      }
    }
  } catch (error) {
    // 流中断，使用已累积内容
  }
  return fullText || null;
}

/**
 * 发送用户消息的顶层入口：
 * 先尝试 fetchStream 流式请求，失败后改用 apiFetch 非流式重试
 * @param {string} prompt 用户消息文本
 * @param {HTMLElement} placeholder assistant 占位 bubble 元素
 * @param {HTMLElement} [userWrapper] 用户消息容器元素
 * @returns {Promise<string>} 最终回复文本
 */
async function sendMessage(prompt, placeholder, userWrapper) {
  setStatus("Thinking...");
  const streamResult = await fetchStream(prompt, placeholder, userWrapper);
  if (streamResult !== null) {
    setStatus("Ready");
    await refreshHistoryAfterChat();
    return streamResult;
  }
  setStatus("Thinking...");
  const requestBody = {
    userId: state.userId,
    conversationId: state.conversationId,
    model: state.model,
    message: prompt,
  };
  if (state.conversationId === -1) {
    requestBody.prompt = getSystemPromptForNewConversation();
  }
  let response;
  try {
    response = await apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    // If backend returned a JSON error with IDs, try to record them
    const json = error && error.responseJson ? error.responseJson : null;
    if (json) {
      if (typeof json.conversationId === "number") {
        state.conversationId = json.conversationId;
      }
      if (typeof json.userMessageId === "number") {
        const parsed = Number(json.userMessageId);
        if (Number.isFinite(parsed)) {
          if (userWrapper) {
            const wrapperEl = userWrapper.closest && userWrapper.closest(".message") ? userWrapper.closest(".message") : userWrapper;
            try {
              if (wrapperEl) wrapperEl.dataset.messageId = String(parsed);
            } catch (e) {}
          }
        }
      }
    }
    throw error;
  }
  if (typeof response.conversationId === "number") {
    state.conversationId = response.conversationId;
  }
  if (typeof response.messageId === "number") {
    applyMessageIdToPlaceholder(placeholder, response.messageId);
  }
  if (typeof response.userMessageId === "number") {
    const parsed = Number(response.userMessageId);
    if (Number.isFinite(parsed)) {
      if (userWrapper) {
        const wrapperEl = userWrapper.closest && userWrapper.closest(".message") ? userWrapper.closest(".message") : userWrapper;
        try {
          if (wrapperEl) wrapperEl.dataset.messageId = String(parsed);
        } catch (e) {}
      } else if (placeholder) {
        const msgNode = placeholder.closest && placeholder.closest(".message") ? placeholder.closest(".message") : null;
        if (msgNode) {
          let prev = msgNode.previousElementSibling;
          while (prev) {
            if (prev.classList && prev.classList.contains && prev.classList.contains("message") && prev.classList.contains("user")) {
              prev.dataset.messageId = String(parsed);
              break;
            }
            prev = prev.previousElementSibling;
          }
        }
      }
    }
  }
  setStatus("Ready");
  await refreshHistoryAfterChat();
  return response.answer || "(no response)";
}

/**
 * 回溯到指定消息：POST /back，删除该消息之后的所有消息
 * @param {number} messageId 要回溯到的消息 ID
 * @returns {Promise<object>} 后端返回的 JSON
 */
async function sendBack(messageId) {
  return apiFetch("/back", {
    method: "POST",
    body: JSON.stringify({
      userId: state.userId,
      messageId,
    }),
  });
}

export {
  apiFetch,
  fetchModelsIfAllowed,
  validateToken,
  loadHistory,
  loadConversation,
  sendMessage,
  sendBack,
};
