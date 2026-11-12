// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-act/watch-in-page.ts; run node scripts/sync-browser-drive.mjs to update.
function watchInPage(doc, holder, stage, label) {
  const win = doc.defaultView;
  if (!win || !doc.documentElement) {
    return;
  }
  const line = "#EC008C";
  const weight = "1.5px";
  const heavy = "2px";
  const pad = 4;
  const nudge = 2;
  const dwell = 6e3;
  const cascade = 900;
  const hold = 7500;
  const blink = 90;
  const flick = 200;
  const tempo = 26;
  const gasp = 210;
  const burst = 5e3;
  const wipe = 1800;
  const glance = 1400;
  const page = 160;
  const throb = 260;
  const ponder = 240;
  const quiet = 0.55;
  const still = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dark = !!(win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches);
  const ink = dark ? "#FFFFFF" : "#111111";
  const face = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
  const busy = 25;
  const state = win.__hermesWatch || (win.__hermesWatch = {});
  const kinds = {
    candidate: { gap: 0, life: dwell, rule: weight },
    flash: { gap: pad, life: blink, rule: heavy },
    held: { gap: pad, life: 0, rule: heavy },
    hit: { gap: 0, life: dwell, rule: heavy },
    lock: { gap: pad, life: hold, rule: heavy }
  };
  const style = (el, props) => {
    for (const name in props) {
      ;
      el.style.setProperty(name, props[name]);
    }
  };
  const step = (node) => {
    const tag = node.tagName.toLowerCase();
    const id = node.getAttribute("id");
    const cls = (node.getAttribute("class") || "").trim().split(/\s+/)[0];
    const kind = node.getAttribute("type") || node.getAttribute("name") || node.getAttribute("role");
    if (id) {
      return tag + "#" + id;
    }
    if (cls) {
      return tag + "." + cls;
    }
    if (kind) {
      return tag + "[" + kind + "]";
    }
    const parent = node.parentElement;
    if (!parent) {
      return tag;
    }
    let kin = 0;
    let mine = 0;
    for (let i = 0; i < parent.children.length; i++) {
      if (parent.children[i].tagName !== node.tagName) {
        continue;
      }
      kin++;
      if (parent.children[i] === node) {
        mine = kin;
      }
    }
    return kin > 1 ? tag + "[" + mine + "]" : tag;
  };
  const sniff = (el) => {
    const held = holder.book || [];
    for (const bound of held) {
      if (bound.el === el) {
        return bound.ref;
      }
    }
    const name = step(el);
    return name.length > 16 ? name.slice(0, 15) + "\u2026" : name;
  };
  const spot = (el) => {
    const box = el.getBoundingClientRect();
    return { height: box.height, left: box.left, top: box.top, width: box.width };
  };
  const middle = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const build = () => {
    const stale = doc.querySelectorAll("hermes-watch");
    for (let i = 0; i < stale.length; i++) {
      stale[i].remove();
    }
    const host = doc.createElement("hermes-watch");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("popover", "manual");
    style(host, {
      background: "transparent",
      border: "0",
      contain: "layout style paint",
      display: "block",
      height: "100%",
      inset: "0",
      margin: "0",
      overflow: "visible",
      padding: "0",
      "pointer-events": "none",
      position: "fixed",
      "user-select": "none",
      width: "100%",
      "z-index": "2147483647"
    });
    const shadow = host.attachShadow({ mode: "closed" });
    const pointer = doc.createElement("div");
    style(pointer, { left: "0", opacity: "0", "pointer-events": "none", position: "fixed", top: "0" });
    const was = state.at;
    if (was) {
      style(pointer, { transform: "translate3d(" + was.x + "px," + was.y + "px,0)" });
    }
    const cursor = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    cursor.setAttribute("viewBox", "0 0 24 36");
    cursor.setAttribute("width", "28");
    cursor.setAttribute("height", "42");
    style(cursor, { display: "block", left: "-1px", position: "absolute", top: "-1px" });
    const nib = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    nib.setAttribute(
      "d",
      "M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
    );
    cursor.appendChild(nib);
    pointer.appendChild(cursor);
    shadow.appendChild(pointer);
    doc.documentElement.appendChild(host);
    if (!still && typeof cursor.animate === "function") {
      cursor.animate(
        [
          { transform: "translate(0px, 0px)" },
          { transform: "translate(1.5px, -2px)" },
          { transform: "translate(-1px, 1.5px)" },
          { transform: "translate(0px, 0px)" }
        ],
        { duration: 5200, easing: "ease-in-out", iterations: Infinity }
      );
    }
    return { cursor, host, nib, pointer, shadow };
  };
  const park = (at) => {
    const shown = state.parts;
    state.at = at;
    if (shown) {
      style(shown.pointer, { transform: "translate3d(" + at.x + "px," + at.y + "px,0)" });
    }
  };
  const marks = state.marks || (state.marks = []);
  const caption = (text2) => {
    const tag = doc.createElement("div");
    tag.textContent = text2;
    style(tag, {
      // Named outright, NOT `currentColor`. `currentColor` in a background
      // resolves against the element's own `color` — which is white here — so
      // the label came out white on white and vanished.
      background: line,
      color: "#FFFFFF",
      "font-family": face,
      "font-size": "8px",
      "font-weight": "700",
      // Tracked OUT, not in. Tightening is for display sizes; at 8px, and in
      // caps especially — no ascenders or descenders to separate one letter from
      // the next — the glyphs need air or they read as a smear.
      "letter-spacing": "0.04em",
      "line-height": "1.4",
      // Capped in pixels, NOT at 100% of the box. A tab is allowed to be wider
      // than the thing it names — an icon button is 32px and would have had its
      // label clipped to three letters, which is worse than an overhang. The
      // ceiling is only here for a pin whose caption the agent wrote.
      "max-width": "160px",
      overflow: "hidden",
      padding: "0 " + nudge + "px",
      position: "absolute",
      "text-transform": "uppercase",
      "white-space": "nowrap"
    });
    return tag;
  };
  const paint = (spec) => {
    const cell = doc.createElement("div");
    style(cell, { color: line, left: "0", "pointer-events": "none", position: "fixed", top: "0" });
    const skin = doc.createElement("div");
    style(skin, {
      border: kinds[spec.kind].rule + " solid currentColor",
      inset: "0",
      overflow: "hidden",
      position: "absolute",
      "transform-origin": "center"
    });
    cell.appendChild(skin);
    if (spec.kind === "lock") {
      const beam = doc.createElement("div");
      style(beam, {
        background: "currentColor",
        height: heavy,
        left: "0",
        opacity: "0",
        position: "absolute",
        right: "0",
        top: "0"
      });
      skin.appendChild(beam);
    }
    const tag = spec.label ? caption(spec.label) : void 0;
    if (tag) {
      cell.appendChild(tag);
    }
    return { cell, skin, tag };
  };
  const fit = (mark) => {
    const cell = mark.cell;
    const from = spot(mark.spec.a);
    const gap = kinds[mark.spec.kind].gap;
    style(cell, {
      height: from.height + gap * 2 + "px",
      transform: "translate3d(" + (from.left - gap) + "px," + (from.top - gap) + "px,0)",
      width: from.width + gap * 2 + "px"
    });
    if (mark.tag) {
      const tall = 13;
      const row = from.top - gap >= tall ? "up" : from.top + from.height + gap + tall <= win.innerHeight ? "down" : "in";
      const wide2 = mark.wide || (mark.wide = mark.tag.offsetWidth);
      const end = from.left - gap + wide2 > win.innerWidth ? "end" : "start";
      const slot = row + end;
      if (mark.slot !== slot) {
        mark.slot = slot;
        style(mark.tag, {
          bottom: row === "up" ? "100%" : "",
          left: end === "start" ? "0px" : "",
          right: end === "end" ? "0px" : "",
          top: row === "up" ? "" : row === "down" ? "100%" : "0"
        });
      }
    }
    return middle(from);
  };
  const enter = (mark) => {
    const spec = mark.spec;
    const life = spec.life || kinds[spec.kind].life;
    if (!life) {
      return;
    }
    const cell = mark.cell;
    const skin = mark.skin;
    const beat = spec.beat || 0;
    win.setTimeout(() => cell.remove(), life + beat);
    const blip = spec.kind === "candidate" || spec.kind === "flash";
    const mover = blip ? cell : skin;
    if (still || typeof mover.animate !== "function") {
      return;
    }
    const frames = blip ? [
      { offset: 0, opacity: 0 },
      { offset: 0.01, opacity: 1 },
      { offset: 0.99, opacity: 1 },
      { offset: 1, opacity: 0 }
    ] : (
      // A box snapping shut on a target, not a material-design tap. Scale is
      // the one thing that CAN'T move to the cell — the tracker rewrites the
      // cell's transform every frame — so it stays on the skin, where it only
      // has to not fight the opacity above.
      [
        { offset: 0, transform: spec.kind === "hit" ? "scale(1.35)" : "scale(1.06)" },
        { offset: spec.kind === "hit" ? 0.1 : 90 / life, transform: "scale(1)" },
        { offset: 1, transform: "scale(1)" }
      ]
    );
    mover.animate(frames, { delay: beat, duration: life, easing: "linear", fill: "both" });
    const beam = spec.kind === "lock" ? skin.firstElementChild : null;
    if (beam && typeof beam.animate === "function") {
      beam.animate(
        [
          { opacity: 1, top: "-2px" },
          { opacity: 1, top: "100%" }
        ],
        {
          duration: dwell,
          easing: "linear"
        }
      );
    }
  };
  const tick = () => {
    const shown = state.parts;
    let keep = 0;
    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i];
      if (!doc.contains(mark.spec.a)) {
        if (mark.cell) {
          mark.cell.remove();
        }
        continue;
      }
      if (mark.cell && !mark.cell.isConnected) {
        if (kinds[mark.spec.kind].life) {
          continue;
        }
        mark.cell = void 0;
      }
      marks[keep++] = mark;
      if (!shown) {
        continue;
      }
      if (!mark.cell) {
        const made = paint(mark.spec);
        mark.cell = made.cell;
        mark.skin = made.skin;
        mark.tag = made.tag;
        mark.slot = void 0;
        mark.wide = void 0;
        shown.shadow.appendChild(made.cell);
        enter(mark);
      }
      const at = fit(mark);
      if (mark.spec.kind === "lock") {
        park(at);
      }
    }
    marks.length = keep;
    state.raf = keep ? win.requestAnimationFrame(tick) : void 0;
  };
  const pump = () => {
    if (state.raf) {
      win.cancelAnimationFrame(state.raf);
      state.raf = void 0;
    }
    tick();
  };
  const add = (spec) => marks.push({ spec });
  const outline = (all, kind, beat, life) => {
    for (let i = 0; i < all.length; i++) {
      const seen = spot(all[i]);
      if (seen.width < 1 || seen.height < 1) {
        continue;
      }
      const named = all.length <= busy && seen.width >= 16 && seen.height >= 10;
      add({ a: all[i], beat: beat(i, seen), kind, label: named ? sniff(all[i]) : void 0, life });
    }
  };
  const hush = () => {
    if (state.mind) {
      win.clearInterval(state.mind);
      state.mind = void 0;
    }
  };
  const retire = (claims) => {
    for (let i = marks.length - 1; i >= 0; i--) {
      if (!claims(marks[i].spec)) {
        continue;
      }
      if (marks[i].cell) {
        ;
        marks[i].cell.remove();
      }
      marks.splice(i, 1);
    }
  };
  const prose = () => {
    if (!doc.body) {
      return [];
    }
    const all = doc.body.getElementsByTagName("*");
    const bag = /* @__PURE__ */ new Set();
    const found = [];
    for (let i = 0; i < all.length && found.length < page; i++) {
      const el = all[i];
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE" || tag === "OPTION") {
        continue;
      }
      let words = false;
      for (let node = el.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 3 && (node.nodeValue || "").trim()) {
          words = true;
          break;
        }
      }
      if (!words) {
        continue;
      }
      let up = el.parentElement;
      let inside = false;
      while (up) {
        if (bag.has(up)) {
          inside = true;
          break;
        }
        up = up.parentElement;
      }
      if (inside) {
        continue;
      }
      bag.add(el);
      const look = el.checkVisibility;
      if (typeof look === "function" && !look.call(el, { opacityProperty: true, visibilityProperty: true })) {
        continue;
      }
      const seen = spot(el);
      if (seen.width < 16 || seen.height < 6 || seen.left + seen.width <= 0 || seen.top + seen.height <= 0 || seen.left >= win.innerWidth || seen.top >= win.innerHeight) {
        continue;
      }
      found.push(el);
    }
    return found;
  };
  const stamp = win.__hermesWatchTag;
  if (state.tag !== stamp) {
    state.tag = stamp;
    state.parts = void 0;
    hush();
  }
  const mounted = state.parts;
  const target = holder.aimed;
  if (stage === "clear" || stage === "rest") {
    hush();
    if (stage === "rest") {
      return;
    }
    holder.aimed = null;
    retire((spec) => !!kinds[spec.kind].life);
    if (mounted) {
      style(mounted.pointer, { opacity: "0" });
    }
    return;
  }
  if (stage === "think") {
    state.pulse = () => {
      const live = holder.field && holder.field.length ? holder.field : holder.nodes || [];
      if (!live.length || !state.parts || Math.random() < quiet) {
        return;
      }
      const el = live[Math.floor(Math.random() * live.length)];
      const seen = spot(el);
      if (seen.width >= 1 && seen.height >= 1) {
        add({ a: el, kind: "flash", label: sniff(el), life: ponder + Math.random() * ponder });
        pump();
      }
    };
    if (!state.mind && !still) {
      state.mind = win.setInterval(() => {
        const beat = state.pulse;
        if (beat) {
          beat();
        }
      }, throb);
    }
    return;
  }
  if (stage === "unpin") {
    retire((spec) => spec.kind === "held" && (!target || spec.a === target));
    holder.aimed = null;
    return;
  }
  const wide = stage === "sweep" || stage === "hold" || stage === "strobe";
  const field = holder.field && holder.field.length ? holder.field : holder.nodes || [];
  const text = stage === "read" ? prose() : [];
  if (stage === "read" ? !text.length : wide ? !field.length : !target || !doc.contains(target)) {
    return;
  }
  const parts = mounted && mounted.host.isConnected ? mounted : build();
  state.parts = parts;
  parts.nib.setAttribute("fill", ink);
  try {
    ;
    parts.host.hidePopover();
    parts.host.showPopover();
  } catch {
  }
  if (stage === "pin") {
    retire((spec) => spec.kind === "held" && spec.a === target);
    add({ a: target, kind: "held", label: label || sniff(target) });
    holder.aimed = null;
  } else if (stage === "hold") {
    retire((spec) => spec.kind === "held");
    outline(field, "held", () => 0);
    holder.aimed = null;
  } else if (stage === "sweep") {
    retire((spec) => spec.kind === "lock");
    holder.aimed = null;
    outline(field, "candidate", (at) => {
      const noise = Math.sin((at + 1) * 12.9898) * 43758.5453;
      return (noise - Math.floor(noise)) * cascade;
    });
  } else if (stage === "read") {
    retire((spec) => spec.kind === "lock");
    holder.aimed = null;
    outline(
      text,
      "candidate",
      (_at, seen) => Math.max(0, Math.min(1, (seen.top + seen.height / 2) / win.innerHeight)) * wipe,
      glance
    );
  } else if (stage === "strobe") {
    retire((spec) => spec.kind === "lock");
    holder.aimed = null;
    let seed = 0;
    const roll = () => {
      const noise = Math.sin(++seed * 78.233) * 43758.5453;
      return noise - Math.floor(noise);
    };
    if (still) {
      outline(field, "candidate", () => 0);
    } else {
      for (let at = 0; at < burst; ) {
        const clump = roll() < 0.62 ? 1 : roll() < 0.7 ? 2 : 3;
        for (let k = 0; k < clump; k++) {
          const el = field[Math.floor(roll() * field.length)];
          const seen = spot(el);
          if (seen.width >= 1 && seen.height >= 1) {
            add({ a: el, beat: at, kind: "flash", label: sniff(el), life: blink + roll() * flick });
          }
        }
        at += roll() < 0.85 ? tempo + roll() * tempo * 2 : gasp + roll() * gasp;
      }
    }
  } else if (stage === "strike") {
    add({ a: target, kind: "hit" });
  } else {
    retire((spec) => spec.kind === "lock");
    add({ a: target, kind: "lock", label: sniff(target) });
    style(parts.pointer, { opacity: "1" });
  }
  pump();
}
export {
  watchInPage
};
