<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

<!-- TRELLIS:END -->

# Project: Universal Smart Invert (全网通用智能视频与图片反色)

## Purpose & layout

Single-file Tampermonkey userscript (`universal-smart-invert.user.js`, the CANONICAL source,
~8300 lines, no build step) that smartly inverts videos/images/backgrounds on any site, plus a
Chrome extension DERIVED from it. Key paths:

- `universal-smart-invert.user.js` — all engines (video HIL state machine, image/bg-image/canvas
  decision pipeline, background replace, WebGL video FX, Store, RuleLearner, TimelineLearner, UI,
  and the v5.0 **Action Registry** = ordered `SOURCES` table + `resolveStage` + `arbitrate` +
  `ACTIONS` executors, with the switch matrix read only through `actionEnabled(id)`), plus the
  v6.0 **region-segmentation kernel** (section 12.5: `RegionMask` frozen contract + two performance
  gates + morphology/connected-components/area gate + exact rectangle decomposition + LRU cache)
  and the v6.2 **region render layer** (section 20.5 `RegionRenderEngine`: backdrop-filter overlay +
  bitmap/vector mask + `object-fit` geometry mapping + backdrop-root degradation + fullscreen/PiP
  suspend + video/GIF recalculation; off by default)
- `extension/` — GENERATED output (content.js + manifest.json + icons). **Never hand-edit**;
  rebuild after every header change with `node scripts/build-extension.js`
- `scripts/` — zero-dependency build chain (build-extension, gen-icons, pack, zip lib) and live
  CDP probes (`probe-github.js`, proxy-aware via `HTTPS_PROXY`, target URL as argv)
- `dev/` — local real-time testing assets (dev loader userscript; server is off-the-shelf)
- `test.js` (Node unit tests, loads the real userscript via a DOM/localStorage shim and asserts
  `window.__svi` exports) · `test-browser.js` (CDP headless-Chrome end-to-end bench, **script-injected
  form**) · `test-extension.js` (CDP end-to-end **real-extension form**: loads the built `extension/`
  via `Extensions.loadUnpacked` and asserts the isolated world)
- `dist/` — packed extension zip (gitignored). `.trellis/tasks/archive/` — per-version PRDs/design docs

## Commands (all green required before commit)

```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js                       # needs Chrome; CDP port 9222
node test-extension.js                     # needs Chrome; CDP port 9333 + http 8791
node scripts/build-extension.js && node scripts/pack.js
```

Real-extension-form gotchas: Chrome / Edge **137+ ignore `--load-extension`**, so the only working
channel is CDP `Extensions.loadUnpacked` (needs `--enable-unsafe-extension-debugging` +
`--remote-debugging-pipe`). `test-extension.js` therefore self-verifies the load in the content
script's world (`chrome.runtime.id` + `getManifest().version`) — never weaken that back to a bare
"the page rendered" check. Set `SVI_EXT_DIR=<dir>` to run it against a tampered copy (that is the
negative control proving the assertions bite); `SVI_CHROME_PATH` is then the **only** candidate, which
is what makes the "no browser → 未验证" downgrade path reachable.

Harness traps that cost real debugging time in that suite — do not "simplify" them away:
`Page.addScriptToEvaluateOnNewDocument` used for a first-paint probe must run in its own
`worldName`, not the page's main world (in the main world the content script's isolated world
becomes unfindable); the launch needs the three `--disable-*-throttling/backgrounding` flags or rAF
drops to ~1 frame per 500ms when the window is occluded; a local fixture boots in ~125ms so a frame
counter must be allowed to accumulate before it is read; and cross-tab "hot restore" checks need
`Page.bringToFront` on the page under test, since rAF/idle stall in a hidden tab (that alone looked
exactly like a product defect).

Bench gotchas: uses a FIXED profile dir `.chrome-test-profile/` (gitignored) that the runner
wipes at start; needs `--enable-unsafe-swiftshader` for WebGL scenarios; scenarios 2b/18 rely on
in-run persistence, so never add global storage cleanup mid-run.

Injection-form coverage: every page template **inlines** the userscript into HTML and defines **no**
`GM_*` shims — so `document.head` always exists and `GM_addStyle` never does. That blind spot hid a
real defect (silently dropped stylesheet). Scenarios 32 (GM-shim form) and 33 (`Page.addScriptToEvaluateOnNewDocument`,
i.e. before `<html>` exists) exist to cover both forms; do not "simplify" them back to inline injection.
See `.trellis/spec/frontend/style-mount-contract.md`.

