function setStatus(text) {
  elements.statusText.textContent = text;
}

function setSendButtonState(loading) {
  if (!elements.sendBtn) {
    return;
  }
  const icon = elements.sendBtn.querySelector("img");
  if (icon) {
    icon.src = loading ? SEND_ICONS.loading : SEND_ICONS.send;
  }
  elements.sendBtn.disabled = loading;
}

function isMobile() {
  return window.innerWidth < 800;
}

function showToast(message, variant = "error") {
  if (!elements.toast) {
    return;
  }
  elements.toast.textContent = message;
  elements.toast.classList.remove("success");
  if (variant === "success") {
    elements.toast.classList.add("success");
  }
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

async function copyToClipboard(text) {
  if (!text) {
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    showToast("已复制", "success");
  } catch (error) {
    showToast("复制失败");
  }
}

function markActionDone(button) {
  if (!button) {
    return;
  }
  const img = button.querySelector("img");
  if (!button.dataset.icon && img) {
    button.dataset.icon = img.src;
  }
  button.disabled = true;
  button.classList.add("action-button--done");
  if (img) {
    img.src = "resources/done.svg";
  }
  window.setTimeout(() => {
    button.disabled = false;
    button.classList.remove("action-button--done");
    if (img && button.dataset.icon) {
      img.src = button.dataset.icon;
    }
  }, 1000);
}

function toggleModal(modal, show) {
  if (!modal) {
    return;
  }
  modal.hidden = !show;
}

function normalizeHistoryTimestamp(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return trimmed.length <= 10 ? numeric * 1000 : numeric;
      }
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function sortHistoryByTime(items) {
  items.sort((a, b) =>
    normalizeHistoryTimestamp(b?.last_edit_time) -
      normalizeHistoryTimestamp(a?.last_edit_time)
  );
}

function formatSummary(item) {
  return item.title || item.summary || "(no title)";
}

function handleInvalidUserId() {
  localStorage.removeItem(STORAGE_KEYS.userId);
  localStorage.removeItem(STORAGE_KEYS.token);
  alert("出了一些错误，联系管理员");
  console.error("invalid user_id in index");
  window.location.href = "/login/login.html";
}

function handleInvalidConversationId() {
  localStorage.removeItem(STORAGE_KEYS.userId);
  localStorage.removeItem(STORAGE_KEYS.token);
  alert("出现错误，请联系管理员");
  console.error("error: invalid conversation_id");
  window.location.href = "/login/login.html";
}