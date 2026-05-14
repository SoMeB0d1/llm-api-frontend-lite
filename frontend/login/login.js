const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
};

const elements = {
  form: document.getElementById("loginForm"),
  username: document.getElementById("loginUsername"),
  password: document.getElementById("loginPassword"),
  submit: document.getElementById("loginSubmit"),
  status: document.getElementById("loginStatus"),
  toast: document.getElementById("loginToast"),
};

const state = {
  baseUrl: "",
};

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
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

function setSubmitting(submitting) {
  if (!elements.submit) {
    return;
  }
  elements.submit.disabled = submitting;
  if (submitting) {
    if (!elements.submit.dataset.label) {
      elements.submit.dataset.label = elements.submit.textContent || "Continue";
    }
    elements.submit.classList.add("login-button--loading");
    elements.submit.innerHTML =
      '<img src="/resources/loading.svg" alt="Loading" />';
  } else {
    elements.submit.classList.remove("login-button--loading");
    elements.submit.textContent = elements.submit.dataset.label || "Continue";
  }
}

async function login(username, password) {
  const response = await fetch(`${state.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_name: username, user_psw: password }),
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

function saveAuth(data, userId, userName) {
  localStorage.setItem(STORAGE_KEYS.token, data.new_token || "");
  localStorage.setItem(STORAGE_KEYS.userId, userId || "");
  localStorage.setItem(STORAGE_KEYS.userName, userName || "");
}

function loadBaseUrl() {
  const cached = localStorage.getItem(STORAGE_KEYS.baseUrl) || "";
  state.baseUrl = normalizeBaseUrl(cached);
}

function init() {
  loadBaseUrl();

  if (!elements.form) {
    return;
  }

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = elements.username?.value.trim() || "";
    const password = elements.password?.value.trim() || "";
    if (!username) {
      showToast("用户名不能为空");
      return;
    }
    if (!password) {
      showToast("密码不能为空");
      return;
    }
    try {
      setSubmitting(true);
      const data = await login(username, password);
      if (data.user_exist === false) {
        showToast("用户名错误");
        return;
      }
      if (data.psw_right === false) {
        showToast("密码错误");
        return;
      }
      saveAuth(data, data.user_ID || "", username);
      window.location.href = "/index.html";
    } catch (error) {
      showToast(error.message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  });
}

init();
