# Implement: v6-3 纠正与自校准数据回路

> 复选框**随执行实时勾选**（全局规则 §4.5）。每阶段末尾给「验证」与「回滚点」。
> 四绿门禁在阶段 6 统一跑。上游：v6-1 掩码契约（冻结）、v6-2 渲染层（已归档）。

## 前置

- [x] 依赖确认：v6-1 掩码契约冻结并归档；v6-2 渲染层落地并归档
- [x] 定位确认：**不做绘制型交互**（D1）；本片是数据采集通道，不是功能入口
- [x] 开关确认：`regionCorrect` / `regionCalibrate` 默认 `false`（全关时与 v5.0.0 一致）

---

## 阶段 0 — 骨架、开关、存储键 ✅ 完成

- [x] section 20.6 `RegionCorrection`：`enter` / `exit` / `active` / `diagnostics` 空壳
- [x] 偏好：`regionCorrect`（false）/ `regionCalibrate`（false）/ `regionCalibrateMinSamples`（5）/
      `regionCalibrateStep`（0.005）
- [x] `Store` 键 `svi:regionCorrections`（`{v:1, samples:[], calibration:{}}`）+ 读取规范化
      （损坏/超限时的降级读取，绝不因坏数据崩）
- [x] 计数键进 `freshCounters()`：`regionCorrections` / `regionCorrectionFlips` /
      `regionCalibrations` / `regionCalibrateRollbacks`
- [x] 单测：开关钳制；关闭时 `enter()` 纯短路；坏存储数据的降级读取

**验证**：`node --check`；`node test.js`。
**回滚点**：只新增骨架与偏好，`git revert` 即净。

---

## 阶段 1 — 差分构造（纯函数，R2 / D2）✅ 完成

- [x] `regionDiffFromFlip(ours, n, cellIndex)`：由「我们算出的网格」+ 点击格号 → 翻转整个连通域 →
      返回 `{ corrected, diff, changed }`
- [x] `regionDiffStats(ours, corrected)`：`toInvert` / `toKeep` / `unchanged` 计数
- [x] `regionDiffSummary(ours, corrected)`：样本记录构造（位串 + host/stem/dims）
- [x] 单测：无差分（点后翻回原位）→ `changed === false`；全翻转；部分翻转；
      连通域整体翻转（点一个格 → 该连通域全变）；越界格号安全返回

**验证**：`node test.js`。
**回滚点**：纯函数，独立 revert。

---

## 阶段 2 — 纠正模式与可视化（R1 / D5）✅ 完成

- [x] `enter(el)`：对该元素的区域层叠加可视化（半透明着色 + 区域轮廓 + 图例），
      可视化层与覆盖层同级、`pointer-events: auto`、只在模式内存在
- [x] 点击命中：点坐标 → 元素盒网格格号 → 连通域 → 翻转 → 重挂该元素覆盖层（复用 v6-2 路径）
- [x] `exit()`：撤掉可视化层，**保留纠正后的渲染**
- [x] **唯一手势是 click**（不注册 mousedown/mousemove 采样）
- [x] 单测：命中换算（点击点 → 格号）纯函数；`active` 状态机；关闭开关时零节点

**验证**：`node test.js`；`node test-browser.js`（阶段 6 加场景）。
**回滚点**：`regionCorrect=false` 时不进入该路径。

---

## 阶段 3 — 样本持久化与泛化键（R4）✅ 完成

- [x] 样本落 `Store`（上限 200，FIFO 淘汰；单样本 ≤2KB）
- [x] 键 = `host + selectorStem`（复用 `profileKey()` / `selectorStem()`）；命中则加载并应用
- [x] 未命中 → 仅本次会话生效（如实标注的已知局限）
- [x] 面板数据源：`listSamples()` / `clearSamples()`（面板 UI 区块属 v6-4，本片给数据）
- [x] 规则包往返：把 `regionCorrections` 加进既有导出/导入白名单（**不写第二套 IO**）
- [x] 单测：写入/读取/淘汰/清空；键命中与未命中；导出→导入幂等（array merge 去重）

**验证**：`node test.js`。
**回滚点**：同上。

---

## 阶段 4 — 自校准（R3 / D4）✅ 完成

- [x] `regionCalibrationAdvice(samples, opts)`（纯函数）：累积门 → 方向一致性（≥2/3）→
      幅度上限 → 钳制；返回 `{ apply: bool, direction, step, reason }`
- [x] `applyCalibration()`：只在 `regionCalibrate` 开启时写 `state.regionMinAreaRatio`，
      记录 `{at, from, to, samples, direction}`
- [x] `rollbackCalibration()`：回到 `REGION_DEFAULTS.minAreaRatio`
- [x] **只动分割参数**：绝不触碰整图判定阈值（单测断言其它阈值未被改写）
- [x] 单测：累积门边界（4 个样本不动 / 5 个才评估）；方向不一致（50% vs 67%）；
      幅度上限；钳制边界；回滚；关闭开关后不再改动

