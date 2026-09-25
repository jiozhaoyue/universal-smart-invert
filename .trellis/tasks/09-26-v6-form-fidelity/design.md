# Design: v6-6 形态保真与分发

> 覆盖 R1 / R2 / R3 / R4 的技术设计。R5 是文档，随实现收口，不单列设计。

## 1. 边界与不变量

**必须保持的不变量**（改动不得破坏）：

1. **有根时的挂载时机与顺序不变** —— `injectStyles()` 仍是 boot 里第一个注入动作，
   `GhostDomRegistry.install()` 紧随其后；样式节点仍是无 id 的裸 `<style>`（面板 CSS 里没有
   依赖 id 的选择器，但 `svi-bgr-style` / `svi-fx-style` **有 id 且被 `getElementById` 复用**）。
2. **单文件真源** —— 全部改动落在 `universal-smart-invert.user.js`；`extension/` 由构建产出。
3. **零依赖** —— 不新增 `package.json`；watch 用 `fs.watch` 自写。
4. **不阻塞 boot** —— 挂载失败只能是「稍后补挂」，绝不能 await/轮询卡住启动路径。

## 2. R1：样式挂载唯一入口

### 2.1 契约

```js
// 返回真正承载该节点的容器（可能为 null）
function sviStyleRoot() { return document.head || document.documentElement || null; }

// 唯一挂载入口。有根即挂；无根排队并在根出现的第一时刻补挂。永不抛错、永不阻塞。
function mountStyleNode(el) -> el
```

- 内部维护模块级队列 `pendingStyleNodes`（含 `id` 以便日志定位）。
- 补挂三条通道**并行**，任一生效即全部拆除：
  1. `MutationObserver(document, { childList: true, subtree: false })` —— 捕 `<html>` 被插入 `document`；
  2. `document.addEventListener('readystatechange', …)` —— 兜住 observer 未覆盖的解析阶段切换；
  3. 有界轮询（`setTimeout` 递增间隔，上限约 8 次 / ~2s）—— 兜住前面两条都失效的宿主。
- 全部失败时 `console.warn('[SmartInvert] 样式节点未能挂载: <id>')`，**不再静默**。
  告警只在**真的失败**时出现，正常路径零输出（保护既有「零噪声」断言与体验）。

### 2.2 三个调用点

| 调用点 | 现状 | 改为 |
| :--- | :--- | :--- |
| `injectStyles()` 末尾（GM 分支之外的兜底） | `if (styleRoot) appendChild` | `mountStyleNode(el)` |
| `FxInjector.ensureStyleNode()` | 无守卫，`null.appendChild` 抛错 | `mountStyleNode(this.styleNode)`（保留 `id='svi-fx-style'`） |
| `BackgroundReplaceEngine` 建节点处 | 同上，错误被 `try{}` 吞 | `mountStyleNode(this.styleNode)`（保留 `id='svi-bgr-style'`） |

**GM 分支保持原样**：`typeof GM_addStyle === 'function'` 时仍走 `GM_addStyle(css)`
—— 那是宿主（油猴）自己的挂载实现，不该由我们改写其语义。只在**兜底分支**引入新入口。

### 2.3 为什么不用「等 documentElement」

一个朴素方案是「没根就 `setTimeout(重试)`」。不选它的原因：轮询精度差、
在 `document_start` 前几毫秒内会空转多次、且无法在 boot 之后仍然成立。
MutationObserver 是零成本的事件式方案，轮询只作**兜底**保留且**有界**。

## 3. R2：两种注入形态的 bench 场景

### 3.1 GM 垫片形态（首次覆盖 `GM_addStyle` 分支）

- 在页面里**先**定义 `GM_addStyle` / `GM_getValue` / `GM_setValue` / `GM_deleteValue` /
  `GM_xmlhttpRequest` / `GM.xmlHttpRequest`，**再**执行脚本 —— 顺序即油猴的语义。
