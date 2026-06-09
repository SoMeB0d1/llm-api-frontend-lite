/**
 * sidebar.js — 侧边栏控制模块
 *
 * 管理侧边栏的展开/折叠动画与状态切换：
 *   - collapseSidebarDesktop / expandSidebarDesktop：桌面端折叠/展开
 *   - showSidebarMobile / hideSidebarMobile：移动端弹出/收起
 *   - setMenuDisabled：控制菜单按钮的禁用状态
 *   - onSidebarTransitionEnd：封装过渡动画结束回调
 */

import { elements } from "./elements.js";
import { SIDEBAR_ICONS } from "./constants.js";
import { isMobile } from "./ui.js";

/** 标记侧边栏是否正在执行 CSS 过渡动画 */
function setSidebarAnimating(animating) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-animating", animating);
}

/** 设置桌面端侧边栏的折叠状态 class */
function setSidebarCollapsed(collapsed) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-collapsed", collapsed);
}

/** 标记侧边栏准备工作已完成（用于桌面端折叠前预留空间） */
function setSidebarCollapsedReady(ready) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-collapsed-ready", ready);
}

/** 设置移动端侧边栏遮罩层是否展开 */
function setSidebarOpenMobile(open) {
  if (!elements.app) {
    return;
  }
  elements.app.classList.toggle("sidebar-open", open);
}

/** 控制菜单按钮是否可点击 */
function setMenuDisabled(disabled) {
  if (!elements.menuBtn) {
    return;
  }
  elements.menuBtn.disabled = disabled;
}

/** 在侧边栏 CSS 过渡动画结束时执行回调（最多等待 450ms） */
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

/** 桌面端折叠侧边栏：添加折叠 class → 等待过渡结束 → 更新图标 */
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

/** 桌面端展开侧边栏：移除折叠 class → 等待过渡结束 → 更新图标 */
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

/** 移动端弹出侧边栏：禁用菜单按钮 → 播放打开动画 */
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

/** 移动端收起侧边栏：播放关闭动画 → 恢复菜单按钮 */
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
