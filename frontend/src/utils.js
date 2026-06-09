/**
 * utils.js — 工具函数模块
 *
 * 纯逻辑辅助函数：
 *   - formatSummary：提取历史条目的显示标题
 *   - normalizeHistoryTimestamp：将各种格式的时间戳转换为毫秒数值
 *   - sortHistoryByTime：按最后编辑时间降序排列历史记录
 *   - handleInvalidUserId：检测到无效 userId 时跳转登录页
 */

import { STORAGE_KEYS } from "./constants.js";

/** 提取历史条目的显示标题（title > summary > "(no title)"） */
function formatSummary(item) {
  return item.title || item.summary || "(no title)";
}

/** 将各种格式的历史时间戳转换为毫秒数值 */
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

/** 按最后编辑时间降序排列历史记录 */
function sortHistoryByTime(items) {
  items.sort(
    (a, b) =>
      normalizeHistoryTimestamp(b?.last_edit_time) -
      normalizeHistoryTimestamp(a?.last_edit_time)
  );
}

/** 检测到无效 userId 时清空凭据并跳转登录页 */
function handleInvalidUserId() {
  localStorage.removeItem(STORAGE_KEYS.userId);
  localStorage.removeItem(STORAGE_KEYS.token);
  alert("出了一些错误，联系管理员");
  console.error("invalid user_id in index");
  window.location.href = "/login/login.html";
}

export {
  formatSummary,
  normalizeHistoryTimestamp,
  sortHistoryByTime,
  handleInvalidUserId,
};
