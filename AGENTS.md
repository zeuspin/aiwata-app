# AIWATA Frontend Application Instructions

## 当前范围：选择性回滚071（用户明确，2026-11-16）

072补充：用户明确恢复C7双Dock修复，其余维持071；同时允许修复普通Bot流式更新导致标注截图/加入草稿被误判过期的问题。不得据此恢复其他已撤回功能。

仅在已提交基线1315678上保留A1会话气泡/头像、A2 Bot目录/分类、A3头像动效、A4可拖动头像栏、A5单Bot设置抽屉/紧凑管理、A6皇冠/默认外观、B1自然语言创建独立Bot及清单刷新、B2稳定归属/canonical空白页修复。A7为多写。其余未提交功能已撤回；不继续执行066恢复或070独立化/统一规范计划，不新增插件/语音/HUD/共享输入等实现。原生辅助页面恢复提交时的承载方式。此明确选择优先于历史全量迁移目标；保留原生权限、用户数据、分支/推送/Docker/安装边界。当前有效规范及本轮验证见相邻核心工程docs/aiwata/changes/2026-11-16-071-selective-rollback.md。

保留规则：最新单聊回复显示Bot状态头像，群聊保留实际作者；组合头像为用户加最多三个Bot。Bot分类为账号本机导航偏好。头像动效尊重减少动态与后台清理。设置抽屉保留当前聊天、草稿、关闭焦点、保存中和未保存保护。明确创建请求自动展开原技能；修改仅作用于新输入，历史显示原话，不覆盖用户自定义同名技能。删除校验token不作为稳定Bot身份。

## 工程内 Skills（用户约定，2026-11-12）

可复用的项目工作流保存在本工程 `.agents/skills/`，随源码迁移与维护；不要将本工程新增skill写入系统/用户全局skill目录。迁移时保留其SKILL.md、agents元数据及references。

- 打包、覆盖安装与清理：阅读 [.agents/skills/aiwata-macos-packaging/SKILL.md](.agents/skills/aiwata-macos-packaging/SKILL.md)。
- Hermes核心升级与跨会话交接：阅读 [.agents/skills/aiwata-core-upgrade/SKILL.md](.agents/skills/aiwata-core-upgrade/SKILL.md)，并核对 [2026-11-12交接基线](docs/handoffs/2026-11-12-hermes-core-upgrade.md)。

这些skill不扩大安装、数据、提交、分支、推送、Docker或运行体系变更授权。其他会话开始相关工作时先读对应skill和当前核心定制档案，历史基线不能替代实时核验。

## 工程职责约定（用户确认，2026-11-11）

`aiwata-app` 是 AIWATA 下一代前端应用工程，目标是完整替换当前基于 Hermes 的 AIWATA 前端应用。它承担现有客户端相同的功能和桌面宿主职责，不是仅供展示的网页原型或能力受限的聊天客户端。

