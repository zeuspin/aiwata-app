# AIWATA 工作台接入参考

原型通过浏览器存储按演示账号保存工作区。在当前独立工程中，所有请求均在本机模拟。接入依据是同级 `aiwata` 工程的当前检出版本。

| 工作台功能 | AIWATA 接口与原型边界 |
| --- | --- |
| 会话 | `tui_gateway/contracts/prompt_voice.py` 的 `prompt.submit`、`approval.respond`，`sessions.py` 的 `session.interrupt`，以及 `events.py` 的消息、工具、待办和子 Agent 事件。生产适配层需要处理持久会话、重连补齐、服务端请求和流结束。本地 mock 的响应、用量和执行进度是合成数据。 |
| 审批与追问 | `server_requests.py` 的 `approval`、`clarify` 和实际返回结构。项目目录信任、会话工作目录与工具审批分别处理。目录信任标记在此原型内保存，生产需要宿主目录授权与权限校验。 |
| 项目与目录 | `projects_pets.py` 的 `projects.*` 与 `sessions.py` 的 `session.create`、`session.cwd.set`。真实选择器、目录验证和文件系统访问由宿主实现。 |
| 输入 | `methods_complete.py` 的路径与模型候选、`methods_tools.py` 的斜杠指令、`web_routers/uploads.py` 与 `audio.py` 的上传和转写。原型按账号和会话在 IndexedDB 保存本机附件，发送时把文件内容交给本地 Mock。正式接入时由上传适配层将文件转成 Agent 可用的附件引用。录音使用浏览器接口，转写使用样例。 |
| Bot 与群聊 | `profiles_vault_complete_foreign_subagents.py` 的 `profiles.*`，以及 `groups_bot_relay.py` 的 `groups.create`、`groups.context`、`groups.send`、`groups.stop` 和 `groups.continue`。Mock 将成员消息用本地 `room.event` 包裹。自动分派使用固定规则演示。当前正式群聊接口支持创建时设置名单。修改已建群成员需要补服务接口或调整产品流程。 |
| 定时、连接器、技能和记忆 | `tools_commands.py` 的 `cron.manage`、`hermes_cli/web_routers` 下的任务、消息、技能、状态和配置接口。原型使用模拟运行记录、平台配置样例、技能和学习样例。实际启停与账号退出后的后台暂停需要 AIWATA 后端把账号与对应 Profile、任务和连接器绑定。 |
| 浏览器与文件 | `events.py` 的 `preview.open`、`server_requests.py` 的 `preview.act`，以及 `web_routers/files.py`。原型页面、批注、回放和产物为本地样例。生产的任意网页预览、元素定位和操作，需要 Electron 宿主的受控预览桥接及授权。 |
| 开发与媒体 | `web_routers/webapp.py` 的宿主终端、`web_routers/git.py` 的仓库与工作树接口。生图与图生图能力参照 `tools/image_generation_tool.py`，xAI 视频编辑参照 `tools/xai_video_tools.py`。供应商和媒体为模拟样例，画布和完整剪辑是 AIWATA 客户端功能。 |

## 账号与积分

应用账号、登录门禁与积分账本属于 AIWATA 产品层。原型按账号本地隔离。排队消息开始执行才扣托管积分，余额不足保留输入。会话、定时任务、生图及 AI 修图使用演示定价，供应商自有额度和手工编辑使用各自路径。接入时由 AIWATA 服务端统一负责会话授权、用量核算和幂等扣费。

## 安装与桌面启动

原型的 `/install` 预览首装流程，`/loading` 延长模拟启动进度以便查看。常规入口在应用加载时显示同一启动页。安装错误、打开桌面失败和启动失败可分别通过 `/install?scenario=failure`、`/install?scenario=launch-failure` 和 `/loading?scenario=failure` 预览。

| 阶段 | 接入方式 |
| --- | --- |
| 首次安装 | 将 `startup-screens.jsx`、`startup-state.mjs`、`startup.css` 和两个品牌 SVG 放入目标工程，按目标构建配置调整资产引用。Tauri 安装器沿用 `apps/bootstrap-installer/src/store.ts` 的 `startInstall`、`cancelInstall`、`openLogDir` 和原有模式分流。视图按 `stageOrder` 将 `stages[name].info`、状态、耗时和错误展平成数组，或直接用 `applyBootstrapEvent` 消费同名 `bootstrap` 事件。进度按清单完成和跳过的步骤计数。 |
| 打开桌面 | 安装完成事件只开放启动按钮。传入现有的 `$desktopLaunch` 和 `launchHermesDesktop`，由原生代码等待窗口回执及处理超时。安装器退出时机继续由原生交接控制。 |
| 应用启动 | 把现有 `$desktopBoot` 快照传给 `DesktopLoadingScreen`。主进程的 `getBootProgress` 和 `onBootProgress` 提供启动进度，渲染端补齐网关连接和配置加载，`completeDesktopBoot` 标记退出加载页。失败时复用现有的重试与日志动作。既有远程连接、升级等待、模型配置和引导仍由桌面启动控制器分流。 |

`startup-preview.jsx` 提供模拟事件和网页跳转，用于独立预览。Logo 的 `#draw` 片段启用贝塞尔路径绘制，系统开启减少动态效果时显示静态图形。
