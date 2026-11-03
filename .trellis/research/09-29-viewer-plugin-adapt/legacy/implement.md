# 执行计划：浮层反色适配 + 边界划界

> 任务：`.trellis/tasks/09-29-viewer-plugin-adapt`
> 前置：`prd.md` + `design.md` **经用户评审通过**、`task.py start` 已执行（status → in_progress）
> 规则：本文件复选框**随执行实时勾选**，不得任务结束后凭记忆批量补勾。
> 顺序铁律（用户 2026-09-29 选定）：**实测结论先于实现决策** —— Step 1 未产出裁决表前，
> **不得**开始 Step 2 的编码。

---

## 第 0 步 · 基线与环境（前置，不可跳过）

- [x] `git status` 确认工作树状态并记录**基线 SHA** → 基线 `fd9a4a2`（09-28 的 Step A）。
      残留恰如预期：`scripts/build-crx.js` 纯行尾差异 + 新任务目录（未跟踪）。**两者均不纳入提交**。
- [x] 记录当前 `@version` → `0.6.10`，`universal-smart-invert.user.js:7` 与 `SCRIPT_VERSION` 两处一致
- [x] 跑基线六门禁，记录**改动前**通过状态 → **六条全绿**（就在本树上刚跑过，SHA `fd9a4a2`；
      此后产品文件零改动，已用 `git diff fd9a4a2 --stat -- <产品文件>` 核实为空）：
      `node --check` ✅ / `node test.js` ✅ / `node test-browser.js` ✅ 34 场景 /
      `node test-extension.js` ✅ 8 场景 / `web-ext lint` ✅ 0 errors / `build+pack` ✅ 12 entries
- [x] 确认探针可跑 → Chrome 可达（`test-browser.js` 刚跑通）；探针已新建并实跑四个形态
      （`scripts/probe-viewer-overlay.js`，零外部依赖：自带 PNG 编码 + 两个本地源站造跨域）
- [x] 确认引擎状态出口 → `window.__svi.engines.image.decisionBySrc`（Map, 可读）；
      `window.__svi.stats` 是 `StatsManager`，**无 `snapshot()`**，计数经 `stats.counters` 读
      （故 `taintFallbacks` 等可直接观测）。扩展形态跑在 isolated world，主世界读不到 `__svi`
      → **ext 模式只看 DOM 属性**（那也正是用户可见的真相）
- [x] **纪律**：本任务期间未执行 `git checkout/apply/stash` ✓

**探针测量口径（实测踩到并已修的两处，留档以免后人重蹈）**：
1. `decisionBySrcHit` 最初是**决策之后**才读缓存，恒为 `true` —— 改成触发**前**测 `preHitDecisionBySrc`。
2. 「浮层插入 → 反色落地」的时延同时用 **MutationObserver 属性时刻**（主口径）与 **rAF 轮询**（交叉校验）；
   只看 rAF 会把「观测延迟」误读成「产品时延」。两口径实测相差 ~10–15ms。

**回滚点**：本步无改动。

---

## 第 1 步 · 实测裁决（**阻塞 Step 2**）

> 目标：把 `design.md` §7「阻塞表」五行全部裁决掉。**先做不依赖第三方源码的 1.1**，
> 它已足以裁决 M6 / H1 / M11 / S1。

### 1.1 合成夹具探针（零外部依赖，可立即执行）—— **已完成**

- [x] 新建 `scripts/probe-viewer-overlay.js`（CDP；沿用 `probe-github.js` 骨架；零外部依赖：
      自带 PNG 编码 + 两个本地源站造跨域）。**执行期新增**三种模式，均为实测需要：
      `--gm`（特权 `GM_xmlhttpRequest` 垫片，经 CDP 转 Node 取字节）/ `--ext`
      （`Extensions.loadUnpacked` 加载真 `extension/`，id 校验）/ `--cpu=` / `--net-latency=`（限速）