- `GM_addStyle` 垫片仿油猴：建 `<style>` → 追加到 `sviStyleRoot()` 等价位置 → 返回该元素。
- 断言：样式表在场 + `computedStyle.filter !== 'none'` + `data-svi-inverted` 计数 > 0。
- **注意**：`@grant GM_*` 存在时脚本进沙箱；本 bench 场景**不模拟沙箱 Proxy**，
  只覆盖「GM 函数存在 → 走 GM 分支」这条判定与后续行为。沙箱差异记入场景注释，不假装覆盖。

### 3.2 document_start 形态（当前 100% 复现缺陷）

- 用 `Page.addScriptToEvaluateOnNewDocument` 注入（现有 bench 的 HTML 内联方式**不动**，
  新场景独立）。
- 断言同 3.1。**修复前必须红**：这是本片断言有效性的自证。

### 3.3 红→绿留证

`implement.md` 里要求：先跑新场景拿到失败输出并贴进偏离记录，再做修复，再跑绿。
防止写出「恒真断言」蒙混。

## 4. R3：真实站点现场脚本

- `dev/probe-github-readme.js` 复用 v6-5 已验证的通道：`--remote-debugging-pipe` +
  `Extensions.loadUnpacked`（`--enable-unsafe-extension-debugging`）。
- 断言口径（**必须断言真实生效，不许只看属性**）：
  `mdCount > 0` ∧ `invCount === mdCount` ∧ `filterNone === 0`。
- 降级：无 Chrome / 无网 / README 无图 → 打印 `SKIP: 未验证 (<原因>)`，退出码 0。
- 该脚本是**取证工具**，不是 CI 门禁（CI 里真实站点易抖，v6-5 的真扩展 E2E 用本地 fixture 保稳，
  真实站点作为可选场景）。

## 5. R4：watch 脚本与 Edge 安装

### 5.1 `scripts/watch-extension.js`

- 零依赖：`fs.watch` 递归监听 `universal-smart-invert.user.js` 与 `scripts/extension-src/`。
- 防抖（默认 300ms，可 `--debounce`）→ 依次 `gen-icons` → `build-extension`（可选 `--pack`）。
- 子进程用 `execFileSync(process.execPath, [...])`，与 `test-browser.js` 的既有手法一致。
- 单次重建失败**不退出**（打印错误，继续监听）—— watch 场景下退出等于失去保护。
- Windows 上 `fs.watch` 对**新文件**的 `rename` 事件不总是递归触发：对 `scripts/extension-src/`
  额外做一次目录级监听，并在每次事件后**比对 mtime 摘要**兜底。

### 5.2 Edge 安装步骤（文档）

1. `edge://extensions` → 打开「开发人员模式」；
2. 「加载解压缩的扩展」→ 选 **仓库内的 `extension/` 目录**（绝对路径）；
3. 源码改动后（watch 已自动重建）→ 在该扩展卡片上点「重新加载」；
4. 明确写：**非双击即装**；免手动更新需上架 Edge 加载项商店（本片不做）。

## 6. 兼容性 / 回滚

- **兼容性**：改动集中在「挂载」这一件事上，不触碰决策、属性写入、面板 DOM 与消息协议。
  唯一的对外可见差异是**以前会丢样式表的宿主，现在不丢了** —— 属于纯修复。
- **回滚**：单文件、无数据迁移、无偏好键变化。`git revert` 该提交即回到旧行为。

## 7. 与 v6-5 的接口

| 约定 | 内容 |
| :--- | :--- |
| 真扩展加载通道 | `--remote-debugging-pipe` + `Extensions.loadUnpacked`；**禁用** `--load-extension` |
| 现场脚本 | 本片交付 `dev/probe-github-readme.js`；v6-5 的真扩展 E2E 可直接复用其断言口径 |
| 门禁 | 本片保持四绿；v6-5 落地后并入五绿（含 `test-extension.js`） |
