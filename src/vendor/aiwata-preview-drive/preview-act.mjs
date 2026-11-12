// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/app/chat/right-rail/preview-act.ts; run node scripts/sync-browser-drive.mjs to update.
import { actEngineSource } from "./act-in-page.mjs";
import { watchInPage } from "./watch-in-page.mjs";
import {
  clearCharsBack,
  clickAt,
  glideTo,
  pointerPlaced,
  pressKey,
  selectAll,
  typeText,
  wheelBy
} from "./preview-drive.mjs";
const NAV_ACTIONS = ["back", "forward", "reload"];
const SETTLE_MS = 220;
const TYPE_RENDER_SETTLE_MS = 120;
const TYPE_CLEAR_ATTEMPTS = 2;
const TYPE_FAILED_CLEAR = "The field kept refilling while it was being cleared, so nothing was typed \u2014 typing would only append to its old value. Click it again and retype, or set the value directly.";
const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ACT_TIMEOUT_MS = 8e3;
const DRIVEN = ["click", "hover", "press", "type"];
const CLICKS = ["click", "type"];
const NOTHING_OPEN = "No live page is open in the in-app browser \u2014 open one with open_preview first.";
const NAVIGATED = "The page stopped answering right after \u2014 it is probably navigating. Call elements to see where you landed.";
const UNANSWERED = "The page did not answer in time, so no input was sent. Call elements to see whether it is still the same page.";
const WATCH_TAG = (() => {
  const source = watchInPage.toString();
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = (hash << 5) + hash + source.charCodeAt(i) | 0;
  }
  return hash;
})();
const preamble = () => `  var w = window;
  // Reassigned on every trip rather than cached behind a guard: the source is in
  // this payload either way, so the guard saved nothing and pinned a long-lived
  // tab to whichever build first touched it. The holder is the exception \u2014 it
  // carries the aimed element from the locate trip to the act trip.
  w.__hermesActHolder = w.__hermesActHolder || {};
  w.__hermesAct = ${actEngineSource()};
  w.__hermesWatch_fn = (${watchInPage.toString()});
  w.__hermesWatchTag = ${WATCH_TAG};
  var holder = w.__hermesActHolder;
  var act = function (a) { return w.__hermesAct(document, holder, a); };
  var watch = function (stage, label) {
    try { w.__hermesWatch_fn(document, holder, stage, label); } catch (err) {}
  };
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  // Sit out a smooth scroll so the pointer is aimed at a target that has stopped
  // moving. A scroll that never started fires no scrollend, so only wait on one
  // we can actually see happening; capture catches nested scrollers, whose
  // scrollend does not bubble.
  var restAfterScroll = function () {
    return new Promise(function (resolve) {
      var sc = document.scrollingElement || document.documentElement;
      var x0 = sc ? sc.scrollLeft : 0;
      var y0 = sc ? sc.scrollTop : 0;
      requestAnimationFrame(function () {
        if (!sc || (sc.scrollLeft === x0 && sc.scrollTop === y0)) { return resolve(); }
        var done = false;
        var finish = function () {
          if (done) { return; }
          done = true;
          document.removeEventListener('scrollend', finish, true);
          clearTimeout(timer);
          resolve();
        };
        var timer = setTimeout(finish, 350);
        document.addEventListener('scrollend', finish, true);
      });
    });
  };`;
