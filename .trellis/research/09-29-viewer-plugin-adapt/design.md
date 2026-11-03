# 技术设计：浮层反色适配 + 边界划界

> 任务：`.trellis/research/09-29-viewer-plugin-adapt`
> 前置：`prd.md`（requirements / AC 为真源）
> 规则：本文件写**设计**；执行清单在 `implement.md`。凡标 **[假设]** 的条目均为待实测裁决，
> **不得在实现中被当作既成事实**（对应 AC7）。

---

## 1. 边界

**做**：看图类插件放大浮层的**发现**与**判定**通道；边界划界；面向用户的诚实说明；bench 覆盖。

**不做**：站点专用硬规则（浮图秀 URL 逆向产物不稳定）；改第三方插件；视频流浮层；
区域分割内核 / `RegionMask` 冻结契约；面板 CSS / token / `SviControls`（属
`09-28-ui-overhaul`，两者并行须避免同批行冲突）。

**并行纪律（明确到文件）**：
- 本任务可碰：`universal-smart-invert.user.js` 的 **§15 引擎区**（`:8130`-`:9340` 一带）、
  `test-browser.js`（**只新增场景**，不改既有场景）、新增 `scripts/probe-viewer-overlay.js`、
  `README.md`、`research/`、`dev/`。
- 本任务**不碰**：`:3900`-`:5300` 面板 CSS、`SviControls`、`scripts/extension-src/{popup,options}.html`、
  `scripts/check-panel-overflow.js`。
- `extension/` 仅由 `node scripts/build-extension.js` 产出，**不手改**。

---

## 2. 机制清单与归属预判（**[假设]**，实测裁决）

| # | 候选 | 现实现机制 | 归属预判 | 验证方式 |
|---|---|---|---|---|
| M1 | 跨域图片像素不可读 | `analyzeSrc` 捕 `taint` → `gmFetchBlob`（GM 绕 CORS）→ blob 解码 | **已覆盖** | 探针断 `StatsManager` 的 `taintFallbacks` 计数增长 |
| M2 | 跨域 iframe 内浮层 | 扩展 `all_frames:true`；用户脚本 `@match *://*/*` | **已覆盖** | 夹具用跨域 iframe 载入浮层 |
| M3 | 闭合 Shadow Root 内浮层 | `attachShadow` 幂等补丁 + 注册表按 host 解析 | **已覆盖**（补丁后创建的根） | 夹具在闭合根内插浮层 |
| M4 | 媒体晚加载（网络慢） | `attachPendingWake` 一次性 `load` → 清标记 → 全管线重判 | **已覆盖**，但**决策完成时刻晚于浮层出现** | 探针测「浮层插入 → 属性落地」时延 |
| M5 | 机器卡顿 | 决策走 IO / 空闲预算，不阻塞主线程 | 部分：**时延**而非能力 | 探针在 CPU 降速下测时延 |
| M6 | 浮层 `src` 与缩略图 `src` 不同 → 决策缓存不命中 | R6 变更快路径**仅**在 `decisionBySrc` 命中时同步应用（`:8301`） | **可解未覆盖**（主战场） | 探针断 `decisionBySrc.has(overlaySrc)` 为 false |
| M7 | 浮层是 `<canvas>` / `<video>` 绘制 | canvas 走整元素 CSS 滤镜；video 走独立引擎 | **已覆盖**（canvas）/ **超范围**（video） | 夹具 `canvas` 浮层 |
| M8 | 媒体字节从未到达（离线 / 404 / 被拦） | —— | **真无解** | 夹具 `src` 指向 404 与 `data:` 空图 |
| M9 | 元素从未进入文档（插件在 Worker / 原生层 / 另一进程绘制） | —— | **真无解**（须实测确认无 DOM 接缝） | 检查插件是否存在此类形态 |
| M10 | 跨进程合成层（DRM 类） | —— | **真无解**（CSS 滤镜不到达） | 超出图片范畴，仅在说明中记载 |
| M11 | 元素被发现时**尚无布局盒**（档 C）且 `load` 永不触发（插件用 `srcset` 换源 / 换元素） | 档 C 登记 pending，靠 `load`/IO/Mutation 唤醒 | **待实测**（可能漏) | 夹具用 `srcset` 换源 + 元素替换两形态 |

> **归属口径**（三分类，来自 PRD R2）：
> 「已覆盖」= 有 file:line 机制 + 实测证据；「可解未覆盖」= 有接缝但没接；「真无解」= 浏览器无接缝。

