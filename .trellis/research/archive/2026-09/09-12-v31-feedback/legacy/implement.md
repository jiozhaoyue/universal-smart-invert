# Implement Plan: v3.1

Single implement dispatch, keep test trio green after each step.

1. **Decision unification (design 1)** — extract `decideImage`; forceInvert on first pass;
   decide-once + stored decision context; TTL-bounded failure retries; fix the F3 badge flip.
2. **Eager pass + fast-path (design 2)** — eagerScanBudget pref; mutation cache fast-path.
3. **Image policy (design 4)** — imagePolicy pref, passesImagePolicy pure fn + exports, grid /
   chrome-context detection, UI select; bilibili-like grid bench page.
4. **Hover toggle (design 5)** — hoverRestore pref + html class + fx path + UI toggle.
5. **Viewer compat (design 6)** — composedPath Alt+click; body-end overlay coverage.
6. **Media inspector (design 3)** — collector + section UI + toggle/locate actions + caps.
7. **Bench additions (design 7)** — github-like page + determinism + inspector + policy +
   hover + viewer scenarios; extend test.js unit list.
8. **Docs (design 8)** — version 3.1.0, README/README_EN sections + troubleshooting.
9. Validation loop: node --check, node test.js, node test-browser.js (use
   scripts/probe-github.js against the live URL once as a sanity check if network+proxy
   available; bench itself stays offline).

Do NOT git commit; do not modify .trellis/. Extension build smoke (Phase 0 of test-browser.js)
must keep passing — regenerate extension/content.js via scripts/build-extension.js after header
bump (the build derives from the userscript).