- [x] 夹具用例 **8 个**（见报告 §2 表），**刻意偏离原计划的「5 形态 × 3 触发」矩阵**：
      改为按「变量」分离的 8 用例（src 新旧 / 是否缓存 / 是否污染 / 是否换源换节点 / 大图 / 背景图 / 暗图反例）。
      理由：原矩阵会把「形态」与「触发」两个变量纠缠在一起，反而分不清是哪一项造成差异。
      **三项未覆盖（须如实登记，不得含混）**：
      - [ ] **F3 闭合 Shadow Root 内浮层** —— 夹具未构造（机制由既有 bench Scenario 16 覆盖，未在本次复现）
      - [ ] **F4 `<canvas>` 浮层** —— 夹具未构造
      - [ ] **F5 跨域 iframe 内浮层** —— 夹具未构造
- [x] 记录时延（**主口径 = MutationObserver 属性落地时刻**，rAF 仅交叉校验）、`preHitDecisionBySrc`、
      实际生效路径、反色/失败/保留三态
- [x] 追加 M11 两形态探针：`srcset` 换源 / 元素被替换 → **均无反色，无漏唤醒**（161ms / 162ms）
- [x] **裁决并回填**：`design.md` §2 的 H1 **已按 AC7 改写（证伪 + 新增 H2）**；
      新增 §3.5 记录实测新发现的 G1（扩展形态跨域缺口）

**验收**：`research/01-overlay-probe.md` 已产出 —— 含三分表（真无解 / 已覆盖 / 可解未覆盖）
+ 五组配置对照表 + 五份原始 JSONL（`raw-*.jsonl`）。**✔ 已达成**

**执行期踩到并修掉的探针自身缺陷（留档，避免后人重蹈）**：
1. `decisionBySrcHit` 事后读缓存 → 恒真，无信息；改为触发前 `preHitDecisionBySrc`
2. 只信 rAF 会读出假时延（首版一个 1200ms 假值）；改以 MutationObserver 属性时刻为主口径
3. 夹具初版是 12 张同 src 网格图 → 命中封面网格启发式，基线全 `skip`；改文章形态
4. 再版 6 张同尺寸图 → 命中「同父同标签同尺寸 ≥4 = 网格贴图」；改为逐张不同尺寸
5. `--ext` 有头窗口被遮挡 → 后 3 用例**完全不被处理**（**正是 AGENTS.md 记的那类假缺陷**）；
      补 `Page.bringToFront` + `Emulation.setFocusEmulationEnabled` 后复现为完整 8 用例
6. 夹具基线用固定 `sleep` 等 → 限速下误报「基线不成立」；改有界轮询（本仓 `pollUntil` 纪律）

### 1.2 开源插件真机实测（**已完成，见 `research/01-overlay-probe.md` §8/§9**）

- [x] 用户已确认（2026-09-29「做（已预授权）」）
- [x] `git clone --depth 1` 两个仓库到 `dev/tools/viewer-plugins/`（`Imagus-Reborn` 6.2M、`hoverzoom` 22M）；
      `.gitignore:53` 已覆盖 `dev/tools/`，**不入提交**（已核实）
- [x] 探针加 `--plugin=<dir>`：插件走 `Extensions.loadUnpacked` 真扩展；本脚本仍注入形态
- [x] 真实 hover：`Input.dispatchMouseEvent` mouseMoved → 两插件**均成功**（hoverzoom 出浮层并反色；
      Imagus 内容脚本未注入，见下）
- [x] **hoverzoom = 真机实测成功**：`div#hzViewer`（absolute, z 2147483647）内的 **static `<img>`**
      1059×783 / natural 1900×1400 → `data-svi-inverted="true"`，决策 `{invert, pixel, provisional:false}`
- [x] **Imagus = 未实测（如实登记）**：扩展可加载，但内容脚本**从未注入**
      （指纹 `hasImagus:false`，`documentElement.children` 只有 HEAD/BODY）。根因：它走
      `chrome.userScripts` 通道，需用户在扩展详情页手动允许，**CDP 无法代翻**。
      其浮层形态以**源码推断**登记（open shadow root，`content.js:610-611/655`），并标注「推断，非实测」
- [x] 探针自身两处坑（新踩，已修并留档）：① 无 CDP 超时 → 永久挂死（AGENTS.md 记过，我又踩了一次）；
      ② **未等 `ws.onopen` 就发消息** → 重启动的 Imagus 让请求石沉大海
