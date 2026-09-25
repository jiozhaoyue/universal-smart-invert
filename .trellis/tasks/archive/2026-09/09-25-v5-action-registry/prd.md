# PRD: v5-1 动作统一 — Action Registry + hide/mask/dim/peek

## 背景

当前元素动作散落在各引擎里，各有各的属性门与优先级解析：

| 现有实现 | 属性门 | 决策来源 |
| :--- | :--- | :--- |
| `ImageInvertEngine.finalizeInvert` → `applyInvertState` | `data-svi-inverted` | 像素/规则/学习/手动 |
| `BgImageEngine` | `data-svi-bginv` | 同上 |
| `MediaCoverageEngine` | `data-svi-poster` | 像素 |
| `ImageFxEngine` | `data-svi-fx` / `data-svi-fx-off` | 特效模式 |
| `state.elementRules` | 选择器匹配 | 用户手写 |
| `RuleLearner` | 选择器 stem 匹配 | 学习 |
| `BUILTIN_RULES` | 选择器列表 | 种子 |

`elementRules` 与 `RuleLearner` 已各自实现了一遍「选择器 → invert/protect」，`BG_RULES` 又是第三遍。
再加 hide / mask / dim 会产生第四、第五遍。本任务做一次收口。

## Requirements

### R1 — Action Registry（单一动作表）
- `ACTIONS = ['invert', 'keep', 'hide', 'mask', 'dim', 'peek']`，每种动作注册一个执行器：
  `{ id, attr, apply(el, params), revert(el), isActive(el), defaultParams, defaultEnabled }`。
- **来源表 `SOURCES` 是唯一解析入口**，带 `stage` 标签，顺序即优先级。真实链（已核对现行代码，
  不是推测）：
  ```
  stage 'override' : manual → elementRule
  ──【决策快照 decisionBySrc 命中即早退，位置不得移动】──
  stage 'rule'     : learned → seedProtect → faviconSkip → seedForceInvert
  ```
  解析函数 `resolveStage(el, ctx, stage) → { action, source, reason, params } | null`，
  内部按表顺序短路；两处调用点分别落在**现 1/1.5 位置**与**现 2/3/3.5/4 位置**。
  注意 `elementRules`（用户显式）与站点档案（`BUILTIN_RULES` 的 protect/forceInvert）不是同一层，
  且 `protect` 与 `forceInvert` 之间夹着 favicon 判定 —— 必须原样保留顺序。
- `source ∈ {'manual','elementRule','learned','seedProtect','faviconSkip','seedForceInvert','pixel','default'}`，
  `reason` 保留现有原因码（`pixel` / `masked-dark` / `protected` / `seed-force` / `element-rule` /
  `favicon` / `below-min` / `policy` / …）。
- 现有各处动作判定改为经 `SOURCES` 取值；`applyInvertState` 保留为 `invert` 执行器内部的
  写点收口（v4.6 C3 契约不变），但其「手动结论幂等占优」逻辑提升为 Registry 通用规则
  （任何非 manual 来源写入前先解析 manual 结论）。
- 小元素门、策略门、缩略图门、像素管线**不进 Registry**（保持现有代码原样）。
- **AC**: `window.__svi.SOURCES` / `resolveStage` 导出，单测覆盖来源顺序矩阵（含快照夹层
  两阶段各自的短路顺序）；`grep` 核查不存在第二处独立的优先级链实现。

### R2 — `hide` 动作（元素屏蔽）
- 触发：`Alt+Shift+点击` → **临时隐藏**（`data-svi-hidden="session"`，仅本次会话，刷新恢复）；
  在该元素上再次 `Alt+Shift+点击`（或面板列表项）→ **永久隐藏**，生成 `selectorStem` 规则
  写入学习层（`action:'hide'`），可导出/导入/订阅（复用现有规则包通道）。
- 执行器：`display:none!important`（经属性门，不改元素 inline style）。
- 提供「本页已隐藏 N 个」+ 一键全部恢复；胶囊/面板可见计数。
- **AC**: 单测三种规则来源命中 hide；bench 中 Alt+Shift+点击后元素 `display:none`，
  刷新后（永久规则）仍隐藏；一键恢复后 `display` 回到计算值。

### R3 — `mask` 动作（遮罩 + hover 揭开）
- 触发：`Alt+拖拽`框选 → 区域遮罩；元素上 `Alt+M` → 元素遮罩（复用 ImageFxEngine 的
  rect 框选 UI 先例）。
