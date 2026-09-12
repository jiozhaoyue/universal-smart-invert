# Research: v3.0 Partial-Effect Inversion, Predictive Video, Extension Prep

## 1. Partial / per-pixel inversion approaches (user's "部分反色 / 扣像 / 指定颜色")

Reference pool: Dark Reader dynamic mode (per-element CSS generation, v2.0 already adopted for
backgrounds); image-editor chroma-key/matting; video.js shader plugins; "image effect" extensions
that overlay canvases on `<img>`.

Chosen pipeline — one effect model, two carriers:

- **Images → 2D canvas offscreen transform.** Modes: `full` (existing CSS filter, zero cost),
  `luma` (invert only pixels with luma ≥ threshold AND saturation ≤ threshold — "invert the white
  parts, keep the photo"), `key` (invert only pixels within tolerance of a user-picked key color —
  "指定颜色"), `rect` (relative-rect region from Alt+Shift+drag), plus non-invert effects
  (grayscale / sepia / brightness / custom CSS filter string — "不止反色").
  Delivery: transform once at natural resolution into a Blob URL and swap rendering via
  `content: url(blob)` CSS override on the img (no layout shift, no src mutation that would break
  lazy-loaders; hover/Alt-click restore by toggling the class). Fallback to full-filter when
  `content:url` rendering is unavailable. Blobs cached by `src+mode+params`, transforms queued
  (≤2 concurrent), capped resolution (≤4096px), revoked when unused.
- **Video → WebGL shader overlay.** rVFC loop (once per *presented* frame — no duplicate work vs
  rAF polling) → `texImage2D(video)` → fragment shader applies the same mode set on GPU
  (luma-mask / chroma-key / effects). Overlay canvas positioned exactly over the video
  (pointer-events:none, border-radius copied, internal resolution capped at 1080p), original CSS
  filter disabled while overlay active (no double-processing). WebGL degrades to full-filter mode
  when `getContext('webgl')` fails. GPU cost is bounded and off the main thread.

## 2. 画中画 (PiP) delivery

`canvas.captureStream(30)` → hidden `<video>.srcObject` → `requestPictureInPicture()` gives a
detachable window showing the *processed* stream (irregular shapes / partial effects included).
Standard Video PiP is Chromium+Firefox; Document PiP is Chrome-only — use standard video PiP.
Bench can only assert the stream pipeline (track count, readyState) since PiP windows aren't
inspectable headless.

## 3. "提前定好反色时间" — predictive switching (better than pre-playing)

User's idea (pre-play ahead and schedule inversion times) is intrusive (audible/visible seeking,
buffer churn). Better methods, both implemented:

- **Same-frame-adjacent switching**: rVFC fires in the rendering steps for each presented frame
  (https://web.dev/articles/requestvideoframecallback-rvfc , spec https://wicg.github.io/video-rvfc/).
  Sampling inside rVFC replaces the 250 ms poll → detection-to-filter latency drops from up to
  250 ms to ≤1-2 frames (~16-33 ms). Chromium presents the frame just before the callback
  (https://github.com/WICG/video-rvfc/issues/66), so the CSS filter set in-callback applies to the
  very next compositor frame.
- **TimelineLearner**: while a video plays, record invert-active time segments `[t0,t1]` (auto or
  manual), merge adjacent (gap ≤ 2s), persist per `host|src` with duration fingerprint. On replay,
  pending segments pre-arm inversion at `timeupdate` ("参考" mode: auto-enable inside learned
  segments, user override always wins; "接管" mode: learned schedule directly controls). This
  literally "定好会反色的时间" for known videos, at zero per-frame cost.

## 4. Self-learning element rules (no hand-written rules)

- `RuleLearner` aggregates `manualOverrides` per host into learned rules: ≥2 corrections on
  images sharing a simplified selector stem (tag + #id + first class) → learned rule
  (forceInvert / protect). Learned rules outrank builtin seed rules; UI lists them per host with
  delete. The builtin table is demoted to "种子规则/兜底" — intelligence = generic classifier v2
  (size/repetition/context from v2.0) + learned corrections + generic background-image/canvas/
  poster/shadow-DOM detection, with the seed table as bootstrap only.
- Media-dominant page heuristic (playing video >55% viewport) skips bg-replace scans on video
  sites generically — no per-site rule needed for that anymore.

## 5. Browser storage with cloud sync + management

- Backend chain: `chrome.storage.sync` (extension) → `GM_getValue/GM_setValue` (Tampermonkey can
  cloud-sync script storage) → `localStorage` fallback. Async backend + in-memory mirror:
  reads are sync after initial load, writes debounced (perf-neutral).
- All persistent state (prefs, learned rules, manual overrides, stats, timeline segments) moves
  under a `svi:` namespace through this Store; v2.0 localStorage keys migrate on first run.
- Storage manager UI: backend badge, per-key size/preview/delete, export/import JSON, clear.
  Learned data doubles as future intelligence input ("作为之后智能的参考或者直接接管").

## 6. file:// URL support

- `@match file:///*` (TM needs user-enabled file access); profile key falls back to `file:` root;
  canvas readback of file: images is taint-blocked in Chrome without special flags → GM blob fetch
  is the working path (works when TM has file access), otherwise graceful no-crash degradation
  with a settings hint. Extension manifest includes `file://*` with the same user opt-in.

## 7. Extension coexistence, CRX CI, auto-publish

- Userscript stays canonical; `scripts/build-extension.js` derives `extension/content.js`
  (header-stripped core + chrome.storage adapter + GM shims) + synced `manifest.json` (MV3,
  `storage` permission, `file://*` opt-in). Coexistence handshake: first booter claims page via a
  page-context marker; the other boots dormant (no double filters).
- Icons generated dependency-free (Node zlib PNG writer). ZIP packer: minimal stored-mode zip
  writer in Node (no deps). CRX3 in CI via `npx crx3` + `CRX_PRIVATE_KEY` secret.
- CI: `.github/workflows/ci.yml` (tests on push/PR; browser job with setup-chrome when runner
  allows). Release: `.github/workflows/release.yml` on `v*` tags → tests → build → zip → GitHub
  Release upload → Chrome Web Store publish via chrome-webstore-upload guarded by
  `CWS_CLIENT_ID/CWS_CLIENT_SECRET/CWS_REFRESH_TOKEN` secrets (skipped when absent) →
  crx3 packaging + artifact upload (https://github.com/fregante/chrome-webstore-upload-cli).

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- https://web.dev/articles/requestvideoframecallback-rvfc
- https://wicg.github.io/video-rvfc/ and https://github.com/WICG/video-rvfc/issues/66
- https://webrtchacks.com/video-frame-processing-on-the-web-webassembly-webgpu-webgl-webcodecs-webnn-and-webtransport/
- https://github.com/fregante/chrome-webstore-upload-cli
- https://developer.chrome.com/docs/webstore/publish
