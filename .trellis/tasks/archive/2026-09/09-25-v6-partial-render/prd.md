# PRD: v6-2 部分反色渲染层

## 背景

v6-1 产出「该反色区域」的掩码契约（`RegionMask`）。本任务把掩码**渲染出来**。

架构**不是推演的，是探针实测的**（`dev/probe-partial-backdrop.js` /
`dev/probe-partial-tracking.js`，真 Chrome + CDP + 截图 + ffmpeg 取像素，7 用例 × img/video）：

| 命题 | 实测结论 |
| :--- | :--- |
| `backdrop-filter` 与 `clip-path` / `mask-image` 同元素，裁剪能否限制反色范围 | **能**。`circle()` / `inset()` / `polygon()` / `url(#clip)` / `mask-image: radial-gradient()` 五形态全部「中心反色、角落原色」 |
| 视频上是否成立 | **是**，与 img 逐项一致 |
| evenodd 挖洞（外框 ∖ 内区） | **能**，中心原色、四角反色 |
| `clipPathUnits="objectBoundingBox"` | **可用于自动跟随元素缩放** |
| `backdrop-filter` 逐帧重采样还是静态快照 | **逐帧重采样**（白/黑交替视频，采样值同步交替） |

### 覆盖层载体的选择（补充实测，**决定 R1 的实现形态**）

| 载体 | 结果 |
| :--- | :--- |
| 真实 DOM 节点（无 `z-index`，仅靠 DOM 顺序在后） | **有效** |
| 真实 DOM 节点 + `z-index: 1` | **有效** |
| **外层包裹元素的 `::after`** | **有效**（`::after` 绘制在内容之上，零新增 DOM 节点） |
| **媒体元素自身（`<img>` / `<video>`）的 `::after`** | **完全无效** —— 媒体是 *replaced element*，CSS 不为其生成伪元素 |

**由此确定**：覆盖层**必须挂在媒体元素之外的载体上**。优先复用站点已有包裹元素的 `::after`；
无可用包裹元素时新建真实 DOM 层（与现有 `.svi-fx-overlay` 同纪律：仅在有 positioned 祖先时
创建，**绝不改动站点布局**）。**不得**试图把覆盖层做成媒体元素自身的伪元素。


**因此走 `backdrop-filter` 覆盖层，不做「画中画克隆层」**：克隆层对 `<img>` 可行，但动图
克隆会从第 0 帧重播、`<video>` 克隆要同步 `currentTime`/`playbackRate`、跨域视频克隆因缺
`crossorigin` 直接失败。backdrop-filter 在合成器层面采样、**不读像素**，故跨域图、跨域
视频乃至 DRM 视频同样可反色。

## Requirements

### R1 — 覆盖层结构（D2：部分反色接管元素）
- 部分反色生效的元素，其**元素本体 `filter` 必须为 `none`**：先撤销现有元素级反色
  （`data-svi-inverted` 等属性门），再由覆盖层承担全部反色。**不得**叠加双重滤镜。
- 覆盖层：`position: absolute; inset: 0; backdrop-filter: <反色滤镜串>; pointer-events: none;`
  加在媒体元素之上、同一层叠上下文内。
- **反色滤镜串必须与现有实现逐字符一致**（`invert(1) hue-rotate(180deg) brightness(.92)
  contrast(.90)` 那一串，含用户自定义参数），否则部分反色与整图反色观感会分裂。
- 元素本体若无定位上下文，需由引擎建立（不得污染页面已有 `position`）。
- **AC**: bench 断言部分反色生效时元素本体 `filter` 为 `none`；覆盖层滤镜串与
  `--svi-img-filter` 计算值逐字符相等。

### R2 — 掩码到 CSS 的表达
- 消费 v6-1 的 `RegionMask.expression`，两种表达都由本层渲染，消费方不分支：
  - `bitmap` → `mask-image: url(blob:...)` + `mask-size: 100% 100%`；
  - `vector` → `clip-path: url(#svi-clip-N)`（`clipPathUnits="objectBoundingBox"`，
    外框 + 区域用 evenodd 组合）。
- `<clipPath>` / `<mask>` 定义统一挂在一个隔离的 `<svg>` 容器里，生命周期随覆盖层。
- **AC**: 两种表达在同一掩码上渲染结果**像素级等价**（bench 用 ffmpeg 取像素断言）。

### R3 — 坐标与变换映射（最容易出错的环节）
- 掩码概念上是**元素内容盒的归一化坐标**（0~1）。渲染时必须正确处理：
  - `object-fit` 的 letterbox / crop（`contain` / `cover` / `none` / `scale-down`）；
  - 元素自身及**祖先**的 CSS `transform`（含 `scale` / `rotate` / `skew`）；
  - 页面 `zoom` 与浏览器缩放；
  - 背景图元素的 `background-size` / `background-position` / `background-repeat`。
- **AC**: bench 断言 `object-fit: contain` 的 letterbox 图、被祖先 `transform: scale()`
  放大的图，掩码位置仍与内容对齐（像素级）。

