# AIWATA 工作台接入参考

## 2026-11-12：原宿主替换入口

当前原生开发入口统一为 `npm run dev:aiwata`，`dev:native` / `dev:desktop` 为别名。原应用宿主加载新 renderer，复用原后端、原 Profile/凭据和 `hermesDesktop`。`src/native-desktop-entry.mjs` 引入原 HermesGateway；`native-desktop-client` 负责界面请求形状、连接/Profile 绑定和回执恢复。浏览器沿用原分区函数、活动令牌、输入通道、截图与 DevTools；终端沿用原 PTY，renderer 只保留有限滚动缓存。

原工程默认开发/桌面构建入口已指向独立的 aiwata-app。已安装应用包未原地修改；当前运行通过已有宿主支持的 renderer URL 加载。正式打包、签名、安装器与升级包尚未验收。

本轮实测：同一原网关真实 GLM 回答、原生系统目录选择及选中后表单更新、内嵌网页标题及 Agent 读取当前预览的回调、DevTools、标注编号/截图/添加草稿、真实 PTY 与切换后的输出保留。Retina 裁剪通过带 viewport 的原宿主截图接口修正。百度搜索遇验证码已停止，不计作搜索通过。Bot/群聊的本轮完整真实对话和专用 Computer Use 尚未验收。

明确缺口：原生前端接口尚未向此 renderer 暴露原私有联调桥的图像编辑、视频编辑、记忆待写审批列表和手动新增记忆。UI 保留，明确不可用；待审批缺失不能显示为「没有待审批」。技能整理的原生接口是真实后台运行，不能拿它模拟预览。原生窗口的 Quick Entry、overlay、弹出窗口、来源切换、系统主题/窗口控制等辅助流程仍需逐项移植验收，主窗口运行不等于全量前端已经替代。补接口需要在原 AIWATA 的客户端契约层处理；不在本工程另写 Agent 工具或执行服务。

以下内容为原独立联调入口的历史说明和验收记录，不代表新替换链路已通过。


默认预览通过浏览器存储按演示账号保存模拟工作区。`npm run dev:live` 使用独立的本机 AIWATA 数据根，真实连接项目、会话、Agent 消息和附件、Bot、群聊、定时任务、技能工具、记忆与学习及消息连接器。以下表格列出各模块的接口和演示边界，已完成的联调验收见 [实时网关计划](superpowers/plans/2026-11-11-live-aiwata.md)。

