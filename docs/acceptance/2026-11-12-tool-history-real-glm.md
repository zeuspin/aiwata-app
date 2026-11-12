# 工具详情恢复与真实 GLM 验收

2026-11-12。已修复 043 发现的历史工具详情漏显。`src/live-aiwata.mjs::gatewayTranscript` 关联保存的调用、参数与结果，`src/workspace.mjs::hydrateGatewayChat` 恢复活动回合已完成的详情；继续使用既有卡片和样式。按回合顺序处理重复调用 ID，保留文本结果、忽略隐藏工具行，不把未返回的工具当作已完成。两项新增回归均先验证失败。

本轮使用原 AIWATA Electron host、标准网关、全新 home/userData 和两个合成 Bot，真实调用 GLM-5.3。普通聊天、terminal 调用、两个 Bot 私聊、界面创建双 Bot 群聊、@指定成员的真实工具调用全部通过。后端原 managed scope 加载凭据，前端和测试脚本未读取或复制真实密钥。

页面重载及桌面完整重开后，工具卡数量与后端一致，参数和 JSON 结果正确；群历史和 Bot Chat 身份也保持一致。最后一次检查等待原生历史载入完成，排除了初始浏览器缓存造成的假通过。截图位于本机私有证据目录的 `screenshots/13-final-code-restored-tool.png`。

另发现并修复主工程网关读取入口未应用 AIWATA 默认模型的问题：只在新档案未配置模型时复用原默认映射；用户显式模型、endpoint 和共享 effective config 语义保持不变。该修复在主工程维护批次 044 记录，没有另写网关或改变认证和权限边界。

验证：前端 288 项通过；native/Mock 构建通过；Sites 4 项通过；后端相关 80 项通过、11 平台跳过；主工程 15 项静态检查通过。未做跨机群聊、安装包、其他供应商、外部授权、Computer Use 或 Windows/Linux 验收。

完整记录：主工程 `docs/aiwata/changes/2026-11-12-044-tool-history-real-glm.md`。本机证据根：`/Users/xuke/Documents/getian/aiwata-private-artifacts/native-renderer-044.ylmbnjkx/`。测试服务已按归属收尾，保留合成数据；现有常驻网关、安装应用和账号数据未切换。没有新建分支、提交、推送或发布。
