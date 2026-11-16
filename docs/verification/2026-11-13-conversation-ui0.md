# 会话 UI0 第一轮验证

日期：2026-11-13。范围为独立 `aiwata-app` 的会话展示；不是项目/Bot融合一期功能验收。方案为 `../superpowers/specs/2026-11-13-project-bot-workspaces-design.md` R2。

## 用户确认与实际改动

- 保留主导航栏、上下文侧栏、标签和工具面板结构；Bot 浅色气泡、用户深色气泡。
- 单聊历史不重复显示 Bot 头像；最新 Bot 回复保留状态头像，新响应尚未出字时将头像移到当前响应位置。后台仍在工作时允许最新头像继续播放真实状态；顶部身份头像静止。
- 群聊历史保留实际发言者头像，完整成员仍可查看。顶部/列表/管理页组合头像统一为当前用户＋最多三个有效 Bot，顺序保持原成员顺序。
- 静态上传图在状态间保持原图，思考/执行用环，等待/失败/完成/停止用角标；不套用角色口哨/泡泡装饰。加载失败回退同 Bot 的稳定角色，换图后允许重新尝试。
- `still` 和减少动态效果禁止头像 CSS 动画。头像状态不构成任务成果验收。

文件：`src/agent-transcript.jsx/.css`、`src/bot-avatar.jsx/.css`、`src/bot-conversation.jsx`，以及 account 透传的 `src/navigation.jsx`、`src/management.jsx`、`src/workbench.jsx`。未改 Hermes 核心运行代码。

## 检查结果

- 最终相关检查：`node --test tests/bot-transcript.test.mjs tests/native-group-navigation-ui.test.mjs tests/bot-peeking.test.mjs`，16/16 通过。新增行为先观察失败再修正：最新消息归属、新响应接替、后台状态、用户组合头像和失败图片重新选择。
- `npm run build` 通过；保留既有大 chunk 警告，不作为此次失败。未执行应用安装或发布。
- 全量检查一次：`npm test`，当时 531 项中 522 通过、9 失败；发生在新增后台/图片重选两项检查之前。5 项本地 HTTP 夹具监听被 sandbox 的 `listen EPERM 127.0.0.1` 阻断，4 项原生安装发现/PTY/环境检查被安装锁路径写权限阻断。没有把它们记为通过，没有为了 UI 原型改宿主权限或安装状态。完整日志本机 `/private/tmp/aiwata-ui0-test.log`。
- 独立审查发现最新回复总被设为静止的问题，已加入后台状态行为检查并修正。图片选择失败记录的生命周期另做检查并修正。

全量失败项：

1. the installed AIWATA keeps workbench model authorization inside the account and out of tool environments
2. Computer Use status uses native REST with a private one-use profile ticket
3. permission initiation and progress preserve the native asynchronous action contract
4. unsupported actions, unsafe origins, redirects and revoked logins never forward arbitrary requests
5. a login revoked while acquiring its native grant does not reach the endpoint
6. native file and Git reads use fixed read-only endpoints and preserve Profile in query
7. installation discovery uses the native launcher and PM store instead of a branded default home
8. native PTY starts with installed dependencies and returns real shell output
9. native companions retain pinned Profile and tool store after a legacy environment filter

## 可见证据与边界

纯 Mock Vite 预览 `http://127.0.0.1:4178/`；使用隔离临时 Chrome，未操作用户已有浏览器资料。浏览器控制连接超时后改用本机已有 Playwright/Chrome，没有下载依赖。

实测：两轮单聊只显示一个 Bot 消息头像；群聊保留各发言者；通过真实头像编辑器上传测试 PNG，六种状态下图片 src 不变；执行态 `animationName=bot-orbit`，减少动态后为 `none`；图片失败显示角色兜底，换新图恢复照片；1440×1000 和 760×900 两种窗口检查，窄窗口无页面横向溢出。截图本机 `/private/tmp/aiwata-ui0/` 的 `private.png`、`group.png`、`photo-state.png`、`narrow.png`。图片重新选回的补充行为以最终组件测试为证据。

本轮没有验证真实模型、项目记忆/历史隔离、交接、桌面重连或上游兼容合同。项目选择/两种会话视图/交接/记忆范围审阅的高保真路径仍待制作；会话视觉等待用户反馈，UI0 整体未完成。

无新分支、提交、推送、容器、Provider 切换或正式 App 覆盖。既有未提交设计文档保留。回退仅撤销本轮列出的前端及测试差异、对应文档增量，不动用户数据。


本页是历史阶段证据；2026-11-16选择性回滚后的实际范围与验证以核心071记录为准，未保留其他新功能或继续此前项目融合计划。
