# v4.6-1 执行计划：本地优先判定（网络无关）

> 派发前先读：`.trellis/spec/frontend/quality-guidelines.md`（必备）、本任务 `design.md`、`implement.jsonl`。
> 每次勾选必须**实时**回写本文件，不得事后批量补勾。

## 第 0 步 · 复现与二分（必须先做，禁止跳过）

- [ ] 确认基线：`node --check universal-smart-invert.user.js` && `node test.js` 全绿
- [ ] 用 CDP 限速（`Network.emulateNetworkConditions`，如 200kbps / 400ms RTT）复现：
      首屏可见图片长时间不被判定（记录时间戳与元素快照）→ 存 `research/repro-<date>.md`
- [ ] 二分定位：对 `universal-smart-invert.user.js` 的提交做二分（`git log --oneline -- <file>`），
      找出「错误率升高」的实际引入版本；若结论是**多个**机制叠加，逐条列出
- [ ] 产出 `research/bisect-report.md`：commit、机制、复现步骤、证据路径

**Gate**：`research/bisect-report.md` 存在且含 commit hash + 机制说明，才进入第 1 步。

## 第 1 步 · 证据层抽象

- [ ] 抽出 `localEvidence(el)`（只读，无副作用），返回 `design.md §2` 的结构
- [ ] 单测：证据分类矩阵（已解码 / 未解码有 box / 无 box / 隐藏 / 有内联提示）
- [ ] 单测：`localEvidence` 不触发强制布局（避免 layout thrash；用调用计数断言）

## 第 2 步 · 三档判定接线

- [ ] `processImage` 改造为档位分派：A→既有像素管线，B→上下文判定，C→登记 pending
- [ ] 档 B 输出约束：只允许 `keep` 或命中既有种子/学习规则 → 单测断言
- [ ] `pending` 登记表有界（上限+LRU），并能被 IO/Mutation/load 唤醒 → 单测断言唤醒路径
- [ ] 增加原因码 `local-context` / `local-inline-hint` / `pending-no-evidence`，落入决策报告

**Gate**：`node test.js` 全绿 + bench 新场景绿。

## 第 3 步 · 弱网抢先（首屏 500ms）

- [ ] 首屏路径不依赖 `load`：`runEagerPass` 不再以 `complete` 为唯一门（改为 `localEvidence` 档位）
- [ ] 保留 2500/6000/12000ms 补扫作为**兜底**而非主路径（注释明确）
- [ ] 探针：限速下首屏可见媒体 ≤500ms 完成判定（输出时间戳 JSON）

## 第 4 步 · 联网路径收敛

- [ ] grep 全量联网调用点，形成清单（`gmFetchText` / `fetch(` / `XMLHttpRequest` / `@connect`）
- [ ] 移除非用户动作触发的调用；`@connect *` 收敛为白名单或移除
- [ ] 单测/断言：`gmFetchText` 唯一调用点位于用户动作处理器内（行号断言或函数引用断言）
- [ ] 若保留手动导入：UI 文案明确标注"手动导入（需联网）"

## 第 5 步 · 三态一致性验证

- [ ] 正常网 / 限速 / 断网 三态下，同页面稳态决策集合一致（除未加载资源）→ 对比 JSON 摘要
- [ ] soak：5 次重载稳态一致（`dev/probe-soak.js` 思路）
- [ ] 决策一致性不变量单测（decide-once）保持绿

## 第 6 步 · 收口

- [ ] 四绿门禁：`node --check` / `node test.js` / `node test-browser.js` / `build-extension.js && pack.js`
- [ ] 结论写回 `.trellis/spec/frontend/quality-guidelines.md`（新增「本地优先判定」小节）
- [ ] 勾选本文件全部条目 + 回写 prd Acceptance Criteria
- [ ] **不提交**（实现代理禁止 git commit；由主代理统一提交）

## 回滚点

- R1：第 0 步后（复现报告已产出，未改代码）——纯证据产出，无回滚成本
- R2：第 2 步后（档位分派接线完成）——保留 `state.localFirstDecide` 开关，置 false 即回到旧行为
- R3：第 4 步前（联网路径收敛前）——收敛是独立提交，可单独 revert
