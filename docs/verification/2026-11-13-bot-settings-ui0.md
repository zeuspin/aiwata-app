# Bot 设置与统一管理 UI0 验证

2026-11-13。用户确认把低频全部管理与单 Bot 配置分开。本轮只改独立 App 前端；不改 Hermes 核心、不覆盖已安装 App、不改真实用户数据。

## 结果

- 聊天顶部身份按钮和列表单项设置打开当前 Bot/群聊抽屉，保留聊天 DOM、输入草稿和工具布局。
- 单 Bot 设置直接编辑基本资料，头像在基本信息内展开，另有能力、记忆、自动化、高级四栏。原生详情/保存/模型确认/版本检查继续沿用已有契约；保存成功后重新读取最新版本。
- 全部管理保留紧凑 Bot/群聊清单、搜索、类型筛选、新建/配置复制、设置、受保护删除与重连；分类仍在聊天列表菜单管理，不改变 Profile/记忆边界。
- 未保存关闭可取消或放弃，保存中不可关闭；只读加载可以取消。原生高级页面打开前处理暂存修改并离开表单。旧版选中单 Bot 的页面路由恢复为全部管理，再从抽屉进入。
- 群聊编辑复用完整成员映射；同 Profile 的本地与远端成员保持独立，保存用途不会更换远端主导 Bot。

## 实际验证

最终 114/114 相关 Node 行为测试通过，完整命令包含：bot-settings-drawer、bot-settings-content、native-groups、bot-sidebar、bot-avatar-motion、bot-directory、bot-primary、workspace、agent-session、bot-transcript、native-group-navigation-ui、native-bot-birth-ui、project-colors-default-bot、main-navigation、native-bot-model-ui、bot-peeking。日志 `/private/tmp/aiwata-bot-settings-tests.log`。

新增用例覆盖：精确目标与聊天/草稿保留、关闭焦点、保存中取消与嵌套弹窗、旧导航恢复、直接编辑、跨栏草稿、统一管理入口、Profile 记忆导航、原生两次保存版本/原始文本更新、慢请求和已移除目标、远端主导身份、仅头像预览不误报修改。抽屉缺失、远端成员混淆、旧路由绕过均先观察失败，再修复通过。

`AIWATA_APP_NATIVE=0 AIWATA_APP_LIVE=0 npm run build` 通过；保留既有大 chunk 提示。日志 `/private/tmp/aiwata-bot-settings-build.log`。

隔离临时 Chrome 对纯 Mock 4178 预览验证：单 Bot 打开、五栏、直接改名保存、Esc 保留未保存内容、关闭草稿和焦点、全局清单、从清单打开指定 Bot、群聊抽屉、390px 无横向溢出，无页面异常。原生焦点问题在浏览器中发现并修正；重跑通过。脚本 `/private/tmp/verify-bot-settings.mjs`，截图 `/private/tmp/aiwata-ui0/bot-settings-drawer.png`、`bot-settings-memory.png`、`bot-management-overview.png`、`group-settings-drawer.png`、`bot-settings-narrow.png`。

## 限制

本轮真实桌面/真实 Profile 保存未另行验收；原生部分为适配器契约测试。没有宣称项目独立记忆、自动协调或 M0 接入完成。全量 npm test 未重跑，059 记录的九项环境限制仍保留，不将局部回归称为全量通过。无分支、提交、推送、容器或安装覆盖。


## 后续：用户要求做到本地可测试

已启动当前源码的原 Electron 宿主 + 4182 native renderer，数据目录固定为 `/private/tmp/aiwata-bot-local-test`。复用055已验证的原生后端快照和已提交PM依赖，没有覆盖 `/Applications/AIWATA.app` 或复制真实用户数据。启动器为 `/private/tmp/aiwata-bot-local-test.mjs`，从 aiwata-app 目录执行；本机日志 `/private/tmp/aiwata-bot-local-test.log`。测试数据保留供用户手工验收，不做删除。

本次 `npm run build:native` 成功（25.48秒，既有chunk提示）；原生AX观测到4182登录窗口与两个虚拟用户，已请求打开用户一；测试子进程页面就绪信息显示 `AIWATA 工作台` / `http://127.0.0.1:4182/`，对应测试用户原网关已产生运行状态。真实桌面设置保存/模型生成本次未自动验收，交由用户在该实例试用；不将启动就绪冒充这些操作已经通过。

首次临时启动从core工作目录运行导致Vite允许路径错误，已仅停止本轮实例并从正确前端目录重启；未修改源代码以绕过。CUA最初按通用Electron名称选中了另一个Electron默认窗口，之后改为明确core Electron路径观察；工具切换子进程不稳定，因此未继续自动操作设置。4178 Mock服务仍可用（HTTP200）。


本页是历史阶段证据；2026-11-16选择性回滚后的实际范围与验证以核心071记录为准，未保留其他新功能或继续此前项目融合计划。