- **界面职责**：会话、Bot、群聊、项目、模型配置、MCP、工具面板、审批、状态及相关交互。允许重新设计视觉和动线，不应因此丢失原客户端能力。
- **桌面宿主职责**：承接原客户端负责的原生窗口、内嵌浏览器、目录选择、DevTools、系统交互，以及服务启动、连接、重连和生命周期管理。优先复用 AIWATA 已有实现、共享模块和原生协议；不能以“保持前端干净”为由删除必要的宿主职责。
- **运行体系边界**：工程和源码仓库保持独立，不意味着另建一套 Agent 运行体系。沿用 AIWATA 原生 Agent、工具、Profile、权限和审批机制；不为适配新界面擅自增加改变原生能力的执行环境、替换 Computer Use Provider、覆盖配置加载逻辑或修改工具行为。
- **用户与 Profile 隔离目标（用户明确，2026-11-11）**：只要求目录、数据和运行作用域分离，避免不同账号或 Profile 的配置、模型凭据、会话、记忆、文件默认目录及连接串用；不要求阻止同一操作系统用户下的恶意跨目录访问。账号与 Bot Profile 是不同层级，应保持明确且稳定的所属关系。复用原生宿主、原生 Profile 和凭据作用域；切换、重连和异步回调必须校验原来的所属对象，不能套用当前选中对象。不要仅因存在多账号就增加 Seatbelt、容器、虚拟机或自建 Computer Use Provider；后续清理既有额外执行沙盒以这个已确认目标为准。目录分离不等于操作系统级权限隔离，不作该保证。原生审批、macOS 系统授权、正常身份鉴权和客户端所属关系检查继续保留。以后若需求升级为互不信任用户共用服务器的强隔离，再提醒用户确认新的后端/部署方案，不自行扩展。
- **一致性验收**：在相同后端版本、Profile、模型、配置和授权条件下，原客户端能完成的操作，新客户端也应能完成。出现差异时，先核对遗漏的协议、事件、配置映射和宿主能力，不先改造后端运行方式。明确区分已验证、模拟和未支持的能力。
- **Computer Use 排障基准**：先查清原应用成功操作时实际使用的工具、后端版本、依赖来源和宿主身份。不能仅因联调状态检查失败，就要求用户新装或重复授权 Cua Driver；也不能把浏览器自动化与 `computer_use` 专用工具当成同一条已验证链路。新增依赖或权限仍须按职责冲突规则单独确认。
- **职责冲突必须由用户确认**：发现现有代码、历史约定、新需求或拟议实现与本约定冲突，或需要改变前后端边界、原生运行体系、权限或用户隔离方式时，必须先提醒用户，说明具体冲突、影响和可选处理方式，由用户明确确认后再执行相关变更。不得自行决定例外，也不得把一般开发授权视为对此类变更的确认。可以继续不受冲突影响的只读核对和独立工作。

- **原宿主替换入口（用户批准，2026-11-12）**：原生开发与构建使用原 AIWATA Electron 宿主及后端，`aiwata-app` 为 renderer。原生模式不得加载独立联调网关插件、独立桌面预览宿主、模型授权覆盖器或 Python 功能伴随进程。纯 Mock 和显式历史恢复入口可保留，不混为正式运行链路。业务数据原地保留，未确认不迁移/合并账号和 Profile。已安装应用包替换与正式安装器验收分别记录。

本约定优先于本文件中将本工程称为 prototype 的历史描述，以及与本约定冲突的历史实现指示。历史代码不等于已批准的目标架构；本条本身不授权自动回滚、删除数据或修改运行环境。

Continue frontend development in `zeuspin/aiwata-app`. Keep this repository independent of the AIWATA agent and installer source trees.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Installer progress must retain a unified window/card when runtime component details expand. Use a sufficiently large default native window and keep any necessary scrolling within the right progress list, with the active step visible; do not let expanded details introduce a whole-page scrollbar or hide the language/cancel controls. Preserve the original native installation behavior.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

The production app will call Hermes services. For each feature that requires backend behavior, verify the required capabilities against the interfaces and behavior of the Hermes version the project will use. Tell the user when a feature requires a capability Hermes does not provide, which part is missing, and where it would need to be implemented. Identify mock behavior and unverified service support explicitly. Features handled entirely by the frontend do not require Hermes API support.

Preserve the leftmost module navigation's existing entries and account actions when changing icons, styling, browser tools, or backend integration. A backend capability that is unavailable or not yet integrated does not by itself authorize hiding or removing its product entry; explain the limitation and agree on the entry's behavior with the user. Use distinct names for this navigation, the adjacent context list, the right tool pane, and the browser toolbar, and identify the intended region before changing it.

Agreed UI region names: **主导航栏** (main navigation / `Rail`, `.rail`) is the leftmost vertical strip containing module entries, credits and the account menu; archived records are inside the account card. **上下文侧栏** (context sidebar / `ContextList`, `.context`) is the adjacent project, conversation or module list, including its temporary floating variant. **工具面板** (tool pane / `.tool-pane`) is the right workspace for browser, terminal, files and other tools, including its own tab strip. **浏览器工具栏** (browser toolbar / `.browser-bar`) is the controls inside a browser instance for its address, navigation, annotations, console and DevTools. Use these exact names in discussion and change scope; changing one region does not authorize changing another.
Keep existing main navigation entries in both mock and live modes. For an unintegrated capability, retain its entry and show an explicit unavailable/not-integrated status on activation; never present mock assets, profile data, balances or usage as real data. Label demo data in mock mode. Keep simulation-only actions visible with an explanation and disable them in live mode.

