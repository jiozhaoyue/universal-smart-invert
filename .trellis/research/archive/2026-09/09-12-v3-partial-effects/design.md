# Design: v3.0

Base: `universal-smart-invert.user.js` v2.0.0 (4208 lines, sections 1–14). All changes keep the
single-file userscript canonical; extension content is DERIVED from it (R9). Preserve every v2.0
behavior. Chinese UI strings, ASCII identifiers, numbered `// ===== N. =====` banners — renumber
as needed but keep the style. Version → 3.0.0.

## 1. Store (R6) — browser storage with cloud sync + management

- `Store` replaces direct `localStorage` pref access. Backend chain resolved once at boot:
  1. `chrome.storage.{sync,local}` when `typeof chrome !== 'undefined' && chrome.storage` (extension)
  2. `GM_getValue/GM_setValue` when available (userscript; TM may cloud-sync these)
  3. `localStorage` (always available fallback)
- API (async backend, sync mirror): `Store.init()` (async: load full namespace into memory map,
  then everything reads sync), `Store.get(key, def)`, `Store.set(key, val)` (mirror sync +
  debounced 400ms flush), `Store.remove(key)`, `Store.keys()`, `Store.exportAll()` (JSON),
  `Store.importAll(json)`, `Store.clearNamespace()`, `Store.backend` (string badge),
  `Store.describe()` → [{key, bytes, preview}] for the manager UI.
- Namespace: keys prefixed `svi:`. `svi:prefs`, `svi:stats`, `svi:learned`, `svi:timeline`,
  `svi:overrides` (manualOverrides moves out of prefs into its own key, capped 400).
- Migration: on init, if `svi:prefs` absent, read legacy `universal_smart_invert_v4` +
  `universal_smart_invert_stats_v1` (+ old `manualOverrides` field), write into namespace,
  keep legacy keys untouched (rollback).
- chrome.storage.sync has 8KB/item quota → split large values across `svi:prefs#0..n` chunks
  (JSON slice, 7000 chars/chunk) with a `svi:prefs.meta` manifest; local backends skip chunking.
  All chunk logic inside Store; callers see one logical key.
- Export on `pagehide`/`visibilitychange hidden` (flush pending).

## 2. Effect pipeline (R1/R2)

### 2a. Shared transform math (pure, exported on window.__svi for tests)
- `transformPixel(r,g,b, mode, params) → [r,g,b] | null` (null = keep original):
  - mode `invert-full`: always (255-r,255-g,255-b) (canvas pipeline only; CSS path unchanged)
  - mode `luma`: if `luma(r,g,b) >= params.lumCutoff && sat <= params.satCutoff` → invert else null
  - mode `key`: if colorDist2(r,g,b, params.keyRgb) <= params.tol2 → invert else null
  - mode `rect`: coords handled by loop bounds, pixel fn = invert-full inside rect
  - effects `grayscale`/`sepia`/`brightness`: matrix math; "custom" reuses brightness/contrast/
    saturate numbers from prefs
- `mergeSegments(segs, gapMs)`, `lookupSegment(segs, t)`, `selectorStem(el)`,
  `mediaDominantViewport(video)` — all pure, tested.

### 2b. ImageFxEngine (new class; integrates with ImageInvertEngine)
- Trigger: after the `data-svi-inverted` decision, if effective `imgFxMode` ≠ 'full' for this
  image (global pref `imgFxMode: 'full'|'luma'|'key'|'rect'`, `imgFxParams {lumCutoff:190,
  satCutoff:0.30, keyColor:'#ffffff', keyTol:60}`; per-host override via siteOverrides.imgFxMode).
- Pipeline: decode at natural size via the v2.0 decode chain (capped 4096px; larger → fall back
  to full filter) → ImageData loop with transformPixel → `canvas.toBlob` → objectURL.
- Delivery: injected style rule `img[data-svi-fx="<id>"] { content: url(<blob>) !important; }`
  (id = per-src+params hash); `data-svi-inverted` stays OFF for content-swapped images;
  hover-restore via `:hover { content: unset }` (verify in bench; fallback: class toggle on
  mouseenter/mouseleave). Alt+click toggles `data-svi-fx-off` (kill switch per image).
- Queue: ≤2 transforms in flight, FIFO; cache by `src|mode|params` (LRU 200, blob URLs revoked
  on evict + pagehide sweep); rect mode stores relative rects per src via overrides.
- Alt+Shift+drag (rect mode): document-level capture only over imgs, minimal selection div,
  relative rect persisted through `addManualOverride(host|src, {rect})`.

### 2c. VideoFxEngine (WebGL overlay; new class beside VideoProbeManager)
- Per-active-video overlay `<canvas class="svi-fx-overlay">`: absolute inset 0 over the video,
  pointer-events none, border-radius inherited, z-index above video within the video's positioned
  ancestor; only when the video already has a positioned/transformed ancestor or is itself
  positioned — otherwise skip overlay and keep CSS-filter fallback (never mutate site layout).