- **风格预设可调（D4）**，至少三档，参数可在面板调整：
  | 预设 | 参数 |
  | :--- | :--- |
  | `solid` 全遮挡 | 颜色（默认 `#0f172a`）、不透明度（默认 1.0） |
  | `dim` 暗色半透明 | 颜色、不透明度（默认 0.75） |
  | `frost` 毛玻璃 | `backdrop-filter: blur(Npx)` + 颜色 + 不透明度 |
- **可移动鼠标解除**：默认 `peekOnHover = true` —— 鼠标移入遮罩区，遮罩降到
  `hoverOpacity`（默认 0.15，可调）；移出恢复。`Shift + 移入` = 永久解除该遮罩。
- 遮罩层 `pointer-events` 策略：**区域遮罩必须 `pointer-events:none`**（否则挡操作）；
  元素遮罩默认 `none`，可切 `auto`（用于纯粹想挡住点击的场景）。
- **AC**: 单测三档预设生成的 CSS 属性正确；bench 断言 hover 前后 `opacity` 变化、
  `Shift+hover` 后遮罩被移除且规则落库。

### R4 — `dim` 动作（全页温和压暗）
- 全页覆盖一层（`pointer-events:none`，`z-index` 低于胶囊/面板），参数：颜色 + 不透明度
  （默认 0.35）+ 「移入揭开」开关。
- 与反色**可叠加**（不同层），与 `bgReplace` 互斥时以 dim 优先并在面板提示。
- **AC**: 单测参数边界（0 ~ 0.9 不透明度）；bench 断言层存在且不影响点击穿透。

### R5 — `peek` 动作（hover 复原的通用化）
- 现有「悬停显示原图」是图片专用。推广为通用属性门 `data-svi-peek`：
  任何被处理（invert / mask / dim）的元素 hover 时由 CSS 复原原生渲染。
- `hoverRestore` 旧偏好（v3.1 R5）作为 `peek` 的图片作用域别名保留，**键名与语义不变**，
  避免破坏已有用户配置。
- **AC**: 单测属性门与旧偏好映射；bench 断言 invert / mask 两条路径的 hover 复原都生效。

### R6 — 开关矩阵（用户需求 6）
- 每个动作一行：总开关 + 作用域（全局 / 本站）+ 生效时机（立即 / 下次加载）+ 参数入口。
- 新增统一区块「🧩 元素动作」，顺序在家与画面之后。默认状态：`invert`/`keep` 开（现状），
  `hide`/`mask`/`dim` **默认关**（保守，见父 PRD 约束）。
- 一次性「安全模式」开关：一键关闭所有会改动 DOM 观感的新动作，只留反色。
- **AC**: 每个开关的标签与生效时机在面板可见；单测关闭后动作不施加对应属性。

## Constraints

- 不得改变 `applyInvertState` 的对外契约（v4.6 C2/C3 的测试必须继续通过）。
- 新属性门命名统一前缀 `data-svi-*`，与现有属性不冲突。
- 帧内同步路径（MutationObserver 回调）不得引入新的 `getComputedStyle` 调用（性能预算）。
- 用户脚本形态不含 `Alt+Shift+点击` 的历史语义冲突：核查现有键盘快捷键表，避免抢占。

## Acceptance Criteria（汇总）

- [ ] `resolveAction` 单测：六来源 × 六动作优先级矩阵全绿
- [ ] 六种动作各有执行器 + 独立开关 + 作用域/生效时机标注
- [ ] 全部新动作默认关闭；全关时 `node test.js` / `node test-browser.js` 与 v4.6.1 行为一致
- [ ] `hide`/`mask` 规则可导出/导入（复用现有规则包通道，格式向后兼容）
- [ ] `mask` 三档预设 + `hoverOpacity` 参数化，bench 可断言
- [ ] `node --check` / `test.js` / `test-browser.js` / build+pack 四绿
- [ ] 文档：README / README_EN 新增动作表与开关说明；AGENTS.md 引擎清单补 Registry

## Notes

- 本片是 v5-2（一键固化）与 v5-3（规则动作扩展）的契约依赖，**必须先落地并冻结契约**。
- 遮罩风格预设（R3）供 v5-5 的 pending 遮罩复用，预设定义放在 Registry 内以免两处漂移。
