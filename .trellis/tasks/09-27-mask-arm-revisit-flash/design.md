# Design: 元素遮罩在扩展形态下重新武装

## 1. 根因链（逐环带行号）

```
document_start (扩展形态)
  │
  ├─ Store 构造: 异步后端不在此装载 → mirror 为空, ready=false        (:342/:530)
  │
  ├─ whenRootReady(setupPendingMask)                                  (:16441)
  │     └─ 根就绪 ≈ document_start → 立即执行 setupPendingMask()
  │           ├─ state.flashGuardLevel —— 此刻是**引导期默认值** 'document' (:260)
  │           │      （state = loadState() 读的是 mirror, 远端 prefs 还没进来）
  │           └─ :16376 早退 → pendingMask.armed 保持 false  ★①
  │
  ├─ … 页面继续解析, 首屏 <img> 陆续插入 …
  │     └─ 即便有 observer, 它还没建立（武装才建, :16390）
  │
  └─ Store.init() 完成 (await chrome.storage)
        ├─ mirror 填充 svi:prefs / svi:siteMedia
        ├─ ready = true                                              (:621)
        └─ Store.onRemoteLoaded() → reapplyPrefsFromStore()          (:16705)
              └─ state = loadState()           ← 此时 media 档才读到
                 updateImageFilterCss / applyVideoTune / updateFontCss /
                 syncMaskVars / setPeekGate / applyPageDim
                 ★② 唯独没有 setupPendingMask() —— 遮罩永不武装
```

**同一缺陷类的既有先例**（本片只是补齐漏项，不另起机制）：

| 依赖的异步状态 | 已有重放点 | 状态 |
| :--- | :--- | :--- |
| 根节点 `documentElement` | `whenRootReady` 三通道补挂（v6.6 修） | ✅ 已修 |
| 远端偏好 `svi:prefs` | `Store.onRemoteLoaded → reapplyPrefsFromStore` | ⚠️ 重放了多数动作，**漏了 `setupPendingMask`** |
| 本站样本 `svi:siteMedia` | 同一次 `Store.init()` 装载（同一 mirror） | ⚠️ 依赖 `siteMediaStore.load()` 的读取时机，见 §3 |

**为什么用户脚本形态看不出这个缺陷**：GM / 内存后端在**构造期同步装载**（`:530` 注释「仅同步后端在此完成装载」），
`whenRootReady(setupPendingMask)` 执行时 mirror 已有 `svi:prefs` → `state` 直接是 `media` 档 → 遮罩正常武装。
所以缺陷只在**扩展形态**（异步 `chrome.storage`）可见 —— 与「真扩展 E2E 才报」完全吻合。

## 2. 修点与幂等论证

**修点**：在 `reapplyPrefsFromStore()` 末尾补一次 `setupPendingMask()`。

**幂等性由既有守卫保证，无需新状态**：

```js
function setupPendingMask() {
  if (state.flashGuardLevel !== 'media' || state.maskPending === false) return;  // 配置门
  if (runtime.maskPaused) return;                                               // 逃生后不复活
  const de = document.documentElement;
  if (!de || de.hasAttribute('data-svi-masking')) return;   // ★ 已武装过 → 直接返回
  const gate = pendingMaskGate();
  if (!gate.armed) { runtime.pendingMaskReason = gate.reason; return; }         // 门未过 → 不武装
  de.setAttribute('data-svi-masking', '1');
  pendingMask.armed = true;
  … 建 observer（仅此处）…
}
```

- 已武装：`data-svi-masking` 在场 → 第二次调用直接返回 → **不会重复建 observer**、不会重复计数。
- 未武装且门未过：设 `reason` 后返回，状态无副作用 → 可安全重复调用（幂等）。
- `runtime.maskPaused`（Esc 逃生后本会话暂停）优先于一切 → 重放**不会**让用户已放弃的遮罩复活。

**三条路径的覆盖**：

| 路径 | 是否被本修点覆盖 | 说明 |
| :--- | :--- | :--- |
| chrome 远端装载完成 | ✅ | `onRemoteLoaded` 直调 `reapplyPrefsFromStore` |
| 同步后端（GM/内存） | ✅ 不受影响 | 首跑即武装；重放被 `data-svi-masking` 挡住 |
| 跨界面同步（设置页改档） | ✅ | `onChanged` → `resyncLogical` → `reapplyPrefsFromStore`（`:16735`） |

> 不改用 `whenStoreReady(fn)` 之类的**新**通用钩子：`Store.onRemoteLoaded` 是**单槽**回调
> （`:16705` 已占用），新增通用钩子需先改造它为列表 —— 属更大的改动面，且本片只需一个动作。
> 若将来有第二个「须在 store 就绪后重放」的动作，再统一抽钩子（届时是纯重构）。

