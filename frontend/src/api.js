import { elements } from "./elements.js";
import { state, setUserId, setNewChatState, saveAuth } from "./state.js";
import { renderMarkdown } from "./markdown.js";
import { renderHistory, renderMessage, resetChat } from "./message.js";
import { sortHistoryByTime } from "./utils.js";
import { applyRootSettingsVisibility, getSystemPromptForNewConversation } from "./settings.js";
import { setStatus, showToast } from "./ui.js";
import { STORAGE_KEYS } from "./constants.js";

function handleServerError() {
  showToast("出现问题，请联系管理员");
}

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

function getTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

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
    try {
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text);
          message = data.message || data.error || message;
        } catch (error) {
          message = text;
        }
      }
    } catch (error) {
      // Keep default message.
    }
    showToast(`请求失败: ${message}`);
    throw new Error(message);
  }
  return response.json();
}

let lastModelFetchAt = 0;
let modelFetchInFlight = false;

function normalizeModelList(data) {
  if (data && Array.isArray(data.data)) {
    return data.data
      .map((item) => item.id)
      .filter((id) => typeof id === "string" && id.trim() !== "");
  }
  return [];
}

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
    data.messages.forEach((msg) => {
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

async function fetchStream(prompt, placeholder) {
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

async function sendMessage(prompt, placeholder) {
  setStatus("Thinking...");
  const streamResult = await fetchStream(prompt, placeholder);
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
  const response = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
  if (typeof response.conversationId === "number") {
    state.conversationId = response.conversationId;
  }
  if (typeof response.messageId === "number") {
    applyMessageIdToPlaceholder(placeholder, response.messageId);
  }
  setStatus("Ready");
  await refreshHistoryAfterChat();
  return response.answer || "(no response)";
}

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
