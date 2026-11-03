# design.md — 固化产物 + 页级暗化仲裁

## 1. 固化产物（vendor/darkreader）

**取哪一份**：npm 官方发布包 `darkreader@4.9.133` 里的 `darkreader.js`（UMD，355381 字节，MIT）。
不取 GitHub 源码（那是 TS 单仓，需要构建器）——我们要的是"能直接喂进页面的引擎"。

**为什么冻结而不是跟随**：我们对它的用法收敛在**一个多年稳定的公开 API**
（`enable / disable / isEnabled / setFetchMethod / exportGeneratedCSS`）。
跟随意味着持续处理上游内部重构，而收益为零；冻结让本仓 diff 不含上游噪音。

**如何让"冻结"可验证**（这是冻结能否成立的关键）：

- `PROVENANCE.md` 记录：上游仓 / 发布渠道 / 版本 / tarball URL 与其 SHA-256 / 文件 SHA-256 / 字节数 / 冻结日期。
- `scripts/vendor-darkreader.js`：
  - `--verify`（默认）—— 比对文件哈希与溯源表，缺 LICENSE 或非 MIT 文本也报错；
  - `--update <x.y.z> [--yes]` —— 拉 tarball（**支持 HTTPS_PROXY 的 CONNECT 隧道**，本机国际网络必须走代理）、
    零依赖解 tar、打印新旧哈希与体积差，不加 `--yes` 只预演；写入后**重算溯源表**。
  - 双形态：CLI 直跑失败即 `exit(1)`；被 `require` 时**抛错**（这样 `test.js` 能把它变成一条断言）。
- 接入门禁：`test.js` 里 `require('./scripts/vendor-darkreader.js').verify()`。
  「冻结」若不可验证，就只是一句口号。

## 2. 页级暗化仲裁

### 2.1 落点选择

自有的"页级暗化"是既有能力 `applyBackgroundReplace(active)`（站点档案 `bgReplace`），
全仓有 7 个调用点。**不新建一套**，而是把调用点收敛到一个仲裁入口：

```
applyPageDarkForSite(want)   ← 7 个调用点全部改走这里
        │
        ├─ pickPageDarkPlan({present, drEnabled, owned, want, pref})   ← 纯函数
        │
        └─ 'delegate' → DarkReader.enable(theme) + 自有路径让位 + owned=true
           'adopt'    → 自有路径让位（对方已在跑，绝不叠加）
           'release'  → 仅当我们是 owner 才 disable，并清账
           'native'   → applyBackgroundReplace(true)   ← 与旧行为逐字节一致
           'skip'     → applyBackgroundReplace(false)  ← 与旧行为逐字节一致
```

**缺席等价性**是这条改动的安全底座：引擎不在场时 `pickPageDarkPlan` 只返回 `native`/`skip`，
逐一落回原调用，没有第三方环境时行为**逐字节**不变（单测矩阵 + bench 场景 34a 双向钉住）。

### 2.2 决策表（`pickPageDarkPlan`）

| present | drEnabled | owned | want | pref | 结果 | 理由 |
| :-: | :-: | :-: | :-: | :-: | :--- | :--- |
| 0 | – | 0 | 1 | auto | `native` | 缺席即降级，不残废 |
| 0 | – | 0 | 0 | auto | `skip` | |
| 0 | – | 0 | 1 | darkreader | `native` | 指定了引擎但缺席 → 降级并如实走自有 |
| 1 | 0 | 0 | 1 | auto | `delegate` | 请它开 |
| 1 | 0 | 0 | 1 | native | `native` | 用户显式要求自有 |
| 1 | 1 | 0 | – | any | `adopt` | **绝不叠加**，且**绝不关用户的** |
| 1 | 1 | 1 | 1 | any | `adopt` | 我们开的且仍需要 → 维持 |
| 1 | 1 | 1 | 0 | any | `release` | 我们开的但不再需要 → 由我们关掉 |
| 1 | 0 | 1 | 0 | any | `release` | 账上有但引擎已不在跑 → 幂等关一次并清账 |

### 2.3 偏好映射（`mapPrefsToDarkReaderTheme`，纯函数）

- `mode: 1`；`brightness/contrast` **固定 100（恒等）**：我们的 `bgBrightness/bgContrast`
  已经**烘进**底色与文字色（`applyDynamicThemeAdjust`），再交给它当 CSS 滤镜会二次施加同一调整。
- `darkSchemeBackgroundColor` = `applyDynamicThemeAdjust(#0f161b, bgTone, bgBrightness, bgContrast)`
  —— 即设计 token `--svi-bg-deep` 经用户的色调/亮度/对比度档位调整后的结果。
- `darkSchemeTextColor` = 同法作用于 `--svi-text-strong` (#e8f4f6)（tone 传 `pure-black`，与既有
  `applyDynamicThemeAdjust` 对文字的用法一致）。
- `useFont`/`fontFamily` ← `fontOverride`/`fontFamilyPreset`（复用既有 `FONT_STACKS`）；
  `textStroke` 钳到 0~1（与 Dark Reader 的契约一致）。

### 2.4 失败面

- 引擎 `enable()` 抛错 → catch → **回退自有路径**并记 `pageDarkDelegateFailures`，
  绝不因第三方异常而让页级暗化整体失效。
- 引擎探测（`darkReaderGlobal`）只认公开 API 面，任何探测异常都返回 `null`（= 缺席）。

## 3. 风险与取舍

| 风险 | 处置 |
| :--- | :--- |
| 用户装了 Dark Reader 却被我们关掉 | `owned` 记账：只有"我们开的"才由我们关（AC4 有专门断言） |
| 两套滤镜叠加把页面压灰 | `adopt`/`delegate` 两条路径都强制 `applyBackgroundReplace(false)` |
| 引擎缺席时行为漂移 | 决策表只有 `native`/`skip` 两个出口，逐字节落回原调用 |
| 固化产物被手改 / 溯源失真 | 哈希校验接入 `test.js` 门禁（篡改即红，实测过） |
| UMD 在打包站走 CommonJS 分支不挂全局 | 探测不到即当缺席；已写进 PROVENANCE 的「已知边界」 |

## 4. 不做（需用户拍板）

扩展形态下**按需注入**引擎需要 `chrome.scripting` + `host_permissions: ["<all_urls>"]`。
权限扩张是用户可见的（Chrome 提示"需要新权限"，可能暂时停用扩展），**不作为 AI 的自主决定**。
三条注入路径与代价已列在 `vendor/darkreader/README.md`，等用户选定后再实现。

**不影响本片价值**：用户自己装了 Dark Reader 扩展时，本插件现在就会正确协作 —— 这是收益最大、
代价为零的那一半，bench 用真实 bundle 验证过。
