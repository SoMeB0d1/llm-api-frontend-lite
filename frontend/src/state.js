import { elements } from "./elements.js";
import {
  STORAGE_KEYS,
  DEFAULT_SYSTEM_PROMPT,
  MAX_CONVERSATION_ID,
} from "./constants.js";

const state = {
  baseUrl: "",
  token: "",
  userId: 0,
  userName: "guest",
  conversationId: -1,
  model: "deepseek-v4-flash",
  systemPromptApplied: DEFAULT_SYSTEM_PROMPT,
  isNewChat: true,
  history: [],
};

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

function syncSystemPromptInputState() {
  if (!elements.systemPromptInput) {
    return;
  }
  elements.systemPromptInput.value =
    state.systemPromptApplied || DEFAULT_SYSTEM_PROMPT;
  elements.systemPromptInput.disabled = !state.isNewChat;
  if (elements.savePromptBtn) {
    elements.savePromptBtn.disabled = !state.isNewChat;
  }
}

function setNewChatState(isNew) {
  state.isNewChat = isNew;
  if (elements.modelSelect) {
    elements.modelSelect.disabled = !isNew;
  }
  syncSystemPromptInputState();
}

function loadStoredState() {
  const legacyUser = localStorage.getItem("llm.user");
  state.token = localStorage.getItem(STORAGE_KEYS.token) || "";
  const storedUserId = localStorage.getItem(STORAGE_KEYS.userId) || legacyUser;
  const numericUserId = Number(storedUserId);
  state.userId = Number.isFinite(numericUserId) ? numericUserId : 0;
  state.userName =
    localStorage.getItem(STORAGE_KEYS.userName) || legacyUser || "guest";
  state.baseUrl = localStorage.getItem(STORAGE_KEYS.baseUrl) || state.baseUrl;
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

function setUserId(id, name) {
  const numericId = Number(id);
  state.userId = Number.isFinite(numericId) ? numericId : state.userId || 0;
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

export {
  state,
  newConversationId,
  setNewChatState,
  loadStoredState,
  setUserId,
  setBaseUrl,
  saveAuth,
  syncSystemPromptInputState,
};