function buildLocateScript(action, focus) {
  const locate = { focus, kind: "locate", ref: action.ref, selector: action.selector };
  return `(function () {
${preamble()}
  var locate = ${JSON.stringify(locate)};
  var found = act(locate);
  if (!found.success) { return Promise.resolve(JSON.stringify(found)); }
  watch('aim');
  // Arm a witness for the real input that is about to arrive. Without it a
  // click that never reached the page is indistinguishable from one the page
  // ignored, and the agent would report success either way.
  w.__hermesHit = null;
  document.addEventListener('pointerdown', function (e) {
    w.__hermesHit = { tag: e.target ? e.target.tagName : '?', trusted: e.isTrusted === true };
  }, { capture: true, once: true });
  // Measure again once the scroll has stopped: real input is aimed at a fixed
  // viewport coordinate, so it has to be where the target ENDS UP.
  return restAfterScroll().then(function () {
    var settled = act(locate);
    var best = settled.success ? settled : found;
    var at = best.point;
    // Last line of defence before the pointer is sent somewhere real. An element
    // that is still outside the viewport after we scrolled to it is hidden, not
    // placed, and aiming at it would drive the cursor off into a corner and
    // click whatever happens to be under that coordinate.
    if (at && (at.x < 0 || at.y < 0 || at.x > window.innerWidth || at.y > window.innerHeight)) {
      return JSON.stringify({
        error: 'That element is still off-screen after scrolling to it, so it is hidden rather than clickable. Call elements again for what is really on the page.',
        success: false
      });
    }
    return JSON.stringify(best);
  });
})()`;
}
function buildFocusProbeScript() {
  return `(function () {
${preamble()}
  // hermes-focus-probe
  var aimed = holder.aimed;
  var active = document.activeElement;
  var tag = aimed && aimed.tagName ? aimed.tagName : '';
  var editable = !!(aimed && (aimed.isContentEditable === true || tag === 'INPUT' || tag === 'TEXTAREA'));
  var focused = editable && active === aimed;
  return Promise.resolve(JSON.stringify({
    focused: focused,
    success: true,
    tag: active && active.tagName ? active.tagName : ''
  }));
})()`;
}
function buildPinScript(action, label) {
  const locate = { kind: "locate", ref: action.ref, selector: action.selector };
  return `(function () {
${preamble()}
  var found = act(${JSON.stringify(locate)});
  if (!found.success) { return JSON.stringify(found); }
  watch('pin', ${JSON.stringify(label)});
  return JSON.stringify({ acted: 'pinned ' + String(found.acted || 'it').replace(/^looking at /, ''), success: true });
})()`;
}
function buildHoldScript() {
  return `(function () {
${preamble()}
  var found = act({ kind: 'elements' });
  if (!found.success) { return JSON.stringify(found); }
  watch('hold');
  found.acted = 'held the field';
  return JSON.stringify(found);
})()`;
}
function buildStrobeScript() {
  return `(function () {
${preamble()}
  var found = act({ kind: 'elements' });
  if (!found.success) { return JSON.stringify(found); }
  watch('strobe');
  found.acted = 'strobed the field';
  return JSON.stringify(found);
})()`;
}
function buildUnpinScript(action) {
  const locate = { kind: "locate", ref: action.ref, selector: action.selector };
  const one = !!(action.ref || action.selector);
  return `(function () {
${preamble()}
${one ? `  var found = act(${JSON.stringify(locate)});
  if (!found.success) { return JSON.stringify(found); }
  var gone = 'unpinned ' + String(found.acted || 'it').replace(/^looking at /, '');` : `  holder.aimed = null;
  var gone = 'cleared every pin';`}
  watch('unpin');
  return JSON.stringify({ acted: gone, success: true });
})()`;
}
const ANNOTATION_SCRIPTS = /* @__PURE__ */ new Map([
  ["pin", (action) => buildPinScript(action, action.text || "")],
  ["unpin", buildUnpinScript],
  ["hold", buildHoldScript],
  ["strobe", buildStrobeScript]
]);
function buildFinishScript(settleMs) {
  return `(function () {
${preamble()}
  watch('strike');
  return wait(${settleMs}).then(function () {
    // A rescan that throws must still answer \u2014 an unresolved promise here costs
    // the whole bridge deadline.
    try {
      var out = act({ kind: 'elements' });
      watch('sweep');
      out.hit = w.__hermesHit || null;
      return JSON.stringify(out);
    } catch (err) {
      return JSON.stringify({ note: 'The page changed before it could be re-read: ' + err, success: true });
    }
  });
})()`;
}
function buildScriptedScript(action, settleMs) {
  return `(function () {
${preamble()}
  var result = act(${JSON.stringify(action)});
  ${action.kind === "elements" ? "if (result.success) { watch('strobe'); }" : ""}
  if (!result.success || ${settleMs} <= 0) { return Promise.resolve(JSON.stringify(result)); }
  return wait(${settleMs}).then(function () {
    try {
      var after = act({ kind: 'elements' });
      watch('sweep');
      // One or the other, never both: a re-read answers with the whole
      // inventory only when it is the first look at this page.
      result.elements = after.elements;
      result.delta = after.delta;
      result.url = after.url;
      result.title = after.title;
    } catch (err) {
      result.note = 'The page changed before it could be re-read: ' + err;
    }
    return JSON.stringify(result);
  });
})()`;
}
function buildFieldStateScript() {
  return `(function () {
    try {
      var el = document.activeElement;
      if (!el) { return JSON.stringify({ success: true, field: false, len: -1 }); }
      var value = '';
      var hasStart = false;
      try {
        if (el.value !== undefined) { value = String(el.value || ''); }
        else if (el.isContentEditable) { value = el.textContent || ''; }
      } catch (e) {}
      try { hasStart = typeof el.selectionStart === 'number'; } catch (e) {}
      return JSON.stringify({
        success: true,
        field: hasStart && value.length >= 0,
        len: value.length
      });
    } catch (err) {
      return JSON.stringify({ success: false });
    }
  })()`;
}
async function readField(run) {
  const trip = await runJson(run, buildFieldStateScript());
  if (trip.kind !== "answered" || !trip.result.success) {
    return { ok: false };
  }
  const r = trip.result;
  return r.field ? { ok: true, field: true, len: r.len } : { ok: true, field: false };
}
async function replaceExisting(run, input, text, signal) {
  await waitMs(TYPE_RENDER_SETTLE_MS);
  for (let backspaced = 0; backspaced <= TYPE_CLEAR_ATTEMPTS; backspaced++) {
    await selectAll(input);
    const state = await readField(run);
    if (!state.ok || !state.field) {
      break;
    }
    if (state.len === 0) {
      break;
    }
    if (backspaced === TYPE_CLEAR_ATTEMPTS) {
      return { error: TYPE_FAILED_CLEAR, typed: 0 };
    }
    await clearCharsBack(input, state.len);
  }
  return { typed: await typeText(input, text, signal) };
}
function buildDirectSetScript(text) {
  return `(function () {
    try {
      var el = document.activeElement;
      if (!el) { return JSON.stringify({ success: false, error: 'no focused field' }); }
      var setVal = null;
      if (el.tagName === 'TEXTAREA') { setVal = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; }
      else if (el.tagName === 'INPUT') { setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; }
      if (setVal) { setVal.call(el, ${JSON.stringify(text)}); }
      else if ('value' in el) { el.value = ${JSON.stringify(text)}; }
      else if (el.isContentEditable) { el.textContent = ${JSON.stringify(text)}; }
      else { return JSON.stringify({ success: false, error: 'not a text field' }); }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ success: true });
    } catch (err) {
      return JSON.stringify({ success: false, error: String(err) });
    }
  })()`;
}
async function setFocusedField(run, input, text, signal) {
  const cleared = await replaceExisting(run, input, text, signal);
  if (!cleared.error) {
    return { typed: cleared.typed };
  }
  const trip = await runJson(run, buildDirectSetScript(text));
  if (trip.kind !== "answered") {
    return { error: cleared.error, typed: 0 };
  }
  return trip.result.success ? { typed: 0 } : { error: cleared.error, typed: 0 };
}
async function runJson(run, code) {
  const controller = new AbortController();
  const deadline = Promise.withResolvers();
  const timer = setTimeout(() => deadline.resolve(void 0), ACT_TIMEOUT_MS);
  let raw;
  try {
    raw = await Promise.race([
      run(`(async () => (${code}))()`, controller.signal).catch((error) => new Error(String(error))),
      deadline.promise
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  if (raw === void 0) {
    return { kind: "silent" };
  }
  if (raw instanceof Error) {
    return { error: "The page rejected the action: " + raw.message, kind: "failed" };
  }
  if (typeof raw !== "string" || !raw) {
    return { error: "The page did not answer the action.", kind: "failed" };
  }
  return { kind: "answered", result: JSON.parse(raw) };
}
function isPrintableKey(key) {
  return key.length === 1;
}
function isPageRoot(tag) {
  const normalized = (tag || "").toUpperCase();
  return !normalized || normalized === "BODY" || normalized === "HTML";
}
function stoppedType(signal, typed, total) {
  const reason = signal.reason === "timeout" ? "timed out" : "was interrupted";
  return {
    error: `Typing stopped after ${typed} of ${total} characters because the action ${reason}.`,
    success: false
  };
}
function describeDone(action, target) {
  if (action.kind === "type") {
    return "typed into " + target + (action.submit ? " and submitted" : "");
  }
  if (action.kind === "press") {
    return "pressed " + (action.key || "") + " on " + target;
  }
  if (action.kind === "hover") {
    return "hovered over " + target;
  }
  return "clicked " + target;
}
async function driveAction(run, input, action, signal) {
  const trip = await runJson(run, buildLocateScript(action, action.kind === "press"));
  if (trip.kind === "failed") {
    return { error: trip.error, success: false };
  }
  if (trip.kind === "silent") {
    return { error: UNANSWERED, success: false };
  }
  const found = trip.result;
  if (!found.success) {
    return found;
  }
  if (!found.point) {
    return { error: "Could not work out where that element is on screen.", success: false };
  }
  await glideTo(input, found.point);
  if (action.kind === "click") {
    await clickAt(input);
  } else if (action.kind === "type") {
    const text = action.text ?? "";
    if (found.typable === false) {
      return {
        error: `${String(found.acted || "That").replace(/^looking at /, "")} is not a text field, so typing into it would only select the text under the pointer. Click it if it opens one, then type into that.`,
        success: false
      };
    }
    if (signal?.aborted) {
      return stoppedType(signal, 0, text.length);
    }
    input.focus();
    await clickAt(input);
    if (signal?.aborted) {
      return stoppedType(signal, 0, text.length);
    }
    const probe = await runJson(run, buildFocusProbeScript());
    const focused = probe.kind === "answered" && probe.result.focused === true;
    if (!focused) {
      const active = probe.kind === "answered" ? String(probe.result.tag || "the page") : "the page";
      return {
        error: `target is not focused (${active}); nothing typed`,
        success: false
      };
    }
    if (signal?.aborted) {
      return stoppedType(signal, 0, text.length);
    }
    const outcome = await setFocusedField(run, input, text, signal);
    if (outcome.error) {
      return { error: outcome.error, success: false };
    }
    if (signal?.aborted) {
      return stoppedType(signal, outcome.typed, text.length);
    }
    if (action.submit) {
      await pressKey(input, "Enter");
    }
  } else if (action.kind === "press") {
    const key = action.key || "Enter";
    if (isPrintableKey(key) && action.allowShortcut !== true && isPageRoot(found.tag)) {
      return {
        error: `Refused to press a printable key on ${found.tag || "body"}. That would be a page shortcut; pass allowShortcut to opt in.`,
        success: false
      };
    }
    input.focus();
    await pressKey(input, key);
  }
  const target = String(found.acted || "").replace(/^looking at /, "");
  const after = await runJson(run, buildFinishScript(SETTLE_MS));
  const acted = describeDone(action, target);
  if (after.kind !== "answered") {
    return { acted, note: NAVIGATED, success: true };
  }
  const { hit, ...result } = after.result;
  if (!hit && CLICKS.indexOf(action.kind) !== -1) {
    return {
      ...result,
      error: "The pointer input never reached the page, so nothing was " + acted.split(" ")[0] + ".",
      success: false
    };
  }
  return { ...result, acted, note: hitNote(hit), success: true };
}
function hitNote(hit) {
  return hit && hit.tag === "HERMES-WATCH" ? "The action overlay intercepted the click instead of the page." : void 0;
}
function buildScrollAnchorScript() {
  return `(function () {
${preamble()}
  var sc = document.scrollingElement || document.documentElement;
  var track = sc.clientHeight || window.innerHeight;
  return Promise.resolve(JSON.stringify({
    page: Math.round(window.innerHeight * 0.9),
    point: { x: Math.round(window.innerWidth / 2), y: Math.round(track / 2) },
    span: sc.scrollHeight - track,
    success: true
  }));
})()`;
}
async function driveScroll(run, input, action) {
  const far = action.amount ?? 0;
  const trip = await runJson(run, buildScrollAnchorScript());
  if (trip.kind === "failed") {
    return { error: trip.error, success: false };
  }
  if (trip.kind === "silent") {
    return { acted: "scrolled", note: NAVIGATED, success: true };
  }
  const anchor = trip.result;
  if (!anchor.span) {
    return { ...anchor, acted: "scrolled the page", note: "The page has nothing to scroll \u2014 it all fits already." };
  }
  if (!pointerPlaced(input) && anchor.point) {
    await glideTo(input, anchor.point);
  }
  await wheelBy(input, action.amount ?? anchor.page ?? 600);
  const after = await runJson(run, buildFinishScript(SETTLE_MS));
  if (after.kind !== "answered") {
    return { acted: "scrolled the page", note: NAVIGATED, success: true };
  }
  return { ...after.result, acted: "scrolled the page", success: true };
}
async function actWithChannels(typed, run, input, signal) {
  const annotation = ANNOTATION_SCRIPTS.get(typed.kind);
  if (annotation) {
    const trip = await runJson(run, annotation(typed));
    if (trip.kind === "failed") {
      return { error: trip.error, success: false };
    }
    return trip.kind === "answered" ? trip.result : { acted: typed.kind, note: NAVIGATED, success: true };
  }
  if (input && DRIVEN.indexOf(typed.kind) !== -1) {
    return driveAction(run, input, typed, signal);
  }
  const plain = typed.kind === "scroll" && !typed.to && !typed.ref && !typed.selector;
  if (plain && input) {
    return driveScroll(run, input, typed);
  }
  const settle = typed.kind === "elements" ? 0 : SETTLE_MS;
  const scripted = await runJson(run, buildScriptedScript(typed, settle));
  if (scripted.kind === "failed") {
    return { error: scripted.error, success: false };
  }
  return scripted.kind === "silent" ? { acted: typed.kind, note: NAVIGATED, success: true } : scripted.result;
}
export {
  actWithChannels
};