- [ ] ~~`--mode=userscript-late` 分支~~ —— **本任务未做**（属夹具形态差异，
      与本次结论无关；如实登记为未做，不含混成已做）

**验收**：报告 §8/§9 **已显式写明** —— hoverzoom 真机实测、Imagus 未实测（源码推断）、
浮图秀为形态替代（PRD AC2）。**✔ 已达成**

### 1.3 划界结论

- [ ] 产出 `research/02-verdict-table.md`：三分表终版，每行 = 候选 / 归属 / 根因 / 证据 / 处置
- [ ] **H1 裁决**：若被证伪，按 PRD AC7 改写 `design.md` §2 合并假设与 §3 方案；保留原文作为修订记录
- [ ] 若裁决出「可解未覆盖」为空（全部已覆盖或真无解）→ **如实报告**，Step 2 退化为「只做 Step 3/4」，
      并向用户说明（这是合法结论，不是失败）

**用户评审门**：Step 1 产出后**回报用户**（三分表 + H1 裁决 + 打算实施哪几项），
取得同意再进 Step 2。**因为实现面大小取决于实测结论，本门不可跳过。**

> **✔ 已于 2026-09-29 走完。** 用户裁决（原话要点）：
> ① **遮罩**「未加载前加上遮罩挡住，必须解决，像背景防闪白那样强制遮住，可按站点开关」
> → 选「**改现有 media 档**」（藏元素 → 深色占盒）；
> ② **实施范围**「三项全做（含 SW）」，并明示「架构不管，随时可重构」；
> ③ **真机实测**「做（已预授权）」。
> 另：用户追问「SW 有什么好处」→ 已答：**唯一好处**是修掉扩展形态的跨域缺口；并主动纠正
> 我方关于「权限提示会变差」的说法 —— 现行 `content_scripts.matches` 已含 `<all_urls>`，
> 该提示很可能**本来就在**，故**须实测求证而非推测**（已写入 AC10 与 design §3.7）。

---

## 第 2 步 · 实现（三个独立可 revert 面）

> 用户评审门已于 2026-09-29 走完，裁决：**遮罩改现有 media 档 + E3 继承 + 扩展 SW，三项全做**。

### ~~2A(旧) · 同步免去抖通道~~ —— **已放弃（H1 证伪）**

> 原设计收益上限仅 ~100ms（去抖那一段），与分析本身的 5–30ms 不成比例；同步工作还会引入抖动风险。
> **保留本记录以免后人重新提出**。依据：`research/01-overlay-probe.md` §4。

### 2A · 遮罩档改造（**已完成，`research` §10 为证**）：`media` 档改「深色占盒」（`design.md` §3.6 / §3.6.1，用户追加需求）

> **实测先行结论（`research/01-overlay-probe.md` §10）**：光改 CSS **不够** ——
> 遮罩武装成功的前提下，档 B 的**临时结论当场就把遮罩 settled 掉了**
> （实测 `data-svi-pending=false`、`settled="local-context"`、背景白）。
> 故本面是**两步**：呈现层 + 生命周期。

- [ ] **第 1 步（呈现）**：CSS 单点改动：`html[data-svi-masking] [data-svi-pending]:not([data-svi-settled])`
      由 `visibility:hidden` 改为 `background: var(--svi-bg) !important; pointer-events: none;`
      （**token 取色，禁字面量**；仍是纯 CSS 属性门，不写 inline style）
- [ ] **第 2 步（生命周期）**：`settle` 的触发条件改为「权威结论」：
      **provisional（档 B 临时）结论不解除遮罩**；非 provisional 决策 / `markFailure` /
      既有预算与超时兜底才解除。复用 `isProvisionalDecision`（`:8126`），**不新增状态字段**
- [ ] **面板文案同步**：`:12650` 的 hint 现写「先遮住（**visibility:hidden**）」，
      必须改为实际行为；`:12649`（`flashGuardLevel`）的「文档黑底」措辞一并核对
- [ ] **预算权衡如实交付**：遮罩仍受 `maskBudgetMs`(1200) / `maskSettleTimeoutMs`(800) 兜底 ——
      长于预算的加载**仍会露白**；**不擅自调大默认值**（调大=所有站点更易"图片迟现"，属行为变更，
      须用户明批）。`maskSettleTimeoutMs` 当前**未暴露**到设置面板，是否暴露列为可选项**回报用户**
