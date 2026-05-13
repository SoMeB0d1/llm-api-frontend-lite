const state = {
  baseUrl: "",
  token: "",
  refreshToken: "",
  userId: "guest",
  userName: "guest",
  topicId: "",
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
  loginModal: document.getElementById("loginModal"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  settingsModal: document.getElementById("settingsModal"),
  settingsForm: document.getElementById("settingsForm"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
};

const STORAGE_KEYS = {
  token: "llm.token",
  refresh: "llm.refresh",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
  history: "llm.history",
};

function newTopicId() {
  return `topic-${Date.now()}`;
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
    const answer = await sendPrompt(prompt);
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
  state.refreshToken = localStorage.getItem(STORAGE_KEYS.refresh) || "";
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
  state.topicId = newTopicId();
  setNewChatState(true);
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEYS.token, state.token);
  localStorage.setItem(STORAGE_KEYS.refresh, state.refreshToken);
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
  return item.summary || "(no summary)";
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "history-item";
    empty.textContent = "No history yet.";
    elements.historyList.appendChild(empty);
    return;
  }
  state.history.forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "history-item";
    entry.textContent = formatSummary(item);
    elements.historyList.appendChild(entry);
  });
}

function renderMarkdown(text) {
  if (window.marked) {
    return window.marked.parse(text, { breaks: true });
  }
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
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
  bubble.innerHTML = renderMarkdown(content);
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

function seedTestConversation() {
  if (!elements.chatHistory || elements.chatHistory.children.length) {
    return;
  }
  const sample = [
    {
      role: "user",
      content: "Summarize the following notes into bullet points.",
    },
    {
      role: "assistant",
      content:
        "Here is a concise summary:\n\n- The project targets a lightweight UI with a fixed sidebar and scrollable chat history.\n- The backend uses a Go proxy to an OpenAI-compatible API.\n- Frontend state includes user ID, topic ID, and model selection.\n- Error handling should surface clearly in the header status.\n- UI controls include copy/edit/retry actions per message.",
    },
    {
      role: "user",
      content:
        "Give me a quick plan for a weekend trip to a coastal city with food and museums.",
    },
    {
      role: "assistant",
      content:
        "Weekend plan:\n\n**Day 1**\n- Morning: waterfront walk + local market breakfast.\n- Afternoon: city history museum, then coffee by the harbor.\n- Evening: seafood dinner, sunset lookout.\n\n**Day 2**\n- Morning: contemporary art museum.\n- Afternoon: beach time and a casual lunch.\n- Evening: food street crawl and a night ferry ride.",
    },
    {
      role: "user",
      content:
        "Explain the difference between optimistic and pessimistic concurrency control with a quick example.",
    },
    {
      role: "assistant",
      content:
        "Optimistic control assumes conflicts are rare and checks at commit time. Example: two users edit a record; the second save is rejected if the version changed.\n\nPessimistic control locks resources up front. Example: the first editor locks a row; the second must wait until the lock is released.",
    },
  ];
  sample.forEach((item) => renderMessage(item.role, item.content));
  setNewChatState(false);
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
  if (response.status === 401 && state.refreshToken) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return apiFetch(path, options);
    }
  }
  if (!response.ok) {
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
    showToast("模型列表获取失败");
  } finally {
    modelFetchInFlight = false;
  }
}

async function login(username, password) {
  setStatus("Signing in...");
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  state.token = data.token || "";
  state.refreshToken = data.refreshToken || "";
  setUserId(data.userId || username, username);
  saveAuth();
  toggleModal(elements.loginModal, false);
  setStatus("Ready");
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

async function refreshToken() {
  try {
    const data = await apiFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    state.token = data.token || "";
    state.refreshToken = data.refreshToken || state.refreshToken;
    saveAuth();
    return true;
  } catch (error) {
    state.token = "";
    state.refreshToken = "";
    saveAuth();
    toggleModal(elements.loginModal, true);
    return false;
  }
}

async function loadHistory() {
  renderHistory();
  try {
    const data = await apiFetch("/history", { method: "GET" });
    state.history = Array.isArray(data.items) ? data.items : [];
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
    renderHistory();
  } catch (error) {
    setStatus("History unavailable");
  }
}

async function sendPrompt(prompt) {
  setStatus("Thinking...");
  const response = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({
      userId: state.userId,
      topicId: state.topicId,
      model: state.model,
      message: prompt,
    }),
  });
  setStatus("Ready");
  return response.answer || "(no response)";
}

function resetChat() {
  elements.chatHistory.innerHTML = "";
  state.topicId = newTopicId();
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

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      setMenuDisabled(false);
    }
  });

  if (elements.loginModal) {
    elements.loginModal.addEventListener("click", (event) => {
      if (event.target === elements.loginModal) {
        toggleModal(elements.loginModal, true);
      }
    });
  }

  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = elements.loginUsername.value.trim();
      const password = elements.loginPassword.value.trim();
      if (!username || !password) {
        return;
      }
      try {
        await login(username, password);
        await loadHistory();
      } catch (error) {
        setStatus("Login failed");
      }
    });
  }

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
      const answer = await sendPrompt(prompt);
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
    seedTestConversation();
    loadHistory();
    return;
  }
  window.location.href = "/login/login.html";
}

bootstrap();