| 工作台功能 | AIWATA 接口与原型边界 |
| --- | --- |
| 会话 | `tui_gateway/contracts/prompt_voice.py` 的 `prompt.submit`、`approval.respond`，`sessions.py` 的 `session.interrupt`，以及 `events.py` 的消息、工具、待办和子 Agent 事件。生产适配层需要处理持久会话、重连补齐、服务端请求和流结束。本地 mock 的响应、用量和执行进度是合成数据。 |
| 会话模型 | 实时工作台从所属账号和 Profile 的 `model.options` 读取模型清单。新聊天的选择保存在草稿，首次发送时随 `session.create` 提交，创建请求与选择一起保留以便响应丢失后重试。已有会话和 Bot 私聊使用 `session.mutate` 的 `model` 操作，携带版本和执行代次，按原生返回的确认令牌完成需要确认的切换。支持恢复档案默认模型。Bot 私聊的选择限定在该会话，群聊沿用成员自己的模型。 |
| 审批与追问 | `server_requests.py` 的 `approval`、`clarify` 和实际返回结构。项目目录信任、会话工作目录与工具审批分别处理。目录信任标记在此原型内保存，生产需要宿主目录授权与权限校验。 |
| 审批方式 | 实时输入框使用所属网关的 `config.get/set` 读取和保存 Profile 的 `approvals.mode`，沿用 AIWATA 原生的手动、智能和关闭方式。配置影响该 Profile 后续的终端审批检查。Bot 私聊使用自己的 Profile，群聊沿用各成员的设置。保存后显示网关确认的值，切换会话或重连后重新读取。桥接仅开放这个配置键。 |
| 项目与目录 | `projects_pets.py` 提供 `projects.create`、`projects.update`（名称及 `color`、`icon`）、`projects.add_folder`、`projects.set_primary`、`projects.remove_folder` 和 `projects.delete`。接入时可将单选标记写入一个外观字段，另一个传空字符串。AIWATA 桌面目前按 Codicon 名称渲染 `icon`，要在桌面端复用 Emoji 需扩展其标记渲染。会话工作目录参照 `sessions.py` 的 `session.create` 和 `session.cwd.set`。项目接口的目录关联不授予文件访问权限，真实目录选择、校验和授权由宿主实现。 |
| 输入 | 普通会话的附件已接入原生暂存，群聊使用房间附件接口。路径、模型和斜杠指令的候选可对照 `methods_complete.py` 与 `methods_tools.py`。实时模式按账号与 Profile 复用 `/api/audio/transcribe` 的原生处理器，录音上限为 25 MiB。未配置提供方时，在请求麦克风授权前提示原因。转写追加到草稿，录音临时文件在成功、失败和取消时清理。Mock 模式仍使用样例转写。 |
| Bot 与群聊 | `profiles_vault_complete_foreign_subagents.py` 提供档案和头像接口。实时预览按账号读取真实 Profile 与私聊，删除复用 `web_routers/profiles.py` 并校验档案身份、群聊引用和运行状态。群聊使用 `groups_bot_relay.py` 恢复房间日志、成员活动和执行操作，群附件使用 `groups.attachment.upload/download`。默认演示入口仍使用本地样例。 |
| 定时任务 | 实时预览调用 `hermes_cli/web_routers/cron.py` 的原生管理接口，由 AIWATA 执行和保存运行记录。任务限定在当前账号及所选 Profile，工作目录须在当前账号工作区。结果可以保存本地、投递到当前账号默认 Profile 托管的群聊，或投递到任务所属 Profile 为单一平台配置的默认频道。投递状态来自 AIWATA 执行记录。退出前端撤销操作令牌，已启用的任务继续按 AIWATA 调度计划运行。 |
| 技能工具 | 实时预览调用 `hermes_cli/web_routers/skills.py` 的列表、启停、锁定和内容接口，安装沿用 AIWATA 的官方技能扫描和注册流程。技能管理范围为当前 Profile 的本地目录和当前 AIWATA 版本的官方目录。第三方来源、外部技能目录和批量升级仍通过 AIWATA 管理。 |
| 记忆与学习 | 实时预览使用 `hermes_cli/web_routers/status.py` 的学习记录与整理接口，以及原生内置记忆存储和待审批写入。工作记忆、用户偏好、待审批记录和学习技能以当前 Profile 为边界。整理预览仅生成原生检查摘要，立即整理需确认。外部记忆提供商的配置仍由 AIWATA 管理。 |
| 消息连接器 | 微信、Telegram、Discord、Slack 和电子邮件接入 `hermes_cli/web_routers/messaging.py` 的平台配置与状态检查、`ops.py` 的配对审批与撤销。凭据只写入当前 Profile，浏览器读取配置状态和允许用户列表。检查记录按 Profile 和平台保存。隔离入口确认私有控制套接字的进程身份和运行状态后，默认 Profile 使用原生退出流程，由受限启动器重新拉起所属账号的网关，Bot Profile 使用网关原地重扫。Telegram 扫码使用原生 onboarding 的创建和状态处理，工作台在用户确认允许用户列表后通过原生平台接口保存。配对凭据只在本机桥接内存中保留，关闭弹窗、退出或过期后清除。未热加载的配置沿用「应用网关配置」。已配置 Team Gateway 的默认 Profile 通过 `messaging_relay.py` 和所属网关的 `relay-link` 控制套接字查看、生成绑定命令或解绑。Portal 管理的账号可查看绑定，变更在 Portal 完成。实际手机扫码、Team Gateway 实例及第三方收发仍待联调。 |
| 文件与产物 | 实时预览从 AIWATA 的真实会话工作目录和项目登记确定可读目录。读取沿用 `web_routers/files.py` 的敏感路径规则，逐级校验实际目录和文件。支持主目录和附加目录切换、文本与常用图片预览、下载以及添加为当前会话附件。文件传输上限为 16 MB。普通会话把原生 `preview.open` 文件事件显示为按钮，重连时从成功的工具记录恢复。相对路径按会话当前工作目录解析，点击时重新校验访问权限。 |
| 浏览器预览 | 普通会话接收 `preview.open` 的 HTTP(S) 链接，也可从已保存的工具记录恢复。桌面预览入口用 Electron 网页面板显示目标，使用独立于工作台的临时浏览会话。用户退出时关闭预览并清理浏览数据。本地来源须按账号显式配置。Agent 可读取分段文字、列出可见元素、滚动，并按当前页面的元素引用点击、悬停、输入文本及发送 Enter、Escape、方向键等常用按键。输入可选择随后发送 Enter，发键前会确认目标仍在当前页面且保持焦点。响应只匹配当前网关连接和原会话。切换网页、隐藏预览或退出后丢弃旧结果。用户可批注整个页面或点选元素，按账号、会话和网址保存，并把批注带入会话草稿。保留按实例归属的原生操作记录，浏览器工具栏不提供 Agent 回放入口。预览控制台查看网页日志、警告、错误和加载失败，可选择、复制、清空或加入指定对象草稿；有选择时添加所选日志，没有选择时添加全部当前日志，空日志才禁用添加；日志限量且仅保存在当前登录的内存中，换页清空。DevTools 按钮用于当前所属网页的原生开发者工具，支持完整 DOM、样式、网络与断点调试，需要桌面宿主。 |
| Git | macOS 实时预览复用 `hermes_cli/web_git.py` 的变更分类，并通过受限系统 Git 进程读取当前会话项目的分支、暂存区和工作区差异。可切换已登记的项目目录，浏览器记住所选目录、筛选和文件。实时入口只读，Git 进程禁止联网、写仓库或执行外部工具。其他宿主仍需接入受控的 Git 读取接口。 |
| 终端与媒体 | macOS 隔离入口的普通会话可在右侧打开真实交互终端。宿主用原生 `PtyBridge` 分配设备，受限 shell 继承自己的终端描述符，在会话工作目录运行。关闭工具标签、退出账号或归档、删除、迁移会话时释放终端。生图使用原生 `image.generate`，修图调用原生 `image_generate` 并核对编辑能力。图像支持最多 8 MB 的 PNG、JPEG 或 WebP。剪辑工具中的 AI 视频编辑调用原生 `xai_video_edit`，源视频使用公开 HTTPS 地址，编辑结果可保存为最多 16 MiB 的 MP4。媒体结果按账号和会话保存，可带入会话草稿。画布和完整时间轴剪辑属于客户端功能。 |

