# AIWATA App 前端

`aiwata-app` 是 AIWATA 的替换前端工程，源码保持独立。原 AIWATA Electron 宿主继续负责连接、网关生命周期、系统权限、窗口、目录选择和原生工具；本工程负责界面、输入与展示适配。

## 当前原生入口

`npm run dev:aiwata`（`dev:native`、`dev:desktop` 为同一入口）启动**已有 AIWATA 应用**，通过 `HERMES_DESKTOP_DEV_SERVER` 加载此界面。4182 端口只提供前端资源，未加载 `live-aiwata-gateway` 插件，不创建另一套网关、SecretSource、驱动或执行环境。原 AIWATA 源码的 `apps/desktop` 默认 `dev` 也指向此入口。

本机原宿主位置记录在忽略的 `scripts/native-host.local`；其他机器用 `AIWATA_NATIVE_APP` 指定现有应用路径，`AIWATA_APP_SOURCE` 指定 AIWATA 源码。启动器不会安装宿主或申请系统权限。先退出同一应用的旧窗口再使用这个入口；不能通过启动第二实例绕过原单实例锁。

新界面直接调用原 `window.hermesDesktop`，原 `HermesGateway` 通过仅限原生构建的别名引入。连接及 Profile 来源为原宿主保存的路由；不再显示林晓、乔安演示账号。业务数据继续归原后端，前端布局、草稿与附件按原生连接/Profile 使用独立 UI 存储键。原演示/联调数据目录与浏览器存储原地保留，未合并到原 AIWATA。

`npm run build:native` 构建 `dist/native`。原 AIWATA 的 `apps/desktop/renderer.json` 指向此源码，原桌面编译器已经使用本前端，同时保留原宿主产物及公共资源。当前尚未覆盖已安装的签名应用包，也未生成正式安装包。

## Mock 与回退

`npm run dev` 仍在 4178 提供纯 Mock 原型；`npm run build` 和 `npm run test:sites` 保持 Sites 交付结构。

原 AIWATA 源码的 `dev:legacy` 和 `build:legacy` 为旧前端回退入口。独立联调仅作为历史数据恢复工具保留：`dev:live` 对应旧 4180 数据根，`dev:legacy-isolated` 对应旧 4181 数据根；`dev:legacy-desktop` 是原独立预览宿主。它们不属于当前替换运行链路，不应作为原生验收入口。

## 验证

```sh
npm test
npm run build:native
npm run build
npm run test:sites
```

本轮替换与实际验收记录见 [原生前端替换计划](docs/superpowers/plans/2026-11-12-native-frontend-replacement.md)。完整功能对齐尚须按原客户端逐项验收；原生接口缺口和未验证范围在 [接入参考](docs/aiwata-integration.md) 单独列出，不能把历史私有 Python 联调桥的结果算作新链路通过。

## 操作路径

- 在项目中创建或切换会话，打开右上工具区，分别拖动项目栏与工具栏的边界。
- 从分栏进入工具完整视图，再恢复分栏。观察宽度、标签和草稿。
- 打开多个工具标签。将指针停在标签上查看缩略图，标签溢出时在标签栏上滚动。
- 打开左下积分余额或账号菜单。用乔安尝试发送托管消息，再切换本地模型发送。
- 在会话底部选择「演示场景」，发送后体验流式回复、审批、追问、子 Agent 和浏览器联动。会话运行期间可以排队发送。
- 从左侧管理项目目录、Bot 和群聊、任务、连接器、技能与记忆。在账号菜单模拟断网或退出。
- 在右侧体验文件预览、浏览器批注、模拟终端和 Git，或按供应商能力体验媒体工具。


创建项目的「添加文件夹」由 Electron `dialog.showOpenDialog` 打开操作系统目录选择器，支持多选和新建文件夹；浏览器版只显示当前工作区选择入口，不使用上传控件模拟目录选择。文件与 Git 面板通过原生只读 HTTP API 获取内容，先校验当前账号、Profile 与会话，再使用一次性原生票据；不提供任意 HTTP 代理，也不增加 Git 写操作。

原生 Agent、工具、模型/MCP 与权限仍由同级 AIWATA 提供。本仓库中的 Vite 插件是开发连接入口，既有部分管理接口仍使用薄 Python 适配调用原生模块，尚不是独立分发的正式桌面安装包。能力验收状态及边界见 `docs/aiwata-integration.md`。
