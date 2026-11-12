// Native AIWATA source; see provenance.json.
function runTourEngine(factory, holder, action, collectTargets, doc, style, host) {
  const kind = action.kind;
  const base = { animate: true, smoothScroll: true, ...style || {} };
  const popoverOf = (step, first = false) => step.title || step.text ? {
    description: step.text || "",
    popoverClass: (first ? "tour-pop-in" : "tour-pop-next") + (step.accent ? " tour-pop-accent" : ""),
    side: step.side || void 0,
    title: step.title || ""
  } : void 0;
  const moveFor = (step) => {
    if (step.pane && host?.revealPane) {
      host.revealPane(step.pane);
    }
    if (step.navigate && host?.navigate) {
      host.navigate(step.navigate);
    }
  };
  const bindKeepAlive = (steps) => {
    let queued = false;
    const soon = (fn) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(fn);
      } else {
        setTimeout(fn, 16);
      }
    };
    const observer = new MutationObserver(() => {
      if (queued) {
        return;
      }
      queued = true;
      soon(() => {
        queued = false;
        const driver = holder.driver;
        if (!driver?.isActive()) {
          return;
        }
        const index = driver.getActiveIndex() ?? 0;
        const selector = steps[index]?.selector;
        if (!selector) {
          return;
        }
        const wanted = doc.querySelector(selector);
        if (!wanted) {
          return;
        }
        if (wanted === doc.querySelector(".driver-active-element")) {
          return;
        }
        driver.drive(index);
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  };
  const stepOf = (step, first = false) => ({
    element: step.selector || void 0,
    onHighlightStarted: () => moveFor(step),
    popover: popoverOf(step, first)
  });
  const unmatched = (steps) => steps.some((step) => step.navigate || step.pane) ? [] : steps.map((step) => step.selector).filter((selector) => {
    try {
      return !!selector && !doc.querySelector(selector);
    } catch {
      return true;
    }
  });
  const missing = (selectors) => ({
    error: "No element matches selector(s): " + selectors.join(", "),
    hint: "The DOM may have re-rendered \u2014 re-scan with 'targets' and prefer targets marked stable.",
    success: false
  });
  if (kind === "targets") {
    return {
      success: true,
      targets: collectTargets(doc, 150),
      title: doc.title,
      url: doc.location ? doc.location.href : ""
    };
  }
  const clearOrphans = () => {
    for (const node of doc.querySelectorAll(".driver-popover, svg.driver-overlay")) {
      node.remove();
    }
    doc.body.classList.remove("driver-active", "driver-fade", "driver-simple", "driver-no-scroll");
  };
  const ended = () => {
    holder.driver = void 0;
    holder.release?.();
    holder.release = void 0;
    host?.onEnd?.();
  };
  if (kind === "show") {
    const gone = unmatched([action]);
    if (gone.length > 0) {
      return missing(gone);
    }
    if (!holder.driver) {
      clearOrphans();
      holder.driver = factory({ ...base, onDestroyed: ended });
    }
    holder.driver.highlight(stepOf(action, true));
    return { action: kind, success: true };
  }
  if (kind === "start") {
    const steps = action.steps || [];
    const gone = unmatched(steps);
    if (gone.length > 0) {
      return missing(gone);
    }
    if (holder.driver) {
      holder.driver.destroy();
    }
    clearOrphans();
    const startAt = action.startAt || 0;
    const origin = steps.some((step) => step.navigate) ? host?.currentRoute?.() : void 0;
    holder.driver = factory({
      ...base,
      onDestroyed: () => {
        ended();
        if (origin !== void 0 && host?.navigate && host.currentRoute?.() !== origin) {
          host.navigate(origin);
        }
      },
      showProgress: steps.length > 1,
      // Each step moves the app from its own onHighlightStarted, so buttons,
      // arrow keys and the API all take the same path (see moveFor).
      steps: steps.map((step, i) => stepOf(step, i === startAt))
    });
    holder.release?.();
    holder.release = bindKeepAlive(steps);
    holder.driver.drive(startAt);
    return { action: kind, activeStep: startAt, steps: steps.length, success: true };
  }
  if (kind === "next" || kind === "prev") {
    const driver = holder.driver;
    if (!driver || !driver.isActive()) {
      return { error: "No tour is running \u2014 start one first.", success: false };
    }
    if (kind === "next" && driver.isLastStep()) {
      driver.destroy();
      holder.driver = void 0;
      return { action: kind, done: true, success: true };
    }
    if (kind === "next") {
      driver.moveNext();
    } else {
      driver.movePrevious();
    }
    return { action: kind, activeStep: driver.getActiveIndex(), success: true };
  }
  if (kind === "stop") {
    if (holder.driver) {
      holder.driver.destroy();
      holder.driver = void 0;
    }
    clearOrphans();
    holder.release?.();
    holder.release = void 0;
    return { action: kind, success: true };
  }
  return { error: "Unknown tour action: " + kind, success: false };
}
export {
  runTourEngine
};
