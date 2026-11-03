# 01 · 放大浮层反色的合成夹具实测与边界划界

> 产出：主代理会话内实测（Step 1.1）。工具：`scripts/probe-viewer-overlay.js`（本次新建，零外部依赖）。
> 原始证据：本目录 `raw-{baseline,gm,ext,netslow,cpuslow}.jsonl`（每用例一行，可直接复核）。
> 夹具形态：**合成夹具**，非真机插件。真机插件（Imagus-Reborn / Hover Zoom+）属 Step 1.2，本文件**不含**其结论。
>
> **结论先行**：用户提的三条担忧里，**两条已被现有机制覆盖**（跨域像素、跨域 iframe/闭合 Shadow Root），
> 第三条（媒体晚加载）**机制也已覆盖**；我原本假设的「时延竞争是主因」（design.md `[假设 H1]`）
> **被实测证伪** —— 基线时延只有 ~100–165ms，其中约 100ms 就是变更去抖。真正的缺口只有**一条**：
> **扩展形态下，跨域且源站不发 CORS 的原图完全无法反色**（油猴形态可以）。
> 另加一条**原理性下界**（不是缺陷）：判定必然晚于「该元素自己的字节到达」，网络慢时该下界就是图片下载时间。

---

## 1. 方法

### 1.1 为什么不直接上真机插件（先做夹具的理由）

浮图秀在 Chrome 应用商店分发且**闭源**，无法以未打包形式加载。若一上来就做真机，会把
「夹具能不能造出来」和「产品行为对不对」两件事混在一起。故先用**形态夹具**把机制问清楚：
夹具能精确控制 `src` 是否已在决策缓存里、像素是否被污染、元素是否被换掉 —— 这三件事恰恰是
真机里最难分离的变量。真机只用于验证「真实插件的 DOM 形态是否落在夹具覆盖范围内」（Step 1.2）。

### 1.2 夹具设计（刻意的几处，都是被实测逼出来的）

| 设计 | 为什么这么做 |
|---|---|
| 文章页内嵌照片（照片之间夹正文），**不做等宽网格** | 均匀网格会命中封面网格启发式 `passesCoverGuard` → 整体 `skip`，基线不成立 |
| **6 张照片尺寸逐张不同**（300/370/440/…px） | 同父同标签且尺寸 ±8px 的兄弟 ≥4 会被判「网格贴图」而 skip —— 实测踩到过，基线 6/6 变 0/6 |
| 两个本地源站（不同端口 = 不同 origin），源站 B **不发 CORS 头** | 制造真实跨域污染，而不是靠推测 |
| 自带 PNG 编码（zlib） | 零外部依赖，不下载任何素材 |
| `GM_xmlhttpRequest` 垫片经 CDP 转发到 Node 侧取字节 | 模拟「油猴的特权 XHR」—— 它是判定「跨域能不能救」的唯一分水岭 |

### 1.3 五组配置（各自代表一个真实产品形态）

| 配置 | 命令 | 代表 |
|---|---|---|
| `baseline` | 默认 | 注入形态，**无 GM**（下界：既不是油猴也不是扩展） |
| `gm` | `--gm` | **用户脚本 + 油猴**（`GM_xmlhttpRequest` 是真特权通道） |
| `ext` | `--ext` | **扩展形态**（`Extensions.loadUnpacked` 加载真 `extension/`，id `laldjila…` 校验） |
| `netslow` | `--net-latency=300` | **网络慢**（往返 +300ms / 500kbps） |
| `cpuslow` | `--cpu=6` | **机器卡**（CPU 降速 6 倍） |

### 1.4 测量口径（两处踩到并已修，留档）

1. **`decisionBySrcHit` 必须在触发前测**。第一版在决策之后读缓存 → 恒为 `true`，是个无信息的指标。
   现改为触发前读 `preHitDecisionBySrc`。
