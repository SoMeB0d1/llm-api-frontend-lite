/**
 * markdown.js — Markdown 渲染模块
 *
 * 提供文本到 HTML 的转换功能：
 *   - renderMarkdown：利用 marked 库渲染 Markdown（包括自定义代码块和复制按钮）
 *   - renderPlainText：仅做 HTML 转义 + 换行处理，不涉及 Markdown 语法
 *   - setupMarkedRenderer：配置 marked 渲染器（仅首次调用时执行）
 */

let markedReady = false;

/** HTML 字符转义，防止 XSS */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 初始化 marked 渲染器（仅一次），注册自定义代码块渲染 + 复制按钮 */
function setupMarkedRenderer() {
  if (markedReady || !window.marked) {
    return;
  }
  const renderer = new window.marked.Renderer();
  renderer.code = (code, infostring) => {
    let rawCode = code;
    let rawLang = infostring;
    if (rawCode && typeof rawCode === "object") {
      rawLang = rawCode.lang || rawCode.language || rawLang;
      rawCode = rawCode.text ?? "";
    }
    const langValue = typeof rawLang === "string" ? rawLang : "";
    const langLabel = langValue.trim().split(/\s+/)[0] || "text";
    const langClass = langLabel.replace(/[^a-z0-9_+-]/gi, "") || "text";
    const encoded = encodeURIComponent(String(rawCode ?? ""));
    return `
<div class="code-block">
  <div class="code-block__header">
    <span class="code-block__lang">${escapeHtml(langLabel)}</span>
    <button class="code-copy" type="button" data-code="${encoded}" aria-label="Copy code">Copy</button>
  </div>
  <pre><code class="language-${escapeHtml(langClass)}">${escapeHtml(String(rawCode ?? ""))}</code></pre>
</div>`;
  };
  const options = { gfm: true, breaks: true, renderer };
  if (typeof window.marked.use === "function") {
    window.marked.use(options);
  } else if (typeof window.marked.setOptions === "function") {
    window.marked.setOptions(options);
  }
  markedReady = true;
}

/**
 * 渲染 Markdown 文本为 HTML（需要 marked 库已加载）
 * 若 marked 不可用则回退为纯文本 HTML 转义
 */
function renderMarkdown(text) {
  if (window.marked) {
    setupMarkedRenderer();
    return window.marked.parse(text, { breaks: true });
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/** 渲染为纯文本 HTML（仅转义 + 换行，不解析 Markdown） */
function renderPlainText(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export { renderMarkdown, renderPlainText };
