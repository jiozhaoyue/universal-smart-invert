# Journal - jiozhaoyue (Part 1)

> AI development session journal
> Started: 2026-09-05

---



## Session 1: Universal Smart Video Invert Implementation
<!-- trellis-session: v=2 fp=aaa29eab494e791b -->

**Date**: 2026-09-05
**Task**: Universal Smart Video Invert Implementation

### Summary

Completed universal HTML5 smart video invert userscript with precise video targeting, offscreen luminance auto-detection, non-conflicting HIL state machine, and minimalist edge capsule UI.

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 2: Phase 2 Smart Image Invert Implementation
<!-- trellis-session: v=2 fp=a1d7c0890e995ac7 -->

**Date**: 2026-09-05
**Task**: Phase 2 Smart Image Invert Implementation

### Summary

Implemented Phase 2 ImageInvertEngine with IntersectionObserver, candidate size and class exclusions, offscreen canvas white diagram detection, pure CSS hover preview, and independent UI capsule toggle.

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 3: Universal Smart Invert v1.3.1 Open Source Release
<!-- trellis-session: v=2 fp=71de9012cd1ea25e -->

**Date**: 2026-09-06
**Task**: Universal Smart Invert v1.3.1 Open Source Release
**Branch**: `main`

### Summary

Completed repository renaming, git history sanitization, open-source public release, publishing guidelines, and official v1.3.1 GitHub release tag.

### Git Commits

| Hash | Message |
|------|---------|
| `a8f69ac` | feat: initial release of universal-smart-invert v1.3.1 |
| `9377560` | docs: add publishing guide for Greasy Fork and ScriptCat with compatibility tags |

### Status

[OK] **Completed**


## Session 4: v1.4.0 Multi-Light-Color Image Detection & Browser Automation
<!-- trellis-session: v=2 fp=a56909c339ef6a03 -->

**Date**: 2026-09-06
**Task**: v1.4.0 Multi-Light-Color Image Detection & Browser Automation
**Branch**: `main`

### Summary

Fixed image auto-invert root causes (tainted canvas & URL filter), introduced 8x8 micro-canvas multi-light-color detection, color picker & preset chips UI with collapsible advanced drawer, and verified with CDP Chrome headless end-to-end automation.

### Git Commits

| Hash | Message |
|------|---------|
| `75e3401` | feat: multi-light-color background detection, color picker, taint-immune canvas, and browser automation test suite (v1.4.0) |

### Status

[OK] **Completed**


## Session 5: v2.0 Site Engine: background replace, per-site rules, tab isolation, stats
<!-- trellis-session: v=2 fp=3c1dd9dffd4e9c23 -->

**Date**: 2026-09-12
**Task**: v2.0 Site Engine: background replace, per-site rules, tab isolation, stats
**Branch**: `main`

### Summary

Shipped v2.0.0: per-site background replacement with login-block protection (163 etc.), builtin site rule library + color shield + blacklist/whitelist, smart small-element shielding, tab-isolated runtime state, star-history/camo SVG nested decode fallback fix, bilibili bg-image comment thumbnails, local stats with manual developer export; all unit + CDP browser tests green.

### Git Commits

| Hash | Message |
|------|---------|
| `0f078ba` | feat: per-site background replace with login-block protection, site rules, color shield, tab isolation, camo SVG decode fix, bg-image thumbnails, and local stats export (v2.0.0) |

### Status

[OK] **Completed**


## Session 6: v3.0: partial-effect pipeline, predictive video, self-learning rules, extension prep
<!-- trellis-session: v=2 fp=3dcdbc7d9342a8a6 -->

**Date**: 2026-09-12
**Task**: v3.0: partial-effect pipeline, predictive video, self-learning rules, extension prep
**Branch**: `main`

### Summary