### R4 — backdrop-root 祖先链探测与降级（**最高风险**）
- 媒体元素的祖先若带 `filter` / `opacity < 1` / `mix-blend-mode` / 自身 `backdrop-filter`，
  覆盖层的 backdrop 会被截断 → 采样不到画面 → **反色静默失效**。探针只验了干净 DOM。
- 建立覆盖层时沿祖先链探测一次，结果**缓存**；**探测不得进入热路径**（不得在帧内同步
  路径引入新的 `getComputedStyle`）。
- 命中截断 → **显式降级**：不挂覆盖层，退回整图判定路径，并在面板给出一行原因。
  绝不静默失效。
- **AC**: 单测构造四类祖先各自触发降级；bench 断言降级时零覆盖层挂载且原因可观测。

### R5 — 全屏 / PiP
- `video` 进入全屏（`fullscreenchange`）或画中画（`enterpictureinpicture`）后覆盖层会脱离。
- 处理策略需明确（临时撤销部分反色 / 把覆盖层搬进全屏元素），且必须**同屏可见地可解释**。
- **AC**: bench 断言全屏进出后覆盖层状态正确，退出全屏能恢复。

### R6 — 视频与 GIF 的掩码重算调度（D5）
- 掩码不逐帧重算（热路径）。重算时机：
  - 视频：**场景跃变**（接 v5-4 已有机制）+ **低频心跳**（默认 1s，可调）；
  - GIF：无可用场景 API，只能**低频心跳**；
  - 帧间沿用上次掩码。
- 预算上限：单元素覆盖层数上限；视频上默认只允许 1 个掩码层。
- **场景渐变（非跃变）时掩码会滞后** —— 这是 D5 的已知代价，必须在面板如实标注，
  并提供「仅静态图」的降级开关。
- **AC**: 单测重算调度（跃变触发 / 心跳触发 / 预算超限）；bench 断言帧间沿用不重算。

### R7 — 与元素级滤镜的互斥
- 图片特效模式（`luma` / `grayscale` / `sepia`）、视频画面调节（`videoTune`）都是元素级
  `filter`，与 R1 的「本体无 filter」直接冲突。
- 需定义明确优先级，并在面板提示冲突（哪一方生效、另一方为何被让位）。
- **AC**: 单测互斥矩阵；bench 断言冲突时面板提示可见。

### R8 — 生命周期与清理
- 元素被移除 / 离开视口 / SPA 导航 / 掩码缓存淘汰 → 覆盖层与 `<clipPath>` 定义必须一并清理，
  不得泄漏 DOM 节点与 GPU 合成层。
- **AC**: bench 断言元素移除后覆盖层节点数为 0。

### R9 — 开关与可观测
- 「部分反色渲染」总开关 + 心跳周期 + 覆盖层数上限 + 冲突策略，全部可调；**默认关闭**。
- 面板只读诊断行：当前覆盖层数 / 降级次数（分原因）/ 最近一次重算原因。
- **AC**: 各开关单测；关闭后零覆盖层。

## Constraints

- **不得改用双重滤镜路线**（D2 的根据：`brightness`/`contrast` 在近白端钳位，
  「反色再反色」回不到原色）。
- **纯浅色 / 纯深色图仍走现有元素级 filter 路径**，不得把 100% 的图片反色都改成
  backdrop 层（V6-1 R5 的双性能门是这条的守卫）。
- `pointer-events: none` 强制，绝不挡媒体控件点击。
- 覆盖层不得进入页面语义树（`aria-hidden`），不得影响页面自身的 `z-index` 战争
  （`z-index` 取最小可用值）。
- 新增属性门统一 `data-svi-*` 前缀；**帧内同步路径不得引入新的布局/样式查询**。
- 零外部依赖 / 零网络。注释与文档全中文。

## Acceptance Criteria（汇总）

- [ ] 覆盖层结构落地；部分反色生效时元素本体 `filter: none`，滤镜串与整图路径逐字符一致
- [ ] 位图与矢量两种掩码表达渲染结果像素级等价
- [ ] `object-fit` / 祖先 `transform` / `zoom` / 背景图四个坐标场景均对齐
- [ ] backdrop-root 四类祖先族均能探测并显式降级，探测不进热路径
- [ ] 全屏 / PiP 进出后覆盖层状态正确
- [ ] 视频场景跃变 + 心跳、GIF 心跳的重算调度与预算全部验收
- [ ] 与图片特效 / videoTune 的互斥矩阵有单测与面板提示
- [ ] 元素移除后零覆盖层残留
- [ ] 默认关闭；全关时 `node test.js` / `test-browser.js` 与 v5.0.0 一致
- [ ] 四绿门禁全绿

## Notes

- 依赖 v6-1 的**掩码契约**，本片**只消费不重实现**分割。
- 本片是 v6-3 的前置：纠正交互要作用在本片渲染出的覆盖层上。
- 本片是**纯 CSS/JS**，用户脚本形态与扩展形态能力一致（不像 flashGuard 有
  `document_start` 差异）；但视频/GIF 的重算依然依赖引擎已启动。
