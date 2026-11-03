# Design: v5-1 Action Registry

## 1. 边界

**做什么**：把「元素 → 动作」的**同步决策层**收口到一个注册表；提供 4 个新动作
（hide / mask / dim / peek）；把「手动结论幂等占优」从 invert 专用提升为通用仲裁规则。

**不做什么**：
- 不改像素判定管线（`analyzeSrc` / `decideImage` / `recordDecision` / `applyDecision`）。
- 不改 `applyInvertState` 的对外契约（v4.6 C2/C3 测试必须继续通过）。
- 不改特效引擎（`ImageFxEngine` / `VideoFxEngine`）的投递协议。
- 不新增存储键（复用 `svi:learned`，见 §5）。

## 2. 关键设计决策（含被否方案）

### D-1 表驱动的分阶段解析，不吞掉像素管线

**真实优先级链（已核对 `decideImage` 现行代码，非推测）**：

```
1    手动覆盖        manualOverrides[host|src]        → reason 'manual'
1.5  用户元素规则    profile.elementRules             → reason 'element-rule'
     ──【决策快照 decisionBySrc 命中即早退】──        ← 缓存接缝，位置关键
2    学习规则        ruleLearner.decideFor            → reason 'learned'
3    种子保护        profile.protect                  → reason 'protected'
3.5  favicon 跳过    src 正则 .ico/.cur               → reason 'skip'/'favicon'
4    种子强制反色    profile.forceInvert              → reason 'seed-force'
5    小元素门/策略门                                    → reason 'tiny'/'policy'/…
6    像素分析                                         → reason 'pixel'
```

两个必须写进契约的事实：

- **快照卡在中间**（manual/elementRule 之后、learned 之前）。因此**不能**把 learned 提到
  快照之前 —— 那会让「已有快照的 src」被学习规则翻转，属行为改变。
- `elementRules` 与「站点档案」**不是同一层**：前者是用户显式元素规则（`state.elementRules`
  按 host 过滤），后者是 `BUILTIN_RULES` 派生的 `protect`/`forceInvert`，且 `protect` 与
  `forceInvert` 之间夹着 favicon 判定。

**被否方案 A**：单一 `resolveAction(el)` 按需 await 像素。
→ 否因：把同步路径拖成 async，破坏 MutationObserver 同步打标（遮罩、v5-2 定位、fx 投递都依赖
同步落属性），且与 v4.6「本地优先、规则结论先于字节落地」正面冲突。

**被否方案 B**：把 learned/seed 一并提到快照之前，做成「一个函数一张表」。
→ 否因：见上「快照卡在中间」，会改变既有决策结果。

**采用方案**：**带 stage 标签的来源表 + 分阶段解析函数**。

```js
// 来源表（顺序即优先级；新增动作/来源只改表，不改调用点）
const SOURCES = [
  { id:'manual',           stage:'override', resolve: (el,ctx) => … },
  { id:'elementRule',      stage:'override', resolve: (el,ctx) => … },
  { id:'learned',          stage:'rule',     resolve: (el,ctx) => … },
  { id:'seedProtect',      stage:'rule',     resolve: (el,ctx) => … },
  { id:'faviconSkip',      stage:'rule',     resolve: (el,ctx) => … },
  { id:'seedForceInvert',  stage:'rule',     resolve: (el,ctx) => … },
];

resolveStage(el, ctx, stage) → { action, source, reason, params } | null
```

- `stage:'override'` 的调用点 = 现 1 / 1.5 位置；`stage:'rule'` 的调用点 = 现 2 / 3 / 3.5 / 4
  位置（即快照检查之后）。**位置严格不变**，A4/A10 的基线比对就是验证这件事。
- 解析函数内部按表顺序短路，第一个命中即返回；返回 `null` 表示该阶段无人认领。
- `stage:'rule'` 与像素门之间仍是**现有代码原样**（小元素门、策略门、缩略图/etc），不进 Registry。
- 像素管线产出结论后经 `registry.describe(el, {source:'pixel', reason})` 补来源标注
  （供 v5-2 展示与 v5-3 聚合），**只标注不改决策**。