2. **lag 主口径 = MutationObserver 观测到的属性落地时刻**，rAF 轮询只作交叉校验。
   只信 rAF 会把「观测延迟」误读成「产品时延」（首版就这样读出过一个 1200ms 的假值）。
   两口径实测相差 ~10–15ms。

---

## 2. 对照表（lag = 浮层节点插入 → 反色属性落地）

| 用例 | 注入·无GM | 油猴·有GM | 扩展形态 | 网络+300ms | CPU×6 |
|---|---|---|---|---|---|
| `C1_fresh_sameorigin` | 109ms 反色 | 109ms 反色 | 115ms 反色 | 382ms 反色 | 150ms 反色 |
| `C2_seen_src` | 100ms 反色 | 102ms 反色 | 101ms 反色 | 101ms 反色 | 116ms 反色 |
| `C3_crossorigin` | 120ms **失败** | 126ms 反色 | 129ms **失败** | 648ms **失败** | 189ms **失败** |
| `C4_srcset_swap` | 161ms 反色 | 162ms 反色 | 162ms 反色 | 162ms 反色 | 195ms 反色 |
| `C5_node_replace` | 162ms 反色 | 162ms 反色 | 162ms 反色 | 164ms 反色 | 181ms 反色 |
| `C6_dark_negative` | 未反色(正确) | 未反色(正确) | 未反色(正确) | 未反色(正确) | 未反色(正确) |
| `C7_big_sameorigin` | 128ms 反色 | 116ms 反色 | 120ms 反色 | 535ms 反色 | 257ms 反色 |
| `C8_bgimage_overlay` | 103ms 反色 | 103ms 反色 | 103ms 反色 | 98ms 反色 | 157ms 反色 |

用例含义：
- **C1** 浮层 src 全新（未决策过）· 同源 → 最典型的「悬停放大原图」
- **C2** 浮层 src 与页内照片相同（已在缓存）→ 验 R6 变更快路径
- **C3** 浮层 src 跨域且源站**不发 CORS** → 验像素污染回退
- **C4** 元素不变、`srcset`+`src` 换源（插件常见手法）
- **C5** 旧节点被移除、新节点带新 src（插件换元素）
- **C6** 暗色图（**反例**：必须不反色）
- **C7** 2400×1600 大图（「原图」量级，测解码成本）
- **C8** `background-image` 浮层（另一类常见浮层形态）

---

## 3. 三分表（真无解 / 已覆盖 / 可解未覆盖）

### 3.1 已覆盖（有机制 + 实测证据）

| # | 候选 | 覆盖机制（file:line） | 实测证据 |
|---|---|---|---|
| M1' | **跨域图片像素不可读（油猴形态）** | `analyzeSrc` 捕 taint → `gmFetchBlob` → `gmFetchBlob` 优先用 `GM_xmlhttpRequest`（`:6362`、`:6608`） | `gm` 组 C3 **反色成功 126ms**；无 GM 组同用例**失败** → 分水岭就是 GM 特权通道 |
| M2 | 跨域 iframe 内浮层 | 扩展 `all_frames:true` 且 `matches:<all_urls>`（`extension/manifest.json`） | 机制已核（本夹具未构造跨域 iframe 浮层）**待补实测** |
| M3 | 闭合 Shadow Root 内浮层 | `attachShadow` 幂等补丁 + 注册表按 host 解析（`:5589`） | 已有 bench Scenario 16 覆盖（本夹具未重复） |
| M4 | 媒体晚加载 → 稍后补反色 | 档 B/C 登记 pending + `registerPending`（`:9304`）+ `attachPendingWake` 一次性 `load` 监听（`:9322`） | C1（109ms）与 C4/C5（161ms）都包含「等元素自己就绪」的全过程，均**最终反色** |
| M11 | `srcset` 换源 / 元素被替换 | 同上，`attributeFilter` 含 `src`/`srcset`（`:8227`）；新节点走 `handle()` | C4 **161ms 反色**、C5 **162ms 反色** —— 无漏唤醒 |
| — | 背景图浮层 | `BgImageEngine` 自有的 MutationObserver（`:10165` 类 / `:10205` init / `:10213` `attributeFilter:['style']`） | C8 **103ms 反色**（`data-svi-bginv`） |
| — | 暗色图不误反（正确性反例） | decide-once 像素管线 | C6 五组配置**全部未反色** ✓ |

