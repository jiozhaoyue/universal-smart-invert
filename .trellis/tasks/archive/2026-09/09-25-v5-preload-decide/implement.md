# Implement: v5-4 提前判定

> 复选框随执行实时勾选。GATE 步必须全绿才继续。

## 前置

- [x] **P0** 基线四绿（v5-3 收尾态，HEAD = `518ceed`）
- [x] **P0** 读 `design.md`，尤其 **D-1（只加两个门，不改默认路径）** 与
      **D-4（混合型默认不反，且如实标注做不到逐帧切换）**
- [x] **P0** 定位 `HILStateMachine.onFrame` / `tick` / `applySceneResult`、
      `LuminanceDetector.detect`、`ImageInvertEngine.decideImage` 的接线点

---

## 阶段 A — 视频帧序列（只加门）

- [x] **A1** 纯函数 `frameSequenceDecision(win, opts)` → `{ whiteFlash, earlySwitch, avg, delta }`
      （这是本阶段的核心可测性所在，先把纯逻辑做对）
- [x] **A2** `HILStateMachine._seqPush`（窗口 ≤8，只存数值）+ `detectSequenced(video)`
- [x] **A3** `onFrame` 改用 `detectSequenced`，并在 `whiteFlash` 时**改判 normal**
- [x] **A4** `earlySwitch` 时**提前判白**（不额外采样，复用同一次 detect）
- [x] **A5** `tick`（250ms 兜底路径）同步接线 —— 两条路径必须给出同一结论
      （否则 rVFC/轮询互斥切换时会出现结果抖动）
- [x] **A6** 单测：窗口未满 / 跳出 / 连续跃变 / 白闪三帧形态 / `whiteFlash` 与 `earlySwitch`
      的边界（含 sceneDelta 恰好相等）
- [x] **A7** bench Scenario 28a：白→暗切换的切换点相对基线**不晚于**基线（提前或持平）；
      稳态结论集合不变
      → **与原文不符，如实标注**：没有做"帧级切换点测量"。bench 无法逐帧注入合成视频帧序列
        并精确测出切换发生的时间戳（rVFC 时序不可控），硬做出来的数字不可信。
        改为断言**两个门的语义与默认路径不变**（跃变优先于白闪 / 白闪被压 / 稳定态两门皆不触发 /
        `detectSequenced` 存在且默认开）。**"提前 ≥1 帧"这个 AC 由单测的容忍带用例间接覆盖**
        （`[0.1,0.1,0.55]` 判 earlySwitch 而单帧判不会），不是由 bench 覆盖。
        这是范围上的诚实收缩，不是遗漏。
- [x] **A8** 四绿 GATE　**回滚点 R1**

---

## 阶段 B — 动图闸门与全帧谱

- [x] **B1** `animatedProbe(el)` 廉价闸门：后缀/类型门 + 多时刻采样门（间隔 400ms）
- [x] **B2** 纯函数 `animatedSpectrum(frames)` → `{ frames, whiteFrames, ratio, verdict }`
      （三分类 · 阈值为参数，便于单测）
- [x] **B3** `ImageInvertEngine.analyzeAnimated(src)`：能力检测 + `ImageDecoder` 全帧谱
      + `stride` 分帧采样 + `frameSampleCap` / `animDecodeBudgetMs` 双预算
- [x] **B4** 接入 `decideImage`：闸门命中且开关开 → 用谱结论出决策（reason `animated-*`）
- [x] **B5** 结论可复议一次（`animRecheckMs` 默认 30s，有界）
- [x] **B6** `ImageDecoder` 缺失 → 静默降级 + `animDecoderUnavailable` 计数 + 面板一行说明
- [x] **B7** `animMixedPolicy`（`keep` 默认 / `majority`），面板如实标注"不支持逐帧切换"
- [x] **B8** `REASON_ZH` 补 `animated-light` / `animated-dark` / `animated-mixed`
- [x] **B9** 单测：闸门判定 / 谱三分类边界（0.9 恰好相等）/ `stride` 采样 / 预算超限
      / 无 `ImageDecoder` 时不抛错且行为 == v5-3
- [x] **B10** bench Scenario 28b：静态图不进重路径 / 模拟无 `ImageDecoder` 不报错
- [x] **B11** 四绿 GATE　**回滚点 R2**

---

## 阶段 C — 开关与文档

