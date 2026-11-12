# Peeking Avatar Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的探头头像拆为丰富、可锁定随机、可保存的 SVG 部件。

**Architecture:** 数据目录与规则放在 bot-peeking.mjs，SVG 几何放在 bot-peeking-art.mjs，渲染组件与编辑器分别在 bot-peeking.jsx / bot-peeking-picker.jsx。通过 getBotAppearance 接入现有 workspace 与实时元数据通道。

**Tech Stack:** Existing React 19, SVG, CSS, Node test runner; no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-11-peeking-avatars-design.md

## Global Constraints

- 在当前分支工作；不新建分支、不提交、不推送，不创建容器。
- 构图与风格以用户确认的最新完整面部单人样稿为准；不改已有几何和人物系列。
- 36 发型、32 头饰；头饰与颜色分开，眼镜与耳饰分开。
- 不改 Sites 受保护文件，不写入真实 Profile。

## Review Focus

- 手动换发型后头饰不兼容时，清除并提示，避免隐藏改动其他已锁定部件。
- 已锁定头饰时只生成兼容发型；所有部件锁定时不会无限循环。
- 无效旧数据与原型属性名不能注入未注册部件。
- 切换系列或恢复账号不丢探头参数和上传图片。
- 小尺寸与 reduced-motion 下仍保持完整脸部、眼睛可见，帽饰不穿模。

### Task 1: 参数目录和随机规则

**Files:** Create src/bot-peeking.mjs; tests/bot-peeking.test.mjs

**Interfaces:** getPeekingDesign(raw), canWearHeadwear(hair, headwear), updatePeekingDesign(raw, field, value), randomPeekingBatch({ design, locked, count, rng }), peekingHair, peekingHeadwear, peekingFields, peekingPresets.

- [ ] 先写测试：无效数据回退；换发型适配；十个不同发型；锁定参数不变；锁定巾冠的兼容；所有锁定返回有限结果；颜色对比。
- [ ] 运行测试确认新功能缺失失败。
- [ ] 实现目录、规范化、兼容与批次算法，运行测试直至通过。

### Task 2: SVG 图层与编辑器

**Files:** Create src/bot-peeking-art.mjs, src/bot-peeking.jsx, src/bot-peeking-picker.jsx; modify src/bot-avatar.jsx, src/bot-appearance.mjs, src/bot-avatar-picker.jsx, src/bot-avatar-picker.css, src/bot-avatar.css, src/management.jsx, package.json.

**Interfaces:** PeekingPortrait({ design, state, still }), PeekingControls({ botId, design, onChange }); getBotAppearance returns validated peekingDesign when applicable and preserves it in other modes.

- [ ] 先写测试：workspace 保存、重载和账号隔离；切换模式保留原图和其他系列；无效 peeking 参数恢复。
- [ ] 确认测试失败，再实现外观入口与所有注册 SVG 图层，保留原有渲染路径。
- [ ] 在现有编辑器加入探头系列、预设/候选/自定义、发型/头饰缩略图、各字段锁定与配色。
- [ ] 打开已有 mock 服务验收预览、随机十个、锁定、换发型、保存重开与响应式，修复可见偏差。

### Task 3: 验证与说明

**Files:** Update AGENTS.md, docs/aiwata-integration.md and this plan's progress.

- [ ] 运行 npm test、npm run build、npm run test:sites，确认 hosting 所需产物存在。
- [ ] 独立审查本次改动；修复真实问题后仅重跑受影响检查。
- [ ] 保存验收截图，保留预览页，报告数量、入口、测试结果及 SVG 与样稿的保真限制。

## Progress / Rulings

- 2026-11-11: 用户已批准视觉目标并明确要求完成结构化随机生成；直接执行，无新增设计确认。
- 保留当前共享工作区，遵从用户禁止新分支的要求；不运行自动提交步骤。
- Task 1 complete: 参数校验、兼容、锁定、对比与账号恢复均有测试，先观察失败再实现。
- Task 2 complete: 36 发型 / 32 头饰的 SVG 部件与编辑器已接入。所有注册部件均通过实际 SSR 渲染，测试证明后发位于肩颈后方；浏览器检查了随机候选不自动应用、锁定玉簪、保存并重开恢复。
- Review complete: 独立只读 reviewer 发现旧候选覆盖新锁定值的 P2；已在浏览器复现，然后使部件或锁改变时旧候选失效。浏览器验证旧候选入口消失，新候选保留锁定的 messyBun；独立复核通过。
- Task 3 complete: npm test 96/96、test:sites 4/4、build exit 0；dist/client/index.html、dist/server/index.js、dist/.openai/hosting.json 均存在；git diff --check 通过。构建保留现有主包超过 500 kB 的提示，未扩大范围进行拆包。
- 真实能力：仅核对 AIWATA 6631a6af2c 的 profiles.configure/ui_meta 合同；验收只保存本地 mock Bot，之后恢复该 Bot 原来的几何系列。
