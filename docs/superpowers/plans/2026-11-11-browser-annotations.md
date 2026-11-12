# Native browser annotations

The user authorized reuse of AIWATA's native browser annotation workflow: element and area selection, stable numbered markers, captured images, ordinary chat/Bot/group destinations shown before adding to drafts. No commits, branches, pushes, or containers. Preserve unrelated working changes.

## Design

- Vendor a provenance-recorded snapshot of the independent native annotation modules from sibling AIWATA HEAD 6631a6af2c. No runtime imports from the backend tree.
- The Electron main process validates the active account partition, owned guest, URL and document epoch for every annotation operation. Only fixed operations are callable; navigation/logout/unmount cancels old operations.
- Reuse native in-page selection and numbered overlays, including numbered crop capture. Store image contents through the account/chat-scoped attachment store, not browser localStorage.
- Browser annotations belong to one account, conversation, browser instance and page. Preserve legacy text annotations. Numbers stay stable after removal.
- Open browser tools in ordinary sessions, private Bots and groups. Keep Agent-driven browser routing restricted to an exact owner; do not expose unrelated project-only tools to Bots/groups.
- Selecting Add opens a review dialog showing the exact destination, page, numbered notes and images. Confirm only appends to that pinned draft, never sends or switches destination implicitly. Fail closed on logout/deleted recipient/browser or page changes. Preserve existing drafts/attachments and retain saved notes.

## Tasks / verification

1. Native module snapshot and bridge: add source hash/provenance and sync tooling; implement bounded selection/capture lifecycle; test source fidelity, capture geometry and ownership fencing.
2. Account-safe state and handoff: add numbered metadata, attachment-backed screenshots and transactional destination-bound draft append; test persistence, failures, duplicate batch import, account switch and recipient mutation.
3. Frontend: integrate native event loop and draft card; render saved numbered notes with removal/preview; review destination before addition. Enable browser-only live tools in Bot/group panes.
4. Run focused tests, npm test, npm run build and npm run test:sites. Inspect actual desktop UI for point selection, drag selection, screenshot/marker match, destination review, no auto-send, and isolation. Document host-only boundaries and verification limits.
