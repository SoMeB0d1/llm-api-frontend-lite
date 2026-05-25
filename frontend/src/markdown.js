let markedReady = false;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function renderMarkdown(text) {
  if (window.marked) {
    setupMarkedRenderer();
    return window.marked.parse(text, { breaks: true });
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderPlainText(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export { renderMarkdown, renderPlainText };
