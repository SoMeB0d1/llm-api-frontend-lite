const state = {
  baseUrl: "",
  token: "",
  userId: "guest",
  userName: "guest",
  conversationId: 0,
  model: "deepseek-v4-flash",
  isNewChat: true,
  history: [],
};

const SIDEBAR_ICONS = {
  hide: "resources/hide.svg",
  show: "resources/show.svg",
};

const SEND_ICONS = {
  send: "resources/send.svg",
  loading: "resources/loading.svg",
};

const elements = {
  app: document.querySelector(".app"),
  sidebar: document.getElementById("sidebar"),
  menuBtn: document.getElementById("menuBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  hideSidebarBtn: document.getElementById("hideSidebarBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  historyList: document.getElementById("historyList"),
  chatMain: document.getElementById("chatMain"),
  chatHistory: document.getElementById("chatHistory"),
  chatForm: document.getElementById("chatForm"),
  promptInput: document.getElementById("promptInput"),
  sendBtn: document.getElementById("sendBtn"),
  modelSelect: document.getElementById("modelSelect"),
  statusText: document.getElementById("statusText"),
  userId: document.getElementById("userId"),
  toast: document.getElementById("toast"),
  settingsModal: document.getElementById("settingsModal"),
  settingsForm: document.getElementById("settingsForm"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
};

const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
  history: "llm.history",
};

const MAX_CONVERSATION_ID = 4095;

function newConversationId() {
  let maxId = -1;
  if (Array.isArray(state.history)) {
    state.history.forEach((item) => {
      const value = Number(item?.conversation_id);
      if (Number.isFinite(value) && value > maxId) {
        maxId = value;
      }
    });
  }
  const next = maxId + 1;
  if (next < 0 || next > MAX_CONVERSATION_ID) {
    return 0;
  }
  return next;
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function setNewChatState(isNew) {
  state.isNewChat = isNew;
  if (elements.modelSelect) {
    elements.modelSelect.disabled = !isNew;
  }
}

function setSendButtonState(loading) {
  if (!elements.sendBtn) {
    return;
  }
  const icon = elements.sendBtn.querySelector("img");
  if (icon) {
    icon.src = loading ? SEND_ICONS.loading : SEND_ICONS.send;
  }
  elements.sendBtn.disabled = loading;
}

function isMobile() {
  return window.innerWidth < 800;
}

function setSidebarAnimating(animating) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-animating", animating);
}

function setSidebarCollapsed(collapsed) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-collapsed", collapsed);
}

function setSidebarCollapsedReady(ready) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-collapsed-ready", ready);
}

function setSidebarOpenMobile(open) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-open", open);
}

function setMenuDisabled(disabled) {
  if (!elements.menuBtn) {
    return;
  }
  elements.menuBtn.disabled = disabled;
}

function onSidebarTransitionEnd(callback) {
  if (!elements.sidebar) {
    callback();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    elements.sidebar.removeEventListener("transitionend", onEnd);
    callback();
  };
  const onEnd = (event) => {
    if (event.target !== elements.sidebar) {
      return;
    }
    finish();
  };
  elements.sidebar.addEventListener("transitionend", onEnd);
  window.setTimeout(finish, 450);
}

function collapseSidebarDesktop() {
  if (isMobile()) {
    return;
  }
  if (elements.app && elements.app.classList.contains("sidebar-collapsed")) {
    return;
  }
  setSidebarCollapsedReady(true);
  setSidebarAnimating(true);
  setSidebarCollapsed(true);
  onSidebarTransitionEnd(() => {
    const icon = elements.hideSidebarBtn?.querySelector("img");
    if (icon) {
      icon.src = SIDEBAR_ICONS.show;
    }
    setSidebarAnimating(false);
  });
}

function expandSidebarDesktop() {
  if (isMobile()) {
    return;
  }
  if (elements.app && !elements.app.classList.contains("sidebar-collapsed")) {
    return;
  }
  setSidebarAnimating(true);
  setSidebarCollapsed(false);
  onSidebarTransitionEnd(() => {
    setSidebarCollapsedReady(false);
    const icon = elements.hideSidebarBtn?.querySelector("img");
    if (icon) {
      icon.src = SIDEBAR_ICONS.hide;
    }
    setSidebarAnimating(false);
  });
}

