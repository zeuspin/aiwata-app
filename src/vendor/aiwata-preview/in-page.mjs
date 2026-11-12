// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-annotate/in-page.ts; run node scripts/sync-browser-annotations.mjs to update.
const ANNOTATE_HOST_TAG = "hermes-annotate";
function annotateInPage(doc) {
  const win = doc.defaultView;
  const blue = "#2F80ED";
  const fill = "rgba(47, 128, 237, 0.14)";
  const markerSize = 22;
  const stroke = "2px";
  const cssKeys = [
    "color",
    "background-color",
    "font-size",
    "font-family",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "display",
    "position",
    "width",
    "height",
    "max-width",
    "padding",
    "margin",
    "border",
    "border-radius",
    "box-shadow",
    "opacity",
    "overflow",
    "z-index",
    "transform",
    "flex-direction",
    "gap",
    "grid-template-columns",
    "justify-content",
    "align-items"
  ];
  const htmlBudget = 600;
  let host = null;
  let shadow = null;
  let hoverBox = null;
  let draftBox = null;
  let marquee = null;
  let pinsLayer = null;
  let waiting = null;
  const queued = [];
  let drag = null;
  let areaForced = false;
  let liveDraft = null;
  let livePins = [];
  let raf = 0;
  let lastDraftKey = "";
  const style = (el, props) => {
    for (const name of Object.keys(props)) {
      el.style.setProperty(name, props[name]);
    }
  };
  const emit = (event) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(event);
      return;
    }
    queued.push(event);
  };
  const box = (el) => {
    const rect = el.getBoundingClientRect();
    return { height: rect.height, width: rect.width, x: rect.left, y: rect.top };
  };
  const pageOffset = () => {
    const scrolling = doc.scrollingElement || doc.documentElement;
    return {
      x: win?.scrollX ?? scrolling.scrollLeft ?? 0,
      y: win?.scrollY ?? scrolling.scrollTop ?? 0
    };
  };
  const cssEscape = (value) => {
    const CSS = win && win.CSS;
    if (CSS && CSS.escape) {
      return CSS.escape(value);
    }
    return value.replace(/([^\w-])/g, "\\$1");
  };
  const canScroll = (node, axis) => {
    if (!win) {
      return false;
    }
    const style2 = win.getComputedStyle(node);
    const overflow = axis === "y" ? style2.overflowY : style2.overflowX;
    const scrollable = overflow === "auto" || overflow === "scroll" || overflow === "overlay";
    if (!scrollable) {
      return false;
    }
    return axis === "y" ? node.scrollHeight > node.clientHeight + 1 : node.scrollWidth > node.clientWidth + 1;
  };
  const toPage = (rect) => {
    const offset = pageOffset();
    return { height: rect.height, width: rect.width, x: rect.x + offset.x, y: rect.y + offset.y };
  };
  const toView = (pageRect) => {
    const offset = pageOffset();
    return { height: pageRect.height, width: pageRect.width, x: pageRect.x - offset.x, y: pageRect.y - offset.y };
  };
  const viewOf = (track) => {
    if (track.el && track.el.isConnected) {
      return box(track.el);
    }
    return toView(track.page);
  };
  const cssPath = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      const tag = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`#${cssEscape(node.id)}`);
        break;
      }
      const cls = (node.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${cssEscape(name)}`).join("");
      let sel = tag + cls;
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
        if (same.length > 1) {
          sel += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      parts.unshift(sel);
      node = parent;
      if (node && (node === doc.documentElement || tag === "body")) {
        break;
      }
    }
    return parts.join(">");
  };
  const readCss = (el) => {
    const computed = win?.getComputedStyle(el);
    const out = {};
    if (!computed) {
      return out;
    }
    for (const key of cssKeys) {
      const value = computed.getPropertyValue(key).trim();
      if (!value || value === "normal" || value === "none" || value === "auto" || value === "0px") {
        continue;
      }
      out[key] = value.length > 80 ? `${value.slice(0, 79)}\u2026` : value;
    }
    return out;
  };
  const secretName = /key|token|secret|password|auth|session|credential/;
  const looksSecret = (value) => secretName.test(value.toLowerCase());
  const isSecretControl = (node) => {
    const tag = node.tagName.toLowerCase();
    const type = (node.getAttribute("type") || "").toLowerCase();
    if (tag === "input" && (type === "password" || type === "hidden")) {
      return true;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return looksSecret(node.getAttribute("name") || "") || looksSecret(node.id || "") || looksSecret(node.getAttribute("autocomplete") || "");
    }
    return node.hasAttribute("data-secret");
  };
  const clearControlValue = (node) => {
    const tag = node.tagName.toLowerCase();
    if (tag === "input" || tag === "select") {
      const field = node;
      field.value = "[redacted]";
      node.setAttribute("value", "[redacted]");
    }
    if (tag === "textarea") {
      const field = node;
      field.value = "[redacted]";
      node.textContent = "[redacted]";
    }
    if (node.hasAttribute("data-secret") && tag !== "input" && tag !== "textarea" && tag !== "select") {
      node.textContent = "[redacted]";
    }
  };
  const redactClone = (el) => {
    let clone;
    try {
      clone = el.cloneNode(true);
    } catch {
      return null;
    }
    const nodes = [clone];
    const nested = clone.querySelectorAll("*");
    for (let i = 0; i < nested.length; i++) {
      nodes.push(nested[i]);
    }
    for (const node of nodes) {
      const names = node.getAttributeNames();
      for (const name of names) {
        if (looksSecret(name)) {
          node.setAttribute(name, "[redacted]");
        }
      }
      if (isSecretControl(node)) {
        clearControlValue(node);
      }
    }
    return clone;
  };
  const budgetHtml = (html) => {
    if (html.length <= htmlBudget) {
      return html;
    }
    return `${html.slice(0, htmlBudget - 1)}\u2026`;
  };
  const identityOf = (el) => {
    const clone = redactClone(el);
    const html = clone ? budgetHtml(clone.outerHTML || "") : "";
    const text = ((clone ?? el).textContent || "").replace(/\s+/g, " ").trim();
    return {
      css: readCss(el),
      html,
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: text.length > 80 ? `${text.slice(0, 79)}\u2026` : text
    };
  };
  const underPoint = (x, y) => {
    if (!host) {
      return doc.elementFromPoint(x, y);
    }
    const previous = host.style.getPropertyValue("pointer-events");
    host.style.setProperty("pointer-events", "none");
    const hit = doc.elementFromPoint(x, y);
    host.style.setProperty("pointer-events", previous || "auto");
    if (!hit || hit === host || hit === doc.documentElement || hit === doc.body) {
      return null;
    }
    return hit;
  };
  const place = (el, rect) => {
    style(el, {
      height: `${Math.max(1, rect.height)}px`,
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${Math.max(1, rect.width)}px`
    });
  };
  const relocate = () => {
    for (let i = 0; i < livePins.length; i++) {
      const pin = livePins[i];
      if (pin.el && pin.el.isConnected) {
        pin.page = toPage(box(pin.el));
      }
      place(pin.wrap, viewOf(pin));
    }
    if (liveDraft && draftBox && draftBox.style.getPropertyValue("display") !== "none") {
      if (liveDraft.el && liveDraft.el.isConnected) {
        liveDraft.page = toPage(box(liveDraft.el));
      }
      const rect = viewOf(liveDraft);
      place(draftBox, rect);
      const key = [rect.x, rect.y, rect.width, rect.height].join(",");
      if (key !== lastDraftKey) {
        lastDraftKey = key;
        emit({ rect, type: "reposition" });
      }
    }
  };
  const loop = () => {
    if (!host || !host.isConnected) {
      raf = 0;
      return;
    }
    relocate();
    if (win) {
      raf = win.requestAnimationFrame(loop);
    }
  };
  const ensureLoop = () => {
    if (win && !raf) {
      raf = win.requestAnimationFrame(loop);
    }
  };
  const paintOutline = (el, heavy) => {
    style(el, {
      background: heavy ? fill : "transparent",
      border: `${stroke} solid ${blue}`,
      "border-radius": "4px",
      "box-shadow": heavy ? `0 0 0 1px ${blue}, 0 8px 24px rgba(15, 23, 42, 0.18)` : `0 0 0 1px ${blue}`,
      "box-sizing": "border-box",
      "pointer-events": "none",
      position: "fixed"
    });
  };
  const makeMarker = (number) => {
    const mark = doc.createElement("div");
    mark.setAttribute("data-annotate-marker", String(number));
    mark.textContent = String(number);
    style(mark, {
      "align-items": "center",
      background: blue,
      border: "2px solid #fff",
      "border-radius": "999px",
      "box-shadow": "0 2px 8px rgba(15, 23, 42, 0.28)",
      color: "#fff",
      display: "flex",
      "font-family": "-apple-system, 'Segoe UI', sans-serif",
      "font-size": "11px",
      "font-weight": "700",
      height: `${markerSize}px`,
      "justify-content": "center",
      left: `${-markerSize / 2}px`,
      "letter-spacing": "0",
      "line-height": "1",
      "pointer-events": "none",
      position: "absolute",
      top: `${-markerSize / 2}px`,
      width: `${markerSize}px`,
      "z-index": "2"
    });
    return mark;
  };
  const ensure = () => {
    if (host && shadow && hoverBox && draftBox && marquee && pinsLayer) {
      return;
    }
    const stale = doc.querySelectorAll("hermes-annotate");
    for (let i = 0; i < stale.length; i++) {
      stale[i].remove();
    }
    host = doc.createElement("hermes-annotate");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-annotate-host", "true");
    style(host, {
      background: "transparent",
      border: "0",
      cursor: "crosshair",
      display: "block",
      height: "100%",
      inset: "0",
      margin: "0",
      overflow: "visible",
      padding: "0",
      "pointer-events": "auto",
      position: "fixed",
      "user-select": "none",
      width: "100%",
      "z-index": "2147483000"
    });
    shadow = host.attachShadow({ mode: "open" });
    hoverBox = doc.createElement("div");
    hoverBox.setAttribute("data-annotate-outline", "hover");
    paintOutline(hoverBox, false);
    style(hoverBox, { display: "none", opacity: "0.85" });
    draftBox = doc.createElement("div");
    draftBox.setAttribute("data-annotate-outline", "draft");
    paintOutline(draftBox, true);
    style(draftBox, { display: "none" });
    draftBox.appendChild(makeMarker(1));
    marquee = doc.createElement("div");
    marquee.setAttribute("data-annotate-marquee", "true");
    style(marquee, {
      background: fill,
      border: `1.5px dashed ${blue}`,
      "border-radius": "2px",
      display: "none",
      "pointer-events": "none",
      position: "fixed"
    });
    pinsLayer = doc.createElement("div");
    style(pinsLayer, { inset: "0", "pointer-events": "none", position: "fixed" });
    shadow.appendChild(hoverBox);
    shadow.appendChild(draftBox);
    shadow.appendChild(marquee);
    shadow.appendChild(pinsLayer);
    doc.documentElement.appendChild(host);
  };
  const onMove = (event) => {
    if (!hoverBox) {
      return;
    }
    if (drag && marquee) {
      const x = Math.min(drag.x, event.clientX);
      const y = Math.min(drag.y, event.clientY);
      const width = Math.abs(event.clientX - drag.x);
      const height = Math.abs(event.clientY - drag.y);
      style(marquee, { display: "block" });
      place(marquee, { height, width, x, y });
      style(hoverBox, { display: "none" });
      return;
    }
    const hit = underPoint(event.clientX, event.clientY);
    if (!hit) {
      style(hoverBox, { display: "none" });
      return;
    }
    style(hoverBox, { display: "block" });
    place(hoverBox, box(hit));
  };
  const onDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drag = { x: event.clientX, y: event.clientY };
    areaForced = event.shiftKey;
  };
  const onUp = (event) => {
    if (!drag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const start = drag;
    drag = null;
    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    const isArea = areaForced || width > 8 || height > 8;
    areaForced = false;
    if (marquee) {
      style(marquee, { display: "none" });
    }
    if (isArea) {
      const rect2 = {
        height: Math.max(8, height),
        width: Math.max(8, width),
        x: Math.min(start.x, event.clientX),
        y: Math.min(start.y, event.clientY)
      };
      liveDraft = { el: null, page: toPage(rect2) };
      lastDraftKey = "";
      emit({ rect: rect2, type: "pick-area" });
      return;
    }
    const hit = underPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }
    const rect = box(hit);
    liveDraft = { el: hit, page: toPage(rect) };
    lastDraftKey = "";
    emit({ identity: identityOf(hit), rect, type: "pick-element" });
  };
  const onWheel = (event) => {
    event.preventDefault();
    host?.style.setProperty("pointer-events", "none");
    const under = doc.elementFromPoint(event.clientX, event.clientY);
    host?.style.setProperty("pointer-events", "auto");
    let scroller = under;
    while (scroller) {
      if (canScroll(scroller, "y") || canScroll(scroller, "x")) {
        scroller.scrollTop += event.deltaY;
        scroller.scrollLeft += event.deltaX;
        relocate();
        return;
      }
      scroller = scroller.parentElement;
    }
    if (win) {
      win.scrollBy(event.deltaX, event.deltaY);
    } else {
      const root = doc.scrollingElement || doc.documentElement;
      root.scrollTop += event.deltaY;
      root.scrollLeft += event.deltaX;
    }
    relocate();
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      emit({ type: "end" });
    }
  };
  const bind = () => {
    if (!host) {
      return;
    }
    host.addEventListener("mousedown", onDown, true);
    host.addEventListener("mousemove", onMove, true);
    host.addEventListener("mouseup", onUp, true);
    host.addEventListener("wheel", onWheel, { passive: false });
    win?.addEventListener("keydown", onKey, true);
    win?.addEventListener("scroll", relocate, true);
    win?.addEventListener("resize", relocate);
    doc.addEventListener("scroll", relocate, true);
    win?.visualViewport?.addEventListener("scroll", relocate);
    win?.visualViewport?.addEventListener("resize", relocate);
  };
  const unbind = () => {
    host?.removeEventListener("mousedown", onDown, true);
    host?.removeEventListener("mousemove", onMove, true);
    host?.removeEventListener("mouseup", onUp, true);
    host?.removeEventListener("wheel", onWheel);
    win?.removeEventListener("keydown", onKey, true);
    win?.removeEventListener("scroll", relocate, true);
    win?.removeEventListener("resize", relocate);
    doc.removeEventListener("scroll", relocate, true);
    win?.visualViewport?.removeEventListener("scroll", relocate);
    win?.visualViewport?.removeEventListener("resize", relocate);
    if (win && raf) {
      win.cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const showPins = (pins) => {
    ensure();
    if (!pinsLayer) {
      return;
    }
    const previous = livePins;
    pinsLayer.replaceChildren();
    livePins = [];
    for (const pin of pins) {
      let el = null;
      const old = previous.find((item) => item.number === pin.number);
      if (old && old.el && old.el.isConnected) {
        el = old.el;
      } else if (liveDraft && liveDraft.el && liveDraft.el.isConnected) {
        el = liveDraft.el;
      }
      if (!el && pin.selector) {
        try {
          el = doc.querySelector(pin.selector);
        } catch {
          el = null;
        }
      }
      const page = el ? toPage(box(el)) : pin.page || old?.page || toPage(pin.rect);
      const wrap = doc.createElement("div");
      wrap.setAttribute("data-annotate-pin", String(pin.number));
      paintOutline(wrap, true);
      place(wrap, el ? box(el) : toView(page));
      wrap.appendChild(makeMarker(pin.number));
      pinsLayer.appendChild(wrap);
      livePins.push({ el, number: pin.number, page, wrap });
    }
    liveDraft = null;
    lastDraftKey = "";
    ensureLoop();
  };
  const showDraft = (rect, number) => {
    ensure();
    if (!draftBox) {
      return;
    }
    if (!liveDraft) {
      liveDraft = { el: null, page: toPage(rect) };
    }
    draftBox.replaceChildren(makeMarker(number));
    style(draftBox, { display: "block" });
    place(draftBox, liveDraft.el && liveDraft.el.isConnected ? box(liveDraft.el) : viewOf(liveDraft));
    if (hoverBox) {
      style(hoverBox, { display: "none" });
    }
    ensureLoop();
  };
  const hideDraft = () => {
    liveDraft = null;
    lastDraftKey = "";
    if (draftBox) {
      style(draftBox, { display: "none" });
    }
  };
  const afterPaint = () => new Promise((resolve) => {
    if (!win) {
      resolve();
      return;
    }
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()));
  });
  const beginCapture = async () => {
    if (!host || !host.isConnected) {
      return false;
    }
    if (pinsLayer) {
      style(pinsLayer, { display: "none" });
    }
    if (hoverBox) {
      style(hoverBox, { display: "none" });
    }
    await afterPaint();
    return true;
  };
  const endCapture = () => {
    if (pinsLayer) {
      style(pinsLayer, { display: "block" });
    }
  };
  const teardown = () => {
    unbind();
    emit({ type: "end" });
    host?.remove();
    host = null;
    shadow = null;
    hoverBox = null;
    draftBox = null;
    marquee = null;
    pinsLayer = null;
    drag = null;
    liveDraft = null;
    livePins = [];
    waiting = null;
    queued.length = 0;
  };
  return {
    beginCapture,
    endCapture,
    getMarkerNumbers: () => {
      if (!shadow) {
        return [];
      }
      return Array.from(shadow.querySelectorAll("[data-annotate-pin] [data-annotate-marker]")).map(
        (node) => Number(node.getAttribute("data-annotate-marker") || "0")
      );
    },
    getOutlineColor: () => {
      const outline = shadow?.querySelector("[data-annotate-outline], [data-annotate-pin]");
      return outline?.style.getPropertyValue("border-color") || outline?.style.borderColor || blue;
    },
    hideDraft,
    install: () => {
      ensure();
      bind();
      ensureLoop();
    },
    isInstalled: () => Boolean(host && host.isConnected),
    relocate,
    showDraft,
    showPins,
    teardown,
    wait: () => {
      if (queued.length) {
        return Promise.resolve(queued.shift());
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    }
  };
}
function annotateInPageSource() {
  return `(${annotateInPage.toString()})(document)`;
}
export {
  ANNOTATE_HOST_TAG,
  annotateInPage,
  annotateInPageSource
};
