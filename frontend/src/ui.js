/**
 * ui.js — 通用 UI 工具模块
 *
 * 提供与 DOM 无关的 UI 辅助函数：
 *   - setStatus：更新状态栏文本
 *   - setSendButtonState：切换发送按钮的 loading/正常状态
 *   - isMobile：判断当前是否为移动端视口 (< 800px)
 *   - showToast：显示临时消息提示（支持 error/success 变体）
 *   - toggleModal：显示/隐藏模态弹窗
 *   - copyToClipboard：复制文本到剪贴板（优先异步 API，回退 execCommand）
 *   - markActionDone：临时标记操作按钮为完成状态（1 秒自动恢复）
 */

import { elements } from "./elements.js";
import { SEND_ICONS } from "./constants.js";

/** 更新底部状态栏文本 */
function setStatus(text) {
  elements.statusText.textContent = text;
}

/** 切换发送按钮的 loading/正常状态（图标 + 禁用态） */
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

/** 判断当前是否为移动端视口（宽度 < 800px） */
function isMobile() {
  return window.innerWidth < 800;
}

/**
 * 显示临时消息提示
 * @param {string} message 消息文本
 * @param {string} [variant="error"] 样式变体："error" | "success"
 */
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

/**
 * 显示/隐藏模态弹窗
 * @param {HTMLElement} modal 弹窗元素
 * @param {boolean} show true 显示，false 隐藏
 */
function toggleModal(modal, show) {
  if (!modal) {
    return;
  }
  modal.hidden = !show;
}

/**
 * 复制文本到剪贴板（优先 navigator.clipboard，回退 execCommand）
 * 复制成功后显示 "已复制" toast
 */
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

/** 临时标记操作按钮为完成状态：图标变对勾 → 禁点 1 秒 → 恢复原状 */
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
