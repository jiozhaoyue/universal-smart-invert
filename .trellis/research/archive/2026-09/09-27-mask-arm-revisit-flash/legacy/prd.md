# 复访零白闪遮蔽未武装（pendingMask.armed 恒 false）

## Goal

**缺陷**：扩展形态下「文档黑底 + 元素遮罩」档（`flashGuardLevel: 'media'`）**完全不生效** ——
`pendingMask.armed` 恒为 `false`，元素级 pending 遮罩从未武装，README §13 承诺的
「真正的首帧前遮罩只有扩展形态做得到」在扩展形态里落空。

**根因（已定位，两处同一类）**：一次性启动动作与**异步存储引导**赛跑，且就绪后不重放：

1. `setupPendingMask()` 经 `whenRootReady()` **只跑一次**（根就绪 ≈ `document_start`，
   `universal-smart-invert.user.js:16441`）；此刻 `state` 仍是**引导期默认值**
   `flashGuardLevel: 'document'`（`:260`）→ 在 `:16376` 早退，遮罩不武装。
2. 远端 prefs 装载完成后的钩子 `reapplyPrefsFromStore`（`:16705`）只重放
   CSS / dim / peek / maskVars，**不重放 `setupPendingMask`** → 用户选的 `media` 档永不落地。

用户脚本形态不受影响（GM/内存后端在构造期同步装载，prefs 首跑即就位）——这正是 v6.6 修
「根未就绪」（`:16439` 注释）时**漏掉的另一半**，属同一缺陷类。测试自身注释
（`test-extension.js:493`）已记录这半边的坑。

**症状**：真扩展 E2E 的「复访必须零白闪」断言时红时绿（靠判定速度侥幸），
`maskArmed: false` 在含基线的**每一次**跑动都出现。

## Requirements

### R1 产品修：元素遮罩在远端 prefs 就绪后重放（幂等）

- 在 **store 就绪路径**上重放 `setupPendingMask()`（走既有的 `reapplyPrefsFromStore` 或等价的
  就绪钩子），使「用户选了 `media` 档」在扩展形态真正落地。
- **幂等**：重复调用不得重复建 observer、不得重复计数。必须复用既有守卫
  （`data-svi-masking` 属性 + `pendingMask.armed`，`:16379`/`:16387`），**不新增状态字段**。
- **三条路径都要正确**：
  ① chrome 后端远端装载完成（`onRemoteLoaded`）；
  ② 同步后端（GM/内存，构造期即就绪）——首跑就必须正确，不得因改动退化；
  ③ 跨界面偏好同步（`chrome.storage.onChanged` → `resyncLogical` → `reapplyPrefsFromStore`，
  `:16735`）——用户在设置页把该档打开时，**开着的页面应即时武装**。

### R2 消除 `siteMediaStore` 的「预引导空值永久记忆」隐患

`siteMediaStore.load()`（`:2941`）把首次读到的值**永久记忆**在 `this.data`；若该次发生在
`Store.ready === false` 时，读到的是空 `{}`，此后同一页内 `stats()` 永远返回 0 样本 →
门判永远判「不武装」。要求：
- `Store.ready === false` 时**不得**把空对象记忆下来（返回空值但可重读）；
- 保持 `load()` 的既有语义（同步、零成本、无副作用）与既有单测契约不变；
- 修后必须证明：同一页内，远端装载完成后 `stats(host).seen` 能反映真实样本。

### R3 夹具配档：让 `media` 档被真实覆盖

`test-extension.js` 当前**从未设置** `flashGuardLevel`（默认 `document`），因此元素遮罩逻辑
在扩展 E2E 里根本没被覆盖。要求：夹具显式把该档设为 `'media'`，并在此配置下断言
「远端装载后该档生效、遮罩已武装」。

### R4 断言口径（条件触发）

若产品修好后「复访必须零白闪」仍因**首屏图片插入早于武装时点**而偶发，则把该断言收敛到
**文档化契约**（README §13）：
- 首访**一律不遮**（允许白闪）；
- 元素遮罩覆盖「武装之后**新插入**的媒体」，首屏由文档黑底兜底。

收敛时**必须保留非空真守卫**（现有 `invCount >= 1`），不得让「零白闪」退化成空真。