- `masked-dark` 否决是**过滤器**（作用于 learned/seedForceInvert/pixel 的 invert 结论），
  不是来源；它继续留在 `decideImage` 内，不进 Registry。

### D-2 `keep` 与 `peek` 不写属性（保住 AC-3）

- `keep`：`attr = null`。语义 = 「确保无 invert 属性 + 已进决策快照」。`apply` 只调
  `applyInvertState(el, false, 'rule')`；`revert` 无操作。
- 理由：若给每个 keep 元素写 `data-svi-kept`，则全动作关闭时页面属性写入量相比 v4.6.1
  **增加**，父 PRD AC-3「无新增属性写入」不成立。且 keep 的既有语义就是「什么都不做」。
- `peek`：是**修饰属性**（`data-svi-peek`），不是独立动作结果。只在 `peek` 动作开启时写入，
  且只写在被其它动作处理过的元素上。

### D-3 手动仲裁通用化，保留 `fx-mutex` 例外

现状（`applyInvertState` 内）：
```js
if (why !== 'manual' && why !== 'fx-mutex') {
  const manual = manualStateFor(el);
  if (manual !== null) { want = manual; why = 'manual'; }
}
```
提升为 `registry.arbitrate(el, candidate)`，**所有执行器的写入前都过这道门**（不只 invert）。
`fx-mutex`（特效投递与滤镜互斥的机械摘除）与 `manual` 自身仍是直写例外 —— 这两条例外是
v4.6 实测得出的，不得扩大。

**新动作与手动的关系**：手动结论（`data-svi-manual`）对 hide / mask 同样占优。
即「用户手动藏了 → 规则不得把它显示回来」，反之亦然。

### D-4 mask 用伪元素优先，冲突时回退独立层

**被否方案**：所有遮罩都用独立覆盖层（`position:absolute` 的兄弟节点）。
→ 否因：需要跟踪元素尺寸/位置变化（ResizeObserver × N）、z-index 战争、滚动跟随误差、
以及被 `overflow` / `transform` 祖先裁切的问题。

**采用方案**：三层，按成本递增：
1. **元素伪元素**（`[data-svi-masked]::after`）—— 零 DOM 节点、随元素天然跟随、无 z-index 问题。
   在判定阶段检测元素是否已占用 `::after`（`getComputedStyle(el,'::after').content !== 'none'`，
   **只在判定阶段查一次，不进热路径**）；占用则降级到 2。
2. **元素独立层**（`data-svi-mask-layer` 子节点，`pointer-events:none`）。
3. **区域遮罩层**（Alt+拖拽框选）—— 只能用 `position:fixed` 独立层，随滚动由 `scroll` 事件
   更新；这是 `rect` 语义，不是元素遮罩。

**已知限制（写进文档，不假装解决）**：`frost` 预设的 `backdrop-filter` 在元素自身带
`filter: invert(...)` 时，采样到的是**反色后**的内容；且 `backdrop-filter` 会创建新
stacking context。因此 `frost` 与 `invert` 同元素共存时面板给出提示，不阻止。

### D-5 遮罩风格用 CSS 变量 + 属性，不用 inline style

```css
[data-svi-masked]{ position: relative; }
[data-svi-masked]::after{
  content:''; position:absolute; inset:0; pointer-events:none;
  background: var(--svi-mask-color);
  opacity: var(--svi-mask-opacity);
  transition: opacity 140ms ease;
  backdrop-filter: blur(var(--svi-mask-blur));   /* solid/dim 时 blur = 0 */
}
[data-svi-masked][data-svi-peek]:hover::after{ opacity: var(--svi-mask-hover-opacity); }
```
- 风格预设（供 v5-5 pending 遮罩复用，**唯一定义处**）：

| 预设 | `--svi-mask-color` | `--svi-mask-opacity` | `--svi-mask-blur` | `--svi-mask-hover-opacity` |
| :--- | :--- | :--- | :--- | :--- |
| `solid` | `#0f172a` | 1.0 | 0 | 0.15 |
| `dim`（默认） | `#0f172a` | 0.75 | 0 | 0.15 |
| `frost` | `#0f172a` | 0.35 | 8px | 0.05 |