### M4/M5/M6 的合并假设 —— **【已于 2026-09-29 实测证伪，原文保留供修订记录】**

> **[假设 H1 —— 已证伪，勿再据其决策]** 原文主张「浮层反色的真实瓶颈是**时延竞争**，
> 合计常达数百毫秒～数秒」。实测（`research/01-overlay-probe.md` §2/§4）：
> 基线时延 **100–165ms**，其中 ~100ms 恰为变更去抖（`:8219`），分析本身仅 5–30ms；
> 且像素可读时**根本不产生额外网络请求**。**从未观测到数百毫秒**（网络项除外）。

**替换结论 H2（实测成立）**：真正影响观感的是**网络等待原图字节**，且**仅当浮层 `src` 是全新 URL 时**发生：
`netslow` 组 C1 109→**382ms**、C7 128→**535ms**；而**已在决策缓存**的 src（C2/C8）稳定在
**98–103ms、与网络无关**。

**连带改动**：§3.2「同步免去抖通道」的收益上限只有 ~100ms，与分析本身的 5–30ms 不成比例，
**本任务放弃实施**（保留为记录）。§3.3「视觉同一性继承」因能同时消掉**网络等待**与
**跨域失败**（G1）而成为**唯一推荐项** —— 其定位从「锦上添花」升级为「主修」。

---

## 3. 可解项设计（仅在 H1 成立时实施；先实测后编码）

### 3.1 两个正交的修复面

浮层的像素可得性把问题分成两个**互斥**分支，需要两套手段：

| 分支 | 特征 | 瓶颈 | 手段 |
|---|---|---|---|
| **B-可读** | `sampleDrawable` 同步可读（同源 / CORS 放行） | 仅**调度**时延（去抖 + IO） | §3.2 同步免去抖通道 |
| **B-污染** | 像素不可读 → 必须 `gmFetchBlob` 联网 | **网络往返** | §3.3 视觉同一性继承（免网络） |

### 3.2 同步免去抖通道（解 B-可读）

**契约**：新增 `isViewerOverlay(el)` 纯判据（放 §15 引擎区，供单测直接调用）：

```
输入：元素（已在文档中）
输出：boolean
判据（全部满足）：
  1. 是媒体（img / canvas / 带 data-svi-bginv 的背景层）
  2. computed position ∈ { fixed, absolute }（或祖先链上首个非 static 祖先如此）
  3. 与该元素或最近定位祖先的 z-index ≥ OVERLAY_MIN_Z（阈值常量）
  4. 视口重叠比 ≥ OVERLAY_MIN_COVER（默认 0.5）
  5. 不是本脚本自有节点（无 data-svi-* / 不在 UI 根内）
副作用：无（只读 computed + 几何，一次性；不做强制布局）
```

**接入点**：`flushMutations()`（`:8270` 一带）的 `handle(el)` 内，在既有「快路径命中」判断**之前**插入：
若 `isViewerOverlay(el)` 且 `localEvidence(el).tier === 'A'` → **当帧同步**调
`decideImage(el, src, { noNetwork: true })`。

**`noNetwork` 语义（新增分析参）**：`analyzeSrc` / `decodeToCanvas` 在该参下**禁止** `gmFetchBlob`；
像素不可读时返回 `{ ok:false, fail:'taint' }`（**不降级到网络**），由调用侧转
「登记 pending + `attachPendingWake`」走常规异步路径。

**与 decide-once 的相容性**：`noNetwork` 不产生新语义的结论，只是**提前**同一条管线的同一判定；
`decisionBySrc` 仍只记一次。若该 src 已决 → 走既有快路径，不重算。

**风险**：同步工作抖动。**上限**：每轮 flush 同步处理 ≤ `OVERLAY_SYNC_MAX`（默认 8）个元素，
超出转异步；同步分支只做「像素已在内存」的分析，不触发布局抖动以外的重活。

### 3.3 视觉同一性继承（解 B-污染，免网络）

**思路**：放大浮层与缩略图是**同一张图**（语义前提），故缩略图的结论可**建议性**继承给浮层。
继承结论标记 `provisional: true`，复用既有可升级语义（`isProvisionalDecision`，`:8126`
只判 `d.provisional === true`），真像素到达后由 `attachPendingWake` 的 `load` 监听升级。

**继承信号优先级链**（实测决定哪条真命中；能命中越靠前越好）：

