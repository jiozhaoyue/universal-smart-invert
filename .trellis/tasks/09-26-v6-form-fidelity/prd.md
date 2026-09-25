# PRD: v6-6 形态保真与分发 —— 静默丢样式缺陷 + 真实站点回归 + Edge 常新安装

> 本片由用户 2026-09-26 报障触发：「一些常用场景，如 github readme 里的图片，就没有反色」
> （举例仓库 `https://github.com/qixing-jk/all-api-hub`），并明确要求
> 「修缺陷 + v6-4 第二轮 + v6-5 全做完」；Edge 分发方式由用户在本次裁决为
> 「先「加载已解压扩展」+ 重建 watch」。

## 背景（现状核查，逐条实读）

### 报障与实测结论的对照

| 形态 | 实测结果 | 证据 |
| :--- | :--- | :--- |
| **真扩展**（`Extensions.loadUnpacked` + `--remote-debugging-pipe`） | 该仓库 README **31/31 图片反色成功**，`computedStyle.filter` 真实生效；主世界 `window.__svi === undefined`，隔离世界可见 `.svi-capsule-root` | `dev/tmp-probe-gh-ext.js` 实跑输出 |
| **用户脚本**（如实模拟油猴：`GM_addStyle` 等垫片 + `@run-at document-end`） | 同一页 **31/31 反色成功**；GitHub 深色与浅色两种主题都试过 | `dev/tmp-probe-tm.js` 实跑输出（`gm` / `gm light` 两次） |
| **CDP `document_start` 注入**（`Page.addScriptToEvaluateOnNewDocument`） | **属性写了、滤镜没生效**：`data-svi-inverted="true"` 31 个，而 `computedStyle.filter === "none"`、`html.svi-img-invert-on` 类缺席 | `dev/tmp-probe-gh-css.js`；`example.com` 对照同样复现 |

**因此本片不宣称「README 图片不反色」已被复现**，而是把**实测确凿的那条缺陷**修掉、
把它赖以藏身的**测试盲区**补上，并交付一条**能一键取证的现场流程**给用户对账。

### 缺陷（实测确凿）：样式表在挂载点为空时被**静默丢弃**

`injectStyles()` 是全场 45523 字节样式表的唯一注入点，末尾挂在
`document.head || document.documentElement` 上；而形如

```js
const styleRoot = document.head || document.documentElement;
if (styleRoot) styleRoot.appendChild(el);        // ← 两者皆 null 时：什么都不做，也不报错
```

的写法在 **`<html>` 尚未创建**的时刻会**整张样式表丢掉且不留任何痕迹**。

实跑钩子取证（`dev/tmp-probe-hook.js`，钩 `createElement` / `appendChild` / `insertBefore` / `replaceChild`）：

```
t=40ms   createElement(style) ← injectStyles   head=NULL
t=42ms   style-text-set len=45523  ( :root { --svi-img-fi…
（此后该节点从未 attached —— 无异常、无 console 输出）
```

后果链：样式表不在 → `html.svi-img-invert-on img[data-svi-inverted="true"]` 规则不存在
→ **属性照写、滤镜不生效** → 用户看到的就是「图片没有反色」。

同族写法在三处（实读行号）：

| 位置 | 代码 | 失败语义 |
| :--- | :--- | :--- |
| `injectStyles()` 末尾 | `const styleRoot = …; if (styleRoot) styleRoot.appendChild(el)` | **静默丢弃**（本次主因） |
| `FxInjector.ensureStyleNode()` | `(document.head \|\| document.documentElement).appendChild(this.styleNode)` | 无守卫 → `null.appendChild` **抛错** |
| `BackgroundReplaceEngine` 建 `svi-bgr-style` | 同上写法，包在 `try{}` 内 | 抛错后**被 try 吞掉**，同样静默 |

### 测试盲区：`GM_addStyle` 分支与 `document_start` 时序**从未被测过**

