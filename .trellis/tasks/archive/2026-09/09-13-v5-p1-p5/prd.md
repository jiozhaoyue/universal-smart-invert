# superset P1-P5 + full CI + Dark Reader upstream sync (one-click merge)

## Goal

Deliver the remaining superset roadmap under AGPL: P1 dynamic dark theme presets on the
bucket-recolor engine (tone presets + non-filter page brightness/contrast = P2), P5
time-window scheduler integrated with the site power gate, P4 generated rule library +
Dark Reader upstream sync producing fully machine-generated one-click-merge files, plus CI
completion (upstream-sync scheduled workflow with auto-PR, overflow probe in bench job) and
scheduled local automation hooks.

## Requirements

### P1+P2 动态深色主题 (bucket-recolor 引擎增强)
- 新偏好: `bgTone` ('pure-black' | 'dark-gray' | 'warm-black', 默认 pure-black 保持现状)、
  `bgBrightness` (0.6~1.4, 默认 1)、`bgContrast` (0.7~1.5, 默认 1); loadState 规范化。
- 纯函数 `applyDynamicThemeAdjust(rgb, tone, brightness, contrast)` (unit-test 契约,
  默认参数恒等 —— 既有 bench 登录块隔离场景不得受影响); 桶生成时包裹三个 map* 函数结果。
- 色调作用于 bg/bd (背景/边框), 亮度/对比度作用于 bg/fg/bd 全部; 变更走 `rescan()` 热生效。
- UI: 本站页签「🌙 动态主题调节」: 色调 select + 亮度/对比度 sliderRow。

### P5 定时模式
- 新偏好: `scheduleEnabled:false` / `scheduleStart:21` / `scheduleEnd:7` (支持跨零点)。
- `scheduleActiveNow()` 接入 `evaluateSitePower()` (主闸); 60s 轮询跨档热切换。
- UI: 全局页签「⏰ 定时模式」: 开关 + 起止小时 select; 电源横幅状态文案反映定时档。

### P4 规则库 + Dark Reader 上游同步
- `scripts/export-rule-library.js`: Node 桩加载真实脚本, 导出 `rules/svi-rule-library.json`
  (BUILTIN_RULES 参考库, 供人工审阅与下游工具消费)。
- `scripts/sync-darkreader.js`: 拉取 darkreader/darkreader 上游配置 (dark-sites /
  inversion-fixes 原始文件), 生成 `rules/darkreader-compat.json` (含来源与许可证声明) 与
  **`rules/darkreader-compat.import.json`** (svi-rules 信封, dark-sites → siteBlacklist 种子,
  可直接「导入并合并」)。
- *.import.json 为全机器生成 + 合并导入去重 → 一键合并永不冲突 (整文件重生成, git 零冲突)。
  AGPL 合规: 上游数据同为 AGPL, 本项目已切换 AGPL-3.0-or-later, 文件内声明来源。

### CI 补全
- `.github/workflows/upstream-sync.yml`: 每日定时跑 sync 脚本, 有变更自动开 PR (一键合并)。
- `ci.yml` bench job 加溢出探针步骤 (SVI_CHROME_PATH 注入)。
- 本地自动化 hook: 每日门禁自动跑 + 每周上游兼容报告 (CronCreate)。

## Acceptance Criteria

- [ ] 门禁全绿: node --check / test.js (含新纯函数单测) / test-browser.js (新增场景 21/22) /
      build+pack / 溢出探针。
- [ ] `rules/` 生成文件可被「导入并合并」幂等消费。
- [ ] @version 4.2.0; README 徽章同步; 规范/journal 更新。