### 3.2 可解未覆盖（本任务的真缺口）

| # | 候选 | 现实现 | 根因（实测+代码双证） | 严重度 |
|---|---|---|---|---|
| **G1** | **扩展形态无法反色「跨域且源站不发 CORS」的原图** | `gmFetchBlob` 在无 `GM_xmlhttpRequest` 时退到 `fetch(url,{mode:'cors'})`（`:6395`）。扩展的 `GM_xmlhttpRequest` 垫片是**纯 fetch**（`scripts/build-extension.js` 注释自述），且 manifest **无 `background` service worker**、**无 `host_permissions`**（`extension/manifest.json`） | MV3 下 content script 的 `fetch` 受 CORS 限制（不能再像 MV2 那样凭 host 权限跨域）。实测：`ext` 组 C3 **`data-svi-failed`、129ms、完全不反色**；`gm` 组同用例**反色成功** | **中高**：这是「看图插件放大原图」的最常见场景之一（原图常在无 CORS 的 CDN 上） |
| **G2** | **网络慢时浮层反色滞后于原图下载** | 浮层 src 若是**全新 URL**，判定必须等这张图自己下载完 | `netslow` 组：C1 109→**382ms**、C7 128→**535ms**。而**已在缓存**的 src（C2/C8）**完全不受影响**（101/98ms） | **中**：可解，见下 |

### 3.3 真无解（原理性下界，有实测或机制支撑）

| # | 候选 | 为什么无解 | 实测/推断 | 我们的行为（是否安全） |
|---|---|---|---|---|
| **T1** | **媒体字节从未到达**（离线 / 404 / 被拦 / 无 CORS 且无特权通道） | 没有像素就没有判定依据 —— 反色是「看完像素再决定」，不是「无条件上滤镜」 | C3 的三组失败 + 首版探针偶然造出的 404 用例，均得 `data-svi-failed`、`checkedSrc:false`、元素保持原样 | **安全**：`markFailure`（`:8866`）显式「立即放行原图」（`:8872` 注释「绝不允许拿不到像素就把图藏起来」）；重试策略在 `:9072-9078` —— 60s TTL 内静默（未决），累计 ≥3 次后记 `skip/analysis-failed` 永久跳过（**已逐字核实，非转述**） |
| **T2** | 元素从未进入文档（插件在 Worker / 原生层 / 另一进程绘制） | 没有 DOM 接缝可挂钩 | **机制推断，本任务未实测具体插件** | —— |
| **T3** | 跨进程合成层（如 DRM 视频面） | CSS 滤镜不到达该合成层 | **机制推断**；且超出本任务的图片范畴 | —— |
| **T4** | **判定的时延下界**：反色必然晚于「该元素自己的字节到达 + 一次解码」 | 我们要看像素才能判定 | 基线 ~100–165ms；网络慢时等于图片下载时间（382–535ms） | 这是**下界**而非缺陷；**可缩小**：见 §5 的继承方案 |

### 3.4 对用户三条原话的逐条回答

| 用户原话 | 实测裁决 |
|---|---|
| 「网络……在元素未完全加载，拿不到，就没法反色」 | **成立，但是原理性下界不是缺陷**。而且**不是永久失效**：元素就绪后 `attachPendingWake` 会把反色补上（C1 的 109ms 就是这个全过程）。真正会永久失败的只有 T1（字节永远不来）。 |
| 「电脑比较卡」 | **影响有限**：CPU×6 只把 109→150ms（+41ms）。**不是观感问题的主因**。 |
| 「媒体元素，没加载就是白色区域，这个也没法解决」 | **半对**。那一瞬间确实没法反色（没像素）；但「白色区域」**不是我们造成的** —— 是浏览器还没画出内容。而且我们**不会**错误地给它上滤镜（档 B/C 保守 keep），所以不会出现「白色区域被反成黑色」。加载完成后会自动补反色。 |

