import { elements } from "./elements.js";
import { SEND_ICONS } from "./constants.js";

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

function toggleModal(modal, show) {
  if (!modal) {
    return;
  }
  modal.hidden = !show;
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

export {
  setStatus,
  setSendButtonState,
  isMobile,
  showToast,
  toggleModal,
  copyToClipboard,
  markActionDone,
};