新建会话的草稿与正式会话分开保存。实时模式首次发送时，将所选项目主目录作为 `cwd` 调用 `session.create`，再用返回的运行时会话 ID 提交 `prompt.submit`。选择独立会话时使用当前账号的默认工作目录。前端保留草稿 ID 作为附件存储键，首次接纳成功后将同一份记录转为会话。

新建项目在桌面调用 AIWATA preload 的 `window.hermesDesktop.selectPaths({ directories: true, multiple: true })`。macOS 实时浏览器预览由本机桥接打开 AppKit 目录面板，需要 Xcode Command Line Tools，也可使用工作区目录列表。选回的真实路径须位于当前账号的工作区，作为 `folders` 传给 `projects.create`。首个目录是主目录，用户可在保存前调整。Mock 浏览器预览通过 `showDirectoryPicker` 逐个选择目录，只保存目录名，浏览器无法提供目录选择时可手动录入演示名称。远程项目应由对应连接的文件系统选择器解析目录。

## Bot 与群聊

实时模式对接同级 AIWATA 源码。Bot 私聊打开 Profile 内注册为 `Bot Chat` 的专属会话。创建时将复制来源映射到 `profiles.create.clone_from`，工具组、已安装技能与 MCP 开关走 `profiles.configure`，头像走 `profiles.set_asset`。角色、模型选择和头像写入真实档案，复制配置时传入 `clone_channels: false`。默认演示入口继续使用本地配置。

macOS 隔离入口通过原生 SecretSource 提供联调工作区的 GLM 模型授权。凭据经受限进程的启动输入传入，Profile 配置只保存此来源的启用状态。来源限定为当前账号的默认 Profile 和直接子 Profile，Bot 自有模型凭据优先。插件重扫时，来源重新报告已经注入的同名授权，供原生加载器保留快照。新建 Bot 保存后通过原生重扫确认就绪。定时任务与记忆整理的受限进程复用该来源，终端子进程沿用原生凭据清除规则。此授权用于本机联调，正式账号模型授权仍由产品服务管理。

原型的角色外形参考桌面端 `avatar.tsx` 的十种软体轮廓，本地分别保存外形、身体颜色、眼睛颜色、眼睛形状和图片模式。桌面端当前的软体轮廓使用自动配色；正式同步独立颜色和眼睛选项时，需要补齐外观元数据和渲染适配。上传图片与角色外观可以分别保留。

网关托管群在 `groups.create` 时提交成员。群名走 `groups.rename`，用途、协作说明和响应方式走 `groups.context`。此版本没有就地修改托管群成员的接口；桌面驱动群另有实现。正式展示自动分派前检查 `driver_status.routing_modes`。原型用固定规则模拟分派，群消息和成员活动使用本地 `room.event`；正式端通过 `groups.state/log` 和实时事件同步状态，保留同一 `thread_id`，回复成员时使用真实的 `@handle`，附件换成 `groups.attachment.upload` 返回的引用。

实时群聊支持审批、停止和沿用原讨论事件继续。审批按成员、任务、尝试和请求绑定。成员重试走 `groups.retry`。本机 AIWATA 源码已修复重启后的跨 Profile 成员会话解析，41 项相关原生测试和实际源码的浏览器重试验证通过。常驻网关已重载修复，相关条件性补丁记录在 AIWATA 的维护批次 032。群聊投递走原生调度器的 `room:<room_id>@default`。任务来源可选当前账号的默认或 Bot Profile。群聊中的任务结果带任务名称，包含有效成员提及时沿用 AIWATA 的讨论规则。外部投递已用离线 Telegram 适配器验证，实际平台账号仍待联调。

## 账号与积分

