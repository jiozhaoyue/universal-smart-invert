# Implement: v5-3 数据闭环

> 复选框随执行实时勾选。GATE 步必须全绿才继续。

## 前置

- [x] **P0** 基线四绿（v5-2 收尾态，HEAD = `0604e5c`）
- [x] **P0** 读 `design.md` 的 6 条决策，尤其 **D-1（PRD 的"(现状语义)"注释是错的）**
      与 **D-3（只自动收紧）** —— 这两处是对 PRD 的实质修正
- [x] **P0** 定位 `RuleLearner.activeRules/decideFor`、`resolveSiteProfile`、
      `mergeRulePack` 相关导入路径、`StatsManager.exportJson`

---

## 阶段 A — hits 分级与负反馈

- [x] **A1** `RuleLearner.ruleStrength(rule)` → `'weak'|'strong'|'disabled'`
      （`disabled` = 被降级禁用；`strong` 阈值 `learnStrongHits` 默认 5）
- [x] **A2** `RuleLearner.demote(host, stem)`：`hits` 归 1 + `demotedAt`；连续 2 次 → `disabled`
- [x] **A3** `SOURCES.learned` 按 `state.learnGrading` 拆为 `learnedStrong` / `learnedWeak`
      （关时**表内容与 v5-1 完全一致** → 零回归）
- [x] **A4** 命中学习规则时把 `rule.stem` 记到元素 `data-svi-rule-stem`（仅 `learnDemote` 开）
- [x] **A5** 手动覆盖路径读 `data-svi-rule-stem` → `demote(...)`（仅当该元素是被规则命中的）
- [x] **A6** 面板规则列表显示「级别 / 命中 / 是否被降级 / 恢复」按钮
- [x] **A7** 单测：分级边界（4 弱 / 5 强）/ 降级链路 / 恢复链路 / 关时表内容不变
- [x] **A8** 四绿 GATE　**回滚点 R1**

---

## 阶段 B — 判定来源分布

- [x] **B1** 纯函数 `sourceDistribution(entries)` → `{byReason:{}, bySource:{}}`
- [x] **B2** 「🧩 元素动作」区块新增「📊 本页判定来源」：从 `processedLog` 聚合
- [x] **B3** 全站维度：`stats` 计数器 + `log` 原因码累积分布（只读聚合，不改采集）
- [x] **B4** 导出并入 `StatsManager.exportJson()` 新增 `reasonDistribution`（向后兼容）
- [x] **B5** 单测：聚合纯函数（空 / 单类 / 多类）
- [x] **B6** 四绿 GATE　**回滚点 R2**

---

## 阶段 C — 阈值自校准

- [x] **C1** `resolveSiteProfile` 透传站点级 `whiteThreshold` / `lumThreshold` / `imgTolerance`
      （**当前不读**，这是本步的核心前置）
- [x] **C2** `calibrate.suggest(host)`：由 `corrections` 算 `{direction, step, samples}`
      （`falseInvertRate` 默认 0.3，`calibrateMinSamples` 默认 5，步长 3，上限 ±15）
- [x] **C3** 自动**收紧**（`calibrateAuto` 默认开）→ 写 `siteOverrides[host]` + 面板可见 + 「恢复默认」
- [x] **C4** 放松：只计算与展示，按钮手动应用
- [x] **C5** 触发后重置样本窗（防震荡）
- [x] **C6** 单测：阈值边界 / 步长上限钳制 / 一次性触发 / 方向正确
- [x] **C7** 四绿 GATE　**回滚点 R3**

---

## 阶段 D — 形状泛化

- [x] **D1** `shapeSignature(el)`：`{tag, cls 前 3 排序, 尺寸桶, 上下文词元}` 稳定签名
- [x] **D2** `svi:shapes` 记录器（`shapeMinHosts` 默认 3，LRU 500，体积上限）
- [x] **D3** 记录点：手动覆盖 / 学习规则命中时记形状（与 host 解耦）
- [x] **D4** `SOURCES` 末尾加 `shapePrior`（`stage:'rule'`，仅 `state.shapePrior` 开时参与）
- [x] **D5** 面板：形状先验表（计数 / 涉及 host 数 / 逐个禁用）
- [x] **D6** 单测：签名稳定性 / `shapeMinHosts` 门 / 关时表不含该来源
- [x] **D7** 四绿 GATE　**回滚点 R4**

---

## 阶段 E — 导入合并契约与反哺 CI

- [x] **E1** `mergeRulePack(local, incoming)` 纯函数（取大不累加 / 冲突保留高者 / 相等留本地）
- [x] **E2** 导入前预览：将合并 N 条、其中 M 条与本机冲突
- [x] **E3** 导出带 `shape` 先验；脱敏（无浏览记录）
- [x] **E4** `scripts/export-fixtures.js` → `dev/fixtures/verdicts.jsonl`
- [x] **E5** `test.js` 读 fixture 多跑一组（缺失时跳过并打印提示）
- [x] **E6** 单测：合并矩阵（一致 / 冲突 / 相等 / 空）/ 幂等（重复导入权重不变）
- [x] **E7** 四绿 GATE　**回滚点 R5**

---

## 阶段 F — 隐私核查与文档