- Loop: `video.requestVideoFrameCallback` (fallback rAF) → `gl.texImage2D(video)` → shader →
  re-register. Fragment uniforms: `u_mode` (0 full-invert+hue / 1 luma / 2 key / 3 grayscale /
  4 sepia), `u_lumCutoff`, `u_satCutoff`, `u_key`, `u_tol`, `u_rect` (vec4, -1 = disabled).
  Internal size = min(video, 1920x1080). Pause when video paused or document.hidden. One shared
  ResizeObserver for all overlays.
- Activation: pref `videoFxMode: 'off'|'full'|'luma'|'key'` (default 'off' — CSS filter remains
  default). While a video's overlay is active, suppress the CSS filter on it (state machine
  routes through VideoFxEngine). WebGL unavailable → `videoFxUnavailable=true`, GPU options
  hidden in UI, CSS path continues.
- PiP action (panel button 画中画, only when `document.pictureInPictureEnabled`):
  `(overlay canvas or video).captureStream(30)` → hidden muted playsinline video → `.play()` →
  `requestPictureInPicture()`; revoke stream on exit.

### 2d. Predictive video (R3)
- HILStateMachine detection moves to rVFC-driven `onFrame(video)` when available (the 250ms poll
  stays as fallback with existing semantics; rVFC path samples each presented frame — latency ≤
  ~2 compositor frames instead of ≤250ms).
- TimelineLearner: while inversion is active (auto or manual), record `[t0,t1]` against
  fingerprint `duration + '|' + srcCode` (srcCode = first 8 chars of a simple hash of src);
  store merged (`mergeSegments`, gap 2s) in `svi:timeline`, cap 50 videos × 40 segs.
  On video load with matching fingerprint: `timelineMode: 'off'|'reference'|'takeover'`
  (default 'reference') — reference: `timeupdate` pre-arms inversion inside learned segments
  unless the user overrode this session; takeover: segment membership directly controls
  inversion; any manual toggle pauses takeover for 10s (HIL anti-fight).

## 3. Self-learning rules (R4)

- `svi:learned`: `{ [host]: { rules: [{stem, action: 'invert'|'protect', hits, lastAt}] } }`.
- `RuleLearner.record(host, el)` on every Alt+click: `selectorStem(el)` = tag + #id + first
  class; hits ≥ `learnHits` (pref, default 2) → active. `RuleLearner.rulesFor(host)` consumed in
  processImage BEFORE the classifier: learned 'invert' forces inversion, 'protect' skips.
  Precedence: user per-site overrides > learned > builtin seed.
- UI (🧠智能): per-host learned list (stem/action/hits/删除), `learnHits` slider (2–6),
  `timelineMode` select, `rulesEnabled` relabeled 种子规则(兜底). BUILTIN_RULES data unchanged.
- Media-dominant heuristic: playing video ≥55% of viewport for ≥3 consecutive samples → suspend
  BackgroundReplaceEngine + bg-image sweeps until false for 10s (generic; no rule needed).

## 4. Media coverage (R8)

- **Canvas**: generic `scanCanvases()` (mutation-driven + idle sweep, budget 100): rendered
  ≥120×80, untainted (8×8 probe), evaluate → `data-svi-inverted` (CSS filter works on canvas).
  Never touch `svi-fx-overlay` canvases.
- **Video poster**: evaluate poster URL through the image pipeline; light →
  `video.dataset.sviPoster='light'` + CSS `video[data-svi-poster="light"]:not(.svi-playing)`
  filter; document-level capture-phase play/pause listeners toggle `svi-playing`.
- **Shadow DOM**: idempotent `Element.prototype.attachShadow` patch collecting roots; engines
  accept a root param; bounded composed scans (≤20 roots, ≤1000 elements/sweep).
- **Inline SVG `<image>` + `input[type=image]`**: join img scans (href/currentSrc), same
  evaluation and filter attributes.

## 5. UI component library (R5)

- `ui` helpers: `h(tag, attrs, ...children)`, `section(title, hint)`, `toggleRow(label, hint,
  getVal, onSet)`, `sliderRow(...)` (slider+number dual like today), `selectRow(label,
  options[{v,label}], getVal, onSet)`, `chipRow(items, onToggle)`, `btnRow([{label, onClick,
  primary}])`, `textRow(label, hint, value, rows, onInput)`, `infoLine(text)`. Rows return
  `{row, sync()}`; sections collect sync fns → one `syncAll()`.
- Rebuild EVERY existing modal section + panel on these builders (dedupe ~40% of UI code), zero
  behavior loss. New sections: ✨效果 (imgFxMode + thresholds + key color + effects +
  videoFxMode), 🧠智能 (learned rules list, learnHits, timelineMode, seed toggle), 💾存储
  (backend badge, key manager list w/ delete, export/import/clear, file: hint when relevant).
- Modal order: 🌙基础 → 🌐站点与规则 → ✨效果 → 🧠智能 → ⚙️高级(accordion) → 📊数据与反馈 → 💾存储.
  Panel row 1: 视频 / 智能 / 图片 / 背景 / 画中画 (5 compact buttons; 画中画 hidden when
  `pictureInPictureEnabled` is false).

