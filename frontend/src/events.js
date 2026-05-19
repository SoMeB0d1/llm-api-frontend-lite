function attachEvents() {
  // 新建聊天按钮
  elements.newChatBtn?.addEventListener("click", () => {
    const items = elements.chatHistory.querySelectorAll(".message");
    if (isMobile()) {
      hideSidebarMobile();
    }
    if (!items.length) {
      return;
    }
    if (!window.confirm("确定要开始新的对话吗？")) {
      return;
    }
    elements.chatHistory.innerHTML = "";
    state.conversationId = -1;
    setNewChatState(true);
  });

  // 发送按钮
  elements.sendBtn?.addEventListener("click", sendMessage);

  // 输入框回车发送
  elements.chatInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // 模型选择
  elements.modelSelect?.addEventListener("change", () => {
    state.model = elements.modelSelect.value;
  });

  // 隐藏/显示侧边栏按钮
  elements.hideSidebarBtn?.addEventListener("click", () => {
    if (isMobile()) {
      hideSidebarMobile();
      return;
    }
    if (elements.app?.classList.contains("sidebar-collapsed")) {
      expandSidebarDesktop();
    } else {
      collapseSidebarDesktop();
    }
  });

  // 移动端菜单按钮
  elements.menuBtn?.addEventListener("click", () => {
    if (!isMobile()) {
      return;
    }
    if (elements.app?.classList.contains("sidebar-open")) {
      hideSidebarMobile();
    } else {
      showSidebarMobile();
    }
  });

  // 设置按钮 -> 弹出设置弹窗
  elements.settingsBtn?.addEventListener("click", () => {
    if (elements.settingsModal) {
      toggleModal(elements.settingsModal, true);
    }
  });

  // 设置弹窗关闭按钮
  elements.settingsClose?.addEventListener("click", () => {
    toggleModal(elements.settingsModal, false);
  });

  // API 基础 URL 设置
  elements.apiBaseUrl?.addEventListener("change", () => {
    const raw = elements.apiBaseUrl.value.trim();
    const url = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    setBaseUrl(url);
  });

  // 点击弹窗背景关闭
  elements.settingsModal?.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) {
      toggleModal(elements.settingsModal, false);
    }
  });

  // 窗口大小变化
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      hideSidebarMobile();
      setMenuDisabled(false);
    }
  });

  // 模态框关闭 (ESC)
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const modals = document.querySelectorAll(".modal[hidden]");
      if (!modals.length) {
        toggleModal(elements.settingsModal, false);
      }
    }
  });
}

async function sendMessage() {
  const prompt = elements.chatInput?.value.trim();
  if (!prompt) {
    return;
  }
  if (!(await ensureToken())) {
    return;
  }

  if (isMobile()) {
    hideSidebarMobile();
  }

  elements.chatInput.value = "";
  renderMessage("user", prompt);
  setStatus("Thinking...");
  setSendButtonState(true);

  const placeholder = renderMessage("assistant", "...");
  setMessagePrompt(placeholder, prompt);

  try {
    const answer = await sendPrompt(prompt);
    if (state.isNewChat) {
      setNewChatState(false);
    }
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
    setStatus("Ready");
    await loadConversationTopics();
  } catch (error) {
    placeholder.textContent = "Request failed.";
    setStatus("Request failed");
  } finally {
    setSendButtonState(false);
  }
}