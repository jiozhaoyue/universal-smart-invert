# v5 计划: AGPL 迁移 + 超集吸收路线

## Goal (本轮交付)

1. **AGPL-3.0-or-later 全项目迁移**: LICENSE 全文替换、userscript 头注释、dev 加载器头注释、
   README/README_EN 徽章与脚注、PUBLISHING.md 协议表行。AGENTS.md 中描述第三方 http-server
   为 MIT 的句子保留 (非本项目协议)。
2. **吸收 Dark Reader 招牌无障碍能力 (第一个吸收项)**: 全局页签新增「字体与可读性」——
   字体覆盖 (无衬线/衬线/等宽/圆体四预设) + 文字描边 (0~1px 滑杆)，热生效，站点电源挂起时
   一并拆除、恢复时重放。

## Requirements

- @license 头与 LICENSE 文件一致 (AGPL-3.0-or-later, SPDX)。
- 字体/描边走 CSS 变量 + html 门类 (非 filter, 不违反"禁止 html/body 滤镜"硬规则)。
- 排除代码块 (code/pre/kbd/samp) 与 SVG 内部文本，避免破坏代码展示与图标字体。
- runtime.siteActive=false (站点挂起) 时字体/描边类必须拆除；恢复时重放。
- loadState 规范化新字段 (布尔/枚举/数值钳制)，坏数据不得崩溃。
- bench 新场景: 真实点击全局页签 → 字体覆盖开关 → 断言门类与 computed font-family；
  描边滑杆设值 → 断言描边类与 webkitTextStrokeWidth。

## 超集路线图 (后续子任务, 每项独立规划)

- P1 动态深色主题引擎: 背景替换引擎泛化为全页动态配色 (对位 DR Dynamic, 带机器判断)。
- P2 页面级亮度/对比度调节: 必须走 P1 的非滤镜路径 (html 滤镜被硬规则禁止)。
- P4 规则文件社区化: 规则库发布/订阅渠道 (已有导入导出格式)。
- P5 定时启停: 时段自动启停 (需与站点电源模型协调, 避免破坏 decide-once)。
- P3 字体与可读性 ← 本轮完成。

## Acceptance Criteria

- [ ] 全部 MIT 自引用清除 (第三方描述除外); LICENSE 为 AGPL-3.0 全文。
- [ ] 门禁全绿: node --check / test.js / test-browser.js (含新字体场景) / build+pack / 溢出探针。
- [ ] @version 4.1.0; README 徽章同步。
