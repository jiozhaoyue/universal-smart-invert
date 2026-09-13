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
