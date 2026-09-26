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

## 阶段 3 — 首屏时序与 popup（R4 / R6）✅ 完成

- [x] `document_start` 首屏时序：`Page.addScriptToEvaluateOnNewDocument` 在**页面脚本之前**装逐帧探针
      （跑在**自己的隔离世界**里，见偏离 6），两趟加载对照：**首访**按文档允许白闪、**复访**断言零白闪
- [x] 用户脚本形态的**诚实降级**断言：断言 README 同时写明能力（`document_start`）与边界
      （`document-end` 启动 / 首屏元素已渲染 / 首访不遮）—— 不达标就变红，而不是假装达标
- [x] popup target：`Target.createTarget` + 浏览器级会话；版本/主机/计数渲染 + 三条消息协议往返
      （`svi-get-snapshot` / `svi-site-power` / `svi-set-pref`，并断言**真实效果**）+ 内部页 `unavailable`
- [x] 非空真守卫：时序断言前先断言「至少有一张图被判反色」，否则「零白闪」是空真

**验证**：`node test-extension.js` → **7 场景全绿（0~6），EXIT=0**，连跑 3 次一致。

### 实测读数（连跑两次，口径稳定）

| 趟 | 帧数 | 判反色 | 门类落地 | 首张反色 | **曾以原色出现的图** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **首访** | 66 / 70 | 5 | 106ms / 69ms | 231ms / 198ms | light1~4 各 **10 帧**（≈130ms） |
| **复访** | 74 / 67 | 5 | 79ms / 61ms | 79ms / 61ms | **（无）** |

即：首访确有一次性白闪（与 README §13「宁可白闪一次，也不白藏你的图」逐字一致，故**不作断言**，
仅作证据打印）；复访零白闪，断言成立。站点样本门实测 `seen=10~12 / inverted=5 / rate 42~50% → armed`。

**未决观察（如实登记，本轮不断言）**：复访时门判为「可武装」（`armed: true`），但同一次加载里
`pendingMask.armed` 实测为 `false` —— 复访零白闪是靠引导足够快（61~79ms 内完成判定）达成的，
**不是**靠元素遮罩生效。机制层这条口径留待后续任务查（本片范围是「把形态纳入自动化」，
不改扩展运行时代码）。

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

**偏离 6（阶段 3）— 首屏探针必须跑在自己的隔离世界，且必须等帧数攒够。**

三条都是实测踩出来的，直接写进套件注释与 AGENTS.md：

1. 探针若注入**页面主世界**，内容脚本的隔离世界就抓不到（`window.__svi` 找不到，25s 超时）；
   改注入 `worldName: '__svi_fp_probe__'` 后恢复正常。DOM 是跨世界共享的，读得到。
2. 必须加 `--disable-background-timer-throttling / --disable-backgrounding-occluded-windows /
   --disable-renderer-backgrounding`：窗口被遮挡时 rAF 被节流到 500ms 只跑 1 帧，测到的不是页面时序。
3. 这个本地 fixture 扩展 **125ms 就引导完了**，比前几帧还早 —— 读完 frames=1 就下结论会误判。
   探针的 `bare` 是累积的，故先等帧数 ≥60 再读，读到的才是完整时序。

**偏离 7（阶段 3）— fixture 不能长得像「缩略图网格」。**

首版 fixture 把 6 张同尺寸图直接挂在 `<body>` 下，结果**一张都不反色**。查因：balanced 图像策略里
`passesImagePolicy` 有 `gridSiblings >= 4 → false`（同父同级同尺寸 ≥4 判为缩略图网格，按设计整组跳过）。
改为每张图各包一层 `<figure>` 后恢复。**这是 fixture 的错，不是产品的错** —— 但值得记下来：
以后写图片类 fixture 一律避免「同尺寸兄弟成排」。

**偏离 8（阶段 3）— popup 的两处「读太早」与一处标签页顺序问题。**

1. `popup.html` 自带 `<body class="available">` 与占位 `—`，那是**作者写的初始值**；popup.js 要等快照
   回来才翻转类并填字段。直接读 `body.className` 会读到未落定的中间态（第一次就把 `available` 误判成
   了「有内容脚本」）。改为「等落定」：出现 `unavailable` 或版本号已被填上才算读完。
2. manifest 只有 `storage` 权限、**没有 `tabs` 权限** → `tab.url` 拿不到，所以不能按 url 认标签页；
   测试替身改为「谁的内容脚本能应答 `svi-get-snapshot`，谁就是本页」。
3. 顺序必须先验「打在真页面上的 popup」、最后再验「内部页降级」：把同一个标签页导航到 `popup.html`
   会把 fixture 页顶掉，popup 就再也看不到带内容脚本的标签页（实测 `tabsN` 变成 1）。
4. 另外记一条**测量环境陷阱**：popup 是独立标签页时会抢走活动态，fixture 页变隐藏页，隐藏页里
   rAF/idle 近乎停摆 → 引擎重扫不推进，曾一度误判成「开站不恢复反色」这个**假缺陷**。
   加一条 `Page.bringToFront` 后恢复成立（5 张）。教训：跨标签页测「热恢复」类行为，先把被测页拉回前台。
