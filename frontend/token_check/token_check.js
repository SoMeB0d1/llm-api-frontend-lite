const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
};

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function checkToken() {
  const token = localStorage.getItem(STORAGE_KEYS.token) || "";
  const baseUrl = normalizeBaseUrl(
    localStorage.getItem(STORAGE_KEYS.baseUrl) || ""
  );
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
      if (data.user_ID != null) {
        localStorage.setItem(STORAGE_KEYS.userId, data.user_ID);
      }
      if (data.user_name) {
        localStorage.setItem(STORAGE_KEYS.userName, data.user_name);
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