---

## 4. `[假设 H1]` 裁决：**证伪**

design.md 的 H1 断言「浮层反色的真实瓶颈是时延竞争，合计常达数百毫秒～数秒」。实测：

- **基线时延 100–165ms**，其中 **~100ms 恰好是 `MutationObserver` 的 100ms 去抖**（`:8219`），
  分析本身只占 5–30ms。**从未出现「数百毫秒」**（除网络项）。
- 连带证伪了「首次分析要额外一次联网取原图」：像素可读时**根本不做额外网络请求**，
  `gmFetchBlob` 只在像素被污染时才触发（`netslow` 组 C2/C8 与基线完全同值，即为反证）。
- 因此 design.md §3.2「同步免去抖通道」的收益上限只有 **~100ms**（去抖那一段），
  与「视觉上可感知的滞后」不成比例 → **不值得做**（同步工作还会带来抖动风险）。

**H1 的成因被替换为 H2（已实测成立）**：真正影响观感的是**网络等待原图字节**
（`netslow` C1 382ms / C7 535ms），且只在「浮层 src 是全新 URL」时发生。

---

## 5. 可解项与建议（待用户裁决后再动代码）

| 方案 | 解哪个 | 代价 | 建议 |
|---|---|---|---|
| **E3 跨 URL 视觉同一性继承**（design §3.3） | **G2 与 G1 同时**：浮层继承「它所放大那张缩略图」的结论 | 需关联信号（祖先/指针悬停/`src` 形近）+ 复用既有 `provisional` 可升级语义；**零架构变更** | **推荐**。一个机制同时消掉网络等待（382→~100ms）与跨域失败（无结论可继承时必须先有结论——故对 G1 只在「缩略图已决」时有效） |
| **E1 扩展加 service worker + `host_permissions`** | G1 的根治（扩展形态与油猴形态能力对齐） | 扩展从「content script + 两页」变成 +1 个 SW；manifest 加**全站 host 权限**（商店审核与用户观感都变差）；Firefox 侧还需 `background.scripts` 兼容写法；`build-extension.js` / 跨浏览器契约都要改 | **次选**，建议**单独任务**并先问用户（属架构变更 + 扩大改动面） |
| E2 对污染图**盲上滤镜**（不判定直接反色） | 表面解 G1 | 会把暗图反成亮图，违背 decide-once「先判后动」 | **否决** |
| E4 只做文档（不做实现） | —— | 最小 | 若用户只想要结论，这是合法落点 |

**E3 的诚实边界**：继承只在「浮层与其缩略图确为同一张图」时成立。视频缩略图 ≠ 视频帧，
故设计里已硬性规定「关联目标或浮层是 `<video>` 时不继承」；且继承一律标 `provisional:true`，
真像素到达后升级。**若实测发现关联信号不可靠，应退到 E4（只做文档），不得硬凑启发式。**

---

## 6. design.md §7 阻塞表逐行裁决

| 阻塞项 | 裁决 |
|---|---|
| M6「浮层 src 不命中决策缓存」 | **成立**（C1/C3/C7 `preHitDecisionBySrc:false`）。但命中与否**只影响是否需要重新分析**，不影响正确性 |
| H1 时延量级 | **证伪**（基线 100–165ms）。见 §4 |
| S1/S2/S3 哪条真命中 | **未裁决** —— 属真机插件阶段（Step 1.2）；夹具是「我造的形态」，答不了这一行 |
| M11 是否漏唤醒 | **无漏唤醒**（C4 161ms / C5 162ms 均反色） |
| 插件能否被 CDP 加载 | **能** —— 本探针 `--ext` 已实证 `Extensions.loadUnpacked` 可用（加载的是我方扩展）；真机插件按同法加载 |

