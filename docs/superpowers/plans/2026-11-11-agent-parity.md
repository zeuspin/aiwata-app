> 历史计划：用户已撤回自建 Computer Use 宿主/Provider 路线。该实现已在职责清理第一批退役，后续以 `2026-11-11-frontend-responsibility-reconciliation.md` 和 AGENTS.md 职责约定为准；不得据此继续启动、安装或重建该路线。

# Native AIWATA Agent capability parity

> Execution: implement in this workspace, with independent bounded tasks and final review. User explicitly requested execution; no commit, push, new branch or Docker creation.

**Goal:** Make the workbench use native Agent tools and desktop protocols faithfully, retaining account file/credential isolation. Native target: `6631a6af2c58fc498ef01fa5cc4b222fc8682683`.

**Architecture:** Keep the native Agent and its tool schemas/approvals. Port pure desktop engines as pinned independent artifacts, implement an ownership-fenced request/event adapter, and broker native Computer Use outside the file sandbox through an account-owned channel. The computer is the shared host desktop as requested; do not claim Profile-level GUI isolation. Never disable the existing file sandbox to enable desktop control.

**Authorization:** User accepted the parity audit and asked to start alignment, including Computer Use; clarified they want the same behavior as AIWATA/Hermes. Preserve original system permission and approval requirements.

## Tasks and validation

- [x] Native request lifecycle: capability handshake; one dispatcher for live/replayed requests; explicit unsupported replies; account/profile/session/request cancellation fences. Implement preview, terminal reading and desktop controls. Native secure input stays in transient cards and never enters persisted transcript.
- [x] Native desktop events: preview open/close, pane reveal, Agent process output/terminal close, message reactions. Support GUI Bot sessions; keep groups on native api_server/bot_room policy.
- [x] Browser contract: vendor native element/ref/delta/drive engine, support native schema navigation/input/annotation actions; retain trusted host, document ownership and cancellation checks.
- [x] Computer Use: reuse signed native CuaDriver and native ComputerUseBackend behind an account host broker; only the registered gateway PID may issue operations, with per-profile/session backend identity. Preserve native approval semantics, permissions and logout teardown. Expose readiness/errors in the workbench. No arbitrary executable or filesystem proxy API.
- [x] Qualified skills: accept native identifiers/completion syntax, keep native resolution authoritative; red/green contract tests.
- [x] Tools/background work: project native tools.show and session-owned process/subagent read/control APIs, with a reviewable activity surface; distinguish interrupt from stopping detached processes.
- [ ] Verify: focused behavior/isolation/cancellation tests, full suite, production build and Sites tests; native desktop end-to-end ordinary session and Bot, plus Computer Use when OS permissions permit. Record remaining native/backend limitations precisely.

## Review focus

- Logout or user/Profile switch during pending host operations must revoke the original account's channel and prevent delayed writeback.
- A stale element/request/turn cannot be replayed onto a new page or a different Bot.
- Model-facing advertised tools must have real adapters or explicit unavailable responses, never silent successful no-ops.
- Host desktop access must not grant unrestricted file/terminal access, disable TCC, bypass native approvals, or create containers.
- Preserve existing drafts, queued prompts, partial messages and user configuration while reloading idle owned services.

## Implemented scope and explicit limits

Theme/app-tour/setup-beat remain explicit unsupported responses; tips use workbench notifications. Native canonical request authority 4404 decline mismatch is not patched in the independent source tree. Computer Use is shared host desktop by user decision; TCC and actual native driver readiness still determine availability. Contract coverage is not a claim of full native product parity.
