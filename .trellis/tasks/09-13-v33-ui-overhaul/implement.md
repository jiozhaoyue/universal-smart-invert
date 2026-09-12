# implement.md — v3.3 设置面板全面改版执行清单

> 每步完成后跑「步内验证」；阶段末跑「阶段门禁」。任何一步失败先修复再前进。

## Step 1 数据模型与元素规则引擎（先底层后 UI）

- [ ] `DEFAULT_PREFS` 增加 `settingsLayout/settingsWidth/elementRules`（L94–172 区块）。
- [ ] `loadState` 归一化三个新字段（枚举回退、clamp 320–600、规则条目过滤 + FIFO 200 + id 补齐）。
- [ ] `resolveSiteProfile` 合并 `profile.elementRules`（`hostMatchesPattern`，`'*'` 全站）。
- [ ] `decideImage` 插入元素规则层：手动覆盖之后、快照之前，`recordDecision(..., 'element-rule', true)`。
- [ ] 决策原因中文映射补 `element-rule` →「元素规则」。
- [ ] `BgImageEngine.processEl` 顶部接入 protect/invert 早退分支（记账 `elLastUrl`）。
- [ ] 抽公共助手 `downloadJsonFile / pickJsonFile`（先重构既有两处内联，行为不变）。
- [ ] 步内验证：`node --check universal-smart-invert.user.js && node test.js`（既有用例全绿）。

## Step 2 设置页信息架构重排（UIController）

- [ ] `buildSettingsModal` 按设计 §5 顺序重排：新建 `buildAppearanceSection / buildImageSection / buildVideoSection`；原 `buildFxSection`（特效并入图片区）、折叠抽屉内容分流迁移后删除。
- [ ] 站点区扩展：本站特效模式跟随下拉 + 元素规则编辑器（列表/删除/添加：范围下拉、动作下拉、选择器输入框），编辑后 `savePrefs + clearCacheAndRescan (+ bgReplace rescan)`。
- [ ] `buildSmartSection` 收敛为「学习规则」子块并入站点区（种子开关、命中阈值、列表、时间线概览）。
- [ ] `buildStorageSection` + `buildStatsSection` 合并为「数据与备份」：规则文件组（导出/合并导入/替换导入）、全量备份组、本地统计组、后端徽章、键列表、隐私行。
- [ ] 「操作技巧」独立小节（无括号排版）。
- [ ] 全部下拉选项去括号 + `describe` 动态说明；`ui.selectRow` 增加 `describe` 支持。
- [ ] 文案净化按设计 §7 清单逐项执行（存储后端徽章、键名映射、媒体类型名、拾色预览去 HEX、按钮标题）。
- [ ] 步内验证：`node --check && node test.js`；`node scripts/probe-github.js https://github.com` 打开设置页人工核对顺序与文案。

## Step 3 面板外壳三形态与布局健壮性（injectStyles + 交互）

- [ ] CSS：`.svi-modal-row` 纵向堆叠、删 140px 定宽、`.svi-modal-controls` 加 `min-width:0; flex-wrap:wrap`、select/textarea `max-width:100%`、body `overflow-x:hidden`。
- [ ] CSS：`layout-center/left/right` 三形态样式 + 抽屉宽度变量 + 边缘拖拽把手 + 分段切换按钮样式。
- [ ] 交互：头部三态切换（记忆）、抽屉宽度拖拽（记忆 320–600）、Esc 关闭、停靠形态无遮罩点外关闭。
- [ ] 居中窗口宽度 `min(600px, 94vw)`。
- [ ] 步内验证：`node --check && node test.js`；CDP 或手工在 1280×800 / 500×600 截图核对无横向滚动、无出界。

## Step 4 测试补充与基准更新

- [ ] test.js：元素规则解析/归一化新用例。
- [ ] test-browser.js：移除 `hasAccordion` 断言；新增元素规则 protect 端到端场景（注入 → 重扫 → 断言决策翻转 → 删除恢复）。
- [ ] 步内验证：`node test.js && node test-browser.js`（Chrome CDP 9222，`--enable-unsafe-swiftshader`；固定 profile 目录由运行器清空，勿在中途清存储）。

## Step 5 版本收尾与产物

- [ ] `@version` 3.3.0、`SCRIPT_VERSION = '3.3.0'`、`@description` 三语更新。
- [ ] README.md / README_EN.md：新特性段落（三形态布局、规则文件、元素规则、界面中文化）。
- [ ] `node scripts/build-extension.js && node scripts/pack.js`。
- [ ] 全量门禁复跑（下方）。
- [ ] 提交信息：`feat: v3.3 settings panel overhaul — dockable layouts, rule files, element rules, full zh-CN IA (v3.3.0)`。

## 阶段门禁（全绿才算完成）

```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js
node scripts/build-extension.js && node scripts/pack.js
```

## 回滚点

- Step 1 独立可回滚（引擎层不碰 UI）。
- Step 2/3 为 UI 层，一次提交内自洽；如 UI 阶段受阻，Step 1 + Step 4 的引擎/单测部分可先行落地。
- 整任务 revert 单提交即回 v3.2.0。
