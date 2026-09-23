# v4.6-2 技术设计：Alt+点击一次生效

## 1. 当前路径（实现者须复核行号）

```
capture click (altKey)
  └─ resolveMediaFromEvent(e)        // composedPath → ShadowDomRegistry 兜底
      └─ toggleMediaOverride(target)
          ├─ if data-svi-fx        → 切 data-svi-fx-off（kill switch），return
          ├─ else 切 data-svi-inverted 属性（读当前真实属性）
          ├─ addManualOverride(manualOverrides, host|src → 'invert'|'restore')
          ├─ savePrefs()
          ├─ recordDecision(src, 'keep'|'invert', 'manual', true)   // 强制刷新快照
          └─ ruleLearner.record(...)
```

## 2. 假设的失效机制（须先证伪/证实，逐个测）

| # | 假设 | 判别实验 |
|---|---|---|
| H1 | `ImageFxEngine` 异步投递回来后 `finalizeInvert`/`clearFor` 重写属性，覆盖手动结果 | 在 `fx` 模式（`imgFxMode != full`）下点击，观察是否只在 fx 模式下需要多次点击 |
| H2 | `recordDecision` 刷新的快照键与实际查询键不一致（`host|src` vs `src`） | 打印 override key 与 decision key，比对 |
| H3 | 同一 `src` 多元素：只点了其一，其余仍按快照旧值渲染；用户以为"没生效" | 构造同 src 双元素 fixture |
| H4 | 属性被写入但 CSS 门类未命中（`data-svi-inverted="true"` 写了却不反色，因为 `body.svi-img-invert-on` 缺失 / 站点挂起 / filter 变量为空） | 点击后立即读 `getComputedStyle().filter` |
| H5 | 点击事件被站点自身捕获/取消（`stopPropagation` 在捕获前） | 记录点击命中日志（临时 debug 通道） |
| H6 | `data-svi-checked-src` 已写 → 后续 rescan 早退，手动改写后**没有**触发一次 apply | 点击后统计 `StatsManager` 与属性状态 |
| H7 | `ruleLearner` 学习结果与手动结论冲突并把状态拉回 | 关闭 learner 对照 |

## 3. 目标契约

- **C1 同帧可见**：点击处理的同步阶段结束时（不等待任何异步），目标的渲染状态已改变。
- **C2 幂等占优**：手动覆盖是决策管线**最高优先级且幂等**的输入；任何异步回调、
  flush、rescan、eager pass 在写状态前必须先查手动覆盖。
- **C3 单点收口**：所有"写反色状态"的地方统一走一个 `applyInvertState(el, want, reason)`
  门（内部先查手动覆盖），杜绝多处直接 `setAttribute('data-svi-inverted', ...)`。
- **C4 双写一致**：属性（`data-svi-inverted` / `data-svi-fx-off`）、快照、`manualOverrides`
  三者同帧一致。
- **C5 覆盖目标全谱**：`img`/`svg`/`image`/`input[type=image]`/`canvas`/`video`/背景图元素
  + Shadow DOM 内部元素。

## 4. 建议实现骨架

```
applyInvertState(el, wantInvert, reason):
    if reason !== 'manual' and manualOverrideFor(el) != null:
        wantInvert = manualOverrideFor(el) === 'invert'
        reason = 'manual'
    ... 统一写属性 + 统计 + 原因码

finalizeInvert(...) / fx 回调 / 任何 rescan 写点 → 一律经 applyInvertState
```

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 收口改造触碰面大，回归风险 | 分两步：先收口不改行为（纯重构，bench 必须仍全绿），再修竞态 |
| 手动覆盖记忆导致用户"改了也改不回来" | 保持"再点一次恢复"闭环 + 面板提供清除手动覆盖入口（已存在则复用） |
| Shadow DOM 内点击解析失败 | 沿用既有 `ShadowDomRegistry`，新增该场景的探针 |

## 6. 验证策略

1. 单测：模拟异步 fx 回调写状态 → 断言手动结论未被覆盖（**回归护栏，核心交付**）。
2. 单测：手动覆盖 key 与决策 key 一致性；同 src 多元素继承。
3. bench：新增场景「Alt+点击一次 → 同帧断言 → 异步回调后仍保持」。
4. 真机：`dev/probe-altclick-real.js` 扩展为闭环（点击/重载/再点击），至少 1 真站。
