# Implement: v6-6 形态保真与分发

> 复选框**随执行实时勾选**（全局规则 §4.5）。顺序即依赖顺序：R1 → R2（含红/绿留证）→ R3 → R4 → R5。

## 阶段 0 — 取证先行（拿到「红」）✅ 完成

- [x] 正式化根因取证工具 `dev/probe-style-mount.js`（钩 createElement/appendChild/insertBefore/replaceChild，
      打印「创建 → 文本写入 → 是否 attached」）；同一工具在 HEAD 与修复版上的输出即为红/绿对照
- [x] 正式化现场脚本 `dev/probe-github-readme.js`（R3 交付物，真扩展 + 真实 GitHub 页）
- [x] 在**修复前**采到「红」（HEAD 版本 + 同口径探针，见偏离记录 1）
- [ ] ~~正式化 `probe-userscript-form.js` / `probe-csp-style.js`~~ —— 见偏离记录 1（不做了）

**验证**：红证据字段级记录在下方「红/绿留证」。

## 阶段 1 — R1 缺陷修复（唯一挂载入口）✅ 完成

- [x] 新增 `sviStyleRoot()` / `mountStyleNode(el)` / `whenRootReady(fn)` / `flushRootReady()` /
      `armRootWatcher()` / `disarmRootWatcher()`（用户脚本「5.5」节，紧邻 `injectStyles` 之前）
- [x] 三处调用点改走 `mountStyleNode`：`injectStyles()` 兜底分支 / `FxInjector.ensureStyleNode()` /
      `BackgroundReplaceEngine` 建 `svi-bgr-style` 处
- [x] **GM 分支不动**（`GM_addStyle(css)` 原样保留，仅加注释说明为何不动）
- [x] 根相关启动动作改走 `whenRootReady`：`updateImageFilterCss` / `updateFontCss` /
      （遮罩变量 + peek 门 + dim）/ `setupFlashGuard` / `setupPendingMask`
- [x] 挂载失败**告警不静默**（有界轮询用尽 → 一条 warn；`appendChild` 失败 → 一条 warn）；正常路径零新增日志
- [x] 新契约导出到 `window.__svi`（`mountStyleNode` / `whenRootReady` / `sviStyleRoot`）
- [x] `node --check universal-smart-invert.user.js` 通过
- [x] 单测：见偏离记录 2（改为由 bench 场景 32/33 覆盖，理由与依据写在那里）

**验证**：`node --check` 通过；`node test.js` 全绿；红场景转绿（见下）。

## 阶段 2 — R2 形态覆盖（含红→绿留证）✅ 完成

- [x] `test-browser.js` 新增 **Scenario 32：GM 垫片形态**（`/shim-page`，先定义 `GM_*` 再执行脚本；
      `__sviShimUsed` 证明 `GM_addStyle` 分支**真的被执行过**）
- [x] `test-browser.js` 新增 **Scenario 33：`document_start` 且 `<html>` 未建**
      （`/nostart-page` 不含脚本，由运行器 `Page.addScriptToEvaluateOnNewDocument` 注入，跑完移除）
- [x] 断言口径：样式表在场 ∧ 字节数 > 40000 ∧ `svi-img-invert-on` 门类落地 ∧ `--svi-img-filter` 已写 ∧
      `computedStyle.filter !== 'none'` ∧ 页面异常零增量
- [x] 场景数 31 → 33；`AGENTS.md` 的「the other 31 scenarios」表述与新契约同步更新
- [x] **红 → 绿**两步留证见下

**验证**：`node test-browser.js` **33 场景全绿，EXIT=0**（日志 `/tmp/bench-run2.log`）。

### 红 / 绿留证（字段级）

同口径（该页 README 图的反色状态）在三个版本上的实测：

| 版本 / 形态 | `htmlClass` | `--svi-img-filter` | 主样式表 | `mdCount` | `attrTrue` | `filterNone` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **HEAD（修复前）** document_start 形态 | `""` | `""` | **不存在** | 31 | 31 | **31** ← 属性写了、滤镜全不生效 |
| **修复后** document_start 形态 | `svi-img-invert-on svi-hover-restore svi-peek-on` | `invert(1) hue-rotate(180deg)…` | 45523 字节 | 31 | 31 | **0** |
| **修复后** 真扩展形态（真实 GitHub 页） | 同上 | 同上 | 45523 字节 | 31 | 31 | **0** |

根因取证实录（`dev/probe-style-mount.js`，修复前的 HEAD）：

```
{"t":40,"kind":"createElement(style)","head":"head=NULL | … <- at injectStyles <- …"}
{"t":42,"kind":"style-text-set","len":45523,"head":" :root { --svi-img-fi…"}
（此后**没有任何 style-attached** —— 整张样式表被丢弃，无异常、无日志）
```

