/**
 * events.js — 事件绑定模块
 *
 * initEvents() 为全局 UI 元素绑定事件：
 *   - 侧边栏（移动端/桌面端切换、菜单按钮）
 *   - 设置弹窗（打开/关闭、Tab 切换、保存系统提示词）
 *   - 回溯 & 重新生成弹窗（确认/取消）
 *   - 聊天表单（提交、Enter 发送、模型切换、新建对话）
 *   - 消息操作按钮（回溯、重新生成、代码复制）
 *   - 窗口 resize / Esc 关闭弹窗 / 退出登录
 */

import { elements } from "./elements.js";
import { state, setNewChatState, syncSystemPromptInputState } from "./state.js";
import {
  applyRootSettingsVisibility,
  saveSystemPrompt,
  switchSettingsTab,
} from "./settings.js";
import {
  collapseSidebarDesktop,
  expandSidebarDesktop,
  hideSidebarMobile,
  setMenuDisabled,
  showSidebarMobile,
} from "./sidebar.js";
import {
  copyToClipboard,
  isMobile,
  setSendButtonState,
  setStatus,
  showToast,
  toggleModal,
} from "./ui.js";
import { renderMessage, resetChat } from "./message.js";
import { fetchModelsIfAllowed, loadConversation, sendMessage, sendBack } from "./api.js";
import { renderMarkdown } from "./markdown.js";

