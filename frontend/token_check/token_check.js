/**
 * token_check.js — Token 校验入口页面
 *
 * 应用启动时首先加载此页面，验证 localStorage 中的 token 是否有效：
 *   - POST /auth/token 校验 token
 *   - 校验通过 → 跳转 /index.html（主页面）
 *   - 校验失败或网络错误 → 跳转 /login/login.html（登录页）
 */

const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
};

/** 去除 URL 末尾的 "/" */
function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * 校验 token：POST /auth/token
 * 成功时更新 localStorage 中的 token/userId/userName 并跳转主页面
 * 失败时跳转登录页
 */
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
    // token 校验失败或网络错误，跳转登录页
  }
  window.location.href = "/login/login.html";
}

checkToken();