# Design: v6-2 部分反色渲染层

> 上游契约：`.trellis/spec/frontend/region-mask-contract.md`（**冻结**，只消费不修改）。
> 本文是 v6-3（纠正回路）的实现依赖：纠正要作用在本层渲染出的覆盖层上。

## 1. 边界

**做**：把 `RegionMask` 渲染成可见的部分反色（覆盖层 + mask/clip 合成 + 几何映射 + 祖先链降级 +
视频/GIF 重算调度 + 生命周期清理 + 开关与诊断）。

**不做**：
- 不做分割（v6-1 已冻结；本层**不得**出现第二处分割实现）。
- 不做纠正交互（v6-3）。
- 不改判定阈值、不改 Action Registry 的优先级链。
- 不引入新依赖、不读像素（`backdrop-filter` 在合成器层采样，这正是选它的原因）。

**对用户可见的变化**：**只有当 `regionRender` 打开时才有**；默认关闭时零覆盖层、零新增节点。

## 2. 现状接缝（实读的代码事实）

| 事实 | 位置 |
| :-- | :--- |
| 反色滤镜串单一真源 | `--svi-img-filter`（`rootEl` 上设置 @1191，CSS 兜底 @3623） |
| 元素级反色的唯一写点 | `applyInvertState(el, want, reason)` @2497 → `arbitrate` |
| 覆盖层的既有先例 | `.svi-fx-overlay`（`position:absolute; pointer-events:none; border-radius:inherit`）@4514 / 创建 @9114 / 全清 @1258 |
| 遮罩层的既有先例 | `[data-svi-masked]::after` 优先、元素已占 `::after` 时降级为 `[data-svi-mask-layer]` 独立层（**证明站点 `::after` 冲突是真实存在的**） |
| 场景跃变门 | `state.sceneDelta`（v5-4，`sceneDelta` 默认 0.35） |
| 全屏事件 | `fullscreenchange` / `webkit-` / `moz-` @13795（v4.3 视频处理已有入口） |
| 引擎结构 | `ImageEngine`（决策）/ `ImageFxEngine`（特效 blob）/ `BgImageEngine`；新增 `RegionRenderEngine` |
| 计数器 | `StatsManager.count(name)` + `freshCounters()` 闭合键集 |

## 3. 架构决策（含与 PRD 的偏离）

### D1 — 覆盖层载体：**统一新建真实 DOM 层**，不用站点元素的 `::after`（**偏离 PRD**）

PRD R1 写「优先复用站点已有包裹元素的 `::after`；无可用包裹元素时新建真实 DOM 层」。
**本设计改为一律新建独立覆盖层**，三个理由：

1. **几何对不齐**：包裹元素的 `::after` 覆盖的是**包裹元素自己的盒**，而掩码是**媒体内容盒**的
   归一化坐标。包裹元素通常比媒体大（figure 带图注、a 带内边距），`inset:0` 之后掩码整体偏移，
   与 R3 的「像素级对齐」直接冲突。
2. **`::after` 冲突是已证实的真实风险**：本仓遮罩动作（v5.0）就有「元素已占用 `::after` 时
   降级为独立层」的先例 —— 站点自己用 `::after` 做角标/遮罩的页面很多。
3. **本层要做减法**：独立层可以只挂 `data-svi-region`，不往站点元素上写任何样式/伪元素，
   清理时 `remove()` 即净；这与 `.svi-fx-overlay` 的既有纪律一致。

代价：媒体元素没有 positioned 祖先时无法精确定位 → **不挂载并显式降级**（见 D5），
而不是「改动站点布局」（PRD Constraint 明确禁止污染站点 `position`）。

### D2 — 几何映射：把掩码**重采样进元素盒坐标**，两表达共用一套映射

`RegionMask.data` 是**内容盒**的归一化网格。渲染前统一做一次仿射映射到**元素盒**：

```
内容盒在元素盒中的矩形 = f(object-fit, object-position, 固有尺寸, 元素尺寸)
boxX = (contentOffsetX + cellX * contentW) / elemW
boxY = (contentOffsetY + cellY * contentH) / elemH
```

