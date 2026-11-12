---
name: aiwata-core-upgrade
description: Use when upgrading AIWATA's Hermes core, preparing a cross-session upgrade handoff, or checking whether an upstream migration preserves aiwata-app and the native desktop distribution.
---

# AIWATA 核心升级与前端交接

升级核心必须保留新前端与原生宿主/Agent的既有职责，不用另一套运行体系补接口差异。用户职责约定优先于历史实现。

## 定位及读取

本工程skill位于 `.agents/skills/aiwata-core-upgrade`，`Path(SKILL.md).resolve().parents[3]` 为前端根；校验AGENTS/package.json。核心采用用户指定路径，其次核对 `AIWATA_APP_SOURCE`，默认检查同级 `aiwata`，校验 `README.aiwata.md` 与 `docs/aiwata/state.json`；无效则询问，不从全局skill位置推导源码。

读取两工程AGENTS、核心 `docs/aiwata/{index.md,CUSTOMIZATIONS.md,state.json,UPGRADE.md,VERIFICATION.md,customization-inventory.json}`。再读 [升级核对单](references/upgrade-checklist.md) 和 [2026-11-12交接基线](../../../docs/handoffs/2026-11-12-hermes-core-upgrade.md)。日期记录是历史证据，不能代替当前HEAD/源码/验收。

## 工作顺序

1. 用户说“最新”时从Hermes官方源核实稳定release与main，说明选取原则，固定查询日期/tag/完整SHA。没有确定目标就不称已升级。
2. 核心库存先check；核对两个仓库的tracked/untracked及敏感排除，制作可恢复源码快照并验证恢复。HEAD/指纹不是备份；当前大量定制未提交，不能直接pull/rebase/reset覆盖。
3. 在独立候选目录，按“旧上游→新上游”与“旧上游→当前定制”逐项适配。读目标版本约束/锁文件；显式 `AIWATA_APP_SOURCE=<candidate>`，用隔离home/runtime测新核心，避免误连旧后端。按符号和原生合同迁移，不全量旧文件覆盖上游。
4. 核对默认新renderer、共享SDK/协议、网关配置默认模型、原生机器能力、Profile归属、公共桌面/修复及静态renderer分发。普通会话、Bot私聊、托管群需分别验证；详细入口见交接基线。
5. 报告迁移/退休/冲突、测试结果及未验范围，约定验收通过后才按已授权范围切换并更新核心state/库存。真实数据覆盖、活动实例重启、提交/分支/推送/容器不因升级任务自动获准。

## 不变边界

新UI仍由原Electron main/preload、原Agent/工具/权限承载；保留目录/数据/作用域分离，账号与Bot Profile所属明确。不引入Computer Use Provider、Cua Driver安装、Seatbelt/容器等强隔离去解决前端兼容。若确实需要改变职责或权限，列明冲突和影响，由用户确认后执行。

源码分发包可能含发行凭据，不当普通恢复备份，不读/打印密钥或哈希。历史失败在新上游重新验证，不能永久豁免。安装包使用同工程 `aiwata-macos-packaging` skill，不能把build成功称安装/功能通过。
