# notes.md — 执行留证

## 取证（R0）

**引擎冒烟**（headless Chrome，只加载 `darkreader.js` UMD，无扩展、无构建）：

```
BEFORE: {"dr":"object","bodyBg":"rgb(255, 255, 255)"}
AFTER ENABLE: {"isEnabled":true,"bodyBg":"rgb(20, 30, 36)","cardBg":"rgb(24, 36, 43)",
               "styleNodes":9,"cssLen":3056}
AFTER DISABLE: {"isEnabled":false,"bodyBg":"rgb(255, 255, 255)"}
EXCEPTIONS: []
```

⇒ 官方 npm 包的 UMD 可直接喂进页面，公开 API 面就是 `enable/disable/isEnabled/exportGeneratedCSS`。

**UI 那条线的现状**：v6.4 已按用户 2026-09-26 裁决把 Dark Reader `theme.less` 的配色**逐值照搬**
进设计 token（`--svi-bg: #141e24` …），三处消费点同源。所以「ui 完全是 dark reader」在**面板视觉**
这一层已经完成；本片做的是"整页变暗由谁执行"。

## 冻结与溯源（R1）

| 检查 | 结果 |
| :--- | :--- |
| `node scripts/vendor-darkreader.js` | `OK — darkreader@4.9.133 · 355381 字节 · sha256 82619e7a… · MIT 许可在场` |
| 篡改文件（追加一行）后 | **变红**并同时给出记录哈希与实测哈希，附升级指引 |
| `--update 4.9.133` 预演 | 拉到的字节哈希 = 已锁定的 `82619e7a…`（**独立复核了溯源**） |
| 代理 | 直接 `https.get` 在本机 TLS 超时 → 实现零依赖 CONNECT 隧道，走 `HTTPS_PROXY` 后正常 |

## 仲裁三态（R3，**真 bundle** 不是桩）

聚焦探针（15 秒，避开整套 bench 的 8 分钟与并发干扰）逐态读数：

| 步 | hasDr | drEnabled | bgReplace.active | delegated | adopted | bodyBg |
| :--- | :-: | :-: | :-: | :-: | :-: | :--- |
| A0 无引擎，boot | 0 | 0 | 0 | 0 | 0 | `rgb(255,255,255)` |
| A1 无引擎 + want=true | 0 | 0 | **1** | 0 | 0 | `rgb(20,20,20)` ← 自有路径真的开起来 |
| B0 注入引擎，基线 | 1 | 0 | 0 | 0 | 0 | `rgb(255,255,255)` |
| B1 want=true | 1 | **1** | **0** | **1** | 0 | **`rgb(15,22,27)`** ← 就是我们的 `--svi-bg-deep` |
| B2 +1.5s | 1 | 1 | 0 | 1 | 0 | 同上（稳定，不抖） |
| C1 release | 1 | **0** | 0 | 1 | 0 | `rgb(255,255,255)` ← 我们开的那次被关掉 |
| C2 用户自己开的 + release | 1 | **1** | 0 | 1 | **1** | `rgb(24,26,27)` ← **没关掉用户的** |

观察点：
- B1 的底色 `rgb(15,22,27)` 正是设计 token `--svi-bg-deep` (#0f161b) —— 说明我们的色调/亮度偏好
  真的流进了引擎的 theme，而不是"接上了但没生效"。
- C2 是**最要紧的**一条：用户自己开的 Dark Reader 在我们"归还"时**没有被关掉**。

## 踩坑（都要记住）

1. **夹具的环境残留**：bench 的 localStorage 在同轮里跨导航持久，前面场景种下的 `svi:prefs` /
   `siteOverrides` 会让本站的 `want` 变成 true ⇒ boot 期就已经委托过一次，"引擎此刻没在跑"这个
   前提直接不成立（场景 34b 因此红了一次）。修法：**先等 boot 完成，再显式清基线**。
2. **`statsEnabled` 会被别的场景关掉并留在 localStorage 里**，而 `StatsManager.count` 在关闭时
   直接 no-op ⇒ 计数断言以 `0 → 0` 变红，**看上去像产品没计数**。夹具里显式打开。
3. **并发会话互相破坏**（本机 34 个 node / 67 个 chrome）：`test-browser.js` 会把占用 9222 的
   Chrome 当"遗留实例"关掉 —— 于是两个会话互相杀对方的浏览器，表现为"页面完全没加载 / 夹具全部
   missing"这类**无法归属**的假红（实测遇到）。修法：`SVI_PORT` / `SVI_PORT2` / `SVI_CDP_PORT` /
   `SVI_PROFILE_DIR` 四个环境变量可覆盖（并发时把自己隔离到另一组资源）。

## 测试脚手架同时修掉的三处**既有**负载假红（非本片产品范围）

| 位置 | 现象 | 修法（都不动任何期望值） |
| :--- | :--- | :--- |
| 区域掩码 bench | 均值 1.08ms / 预算 1ms，负载下假红 | 断言改用 **25 轮的最小值**（固有代价的无偏估计），均值仍打进日志 |
| LRU 填充 | `cacheSize 199 !== 200` —— 掩码构建有**时间预算降级**，"恰好插 MAX 次"的等式在负载下不成立 | 改成**有界补填**到上限（≤MAX+20 次），失败信息带降级计数 |
| 有界轮询预算 | `ASYNC_POLL_MS=2000` / 预算 `3000` 被并发负载越过两次 | 提到 `5000` / `8000`（两者不是断言的一部分；谓词一满足就继续走，绿路径不受影响） |

## 未做（需用户拍板 / 如实记录）

- **扩展形态的按需注入**：需要 `chrome.scripting` + `host_permissions: ["<all_urls>"]`。
  权限扩张是**用户可见**的（Chrome 提示"需要新权限"，可能暂时停用扩展），不作为 AI 的自主决定。
  三条注入路径与代价已列在 `vendor/darkreader/README.md`，等用户选定。
- 用户脚本形态内联引擎（约 +355 KB）同样未做，理由同上（体积与 UMD-on-打包站 的边界）。
- **不影响已交付的价值**：用户自己装了 Dark Reader 时，本插件现在就会正确协作 ——
  收益最大、代价为零的那一半已经在跑。
