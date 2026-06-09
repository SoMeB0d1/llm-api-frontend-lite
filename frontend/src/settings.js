/**
 * settings.js — 设置模块
 *
 * 管理系统提示词和设置的 UI 交互：
 *   - saveSystemPrompt：保存用户自定义系统提示词到 state
 *   - getSystemPromptForNewConversation：获取新对话时应使用的系统提示词
 *   - isRootUser：判断当前用户是否为 root 管理员
 *   - applyRootSettingsVisibility：根据用户身份显示/隐藏 root Tab
 *   - switchSettingsTab：切换设置弹窗中的 Tab（model / root）
 */

import { elements } from "./elements.js";
import { state } from "./state.js";
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from "./constants.js";
import { showToast } from "./ui.js";

/** 保存系统提示词：校验非空后写入 state.systemPromptApplied，回写输入框 */
function saveSystemPrompt() {
  const previousPrompt = state.systemPromptApplied || DEFAULT_SYSTEM_PROMPT;
  const nextPrompt = elements.systemPromptInput?.value?.trim() || "";
  if (!nextPrompt) {
    showToast("Prompt 不能为空");
    if (elements.systemPromptInput) {
      elements.systemPromptInput.value = previousPrompt;
    }
    return false;
  }
  state.systemPromptApplied = nextPrompt;
  if (elements.systemPromptInput) {
    elements.systemPromptInput.value = nextPrompt;
  }
  showToast("Prompt 已保存", "success");
  return true;
}

/** 获取新对话时使用的系统提示词（用户自定义 > 默认） */
function getSystemPromptForNewConversation() {
  return state.systemPromptApplied || DEFAULT_SYSTEM_PROMPT;
}

/** 判断当前用户是否为 root 管理员 */
function isRootUser() {
  const storedUserName = localStorage.getItem(STORAGE_KEYS.userName) || "";
  return String(storedUserName).toLowerCase() === "root";
}

/** 根据用户身份控制设置弹窗中 root Tab 和面板的可见性 */
function applyRootSettingsVisibility() {
  const canSeeRoot = isRootUser();
  if (elements.settingsTabRoot) {
    elements.settingsTabRoot.hidden = !canSeeRoot;
  }
  if (elements.settingsPanelRoot) {
    elements.settingsPanelRoot.hidden = !canSeeRoot;
  }
  if (!canSeeRoot) {
    switchSettingsTab("model");
  }
}

/**
 * 切换设置弹窗中的激活 Tab
 * 非 root 用户无法切换到 root Tab
 * @param {string} tabName "model" | "root"
 */
function switchSettingsTab(tabName) {
  const isRootTab = tabName === "root";
  const canSeeRoot = isRootUser();
  const resolvedTab = isRootTab && canSeeRoot ? "root" : "model";

  if (elements.settingsTabModel) {
    elements.settingsTabModel.classList.toggle(
      "is-active",
      resolvedTab === "model"
    );
  }
  if (elements.settingsTabRoot) {
    elements.settingsTabRoot.classList.toggle(
      "is-active",
      resolvedTab === "root"
    );
  }
  if (elements.settingsPanelModel) {
    elements.settingsPanelModel.classList.toggle(
      "is-active",
      resolvedTab === "model"
    );
  }
  if (elements.settingsPanelRoot) {
    elements.settingsPanelRoot.classList.toggle(
      "is-active",
      resolvedTab === "root"
    );
  }
}

export {
  saveSystemPrompt,
  getSystemPromptForNewConversation,
  isRootUser,
  applyRootSettingsVisibility,
  switchSettingsTab,
};
