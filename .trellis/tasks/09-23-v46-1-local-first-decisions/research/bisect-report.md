# v4.6-1 二分定位报告：「错误率奇高 / 受网络影响极大」引入版本与机制

> 任务: `.trellis/tasks/09-23-v46-1-local-first-decisions` · 分支 `v46/impl-1` · 2026-09-24
> 复现工具: `dev/probe-weaknet.js`（CDP `Network.emulateNetworkConditions` 限速，本地慢源自持，端口/输出目录按 PID 派生）

## 1. 结论（TL;DR）

网络耦合型错误率的**实际引入提交**是：

```
b865ad6  feat: decide-once image pipeline with eager pre-scroll pass, smart image policy
         (balanced default, cover-grid skip), current-page media inspector, hover-restore
         toggle, hover-zoom viewer compatibility, and live GitHub probe tools (v3.1.0)
```

即 **v3.1.0**（2026-09-12）。用户「某个版本后错误率奇高、受网络影响极大」的体感与本提交引入的
三重机制叠加一致；其下更古老的 `ready 门（complete && naturalWidth>0 → 等 load）`
（自 v1.3.1 初始提交 a8f69ac 就存在）是**底座机制**（决策空洞的直接来源），v3.1.0 使其**永久化/恶化**。

## 2. 二分过程

`git log --oneline -- universal-smart-invert.user.js` 全量历史逐版本静态比对 + `git log -S` 定位：

| 机制 | 引入提交 | 版本 | 证据 |
|---|---|---|---|
| `processImage` 的 `ready = complete && (naturalWidth>0 || !src)`，未 ready 挂一次性 `load` 监听等网络 | `a8f69ac` (初始) | v1.3.1 | `git show a8f69ac` 中 `processImage` 已含该门 |
| **eager 预扫**：`runEagerPass()` 对未完成图 `if (!loaded) return;`（不判定、不占预算、不登记任何可唤醒状态） | `b865ad6` | v3.1.0 | `git show b865ad6` 新增 `runEagerPass` / `eagerScanBudget` |
| **decide-once 决策快照**：首个通道做出的决策永久冻结，任何入口不重算 | `b865ad6` | v3.1.0 | `decisionBySrc` 与「绝不重算已决 src」注释同提交引入 |
| **失败三振永久跳过**：`markFailure` 累计 ≥3 次后落 `skip / 'analysis-failed'` 永久决策 | `b865ad6` | v3.1.0 | `git log -S "analysis-failed"` 仅命中 b865ad6（及其自身） |
| sanity-dark 纠错网（拒绝低均亮反色，减少误反但非网络耦合） | `0040c21` | v4.3.0 | `analyzeSrc` 新增 `meanLum` 证据门 |
| transparent-light 守护（透明底图不反色，同上非网络耦合） | `8c1ee9f` | v4.5.0 | `opaqueRatio < 0.4 → keep` |

## 3. 机制说明（为什么「错误率随网络劣化」）

弱网/懒加载下页面元素的**本地可见状态**与**网络字节到达**是两回事：

1. **决策空洞（limbo）**：占位图（`width/height` 已声明、布局盒已存在、屏幕上可见）在字节到达前
   `complete === false`。eager 预扫直接跳过（v3.1.0 起），IO 命中后 `processImage` 挂 `load`
   监听（v1.3.1 起）→ 在此期间元素**既不判定也不登记**，视觉保持原样。
   用户看到的是「明明该反色的白图长时间不反」——即「错误率」体感的直接来源。
2. **瞬态网络失败被永久化（v3.1.0）**：跨域图 canvas 污染时走 `gmFetchBlob` 重取；
   弱网下超时 → `analyzeSrc !ok` → `markFailure`。同一 src 的多个元素反复进入管线，
   3 次失败后 `decisionBySrc` 落 `skip/'analysis-failed'` **永久决策**——网络恢复也不会再判。
3. **决策时机证据不完整 + 快照冻结（v3.1.0）**：decide-once 把「第一个到达的通道」的结论冻结。
   快网下首通道通常带全证据（图已解码）；弱网下首通道可能在小元素门/策略门上拿到
   依赖网络进度的中间态证据（兄弟元素未布局、srcCount 未就绪等），坏结论被快照固化，
   后续不再纠正。

三态叠加 = **决策质量成为网络质量的函数**，与用户描述完全吻合。

## 4. 复现步骤与证据

### 复现环境
- `node dev/probe-weaknet.js`（默认 throttle 档：300kbps 下行 / 400ms RTT）
- 本地慢源：`http://127.0.0.1:<PID派生端口>/`，首屏 6 张白底图（可见、已布局），
  服务端延迟 0/1/2/5/10/15s；CDP 注入被测脚本后导航
- 采样：100ms 一次，记录每图 `data-svi-checked-src` 首次出现时刻 + 决策快照

### 修复前（v4.5.0，commit fcb1a73 = worktree HEAD）实测
`research/repro-throttle-before.json`（2026-09-23T16:48Z 运行）：

| 图（服务端延迟） | 首次决策时刻 | 结论 |
|---|---|---|
| i0（0s） | **956ms** | invert / pixel |
| i1（1s） | 1523ms | invert / pixel |
| i2（2s） | 3073ms | invert / pixel |
| i5（5s） | 6536ms | invert / pixel |
| i10（10s） | **12573ms** | invert / pixel |
| i15（15s） | **>18s 无决策** | —（可见白占位，判定空洞） |

→ 首次决策时刻 ≈ 服务器延迟 + 网络时延，**与网络交付 1:1 耦合**；对照 R3「首屏可见媒体 ≤500ms」
全部不达标（含 0 延迟图，因主路径要等 IO/eager 就绪门）。

### 稳态对照（说明「最终会判对」但「过程长期错」）
最终决策均为 invert/pixel（快网弱网稳态一致），但 15s 图在弱网下有 **15s+ 的判定空洞**；
真实站点上这就是「长时间该反不反」。加上 §3.2 的三振永久跳过与 §3.3 的快照冻结，
弱网下错误率被系统性放大。

## 5. 与需求的对应

- R1/R2（本地可判即判 / 已渲染即可判）：针对 §3.1 底座机制 + v3.1.0 eager 门 —— 本次改造主体。
- R6（不破坏 decide-once）：三振永久跳过保留（语义合理），但**档位升级**（本地证据从
  B→A）被定义为「新证据」，走 force 刷新快照的既有先例（与手动覆盖同路径），见 design.md C4。
- R7（回归定位）：本报告即交付；机制清单已含「多机制叠加」逐条（§2 表）。
