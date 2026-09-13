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
  decision pipeline, background replace, WebGL video FX, Store, RuleLearner, TimelineLearner, UI)
- `extension/` — GENERATED output (content.js + manifest.json + icons). **Never hand-edit**;
  rebuild after every header change with `node scripts/build-extension.js`
- `scripts/` — zero-dependency build chain (build-extension, gen-icons, pack, zip lib) and live
  CDP probes (`probe-github.js`, proxy-aware via `HTTPS_PROXY`, target URL as argv)
- `dev/` — local real-time testing assets (dev loader userscript; server is off-the-shelf)
- `test.js` (Node unit tests, loads the real userscript via a DOM/localStorage shim and asserts
  `window.__svi` exports) · `test-browser.js` (CDP headless-Chrome end-to-end bench)
- `dist/` — packed extension zip (gitignored). `.trellis/tasks/archive/` — per-version PRDs/design docs

## Commands (all green required before commit)

```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js                       # needs Chrome; CDP port 9222
node scripts/build-extension.js && node scripts/pack.js
```

Bench gotchas: uses a FIXED profile dir `.chrome-test-profile/` (gitignored) that the runner
wipes at start; needs `--enable-unsafe-swiftshader` for WebGL scenarios; scenarios 2b/18 rely on
in-run persistence, so never add global storage cleanup mid-run.

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
- **Committing without pushing is incomplete (不得只提交).** After every work commit, push to
  `origin main` (`git push`) before the session ends — all four gate commands green first.
- GitHub Actions: the `secrets` context is NOT allowed in `if:` — use a `$GITHUB_ENV` gate step.

## Before editing engines

Read `.trellis/spec/frontend/quality-guidelines.md` (filled with battle-tested conventions) and
the archived task design docs under `.trellis/tasks/archive/<month>/` for the area you touch.
For live-site debugging use `node scripts/probe-github.js <url>` (injects the current script into
any page via CDP and dumps engine state).

