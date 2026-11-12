# 安装、数据与窗口验收

## 范围

DMG/签名/解包不能证明依赖安装。隔离home安装不能冒充默认数据覆盖；复用缓存不能称无缓存首装。默认覆盖需要授权和保护原数据。真实聊天/工具单独验收，不为了测试间距给用户会话发消息。

实时核对home是否目录/链接、活动source、receipt/stamp、进程可执行路径和desktop userData。PID、snapshot与数据根不能从旧笔记假定。

## 默认覆盖

1. 保留数据时先做私有可恢复保护：SQLite backup API或受控一致性备份，不漏活跃WAL。记录原会话/消息逐行基线与quick_check；配置/凭据只核对所属和必要元数据，不读取/输出密钥值、片段或哈希。
2. 确认活动任务，授权退出后优先正常Quit，核对准确路径/home，不按名字批量kill，不停其他网关。终止进程与正常Quit如实区分。
3. 仅对本次启动子进程清理其他home/runtime/test bundle环境，按目的显式隔离或使用默认home，不修改全局环境。直接打开最终DMG的独立安装器。
4. 观察旧快照识别/升级，分别记录安装完成、窗口交接回执、后端就绪。`bootstrap complete`不等于看到窗口。故障注入/重试在隔离条件测，不能未经授权用用户数据测断电恢复。
5. `/Applications/AIWATA.app` 为真实Electron/`com.aiwata.aiwata`，所属记录匹配home/sourceRoot/snapshot，活动source正确，无pending事务。公开App和当前所属完整修复器签名通过；安装后renderer逐文件匹配本批产物。
6. 数据quick_check通过，原始行一致，配置/凭据所属及元数据无意外改变。只比较条数不够；合法变化要解释，不悄悄刷新基线。
7. 桌面主进程一份（Helper不算），退出后从公共路径正常重开直接进桌面。Dock视觉与persistent/recent记录分别核对；进程数/plist单独不能称视觉验收。修复缓存保留但不作日常Dock入口。

## 布局

复用原宿主窗口状态/系统控制区常量，不在renderer另造窗口机制。Mac普通窗口避让交通灯，OS全屏后侧栏开关以主导航栏中心对齐；额外24px拖动空白在开关后。Tab及栏边界不随微调跳位。

Windows/Linux依原宿主overlay/custom-controls事实验证。模拟宿主几何不能冒充真实平台验收。加载、登录、失败页和全工具视图保留窗口操作/拖动。安装器步骤展开不撑出全页滚动条，不足高度只步骤区域滚动。

## 自动化身份缓存

同一路径从安装器换为Electron后，工具可能继续缓存 `com.aiwata.setup`。核对Info.plist、精确进程路径、receipt及实际窗口，一次正常重开可作对照。不足就标自动化不可见，fixture标模拟。不要因此改产品bundle ID、另建宿主、安装/重复授权Cua Driver，或不停重启。只向用户核实剩余具体视觉点，已有确认继续沿用。