## 本地实时调试（全部现成开源做法，无自研服务器）

Three complementary paths; pick per need. Never hand-roll a server again (a custom one was
removed after it bound loopback-only and was unreachable via LAN/proxied browsers).

1. **file:// 热跟踪（零服务器）** — Violentmonkey's built-in "track local file": install the
   userscript from `file:///...` (grant the manager "允许访问文件网址"), **keep the installer tab
   open**, save in the editor → VM auto-reinstalls; refresh pages to run the new code.
2. **HTTP 网关（回环 + 局域网）** — off-the-shelf `http-server` (MIT), binds all interfaces and
   prints every reachable URL:
   `npx --yes http-server . -p 8124 -c-1 --cors`
   `-c-1` (no cache) is mandatory so managers/GM fetches always see fresh source. Install from
   the printed `http://<LAN-IP>:8124/universal-smart-invert.user.js`. Do NOT use the hostname
   `localhost` (may resolve to ::1 while the server is IPv4).
3. **开发加载器（任意管理器 / 严格 CSP 站点 / 脚本猫）** — `dev/svi-dev-loader.user.js`:
   install once; on every page load it walks a `GATEWAYS` list (loopback → LAN IP → optional
   `file:///` entry) and evals the fresh source through `GM_xmlhttpRequest` (bypasses page CSP —
   never switch to `<script src>` injection). Edit the LAN IP + matching `@connect` line to your
   own. Disable the production-installed 反色 script while debugging (sviOwner handshake makes
   the later booter dormant).

## Hard rules (violating these has caused real bugs — see .trellis/spec/frontend/quality-guidelines.md)

- **Runtime state (video-invert flag etc.) is per-tab in memory and NEVER persisted.** Only
  `svi:*` keys via `Store` (chrome.storage.sync → GM → localStorage, byte-safe chunking, quota
  degrade). Legacy `universal_smart_invert_v4`/`_stats_v1` keys migrate once, never deleted.
- **Image decisions are decide-once** (`decideImage`: manual override > snapshot > learned rule >
  seed rule > policy > pixels). A stored manual override must force-refresh the decision
  snapshot; identical inputs must never flip between passes.
- No blanket filters on `html`/`body`; filters attach per-element (`data-svi-*`) or via
  per-color-bucket tags. Never mutate `img.src` (use `content: url(blob)` for transforms).
- No `innerHTML` with dynamic data (DOM APIs only); no automatic network telemetry (stats export
  is manual only); observers debounced + idle-budgeted + paused when `document.hidden`.
- UI strings Chinese, identifiers ASCII, numbered `// ===== N. =====` section banners; modal/panel
  UI built exclusively with the `ui.*` component builders.
- Userscript and extension coexist via the `dataset.sviOwner` handshake — first booter claims the
  page, the other goes dormant. Bump `@version` and run `build-extension.js` in the same change.
- **Region masks have exactly one constructor and one validator** (`makeRegionMask` /
  `validateRegionMask`). v6-2 (rendering) and v6-3 (correction loop) **consume, never re-implement**
  segmentation or reshape the mask. The contract is FROZEN in
  `.trellis/spec/frontend/region-mask-contract.md` — any change goes back to planning first.
  `buildRegionMask` must stay a pure function; side effects (cache/counters/timing) live only in the
  `regionMaskTake` shell. With `regionSegment` off, no region code may run, cache, or write anything.
- **Design tokens have exactly one source** (the `v6.4-TOKENS-START/END` block in the userscript),
  injected into `popup.html` / `options.html` at build time. Never hand-write a colour in panel CSS
  or in either HTML artifact; the only allowed literal is the flash-guard `background:#000`.
  All UI controls are built by the single `SviControls` library (`ui` is a zero-DOM delegation
  shim) — one implementation per control, verified by unit test.
- **Style nodes have exactly one mount point** (`mountStyleNode`) and root-dependent startup has
  exactly one deferral point (`whenRootReady`). Mount immediately when `document.head` /
  `documentElement` exists, otherwise **queue and attach the moment a root appears** (three
  channels: MutationObserver on `document` + `readystatechange` + bounded polling). Never write a
  bare `(document.head || document.documentElement).appendChild(...)`: the extension runs at
  `document_start`, where a content script / `addScriptToEvaluateOnNewDocument` can execute before
  `<html>` exists, both are `null`, and the whole 45 KB stylesheet was **silently dropped** —
  attributes written, filter never applied, i.e. the user-visible "images don't invert".
  Failing to mount must `console.warn`, never stay silent. Bench scenarios 32 (GM-shim form) and 33
  (root not yet created) exist to keep both forms honest; `test-browser.js` inlines the script into
  HTML, which is exactly why this class of bug hid from the other 31 scenarios.
