# 077 原生接入修复与完整复测

用户批准修复076四处缺陷，布局不动，不覆盖安装、不新建分支或推送。保留074/075既有修改与071/072选择范围。四项已完成“用户指令 → 真实GLM选工具 → 原界面执行 → 结果回传”本轮案例复测。

## 实现合同

- 澄清：`live-workbench.jsx`有wire request即通过原请求回复；`native-desktop-client.mjs`按原SDK canonical owner provenance保持canonical单answer与直接server完整answers/outcome合同，保留所属及generation校验。
- 提示：`workbench.jsx`使用独立`desktop-tip.jsx/.css`，无tour遮罩、焦点捕获或Escape拦截；跟随目标，22秒/关闭/会话切换退休，真正tour不改。
- 项目：`project-inventory-sync.mjs`合并主Profile普通聊天及欢迎Bot任务后的原projects.list/sessions读取；`workspace.mjs`消费真实session.info.cwd并映射聊天归属，以owner与inventory revision拒绝晚到旧读，hydrate cwd或canonical owner改变也使旧请求失效，不切导航或清草稿。核心`gateway/local_project_workspace.py`同时绑定原桌面任务的workspace回调，在同轮更新工具cwd并通过原session authority提交持久cwd，保留所属、generation、revision、busy/lease和非主机cwd策略。
- 表情：`message-reactions.mjs`与`desktop-events.mjs`绑定乐观消息durable ID并维护所属会话的瞬态覆盖；`live-aiwata.mjs`读取原display_metadata，`agent-transcript.jsx/.css`显示表情。覆盖不持久化，历史从后端恢复，真实会话身份更换时退休。

## 真实链路结果

使用隔离合成账号、原Electron宿主/网关和现有GLM模型，经真实输入区提交指令。077独立授权额度30次全部占用（含启动探测/模型目录），未重置076的59/60，没有继续请求。

| 项目 | 模型及界面证据 | 结果 |
| --- | --- | --- |
| 单题澄清 | 模型创建实际单题输入卡与两选项卡，界面回答绿色，工具回传answered/submitted，模型确认绿色 | 通过 |
| 提示 | 模型重新定位目标后show_tip；真实气泡可见，无driver遮罩，其他审批按钮指针可达，工具及模型完成回传 | 重试后通过 |
| 项目 | 模型创建项目；最终从已确认旧cwd/projectId空值发出切换指令，desktop_project成功，真实聊天归属及原后端cwd均进入目标项目，模型确认 | 通过 |
| 表情 | 模型react_to_message成功，用户消息出现👍，最终回复完成；重启后历史仍显示👍 | 通过 |

首次提示的模型选择器含字面Unicode转义，虽工具返回success但目标未命中；该次不算气泡成功，收到自然语言反馈后重新定位才通过。没有把正确气泡可见时的选择卡提交也算作实测；同阶段仅验证无overlay及按钮pointer命中，焦点/控件交互另由组件回归覆盖。

项目首次create只更新列表，未更新cwd/归属，促成本轮核心原任务workspace回调修复；随后复测定位晚到库存/hydrate竞态。最终通过原idle workspace mutation复位旧目录仅用于准备起点，目标切换由模型工具完成，观测器未代改目标状态。早期失败和15秒观测超时证据保留。

## 回归、审查与交付边界

- 行为测试先红后绿，覆盖真实React hook、原SDK、库存竞态、消息行与提示生命周期；针对性11项，完整前端585项通过、0失败。命令：`AIWATA_TEST_INSTALLED_SOURCE=/Users/xuke/.aiwata/aiwata-agent node --run test`。
- 核心使用`scripts/run_tests.sh`跑7文件68项通过；最后日志调整后相关2文件16项通过。核心全部15项静态检查通过。
- 原生renderer构建通过（32.52秒），产物`/private/tmp/aiwata-077-native-verified`；保留既有大chunk警告。未制作DMG或安装。
- 独立审查补充canonical答案格式、欢迎Bot刷新、旧库存覆盖及hydrate revision问题，均由失败用例驱动修复，最终复核无剩余阻断。
- 测试Electron、Vite、观测器和所属网关已关闭，隔离合成数据及证据保留。用户当前074安装未覆盖，源码未提交或推送。

核心完整记录：相邻aiwata工程`docs/aiwata/changes/2026-11-16-077-native-integration-fixes.md`。本机证据目录`/Users/xuke/Documents/getian/aiwata/.aiwata-evidence/native-fixes-077/`包含实际工具结果、截图、冷恢复、最终预算和测试日志；`tip-first-assessment.json`明确首次提示失败，`project-switch-initial.json`与`project_switch-result.json`保存最终切换前后。观测结果仅保留合成消息及cwd/project/model等必要字段，敏感info已移除。

本轮签收仅覆盖这四处缺陷。076布局合同差异、首次终端未定位异常及其他未验范围继续保留，不以本轮结果自动关闭。
