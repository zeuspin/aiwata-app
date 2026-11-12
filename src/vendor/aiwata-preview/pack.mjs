// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-annotate/pack.ts; run node scripts/sync-browser-annotations.mjs to update.
import { groupAnnotations } from "./group.mjs";
import { formatIdentityLine } from "./identity.mjs";
function identityBlock(pin) {
  if (!pin.identity) {
    return `area on the page (${Math.round(pin.rect.width)}\xD7${Math.round(pin.rect.height)}px)`;
  }
  return formatIdentityLine(pin.identity);
}
function cssBlock(identity) {
  const entries = Object.entries(identity.css);
  if (!entries.length) {
    return "";
  }
  return `Styles: ${entries.map(([name, value]) => `${name}: ${value}`).join("; ")}`;
}
function packageAnnotatePin(pin) {
  const target = identityBlock(pin);
  const note = pin.note.trim();
  const identity = pin.identity;
  const prompt = [
    `Comment ${pin.number}`,
    `Target: ${target}`,
    identity?.selector ? `Selector: ${identity.selector}` : "",
    identity?.html ? `HTML: ${identity.html}` : "",
    identity ? cssBlock(identity) : "",
    note ? `Note: ${note}` : "",
    `Image ${pin.number} marks the target in blue.`
  ].filter(Boolean).join("\n");
  return {
    identity,
    imageDataUrl: pin.imageDataUrl,
    note,
    number: pin.number,
    prompt
  };
}
function packageAnnotateStack(pins) {
  return pins.map(packageAnnotatePin);
}
const GROUP_THRESHOLD = 4;
function groupHeading(group, index) {
  const what = group.label ? `\`${group.label}\`` : "Unanchored (dragged areas)";
  return `Group ${index + 1} \u2014 ${what} (${group.items.length} comment${group.items.length === 1 ? "" : "s"})`;
}
function batchGuidance(groupCount, total) {
  return [
    `These ${total} comments are pre-grouped by where they sit in the page \u2014 each group is a different part of the DOM, so the groups should touch mostly separate files.`,
    `Work them as ${groupCount} pieces of work, not ${total}. Fold comments in the same group into one change.`,
    "If you delegate, delegate whole groups \u2014 never split one group across workers, and never form new groups by theme (all the spacing ones, all the copy ones): those cut across the same files and the workers will collide.",
    "Regroup if the code disagrees with this split \u2014 it is derived from the page structure, not from your source layout."
  ].join(" ");
}
function annotateFlushPrompt(items, pageUrl) {
  const where = pageUrl ? ` on ${pageUrl}` : "";
  const count = items.length;
  if (count === 1) {
    return [
      `I left a comment${where} in the in-app browser. Address it and keep the scope narrow.`,
      "",
      ...items.map((item) => item.prompt)
    ].join("\n");
  }
  const groups = groupAnnotations(items);
  if (count < GROUP_THRESHOLD || groups.length < 2) {
    return [
      `I left ${count} comments${where} in the in-app browser. Address them and keep the scope narrow.`,
      "",
      ...items.map((item) => item.prompt)
    ].join("\n");
  }
  const sections = groups.flatMap((group, index) => [
    groupHeading(group, index),
    ...group.items.map((item) => item.prompt),
    ""
  ]);
  return [
    `I left ${count} comments${where} in the in-app browser. Address them and keep the scope narrow.`,
    batchGuidance(groups.length, count),
    "",
    ...sections
  ].join("\n").trimEnd();
}
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const head = comma >= 0 ? dataUrl.slice(0, comma) : "data:image/png;base64";
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /data:([^;]+)/.exec(head)?.[1] || "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
function dataUrlToFile(dataUrl, name) {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], name, { type: blob.type });
}
export {
  annotateFlushPrompt,
  dataUrlToBlob,
  dataUrlToFile,
  packageAnnotatePin,
  packageAnnotateStack
};