- **Region correction is a DATA channel, not a drawing tool.** The only gesture is a single
  `click` on a visualized region (a click flips that connected component's verdict). Never add
  polygon/lasso/brush interaction. Corrections persist as a **flip set** keyed by
  `host + selectorStem + intrinsic size` and can only calibrate the segmentation's
  `regionMinAreaRatio` (never the whole-image thresholds, which belong to v5-3).
- **Rendering a region mask has three non-obvious rules** (spec §6; each one was found only in a real
  browser): CSS `mask-image` clips by **alpha**, not luminance (write `alpha=0` for "keep" cells);
  a `<clipPath>` unions its children (emit ONE `<path>` with `clip-rule:evenodd`, kept outside the
  clipped element); geometry maps content-box → element-box before applying `object-fit`/
  `object-position`, with letterbox margins masked out. Never mount on the media element's own
  pseudo-element, and never reuse a site wrapper's `::after`.
- **Committing without pushing is incomplete (不得只提交).** After every work commit, push to
  `origin main` (`git push`) before the session ends — all five gate commands green first.
- GitHub Actions: the `secrets` context is NOT allowed in `if:` — use a `$GITHUB_ENV` gate step.

## Before editing engines

Read `.trellis/spec/frontend/quality-guidelines.md` (filled with battle-tested conventions) and
the archived task design docs under `.trellis/tasks/archive/<month>/` for the area you touch.
For live-site debugging use `node scripts/probe-github.js <url>` (injects the current script into
any page via CDP and dumps engine state).

## 子代理与派发（强制，用户 2026-09-23 明令）

完整规则见 `.trellis/spec/guides/subagent-model-policy.md`。要点：

1. **派发前必须问用户用哪个模型**，得到确认后才允许派发；禁止静默用主代理模型。
2. **模型名一律不视为全称**（用户写的、历史记的、文档里的都算近似名）：必须到平台实际可用
   清单里找**最匹配候选**，把候选+推荐呈给用户点选，**禁止**把近似名当正确名写进命令。
3. 本项目**已确认默认模型**：`GLM-5.3 Flash`。该默认值不等于免询问。
4. 子代理选**能力最低且最匹配**的档位（读多写少的检索/提炼/核验）；旗舰模型留给主脑。
5. **禁止用 `Kimi K3` 做子代理**（用户 2026-09-21 起长期有效）。
6. 用户要求「并行做、主代理不等待」时，必须用 `trellis channel spawn --model "<已确认模型>"`
   后台 worker；阻塞式子代理（如 VS Code `runSubagent`）**不得**冒充并行。
7. 每次派发 prompt 首行必须是 `Active task: <task.py current 的任务路径>`。
8. 派发 prompt 必须自包含（范围/问题/期望产出/是否允许写代码）。

> 本小节写在 `TRELLIS:START/END` 标记块**之外**，因此不会被 Trellis 重新生成覆盖。

## 编排自主权（强制，用户 2026-09-24 明令）

完整规则见 `.trellis/spec/guides/subagent-model-policy.md` 第六节。要点：

1. **收尾类 / 低风险 / 可逆动作自行编排并直接执行**，不为逐条征询而打断用户。包括：
   补文档与版本号同步、回填任务验收勾选、清理已归档副本与已注销 worktree 残留、
   归档与 spec 沉淀、五绿门禁重跑、按已确认方案继续实现。
2. 判定口径：**做错也只是返工、不造成不可逆损失** → 自主执行。
3. **必须停下询问的例外**：① 冲突（验收标准与实测不符 / 结论矛盾 / 规则打架）；
   ② 不可逆（删改已有文件、丢弃未提交改动、重写历史）；③ 环境变更（装包、改全局配置）；
   ④ 方向性取舍（架构二选一、重构 vs 重写、技术选型）；⑤ 需扩大改动面才能修。
4. **一次性编排完并汇报**（做了什么 / 证据 / 遗留什么），不要每做一件就问一次。
5. 本节**不豁免**全局 §6 PARDON 治理铁律：删除/覆盖文件、安装包仍须显式确认。

> 本小节同样写在 `TRELLIS:START/END` 标记块**之外**，不会被重新生成覆盖。