- [ ] 断言「无反色态与占位态同时存在的一帧」（`design.md` §3.6 反作用 1）——
      若存在滤镜窗口闪烁，本方案需改法或撤回
- [ ] 断言未引入 `opacity`/`transition` 类过渡中间态
- [ ] 同步更新**既有断言**（若原断言断言的是 `visibility`）并在提交信息写明理由
- [ ] README §13 措辞与实现对齐（**不得**继续写「隐藏」）

**验证**：`node test-browser.js`（新断言）+ `node test-extension.js`（`media` 档真实覆盖）
**回滚点**：仅该 CSS 规则一条 → 独立 revert（行为回到「藏元素」）

### 2B · 视觉同一性继承（**已完成**，`design.md` §3.3，**设计已按实测收窄**）

- [x] **信号链裁决（Step 1.2 实测逼出的收窄，实现按此落地）**：原设计 S1/S2/S3 三条并列，
      实测后**只保留 S1′**并把它做成确定性判据 ——
      **「文档内存在 `a[href]`，其绝对 href 逐字符等于本元素 src → 取该链接内媒体的权威结论」**。
      理由：hoverzoom 真机实测显示浮层 `src` **就是**那个 `<a href>`（无需指针追踪即可确定关联），
      故 S2（指针悬停）与 S3（src 形近）**都不必要**，砍掉即少一份全局状态与一份启发式。
      **代价（如实登记）**：`a > img` 形态被 `detectChromeContext` 判为「封面链接」而 skip，
      故**缩略图自身被 skip 时无结论可继承**（实测：`reason:'skip'` 的源不继承）。
      → 继承只在「缩略图本身被判 invert/keep」时生效（典型：正文上下文里的照片）。
      **这不是缺陷而是取舍**：宁可不继承，也不把「封面卡片」的判断强加给大图浮层。
- [ ] 继承结论 `provisional:true`；`applyDecision` + `registerPending` + `attachPendingWake`
- [ ] **防误判硬约束**：关联目标或浮层是 `<video>` 时不继承；无信号命中则不继承；
      S3 字符串比对有界
- [ ] `runtime.hoverMedia`：`mouseover` passive capture 监听、仅记「已决且非 provisional」的媒体、
      `siteActive===false` 直接 return、`document.hidden` 停记、`WeakRef` 优先（无则有界 LRU ≤16）、
      **仅内存不持久化**

**验证**：`node test-browser.js` 新增场景（污染浮层免网络即反色 + 暗图反例）
**回滚点**：继承链 + `hoverMedia` → 独立 revert（可只留 2A / 2C）

### 2C · 扩展加 service worker + `host_permissions`（**已完成**，`design.md` §3.7 / §3.7.1）

- [ ] `build-extension.js` 产出 `sw.js`（或等价文件），manifest 加 `background` + `host_permissions`
- [ ] SW 只做一件事：`svi-fetch-bytes`（`url` 限 http/https、**单张体积门**默认 4MB）
- [ ] 扩展的 `GM_xmlhttpRequest` 垫片：**优先 SW、失败回落 plain fetch**（契约形状不变）
- [ ] **跨浏览器实测（不得只靠假设）**：`web-ext lint` 仍 **0 errors**；
      Chromium 与 Firefox **都能加载**且跨域取图**真的生效**（各一条证据）
- [ ] **权限提示实测**：给出可复核的观测方式与结论（可能本来就在，需给证据；若新增须告知用户）
- [ ] 若两引擎无法共用一份 manifest → **停下来回报用户**，**不得**私自分叉 `extension/`

**验证**：`node test-extension.js` + `npx web-ext lint` + 真机跨域浮层用例（用探针 `--ext` 复跑 C3）
**回滚点**：manifest 两键 + `sw.js` + 垫片分支 → 独立整批 revert

---

## 第 3 步 · bench 与单测落点（PRD AC3 / AC4）

- [ ] `test.js`：`isViewerOverlay` 正例 / 反例 / 自有节点排除 三断言
- [ ] `test-browser.js` **新增场景**（**不改既有 34 场景**）：
      - [ ] 浮层五形态「不滚动、不点击即反色」，并断言 `path !== 'none'`
      - [ ] 污染浮层免网络即反色（走继承）
      - [ ] **反例**：暗色浮层不被误反色