## 6. file:// (R7) + coexistence (R9 core)

- Add `@match file:///*`. Profile key: `location.protocol === 'file:' ? 'file:' : hostname`.
  On file: pages, blob fetch is GM-only (fetch(file:) disallowed); failure sets a one-line hint
  in 🧠智能/存储 (浏览器需允许油猴访问文件). No crashes anywhere on file: pages.
- Coexistence: `document.documentElement.dataset.sviOwner = '<kind>|<ts>'` heartbeat refreshed
  5s (kind = 'us' | 'ext'). At boot: if a fresh (≤10s) foreign-kind claim exists → dormant boot
  (`window.__svi = { dormant: true, version }`, no engines/UI). Stale claims may be taken.

## 7. Extension + CI (R9)

- `scripts/build-extension.js` (Node, zero deps): read userscript → strip metadata block →
  `extension/content.js` = prelude (`EXT_MODE=true`; chrome.storage-backed Store; GM shims:
  GM_xmlhttpRequest→fetch, GM_addStyle→style element; owner kind 'ext') + core body. Parse
  @version/@name → write `extension/manifest.json` (MV3, content_scripts
  `<all_urls>` + `file://*/*`, document_end, all_frames, `permissions:["storage"]`) + copy icons.
- `scripts/gen-icons.js`: dependency-free PNG writer (zlib + crc32) → 16/32/48/128 icons from
  the script's circle motif via raster math.
- `scripts/lib/zip.js`: stored-mode zip writer (crc32 table + central directory);
  `scripts/pack.js` → `dist/universal-smart-invert-extension-v<version>.zip` (dist/ gitignored).
- `.github/workflows/ci.yml`: push/PR → `node --check`, `node test.js`, build + manifest/version
  smoke; browser bench job on ubuntu with setup-chrome.
- `.github/workflows/release.yml`: tag `v*` → tests → build → pack → GitHub Release (zip+crx) →
  CWS publish via chrome-webstore-upload-cli npx, each publish/crx step guarded by secret
  presence (`CWS_CLIENT_ID/CWS_CLIENT_SECRET/CWS_REFRESH_TOKEN`, `CRX_PRIVATE_KEY` → crx3
  `npx crx3`); steps skip cleanly when secrets absent.
- PUBLISHING.md: how to fill the secrets, how the userscript + extension coexist.

## 8. Prefs additions (schema 3)

`imgFxMode:'full'`, `imgFxParams{lumCutoff:190, satCutoff:0.30, keyColor:'#ffffff', keyTol:60}`,
`videoFxMode:'off'`, `timelineMode:'reference'`, `learnHits:2`, `storeBackend:'auto'`;
`manualOverrides` migrates out of prefs into `svi:overrides`. loadState normalizes all new fields
(v2.0 pattern). Legacy localStorage keys migrate into `svi:*` on first Store.init, never deleted.

## 9. Test plan

- **test.js (Node, via window.__svi)**: transformPixel per mode (luma keeps colorful pixel /
  inverts light pixel; key only near-key; grayscale/sepia sanity); mergeSegments (overlap + gap
  merge) + lookupSegment boundaries; selectorStem shape; RuleLearner aggregation (2 hits activate,
  delete); Store against a chrome.storage.sync mock (8KB chunk split, mirror read-after-write,
  debounce, export/import roundtrip, legacy migration); mediaDominantViewport; rect math.
- **test-browser.js**:
  1. luma fx on half-white/half-photo img → processed blob readback: white half inverted,
     photo half ΔRGB ≤ 40.
  2. key mode red/white img → only red region changed.
  3. VideoFxEngine luma on a generated white-slide video (canvas.captureStream feed) → overlay
     readback shows partial invert (SwiftShader).
  4. PiP path: captureStream yields ≥1 track (window itself not assertable headless).
  5. TimelineLearner: toggle invert at ~0.5s of a 6s video → reload → auto-inverted inside
     learned segment (reference mode).
  6. RuleLearner: 3 Alt+click corrections on `.thumb-x` imgs → reload → auto-inverted + listed.
  7. Media: light `<canvas>`, video poster, shadow-DOM img all inverted.
  8. Storage: seeded v2.0 keys migrate; manager delete/clear; export parses.
  9. file://: temp html+png in OS temp dir, CDP navigate, boot + UI + zero page errors.
  10. Coexistence: ext content.js + userscript (both orders) → single owner, second dormant.
  11. (node-only) extension smoke: build → manifest valid, version == header, `node --check`
      content.js, zip central directory parses.
- All v2.0 bench scenarios keep passing (regression).

## 10. Docs

README/README_EN badge 3.0.0 + sections: 部分反色与特效 / 预测性视频反色与时间线记忆 /
自学习规则 / 画中画 / 存储管理与云同步 / file:// 支持 / 浏览器插件版与 CI. PUBLISHING.md gains
the CWS secrets guide. Header `@version 3.0.0`, zh/en descriptions updated.