---

## 7. 未覆盖 / 下一步

1. **真机插件（Step 1.2，需联网拉源，已获预授权）**：`hababr/Imagus-Reborn`、`extesy/hoverzoom`
   到 `dev/tools/viewer-plugins/`（`.gitignore:53` 已覆盖）。目的：验证真实插件的浮层 DOM 形态
   是否落在夹具覆盖范围内，并裁决 S1/S2/S3。
2. **跨域 iframe 浮层（M2）**：夹具未构造，待补。
3. **T2/T3**：机制推断，未实测；报告与 README 中必须标注为推断。
4. **`extension/manifest.json` 无 `background`、无 `host_permissions`** 已核实 —— 这是 G1 的代码级证据。

---

# 02 · 真机插件实测（Step 1.2）与遮罩基线

> 证据文件：`raw-plugin-hoverzoom.jsonl`、`raw-plugin-imagus.jsonl`、`raw-mask-baseline.jsonl`。
> 探针新增能力：`--plugin=<dir>`（第三方插件以真扩展加载 `Extensions.loadUnpacked`；
> 本脚本仍走注入形态，避免两个扩展互相干扰）、浮层扫描（**递归进 open shadow root**，
> 先找高 z-index 定位容器再把容器内所有媒体上报 —— 只按定位筛会漏掉插件的 static `<img>`）、
> `--mask`（慢速大图 + 走生产路径武装 media 档）。

## 8. hoverzoom（真机，成功）

装的是 `extesy/hoverzoom`（未打包加载，扩展 id `gjkloolbelmlpbacklfmmhclbadgmbfj`）。
夹具触发形态 = 它 `plugins/default.js` 的 Default 规则：`<a href="原图.ext"><img 缩略图></a>`。
用 CDP `Input.dispatchMouseEvent` 派发真实 `mouseMoved` 到链接中心。

**结果：放大浮层里的图确实被反色了。**

| 用例 | 浮层容器 | 浮层媒体 | 反色 | 决策 |
|---|---|---|---|---|
| P1 | `div#hzViewer`（`position:absolute`，`z-index:2147483647`，1069×798） | `<img>`（**`position:static`**，1059×783，natural 1900×1400） | ✅ `data-svi-inverted="true"`，filter 已上 | `{verdict:"invert", reason:"pixel", provisional:false}` |
| P2 | 同上（1051×798） | `<img>`（1041×783，natural 2000×1500） | ✅ 同上 | `{invert, pixel}` |
| P0 | 未捕捉到 | —— | —— | 首次悬停未出浮层（插件热身后才出），非缺陷 |

**要点**：真正被放大的是容器内一个 **`position:static`** 的 `<img>`。若只看「定位 + 高 z-index」
筛选，会**完全看不见它**（这正是我第一版扫描器的错，已修）。反色走的仍是既有统一管线
（`reason:'pixel'`），**无需任何插件专属适配**。

## 9. Imagus-Reborn（真机，**未实测**，如实登记）

`hababr/Imagus-Reborn` 可加载（id `bpocadjgjimkhcmidhbjihddikcpoppi`），但 **其内容脚本从未注入**：
页面指纹显示 `hasImagus:false`，`documentElement.children` 只有 `HEAD`/`BODY`（Imagus 会把自己的
浮层根挂到 `documentElement` 上，若跑了必定可见）。

**根因（可达可信度：高，且与源码一致）**：Imagus-Reborn 的 manifest 用 `permissions: [..., "userScripts"]`
经 `chrome.userScripts` 通道注入，而 Chrome 要求用户在扩展详情页**手动**打开
「允许用户脚本 / Allow User Scripts」（或开发者模式）—— **CDP 无法代翻这个开关**。

