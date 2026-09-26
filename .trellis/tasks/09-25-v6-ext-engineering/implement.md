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

## 阶段 2 — 真扩展 E2E 套件（R1 / R3 / R5）✅ 完成

- [x] `test-extension.js`：构建前置（`gen-icons` → `build-extension`）→ 启动 Chrome（独立 profile）
      → **扩展真加载自验**通过后才继续（见偏离 3）
- [x] 扩展 ID：取 `Extensions.loadUnpacked` 的返回值（即 unpacked 路径派生 ID）；`manifest.key`
      分支留待 R2 密钥确认后补（见偏离 2）
- [x] 隔离世界：主世界 `typeof __svi === 'undefined'`；隔离世界有 `__svi` 且版本一致；
      DOM 为两世界共享（主世界可见两张图）（R3）
- [x] `chrome.storage` 持久化：后端为 `chrome.storage` 家族（实测 `chrome-sync`）→ 翻转
      `hoverRestore` → **清掉 localStorage** → 重载 → 偏好仍存活且 `html.svi-hover-restore` 类同步消失（R5）
- [x] Chrome 缺位 → 打印「SKIP: 未验证 (…试过 <候选列表>)」且退出码 0（见负向对照 A）
- [x] 加入门禁：四绿扩为**五绿**（`AGENTS.md` 命令块 + 提交纪律表述；`ci.yml` browser-bench 作业
      新增一步真扩展 E2E）

**验证**：`node test-extension.js` → **4 场景全绿，EXIT=0**（连跑 2 次一致）；负向对照见下。

### 红 / 绿留证（负向对照，证明断言真的咬得住）

| 对照 | 注入的“错” | 期望 | 实测 |
| :--- | :--- | :--- | :--- |
| **A 降级路径** | `SVI_CHROME_PATH=C:/no/such/chrome.exe` | 打印「未验证」且退出码 0（不是假绿） | ✅ `SKIP: 未验证 (未找到浏览器，试过: C:/no/such/chrome.exe…)`，EXIT=0 |
| **B 断言敏感度** | `SVI_EXT_DIR=<临时副本>`，其中 `content.js` 被替换为不引导的空文件 | 套件变红、退出码非 0 | ✅ `❌ 真扩展 E2E 失败: 等待超时: 含 window.__svi 的隔离世界出现`，EXIT=1 |

**绿**（正常形态）：`node test-extension.js` 输出——扩展 ID `bicopdjpejpakedhbncplfpbkoimkmla`；
自验 `runtime.id` 与版本 `5.0.0` 一致；`lightInv=true` / `darkInv=false` /
`lightFilter="invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)"` / `darkFilter="none"` /
`cssBytes=45523` / `pill=true`；存储后端 `chrome-sync`；重载后 `hoverRestore=false` 且 html 类只剩
`svi-img-invert-on`。

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

**偏离 1（阶段 2）— 加载通道从 `--load-extension` 改为 CDP `Extensions.loadUnpacked`。**

原计划（design D1）：用 `--load-extension=<abs> --disable-extensions-except=<abs>` 启动。
实际：改用 `--enable-unsafe-extension-debugging` + `--remote-debugging-pipe` 经 CDP
`Extensions.loadUnpacked` 加载。
原因：Chrome / Edge **137+ 已忽略 `--load-extension`**（本项目在 Chrome 153.0.8010.53 /
Edge 153.0.4234.48 上实测确认，v6-6 R3 已把该事实写进 README/PUBLISHING）。照原计划写会得到
「浏览器起来了但扩展根本没装载」的假绿。design D1 的这条已被实测推翻，本文更新为实际做法。

**偏离 2（阶段 2）— 扩展 ID 不再自行派生，取 loadUnpacked 的返回值。**

原计划（design D2）：套件自己算 ID（有 `manifest.key` 用公钥派生，否则用 unpacked 绝对路径派生），
再据此断言。
实际：直接采用 `Extensions.loadUnpacked` 返回的 `id`。原因：返回值就是浏览器认可的那份 ID，
自算一份再去比对属重复实现，且自算错时会产生「一致但都错」的恒真断言。`manifest.key` 分支
（R2 的目标状态）仍待用户确认密钥后补，届时应断言「写入 key 后 ID 与路径无关且跨路径稳定」。

**偏离 3（阶段 2）— 「扩展真加载」的自验口径换了更强的一种。**

原计划（design D1 的风险处置）：断言 `chrome-extension://<id>/manifest.json` 可读。
实际：断言**内容脚本所在世界里** `chrome.runtime.id === <loadUnpacked 返回的 id>` 且
`chrome.runtime.getManifest().version === 构建产物版本`。
原因：前者依赖「顶层导航到扩展 URL 被允许」这一未经本项目验证的前提，而后者是内容脚本的原生权限，
更直接地同时证明了「扩展在场」「世界附对了」「版本是这次的构建」。D1 要防的是「静默测了个空页面」，
本条对同一风险的覆盖不弱于原方案。

**偏离 4（阶段 2）— 新增两个可测性/纪律性接口（都服务于「断言咬得住」）。**

- `SVI_EXT_DIR=<dir>`：拿一个**被改坏的副本**跑套件（负向对照 B）。没有这个口子，就无法证明套件
  不是恒真；写入该变量时跳过构建前置，避免把被测副本覆盖回真源产物。
- `SVI_CHROME_PATH` 语义修正为**唯一候选**（与 `test-browser.js` 既有语义一致）。
  首轮我按「优先候选」实现，于是它指向不存在的路径时会**静默退回**系统 Chrome —— 负向对照 A
  因此第一次跑出了假绿（本该「未验证」，却真的跑完并报通过）。这正是负向对照存在的价值。

**偏离 5（阶段 2）— CI 已接线，但在 Linux runner 上**未**本地验证。**

已把 `node test-extension.js` 加进 `ci.yml` 的 browser-bench 作业（与 bench 同一个 Chrome）。
本机只能验 Windows + Chrome 153；ubuntu-latest 上 `--enable-unsafe-extension-debugging` /
`Extensions.loadUnpacked` 的实际可用性**未验证**，留给 CI 首跑暴露（若不可用，按 PRD R9 的
"无 Chrome 才跳过" 纪律应扩为「通道不可用则跳过并打印未验证」，而不是让 CI 变红）。
