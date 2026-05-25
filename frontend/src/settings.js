import { elements } from "./elements.js";
import { state } from "./state.js";
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from "./constants.js";
import { showToast } from "./ui.js";

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

function getSystemPromptForNewConversation() {
  return state.systemPromptApplied || DEFAULT_SYSTEM_PROMPT;
}

function isRootUser() {
  const storedUserName = localStorage.getItem(STORAGE_KEYS.userName) || "";
  return String(storedUserName).toLowerCase() === "root";
}

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