- [ ] **断言强弱自证**：新增断言在实现前跑应**红**（或写明为何构造不出红）
- [ ] 跑 `node test.js && node test-browser.js` 全绿，且既有 34 场景零回归

**回滚点**：bench 新增段（独立段落，可单独 revert）

---

## 第 4 步 · 诚实说明（PRD AC5）

- [ ] `README.md` 新增/改写「看图类插件适配与不可逾越边界」小节：逐条给
      **现象 / 根因 / 为什么这是浏览器的下界**；真无解项**不包装成已解决**
- [ ] 已覆盖项写「已支持」并给可复核行为（不写实现细节）
- [ ] 措辞与 `research/02-verdict-table.md` 逐条对齐（**不得**出现报告说无解、README 说支持）

**回滚点**：README 小节（独立 revert）

---

## 第 5 步 · 收尾（收尾类动作，按 spec §2.1 自主执行）

- [ ] 独立复核（`trellis-check`；**不是**写代码的那个执行者）
- [ ] spec 沉淀：浮层发现/继承的契约与阈值写进 `.trellis/spec/frontend/` 相应文档
- [ ] bump `@version`（用户脚本 + `SCRIPT_VERSION` 同批）+ `node scripts/build-extension.js` 重建
- [ ] 六门禁 + `build` + `pack` 全跑（`set -o pipefail`）
- [ ] `git status` 确认 `extension/` 变更全部可归因于构建（无手改）
- [ ] 清理 temp 探针：`scripts/probe-viewer-overlay.js` 若已固化为正式断言则删除；
      有复用价值则保留在 `scripts/`（勿留死代码）
- [ ] 提交（message 说明实测裁决 → 实现范围的因果链）
- [ ] **推送 `origin main`**（本仓硬规则：只提交不推送视为未完成）

---

## 风险登记（实现期间须主动盯的）

| 风险 | 触发信号 | 处置 |
|---|---|---|
| **假红**：CRLF/LF 或未重建 `extension/` | `test.js` 报「必须能定位 UIController 类体」「必须逐字节一致」 | 先归一 LF + 重建，再判断是否真缺陷 |
| **误判继承** | 夹具出现「暗图被反色」 | 继承一律 provisional + 前置「须已决且非 provisional」；必要时整体关掉 2B |
| **同步通道抖动** | 探针测长任务 / bench 变慢 | 降 `OVERLAY_SYNC_MAX`；不行则整条移除 |
| **探针不稳定** | 全用例 `path:none` | 先断插件是否真加载；不行则降级并写明，**不得伪造结论** |
| **H1 证伪** | 实测时延很低 | 按 AC7 改写结论 + 重选方案 |
| **与并行任务撞行** | `git diff` 出现面板 CSS / `SviControls` / popup 改动 | 立即停手回报（那属 `09-28-ui-overhaul`） |
| **范围蔓延** | 有人提出「顺便适配视频浮层」「顺便写浮图秀 URL 规则」 | 两者都在 `prd.md` 的 Out of scope，**回报用户**后再议 |

---

## 子代理派发纪律（若本任务需要派发）

按 `.trellis/spec/guides/subagent-model-policy.md`（用户 2026-09-28 明令重启）：
1. **派发前必须问用户用哪个模型**，得到确认后才派发；禁止静默用主代理模型。
2. 模型名一律不当全称，须到对应通道的实际可用清单取精确串，候选 + 推荐呈给用户点选。
3. 本仓已确认配置：**Claude 原生 Agent 工具** + `model: sonnet` + `run_in_background`（真并行）——
   换通道 / 换模型仍须重新问。
4. 禁止用 `Kimi K3` 做子代理。
5. 每次派发 prompt 首行必须是 `Active task: .trellis/tasks/09-29-viewer-plugin-adapt`。
6. 只读研究子代理**只许写** `research/` 目录。

> 本任务 Step 1 的实测是**探索性 + 需反复迭代浏览器**，默认由主代理在会话内执行；
> 若改为派发，先过第 1 条。
