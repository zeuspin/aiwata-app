# 构建与清理

## 构建

区分前端源码、核心源码、已安装私有源码快照、数据根和制品根。记录核心state与Git HEAD；HEAD不包括未提交定制。使用核心PM锁定Python/Node/pnpm和前端自身锁文件，不能用通用npm替代核心pnpm或另装宿主。

Cargo输出及私有资源在仓库外，复用稳定 `CARGO_TARGET_DIR`，不每轮新建整套Rust缓存。输出目录/snapshot未占用，不覆盖已有resources、renderer或DMG。确认磁盘空间。

在核心仓库检查现有本机配置，不打印凭据。当前调用形状如下，目录及snapshot需本次明确选定且未占用：

```bash
source ./scripts/aiwata-dev-env.sh "$PWD"
source ./activate
export HERMES_PYTHON="$__HERMES_TEST_PYTHON"
export CARGO_TARGET_DIR="$(dirname "$PWD")/aiwata-private-artifacts/build-cache/installer"
bash scripts/build/aiwata-bootstrap-mac.sh \
  "$(dirname "$PWD")/aiwata-private-artifacts/local-candidate-release" \
  local-candidate
```

依赖已备好不重复安装；缺依赖按当前BUILDING指南准备。脚本须以 `AIWATA_APP_SOURCE=<core> npm run build:native` 构建静态renderer并收入原宿主归档，不只封装网页/旧界面。保留进度和首个失败阶段。

## 最终制品

1. `hdiutil verify`、字节数、SHA256；只读挂载最终DMG，验收挂载包。
2. `codesign --verify --deep --strict`；检查名称、bundle ID、架构/最低OS。ad-hoc通过不等于Developer ID、公证或Gatekeeper通过。
3. 比对嵌入manifest/源码归档摘要、关键宿主源码和全部renderer文件。数量取当前清单，不固定历史19个。`--prepare-source`仅能证明原生解包，不证明安装/运行。
4. 独立安装器及说明，无误导性Applications拖拽别名。
5. 按改动跑现有检查：宿主发布/修复涉及Rust、Electron、CLI和打包；renderer涉及前端测试/native构建。可逆间距更改用真实组件几何对照和native构建，不重复无关整套测试。入口查当前 `VERIFICATION.md`，旧数量不算本轮通过。

## 清理

确认本批挂载/暂存安装器已退出，精确注销本批LaunchServices暂存注册，正常卸载本批DMG。未注册不是全局重建索引的理由。

可删但须重新验属：本批 `renderer/`、`resources/`、`dmg-root/`、临时解包源码，以及Cargo中本批生成的 `release/bundle/macos/AIWATA Installer.app`。保留DMG、精简脱敏日志、验证JSON/截图，私有目录和文件保持私有权限。

保留用户数据、实际公开App、运行源码、当前/上一成功修复器、必要回滚制品和稳定编译缓存。旧源码/其他批次不能因同名/占空间直接删除。真实残留App与过时索引分别诊断，不批量find删除、不全局prune、不重置Dock/LaunchServices数据库。原生发布负责退休相同源码下可再生内部App，不再造一套发布逻辑。