`test-browser.js`（3534 行，31 个场景）的注入方式是**把脚本内联进被测 HTML**
（`${executableScript}` 出现在 20+ 处页面模板里），且**不定义任何 GM 垫片**。实读确认：

- `grep -n "GM_addStyle\|GM_getValue" test-browser.js` → **零命中**；
  即 `typeof GM_addStyle === 'function'` 恒为假，`GM_addStyle` 分支（油猴真实路径）**从未执行过**；
- 脚本由 HTML 解析阶段执行，`document.head` 必然存在 → 上表的挂载点竞态**从未触发过**。

这两条正是一条「属性照写、滤镜不生效」的缺陷能穿过 31 个场景而不被发现的原因。

### Chrome / Edge 153 已忽略 `--load-extension`

本机 Chrome `153.0.8010.53`、Edge `153.0.4234.48`。实测 `--load-extension` +
`--disable-extensions-except` 启动后，`/json/list` 里只有 Chrome 自带 PDF 扩展
（`nkeimhogjdpnpccoofpliimaahmaaome`），**本扩展未被加载**（`dev/tmp-probe-ext.js` 实跑输出）。
可行通道已在本仓验证：`--remote-debugging-pipe` + CDP `Extensions.loadUnpacked`
（`--enable-unsafe-extension-debugging`），先例见 `dev/probe-popup-e2e.js`，
`dev/tmp-probe-gh-ext.js` 亦据此成功取到 `extId = bicopdjpejpakedhbncplfpbkoimkmla`。

> 这条直接影响 **v6-5 R1 的实现方案**（其 `implement.md` 阶段 2 写的是 `--load-extension`），
> 本片把结论固化下来，v6-5 阶段 2 据此改写（跨任务依赖记在此处，不改 v6-5 的 PRD 文本）。

### Edge 常新安装：本机现状

用户裁决方案 = 「加载已解压扩展 + 重建 watch」。实测约束：

- Edge 与 Chrome 同源，**同样忽略 `--load-extension`** → 无法用命令行完成永久安装；
- Edge 的「开发人员模式 → 加载解压缩的扩展」（`edge://extensions`）指向一个**固定目录**，
  该目录内容变化后点「重新加载」即生效 —— 因此「始终最新」的关键是**让那个目录始终是最新构建**。

## Requirements

### R1 — 修掉挂载点静默丢弃（缺陷本体）
- 抽出**唯一**的样式挂载入口（如 `mountStyleNode(el)`），三处调用点全部改走它。
- 行为契约：**有根即挂**；**无根则排队**，`<html>`/`<head>` 一出现立即补挂；补挂三条通道
  并行（MutationObserver + `readystatechange` + 有界轮询兜底），成功即全部拆除，**不阻塞 boot**。
- **失败不许静默**：超过阈值仍未挂上时打一条 `[SmartInvert] …` 告警（含节点 id 与原因）。
- 另外两处 `null.appendChild` 抛错路径一并消除（它们目前靠 `try{}` 吞掉或直接抛）。
- **AC**: 在 `<html>` 未创建的 `document_start` 注入下，主样式表**最终在场**且
  `html.svi-img-invert-on` 命中、`computedStyle.filter !== "none"`；全程无未捕获异常。

### R2 — 补上从未覆盖的两种注入形态（回归断言）
- 新增 bench 场景：**GM 垫片形态**（定义 `GM_addStyle` / `GM_getValue` / `GM_setValue` /
  `GM_deleteValue` / `GM_xmlhttpRequest` / `GM.xmlHttpRequest`，即油猴 `@grant` 列表）
  —— 首次真正执行 `GM_addStyle` 分支。
- 新增 bench 场景：**`document_start` 且 `<html>` 未建**（`Page.addScriptToEvaluateOnNewDocument`，
  当前 100% 复现缺陷的那条路径）。
- 两个场景的断言口径一致且必须**实测样式表在场 + 滤镜真实生效**，不得只断言属性。
- **AC**: 修复前两场景**必失败**（红），修复后**必通过**（绿）—— 即断言对缺陷敏感，
  不是「恒真断言」。红→绿两步都要留证据。