主导航栏在模拟和真实联调模式保留相同的原有入口。素材库尚未接入真实素材索引；个人资料、积分余额和用量尚未接入正式账号及产品计费服务，真实模式打开这些入口时显示「未接入」，不读取或显示本地演示素材、个人资料、积分和用量。真实会话的文件仍由工具面板「文件与产物」提供。模拟模式明确标注演示数据。账号菜单的「模拟断网」在真实联调模式保留但禁用，并说明仅供演示模式使用。

macOS 本机执行隔离使用独立的 `4181` 入口和数据根。工作台以受限进程启动网关，再用 AIWATA 的原生控制套接字核对进程身份并取票。文件权限保留本账号工作区、系统依赖和共享 AIWATA 运行时。共享安装目录的写入限于原生安装锁和当前依赖租约。网关限制回环连接和其他账号控制套接字，保留 DNS 与模型请求。手动触发的定时任务在受限进程内执行，且只能连接本账号已验证的网关端口。此模式仍通过演示账号选择进入，正式多用户身份和宿主隔离需要单独验证。

应用账号、登录门禁与积分账本属于 AIWATA 产品层。原型按账号本地隔离。模拟模式的排队消息开始执行才扣托管积分，余额不足保留输入。模拟模式的会话、定时任务、生图及 AI 修图使用演示定价。隔离入口的真实生图由所配置供应商负责用量。产品层的会话授权、用量核算和幂等扣费仍需由 AIWATA 服务端统一负责。

## 安装与桌面启动

原型的 `/install` 预览首装流程，`/loading` 延长模拟启动进度以便查看。常规入口在应用加载时显示同一启动页。安装错误、打开桌面失败和启动失败可分别通过 `/install?scenario=failure`、`/install?scenario=launch-failure` 和 `/loading?scenario=failure` 预览。

| 阶段 | 接入方式 |
| --- | --- |
| 首次安装 | 将 `startup-screens.jsx`、`startup-state.mjs`、`startup.css` 和两个品牌 SVG 放入目标工程，按目标构建配置调整资产引用。Tauri 安装器沿用 `apps/bootstrap-installer/src/store.ts` 的 `startInstall`、`cancelInstall`、`openLogDir` 和原有模式分流。视图按 `stageOrder` 将 `stages[name].info`、状态、耗时和错误展平成数组，或直接用 `applyBootstrapEvent` 消费同名 `bootstrap` 事件。进度按清单完成和跳过的步骤计数。 |
| 打开桌面 | 安装完成事件只开放启动按钮。传入现有的 `$desktopLaunch` 和 `launchHermesDesktop`，由原生代码等待窗口回执及处理超时。安装器退出时机继续由原生交接控制。 |
| 应用启动 | 把现有 `$desktopBoot` 快照传给 `DesktopLoadingScreen`。主进程的 `getBootProgress` 和 `onBootProgress` 提供启动进度，渲染端补齐网关连接和配置加载，`completeDesktopBoot` 标记退出加载页。失败时复用现有的重试与日志动作。既有远程连接、升级等待、模型配置和引导仍由桌面启动控制器分流。 |

`startup-preview.jsx` 提供模拟事件和网页跳转，用于独立预览。Logo 的 `#draw` 片段启用贝塞尔路径绘制，系统开启减少动态效果时显示静态图形。

## 模型授权、MCP 与输入补全

实时工作台的账号菜单提供「模型授权」和「MCP 管理」，可选择默认 Profile 或账号自己的 Bot。模型选择器也可直接进入当前 Profile 的授权设置。原生 `model.options` 提供可用清单，原生提供方注册表补充统一名称、授权类型和密钥字段；保存与断开分别使用 `model.save_key` 与 `model.disconnect`。密码输入不进入工作区存储，服务端仅返回授权状态。OAuth、云 SDK、自定义端点等非注册 API 密钥配置仍通过原生 AIWATA 完成，页面明确显示对应引导。

MCP 使用 `mcp.catalog`、`mcp.servers.list/status/add/set_api_key/test/remove` 和原生网页 OAuth。支持目录预设、自定义 HTTPS 和 stdio 程序、凭据、工具探测、启停与确认移除。插件提供的连接由插件管理配置。工作台不开放任意配置键、原始 headers 或环境变量覆盖，凭据字段限定为连接默认值或该连接已有声明。新会话使用更新后的工具配置，沿用 AIWATA 的会话工具快照规则。

网页授权 handle 只在发起登录、Profile 和服务器内有效，关闭或退出会尝试取消。修改服务器前，桥接先按所属 Profile 取消所有工作台登录窗口的旧流程。原生取消与配置提交的竞态另在同级 AIWATA 源码修复，维护记录 033。授权状态查询遇到临时失败会有限重试，并提供手动重查。桌面预览通过受限 HTTPS 外部浏览器入口打开授权网页。真实第三方 MCP OAuth 账号仍需服务实测，本轮使用协议测试验证页面轮询恢复。

