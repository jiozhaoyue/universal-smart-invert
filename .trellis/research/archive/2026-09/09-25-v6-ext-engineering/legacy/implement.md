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

## 阶段 4 — CI 双路径与文档（R9 / R10）✅ 完成

- [x] `release.yml`：新增 `browser-actions/setup-chrome` + 一步**必跑**的真扩展 E2E
      （无 secret 时签名打包与商店上传照旧跳过，但 E2E 不受 secret 影响 —— 符合 R9「无 secret 不阻断」）
- [x] `PUBLISHING.md` / `README` / `README_EN`：**已满足**（本轮复核确认，非新写）——
      「非商店来源的 CRX 在 Windows / macOS 的桌面 Chrome 上默认被阻止安装」三处都有
      （`PUBLISHING.md:191` / `README.md:70` / `README_EN.md:62`），并明确写「**不是**双击即装的安装包」
      （`README.md:71`、`PUBLISHING.md:197` 还专门写了「不要把 CRX 描述成双击即可安装」这条禁令），
      替代路径（加载已解压 / 应用商店）同样在案。故本项不再重复劳动。
- [x] 五绿 + 提交（中文 message + `Co-Authored-By`）+ 推送

**验证**：两个 workflow 的 YAML 均通过解析校验（release 15 步 / ci 6 步）；
`node test-extension.js` 连跑三次全绿（见阶段 3）。

> **本片剩余（唯一一项）**：**R2 密钥生成** —— 生成一对签名密钥并把**公钥**写进 `manifest.json`
> 的 `key`，以获得跨路径稳定的扩展 ID 与升级链。这属 PRD 明写「需用户单独确认的一次性动作」
> （也会改动已入库的 `manifest.json` 产物），**未执行**。在它之前本片其余交付均已完成：
> 扩展 ID 目前由 unpacked 绝对路径派生（同一路径内可复现，跨路径不稳定），套件已按此实现。

**验证**：五绿全绿。

---

## 待用户确认（本片的前置闸门）—— ✅ 已由用户裁决并执行（2026-09-27）

- [x] **R2**：生成一对密钥 → 公钥写入 `manifest.json` 的 `key`。
      **用户 2026-09-27 裁决：「现在生成并写入 key」**，本轮执行完毕：
      ① `node scripts/build-crx.js --generate-key` 等价路径生成 RSA-2048 密钥对，
      私钥 `crx-private-key.pem`（PKCS#8, 权限 600, gitignore 已覆盖, 只在本机 + 离线备份）；
      ② 公钥固化为**入库真源** `scripts/extension-key.json`（含 `extensionId` 与轮换说明）；
      ③ `build-extension.js` 构建期把它注入 `manifest.key` → 扩展 ID 固定为
      **`laldjilafbegbdkjoaamjpcljjmanohe`**（任何机器重建产物都得同一个 ID）；
      ④ 新增 `extensionIdFromKeyB64` / `publicKeyB64FromPrivatePem` 两个**纯函数**
      （`build-crx.js` 内，可单测），并加 `--print-id` 子模式。

**为什么「ID 由公钥决定」这条很关键**：它让公钥可以入库、私钥不可以 —— 于是
「ID 可复现」不需要任何人都持有私钥，也不需要 CI 有 secret。

**两处前置拦截（都是实测过的静默失败模式）**：换过密钥却忘了重新生成 key 文件时，
签出的 CRX 其 ID 与清单声明不符，**浏览器拒绝安装，而打包那一步照样报成功**
（产物结构完全合法）—— 故构建期与打包期都校验「本机私钥推导的公钥 == key 文件」。

**断言与负向对照**：
- `test.js`：固定值回归（ID 变了即红，轮换属破坏性动作）+ 文件自洽 + 产物自洽 + 私钥自洽；
  另把 R8 原本那条 `existsSync(pem) === false` 改成它**本来的意图**
  （私钥不得被 git 跟踪 / 不得泄漏进入库产物）—— 原断言与「生成密钥」直接打架，
  且私钥只要挪个位置就能绕过，改后更严
- `test-extension.js` 场景 3：真实浏览器里断言 `runtime.id == 公钥推导值`
  （原断言只证明「世界是本次加载的那个扩展」，对「ID 是否由 key 决定」一言未发）
- 负向对照：篡改 `manifest.key` 一个字符 → `test.js` 红（重建后绿）；
  `git add -f crx-private-key.pem` → `test.js` 红（撤回后绿）

**文档**：`PUBLISHING.md` 新增「扩展 ID 固定与可复现」小节（公钥/私钥去哪、轮换流程）；
§4 里原本的 `openssl genrsa` 指引已**修正**（另生成一把新私钥会让 CI 产出的 CRX ID 与仓库声明不符）；
`AGENTS.md` 硬规则补一条。

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

**偏离 9（R2 收尾 · 验证期）— 门禁复跑时撞到一条 test-browser 偶发红，与 test.js 那条同源。**

**现象**：R2 落地的门禁链里 `test-browser.js` 红了一次，报
`dim 预设不透明度取自 MASK_PRESETS`（`actual 1` / `expected 0.75`），复跑即绿。

**判定**：读到的是**上一档 `solid` 的 opacity 1** —— 即 `data-svi-masked` 当时还停在 `solid`。
原写法是 `apply → 固定睡 400ms → 读计算值`，而属性写入走**写点仲裁**、并不同步落地；
固定等待于是成了拿概率赌「写入已生效」。**与 test.js 那条分片断言同一类根因**
（同一轮里两条都是「固定等待 vs 异步落地」，不是巧合）。

**修法（不动任何期望值，且比原来更严）**：
1. 先**有界轮询属性到位**（`data-svi-masked === 目标档`，上限 2s），过渡是 140ms 的有界延时、
   放在属性到位之后再等 —— 把「必须为真的条件」与「有界延时」分开处理，不再赌；
