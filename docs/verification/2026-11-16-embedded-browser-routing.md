# 内嵌浏览器路由与输入（075）

2026-11-16。基于App `a08d1db04c6911891ff3c992d0310238245fe94c`及核心`41a563c2f66621f0ca5af1cc7fce815659cf7b81`的未提交修复，范围与制品见[核心075记录](../../../aiwata/docs/aiwata/changes/2026-11-16-075-embedded-browser-routing.md)。

修复生成入口`scripts/sync-browser-drive.mjs`的平台适配：保留原客户端navigator判定，生成renderer可用的preview-drive并刷新provenance。`desktop-preview-inspection.mjs`与两个宿主入口区分原文档及账号/guest有效性；真实输入触发导航后返回导航回执、停止旧输入，账号失效/取消仍拒绝。

无process的输入回归、按下/抬起导航及账号有效/失效组合均先观察失败再修复；最终完整前端574通过，0失败/跳过。测试使用`AIWATA_TEST_INSTALLED_SOURCE=/Users/xuke/.aiwata/aiwata-agent`选择当前可用安装，避免074已清理开发环境的失效launcher；未恢复旧运行数据。

隔离Electron窗口加载真实Workbench/原生webview，确认preview.open显示页面，preview.act完成表单元素读取、输入aiwata和提交，preview.read读到本机结果；实际百度页面可见并确认搜索地址wd=aiwata。此为受控协议及原生操作验收，不是完整真实Agent搜索对话，也未覆盖当前已安装App。没有操作验证码。新DMG安装后需新建会话复验。