The reference desktop layout keeps the tool tab strip entirely within the tool pane's header. Tabs shrink to a readable minimum width, then scroll horizontally when the pointer is over the strip and the wheel moves. Hovering a tool tab displays a thumbnail rendered from the same session-scoped tool data as the main panel.

The workbench title bar has a sidebar toggle on the left and tool controls on the right. Back and forward controls belong inside the browser tool. In the desktop host, native window controls share the workbench's top row and follow the operating system's conventions on macOS and Windows.
Mac distribution uses the real native desktop at `/Applications/AIWATA.app` as the daily entry (user approved 2026-11-12). The distinctly named installer is for installation, upgrade and repair; do not restore an installer launcher at that public path. Preserve the original Electron/installer bundle IDs and account data. Stage and validate native bundles, retain recoverable publication state, refuse running or foreign-home replacements, and keep a complete owned installer for repair. Do not change global Dock preferences to conceal duplicate entries.
When native caption buttons are hidden in fullscreen, center the sidebar toggle exactly on the main navigation icons using the actual rail and toggle widths, rather than a fixed minimum left padding. Keep the sidebar toggle immediately after the native caption safe area. Place the guaranteed blank drag area after the toggle, so it does not double the visible gap from macOS traffic lights; preserve downstream tab alignment.
Consume the original host's window-control geometry and state: reserve macOS traffic lights and Windows/Linux caption controls, remeasure native overlays on resize/DPI/fullscreen changes, and render custom buttons only when the host requests them. Keep a draggable titlebar area and exclude interactive tabs/buttons from dragging. Do not change bundle IDs, hide the real desktop Dock entry, or alter global Dock preferences to disguise a launcher/desktop handoff problem.
The left list defaults to collapsed in narrow windows until the account has a saved preference. Opening it uses the normal split layout and slides the conversation area aside.
When the left list is collapsed, hovering Projects, Bots, Library, or Tasks opens that module's list in a temporary floating panel beside the rail. Clicking the icon holds the panel open for selection. Floating panels leave the current workspace layout in place.
Separate the platform-provided Skills, Connectors, and Memory modules from the first four rail items with a short horizontal rule. Keep archived conversations out of the project list. Put the “归档记录” entry inside the user avatar account card, not at the bottom of the main navigation. Read the owning workspace’s actual automatic cleanup policy and show retention time/maintenance conditions; automatic archive is not deletion, and a precise deletion timestamp must not be invented when the backend does not expose one.
New conversations start with tools collapsed. Restore the last saved tool view at any window width. In a narrow window, open tools take the conversation's place if the left list is open. With the left list collapsed, the tools and conversation share the available width.
Open a separate account-scoped draft page for New Chat. Default to the last valid project for the global entry and to the named project for its own add button. Let users click the composer project name to change projects, create a project, or choose no project in the draft and in older empty conversations. Promote the draft to a conversation only when its first prompt is admitted.
Double-click a conversation tab to temporarily collapse the left list and right tools, and double-click again to restore them from the saved layout. Double-click a tool tab to enter or leave the workbench's complete tool view.
Keep the clicked tab under the same pointer position during either double-click layout toggle when the available title bar space allows it.
Save panel widths per account after a completed divider drag and restore them on login. Fit widths to the current window without saving those temporary adjustments.
Use short vertical rules in the title bar at the boundaries between visible workbench panes. Separate the pane bodies by background color and keep their resize hit areas visually unobtrusive.
Keep equal space between the title bar dividers and the adjacent tab strips, including when the tabs are scrolled.
Show whole conversation tabs at the edges of the strip and reserve space for their bottom corner curves.