同上（修复后）：同样的 `createElement(head=NULL)` + `text-set`，最终
`FINAL: {"styleInHead":[145,45523,0], "rootVar":"invert(1) hue-rotate(180deg) …", "htmlClass":"svi-img-invert-on …"}`。

bench 侧：`Scenario 32/33` 在修复版上通过；在 HEAD 版上的表现见偏离记录 1 的红证据。

## 阶段 3 — R3 真实站点现场脚本 ✅ 完成

- [x] `dev/probe-github-readme.js`：真扩展（`Extensions.loadUnpacked` + `--remote-debugging-pipe`）→
      真实 GitHub 仓库页 → 断言 `invCount === mdCount && filterNone === 0`，输出 JSON + 截图
- [x] 降级：无 Chrome / 无网 / 无 README 图 → `SKIP: 未验证 (<原因>)`，退出码 0
- [x] 顺带实跑 README 的「一行自检」并同时打印**主世界 / 隔离世界**两份结果
      （用于把「扩展形态下页面控制台看不到 `window.__svi`」写进文档，避免误导）
- [x] 有网实跑一次：`PASS: README 图 31/31 反色且 filter 生效（样式表 45523 字节）`

**验证**：见上。

## 阶段 4 — R4 Edge 常新分发 ✅ 完成

- [x] `scripts/watch-extension.js`（零依赖：`fs.watch` + 防抖 + 递归摘要兜底；失败不退出）
- [x] Edge 安装步骤落 `PUBLISHING.md`（新增 §1.1）与 README / README_EN（新增小节）
- [x] 文档明确「非双击即装」「不自动更新」「免手动需上架商店（本片不做）」
- [x] 顺带修正 `PUBLISHING.md` 的过时事实：`content_scripts` 的 `document_end` → **`document_start`**
- [x] 实跑 `--once` 模式验证重建链（324ms 完成）
- [x] 实跑 watch 模式：改一行真源 → 观察到自动重建（见「验证」）
- [x] 文档补记「Chrome / Edge 137+ 已忽略 `--load-extension`」这一实测事实

**验证**：见下「watch 实跑」。`git status` 不含新产物（`extension/` 本就入库；`dist/` 已 gitignore）。

## 阶段 5 — R5 文档自检流程 ✅ 完成

- [x] README / README_EN 的「GitHub 不生效排查」改写为可自检顺序（版本 → 自动更新静默失败 → 是否被禁 → 一行自检）
- [x] 给出**一行 console 代码**，并附「读法」表；顺带修正过时的 `3.1.0` → `5.0.0`
- [x] 如实写明：自动更新经 `raw.githubusercontent.com`，失败时**静默保留旧版本**，附手动更新入口
- [x] 读法表写明**扩展形态下 `ver` 会是 `undefined`**（隔离世界），避免把「正常隔离」误判成「脚本没跑」

**验证**：`dev/probe-github-readme.js` 实跑该行代码，主世界/隔离世界两份输出均正常返回。

## 阶段 6 — 收口 ✅ 完成

- [x] spec 更新：`.trellis/spec/frontend/style-mount-contract.md`（契约 C1~C4 + 不变量 I1~I5 + 守护断言表），
      并登记进 `frontend/index.md`
- [x] `AGENTS.md` 硬规则补一条（唯一挂载入口 + 禁止裸挂载 + 失败不静默），bench gotchas 补「注入形态盲区」
- [x] 四绿：`node --check` / `test.js` / `test-browser.js` / `gen-icons + build-extension + pack`
- [x] 提交（中文 message + `Co-Authored-By`）并**推送** `origin main`（AGENTS.md 硬规则：不得只提交）
      —— 提交 `044e5dd`，已推 `7f2ada8..044e5dd  main -> main`

**验证**：四绿全绿；`git status` 干净。

---

## 评审门（review gates）

| 门 | 时机 | 判据 | 结果 |
| :--- | :--- | :--- | :--- |
| **G1** | 阶段 1 后 | 修复前红的场景转绿，且既有 31 场景零回归 | **通过** —— 见下方「HEAD 对照（红）」 |
| **G2** | 阶段 4 后 | Edge 可装、watch 可重建、文档写明「非双击即装」 | **通过**（文档 + watch 实跑一次变更触发一次重建） |
| **G3** | 阶段 6 | 四绿 + 新硬规则落 `AGENTS.md` | **通过**（四绿见下） |

### HEAD 对照（红）—— 直接证明新断言对缺陷敏感

在 **HEAD 原版**（未修复）上整跑 bench（日志 `/tmp/bench-head.log`）：

```
[Test] Scenario 32: v6.6 GM shim form (GM_addStyle branch) ...
[Test] Scenario 33: v6.6 document_start form (root not yet created) ...
Test failed with error: AssertionError: 33: 主样式表必须最终在场 (修复前为 0 —— 整张样式表被静默丢弃)
EXIT=1
```

