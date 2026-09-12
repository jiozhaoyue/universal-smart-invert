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