| 序 | 信号 | 说明 | 成本 |
|---|---|---|---|
| S1 | **祖先/兄弟关系** | 浮层被插入到已决媒体元素内部或紧随其后 | 0（DOM 回顾） |
| S2 | **指针悬停目标** | 记录「最近一次 `mouseover` 命中的已决媒体」（复用既有 `resolveMediaFromEvent` 的 composedPath 解析） | 1 个 passive 监听 |
| S3 | **`src` 形近** | 浮层 `src` 与某已决 `src` 互为前后缀 / 仅尺寸段不同 | 0（字符串比对，须有界） |

**硬约束（防误判）**：
- 关联目标或浮层本身是 `<video>` → **不继承**（视频缩略图 ≠ 视频帧）。
- 无任何信号命中 → **不继承**，走常规异步路径（宁可慢，不可错）。
- 继承**只**复用既有三项判定之一（`invert` / `keep` / `skip`），**不新增判定词**。
- S3 的字符串比对必须**有界**（候选数上限 + 不回溯全表），避免长页面 O(n²)。

**接入点**：`flushMutations()` 中 `isViewerOverlay(el)` 且 `tier !== 'A'`（像素还没到）时，
按 S1→S2→S3 取第一个命中的结论 → `recordDecision(src, verdict, 'overlay-inherit', …, provisional:true)`
→ `applyDecision` → `registerPending` + `attachPendingWake`（升级通道不变）。

### 3.4 S2 的状态与生命周期（唯一新增的全局状态）

```
runtime.hoverMedia: 最近一次 mouseover 命中的已决媒体元素
```
- **per-tab 内存，绝不持久化**（PRD R5 硬规则）。
- 监听 `mouseover`（passive、capture），先做廉价过滤（`composedPath` 首媒体节点），
  再查 `decisionBySrc` 是否已决才记录 → 未决元素不占状态。
- `siteActive === false` 时直接 return；`document.hidden` 时停止记录。
- 弱引用优先（`WeakRef` 可用则用，否则有界 LRU ≤ 16），避免长页面元素泄漏。
- **只在「已决且非 provisional」时记录** —— 保证继承源本身是权威结论。

### 3.5 扩展形态的跨域缺口（G1，**实测新发现，本任务的实际主战场**）

> 来源：`research/01-overlay-probe.md` §3.2 G1。实测：同一张「跨域且源站不发 CORS」的图，
> **油猴形态反色成功（126ms）**，**扩展形态完全失败（`data-svi-failed`，129ms，不反色）**。
> 代码级根因：`gmFetchBlob` 无 GM 时退到 `fetch(url,{mode:'cors'})`（`:6395`）；扩展的
> `GM_xmlhttpRequest` 垫片是**纯 fetch**，且 manifest **无 `background` SW、无 `host_permissions`**
> → MV3 下 content script 的 fetch 受 CORS 限制，无法像 MV2 那样凭 host 权限跨域。

| 方案 | 解什么 | 代价 | 判定 |
|---|---|---|---|
| **E3 继承（§3.3）** | 缩略图已决时，浮层免网络免跨域即可反色 | 见 §3.3；**零架构变更** | **推荐**（与 §3.3 是同一件事，不是追加工作量） |
| **E1 扩展加 SW + `host_permissions`** | G1 根治：两形态能力对齐 | 扩展多一个 SW；manifest 申请**全站 host 权限**（审核与用户观感均变差）；Firefox 侧还需 `background.scripts` 兼容；`build-extension.js` 与跨浏览器契约同步改 | **不做**（属架构变更 + 扩大改动面，须用户明批且宜单独任务） |
| E2 对污染图盲上滤镜 | 表面解 G1 | 会把暗图反成亮图，违背 decide-once | **否决** |
| E4 只做文档 | —— | 最小 | 若用户只要结论，这是合法落点 |

**E3 对 G1 的诚实边界**：继承要求「缩略图已有权威结论」。若用户首次就悬停一张从未见过的缩略图
（缩略图本身也是跨域无 CORS），则无结论可继承 → **仍会失败**。故 E3 **缩小但不消灭** G1；
要消灭必须 E1。

### 3.6 遮罩档改造：`media` 档从「藏元素」改为「深色占盒」（R3.1，用户追加需求）

**现状**（`:5184`）：
```css
html[data-svi-masking] [data-svi-pending]:not([data-svi-settled]) { visibility: hidden !important; }
```
把元素藏起来 → 露出背后。白底站点背后是白（文档级黑底仅在 `prof.bgReplace === true` 时生效，`:16620`）
→ **白区未被解决**。

**目标行为**：未就绪期间用深色**占住元素盒子**；就绪/判定完成即摘罩。

