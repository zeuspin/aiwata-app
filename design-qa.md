# Browser annotation interaction QA — 2026-11-11

final result: passed (requested annotation components and interaction scope)

Reference: `/Users/xuke/Desktop/录屏2026-11-11 下午3.37.40.mov`, 52.83s, 774×1148. Inspected contact sheet and frames 2/12/28/39s. The workbench shell remains AIWATA; this is a component/interaction adaptation, not a full browser/window clone.

Evidence: native desktop screenshot `/tmp/aiwata-annotation-white-capsule.jpg` (2560×1600 @2x), recipient screenshot `/tmp/aiwata-annotation-recipient.jpg`, combined comparison `/tmp/aiwata-annotation-ref/component-comparison.jpg` (native component crops normalized @1x). Whole-page content wraps differently because tool pane is narrower than reference. Component comparisons use same density, light theme, note-open and marking modes; count/selected target differ. No claim of full-viewport pixel equivalence.

- White 280×44 capsule, microphone, circular check, native blue numbered element/area marks: matched to reference anatomy. Empty confirmation is now disabled, matching recorded empty state.
- Pressed selection glyph has persistent pale-blue fill. Clicking again releases selection, removes bottom controls and preserves saved evidence.
- Dark bottom bar with grip/count/hide/clear/blue send/close: compact version of requested controls. Extra reference buttons outside the requested scope were not introduced.
- Native CUA exercised element pick, text entry, save, hide/restore, drag from bottom to top, recipient confirmation, atomic note+image addition into the exact group draft. No message sent. Only own initial QA draft cleared; subsequent user `test` draft left intact.
- Review found popup could escape top of pane after dragging: now flips direction and caps height using available space. Drag termination handles pointer/mouse release, Escape and blur.
- Dictation tests cover current Profile, cancellation, no late transcript, provider-unavailable before microphone request and track release. Actual microphone/provider transcription has not been exercised; it remains a live integration acceptance item.

No remaining P0/P1/P2 visual issues observed in the requested annotation scope. Selection glyph is the closest existing Tabler pointer/click icon; it is not the proprietary Codex vector. DevTools window lifecycle is tracked separately and is not asserted passing by this report.

## Follow-up: numbering and one-click draft handoff

The user's latest feedback supersedes the recipient-confirmation popup above. The toolbar now displays the exact destination inline; Send immediately performs the same atomic draft append, disables during writing, and focuses the current destination input. No confirmation dialog remains.

Native CUA verified a new independent browser tag starts at Comment 1, one click appends text/image to the ordinary conversation draft, and selecting the next batch after delivery displays Comment 1 again. The model Send-message button was not clicked. Own QA draft and attachment were cleared afterward. Evidence: `/tmp/aiwata-annotation-one-click.jpg`.

Regression tests cover independent browser numbering, reset after delivery, old-counter migration, unchanged archived screenshots and IDs, collision-safe attachment names and partially delivered batches retaining their sequence. Same-batch deletions still do not recycle numbers. Current npm test: 186 passed; build and Sites checks passed.

final result: passed

## Follow-up: native DevTools and console handoff verified

Restarted the stale Electron host to load the explicit owned DevTools frontend. CUA observed the real DevTools window with Elements/Styles and Console panels, generated the non-sensitive `AIWATA_CONSOLE_QA` warning in example.com, closed the window and opened it again successfully. DevTools screenshot: `/tmp/aiwata-devtools-verified.jpg`.

Console toolbar now adds selected logs when selected, otherwise all current logs. Verified both logs were unselected, Add-all was enabled, and one click populated the exact ordinary conversation draft including the native QA warning. No model message was sent; own QA draft cleared. Console screenshot: `/tmp/aiwata-console-send-verified.jpg`. Temporary host diagnostics removed from source. This supersedes the previously deferred DevTools desktop acceptance item.

## Follow-up: browser tab page identity

Native desktop confirmed the Taobao tab shows the real orange favicon and “淘宝” page title, while a separate tab retains “Example Domain”. Switching between them restores each tab's own URL/title; generic icon fallback is used for a page without a usable favicon. Tab context/close and hover-preview headings share the same metadata. Explicit custom tab names take priority. Evidence: `/tmp/aiwata-browser-tab-identity.jpg`.

191 tests pass, including stale navigation metadata, persistence and independent browser identity, exact native favicon ownership, late epoch results, bounded image reads and rejection of non-image responses. Build and Sites checks pass. Favicon/title handling uses Electron native events and the current guest's constrained session; no new Hermes endpoint is required.

final result: passed
## 2026-11-11 会话驱动内嵌浏览器

