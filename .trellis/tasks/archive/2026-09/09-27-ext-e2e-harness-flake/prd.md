# 真扩展 E2E / 单测脚手架的假红与假绿源（harness 健壮性）

## Goal

`test-extension.js` 与 `test.js` 长期存在「失败无法归因、或归因到错误的话」的问题：本片把**三类假红源**
钉死并修掉可修的两类，同时确立**测量口径**（真红 / SKIP / 基础设施抖动不得混算），
使门禁的「绿」重新可信。

触发背景：`09-27-mask-arm-revisit-flash` 的归因过程中，六绿反复无法达成，逐条挖出下列缺陷 ——
它们**都不是**该片的 mask 缺陷，而是脚手架自身的健壮性问题。

## Requirements

### R1 H1：`test-extension.js` 的 `booted` 裸空指针（本片已修）

```js
const booted = async () => (await P.ev('document.documentElement.classList.contains("svi-img-invert-on")')) === true;
```
导航刚提交、`<html>` 尚未创建的瞬间 `documentElement` 为 `null` → 抛
`TypeError: Cannot read properties of null (reading 'classList')`。它抛的是**裸异常**而不是
「尚未就绪」，会把整轮 `waitFor` 直接打断（实测占某批失败 **3/6**）。
修法：空值守卫，把该状态如实表达为「未就绪」。

### R2 H2a：`test.js` 8e-2 的固定等待（本片已修）

该块以 `setTimeout(…, 40)` 等 `st.set('prefs', …)` 落盘，但 `prefs` 走**分片写链**
（十几次串行 1ms mock 往返）→ 机器一忙就在 40ms 内写不完 → 快照落在链条中间 →
重组的远端命名空间缺 `prefs` → 断言红（**基线 5 跑 2 绿**）。
修法：用项目自有的 `pollUntil` 做**有界轮询**（谓词 = 快照里已能重组出 `brightness=0.77` 的 `svi:prefs`），
超时后照样进主体、由断言如实报红。

### R3 H2b：`.catch` 掩盖真实失败（本片已修）

同块的 `st2.init().then(...).catch(() => assert.fail('init() should not reject'))` 会把
`.then()` 内部的**断言失败**一并吞掉，把 `brightness` 断言失败伪装成一句与事实不符的话（误导诊断）。
修法：把真实 `e.message` 带进失败信息。

### R4 测量口径（本片确立）

| 类别 | 判据 | 是否算红 |
| :--- | :--- | :--- |
| 真红 | 打印 `真扩展 E2E 失败: <断言名>` | **是** |
| SKIP | `SKIP: 未验证 (CDP 未就绪)`（文档化降级路径，exit 0） | **否**（但要如实计入「未验证」次数） |
| 基础设施抖动 | `CDP 超时 (Runtime.enable)`、`等待超时: 复访: 探针攒够 60 帧`（rAF 停滞） | 否，但要**单独计数并点名** |

要求：任何一次门禁汇报都必须分开列这三类，**不得把 skip 当绿、也不得把抖动当产品回归**。

### R5 不越界

- 不放宽任何断言；不得把 SKIP 改成静默绿。
- 不改产品代码（本片纯测试侧）。
- 不合并 `09-27-mask-arm-revisit-flash` 的产品改动。

## Acceptance Criteria

- [x] **AC1** `test.js` 连跑 5 次全绿（基线 5 跑 2 绿）——实测 **5/5** ✓
- [x] **AC2** `test-extension.js` 的 `classList` 类失败归零（基线 3/6）——实测归零 ✓
- [x] **AC3** H1/H2 修后**仍能如实报红**：R2 的轮询在「快照里尚无 prefs」时走超时分支 → 断言报红
      （同 `pollUntil` 的既有契约：超时后走同一组断言，不吞失败）
- [ ] **AC4** 六道门禁实测留档；提交推送
- [ ] **AC5** 残留的既有抖动清单（场景 8 跨界面回写、站点重置计数、CDP 超时、rAF 停滞）
      登记在 notes，供后续按需收敛（**不**在本片承诺清零）

## Non-goals

- 不追求 `test-extension.js` 的「≥5 次连绿」：残留抖动含基础设施因素（CDP/浏览器），
  且多个场景用固定等待同步防抖写 —— 系统性收敛属另一片。
- 不动 `dev/`、`scripts/` 下的探针。

## 背景与裁决记录

| 日期 | 裁决点 | 结论 | 来源 |
| :--- | :--- | :--- | :--- |
| 2026-09-27 | 本任务立项 | 由 mask 缺陷归因过程中暴露的脚手架问题派生 | 用户 |
| 2026-09-27 | H1/H2 是否现在修 | **顺手修**（另立任务，不并入 mask 片） | 用户 |
| 2026-09-27 | 提交顺序 | mask → 收口；本片（纯测试侧）作为前置先提交 | 用户 + 主代理编排 |

## Notes

- **流程如实记录**：H1/H2 的代码改动先于本文件写出（用户在提问中直接授权「顺手修」）。
  产物随后补齐，测量证据在 `notes.md`。
- 详细设计与测量见 `design.md` / `notes.md` / `implement.md`。
