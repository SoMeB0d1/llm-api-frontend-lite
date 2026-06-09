/**
 * app.js — 应用入口模块
 *
 * 在页面加载时执行 bootstrap() 初始化流程：
 *   1. 从 localStorage 恢复用户状态（token、userId、baseUrl 等）
 *   2. 同步 UI（用户名显示、系统提示词输入框）
 *   3. 绑定全局事件
 *   4. 校验 token → 通过后拉取模型列表与历史记录 → 失败则跳转登录页
 */

import { elements } from "./elements.js";
import {
  loadStoredState,
  setBaseUrl,
  setUserId,
  syncSystemPromptInputState,
  state,
} from "./state.js";
import { toggleModal } from "./ui.js";
import { applyRootSettingsVisibility } from "./settings.js";
import { initEvents } from "./events.js";
import { fetchModelsIfAllowed, loadHistory, validateToken } from "./api.js";

/** 应用引导函数：按顺序执行全部初始化步骤 */
async function bootstrap() {
  loadStoredState();
  setUserId(state.userId, state.userName);
  syncSystemPromptInputState();
  toggleModal(elements.settingsModal, false);
  applyRootSettingsVisibility();
  setBaseUrl(state.baseUrl);
  initEvents();
  const isValid = await validateToken();
  if (isValid) {
    fetchModelsIfAllowed();
    loadHistory();
    return;
  }
  window.location.href = "/login/login.html";
}

bootstrap();