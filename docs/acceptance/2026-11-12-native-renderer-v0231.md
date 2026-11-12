# 新原生桌面与 Hermes v0.23.1 验收

2026-11-12。本轮使用全新数据目录、两个合成 Bot Profile、原 AIWATA Electron main/preload、原 HermesGateway 和升级后的标准网关。模型端为本机脚本化应答器；实际 Agent、工具执行、审批、数据库及原生浏览器桥均未替换。没有修改生产代码、推送或发布，也没有使用现有账号数据。

通过：普通会话流式回复和停止后续聊；双 Bot 私聊及 canonical Bot Chat 身份；界面创建双 Bot 托管群、全员和 @成员回复、审批及审批中排队、停止；普通会话拒绝操作；Agent 打开并读取原生浏览器页面。退出整个 Electron 后，群任务仍由网关完成；冷重开恢复结果和相同 Bot Chat 身份。

未通过：会话重开后工具折叠详情没有恢复。后端 snapshot 保留 5 条 tool 消息，界面 details 数为 0；文本及结果文本仍在。入口为 `src/live-aiwata.mjs::gatewayTranscript`（历史 tool 行被跳过）及 `src/agent-transcript.jsx`（详情来自实时 turn.tools）。需要补齐历史投影及行为测试，本轮仅验收，未修复。

自动回归：前端 `npm test` 286 通过；主工程 Bot canonical / 群 Retry 坐标 / 托管群恢复专项 34 通过、11 平台跳过、0 失败。没有将早期自动化选择器和 Tab 时序错误计为产品故障；已按实际控件重跑。

真实 GLM、跨机群聊、网关崩溃后的 UI Retry、Bot 新建删除完整流程、外部授权、Computer Use、安装包及 Windows/Linux 不在本轮通过范围内。042 的其余迁移限制继续有效。

完整记录：主工程 `docs/aiwata/changes/2026-11-12-043-native-renderer-acceptance.md`。本机私有证据位于 `/Users/xuke/Documents/getian/aiwata-private-artifacts/native-renderer-043.92_uy_6k/`。仅本批桌面、隔离网关和测试服务收尾，保留合成数据和证据。