Conversation and tool tabs each have their own close menu. Closing conversation tabs preserves their messages and drafts. Users can delete ordinary conversations from the sidebar or a conversation tab after confirming the deletion.
Use Hermes Desktop's session actions menu as the reference for conversation actions, and distinguish sidebar operations from tab operations. The project prototype excludes fork, copy, and pin actions.

Show each project's persisted color or Emoji marker in place of its folder icon in the sidebar. Conversations inherit the marker from their project and show it only in their tabs. Show conversation status separately in both the sidebar and the tab. The close button on a conversation tab appears on hover or keyboard focus.
Click the project marker in either sidebar to choose and save a replacement directly. The project name remains a separate control for expanding the group or selecting its settings.
Create projects from the conversation sidebar. In project settings, list existing projects and let users rename a selected project, manage its working directories, or remove its grouping while retaining conversations and disk files. Directory access authorization belongs to the host.
Use the operating system folder picker when creating a project on desktop and in the macOS live preview. Allow multiple source folders, show the chosen folders as removable rows, and let the user set the primary folder before saving. Keep file upload controls out of this flow. Validate live paths against the current account's workspace. The mock browser preview records folder names as demo data and offers a name entry fallback when it cannot select a directory. Creating a project by itself does not create a conversation.
Place a labeled marker button beside the project name in the create dialog. Save the chosen marker with the new project, using the default color when no marker was chosen.
Conversation tabs use flat fills and show a marker in place of a leading icon. Compact tabs preserve the marker, the first visible part of the title, and the status.
Selected conversation and tool tabs use their respective pane's background and join its top edge with outward curves at both bottom corners.
The gap between tabs matches the gap below unselected tabs in both tab strips.
The title bar and left navigation rail show the same app background. Workbench pane corners are rounded only on the edge next to the left navigation rail or the right edge of the app. Adjacent panes meet at square corners. Keep a narrow inset along the bottom and right.
Use `public/aiwata-app-icon.svg` as the source for the app icon. Keep the black Bézier outline, white mark, orange square, and transparent padding from the approved reference.
Use the AIWATA app icon for the Projects navigation entry, sized to match the visible footprint of the other rail icons.
Use the horizontal vector logo in `public/aiwata-banner.svg` above the heading in empty conversations. Display the mark, orange divider, and wordmark on a transparent background.
Use the same banner when no conversation is open and on startup screens. Keep installer completion, desktop window handoff, and desktop runtime readiness separate.
The conversation list and tabs share Hermes Desktop's seven display states and precedence. Working, background, and stalled states use a rotating arc around the status dot; needs-input uses a static amber dot. Keep the indicator readable with reduced motion, and keep single-turn outcomes separate from the list state.

Open Bot editing on basic information, with separate sections for avatar and model capabilities. Keep drafts across sections and save them together. In avatar editing, keep a live preview alongside the controls, lead geometric editing with the silhouette, and separate portrait presets from custom fields. Generate ten portrait candidates with distinct hairstyles and strong hair-to-background contrast. Apply a candidate only when selected, then let the user refine it in the custom editor.
Use the rounded square Bot silhouette in black outline for Bot and group navigation. Its eyes blink or glance right at irregular intervals, with a static face when reduced motion is enabled. Stack up to four actual group member avatars tightly to the right on borderless tinted circles.

Keep the workbench runnable in pure mock mode. Use the checked-out AIWATA interface as the integration target for Hermes-backed features. Keep application identity and credits in the AIWATA product layer. Account data and panel widths are local and account-scoped. Lock the workspace while signed out or offline and pause admission on logout. Document which interactions require a native host or additional API work.

Model authorization and MCP management are scoped to the signed-in account and the selected default or Bot Profile. Keep credential values out of browser persistence and response projections. Bind unfinished MCP authorization to its login, Profile and server; cancel old flows across workbench logins before changing that server. Use native completion data for live drafts and sessions, including the selected project for draft skill discovery. Completion alone must not create a session.

