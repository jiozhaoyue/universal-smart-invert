# Implement: v5-5 加载前遮罩

> 复选框随执行实时勾选。GATE 步必须全绿才继续。

## 前置

- [x] **P0** 基线四绿（v5-4 收尾态，HEAD = `d0c61fc`）
- [x] **P0** 读 `design.md`，尤其 §1 的**形态硬约束**与 D-1（默认档必须等于 v4.6.1 行为）
- [x] **P0** 定位 `setupFlashGuard` / `sviFlashGuardOff` / `applyDecision` / `markFailure`
      / 胶囊按钮 / Esc 链

---

## 阶段 A — 三档与迁移

- [x] **A1** `flashGuardLevel`（`off|document|media`，默认 `document`）+ `loadState` 规范化
      与**旧布尔迁移**（`flashGuard:true → document`、`false → off`）
- [x] **A2** `flashGuard` 作为**派生值**同步写回（旧版本仍可读回退）
- [x] **A3** `setupFlashGuard` 按档执行；`document` 档行为与 v4.6.1 **逐字一致**
- [x] **A4** 面板行改为三档选择器 + 迁移说明
- [x] **A5** 单测：三档行为 / 旧值迁移（`true`/`false`/缺失）/ 规范化边界
- [x] **A6** 四绿 GATE　**回滚点 R1**

---

## 阶段 B — 本站"已知会反色"门

- [x] **B1** `siteMediaStore`（`svi:siteMedia`，容量上限 200 host）+ 决策落点记录 `seen/inverted`
- [x] **B2** 纯函数 `maskShouldArm(host, opts)` 合成四类门（便于单测）
- [x] **B3** 面板覆盖：本站强制启用 / 本站禁用（存 `siteOverrides[host].pendingMask`）
- [x] **B4** 面板显示"本站为何启用/未启用"一行原因
- [x] **B5** 单测：四类门各自命中/未命中/边界（`siteInvertRate` 恰好相等、`siteMinSeen` 恰好相等）
- [x] **B6** 四绿 GATE　**回滚点 R2**

---

## 阶段 C — 元素 pending 遮罩

- [x] **C1** 样式注入（`html[data-svi-masking] [data-svi-pending]:not([data-svi-settled])`）——
      **纯 CSS 门，不用 inline style**
- [x] **C2** `pendingMask.tag/settle/settleAll`；MutationObserver **`observe(document)`**
      （`documentElement` 在 `document_start` 为 null —— v4.6.1 同一个坑）
- [x] **C3** 打标阶段**零布局读取**（不调 gBCR / gCS）
- [x] **C4** 白名单：`protect` 命中 / `data-svi-manual` 存在 / 低于判定门 → 直接 `settled`
- [x] **C5** 摘罩挂在**唯一决策落点**（`applyDecision`）+ 三个执行器的 `apply`
- [x] **C6** `markFailure` / 分析失败 / 任何异常 → **立即摘罩放行**
- [x] **C7** 三层预算（`maskBudgetMs` / `maskMaxElements` / `maskSettleTimeoutMs`）
- [x] **C8** 逃生：`Esc`（接在既有 Esc 链之后）+ **面板按钮**；本会话暂停记在 `runtime`
      → **与原文不符**：未加胶囊按钮（见下方偏离 4 的理由）。入口 = `Esc` + 面板「立即显示全部」
- [x] **C9** 用户脚本形态：面板**显式标注**"首屏不适用"，且首屏元素**不被打标**（单测/bench 可验）
- [x] **C10** 单测：白名单 / 三层预算各自触发 / 失败必放行 / `settleAll` 幂等 / 暂停态
- [x] **C11** bench Scenario 29：`document` 档与 v4.6.1 行为一致；`media` 档在用户脚本形态下
      **首屏不打标**；预算超限必放行；`Esc` 逃生后不再打标
- [x] **C12** 四绿 GATE　**回滚点 R3**

---

## 阶段 D — 开关与文档

- [x] **D1** 开关（`maskPending` / `maskBudgetMs` / `maskMaxElements` / `maskSettleTimeoutMs` /
      `siteInvertRate` / `siteMinSeen`）+ 诊断行（遮罩次数 / 平均时长 / 预算超限 / 失败放行）
- [x] **D2** README / README_EN：**明确区分两形态能力边界**（不得含糊）+ 预算与逃生说明
- [x] **D3** spec 新增「加载前遮罩契约」小节
- [x] **D4** 四绿 + `check-panel-overflow.js` GATE

## 最终验证

- [x] 四绿门禁 + 面板溢出 + PRD AC 逐条勾选 + 偏离留痕（见下）

---

## 与计划的偏离（执行中作出的判断，逐条留痕）

### 1. ⚠ **默认值掩盖了迁移分支**（真 bug，被单测抓到）

初版迁移写成 `if (invalid(merged.flashGuardLevel)) { 迁移 }` —— **永远不执行**，因为
`merged = {...defaults, ...stored}` 而 `defaults.flashGuardLevel` 已经是 `'document'`。
必须判**存储里有没有这个键**。已修正，并由单测钉住 `flashGuard:false → 'off'`。

### 2. ⚠ **`sec.add` 用在了裸 div 上**（真 bug，被 bench 场景 1 抓到）

`buildDynamicThemeSection` 的 `sec` 是裸 `document.createElement('div')`（用 `appendChild`），
不是 `ui.section()` 的 `{el, add}`。混用导致**整个设置弹窗构建失败**，表征只有一句
`UI Settings Modal: ✗ Missing`。已全部改为 `sec.appendChild(x.row)` 并加注释警示。

### 3. `settleAll` 走维护的集合而不是全文档查询

初版只靠 `document.querySelectorAll('[data-svi-pending]')`。这有两个问题：多一次全文档查询；
且 **Node 单测无法覆盖**（测试桩没有真实 DOM）。改为维护 `pending: Set`（有界，受
`maskMaxElements` 约束）+ 属性扫描兜底。

### 4. 逃生入口：**面板按钮 + Esc**，未做胶囊按钮

PRD R5 写"`Esc` 或胶囊上的「立即显示全部」按钮"。实现为 **`Esc` + 面板按钮**，
**未加胶囊按钮** —— 胶囊是单行极简控件，插入条件性按钮会牵动既有胶囊 DOM 断言，
收益不抵风险。README 已写明两个入口。

### 5. 元素遮罩风格：pending 期固定用 `visibility:hidden`

用户提到遮罩可以有多种风格（全遮挡 / 暗色半透明等）—— 那已由 **`mask` 动作的三档预设**
（v5-1）完整提供。pending 期是**临时待判遮罩**，语义是"还没决定，先别让人看到"，
用 `visibility:hidden` 最干净：不占位、不拦点击、不产生过渡中间态、无伪元素冲突。
若用暗色蒙层，用户会看到"一块灰"然后变内容，反而更像故障。

### 6. `A5`/`C10` 的预算"总时长"用例：由元素数预算与逃生路径覆盖

`maskBudgetMs` 的定时器路径在 Node 单测里需要真实计时；单测覆盖了**元素数预算**与
**单次结算**，(合计) 总时长预算的定时器路径由 bench 与代码审查覆盖。
如实标注覆盖面差异，不夸大。

### 7. 范围核查

- 打标路径 `grep` 无 `getBoundingClientRect` / `getComputedStyle`（零布局）✓
- 观察器为 `mo.observe(document, ...)`，**不是** `documentElement` ✓
- 遮罩门为纯 CSS 属性门，无 inline style ✓
- 网络出口仍与 v4.6.1 逐条一致 ✓
