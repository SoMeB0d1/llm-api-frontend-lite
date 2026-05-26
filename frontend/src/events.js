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

function initEvents() {
  let pendingBackMessageId = null;

  const closeBackModal = () => {
    pendingBackMessageId = null;
    if (elements.backModal) {
      elements.backModal.dataset.messageId = "";
    }
    toggleModal(elements.backModal, false);
  };

  const openBackModal = (messageId) => {
    pendingBackMessageId = messageId;
    if (elements.backModal) {
      elements.backModal.dataset.messageId = String(messageId);
    }
    toggleModal(elements.backModal, true);
  };
  if (elements.menuBtn) {
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

  if (elements.backCancelBtn) {
    elements.backCancelBtn.addEventListener("click", () => {
      closeBackModal();
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
        closeBackModal();
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
      const backButton = event.target.closest(
        '.action-button[data-action="back"]'
      );
      if (backButton) {
        const messageNode = backButton.closest(".message");
        const messageId = Number(messageNode?.dataset.messageId);
        if (!Number.isFinite(messageId)) {
          showToast("无法回溯该消息");
          return;
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
      const prompt = elements.promptInput.value.trim();
      if (!prompt) {
        showToast("输入内容不能为空");
        return;
      }
      if (state.isNewChat) {
        setNewChatState(false);
      }
      setSendButtonState(true);
      renderMessage("user", prompt);
      elements.promptInput.value = "";
      const placeholder = renderMessage("assistant", "...");
      try {
        const answer = await sendMessage(prompt, placeholder);
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