Shipped v3.0.0: canvas/WebGL partial-inversion and effect pipeline (luma-mask, chroma-key, rect region, grayscale/sepia; content:url blob delivery; PiP via captureStream), rVFC same-frame-adjacent video switching with learned timeline segments (reference/takeover), self-learning element rules from manual corrections (user > learned > seed), Store layer (chrome.storage.sync/GM/localStorage, byte-safe chunking, quota degrade, manager UI), shadow-DOM/canvas/poster/SVG-image coverage, file:// support with graceful degradation, userscript+extension coexistence handshake, dependency-free extension build chain (MV3 manifest, PNG icons, zip packer) with CRX CI and guarded CWS auto-publish; 15 check findings fixed incl. secrets-context workflow bug and extension Store init; all unit + 12 CDP bench scenarios green.

### Git Commits

| Hash | Message |
|------|---------|
| `7db7bd4` | feat: partial-effect inversion (luma/chroma-key/rect + effects), predictive video with rVFC and timeline memory, self-learning rules, browser-storage layer with cloud-sync backends, reusable settings UI, file:// support, and MV3 extension build with CRX CI and guarded Web Store auto-publish (v3.0.0) |

### Status

[OK] **Completed**


## Session 7: v3.1 feedback hardening: GitHub pre-scroll fix, smart image policy, media inspector
<!-- trellis-session: v=2 fp=c1b44c4bb58c1e8c -->

**Date**: 2026-09-12
**Task**: v3.1 feedback hardening: GitHub pre-scroll fix, smart image policy, media inspector
**Branch**: `main`

### Summary

Diagnosed GitHub README ineffectiveness via live CDP probes (pipeline OK; below-fold images waited for viewport; badge decisions flipped between passes). v3.1.0: unified decideImage pipeline (override > snapshot > learned > seed > policy > pixels) with decide-once semantics, eager pre-scroll pass (live page: 7/29 inverted without scrolling vs 1/29 baseline), imagePolicy balanced/conservative/aggressive with grid+chrome-context detection (bilibili-style covers skip), current-page media inspector with toggle/locate, hoverRestore toggle, composedPath viewer compatibility; 8 check findings fixed; 17 bench scenarios green.

### Git Commits

| Hash | Message |
|------|---------|
| `67b4cde` | docs(spec): v3.1 lessons (override force-refresh, decision order, composedPath retargeting, lazy-collect sections) |

### Status

[OK] **Completed**


## Session 8: v3.2 video tune: independent picture adjustments
<!-- trellis-session: v=2 fp=7306f72bd1efb30d -->

**Date**: 2026-09-12
**Task**: v3.2 video tune: independent picture adjustments
**Branch**: `main`

### Summary

Shipped v3.2.0: independent video picture tuning (brightness/contrast/saturate/warmth/grayscale) applied to all videos via stylesheet rule, composed into the inversion inline chain and the WebGL overlay shader (new u_sepia/u_gray uniforms), 🎚️ modal section with reusable slider rows + 护眼/夜间/鲜艳/还原 presets, persisted prefs with per-field normalization. Root-caused a bench flake: the fixed .chrome-test-profile persisted overrides across runs — profile now wiped per run. 18 bench scenarios + unit tests green; extension rebuilt to 3.2.0.

### Git Commits

| Hash | Message |
|------|---------|
| `adcd218` | chore(task): archive 09-12-v32-video-tune |

### Status

[OK] **Completed**


## Session 9: v3.3 设置面板全面改版：可停靠布局/规则文件/元素规则/全中文化
<!-- trellis-session: v=2 fp=04d581b785a73c38 -->

**Date**: 2026-09-13
**Task**: v3.3 设置面板全面改版：可停靠布局/规则文件/元素规则/全中文化
**Branch**: `main`

### Summary

完成 v3.3 UI 全面改版并归档任务：设置页三种布局（居中/靠左停靠/靠右停靠，停靠无遮罩可拖宽记忆）；行布局纵向堆叠+min-width:0，任何视口无横向滚动与出界（CDP 布局探针 6 组合验证）；信息架构按使用频率重排 8 区块并解散折叠抽屉；下拉选项去括号+动态说明行，界面全中文化（存储后端/键名/色值/统计说明）；规则文件导出与合并/替换导入（downloadJsonFile/pickJsonFile 抽公共助手）；新增元素级规则：决策优先级插为 手动>元素规则>快照>学习>种子>门>像素，图片与背景图引擎同时生效，FIFO 200。测试：test.js 元素规则单测、基准 Scenario 1b 端到端、基准断言随区块调整；全量门禁绿。经验已录入 quality-guidelines v3.3 节（含 CDP document-start 注入丢样式的探针陷阱）。校验子代理逐条核对 8/8 验收标准，遗留 Low 项（统计摘要英文 canvas）已修补提交。

