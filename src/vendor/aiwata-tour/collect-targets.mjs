// Native AIWATA source; see provenance.json.
function collectTourTargets(doc, max) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const cssEscape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
  const labelOf = (el) => {
    for (const attr of ["aria-label", "title", "alt", "placeholder"]) {
      const value = el.getAttribute(attr);
      if (value) {
        return value;
      }
    }
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    return text.length > 80 ? text.slice(0, 77) + "\u2026" : text;
  };
  const stableSelector = (el) => {
    const dataTour = el.getAttribute("data-tour");
    if (dataTour) {
      return '[data-tour="' + cssEscape(dataTour) + '"]';
    }
    if (el.id) {
      return "#" + cssEscape(el.id);
    }
    const testId = el.getAttribute("data-testid");
    if (testId) {
      return '[data-testid="' + cssEscape(testId) + '"]';
    }
    const aria = el.getAttribute("aria-label");
    const byAria = aria ? el.tagName.toLowerCase() + '[aria-label="' + cssEscape(aria) + '"]' : "";
    return byAria && doc.querySelectorAll(byAria).length === 1 ? byAria : "";
  };
  const positionalSelector = (el) => {
    const path = [];
    let node = el;
    while (node && node !== doc.body && path.length < 8) {
      if (node.id) {
        path.unshift("#" + cssEscape(node.id));
        break;
      }
      const parent = node.parentElement;
      const index = parent ? Array.prototype.indexOf.call(parent.children, node) : -1;
      path.unshift(node.tagName.toLowerCase() + (index >= 0 ? ":nth-child(" + (index + 1) + ")" : ""));
      node = parent;
    }
    return path.join(" > ");
  };
  const visible = (el) => {
    if (el.closest("[data-pane-hidden]")) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      return false;
    }
    const win = doc.defaultView;
    return !win || rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth;
  };
  const push = (el) => {
    if (results.length >= max || seen.has(el) || !visible(el)) {
      return;
    }
    const label = labelOf(el);
    if (!label) {
      return;
    }
    const stable = stableSelector(el);
    const selector = stable || positionalSelector(el);
    if (!selector || doc.querySelector(selector) !== el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    seen.add(el);
    results.push({
      label,
      rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
      role: el.getAttribute("role") || el.tagName.toLowerCase(),
      selector,
      stable: !!stable
    });
  };
  for (const el of doc.querySelectorAll("[data-tour]")) {
    push(el);
  }
  for (const el of doc.querySelectorAll("nav, main, aside, header, footer, [role], h1, h2, h3")) {
    push(el);
  }
  for (const el of doc.querySelectorAll("a[href], button, input, select, textarea, [tabindex], [aria-label]")) {
    push(el);
  }
  return results.sort((a, b) => Number(b.stable) - Number(a.stable));
}
export {
  collectTourTargets
};
