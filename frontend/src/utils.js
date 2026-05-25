import { STORAGE_KEYS } from "./constants.js";

function formatSummary(item) {
  return item.title || item.summary || "(no title)";
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
  items.sort(
    (a, b) =>
      normalizeHistoryTimestamp(b?.last_edit_time) -
      normalizeHistoryTimestamp(a?.last_edit_time)
  );
}

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
