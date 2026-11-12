# 前端职责对齐：回滚、保留与调整方案（用户已确认，持续执行）

> 状态：用户已批准分阶段执行。批次 0/1 已执行并验收原生状态接口；用户随后确认只需账号目录/Profile 分离，已授权撤除额外操作系统隔离；批次 2/3 正在执行。无提交、推送、新分支、安装、授权或容器操作。
> 实施时按 `superpowers:executing-plans` 逐项执行；本文不自动授权并行代理或其他额外工作。

**Goal:** 撤回偏离原生运行体系的改造，保留当前界面、交互和数据，将客户端与桌面宿主接入调整为 AIWATA 原生职责。

**Architecture:** `aiwata-app` 承担原客户端的界面和桌面宿主职责。保留原生协议适配，使用原生后端、权限、工具及桌面生命周期实现；工程独立不等于另建 Agent 运行体系。分批替换联调实现，禁止为了删除旧层而直接损失能力或扩大权限。

**Tech Stack:** React/Vite、Electron、AIWATA 原生 HTTP/WebSocket/IPC；现有纯 mock 模式继续保留。

**Spec:** 本工程 `AGENTS.md` 的「工程职责约定（用户确认，2026-11-11）」及本轮用户要求：确认后执行、保留界面与数据、代码不提交。

## 全局边界

