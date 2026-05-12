const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.user",
  baseUrl: "llm.baseUrl",
};

const DEFAULT_BASE_URL = "http://localhost:8787";

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveBaseUrl() {
  const cached = normalizeBaseUrl(
    localStorage.getItem(STORAGE_KEYS.baseUrl) || ""
  );
  const resolved = cached || DEFAULT_BASE_URL;
  if (!cached) {
    localStorage.setItem(STORAGE_KEYS.baseUrl, resolved);
  }
  return resolved;
}

async function checkToken() {
  const token = localStorage.getItem(STORAGE_KEYS.token) || "";
  const baseUrl = resolveBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
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
    if (response.ok && data.token_valid === true) {
      if (data.new_token) {
        localStorage.setItem(STORAGE_KEYS.token, data.new_token);
      }
      const nextUser = data.user_ID || data.user_name;
      if (nextUser) {
        localStorage.setItem(STORAGE_KEYS.userId, nextUser);
      }
      window.location.href = "/index.html";
      return;
    }
  } catch (error) {
    // Fall through to login.
  }
  window.location.href = "/login/login.html";
}

checkToken();