function showSidebarMobile() {
  if (!elements.sidebar) {
    return;
  }
  setMenuDisabled(true);
  setSidebarAnimating(true);
  elements.sidebar.classList.add("open");
  setSidebarOpenMobile(true);
  onSidebarTransitionEnd(() => {
    setSidebarAnimating(false);
  });
}

function hideSidebarMobile() {
  if (!elements.sidebar) {
    return;
  }
  setSidebarAnimating(true);
  setMenuDisabled(true);
  elements.sidebar.classList.remove("open");
  setSidebarOpenMobile(false);
  onSidebarTransitionEnd(() => {
    setSidebarAnimating(false);
    setMenuDisabled(false);
  });
}

function showToast(message, variant = "error") {
  if (!elements.toast) {
    return;
  }
  elements.toast.textContent = message;
  elements.toast.classList.remove("success");
  if (variant === "success") {
    elements.toast.classList.add("success");
  }
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function handleServerError() {
  showToast("出现问题，请联系管理员");
}

async function copyToClipboard(text) {
  if (!text) {
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    showToast("已复制", "success");
  } catch (error) {
    showToast("复制失败");
  }
}

function markActionDone(button) {
  if (!button) {
    return;
  }
  const img = button.querySelector("img");
  if (!button.dataset.icon && img) {
    button.dataset.icon = img.src;
  }
  button.disabled = true;
  button.classList.add("action-button--done");
  if (img) {
    img.src = "resources/done.svg";
  }
  window.setTimeout(() => {
    button.disabled = false;
    button.classList.remove("action-button--done");
    if (img && button.dataset.icon) {
      img.src = button.dataset.icon;
    }
  }, 1000);
}

function setMessagePrompt(bubble, prompt) {
  const wrapper = bubble?.closest(".message");
  if (wrapper && prompt) {
    wrapper.dataset.prompt = prompt;
  }
}

function removeMessagesFrom(wrapper) {
  if (!wrapper || !wrapper.parentElement) {
    return;
  }
  let current = wrapper;
  while (current) {
    const next = current.nextElementSibling;
    current.remove();
    current = next;
  }
}

function getRetryPrompt(wrapper) {
  if (wrapper?.dataset.prompt) {
    return wrapper.dataset.prompt;
  }
  let prev = wrapper?.previousElementSibling;
  while (prev) {
    if (prev.classList.contains("user")) {
      return prev.dataset.raw || "";
    }
    prev = prev.previousElementSibling;
  }
  return "";
}

async function retryPrompt(wrapper) {
  const prompt = getRetryPrompt(wrapper);
  if (!prompt) {
    showToast("无法重试该消息");
    return;
  }
  removeMessagesFrom(wrapper);
  setStatus("Thinking...");
  setSendButtonState(true);
  const placeholder = renderMessage("assistant", "...");
  setMessagePrompt(placeholder, prompt);
  try {
    const answer = await sendPrompt(prompt, placeholder);
    if (placeholder.dataset.raw === answer) {
      if (window.renderMathInElement) {
        window.renderMathInElement(placeholder, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
        });
      }
    } else {
      placeholder.innerHTML = renderMarkdown(answer);
      placeholder.dataset.raw = answer;
      const placeholderWrapper = placeholder.closest(".message");
      if (placeholderWrapper) {
        placeholderWrapper.dataset.raw = answer;
      }
      if (window.renderMathInElement) {
        window.renderMathInElement(placeholder, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
        });
      }
    }
  } catch (error) {
    placeholder.textContent = "Request failed.";
    setStatus("Request failed");
  } finally {
    setSendButtonState(false);
  }
}

