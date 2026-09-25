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

## 6. 渲染层实现要点（v6-2 落地，2026-09-26 · 三条硬约束）

消费方**必须**照下面三条渲染，否则实测会得到"整块元素被反色"（单测抓不到，只有真浏览器能发现）：

1. **`mask-image` 走 alpha 通道，不是亮度**。位图表达编码 PNG 时：RGB 一律白，
   **"保持原色"的格必须写 `alpha = 0`**（透明）。alpha 全 255 等于整块遮罩 →
   覆盖层会把整个元素盒都反色。
2. **`<clipPath>` 内多个子元素之间是并集**。矢量表达**必须**汇成**单条 `<path>`**
   （外框 + 各洞作为子路径）+ `clip-rule: evenodd`；写成"一个整盒 rect + 若干洞 rect"
   会得到「整盒 ∪ 洞」= 整盒。且 clipPath 容器**不能放在被裁剪元素内部**（放同级兄弟）。
3. **几何映射分两步**：内容盒归一化坐标 →（`object-fit` / `object-position` 仿射）→
   元素盒坐标；然后位图与矢量都按元素盒 100% 铺满。
   内容盒之外的格**一律 0（保持原色）** —— 那些像素不是图像内容。
   覆盖层几何用元素相对定位祖先的 `offsetLeft/Top/Width/Height`；**不要用 `inset: 0`**
   （containing block 是定位祖先，不是媒体元素）。

**掩码查找（消费方取掩码的唯一正确方式）**：`RegionMask` 只由图像内容决定、与元素无关，
故取用顺序为 **元素直连 → src 直连 → 字符串键兜底**。只按字符串键查会踩两个静默不挂的坑：
判定时机早于图片加载（键里的固有尺寸还是 0）、以及同 src 的第二个元素复用决策（不会再算网格）。
`window.__svi` 侧对应 `regionByElement`（WeakMap）/ `regionBySrc`（Map, 上限 200）/
`regionCache`（LRU 200）三层，`regionCacheClear()` 一并清空。

**覆盖层纪律**：`position:absolute` + `pointer-events:none` + `z-index:1` + `aria-hidden`，
不设 `transform`/`opacity`（避免自造 stacking context）；载体**必须是独立 DOM 层**，
不得挂到媒体元素自身的伪元素上（replaced element 不生成伪元素），也不得借用站点包裹元素的
`::after`（几何对不齐 + 与站点伪元素冲突）。生命周期：元素脱离文档即回收（低频清扫），
全屏/PiP 期间暂停（卸载但记住，退出后恢复）。

**降级原因码**（`degrade.reason` 之外，渲染层另有自己的原因码，供面板与 toast 用）：
`ancestor-filter` / `ancestor-opacity` / `ancestor-blend` / `ancestor-backdrop` /
`no-positioned-ancestor` / `mutex-fx` / `mutex-tune` / `overlay-budget` / `no-mask` / `not-ready`。
**任何一条都不得静默失效**：退化为整图判定 + 计数 + 每原因每会话一次的 toast。

**已知限制（如实标注）**：视频/GIF 的掩码按心跳（默认 1s）与场景跃变重算，**帧间沿用**旧掩码 ——
场景**渐变**时"哪块该反"会滞后（反色本身仍是实时的，由合成器逐帧重采样）；
面板需标注该代价，并提供「仅静态图」开关（`regionStaticOnly`）。

## 7. 证据位置

- 单测：`test.js` 的「v6.0 unit tests」「v6.0 阶段 1/2/3/4/5/6/7」块（含 bench 与反例留档）
- 端到端：`test-browser.js` **Scenario 30**（部分反色渲染层：像素等价 / letterbox / 降级 / 全屏 /
  零残留，含真合成器出图的像素采样）；其余 29 场景在默认关闭下零回归
- 设计与推理：`.trellis/tasks/09-25-v6-auto-region/design.md`、`implement.md`（含 8 条偏离记录）；
  渲染层见 `.trellis/tasks/09-25-v6-partial-render/design.md`、`implement.md`（含 6 条偏离记录）
