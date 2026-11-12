// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/src/lib/preview-annotate/stack.ts; run node scripts/sync-browser-annotations.mjs to update.
function emptyAnnotateStack() {
  return { nextNumber: 1, pins: [] };
}
function addAnnotatePin(stack, draft) {
  const pin = {
    ...draft,
    id: draft.id || `annotate-${stack.nextNumber}`,
    number: stack.nextNumber
  };
  return {
    nextNumber: stack.nextNumber + 1,
    pins: [...stack.pins, pin]
  };
}
function updateAnnotatePinNote(stack, id, note) {
  return {
    ...stack,
    pins: stack.pins.map((pin) => pin.id === id ? { ...pin, note } : pin)
  };
}
function removeAnnotatePin(stack, id) {
  return {
    ...stack,
    pins: stack.pins.filter((pin) => pin.id !== id)
  };
}
function clearAnnotateStack(stack) {
  void stack;
  return emptyAnnotateStack();
}
function clearAnnotatePins(stack) {
  return { ...stack, pins: [] };
}
function emptyAnnotateSession() {
  return { draft: null, mode: false, overlayLive: false, stack: emptyAnnotateStack() };
}
function beginAnnotateMode(session) {
  return { ...session, mode: true, overlayLive: true };
}
function endAnnotateMode(session) {
  return { ...session, draft: null, mode: false, overlayLive: false };
}
export {
  addAnnotatePin,
  beginAnnotateMode,
  clearAnnotatePins,
  clearAnnotateStack,
  emptyAnnotateSession,
  emptyAnnotateStack,
  endAnnotateMode,
  removeAnnotatePin,
  updateAnnotatePinNote
};
