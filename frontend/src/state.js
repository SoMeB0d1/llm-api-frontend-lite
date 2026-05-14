const SIDEBAR_ICONS = {
  hide: "resources/hide.svg",
  show: "resources/show.svg",
};

const SEND_ICONS = {
  send: "resources/send.svg",
  loading: "resources/loading.svg",
};

const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
  history: "llm.history",
};

const state = {
  baseUrl: "",
  token: "",
  userId: "guest",
  userName: "guest",
  topicId: "",
  model: "deepseek-v4-flash",
  isNewChat: true,
  history: [],
};

function newTopicId() {
  return `topic-${Date.now()}`;
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
  state.topicId = newTopicId();
  setNewChatState(true);
}

function setNewChatState(isNew) {
  state.isNewChat = isNew;
  if (elements.modelSelect) {
    elements.modelSelect.disabled = !isNew;
  }
}

function setUserId(id, name) {
  state.userId = id || state.userId || "guest";
  state.userName = name || state.userName || "guest";
  elements.userId.textContent = state.userName;
  saveAuth();
}

function setBaseUrl(url) {
  state.baseUrl = url;
  localStorage.setItem(STORAGE_KEYS.baseUrl, url);
  if (elements.apiBaseUrl) {
    elements.apiBaseUrl.value = url;
  }
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEYS.token, state.token);
  localStorage.setItem(STORAGE_KEYS.userId, state.userId);
  localStorage.setItem(STORAGE_KEYS.userName, state.userName);
}