Keep the mock Agent transport scoped to the signed-in workspace. Settle abandoned runs as interrupted and preserve partial output, drafts and queued messages. Fill a demo prompt only into an empty draft. Keep Agent requests and their action buttons visible above the message queue without depending on transcript scroll position.
Store local attachment contents in IndexedDB by account and conversation. Drafts, queued prompts, and sent messages reference the same file. Read the contents before admitting a mock prompt, and keep the draft or queue entry if reading fails.

Persist the mock browser's last page, back and forward history, saved annotations, and Agent replay state per account and conversation. Carrying an annotation into the Agent draft keeps the saved annotation on its page.
Autosave each webpage's unsent annotation text and target per account and conversation. Submitting an annotation clears only that page's draft.
Reuse the pinned AIWATA native browser annotation modules for point selection, dragged areas, stable blue numbered markers and numbered crop screenshots. Keep the independent snapshot and provenance under `src/vendor/aiwata-preview`; update it with `scripts/sync-browser-annotations.mjs`. Screenshots belong in account/conversation-scoped attachment storage, never localStorage. Keep each browser instance and page separate. Show the exact conversation, Bot or group recipient before adding the numbered notes/screenshots to its draft; adding must never send a message. Preserve saved annotations and existing draft contents. Cancel captures and pending writes on page, instance, account or component lifetime changes. Browser annotation is available in ordinary sessions, Bots and groups; this does not expose project-only tools to Bots or groups. Native page selection and screenshot capture require the desktop host; pure browser mock mode retains text annotations.
Preserve AIWATA's native page selection and screenshot machinery, while following the recorded Codex interaction described below for the note editor and control bar. Keep a visible exact-recipient label with one-click add-to-draft, continuous marking after save and the webpage's full dimensions. After adding, clear the active marker stack while retaining saved evidence.
Do not show Agent replay in the browser toolbar. Follow AIWATA's terminal glyph for the preview console and bug glyph for the actual webpage's DevTools. Console logs are bounded runtime-only data, isolated by login/account/conversation/browser instance, with selection, copy, clear and adding evidence to the exact recipient's draft without sending. Add selected logs when a selection exists, otherwise add all current logs; enable this action whenever logs and a valid recipient exist. The compact console shows webpage runtime logs and load failures; full network, DOM/CSS and breakpoint debugging belong in DevTools. Open DevTools only for the current owned webview, and keep its button state synchronized with native opened/closed events.

Autosave canvas notes, image retouch settings, and clip trim bounds and playhead per account and conversation. Restore the clip preview paused after sign-in.
Autosave the AI video editor's provider, source URL, and description per account and conversation.

Autosave image generation drafts and the latest result, mock terminal command history and output, and mock Git worktrees and their separate staging states per account and conversation.

Autosave the Files & Artifacts filter and selected file per account and conversation. If the saved selection is unavailable, preview the first file in the current filter or show the empty state.
Restore file and Git diff reading positions by file, with a separate Git position per worktree. Keep a separate reading position for the conversation's terminal output and follow new output while at the bottom.

Persist open tool tabs, their order, the active tab, and the collapsed, split, or full tool view per account and conversation. Responsive layout changes only how the saved view is displayed.

In desktop workbench sessions, expose AIWATA's native `desktop_preview` and `drive_preview` tools directly to the model. Requests to use the embedded browser must operate the conversation's owned webview. A valid `preview.open` event navigates and reveals that browser in the viewed conversation; background events must not steal the active tab or conversation. Do not substitute standalone Chromium installation for this flow.

Persist the selected navigation module, sidebar visibility, and collapsed project groups per account.
Persist the selected sidebar item or conversation, sidebar search, and list scroll offset separately per account and module.
Persist main-page search, scroll offset, and selected Profile separately per account and module. Use the default Profile if the saved Profile is unavailable.
Persist manual disclosure states for task run histories and connector logs per account, module, and group. Scope each connector log group to its Profile and platform.
Persist each transcript's reading position per account and conversation. Follow incoming messages while the reader is at the bottom and keep the reading position while they are viewing history.

