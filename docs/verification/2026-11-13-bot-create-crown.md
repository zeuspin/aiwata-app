# 主 Bot 创建技能与皇冠 — 2026-11-13

用户反馈自然语言创建冷笑话 Bot 后未见列表。只读核对所属测试会话发现：实际调用 cronjob_manage 创建每小时任务，没有 profiles.create；模型却称 Bot 已上线。未把任务伪装为 Bot，未修改/删除用户已有任务。用户随后明确冷笑话只是例子，希望主 Bot 可创建独立 Bot，并选择描述明确时直接创建。

实现：src/bot-management-skill.mjs 定义运行时创建技能，src/bot-inventory-sync.mjs 通过现有原生技能接口仅安装缺失的主 Profile 技能，同名内容不覆盖；职责明确直接执行，使用原生 Profile CLI、单独职责文件、不复制认证/记忆/历史，验证后报告。src/live-workbench.jsx 在连接与有效 message.complete 后同步清单，合并并发读取、补做后续读取、阻止退役账号/旧连接结果，不改变当前聊天。没有增加 Hermes 核心工具或插件跨界导入。

src/bot-directory.jsx/.css 移除右下角五角星，改为头顶内联金色皇冠；展开与仅头像模式各自定位，右下角原状态保留。

118/118 相关 Node 测试通过（062的114项＋新4项技能安装/保留、退役账号、合并刷新与后续重查）；原生构建通过，既有大chunk提示保留。原生技能写入已在当前测试用户目录核验；独立 /private/tmp/aiwata-bot-create-contract 中原CLI create/list/show、职责文件保存验证通过，无模型调用，不向用户当前列表添加示例Bot。日志 /private/tmp/aiwata-bot-create-tests.log、aiwata-bot-create-build.log，CLI验证脚本 /private/tmp/verify-bot-create-cli.py。

边界：真实模型是否在自然语言对话中正确调用技能尚未端到端验证；既有会话的缓存提示不强行改写。用户可再次要求创建独立Bot；必要时显式让主Bot加载 aiwata-bot-management 技能。外部无桌面连接的创建流程不在此范围；定时任务归属转换、主Bot协调与项目记忆仍未实现。无分支/提交/推送/Docker/安装覆盖，不更改主Bot现有SOUL或用户记忆。全量 npm test未重跑，不以局部通过代替全量。


本页是历史阶段证据；2026-11-16选择性回滚后的实际范围与验证以核心071记录为准，未保留其他新功能或继续此前项目融合计划。