- [x] **F1** `grep -nE "fetch\(|XMLHttpRequest|sendBeacon|navigator\.onLine|connection\."` 出口与 v4.6.1 一致
- [x] **F2** README / README_EN：数据闭环与隐私说明（含"只自动收紧"的取舍）
- [x] **F3** spec 新增「数据闭环契约」小节
- [x] **F4** bench Scenario 27：分布聚合数字与页面实际决策一致 / 分级开关回退语义 /
      校准建议计算正确
- [x] **F5** 四绿 + `check-panel-overflow.js` GATE

## 最终验证

- [x] 四绿门禁 + 面板溢出 + PRD AC 逐条勾选 + 偏离留痕（见下）

---

## 与计划的偏离（执行中作出的判断，逐条留痕）

### 1. ⚠ **PRD R1 的「(现状语义)」注释是错的** → 分级必须默认关

- **PRD 原文**：「弱 `hits ∈ [learnHits,5)`：只能覆盖像素结论（**现状语义**）」。
- **核查结果**：不成立。现状 `learned` 排在种子规则**之前**，即学习规则**能**压过种子。
  所以"分级"必然是一次**行为变更**。
- **处理**：新增 `learnGrading`（**默认关**），并靠 `enabled()` 让生效集合在关时与 v5-1
  **逐项一致**（单测 + bench 双断言）。开启后 `learnedWeak` 落在所有种子之后、像素门之前，
  恰好实现 PRD 想要的"只能覆盖像素结论"。
- 这条已写进面板文案与 README，不假装它本来就是现状。

### 2. ⚠ **PRD R4 的「仅像素证据缺失时生效」在现有管线上无法表达** → 如实改述

`rule` 段整体位于像素分析**之前**，凡在该段出结论就必然抢在像素前。因此形状先验的实际语义
是「**在所有种子之后、像素之前**的保守兜底」，**不是**"像素缺失时才生效"。
默认关，且面板与 README 都写明这一点 —— 措辞差异不掩盖。

### 3. 阈值自校准：**只自动收紧**（PRD 说"自动收紧/放松"）

- **收紧**自动应用（减少误反 = 用户痛点方向，可一键恢复默认）；
- **放松**只计算与展示，需点按钮。
- 理由：两侧风险不对称 —— 收紧错了只是少反几张，放松错了会在用户没要求时把东西反过来。

### 4. 我自己的一个错误：校准初版写错了阈值字段

初版 `calibrate.apply` 写的是 `whiteThreshold` / `lumThreshold` —— 那是**视频**阈值；
图片浅色判定用的是 `imgLumCutoff` / `imgAreaThreshold` / `imgTolerance`。
已修正为四字段（图片两条 + 视频两条），并补上**站点档案透传**——
只写 `siteOverrides` 而不接透传等于静默无效，这条由 bench 的
「站点档案必须透传校准后的阈值」断言钉住。

### 5. 形状泛化：`shapePrior` 档位与 PRD 不同（理由见第 2 条），记录/展示/导出不受影响

形状**记录**（手动结论 + 学习规则命中时各记一次）、**面板展示**、**导出**全部始终可用，
只有"参与决策"需要开开关。

### 6. 新增属性门只有一个：`data-svi-rule-stem`

用于"规则命中后被用户覆盖"的负反馈归因，仅当 `learnDemote` 开时写入。
其余 v5.3 功能不写任何元素属性（shapeStore 只写自己的存储键）。

### 7. `mergeRulesInto` 抽取：**行为零变化**

v4.5 的 `mergeLearned` 本来就是"取大不累加"（`r.hits > found.hits` 才覆盖）。
本片只是把它抽成纯函数以获得可测性，语义逐字保持；幂等性有实测断言。

### 8. 测试写法踩坑（已入 spec）

`Runtime.evaluate(returnByValue:true)` 在 **return 时**序列化。初版在返回对象里放了
`state.siteOverrides[host]` 的**引用**，而 `reset()` 在 return 之前删掉了字段 → 读到
"删除后"的状态，误判成"收紧没生效"。已改为即时取值。

### 9. 面板诊断行的刷新链（发现的真实缺陷）

`dataLoopDiag` / `calibDiag` 初版只在构建时渲染，打开面板不刷新 → 显示旧值。
已新增 `refreshActionsSection()` 并挂进 `openSettingsModal`（与 v4.5 修过的
"设置行不回显"同类）。这是 bench Scenario 27 首轮失败暴露出来的**产品缺陷**，不是测试问题。

### 10. 补记：B3 / B4 / D5 / E2 / E3 在勾选后补齐并重跑门禁

先把复选框勾上、随后发现这五项只落了函数没有接入，已补齐后重跑四绿（全绿）：

- **B3** 全站维度累积行（`siteDistText()`：stats 计数器 + 累积 log 原因 top5）
- **B4** `StatsManager.exportJson()` 新增 `reasonDistribution`（字段新增，旧文件仍可读）
- **D5** 形状先验表（`refreshShapeTable()`：签名 / 反色×原样计数 / 涉及站点数 / 逐个移除）
- **E2** 导入合并预览（干跑一次 `mergeRulesInto` 算出"将合并 N 条，其中 M 条冲突"）
- **E3** 导出带形状先验且**脱敏**（只带计数与站点数，**不带 host 名** —— host 名属浏览痕迹）

结论：本文件的复选框现在与代码一致。**记录此事本身就是这类铁律的意义** ——
"先勾后做"会让人误判完成度。
