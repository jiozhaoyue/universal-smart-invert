# PRD: v5-4 提前判定 — 视频帧序列提前切换 + 动图全帧谱

## 背景（现状核查结论）

**视频**：`HILStateMachine.startFrameLoop()` 已用 `requestVideoFrameCallback` 逐帧检测
（`onFrame`），250ms 轮询作互斥兜底。但 `onFrame` 是**单帧判**：一帧 `whiteRatio` 超阈
立即切换。

两个已知缺陷：
1. **切换滞后于场景**：rVFC 回调在帧呈现前触发，但单帧证据要等帧真的变白才成立 ——
   实际感知仍是「画面先白一下，再变暗」。
2. **转场白闪误报**：视频转场常有一两帧接近纯白（闪光/白场过渡），单帧判会误触发反色。

**动图**：`ImageInvertEngine` 对 `<img>` 走 `analyzeSrc` → 像素采样 → `recordDecision`
**一次判死**（`decisionBySrc` 冻结）。GIF / 动画 WebP 若首帧是白底、后续换景为暗色，
会被永久错误反色，且没有任何机制复议（`queueRecheck` 只复议「像素反色」且在 6s 后一次）。

## Requirements

### R1 — 帧序列判定（视频）
- `onFrame` 由单帧判升级为**滑动窗序列判**：维护最近 `frameWindow`（默认 3）帧的
  `{ whiteRatio, avgSaturation, at }`。
- **变化率识别场景边界**：当相邻帧 `whiteRatio` 跃变超过 `sceneDelta`（默认 0.35）时，
  判定为场景边界；边界帧用**该帧自身 + 相邻 1 帧**共同定夺，边界**前**一帧即写入结论。
- **提前切换**：结论在 rVFC 回调内同步写入（作用于下一合成帧），不再等「已经白了一帧」。
- 保留现有退出迟滞缓冲（`normalSceneCount`）与手动否决（`runtime.userRejectedScene`）语义。
- **AC**: 单测滑动窗与边界识别纯函数（含窗未满、跃变两侧、连续跃变）；
  bench 断言「白→暗」场景切换的切换点相对 v4.6.1 **提前 ≥1 帧**，且稳态结论不变。

### R2 — 转场白闪门（视频）
- 单帧白但**前后帧均不白**（窗内白占比 < `flashWindowRatio`，默认 0.5）→ 判为转场闪光，
  **不切换**，计数器 `flashWhiteSkips`。
- 与 v4.3 防闪光守卫（`flashGuard`，管的是文档背景）职责区分并在文档里写明。
- **AC**: 单测三帧「白-白-白」（切换）/「暗-白-暗」（不切换）；bench 用合成转场页断言无切换。

### R3 — 动图探测（廉价闸门）
- 在动图重路径之前先做**廉价探测**，只对疑似动图付成本：
  - 后缀/类型门：`src` 命中 `\.gif(\?|$)|\.webp(\?|$)|\.apng|\.avif`，或响应 MIME 为动图类型；
  - 像素门：同一元素在两个时刻（`t`、`t + 400ms`）各采样一次，`whiteRatio` 或若干像素值
    差异超阈 → 判为动图。
- 探测结果缓存（`data-svi-anim`），元素级，不重复探测。
- **AC**: 单测探测判定；bench 合成一张会切换的 GIF 与一张静态图，断言只有前者进重路径。

### R4 — 动图全帧谱（`ImageDecoder`）
- 命中 R3 后：取图字节（同源直接 / 跨域走现有 `gmFetchBlob` 通道）→
  `new ImageDecoder({ data, type })` → `decoder.tracks[0].frameCount` → 逐帧
  `decode({ frameIndex })` → `VideoFrame` → 16×16 采样 → 每帧 `whiteRatio`。
- **只解到 `frameSampleCap`（默认 60）帧或 `animDecodeBudgetMs`（默认 40ms）为止**，
  超预算即用已解帧出结论（分帧采样：`stride = ceil(frameCount / cap)`）。
- **AC**: 单测谱分析纯函数（三分类）；bench 断言同一 GIF 的谱结论稳定（两次运行一致）。

### R5 — 动图三分类决策
- 依据全帧谱：
  | 分类 | 条件 | 动作 |
  | :--- | :--- | :--- |
  | 全浅 | 白帧占比 ≥ `animAllLightRatio`（默认 0.9） | `invert`，`reason:'animated-light'` |
  | 全深 | 白帧占比 ≤ `1 - animAllLightRatio` | `keep`，`reason:'animated-dark'` |
  | 混合 | 其余 | **默认保守 `keep`**，`reason:'animated-mixed'` |
- 混合型可选 `animMixedPolicy: 'keep'(默认) | 'majority'`：`majority` 时按占比多数决定
  （明确标注「逐帧切换不支持，是按多数帧近似」）。
- 结论写入 `decisionBySrc`（`reason` 前缀 `animated-*`），并**标记为可复议**：动图源在
  `animRecheckMs`（默认 30s）后允许重解一次（因为有界，只一次）。
- `ImageDecoder` 不可用 → **静默降级**为现有单帧静态判定，记 `animDecoderUnavailable` 计数，
  面板显示一行说明。
- **AC**: 单测三分类边界与 `stride` 采样；bench 断言三类 GIF 各自结论正确；
  无 `ImageDecoder` 环境（可用 flag 模拟）下不报错、行为 == v4.6.1。

### R6 — 开关
- `frameSequence`（默认**开**）、`frameWindow`、`sceneDelta`、`flashWhiteSkip`（默认开）、
  `animatedDetect`（默认**开**）、`animMixedPolicy`（默认 `keep`）、`frameSampleCap`、
  `animReplayRate`（是否放宽 `playbackRate` 采样，默认关）。

## Constraints

- **不做**带外预解码（Range + WebCodecs）与 MSE 分片钩子（用户 D2 裁决）。
- 视频新增逻辑**不得进入 250ms 轮询路径**（rVFC 不可用时仍退回旧语义）。
- 动图解帧必须走空闲调度（`requestIdle`），不得阻塞首屏。
- `ImageDecoder` 相关代码必须完全包在能力检测内，缺失时零副作用。

## Acceptance Criteria（汇总）

- [ ] 帧序列窗口 + 场景边界识别单测全绿
- [ ] bench 断言切换点相对 v4.6.1 提前 ≥1 帧；稳态结论集合不变
- [ ] 转场白闪不再触发切换（合成转场页验收）
- [ ] 动图探测 → 全帧谱 → 三分类链路落地，三类 GIF 结论正确
- [ ] `ImageDecoder` 缺失时行为 == v4.6.1（模拟验收）
- [ ] 预算（帧数上限 / 解码毫秒上限）在超限时被兑现
- [ ] 四绿门禁全绿
- [ ] 文档：README / README_EN 补提前判定与动图说明（含 `reason` 码表）

## Notes

- 依赖 v5-1 的 `resolveAction` 原因码通道（`animated-*` 需进入决策来源展示）。
- `reason:'animated-*'` 需同步加入 v5-2 的原因码中文映射与 v5-3 的分布聚合。