输入框接入原生路径和技能候选，支持键盘选择、取消以及含空格路径的引用。新草稿使用所选项目目录，在受限进程中复用 AIWATA 补全函数；原生的目录信任与技能扫描规则保留，不创建临时会话。已有会话使用原生会话范围补全。页面提供已接入的工作台导航命令与原生技能；技能在首次提交后由原生 `command.dispatch` 展开，再通过原接纳与回执流程发送，刷新后的记录使用原生显示投影。当前客户端未接入的原生命令不列为可用建议。

本轮原生与 Chromium 验收覆盖密钥保存/断开、默认与 Bot Profile、两个用户下同名 Bot 与 MCP 连接隔离、原生工具探测、连接启停/移除、补全不创建会话，以及技能首次发送和刷新后的真实模型回复。独立审查发现的项目草稿范围和旧 OAuth 写回问题已有回归覆盖。外部生产密钥有效性及第三方授权不能用合成凭据或协议测试代替。

## 后续功能对齐范围

本轮已达到本机真实调用、选择用户登录及 macOS 执行隔离的目标。以下范围仍不能视为完整产品能力。

| 优先级 | 待补齐内容 | 当前能力与实现位置 |
| --- | --- | --- |
| 后续 | 模型高级授权与端点配置 | 注册提供方的 API 密钥保存、更新和断开已接入。非 API 密钥授权及自定义端点配置继续通过原生 AIWATA 管理。 |
| 联调 | MCP 第三方网页授权 | 配置、测试、凭据、启停、移除和网页授权入口已接入；第三方实际 OAuth 服务仍需联调。 |
| 后续 | 更多原生命令 | 已接入工作台导航命令、原生技能和文件目录补全。更多修改运行状态的原生命令需逐项接入客户端指令处理，不能将其当普通模型提示词发送。 |
| 联调 | 第三方真实账号与媒体供应商 | Telegram 手机扫码、Team Gateway 实例、第三方实际收发、真实麦克风，以及生产图像和视频供应商仍需实测。已有离线或协议测试不能替代这些实测。 |
| 产品 | 托管群成员增删 | 当前 `groups.*` 托管群合同支持创建时指定成员，没有在原群内增删成员的操作。需 AIWATA 托管群后端新增接口、任务处理规则和事件同步后再做前端。 |
| 产品 | Bot 外观跨客户端编辑 | 头像资源已保存到真实 Profile。软体和人物组合的完整参数还需统一外观元数据与渲染约定，才能在其他 AIWATA 客户端继续组合编辑。 |
| 发布 | 桌面宿主和跨系统交付 | 当前是本机源码桥接与 Electron 预览。安装、升级、远程连接和正式启动交接仍需合入发布宿主；Windows 的目录选择、执行隔离和终端等原生能力需单独适配验证。 |
| 上线 | 正式身份、用量与积分 | 当前用户选择只适用于本机联调。正式身份验证、服务端授权、用量核算和幂等扣费需 AIWATA 产品服务实现，不能使用演示积分代替。 |

实时 Git 当前为只读，画布和完整视频时间轴尚未接入真实编辑产物流程。这些可按产品需求另排，不影响当前真实会话验收。前端主包的构建体积优化，以及 AIWATA 原快照已有的静态检查问题，也需在正式发布前处理。

探头头像已拆成前端 SVG 部件，生成与随机不调用后端。36 种发型、32 种头饰、各组配色、眼镜和耳饰通过 `appearance.peekingDesign` 保存；实时桥接沿用 `profiles.configure` 的 `ui_meta['aiwata-app']` 和 revision 校验，无新增 Hermes API。已核对同级 AIWATA `6631a6af2c` 的元数据合同，本轮未执行真实 Profile 写入；其他客户端继续编辑仍需共享部件 ID 与渲染约定。结构与扩充方式见 [探头头像部件](peeking-avatar-parts.md)。

## 工具实例与 AIWATA Desktop 对齐

### 原生浏览器标注

复用 AIWATA `6631a6af2c58fc498ef01fa5cc4b222fc8682683` 的 `preview-annotate` 选取、标记、身份信息、编号和打包模块，独立快照位于 `src/vendor/aiwata-preview`，包含源码／输出 SHA256 与上游许可证。更新命令为 `node scripts/sync-browser-annotations.mjs`，运行产物不依赖相邻源树。

桌面网页内可点选元素、拖框选择区域，原生蓝框与编号写入裁剪截图。新浏览器及成功加入草稿后的下一批从 1 编号；同一待发送批次内删除不重排，已归档证据保留原编号与唯一 ID；恢复时元素优先按选择器定位，区域按页面坐标换算。截图通过附件存储按账号和会话保存，批注只持有图片引用，浏览器实例和网址分别保存批注与未完成草稿。

