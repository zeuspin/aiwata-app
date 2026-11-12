# Recorded annotation interaction

Source: user-supplied 52.83s Codex screen recording, 774×1148. Frames inspected at 2,12,28,39s.

- Preserve native AIWATA element/area selection, numbered screenshots, per-account/conversation/browser drafts and exact-recipient confirmation.
- Replace speech-bubble toolbar glyph with a selection glyph. Persistent pale-blue pressed state toggles selection on/off.
- White 280×44 capsule at the selected target, dark text, microphone and circular check action. Enter saves, Escape cancels; voice never saves/sends automatically.
- Bottom dark floating control bar: drag handle, saved count, visibility toggle, clear pending annotations, blue send-to-draft action, close. Clamp dragging within browser viewport, retain position while open, keyboard-operable handle; no webview swallowing drag.
- Reuse existing account/Profile voiceStatus/transcribeVoice and MediaRecorder. Abort and stop tracks on close, navigation, account change, target replacement. No synthetic transcript in live mode. Unsupported/unconfigured service reports a clear reason without losing typed notes.
- Send retains existing confirmation naming exact conversation/Bot/group. Hidden pins remain saved and restore on visibility toggle. Closing selection retains notes.
- Finish pending console race and DevTools internal-resource bug from prior task without changing annotation evidence ownership.

Validation: annotation placement/drag bounds tests, microphone UI and recipient checks, native-host isolation tests, npm test/build/test:sites, desktop CUA walkthrough and reference comparison. No commit, branch, push or container creation.
