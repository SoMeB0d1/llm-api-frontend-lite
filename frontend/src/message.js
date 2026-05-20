function renderMarkdown(text) {
  if (window.marked) {
    return window.marked.parse(text, { breaks: true });
  }
  return text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/\n/g, "<br>");
}

function createActionButton(icon, label, onClick) {
  const button = document.createElement("button");
  button.className = "action-button";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.dataset.icon = icon;
  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";
  button.appendChild(img);
  if (onClick) {
    button.addEventListener("click", (event) => onClick(event, button));
  }
  return button;
}

function renderMessage(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  wrapper.dataset.raw = content;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = renderMarkdown(content);
  bubble.dataset.raw = content;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : "Assistant";
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copyBtn = createActionButton(
    "resources/copy.svg",
    "Copy message",
    (_event, button) => {
      markActionDone(button);
      copyToClipboard(wrapper.dataset.raw || "");
    }
  );
  if (role === "user") {
    actions.append(copyBtn);
  } else {
    const retryBtn = createActionButton(
      "resources/retry.svg",
      "Retry message",
      (_event, button) => {
        markActionDone(button);
        retryPrompt(wrapper);
      }
    );
    actions.append(copyBtn, retryBtn);
  }
  wrapper.appendChild(bubble);
  wrapper.appendChild(actions);
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

function setMessagePrompt(bubble, prompt) {
  const wrapper = bubble?.closest(".message");
  if (wrapper && prompt) {
    wrapper.dataset.prompt = prompt;
  }
}

function removeMessagesFrom(wrapper) {
  if (!wrapper || !wrapper.parentElement) {
    return;
  }
  let current = wrapper;
  while (current) {
    const next = current.nextElementSibling;
    current.remove();
    current = next;
  }
}

function getRetryPrompt(wrapper) {
  if (wrapper?.dataset.prompt) {
    return wrapper.dataset.prompt;
  }
  let prev = wrapper?.previousElementSibling;
  while (prev) {
    if (prev.classList.contains("user")) {
      return prev.dataset.raw || "";
    }
    prev = prev.previousElementSibling;
  }
  return "";
}

async function retryPrompt(wrapper) {
  const prompt = getRetryPrompt(wrapper);
  if (!prompt) {
    showToast("无法重试该消息");
    return;
  }
  removeMessagesFrom(wrapper);
  setStatus("Thinking...");
  setSendButtonState(true);
  const placeholder = renderMessage("assistant", "...");
  setMessagePrompt(placeholder, prompt);
  try {
    const answer = await sendMessage(prompt);
    placeholder.innerHTML = renderMarkdown(answer);
    placeholder.dataset.raw = answer;
    const placeholderWrapper = placeholder.closest(".message");
    if (placeholderWrapper) {
      placeholderWrapper.dataset.raw = answer;
    }
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
  } finally {
    setSendButtonState(false);
  }
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    return;
  }
  state.history.forEach((item) => {
    const entry = document.createElement("button");
    entry.className = "history-item";
    entry.type = "button";
    entry.textContent = formatSummary(item);
    if (item?.conversation_id !== undefined && item?.conversation_id !== null) {
      entry.dataset.conversationId = String(item.conversation_id);
      entry.addEventListener("click", () => {
        loadConversation(item.conversation_id);
      });
    }
    elements.historyList.appendChild(entry);
  });
}