**源码级形态（推断，非实测）**：`src/content/content.js:610-611` 把浮层挂在
`document.documentElement` 下的一个 `<div>` 上，且 `attachShadow({mode:"open"})` —— **open** shadow root；
真正的媒体是 `PVI.IMG`（`<img class="content">`，`:655` 挂进容器）。
按我们的代码，应被这两条路径覆盖：`flushMutations` → `collectShadowMediaUnder`（`:8324`，扫已登记根）、
以及 `runEagerPass`/`scanAll` 的 Shadow DOM 补充。**但本次未能实证，故标为推断。**

> **诚实边界**：本任务交付里凡涉及 Imagus 的结论，必须写「未实测 + 源码推断」，
> **不得**写成「已适配」。

## 10. 遮罩基线（用户「未加载前遮罩挡住白区」的 before 状态）

`--mask` 用**生产路径**武装（等价于面板「本站强制启用」按钮：写 `siteOverrides[host].pendingMask='on'`
→ `setupPendingMask()`），实测返回 `{ok:true, armed:true, masking:true}` —— 遮罩**确实武装成功**。
夹具用一个 **服务端延迟 2.5s** 的大图制造「媒体晚到」的观测窗口。

| 时刻 | 元素可见性 | 背景色 | `data-svi-pending` | `data-svi-settled` | `complete` | 反色 |
|---|---|---|---|---|---|---|
| **加载中（0.6s）** | `visible` | **`rgb(255,255,255)`（白！）** | **`false`** | `local-context` | `false` | 无 |
| 加载完成（2.51s） | `visible` | —— | `true`（短暂） | —— | `true` | ✅ 在 2513ms 落地 |

**两条硬结论**：

1. **白区确实存在且未被遮住**：加载窗口内该元素的盒子是白的、且 `data-svi-pending` 为 `false`
   —— 遮罩**从未落到它身上**。用户的现象被复现。
2. **遮罩即使生效也会被立即解除**：`settled: "local-context"` 说明**档 B 的临时结论（keep, provisional）
   当场就把遮罩 settled 掉了**。所以修法**不能只改 CSS**：
   必须让「临时结论」**不解除**遮罩，只在**权威结论**（或预算/超时兜底）时才解除。
3. 反色落地时刻 = **2513ms**，即「字节到达」那一刻 —— 再次印证：判定不可能早于媒体自己的字节。

> 附带纠正：上表 `bg: rgb(255,255,255)` 有夹具自身样式的成分（夹具给 `.ov` 写了 `background:#fff`）。
> 真实媒体元素通常无背景 → 透明 → 露出其后的**页面底色**（浅色站点同样是白）。
> 两种路径的可见结果一致，故结论不受影响；但**不得**把该 `#fff` 当作产品行为来引用。

---

# 03 · 扩展形态跨域缺口（G1）的**真因修正**与修复（Step 2C）

> 证据：`raw-ext-after-sw.jsonl`（修复后）+ 本文记录的三轮插桩诊断（插桩已全部还原，
> 用户脚本与备份逐字节一致，`grep -c SVI-DIAG` = 0）。

## 11. G1 的根因是**两处叠加**，不是「MV3 的 CORS 限制」一句话

**先自我纠正**：§3.2 G1 把根因写成「MV3 下内容脚本的 fetch 受 CORS 限制，没有 service worker
所以取不到跨域字节」。前半句对，但它**只是第一处**；只补 SW 之后 C3 **仍然失败**，
说明还有第二处 —— 而那一处与 CORS 完全无关。

### 11.1 诊断过程（三轮，每轮都推翻了上一轮的假设）