### Git Commits

| Hash | Message |
|------|---------|
| `e3892f9` | feat: v3.3 settings panel overhaul — dockable layouts, rule files, element rules, full zh-CN IA (v3.3.0) |
| `a898891` | fix: translate stats summary canvas label to zh-CN, drop dead accordion css |

### Status

[OK] **Completed**

## 2026-09-13 · v4.0.0 设置页重构 + 站点电源热生效

- 修复: v3.3.1 面板 (统计网格/删 JSON 预览/零横向溢出探针 scripts/check-panel-overflow.js, 21 配置全绿)。
- v4.0: 设置页推倒重做 —— 电源横幅(热生效) + 本站/全局双页签 + 三态能力卡片(跟随全局/强制开/强制关), 站点名单移全局页签, 零冗余。
- 站点电源热生效: runtime.siteActive 入口闸 + 同帧拆全部副作用 (类/属性族/内联滤镜/覆盖层/画面调节/背景替换); 开机禁用页胶囊折叠为电源徽标, bootEngines() 幂等抽取支持运行时首启。
- bench 新增 Scenario 19 (真实点击电源开关, 同帧断言+无刷新恢复), 19/19 全绿; 溢出探针 PASS。
- 教训: 恢复分支漏 updateImageFilterCss() 导致门类不回 —— 已入 spec v4.0 additions。

### 2026-09-13 · v4.1.0 AGPL 迁移 + 字体与可读性 (DR 吸收#1)

- LICENSE → AGPL-3.0-or-later 全文; @license/README/PUBLISHING/dev-loader 全部同步; 超集路线图入任务 prd (P1 动态主题 / P2 页面调节 / P4 规则库 / P5 定时)。
- 新增「字体与可读性」(全局页签): 字体覆盖 (无衬线/衬线/等宽/圆体) + 文字描边 0~1px; CSS 变量+门类, 非 filter; 代码块/SVG 白名单排除; 站点挂起同拆、恢复重放 (updateFontCss 挂接 boot/onRemoteLoaded/strip/resume)。
- bench Scenario 20 全绿 (20/20); 教训: 描边选择器不含 body, 断言须落在文本元素上。

### 2026-09-13 · v4.2.0 超集 P1-P5 + 全量 CI + 上游同步

