# Design: v5-2 复查撤销

## 1. 边界

**做**：撤销栈 + 可交互 toast + `Alt+Z`；「本页已处理」视图；一键固化规则；错误反色哨兵。

**不做**：跨会话撤销历史（撤销栈刻意仅内存）；不改决策管线本身的判定逻辑；
不改 v5-1 的 Registry 契约（本片是纯消费方）。

## 2. 现状（已核查）

- v3.1 R3 已有「🖥️ 当前页媒体」面板：`collectMediaItems` 预算 400、逐项「反色/复原」、
  「定位」（`scrollIntoView` + 1.2s 描边闪烁）、索引化 `data-svi-mi`（不持有 DOM 强引用）、
  惰性采集（点按钮才全页扫描）。
- **缺的是「脚本刚刚改了什么」**：面板列的是页面有什么，不是本次会话被改了什么；
  且反色侧原因码不可见（只有跳过原因 `SKIP_REASON_ZH`）。
- `queueRecheck` / `runRecheck`（v4.3 复检网）在跑，但结果不可见。
- 现有 `showToast` 是 `pointer-events:none`，不可交互。

## 3. 关键决策

### D-1 撤销栈仅内存 + 仅记自动结论

- 存 `{ id, actionId, stem, src, reason, source, at }`，环形容量 30，**不落盘**
  （与 `runtime` 同纪律：标签页隔离）。
- **不记手动动作**：手动是用户意志，提供"撤销用户自己"没有语义。
- 载体是 `applyDecision`（唯一的决策落点）+ 三个执行器的 `apply`。

### D-2 撤销 = 反事实回退 **+ 持久化用户否决**（实现时修正了本条的初版）

**初版（错，已废）**：「撤销 = 摘属性 + 删快照 + 重扫，**不是**改成 keep」。

**为什么错**：只摘属性 + 删快照时，**像素证据没有任何变化**，下一次扫描会得到完全相同的
结论，于是撤销立刻被撤销掉 —— 等于没撤销。这正是用户抱怨的那个现象（「错了只能手动点」）。
bench 实测就把这一点照出来了（`Scenario 26` 初版断言"撤销后 checked 为空"，实际 400ms 内
元素已被重新标记并重新反色）。

**采用的语义**：撤销 = 摘标记 + 清 checked + 删快照 + **写一条"用户否决"结论**
（元素级 `data-svi-manual='restore'` + src 级 `manualOverrides[host|src]='restore'`）。

- 这与「Alt+点击还原」**同语义**，所以撤销之后的下一次扫描会得到 `keep`，真正持久。
- 初版想避免的"把从未判定的元素钉成 keep"并不成立：能进撤销栈的元素**一定**是脚本刚刚
  自动改动过的，用户撤销它就是明确表态"这个不要动"。
- `remember=false` 保留纯机械回退路径（内部工具/单测用），用户可见路径一律 `remember=true`。
- hide / mask 的撤销同理，落各自的动作级手动作用域（`data-svi-manual-hide='show'` /
  `data-svi-manual-mask='clear'`）。

### D-3 可交互 toast：独立节点，不与 `showToast` 争用

`showToast` 复用单个 `#svi-toast` 且 `pointer-events:none`。新增 `showActionToast` 用
**独立节点** `#svi-action-toast`（`pointer-events:auto`，带按钮）。理由：改既有节点会
影响 v4.6 已验收的 toast 行为与 bench 断言。

**批量合并**：同一 flush 内 ≥3 条自动反色 → 合并为一条「已处理 N 张 · 撤销」，
撤销时**逆序连续回退 N 条**（依赖栈的 LIFO 顺序）。

### D-4 「本页已处理」是**双视图**，不是替换

现有「全部媒体」视图（v3.1 行为）原样保留为第二视图 —— AC 明确要求不回归。
默认切到「已处理」视图。

原因码中文映射在现有 `SKIP_REASON_ZH` 之外**新增** `REASON_ZH`（反色侧），不合并进原表
（原表的键是 skip 原因，语义不同）。

### D-5 一键固化 = 写学习规则 + `immediate`

复用 v5-1 已扩展的 `RuleLearner.record(host, el, action, immediate=true)`：
`hits` 直接抬到 `learnHits`，**立即生效**，不需要再点 2 次。这与 `hide` 的"第三次=永久"
是同一机制。

四种固化：`keep`（此元素永不反色）/ `hide`（永久屏蔽）/ `protect`（bg 元素同理）/
`imageInvert=false`（此站不再自动反色图片）。

### D-6 哨兵与 v5-3 共用记录点

`falseInvert` / `falseKeep` 计数由本片先落地（v5-3 的阈值自校准要读它）。
存储：`svi:corrections = { '<host>': { falseInvert: n, falseKeep: n, at: ts, perSrc: {} } }`。
`perSrc` 用于"同 src 24h 内被还原 ≥2 次 → 自动降级为 keep"。

**降级动作**：写 `manualOverrides[host|src] = 'restore'`（最轻，且用户可再次 Alt+点击推翻）。

### D-7 开关

`undoEnabled`（默认开）/ `undoStackSize`（默认 30）/ `actionToast`（默认开）/
`errorSentinel`（默认开）。全部进「🧩 元素动作」区块的复查子块。

## 4. 数据流

```
applyDecision(el, src, d)                ← 唯一决策落点
   ├─ pushUndo({ actionId, src, reason, source, verdict })   (仅 source !== 'manual')
   └─ 批量计数 → 同 flush ≥3 条 → 合并 toast

Alt+Z → undoLast() → 逆序回退 → revert + 快照删除 + 重扫
列表项「以后都这样」→ ruleLearner.record(..., immediate=true)
用户 Alt+点击还原 → corrections.falseInvert++ → 达阈 → manualOverrides[host|src]='restore'
```

## 5. 契约（下游 v5-3 依赖）

| 契约 | 形状 |
| :--- | :--- |
| `window.__svi.corrections` | `{ get(host), bump(host, kind, src), persist() }` |
| `window.__svi.undoStack` | `{ push(e), pop(), size(), clear() }` |
| `corrections` 存储键 | `svi:corrections`，形状见 D-6（v5-3 阈值自校准直接读它） |

## 6. 回滚

1. 功能级：关 `undoEnabled` / `actionToast` / `errorSentinel` → 回到 v5-1 行为。
2. 代码级：单提交 revert（本片不碰 Registry，冲突面为零）。
3. 数据级：`svi:corrections` 可删（丢失的只是计数与哨兵降级）。