function loadStoredState() {
  const legacyUser = localStorage.getItem("llm.user");
  state.token = localStorage.getItem(STORAGE_KEYS.token) || "";
  state.userId =
    localStorage.getItem(STORAGE_KEYS.userId) || legacyUser || "guest";
  state.userName =
    localStorage.getItem(STORAGE_KEYS.userName) || legacyUser || "guest";
  state.baseUrl =
    localStorage.getItem(STORAGE_KEYS.baseUrl) || state.baseUrl;
  const cachedHistory = localStorage.getItem(STORAGE_KEYS.history);
  if (cachedHistory) {
    try {
      state.history = JSON.parse(cachedHistory);
    } catch (error) {
      state.history = [];
    }
  }
  state.conversationId = newConversationId();
  setNewChatState(true);
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEYS.token, state.token);
  localStorage.setItem(STORAGE_KEYS.userId, state.userId);
  localStorage.setItem(STORAGE_KEYS.userName, state.userName);
}

function setBaseUrl(url) {
  state.baseUrl = url;
  localStorage.setItem(STORAGE_KEYS.baseUrl, url);
  if (elements.apiBaseUrl) {
    elements.apiBaseUrl.value = url;
  }
}

function toggleModal(modal, show) {
  if (!modal) {
    return;
  }
  modal.hidden = !show;
}

function formatSummary(item) {
  return item.title || item.summary || "(no title)";
}

function normalizeHistoryTimestamp(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return trimmed.length <= 10 ? numeric * 1000 : numeric;
      }
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function sortHistoryByTime(items) {
  items.sort((a, b) =>
    normalizeHistoryTimestamp(b?.last_edit_time) -
      normalizeHistoryTimestamp(a?.last_edit_time)
  );
}