**契约（单点改动，不新增状态字段）**：
```css
html[data-svi-masking] [data-svi-pending]:not([data-svi-settled]) {
  background: var(--svi-bg) !important;   /* token 取色, 禁字面量颜色 */
  pointer-events: none;                   /* 保留原「不留可点击的透明元素」意图 */
}
```
- 仍是**纯 CSS 属性门**（`data-svi-pending` / `data-svi-settled`），不写 inline style；
- 沿用既有 `tag / settle / settleAll / escape / 预算与超时` 全生命周期，**只改呈现层**；
- 打标仍是同步热路径且不读布局。

#### 3.6.1 生命周期修正（实测发现：**改 CSS 不够**）

`raw-mask-baseline.jsonl` 实测：遮罩**成功武装**（`armed:true`）的前提下，加载窗口内元素仍是
`data-svi-pending=false`、`data-svi-settled="local-context"`、背景白。即：
**档 B 的临时结论（`keep`, `provisional:true`）当场就把遮罩 settled 掉了**，遮罩几乎没存在过。
「元素藏了反而是图片迟现」的顾虑被这条路径自动满足，但**同时也让遮罩形同虚设**。

**修正**：`settle` 的触发条件改为「**权威结论**」而非「任何结论」——
非 provisional 的决策、失败（`markFailure`）、以及既有的**预算/单元素超时兜底**才解除遮罩；
provisional（档 B 临时）结论**不解除**。复用既有 `isProvisionalDecision`（`:8126`），不新增状态字段。

**由此暴露的真实张力（必须如实交付，不粉饰）**：
遮罩时长由既有预算决定（`maskBudgetMs` 默认 1200ms 总、`maskSettleTimeoutMs` 默认 800ms 单元素）。
本次观测的媒体用了 2.5s 才到 —— **即使按上述修正，遮罩也会在 800ms 时被超时兜底解除**，
2.5s 时仍会露白。故：
- 修正让「**短于预算的加载**」被完整遮住（这是绝大多数情况）；
- 「**长于预算的加载**」仍会露白 —— 这是**预算与"图片迟现"风险之间的既有取舍**，不是可以两边都要的。
  处置：把该预算**在设置里可调**（若尚未暴露给用户），并在文档里写清这个权衡；**不擅自把默认值调大**
  （调大等于让所有站点都更容易"迟现"，是行为变更，须用户明批）。

**为什么加 `pointer-events: none`**：原注释明确把「可点击的透明元素」列为 `visibility:hidden` 的
选择理由之一。改成有底色后元素重新可见 → 必须显式挡住点击，否则用户在「深色占位块」上点击会
触发站点动作（例如打开灯箱），而此时图还没到。`pointer-events:none` 让点击落到其背后的元素上。

**必须验证的两个反作用**（各自可能否决本方案）：
1. **滤镜窗口闪烁**：`<img>` 上的 CSS 滤镜作用于元素**含背景**。若「应用滤镜」与「settle」之间
   发生了绘制，深色占位块会被一起反色成亮色 → 一帧白闪，**反而制造了它要消除的现象**。
   现状顺序是 `applyDecision` → `pendingMask.settle`（同一同步块，`:8855`），理论上不产生绘制窗口，
   但**必须用 bench 断言「从无反色态与占位态同时存在的一帧」**，不能只靠推理。
2. **不产生过渡中间态**：原注释的另一理由。本方案不使用 `opacity`/`transition`，故不引入；
   但仍需断言没有新的过渡属性被引入。

**原理下界（写入文档，不回避）**：
- **无盒可占则遮不住**：元素无 CSS 尺寸、无 HTML `width/height`、图未到 → 尺寸未知 → 盒为 0。
  这是浏览器的下界，不是本脚本的缺陷。
- **用户脚本形态不遮首屏**：`@run-at document-end` 时首屏元素已渲染，遮它反而是「图片迟现」。
  该约束仓内已文档化（`:16660` 区段注释），**本次不改变**；真·首帧前遮罩仍只有扩展形态可达。

### 3.7 扩展形态加 service worker + `host_permissions`（R3.3）

**为什么**：扩展的 `GM_xmlhttpRequest` 是纯 fetch 垫片 → MV3 下 content script 的 fetch 受 CORS 限制
→ 跨域无 CORS 原图取不到字节（实测 `ext` 组 C3 失败）。SW 拥有 `host_permissions` 授予的
**跨域 fetch 能力**，是 MV3 下唯一合法的越权取图通道。

