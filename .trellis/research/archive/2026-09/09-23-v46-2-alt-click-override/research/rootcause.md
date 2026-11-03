# v4.6-2 根因报告：Alt+点击需多次点击才生效

> 证据源：`research/repro-altclick.md`（复现脚本 `dev/repro-altclick.js`，全部断言可重跑）。
> 结论先行：**主因不是单一竞态，而是"写点不收口"的三处独立覆盖 + 一处级联必输**；
> H1（fx 回调回写）与 H8（canvas 首扫回写）是用户可稳定感知的两条主路径。

## 一、"第 N 次点击为何生效"的时序解释（核心交付）

### 时线 1：fx 模式图片（imgFxMode ≠ full）——永不生效型

```
t0  decideImage 落定 'invert' → finalizeInvert → wantsFx=true
    └ removeAttribute('data-svi-inverted')     ← CSS 滤镜标记被摘（fx 与滤镜互斥）
    └ fx.enqueue(el, src, wantInvert=true)     ← 投递排队（≤2 并发）

t1  解码完成 → applyTo(el, fxId, blob, key)     ← 【覆盖点 #1，H1】
    └ removeAttribute('data-svi-inverted')     ← 无条件擦
    └ removeAttribute('data-svi-fx-off')       ← 无条件擦（杀停结论在此被毁）
    └ setAttribute('data-svi-fx', fxId)        ← content:url 规则接管渲染

t2  用户 Alt+点击（期望还原原图）
    ├ 若 data-svi-fx 在 → 杀停分支：setAttribute('data-svi-fx-off','true') 后 return
    │   ├ 视觉：CSS 兜底 img[data-svi-fx][data-svi-fx-off]{content:normal} 与
    │   │        #svi-fx-style 内 img[data-svi-fx="fxN"]{content:url(blob)!important}
    │   │        同特异性同优先级 → 后建节点胜 → 兜底必输【覆盖点 #2，H4 变体】→ 画面不变
    │   └ 结论：不记 manualOverrides、不刷决策快照 → 任何后续 pass 都会把状态拉回
    └ 若 data-svi-fx 已被 t1 擦掉（在途竞态）→ else 分支按 data-svi-inverted 反转
        └ t1 的 applyTo 随后到达 → 一切又被擦掉【同覆盖点 #1】

t3+ 用户连点 N 次：杀停分支在 fx-off true/false 间翻转，每次视觉均无变化
    （content:url 规则始终命中）→ 与用户"点好几下也不行"完全吻合。
```

**为何"偶尔"像生效**：仅当点击落在（a）`data-svi-fx` 尚未写入且（b）之后没有任何
applyTo 到达的窗口时，`data-svi-inverted` 才短暂存活——队列空闲时窗口足够长，看起来生效；
队列繁忙（多图同屏）时窗口被回调覆盖。翻转为 CSS 滤镜（full 模式）后点击恒生效，
与 fx 模式的"永不生效"形成对照。

### 时线 2：canvas——固定两连点型

```
t0  canvas 尚未判定（sweep 预算 100/次， tick 5s；首扫可能落在用户点击之后）
t1  用户 Alt+点击 → setAttribute('data-svi-inverted','true')（同帧生效）
t2  首个 processCanvas：checked.has(c)=false → 不早退 → 像素分析
    └ isLight=false → removeAttribute('data-svi-inverted') 【覆盖点 #3，H8】
t3  用户第二次点击 → 此时 checked 已含 c → 首行早退 → 手动结论存活
```

深色 canvas（图表/面板常态）"第一次必然被拉回、第二次起生效" = 用户体感的固定两连点。

### 时线 3：同 src 多元素（H3，部分成立）

手动覆盖与决策快照都是 src 级，但点击只改被点元素的渲染属性；同 src 兄弟元素
（`data-svi-checked-src` 早退，本会话不再重判）保持旧状态。用户在"同图重复出现"的页面
（头像/图标流）点击另一元素时读到旧状态，误以为"没生效"，继续连点。

## 二、假设逐条裁决（design.md §2）

