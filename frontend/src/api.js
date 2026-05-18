async function ensureToken() {
  const storedToken = localStorage.getItem(STORAGE_KEYS.token);
  if (storedToken) {
    state.token = storedToken;
    return true;
  }
  window.location.href = "/token_check/token_check.html";
  return false;
}

async function sendPrompt(prompt) {
  const response = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt,
      user_id: state.userId,
      token: state.token,
      model: state.model,
      topic_id: state.topicId,
      new_topic: state.isNewChat,
    }),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { answer: text };
    }
  }
  if (!response.ok) {
    const message = data.error || data.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data.answer || "";
}

async function fetchHistory() {
  if (!state.token) {
    return;
  }
  try {
    const response = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: state.userId,
        token: state.token,
      }),
    });
    const text = await response.text();
    if (response.status === 500) {
      alert("出现问题，请联系管理员");
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    let data = [];
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = [];
      }
    }
    if (!Array.isArray(data)) {
      data = data.conversations || [];
    }
    sortHistoryByTime(data);
    state.history = data;
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(data));
    renderHistory();
  } catch (error) {
    console.error("History fetch failed:", error);
  }
}

async function loadConversationTopics() {
  if (!state.token) {
    return;
  }
  try {
    const response = await fetch("/history/topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: state.userId,
        token: state.token,
      }),
    });
    const text = await response.text();
    if (response.status === 500) {
      alert("出现问题，请联系管理员");
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    let data = [];
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = [];
      }
    }
    if (!Array.isArray(data)) {
      data = data.conversations || [];
    }
    sortHistoryByTime(data);
    state.history = data;
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(data));
    renderHistory();
  } catch (error) {
    console.error("History topics fetch failed:", error);
  }
}

async function loadConversation(conversationId) {
  if (!state.token) {
    return;
  }
  try {
    const response = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: state.userId,
        token: state.token,
        conversation_id: conversationId,
      }),
    });
    const text = await response.text();
    if (response.status === 500) {
      alert("出现问题，请联系管理员");
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        showToast("历史记录解析失败");
        return;
      }
    }
    elements.chatHistory.innerHTML = "";
    const messages = data.messages || [];
    if (!messages.length) {
      showToast("该对话无消息记录");
      return;
    }
    messages.forEach((msg) => {
      const role = msg.role || "assistant";
      const content = msg.content || msg.text || "";
      if (content) {
        renderMessage(role, content);
      }
    });
    const firstUser = messages.find((m) => m.role === "assistant");
    if (firstUser) {
      state.topicId = firstUser.topic_id || firstUser.topicId || newTopicId();
    } else {
      state.topicId = newTopicId();
    }
    setNewChatState(false);
  } catch (error) {
    showToast("加载历史记录失败");
    console.error(error);
  }
}