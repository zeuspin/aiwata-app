# Bot native feature alignment — 2026-11-12

Scope: source implementation only; no installed-App overwrite, branch, commit, push or container creation. Runtime remains original Electron/Agent/Profile/gateway/permissions.

## Implemented differences

- Bot editor reads the selected source/existing Bot Profile's original `model.options` directory. Catalog choices save provider plus model through the existing expensive-model confirmation protocol. Current configuration and manual custom entry remain usable if catalog discovery fails. A late catalog result cannot paint into another Profile.
- Each native Bot management row directly opens **完整技能、工具与 MCP 配置** on that Bot's connection/Profile using the existing native capabilities page. This preserves original skill installation/details/editing/uninstall, toolset parameter configuration, MCP configuration and authorization instead of claiming checkboxes cover those actions. **模型授权与高级设置** opens original settings on the same Bot owner. These are original native pages inside original App windows; no replacement Agent/service.
- Full native operations live outside the staged editor. Existing saves no longer rewrite untouched SOUL/description, so appearance changes do not silently overwrite settings edited elsewhere. Locked enabled skills remain enabled when their disabled checkbox is omitted from FormData.
- Native roster now includes a connection/base-Profile/target-Profile/revision/canonical snapshot identity. Bot delete re-reads the roster and refuses changed/missing identity before calling the original host REST delete (and its pooled-backend teardown); missing legacy companion identity no longer disables valid native Bots. Default/current Profile is refused, a non-ok delete is not success, settlement-pending is preserved, and the removed Bot's client socket/retry is released. This is a client snapshot preflight, not a new atomic backend deletion transaction; concurrent mutation after preflight follows the original backend contract.

## Verified automatically this batch

`node --test tests/native-bot-parity.test.mjs tests/native-bot-model-ui.test.mjs tests/native-desktop-client.test.mjs tests/native-settings-parity.test.mjs tests/bot-peeking.test.mjs tests/bot-transcript.test.mjs` — 32/32 passed before final socket cleanup; rerun result below.

New deletion identity and unchanged-field regression tests were observed failing before implementation. Catalog/configuration UI tests exercise real React components with a controlled native API; they do not constitute real provider authorization.

`esbuild` of `src/management.jsx` with browser platform and CSS empty — passed. Relevant `git diff --check` — passed.

## Existing functionality regression coverage

Canonical Bot creation/hidden exact-title lookup/resume, desktop source policy, routed server requests/replies, owner-scoped tool clients, native receipt recovery, terminal lifecycle, preview ownership, native group durable disband tombstone, avatars and group speaker identity remain exercised in the above existing tests. No Bot canonical identity was changed to a recency/session-pointer scheme.

## Remaining live acceptance

Do not claim every provider/OS permission matrix passed from these fixtures. Actual provider OAuth, real skill installs and toolset/MCP actions in native windows, external messaging and voice/Computer Use still depend on their real configuration/permissions. Native user isolation and final App build/integration acceptance are owned by the parent task. A full live Bot/group/persistent restart acceptance should use its isolated test users and original gateway, not real user chat content.

Final rerun after socket/retry release change: same six test files, **32/32 passed**, exit0, evidence `/tmp/aiwata-bot-final-tests.log` (local transient log). Final relevant diff whitespace check exit0.

## New Bot birth parity follow-up

Original `create-dialog.tsx` creates the canonical forever chat and requests `kickoff` only when the operation genuinely created a new agent. It checks `setup.runtime_check`, mounts the session first and uses localized `bot.kickoff`; ordinary roster reopening and canonical adoption do not request another introduction. The new App had omitted this flow.

Added a client-lifetime one-shot birth intent, armed only by the save that actually minted the Profile. Management navigates to its canonical chat after successful save. Native canonical open reports mint versus adoption; the workbench hydrates and paints the selected chat before running readiness and normal native prompt admission. A missing-model result, existing canonical adoption, retired owner, or subsequent reopen never starts an intro. The text exactly matches the original Chinese locale: “你好，介绍一下你自己吧！”. It is an original user-turn model request, not a synthetic assistant message. External submission preserves any composer draft and uses the existing durable submission/receipt recovery flow. Failed/unknown admission does not auto-repeat the birth intent.

`tests/native-bot-birth-ui.test.mjs` runs the real React workbench hook and workspace with controlled native transport: mounted stored session ID before `prompt.submit`, one admission, preserved draft, zero extra admissions after unmount/reopen. Helper tests cover readiness refusal, retired ownership and existing canonical adoption; native save tests prove only the actual mint reports `created`.

Final follow-up: eight related files **38/38 passed**, exit0, `/tmp/aiwata-bot-birth-tests.log`; management/workbench browser bundles and relevant diff whitespace checks passed. Actual provider intro generation is not claimed by these fixtures; parent native QA owns live acceptance.
