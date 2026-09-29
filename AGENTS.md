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
  0.6 **region-segmentation kernel** (section 12.5: `RegionMask` frozen contract + two performance
  gates + morphology/connected-components/area gate + exact rectangle decomposition + LRU cache)
  and the 0.6.2 **region render layer** (section 20.5 `RegionRenderEngine`: backdrop-filter overlay +
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
node test-firefox.js                       # needs geckodriver (dev/tools/, gitignored) + Firefox; WebDriver
npx web-ext lint --source-dir=extension    # MUST report 0 errors (Mozilla official addons-linter)
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
**Working-tree line endings (a real time sink — normalize after every git action):** this repo's
blobs are CRLF while the machine runs `core.autocrlf=true`, so `git checkout` / `git apply` /
`git stash push|pop` all rewrite the worktree as CRLF. That makes `test.js`'s *source-scanning* regexes
(e.g. `/class UIController \{([\s\S]*?)
  \}
/`, which needs `}` immediately followed by `
`) and the
token-block **byte-equality** assertion fail with messages that look like product defects
(`R1b: 必须能定位 UIController 类体`, `R1: … 必须与用户脚本逐字节一致`). Recipe: normalize the text
files to LF, then **rebuild** `extension/`, then run the gates. `git diff` stays content-level either way.

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

`test.js` async budget — **"green" must mean "the assertions ran", not "the process exited first"**.
The file ends with `setTimeout(…, ASYNC_BUDGET_MS)` → `process.exit(0)` (resident shim timers block a
natural exit), so any async block can be dropped silently. Three gates keep that honest and none may be
"simplified" away: `ASYNC_POLL_MS < ASYNC_BUDGET_MS` (self-checked at exit), a `pollUntil` start/finish
ledger that exits 1 naming any poll that never completed, and **all** bounded polling going through
`pollUntil` (a hand-rolled `deadline = Date.now() + N` bypasses the self-check — three such deadlines used
to exceed the old 1500 ms budget and were dead code, silently skipping whole assertion blocks at a
measured 13–50 % rate). Same rule for test stubs: a `global.chrome` stub's lifetime must be **tied to the
block finishing**, never a fixed delay — chunked writes are a dozen serial 1 ms mock round-trips and
genuinely lose that race. See `.trellis/spec/frontend/quality-guidelines.md` §"v6.5 Additions" (a spec section title — not renamed by the version reset).

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
- **The extension ID is decided by the public key, not the private one** — so the public key is
  committed (`scripts/extension-key.json`, injected into `manifest.key` at build time) and only the
  private key stays local (`crx-private-key.pem`, gitignored + offline-backup). Any machine rebuilding
  the artifacts therefore gets the same ID: `laldjilafbegbdkjoaamjpcljjmanohe`. Both the build and the
  pack step refuse to proceed when the local private key does not match the committed public key
  (a mismatched pair signs a CRX whose ID contradicts its own manifest — and Chrome rejects it while
  the pack step still reports success). Rotating the key is destructive (installed users can no longer
  upgrade); the pinned value in `test.js` makes it a deliberate act, not an accident.
- **Firefox identity is a second source of truth in the same file** — `scripts/extension-key.json`
  also carries `geckoId` (`universal-smart-invert@dark-viewer`), injected as
  `browser_specific_settings.gecko.id`. Chromium ignores that block and Firefox ignores `manifest.key`,
  so one manifest serves both engines — **never** fork the artifact directory. A missing `geckoId` must
  `fail` the build: without it Firefox hands out a random temporary id and `storage.sync` goes unstable.
  `data_collection_permissions` has been mandatory for AMO submissions since 2025-11-03, and
  `strict_min_version` must be ≥ 140 (the field landed in Firefox 140 / Android 142). The extension
  display name comes from `@name:ext` (45-char Firefox cap) — **`@name` itself must not change**.
  Full contract: `.trellis/spec/frontend/cross-browser-extension-contract.md`.
- **Region masks have exactly one constructor and one validator** (`makeRegionMask` /
  `validateRegionMask`). 0.6.2 (rendering) and 0.6.3 (correction loop) **consume, never re-implement**
  segmentation or reshape the mask. The contract is FROZEN in
  `.trellis/spec/frontend/region-mask-contract.md` — any change goes back to planning first.
  `buildRegionMask` must stay a pure function; side effects (cache/counters/timing) live only in the
  `regionMaskTake` shell. With `regionSegment` off, no region code may run, cache, or write anything.
- **Design tokens have exactly one source** (the `v6.4-TOKENS-START/END` block in the userscript — a build-time marker name, not renamed by the version reset),
  injected into `popup.html` / `options.html` at build time. Never hand-write a colour in panel CSS
  or in either HTML artifact; the only allowed literal is the flash-guard `background:#000`.
  All UI controls are built by the single `SviControls` library — one implementation per control,
  verified by unit test. The v5-era `ui` alias is **gone** (R2a); a unit test keeps `ui.*` call
  sites at zero, so do not reintroduce it.
- **Icons come from one table and are inline SVG only.** Every glyph is an entry in
  `SviControls.ICONS` rendered as `<svg fill="currentColor">` — never an emoji character, and never a
  hand-written `<svg>` literal at a call site. The R3 unit test scans three path sets (userscript /
  `extension/` / `scripts/extension-src/`) against two code-point tiers: a **zero tier**
  (graphic-emoji blocks, misc symbols, Dingbats, regional indicators, `U+FE0F`, `U+20E3`) that must
  never appear anywhere, and a **typographic tier** (arrows, circled numerals, box-drawing) allowed in
  comments and copy but **not** inside the panel region. Code points in `extension/` only clear after
  `node scripts/build-extension.js` rebuilds it from source — a stale build reports already-fixed
  glyphs as still present.
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

## 子代理与派发（强制，用户 2026-09-28 明令重启）

完整规则见 `.trellis/spec/guides/subagent-model-policy.md`。要点：

1. **派发前必须问用户用哪个模型**，得到确认后才允许派发；禁止静默用主代理模型。
2. **模型名一律不视为全称**（用户写的、历史记的、文档里的都算近似名）：必须到**对应通道**
   的实际可用清单里取精确串，把候选+推荐呈给用户点选，**禁止**把近似名当正确名写进命令。
3. **本仓当前已确认配置**（用户 2026-09-28 点选）：**Claude 原生 Agent 工具** + **`model: sonnet`**
   + `run_in_background` 后台真并行。该确认不等于免询问——换通道/换模型仍须重新问。
4. **旧的「默认 `GLM-5.3 Flash`」已失效**：该 slug 不在代理 `/v1/models` 清单内
   （2026-09-28 实测仅 7 个模型）。文档里的模型名同样不可信——`.codex/agents/*.toml` 注释里的
   `gpt-5.6-terra` 就是错的（实际清单只有 `gpt-5.6-sol`）。
5. **禁止用 `Kimi K3` 做子代理**（用户 2026-09-21 起长期有效）。
6. 原生 Agent 的 `run_in_background` **即真并行**；只有**阻塞式** `runSubagent`
   （VS Code / Copilot）不得冒充并行。用户要求「并行做、主代理不等待」时用前者。
7. 每次派发 prompt 首行必须是 `Active task: <task.py current 的任务路径>`。
8. 派发 prompt 必须自包含（范围/问题/期望产出/是否允许写代码）。
9. **产出即弃**；跨阶段记忆由主代理维护。「互相检查」按链式交叉落实：A 产出 → B 审 → C 复核，
   不靠多个子代理共享上下文。只读研究子代理只许写任务 `research/` 目录。
10. 子代理上下文上限不可设（由模型窗口决定）；落实用户意图靠「一事一代理 + 通读不做片段抽样」。

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