- 不使用 `git reset --hard`、整文件恢复到 HEAD、`git clean` 或整体删除未跟踪文件。当前未提交内容混合了多轮功能；HEAD `91eee51` 不是本轮开始前的精确快照。
- 本轮清点还发现 `tests/main-navigation.test.mjs` 等新增导航改动。来源不能一概归为本轮，不纳入回滚。
- 不更改模型密钥、用户身份、聊天归属、消息、项目路径、Bot 外观或群聊成员。运行配置只按字段恢复，不覆盖整份配置。
- 不把删除 Computer Use 代理等同于卸载原生 Cua Driver，不自动安装驱动、SDK 或 Chromium，不修改系统授权。
- 用户已确认撤除额外操作系统隔离，保留账号/Profile 数据边界并使用原生宿主权限。凭据来源和其他职责冲突仍需单独确认。
- 不改动相邻 AIWATA 源码树。确实需要原生后端/共享模块修改时，先单独说明缺口和修改范围。
- 保持 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs` 完整。

## 只读证据与当前状态

1. `scripts/live-aiwata-gateway.mjs::isolatedHome` 创建独立运行目录及默认配置；`scripts/live-aiwata-sandbox.mjs` 另加文件、网络、进程和桌面限制。当前不是单纯连接原客户端同一运行环境。
2. `prepareComputer` 被纳入网关准备流程，失败会阻断登录。最后一次界面观察为「Computer Use 主机通道已结束」；本轮没有重新启动以复现或继续修复它。
3. `scripts/live_aiwata_model_scope.py::prepare_profile` 自动设置自定义 backend、socket、placement、工具 defer 和桌面环境提示。凭据来源注册与这些改造混在同一文件，不能整文件删除。
4. 交互终端、生图、视频、部分任务/记忆/连接器操作依赖 `sandbox`。直接改为普通联调会造成缺失功能，因此只能在替代链路验收后移除对应旧实现。
5. 原客户端已有 Computer Use 状态和授权 API：
   - `apps/desktop/src/api/toolsets.ts::getComputerUseStatus` → `GET /api/tools/computer-use/status`
   - `grantComputerUsePermissions` → `POST /api/tools/computer-use/permissions/grant`
   - 服务实现在 `hermes_cli/web_routers/tools.py`；不需要为状态面板另造 Provider。
6. 原客户端已有 `electron/local-gateway.ts`、`terminal-ipc.ts`、`select-paths-dialog.ts` 和 preview 宿主模块，应以其合同承接对应职责。尚未完成这些模块与本工程的完整接入验收，不能宣称可直接替换即用。

## A．需要回滚的具体内容

### A1．撤回自建 Computer Use 体系

仅在引用解除和配置恢复可安全执行后，从活动代码中移除：

- `scripts/live-aiwata-computer.mjs`
- `scripts/live-aiwata-computer-install.mjs`
- `scripts/live_aiwata_computer_host.py`
- `scripts/live_aiwata_computer_provider.py`
- `scripts/live_aiwata_computer_install.py`

同时在以下混合文件中只撤回对应调用，不恢复整个文件：

- `scripts/live-aiwata-sandbox.mjs`：Computer bridge 创建、Provider 安装、网关 PID 绑定、Computer 专用准备/释放及私有 manifest/config 快照支撑。保留其他已授权的账号隔离逻辑，按 C 类后续决定调整。
- `scripts/live-aiwata-gateway.mjs`：旧 `computer/status`、`computer/permissions` 对自建 broker 的依赖和登录耦合；面板功能按 B1 改接原生接口。
- `src/live-aiwata.mjs`：替换对应两个旧路由的客户端实现，保留对 UI 的稳定方法边界。
- `package.json`：仅调整已淘汰的测试入口，保留其他功能测试与依赖；不整体回退 lockfile。

`tests/computer-use-broker.test.{mjs,py}`、`tests/computer-use-install.test.{mjs,py}` 随对应实现退役；将所需的账号/取消/权限边界断言改为原生接入合同测试，不再维持自建 broker 的行为。

### A2．停止自动覆盖原生运行配置

修改 `scripts/live_aiwata_model_scope.py`，移除自定义 Computer Use 安装/配置流程、自动改写工具加载策略及桌面提示块。暂不删除已有模型授权来源实现；其原生化归 B3，必须先保证现有密钥仍可使用。

恢复范围限定为经清点确认的 3 个 Profile：

| Profile | 当前专用配置 | 可用的改造前备份 |
| --- | --- | --- |
| `~/.aiwata-app-isolated/lin/runtime` | `computer_use.backend=workbench-computer-use`、专用 socket、`bot_desktop.placement=gateway`、工作台提示块 | `backups/config/config.yaml.good.20261111-172515` |
| 上述目录 `/profiles/bot-33185c67-b15` | 同上 | `backups/config/config.yaml.good.20261111-172532` |
| 上述目录 `/profiles/isolation-check` | 同上 | `backups/config/config.yaml.good.20261111-172532` |

只读检查确认：这些备份中没有本轮新增的 backend/placement 字段，当前 3 份配置都有对应改写。实施前重新校验，按字段恢复“原来不存在”的状态；不要把整份旧备份覆盖当前配置。

工具 defer 清单按当前值与有证据的改造前值做逐项差异恢复；不凭默认值覆盖用户自定义清单。桌面提示只处理可归属本工程的标记块及源码定义的旧提示原文，保留用户其他 append/replace 内容。有不明归属或并发变化即暂停该字段并说明。

### A3．退役联调 Profile 内的专用插件与残留

- 对以上 3 个 Profile 的 `plugins/workbench-computer-use/` 先在本机恢复包中保存完整副本，再解除活动安装；如文件被用户修改，先报告差异。
- 只在核对所属进程已退出后处理该账号自己的 `cu.sock` 和宿主临时快照。socket 文件存在不等于进程仍在运行，不能按文件名杀进程。
- 不删除运行根目录、`state.db`、Profile 目录、`projects/`、原生工具安装目录或配置备份。

## B．保留功能、调整实现的具体内容

### B1．Computer Use 面板和原生桌面连接

保留 `src/live-agent-inspector.jsx` / `.css` 的工具与任务界面，保留电脑操作面板；状态和用户点击授权改接原客户端已有的原生 API，不创建额外驱动 Provider。API 必须经当前账号/原生宿主作用域访问，不向 renderer 暴露长期凭据。授权继续由用户主动触发。

涉及 `src/live-aiwata.mjs`、`scripts/live-aiwata-gateway.mjs`、`scripts/desktop-preview.mjs` / preload 的适配。核对原生 API 的鉴权、Profile 和宿主路由后再接线；有 API 还不等于当前联调启动方式已经提供完整原生服务。

### B2．桌面宿主能力保留并归位

保留并对照原客户端复核：

- `scripts/desktop-preview*.mjs`、`scripts/desktop-preview-preload.cjs`、`scripts/launch-desktop-preview.mjs`：窗口、webview、可信 IPC、网页动作、截图、标注、favicon、DevTools。它们属于目标应用必要职责，不能整组删除。
- `src/vendor/aiwata-preview`、`src/vendor/aiwata-preview-drive`、`scripts/vendor/aiwata-window` 及同步脚本：保留原生来源、许可证和版本证据；对齐共享实现的更新方式，不为“清理工程”删掉可用能力。
- `scripts/live-aiwata-folders.mjs` 和 Swift 目录选择 helper：保留目录选择交互，实施时对接原客户端 `selectPaths`/`dialog.showOpenDialog`；原生对话框验收通过后再移除重复 helper。
- `src/live-terminal.jsx`、`src/agent-terminal.jsx`、`src/terminal-reader.mjs` 和 xterm 依赖：保留界面、阅读位置、多个终端实例，以及“隐藏视图不终止 Agent 后台进程”的语义。按原生 `terminal-ipc.ts` 的连接归属、PTY 和退出合同接入后再退役旧终端 launcher。

服务启动/连接/重连也是客户端职责。调整 `scripts/launch-desktop-preview.mjs`、宿主入口、`vite.config.mjs` 和启动脚本，使其承接原生宿主生命周期，而非让 Vite 插件拥有一套新运行体系。暂不大规模改名或变更打包方式。

### B3．业务接入保留、逐项替换内部直连

保留模型授权、MCP、输入补全、文件/Git、任务、记忆、连接器、图片/视频及 Bot/群聊页面及用户配置。

主要涉及 `src/live-*.jsx` / `.mjs`，`scripts/live-aiwata-{capabilities,files,git,terminal,rooms,bots,connectors,skills,tasks,memory,images,video,audio}.*`、`scripts/live-aiwata-runtime.mjs` 及相关 Python companion。

处理原则不是按目录批量删除：

1. 原生已提供的 HTTP/WS/IPC 改用同一接口和鉴权/作用域。
2. 原客户端确实在宿主执行的功能，承接其宿主实现。
3. 当前通过 Python 私有模块、直接数据库读取、源码相对路径实现的部分逐项建立替代表；没有等价接口前保留过渡实现并标明，不先删功能。
4. 不把本批次批准解释为允许改造相邻 AIWATA 后端或修改密钥来源。若需要这类变更，单独确认。

### B4．能力和工具可见性改为真实原生状态

修改 `src/workbench.jsx`、`src/live-aiwata.mjs`、`src/App.jsx`：解除“只有 macOS 隔离模式才有终端/生图等能力”的前端硬编码，将能力判断接到真实原生宿主与后端状态。保留原有界面位置；未接通时显示实际状态，不伪造成功。

保留 `src/live-workbench.jsx`、`src/desktop-requests.mjs`、`src/desktop-request-cards.jsx`、`src/desktop-events.mjs`、连接请求卡片与后端请求账本中正确的协议部分：握手、取消、重连、代际、所属会话/Profile、凭据临时输入等。

主题、导览、setup beat 当前未完整实现，轻提示目前只是通知。这些是后续原生一致性缺口，不用移除界面功能掩盖，也不归类为已验收。

## C．已解决的执行边界（用户后续确认）

用户确认只需用户目录、数据和 Profile 分离，避免配置/凭据/历史混用；不要求同机恶意用户之间的操作系统级隔离。可撤除额外 Seatbelt，并按 AIWATA 原生宿主的权限运行，不合并账号 Home，不安装自建 Computer Use Provider，不自动安装软件或授予系统权限。

目录名和旧入口保留仅为兼容历史数据，不能再以“受限网关”描述当前运行环境。若以后升级到互不信任的多租户部署，另行提醒用户确认，不自行扩展本任务。

## D．完整保留的界面与数据

### 界面/交互与代码

- `src/navigation.jsx`、主导航和相关新增测试；现有栏目、图标、布局与 tabs、双击布局行为。
- Bot 几何/人物/探头头像、随机十选一、自定义组合和状态动画；群头像叠放。
- 新建会话草稿、项目选择/标记、项目创建布局与目录反馈。
- 普通会话/Bot/群聊消息视觉、用户消息靠右、头像、引用回复。
- 浏览器标注、语音入口、编号、截图、发送到明确对象草稿、控制台、标题/favicon、DevTools。
- 当前模型授权、MCP、补全及其他管理页面。调整连接实现不重做布局。
- 其他不能归属本轮运行时改造的改动均不擅自回退。

### 运行和本地持久数据

- `~/.aiwata-app-isolated/` 与 `~/.aiwata-app-dev/` 的账号、Profile、聊天、附件、项目、配置、模型授权、MCP、记忆与任务数据。
- 当前目标 lin 默认 Profile 及两个 Bot Profile 的只读计数分别为 `7/397`、`3/12`、`3/26`（sessions/messages）。实施前重取快照；不把新增正常消息当成恢复失败。
- Electron `~/Library/Application Support/AIWATA Workbench Preview/`，工作台原有来源地址，localStorage 两套 accounts key，以及 IndexedDB `aiwata-ui-prototype:attachments`。
- 不改账号/会话 ID、存储 key、数据根、Electron userData 路径或端口来源来“顺便去原型化”。这些变更需要单独的数据迁移方案。
- 保留已持久化的网页状态、标注、附件和草稿；当前网页登录分区本来是临时的，不声称已具有原生持久登录能力。

## 待批准的执行顺序

### 批次 0：本机恢复点与差异基线

- [x] 重新核对当前工作区及相关文件变动，以最新内容为准，保护同时进行的导航/界面工作。
- [x] 将本批次会修改的代码、3 份配置及专用插件保存到本机 `~/.aiwata-app-recovery/frontend-responsibility-2026-11-11/`，目录 0700、含配置文件 0600；不上传或写入仓库，不把密钥打印到日志。
- [x] 对涉及的 SQLite 数据库用 SQLite backup API 创建一致性恢复点；不以漏掉 WAL 的裸文件复制替代。其他用户数据不移动、不清理。
- [x] 若需要暂停/重启，先确认本次拥有的服务没有活动任务，只操作核对过的所属实例；不影响用户其他 AIWATA/Hermes 实例，不自动杀进程。

### 批次 1：原生 Computer Use 接入与专用体系退役

- [x] 先核对 B1 原生状态/授权 API 与当前宿主路由；补可替代的客户端适配与合同测试。
- [x] 执行 A2 的字段级恢复并停止自动覆写。出现字段归属冲突先停，不覆盖整份旧配置。
- [x] 对专用插件做可恢复归档，解除 A1/A3 旧体系及登录依赖，保留 Computer Use 面板。
- [x] 若原生链路受 C 类隔离冲突阻挡，报告确切阻挡与权限差异，请用户决策；不通过关闭隔离或再加 Provider 绕过。

### 批次 2：原生宿主与其余业务接入归位

- [ ] 建立 B2/B3 每项能力的原生对应入口和待替换调用清单，先完成等价接线，再移除重复 helper。
- [ ] 调整 B4 的能力映射与开发入口，保留用户数据路径、现有界面和纯 mock 模式。
- [ ] 执行边界需变化时先走 C 的确认，不因这一总体方案获准而跳过冲突提醒。

### 批次 3：验收与文档校正

- [ ] 回归现有界面及持久状态：项目/会话/tabs/头像/消息/标注/草稿/附件，验证恢复后 ID 与归属不变。
- [ ] 用相同后端版本、Profile、模型、配置和授权对比原客户端与新客户端的普通会话、Bot、群聊、内嵌网页、Computer Use、终端、模型/MCP/补全；不以工具枚举成功代替操作成功。
- [ ] 验证切换账号/Profile、退出、取消和重连时无跨对象读写，模型授权与凭据不泄露。
- [ ] 按调整后的实现运行相关合同测试及 `npm test`、`npm run build`、`npm run test:sites`，确认 Sites 制品完整。此轮规划阶段不运行会创建资源的测试。
- [ ] 更新 `docs/aiwata-integration.md`、`design-qa.md` 和旧 Agent parity 计划状态，记录已退役路线与真实未完成项。`AGENTS.md` 职责约定保持有效。
- [ ] 汇报实际变更、保留项、数据核对和未解决的冲突；不提交、不推送。

## 执行前文件指纹（仅用于发现并发变化）

任一指纹变化只意味着需要重读差异，不能强制覆盖成本文版本。

```text
scripts/live-aiwata-computer.mjs 69e1ac67c45465cdae011bd32b5c5e4bf826febe176d02ebfc6456b229b73dd4
scripts/live-aiwata-computer-install.mjs 3abf168141d78ad39f84ae9be8c434c6bbeaae4e0d0ea99548b44cc4dd711688
scripts/live_aiwata_computer_host.py eb52c66183c157764c227c3b72c1cff3f9f52380427e5a0c103cb19b139a0748
scripts/live_aiwata_computer_provider.py 04dd242de8d8e14adfd002177d52c002a0855d7f687622d7b99a7d9f743c6c9b
scripts/live_aiwata_computer_install.py cf269cb094b78c0b1adc3813c7b4066e7c02dd6adceeb3445977b90ecb7fab57
scripts/live-aiwata-sandbox.mjs 4f103c22339aa391fa3329a48627d721bfb3d83f273870f825927557059b0c8f
scripts/live_aiwata_model_scope.py 9f8e1c2d0465b3273fc28909ceee05c1ab87511c3f9f85766804fb44401c7164
scripts/live-aiwata-gateway.mjs 6c1b8352bf2ebef2d820bfcc6ad5302d73c3d982cf0211a87a6a83d11743a294
src/workbench.jsx e74a258cface0ab000848654b8f09b7bdd1a86fe368f8beb659052e1a3e0baac
src/workspace.mjs 7a048365211dfcbc060fecc24ef9fb1fb5bd17e19b5901c6827ad1a102323f01
src/live-aiwata.mjs e2b1ea250b67014c03f34d808bedf1dd50c5940a86d52521cf0f39e9a4ca129b
src/live-agent-inspector.jsx c63cbc059e4a0399469a213a44190c8299954f3c2445792c782f1b923a972469
package.json 248747a14ba8bb07b034e353003d28759f3dd02cd0cc283e9ee0ad214450fa3d
vite.config.mjs 1dbdfc1211f4e3ff632d76627e0b441e4302c6506fba319c9cce29aa69bbb062
```


## 第一批执行结果

- 恢复点：`~/.aiwata-app-recovery/frontend-responsibility-2026-11-11/`；204 个执行前工作区文件、3 个 Profile 配置/插件及数据库快照，数据库一致性检查通过。
- 自建 Computer Use 体系的 5 个脚本及 4 个对应测试退役；活动插件归档；仅删除无监听且 inode/归属已核对的旧 `cu.sock`。
- 原生 REST 状态、授权和进度合同接入；凭据仅在服务端使用，Profile 作用域、退出保护和响应限制保留。移除 Provider 失败阻断登录的耦合，既有 Seatbelt 保持。
- 工作台登录恢复；浏览器验收已读取默认 Profile 与 Bot 的原生状态，均显示原生服务已连接、当前运行环境驱动未安装。未安装软件、未触发授权、未发送模型测试消息。
- 3 个 Profile 的消息内容校验值与恢复点完全一致，会话/消息计数不变；现有界面和数据路径保留。
- `npm test` 257/257、Sites 4/4、生产构建和 diff 检查通过。独立只读复核未发现阻止本批次验收的重要问题；这不是完整能力一致性的验收结论。
- 后续 B2/B3/B4 不在本次实际完成范围；涉及执行环境切换的内容等待 C 类确认，不能自动关闭隔离。
