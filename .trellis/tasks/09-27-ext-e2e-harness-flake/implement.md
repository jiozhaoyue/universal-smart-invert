# implement.md — 脚手架假红源收口（执行清单）

> 复选框随执行实时勾选。

## 阶段 H0 — 取证与定位

- [x] H0.1 从 mask 片归因中收集失败样本，按文案分组：`classList` TypeError（3/6）、
      `init() should not reject`（基线 2/5 红）、`CDP 超时`、`探针攒够 60 帧` 超时
- [x] H0.2 用**临时拆掉掩盖层**的办法取到 `init()` 用例的真实失败断言：
      `brightness === 0.77`（跨用例防抖落盘竞态），而非「init reject」
- [x] H0.3 定位 H1 到行：`test-extension.js:334`；H2 到行：`test.js:930-971`（8e-2 块）

## 阶段 H1 — 修 `booted` 空指针

- [x] H1.1 加空值守卫：`!!(document.documentElement && document.documentElement.classList.contains(...))`
- [x] H1.2 验证：`classList` 类失败归零（本批 0/6），且原语义不变（`waitFor` 继续重试到门类落地）

## 阶段 H2 — 修 8e-2 的固定等待与掩盖层

- [x] H2.1 固定 `setTimeout(…, 40)` → `pollUntil(readyToSnapshot, cb)`；
      谓词取「快照里已能重组出 `brightness=0.77` 的 `svi:prefs`」（覆盖分片链中间态）
- [x] H2.2 `.catch` 带出真实 `e.message`（不再把断言失败伪装成「init reject」）
- [x] H2.3 验证：`test.js` 连跑 5 次 → **5/5 绿**（基线 5 跑 2 绿）
- [x] H2.4 超时分支仍走同一组断言（`pollUntil` 既有契约，未改） → 真实缺陷照样红

## 阶段 H3 — 口径与门禁

- [x] H3.1 三分口径落 `design.md §4`：真红 / SKIP 未验证 / 基础设施抖动
- [x] H3.2 `test-browser.js` 连跑 3 次 → **3/3 全过（33 场景）**
- [ ] H3.3 残留抖动清单登记（`design.md §5`），本片不承诺清零
- [ ] H3.4 提交并推送（提交信息须写明：纯测试侧、H1/H2 各自的前后测量值）

## 不做什么

- 不放宽任何断言；不把 SKIP 改成静默绿
- 不修产品代码；不并片 `09-27-mask-arm-revisit-flash`
- 不追求 `test-extension.js` 连绿（残留抖动含基础设施与多场景固定等待，另立）
