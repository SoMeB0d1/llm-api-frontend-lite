const STORAGE_KEYS = {
  token: "llm.token",
  refresh: "llm.refresh",
  userId: "llm.user",
  baseUrl: "llm.baseUrl",
};

const elements = {
  form: document.getElementById("loginForm"),
  username: document.getElementById("loginUsername"),
  password: document.getElementById("loginPassword"),
  submit: document.getElementById("loginSubmit"),
  status: document.getElementById("loginStatus"),
};

const state = {
  baseUrl: "",
};

const DEFAULT_BASE_URL = "http://localhost:8787";

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function setStatus(text, isError = false) {
  if (!elements.status) {
    return;
  }
  elements.status.textContent = text;
  elements.status.style.color = isError ? "#d62828" : "";
}

function setSubmitting(submitting) {
  if (!elements.submit) {
    return;
  }
  elements.submit.disabled = submitting;
  elements.submit.textContent = submitting ? "Signing in..." : "Continue";
}

async function login(username, password) {
  const response = await fetch(`${state.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { message: text };
    }
  }
  if (!response.ok) {
    const message = data.message || data.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function saveAuth(data, username) {
  localStorage.setItem(STORAGE_KEYS.token, data.token || "");
  localStorage.setItem(STORAGE_KEYS.refresh, data.refreshToken || "");
  localStorage.setItem(STORAGE_KEYS.userId, data.userId || username || "");
}

function loadBaseUrl() {
  const cached = localStorage.getItem(STORAGE_KEYS.baseUrl) || "";
  state.baseUrl = normalizeBaseUrl(cached) || DEFAULT_BASE_URL;
  if (!cached) {
    localStorage.setItem(STORAGE_KEYS.baseUrl, state.baseUrl);
  }
}

function init() {
  loadBaseUrl();
  if (elements.username) {
    elements.username.value = localStorage.getItem(STORAGE_KEYS.userId) || "";
  }

  if (!elements.form) {
    return;
  }

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = elements.username?.value.trim() || "";
    const password = elements.password?.value.trim() || "";
    if (!username || !password) {
      setStatus("Username and password are required.", true);
      return;
    }
    try {
      setSubmitting(true);
      setStatus("Signing in...");
      const data = await login(username, password);
      saveAuth(data, username);
      setStatus("Signed in. Redirecting...");
      window.location.href = "/";
    } catch (error) {
      setStatus(error.message || "Login failed.", true);
    } finally {
      setSubmitting(false);
    }
  });
}

init();
