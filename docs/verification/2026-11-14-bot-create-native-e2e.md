# 主 Bot 自然语言创建与聊天恢复原生验收

2026-11-14。承接063，用户要求无需手动加载技能，并报告新Bot首回复后回到空白页。全程使用独立测试账号、当前原Electron宿主、原052后端快照及既有PM依赖，真实GLM-5.3调用。没有覆盖安装、改Hermes核心、复制认证或操作用户原会话。

## 事实与修复

原有 Profile CLI 与 profiles.create 一直存在。063中冷笑话请求实际被模型做成cron，不能由此推论底层创建能力缺失。此前只验接口/按钮，未覆盖完整自然语言链路，是验收遗漏。

- src/bot-creation-command.mjs 与 submit-live-prompt.mjs：主Bot明确创建请求自动走现有技能展开，原始用户文本/请求身份保留。解释、否定、过去结果查询、非主Profile不匹配。原系统提示和历史模型上下文不改写。gatewayPromptDisplays只恢复本客户端自动展开的用户显示，冷重开不展示技能内部文本。
- bot-management-skill.mjs / bot-inventory-sync.mjs：补齐中文display_name，已发行旧文本精确匹配才升级；用户改过的技能不覆盖。
- native-desktop-client.mjs / bot-owner-identity.mjs / workspace.mjs：删除校验token包含配置修订和canonical发布，过去被误用来判断Bot换代，首次回复后会删除前端chat再建空对象。强删除token保留，另用稳定归属合并，旧存储token迁移；canonical根/解析ID映射保留。真实换绑由live-workbench.jsx重新载入。回归先红后绿。

## 真实验证

普通输入：帮我创建一个独立的 Bot，名字叫验收文案助手，专门把中文产品说明改写成简短清楚的文案。直接创建，创建后告诉我它的名字。

最终结果 `/private/tmp/aiwata-bot-real-chat-result.json`：ok=true、errors=[]。新Profile copywriter、显示名验收文案助手、独立SOUL职责正确，清单无需导航/刷新出现。随后在新Bot发送中文文案改写需求，真实模型完成回复；完成并同步清单后仍可见。重新加载工作区无需再发消息即可看到新Bot历史；返回主Bot看到原始创建需求，无手动技能名或技能正文。已目检截图 `/private/tmp/aiwata-bot-real-chat-child.png` 与 reopened.png。首个完整通过结果另留 first-pass.json。

测试脚本 `/private/tmp/aiwata-bot-real-chat.cjs`，最终隔离home `/private/tmp/aiwata-bot-real-chat-626SKy`。早期脚本发送时序/手工预置账号失败、错误用空输入发送按钮判断回合完成均保留为失败，不计通过；中间原生测试确实复现首回复后丢界面记录。最后用真实会话状态等待并完成全部检查。

150/150相关Node行为测试通过，含自动展开原始文本保持、技能安全升级、归属迁移、canonical别名与首次发布/配置修订不清聊天。npm run build:native通过（25.31秒，既有chunk提示），git diff --check通过。日志 `/private/tmp/aiwata-bot-e2e-tests.log`、build.log。

## 收尾与限制

五个本轮测试网关已按明确home白名单通过原CLI正常停止，pid文件均退出；测试数据保留，不删Profile或账号。用户原 `/private/tmp/aiwata-bot-local-test` 未清理，已重新打开该测试选择页并复用4182最新renderer，供用户继续验证。没有分支/提交/推送/Docker/默认安装覆盖。

这是本机原生、明确中文请求和实际GLM的验收，不保证任意模型/所有自然语言措辞，未扩大为远端、自动任务归属或项目记忆验收。全量npm test未重跑，063及059的环境限制保留。


本页是历史阶段证据；2026-11-16选择性回滚后的实际范围与验证以核心071记录为准，未保留其他新功能或继续此前项目融合计划。
