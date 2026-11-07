# 02 · 浮层反色适配 · 终版三分表（Step 1.3 交付）

> 真源：`01-overlay-probe.md`（§2 对照表 / §3 三分表 / §8–§11 真机与修复实测）。
> 本文件是**终版裁决汇总**：每行 = 候选 / 归属 / 根因 / 证据 / 最终处置（含本任务实施结果）。
> 措辞与本表不一致的地方，以本表为准；本表与实测数据不一致的地方，以原始 JSONL 为准。

## 1. 已覆盖（有机制 + 实测证据）

| # | 候选 | 覆盖机制 | 实测证据 | 处置 |
|---|---|---|---|---|
| M1' | 跨域图片像素不可读（**油猴**形态） | `gmFetchBlob` 走 `GM_xmlhttpRequest` 特权通道 | `gm` 组 C3 反色 126ms；无 GM 组同用例失败（分水岭 = GM 通道） | 已覆盖，不动 |
| M2 | 跨域 iframe 内浮层 | 扩展 `all_frames:true` + `matches:<all_urls>` | 机制已核，夹具未构造跨域 iframe 浮层（**未实测，如实登记**） | 登记为机制覆盖 |
| M3 | 闭合 Shadow Root 内浮层 | `attachShadow` 幂等补丁 + 注册表解析 | bench Scenario 16 覆盖 | 已覆盖 |
| M4/M11 | 媒体晚加载 / `srcset` 换源 / 元素替换 | pending 登记 + `attachPendingWake` 一次性 `load` + `attributeFilter` 含 `src/srcset` | C1 109ms、C4 161ms、C5 162ms 均反色，**无漏唤醒** | 已覆盖 |
| — | 背景图浮层 | `BgImageEngine` 自有 MutationObserver | C8 103ms 反色 | 已覆盖 |
| — | 暗色图不误反（反例） | decide-once 像素管线 | C6 五组配置全部未反色 ✓ | 已覆盖 |

## 2. 可解未覆盖 → **本任务已修**（实测证据见 01 报告 §11）

| # | 候选 | 根因（两处叠加） | 修复 | 修复后证据 |
|---|---|---|---|---|
| **G1** | 扩展形态无法反色「跨域且源站不发 CORS」的原图 | ① MV3 内容脚本 `fetch` 受 CORS 限制、无特权取字节通道；② 字节过 `chrome.runtime` 消息边界被 JSON 序列化成 15 字节垃圾 Blob（**与 CORS 无关的隐形杀手**） | `scripts/extension-src/sw.js`（唯一职责取媒体字节，4MB 体积门）+ manifest `background`（`service_worker`/`scripts` 双键）+ `host_permissions`；垫片优先 SW、失败回落 fetch；**传输改 base64 字符串** | 扩展 C3：修复前 `data-svi-failed` @119ms → 修复后 **176.8ms 反色**；`raw-ext-after-sw.jsonl` |
| **G2** | 网络慢时浮层反色滞后于原图下载（浮层 src 全新 URL 时） | 判定必须等原图自己的字节（netslow C1 382ms / C7 535ms） | **E3 原图链接继承**（R3.2）：`<a href=原图><img 缩略图>` 视觉同一性 → 缩略图的**权威**结论直接继承给浮层，标 `provisional`，真像素到达后升级；不继承 skip 源 / video | bench 新场景断言继承落地；真机 hoverzoom P1/P2 悬停即反色 |

## 3. 真无解（原理性下界，不包装成已解决）

| # | 候选 | 为什么无解 | 证据口径 | 我们的行为（安全） |
|---|---|---|---|---|
| T1 | 媒体字节从未到达（离线 / 404 / 被拦） | 没有像素就没有判定依据 | C3 失败组 + `markFailure` 显式放行原图（`:8866` 一带，逐字核实） | 绝不乱上滤镜；60s TTL 内静默，累计 ≥3 次记 `skip/analysis-failed` |
| T2 | 元素从未进入文档（Worker / 原生层绘制） | 无 DOM 接缝 | **机制推断，未实测** | 登记为边界 |
| T3 | 跨进程合成层（DRM 等） | CSS 滤镜不到达 | **机制推断**；超图片范畴 | 登记为边界 |
| T4 | 判定晚于「该元素字节到达 + 一次解码」 | 下界而非缺陷；可被 E3 缩小（有缩略图结论时免下载） | 基线 100–165ms；netslow 382–535ms | 遮罩档可把空窗遮成深色（2A） |

## 4. 附带裁决

- **H1（时延竞争是主因）= 证伪**：基线 100–165ms，~100ms 是变更去抖，分析仅 5–30ms；真因是
  H2（网络等待原图字节）。§3.2「同步免去抖通道」**放弃实施**（收益上限 ~100ms，不成比例）。
- **遮罩白区（用户报告，01 报告 §10）**：实测复现出**两条**硬结论 —— ① `visibility:hidden` 只露
  背后白底；② 档 B 临时结论当场 settled 掉遮罩。修法 = **2A 两步**：呈现层改「深色占盒」
  （`background: var(--svi-bg)` + `pointer-events:none`）+ 生命周期改「只有权威结论摘罩」。
- **S1/S2/S3 信号链**：hoverzoom 真机实测浮层 `src` 就是 `<a href>` 本身 → 只保留 S1′
  （`a[href] === img.src` 逐字符相等），S2/S3 **砍掉**（少一份全局状态与启发式）。
- **Imagus-Reborn**：**未实测**（`chrome.userScripts` 开关 CDP 无法代翻），浮层形态为源码推断
  （open shadow root + `PVI.IMG`）。凡引用必须写「推断，非实测」。

## 5. 残留与如实登记

| 项 | 状态 |
|---|---|
| Firefox 侧 SW 实载验证 | **只有 lint 证据**（`BACKGROUND_SERVICE_WORKER_IGNORED` 为双键并存的预期告警）；无 geckodriver 实载。AC10 的 Firefox 半边未闭环 |
| 权限提示实测（AC10） | 未做真机安装观察；现行 `content_scripts.matches` 本就含 `<all_urls>`，**不推测**，留待实装观察 |
| `maskSettleTimeoutMs` 是否暴露到面板 | 未暴露（维持现状）；是否暴露交用户裁决 |
| 夹具三形态（闭合根 / canvas / 跨域 iframe 浮层） | 未在本次夹具构造；M3 由 bench Scenario 16 覆盖，M2 机制覆盖 |
| 浮图秀 | 闭源商店分发，以等价夹具形态覆盖（PRD AC2 口径） |