| # | 假设 | 裁决 | 证据 |
|---|---|---|---|
| H1 | ImageFxEngine 异步投递回调重写属性，覆盖手动结论 | **成立（主因 #1）** | 复现场景 A：`afterCb.fxOff=false`（点击写入的杀停在 30ms 后被 applyTo 擦除）；applyTo 无条件 removeAttribute×2 + setAttribute×1 |
| H2 | recordDecision 快照键与查询键不一致（host\|src vs src） | **不成立** | 复现场景 D：非 force 决策正确返回手动快照；override 键 `manualOverrideKey(profileKey(), src)` 与快照键 `src` 各自独立且同源 `getMediaSrc`，decideImage 第 1 步按 override 键查询命中 |
| H3 | 同 src 多元素只改被点元素 | **部分成立（误导源）** | 代码证明：兄弟元素 `data-svi-checked-src` 早退 + 快照 applyDecision 只发生在"进入管线时"；点击不同步兄弟渲染属性。修复：点击同帧联动同 src 元素 |
| H4 | 属性写入但 CSS 门未命中 | **变体成立（主因 #2）** | 复现场景 B：fx 投递规则不排除 fx-off 态，且写在后建样式节点 → 兜底必输。html 门类（`svi-img-invert-on`）路径本身正确（updateImageFilterCss 正常管理） |
| H5 | 点击事件被站点捕获/取消 | **不成立** | `bindManualToggle` 为 document 捕获阶段监听，先于全部冒泡与多数站点捕获处理器；toggle 内部 `stopPropagation` 后自持。用户症状为"必现多次"而非"偶发失效"，与事件竞争特征不符 |
| H6 | `data-svi-checked-src` 早退导致改写后未触发 apply | **不成立** | 早退只影响"未点击元素"的重判；被点元素由 toggle 直接写属性，不依赖重判；快照已 force 刷新（场景 D 对照） |
| H7 | ruleLearner 学习结果把状态拉回 | **不成立** | `ruleLearner.record` 仅累积词干命中（≥learnHits 才在 decideFor 生效），decideFor 只服务于未决元素；手动后 decideImage 早退或走第 1 步手动覆盖，学习层无写回路径 |
| H8 | （新增，勘查发现）canvas 首扫覆盖手动结论 | **成立（主因 #3）** | 复现场景 C：`afterClick=true → afterScan=false`；`processCanvas` 以 WeakSet 单次判定，首扫晚于点击时必然按像素改写 |
| H9 | （新增，勘查发现）fx 态读向错误 | **成立（复合入 H1）** | applyTo 摘掉 `data-svi-inverted` 后，"视觉已反色"但属性为 false → 点击读旧向，toggle 方向与视觉意图相反；杀停分支又不落结论，形成死循环 |

## 三、修复设计对照（design.md C1–C5）

| 契约 | 落点 |
|---|---|
| C1 同帧可见 | `toggleMediaOverride` 全分支同步完成属性写入：fx 杀停同帧摘 `data-svi-fx`（经 `fx.clearFor`），不依赖 CSS 级联 |
| C2 幂等占优 | 单一收口 `applyInvertState(el, want, reason)`：非 manual 来源写 `data-svi-inverted` 前先解析手动结论（元素标记 `data-svi-manual` > `host\|src` 记忆）；fx 回调 `applyTo` 入口先查杀停/手动，命中即放弃投递 |
| C3 单点收口 | 全部 `data-svi-inverted` 决策写点（finalizeInvert/processSvg/canvas 首扫/recheck）改经 `applyInvertState`；机械操作（strip/重扫清属性）除外 |
| C4 双写一致 | 点击路径同帧写齐：属性 + `data-svi-manual` 标记 + manualOverrides + force 决策快照；同 src 兄弟同帧联动 |
| C5 全谱覆盖 | img/svg/image/input-image/canvas/video 走 `applyInvertState`；背景图元素走 `data-svi-bginv` 分支（写点同样先查手动标记）；Shadow DOM 内元素由 composedPath/注册表解析后走同一门 |

回归护栏：`test.js` 新增 5 组断言（T1 fx 回调不覆盖杀停、T2 投递规则排除 fx-off、
T3 canvas 首扫尊重手动标记、T4 同 src 兄弟联动、T5 applyInvertState 手动占优——
含 host|src 记忆与元素标记两路），修复前 3 项必红，修复后全绿。