### R5 不得越界

- **不得放宽任何既有断言换绿**；R4 的收敛只允许按文档化契约收窄语义，不允许删断言。
- 不改 `svi:*` 存储键面与语义；不改 `REGION_MASK_VERSION`（区域掩码契约冻结）。
- 不改三道保险（预算 / 失败必放行 / Esc 逃生）的行为。

### R6 门禁

六道全绿，且 `test-extension.js` **连跑多次稳定**（不只一次侥幸绿）。
`test-extension.js` 的 harness 级偶发（`classList` TypeError）另属
`09-27-ext-e2e-harness-flake`，本片不修，但必须如实区分两者的红。

## Acceptance Criteria

- [ ] **AC1** 扩展形态、`flashGuardLevel='media'`、本站样本达标（≥5 且反色率 ≥35%）时：
      远端装载完成后 `window.__svi.pendingMask.armed === true`，且 `document.documentElement`
      带 `data-svi-masking` 属性。
- [ ] **AC2** **首访不遮**仍成立：样本不足或反色率不达标时 `armed === false`（README §13 文档化行为）。
- [ ] **AC3** 用户脚本形态零回归：`node test.js` 绿、`node test-browser.js` 33 场景绿。
- [ ] **AC4** `test-extension.js` **连跑 ≥5 次全绿**（含场景 2 的断言；若按 R4 收敛，则收敛后同样 ≥5 次全绿），
      且红/绿都必须点名是**哪条断言**，不得出现无法归属的失败。
- [ ] **AC5** 「绝不伤人」三道保险未被削弱：预算（默认 1.2s / 80 元素 / 单元素 0.8s）、
      判定失败必放行、Esc 逃生 —— 由既有场景（29 遮罩档场景等）覆盖并通过。
- [ ] **AC6** `node --check` 通过；`git diff` 只动本片相关区域，且**新增注释写明根因**
      （一次性启动动作 vs 异步引导 + 就绪后必须重放），便于后来者不再踩。
- [ ] **AC7** 六道门禁实测留档；提交并推送到 `origin main`。

## Constraints

- 修点必须落在**既有约定**内：仓库已确立「启动动作必须在依赖状态就绪后重放」的先例
  （`whenRootReady` 之于根、`Store.onRemoteLoaded`→`reapplyPrefsFromStore` 之于偏好），
  本片是**补齐同一个约定的漏项**，不得另起一套机制。
- `setupPendingMask` 的调用必须幂等；不得引入新的全局状态位。
- 不新增依赖、不引 CDN；UI 字符串中文、标识符 ASCII。
- 本片不改版本号（发版收口在 `09-27-v6-release-closeout` 内，其改动已 stash，待本片提交后回填）。

## Non-goals

- 不修 `test-extension.js` 的 harness 级偶发（另任务）。
- 不引入「同步信号 / localStorage 门判定镜像」这类架构级方案（本轮已裁决不走；
  若日后要真正做到**首屏插入前**武装，再单独立项）。
- 不改元素遮罩的触发门阈值语义（强制规则 / 学习规则 / 反色率门 / 面板强制）。

## 背景与裁决记录

| 日期 | 裁决点 | 结论 | 来源 |
| :--- | :--- | :--- | :--- |
| 2026-09-27 | 门禁 4 既有偶发是否先修再提交 | **先修缺陷再提交** | 用户 |
| 2026-09-27 | 缺陷成因归属 | 与本片版本号重置**无关**（基线同样失败 + 受控 A/B 交替实验 A/B 各有红有绿） | `09-27-v6-release-closeout` 取证 |
| 2026-09-27 | 修复路线 | **产品修 + 夹具配档**（不走同步信号架构方案，也不只改测试） | 用户 |
| 2026-09-27 | 修后仍因首屏时机偶发时 | **改断言到文档化契约**（保留非空真守卫） | 用户 |

## Notes

- 本缺陷在 journal 中已连续三轮登记（「复访时门判可武装但 `pendingMask.armed` 实测 false」），
  本片首次给出根因与修法。
- 详细设计见 `design.md`，执行清单见 `implement.md`，取证落在 `notes.md`。