Bot private chats show their Profile identity, role and model. Keep Profile ID and capability settings under advanced settings. Link to the existing Skills, Connectors, Memory and Tasks views scoped to that Profile.
Default Bot avatars use recognizable character shapes and expressions. Derive motion from the actual private conversation or room member state. Preserve uploaded portraits and keep states recognizable with reduced motion.
Use AIWATA Desktop's New Bot silhouettes as the reference for the avatar picker. Allow independent silhouette, body color, eye color and eye shape choices with a live preview. Keep an uploaded picture available when the user switches back to a character.
Keep the geometric Bot avatar series alongside the human portraits. Human presets depict adults aged 20–40 in flat SVG layers with solid bean-shaped eyes that can animate independently.
The human avatar generator composes hair, accessories, face shape, skin tone, hair color, eye color, clothing color and background color. Allow random generation followed by individual adjustments. Persist the selected parts with the Bot.
Add a separate face-focused peeking avatar series alongside the existing human portraits. The user's uploaded “截屏2026-11-11 上午11.05.55.png” supersedes the initial “轻巧探头” sheet for face scale and framing: show the entire face, both cheeks and chin, use a tilted close-up entering from the left, and allow a small amount of neck and shoulder at the lower left to establish the pose. Outer hair may crop against the left or top edge. Use dark flat bases with bright highlights, two-tone layered hair, solid bean eyes and subtle cheeks. Preserve recognizable source features when adapting a portrait. Randomize hairstyles, headwear/hair ornaments, accessories, skin tone, hair color and background, emphasizing hair and headwear variety. Include clever Eastern character motifs such as Zhuge Liang-inspired guanjin, scholar headwraps and hairpins as stylized interpretations rather than historical reconstructions.
Keep peeking avatars as structured, independently recolorable parts. Hair silhouettes and headwear are the main visual identity: extend their variety through distinct shapes, not color-only duplicates. Keep headwear compatibility and attachment points explicit. Support locking parts before random generation, invalidate stale candidates when parts or locks change, and apply a generated candidate only when selected. The part schema and extension rules are documented in `docs/peeking-avatar-parts.md`.
Group conversations show their roster, routing and member activity in the conversation. Support keyboard member mentions and quoted replies within the same discussion. Keep approvals, retry, stop and continue in the conversation. Gateway-hosted group membership is set at creation; allow editing room name, purpose, notes and routing afterwards.
Bot and group transcripts follow AIWATA's conversational rows: actual speaker avatar, name and available source timestamp above the body. Historical avatars stay still; active members show their own live avatar and reply state. Quoted reply is a lightweight hover/focus action, always visible on touch devices. Resolve avatars and readable mentions only from the current account's Bot identities. Preserve model text verbatim; standalone `(通过)` is model text, never a system approval or acceptance result. Native passed turns mean the member has no additional contribution.
In Bot and group conversations, the user's own messages, metadata and avatar align to the right; Bot replies align to the left. Keep the user's bubble text left-aligned for reading and preserve accessible quoted replies.

The tool-tab add button and new-tab context action always create a distinct browser instance on the start page, with the existing tool launchers, instead of a dropdown. Do not navigate or reset another browser when adding one. Ordinary webpage links reveal and navigate the active browser, otherwise the last browser in that conversation. The tools command also creates a start-page browser. Each browser owns its history, annotations, annotation drafts and replay state. The terminal launcher creates a distinct terminal with separate command history, output and reading position. Keep rename, close, order and persistence keyed by instance ID. Match the checked-out AIWATA desktop's per-tool policy; its file previews reuse the same canonical path within one conversation. Other prototype tool panels remain singletons until their plugin's instance policy is verified.
Selected rail icons use black filled shapes; open-line icons use heavier black strokes. The Projects logo uses a white base without an outer stroke, black mark and orange square when unselected, and the approved black-base app icon when selected. Preserve the source logo geometry and transparent padding.

