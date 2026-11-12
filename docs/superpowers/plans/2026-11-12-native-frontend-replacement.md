# Native AIWATA frontend replacement Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session. No branch, commit or push is authorized.

**Goal:** Run aiwata-app as the renderer of the original AIWATA Electron application, using its existing backend and native capabilities.

**Architecture:** The original Electron application remains the machine/runtime authority. Reuse its HermesGateway and hermesDesktop bridge directly. Vite serves renderer assets only in replacement mode; the isolated gateway/plugin and independent desktop-preview host are excluded. Keep the old renderer as an explicit recovery entry.

**Tech Stack:** React, Vite, original Electron preload, original TypeScript gateway client.

**Spec:** User-approved frontend responsibility agreement in AGENTS.md and 2026-11-12 request to replace the original frontend.

## Global Constraints

- Preserve existing interface, UI storage, attachment contents and backend/Profile data. No account/Profile directory merging.
- No drivers, tool implementations, OS permissions, backend changes or credential migration.
- No branch/commit/push. Existing dirty changes in both repositories must survive.
- Keep pure mock mode and Sites artifacts runnable.
- Source/frontend launch integration may change; signed installed bundles are not edited in place.

## Review Focus

- Backend identity must remain the original native connection, not fixture account homes.
- Profile and connection routes must remain pinned through async work, reconnect and logout.
- Canonical Bot opening resumes the backend-provided canonical session.
- Webviews, terminal and native folder selection must use original host contracts.
- Existing UI drafts and backend data must survive switching/recovery.

## Tasks

- [x] 1. Native transport + presentation adapters: failing contract tests, direct original gateway/REST bridge, injected native account identity and scoped UI storage.
- [x] 2. Native host integration: renderer-only launcher/build entry, bridge compatibility for existing browser/terminal UX, original frontend recovery path.
- [x] 3. Verify native launch, canonical sessions/Bots, directory selection and browser, existing tests/build/Sites; document actual results and remaining limits.

## Rulings / progress

Ruling: Work in current dirty checkout — user forbids new branches and requests preservation of the active interface.
Ruling: Reuse original gateway client from the checked-out source through a native-build-only Vite alias — protocol and admission logic remain original, no copied Agent implementation.
Ruling: Keep mock and previous isolated test data untouched; replacement mode uses a distinct native connection/profile UI key, original backend data remains authoritative.


## Execution record

- Task 1: complete for the native main-window route. Added direct native client, route/Profile-pinned REST and sockets, native account injection, canonical Bot adoption, exact idempotent submission replay, close/reconnect and presentation adapters. The original SDK remains the wire authority.
- Task 2: complete for main renderer entry/build. Original AIWATA `apps/desktop/dev` now delegates to the independent renderer; its desktop compiler builds the new renderer plus original host artifacts. `dev:legacy` / `build:legacy` preserve recovery. Native aliases in this repository all point at the original host launcher; historical isolated commands are explicitly named legacy.
- Task 3: completed the tests and main-window acceptance below. This does **not** mean every feature of the old renderer or its distribution has migrated.

### Actual verification

- `npm test`: **286 passed** (including 13 native-adapter cases). Covers owner routing, native picker contract, Bot adopt-before-mint, hidden terminal output and stable child clients, capture viewport, native pending input_id / exact submit replay, long outage reconnect, and closing-client scope reads.
- Original AIWATA SDK four canonical API test files: **35 passed**, using installed test dependencies, no new environment or drivers.
- `npm run build:native`: exit 0, `dist/native/index.html` and native renderer assets present.
- Original `scripts/build/desktop.mjs` with existing stamp/icons/native dependencies: exit 0, `checkDistBuilt` accepted new renderer with original Electron main/preloads. Rebuilt after final adapter changes.
- `npm run build`: exit 0; `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` exist. `npm run test:sites`: **4 passed**. Protected Sites files untouched.
- Native signed application kept its executable identity; original backend PID **55385** stayed running through cutover. No model/key migration or OS grants.
- Actual GLM echo **NATIVE_FRONTEND_OK**, current in-app preview title/URL read by a native tool (wrapped through native tool_call; tool result independently checked only for the QA title and URL), folder picker selection reflected in form, website title and DevTools, native annotation crop/number/note/add-to-draft, real PTY **NATIVE_PTY_OK**, output retained after switching tools and explicit close accepted.
- Cancelled project creation after folder selection. Removed own temporary annotation attachments/draft. Native app left open on a new-conversation draft; no premature backend session was created for that draft.
- Old independent preview PID 62635 and 4181 Vite PID 45110 were identity-checked and stopped after their gateway reported idle; the old isolated gateway also exited. No data directories deleted, unrelated 4178/4180/Hermes services not touched.
- Original source maintenance record **042** appended after concurrent upgrade **041**. Inventory write/check matched **2623 fingerprints**. Neither repository's index was staged by this task; no new branch/commit/push.

### Review and fix pass

Fresh review reported two Important issues (lost native submission receipts and retry exhaustion), plus terminal replay/concurrent acquisition. Each was investigated against original native contracts and fixed. Own runtime QA found the missing capture viewport, fixed and rechecked: the crop contains the selected text, blue outline and number (28.8 KiB, rather than an empty crop). Original protocol tests and complete app suite passed after fixes.

Ruling: Preserve pending draft/input identity and replay the exact native request, rather than reading the backend DB from a new service. Original backend idempotency decides whether the request was admitted.
Ruling: Native terminal subscriptions retain bounded **presentation** output across panel unmounts. No shell/process implementation is added; the original host creates, attaches and disposes PTYs. One acquisition per route/session/tool prevents duplicate shells.
Ruling: The original source HEAD changed concurrently from `6631a6af2c` to `3b42157858`, with 041 documenting that upgrade. Kept that work, reread its maintenance baseline and appended 042; never reset or attributed the broad existing overlay to this task.

### Remaining migration / acceptance

- This is an actual **main-window and runtime-entry replacement**, not full old-renderer parity or a replacement installer.
- Quick Entry, overlay/popout windows, connection switching, system theme/window conventions and complete original feature inventory still require frontend migration/acceptance. Do not activate a production distribution on the strength of the main-window tests alone.
- Private historical companions exposed image/video editing and extra memory mutations/review UI not currently available through this native renderer contract. These stay explicit unavailable states. A pending-write list is not synthesized as empty success; preview-check cannot invoke a mutating real Curator run.
- Bot canonical behavior is covered by contract tests; real multi-Bot/group conversations, remote services, provider/OAuth/MCP external authorization, dictation, native Computer Use, formal packaging/signing/installer/update and Windows/Linux remain unverified in this batch.
- Baidu generic search reached CAPTCHA; stopped that QA turn. It is **not** counted as successful search/Computer Use acceptance.
- Existing mock/isolated data remains in its original browser profiles and directories; it was not merged into the original native account. Legacy recovery entry points remain available.
- Source builds currently require both source repositories. Distribution needs an explicit verified renderer artifact/source handoff before its own acceptance. Installed signed application bytes were not edited; current launch uses its existing dev-renderer mechanism.

Private code/artifact recovery: `/Users/xuke/.aiwata-app-recovery/frontend-replacement-2026-11-12/`. No secret files included. The native-window screenshot lives there; no user runtime database/config was replaced.
