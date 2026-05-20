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
  userId: 0,
  userName: "guest",
  conversationId: -1,
  model: "deepseek-v4-flash",
  isNewChat: true,
  history: [],
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

function loadStoredState() {
  const legacyUser = localStorage.getItem("llm.user");
  state.token = localStorage.getItem(STORAGE_KEYS.token) || "";
  const storedUserId = localStorage.getItem(STORAGE_KEYS.userId) || legacyUser;
  const numericUserId = Number(storedUserId);
  state.userId = Number.isFinite(numericUserId) ? numericUserId : 0;
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
  state.conversationId = -1;
  setNewChatState(true);
}

function setNewChatState(isNew) {
  state.isNewChat = isNew;
  if (elements.modelSelect) {
    elements.modelSelect.disabled = !isNew;
  }
}

function setUserId(id, name) {
  const numericId = Number(id);
  state.userId = Number.isFinite(numericId) ? numericId : (state.userId || 0);
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