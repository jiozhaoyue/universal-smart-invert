# PRD: v3.0 Partial-Effect Pipeline, Predictive Video, Self-Learning Rules, Extension Prep

Source requirement (user goal, translated):

> Find partial-inversion methods for video/images (e.g. picture-in-picture, chroma-key-inspired
> techniques) enabling irregular-shape inversion or specified-color inversion — the script may do
> more than inversion, any effect is fine — while watching performance. Make video inversion
> smarter, e.g. a process that determines in advance when inversion will be needed so switching is
> never late; these are only ideas — find better methods and implement. Keep adding features and
> improve the settings panel UI: reasonable, decoupled and reusable, not repetitive. Optimize
> element rules so they are recognized intelligently instead of requiring hand-written rules —
> dedicated rules are not intelligent. Need automated verification and iteration. Support file://
> URLs. Prepare for conversion into a browser extension (userscript and extension coexist; CRX CI
> with auto-publishing). Support more media elements, cover as many as possible. Persist remembered
> preferences in browser storage (cloud-sync capable), usable as reference or direct control for
> the intelligence, zero performance cost, with storage management. Overall: sound features,
> clear settings.

## Requirements & Acceptance Criteria

### R1 — Partial / arbitrary-effect inversion for images
- Effect modes on images beyond full-filter: `luma` (invert only light/low-saturation pixels),
  `key` (invert only pixels near a user-picked key color within tolerance), `rect` (relative
  region via Alt+Shift+drag), plus non-invert effects (grayscale/sepia/brightness/custom filter).
- Transformed output replaces rendering without breaking site behavior (no src mutation),
  hover restores, results cached per src+mode+params, transforms queued/budgeted.
- **AC**: bench pixel-asserts (2D readback) that in luma mode a white region is inverted while a
  colorful region stays within tolerance; in key mode only the key-colored region changed.

### R2 — Partial-effect video engine (GPU) + PiP delivery
- WebGL overlay engine applying the same mode set per presented frame via rVFC; CSS full-filter
  disabled while overlay active; graceful fallback when WebGL unavailable; internal resolution
  capped; paused when video paused/page hidden.
- "PiP" action: processed `canvas.captureStream()` plays in Picture-in-Picture.
- **AC**: bench (SwiftShader) reads back processed overlay pixels proving partial mode on video;
  PiP path produces a live MediaStream track (PiP window itself not assertable headless).

### R3 — Predictive video inversion (never late)
- rVFC-based sampling replaces the 250 ms poll (detection→filter latency ≤ ~2 frames).
- TimelineLearner: records invert-active segments per host|src, merged and persisted; on replay,
  segments pre-arm inversion ("reference" mode default; "takeover" mode optional).
- **AC**: unit tests for segment merge/lookup; bench records a segment, reloads, asserts
  auto-applied inversion inside the learned segment without user action.

### R4 — Self-learning element rules
- Learned rules derived from accumulated manual corrections per host (selector-stem aggregation,
  ≥2 hits); they outrank builtin seed rules; listed/deletable in UI; builtin table demoted to
  seed/fallback and no longer required for correct behavior on the bench hosts.
- **AC**: unit tests for stem aggregation/threshold; bench: 3 manual corrections produce a learned
  rule that inverts matching images on a fresh load without further clicks.

### R5 — Reusable UI component library + new sections
- DOM builders (section/toggle/slider/chips/select/buttons/textarea) deduplicate all modal &
  panel construction; existing sections rebuilt on them with zero behavior loss.
- New sections: ✨效果 (image mode, luma/key thresholds, key color, effects), 🧠智能 (learned
  rules list, timeline takeover toggle), 💾存储 (backend badge, key manager, export/import/clear).
- **AC**: bench asserts the new sections render and prior sections still function; code has one
  shared builder API (no repeated hand-rolled section markup).

### R6 — Browser-storage preferences (cloud-sync ready) + storage manager
- Store abstraction: chrome.storage.sync → GM storage → localStorage; in-memory mirror, debounced
  async flush (no per-write cost); all persistent state under `svi:` namespace; v2.0 keys migrate.
- Manager UI per R5; import/export round-trips.
- **AC**: unit tests with chrome.storage.sync + GM mocks; bench migrates a v2.0 localStorage key
  and shows backend badge; delete/clear work.

### R7 — file:// URL support
- `@match file:///*`; profile key + graceful degradation (GM blob fetch path; hint when blocked);
  no crash on file: pages.
- **AC**: bench navigates a real file:// page: boots, UI present, images degrade without errors.

### R8 — More media elements
- Canvas elements (light-chart detection + filter), video poster, shadow-DOM roots (via
  attachShadow patch + bounded scans), inline SVG `<image>`, `input[type=image]`.
- **AC**: bench asserts light canvas + poster + shadow-DOM img get inverted.

### R9 — Extension prep with coexistence + CRX CI/auto-publish
- `extension/` scaffold (MV3 manifest synced from header, content.js built from the userscript
  source with chrome.storage adapter, generated icons, storage permission, file:// opt-in);
  dependency-free build + zip scripts; `.github/workflows/ci.yml` (tests) and `release.yml`
  (tag → tests → build → zip+crx → GitHub Release → CWS publish guarded by
  CWS_CLIENT_ID/CWS_CLIENT_SECRET/CWS_REFRESH_TOKEN, skipped when absent).
- Coexistence: first booter claims the page; the other goes dormant (no double filters).
- **AC**: build runs locally producing extension/content.js + zip; manifest version == header
  version; bench loads the built content.js in a page with the userscript and asserts single-owner
  behavior; workflows YAML-valid.

### R10 — Version/docs/quality
- v3.0.0 header + descriptions; README/README_EN feature sections; all existing v2.0 behaviors
  preserved (regression trio green); no automatic network telemetry (export remains manual).

## Out of scope
- Actual Chrome Web Store publication (needs account secrets); workflows are prepared and guarded.
- ML-based frame segmentation (heuristic chroma/luma only).
