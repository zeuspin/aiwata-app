# Hermes 核心升级交接（2026-11-12）

供下一会话使用。以下是本次交接时的状态，不是未来版本保证；升级前重新核对HEAD、档案、运行状态及用户授权。本会话没有查询或固定“最新Hermes”版本，也没有执行升级。

## 先读及边界

1. 本工程 `AGENTS.md` 的工程职责约定；工程skill `.agents/skills/aiwata-core-upgrade/SKILL.md`。
2. 核心仓库（当前同级 `../aiwata`）适用的AGENTS、`docs/aiwata/index.md`、`CUSTOMIZATIONS.md`、`state.json`、`UPGRADE.md`、`VERIFICATION.md`，库存 `customization-inventory.json`。
3. 核心批次041–051，重点042默认新renderer、044默认GLM网关入口、045制品、048公共桌面与修复、049–051真实安装/窗口调整。不要把早期记录中的“未安装”当成当前状态。

`aiwata-app` 是正式替代前端，原AIWATA Electron main/preload负责原生窗口、内嵌浏览器、目录选择、DevTools、系统交互及网关生命周期。Agent、工具、Profile、模型凭据、权限和审批保持原生。不能为兼容界面另接独立网关、恢复旧联调宿主、替换Computer Use Provider或增加Cua Driver/沙盒。账号与Bot Profile分层，目标是目录/数据/作用域分离，不是OS级恶意用户隔离。若上游变化需要改变职责/权限/隔离方式，先列明影响由用户确认。

未经允许不新建分支、不推送；本轮累计代码未提交，用户要求暂不提交。不要让通用skill的自动commit/工作树流程覆盖这个约束。升级授权不自动授权覆盖已安装App、迁移真实数据、停止其他实例或创建容器。

## 已知基线和保护

- 核心HEAD：Hermes `v0.23.1` / `3b421578588243f920886e6fe79a6faa87ea026e`，detached；最新完成核心升级记录041，最新定制记录051。
- 前端HEAD：`91eee51001968db13b6f3e774944d390d6daca07`，main；实际功能有大量未提交变更。两个HEAD都不是当前定制源码的完整快照。
- 核心库存本轮check匹配2630个源码指纹；该数字仅是交接证据，升级后以新清单为准。库存不能恢复源码。
- 开工先保护两个仓库：tracked binary diff、经审核untracked源码、维护文档和基线清单；做可恢复、排除秘密/运行数据/依赖的源码快照并验证恢复。不能直接pull/rebase/reset/checkout覆盖脏仓库。
- 私有分发源归档可能有真实发行Key，不是普通升级备份，不能拿来覆盖新上游或公开上传。保护凭据靠后端既有作用域，不读取/输出值或密钥哈希。
- “最新”需在执行会话从官方仓库核实，说明稳定release与main的区别，记录日期和完整目标SHA。固定目标后在独立候选目录适配；不要将本地origin缓存当成最新，不把候选通过前的版本写成已升级。

## 必须迁移的接口和入口

