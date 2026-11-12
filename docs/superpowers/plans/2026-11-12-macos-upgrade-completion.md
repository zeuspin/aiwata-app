# macOS 新前端与核心升级完成计划

> **For agentic workers:** Use superpowers:executing-plans for the main sequence; independent, explicitly assigned tasks may use parallel agents. Steps use checkboxes. User prohibits new branches, commits, pushes and publication; do not follow generic automatic commit/worktree instructions.

**Goal:** 在保留045–051新前端分发、正式桌面入口和用户认可窗口布局的前提下，完成 v0.23.1 的 macOS 原客户端功能对齐和原生验收。

**Architecture:** 原 Electron main/preload、原标准网关、原 Agent/工具/Profile/权限保持权威；aiwata-app 承担主界面。辅助窗口优先复用原完整启动与功能模块，按窗口模式懒加载，不能将主工作台错误装入小窗口。缺口在既有客户端合同层补齐，不另建网关或执行服务。

**Tech Stack:** 既有 React/Vite、HermesGateway/canonical RPC、Electron、Python PM、Tauri/Rust、macOS arm64；现有第二台Mac经SSH/Tailscale测试。

**Spec:** 两工程AGENTS；`.agents/skills/aiwata-core-upgrade/SKILL.md`；`docs/handoffs/2026-11-12-hermes-core-upgrade.md`；核心 `docs/aiwata/CUSTOMIZATIONS.md` 与041–051。

## Global Constraints

- 用户已确认：本次是 macOS 原客户端功能对齐；自有登录/积分服务、Windows/Linux另验，产品入口保留。
- 固定既有目标 Hermes v0.23.1 / `3b421578588243f920886e6fe79a6faa87ea026e`；本轮不是另追上游 main。
- 不新建分支、不提交、不推送、不发布；不创建容器，不改变Provider、OS授权或隔离边界。
- 新功能代码先在仓库外、可恢复的双源码副本适配，主工程和现有运行实例保持原状；最终差异逐项审查后才整合。
- 测试数据/home/userData/端口独立；模型凭据仅经原后端managed scope，不读取或复制秘密。远端仅用新隔离目录。
- 051已真实安装，不能将044时的“尚未安装”当作当前状态，也不能用旧051包的验收替代后续新包。

## Review Focus

1. 辅助窗口错误读取默认Profile或启动完整主界面：按URL窗口、Profile、connection、session身份测试。
2. 主窗口未镜像QuickEntry/Pet或遗漏submit/ACK：证明真实提交只发生一次，迟到结果不换账号。
3. 跨机成员和群authority混用：测试TLS、精确成员target、重连、审批、停止与重试，不退回桌面驱动群。
4. 原生主题、通知、深链监听丢失：先安装所属监听再发送ready；不自动执行安装类深链。
5. 新renderer静态归档或公共桌面/修复回归：候选不依赖维护者checkout，逐文件核验与保留数据覆盖分开验收。

## Tasks

### 1. 保护当前源码与验收矩阵

- [x] 检查核心库存：2630指纹匹配；确认最新051和已安装公共桌面事实。
- [x] 双源码安全快照并实际恢复核对：core 23749、frontend 272文件；排除秘密、运行数据、依赖和制品。
- [x] 确认第二台Mac SSH可用；不停止远端已有实例。
- [ ] 逐项记录原客户端原生功能、目前新前端接线、当轮行为证据及缺口；“存在API”不得记为可用。

### 2. 恢复原生辅助窗口入口

Files: 前端 `src/main.jsx`、新窗口分流模块、`vite.config.mjs`及对应测试；必要的native-only导入。

- [ ] 先测试 main/quick/overlay/wake/hud/secondary/browser 的URL分流，含显式Profile/connection。
- [ ] 显式辅助模式先进入原 `entry.ts` 完整boot；普通主窗口保留新工作台及051布局。
- [ ] 检查原CSS/Tailwind/字体/静态资产、React去重；分别运行前端测试、native构建、Mock/Sites构建。
- [ ] 真正macOS窗口运行，核对透明、尺寸、目标会话及所属连接。

### 3. 主窗口协议和跨机群聊

Files: 原宿主现有桥接合同；前端native entry/client、Workbench/App边界、按职责新增窄模块和测试。

- [ ] 阅读并复用原QuickEntry、Pet、通知/深链、主题、连接registry的合同；每个漏接先写失败行为测试。
- [ ] 原生connection/Profile切换重新绑定客户端与持久作用域；旧回调失效，不能重写凭据来源。
- [ ] 用既有groups/peer合同支持当前连接可选的远端成员；UI不能只提交local target。
- [ ] 两台实体Mac隔离验收：文本、成员工具、审批、断连重连、停止、重试、owner恢复、无重复回复。

### 4. 管理与机器能力对齐