- 变量挂在 `:root`（全局参数）与 `[data-svi-mask-style="…"]`（预设覆盖）两级。
- **不用 inline style**：遵守 v4.6「属性写点唯一收口」纪律，也避免与站点自身 inline style 打架。

### D-6 规则复用 `svi:learned`，扩展 action 枚举

- `action` 枚举由 `'invert' | 'protect'` 扩为 `'invert' | 'protect' | 'hide' | 'mask'`。
- **`protect` 键名保持不变**（= keep 的存储别名），避免破坏已导出的规则包与既有用户数据。
- 规范化函数（现 line ~991 的 `raw.action === 'protect' ? 'protect' : …`）扩展为白名单
  `['invert','protect','hide','mask']`，未知值丢弃该条规则（旧版本读到 `hide` 会丢弃 ——
  **这正是期望的向后兼容行为**：旧版忽略而非崩溃）。
- `dim` 是**全页**动作，不进规则表；存全局 state + 站点覆盖。
- 迁移：无需数据迁移（枚举是超集，`protect` 语义不变）。

### D-7 规则查询加索引缓存（性能）

现状 `RuleLearner.decideFor` 每次线性扫 `activeRules(host)`；`elementRules` 也是线性扫。
Registry 内维护 `Map<srcKey, decision>`（无）与 `Map<stem, rule>`（有）两级缓存：
- `ruleIndex`：`Map<host, Map<stem, rule>>`，失效点 = 规则增删 / 站点切换 / 导入。
- 不做「逐元素 `getComputedStyle`」——这是本项目的性能红线（父 PRD 约束）。
- `resolveAction` 的自身开销目标：单元素 <0.01ms（与视频检测同量级）。

### D-8 开关即回滚

新动作 `defaultEnabled = false`，且每个动作的执行器在关闭时**彻底不参与** resolveAction
（不是「解析出来但不执行」）。因此：
- 功能级回滚 = 关开关（无需回退代码）。
- 代码级回滚 = 单次 `git revert`（Registry 与新动作同属一个提交边界）。

## 3. 数据流

```
元素进入管线（IO / eager / mutation flush / 手动触发）
        │
        ├─ resolveStage(el, ctx, 'override') ──► 有结论
        │        │   (manual / elementRule)          └─ registry.arbitrate(el, candidate)   ← 手动占优门
        │        │                                            │
        │        │                                            └─ executors[action].apply(el, params, source)
        │        │                                                       │
        │        │                                                       └─ applyInvertState（invert 专用写点）
        │        └─ null
        │                 │
        ├─ 决策快照 decisionBySrc 命中 → 应用并早退        ← 位置不变
        │        └─ 未命中
        │                 │
        ├─ resolveStage(el, ctx, 'rule') ──► 有结论        ← 位置不变
        │        │   (learned / seedProtect / faviconSkip / seedForceInvert)
        │        │                                            └─ arbitrate → executors[action].apply
        │        └─ null
        │                 │
        └─────────────────┴─► 现有门（小元素/策略）+ 像素管线
                                    │
                                    └─ registry.describe(el, {source:'pixel', reason})  ← 仅标注，不改决策
```

## 4. 契约清单（下游任务依赖，冻结后不得破坏）

| 契约 | 形状 | 消费方 |
| :--- | :--- | :--- |
| `window.__svi.ACTIONS` | `{ id → executor }` | v5-2 UI / v5-3 权重 |
| `window.__svi.SOURCES` | 有序来源表（id + stage + resolve） | v5-3 先验插位（形状先验只能插在 `stage:'rule'` 的 `learned` 之后、`seedProtect` 之前） |
| `window.__svi.resolveStage` | `(el, ctx, stage) → result \| null` | v5-2 列表 / v5-3 来源展示 |
| `registry.describe(el, {source, reason})` | 补来源标注（不改决策） | v5-2 原因码展示 / v5-3 分布聚合 |
| `registry.arbitrate(el, candidate)` | `(el, {action, source}) → candidate'` | 全部执行器 |
| `registry.maskPresets` | 预设表（D-5） | **v5-5 pending 遮罩** |
| `registry.ruleIndex` | 失效钩子 `invalidateRules(host?)` | v5-3 导入合并 |

