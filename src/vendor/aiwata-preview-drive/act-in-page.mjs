// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-act/act-in-page.ts; run node scripts/sync-browser-drive.mjs to update.
import { identityKit } from "./identity.mjs";
import { namingKit } from "./naming.mjs";
import { visibilityKit } from "./visibility.mjs";
function buildActKit(doc) {
  const naming = namingKit(doc);
  return { identity: identityKit(naming), naming, visibility: visibilityKit(doc, doc.defaultView) };
}
function actInPage(doc, holder, action) {
  return actInPageCore(doc, holder, action, buildActKit(doc));
}
function actInPageCore(doc, holder, action, kit) {
  const { anchorOf, labelOf, selectorFor, stableOf, valueOf } = kit.naming;
  const { affinity, coin, shifted } = kit.identity;
  const { onScreen, visible } = kit.visibility;
  const maxElements = 120;
  const maxMarks = 600;
  const rebindBar = 0.6;
  const win = doc.defaultView;
  const here = doc.location ? doc.location.href : "";
  const still = !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const glide = still ? "auto" : "smooth";
  const sight = (max) => {
    const nodes = [];
    const field = [];
    const elements = [];
    const candidates = doc.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, label[for], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"], [role="combobox"], [role="searchbox"], [role="textbox"], [contenteditable=""], [contenteditable="true"], [onclick], [tabindex]:not([tabindex="-1"])'
    );
    for (const el2 of candidates) {
      if (elements.length >= max && field.length >= maxMarks) {
        break;
      }
      if (!visible(el2)) {
        continue;
      }
      if (field.length < maxMarks && onScreen(el2)) {
        field.push(el2);
      }
      if (elements.length >= max) {
        continue;
      }
      const tag = el2.tagName.toLowerCase();
      const role = el2.getAttribute("role") || (tag === "input" ? "input:" + (el2.type || "text") : tag);
      const label = labelOf(el2);
      const value = valueOf(el2);
      if (!label && !value) {
        continue;
      }
      const entry = {
        label,
        // Filled in by `survey`, which is what knows whether this element
        // already has a handle.
        ref: "",
        role
      };
      const selector = selectorFor(el2);
      if (selector) {
        entry.selector = selector;
      }
      if (el2.disabled) {
        entry.disabled = true;
      }
      if (value) {
        entry.value = value;
      }
      nodes.push(el2);
      elements.push(entry);
    }
    holder.nodes = nodes;
    holder.field = field;
    return { elements, nodes };
  };
  const survey = (max) => {
    const fresh = holder.url !== here;
    if (fresh) {
      holder.book = [];
      holder.coined = {};
    }
    const book = holder.book || (holder.book = []);
    const coined = holder.coined || (holder.coined = {});
    const seen = sight(max);
    const claimed = {};
    const kept = [];
    const added = [];
    const changed = [];
    const rebound = [];
    const known = /* @__PURE__ */ new Map();
    const waiting = [];
    let same = 0;
    for (const bound of book) {
      known.set(bound.el, bound);
    }
    for (let i = 0; i < seen.elements.length; i++) {
      const entry = seen.elements[i];
      const bound = known.get(seen.nodes[i]);
      if (!bound) {
        waiting.push(i);
        continue;
      }
      const moved = shifted(bound, entry);
      entry.ref = bound.ref;
      claimed[bound.ref] = true;
      kept.push(bound);
      if (!moved) {
        same++;
        continue;
      }
      bound.label = entry.label;
      bound.name = entry.label || entry.value || "";
      bound.off = !!entry.disabled;
      bound.value = entry.value || "";
      changed.push(moved);
    }
    const pool = book.filter((bound) => !claimed[bound.ref] && !doc.contains(bound.el));
    for (const i of waiting) {
      const entry = seen.elements[i];
      const el2 = seen.nodes[i];
      const now = {
        el: el2,
        label: entry.label,
        name: entry.label || entry.value || "",
        off: !!entry.disabled,
        path: anchorOf(el2),
        ref: "",
        role: entry.role,
        stable: stableOf(el2),
        value: entry.value || ""
      };
      let best;
      let score = 0;
      for (const bound of pool) {
        if (claimed[bound.ref]) {
          continue;
        }
        const rung = affinity(bound, now);
        if (rung >= rebindBar && rung > score) {
          best = bound;
          score = rung;
        }
      }
      if (best) {
        entry.ref = best.ref;
        best.el = el2;
        best.label = now.label;
        best.name = now.name;
        best.off = now.off;
        best.path = now.path;
        best.stable = now.stable;
        best.value = now.value;
        claimed[best.ref] = true;
        kept.push(best);
        rebound.push(best.ref);
        continue;
      }
      now.ref = coin(coined, entry.role, now.name);
      entry.ref = now.ref;
      claimed[now.ref] = true;
      kept.push(now);
      added.push(entry);
    }
    const removed = [];
    for (const bound of book) {
      if (claimed[bound.ref]) {
        continue;
      }
      if (doc.contains(bound.el) && visible(bound.el)) {
        kept.push(bound);
        continue;
      }
      removed.push(bound.ref);
    }
    holder.book = kept;
    holder.url = here;
    const churn = added.length + changed.length;
    if (fresh || action.full || churn * 2 >= seen.elements.length) {
      return { elements: seen.elements, success: true };
    }
    const delta = { same };
    if (added.length) {
      delta.added = added;
    }
    if (changed.length) {
      delta.changed = changed;
    }
    if (removed.length) {
      delta.removed = removed;
    }
    if (rebound.length) {
      delta.rebound = rebound;
    }
    return { delta, success: true };
  };
  const resolve = () => {
    const ref = (action.ref || "").trim();
    if (ref) {
      if (holder.url !== here) {
        return {
          error: "The page navigated since the last snapshot, so " + ref + " no longer points anywhere. Call elements again."
        };
      }
      const bound = (holder.book || []).filter((entry) => entry.ref === ref)[0];
      if (!bound) {
        return { error: "Unknown element " + ref + ". Call elements to get current refs." };
      }
      if (!doc.contains(bound.el)) {
        return { error: ref + " has been removed from the page since the last snapshot. Call elements again." };
      }
      return { el: bound.el };
    }
    const selector = (action.selector || "").trim();
    if (!selector) {
      return { error: "Pass a ref from elements, or a CSS selector." };
    }
    let el2 = null;
    try {
      el2 = doc.querySelector(selector);
    } catch {
      return { error: "Not a valid CSS selector: " + selector };
    }
    return el2 ? { el: el2 } : { error: "No element matches " + selector + "." };
  };
  const describe = (el2) => {
    const label = labelOf(el2);
    return el2.tagName.toLowerCase() + (label ? ' "' + label + '"' : "");
  };
  const answer = (result) => ({
    ...result,
    title: doc.title || "",
    url: doc.location ? doc.location.href : ""
  });
  const fail = (error) => answer({ error, success: false });
  const pointAt = (el2) => {
    const rect = el2.getBoundingClientRect();
    return { clientX: Math.round(rect.left + rect.width / 2), clientY: Math.round(rect.top + rect.height / 2) };
  };
  if (action.kind === "elements") {
    const looked = survey(Math.max(1, Math.min(action.max || maxElements, maxElements)));
    const empty = !looked.delta && !(looked.elements || []).length;
    return answer({
      ...looked,
      note: empty ? "No interactive elements found \u2014 the page may still be loading." : void 0
    });
  }
  if (action.kind === "scroll") {
    const target2 = action.ref || action.selector ? resolve() : {};
    if (target2.error) {
      return fail(target2.error);
    }
    const scroller = target2.el || null;
    const page = Math.round((win ? win.innerHeight : 800) * 0.9);
    const by = action.to === "top" ? -1e7 : action.to === "bottom" ? 1e7 : action.amount ?? page;
    if (scroller) {
      scroller.scrollBy({ behavior: glide, top: by });
    } else if (win) {
      win.scrollBy({ behavior: glide, top: by });
    }
    return answer({ acted: scroller ? "scrolled " + describe(scroller) : "scrolled the page", success: true });
  }
  const target = resolve();
  if (target.error || !target.el) {
    return fail(target.error || "No target.");
  }
  const el = target.el;
  holder.aimed = el;
  if (action.kind === "locate") {
    if (el.scrollIntoView) {
      el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    }
    if (action.focus) {
      el.focus();
    }
    const spot = pointAt(el);
    const tag = el.tagName;
    return answer({
      acted: "looking at " + describe(el),
      point: { x: spot.clientX, y: spot.clientY },
      success: true,
      tag,
      // Real typing starts with a select-all to clear the field. On anything
      // that is not a field that gesture selects the paragraph under it
      // instead, which is how the agent ended up highlighting whole pages.
      typable: tag === "TEXTAREA" || tag === "INPUT" || el.isContentEditable === true
    });
  }
  if (el.scrollIntoView) {
    el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
  }
  if (action.kind === "hover") {
    const init = { bubbles: true, cancelable: true, ...pointAt(el) };
    if (typeof PointerEvent === "function") {
      el.dispatchEvent(new PointerEvent("pointerover", init));
      el.dispatchEvent(new PointerEvent("pointermove", init));
    }
    el.dispatchEvent(new MouseEvent("mouseover", init));
    el.dispatchEvent(new MouseEvent("mousemove", init));
    return answer({ acted: "hovered over " + describe(el), success: true });
  }
  if (el.disabled) {
    return fail(describe(el) + " is disabled.");
  }
  if (action.kind === "click") {
    const init = { bubbles: true, cancelable: true, ...pointAt(el) };
    if (typeof PointerEvent === "function") {
      el.dispatchEvent(new PointerEvent("pointerdown", init));
      el.dispatchEvent(new PointerEvent("pointerup", init));
    }
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.click();
    return answer({ acted: "clicked " + describe(el), success: true });
  }
  if (action.kind === "type") {
    const text = action.text ?? "";
    const editable = el.isContentEditable || (el.getAttribute("contenteditable") ?? "false") !== "false";
    el.focus();
    if (editable) {
      try {
        document.execCommand("insertText", false, text);
      } catch {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", { data: text, inputType: "insertText", bubbles: true }));
      }
    } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) {
        setter.call(el, text);
      } else {
        ;
        el.value = text;
      }
    } else if (el.tagName === "SELECT") {
      return fail(describe(el) + " is a dropdown \u2014 click it and click the option you want.");
    } else {
      return fail(describe(el) + " is not a text field.");
    }
    el.dispatchEvent(new InputEvent("input", { data: text, inputType: "insertText", bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (action.submit) {
      const enter = {
        bubbles: true,
        cancelable: true,
        code: "Enter",
        key: "Enter",
        keyCode: 13,
        which: 13
      };
      el.dispatchEvent(new KeyboardEvent("keydown", enter));
      el.dispatchEvent(new KeyboardEvent("keyup", enter));
      const form = el.form;
      if (form) {
        if (form.requestSubmit) {
          form.requestSubmit();
        } else {
          form.submit();
        }
      }
    }
    return answer({ acted: "typed into " + describe(el) + (action.submit ? " and submitted" : ""), success: true });
  }
  if (action.kind === "press") {
    const key = action.key || "";
    if (!key) {
      return fail('Pass the key to press, e.g. "Enter" or "Escape".');
    }
    const root = el.tagName === "BODY" || el.tagName === "HTML";
    if (key.length === 1 && root && action.allowShortcut !== true) {
      return fail(
        "Refused to press a printable key on " + el.tagName + ". That would be a page shortcut; pass allowShortcut to opt in."
      );
    }
    const init = { bubbles: true, cancelable: true, code: key.length === 1 ? "Key" + key.toUpperCase() : key, key };
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
    return answer({ acted: "pressed " + key + " on " + describe(el), success: true });
  }
  return fail("Unknown action: " + String(action.kind));
}
function actEngineSource() {
  return `(function (doc, holder, action) {
  var naming = (${namingKit.toString()})(doc);
  var kit = {
    naming: naming,
    identity: (${identityKit.toString()})(naming),
    visibility: (${visibilityKit.toString()})(doc, doc.defaultView)
  };
  return (${actInPageCore.toString()})(doc, holder, action, kit);
})`;
}
export {
  actEngineSource,
  actInPage,
  actInPageCore,
  buildActKit
};
