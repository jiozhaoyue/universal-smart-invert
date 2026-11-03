# v4.6-2 修复 Alt+点击手动反色需多次点击才生效

## Goal

Alt+左键需点多次才能改变某图片的反色状态; 需定位被异步特效投递/重扫回写覆盖的竞态并保证一次点击即生效且持久。

## Requirements

### 用户原话

> 「每次必须 alt 左键点好几下才能更改反色情况，真他妈的傻逼」

### 现状证据（本次会话静态勘查，供实施者复核而非直接采信）

- 入口：`bindManualToggle()`（约 L4998）→ 捕获阶段 `click`，`e.altKey && runtime.siteActive !== false`
  → `resolveMediaFromEvent(e)` → `toggleMediaOverride(target)`（约 L4958）。
- 切换语义：读 `target.getAttribute('data-svi-inverted') === 'true'` 决定写/删该属性；
  若元素带 `data-svi-fx` 则改走 `data-svi-fx-off` kill switch 分支。
- 随后 `addManualOverride(state.manualOverrides, ...)` + `savePrefs()` +
  `this.recordDecision(src, 'keep'|'invert', 'manual', true)`。
- **首要嫌疑（假设，须验证）**：`finalizeInvert` / `ImageFxEngine.enqueue` 是**异步**投递
  （队列 ≤2 并发 → `content:url(blob)`），点击写入的手动状态可能在异步回调/后续 rescan 中被
  重新决策覆盖，于是用户看到"点了没反应"，连点几次恰好赶上某次时序才生效。
- 次嫌疑：同一 `src` 的多个元素共享决策快照，手动覆盖只落在被点元素；`decide-once`
  的 `data-svi-checked-src` 早退使后续元素不重判。

### 需求

- **R1 一次生效**：单次 Alt+左键必须立刻（同帧可见）改变该元素反色状态，不需要第二次点击。
- **R2 稳定保持**：手动状态写入后，**任何**后续异步投递、rescan、MutationObserver flush、
  eager pass、特效队列回调都不得覆盖它；手动覆盖优先级恒为最高。
- **R3 全覆盖目标**：`img` / `svg` / `image` / `input[type=image]` / `canvas` / `video` /
  背景图元素（`data-svi-bginv`）以及 Shadow DOM 内媒体，Alt+点击均一次生效。
- **R4 持久**：重载后保持（同一 `host|src` 记忆），再次 Alt+点击可恢复。
- **R5 特效 kill switch 一致**：`data-svi-fx-off` 分支同样一次生效、不反复。
- **R6 无副作用**：不得因此破坏 decide-once 不变量；不得让 `<img>` 反复重排/闪烁。

## Acceptance Criteria

- [x] 真机探针闭环：Alt+点击 → 断言同帧状态翻转 → 重载 → 保持 → 再点击恢复（`overrideKeys=1`、`reason=manual`）
  - bench 真 Chrome 场景 2b 完整闭环（点击→同帧断言→重载→决策记忆保持→overrides=1）；
    真站探针 `dev/probe-altclick-real.js` 因环境网络受限未跑（见 implement.md 第 4 步标注），
    以 Node 真实引擎探针 `dev/repro-altclick.js` 4/4 PASS 替代
- [x] 单测/bench 断言：模拟异步投递回调后手动状态**未被覆盖**（回归护栏，防再次退化）
  - test.js T1 核心护栏（在途 fx 回调不得回写杀停态）+ bench Scenario 4（off1/content1/off2 三断言）
- [x] 至少覆盖 3 类目标（普通 img、背景图元素、特效投递中的 img）
  - 普通 img（T4 同 src 联动 + 2b）、fx img（T1/T2 + Scenario 4/15b）、
    canvas（T3 + 探针 C）、背景图元素（bginv 分支 + Scenario 10）
- [x] 覆盖至少 1 个真实站点（如 Wikipedia UML 图 / GitHub README 图）与 1 个本地 fixture
  - **部分达成**：本地 fixture 全覆盖；真站未跑（网络受限），与 implement.md 第 4 步同一标注
- [x] 根因报告：明确写出"第几次点击之所以生效"的时序解释，不能只写"修好了"
  - `research/rootcause.md` §一（fx 型"永不生效"/canvas 型"固定两连点"两条时线）
- [x] 四绿门禁全绿
  - check=0 / test=0 / bench=0（24+ 场景）/ build=0 & pack=0

## Notes

- 复现优先：先用 `dev/probe-altclick-real.js`（已存在）与真实站点确认现象与次数。
- 设计约束：手动覆盖必须成为决策管线的**最高优先级且幂等**输入；实现方式须与
  `decideImage` 的优先级序列（手动 > 元素规则 > 快照 > 学习 > 种子 > 门 > 像素）一致。
- 若根因是「异步投递覆盖」，修复须落在投递回调的**入口门控**而非在 UI 层打补丁。
