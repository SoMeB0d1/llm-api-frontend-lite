import { elements } from "./elements.js";
import { SIDEBAR_ICONS } from "./constants.js";
import { isMobile } from "./ui.js";

function setSidebarAnimating(animating) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-animating", animating);
}

function setSidebarCollapsed(collapsed) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-collapsed", collapsed);
}

function setSidebarCollapsedReady(ready) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-collapsed-ready", ready);
}

function setSidebarOpenMobile(open) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-open", open);
}

function setMenuDisabled(disabled) {
  if (!elements.menuBtn) {
    return;
  }
  elements.menuBtn.disabled = disabled;
}

function onSidebarTransitionEnd(callback) {
  if (!elements.sidebar) {
    callback();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    elements.sidebar.removeEventListener("transitionend", onEnd);
    callback();
  };
  const onEnd = (event) => {
    if (event.target !== elements.sidebar) {
      return;
    }
    finish();
  };
  elements.sidebar.addEventListener("transitionend", onEnd);
  window.setTimeout(finish, 450);
}

function collapseSidebarDesktop() {
  if (isMobile()) {
    return;
  }
  if (elements.app && elements.app.classList.contains("sidebar-collapsed")) {
    return;
  }
  setSidebarCollapsedReady(true);
  setSidebarAnimating(true);
  setSidebarCollapsed(true);
  onSidebarTransitionEnd(() => {
    const icon = elements.hideSidebarBtn?.querySelector("img");
    if (icon) {
      icon.src = SIDEBAR_ICONS.show;
    }
    setSidebarAnimating(false);
  });
}

function expandSidebarDesktop() {
  if (isMobile()) {
    return;
  }
  if (elements.app && !elements.app.classList.contains("sidebar-collapsed")) {
    return;
  }
  setSidebarAnimating(true);
  setSidebarCollapsed(false);
  onSidebarTransitionEnd(() => {
    setSidebarCollapsedReady(false);
    const icon = elements.hideSidebarBtn?.querySelector("img");
    if (icon) {
      icon.src = SIDEBAR_ICONS.hide;
    }
    setSidebarAnimating(false);
  });
}

function showSidebarMobile() {
  if (!elements.sidebar) {
    return;
  }
  setMenuDisabled(true);
  setSidebarAnimating(true);
  elements.sidebar.classList.add("open");
  setSidebarOpenMobile(true);
  onSidebarTransitionEnd(() => {
    setSidebarAnimating(false);
  });
}

function hideSidebarMobile() {
  if (!elements.sidebar) {
    return;
  }
  setSidebarAnimating(true);
  setMenuDisabled(true);
  elements.sidebar.classList.remove("open");
  setSidebarOpenMobile(false);
  onSidebarTransitionEnd(() => {
    setSidebarAnimating(false);
    setMenuDisabled(false);
  });
}

export {
  collapseSidebarDesktop,
  expandSidebarDesktop,
  showSidebarMobile,
  hideSidebarMobile,
  setMenuDisabled,
};