| 轮 | 假设 | 实测结果 | 结论 |
|---|---|---|---|
| 1 | SW 没起来 / 权限不对 | `service_worker:chrome-extension://laldjila…` 在场；从**隔离世界**直接 `sendMessage({type:'svi-fetch-bytes', url:<跨域>})` → **`{ok:true, size:506}`** | SW 通道**本来就通**，假设推翻 |
| 2 | 内容脚本没调用垫片 / 垫片没构建进去 | 产物含新垫片；`analyzeSrc` 与垫片调用日志齐全：`shim call blob GET …/light.png` → `resp true 506` | 取字节**成功**，假设推翻 |
| 3 | 解码链坏 | `analyzeSrc catch: Temp img decode failed`；再测传输形态：**`res.bytes` 的 `ctor=Object`、`len=undefined`、`isArray=false`，`new Blob([res.bytes]).size = 15`** | **真因**：字节过消息边界被序列化坏了 |

### 11.2 真因（两处，缺一不可）

1. **没有特权取字节通道**：MV3 内容脚本的 `fetch` 受页面 CORS 限制，原垫片是纯 fetch
   → 跨域且源站不发 CORS 的原图取不到字节。
2. **字节过 `chrome.runtime` 消息边界被 JSON 序列化**：`Uint8Array` 到内容脚本侧变成普通对象
   （`{"0":137,…}`），`new Blob([obj])` 把它 `String()` 成 `"[object Object]"` → **15 字节垃圾 Blob**
   → `<img>`/`createImageBitmap` 解码必然失败。这一处**与 CORS 无关，与引擎也无关**。

> 第 2 处是真正的「隐形杀手」：它让**任何**字节回退链在扩展形态下都静默失效，
> 但因为失败被 `analyzeSrc` 的 catch 兜住（只落 `data-svi-failed` + `markFailure`），
> 表面上完全像"跨域取不到"。

### 11.3 修复与证据

- 新增 `scripts/extension-src/sw.js`（后台脚本：唯一职责取媒体字节，http/https、体积门 4MB、
  只服务本扩展上下文），manifest 加 `background`（`service_worker` + `scripts` **两键并存**）
  与 `host_permissions: ["<all_urls>"]`；
- 扩展的 `GM_xmlhttpRequest` 垫片改为**优先 SW、失败/超时回落 plain fetch**；
- **传输改 base64 字符串**（`btoa`/`atob`，分块避免 `apply` 参数上限），彻底绕开 JSON 序列化损坏。

| 形态 | 修复前 C3（跨域无 CORS 原图） | 修复后 C3 |
|---|---|---|
| 扩展 | `data-svi-failed` @119ms，**不反色** | **176.8ms 反色成功**，零 `Temp img decode failed` |
| 油猴（有 GM） | 126ms 反色 | 不变 |
| 注入（无 GM） | 119ms 失败 | 不变（无特权通道，符合预期） |

**跨浏览器**：`npx web-ext lint` **0 errors** / 3 warnings，新增的那条正是
`BACKGROUND_SERVICE_WORKER_IGNORED`（Firefox 忽略 `service_worker`，走 `scripts`）——
即双键并存的**预期行为**而非缺陷。值得注意的是 `extesy/hoverzoom` 的真实 manifest
用的就是这份双键写法，属有先例的工程做法。

> **未做（如实登记）**：Firefox 侧**尚未实载验证**（本任务未配置 geckodriver）。
> AC10 的「Chromium 与 Firefox 都能加载且跨域取图生效」中，Firefox 一侧目前**只有 lint 证据**，
> 不是实载证据。

## 12. 探针自身又踩到的三个坑（留档）

1. **`send()` 没有 CDP 超时** → 目标一旦异常就**永久挂死**（探针 400s 无输出）。AGENTS.md 已记过该坑。
2. **未等 `ws.onopen` 就发消息** → 请求石沉大海，表现为同一类"挂死"。Imagus 启动更重时必现。
3. **`pageExns.slice(0, 8)` 截断了诊断输出** → 一度误判为"console 捕获丢了 5 条日志"，
   实际是打印上限。**诊断代码的打印上限也会伪造结论**，与产品代码同等危险。
