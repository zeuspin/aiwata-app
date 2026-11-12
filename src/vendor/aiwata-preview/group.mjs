// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-annotate/group.ts; run node scripts/sync-browser-annotations.mjs to update.
const SEP = ">";
function segments(selector) {
  return selector.split(SEP).filter(Boolean);
}
function ancestorPath(selector) {
  const parts = segments(selector);
  return parts.length > 1 ? parts.slice(0, -1) : parts;
}
function prefixAt(parts, depth) {
  return parts.slice(0, depth).join(SEP);
}
function annotateSplitDepth(selectors) {
  const parts = selectors.map(ancestorPath);
  if (parts.length < 2) {
    return parts[0]?.length ? 1 : 0;
  }
  const shortest = Math.min(...parts.map((list) => list.length));
  for (let depth = 1; depth <= shortest; depth++) {
    const seen = new Set(parts.map((list) => prefixAt(list, depth)));
    if (seen.size > 1) {
      return depth;
    }
  }
  return parts.some((list) => list.length > shortest) ? shortest + 1 : shortest;
}
function labelFor(key) {
  const parts = segments(key);
  return parts[parts.length - 1] || "";
}
function bucket(items, depth) {
  const byKey = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = prefixAt(ancestorPath(item.identity?.selector || ""), depth);
    const group = byKey.get(key);
    if (group) {
      group.items.push(item);
      continue;
    }
    byKey.set(key, { items: [item], key, label: labelFor(key) });
  }
  return Array.from(byKey.values());
}
function refine(groups, total) {
  const ceiling = Math.max(2, Math.ceil(total / 3));
  let current = groups;
  for (let pass = 0; pass < total; pass++) {
    const target = current.find((group) => group.items.length > ceiling);
    if (!target) {
      break;
    }
    const selectors = target.items.map((item) => item.identity?.selector || "");
    const deeper = annotateSplitDepth(selectors);
    const split = bucket(target.items, deeper);
    if (split.length < 2) {
      break;
    }
    current = current.flatMap((group) => group === target ? split : [group]);
  }
  return current;
}
function flattenNested(groups) {
  const firstNumber = (group) => group.items[0]?.number ?? 0;
  const selectorsOf = (group) => group.items.map((item) => item.identity?.selector || "").filter(Boolean);
  const owns = (parent, child) => {
    const parents = selectorsOf(parent);
    const children = selectorsOf(child);
    if (!parents.length || !children.length) {
      return false;
    }
    return children.every(
      (childSel) => parents.some((parentSel) => childSel === parentSel || childSel.startsWith(`${parentSel}>`))
    );
  };
  const sorted = [...groups].sort((left, right) => {
    const leftMin = Math.min(...selectorsOf(left).map((sel) => sel.length));
    const rightMin = Math.min(...selectorsOf(right).map((sel) => sel.length));
    if (leftMin !== rightMin) {
      return leftMin - rightMin;
    }
    return firstNumber(left) - firstNumber(right);
  });
  const kept = [];
  for (const group of sorted) {
    const parent = kept.find((candidate) => candidate.key !== "" && owns(candidate, group));
    if (parent) {
      parent.items.push(...group.items);
      parent.items.sort((left, right) => left.number - right.number);
      const key = sharedSelectorPrefix(selectorsOf(parent));
      parent.key = key;
      parent.label = labelFor(key);
      continue;
    }
    kept.push({ items: [...group.items], key: group.key, label: group.label });
  }
  kept.sort((left, right) => firstNumber(left) - firstNumber(right));
  return kept;
}
function sharedSelectorPrefix(selectors) {
  if (!selectors.length) {
    return "";
  }
  const parts = selectors.map(segments);
  const shortest = Math.min(...parts.map((list) => list.length));
  const common = [];
  for (let i = 0; i < shortest; i++) {
    const seg = parts[0]?.[i];
    if (!seg || parts.some((list) => list[i] !== seg)) {
      break;
    }
    common.push(seg);
  }
  return common.join(SEP);
}
function groupAnnotations(items) {
  const placed = items.filter((item) => item.identity?.selector);
  const loose = items.filter((item) => !item.identity?.selector);
  const depth = annotateSplitDepth(placed.map((item) => item.identity?.selector || ""));
  const groups = flattenNested(refine(bucket(placed, depth), placed.length));
  if (loose.length) {
    groups.push({ items: [...loose], key: "", label: "" });
  }
  return groups;
}
export {
  annotateSplitDepth,
  groupAnnotations
};
