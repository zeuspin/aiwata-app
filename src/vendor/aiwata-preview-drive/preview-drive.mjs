// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/app/chat/right-rail/preview-drive.ts; run node scripts/sync-browser-drive.mjs to update.
const isMacPlatform = () => process.platform === "darwin";
const GLIDE_STEPS = 3;
const GLIDE_MS = 36;
const KEY_MS = 7;
const WHEEL_STEPS = 12;
const WHEEL_MS = 240;
const pointers = /* @__PURE__ */ new WeakMap();
const pointerKey = (input) => input.pointerKey ?? input;
const pointerFor = (input) => pointers.get(pointerKey(input)) ?? { point: { x: 0, y: 0 }, placed: false };
function pointerPlaced(input) {
  return pointerFor(input).placed;
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
async function glideTo(input, to) {
  const from = pointerFor(input).point;
  for (let step = 1; step <= GLIDE_STEPS; step++) {
    const progress = easeOut(step / GLIDE_STEPS);
    input.send({
      type: "mouseMove",
      x: Math.round(from.x + (to.x - from.x) * progress),
      y: Math.round(from.y + (to.y - from.y) * progress)
    });
    await wait(GLIDE_MS / GLIDE_STEPS);
  }
  pointers.set(pointerKey(input), { point: to, placed: true });
}
async function clickAt(input, clicks = 1) {
  const pointer = pointerFor(input).point;
  for (let click = 1; click <= clicks; click++) {
    input.send({ button: "left", clickCount: click, type: "mouseDown", x: pointer.x, y: pointer.y });
    input.send({ button: "left", clickCount: click, type: "mouseUp", x: pointer.x, y: pointer.y });
    await wait(KEY_MS);
  }
}
async function wheelBy(input, down) {
  const pointer = pointerFor(input).point;
  let sent = 0;
  for (let step = 1; step <= WHEEL_STEPS; step++) {
    const so_far = Math.round(down * easeOut(step / WHEEL_STEPS));
    const notch = so_far - sent;
    sent = so_far;
    if (notch) {
      input.send({ deltaX: 0, deltaY: -notch, type: "mouseWheel", x: pointer.x, y: pointer.y });
    }
    await wait(WHEEL_MS / WHEEL_STEPS);
  }
}
async function pressKey(input, key) {
  input.send({ keyCode: key, type: "keyDown" });
  input.send({ keyCode: key, type: "char" });
  input.send({ keyCode: key, type: "keyUp" });
  await wait(KEY_MS);
}
async function selectAll(input) {
  const chord = isMacPlatform() ? ["meta"] : ["control"];
  input.send({ keyCode: "a", modifiers: chord, type: "keyDown" });
  input.send({ keyCode: "a", modifiers: chord, type: "keyUp" });
  await wait(KEY_MS);
}
async function pressControlKey(input, key) {
  input.send({ keyCode: key, type: "keyDown" });
  input.send({ keyCode: key, type: "keyUp" });
  await wait(KEY_MS);
}
async function clearCharsBack(input, count) {
  await pressControlKey(input, "End");
  for (let i = 0; i < count; i++) {
    await pressControlKey(input, "Backspace");
  }
}
async function typeText(input, text, signal) {
  let typed = 0;
  for (const character of text) {
    if (signal?.aborted) {
      return typed;
    }
    await pressKey(input, character);
    typed += 1;
    if (signal?.aborted) {
      return typed;
    }
  }
  return typed;
}
export {
  clearCharsBack,
  clickAt,
  glideTo,
  pointerPlaced,
  pressControlKey,
  pressKey,
  selectAll,
  typeText,
  wheelBy
};