- **场景 33 在 HEAD 上必红** —— 断言确实咬住了缺陷，不是恒真断言；
- **场景 32 在 HEAD 上通过** —— 符合预期：它走 HTML 内联注入、`head` 必然存在，与该缺陷无关；
  它守的是**另一条**从未被测过的分支（`GM_addStyle`）。

修复版：`node test-browser.js` → **33 场景全绿，EXIT=0**（`/tmp/bench-run2.log`）。

### 四绿（阶段 6）

| 门 | 命令 | 结果 |
| :--- | :--- | :--- |
| 语法 | `node --check universal-smart-invert.user.js` | 通过 |
| 单测 | `node test.js` | 全绿（含 v6.0~v6.5 全部既有单测块） |
| 浏览器 bench | `node test-browser.js` | **33 场景全绿，EXIT=0** |
| 构建 | `node scripts/gen-icons.js && node scripts/build-extension.js && node scripts/pack.js` | 10 entries / stored-mode / CRC OK |

## 与计划的偏离记录

**偏离 1 —— 阶段 0 只正式化两个工具，且「红」用同口径探针而非整跑 HEAD bench。**

原计划：正式化 4 个探针（style-mount / userscript-form / csp-style / github-readme），
并在修复前整跑 bench 取红。

实际：正式化 `dev/probe-style-mount.js` 与 `dev/probe-github-readme.js` 两个；
`probe-userscript-form` 与 `probe-csp-style` **不做**。理由：

1. 用户脚本形态已由 bench **场景 32** 常驻覆盖（比一次性探针更可回归），探针只是诊断期用过一次；
2. CSP 结论是一条**事实**（GitHub 的 `style-src 'unsafe-inline' github.githubassets.com` → 不拦内联样式），
   已写入 PRD 背景节；再留一个脚本属重复。
3. 诊断期产生的 `dev/tmp-*.js`（12 个）**保留未删** —— 删除文件属全局规则 §6 的高风险操作，待用户批准后清理。

「红」的取法：先用**逐字段同口径**的探针在 HEAD 版本上实测（表中第一行：
`htmlClass:""` / `filterNone:31`），**随后又整跑了一遍 HEAD bench** 作直接证明 ——
结果：**场景 33 在 HEAD 上必红**（`33: 主样式表必须最终在场`，EXIT=1）、场景 32 通过（走内联注入，与缺陷无关）。
两条证据都留了日志，见 G1 小节。

**偏离 2 —— 单测不新增 Node 桩用例，改由 bench 场景 32/33 承担。**

原计划：`test.js` 为 `mountStyleNode` 增加「有根立即挂 / 无根进队列 / 根出现后补挂 / 超时告警只发一次」的纯逻辑单测。

实际：不加。理由：该逻辑的**正确性判据全是浏览器行为**（`isConnected`、`appendChild` 到 `head`、
`MutationObserver` 捕 `<html>` 插入、`getComputedStyle` 反映滤镜），Node 桩里只能桩出「我假设的语义」，
测的是桩不是实现 —— 属同义反复的恒真断言。bench 场景 33 是在**真实根未就绪的时序**下断言最终结果，
证据强度更高。`test.js` 仍覆盖其余全部逻辑（首跑见偏离 4）。

**偏离 3 —— 修复面比 PRD R1 的文字更宽（但不超 design §2 的范围）。**

PRD R1 只点名「三处样式挂载点」。实现时实测发现：**boot 段的根状态动作同样会被整段静默跳过** ——
`updateImageFilterCss` 里有 `if (rootEl && rootEl.classList && rootEl.style)`，
`updateFontCss` / `setupFlashGuard` / `setupPendingMask` 各自都有 `if (!de …) return`。
若不同时收口，document_start 路径会变成「样式表在场、但门类没上」——**依然不反色**。
故按 design §2.1 的既有设计引入 `whenRootReady`，把这几处一并登记。判定口径：
「有根时立即执行」保证了正常路径**逐字节等价**，属纯增强。

**偏离 4 —— `test.js` 首跑命中一次既有偶发失败（与本改动无关）。**

首跑 `node test.js` 在 `test.js:820` 断言 `chunked write emits meta manifest` 失败（Store 配额分片用例的
定时竞态）；**立即重跑即全绿**。本次改动未触碰 `Store` 与分片路径（`git diff` 可证）。
按「不擅自扩大改动面」的纪律，**未去修这个既有偶发**；只在此如实记录，留作后续任务。

**偏离 5 —— 场景 32 首轮断言写错了基准图。**

首跑 bench 时场景 32 失败：`32: 两张图都应被判为反色 → actual 1, expected 2`。
原因是我选了 `dark-scenery.svg`（暗底图）当「该被反色」的基准图 —— 而**暗底图本来就应保持不反色**
（场景 1 的既定预期：white/gray/cream/blue 才反色，dark 不反）。
**是断言写错，不是被测代码有问题**；改用 `cream-slide.svg`（浅底）后通过。
如实记录，以免后人误读成「修复引入了回归」。
