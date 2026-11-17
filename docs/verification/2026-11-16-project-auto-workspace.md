# 079 项目自动独立工作目录

用户明确选择：Agent新建项目未指定文件夹时，自动新建独立目录并把当前聊天迁入；气泡可能看在另一窗口，本批不改其逻辑或布局。

核心desktop_project create在存在所属会话回调、且path缺省时，通过当前Profile的get_hermes_home()/workspace/projects创建独立project-UUID私有目录，再用原项目事务和canonical workspace回调绑定/迁入。显式path及无绑定CLI行为不变；既有无目录项目switch仍准确报告需绑定。此批准选择替代078的GUI无目录create先问目录分支，不改前端项目归属或缓存逻辑。

针对性23项与整组相关46项核心回归通过；完整15项静态检查通过；独立审查无阻塞。本批没有新的GLM自动测试请求，未重跑未改动的前端产品测试/构建，不冒充新模型全链路验收。

用户此前创建的“验收测试2”按批准方案原地绑定独立目录，报告问题的聊天已迁入，前后56条消息保留，原生后端cwd与重载前端归属一致。随后重启原源码开发宿主与所属网关，保留077测试数据；窗口临时标题AIWATA 开发验收 · 079 · 源码并由macOS激活置前，新聊天预填“创建一个名为验收测试3的项目，并把当前聊天切换进去。”未发送，供用户回车手动验证。旧安装版未覆盖或退出。

核心详细记录：相邻aiwata工程docs/aiwata/changes/2026-11-16-079-project-auto-workspace.md。本机证据：相邻核心.aiwata-evidence/project-auto-workspace-079/，包括实际迁入、可见截图、manual-ready及精确进程激活结果。