- [ ] 对照原客户端逐项检查项目/附件/文件产物/Git/PTY/浏览器/标注/语音、模型/MCP、Bot/任务/连接器、记忆和图像能力。
- [ ] 原客户端也不支持的能力如实列明；有配置/授权依赖的能力先验原失败/未配置状态，不能伪装成功。
- [ ] 发现职责/权限变更确有必要时，仅暂停依赖该决策的部分并给用户具体可审阅方案，其他任务继续。

### 5. 安装与修复回归

Files: 核心 `tests/hermes_cli/test_gui_command.py` 及原桌面/归档/安装器现有测试。

- [ ] 修正048已定位的3项旧fixture/mock失败，只改测试验证当前AIWATA入口；实际整文件回归。
- [ ] 验证归档生产和消费、原main/preload、公开桌面和所属完整修复器；Rust/Node/Python/Electron专项与类型检查。
- [ ] 最终候选制品隔离首装/下载失败重试/跨快照覆盖/修复/桌面交接/真实会话分别留证据；不以构建成功代替。

### 6. 统一验收、整合与交付

- [ ] 审阅候选相对保护基线的精确差异；保留051及并行改动。
- [ ] 全部适用测试通过；现有失败逐项复现/修复或明确阻塞，不永久豁免。
- [ ] 最终原生端到端回归并核对数据保留；本次范围内仍有缺口不得标“全功能可用”。
- [ ] 追加核心维护记录、更新有效规范/交接与源码库存；测试进程按所属正常收尾。
- [ ] 需要操作用户安装/数据且现有授权不能覆盖时，先提交可审阅制品和结果再请求最终操作；不重复请求已获授权动作。

## 执行台账

本机私有目录：`/Users/xuke/Documents/getian/aiwata-private-artifacts/v0231-completion.6cam0mva/`。核心和前端保护副本分别为 `core-source/`、`frontend-source/`，依赖仅复用既有目录，没有新安装。台账写入该目录 `progress.md`，每项完成须有命令、结果、范围与未验限制。当前开始Task 2/3/5，未宣称功能完成。


## 052执行结果与最后的权限边界

源码已按保护基线精确整合：core11路径，frontend105候选路径（103＋收尾2新测试；其余收尾变更属于既有路径），保留根目录原独有文件与本轮维护交接。真实root497/497，core15静态检查及2640库存匹配，Mock/Sites4/4和native v5均通过。最终独立审查无Critical/Important。

真实两机原生验收包括GLM会话/Bot、Quick Entry捕获和ACK一次、原settings/messaging页面、31动态平台、群聊审批/停止/@远端、owner重启后远端结果一次回传、浏览器标注截图入草稿、真实PTY、文件读写rename、冷恢复及连接namespace隔离。原回执/恢复fixture与最终源码保持同一合同。物理OS热键、外部供应商新登录/语音授权及Git写远端动作没有冒充为实测。

私有052 DMG已构建：114487902 bytes，SHA256 6ac32e217af1ff8d751f221b5bdeb4e8a611d20dc3ef21c509caf2f992d07d32，arm64/minmac13.0，ad-hoc deep/strict＋DMG校验通过，未公证。最终镜像原生prepare-source首次与重入exit0；339实际前端文件、11reviewed核心路径逐一匹配。依赖安装/完整GUI发布/默认App交接未执行，不能标为通过。

默认已安装版本仍051；用户此前要求隔离数据，因此默认安装覆盖需要明确最终切换授权。旧v1前端缓存保留，不自动与新的后端身份namespace合并；真实会话由原网关恢复。无分支、提交、推送或发布，没有改默认用户数据/常驻实例；所有测试进程、远端fixture及DMG挂载均已按所属收尾。

唯一未执行的部署步骤：经明确授权，用已验收052原安装器覆盖本机App，保留真实数据，检查默认入口/数据/启动；若用户先要求旧UI缓存迁移，再按具体验证作用域处理，不直接自动合并不明后端的缓存。详细实际结果见核心docs/aiwata/changes/2026-11-12-052-v0231-native-client-parity.md与本机completion/macos-parity-acceptance.md。


## 053授权部署收尾

用户已明确允许覆盖并保留数据，不再处于等待授权状态。最终052原Installer完成默认覆盖、窗口交接、网关就绪；339renderer/11核心路径、签名、原1会话2消息逐行和配置元数据核对通过。公共路径重开后唯一桌面、网关ready。因CUA身份缓存无法执行菜单Quit，闲置验属后定向SIGTERM重开，原生视觉未作新签收。安装器已退出、DMG已卸载，默认桌面留运行。详见核心053；旧计划中的未授权/默认051是历史阶段。

本轮约定的源码升级、原客户端能力承接及默认部署链路已落地；物理OS热键、专用Computer Use、新外部授权/语音权限、公证和跨平台等明确未验项不能标成“全功能全条件已验证”。不为补这些条件擅自增加Provider、权限或对真实数据故障注入。
