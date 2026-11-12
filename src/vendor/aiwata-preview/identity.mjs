// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-annotate/identity.ts; run node scripts/sync-browser-annotations.mjs to update.
import { ANNOTATE_CSS_KEYS, ANNOTATE_HTML_BUDGET } from "./tokens.mjs";
const MAX_TEXT = 80;
const MAX_SELECTOR = 180;
const MAX_CSS_VALUE = 80;
const SEMANTIC_TAGS = /* @__PURE__ */ new Set([
  "a",
  "button",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "input",
  "label",
  "select",
  "textarea"
]);
function clip(value, max) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}\u2026`;
}
function clipHtml(value) {
  return clip(value, ANNOTATE_HTML_BUDGET);
}
function compactIdentity(snapshot) {
  const css = {};
  for (const key of ANNOTATE_CSS_KEYS) {
    const raw = snapshot.css[key] || snapshot.css[key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())];
    if (!raw || raw === "normal" || raw === "none" || raw === "auto" || raw === "0px") {
      continue;
    }
    css[key] = clip(raw, MAX_CSS_VALUE);
  }
  const tag = (snapshot.tag || "div").toLowerCase();
  const selector = clip(snapshot.selector || tag, MAX_SELECTOR);
  const text = clip(snapshot.text || "", MAX_TEXT);
  const html = clipHtml(snapshot.html || "");
  return { css, html, selector, tag, text };
}
function formatIdentityLine(identity) {
  if (!identity.text) {
    return identity.selector || identity.tag;
  }
  const label = `"${identity.text}"`;
  return SEMANTIC_TAGS.has(identity.tag) ? `${identity.tag} ${label}` : label;
}
export {
  compactIdentity,
  formatIdentityLine
};