- 修复两个实际断点：原生网页工具被延迟搜索隐藏；实时 `preview.open` 只创建链接卡片，没有导航并展开网页。
- 隔离工作台 Profile 使用原生 `tools.tool_search.defer` 和顶层 `platform_hints.desktop.append` 配置，让模型直接获知内嵌浏览器工具；保留用户说明及其他延迟工具，不修改用户消息。实际 `session.resume.info` 确认两项工具可见且环境说明已进入 system prompt。
- macOS Electron + 当前账号 GLM-5.3 实测输入原句「使用内嵌浏览器 打开 百度 搜索 aiwata」。实际工具链为 `desktop_preview(open)` → `drive_preview(elements)` → `drive_preview(type, text=aiwata, submit=true)` → `desktop_preview(read)`，百度结果 URL 含 `wd=aiwata`，网页搜索框为 aiwata，原生标签显示百度图标和页面标题。没有使用 terminal／browser_exec 完成这次成功验收。
- 模型额外尝试的 `drive_preview(reload)` 仍被现有限定动作集明确拒绝；随后成功读取结果。此次没有扩展所有上游动作的支持范围。
- 证据：`/tmp/aiwata-embedded-baidu-search.jpg`。页面保留供继续调试。早先失败的测试会话仍保留，错误执行已通过会话中止／所属进程停止处理；未清理其他账号或项目。
- 验证：前端 192/192；原生配置／模型隔离 10/10；Sites 4/4；production build 通过，`git diff --check` 通过。代码未提交。

### 2026-11-11：原生 Agent 能力链路

目标 AIWATA `6631a6af2c`，macOS Electron + 隔离入口 4181 + 已配置 GLM-5.3。普通会话与 `isolation-check` Bot 均通过真实模型调用 `desktop_preview`、`drive_preview`：打开百度、读取稳定元素引用、输入 `aiwata`、提交并读取结果；实际 webview 显示百度结果页、对应标题与 favicon。另核对了 Bot Profile 自己的原生 state.db 工具回执；普通会话网页未被 Bot 导航覆盖。

「Agent 能力与任务」实际读取 35 项原生工具，包含 Computer Use、桌面工具、技能和委派；后台页正确显示当前没有任务。Computer Use 状态显示签名驱动已安装、账号通道已连接，原生授权按钮可用；未擅自点击授权。

Computer Use 的真实 `list_windows` 返回 10 个本机窗口，包括 Google Chrome，已核对原生工具回执而非仅相信模型的总结。进一步捕获 Chrome 的 AX 与 SOM 均返回 0×0、0 元素、无图像，因此整机浏览器搜索尚未通过验收，未进行点击或输入、未改系统权限。第一次完整测试收到显式停止而中断；在用户同意继续后重试并记录上述捕获结果。模型将其解释为授权问题；这是当前诊断方向，不将空捕获等同于已证实的 TCC 状态。

本轮未创建或重建容器，未新建分支，未提交或推送。保留用户已有聊天、草稿、项目与浏览器；新增验收消息和对应浏览器结果页供复核。

Bot 文件面板返回账号自己的 `projects/验收项目`；Bot 新建交互终端实际执行 `pwd`，输出 `/Users/xuke/.aiwata-app-isolated/lin/projects`。验收后关闭终端和新开的空白浏览器，保留百度结果页与文件面板。配置路径竞态防护追加后完整测试仍为 254/254；其中 broker 子测试包含 25 项 Python 原生合同。


### 2026-11-11：职责清理第一批（替代上述自建 Computer Use 路线）

保留现有界面和存储，退役自建 broker/Provider/安装器及其配置替换，恢复三份联调 Profile 的本轮配置字段。模型授权来源保留。恢复点位于 `~/.aiwata-app-recovery/frontend-responsibility-2026-11-11/`，通过 SQLite backup API 备份且 quick_check=ok；清理后消息内容与备份一致，sessions/messages 仍为 default 7/397、bot-33185c67-b15 3/12、isolation-check 3/26。

4181 原生网关启动后，浏览器工作台登录成功，原会话、Bot 头像、历史消息和 tabs 可见。默认 Profile 与 Bot 面板均经真实原生 HTTP API 返回状态：原生服务已连接、当前运行环境驱动未安装、系统权限未知；未点击授权、未安装或启动替代驱动、未发送模型请求。普通网页本来不具备 Electron webview，未以网页预览禁用状态认定桌面功能丢失。本轮未重新执行整机电脑操作；既有沙盒/原生宿主环境差异需按职责约定另行确认。

验证：257/257 项测试、Sites 4/4、生产构建、diff 检查通过。构建保留原有大 chunk 提示。活动运行配置不再引用 workbench-computer-use，插件和旧脚本可从本机恢复目录找回；没有提交或推送。