重采样后：
- `bitmap` → `mask-image`（元素盒网格的灰度位图）+ `mask-size: 100% 100%` + `mask-repeat: no-repeat`；
- `vector` → `clip-path: url(#svi-region-clip-N)`（`clipPathUnits="objectBoundingBox"`，矩形已在元素盒坐标）。

**为什么必须重采样而不是用 `mask-size` 百分比**：letterbox（`contain`）与裁切（`cover`）
需要同时表达缩放**与偏移**，而 `mask-position` 的百分比语义（相对"多余空间"）与我们的
"内容盒偏移"不是同一件事，容易差半个字宽；`cover` 还要负偏移（内容比盒大）。
改成"先进元素盒坐标、再 100% 铺满"后，两种表达都只是**同一套仿射变换的两个消费者**，
R3 的四种场景（object-fit / 祖先 transform / zoom / 背景图）也退化成同一件事。

**letterbox 边缘的处理**：内容盒之外（元素盒内的边距区）掩码一律 **0（保持原色）** ——
那部分不是图像像素（通常是透明底或元素自己的背景），反它没有意义，且会让"整块元素"
看起来被反色，与"只反该反的区域"的语义冲突。

**祖先 `transform` / `zoom`**：不需要额外处理 —— 覆盖层与媒体元素在**同一个变换坐标系**里
（覆盖层是媒体元素的兄弟/子级，随祖先一起被变换），`objectBoundingBox` 与元素盒同步缩放。
唯一要额外做的是 `object-fit`/固有尺寸变化时**重算**（`ResizeObserver` 已有基础设施）。

### D3 — backdrop-root 探测：一次性沿祖先链扫，结果缓存，命中即显式降级

截断判定（命中任一即 `source='degrade'`，**不挂覆盖层**，退回整图判定）：

| 祖先链上的情形 | 常量 | 为什么截断 |
| :-- | :-- | :--- |
| `filter` 非 none | `ancestor-filter` | filter 建立新的 backdrop root，覆盖层只会采样到该祖先之后的内容 |
| `opacity < 1` | `ancestor-opacity` | 同上（半透明组隔离） |
| `mix-blend-mode` 非 normal | `ancestor-blend` | 同上 |
| 自身有 `backdrop-filter` | `ancestor-backdrop` | 同上 |

- 探测在**挂载覆盖层之前**执行一次，沿 `parentElement` 上溯（到 `documentElement` 为止），
  结果存进覆盖层记录（`rootOk` / `rootReason`），**并缓存到 `WeakMap<Element, {ok, reason, epoch}>`**。
- **不进热路径**：探测只发生在「创建覆盖层」与「重算」两个时机，帧内同步路径（`requestAnimationFrame`
  回调/canvas 扫描/hover 处理）**绝不新增 `getComputedStyle`**。
- 缓存失效：偏好变更（`clearCacheAndRescan`）与元素重挂载（记录里带 `epoch`）时失效。

### D4 — 与元素级滤镜互斥：**用户显式选择的滤镜优先**（R7）

图片特效（`luma`/`grayscale`/`sepia`/`custom`）与视频 `videoTune` 都是元素级 `filter`，
与「本层要求元素 `filter: none`」直接冲突。**优先级：用户显式元素级滤镜 > 部分反色**。

- 命中 → 不挂覆盖层，退化为整图判定，诊断记 `degrade: mutex-fx` / `mutex-tune`，面板提示一行。
- 理由：图片特效模式与 videoTune 都是用户**逐项配置**的选择；自动区域分割不能静默顶掉它。
  与 `fx-mutex`（v4.3 特效与反色的既有互斥）同纪律。

### D5 — 定位上下文：没有 positioned 祖先就**不挂载**

覆盖层需要 `position:absolute` 且最近 positioned 祖先 = 媒体元素的**定位基准**。
若媒体元素到根之间没有任何 positioned 祖先，覆盖层会相对 `initial containing block` 定位，
再靠 `offsetLeft/offsetTop` 补正 —— 但 `offsetLeft` 对非 positioned 元素是相对 offsetParent 的，
两者会错位。**故：无 positioned 祖先 → 不挂载 + `degrade: no-positioned-ancestor`**（与 D1 代价一致）。

