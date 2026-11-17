# 078 手动验收反馈修复

用户在077源码窗口反馈提示未出现、无目录项目没有迁入聊天。上次测试只覆盖目标扫描成功和明确目录项目，不能代表这两个分支已通过。

## 当前合同

- canonical show_tip经原Agent每轮回调和所属viewer请求tip.show到达原SDK；前端desktop-tip-request.mjs查询真实CSS，无落点返回失败及可用目标，DesktopTip定位后的DOM提交才返回display_confirmed:true。不新增模型工具，不改缓存前缀、布局或导览遮罩。
- 提示组件兼容StrictMode模拟卸载；实际所属变化、卸载或Stop不得确认成功或通过旧事件重弹。原事件消费者保留。
- tour操作异常返回结构化失败，权限/所属拒绝仍按原RPC合同。核心扫描未应答由永久失败改为30秒冷却后重试。
- 项目结果区分success与session_switched，并返回needs_path。没有文件夹仅保存项目，先询问工作目录，给现有项目添加目录，再按原ID切换；不能把创建成功说成会话已迁入。没有新增独立项目归属存储或代用户选择路径。

## 验证

新增行为先红后绿；完整前端590项、相关核心42项、完整15项静态检查及原生构建通过。独立审查发现的StrictMode错误回执和Stop事件回退均补回归并关闭。

追加GLM额度12/12（含启动探测/目录）已用完，未重置077的30/30。该轮修复前真实模型按原提示指令成功扫描并显示气泡，证明失败不是每次发生；**不能作为新回执实现后的模型复测**。修复后用实际原生SDK/Workbench协议回放确认：用户错误选择器失败，有效选择器气泡可见且返回display_confirmed:true，临时隐藏返回结构化失败。没有继续GLM请求或冒充两项修复后模型测试完成。

原生产物在/private/tmp/aiwata-078-native，既有大chunk警告保留；没有DMG/安装。证据在相邻核心.aiwata-evidence/native-feedback-078，完整记录见核心docs/aiwata/changes/2026-11-16-078-manual-tip-project-feedback.md。自动QA窗口收尾，用户077原数据保留并重启源码窗口继续手动验收；“验收测试”项目未指定目录，收到用户选择后才能迁入聊天。

后续用户批准新建隔离目录：已为原“验收测试”项目绑定077 workspace/acceptance-test，通过原生workspace mutation迁入报告问题的聊天。前后44条消息不变；重载后侧栏展开显示该聊天，前端归属与后端cwd一致。未重建项目、未追加GLM请求。
