# AIWATA API prototype implementation plan

**Goal** — Implement the approved AIWATA workflows in the current workbench using local simulation.

**Architecture** — Keep React, Vite and the account-scoped workspace. Project AIWATA gateway events into session UI through a local adapter, and keep application sign-in and credit admission at the workspace boundary. Use separate UI modules for composer, management and tool surfaces.

**Constraints** — Preserve the existing workbench and native shell layout. Keep the project frontend-only. Use the checked-out AIWATA API definitions as the integration reference. Preserve per-account data and width preferences.

- [x] Verify event and command names against `tui_gateway/contracts`; add behavior coverage for approvals, queue admission and interruption.
- [x] Replace the fixed-reply path with streamed local events and render activity, requests, subagents and task progress. Keep failed and interrupted results in the transcript.
- [x] Extend the composer and add account-scoped project, Bot, group, schedule, connector, skill and memory management.
- [x] Extend the right pane with browser annotations and Agent actions, files and artifacts, terminal and Git, and capability-sensitive media tools.
- [x] Exercise normal and adverse flows in the browser, including account switching, draft isolation, low balance and narrow panels. Record API boundaries and unsupported capabilities.