**形态**：
```
content script ── sendMessage({type:'svi-fetch-bytes', url}) ──▶ SW
                                                              │ fetch(url)  (host_permissions 生效)
              ◀── {ok, base64|ArrayBuffer, type, size} ────────┘
```
- **只服务「像素回退取字节」这一个用途**，`url` 限 `http/https`；SW **不得**变成任意代理；
  extension 无 `externally_connectable`，页面无法触达该通道（已核实 manifest 无此键）。
- **体积门**：单张上限（默认 4MB，可配）超限即拒绝并回落现有路径，避免把大图塞进消息里。
- 扩展的 `GM_xmlhttpRequest` 垫片改为**优先 SW、失败回落 plain fetch**（保持既有契约形状不变）。

**跨浏览器（本仓硬规则：绝不分叉产物目录）**：
- Chromium 用 `background.service_worker`；Firefox MV3 需要 `background.scripts` 兼容写法。
  同一份 manifest 两个键并存，各自忽略不认识的那个 —— **但这是假设，必须实测**：
  ① `npx web-ext lint` 必须仍报 **0 errors**（不得放宽规则掩盖）；
  ② Chromium 与 Firefox 都要能加载并让跨域取图真的生效（各一条证据）。
- 若两引擎无法共用一份 manifest，则**停下来回报用户**，不得私自分叉 `extension/`。

**权限提示（不得凭推测写结论）**：现行 `content_scripts.matches` 已含 `<all_urls>` + `file://*/*`，
Chrome 的「读取和更改您在所有网站上的数据」提示**很可能本来就在**，故本次**可能不新增任何用户可见权限**。
必须给出**可复核的观测方式与结论**（例如加载扩展后读 `chrome://extensions` 详情页的权限清单，
或对比加载前后的权限集合）；若确实新增，须如实告知用户。

#### 3.7.1 传输契约（实测追加的**硬要求**，不是可选项）

`research/01-overlay-probe.md` §11 实测：**`Uint8Array` 过 `chrome.runtime` 消息会被 JSON 序列化成
普通对象**（`ctor=Object`、`len=undefined`），内容脚本侧 `new Blob([obj])` 只得到 **15 字节**
（`"[object Object]"`）→ 解码必失败，且失败被 `analyzeSrc` 的 catch 吞掉，**表面像"跨域取不到"**。

**契约**：SW → 内容脚本**只传 base64 字符串**（`btoa` 分块编码 / `atob` 还原为 `Uint8Array`）。
字段名固定 `b64`；内容脚本侧以 `typeof res.b64 !== 'string'` 作为失败判据（不再检查 `bytes`）。
这条与引擎无关（Chromium / Firefox 都会 JSON 化），故**不得**用「传字节数组」的任何变体替代。

**由此得到的教训（写入 spec）**：跨上下文传二进制一律走 base64/transferable 明确约定的通道；
"看起来能过"的实现在被 catch 兜住时会伪装成另一类故障。

**回滚点**：`manifest` 的 `background`/`host_permissions` + `sw.js` + 垫片分支 → 独立整批 revert；
revert 后扩展回到「跨域失败但页面可用」的既有行为。---

## 4. 实测架构（先于实现的强制步骤）

### 4.1 真机插件加载方式（选型）

**不**同时加载两个扩展（协调成本高、CDP `Extensions.loadUnpacked` 的双载行为需额外验证）。
**选**：只把**目标插件**作为真扩展加载（`Extensions.loadUnpacked`），
本脚本用 `Page.addScriptToEvaluateOnNewDocument` 注入当前源码
（`test-browser.js` 已验证的注入形态）。

**已知局限（须写入报告，不得含混）**：注入形态的运行时机是 `document_start`，
而生产用户脚本是 `@run-at document-end`。因此**用户脚本形态**的发现时机差异需单独一次验证
（同一探针加 `--mode=userscript-late` 分支，把注入推迟到 `DOMContentLoaded` 后）。

**插件来源**：`dev/tools/viewer-plugins/`（gitignored）下 `git clone` 开源仓库
（`hababr/Imagus-Reborn`、`extesy/hoverzoom`）。**这一步会联网拉取第三方源码**，
属环境变更，在 `implement.md` 中单列并需用户确认后执行。

### 4.2 浮图秀的覆盖方式（诚实标注）

