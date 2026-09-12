# Research: Live GitHub Probe (v3.1 grounding)

Tool: `scripts/probe-github.js` / `scripts/probe-github2.js` (CDP + headless Chrome + proxy-aware;
injects the current userscript into arbitrary URLs via `Page.addScriptToEvaluateOnNewDocument`).
Target: https://github.com/ZeroDeng01/sublinkPro/blob/main/README.zh-CN.md (the user's report).

## Findings

- **F1 — The v3.0.0 pipeline works on GitHub.** After a scroll-through, all 29
  `.markdown-body img` end inverted (logo, 15 camo badges, 12 raw `docs/images/*.jpg` screenshots
  at 3600×2018, star-history camo chart). Zero page exceptions, pill present, not dormant. The
  raw `github.com/.../raw/main/...` screenshots taint the canvas in headless (no GM) yet still
  passed — raw.githubusercontent serves `Access-Control-Allow-Origin: *` for these; camo also
  passes canvas readback. No exceptions.
- **F2 — Initial-load gap (the user-visible "没有生效").** Without scrolling, only 17/29 checked
  and 1/29 inverted: everything below the fold waits for the IntersectionObserver (rootMargin
  300px). Opening the README shows badges/logo at top and screenshots below; a user who does not
  scroll sees "script not working". Fix direction: eager processing for complete images within a
  budget + larger rootMargin, so first paint of a README inverts immediately.
- **F3 — Decision inconsistency (reliability bug, "有时候不生效").** The 20px camo badges were
  checked on the initial pass and NOT inverted, but after the scroll pass the SAME images were
  re-processed and INVERTED. Identical inputs must not flip decisions between passes; the two
  processImage entry paths diverge somewhere (initial IO pass vs post-mutation/refresh pass).
  Needs a code-level fix: one canonical decide-once flow.
- **F4 — Possible stale install.** `@updateURL` points at
  `raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/...`; if that repo is private
  the raw URL 404s and Tampermonkey silently keeps the old version (v1.x had the camo/star-history
  bug the user already reported). Action: README troubleshooting section (check version in TM
  dashboard; manual reinstall), not a code change.
- **F5 — SPA/pjax navigation.** Clicking through GitHub's internal nav keeps the script alive and
  processing (44 imgs seen after nav to repo root; file-tree icons correctly skipped). Add bench
  coverage for content-image swaps on SPA navigation anyway.

## Design implications

1. Eager initial pass is a budgeted guarantee, not a scroll side effect.
2. Decide-once semantics with a single decision function; re-evaluation only via explicit cache
   clear (settings change / manual rescan).
3. Keep probes as dev tools under `scripts/` (proxy-aware via `HTTPS_PROXY`).