普通会话、Bot 和群聊均可打开浏览器。原生选择、编号和截图保留，交互按用户提供的 Codex 录屏调整：选择图标有淡蓝色激活态，再次点击退出；选区旁显示 280×44 白色单行胶囊、麦克风和圆形确认按钮，Enter 保存、Escape 取消选区，保存后继续标注。底部深色控制条可拖动和键盘移动，显示数量、隐藏／恢复标记、清空、发送与退出；隐藏保留已有标注，控制条按预览空间限制位置。语音由工作台录音并调用当前账号／Profile 的原生 `voiceStatus`／`transcribeVoice`，仅插入当前备注，不自动保存；切换目标、网页或账号时取消并释放麦克风。需 AIWATA 已配置可用转写提供方，纯 mock 不伪造真实转写。网页不因批注编辑而缩小；控制条持续显示精确接收对象；单击发送即向该对象输入草稿原子追加文字与图片，无二次确认，不自动提交模型。成功后清空活动标记与输入胶囊，已保存证据仍在账号／浏览器存储中保留。保留已有草稿、附件和批注，并记录批次避免重复导入。写入期间的退出、页面变化、对象变化、草稿编辑或附件读取失败均中止此次添加，不改投当前其他会话。网页 HTML、样式与截图作为不可信页面证据传入，与用户批注意图区分。

原生选择／截图由当前 Electron 主进程提供，逐次校验工作台来源、当前账号分区、所属网页、URL 与文档代际。普通 HTTP 浏览器没有此宿主能力；纯 mock 模式仍可演示文字批注。正式 AIWATA 桌面发布需将该受限桥接接入发布宿主。群聊成员读取自己浏览器工具的控制路由仍沿用其原生运行时合同；此处不把共享群聊的网页控制权广播给所有成员。

本机 macOS Electron 预览已实测区域框选、元素点选、1／2 号截图、Bot 和群聊接收对象预览，以及文字／图片加入指定草稿。验收未发送模型消息，测试草稿已清理，保留浏览器内的演示批注。专项测试另覆盖普通会话、跨账号、缺图、存储失败、导航、卸载取消、编号恢复和重复导入；这不替代其他操作系统及正式发布宿主的集成验收。

已核对同级 AIWATA `6631a6af2c`：`apps/desktop/src/store/preview.ts` 的 `newBrowserTab` 总是生成新 ID；`openBrowserTab` 仅唤起原浏览器；`openPreview` 的网页目标复用本会话当前或最后一个浏览器，文件目标按规范路径和会话身份复用。`app/right-sidebar/terminal/terminals.ts` 的 `createTerminal` 总是建立独立终端。

工作台加号、工具标签右键的新建和 `/tools` 会新开浏览器首页，保留其他标签的页面。普通网页入口复用当前或最后一个浏览器。浏览器页面、历史、批注草稿与回放按账号、会话、实例 ID 保存，标题和关闭动作也按实例区分。旧的工具类型标签 ID 和保存数据可继续读取。终端首页入口每次新开，模拟终端的历史和阅读位置分别保存。恢复原生会话回放时保留每个操作的实例归属，不把旧操作投给新浏览器。实时终端确认关闭后才移除标签；失败保留标签供重试，批量关闭不会删除等待期间新开的标签。

实时终端原型桥接已增加可选 UUID `instance_id`，按本次登录、所属会话和实例分别管理 PTY、订阅流及关闭；沿用原有最多四个终端和空闲五分钟释放的资源规则。所属会话、真实目录与 viewer ID 写入校验保留。它复用现有原生 PTY，无需新增 Hermes 服务端能力。实例隔离已由协议与流测试验证；本轮没有新建容器或启动真实 PTY 做端到端验收。真实网页渲染仍需桌面宿主。

原型的「文件与产物」目前仍是一个文件管理面板，尚未做 AIWATA 的按文件独立预览标签。画布、修图、生图、剪辑和 Git 的扩展面板在当前源码中没有查到对应插件的多实例合同，继续保留已有行为，不声明这些工具已与插件的多开规则一致。

浏览器标签页使用 Electron 的 `page-title-updated`／`page-favicon-updated` 事件更新标题与图标，跳转及前进后退时丢弃旧页面信息。标题缺失显示域名、图标缺失或加载失败显示浏览器图标；手动重命名优先。网页信息按账号、会话及浏览器实例保存，并用于悬停预览与关闭菜单。favicon 由桌面宿主从当前网页分区读取，仅接受原生报告的 HTTP(S) 图标或同域默认 favicon，限制为 128 KiB 图像响应，以内联图片交给主界面；宿主校验账号、网页、文档代际，防止旧网页结果回写。无需新增 AIWATA/Hermes 服务接口。