### D6 — 视频/GIF 重算调度（R6）

- **视频**：复用 v5-4 已有的场景跃变判据（`sceneDelta`）触发重算 + **低频心跳**（`regionHeartbeatMs` 默认 1000ms）；
- **GIF**：无场景 API，只走心跳；
- **帧间沿用**：掩码不逐帧重算，帧间沿用上一次结果（`backdrop-filter` 逐帧重采样由合成器负责，
  探针已验证 —— 这是本方案的关键性质：**掩码滞后的只是"哪块该反"，反色本身是实时的**）；
- **预算**：单元素 1 个覆盖层（结构决定）；全局 `regionOverlayMax`（默认 8），超限不挂载 + 计数；
- **已知代价**（如实标注）：场景渐变（非跃变）时掩码滞后，面板提示 + 提供 `regionStaticOnly` 降级开关。

### D7 — 生命周期

覆盖层记录 = `{el, overlay, clipId, maskUrl, key, rootOk, reason, lastCalcAt}`。
清理时机：元素断开（`isConnected === false`）/ 掩码缓存淘汰 / `regionRender` 关闭 /
`clearCacheAndRescan` / 页面卸载。清理必须同时回收：DOM 节点、`<clipPath>` 定义、
`blob:` 掩码 URL（`URL.revokeObjectURL`，参照 `ImageFxEngine.pendingRevoke` 的延迟撤销纪律：
立即 revoke 会让正在合成的帧丢图，故延迟 60s 或淘汰时回收）。

## 4. 数据流

```
ImageEngine.decideImage 判定为"该反色"
  └─ 现有整图路径: applyInvertState(el, true, reason)         ← 不变
  └─ v6-2 新增: regionRender 开启 且 掩码 source==='region'
        → RegionRenderEngine.mount(el, mask)
             ├─ 祖先链探测 (D3) ── 命中 → 降级，记原因，走上面整图路径
             ├─ 互斥检查 (D4) ──── 命中 → 降级，记原因，走上面整图路径
             ├─ 定位检查 (D5) ──── 命中 → 降级，记原因，走上面整图路径
             ├─ 几何映射 (D2) → 元素盒网格 / 矩形列表
             ├─ 创建覆盖层 + 掩码 + 撤销元素级 filter (R1)
             └─ 注册调度 (视频/GIF) 与清理
```

**关键顺序**：先撤销元素级 filter 再挂覆盖层，且**同帧内完成**（否则会闪一帧"双滤镜"或"无滤镜"）。
用 `data-svi-region="true"` 标记元素供复检/清理识别。

## 5. 状态与开关

| 偏好 | 默认 | 说明 |
| :-- | :-- | :--- |
| `regionRender` | `false` | 部分反色渲染总开关 |
| `regionHeartbeatMs` | `1000` | 视频/GIF 掩码重算心跳（200~5000） |
| `regionOverlayMax` | `8` | 全局覆盖层上限（1~50） |
| `regionStaticOnly` | `false` | 仅静态图（视频/GIF 不挂覆盖层，规避掩码滞后） |

诊断（面板行由 v6-4 渲染，本层只给数据）：
`regionRenderDiagnostics()` → `{overlays, degradeByReason, lastRecalcReason, maskUrls}`

## 6. 风险

| 风险 | 处置 |
| :-- | :--- |
| backdrop-root 截断（PRD 标为最高风险） | D3 一次性探测 + 显式降级 + 分原因计数；**绝不静默失效** |
| 几何映射错位 | D2 单一仿射 + bench 像素级断言四场景 |
| 覆盖层挡点击 | `pointer-events: none !important`（继承 `.svi-fx-overlay` 纪律）+ bench 断言 |
| GPU 合成层堆积 | 单元素 1 层 + 全局上限 + 断开即清 + bench 断言零残留 |
| 与站点 `z-index` 战争 | `z-index` 取最小可用值（1），且不创建 stacking context（不设 transform/opacity） |
