import { ANNOTATE_CARD_HEIGHT, ANNOTATE_CARD_WIDTH, ANNOTATE_MARKER_SIZE } from './vendor/aiwata-preview/tokens.mjs'

export function placeAnnotationControls({ paneWidth, paneHeight, panelWidth = 304, panelHeight = 40, position }) {
  const pad = 12
  return {
    left: Math.max(pad, Math.min(Math.max(pad, paneWidth - panelWidth - pad), position?.left ?? (paneWidth - panelWidth) / 2)),
    top: Math.max(pad, Math.min(Math.max(pad, paneHeight - panelHeight - pad), position?.top ?? paneHeight - panelHeight - 24)),
  }
}

// AIWATA 6631a6af2c, preview-annotate-card.tsx: placeAnnotateCard.
// Keep this placement identical to the native pill, rather than following the
// right edge of a large selected element.
export function placeAnnotateCard({ paneHeight, paneWidth, rect }) {
  const PAD = 12, GAP = 8
  const width = Math.min(ANNOTATE_CARD_WIDTH, Math.max(0, paneWidth - PAD * 2))
  const maxLeft = Math.max(PAD, paneWidth - width - PAD)
  const maxTop = Math.max(PAD, paneHeight - ANNOTATE_CARD_HEIGHT - PAD)
  const pinRight = rect.x + ANNOTATE_MARKER_SIZE / 2
  const preferRight = pinRight + GAP
  const preferLeft = rect.x - ANNOTATE_MARKER_SIZE / 2 - GAP - width
  const left = preferRight + width + PAD <= paneWidth || preferLeft < PAD
    ? Math.min(Math.max(PAD, preferRight), maxLeft)
    : Math.min(Math.max(PAD, preferLeft), maxLeft)
  const top = Math.min(Math.max(PAD, rect.y - ANNOTATE_CARD_HEIGHT / 2), maxTop)
  return { left, top }
}
