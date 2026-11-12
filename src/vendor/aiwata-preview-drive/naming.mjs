// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-act/naming.ts; run node scripts/sync-browser-drive.mjs to update.
function namingKit(doc) {
  const cssEscape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
  const clamp = (text, max) => text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
  const labelOf = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria) {
      return clamp(aria, 80);
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    const labelled = labelledBy ? doc.getElementById(labelledBy) : null;
    const text = ((labelled || el).textContent || "").trim().replace(/\s+/g, " ");
    if (text) {
      return clamp(text, 80);
    }
    for (const attr of ["placeholder", "title", "alt", "name", "value"]) {
      const value = el.getAttribute(attr);
      if (value) {
        return clamp(value, 80);
      }
    }
    return "";
  };
  const stableOf = (el) => el.id || el.getAttribute("data-testid") || el.getAttribute("name") || el.getAttribute("aria-label") || "";
  const stemOf = (role) => {
    if (role === "button" || role === "summary") {
      return "btn";
    }
    if (role === "a" || role === "link") {
      return "lnk";
    }
    if (role === "input:search" || role === "searchbox") {
      return "srch";
    }
    if (role === "input:checkbox" || role === "checkbox") {
      return "chk";
    }
    if (role === "input:radio" || role === "radio") {
      return "rdo";
    }
    if (role === "select" || role === "combobox") {
      return "sel";
    }
    if (role === "textarea") {
      return "txt";
    }
    if (role === "switch") {
      return "sw";
    }
    if (role === "tab" || role === "menuitem" || role === "option") {
      return role === "menuitem" ? "mi" : role === "option" ? "opt" : "tab";
    }
    return role.indexOf("input") === 0 || role === "textbox" ? "inp" : "el";
  };
  const slug = (name) => {
    let out = "";
    let dash = false;
    for (let i = 0; i < name.length && out.length < 24; i++) {
      const ch = name[i];
      if (/[a-zA-Z0-9]/.test(ch)) {
        out += ch.toLowerCase();
        dash = false;
      } else if (!dash && out) {
        out += "-";
        dash = true;
      }
    }
    return out.replace(/-+$/, "");
  };
  const anchorOf = (el) => {
    const near = el.closest(
      'main,nav,header,footer,aside,[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],[role="search"],form[aria-label],section[aria-label]'
    );
    if (!near) {
      return "root";
    }
    const named = near.getAttribute("aria-label") || "";
    return near.tagName.toLowerCase() + (named ? "#" + slug(named) : "");
  };
  const selectorFor = (el) => {
    if (el.id) {
      return "#" + cssEscape(el.id);
    }
    const testId = el.getAttribute("data-testid");
    return testId ? '[data-testid="' + cssEscape(testId) + '"]' : "";
  };
  const valueOf = (el) => {
    const control = el;
    const kind = (control.type || "").toLowerCase();
    if (kind === "checkbox" || kind === "radio") {
      return control.checked ? "checked" : "unchecked";
    }
    const role = el.getAttribute("role") || "";
    if (role === "checkbox" || role === "radio" || role === "switch") {
      return el.getAttribute("aria-checked") === "true" ? "checked" : "unchecked";
    }
    if (typeof control.value === "string" && control.value) {
      return clamp(control.value, 60);
    }
    return "";
  };
  return { anchorOf, clamp, cssEscape, labelOf, selectorFor, slug, stableOf, stemOf, valueOf };
}
export {
  namingKit
};
