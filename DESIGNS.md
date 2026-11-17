# AIWATA 桌面设计 token

完整桌面设计规范与唯一手写token源在相邻核心工程：

- [DESIGNS.md](../aiwata/DESIGNS.md)
- [覆盖与验证](../aiwata/docs/aiwata/design-token-coverage.md)
- `../aiwata/apps/shared/design/aiwata-tokens.json`

本工程的`src/design/aiwata-tokens.css`、`.mjs`及manifest是自包含生成副本；不要手工修改。`theme-runtime.mjs`负责根主题、有效CSS色/字号解析及现有终端的原位更新。源码没有核心工程时仍可Mock构建。

```sh
# 在核心工程生成两边产物
node scripts/build/design-tokens.mjs --frontend ../aiwata-app
# 在本工程只读校验；核心存在时同步检查唯一源
npm run check:design
```

保留现有外观/账号/Profile存储、customCSS优先级、用户项目和头像色、焦点与工具生命周期。DOM值可由CSS角色覆盖；查询、图标尺寸、序列化注入和数字动效配置的token需要生成并重建。不要新增一份手写调色板或任意CSS执行入口。
