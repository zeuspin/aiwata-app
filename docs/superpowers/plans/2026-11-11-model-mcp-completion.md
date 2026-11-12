# Model authorization, MCP management and composer completion

> **For agentic workers:** Use superpowers:executing-plans to implement sequentially. Keep all changes uncommitted as requested.

**Goal:** Let a signed-in local user configure model credentials, manage MCP connections, and select native composer completions without crossing account or Profile boundaries.

**Architecture:** Retain the account chooser, owned native gateway connections and existing dialog styles. Add a narrow capability bridge instead of exposing generic configuration RPC. Default Profile and owned Bot routes use their own native connection. Secrets stay transient in password inputs and native credential stores, never browser persistence. OAuth handles are bound to login, Profile and server, canceled on dismissal/logout. No new branch, commit, push or Docker environment.

**Tech Stack:** Existing React, Node bridge, native AIWATA RPC, Node tests and Chromium/Electron acceptance.

**Spec:** User-approved sequence and scope in this chat, plus docs/aiwata-integration.md “后续功能对齐范围”.

## Global constraints

- Preserve current uncommitted changes and source repository separation.
- Use current AIWATA native credential, MCP and completion contracts.
- User/account/Profile paths are resolved by server; never accept home paths.
- Preserve drafts on failure and ignore results from a previous account, Profile or input token.
- No side effects from listing, completion, or merely opening a dialog.

## Review focus

- Same-named Bot or MCP server under two users must remain independent.
- Credential failures must not echo secret contents or leave them in browser persistence.
- OAuth completion from an old login or removed/replaced server must not be accepted.
- Slow input completions must not overwrite newer typing; IME and keyboard send behavior remain intact.
- Native unsupported auth and external service failures must be visible, not simulated success.

## Task 1 — Model authorization

- [x] Add failing bridge tests for allowed native model operations, unexpected fields, own Profile routing and logout fencing.
- [x] Implement narrow capability bridge and route, with explicit safe response projections and credential error redaction.
- [x] Add provider manager from account menu and model picker. Support native catalog, password save, confirmed disconnect, retry, Profile selection and fresh inventory.
- [x] Verify real native save/disconnect with synthetic credentials in an independent temporary account environment. Verify account/Profile isolation and no credential echo.

## Task 2 — MCP management

- [x] Add failing bridge tests for MCP configuration, server identity, key field restrictions and OAuth handle ownership.
- [x] Extend capability bridge with catalog/list/status/add/key/test/remove and login-bound OAuth start/poll/cancel.
- [x] Add MCP management dialog with Profile selection, catalog and custom HTTP/stdio setup, test tool list, key and browser authorization, confirmed removal.
- [x] Verify using a local MCP fixture, including same server name across two users, Profile separation and logout/re-login denial.

## Task 3 — Input completions

- [x] Add failing tests for native completion replacement and boundary restrictions.
- [x] Add scoped slash/path completion bridge and React hook with request debouncing and stale-result fencing.
- [x] Reuse existing keyboard list UI; preserve group member mentions, IME and draft-first creation.
- [x] Browser verify slash/skill and file candidates, selection, cancellation and rapid typing, with no session creation before first send.

## Task 4 — Acceptance and documentation

- [x] Run npm test, npm run build and npm run test:sites.
- [x] Review changes with a fresh reviewer, resolve important issues and rerun affected checks.
- [x] Open live preview, record remaining external service boundaries, leave changes uncommitted.

## Ledger

- Planning: continue in existing workspace as requested; no branch or commits. Native capability APIs inspected before implementation.

- Task 1 complete — native synthetic credential save/disconnect, same-named Bot/account separation, browser password save/Profile switch/confirmed disconnect and no key in Web Storage verified.
- Task 2 complete — native stdio fixture add/probe/key/toggle/remove under two account scopes passed. OAuth handles fenced to login/Profile/server, and cross-login cancellation-before-mutation regression went RED→GREEN.
- Task 3 complete — native draft path/slash and actual skill expansion/reply passed; browser selected command/file/skill, created no session for completion, created exactly one on first send and restored the real reply. Quoted directory caret and trailing native command spaces have regression coverage.
- Final review — two P2 findings fixed. Draft slash uses the selected trusted project through the native helper. Server mutations cancel all matching login flows before changing config. Native cancel/commit race reproduced RED then fixed using existing atomic cancel helper; 38 relevant native tests and native health/ruff delta checks passed.
- Final review — transient OAuth polling now retries up to three times and offers manual recheck. Third-party OAuth provider validation remains external acceptance; a protocol fixture exercises the UI recovery path.
- Verification — 103 frontend tests, production build and four Sites checks passed. Existing main bundle size warning remains. No commits, branches, pushes or Docker containers were created.

- Final acceptance: fixed the no-service completion selector crash exposed by a saved group conversation. Regression covers absent service and stale connection/query results (RED→GREEN). Permanent two-account idle gateways reloaded; inventory retained and new management catalogs readable. The live IAB group restored, and its account menu opened the model authorization dialog.
