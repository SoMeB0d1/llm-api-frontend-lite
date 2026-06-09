/**
 * constants.js — 全局常量模块
 *
 * 集中管理应用中的魔法数字和字符串常量：
 *   - SIDEBAR_ICONS：侧边栏展开/折叠图标路径
 *   - SEND_ICONS：发送按钮正常/loading 图标路径
 *   - STORAGE_KEYS：localStorage 键名
 *   - MAX_CONVERSATION_ID：对话 ID 上限
 *   - DEFAULT_SYSTEM_PROMPT：默认系统提示词
 */

export const SIDEBAR_ICONS = {
  hide: "resources/hide.svg",
  show: "resources/show.svg",
};

export const SEND_ICONS = {
  send: "resources/send.svg",
  loading: "resources/loading.svg",
};

export const STORAGE_KEYS = {
  token: "llm.token",
  userId: "llm.userId",
  userName: "llm.userName",
  baseUrl: "llm.baseUrl",
  history: "llm.history",
};

export const MAX_CONVERSATION_ID = 4095;
export const DEFAULT_SYSTEM_PROMPT = "You are an assistant. ";
