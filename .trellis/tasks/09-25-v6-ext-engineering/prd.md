# PRD: v6-5 扩展工程 —— 真扩展 E2E + CRX

## 背景（现状核查，逐条实读）

### 扩展测试的现状：**没有真扩展测试**

`grep` 全文件核查 `test-browser.js`（175KB）：`--load-extension` / `--disable-extensions-except` /
`chrome-extension://` / `serviceWorker` **全部零命中**。

现有「扩展场景」（Scenario 12 共存握手）的做法是：把构建产物 `extension/content.js`
（含 `EXT_MODE` 前奏）当作**普通 `<script>` 注入页面**。源码注释也写明了这一点
（「注入真实构建产物 extension/content.js（含 EXT_MODE 前奏）」）。

它验的是「同一份代码在页面上下文跑」的共存逻辑，**不是**扩展形态本身。以下四类差异
**完全没有覆盖**：

| 未覆盖项 | 为什么必须真扩展才能测 | 后果 |
| :--- | :--- | :--- |
| **隔离世界**（isolated world） | content script 与页面脚本不共享 `window` | 现有 bench 大量断言走 `window.__svi`，真扩展下**全部不可用**，需改为 DOM 属性 / 像素断言 |
| **`document_start` 首屏时序** | 用户脚本 `@run-at document-end`，扩展 `document_start` | v5-5 的「首屏零白闪」A 级验收**正因此被降级**，至今欠着 |
| **`chrome.storage` 持久化** | `Store.detectBackend()` 在扩展形态下走 `chrome.storage.sync/local` | 存储后端分叉未验 |
| **popup 页** | `chrome-extension://<id>/popup.html` 是独立 target | `popup.js` 的消息协议无端到端覆盖 |

### CRX 的现状：**有 CI 步骤，本地无脚本，dist 里没有产物**

`.github/workflows/release.yml` 已有 `npx --yes crx3 -p "$KEY_FILE" -o dist/extension.crx extension/`，
但**门禁在 `CRX_PRIVATE_KEY` secret 上**（无 secret 静默跳过），且**本地没有任何脚本能产出 CRX**。
`PUBLISHING.md` §4 记录了私钥生成方式（`openssl genrsa -out crx-private-key.pem 2048`）与
「绝不提交进仓库」的纪律。本仓库为**公开仓**，这条纪律是硬约束。

现有基建可直接复用：零依赖的 `scripts/lib/zip.js`（stored-mode 写 + 中央目录解析）、
`scripts/pack.js`（确定性打包）、`scripts/build-extension.js`（确定性生成）、
`test-browser.js` 的 CDP 封装（spawn Chrome + remote-debugging-port）。

## Requirements

### R1 — 真扩展 E2E 基建
- 新增独立套件（建议 `test-extension.js`），以 `--load-extension=<abs path>` +
  `--disable-extensions-except=<abs path>` 启动 Chrome，加载**真实构建产物** `extension/`。
- **不得引入 npm 依赖**：沿用现有 `spawn` + CDP 手法（现无 `package.json`，
  `npx --yes crx3` 只在 release CI 里用）。禁止引入 Playwright / Puppeteer。
- 套件必须**自带构建前置**（跑 `gen-icons` → `build-extension`），确保测的是最新构建。
- Chrome 缺位时**跳过而非失败**（与 `test-browser.js` 的既有降级纪律一致：本地无 Chrome
  时打印警告但不阻断；CI 里 Chrome 由 `browser-actions/setup-chrome` 提供）。
- **AC**: 套件能在本地与 CI 跑起来；断言「扩展确实被加载」（而非静默测了个空页面）。

### R2 — 扩展 ID 的确定性（真扩展测试的前置）
- 真扩展下要打开 `chrome-extension://<id>/popup.html`，必须**预先知道扩展 ID**。
- 本扩展**没有 `background.service_worker`**，因此无法靠 service worker target 反查 ID；
  且 unpacked 扩展的 ID 由**绝对路径**派生，跨机器/路径不稳定 → CI 里不可靠。
- 建议方案：在 manifest 中写入 **`key` 字段**（配对密钥的**公钥**，非机密），使扩展 ID
  **确定且可复现**。私钥离线保管 / 进 CI secret，**绝不入库**。
- **AC**: 同一份 `key` 在不同路径下加载得到**同一扩展 ID**（两条路径各跑一次断言）；
  `grep` 核查仓库内不存在任何 PEM 私钥。
- **注**：本项需生成一对密钥并提交公钥，属一次性动作，**执行前需用户确认**。

### R3 — 隔离世界断言
- 断言页面主世界**看不到** `window.__svi`（真扩展下 content script 在隔离世界）。
- 断言页面主世界**看得到**效果：`data-svi-*` 属性（DOM 是共享的）。
- **AC**: 真扩展 bench 中断言 `window.__svi === undefined` 而
  `document.querySelector('[data-svi-inverted]')` 非空。

### R4 — `document_start` 首屏时序（补 v5-5 欠的 A 级验收）
- 真扩展形态下断言 **v5-5 R3 的「首屏图片在被反色前从未以原色出现过」**。
- 方法由 design 定（候选：CDP `Page.startScreencast` 逐帧；或用 CDP
  `Page.addScriptToEvaluateOnNewDocument` 提前埋点，记录属性门出现的时序 vs 首次绘制时刻）。
