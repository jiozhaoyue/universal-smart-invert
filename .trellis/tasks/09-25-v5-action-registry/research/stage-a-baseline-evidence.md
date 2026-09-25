# A4 / A12 基线比对证据

## 目的

v5-1 阶段 A 的 A4 与 A12 两个 GATE 要求「与 P0 基线结果完全一致」。
本文件记录比对方法、归一化规则与实测结论，供结案核查。

## 基线锚点

- git HEAD：`3dcbb1a6beada0d9e29fc60abbfe406fc9c882ba`
- `research/baseline-test-js.txt` — `node test.js` 输出（56 行）
- `research/baseline-test-browser.txt` — `node test-browser.js` 输出（128 行，32 个 Scenario）

## 归一化规则（必须，否则会把非确定性噪音当成回归）

| 噪音类型 | 例 | 归一化 |
| :--- | :--- | :--- |
| 堆栈行号 | `user.js:3634:30` | → `user.js:L:C`（A1 新增约 86 行，全体后移是预期的） |
| 微基准计时 | `0.00075 ms` | → `N ms`（非确定性） |
| 随机 UUID / blob URL | `blob:.../1f069a61-…` | 逐行目视比对，接受差异 |
| 时间戳 | `lastAt: 1790328041745` | 逐行目视比对 |
| 临时目录名 | `svi-file-test-LtrR0G` | 逐行目视比对 |
| CDP page id | `ws://…/5E909F8A…` | 逐行目视比对 |
| 生成物体积 | `content.js 388125 bytes` | 预期变化（源码增长） |

## 比对方法

```bash
# 断言行（决定性）—— 必须 100% 一致
norm() { grep -E "^\[Test\] Scenario|PASSED|FAILED|^✓|Row sync audit|Policy aggressive|Media section|Media toggle|Viewer Alt|CSS path hover|BG path hover" "$1"; }
diff <(norm baseline.txt) <(norm current.txt)

# 全量（含噪音）—— 人工确认每条差异属上表类型
```

## A4 实测结论（2026-09-25）

- `node --check` → 0
- `node test.js` → EXIT 0；全量 diff 差异 = 行号偏移 + 1 处微基准计时（0.00075 → 0.00067 ms）
  + 2 行日志顺序；**无断言变化**
- `node test-browser.js` → EXIT 0；断言行 diff **空**（100% 一致）；
  全量 diff 差异全部落上表噪音类型（content.js/zip 字节数、CDP page id、blob UUID、
  timeline 时间戳、RuleLearner lastAt、临时目录名）
- `extension/content.js` 被 test-browser.js 自动重建（生成物，预期）

**A4 判定：零行为变化成立。**

## 发现的坑（已入实现注释）

`/* ignore */` 这类内联块注释若被放进外层块注释里，会**提前闭合外层注释**，
导致其后代码被当作真代码解析。arbitrate 重构时本想保留 v4.6 原实现为注释基线，
因此触发；已改为「见 git 历史」引用。**后续任何"保留旧实现为注释"的做法都要避开此陷阱。**

## A12 实测结论（2026-09-25）

阶段 A 全步落地后（A1–A11）重跑四绿：

| 门禁 | 结果 |
| :--- | :--- |
| `node --check universal-smart-invert.user.js` | 0 |
| `node test.js` | EXIT 0；`✓` 行 17 → **18**（新增 v5.0 Registry 一组），基线 17 条断言全在 |
| `node test-browser.js` | EXIT 0；场景 + 断言行 diff **空**（100% 一致） |
| `node scripts/build-extension.js && node scripts/pack.js` | 0（content.js 392496 bytes / zip 446270 bytes） |

**A12 判定：阶段 A 零行为变化成立。**

## A10 唯一性审计结果

审计命令与结论：

| 检查项 | 结果 |
| :--- | :--- |
| `ruleLearner.decideFor(` | 仅 1 处 —— `SOURCES.learned` ✓ |
| `profile.protect` / `profile.forceInvert` | 仅 1 处 —— `decideImage` 内构造 `srcCtx` ✓ |
| favicon 正则 `.ico\|.cur` | 仅 1 处 —— `SOURCES.faviconSkip` ✓ |
| `firstMatchingElementRule(` | 2 处 —— `SOURCES.elementRule` **+ `BgImageEngine`（见下）** ⚠ |
| `manualOverrides[` 读点 | 4 处（见下） |

### 读点性质区分（均非第二优先级链）

- `1778` — `manualStateFor` 内的 src 键回读（`arbitrate` 的输入，属 Registry 自身）
- `1863` — `SOURCES.manual`
- `6105` — `ImageFxEngine.paramsFor` 读 `rect` 参数（**参数读取，非优先级判定**）
- `7066` — `BgImageEngine.decideUrl` 的 URL 级手动覆盖（见下）

### ⚠ 已知遗留：`BgImageEngine` 的第二套（较窄）链 —— 本阶段刻意不合并

`BgImageEngine`（`data-svi-bginv`）自带一条**只含两点**的链：

```
manualStateFor(el) → firstMatchingElementRule(el, profile.elementRules) → 尺寸/亮度判定
```

**为什么不并入本阶段**：

1. `SOURCES.manual` 读的是 **src 键**（`manualOverrides[host|src]`），而 `BgImageEngine` 读的是
   **元素属性**（`manualStateFor(el)`，为无 src 的 canvas / 背景元素设计）。两者是并集关系，
   不是同一查询。
2. 若把元素属性检查提进 `SOURCES.manual`，则「只有 `data-svi-manual` 属性、无 src 键覆盖」的
   **img** 会被提前到 override 段出结论，`reason` 由 `'pixel'` 变为 `'manual'` 并 `force=true`
   —— 终态相同但**原因码变化**，违反阶段 A 的「零行为变化」判据。
   （注：`markManual` 对有 src 的元素同时写属性与 src 键，故对 img 实际无差异；但无 src 元素
   与 `propagateManualToSiblings` 的部分路径不写 src 键，不能凭此断言无差异。）
3. `data-svi-bginv` 是**另一个属性 / 另一个动作**（背景图反色），不属于本阶段 `ACTIONS`
   的 invert / keep，其合并需要先决定它与 `ACTIONS` 的关系（新增 `bg-invert` 动作？
   还是让 `invert` 执行器同时管两个属性门？）—— 属设计决策，不应在重构中夹带。

**处理**：登记为 v5-1 的显式遗留项（见 `design.md §7`、`implement.md` 阶段 A 后续项），
在 v5-1 内做（不推到 v5-2+），但必须**独立成步并单独验证**。
