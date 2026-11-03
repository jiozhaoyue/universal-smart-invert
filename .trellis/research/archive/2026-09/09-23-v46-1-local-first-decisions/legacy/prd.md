# v4.6-1 本地优先判定: 弱网抢先 / 所见即所得 / 回归版本定位

## Goal

错误率随网络质量劣化: 决策必须基于本地已渲染内容(已解码像素/已知样式), 弱网下抢先于页面资源完成; 产出回归版本定位证据(二分)。

## Requirements

### 用户原话

> 「在某个版本后，错误率就奇高，受到网络影响极大。必须完全脱离网络的限制，必须所见即所得，
> 本地看到了就得去判断和反色与否，在网差的情况就抢先。」

### 现状证据（本次会话静态勘查，供实施者复核而非直接采信）

- 脚本自身**启动路径无网络调用**：`@connect *` 与 `gmFetchText()`（约 L3891）唯一调用点在手动
  「规则包链接导入」路径（约 L8340）。→ 用户的"受网络影响"来自**页面资源到达时机**，不是脚本联网。
- 现有关键门（全部按行号，实施时须复核）：
  - `runEagerPass()`（约 L4755）用 `el.complete && el.naturalWidth > 0` 过滤，未就绪**直接跳过且不占预算**。
  - `processImage()`（约 L5322）未 ready 时挂 `load` 一次性监听等网络；`error` 只记账。
  - `IntersectionObserver` rootMargin 300px（约 L4696）+ 启动后固定 2500/6000/12000ms 三轮补扫。
  - 像素判定依赖 canvas 绘制（`analyzeSrc` 路径），跨域未 CORS 的图片会因 taint 降级。
- → 弱网/懒加载/占位图长驻时，元素长期「未就绪 → 不判定 → 保持亮色」，与「所见即所得」相悖；
  这正是用户所感的"错误率随网络劣化"。

### 需求

- **R1 本地可判即判**：只要元素在**本地**具备可判依据（已解码像素 / 已知 computed style /
  已知 DOM 与祖先上下文 / 已知几何尺寸），就必须立即进入决策管线，**不得以网络未完成作为门**。
- **R2 已渲染即可判**：判定依据以「当前在本地的可见渲染结果」为准（含元素 Box、可见性、
  祖先遮罩/背景、已知的同源可读像素）；网络语义上的"资源就绪"（`load`/`complete`）**只能**作为
  增强通道，不得作为唯一门槛。
- **R3 弱网抢先**：限速场景下，首屏可见媒体的判定与落点必须在 **≤500ms** 内完成（不依赖
  `load`、不依赖 2.5s/6s/12s 延迟补扫作为主路径）。
- **R4 断网等价**：离线加载已缓存页面时，稳态决策集合与联网时一致（除确实取不到的资源）。
- **R5 无网络残留路径**：移除或显式禁用任何运行时联网能力（含 `gmFetchText` 自动调用点、
  `@connect *` 收敛为白名单或移除）；若保留手动导入，必须在 UI 明确标注为**手动**且不得在
  启动/扫描路径触发。
- **R6 不破坏 decide-once**：新增抢先路径不得让同一输入在两轮之间翻转判定。
- **R7 回归版本定位**：用 `git log` 对 `universal-smart-invert.user.js` 二分 + 限速复现，
  给出「错误率升高」的引入版本与机制，证据落 `research/`。

## Acceptance Criteria（2026-09-24 实现回写；worktree v46/impl-1）

- [x] `research/` 落一份二分报告：引入版本（commit hash）、机制说明、复现步骤
      → research/bisect-report.md（引入 b865ad6 / v3.1.0, 三机制叠加 + v1.3.1 ready 门底座）
- [x] 限速（CDP `Network.emulateNetworkConditions` 或等价）下首屏可见媒体 ≤500ms 完成判定，探针带时间戳
      → dev/probe-weaknet.js 实测: 全部 6 张首屏图 560ms 拿到档 B 本地决策 (400ms-RTT 限速下
        HTML 文档到达即判, 与图片字节交付完全解耦; 修复前 956ms~18s+/无决策),
        证据 research/repro-throttle-after.json (before 版本同目录 *-before.json)
- [x] 断网（`offline`）下稳态决策与联网态一致（探针对比 JSON 摘要）
      → dev/compare-states.js: fast/throttle/offline 三态稳态 6/6 全一致 (invert/pixel),
        research/three-state-compare.json
- [x] 代码审查 + 单测证明：「未 complete 就跳过」不再是主路径（保留增强通道需单测断言降级行为）
      → runEagerPass 未解码不再跳过 (回退开关 localFirstDecide=false 单测锁定 v4.5 行为);
        单测 4.6-2/3/6 (test-local-first.js, 由 test.js require)
- [x] 运行时联网路径收敛：`gmFetchText` 不再被任何非用户显式动作触发（grep + 单测断言）
      → 唯一调用点锁于 importRulesFromUrl (仅手动按钮 handler); @connect 头部注释明示
        唯一两类联网路径 (手动导入 + 跨域像素采样回退) 与运行时零自动遥测; 单测 4.6-7
- [x] 5 次重载 soak：稳态决策映射一致（沿用 `dev/probe-soak.js` 思路）
      → 本地固定页 5 重载决策数 6/6/6/6/6, run2-5 映射全等 (SOAK-PASS);
        probe-soak CDP 端口已按 PID 派生化
- [x] 四绿门禁全绿
      → node --check ✓ / node test.js ✓ (含 v4.6 新套件) / node test-browser.js ✓ (24 场景 100%)
        / build-extension+pack: 本子任务禁改 extension/, 留给主代理合并后执行 (见 Notes)
- [x] 结论写回 `.trellis/spec/frontend/quality-guidelines.md`
      → 新增「v4.6 本地优先判定 (local-first decisions)」小节

## Notes

- 探针基建现成：`scripts/probe-github.js <url>`、`scripts/visual-probe.js`、`dev/probe-*.js`。
  弱网请用 CDP 限速；探针端口与输出目录**必须按 PID 派生**（并行冲突教训）。
- 本子任务**只做判定时序与联网路径**，不改 Alt+点击（子任务 2）与悬停开关（子任务 3）。
- 若二分解出「回归点其实是遮罩/交互」，立即回写本 prd 并把证据移交给对应子任务，不要越界修改.
