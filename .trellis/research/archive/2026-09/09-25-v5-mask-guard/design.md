# Design: v5-5 加载前遮罩

## 1. 边界与硬约束

**做**：flashGuard 三档；扩展形态的元素级 pending 遮罩；三层预算兜底；逃生通道。

**硬约束（父 PRD 约束 2，必须显式面对）**：

| 形态 | `@run-at` | 能否"首帧前遮罩" |
| :--- | :--- | :--- |
| 用户脚本 | `document-end` | **不能** —— 脚本运行时首屏已渲染 |
| Chrome 扩展 | `document_start` | **能** |

结论：真·加载前元素遮罩只有扩展形态能做到。用户脚本只能覆盖"脚本启动之后动态插入的元素"，
首屏走文档级黑底兜底。**面板必须显式标注这个差异**（v4.6 版本自检徽标是同类先例）。

## 2. 关键决策

### D-1 三档取代布尔值，且旧值无损迁移

| 档 | 行为 |
| :--- | :--- |
| `off` | 零介入 |
| `document` | 文档级黑底（现状语义与触发条件完全不变） —— **默认**，即默认行为与 v4.6.1 一致 |
| `media` | `document` 档 + 元素级 pending 遮罩 |

迁移：旧布尔 `flashGuard` → `true` = `document`、`false` = `off`。**保留 `flashGuard` 字段的
读写**（`flashGuardLevel` 是权威，`flashGuard` 作为派生值同步写回），这样回退到旧版本仍可读。

### D-2 触发门：本站"已知会反色"才启用（保守）

不得无条件遮罩 —— 白藏图片比白闪更烦人。四类条件任一即可（`design` 原文照抄）：

1. 命中 `BUILTIN_RULES` 的 `forceInvert`；
2. 本站存在学习规则且含 `invert`；
3. **本站历史反色率**：新增 `svi:siteMedia{host:{seen, inverted, at}}`，
   上次会话 `inverted/seen >= siteInvertRate`（默认 0.35）且 `seen >= siteMinSeen`（默认 5）；
4. 面板「本站强制启用 / 本站禁用」覆盖。

首访站点无从预知 → **不遮**。面板显示"本站为何启用/未启用"一行原因。

### D-3 元素 pending 遮罩：纯 CSS 属性门 + 同步打标

- 样式在 `document_start` 注入（扩展形态才有意义）：
  `html[data-svi-masking] [data-svi-pending]:not([data-svi-settled]) { visibility: hidden }`
- **MutationObserver 必须 `observe(document)`** —— `document_start` 时刻
  `documentElement` 仍是 `null`，`observe(null)` 抛错被吞掉后会**静默退回轮询**
  （v4.6.1 踩过的同一个坑）。
- **打标阶段绝不查布局**（不调 `getBoundingClientRect` / `getComputedStyle`）——
  只在判定阶段已有尺寸门。
- 白名单：已 `protect` / 命中 `data-svi-manual` / 尺寸明显低于判定门的元素直接 `settled`。

### D-4 摘罩挂"判定完成"，不挂时间

`data-svi-settled` 的写入点是**唯一的决策落点**（`applyDecision`）+ 三个执行器的 `apply`。
另有三层预算兜底：

| 预算 | 默认 | 超限 |
| :--- | :--- | :--- |
| `maskBudgetMs` | 1200ms | 全部摘罩放行 + `maskBudgetExceeded` |
| `maskMaxElements` | 80 | 超出部分不打标 |
| `maskSettleTimeoutMs` | 800ms | 该元素单独摘罩 |

**判定失败必放行**：`markFailure` / `analyzeSrc` 返回 `{ok:false}` / 任何异常 → 立即摘罩。
绝不允许"拿不到像素就把图藏起来"。

### D-5 逃生通道

`Esc` 或胶囊按钮 → 一次性摘除全部 pending 并**本会话暂停后续遮罩**（记在 `runtime`，
不落盘）。`Esc` 的优先级低于"关闭弹窗/取消区域遮罩武装态"（沿用既有 Esc 链）。

### D-6 可观测

`maskApplied` / `maskBudgetExceeded` / `maskSettleFailures` 三个计数器 + 面板诊断行
（本会话遮罩次数 / 平均遮罩时长 / 预算超限 / 失败放行）。

## 3. 契约

| 契约 | 形状 |
| :--- | :--- |
| `flashGuardLevel` | `'off' \| 'document' \| 'media'`（`flashGuard` 为派生布尔） |
| `siteMediaStore` | `{ record(host, seen, inverted), rate(host), gate(host) }` |
| `pendingMask` | `{ tag(el), settle(el), settleAll(reason), armed() }` |
| `maskShouldArm(host)` | 四类门合成（纯函数化，便于单测） |

## 4. 回滚

1. `flashGuardLevel='document'`（默认）→ 行为与 v4.6.1 逐字一致；`'off'` → 零介入。
2. `maskPending=false` → 只保留文档级黑底。
3. 代码级：单提交 revert。
