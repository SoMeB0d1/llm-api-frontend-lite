const state = {
  baseUrl: "http://localhost:4587",
  token: "",
  refreshToken: "",
  userId: "guest",
  history: [],
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
  userId: "llm.user",
  baseUrl: "llm.baseUrl",
  history: "llm.history",
};

function setStatus(text) {
  elements.statusText.textContent = text;
}

function setSidebarHidden(hidden) {
  if (!elements.app || !elements.sidebar) {
    return;
  }
  elements.app.classList.toggle("sidebar-hidden", hidden);
  if (hidden) {
    elements.sidebar.classList.remove("open");
  }
}

function showToast(message) {
  if (!elements.toast) {
    return;
  }
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function loadStoredState() {
  state.token = localStorage.getItem(STORAGE_KEYS.token) || "";
  state.refreshToken = localStorage.getItem(STORAGE_KEYS.refresh) || "";
  state.userId = localStorage.getItem(STORAGE_KEYS.userId) || "guest";
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
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEYS.token, state.token);
  localStorage.setItem(STORAGE_KEYS.refresh, state.refreshToken);
  localStorage.setItem(STORAGE_KEYS.userId, state.userId);
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

function renderMessage(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = renderMarkdown(content);
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : "Assistant";
  wrapper.appendChild(bubble);
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

function setUserId(id) {
  state.userId = id || "guest";
  elements.userId.textContent = state.userId;
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
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function login(username, password) {
  setStatus("Signing in...");
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  state.token = data.token || "";
  state.refreshToken = data.refreshToken || "";
  setUserId(data.userId || username);
  saveAuth();
  toggleModal(elements.loginModal, false);
  setStatus("Ready");
}

async function validateToken() {
  if (!state.token) {
    return false;
  }
  try {
    const data = await apiFetch("/auth/validate", {
      method: "POST",
      body: JSON.stringify({ token: state.token }),
    });
    if (data.valid === false) {
      return false;
    }
    if (data.token) {
      state.token = data.token;
    }
    if (data.refreshToken) {
      state.refreshToken = data.refreshToken;
    }
    if (data.userId) {
      setUserId(data.userId);
    }
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
    body: JSON.stringify({ prompt }),
  });
  setStatus("Ready");
  return response.answer || "(no response)";
}

function resetChat() {
  elements.chatHistory.innerHTML = "";
}

function initEvents() {
  if (elements.menuBtn) {
    elements.menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (elements.app && elements.app.classList.contains("sidebar-hidden")) {
        setSidebarHidden(false);
        return;
      }
      elements.sidebar.classList.toggle("open");
    });
  }

  if (elements.hideSidebarBtn) {
    elements.hideSidebarBtn.addEventListener("click", () => {
      setSidebarHidden(true);
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

  if (elements.chatMain) {
    elements.chatMain.addEventListener("click", (event) => {
      if (event.target.closest(".chat-header") || event.target.closest(".chat-input")) {
        return;
      }
      if (window.innerWidth >= 800) {
        return;
      }
      if (elements.app && elements.app.classList.contains("sidebar-hidden")) {
        return;
      }
      if (elements.sidebar && elements.sidebar.classList.contains("open")) {
        elements.sidebar.classList.remove("open");
      }
    });
  }

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

  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = elements.promptInput.value.trim();
    if (!prompt) {
      showToast("输入内容不能为空");
      return;
    }
    renderMessage("user", prompt);
    elements.promptInput.value = "";
    const placeholder = renderMessage("assistant", "...");
    try {
      const answer = await sendPrompt(prompt);
      placeholder.innerHTML = renderMarkdown(answer);
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
    }
  });
}

async function bootstrap() {
  loadStoredState();
  setUserId(state.userId);
  setBaseUrl(state.baseUrl);
  initEvents();
  const hasLoginUI = Boolean(elements.loginModal && elements.loginForm);
  if (await validateToken()) {
    toggleModal(elements.loginModal, false);
    loadHistory();
  } else if (hasLoginUI) {
    toggleModal(elements.loginModal, true);
  } else {
    loadHistory();
  }
}

bootstrap();
