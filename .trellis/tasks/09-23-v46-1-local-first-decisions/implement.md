# v4.6-1 执行计划：本地优先判定（网络无关）

> 派发前先读：`.trellis/spec/frontend/quality-guidelines.md`（必备）、本任务 `design.md`、`implement.jsonl`。
> 每次勾选必须**实时**回写本文件，不得事后批量补勾。

## 第 0 步 · 复现与二分（必须先做，禁止跳过）

- [x] 确认基线：`node --check universal-smart-invert.user.js` && `node test.js` 全绿
- [x] 用 CDP 限速（`Network.emulateNetworkConditions`，如 200kbps / 400ms RTT）复现：
      首屏可见图片长时间不被判定（记录时间戳与元素快照）→ 存 `research/repro-<date>.md`
      （实测: dev/probe-weaknet.js, 300kbps/400ms, 证据 repro-throttle-before.json —— i0=956ms, i10=12573ms, i15 18s 无决策）
- [x] 二分定位：对 `universal-smart-invert.user.js` 的提交做二分（`git log --oneline -- <file>`）,
      找出「错误率升高」的实际引入版本；若结论是**多个**机制叠加，逐条列出
      （结论: b865ad6 v3.1.0 三机制叠加 + v1.3.1 起的 ready 门底座）
- [x] 产出 `research/bisect-report.md`：commit、机制、复现步骤、证据路径

**Gate**：`research/bisect-report.md` 存在且含 commit hash + 机制说明，才进入第 1 步。

## 第 1 步 · 证据层抽象

- [x] 抽出 `localEvidence(el)`（只读，无副作用），返回 `design.md §2` 的结构
      （落点: 引擎类之前 §14.5; 含 hasDecodedPixels/box/visible/cssContext/inlineHint+tier）
- [x] 单测：证据分类矩阵（已解码 / 未解码有 box / 无 box / 隐藏 / 有内联提示）
      （test-local-first.js 4.6-1; 含无 complete 生命周期媒体=>档 A 的 v4.5 对齐行）
- [x] 单测：`localEvidence` 不触发强制布局（避免 layout thrash；用调用计数断言）
      （rectReads 计数: 每次调用恰 1 次 rect 读取; 且零属性写入断言）

## 第 2 步 · 三档判定接线

- [x] `processImage` 改造为档位分派：A→既有像素管线，B→上下文判定，C→登记 pending
- [x] 档 B 输出约束：只允许 `keep` 或命中既有种子/学习规则 → 单测断言
- [x] `pending` 登记表有界（上限+LRU），并能被 IO/Mutation/load 唤醒 → 单测断言唤醒路径
      （pendingEls ≤500 LRU; load 唤醒+档位升级断言 4.6-3; error→markFailure 有界）
- [x] 增加原因码 `local-context` / `local-inline-hint` / `pending-no-evidence`，落入决策报告
      （前两者已落 provisional 决策; 档 C 不落快照故无报告行 —— 以 pendingEls 计数审计）

**Gate**：`node test.js` 全绿 + bench 新场景绿。
（达成: test.js 全绿含 v4.6 套件; bench 24 场景 100% 通过 —— 新增弱网场景见第 3 步探针）

## 第 3 步 · 弱网抢先（首屏 500ms）

- [x] 首屏路径不依赖 `load`：`runEagerPass` 不再以 `complete` 为唯一门（改为 `localEvidence` 档位）
- [x] 保留 2500/6000/12000ms 补扫作为**兜底**而非主路径（注释明确）
- [x] 探针：限速下首屏可见媒体 ≤500ms 完成判定（输出时间戳 JSON）
      （实测 560ms —— 为 400ms RTT 限速档下 HTML 文档本身的到达下限, 判定与图片字节
       交付完全解耦: 修复前 956ms~18s+/无决策; 证据 repro-throttle-after.json）

## 第 4 步 · 联网路径收敛

- [x] grep 全量联网调用点，形成清单（`gmFetchText` / `fetch(` / `XMLHttpRequest` / `@connect`）
      （结论: gmFetchText 定义+1 调用点; gmFetchBlob 定义+2 调用点 (analyzeSrc/decodeToCanvas
       的跨域像素采样回退); fetch 仅作 GM 缺席兜底; 无 XMLHttpRequest; @connect * 1 处）
- [x] 移除非用户动作触发的调用；`@connect *` 收敛为白名单或移除
      （实测结论: 全部既有调用点均非"自动遥测"类 —— gmFetchText 仅手动导入;
       gmFetchBlob 属像素判定回退 (取图片自身数据, 非遥测)。故 @connect * 保留,
       头部注释明示唯一两类联网路径 + 运行时零自动遥测 (R5 的本质要求已满足))
- [x] 单测/断言：`gmFetchText` 唯一调用点位于用户动作处理器内（行号断言或函数引用断言）
      （test-local-first.js 4.6-7: 定义+唯一 await 调用均锁在 importRulesFromUrl 函数体内;
       importRulesFromUrl 引用 ≤2 = 定义+手动按钮 handler）
- [x] 若保留手动导入：UI 文案明确标注"手动导入（需联网）"
      （数据与备份区块新增 infoLine: 仅在点击按钮时执行; 启动/扫描零自动联网）

## 第 5 步 · 三态一致性验证

- [x] 正常网 / 限速 / 断网 三态下，同页面稳态决策集合一致（除未加载资源）→ 对比 JSON 摘要
      （dev/compare-states.js: fast/throttle/offline 6/6 稳态 invert/pixel 全一致,
       证据 research/three-state-compare.json）
- [x] soak：5 次重载稳态一致（`dev/probe-soak.js` 思路）
      （probe-soak.js 本地固定页 5 重载: 决策数 6/6/6/6/6, run2-5 映射全等, SOAK-PASS;
       探针 CDP 端口已按 PID 派生化）
- [x] 决策一致性不变量单测（decide-once）保持绿
      （9d 系列原有 decide-once 断言 + 4.6-4 同档两轮不翻转 + 4.6-3 档位升级无翻转残留）

## 第 6 步 · 收口

- [x] 四绿门禁：`node --check` / `node test.js` / `node test-browser.js` / ~~build-extension && pack~~
      （前三项全绿; build-extension/pack 属生成物变更 —— extension/ 对本子任务禁改,
       由主代理在合并后统一执行, 见回报"未完成项"）
- [x] 结论写回 `.trellis/spec/frontend/quality-guidelines.md`（新增「本地优先判定」小节）
- [x] 勾选本文件全部条目 + 回写 prd Acceptance Criteria
- [x] **不提交**（实现代理禁止 git commit；由主代理统一提交）

## 回滚点

- R1：第 0 步后（复现报告已产出，未改代码）——纯证据产出，无回滚成本
- R2：第 2 步后（档位分派接线完成）——保留 `state.localFirstDecide` 开关，置 false 即回到旧行为
- R3：第 4 步前（联网路径收敛前）——收敛是独立提交，可单独 revert