Browser annotation interaction follows the user-supplied Codex recording (2026-11-11 15:37): selection-style toolbar glyph with persistent pale-blue active state; clicking again releases selection. Use a white single-line note capsule with microphone input and a circular check action. Show a draggable dark control bar near the bottom of the preview with count, hide/show annotations, clear, add-to-draft and close actions. Hiding marks preserves saved evidence; sending names the exact receiving conversation/Bot/group inline and adds to its draft in one click, without a second confirmation. Reuse AIWATA speech transcription without inventing a live transcript, and cancel recording on target/page/account changes.

Annotation numbers start at 1 in each new browser and each fresh pending batch after a successful add-to-draft. Keep numbers stable within an unfinished batch after removal. Retain delivered evidence with its original number/ID; restarting a batch must not overwrite old images or drafts. The floating bar names the exact recipient before its one-click Send action; Send appends notes/images to that input draft without an interstitial confirmation or automatic model submission.

Browser tool tabs follow the loaded webpage like Chrome tabs: use its native page title and favicon, refresh them on navigation/history/dynamic changes, and use hostname plus a generic browser glyph when metadata is unavailable. Home remains “浏览器”. Keep explicit user-renamed tab titles. Persist metadata by account/conversation/browser instance and use it in tab previews and close/menu labels. Never request remote page icons from the workbench renderer: read only native-reported icons through the owned guest's constrained session, enforce image/size limits, return inline image data, and discard stale document/account results.

Agent capability alignment targets the checked-out AIWATA runtime, including its native tool schemas, approvals, desktop server requests and background process/subagent lifecycle. Keep actual available tools inspectable; never represent a missing adapter or denied operation as success. Computer Use must follow AIWATA's native implementation and authorization flow. Preserve macOS TCC, native approvals and account data/credential boundaries. The custom workbench Computer Use broker, Provider and sandbox-specific configuration overrides are historical experimental implementations, not approved architectural requirements; assess their disposition against the engineering responsibility agreement above and obtain the user's confirmation for conflicts before changing them. Ordinary GUI and Bot GUI sessions use their native desktop bridges; groups retain AIWATA's api_server/bot_room policy rather than receiving GUI tools automatically.

## 本机虚拟用户需求（用户明确，2026-11-12）

登录页无需注册，默认提供两个虚拟用户供选择；支持输入用户名创建用户及删除用户。账号与Bot Profile继续保持上下层关系，数据/配置/凭据/会话/记忆/默认文件目录/连接必须按用户实际分离，不能仅复制前端账号对象来模拟隔离。原生接入固定单个AIWATA账号与自动登录不再满足此需求。用户已批准执行 `docs/superpowers/specs/2026-11-12-users-bot-parity-design.md`，明确这些为测试数据：确认删除用户后清理其所属测试数据，不保留。删除必须受原生登记、运行租约和网关停机约束，不清理其他用户或共享安装/依赖。原宿主按用户独立home启动自己的Electron实例；快捷键归属于最后聚焦的用户，登录选择窗口不占用用户快捷键。

本机虚拟用户不提供远端身份认证；以后接入远端登录服务时，沿用稳定用户ID与用户/Bot分层，并另行定义服务器鉴权与部署边界。当前验证范围见 `docs/verification/2026-11-12-local-users-native-acceptance.md`。

退出工作区后的当前用户删除由其所属原生父实例完成：子实例只请求删除自身，父实例正常退出该子实例、停止所属网关并清理数据；父实例已断开时显示恢复提示。父窗口保留可见的成功/失败结果，子窗口在退出前显示清理进度，不提前宣称数据已删除。

## 项目与默认Bot（用户明确，2026-11-12）

上下文侧栏必须区分项目内和无项目聊天：项目及其聊天使用同一色标，无项目聊天显示中性会话图标并分组。新建项目随机非空颜色，可用预设色或原生色盘自定义，不提供emoji标记。原生默认Profile必须可作为AIWATA欢迎Bot进入，完整复用原生Agent能力及唯一Bot Chat，不另建弱化运行体系；沿用已配置名称及配置，首次真正创建canonical聊天才触发原有介绍。