### 原生客户端职责对齐 · 第二批（2026-11-11）

- 保留原界面、数据根、账号/Profile ID、存储 key。依赖从原生启动器/PM 发现，账号目录与共享工具安装分离；撤除额外网关/Git Seatbelt，自建 Computer Use 体系继续退役。Electron renderer sandbox 和可信 IPC 检查保留。
- 真实 macOS 系统文件夹选择器打开，选择工程目录后表单显示路径、自动填入 `aiwata-app`，取消未创建项目。原 Swift 编译选择器退役。
- 新聊天先进入草稿页，提交后才新增会话；本轮实际自然语言浏览器请求已完成百度搜索，标题/favicon/搜索框可见，数据库工具回执为 `desktop_preview`、`drive_preview`，未使用安装器或终端替代。
- Bot 私聊返回 `NATIVE_BOT_PROFILE_OK`；群聊 @isolation-check 返回 `NATIVE_GROUP_PROFILE_OK`，仅指定成员参与，无自动续聊。
- 原生文件预览、模型/MCP 读取、真实 PTY 输出及当前目录已验证。网页 DevTools 独立窗口可打开；预览控制台单条日志直接加入明确对象草稿，测试草稿已清空。
- lin/qiao 可见会话无交集；外账号会话/Profile 请求被拒绝，退出 token401。4 个 Profile 数据库共454条原始消息内容/工具字段均未变，无原始消息删除，新增仅为验收；quick_check 均为 ok。
- 新增的主题/初始化卡片、原生导览接线有专项合同验证；完整外观模型端到端、原客户端全部布局和跨平台桌面验收没有宣称通过。导航回归发现并修复了导览清理访问已卸载 webview 的错误。
- 原生状态已识别现有 Cua Driver0.21，辅助功能和屏幕录制仍为 false；未安装软件或授予权限，因此不宣称完整 Computer Use 点击/截图成功。
- 检查：npm test268/268、生产构建、Sites4/4、dist三制品、diff检查。最终独立复核结果另记。

### 2026-11-12：原宿主窗口控制区（047）

新前端复用原宿主的标题栏常量和窗口事件，macOS 预留交通灯，Windows/Linux 测量 native overlay，WSLg 按宿主声明提供自定义按钮。加载、登录和错误页保留拖动和所需的自定义控制，不向窗口 IPC 传入 React 事件。

实际 macOS 签名原宿主（临时副本，独立 renderer 数据）通过侧栏切换、系统全屏及恢复。八种跨平台/尺寸的真实组件模拟布局无系统控制区侵入，工具标题区与面板对齐；四种全屏和 WSLg 加载/失败页控制通过。Windows/Linux 尚无实机验收。临时 App 已退出、注销并删除；当前安装和数据未覆盖。

应用测试290项、Sites4项、mock/native构建通过；原宿主窗口专项30项、安装器Rust128项通过（2项忽略）。Dock 另一个同名入口来自安装器的近期使用身份；安装器仅在桌面接手后隐藏运行图标，系统近期入口仍可能保留。公共安装入口统一方案涉及分发/升级策略，待用户确认，不以修改全局 Dock 偏好掩盖。

### 2026-11-12：默认覆盖安装与标题栏留白（049–050）

用户授权后，从048真实DMG覆盖默认安装，原1条会话/2条消息逐行一致，配置/凭据文件元数据未变。用户确认Dock只有一个AIWATA、系统按钮不再重叠，同时指出侧栏开关留白过多。

将额外24px原生拖动区域从开关前移到开关后；系统安全区与Tab总宽度不变。实际组件模拟测量：开关x110→86，系统占位右界72，间距38→14；Tab x379不变。Windows/WSLg左侧14，右控制区144保留。应用290测试及native构建通过。

050新DMG已实际覆盖默认安装，19个已安装renderer文件与编译产物相同；重开后主进程和Dock项均1，数据仍完整、数据库健康。原生UI工具在原地替换后有应用身份缓存问题，因此真实无重叠与Dock视觉由用户确认，模拟图明确标记，不冒充原生截图。App留在运行状态，代码未提交。

## 2026-11-12 · 051 全屏侧栏开关对齐

用户原生全屏截图显示开关中心偏右。真实Workbench/CSS模拟宿主：修改前开关中心29px，主导航栏中心25px；修改后均为25px。普通窗口开关x86和Tab左界379保持不变。截图为模拟全屏布局验证，不冒充原生截图。native构建、051DMG及签名通过，实际默认目录覆盖完成；安装后19文件一致，原1会话/2消息及配置元数据不变，Dock记录一个AIWATA，桌面一个主进程。未提交代码。详见原AIWATA档案051及私有制品verification.json。
