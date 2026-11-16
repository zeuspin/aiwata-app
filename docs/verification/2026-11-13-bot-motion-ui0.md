# Bot 动效与可收窄列表 UI0 验证

2026-11-13。用户反馈主 Bot 占位过大，要求去掉可见“主 Bot”字样、用AIWATA方形身份、参考Grok灵动与鼠标跟随，并能拖动列表收窄到只有头像。已查看31.925秒录屏的分帧，确认视线跟随/轻倾斜和右边缘收窄行为。

## 实现范围

- `bot-directory.jsx/.css`：展开主 Bot 点击区约97px高，只保留头像和名称；收窄时头像入口约63px高。列表头像使用显式 interactive。头像态保留条目、真实群成员和可访问名称；悬停/聚焦显示名称与真实最新消息/简介，Esc关闭，搜索展开。预览卡继承当前主题。
- `bot-avatar.jsx/.css`、新 `bot-avatar-motion.mjs`、`bot-appearance.mjs`：默认主 Bot 黑色方形白眼。共享一个窗口指针监听和一个按需rAF，低幅眼神位移/身体弹簧倾斜及非固定间隔眨眼。交互角色使用平面颜色，停用泡泡/口哨/灯泡装饰；照片保留原图与真实状态环，历史/顶部still不启用互动。减少动态、触摸、离开/失焦、页面后台及卸载均清理互动；并非修改Bot运行状态。
- 新 `bot-sidebar.mjs` 配合 `workbench.jsx`、`workspace.mjs`：桌面72px头像态，160px阈值，展开最小200px；窄屏使用实际可用展开预算，按下不跳变。拖动连续反馈、松手提交，取消/Esc/失去捕获回滚；方向键/Home/End/双击可操作。`navigation.modules.bots.sidebarWidth/sidebarExpandedWidth`按账号本机持久化，不污染普通项目栏宽度，浮层仍保持展开列表。
- 保留 App主导航栏/标签/工具面板、默认Bot canonical主聊天和上传头像身份。没有真实模型/核心运行源码改动、安装覆盖或配置迁移。

## 验证

最终相关检查98/98通过，含新增动效控制器/组件接线、完整Workbench拖动与取消、窄屏按下/展开、宽度持久化及账号隔离、紧凑列表键盘预览/搜索等行为；其余覆盖workspace、Agent事件、头像、列表、原生默认Bot身份/模型/新建。曾观察窄屏按下由153px跳到72px的红测，已修复并重跑通过。日志本机 `/private/tmp/aiwata-bot-motion-tests.log`。

`npm run build`通过，仍有既有大chunk提示，日志 `/private/tmp/aiwata-bot-motion-build.log`。独立审查发现Esc取消缺口，tooltip与拖动均已修复。全量npm test未重新执行，之前9项环境限制保留，不声称全量通过。

本机已有纯Mock预览 `http://127.0.0.1:4178/?ui=bot-directory`。隔离临时Chrome实际检查鼠标左右移动导致眼神反向、减少动态归零、紧凑主Bot尺寸、方形/去标签、拖窄/拉宽、悬停/Esc、拖动Esc回滚、搜索展开、重新登录恢复Bot宽度、切换项目保持普通宽度。760px头像栏与390px窄窗拖动另有浏览器复核，截图必须在布局稳定后捕获。

截图：`/private/tmp/aiwata-ui0/bot-motion-expanded.png`、`bot-motion-compact.png`、`bot-motion-compact-narrow.png`。用户浏览器原标签由Vite更新，浏览器测试仅使用隔离临时资料，无真实账户操作。

未新增分支/提交/推送/容器，未覆盖正式App。该轮只完成会话视觉迭代，项目会话/交接/记忆范围UI0及M0仍待后续，不代表原生能力验收。


本页是历史阶段证据；2026-11-16选择性回滚后的实际范围与验证以核心071记录为准，未保留其他新功能或继续此前项目融合计划。
