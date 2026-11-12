# Virtual Users and Bot Parity Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the independent host, renderer and Bot tasks with review.

**Goal:** 在原生App中提供两个可选择的虚拟用户、用户名创建/删除及真实数据隔离，补齐Bot原生功能。
**Architecture:** 宿主控制稳定用户ID到独立原生home的映射，沿用原gateway ensure和typed bridge。用户所属固定到窗口/宿主运行实例，renderer按用户作用域连接；Bot复用现有原生模型、能力和Profile协议。
**Tech Stack:** 原Electron/TypeScript、React、Node测试及原Python后端。
**Spec:** docs/superpowers/specs/2026-11-12-users-bot-parity-design.md；2026-11-12用户补充批准删除测试用户时清理所属数据，不保留。

## Global Constraints
- 无注册/密码服务，两个初始虚拟用户，用户名创建、确认删除。
- 用户与Bot Profile不同层级；配置/凭据/会话/记忆/文件/连接/异步回调隔离。
- 删除只接受宿主登记的所属用户目录，不清理安装、工具或其他用户。撤销客户端并按原网关生命周期停止待删除用户的所属任务后清理；不能删除仍被其他窗口使用的目录。
- 不新建分支，不提交/推送，不创建容器；不覆盖当前安装App。
- 核心窄改、行为模块化；原生能力不能由独立Agent/工具实现替代。

## Review Focus
- 登记损坏与首次初始化的区别；删除最后用户后不复活。
- 创建/切换失败不能误入默认工作区，迟到事件不得跨用户。
- 用户名不作为路径；同名Bot跨用户仍隔离。
- 删除时窗口/网关/数据归属复核，禁止跟随恶意链接删除其他目录。
- Bot操作固定connection/Profile，模型/能力/删除不依赖旧联调身份字段。

### Task 1: Native local-user registry and owner-bound routing
**Files:** core apps/desktop/electron/desktop-local-users.ts (new), main.ts/preload.ts/src/global.d.ts; related tests.
**Produces:** hermesDesktop.localUsers.list/create/remove/activate and stable current-user metadata. Registry and home are host-owned; no arbitrary renderer paths.
- [x] Add failing behavior tests for two defaults, persistence, create/duplicate/corruption, delete confinement and activation ownership.
- [x] Implement registry and original-host activation; bind every capability to the selected user's native root without global scope changes affecting existing owners. If existing host makes per-window home switching unsafe, use a process-scoped original-host instance per home with narrow approved parent-owned launch intent, preserving original runtime and unrelated windows.
- [x] Verify contract tests and Electron typecheck; report exact APIs to renderer implementer.

### Task 2: Login selection and account lifecycle
**Files:** frontend src/local-users.mjs/local-user-login.jsx (new), App.jsx, native-runtime.mjs, tests/local-users*.test.mjs.
**Consumes:** Task1 typed localUsers API.
- [x] Add failing tests for initial choice, username create, confirm delete, error/retry and no automatic login.
- [x] Implement login selection using host registry/current user, owner-fenced activation and scoped cache. Mock mode uses clearly marked demo users and supports the same lifecycle without touching real data.
- [x] Verify UI and owner-switch tests. Update agreed behavior docs.

### Task 3: Bot native parity
**Files:** frontend src/management.jsx, native-desktop-client.mjs/native-desktop-settings.mjs and focused helpers/tests; narrow core nativeSurface changes if needed.
- [x] Add failing contracts for observed gaps: live model directory, full Profile capabilities routing, native deletion guard.
- [x] Implement original model picker and full skills/toolset/MCP operations with target Bot ownership; do not replace functionality with checkbox stand-ins. Preserve create/clone/SOUL/appearance/canonical/group behavior.
- [x] Verify related existing and new regressions and document native parity matrix (verified/mock/unverified).

### Task 4: Integrated verification and maintenance
- [x] Run frontend related/full suite with explicitly registered installed source (no auto-provision), native build and affected Electron tests/tsc, core scripts/check as required.
- [x] Inspect actual native two-user isolation with temp owned roots where available; record visual/tool limitations honestly.
- [x] Review immutable task delta against saved pre-edit files, correct findings and rerun focused checks.
- [x] Update spec, AGENTS and core054/new batch/current rules/state/inventory with actual results. No commit or installed-App overwrite.

执行记录：Task1/2/3已完成实现、先红后绿回归和独立复核；Task4完成自动矩阵及真实原生双用户验收。最后补丁为全局快捷键退出竞态，新增回归并定向重跑。默认安装不覆盖，未提交/推送。实测明细见 `docs/verification/2026-11-12-local-users-native-acceptance.md`。
