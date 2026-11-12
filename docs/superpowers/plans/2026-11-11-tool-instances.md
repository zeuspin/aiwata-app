# Tool instances implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. No new branch, push, container or sibling-repository writes.

**Goal:** Match the checked-out AIWATA desktop's browser and terminal instance semantics.
**Architecture:** Keep existing tab strings backward compatible; store type and state under distinct IDs for newly created browser and terminal tabs. Route browser navigation to the active or latest browser, while explicit add always creates a blank browser. Scope the terminal bridge by owning session and terminal instance.
**Tech Stack:** React, persisted local workspace, Node tests, existing native PTY bridge.
**Spec:** User's request in this chat; AIWATA 6631a6af2c `apps/desktop/src/store/preview.ts` (`openPreview`, `openBrowserTab`, `newBrowserTab`), `app/right-sidebar/terminal/terminals.ts` (`createTerminal`).

## Global constraints
- Preserve account/conversation isolation, existing tabs and saved browser data.
- Browser + and new-tab context action create a fresh start page without navigating existing tabs.
- Links reuse the active browser, otherwise the latest browser; terminal launcher creates an independent terminal.
- Files are identified by canonical path in AIWATA. The prototype's Files manager remains a manager; other mock/plugin tools retain their existing behavior unless their multi-instance contract is available.
- Native web content still requires the desktop host; no new Hermes API is needed. Native terminal bridge needs an instance ID and retains account/session validation and the four-terminal resource limit.

## Review focus
- Legacy persisted tabs and browser data restore without migration loss.
- Browser history, annotation drafts and replay do not cross tab IDs.
- Closing/renaming one instance leaves siblings and their data intact.
- Link/Agent navigation selects only the requesting conversation's browser.
- Closing or disconnecting one terminal cannot affect its sibling or another account.

### Task 1: Workspace instance state
- [x] Add failing tests to `tests/workspace.test.mjs` covering duplicate browser/terminal IDs, independent saved state, reload, close, rename and legacy reuse.
- [x] Add `src/tool-tabs.mjs` type/state helpers and adapt `src/workspace.mjs` open/update/close and Agent routing.
- [x] Run `node --test tests/workspace.test.mjs` and verify the new tests pass.

### Task 2: Frontend routing
- [x] Adapt `src/workbench.jsx`, `src/surfaces.jsx`, `src/browser-annotations.jsx` and `src/live-browser.jsx` to select by instance ID and render/update the matching state, including thumbnails.
- [x] Add always creates a browser; terminal launch creates a terminal. Keep ordinary tool selection and browser reveal idempotent.
- [x] Check multiple pages, tab switching, rename/close and reload in the existing local browser.

### Task 3: Native terminal instances and delivery
- [x] Add failing request/bridge tests in `tests/live-gateway.test.mjs` for two terminals owned by one session and validated instance IDs.
- [x] Adapt `scripts/live-aiwata-terminal.mjs`, `src/live-aiwata.mjs` and `src/live-terminal.jsx` to carry the instance ID and separate streams/reading positions.
- [x] Run `npm test`, `npm run build`, `npm run test:sites`, and `git diff --check`.
- [x] Record verified rules and mock/native limitations in `AGENTS.md` and `docs/aiwata-integration.md`; save browser evidence.

Execution notes: workspace tests reproduced singleton collapse (three failures), then passed 39/39 after instance IDs and scoped updates. Bridge tests reproduced rejection of instance_id and one shared process, then passed with separate [session,instance] keys. Full suite passed 111/111 before final review. Ruling: retain the single Files manager and unverified plugin tools; actual AIWATA file-target tabs and external plugin contracts are distinct features, and claiming parity would be inaccurate. Their differences are documented.

Final review: independent read-only reviewer found replay reassignment during snapshot restore and premature native-terminal tab removal. Fixed both with failing-then-passing regression tests: `restoring the same native snapshot never copies an older browsers replay into a new tab`, `a failed native terminal close keeps its tab and data available for retry`, and `bulk closing waits for native acknowledgement and leaves newly opened tabs intact`. Full suite 114/114. Browser QA verified multiple browser and terminal tabs, independent content/output, rename and restore after reload/sign-in; screenshots under `/tmp/aiwata-tool-instances-review/`. Native PTY and Electron were not launched.