### R3 — 真实站点回归（GitHub 仓库页 README）
- 交付可复现的现场取证脚本 `dev/probe-github-readme.js`：真扩展形态加载真实扩展 →
  打开真实 GitHub 仓库页 → 断言 README 图片「被反色且滤镜生效」，输出可留证的 JSON + 截图。
- GitHub CSP 实读为 `style-src 'unsafe-inline' github.githubassets.com` → **不拦内联样式**，
  已在 PRD 记录，防止后人再次误判为 CSP 问题。
- 有网则跑、无网/无 Chrome 则**跳过并打印「未验证」**（与既有降级纪律一致，退出码 0）。
- **AC**: 有网时脚本输出 `README 图 n/n 反色且 filter 生效`；并作为 v6-5 真扩展 E2E 的
  真实站点场景被复用（本片只交付脚本与断言口径，不重复搭 E2E 骨架）。

### R4 — Edge「加载已解压 + 常新」分发
- 新增 `scripts/watch-extension.js`（**零依赖**）：监听用户脚本与 `scripts/extension-src/`
  的变更 → 防抖 → 依次跑 `gen-icons` / `build-extension`，可选 `pack`；打印重建结果与耗时。
- 文档：`PUBLISHING.md` 增「Edge 安装（加载已解压）」小节 —— 给出 `edge://extensions`
  开发者模式步骤、**指向仓库内 `extension/` 绝对路径**、说明「重建后点『重新加载』即生效」；
  README / README_EN 补一句指引。
- 明确写清：**不是**双击即装；真正免手动更新需上架 Edge 加载项商店（本片不做，留作后续）。
- **AC**: `node scripts/watch-extension.js` 启动后，改一行用户脚本能在秒级看到
  `extension/content.js` 被重建；`git status` 不含任何新产物。

### R5 — 用户对账流程（文档）
- README FAQ「GitHub 不生效排查」改写为**可自检的顺序**：先查脚本版本（自动更新静默失败
  会留下旧版本）→ 再查**样式表是否在场** → 再查属性是否写入；给出**一行 console 代码**。
- **AC**: FAQ 里那一行 console 代码实测可用（本片验证后落文档）。

## Constraints

- **零 npm 依赖**：不得引入 `package.json` / `node_modules`；`watch` 用 `fs.watch` + `setTimeout` 自写。
- **不得放宽既有断言来「通过」**：`test.js` / `test-browser.js` 现有断言只能加强不能弱化。
- **不得把 `extension/` 当手写源**：它是 `build-extension.js` 的产物。
- 修复必须**不改变既有行为**：有根时挂载时机与顺序与修复前一致（避免 SPA/时序断言漂移）。
- 注释与文档全中文。

## Acceptance Criteria（汇总）

- [ ] R1：三处挂载点统一走单一入口；无根时补挂；超时告警不静默
- [ ] R2：新增两个场景**修复前红、修复后绿**（红绿两步都有留证）
- [ ] R3：`dev/probe-github-readme.js` 在有网环境下证明真实 GitHub README 图反色生效；无网优雅跳过
- [ ] R4：`scripts/watch-extension.js` 可用；`PUBLISHING.md` / README / README_EN 写出 Edge 加载已解压步骤与「非双击即装」的事实
- [ ] R5：README FAQ 给出可用的自检顺序与一行 console 代码
- [ ] 门禁四绿保持（`node --check` / `test.js` / `test-browser.js` / build+pack）；
      v6-5 落地后并入五绿

## Notes

- 用户报障的**原始现象我未复现出来**（两种真实形态都正常）。本片的立论是「修实测确凿的缺陷
  + 补齐它赖以藏身的盲区 + 交付取证流程」，**不声称已定位用户具体那台的病因**；
  用户若回复 console 自检结果（版本 / 样式表在场与否），按结果回填本节。
- 跨任务依赖：v6-5 阶段 2 的 `--load-extension` 方案须改为 `Extensions.loadUnpacked`（见背景节）。
