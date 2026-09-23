# v4.6-2 执行计划：Alt+点击一次生效

> 每步勾选实时回写。禁止 `git commit`。

## 第 0 步 · 复现与假设验证

- [ ] 基线四绿（`node --check` / `node test.js`；bench 视 Chrome 可用性）
- [ ] 真机复现："需要点几下"——记录 3 类站点各 3 次点击的**精确次数与每次点击前后状态**
      → `research/repro-altclick.md`
- [ ] 逐条验证 `design.md §2` 的 H1–H7（每条给「成立/不成立 + 证据」），至少定出主因
- [ ] 主因写入 `research/rootcause.md`

**Gate**：`research/rootcause.md` 有主因 + 时序解释（"第 N 次点击为何生效"），否则不进第 1 步。

## 第 1 步 · 状态写点收口（纯重构，行为不变）

- [ ] 全量 grep `data-svi-inverted` / `data-svi-fx-off` 写点，列出清单
- [ ] 引入 `applyInvertState(el, want, reason)`，把所有写点改为经它
- [ ] 行为不变验证：`node test.js` + bench 原有场景全绿（回归基线）

## 第 2 步 · 手动覆盖最高优先级（幂等）

- [ ] 非 `manual` 原因写状态前先查 `manualOverrides`（按元素解析出的 key）
- [ ] key 一致性修复（H2/H3）：override key 与 decision key 使用同一函数生成
- [ ] 单测：异步 fx 回调写状态时手动结论不被覆盖（**核心护栏**）
- [ ] 单测：同 src 多元素继承手动结论

## 第 3 步 · 点击路径加固

- [ ] `toggleMediaOverride` 保证同帧完成：属性 + 快照 + manualOverrides 三者一致（C4）
- [ ] 覆盖目标补齐：`canvas` / 背景图元素（`data-svi-bginv`）；Shadow DOM 场景验证
- [ ] fx 分支（`data-svi-fx-off`）一次生效验证
- [ ] 点击后立即校验 CSS 实际生效（H4 防线）：必要时补一次 `updateImageFilterCss()`

## 第 4 步 · 自动化护栏

- [ ] bench 新场景：一次点击 → 同帧断言 → 触发 fx 回调 → 断言仍保持 → 重载 → 仍保持
- [ ] 探针：`dev/probe-altclick-real.js` 闭环跑通（≥1 真站），产出前后截图 + 决策报告
- [ ] 本地 fixture：同 src 双元素 / 背景图元素 / Shadow DOM 三类

## 第 5 步 · 收口

- [ ] 四绿门禁（`node --check` / `test.js` / `test-browser.js` / `build-extension.js && pack.js`）
- [ ] 更新 `.trellis/spec/frontend/quality-guidelines.md`：新增「状态写点必须收口 + 手动覆盖幂等」条目
- [ ] 勾选本文件 + 回写 prd Acceptance Criteria（含根因报告）
- [ ] 不提交

## 回滚点

- R1：第 1 步是纯重构，若 bench 不稳可整体 revert 而不影响功能
- R2：第 2 步引入优先级门，可用 `state.manualOverrideStrict`（默认 true）开关回退
