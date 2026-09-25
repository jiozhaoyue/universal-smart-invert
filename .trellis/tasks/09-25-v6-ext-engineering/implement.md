# Implement: v6-5 扩展工程 —— 真扩展 E2E + CRX

> 复选框**随执行实时勾选**（全局规则 §4.5）。
> **前置闸门**：R2 的密钥生成需**用户单独确认**（PRD Notes 明写），未确认前本片照常推进
> 不依赖密钥的部分（见 design §1）。

## 阶段 0 — 密钥纪律与 gitignore（R8）✅ 完成

- [x] `.gitignore` 显式覆盖 `*.pem` / `crx-private-key.pem` / `*.crx`
- [x] 单测/grep：仓库内不存在 PEM 内容（`-----BEGIN` + `PRIVATE KEY`）
- [x] `PUBLISHING.md` 补「本地打包与密钥备份」小节（含 §5.2 分发限制）

**验证**：`git status` 干净；grep 无 PEM。

## 阶段 1 — 本地零依赖 CRX 打包（R7）✅ 完成

- [x] `scripts/build-crx.js`：优先本机 Chrome `--pack-extension`；无 Chrome 降级 `npx --yes crx3`
- [x] **默认不生成密钥**（实测：缺密钥时打印指引并 exit 1）；`--generate-key` 才生成并醒目提示离线备份
- [x] 结构校验：`Cr24` 魔数 + 版本 3 + 头部自洽 + 内嵌 ZIP 中央目录可解析（复用 `scripts/lib/zip.js`）
- [x] 产物落 `dist/`（已 gitignore），命名与 zip 规范一致
- [x] 单测：手工构造的最小 CRX3 → 正例 + **五个反例**（魔数 / 版本 / 头长越界 / 截断 / 内嵌非 ZIP）

**验证**（实测）：`node --check scripts/build-crx.js` 通过；`node test.js` 全绿（v6.5 单测块）；
`node scripts/build-crx.js` 在无密钥时按设计拒绝并给出指引（未擅自生成密钥 —— PRD Notes 的前置闸门）。

## 阶段 2 — 真扩展 E2E 套件（R1 / R3 / R5）⬜

- [ ] `test-extension.js`：构建前置 → 启动 Chrome（load-extension + 独立 profile）→ 验扩展已加载
- [ ] 扩展 ID：优先 `manifest.key` 派生，否则 unpacked 路径派生（D2）
- [ ] 隔离世界：主世界无 `window.__svi`；DOM 属性可见（R3）
- [ ] `chrome.storage` 持久化：清 localStorage 后偏好仍存活（R5）
- [ ] Chrome 缺位 → 跳过并打印「未验证」（退出码 0）
- [ ] 加入门禁：四绿扩为**五绿**

**验证**：`node test-extension.js`（有 Chrome 时应全绿；无 Chrome 时打印跳过）。

## 阶段 3 — 首屏时序与 popup（R4 / R6）⬜

- [ ] `document_start` 首屏时序：`addScriptToEvaluateOnNewDocument` 埋点 + 断言「反色前从未以原色出现」
- [ ] 用户脚本形态的**诚实降级**断言（不达标就断言文档/面板有说明，而不是假装达标）
- [ ] popup target：版本/主机/计数渲染 + 三条消息协议往返 + 内部页 `unavailable`

**验证**：`node test-extension.js`。

## 阶段 4 — CI 双路径与文档（R9 / R10）⬜

- [ ] `release.yml`：无 secret 跳过签名但**必跑**真扩展 E2E；有 secret 时签名打包 + 上传
- [ ] `PUBLISHING.md` / `README` / `README_EN`：写出「非商店 CRX 在 Windows 默认被阻止」的事实
      与替代路径（加载已解压 / 商店），**不得**写成「双击即可安装」
- [ ] 五绿 + 提交（中文 message + `Co-Authored-By`）

**验证**：五绿全绿。

---

## 待用户确认（本片的前置闸门）

- [ ] **R2**：生成一对密钥 → 公钥写入 `manifest.json` 的 `key`（**需用户确认后执行**；
      私钥离线保管、绝不入库、CI 用同一密钥以稳定扩展 ID 与升级链）

## 与计划的偏离记录

> 格式：`偏离 N — 原计划 / 实际 / 原因`（执行中实时追加）
