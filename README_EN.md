# Universal Smart Video & Image Invert

<p align="center">
  <img src="https://img.shields.io/badge/version-4.3.0-blue.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-green.svg?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Tampermonkey-Supported-orange.svg?style=flat-square" alt="Tampermonkey">
  <img src="https://img.shields.io/badge/ScriptCat-Supported-purple.svg?style=flat-square" alt="ScriptCat">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
</p>

An intelligent HTML5 userscript for video and web image color inversion, crafted for nighttime and long-session eye comfort.

Specifically designed to tame **blinding white PowerPoint/PDF lecture slides in tutorial videos**, and **harsh white and light-colored architecture diagrams, UML charts, and technical figures in articles**.

---

## ✨ Key Features

### 1. 🎯 Precision Scoping (No Pollution)
- **Zero global pollution**: Never applies destructive filters to `html` or `body`.
- **Danmaku, subtitles & controls safe**: Filters are directly and atomically applied to `<video>` and `<img>` elements. Player controls, progress bars, menus, danmaku (Canvas/DOM), and external subtitles remain 100% untouched.
- **Smart video probe**: Accurately detects and tracks the active video and mini-player (PiP), filtering out small hover previews and banner ads.

### 2. 🧠 Intelligent White-Slide Detection
- **Ultra-lightweight detection (<0.01ms)**: Downscaled sampling with integer bitwise math and early exit pruning (**~0.002ms per frame**, far faster than the 50ms imperceptible bar).
- **Dual-feature classification**: Evaluates high luminance ratio ($L > 210$) and low average saturation ($S \le 22\%$).
- **Anti-flicker hysteresis**: Dynamically calculated exit buffer to prevent stutter between slide transitions.

### 3. 🛠️ Out-of-the-Box Presets & Collapsible Advanced Tuning
- **Simple by Default**: Open the modal to immediately find clean, zero-configuration preset cards (Soft Gray / AMOLED Black) and image light-color chips.
- **🎨 Interactive Color Map & Picker**: Native color picker lets you pick any custom light color with live HEX extraction and tolerance matching.
- **⚙️ Collapsible Advanced Accordion**: Draggable range sliders and numeric input boxes (brightness, contrast, saturation, hue, tolerance, cutoff, area ratio, min size) are neatly organized inside an accordion drawer.

### 4. 🤝 Non-Conflicting Human-in-the-Loop State Machine
- **Never fights the user**: Memorizes rejected scene fingerprints upon manual toggle (`Alt + I` or capsule click).
- **Suppression lock**: Remains silent as long as the scene characteristics persist, re-engaging only upon a genuine scene transition.