- [x] **C1** 开关（`frameSequence` / `frameWindow` / `sceneDelta` / `flashWhiteSkip` /
      `animatedDetect` / `animMixedPolicy` / `frameSampleCap` / `animAllLightRatio`）
      + `loadState` 规范化
- [x] **C2** 面板：「🎬 视频」区块加帧序列行；「🖼️ 图片反色」区块加动图行（含降级说明）
- [x] **C3** README / README_EN：帧序列提前判定 + 动图说明 + `reason` 码表 +
      **明确写出"混合型动图不支持逐帧切换"**
- [x] **C4** spec 新增「提前判定契约」小节（纯函数分离、双路径一致、预算、能力降级）
- [x] **C5** 四绿 + `check-panel-overflow.js` GATE

## 最终验证

- [x] 四绿门禁 + 面板溢出 + PRD AC 逐条勾选 + 偏离留痕（见下）

---

## 与计划的偏离（执行中作出的判断，逐条留痕）

### 1. ⚠ **两个门的优先级搞错过一次**：明确跃变必须压过白闪门

- **初版**：先判 `whiteFlash`（`窗口白帧占比 < flashRatio` 且当前帧判白），后判 `earlySwitch`。
- **实测问题**：`[0.1, 0.1, 0.9]` 这类**真实的暗→白场景切换**，与转场白闪在窗口形态上**完全相同**
  （都是"前面不白、当前帧白"），于是白闪门把**正确**的切换压掉了 —— 白闪门反而变成了回归。
- **修正**：改为 `earlySwitch` **先判**，且白闪门只压**证据薄弱**的白帧
  （刚过阈值、落在容忍带内、窗口内只有它是白的、且**未发生明确跃变**）。
  区分依据从"白帧占比"换成"**跃变幅度**" —— 这才能在只看当前帧时把两者分开。
- 这条由单测直接钉住（`jumpFlash === false`）。

### 2. 单测用例也写错过一次（记录以备后鉴）

初版用 `[0.1, 0.1, 0.62]` 做"孤立白闪"用例，但它的跃变是 0.52 ≥ `sceneDelta` 0.35 →
按修正后的语义正确地判为 `earlySwitch`，而不是 `whiteFlash`。换成 `[0.3, 0.45, 0.62]`
（跃变 0.17 < 0.35）才是真正的"证据薄弱"。**是测试用例没跟上语义，不是产品错。**

### 3. 动图闸门保持**纯函数**（采样由调用方传）

`animatedProbe(el, {sampleA, sampleB})` —— 多时刻采样的动作留给调用方，本函数只做判断。
理由：这样闸门逻辑可在 Node 桩里完整单测（不需要真实解码器与 DOM 计时）。

### 4. 分帧采样用**等间隔抽帧**，不是"只解前 N 帧"

`animatedStride()` + `for (i = 0; i < count; i += stride)`。若只解前 N 帧，会**系统性偏向
"开头是白底"的动图** —— 而 GIF 的场景切换往往在后段。单测钉住"抽帧必须覆盖到后段"。

### 5. 动图结论**允许有界复议一次**（PRD 未要求，但必要）

动图是唯一"同一 src 在不同时刻答案可能不同"的媒体，判死必然错。`animRecheckMs`（默认 30s）
到期后允许重解一次；不是无界重算（有 `animDecisions` Map 记录）。

### 6. bench 断言修正两处（都是测试侧问题，非产品缺陷）

- **Scenario 18 的硬编码滑块数**：v3.3 的 `sliders === 9` 在本片加两行后假失败。
  改为「下界 `>= 9` + 5 个画面调节行标签都在 DOM 里」—— 更贴近断言本意（滑块没被折叠抽屉藏起来）。
- **Scenario 28 的计数断言依赖了被前序场景关掉的开关**：`StatsManager.count()` 在
  `state.statsEnabled === false` 时是 no-op，而前序场景会关掉统计。已在场景内显式打开并还原。
  另：判"可见"不能用 `offsetParent`（`position: fixed` 容器内恒为 null）。

### 7. 范围裁决 D2 被严格遵守

**未实现**带外预解码（Range 预取 + WebCodecs 解 keyframe）与 MSE 分片钩子 —— PRD 已裁决排除。
`grep` 可证：代码中无 `MediaSource` / `addSourceBuffer` / Range 预取逻辑。
