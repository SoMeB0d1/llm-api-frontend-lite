/**
 * message.js — 消息渲染模块
 *
 * 负责聊天历史、消息气泡和历史列表的 DOM 渲染：
 *   - renderMessage：创建一条 user/assistant 消息气泡（含操作按钮、数学渲染）
 *   - renderHistory：将 state.history 渲染到侧边栏历史列表
 *   - resetChat：清空聊天区域并重置为新对话状态
 */

import { elements } from "./elements.js";
import { renderMarkdown, renderPlainText } from "./markdown.js";
import { copyToClipboard, markActionDone } from "./ui.js";
import { formatSummary } from "./utils.js";
import { state, setNewChatState } from "./state.js";

/** 创建一个消息操作按钮（SVG 图标 + label + 可选点击回调） */
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

/**
 * 在聊天区域渲染一条消息
 * @param {string} role "user" | "assistant"
 * @param {string} content 消息文本
 * @param {number|string} [messageId] 可选的数据库消息 ID
 * @returns {HTMLElement} 消息的 .bubble 元素
 */
function renderMessage(role, content, messageId) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  wrapper.dataset.raw = content;
  const numericMessageId = Number(messageId);
  if (Number.isFinite(numericMessageId)) {
    wrapper.dataset.messageId = String(numericMessageId);
  }
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
    retryBtn.dataset.action = "regenerate";
    backBtn.dataset.action = "back";
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

/**
 * 渲染侧边栏对话历史列表
 * @param {function} onSelectConversation 点击条目时的回调（传入 conversation_id）
 */
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

/** 清空聊天区域，重置 conversationId 为 -1，切换到新对话状态 */
function resetChat() {
  elements.chatHistory.innerHTML = "";
  state.conversationId = -1;
  setNewChatState(true);
}

export { renderMessage, renderHistory, resetChat };