### 5. 🖼️ Multi-Light-Color Image Detection (Smart Image Invert - v1.4.0 Major Upgrade)
- **Full Light-Color Spectrum**: Not just pure white (#FFF), but also paper light-gray (#F5F5F5), warm cream/sepia (#FAF0E6), and pale blue (#F0F8FF).
- **One-Click Preset Chips**: 4 interactive color chips to toggle specific light-color categories on the fly.
- **Ultra-Low Resource Footprint (8×8 Grid)**: Per-image classification takes just **~0.0007ms (0.7 microseconds)**.
- **Canvas Taint Isolation**: Fresh micro-canvas per analysis avoids canvas tainted lockouts.
- **Clean Filtering**: Eliminates accidental URL blacklist matching on `thumb` and `header` paths, allowing Wikimedia and Zhihu diagrams to invert reliably.
- **Alt + Left Click Force Toggle**: Press `Alt` and click any image or SVG to immediately force invert or restore.
- **Pure CSS Hover-to-Restore**: Hovering mouse over any inverted image instantly and smoothly restores its original colors using GPU hardware acceleration.

### 6. 💊 Minimalist Capsule & Global Shortcuts
- **Edge-snapped pill**: Small translucent trigger tucked at the screen edge; drag vertically to reposition.
- **Fullscreen auto-hide**: Hides automatically in fullscreen mode.
- **Shortcuts**:
  - `Alt + I`: Toggle video inversion (with manual override lock);
  - `Alt + A`: Toggle smart auto mode;
  - `Alt + Left Click`: Force toggle inversion on any specific image or SVG.

---

## 🆕 What's New in v2.0 (Site Engine)

### 1. 🌗 Background Replace Engine (Login-Box Safe)
- One-click dark mode for light sites like 163 NetEase: samples computed styles per element and maps light backgrounds to **hue-preserving dark equivalents** with mirrored light text — never a global filter.
- **Login blocks are never covered or recolored**: built-in login selectors (`login`/`signin`/`passport`...) plus per-site exclusion lists keep the login box untouched.
- The capsule panel gains a 4th button, **背景替换 (Background Replace)**, toggled per site; `img/video/svg/canvas/iframe` are never touched.

### 2. 🌐 Site Rules & Blacklist/Whitelist (New Modal Section)
- Per-site overrides: script enabled / image invert / video invert / background replace, all taking precedence over global defaults.
- Global site management: **All enabled / Blacklist / Whitelist** (Dark Reader style) with wildcard patterns such as `*.163.com`, one per line.
- Master switch for the built-in rule library; matched rules are visible in the modal (rule name + protect/force-invert/bg-image selector counts).

### 3. 🛡️ Original-Color Shield
- Maintain a list of original colors that are never transformed (color-picker add, chip remove): shielded colors are skipped by both **background replace and image inversion** — ideal for brand or warning colors.

### 4. 📚 Built-in Mainstream-Site Media Rule Library
- Covers Bilibili (incl. live), GitHub, 163 NetEase, Zhihu, Weibo, YouTube, Douyin, iQiyi, Youku, Tencent Video, Twitter/X, QQ, Taobao, JD, Stack Overflow, Juejin, CSDN and more.
- Each rule carries protect selectors (avatars/player controls), force-invert selectors (e.g. GitHub `.markdown-body` and camo images) and background-image selectors, plus a flag to disable video auto-detection on pure video sites.

### 5. 🧩 Smart Small-Element Shield (p0)
- Avatars/icons/badges (meta keywords, tiny rendered size, **same-src repeated ≥ 3 times**, nav/header chrome context) are never auto-inverted.
- Content contexts (`.markdown-body`, article/comment bodies) are exempt from misclassification — 300px white diagrams still invert.

### 6. 📑 Per-Tab Isolation
- Video invert and other runtime state live in memory only — **each tab is fully independent**, nothing is written to storage; a new tab or reload always starts with video invert off.
- Preferences moved to a fresh storage key (legacy v3 data migrates automatically; the old key is kept for rollback).

### 7. 📊 Local Stats & Developer Export
- Local counters (images analyzed/inverted, background images, CORS fallbacks, video auto activations, bg-replace pages) plus a capped 200-entry action log.
- **Stored locally only, never uploaded automatically**; copy JSON / download JSON / clear directly from the settings modal — attach the export when filing issues.

### 8. 🔧 Notable Fixes
- **GitHub star-history / camo images not inverted**: rebuilt decode chain — canvas sample → taint or blank sample → blob refetch → `createImageBitmap` (own try/catch) → temp `<img>` + objectURL fallback decode; cross-origin SVGs without intrinsic dimensions now invert reliably.
- **Bilibili comment thumbnails not inverted**: new background-image engine inverts light `background-image` thumbnails without opening them; hover restores original colors.

---

## 🆕 What's New in v3.0 (Partial Effects · Prediction · Self-Learning · Extension)

### 1. ✨ Partial-Effect Pipeline (More Than Inversion)
- **Partial image inversion (2D Canvas offscreen pipeline)**: `luma` inverts only bright, low-saturation pixels (white slide areas) while colorful photos stay untouched; `key` inverts only pixels within tolerance of a picked key color ("specified-color inversion"); `rect` inverts an arbitrary region drawn with `Alt+Shift+drag`; plus non-invert effects — `grayscale`, `sepia`, `brightness`, and a custom CSS filter;
- **Video effects (WebGL shader overlay)**: the same mode set runs on the GPU per presented frame (`requestVideoFrameCallback`); the overlay hugs the player box, is pointer-transparent, and suppresses the CSS filter while active (never double-processing); graceful CSS-filter fallback when WebGL is unavailable;
- **Picture-in-Picture output 📺**: the processed canvas stream feeds a **PiP window** via `canvas.captureStream()` — dark lecture videos while you code;
- Delivery uses `content: url(blob)` swapping (no `src` mutation, lazy-loaders unaffected), hover-to-restore, per-image `Alt+click` kill switch, and an LRU cache keyed by `src+mode+params` with proactive blob revocation.

### 2. 🔮 Predictive Video Inversion & Timeline Memory (Never Late)
- **rVFC per-frame sampling** replaces the 250 ms poll: detection-to-filter latency drops from up to 250 ms to **~1-2 compositor frames**;
- **TimelineLearner**: while inversion is active, `[start, end]` segments are recorded per video fingerprint (merged, persisted) and **pre-armed on replay** — "reference" mode auto-arms inside learned segments with manual control always winning; "takeover" mode lets the timeline directly drive inversion. The inversion schedule is literally decided in advance.

### 3. 🧬 Self-Learning Element Rules (No Hand-Written Rules)
- Every `Alt+click` correction aggregates by selector stem; reaching N hits (default 2, tunable 2–6) creates a per-site learned rule (force-invert / protect);
- Learned rules **outrank the builtin seed rules**; the builtin table is demoted to a seed/fallback layer;
- The 🧠智能 (Smart) modal section lists learned rules per site (stem / action / hits) with one-click delete.

### 4. 💾 Browser Storage & Sync-Ready Manager
- All persistent state lives under the **`svi:` namespace** behind a unified `Store` abstraction with the backend chain: **`chrome.storage.sync` (extension, cloud-synced) → GM storage (cloud-synced via Tampermonkey’s sync setting) → localStorage**;
- Async backend + in-memory mirror: zero-cost reads, debounced (400 ms) batched writes; automatic 8 KB chunking for `chrome.storage.sync` quotas; v2.0 keys migrate losslessly (legacy keys kept for rollback);
- 💾存储 (Storage) modal section: backend badge, per-key size/preview/delete, JSON export / import / one-click clear.

### 5. 🧩 Full Media Coverage & file:// Support
- Newly covered: `<canvas>` (light-chart detection), **video posters**, images inside **Shadow DOM** (idempotent `attachShadow` patch + bounded collection), inline SVG `<image>`, and `input[type=image]`;
- `@match file:///*`: local HTML pages boot and invert normally; when the browser blocks local image decode the script degrades gracefully with a one-time hint — never a crash.

### 6. 🧰 Browser Extension Build & CI / Auto-Publish
- `universal-smart-invert.user.js` remains the single source of truth; the extension is derived by **zero-dependency Node scripts**: `scripts/build-extension.js` (MV3 `manifest.json` with name/version/description synced from the header, chrome.storage adapter, GM shims), `scripts/gen-icons.js` (hand-rolled PNG encoder), `scripts/pack.js` (from-scratch ZIP packer);
- **Coexistence handshake**: the userscript and the extension may both be installed — the first booter claims the page (5 s heartbeat) and the other boots dormant, so filters are never applied twice;
- **GitHub Actions**: `ci.yml` (unit tests + build smoke + an isolated headless-Chrome bench job) and `release.yml` (push a `v*` tag → tests → build → zip/CRX → GitHub Release → Chrome Web Store upload & publish, skipping cleanly when secrets are absent);
- See [PUBLISHING.md](./PUBLISHING.md) "浏览器插件发布 (Extension)" for the full setup guide.

---

## 🆕 What's New in v3.3 (Settings Panel Overhaul)

### 🪟 Three Panel Layouts (no more forced fullscreen overlay)
- Layout switcher in the settings header: **centered window / dock left / dock right**, remembered across sessions;
- Docked mode is a full-height side drawer: **no fullscreen mask**, the rest of the page stays visible and interactive; click outside or press `Esc` to close;
- Drawer width is draggable between 320–600px and remembered; the centered window widens to 600px and adapts to the viewport.

### 📐 Reordered Information Architecture + Layout Robustness
- Sections reordered by frequency of use: **Appearance → Image Invert → Video → Sites & Rules → Color Protection → Page Media → Data & Backup → Tips**;
- The old "Advanced" accordion is dissolved — every slider now lives in its matching section;
- Rows stack vertically (title + description above, control below): **no horizontal scrolling and no clipped controls at any window width**.

### 🀄 Fully Localized (Chinese) Wording
- Every dropdown option is a short Chinese name (no more parenthetical explanations); a dynamic description line below the select explains the current choice;
- Code/English terms in the UI (filter paths, hex values, storage backends, data keys) are reworded in Chinese (hex values moved to tooltips).

### 📁 Rule File Import / Export
- New "Export rule file": site lists, per-site overrides, element rules, learned rules and shielded colors saved as a JSON file;
- New "Import (merge) / Import (replace)": migrate rules across pages and devices with automatic dedup; learned rules keep the higher hit count;
- Coexists with the existing full backup: rule files carry rules, full backups carry everything.

### 🧩 Element-Level Rules (beyond site black/white lists)
- New "Element rules": target any element by **scope (this site / all sites) + selector + action (force invert / keep original)**;
- Decision priority rises to the top tier: **manual Alt+click > element rule > decision snapshot > learned rule > seed rule > detection gates > pixel analysis**;
- Honored by both the image and background-image engines, applied immediately on change; capped at 200 rules with oldest-first eviction.

---

## 🆕 What's New in v3.2 (Video Picture Tuning)

### 🎚️ Video Tune (independent of inversion)
- New modal section "🎚️ 视频画面调节 (Video Tune)": **brightness / contrast / saturation / warmth / grayscale** sliders applied to ALL videos — works with inversion OFF;
- **Composes with inversion**: when a video inverts, its inline filter = inversion chain + tune chain; when inversion exits, the tune keeps applying via a stylesheet rule; the WebGL overlay path synthesizes the same tune in-shader (no double processing anywhere);
- **One-click presets**: 护眼 Eye-Comfort (dim + warm) / 夜间 Night / 鲜艳 Vivid / 还原 Reset — instant apply, persisted across reloads.

---

## 🆕 What's New in v3.1 (Feedback Hardening · Media Inspector · Smart Policy)

### 1. 🖼️ Current-Page Media Inspector (reach overlay-hidden media)
- New modal section "🖼️ 当前页媒体 (Current-Page Media)": one click collects every media element on the page (images / canvas / video / SVG / input images / background-image elements / Shadow-DOM media; collection budget 400, list cap 200 + load-more);
- Each row shows **type · rendered size · source (truncated) · state** (inverted / original / skipped:reason) — see at a glance which media were blocked by "tiny / repeated-small / policy" rules;
- Per-row **反色/复原 (invert/restore)** toggle (same override path as Alt+click, remembered per site) and **定位 (locate)** which scrolls the element into view with a 1.2 s outline flash — built for media nested under overlays that are visible but impossible to click.

### 2. 🎛️ Smart Image Policy (deciding *when* to invert)
- New `imagePolicy` preference with three modes (✨效果 section), default **balanced**:
  - **Balanced**: content context (`.markdown-body`, articles, comment bodies) **or** (rendered size ≥ 96 px **and** not grid-repeated **and** not chrome context);
  - **Conservative**: content context or ≥ 200 px images only;
  - **Aggressive**: v3.0 behavior (size gates only).
- **Grid-repetition heuristic**: ≥ 4 same-size, same-tag images under one parent → cover/thumbnail grid → skipped. Bilibili-style light cover walls stay original **with zero hand-written rules**, while lone white diagrams in articles still invert;
- **Chrome-context detection**: images inside `nav/header/aside/footer`, card/cover class hints (`card`/`cover`), or single-image anchors (`a>img`) are no longer auto-inverted;
- Precedence unchanged: **manual Alt+click > learned rules > seed force/protect > policy gate > pixel analysis** — seed force-invert (e.g. GitHub markdown/camo) and protect selectors fully bypass the policy gate.

### 3. 🔁 GitHub / Long-Page First-Paint Inversion + Unified Decision Pipeline
- **Eager initial pass**: images already loaded at boot are decided immediately (budget, default 80, tunable) instead of waiting for viewport intersection — opening a GitHub README **inverts everything on first paint, no scrolling**; three deferred re-sweeps (2.5 s / 6 s / 12 s) catch late finishes;
- **Unified decide-once pipeline**: every entry path (intersection / dynamic insert / eager / manual rescan) funnels into one decision function with strict precedence; each src's final decision is computed exactly once and cached (per-src decision snapshot) — **identical inputs never flip between "not inverted on load" and "inverted after scrolling"**; re-evaluation happens only via an explicit rescan (settings change / manual trigger);
- **Decide-then-mark**: `data-svi-checked-src` is written only after a decision; failed analyses stay silent for a 60 s TTL, retry at most 3 times, then skip permanently with a recorded reason; newly added media whose src already has a decision get it **applied synchronously** (the foundation of instant viewer-overlay inversion).

### 4. 🌗 Hover-to-Restore Switch
- New "悬停显示原图" toggle in the 🌙基础 section (default on = v3.0 behavior): turn it off and hovering an inverted image **keeps the inverted view** — both the CSS-filter path and the fx `content:url` path — for those who dislike the original flashing through on hover.

### 5. 🔍 Image-Viewer / Zoom Extension Compatibility (FuTuXiu-like)
- `Alt+click` now resolves its target via `event.composedPath()`: media inside **Shadow DOM (including closed roots)** can be toggled;
- Dynamically inserted media with an already-decided src get the cached decision **applied synchronously** during the mutation flush — images already seen by the page appear inverted inside zoom overlays instantly;
- The background-image engine covers overlay elements appended at the end of `<body>` (inline-style `background-image`).

### 6. 🩺 Troubleshooting: "GitHub doesn't seem to work"
If the script appears inactive on GitHub READMEs:
1. **Check the version**: open the Tampermonkey dashboard and confirm the script version is **3.1.0** or newer (older builds had the first-paint gap and the badge decision flip);
2. **Silent update failures**: updates are fetched from `raw.githubusercontent.com` — if that host is unreachable (or an older install pointed at a private/renamed repository and the raw URL 404s), Tampermonkey **silently keeps the old version**. Trigger "Check for userscript updates" manually, or re-click the install link above to reinstall over the top;
3. **Check the script is enabled**: Tampermonkey badge active; site not disabled by blacklist/whitelist or the per-site toggle;
4. **Self-diagnose**: settings modal → "🖼️ 当前页媒体" → collect — each image shows exactly why it was skipped, and you can invert manually right there.

---

## 🚀 Installation

Install directly via any userscript manager (Tampermonkey, Violentmonkey, or ScriptCat) by clicking the GitHub Raw link below:

👉 **[Click to Install Latest Script (GitHub Raw)](https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js)**

Or copy the link into your userscript manager's "Install from URL" input:
```
https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
```

**Option B — Browser extension (v3.0, Load Unpacked)**: build locally with `node scripts/gen-icons.js && node scripts/build-extension.js && node scripts/pack.js` (zero npm dependencies), then load the `extension/` directory via `chrome://extensions` → Developer mode → "Load unpacked". Installing it alongside the userscript is safe: the dormant handshake keeps exactly one active instance per page (see [PUBLISHING.md](./PUBLISHING.md)).

---

## 🔄 Automatic Browser Updates

### 1. Online Production: Background Auto-Check & Update
- **Auto check**: The script includes standard `@updateURL` and `@downloadURL` headers.
- **Scheduled upgrades**: Tampermonkey automatically checks for new GitHub versions according to your configured interval (e.g. daily) and updates seamlessly in the background.
- **Instant manual check**: Click the Tampermonkey icon -> "Check for userscript updates" anytime to update immediately.

### 2. Local Development: Zero-Latency Hot Reload
To iterate on the code locally and see updates immediately:
1. Open `chrome://extensions`, find Tampermonkey/ScriptCat -> "Details" -> toggle **"Allow access to file URLs"** ON.
2. Install the local loader [`dev-loader.user.js`](./dev-loader.user.js) in your userscript manager.
3. Edit `universal-smart-invert.user.js` in your IDE, save, and press `F5` in your browser to test live changes instantly!

---

## ⌨️ Shortcuts & Controls

| Shortcut / Action | Description |
| :--- | :--- |
| `Alt + I` | Toggle video invert (with manual override lock) |
| `Alt + A` | Toggle smart auto-detection mode |
| `Alt + Left Click` | Force toggle inversion on any image or SVG (remembered per site since v2.0) |
| Click Edge Pill | Expand/collapse floating mini control card |
| Drag Edge Pill | Drag vertically along screen edge |
| Hover on Inverted Image | Temporarily displays original image colors (can be disabled via the "悬停显示原图" toggle since v3.1) |

---

## 📄 License

Licensed under the [AGPL-3.0-or-later](./LICENSE).