/** 绑定全部 UI 事件，在应用初始化时调用一次 */
function initEvents() {
  let pendingBackMessageId = null;
  let pendingRegeneratePrompt = "";
  let pendingRegenerateBackMessageId = null;

  /** 从 startNode 向前查找匹配 CSS 选择器的兄弟元素 */
  const findPreviousMessage = (startNode, selector) => {
    let current = startNode?.previousElementSibling;
    while (current) {
      if (current.matches(selector)) {
        return current;
      }
      current = current.previousElementSibling;
    }
    return null;
  };

  /**
   * 从 UI 输入框发送用户消息的完整流程：
   * 渲染 user/assistant 占位 → 调用 sendMessage → 最终渲染 Markdown + 数学公式
   */
  const sendPromptFromUI = async (prompt) => {
    const trimmed = String(prompt || "").trim();
    if (!trimmed) {
      showToast("输入内容不能为空");
      return;
    }
    if (state.isNewChat) {
      setNewChatState(false);
    }
    setSendButtonState(true);
    const userBubble = renderMessage("user", trimmed);
    if (elements.promptInput) {
      elements.promptInput.value = "";
    }
    const placeholder = renderMessage("assistant", "...");
    try {
      const answer = await sendMessage(trimmed, placeholder, userBubble);
      if (placeholder.dataset.raw === answer) {
        if (window.renderMathInElement) {
          window.renderMathInElement(placeholder, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        }
      } else {
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
      }
    } catch (error) {
      placeholder.textContent = "Request failed.";
      setStatus("Request failed");
    } finally {
      setSendButtonState(false);
    }
  };

  /** 统一禁/启用所有回溯和重新生成按钮 */
  const setActionButtonsDisabled = (disabled) => {
    if (elements.chatHistory) {
      elements.chatHistory.dataset.actionsDisabled = disabled ? "true" : "";
    }
    const buttons = document.querySelectorAll(
      '.action-button[data-action="back"], .action-button[data-action="regenerate"]'
    );
    buttons.forEach((button) => {
      button.disabled = disabled;
    });
  };

  /** 关闭回溯确认弹窗并清除 pending 状态 */
  const closeBackModal = () => {
    pendingBackMessageId = null;
    if (elements.backModal) {
      elements.backModal.dataset.messageId = "";
    }
    toggleModal(elements.backModal, false);
  };

  /** 打开回溯确认弹窗，记录待回溯的 messageId */
  const openBackModal = (messageId) => {
    pendingBackMessageId = messageId;
    if (elements.backModal) {
      elements.backModal.dataset.messageId = String(messageId);
    }
    toggleModal(elements.backModal, true);
  };

  /** 关闭重新生成确认弹窗并清除 pending 状态 */
  const closeRegenerateModal = () => {
    pendingRegeneratePrompt = "";
    pendingRegenerateBackMessageId = null;
    if (elements.regenerateModal) {
      elements.regenerateModal.dataset.messageId = "";
    }
    toggleModal(elements.regenerateModal, false);
  };

  /** 打开重新生成确认弹窗，记录待回溯的 messageId 和原始 prompt */
  const openRegenerateModal = (prompt, backMessageId) => {
    pendingRegeneratePrompt = prompt;
    pendingRegenerateBackMessageId = backMessageId;
    if (elements.regenerateModal) {
      elements.regenerateModal.dataset.messageId = String(backMessageId);
    }
    toggleModal(elements.regenerateModal, true);
  };
  if (elements.menuBtn) {
    // 移动端侧边栏菜单按钮：打开/关闭侧边栏
    elements.menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isMobile()) {
        return;
      }
      if (elements.sidebar.classList.contains("open")) {
        hideSidebarMobile();
        return;
      }
      showSidebarMobile();
    });
  }

  if (elements.hideSidebarBtn) {
    // 侧边栏折叠/展开按钮
    elements.hideSidebarBtn.addEventListener("click", () => {
      if (isMobile()) {
        hideSidebarMobile();
        return;
      }
      if (elements.app && elements.app.classList.contains("sidebar-collapsed")) {
        expandSidebarDesktop();
      } else {
        collapseSidebarDesktop();
      }
    });
  }

  if (elements.settingsBtn && elements.settingsModal) {
    // 设置按钮 → 打开设置弹窗，默认显示模型 Tab
    elements.settingsBtn.addEventListener("click", () => {
      applyRootSettingsVisibility();
      syncSystemPromptInputState();
      switchSettingsTab("model");
      toggleModal(elements.settingsModal, true);
    });
  }

  if (elements.settingsCloseBtn && elements.settingsModal) {
    elements.settingsCloseBtn.addEventListener("click", () => {
      toggleModal(elements.settingsModal, false);
    });
  }

  if (elements.settingsTabs) {
    elements.settingsTabs.addEventListener("click", (event) => {
      const target = event.target.closest(".settings-tab");
      if (!target) {
        return;
      }
      switchSettingsTab(target.dataset.tab);
    });
  }

  if (elements.settingsModal) {
    elements.settingsModal.addEventListener("click", (event) => {
      if (event.target === elements.settingsModal) {
        toggleModal(elements.settingsModal, false);
      }
    });
  }

  if (elements.backModal) {
    elements.backModal.addEventListener("click", (event) => {
      if (event.target === elements.backModal) {
        closeBackModal();
      }
    });
  }

  if (elements.regenerateModal) {
    elements.regenerateModal.addEventListener("click", (event) => {
      if (event.target === elements.regenerateModal) {
        closeRegenerateModal();
      }
    });
  }

  if (elements.backCancelBtn) {
    elements.backCancelBtn.addEventListener("click", () => {
      closeBackModal();
    });
  }

  if (elements.regenerateCancelBtn) {
    elements.regenerateCancelBtn.addEventListener("click", () => {
      closeRegenerateModal();
    });
  }

  if (elements.backConfirmBtn) {
    elements.backConfirmBtn.addEventListener("click", async () => {
      const modalMessageId = Number(elements.backModal?.dataset.messageId);
      const messageId = Number.isFinite(pendingBackMessageId)
        ? pendingBackMessageId
        : modalMessageId;
      if (!Number.isFinite(messageId)) {
        showToast("无法回溯该消息");
        closeBackModal();
        return;
      }
      closeBackModal();
      setActionButtonsDisabled(true);
      try {
        await sendBack(messageId);
        if (Number.isFinite(state.conversationId) && state.conversationId >= 0) {
          await loadConversation(state.conversationId);
        }
        showToast("已提交回溯请求", "success");
      } catch (error) {
        if (error?.message !== "server_error") {
          showToast("回溯请求失败");
        }
      } finally {
        setActionButtonsDisabled(false);
      }
    });
  }

  if (elements.regenerateConfirmBtn) {
    elements.regenerateConfirmBtn.addEventListener("click", async () => {
      const messageId = Number(pendingRegenerateBackMessageId);
      const prompt = String(pendingRegeneratePrompt || "").trim();
      if (!Number.isFinite(messageId) || !prompt) {
        showToast("无法重新生成该消息");
        closeRegenerateModal();
        return;
      }
      closeRegenerateModal();
      setActionButtonsDisabled(true);
      try {
        await sendBack(messageId);
        if (Number.isFinite(state.conversationId) && state.conversationId >= 0) {
          await loadConversation(state.conversationId);
        }
        if (elements.promptInput) {
          elements.promptInput.value = prompt;
        }
        await sendPromptFromUI(prompt);
        showToast("已提交重新生成请求", "success");
      } catch (error) {
        if (error?.message !== "server_error") {
          showToast("重新生成请求失败");
        }
      } finally {
        setActionButtonsDisabled(false);
      }
    });
  }

  if (elements.newChatBtn) {
    elements.newChatBtn.addEventListener("click", () => {
      resetChat();
      setStatus("Ready");
    });
  }

  if (elements.promptInput && elements.chatForm) {
    elements.promptInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (elements.sendBtn && elements.sendBtn.disabled) {
          return;
        }
        if (typeof elements.chatForm.requestSubmit === "function") {
          elements.chatForm.requestSubmit();
        } else {
          elements.chatForm.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true })
          );
        }
      }
    });
  }

  if (elements.chatMain) {
    elements.chatMain.addEventListener("click", (event) => {
      if (
        event.target.closest(".chat-header") ||
        event.target.closest(".chat-input")
      ) {
        return;
      }
      if (!isMobile()) {
        return;
      }
      if (elements.sidebar && elements.sidebar.classList.contains("open")) {
        hideSidebarMobile();
      }
    });
  }

  if (elements.chatHistory) {
    elements.chatHistory.addEventListener("click", (event) => {
      const regenerateButton = event.target.closest(
        '.action-button[data-action="regenerate"]'
      );
      if (regenerateButton) {
        const messageNode = regenerateButton.closest(".message");
        const previousUser = findPreviousMessage(messageNode, ".message.user");
        const prompt = String(previousUser?.dataset.raw || "").trim();

        // 取上一条 assistant 消息的 messageId 作为 /back 目标；
        // 若 assistant 无 id（如占位补齐的消息），回退到上一条 user 消息的 id（按 back 按钮逻辑）
        const previousAssistant = findPreviousMessage(
          messageNode,
          ".message.assistant"
        );
        let backMessageId = Number(previousAssistant?.dataset.messageId);
        if (!Number.isFinite(backMessageId)) {
          backMessageId = Number(previousUser?.dataset.messageId);
        }

        if (!prompt || !Number.isFinite(backMessageId)) {
          showToast("无法重新生成该消息");
          return;
        }
        openRegenerateModal(prompt, backMessageId);
        return;
      }

      const backButton = event.target.closest(
        '.action-button[data-action="back"]'
      );
      if (backButton) {
        const messageNode = backButton.closest(".message");
        let messageId = Number(messageNode?.dataset.messageId);
        if (!Number.isFinite(messageId)) {
          // 当前消息无 id，向上查找最近的一个 user 消息的 id 作为回溯目标
          const previousUser = findPreviousMessage(
            messageNode,
            ".message.user"
          );
          messageId = Number(previousUser?.dataset.messageId);
          if (!Number.isFinite(messageId)) {
            showToast("无法回溯该消息");
            return;
          }
        }
        openBackModal(messageId);
        return;
      }

      const target = event.target.closest(".code-copy");
      if (!target) {
        return;
      }
      const encoded = target.dataset.code || "";
      let decoded = encoded;
      try {
        decoded = decodeURIComponent(encoded);
      } catch (error) {
        decoded = encoded;
      }
      copyToClipboard(decoded);
    });
  }

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      setMenuDisabled(false);
    }
  });

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("llm.token");
      localStorage.removeItem("llm.userId");
      localStorage.removeItem("llm.userName");
      window.location.href = "/token_check/token_check.html";
    });
  }

  if (elements.savePromptBtn) {
    elements.savePromptBtn.addEventListener("click", () => {
      saveSystemPrompt();
    });
  }

  if (elements.modelSelect) {
    elements.modelSelect.addEventListener("change", () => {
      state.model = elements.modelSelect.value;
    });
    const triggerFetch = () => {
      if (!state.isNewChat) {
        return;
      }
      fetchModelsIfAllowed();
    };
    elements.modelSelect.addEventListener("focus", triggerFetch);
    elements.modelSelect.addEventListener("mousedown", triggerFetch);
  }

  if (elements.chatForm) {
    elements.chatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const prompt = elements.promptInput.value;
      await sendPromptFromUI(prompt);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const modals = document.querySelectorAll(".modal[hidden]");
      if (!modals.length) {
        toggleModal(elements.settingsModal, false);
      }
    }
  });
}

export { initEvents };
