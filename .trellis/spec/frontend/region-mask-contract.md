# 区域掩码契约 `RegionMask`（**冻结**，2026-09-25 · v6-1 交付）

> **本文件是全仓关于区域掩码的唯一权威。**
> 冻结于任务 `v6-1 自动区域分割内核`（`.trellis/tasks/09-25-v6-auto-region/`，状态 `in_progress`）。
> 冻结之后：**v6-2（渲染层）与 v6-3（纠正回路）只消费、不修改**；任何契约改动都必须回到规划阶段
> 重新裁决，不得在下游就地改。
>
> 语言说明：本仓 `.trellis/spec/` 其余文档为英文；本文件按用户级规则「文档/注释全中文」以中文书写。

---

## 1. 契约形状

```js
{
  v: 1,                     // 契约版本；消费前必须校验（不符视为不可用 → 降级）
  key: string,              // 缓存键：`${host}|${selectorStem}|${nw}x${nh}`
  gw: number, gh: number,   // 网格尺寸（等于采样尺寸 N）

  // —— 权威数据 ——
  data: Uint8Array,         // 长度 gw*gh；1 = 该格反色，0 = 该格保持原色
  coverage: number,         // data 中 1 的占比，0~1（由 data 派生，非独立计算）

  // —— 语义标注 ——
  polarity: 'carve-color' | 'carve-light',
  //   carve-color：整图偏浅 → 抠掉大面积彩色/深色块，其余反色（主场景）
  //   carve-light：整图偏深 → 抠出大面积浅色块去反色（对偶场景）

  // —— 来源与降级 ——
  source: 'region' | 'whole' | 'none' | 'degraded',
  degrade: null | { reason: 'taint' | 'decode' | 'cross-origin' | 'no-pixels' | 'budget' | 'unknown' },

  // —— 渲染就绪表达（三选一，同一 data 下渲染结果必须像素级等价）——
  expr:
    | { kind: 'holes',  holes: [{ x, y, w, h }] }   // 归一化 0~1；从整图挖洞
    | { kind: 'islands', polys: [{ x, y, w, h }] }  // 归一化 0~1；孤岛式反色
    | { kind: 'bitmap', bytes: Uint8Array }          // gw*gh 灰度，0 = 不反色 / 255 = 反色
}
```

**`data` 是唯一权威**；`expr` 是可重算的派生表达。下游可从 `data` 重建 `expr`，
但**不得**反向从 `expr` 反推 `data`。

## 2. 不变量（单测全绿，见 `test.js`「v6.0」各块）

| # | 不变量 |
| :-- | :--- |
| I0 | `v === 1` 且 `source` 属于合法集合（版本不符 → 消费方按降级处理） |
| I1 | `data.length === gw * gh` 且 `data instanceof Uint8Array` |
| I2 | `source === 'whole'` ⟹ `data` 全 1 且 `coverage === 1` |
| I3 | `source === 'none'` ⟹ `data` 全 0 且 `coverage === 0` |
| I4 | `source === 'degraded'` ⟹ `degrade !== null`（缺失时补显式 `'unknown'`，不静默放行） |
| I5 | `source === 'region'` ⟹ `degrade === null` 且 `coverage ∈ (0,1)` 开区间 |
| I6 | `coverage` 与 `data` 的 1 计数**算术一致**（同一算法派生） |
| I7 | 三种 `expr.kind` 在同一 `data` 上渲染结果**像素级等价**（由 `validateRegionMask` 的互译校验保证前提；最终断言在 v6-2 的 bench） |
| I8 | `expr.kind === 'bitmap'` ⟺ `data` 无法用 **≤ K 个互不相交矩形精确表达**（并集 === 目标集合，一格不多不少） |

## 3. 消费纪律（违规即契约漂移）

- **唯一构造入口** `makeRegionMask(opts)`；**唯一校验入口** `validateRegionMask(m)`。
  消费任何掩码前先过校验，不通过即按降级处理。
- **不得有第二处分割实现**：分割只在 `universal-smart-invert.user.js` 的 section 12.5 内，
  且逐格判定**必须**与整图判定共用同一单像素谓词（`buildLightTestCtx` + `classifyLightPixel`）——
  这是 v5.4 §2「两条采样路径必须共用同一判定函数」的直接延伸。
- **入口分层**：`buildRegionMask(grid, opts)` 是**纯函数**（无副作用、同输入同输出，v6-2 的帧间
  调度可安全复用）；缓存、计数、计时一律在薄外壳 `regionMaskTake` 里，不得下沉进纯函数。
- **渲染语义**：`expr` 的矩形**互不相交**（重叠子路径在 nonzero/evenodd 两种填充规则下语义分叉）。
- 全关（`regionSegment === false`）时不得有任何区域计算、缓存写入或属性写入。

## 4. 阈值与参数（单一真源 `REGION_DEFAULTS`）

| 参数 | 默认 | 说明 |
| :-- | :-- | :--- |
| `regionSegment` | `false` | 总开关；关闭时与 v5.0.0 行为一致 |
| `regionGridN` | `16` | 采样/网格 N×N，钳制 8~32 |
| `regionMinAreaRatio` | `0.03` | 最小连通域面积门（D3「保守大块」） |
| `regionKRects` | `3` | 矢量快路径的矩形数上限 K，钳制 0~8 |
| 双门阈值 | `0.97 / 0.03` | **由 `1 - regionMinAreaRatio` 与 `regionMinAreaRatio` 硬派生**；改动面积门即两门同步 |

形态学核固定 3×3（8 邻域，腐蚀边界复制 = `mode='nearest'`）；
明度线 / 饱和度线**复用既有图片阈值组**（`getEvalPrefs()`），不新增阈值定义。

> 双门阈值与 PRD R5 的 AC 数值（0.90/0.10）不同 —— 这是一处**已知偏离**，
> 完整理由与实测见 `.trellis/tasks/09-25-v6-auto-region/implement.md` 偏离 7。

## 5. 出口（`window.__svi`）

`REGION_MASK_VERSION` · `REGION_DEFAULTS` · `makeRegionMask` · `validateRegionMask` ·
`buildRegionMask` · `regionCoverage` · `regionCellGrid` · `regionGridRatio` ·
`regionDilate/Erode/Close/Open` · `regionComponents` · `regionCarve` ·
`regionRectsExact` · `deriveRegionExpr` · `REGION_CACHE_MAX` · `regionMaskKey` ·
`regionMaskTake` · `regionCacheClear` · `regionDiagnostics` · `regionMaskKeyFor` · `regionReasonFor` ·
`buildLightTestCtx` · `classifyLightPixel`

与 Action Registry 的接缝：新增 **reason 码 `'region'`**（**不改 `SOURCES` 表形状**，
`source` 仍是 `'pixel'`）；`'region'` 被判为**自动来源**（进撤销栈）。

## 6. 证据位置

- 单测：`test.js` 的「v6.0 unit tests」「v6.0 阶段 1/2/3/4/5/6/7」块（含 bench 与反例留档）
- 端到端：`test-browser.js` 29 场景（默认关闭，基线零回归）
- 设计与推理：`.trellis/tasks/09-25-v6-auto-region/design.md`、`implement.md`（含 8 条偏离记录）