## 3. `siteMediaStore` 的预引导空值记忆（隐患，与 §2 同因）

```js
load() {
  if (this.data) return this.data;              // ← 记忆化
  let d = null; try { d = Store.get(SITE_MEDIA_KEY, null); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
  this.data = d;                                 // ← 若此刻 Store 未就绪, 空对象被永久记忆
  return d;
}
```

`Store.get` 只读镜像（`:736`）。若首次 `load()` 发生在 `ready=false`，空对象被永久记忆 →
同一页内 `stats()` 恒为 0 样本 → 门判恒「不武装」。

**修法（保持同步与零成本语义）**：仅在 `Store.ready` 为真时记忆；未就绪时返回空对象用于本次判定，
但不写 `this.data`，让就绪后的下一次调用重新读取。

```js
load() {
  if (this.data) return this.data;
  let d = null; try { d = Store.get(SITE_MEDIA_KEY, null); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
  try { if (Store && Store.ready) this.data = d; } catch (e) { /* 未就绪: 不记忆 */ }
  return d;
}
```

**风险与对策**：`record()`/`host()` 会通过 `load()` 拿到「未记忆的临时对象」并改写 —— 若写发生在
未就绪期，`Store.set` 仍会把值放进 mirror（`set` 不要求 ready），下次 `load()` 重新从 mirror 取回，
**不会丢数据**。`host()` 有 `d[k] = hd` 的写回，作用于临时对象；对未就绪期的临时对象写入会经
`record→persist→Store.set` 落到 mirror（`persist` 用 `this.load()` 的返回值，等于把临时对象整体写入），
语义与现状一致（现状也是把记忆下来的对象写回）。实施时以既有单测 + 新断言（同页内就绪后 `seen` 反映真实值）证明。

> 若实测发现该修法扰动既有单测契约（`test.js` 有 `siteMediaStore` 相关用例），则退回**最小方案**：
> 只在 §2 的重放点前调用 `siteMediaStore.load()` 之前先 `delete this.data`（即就绪后强制重读一次），
> 不动 `load()` 本体。两种方案的对外行为等价，取扰动小者。

## 4. 时序论证：武装时点 vs 首屏插入（决定 R4 是否触发）

武装发生在 `Store.init()` 完成之后（本地夹具实测数十毫秒量级），而首屏 `<img>` 由解析器在
`document_start` 之后立刻插入。因此存在两种情形：

| 情形 | 结果 | 断言是否可稳定成立 |
| :--- | :--- | :--- |
| 武装**早于**该图插入 | observer 捕获插入 → 打 `data-svi-pending` → 判定完成才放行 | ✅ 零白闪 |
| 武装**晚于**该图插入 | 该图未被标记（`tagInlineMedia` 刻意不做首屏扫描，`:16358`）→ 以原色示人至判定落定 | ❌ 有白闪 |

**判据（实测）**：修后跑 `test-extension.js`，看场景 2 打印的
`门类@Xms / pending@Yms / 反色@Zms`：若 `pending@` 有值且早于图片被观测到的 `firstAt`，
说明武装赶上了；若 `pending` 仍为 `-`（探针从未见到 `data-svi-pending`），说明武装晚于首屏或未武装。
- 稳定绿 → 保留强断言（R4 不触发）。
- 仍偶发 → 按 R4 收敛到文档化契约（README §13），**保留非空真守卫**。

> 本片**不做**「同步信号（localStorage 门判定镜像）」——那是唯一能让武装**早于首屏插入**的方案，
> 但触及存储写点与隐私面（在站点源下新增一个可被页面读到的键），已在裁决中排除，留作日后立项。

## 5. 验证方法

1. **确定性机制断言**（不依赖帧时序）：页面内直读 `window.__svi.pendingMask.armed` 与
   `documentElement.hasAttribute('data-svi-masking')`，在远端装载完成后取值 → AC1/AC2。
2. **概率下限**：`test-extension.js` **连跑 ≥5 次**（本缺陷的历史表现是「多数红、偶尔绿」，
   单次绿不足以证明修复）→ AC4。同时统计红/绿比与失败断言名。
3. **两类红必须区分**：本片的红（零白闪/武装）vs 另一任务的 harness 偶发（`classList` TypeError）。
   报告中分别计数，不得混为一谈。
4. **零回归**：`test.js` + `test-browser.js`（33 场景，覆盖 v5.5 遮罩档场景）→ AC3/AC5。
5. **非空真守卫**：场景 2 的 `invCount >= 1` 断言必须保留（否则「零白闪」可能空真通过）。

## 6. 回滚

改动集中在 `setupPendingMask` 的调用点、`siteMediaStore.load()` 与测试夹具，可整体 revert。
无数据迁移、无存储键变更；`git revert <commit>` 即恢复（`extension/` 重建后回到原状）。