历史联调曾自动更改 Profile 的 `tools.tool_search.defer`；职责清理第一批已停止该行为，并按配置备份恢复本轮差异。浏览器继续使用原生 GUI 工具和 `preview.open`／`preview.read`／`preview.act` 协议，客户端接收与宿主操作代码保留。

历史联调曾自动写入 `platform_hints.desktop.append`。职责清理第一批已停止自动写入，并移除本工程可精确归属的提示原文/标记块；保留用户其他提示和模型授权配置。工具选择与执行回归原生规则，不能以自动提示覆盖代替客户端能力接入。

前端现在处理实时 `preview.open`，导航到所属会话当前／最后一个浏览器，并在前台会话展开浏览器面板；同时保留原来的链接卡片。后台事件只记录所属会话页面，不切换当前工具或会话。保留执行代际、入场 ID、重复事件、账号及实例隔离校验。浏览器操作仍限定当前可见会话及其受限 webview，不开放任意 JavaScript 执行。

已在 macOS Electron + 当前账号 GLM-5.3 实测原句「使用内嵌浏览器 打开 百度 搜索 aiwata」：模型调用 open、elements、type(submit=true)、read，当前 webview 显示 `wd=aiwata` 的百度结果页。该流程无需用户点链接或手工输入网页搜索框。上游 schema 中的 reload 等扩展动作仍受本原型的限定动作集约束，不声明全部动作已实现。

## 原生 Agent 能力对齐（2026-11-11）

对齐目标仍为 AIWATA `6631a6af2c58fc498ef01fa5cc4b222fc8682683`。相同模型和 Agent 内核不代表桌面能力一致：原生 GUI 还依赖请求握手、桌面回调、工具目录、Profile 路由、进程事件及操作系统驱动。本次沿用这些合同，不增加按用户语句关键词触发的操作。

- 网关连接声明原生 server-request 能力。实时请求和重连请求共用一次执行账本，校验账号、Profile、会话、执行代际及可见网页，取消后丢弃迟到结果；预览与终端读取接受最多 1 MiB UTF-8 回复。凭据仍限制为 64 KiB，输入仅保存在临时请求卡片中。
- 浏览器 drive 引擎改为固定版本原生快照，支持稳定元素引用、重新定位、增量读取、原生动作集和可信输入。导航、取消及账号切换不会将旧请求投给新页面。源码和许可证位于 `src/vendor/aiwata-preview-drive`。
- 普通会话和 GUI Bot 消费原生网页打开／关闭、切换面板、终端输出／隐藏、消息反应和连接配置事件。Agent 输出终端不创建第二个 PTY，隐藏终端不终止后台进程。Bot 的文件、Git、终端及定位接口进入自己的 Profile 数据库和账号文件沙盒。
- 「Agent 能力与任务」读取真实 `tools.show`、`process.list`、`subagent.list`，提供所属会话的查看、停止、补充指令与中断动作。工具目录包含延迟加载的工具，并不保证供应商凭据或系统权限已经齐备。
- `manage_connections`／目录安装请求有原生交互卡片，安装和授权由用户明确操作；授权 URL、密码及一次性字段不写入工作区持久数据。`/plugin:skill` 和安全路径形式的技能名交给原生技能解析，不作为普通消息悄悄发送。

此前引入的 Computer Use 宿主 broker、自定义 Provider、安装器、配置读取替换及专用 socket 已在职责清理第一批退役；不能再将这条历史路线作为目标架构。代码与三份联调配置/插件均有本机恢复点。

Computer Use 面板现通过 AIWATA 原生 `GET /api/tools/computer-use/status`、用户点击后的 `POST /api/tools/computer-use/permissions/grant` 和 `GET /api/actions/computer-use-grant/status` 读取状态、发起授权及轮询。服务端使用原生 `session-ticket`（`purpose=native-http`），绑定当前账号/Profile/网关实例；ticket 不交给 renderer。适配只允许固定操作、拒绝重定向并限制响应大小，不执行驱动安装、配置加载替换或自动授权。普通 Profile 与 Bot 的真实状态接口均已验证。

用户后续确认只要求账号目录/Profile 分离，已撤除额外 Seatbelt。原生启动器和 PM 决定安装依赖及工具仓库，数据 Home 仍绑定当前账号/Profile。已识别原有 `.hermes/tools` 中的 Cua Driver 0.21.0；本机原生状态接口报告 `accessibility=false`、`screen_recording=false`、`ready=false`。没有安装组件、改配置指定驱动或授予权限。完整 Computer Use 点击/截图验收仍受系统权限阻挡，不将“驱动已安装”当成操作成功。