- P1/P2 动态深色主题: applyDynamicThemeAdjust 纯函数 (默认恒等) 包裹三色桶生成; 色调不染文字; 变更 rescan 热生效; 全局页签「🌙 动态主题调节」。
- P5 定时模式: scheduleActiveNow 接入 evaluateSitePower 主闸, 60s 轮询跨档热切换; 教训: updateImageFilterCss/HIL 必须认 runtime.siteActive, 否则定时挂起被重新点亮 (场景 22 抓获, 已入 spec)。
- P4: scripts/export-rule-library.js (19 内置规则快照) + scripts/sync-darkreader.js (上游 1213 黑名单种子 + 279 修复站点, curl 代理感知); rules/*.import.json 一键合并幂等零冲突; DR 配置是单数 .config 纯行列表。
- CI: upstream-sync.yml 每日自动 PR (全量再生→永不冲突); ci.yml bench job 加溢出探针。
- 本地 hook: 每日门禁巡检 automation 已建; 每周上游报告受单会话单自动化限制待新会话补建。
- 门禁: 单测 (v4.2 两组) + bench 22/22 + 探针 PASS + 打包 v4.2.0。

### 2026-09-13 · v4.3.0 防闪光 + 局部改色 + 反色纠错网

- 防闪光: 文档起步即黑仅限 bgReplace 站; 设置开关(默认开, 关立即拆); 插件 manifest → document_start + CI 冒烟同步。
- 元素规则第三动作「局部改色」: bgr.partialTag/applyPartialRules, 桶引擎配对映射(底暗字亮), 作用域隔离不碰兄弟元素; 场景 23 断言。
- 纠错网: analyzeSrc 返回 meanLum/opaqueRatio; sanity 门(浅类但均值<96 → keep sanity-dark); 像素反色决策 6s 限时复检(队列≤12, 每源一次), opaqueRatio≥0.5 可信门防 SVG 透明样本误翻(场景1 抓获)。
- 事故与修复: flashGuardOff 挂载早于 __svi 字面量导致启动全灭(场景1 UI 全 Missing); bench 测试页必须内联脚本 + 显式 sviSeed 隔离同源持久化。
- 门禁: 单测全绿 + bench 24/24 + 探针 PASS + 打包 v4.3.0。

### 2026-09-19 · v4.5.0 弹窗面板 + 反色正确性 + 规则分发 (进行中)

- 悬停开关失效根因: 内联 sec.add(ui.xxxRow) 只进 ui.section() 区块本地 syncs, 全量刷新只遍历全局 rowSyncs → 复选框永不回显真实状态(悬停显示"关"而实际开), 首次点击写反值。修复: 6 个静态行逐一 push; 回归=bench 场景 20b。
- 错误反色两根因: (1) flash guard 黑底污染 bgr 首扫采样 → body 底色桶缺失白底泄漏 → startScan 守卫期延迟 + off() 补打 html/body + 零白交接(等桶就绪才撤黑, 2.5s 兜底); (2) requestIdle 无头/CDP 下可 4s+ 不触发 → rIC+setTimeout 双通道竞速。
- 重大策略门修复: closestContextHit 忽略 html/body —— [class*="content"] 命中 Wikipedia <html> 上的 vector-feature-limited-width-CONTENT-enabled, 全页图片被判正文上下文, 站标被反色。单测 + 真站探针验证 logo skip:policy。
- 透明守护: opaqueRatio<0.4 的浅类改 keep(transparent-light)。教训: enwiki-25.svg 实测 opaqueRatio 0.707 是"彩色徽标"而非透明图, 真正修的是上下文而非像素 —— 先量数据再定阈值。
- 弹窗: popup.html/js (scripts/extension-src 生成到 extension/), onMessage 通道复用设置面板处理器; Chrome 137+ 品牌版忽略 --load-extension → CDP Extensions.loadUnpacked (需 --enable-unsafe-extension-debugging + --remote-debugging-pipe, fd3/4 \0 分隔 JSON); 端到端: 快照/电源热切/预设/悬停/白名单拒绝 全过。
- 规则分发: 从链接导入(gmFetchText 绕 CSP) + 导出学习成果(仅特征/命中数) + rules/svi-pack.import.json 一体化包 (export-rules-pack.js)。
- 视觉循环: visual-probe.js (前/后截图+决策报告), 已覆盖 GitHub/Wikipedia/BBC/SO/B站/MDN/掘金(404)/cnblogs —— 截图判定均通过; 探针并行冲突教训: CDP 端口与输出目录需按 PID 派生。
- 移动端: 375px 模态全宽、把手隐藏、select 16px/40px; num-input 被 ~2500 行处基础规则覆盖 → 媒体查询内提升特异性。
- 版本同步: SCRIPT_VERSION 3.3.0→4.5.0 (此前与 @version 脱节), test.js 断言改锚 svi.version。

### 2026-09-19 · v4.5 视觉循环第 8-19 轮 (追加)

- 新增真站覆盖: npm/W3Schools/python-docs/runoob/arXiv/状态图维基/Twitch/Reddit/B站首页/V2EX/docs.rs/dev.to/hashnode/B站搜索(高等数学课件)/mail.163/en.m.wikipedia/知乎/PhysicsSE —— 全部截图判定通过。
- 关键真站验证: Alt+点击闭环 (覆盖→持久→重载保持→再点恢复, overrideKeys=1, reason=manual); 5 次重载 soak (稳态决策一致; 动态页需按共有 URL 比较); 播放中 B站视频 HIL (深色真人场景保持); mail.163 动态主题 (bodyTag #ffffff→rgb(20,20,20), 5 桶, 零白交接; 渐变背景营销页为已知 bg-image 限制)。
- 追加修复: 头像 URL 路径段 (/avatars/) 计入 META_ICON_RE (hashnode 类头像误反); 规则包导入改内联输入行 (内容脚本对话框不可依赖) + 允许环回 http; elementRules 合并按 id 幂等去重 (二次导入曾翻倍); 包动作词表 'keep'→'protect' (曾致 38→9)。
- 教训: (1) 并行探针需按 PID 派生 CDP 端口与输出目录; (2) 动态新闻页 soak 必须按共有 URL 比较; (3) Chrome 137+ 品牌版忽略 --load-extension, 用 CDP Extensions.loadUnpacked + remote-debugging-pipe (fd3/4, \0 分隔); (4) 先量化像素数据再定阈值 (enwiki 徽标 opaqueRatio 0.707 推翻了透明假设)。
- 门禁全程保持四绿; 每轮证据 (前后截图+决策报告) 落 dev/shots (gitignored)。


## Session 10: v4.6.0 四分支并行集成: 本地优先判定/Alt+点击/悬停开关/暗色遮罩/子代理规则
<!-- trellis-session: v=2 fp=64e6b13f31b1a329 -->

**Date**: 2026-09-24
**Task**: v4.6.0 四分支并行集成: 本地优先判定/Alt+点击/悬停开关/暗色遮罩/子代理规则
**Branch**: `main`

### Summary

Session summary was not supplied.

### Main Changes

- universal-smart-invert.user.js, test.js, test-browser.js, dev/*, .trellis/spec/**, AGENTS.md, .trellis/agents/**

### Git Commits

| Hash | Message |
|------|---------|
| `9308ece` | feat(v4.6.0): local-first decisions + one-click Alt verdicts + dark-veil awareness (4 parallel branches integrated) |

### Testing

- [OK] node --check 0; node test.js 0; node test-browser.js 24/24 100%; build+pack 0

### Status

[OK] **Completed**

## Session 11: v4.6.1 收尾与启动时序修复 (弱网审计 / 测试等待缺陷 / 规则固化)

**Date**: 2026-09-24
**Branch**: `main`

### Summary

承接 v4.6.0 归档后的收尾：补齐 README 双语 v4.6 章节、回填父 PRD 验收勾选、清理归档残留；
按用户要求审计「是否全本地化 / 能否抢先识别」；定位并修复启动时序的真实性能缺陷；
把「编排自主权」写入规则四件套。

### Main Changes

- `universal-smart-invert.user.js` — `whenBodyReady` 由 50ms 轮询改为 MutationObserver 事件驱动 (4.6.1)
- `test.js` — 两处分片写入断言的等待时长 30ms/60ms → 300ms (修复稳定假失败)
- `README.md` / `README_EN.md` — 补 v4.6 章节 + v4.6.1 说明 + 徽章 4.6.1
- `.trellis/spec/guides/subagent-model-policy.md` — 新增第六节「编排自主权」
- `.trellis/spec/frontend/quality-guidelines.md` — 新增 v4.6.1 Notes
- `dev/` — 新增 3 个延迟分解/诊断探针

### 关键结论

**1. 审计：插件已完全本地化，判定与网络彻底解耦**
- 运行时代码**不读取任何网络状态量**（`navigator.onLine` / `connection.effectiveType` / `downlink` 全部未发现），
  不监听 online/offline 事件 → 反色行为不受网络好坏影响。
- 网络通道仅两类：① 规则包链接导入（纯手动按钮）；② 跨域像素采样的 blob 回退
  （同源图直接读像素不联网；仅跨域污染时取该图自身数据，失败即标记未决并保留原样）。
- 无遥测、无更新检查、无统计上报；规则/预设/种子全内置。

**2. 抢先识别：已实现且可量化**
- 三档本地证据（A 像素 / B 布局盒 / C 待判）+ 规则结论先于字节 + pending 唤醒。
- 弱网实测（300kbps/400ms）首屏 6/6 图全部落判；正常网 **152ms**、弱网 **569ms**。
- 关键发现：两者差值 417ms ≈ 探针注入的 400ms RTT —— **插件可归因延迟恒定约 65~77ms**，
  其余全是取回 HTML 文档本身的网络耗时（插件在拿到 DOM 前根本无法运行）。
- 即「500ms AC 未达标」的 60ms 缺口，绝大部分不是插件开销。

**3. 真实性能缺陷（v4.6.1 修复）**
- 扩展形态 `run_at: document_start` 时 body 尚未创建，原 `setInterval(…, 50)` 使 boot 回调
  平均晚 50ms 起跑（三次复现 50/52/53ms），而全部引擎构造仅 ~10ms。
- 改为 MutationObserver 事件驱动。**坑**：必须 `observe(document)` 而非
  `observe(document.documentElement)` —— document_start 时刻 documentElement 仍是 **null**，
  `observe(null)` 抛错被 catch 吞掉后**静默退回轮询**（首次修复正是这样失效）。
- A/B 实测：等待 body 51ms → **2ms**；首个决策 75/77/77ms → **44/46/49ms**（约 −40%）。

### 教训（已入 spec）

- **轮询打点在本项目不可信**：boot 同步块占满主线程时 `setInterval` 被推迟，
  曾得到「所有引擎同一时刻、且晚于首个决策」的非物理结果。主线程繁忙期只能用事件驱动打点。
- **插桩要精确锚点**：宽正则 `= new X(...)` 全局替换误匹配 66 处并破坏脚本；改用 9 行唯一赋值语句做锚点。
- **改测试前先定性**：复制 test.js 只改等待时长做对照实验，区分「产品缺陷」与「测试等待不足」。
- 本项目已有的 PowerShell 管道陷阱之外，新增：Git Bash heredoc 会吞反斜杠（Windows 路径），
  写脚本一律用 Write 工具而非 heredoc。

### 编排规则固化（用户 2026-09-24 明令）

「这些不用问，你编排，这个写入规则，除非有冲突」→ 已写入四件套：
`.trellis/spec/guides/subagent-model-policy.md` 第六节 + `AGENTS.md` + `.github/copilot-instructions.md`
+ `.trellis/spec/guides/index.md` 触发清单。要点：收尾类/可逆动作自行编排执行；
**冲突、不可逆、环境变更、方向性取舍、需扩大改动面**五种情形必须停下询问；
一次性做完再汇报，不逐条问。

### Testing

- [OK] 四绿门禁全绿：`node --check` 0 / `node test.js` 0 / `node test-browser.js` 24/24 100% / build+pack 0
- [OK] A/B 对照实验（`dev/probe-boot-breakdown.js`，各 3 次复现）
- [OK] 弱网/正常网/断网三态探针（`dev/probe-weaknet.js`）

### Status

[OK] **Completed**


## Session 12: v4.6.1 结案: 四绿复跑 + 提交推送 + 500ms AC 裁决 + 归档残留清理
<!-- trellis-session: v=2 fp=fc49378e94cc47df -->

**Date**: 2026-09-24
**Task**: v4.6.1 结案: 四绿复跑 + 提交推送 + 500ms AC 裁决 + 归档残留清理
**Branch**: `main`

### Summary

接手 2026-09-24 交接文档：复跑四绿门禁全绿后提交并推送 v4.6.1 全部改动；就弱网首屏 AC 阈值向用户取得裁决（保持 500ms、如实未达标）；清理已授权的未归档重复任务目录。

### Main Changes

- 复跑四绿门禁并全部通过；提交推送 v4.6.1（启动时序事件驱动修复 + 测试等待时长修复 + 文档规则）
- 父 PRD 弱网首屏 AC 裁决：阈值保持 500ms，勾选留空，如实记为已知未达标遗留项
- 清理 .trellis/tasks/09-19-v45-correctness-popup-rules/（与归档版逐字节相同的重复副本，经用户显式授权）
- 交接文档补结案记录；workspace index 补 Session 11 行与状态

### Git Commits

| Hash | Message |
|------|---------|
| `149bbc2` | perf(v4.6.1): event-driven body-ready (extension first-verdict −40%) + fix flaky chunked-store tests |
| `5346b3a` | docs(task): record 500ms AC ruling (keep threshold, unmet) + drop unarchived duplicate task dir |

### Testing

- [OK] node --check universal-smart-invert.user.js → 0
- [OK] node test.js → 0
- [OK] node test-browser.js → 24 场景 100%
- [OK] node scripts/build-extension.js && node scripts/pack.js → 0（重建产出与工作区逐字节一致）

### Status

[OK] **Completed**

### Next Steps

- 无活动任务；如需继续压榨弱网首屏剩余延迟，需另开新任务（方向性取舍，收益递减）


## Session 13: v5 页面媒体治理层结案: Action Registry + 5 子任务全部完成并归档
<!-- trellis-session: v=2 fp=d966a34a967bd8ab -->

**Date**: 2026-09-25
**Task**: v5 页面媒体治理层结案: Action Registry + 5 子任务全部完成并归档
**Branch**: `main`

### Summary

把插件扩为通用页面媒体治理层: 动作统一 / 复查撤销 / 数据闭环 / 提前判定 / 加载前遮罩。7 个提交本地未推送; 29 场景 100%; 父+5 子任务归档。

### Main Changes

- Action Registry 收口 + 4 个新动作 + 开关矩阵; 撤销栈与已处理列表; hits 分级与阈值校准; 视频帧序列两门与动图全帧谱; flashGuard 三档与元素 pending 遮罩

### Git Commits

| Hash | Message |
|------|---------|
| `a167856` | refactor(v5.0): Action Registry — 元素动作解析与写点仲裁收口 (零行为变化) |
| `f56a048` | refactor(v5.0): A13 — BgImageEngine 窄链并入 SOURCES (bgInvert 动作 + manualElement 来源) |
| `48c16e5` | feat(v5.0): v5-1 完成 — 四个新元素动作 (hide/mask/dim/peek) + 开关矩阵 + 规格文档 |
| `0604e5c` | feat(v5.0): v5-2 完成 — 复查与撤销 (Alt+Z / 本页已处理列表 / 一键固化 / 误反哨兵) |
| `518ceed` | feat(v5.0): v5-3 完成 — 数据闭环 (hits 分级 / 负反馈降级 / 阈值校准 / 形状先验 / 反哺 CI) |
| `d0c61fc` | feat(v5.0): v5-4 完成 — 提前判定 (视频帧序列两个门 + 动图全帧谱) |
| `db98f8f` | feat(v5.0): v5-5 完成 — 加载前保护三档 + 元素 pending 遮罩 (v5 全部子任务结案) |

### Testing

- [OK] node --check 0 / node test.js 0 (✓ 17→23) / node test-browser.js 29 场景 100% / check-panel-overflow PASS / build+pack 0

### Status

[OK] **Completed**

### Next Steps

- 7 个提交尚未推送; 发版按 release.yml 打 v5.0.0 tag


## Session 14: v6-1 完成: 自动区域分割内核 (掩码契约冻结) + 阶段 3~8 落地
<!-- trellis-session: v=2 fp=6e720c77d000e84d -->

**Date**: 2026-09-25
**Task**: v6-1 完成: 自动区域分割内核 (掩码契约冻结) + 阶段 3~8 落地
**Branch**: `main`

### Summary

把图片判定单位从整图下沉到连通区域: N×N 网格复用既有浅色谓词 + 形态学/面积门 + 双性能门 + 位图-矢量双表达 + LRU 缓存。两处用户裁决(先开后闭 / 双门阈值 0.97·0.03), 契约冻结进 spec。四绿, 29 场景零回归, 默认关闭。

### Git Commits

| Hash | Message |
|------|---------|
| `f12f769` | chore(rules): 编排策略改为「全部主代理执行」并移除子代理派发说明 |
| `41118f1` | chore(task): v6 批次规划落盘 — 父任务 + 4 个子任务 PRD + 两个技术路线 probe |
| `8bbc3bc` | feat(v6.0): v6-1 完成 — 自动区域分割内核 (掩码契约冻结 + 双门 + 形态学 + 精确矩形分解 + LRU 缓存) |
| `5ad3beb` | test(v3.0): 修掉 Store 配额降级用例的定时竞态 (固定 120ms 等待 → 有界轮询) |

### Status

[OK] **Completed**
