// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-act/identity.ts; run node scripts/sync-browser-drive.mjs to update.
function identityKit(naming) {
  const shifted = (was, entry) => {
    const off = !!entry.disabled;
    const value = entry.value || "";
    if (was.label === entry.label && was.value === value && was.off === off) {
      return null;
    }
    const moved = { ref: was.ref };
    if (was.label !== entry.label) {
      moved.label = entry.label;
    }
    if (was.value !== value) {
      moved.value = value;
    }
    if (was.off !== off) {
      moved.disabled = off;
    }
    return moved;
  };
  const alike = (a, b) => {
    if (!a || !b) {
      return false;
    }
    const one = a.toLowerCase().split(/\s+/).filter(Boolean);
    const two = b.toLowerCase().split(/\s+/).filter(Boolean);
    const both = one.filter((word) => two.indexOf(word) !== -1).length;
    const all = one.length + two.filter((word) => one.indexOf(word) === -1).length;
    return all > 0 && both / all >= 0.5;
  };
  const affinity = (was, now) => {
    if (was.role !== now.role) {
      return 0;
    }
    if (was.stable && now.stable) {
      return was.stable === now.stable ? 1 : 0;
    }
    let score = 0;
    if (was.name && was.name === now.name) {
      score += 0.6;
    } else if (alike(was.name, now.name)) {
      score += 0.4;
    }
    if (was.path && was.path === now.path) {
      score += 0.3;
    }
    return score;
  };
  const coin = (coined, role, name) => {
    const named = naming.slug(name);
    const stem = naming.stemOf(role) + (named ? "-" + named : "");
    const nth = coined[stem] || 0;
    coined[stem] = nth + 1;
    return nth ? stem + "-" + nth : stem;
  };
  return { affinity, alike, coin, shifted };
}
export {
  identityKit
};
