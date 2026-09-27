# Design: v6-5 扩展工程 —— 真扩展 E2E + CRX

## 1. 边界

**做**：真扩展 E2E 基建（加载真实构建产物、隔离世界断言、`document_start` 时序、`chrome.storage`
持久化、popup 消息协议）、本地零依赖 CRX 打包、密钥管理纪律、CI 双路径、文档如实说明。

**不做**：不改扩展运行时代码（除 manifest 的 `key` 之外）、不引 npm 依赖、不合并进 `test-browser.js`。

**待用户确认的前置**：R2 的密钥生成（生成一对密钥并把**公钥**写进 manifest 的 `key` 字段）
是**一次性动作**，PRD 明确要求先确认。在确认之前，本片照常可跑：
- 扩展 ID 由 **unpacked 派生规则**（绝对路径的 SHA-256 取前 32 位十六进制、映射到 a~p）就地算出，
  **同一路径内可复现**；跨路径的确定性断言（R2 的 AC）留到写入 `key` 之后。
- `build-crx.js` **默认不生成密钥**：缺密钥时打印指引并以非零码退出；只有显式 `--generate-key`
  才会生成并在控制台**醒目提示立即离线备份**（PRD R8 的纪律）。

## 2. 现状接缝（实读）

| 事实 | 位置 |
| :-- | :--- |
| 扩展产物生成 | `scripts/build-extension.js`（确定性、幂等） |
| 零依赖 zip 库（stored-mode + 中央目录解析） | `scripts/lib/zip.js` |
| 确定性打包（zip） | `scripts/pack.js` |
| CDP 封装与 Chrome 探测 | `test-browser.js`（`spawn` + `--remote-debugging-port`） |
| release CI 的 CRX 步骤 | `.github/workflows/release.yml`（`npx --yes crx3`，门禁在 secret 上） |
| 私钥纪律 | `PUBLISHING.md` §4（`openssl genrsa`，绝不提交） |
| 扩展无 background | `manifest.json` 无 `background.service_worker` → 无法靠 SW target 反查 ID |

## 3. 架构决策

### D1 — 独立套件 `test-extension.js`，独立 Chrome 实例

- 启动参数：`--load-extension=<abs> --disable-extensions-except=<abs>` + 独立 `--user-data-dir`
  （与 bench 的固定 profile 分开，避免互相污染）。
- **自带构建前置**：先跑 `gen-icons` → `build-extension`，保证测的是最新产物（不是陈旧副本）。
- Chrome 缺位 → **跳过并打印警告**（与 `test-browser.js` 的既有降级纪律一致）；
  跳过时**必须**打印「未验证」而不是「通过」，且退出码为 0（CI 里 Chrome 由 setup-chrome 提供）。
- **断言「扩展确实加载」**：先算 ID 并 `chrome-extension://<id>/manifest.json` 可读，
  否则直接失败 —— 防止「静默测了个空页面」。

### D2 — 扩展 ID 的两种来源

```
有 manifest.key（用户确认后写入） → ID 由公钥派生, 跨机器/路径稳定 (R2 的目标状态)
没有 key（当前状态）             → ID 由 unpacked 绝对路径派生, 同一路径内可复现
```

两种都实现：套件优先读 `manifest.json` 的 `key`（存在时用它算 ID），否则退回路径派生。

### D3 — 隔离世界断言的做法

真扩展下 `window.__svi` 在**页面主世界不存在**（content script 在隔离世界），因此：

- 断言 `window.__svi === undefined`（主世界）；
- 断言效果可见：`[data-svi-inverted]` / `[data-svi-region]` 等 **DOM 属性**存在（DOM 是共享的）；
- 需要读引擎内部状态时，改用**页面内的 DOM/属性观察**或像素采样，不再依赖 `__svi`。

### D4 — `document_start` 首屏时序（补 v5-5 的 A 级欠账）

- 用 `Page.addScriptToEvaluateOnNewDocument` 在**页面脚本之前**埋一个观察器：记录
  `data-svi-pending` / `data-svi-inverted` 首次出现的时刻，以及首个 `<img>` 的首次绘制前状态。
- 判据（v5-5 R3 的语义）：**首屏图片在被反色前从未以原色出现过** —— 即「先打 pending 再反色」，
  而不是「先原色闪一下再反色」。
- 用户脚本形态（`@run-at document-end`）**不满足**该判据是**预期**的：套件断言的是
  「面板/文档如实说明」这条降级路径，而不是假装达标（R4 的 AC 原文如此）。

### D5 — `chrome.storage` 持久化

- 在扩展形态下写一个偏好（经页面内 UI 或直接 `chrome.storage` 同步写入），重载页面，
  断言偏好仍在，且 `Store` 后端被识别为 `chrome.storage.*` 而非 localStorage。
  后端判定走页面内的 `__svi`? 隔离世界下拿不到 → 改为断言**行为**：清掉 localStorage 后偏好仍存活
  （localStorage 不是真源即为 chrome.storage 生效的充分证据）。

### D6 — popup 端到端

- `chrome-extension://<id>/popup.html` 作为独立 target 附着 CDP；
- 断言：版本号渲染、站点状态渲染、三条消息协议往返（`svi-get-snapshot` / `svi-site-power` /
  `svi-set-pref`）、浏览器内部页上显示 `unavailable`。

### D7 — CRX 打包与结构校验

- 优先本机 Chrome：`--pack-extension=<dir> --pack-extension-key=<pem>`（与应用商店同源实现）；
  无 Chrome → 降级 `npx --yes crx3`（与 release CI 同路径）。
- **结构校验**（复用 `scripts/lib/zip.js`）：CRX3 魔数 `Cr24` + 版本 3 + 头部长度字段自洽 +
  内嵌 ZIP 的中央目录可解析且条目数与 `extension/` 一致。
- **默认不生成密钥**（见 §1）；生成时醒目提示离线备份。

### D8 — CI 双路径

- 有 `CRX_PRIVATE_KEY` → 签名打包 + 上传产物；无 → 跳过（现状不变），
  但**真扩展 E2E 必须跑**（无 Chrome 才跳过）。

## 4. 风险

| 风险 | 处置 |
| :-- | :--- |
| 静默测了个空页面 | 先验 `chrome-extension://<id>/manifest.json` 可读，否则失败（D1） |
| 隔离世界导致断言全废 | 断言改为 DOM 属性 / 像素 / 存储行为（D3~D5） |
| CI 无 Chrome 时假绿 | 跳过路径打印「未验证」并单独计数（D1） |
| 私钥泄漏 | 默认不生成；生成时只在本地文件系统；`.gitignore` 三重覆盖；`grep` 单测把关 |
| CRX 被当成「双击安装」 | 文档明确写出 Windows 默认阻止非商店 CRX 的事实（R10） |
