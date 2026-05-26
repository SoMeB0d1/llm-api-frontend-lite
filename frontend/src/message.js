import { elements } from "./elements.js";
import { renderMarkdown, renderPlainText } from "./markdown.js";
import { copyToClipboard, markActionDone } from "./ui.js";
import { formatSummary } from "./utils.js";
import { state, setNewChatState } from "./state.js";

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
  const isUser = role === "user";
  if (!isUser && content === "...") {
    bubble.innerHTML =
      '<div class="loading-token"><img src="resources/loading_token.svg" alt="Loading" /></div>';
  } else {
    bubble.innerHTML = isUser ? renderPlainText(content) : renderMarkdown(content);
  }
  bubble.dataset.raw = content;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : "Assistant";
  const actions = document.createElement("div");
  actions.className = "message-actions";
  if (!isUser) {
    const retryBtn = createActionButton(
      "resources/retry.svg",
      "Retry response"
    );
    const backBtn = createActionButton(
      "resources/back.svg",
      "Rewind response"
    );
    actions.append(retryBtn, backBtn);
  }
  const copyBtn = createActionButton(
    "resources/copy.svg",
    "Copy message",
    (_event, button) => {
      markActionDone(button);
      copyToClipboard(wrapper.dataset.raw || "");
    }
  );
  actions.append(copyBtn);
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

function renderHistory(onSelectConversation) {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    return;
  }
  state.history.forEach((item) => {
    const entry = document.createElement("button");
    entry.className = "history-item";
    entry.type = "button";
    entry.textContent = formatSummary(item);
    if (
      item?.conversation_id !== undefined &&
      item?.conversation_id !== null &&
      typeof onSelectConversation === "function"
    ) {
      entry.dataset.conversationId = String(item.conversation_id);
      entry.addEventListener("click", () => {
        onSelectConversation(item.conversation_id);
      });
    }
    elements.historyList.appendChild(entry);
  });
}

function resetChat() {
  elements.chatHistory.innerHTML = "";
  state.conversationId = -1;
  setNewChatState(true);
}

export { renderMessage, renderHistory, resetChat };
