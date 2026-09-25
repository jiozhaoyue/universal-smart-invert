# 样式挂载契约 StyleMount（v6.6 定稿）

> **状态**：契约生效（2026-09-26）。凡新增/修改样式注入的改动，一律按本文件执行。
> 与 `region-mask-contract.md` 同族：**单一挂载点 + 冻结契约 + 消费纪律**。

---

## 为什么会有这份契约

`document_start` 注入时（扩展 content script、宿主 document-start 注入、CDP
`Page.addScriptToEvaluateOnNewDocument`），脚本可能在 **`<html>` 尚未创建**时运行 ——
此刻 `document.head` 与 `document.documentElement` **都是 `null`**。

历史写法：

```js
const styleRoot = document.head || document.documentElement;
if (styleRoot) styleRoot.appendChild(el);     // ← 两者皆 null：什么都不做，也不报错
```

**整张 45523 字节样式表被静默丢弃**：无异常、无日志、无痕迹。后果是
`html.svi-img-invert-on img[data-svi-inverted="true"] { filter: … }` 这条规则**根本不存在**，
于是「属性照写、滤镜不生效」——用户看到的就是**「图片没有反色」**。

同族坑在本仓出现过两次：
- **v4.6.1**：`MutationObserver.observe(documentElement)` 在 document_start 为 `null` → 抛错被吞，静默失效；
- **v6.6**：样式挂载点为空 → 整张样式表被丢（本文件要固化的这条）。

判定要点：**这类缺陷的共同特征是「静默」** —— 没有异常、没有日志，所以只能靠
「断言真实生效」而不是「断言没报错」来发现。

---

## 契约

### C1 — 唯一挂载入口 `mountStyleNode(el)`

```js
const styleRoot = sviStyleRoot();      // document.head || document.documentElement || null
mountStyleNode(el);                    // 有根即挂；无根排队，根一出现立即补挂
```

- **有根**：`appendChild` 到 `head`（无 `head` 则 `documentElement`），行为与契约生效前**逐字节等价**。
- **无根**：进 `pendingStyleNodes` 队列，并在根出现的第一时刻按登记顺序补挂。
- **幂等**：带 `id` 的节点做复用 —— 已在场（`getElementById` 命中且 `isConnected`）或已在队列中，
  一律返回既有节点，**绝不产生同 id 双节点**（引擎可能重复 `ensure`）。
- 返回值即「该节点」（可能是队列中的那个），调用方应写回自己的字段：
  `this.styleNode = mountStyleNode(el)`。

### C2 — 禁止裸挂载

以下写法**在新增代码中一律禁止**（现存代码已于 v6.6 全部收口）：

```js
// ❌ 禁止
(document.head || document.documentElement).appendChild(el);
const r = document.head || document.documentElement; if (r) r.appendChild(el);
document.head.appendChild(el);
```

理由：前者在无根时**抛错**（或抛错后被 `try{}` 吞掉 → 静默），后者在 `head` 缺席时同样抛错。
两者都绕过了队列机制。

### C3 — 根相关启动动作走 `whenRootReady(fn)`

```js
whenRootReady(updateImageFilterCss);   // 有根 → 立即执行；无根 → 根出现后按登记顺序重放
```

凡**必须写 `documentElement`** 的启动动作都要登记（v6.6 已收口这些）：

| 动作 | 写什么 |
| :--- | :--- |
| `updateImageFilterCss` | `--svi-img-filter` / `--svi-img-transition` + `svi-img-invert-on` / `svi-hover-restore` 门类 |
| `updateFontCss` | 字体覆盖变量 + `svi-font-on` 门类 |
| `syncMaskVars` / `setPeekGate` / `applyPageDim` | 遮罩变量、`svi-peek-on` 门类、压暗层 |
| `setupFlashGuard` | `data-svi-flashguard` + 一条黑底样式 |
| `setupPendingMask` | `data-svi-masking` + `MutationObserver(document)` |

**顺序纪律**：重放严格按**登记顺序**，即与 boot 中的书写顺序一致。新增登记项应插在语义相邻处，
不要集中堆到末尾（否则重放顺序与正常 boot 顺序不一致，会产生只在 document_start 路径出现的怪行为）。

### C4 — 失败不许静默

- 根迟迟未就绪（有界轮询用尽，约 1.4s）→ 打一条 `[SmartInvert] 根节点迟迟未就绪: …` 告警；
- 根已就绪但 `appendChild` 仍未成功 → 打 `[SmartInvert] 样式节点挂载失败: #id`；
- **正常路径零新增日志**（既有「零噪声」纪律不变）。

---

## 不变量（改动不得破坏）

| 编号 | 不变量 |
| :--- | :--- |
| **I1** | 有根时挂载时机与顺序与契约生效前**一致**（不引入异步等待，`mountStyleNode` 是同步的） |
| **I2** | 挂载**绝不阻塞 boot**：无根只排队，不等待、不轮询阻塞 |
| **I3** | 补挂与重放**各只做一次**（`rootFlushDone` 门），不会因多通道触发而重复执行 |
| **I4** | 三条探测通道任一成功即全部拆除（observer / 事件监听 / 定时器），不留常驻开销 |
| **I5** | 带 id 的样式节点全局唯一（I1~I4 之外，`svi-fx-style` / `svi-bgr-style` 尤其） |

---

## 消费纪律

- 新增样式节点 → 只调 `mountStyleNode`，不再自己找根；
- 新增「写根」的启动动作 → 只调 `whenRootReady`，不再自己判 `documentElement`；
- 需要重复 `ensure` 的引擎 → 复用 `id` + `mountStyleNode` 的幂等语义，不要自己 `getElementById` 兜底；
- **不许**为了通过而把断言从「滤镜真实生效」放宽成「属性写了」。

---

## 守护断言（在哪里被守）

| 场景 | 位置 | 断言 |
| :--- | :--- | :--- |
| GM 垫片形态（首次真跑 `GM_addStyle` 分支） | `test-browser.js` 场景 32 | 样式表在场 + 字节数 > 40000 + 门类落地 + `computedStyle.filter !== 'none'` + `__sviShimUsed` 为真 |
| `document_start` 且 `<html>` 未建 | `test-browser.js` 场景 33 | 同上 + 页面异常计数零增量 |
| 真实站点（GitHub 仓库页 README） | `dev/probe-github-readme.js` | `invCount === mdCount && filterNone === 0` |
| 根因取证（红/绿对照） | `dev/probe-style-mount.js` | 钩 `createElement/appendChild` 打印「创建 → 文本写入 → 是否 attached」 |

> **注意 `test-browser.js` 的固有盲区**：它把脚本**内联进被测 HTML**且不定义 GM 垫片，
> 因此 `head` 必然存在、`GM_addStyle` 恒不存在 —— 这条路径**永远测不到**挂载竞态与 GM 分支。
> 场景 32/33 就是为了补这个盲区而存在；不要把它们改回内联注入。