| 范围 | 当前入口/验收要点 |
| --- | --- |
| 新renderer默认 | 核心 `apps/desktop/renderer.json`、`apps/desktop/scripts/start-aiwata-app.mjs`、`scripts/build/desktop.mjs`；默认dev/build仍用aiwata-app，旧renderer仅显式legacy入口。不能升级后悄悄恢复旧UI。 |
| 原生共享模块 | 前端 `vite.config.mjs` 从目标核心源码导入 `HermesGateway`、canonical协议、preview分区、titlebar/overlay常量等。上游移动符号时沿协议适配，不复制旧Agent或冻结整套旧SDK。候选构建显式指定 `AIWATA_APP_SOURCE`，防止测到旧核心。 |
| 客户端协议 | `src/native-desktop-entry.mjs`、`native-desktop-client.mjs`、native preview/terminal/settings等。核对握手、Profile/连接归属、幂等submission/input回执、重连、历史快照/工具详情、审批/队列/停止、Bot canonical chat和托管群恢复。群聊保留原生api_server/bot_room工具策略。 |
| 模型配置 | 044修复了只迁CLI、漏网关的问题：`gateway/run.py::_load_gateway_config` 既有出口复用 `hermes_cli.config_model_default.apply_model_default`。保留已批准GLM默认/BigModel Coding路由；显式模型/endpoint不能被默认URL污染，不能改共享raw/effective加载语义或恢复Nous guest。 |
| 私有分发 | `scripts/build/aiwata-bootstrap-mac.sh`、`scripts/aiwata_bootstrap_bundle.py`；静态新renderer进校验归档，归档内artifact清单，安装时仍构建原Electron main/preload。目标机不依赖维护者checkout。 |
| 正式桌面/修复 | Rust `desktop_entry.rs`、`bootstrap.rs`、`lib.rs`；Electron `embedded-desktop-entry.ts`；CLI `desktop_published_entry.py`/`main_desktop.py`。保留验属、签名、运行检查、同卷原子交换、receipt/pending恢复、损坏所属包修复，以及当前/上一成功完整安装器缓存。 |
| 系统窗口 | 前端 `native-window-chrome.*`、`workbench.jsx`、`styles.css` 复用原控制区状态。Mac普通窗口避让交通灯；OS全屏时开关与主导航栏居中，额外拖动空白在开关之后。Windows/Linux按原overlay/custom-controls协议适配，不凭Mac结果宣布全平台通过。 |
| 网页能力 | 原生拥有的webview、目录选择、DevTools、PTY、标注/截图/语音继续原协议；metadata按实际网页标题/favicon更新。标注vendor快照保留其来源，更新用已有sync脚本，不直接用上游旧UI覆盖用户认可交互。 |

核心定制还包括品牌/目录/身份、认证入口、默认模型和网关重连等完整库存；此表仅突出当前前端/安装迁移风险，不代替核心CUSTOMIZATIONS全量审阅。

## 当前安装与证据

- 日常入口 `/Applications/AIWATA.app` 为真正Electron，bundle ID `com.aiwata.aiwata`。DMG内为独立 `AIWATA Installer.app` / `com.aiwata.setup`，直接打开，不拖进Applications。
- 默认真实数据根 `~/.aiwata`，桌面userData `~/.aiwata/desktop`；活动源码为所属snapshot。不要把开发/验收home混为用户安装，升级前实时核对。
- 历史051实际覆盖snapshot `fullscreen-alignment-051`，原1会话/2消息逐行保持、quick_check通过，配置/凭据文件元数据未改；公开App和修复器签名通过，19个renderer文件一致。该1/2和19均是当时证据，未来不得硬编码。
- 用户已确认Dock只一个AIWATA、普通窗口系统按钮不重叠；最新全屏居中用户反馈“很好”。051安装字节核对/真实组件模拟几何通过；原生自动化有旧installer身份缓存，不虚构工具截图。
- 私有制品相对两源码目录的父目录：`aiwata-private-artifacts/fullscreen-alignment-051-release/`。DMG `AIWATA-Setup-macOS-arm64-fullscreen-alignment-051.dmg`，97,158,906字节，SHA256 `50419a96307256af125f2920968f54d0ffcf658a039970dc5cc58aac2a5a9043`；Mac arm64、最低13、ad-hoc、未公证。证据见verification.json/geometry截图与日志，不公开这些制品。

## 验收和已知限制

044已真实GLM验证普通聊天、terminal调用、两个Bot私聊、双Bot托管群/@成员工具、冷恢复与工具详情；043早期“工具历史未恢复”已被044修复，不重做过时诊断。050前端290测试通过、051native构建与覆盖数据核对通过；这些是历史基线，目标版本必须重跑。

升级最低回归：新renderer默认dev/build；空档案默认模型与显式provider；登录/Profile切换及迟到回调归属；普通/Bot/群聊的发送、审批、停止、排队、重连、冷重开/工具历史；原生webview、目录选择、DevTools、PTY、标注；打包解包、公开桌面启动/修复/保留数据覆盖、Dock和系统窗口。测试使用隔离数据/工具目录，不侵入当前安装。

未完成的广泛范围：专用Computer Use、跨机/远程、其他外部供应商/MCP OAuth全链路、语音、辅助窗口全量迁移、Windows/Linux与Apple公证。某个子链路有通过记录不等于该领域全量通过；先查最新档案。