桌面外观请求已接线：`theme.apply` 原子验证模式/颜色/布局，按账号保存；`theme.pick` 和 `setup_beat` 使用等待用户输入的卡片及原生结构化回答，取消、切换代际、断线和退出不复用旧答案。导览/轻提示复用固定版本原生 tour engine、targets scanner 和 driver.js，支持应用和预览页。当前布局注册仅有本工作台能实际呈现的 `sidebar-left`，其他原生布局 ID 明确返回可用列表，不假装应用成功；尚未复制原客户端的完整布局库及引导美术。主题和初始化的实际模型交互未作为本轮端到端通过项。上游 canonical session request authority 对 4404 的处理与侧车合同不同，因此 canonical 连接不宣称支持 `declines_not_shown`。群聊继续使用原生群聊策略；不声明群成员获得当前 GUI 的控制通道。独立 `browser_exec` 的 Chromium 运行环境与内嵌网页、Computer Use 分开，尚不能由本轮驱动状态推导为已完成验收。


### 第一批恢复点与验收

恢复目录：`/Users/xuke/.aiwata-app-recovery/frontend-responsibility-2026-11-11/`（仅本机，含敏感配置，未提交）。保存了执行前代码、3 份配置、SQLite backup API 一致性快照和退役插件。`data-verification.json` 确认 3 个 Profile 的会话/消息数量及消息内容与恢复点一致。运行配置恢复按字段完成，不覆盖整个旧备份，模型凭据来源保留。独立运行目录、账号/会话 ID、浏览器存储 key、IndexedDB 和 Electron userData 路径未变。


### 目录分离方案落地（2026-11-11，第二批）

| 范围 | 原生依据与接线 | 本轮实际验证 |
| --- | --- | --- |
| 依赖/启动 | `aiwata --print-runtime-command`、`pm.environments`；`live-aiwata-host.mjs` 监督原生网关进程，保持账号 Home | 原生登录、已有安装发现、默认/Bot 状态接口 |
| Profile/凭据 | 原生 Profile、一次性 HTTP/WS 票据；所有 companion 固定 Home/store，丢弃环境中其他账号模型/连接器凭据 | lin/qiao 会话 ID 无交集；外账号会话/Profile 拒绝；退出 token 401 |
| 项目目录 | 原客户端 `select-paths-dialog.ts` 的 Electron `dialog.showOpenDialog` 合同 | 系统文件夹对话框；选中工程目录后显示结果并自动填名，取消未创建项目 |
| 文件/Git | `/api/fs/{list,read-text,read-data-url,git-root}`、`/api/git/status`、`/api/git/review/diff` | 实际文件列表和 Markdown 预览；无 Git 仓库目录正确返回空；Git fixture/合同测试 |
| 终端 | 原生 `hermes_cli.pty_bridge.PtyBridge`，按账号/Profile/会话/实例连接 | 真实 PTY 返回 `NATIVE_PTY_OK` 及当前目录；已关闭验收终端 |
| 普通会话/内嵌网页 | 原生 Agent、`desktop_preview`/`drive_preview`、原生网页动作快照 | 本轮新会话实际打开百度并搜索 aiwata，网页 URL/title/搜索框可见 |
| 模型/MCP | 现有原生 RPC 合同，无新增授权体系 | 默认 Profile 的模型目录、MCP 配置与状态读取 |
| Bot/群聊 | 原生 Profile/hosted room；前端只处理展示、目标、输入和事件 | Bot 返回 `NATIVE_BOT_PROFILE_OK`；指定群成员返回 `NATIVE_GROUP_PROFILE_OK` |
| Computer Use | 原生状态、显式授权、轮询 API | 已安装，但辅助功能/录屏权限未齐备，完整操作未通过 |

历史 `.aiwata-app-isolated` 路径和 `dev:isolated` 别名为兼容保留，均不再表示 OS 安全沙盒。`dev:native` 为推荐入口；既有 4180/4178 来源、账号和持久化 key 均未迁移。网页分区仍按登录隔离并在退出清理，不声称已具备正式客户端的持久网页登录。HTTP(S) 本机和局域网页面恢复可访问，系统代理保留；Electron 的 renderer sandbox、context isolation、可信帧/guest/代际校验不因撤除 Seatbelt 而关闭。

部分原生业务的过渡适配保留：任务调用 `web_routers.cron`，技能调用 `web_routers.skills`，记忆调用原生 config/status/memory/curator，连接器调用原生 messaging/relay/ops，音视频调用原生工具；没有复制 Agent 推理、工具路由、安装器或权限判定体系。会话列表补充字段/发送回执仍只读查询账号状态库。这些过渡层依赖当前源码版本，尚未全部替换为公共 HTTP/WS API。为避免丢失现有模型授权，`WorkbenchModels` 的兼容 SecretSource 保留，未更换凭据来源；清理它需先证明原生来源能够无损承接并按职责约定确认。

仍需后续独立范围：正式账号鉴权/积分、独立桌面打包和服务生命周期发布验收、完整原生布局及引导库、跨平台系统对话框/PTY、独立 `browser_exec` 环境、网页持久登录。此轮保留纯 mock/Sites 构建，不将开发网关联调宣称为可直接发布的完整替换安装包。