## 5. 兼容性

- **偏好**：新增 `actions: { hide:{enabled,scope}, mask:{enabled,scope,style,params}, dim:{...}, peek:{enabled} }`。
  `loadState()` 按现有规范逐字段 normalize（枚举/布尔/数值范围），损坏数据不崩。
- **旧偏好**：`hoverRestore`（v3.1）保留为 `peek` 的图片作用域别名，键名与语义不变。
- **规则包**：`svi:learned` 枚举扩展，旧包可导；新包在旧版本被忽略 `hide/mask` 条目。
- **属性**：新增 `data-svi-hidden` / `data-svi-masked` / `data-svi-mask-style` / `data-svi-peek` /
  `data-svi-dim`。全动作关闭时**一个都不写**。
- **扩展**：`node scripts/build-extension.js` 重新生成 `extension/content.js`；manifest 无变化。

## 6. 回滚

1. **功能级**（推荐）：面板关闭新动作开关 → 行为回到 v4.6.1（AC-2/AC-3 保证）。
2. **代码级**：`git revert <本片提交>`。Registry 与动作同一提交，无跨提交悬空引用。
3. **规则数据**：若已固化 hide/mask 规则导致异常，面板「清空本站规则」即可（现有能力）。
4. **风险点**：`applyInvertState` 被收口进 `registry.arbitrate` —— 若仲裁逻辑写错，
   影响的是**反色主路径**。因此 implement.md 里把「仲裁重构」单独作为一步，前后各跑一次
   `node test.js`，并保留原实现作为注释基线以便比对。

## 7. 未决 / 交给下游

- 遮罩的**区域遮罩**（Alt+拖拽）与 `ImageFxEngine` 的 `rect` 反色框选共用 UI — 复用程度
  在实现时定，若冲突则以「不破坏现有 rect 反色」为准。
- `dim` 与 `bgReplace` 互斥规则的最终形态（v5-1 先做「dim 优先 + 面板提示」）。

### 7.1 阶段 A 审计新发现的遗留（v5-1 内解决，不推给下游）

**`BgImageEngine` 的第二套（较窄）优先级链** —— `data-svi-bginv` 属性自带的
`manualStateFor(el) → firstMatchingElementRule(el, profile.elementRules) → 尺寸/亮度`。
它违反 AC-1「不存在第二处独立的优先级判定实现」，但**不能在阶段 A 夹带合并**，原因三条：

1. `SOURCES.manual` 读 **src 键**（`manualOverrides[host|src]`）；`BgImageEngine` 读
   **元素属性**（`manualStateFor(el)`，为无 src 的 canvas / 背景元素设计）。两者是并集关系。
2. 把元素属性提进 `SOURCES.manual` 会让「只有属性、无 src 键」的 img 在 override 段提前出结论，
   `reason` 由 `'pixel'` 变 `'manual'`、`force` 由 false 变 true —— 终态相同但原因码变化，
   违反阶段 A 的零行为变化判据。
   （`markManual` 对有 src 元素同写属性与 src 键，故对 img 实际无差异；但无 src 元素与
   `propagateManualToSiblings` 的部分路径不写 src 键，不能据此断言无差异。）
3. `data-svi-bginv` 是**另一个动作**，需要先决定它与 `ACTIONS` 的关系（新增 `bg-invert` 动作，
   还是让 `invert` 执行器同时管两个属性门）—— 属设计决策，不应在重构中夹带。

**解法（待实施，独立成步）**：新增 `bgInvert` 执行器（`attr: 'data-svi-bginv'`），并把
`BgImageEngine` 的元素级路径改为经 `resolveStage(el, ctx, 'override')`；元素属性的手动结论
作为**独立来源 `manualElement`** 插入 `SOURCES`，位置在 `manual` 之后、`elementRule` 之前
（与 `BgImageEngine` 现行顺序一致）。此变更会影响原因码，**必须单独验证并单独提交**。
