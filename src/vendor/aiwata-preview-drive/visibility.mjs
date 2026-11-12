// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-act/visibility.ts; run node scripts/sync-browser-drive.mjs to update.
function visibilityKit(doc, win) {
  const onScreen = (el) => {
    if (!win) {
      return false;
    }
    const box = el.getBoundingClientRect();
    if (box.right <= 0 || box.bottom <= 0 || box.left >= win.innerWidth || box.top >= win.innerHeight) {
      return false;
    }
    return !(box.width >= win.innerWidth * 0.95 && box.height >= win.innerHeight * 0.9);
  };
  const shown = (el) => {
    const seen = el.checkVisibility;
    if (typeof seen === "function" && !seen.call(el, { checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const style = win && win.getComputedStyle ? win.getComputedStyle(el) : null;
    if (style) {
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      if (style.clip && style.clip !== "auto" || (style.clipPath || "").indexOf("inset(50%") !== -1) {
        return false;
      }
    }
    return true;
  };
  const visible = (el) => {
    if (!shown(el)) {
      return false;
    }
    if (el.closest('[aria-hidden="true"], [inert]')) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.right <= 0 || rect.bottom <= 0) {
      return false;
    }
    if (rect.width < 3 || rect.height < 3) {
      return false;
    }
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    const under = doc.elementFromPoint;
    if (typeof under === "function" && win && midX >= 0 && midY >= 0 && midX < win.innerWidth && midY < win.innerHeight) {
      const over = under.call(doc, midX, midY);
      if (!over || !(over === el || el.contains(over) || over.contains(el))) {
        return false;
      }
    }
    return true;
  };
  return { onScreen, shown, visible };
}
export {
  visibilityKit
};