浮图秀在 Chrome 应用商店分发且**闭源**，无法加载未打包版 → **不做真机实测**。
替代：合成夹具按「图片类看图插件的典型 DOM 形态」构造，覆盖
`<img>` 浮层 / `background-image` 浮层 / `position:fixed` 高 z-index / 闭合 Shadow Root 内 /
`<canvas>` 五形态。报告中**必须写明这是形态替代而非真机实测**（PRD AC2）。

### 4.3 探针产出（每条结论的证据源）

`scripts/probe-viewer-overlay.js`（新增，CDP，代理感知，沿用 `probe-github.js` 的骨架）输出 JSONL：

```json
{"plugin":"hoverzoom","case":"img-overlay","hoverTargetSrc":"…","overlaySrc":"…",
 "overlayCreatedMs":42.1,"decisionBySrcHit":false,"taintFallbacks":1,
 "invertedMs":null,"path":"none","note":"overlay removed before decision"}
```

关键量：**`overlayCreatedMs` → `invertedMs` 的差值**（H1 的直接证据）、
`decisionBySrcHit`（M6）、`taintFallbacks`（M1）、`path`（实际生效路径：
`fast-path` / `sync-overlay` / `inherit-S1/S2/S3` / `async` / `none`）。

### 4.4 bench 落点

- `test-browser.js` **新增**（不改既有场景）：合成夹具五形态 → 断言「不滚动、不点击即反色」，
  并断言 `path` 不是 `none`。这是 AC4。
- `test.js` **新增**：`isViewerOverlay` 纯判据的三条边界（正例 / 反例 / 自有节点排除）。

---

## 5. 兼容性与硬约束对照

| 硬规则 | 本设计如何满足 |
|---|---|
| 运行时状态绝不持久化 | `hoverMedia` 仅内存；无新增 `Store` 键 |
| decide-once | 继承走 `provisional:true`（既有可升级语义），升级后 `decisionBySrc` 仍唯一；同步通道复用同一管线 |
| 禁 `html`/`body` 整体滤镜 | 浮层仍是按元素挂 `data-svi-*` |
| 禁 `innerHTML` 动态数据 | 新增代码不涉及 DOM 字符串拼接 |
| 观察器去抖 / 空闲预算 / hidden 暂停 | `hoverMedia` 记录在 hidden 时停；同步通道有 `OVERLAY_SYNC_MAX` 上限 |
| 用户脚本 ↔ 扩展握手 | 不改握手；`@version` 同批 bump 并重建 `extension/` |
| 零自动遥测 | 探针是 dev 工具；`gmFetchBlob` 仍只在像素不可读时按需触发；同步通道**减少**网络请求 |

---

## 6. 风险与回滚

| 风险 | 信号 | 处置 |
|---|---|---|
| **误判继承**（把不该反色的浮层反了） | 夹具出现「暗图被反色」 | 继承一律 `provisional`；加「关联目标须已决且非 provisional」前置；必要时**整体关掉 §3.3**，只保留 §3.2 |
| **同步通道抖动** | 探针测长任务 / bench 变慢 | 降 `OVERLAY_SYNC_MAX` 至 1～2；不行则整条同步通道移除 |
| **`isViewerOverlay` 误报**（把页面正文大图当浮层） | 既有 34 场景出现回归 | 阈值加严；误报只影响**时延**不影响正确性（仍走同一管线） |
| **探针不稳定**（插件加载失败 / hover 不触发） | `path:none` 全部用例 | 先查插件是否真加载（断 `chrome.runtime.id`）；不行则降级为「合成夹具为主 + 真机为辅」并写明 |
| **H1 被证伪** | 实测时延很低 | 按 AC7 改写结论；§3 方案重选（可能退化为「只做文档」） |

**回滚点**：§3.2 与 §3.3 是**两个独立可 revert 面**（分别为：`flushMutations` 的同步分支 +
`analyzeSrc` 的 `noNetwork` 参；`isViewerOverlay` + 继承信号链 + `hoverMedia`）。
任一被实测证伪可单独撤销，不影响另一面。

---

## 7. 开工前必须得到的实测裁决（阻塞表）

| 阻塞项 | 裁决后决定 |
|---|---|
| M6 是否真不命中（`decisionBySrcHit`） | 决定 §3.3 是否有存在价值 |
| H1 时延量级 | 决定 §3.2 是否值得做 |
| S1/S2/S3 哪条真命中 | 决定继承信号链保留哪几级 |
| M11 是否存在漏唤醒 | 决定是否要补 `srcset` / 元素替换的唤醒通道 |
| 插件能否被 CDP 成功加载 | 决定报告是「真机为主」还是「夹具为主」 |
