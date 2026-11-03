# v4.6-2 复现记录：Alt+点击手动反色被异步回写覆盖

> 复现脚本：`dev/repro-altclick.js`（Node 桩环境加载真实 userscript 源码 + 真实引擎实例）
> 运行：`node dev/repro-altclick.js`（仓库根目录）。脚本只读产品代码，不改产品行为。
> 执行时间：2026-09-24（v4.6.0 基线，@version 4.6.0，基线门禁 `node --check` + `node test.js` 全绿）。

## 环境与方法

- 以 `test.js` 同款最小 DOM/localStorage 桩在 Node (v24.14.1) 中 `vm.runInThisContext` 加载
  `universal-smart-invert.user.js` 全量源码（仅剥离 UserScript 头）。
- 通过真实 `whenBodyReady → bootEngines()` 路径启动引擎（非 new 直构），
  取 `window.__svi.engines.{image, imageFx, mediaCoverage}` 三个真实实例。
- Alt+点击用捕获阶段派发仿真事件（`composedPath` 返回目标元素），驱动真实
  `bindManualToggle → resolveMediaFromEvent → toggleMediaOverride` 路径。
- fx 解码回调以真实 `applyTo` 写状态入口模拟（`fx.process` 补丁仅替代画布解码，
  回调尾段 `for (targets) applyTo(...)` 与生产 `process()` 逐行一致）。

## 场景与结果（修复前基线）

### A. fx 投递回调覆盖手动杀停（design.md H1）——**成立**

前置：图片已投递（`data-svi-fx` 在，视觉=已反色），另有一次换参重投递在途（回调未到）。
动作：Alt+点击（杀停，预期还原原图）。

| 时点 | data-svi-fx-off | data-svi-fx | manualOverrides[host\|src] |
|---|---|---|---|
| 点击后 | true | true | **null（杀停分支不记录任何手动结论）** |
| fx 回调落地后 | **false（被擦掉）** | true | null |

```
[FAIL-BUG] A: fx 回调不覆盖手动杀停 (H1) :: afterClick.fxOff=true manual=null afterCb.fxOff=false afterCb.fx=true
```

时序：点击写入 `fx-off='true'` → 30ms 后异步 `process()` 完成 → `applyTo()` 无条件
`removeAttribute('data-svi-fx-off')` + 重设 `data-svi-fx` → 杀停结论被覆盖。
用户视角：点击后画面毫无变化（见 B），连点 N 次全部无效。

### B. fx 杀停的 CSS 兜底规则在级联中必输（H4 变体）——**成立**

走真实 `applyTo` 生成规则后读取 `fx._rules`：

```
[FAIL-BUG] B: content:url 规则排除 fx-off 态 (H4 变体: 级联必输) ::
             img[data-svi-fx="fx33334444"] { content: url(blob:...) !important; }
```

- 主样式表（document-start 注入）里虽有兜底规则 `img[data-svi-fx][data-svi-fx-off] { content: normal !important; }`（约 L2788），
  但 per-element 投递规则写在**后创建**的 `#svi-fx-style` 节点；两条同特异性（0,2,1）同优先级（!important），
  级联顺序后建节点获胜 → **兜底规则恒被投递规则压住，杀停后视觉仍显示变换图**。
- 即：fx 模式下 Alt+点击杀停在视觉上是**永久无效**的（唯一能还原的是 hover 还原）。

### C. canvas 首扫覆盖手动反色（H8，代码时序推导）——**成立**

前置：canvas 未被引擎判定（`checked` WeakSet 未含）。动作：Alt+点击手动反色 → 立即首扫。

```
[FAIL-BUG] C: canvas 首扫不覆盖手动反色 (H8) :: afterClick=true afterScan=false
```

时序：点击写 `data-svi-inverted='true'`（此时无 src，不落 manualOverrides/决策）→
`MediaCoverageEngine.processCanvas()` 首次执行（sweep ≤5s / flush 200ms 真实路径）：
`checked.has(c)===false` → 不早退 → 像素分析 isLight=false → `removeAttribute('data-svi-inverted')`
→ 手动结论被擦。第二次点击时元素已入 `checked` → 早退 → 生效。
**用户视角 = 固定两连点**（第一次"闪一下就没了"，第二次才保持）。

### D. recordDecision force 语义对照（H2/H6）——**不成立（既有防线正确）**

```
[PASS-OK] D: recordDecision 手动快照幂等占优 (H2/H6 对照) :: d2=keep/manual
```

手动 force 快照后，非 force 的 pixel 决策正确返回手动快照——决策快照层无覆盖路径。

## 汇总

```
==== 复现汇总: 4 项, 缺陷 3 项 ====   （A/B/C 成立，D 为既有防线对照）
run=0
```

## 与用户"点好几下"体感的对应

| 目标类型 | 修复前点击序列表现 |
|---|---|
| fx 模式已投递图片（luma/key/rect 等） | 杀停**每次都视觉无效**（B 级联必输 + A 回调回写），连点任意次均无效 |
| fx 投递在途图片 | 点击 1 结论在 30ms~解码耗时后被 applyTo 覆盖（A）→ "点了没反应" |
| canvas（图表/面板常见） | 点击 1 → ≤5s 首扫覆盖（C）→ 点击 2 起生效 → **固定两连点** |
| 普通 img（full 滤镜模式） | 同帧生效；但同 src 兄弟元素状态不同步（见 rootcause H3，部分成立） |