- 同时断言 v5-5 R4 的**用户脚本形态诚实降级**：用户脚本形态下首屏元素**不**被打 pending 标记。
- **AC**: 扩展形态首屏零白闪断言通过；用户脚本形态不达标时断言「面板显示了说明文案」
  （而不是假装达标）。

### R5 — `chrome.storage` 持久化
- 断言设置经 `chrome.storage` 跨页面重载保持（真扩展的 `Store.detectBackend()` 路径）。
- **AC**: 写入偏好 → 重载页面 → 偏好仍在；且后端被识别为 `chrome.storage`（非 localStorage）。

### R6 — popup 页端到端
- 打开 `chrome-extension://<id>/popup.html` 作为独立 target，断言：
  - 页面加载、快照渲染（版本号 / 主机名 / 计数值）；
  - 三条既有消息协议 `svi-get-snapshot` / `svi-site-power` / `svi-set-pref` 的往返；
  - 在浏览器内部页（不可用页）上正确显示 `unavailable` 态。
- **AC**: popup target 可被 CDP 附着并完成上述断言；协议往返结果被断言（非仅「无异常」）。

### R7 — 本地零依赖 CRX 打包
- 新增 `scripts/build-crx.js`：**优先**调用本机 Chrome 的
  `--pack-extension=<dir> --pack-extension-key=<pem>`（零依赖、与应用商店同源实现）；
  无 Chrome 时降级 `npx --yes crx3`（与 release CI 现有路径一致）。
- 产物落 `dist/`（已 gitignore），命名与 zip 一致规范。
- **确定性**：与 `pack.js` / `build-extension.js` 的确定性纪律一致（可复现）。
- **AC**: 一条命令产出 `.crx`；对产物做**结构校验**（CRX3 头部魔数 `Cr24` + 版本 3 +
  内嵌 ZIP 的中央目录可解析，复用 `scripts/lib/zip.js`）。

### R8 — 密钥管理（公开仓硬约束）
- `.pem` 私钥**绝不入库**：`.gitignore` 显式加 `*.pem` / `crx-private-key.pem` /
  `*.crx`（若决定不提交 CRX 产物）。
- 本地首次运行自动生成密钥并**明确提示用户立即离线备份**。
- CI 与本地使用**同一密钥**，保证扩展 ID 与升级链稳定。
- **AC**: `grep` 核查仓库内无 PEM；`.gitignore` 覆盖到位；`git status` 干净。

### R9 — CI 双路径（缺 secret 不阻断）
- 有 `CRX_PRIVATE_KEY` → 走签名打包并上传 Release 产物；
- 无 secret → **跳过而非失败**（现有机制保持不变），但**必须**跑真扩展 E2E 套件。
- **AC**: 无 secret 时 release 流程成功且产物含 zip；真扩展 E2E 在 CI 中为必过项。

### R10 — 文档：如实说明 CRX 的真实分发限制
- `PUBLISHING.md` 与 README 必须写清：**非商店来源的 CRX 在 Windows Chrome 上默认被阻止安装**
  （需企业策略或启动参数），CRX 主要面向企业内部分发 / 离线部署 / 需要固定扩展 ID 的场景；
  普通用户仍推荐「加载已解压扩展」或应用商店。
- **不得**把 CRX 描述成「双击即可安装」。
- **AC**: 文档明确写出该限制与替代路径。

## Constraints

- **零 npm 依赖**：不得引入 `package.json` / `node_modules`。`npx --yes` 仅限 CI 的
  CRX 降级路径（现状已如此）。
- **不得把 `extension/` 当作手写源**：它是 `build-extension.js` 的产物。
- **不得放宽既有断言来「通过」**：`test.js` / `test-browser.js` 的现有断言不得弱化。
- 真扩展 E2E **不得**与 `test-browser.js` 合并成一个巨型文件（现有 175KB 已偏大），
  保持独立套件、独立 Chrome 实例。
- 签名私钥属于最高敏感项：不得进仓库、不得进日志、不得进 CI 产物。
- 注释与文档全中文。

## Acceptance Criteria（汇总）

- [ ] 真扩展 E2E 套件加载真实扩展并断言「确实加载成功」
- [ ] 扩展 ID 确定可复现（`key` 字段方案），无 PEM 入库
- [ ] 隔离世界断言：主世界无 `__svi`，DOM 属性可见
- [ ] `document_start` 首屏零白闪断言（补 v5-5 欠账）+ 用户脚本形态降级断言
- [ ] `chrome.storage` 跨重载持久化断言
- [ ] popup 页三条消息协议端到端断言
- [ ] `scripts/build-crx.js` 一条命令产出可结构校验的 CRX3
- [ ] `.gitignore` 覆盖私钥与产物；`grep` 核查无 PEM
- [ ] CI：无 secret 不阻断，真扩展 E2E 必过
- [ ] 文档写明 CRX 非商店分发的真实限制
- [ ] 四绿门禁扩为五绿：`node --check` / `test.js` / `test-browser.js` /
  `test-extension.js` / build+pack

## Notes

- 本片是批2 ⑤，**无批1 依赖**，可与批1 并行开工（甚至可提前，因为它产出的真扩展
  E2E 基建能反过来验证批1 在扩展形态下的行为）。
- R2 的密钥生成是**一次性且需用户确认**的动作，不得擅自执行。
- 本片补的是 v5-5 明确的欠账（其 PRD 的 A 级验收 `首屏零白闪` 因缺此基建被降级为
  「由 bench 与代码审查覆盖」），结案时应在 v5-5 的结案说明里回填交叉引用。
