# notes.md — 元素遮罩重新武装（执行留证）

## D0 基线（`5.0.0` 原始树，改前）

3 次连跑：run1 harness `classList` TypeError；run2 零白闪断言红；run3 绿。
**三次的 `maskArmed` 全为 `false`，且探针时间线里 `pending@-`（遮罩从未武装）** ——
run3 之所以绿，是因为判定够快（`门类@40ms 反色@54ms`），不是遮罩起了作用。
`test.js` 既有契约：`siteMediaStore` 相关用例在 `test.js:3005-3016`（`data=null` → `record` → `stats/rate`）。

## D1 产品修（定稿：两处）

| 改动 | 位置 | 内容 |
| :--- | :--- | :--- |
| ① 就绪后重放武装 | `reapplyPrefsFromStore()` 末尾 | 补 `setupPendingMask()`（幂等：`data-svi-masking` / `maskPaused` / 配置门三重守卫，不新增状态字段） |
| ② 清掉引导期空记忆 | 同函数开头 | `siteMediaStore.data = null;` —— `load()` 把首次读到的值永久记忆；扩展形态下首次读取可能早于远端装载，记忆下来的就是空 `{}` → 同页内 `stats()` 恒 0 样本 |

**为什么走「清一次」而不是改 `load()` 本体**：`load()` 的记忆化语义被单测钉着（`test.js:3005`），
而在「就绪前记录样本」这一角落，改本体还会改变与远端值的覆盖关系；清一次的副作用面最小。

**三条路径复核**：chrome 远端装载 ✅（本片修复点）；同步后端（GM/内存）不受影响（构造期即装载，
首跑即正确，重放被 `data-svi-masking` 挡住）；跨界面改档 ✅（`onChanged → resyncLogical →
reapplyPrefsFromStore` 同一钩子）。

## D2 夹具配档 + 契约化断言

- **配档**：复访前经产品协议（`prefs.flashGuardLevel = 'media'` + `savePrefs()` + 等 900ms 落盘）
  写入，并在场景末**还原**为原值（避免后续像素/元素比对场景在元素遮罩档下跑）。
  时机选在首访**之后**：首访按默认档跑，符合 README §13「首访一律不遮」。
- **确定性机制断言**（不依赖帧时序）：`tier === 'media'`、`armed && maskArmed === true`、
  `data-svi-masking` 在场；外加纯函数口径的「无样本一律不遮」。
- **契约化断言（R4 触发）**：旧断言「复访整体零白闪」被替换 —— README §13 文档化的保证是
  「首访不遮 + 遮罩覆盖**武装之后新插入**的媒体，首屏由黑底兜底」。首屏图片插入早于武装时点
  （武装需等远端装载），机制上覆盖不到；改为注入一张图并断言它**从未**处于「可见且未标记」状态
  （跨世界读数：`__fp` 住在探针世界，隔离世界读不到 —— 否则 `bare: null` 会**空真通过**）。
  首屏白闪帧数改为**证据**打印。

## 负向对照（证明断言咬得住）

| 对照 | 未修复代码上的实测 |
| :--- | :--- |
| NC-1 `maskArmed` 断言 | ❌ `armed=true, maskArmed=false, reason=本站尚无历史记录（首访不遮，宁可白闪一次也不白藏）` |
| NC-2 **隔离**对照（临时降级 `maskArmed`/`masking` 两条后单测契约断言） | ❌ `武装后新插入媒体: {"bare":{"firstAt":878,"frames":49}, loaded:true}` —— 注入的图裸奔 **49 帧**，断言以精确信息变红 |

两条都证明新断言在缺陷存在时**必红**（不是空真）。

## D3 实测（含修复）

| 批次 | 结果 | 失败构成 |
| :--- | :--- | :--- |
| 首轮 5 次（仅 D1+D2） | 1/5 | harness `classList` ×2；`maskArmed` ×1；场景 5 偏好存活 ×1 |
| 加「样本落盘轮询」后 5 次 | 3/5 | `maskArmed` ×1；harness `classList` ×1 |
| 再 4 次 | 4/4 | — |
| 换 `Store.pending` 口径轮询后 6 次 | 1/6 | harness `classList` ×3；`booted` 超时 ×1；「至少要有一张图被判反色」空真守卫 ×1 |

**结论**：`maskArmed` 类失败在最后两批里**消失**（修复生效），剩下的红全部落在**既有、与本片无关**的
harness/test 缺陷上（见下）；因此「≥5 次连绿」在本机当前状态下**无法达成**，
但每一条红都能归属到**具体断言**，没有无法归属的失败。

## 同轮发现的另外两处既有缺陷（**不在本片范围**，分属 `09-27-ext-e2e-harness-flake`）

### H1 `test-extension.js:334` 空指针（本片失败的**主因**，最后一批 3/6）

```js
const booted = async () => (await P.ev('document.documentElement.classList.contains("svi-img-invert-on")')) === true;
```
导航刚提交、`<html>` 尚未创建的瞬间 `documentElement` 为 `null` → 抛
`Cannot read properties of null (reading 'classList')`，与观测到的失败文案**逐字一致**。
修法即加空值守卫（`!!(document.documentElement && …)`）并让 `waitFor` 把求值异常当「未就绪」重试。

### H2 `test.js:968` 跨用例竞态 + 失败被掩盖

```js
st2.init().then(() => { const p = st2.get('prefs');
  assert.ok(p && p.brightness === 0.77, 'init() loads remote namespace into mirror after boot …'); … })
  .catch(() => { assert.fail('init() should not reject'); });   // ← 把 .then 里的断言失败也吞了
```
实测基线（无本片改动）**5 跑 2 绿**、含修复 6 跑 3 绿 —— 与本片无关的既有偶发。
真实原因（临时拆掉 `.catch` 掩盖层后取到）：`brightness === 0.77` 依赖前一个用例 400ms 防抖写
已落盘，属跨用例竞态；而 `.catch` 让真实失败伪装成 `init() should not reject`（**误导诊断**）。

## 本机行尾陷阱（同 `09-27-v6-release-closeout/notes.md` §P4，本片再次踩到）

`git checkout` / `git apply` / `git stash push|pop` 都会按 `core.autocrlf=true` 把工作区写成 CRLF：

- CRLF 会让 `test.js` 的源码扫描正则失配 → `AssertionError: R1: exte…`（token 块逐字节断言）等
  **假红**，本片基线 A/B 时曾因此 5/5 全红、误判为"基线也坏"。
- **配方**：任何 git 动作之后，先把文本文件归一到 LF（`b.replace(b'\r\n', b'\n')`），
  再**重建** `extension/`，然后再跑门禁。

## 附：本片未做的事（如实记录）

- **不**在 `record()` 里补武装尝试：样本里含**本次访问自己的决策**，那样会让「首访一律不遮」
  在首访第 5 次决策后失效 —— 改变已文档化行为，超出「按契约收窄」的授权范围，故撤回。
- **不**引入同步信号（localStorage 门判定镜像）：那是唯一能让武装早于**首屏插入**的方案，
  已在裁决中排除。
- **不**修 H1/H2（另任务）。