**验证**：`node test.js`。
**回滚点**：同上。

---

## 阶段 5 — 开关、诊断、零遥测核对（R5 / R6 / R7）✅ 完成

- [x] 诊断：累积样本数 / 最近一次校准（时间 + from→to + 样本数）/ 回滚入口数据
- [x] **零施压**：不出现「建议纠正」类文案、不加徽标/计数（grep 核查）
- [x] **零遥测**：`diff` 出口行比对为空（无新增 `fetch` / `GM_xmlhttpRequest` / `sendBeacon`）
- [x] 单测：各开关生效；关闭后零行为；文案白名单核查

**验证**：`node test.js`。
**回滚点**：同上。

---

## 阶段 6 — 浏览器 bench、四绿、文档、沉淀 ✅ 完成

- [x] `test-browser.js` 新增 Scenario 31：
      - [x] 纠正模式：可视化层出现、图例可见、覆盖层仍在
      - [x] **一次点击**翻转区域 → 该区域渲染改变（像素采样）+ 差分样本入库
      - [x] 退出模式 → 可视化层消失、纠正后的渲染保留
      - [x] 关闭开关 → 全清
      - [x] `grep` 核查无绘制手势（bench 侧断言无 mousemove 监听）
- [x] `AGENTS.md` / `README.md` / `README_EN.md`：纠正与自校准章节（含"可选、无施压"与已知局限）
- [x] spec 沉淀：`region-mask-contract.md` 补「差分样本」小节（形状 + 键 + 上限）
- [x] 提交（中文 message + `Co-Authored-By`）

**验证**：四绿全绿。
**回滚点**：整片 revert 无数据迁移（样本是本地数据，清空即可）。

---

## 评审门（review gates）

| 门 | 时机 | 判据 |
| :--- | :--- | :--- |
| **G1** | 阶段 1 后 | 差分纯函数：无差分/全翻转/部分翻转/连通域整体翻转四类断言全绿 |
| G2 | 阶段 4 后 | 自校准四护栏（累积门 / 方向一致性 / 幅度上限 / 钳制）+ 回滚全绿 |
| G3 | 阶段 6 | 四绿 + 点击翻转的像素级断言 + 零绘制手势核查 |

## 与计划的偏离记录

> 格式：`偏离 N — 原计划 / 实际 / 原因`。前三条都是**真机 bench 抓到的**（单测抓不到：
> 它们依赖真实事件序列与异步时序）。
**偏离 1（阶段 2）— 连通域必须在「自动结果」上取，纠正用「翻转集」表达。**

原设计：点击 → 在当前纠正后的网格上取连通域 → 整体取反，产出「纠正后的整份网格」。
**实测证伪**：第一次翻转后，被抠出的块与背景合并成同一个连通域，再点一下就会**翻转整张图**；
`changed=false`（翻回原位）这条语义也因此永远走不到。
实际：连通域在 **`builtAuto`（未经纠正的自动结果）** 上取，纠正状态用 **翻转集 `flips`** 表达：

```
corrected = ours XOR flips      diff = flips
```
于是「再点同一区域」= 翻转集归零 = 真正的翻回原位 ✓，而且翻转集是**意图**而非形状 ——
参数变了、网格重算了，纠正意图照样能叠加（持久化样本也按 `ours XOR corrected` 还原成翻转集）。

**偏离 2（阶段 2）— 可视化层的重画必须等 `recalc` 落地。**

`RegionRenderEngine.recalc` 是**异步的**（要重新采样一帧）。原实现在调用后立刻重画可视化层，
实测表现为「翻完了，但格子上还是旧颜色」（着色滞后一版）。
实际：`Promise.resolve(recalc(...)).then(() => this.enter(el))` 等它落地再重画。

**偏离 3（阶段 3）— 翻回原位必须删除该键的持久样本。**

只清内存台账不够：下一次挂载会从持久样本里把纠正**"粘"回来**（实测踩到）。
实际：翻回原位时按键删除样本（`regionCorrectionStore.remove`）—— 那本来就是一次噪声样本，
留着既会让撤销失效，也会污染自校准。

**偏离 4（阶段 4）— 自校准只动 `regionMinAreaRatio` 一个参数。**

PRD R3 说「调整分割参数」（复数）。实际只动**最小连通域面积门**一个：
它是「抠多大才算一个区域」的唯一旋钮，纠正数据能直接告诉它方向；网格 N / K / 核大小需要更细的
信号，用粗糙的差分去调它们会带来"用噪声动敏感参数"的风险。这条已写进 design D4，
其余参数的校准留给将来有更细信号时再开。