2. **给三档各自加属性断言**（原先只断言了 `solid`）。这不只是补漏：它把诊断也修准了 ——
   若 `apply` 真的没写入，报的是「attr 2s 内没变成 dim」（**产品缺陷**），
   而不是一个看起来像「opacity 值不对」的假象（**测试计时**）。

**顺带登记（供后续）**：`test-browser.js` 里此类固定睡眠实测 **88 处**，
其中 8 处带着「等引擎落地」语义的注释 —— 都是同类潜在偶发面。
本轮只修实际撞到的这一条，其余不动（大范围改动属独立工作，且必须逐条核对不能放宽断言）。

**偏离 10（收尾验收期 · 2026-09-27 续）— 门禁复跑又撞一条 test.js 偶发红；顺着它挖出「假绿」这一类，
并修掉一个把整块断言**静默跳过**的脚手架缺陷。**

**现象**：续跑五绿时 `node test.js` 红了一次，报 `chunked key has meta manifest`（`actual undefined`）；
单跑 5/5 绿 → 是**测试计时**而非产品缺陷（与偏离 9 同一类：固定等待 vs 异步落地）。

**修法（8e-4 块）**：`set → 固定睡 300ms / 60ms → 读` 改为**有界轮询到落定**。落定条件取
「断言真正依赖的完整状态」= 三个键（`svi:chunked` / `.meta` / `#0`）**全部**清空。
第一版只等逻辑键 `svi:chunked` —— 实测它**先**被摘掉，轮询提前返回，新断言当场咬住
（**误报**，是我的条件写弱了）；条件改对后再验 5/5 绿。

**顺带挖出的更大问题（本轮真正的收获）——「绿不是通过，是没跑」**：
做负向对照时（产品侧停用 `removeLogicalAsync` 的 meta 摘除）**跑出来是绿的**，这不该。查因：
`test.js` 末尾用 `setTimeout(…, 1500)` 后 `process.exit(0)` 收尾，而本文件原有**三处**有界轮询的
deadline 分别是 2000 / 3000 / 3000ms —— **都比收尾预算长**，于是它们的
「超时 → 走同一组断言报红」分支**永远跑不到**：进程先退了，断言根本没执行，却照打
`✓ All … passed successfully!`、退出码 0。**这是假绿。**

**修法（脚手架契约，三道闸门）**：

1. 三处轮询统一走文件级 `pollUntil`（超时后仍走同一组断言，不吞失败）；
2. 新增不变量 `ASYNC_POLL_MS(2000) < ASYNC_BUDGET_MS(3000)`，收尾处自检；
3. 新增**轮询台账**：每个 `pollUntil` 开/关各记一次，收尾时 `pollFinished !== pollStarted` →
   `exit(1)` 点名「N 个有界轮询没有走完」。收尾预算 1500 → 3000ms（代价：`test.js` 每次多跑 1.5s）。

**闸门一装上就显形了第二个缺陷**：`quota failure degrades backend to chrome-local` 立刻变成
**13% ~ 50% 的红**。根因（插桩定位）：该用例把桩 `global.chrome` 的清理写成
`finally { setTimeout(() => delete global.chrome, 300) }` —— 而桩是**配额错误被识别的前提**
（`_makeChromeApi.lastError()` 读的就是 `chrome.runtime.lastError`；`_degradeToLocal` 还要求
`chrome.storage.local` 在场）。**分片写链是十几次串行的 1ms 模拟往返**，在定时器洪峰下单次往返
实测要几十毫秒，于是它常常跑不完这 300ms：桩先被删 → 读不到配额错误 → 判定"写成功" → **不降级**。
改前这些运行里 `verify()` 根本没执行（被上面的假绿吞掉）。
**修法**：桩的存活期 = 本用例的执行期 —— 在轮询回调里摘
（`try { verify(); } finally { dropChromeStub(); }`），同步阶段抛错时也摘。**不再猜时长。**

**负向对照（四组，改完必做）**：

| 对照 | 注入的「错」 | 期望 | 实测 |
| :--- | :--- | :--- | :--- |
| NC1 断言敏感度 | 产品侧不摘 `meta` | 红，且报「chunk manifest removed with key」 | ✅ exit=1，正是该条；**修复前跑出来是绿的** |
| NC2 断言敏感度 | 产品侧 `_degradeToLocal` 直接 return | 红，报「quota failure degrades backend」 | ✅ exit=1 |
| NC3 轮询可达性 | `pollUntil` 下一跳改 60s | exit=1 + 台账点名 | ✅「有 3 个有界轮询在 3000ms 收尾预算内没有走完」 |
| NC4 预算不变量 | `ASYNC_POLL_MS = 5000` | exit=1 + 「脚手架自身不自洽」 | ✅ |

**验证**：修复后 `node test.js` 连跑 **40/40 全绿**（修复前同条件下 20/40 红）；
完整门禁链 6/6 全绿（含此前在争用下变红的 `test-browser`）。

**沉淀**：`.trellis/spec/frontend/quality-guidelines.md` 新增
`v6.5 Additions (测试脚手架契约：绿不是通过，是没跑)`，并**更正**了两处错误指引 ——
§4「把等待时长调大」（根因是等待**方式**，不是时长）与 §7「遮罩读到 `1` 是过渡中间值」
（真实根因是 `data-svi-masked` 还停在上一档 `solid`，属性写入经写点仲裁、不同步落地）。
`AGENTS.md` 补一条同源纪律。

> **范围说明**：本偏离全程只改**测试脚手架与文档**，产品代码（`universal-smart-invert.user.js`、
> `extension/`）**零改动** —— 所有临时探针与负向对照补丁均已还原（`git diff` 可核）。
