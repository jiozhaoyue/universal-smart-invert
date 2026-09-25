# Design: v5-4 提前判定

## 1. 边界

**做**：视频帧序列判定（提前切换 + 转场白闪门）；动图全帧谱分析（ImageDecoder）。

**不做**（用户 D2 裁决）：带外预解码（Range + WebCodecs 解 keyframe）、MSE 分片钩子。

## 2. 现状（已核查）

- `HILStateMachine.startFrameLoop()` 已用 rVFC 逐帧检测（`onFrame`），250ms 轮询互斥兜底。
  但 `onFrame` 是**单帧判**：一帧 `whiteRatio` 超阈立即切换。
- `LuminanceDetector.detect(video)` 用 16×16 采样，返回 `{ scene, whiteRatio, avgSaturation, durationMs }`。
- 视频决策带 HIL 状态（`userRejectedScene` / 退出迟滞 `normalSceneCount`），落在 `applySceneResult`。
- `<img>` 走 `analyzeSrc` → `recordDecision` **一次判死**；动图换景后永不复议。

## 3. 关键决策

### D-1 帧序列：**只加两个"门"，不改默认路径**

单帧判有两个问题：(1) 切换滞后于场景（要等帧真的变白才成立）；(2) 转场常有 1–2 帧接近纯白。

**被否方案**：把判定整体改成"窗口平均判"。
→ 否因：会改变所有既有视频场景的行为，回归面过大且无法逐帧解释。

**采用方案**：保留 `detect()` 的单帧结果作为默认，只在窗口给出**额外证据**时覆盖：

| 门 | 条件 | 动作 |
| :--- | :--- | :--- |
| `whiteFlash` | 窗口 ≥3 帧，当前帧判白，但**窗口内其余帧多不为白** | 判为转场闪光 → **改判 normal**（不切换） |
| `earlySwitch` | 窗口末两帧同为白，且上升幅度 ≥ `sceneDelta` | **提前判白**（即使当前单帧刚好在阈值下方） |

两者都只在明确的窗口证据下生效；其余情况与 v5-1 逐字一致。

### D-2 窗口与预算

`frameWindow` 默认 3（2–8）。窗口只存 `whiteRatio` 数值，容量 ≤8，零分配压力。
`sceneDelta` 默认 0.35。**不引入任何额外采样**（复用 `onFrame` 已有的那一次 `detect`）。

### D-3 动图：廉价闸门 → 全帧谱，分级付费

动图路径代价高（解码全部帧），所以**先探测再付费**：

1. **廉价闸门**：后缀/类型命中动图扩展名，**或** 同一元素两个时刻（间隔 400ms）采样结果不同；
2. 命中才走 `ImageDecoder` 全帧谱：
   `new ImageDecoder({data, type})` → `tracks[0].frameCount` → 逐帧 `decode({frameIndex})`
   → `VideoFrame` → 16×16 采样 → 每帧 `whiteRatio`；
3. **预算**：`frameSampleCap` 默认 60 帧 + `animDecodeBudgetMs` 默认 40ms，
   超预算即用已解帧出结论（`stride = ceil(frameCount / cap)` 分帧采样）。

### D-4 三分类与"混合型"的诚实处理

| 分类 | 条件 | 动作 |
| :--- | :--- | :--- |
| 全浅 | 白帧占比 ≥ `animAllLightRatio`（默认 0.9） | `invert`，reason `animated-light` |
| 全深 | 白帧占比 ≤ `1 - animAllLightRatio` | `keep`，reason `animated-dark` |
| 混合 | 其余 | **默认 `keep`**，reason `animated-mixed` |

**混合型为什么默认不反**：CSS filter / `content:url` 都**无法按时序切换**。要真的逐帧反色得把
GIF 交给 canvas 逐帧重绘（成本高、跨域受限）。所以默认保守，并提供
`animMixedPolicy: 'keep' | 'majority'`（`majority` = 按多数帧近似，面板如实标注
"不支持逐帧切换"）。**不假装能做到**。

### D-5 动图结论**可复议一次**

动图源在 `animRecheckMs`（默认 30s）后允许重解一次（有界，只一次）。
理由：动图是唯一"同一 src 在不同时刻答案可能不同"的媒体，判死它必然错。

### D-6 能力检测与降级

`ImageDecoder` 不可用 → **静默降级**为现有单帧静态判定，记 `animDecoderUnavailable` 计数，
面板显示一行说明。所有 `ImageDecoder` 代码包在能力检测内，缺失时零副作用。

## 4. 契约

| 契约 | 形状 | 消费方 |
| :--- | :--- | :--- |
| `HILStateMachine.detectSequenced(video)` | 与 `detect` 同形 + `seq` 诊断字段 | 单测 / 面板诊断 |
| `frameSequenceDecision(win, opts)` | **纯函数** → `{ whiteFlash, earlySwitch, avg, delta }` | 单测（核心可测性在此） |
| `animatedProbe(el)` | 廉价闸门判定 | 单测 |
| `animatedSpectrum(frames)` | **纯函数** → `{ frames, whiteFrames, ratio, verdict }` | 单测 |
| `reason` 新码 | `animated-light` / `animated-dark` / `animated-mixed` | v5-2 的 `REASON_ZH` / v5-3 的分布聚合 |

## 5. 回滚

1. `frameSequence=false` → 视频回到 v5-3 单帧判；`animatedDetect=false` → 图片回到静态判定。
2. 代码级：单提交 revert。
3. `animated-*` reason 码在旧版本会被当作未知 code 显示原文（不崩）。
