---
name: aiwata-macos-packaging
description: Use when building or accepting an AIWATA macOS DMG, testing an overwrite installation, diagnosing duplicate Dock entries or native window spacing, or cleaning this project's packaging artifacts.
---

# AIWATA macOS 打包与安装验收

复用原 AIWATA Electron 宿主、Agent 与安装器，分发独立 aiwata-app renderer。构建、安装、窗口就绪、后端就绪和真实聊天分别验收。

## 定位与授权

本 skill 随前端保存：`Path(SKILL.md).resolve().parents[3]` 为 aiwata-app 根，校验 `package.json`、`AGENTS.md`。核心仓库采用用户指定路径，其次核对 `AIWATA_APP_SOURCE`，默认检查前端同级 `aiwata`；校验 `README.aiwata.md` 与 `docs/aiwata/state.json`。路径不符时询问，不猜运行快照。不从全局skill目录推导源码。

先读两工程适用的 `AGENTS.md`，再读核心 `docs/aiwata/{index.md,CUSTOMIZATIONS.md,state.json,VERIFICATION.md}` 及 `apps/bootstrap-installer/BUILDING.aiwata.md`。构建/清理读 [构建与清理](references/build-and-cleanup.md)；安装/窗口读 [验收与排障](references/acceptance.md)。当前源码与锁文件优先于历史命令。

“打包”不自动授权覆盖 `/Applications/AIWATA.app`、重启工作中的桌面或变更默认数据。先完成可审阅制品，在确需额外授权的操作前说明范围。已授权覆盖继续执行，不重复确认。本skill不授权提交、推送、分支、容器或运行体系变更。

## 入口契约

| 对象 | 当前契约与核心源码入口 |
| --- | --- |
| renderer | `apps/desktop/renderer.json` 选择独立aiwata-app；`scripts/build/aiwata-bootstrap-mac.sh` 执行 `build:native`，收入校验归档，仅归档内改为artifact清单。目标机无需前端checkout/开发服务器。 |
| 安装器 | DMG内 `AIWATA Installer.app`，`com.aiwata.setup`；直接打开，不拖入Applications。 |
| 日常桌面 | `/Applications/AIWATA.app`，`com.aiwata.aiwata`；原Electron main/preload。 |
| 发布 | Rust `desktop_entry.rs`：归属/签名/运行检查、同卷原子交换、receipt/恢复日志。未知/其他home/运行中的App拒绝覆盖。 |
| 修复 | `.aiwata-installer/<snapshot>/AIWATA Installer.app`；Electron `embedded-desktop-entry.ts` 验属后 `--repair`。保留当前与上一成功修复器。 |

## 交付

记录源码基线及未提交状态、snapshot、架构/最低OS、DMG字节数与SHA256、签名和公证分别结果、归档/renderer比对、实际安装/数据检查、未验范围与回退。模拟几何、单测不能冒充原生视觉/完整首装。

制品默认私有：既有分发资源可能含后端凭据，禁止打印、上传或将分发归档当无敏感升级备份。清理按所属白名单，不改全局Dock偏好掩盖重复入口。
