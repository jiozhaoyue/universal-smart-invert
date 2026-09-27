# vendor/darkreader — 固化第三方产物

**别手改这个目录里的任何文件。** `darkreader.js` / `LICENSE` 是逐字节拷贝的上游发布物，
`PROVENANCE.md` 是它的溯源表。改一个字都会让 `test.js` 的门禁变红（哈希校验）。

- 校验：`node scripts/vendor-darkreader.js`（也跑在 `node test.js` 里）
- 升级：`node scripts/vendor-darkreader.js --update <x.y.z> --yes`（会重算溯源表）
- 溯源与升级纪律：见 [`PROVENANCE.md`](./PROVENANCE.md)

## 它在本项目里扮演什么角色

本插件的主场是**媒体**：视频 / 图片 / 背景图 / Canvas 的智能反色，以及 Dark Reader
做不到的一些效果。而"整页变暗"这件事 Dark Reader 的引擎为此而生，做得比我们好。

所以策略是**协作而非竞争**：

| 情形 | 行为 |
| :--- | :--- |
| 页面上没有 Dark Reader | 走本插件自有的页级暗化路径（与 0.6.7 及以前逐字节一致） |
| 页面有 Dark Reader，且它没在跑 | 本插件**请它开**（用我们的偏好映射成 theme），自己的页级改色**让位** —— 绝不叠加两套滤镜 |
| Dark Reader 已在跑（用户自己开的） | 本插件**只读不动**，收尾也绝不关掉用户的那一个 |

实现见用户脚本 §19.5「页级暗化引擎仲裁」：`darkReaderGlobal` / `pickPageDarkPlan` /
`mapPrefsToDarkReaderTheme` / `applyPageDarkForSite`，偏好项 `pageDarkEngine`
（`auto` 默认 / `native` / `darkreader`）。仲裁决策是纯函数，单测矩阵覆盖三态。

## 为什么把整个 bundle 放进来，而不是只抄算法

- 抄算法 = 跟着上游维护（本项目明确不想这么做）。
- 固化 bundle = 依赖面收敛到**一个多年稳定的公开 API**（`enable / disable / isEnabled /
  setFetchMethod`），升级是显式动作，本仓 diff 里不会混入上游噪音。
- 体积代价：355 KB，且**只在需要时才注入**（见下）。

## 注入方式（当前状态与待决项）

**当前**：本目录是"可用的固化产物 + 可验证的溯源"。运行时注入有两条路，各有代价，
**需用户拍板后才能启用**（因为它会改动扩展的权限面）：

| 方案 | 代价 | 说明 |
| :--- | :--- | :--- |
| A. 扩展动态注入 `chrome.scripting.executeScript({files})` | 需要新增 `scripting` 权限 + `host_permissions: ["<all_urls>"]` | 最省内存（按需注入）；但**权限扩张是用户可见的**（Chrome 会提示"需要新权限"，可能暂时停用扩展），不能由 AI 单方面决定 |
| B. 声明为第二个 content script | 零权限变更 | 但每个页面都要解析 355 KB，代价高；适合"用户明确常开"的场景 |
| C. 用户脚本形态内联 | 无需权限 | 用户脚本会从 675 KB 涨到约 1 MB；且打包站上 UMD 可能走 CommonJS 分支而不挂全局（见 PROVENANCE 的已知边界） |

**已就绪的部分**：无论哪条路，只要 `window.DarkReader` 在场，仲裁层立刻按上表工作
（bench 场景 34 用**真实 bundle** 验证过三态）。也就是说：**用户自己装了 Dark Reader 扩展时，
本插件现在已经会正确协作**——这正是收益最大、代价为零的那一半。