function handleInvalidUserId() {
  localStorage.removeItem(STORAGE_KEYS.userId);
  localStorage.removeItem(STORAGE_KEYS.token);
  alert("出了一些错误，联系管理员");
  console.error("invalid user_id in index");
  window.location.href = "/login/login.html";
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    return;
  }
  state.history.forEach((item) => {
    const entry = document.createElement("button");
    entry.className = "history-item";
    entry.type = "button";
    entry.textContent = formatSummary(item);
    if (item?.conversation_id !== undefined && item?.conversation_id !== null) {
      entry.dataset.conversationId = String(item.conversation_id);
      entry.addEventListener("click", () => {
        loadConversation(item.conversation_id);
      });
    }
    elements.historyList.appendChild(entry);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let markedReady = false;

function setupMarkedRenderer() {
  if (markedReady || !window.marked) {
    return;
  }
  const renderer = new window.marked.Renderer();
  renderer.code = (code, infostring) => {
    let rawCode = code;
    let rawLang = infostring;
    if (rawCode && typeof rawCode === "object") {
      rawLang = rawCode.lang || rawCode.language || rawLang;
      rawCode = rawCode.text ?? "";
    }
    const langValue = typeof rawLang === "string" ? rawLang : "";
    const langLabel = langValue.trim().split(/\s+/)[0] || "text";
    const langClass = langLabel.replace(/[^a-z0-9_+-]/gi, "") || "text";
    const encoded = encodeURIComponent(String(rawCode ?? ""));
    return `
<div class="code-block">
  <div class="code-block__header">
    <span class="code-block__lang">${escapeHtml(langLabel)}</span>
    <button class="code-copy" type="button" data-code="${encoded}" aria-label="Copy code">Copy</button>
  </div>
  <pre><code class="language-${escapeHtml(langClass)}">${escapeHtml(String(rawCode ?? ""))}</code></pre>
</div>`;
  };
  const options = { gfm: true, breaks: true, renderer };
  if (typeof window.marked.use === "function") {
    window.marked.use(options);
  } else if (typeof window.marked.setOptions === "function") {
    window.marked.setOptions(options);
  }
  markedReady = true;
}

function renderMarkdown(text) {
  if (window.marked) {
    setupMarkedRenderer();
    return window.marked.parse(text, { breaks: true });
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderPlainText(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function createActionButton(icon, label, onClick) {
  const button = document.createElement("button");
  button.className = "action-button";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.dataset.icon = icon;
  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";
  button.appendChild(img);
  if (onClick) {
    button.addEventListener("click", (event) => onClick(event, button));
  }
  return button;
}

function renderMessage(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  wrapper.dataset.raw = content;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const isUser = role === "user";
  if (!isUser && content === "...") {
    bubble.innerHTML =
      '<div class="loading-token"><img src="resources/loading_token.svg" alt="Loading" /></div>';
  } else {
    bubble.innerHTML = isUser ? renderPlainText(content) : renderMarkdown(content);
  }
  bubble.dataset.raw = content;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : "Assistant";
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copyBtn = createActionButton(
    "resources/copy.svg",
    "Copy message",
    (_event, button) => {
      markActionDone(button);
      copyToClipboard(wrapper.dataset.raw || "");
    }
  );
  if (role === "user") {
    actions.append(copyBtn);
  } else {
    const retryBtn = createActionButton(
      "resources/retry.svg",
      "Retry message",
      (_event, button) => {
        markActionDone(button);
        retryPrompt(wrapper);
      }
    );
    actions.append(copyBtn, retryBtn);
  }
  wrapper.appendChild(bubble);
  wrapper.appendChild(actions);
  wrapper.appendChild(meta);
  elements.chatHistory.appendChild(wrapper);
  if (window.renderMathInElement) {
    window.renderMathInElement(bubble, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
    });
  }
  elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
  return bubble;
}

function setUserId(id, name) {
  state.userId = id || state.userId || "guest";
  state.userName = name || state.userName || "guest";
  elements.userId.textContent = state.userName;
  saveAuth();
}

function getTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
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
    return true;
  } catch (error) {
    return false;
  }
}

async function loadHistory() {
  renderHistory();
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
  renderHistory();
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
    if (!Array.isArray(data)) {
      showToast("加载对话失败");
      setStatus("Ready");
      return;
    }
    data.forEach((msg) => {
      const role = msg.roll === "llm" ? "assistant" : "user";
      renderMessage(role, msg.context || "");
    });
    const resolvedConversationId = Number(conversationId);
    state.conversationId = Number.isFinite(resolvedConversationId)
      ? resolvedConversationId
      : newConversationId();
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
    response = await fetch(`${state.baseUrl}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: state.userId,
        conversationId: state.conversationId,
        model: state.model,
        message: prompt,
      }),
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
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("text/event-stream")) {
    // 上游返回非 SSE（JSON），直接解析，避免二次请求
    try {
      const json = await response.json();
      if (typeof json.conversationId === "number") {
        state.conversationId = json.conversationId;
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

async function sendPrompt(prompt, placeholder) {
  setStatus("Thinking...");
  const streamResult = await fetchStream(prompt, placeholder);
  if (streamResult !== null) {
    setStatus("Ready");
    return streamResult;
  }
  setStatus("Thinking...");
  const response = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({
      userId: state.userId,
      conversationId: state.conversationId,
      model: state.model,
      message: prompt,
    }),
  });
  if (typeof response.conversationId === "number") {
    state.conversationId = response.conversationId;
  }
  setStatus("Ready");
  return response.answer || "(no response)";
}

function resetChat() {
  elements.chatHistory.innerHTML = "";
  state.conversationId = newConversationId();
  setNewChatState(true);
}

function initEvents() {
  if (elements.menuBtn) {
    elements.menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isMobile()) {
        return;
      }
      if (elements.sidebar.classList.contains("open")) {
        hideSidebarMobile();
        return;
      }
      showSidebarMobile();
    });
  }

  if (elements.hideSidebarBtn) {
    elements.hideSidebarBtn.addEventListener("click", () => {
      if (isMobile()) {
        hideSidebarMobile();
        return;
      }
      if (elements.app && elements.app.classList.contains("sidebar-collapsed")) {
        expandSidebarDesktop();
      } else {
        collapseSidebarDesktop();
      }
    });
  }

  if (elements.settingsBtn && elements.settingsModal && elements.apiBaseUrl) {
    elements.settingsBtn.addEventListener("click", () => {
      elements.apiBaseUrl.value = state.baseUrl;
      toggleModal(elements.settingsModal, true);
    });
  }

  if (elements.settingsModal) {
    elements.settingsModal.addEventListener("click", (event) => {
      if (event.target === elements.settingsModal) {
        toggleModal(elements.settingsModal, false);
      }
    });
  }

  if (elements.newChatBtn) {
    elements.newChatBtn.addEventListener("click", () => {
      resetChat();
      setStatus("Ready");
    });
  }

  if (elements.promptInput && elements.chatForm) {
    elements.promptInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (elements.sendBtn && elements.sendBtn.disabled) {
          return;
        }
        if (typeof elements.chatForm.requestSubmit === "function") {
          elements.chatForm.requestSubmit();
        } else {
          elements.chatForm.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true })
          );
        }
      }
    });
  }

  if (elements.chatMain) {
    elements.chatMain.addEventListener("click", (event) => {
      if (event.target.closest(".chat-header") || event.target.closest(".chat-input")) {
        return;
      }
      if (!isMobile()) {
        return;
      }
      if (elements.sidebar && elements.sidebar.classList.contains("open")) {
        hideSidebarMobile();
      }
    });
  }

  if (elements.chatHistory) {
    elements.chatHistory.addEventListener("click", (event) => {
      const target = event.target.closest(".code-copy");
      if (!target) {
        return;
      }
      const encoded = target.dataset.code || "";
      let decoded = encoded;
      try {
        decoded = decodeURIComponent(encoded);
      } catch (error) {
        decoded = encoded;
      }
      copyToClipboard(decoded);
    });
  }

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      setMenuDisabled(false);
    }
  });

  if (elements.settingsForm) {
    elements.settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const url = elements.apiBaseUrl.value.trim();
      if (url) {
        setBaseUrl(url);
      }
      toggleModal(elements.settingsModal, false);
    });
  }

  if (elements.clearCacheBtn) {
    elements.clearCacheBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEYS.history);
      state.history = [];
      renderHistory();
    });
  }

  if (elements.modelSelect) {
    elements.modelSelect.addEventListener("change", () => {
      state.model = elements.modelSelect.value;
    });
    const triggerFetch = () => {
      if (!state.isNewChat) {
        return;
      }
      fetchModelsIfAllowed();
    };
    elements.modelSelect.addEventListener("focus", triggerFetch);
    elements.modelSelect.addEventListener("mousedown", triggerFetch);
  }

  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = elements.promptInput.value.trim();
    if (!prompt) {
      showToast("输入内容不能为空");
      return;
    }
    if (state.isNewChat) {
      setNewChatState(false);
    }
    setSendButtonState(true);
    renderMessage("user", prompt);
    elements.promptInput.value = "";
    const placeholder = renderMessage("assistant", "...");
    setMessagePrompt(placeholder, prompt);
    try {
      const answer = await sendPrompt(prompt, placeholder);
      if (placeholder.dataset.raw === answer) {
        // 流式已完成渲染，仅执行数学渲染
        if (window.renderMathInElement) {
          window.renderMathInElement(placeholder, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        }
      } else {
        placeholder.innerHTML = renderMarkdown(answer);
        placeholder.dataset.raw = answer;
        const placeholderWrapper = placeholder.closest(".message");
        if (placeholderWrapper) {
          placeholderWrapper.dataset.raw = answer;
        }
        if (window.renderMathInElement) {
          window.renderMathInElement(placeholder, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        }
      }
    } catch (error) {
      placeholder.textContent = "Request failed.";
      setStatus("Request failed");
    } finally {
      setSendButtonState(false);
    }
  });
}

async function bootstrap() {
  loadStoredState();
  setUserId(state.userId, state.userName);
  setBaseUrl(state.baseUrl);
  initEvents();
  const isValid = await validateToken();
  if (isValid) {
    loadHistory();
    return;
  }
  window.location.href = "/login/login.html";
}

bootstrap();