048 `test_gui_command.py`曾有3个已证明在未改CLI时也存在的失败（旧Hermes fixture及Path.is_file mock递归）。在目标上游重新跑并区分新旧，不能永久豁免或把红灯称全绿。不要为了消除验收工具缓存改产品bundle ID或要求重复安装/授权Cua Driver。

完成候选验证后，按用户批准范围串行切换，保留可恢复旧源码/配置。若有数据schema迁移，另做范围明确的一致性备份，不能强行让旧源码改写新数据。通过后才更新核心上游基线、定制档案与库存。构建DMG、正式覆盖安装和发布分别按已获授权执行，代码先不提交。

## macOS 原客户端能力补齐（052，源码已整合）

2026-11-12，固定 v0.23.1 / 3b421578588243f920886e6fe79a6faa87ea026e。新主窗口复用原 Electron、canonical 网关、Agent、Profile、审批和工具；原 Quick Entry、Pet 与其他辅助窗口走原完整启动。高级设置／产物索引／插件能力／任务等未逐控件迁移的原能力，使用带明确 connection/Profile 的原 full-boot peer 页面；nativeSurface 是有限展示字段，不是任意 URL 或新运行服务。Mock/Sites 入口继续独立构建。

真实隔离 macOS 验证包括 GLM 普通会话、创建 Bot 和私聊、Quick Entry 提交只入队一次且保留主输入草稿、两台 Mac 的托管群创建和恢复、远端审批卡允许一次后完成、真实终端工具和 PTY、网页区域标注截图加入草稿、文件预览／编辑／重命名、连接切换后的草稿／附件与工具恢复。跨机远端使用原网关和受控脚本模型，本机使用真实 GLM；不能写成两端均真实供应商。操作系统实体热键唤起尚未签收，Quick Entry 使用原注册成功回调进入真实窗口验证，其提交／ACK 链路是实际原生流程。

本轮实际捕获并修复三类回归：侧栏群头像漏读非本机成员；单会话 preserveDraft 条件误植群发送回执；批注／浏览器尺寸监听卸载后的迟到回调。新增真实组件、持久回执恢复及重试测试。已整合最终源码运行 npm test：497/497；Mock/Sites build 和4项 hosting 测试通过；native v5 build 通过。核心15项静态检查通过。原安装与分发矩阵284项通过，具体跳过／过滤范围见核心052记录，不叠加为独立总数。

052候选签收时公共安装仍为051；其后已按053完成授权覆盖，052私有制品及默认覆盖验收分别记录，不将源码整合或静态构建当完整安装通过。不推送、不发布、不新建分支。旧 v1 原生 UI 缓存保留，不自动与新的后端身份作用域合并；后端真实会话仍为权威。新 Provider 登录、麦克风/TTS、外部消息投递依赖已有配置和用户授权；保留原功能入口，不冒充已完成新授权。Git commit/push/PR 等写远端动作本轮不实际执行。自有商业登录／credits 服务、Windows/Linux 不在本次 macOS 原客户端签收范围内。


## 053默认部署完成（2026-11-12）

用户明确允许覆盖并保留数据后，最终052 Installer已实际发布到 `/Applications/AIWATA.app`，snapshot `native-parity-052`；原数据根不变。安装窗口显示回执和网关就绪通过，原1会话/2消息逐行一致、SQLite健康，配置/凭据只比较元数据且无变；339实际renderer与11核心审查路径一致，公开App及所属完整修复器deep/strict签名通过。公共路径重开后仅一份桌面主进程，网关仍052且ready。桌面留在运行中。

CUA仍有旧installer身份缓存/截图超时，不能执行可靠菜单Quit；核对闲置及精确PID/创建时间后定向SIGTERM，再通过公共路径重开。不得写成正常Quit、Dock或全屏视觉通过；只核对到一条公共App的Dock recent记录。本轮没有用用户真实会话发测试消息，也没有用真实数据做故障修复。旧v1 UI缓存保留但不自动混入新namespace；外部新授权、实体热键/专用Computer Use的未验边界继续有效。

制品、SHA及隔离真实交互结果按核心052；实际默认部署与恢复保护见核心 `docs/aiwata/changes/2026-11-12-053-default-native-parity-acceptance.md`。无分支、提交、推送、发布或额外运行体系变更。后续不再重复申请已完成的052默认覆盖，也不以旧051记录覆盖当前状态。
