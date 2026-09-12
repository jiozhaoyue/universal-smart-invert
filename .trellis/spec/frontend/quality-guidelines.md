# Quality Guidelines

> Code quality standards for frontend development (userscript: `universal-smart-invert.user.js`).

---

## Overview

This project ships a single-file, no-build Tampermonkey userscript. "Frontend" means that file plus
its two test harnesses (`test.js` Node unit tests, `test-browser.js` CDP/Chrome bench). Quality
rules below are battle-tested conventions from v1.4.0 → v2.0.0; follow them for any change here.

---

## Forbidden Patterns

- **Persisting runtime state.** Video-invert state (`runtime.invertActive`), the active video, and
  transient UI state must never reach `localStorage`/prefs. Only preferences (`universal_smart_invert_v4`)
  and stats (`universal_smart_invert_stats_v1`) are written. Violating this breaks tab isolation:
  a new tab would inherit the previous tab's inverted-video state.
- **`innerHTML` with dynamic data.** Storage-derived or URL-derived strings (site patterns, hex
  colors, image URLs, hosts) must be inserted via DOM APIs (`textContent`, `createElement`) —
  v2.0 fixed the one `innerHTML` interpolation of a storage-derived hex in the shield chips.
  Static, developer-authored markup strings are acceptable.
- **Whole-page blanket filters.** Never apply `filter: invert(1)` to `html`/`body`. All engines
  attach filters atomically to media elements (`[data-svi-inverted]`, `[data-svi-bginv]`) or to
  per-color-bucket tagged elements (`[data-svi-bgr-*]`).
- **Unbounded observer work.** MutationObserver callbacks must coalesce records (~100ms debounce),
  idle-schedule heavy scans, cap element budgets, and skip work when `document.hidden`.
- **Aborting a fallback chain inside a shared try/catch.** If step 1 of a fallback chain can throw
  for legitimate inputs, it needs its own try/catch (see SVG decode lesson below).

## Required Patterns

- **Nested decode fallback** (canvas → blob → `createImageBitmap` in its own try/catch → temp
  `<img>` + objectURL). Chrome rejects `createImageBitmap` on many SVG blobs (especially without
  intrinsic size); a shared try/catch made the temp-img path dead code and broke GitHub
  camo/star-history images. Also treat a *blank* canvas sample (`opaqueCount < 8`) as suspicious
  and retry via the blob path.
- **Engine init isolation**: every engine constructor wrapped in try/catch so one failure never
  kills boot; UI is built only when `window.self === window.top`, engines still run in iframes.
- **Pref writes** go through the debounced `savePrefs()`; `loadState()` normalizes every field
  (arrays, enums, `#rrggbb` hex) so corrupt/hand-edited storage cannot break engines or UI.
- **Pure logic exported on `window.__svi`** (`hostMatchesPattern`, `classifySmallElement`,
  `mapLightToDark/mapDarkToLight`, profile resolver, BUILTIN_RULES) so Node unit tests can assert
  the real shipped code, not a copy.
- **Element budgets + idle scheduling** for page-wide scans (BackgroundReplaceEngine: 400/chunk,
  4000/page; BgImageEngine sweep: 1500 elements, ≥5s apart, paused when hidden).
- **Exclusion-selector layering** for background replacement: built-in LOGIN_SELECTORS ∪ per-site
  `excludeSelectors` ∪ global `bgExcludeSelectors`; media tags (`img/video/svg/canvas/iframe`)
  are never tagged.

## v3.0 Additions (partial effects, storage backends, CI)

- **GitHub Actions `if:` guards**: the `secrets` context is NOT available in `if:` conditions at
  any level (the workflow fails to parse). Gate optional steps (CRX packaging, Chrome Web Store
  publish) through a prior step that exports an `ENABLED=true/false` flag into `$GITHUB_ENV`,
  then `if: env.ENABLED == 'true'`.
- **Async storage backends need lifecycle discipline**: a `ready` flag must be set only after the
  remote (chrome.storage) load completes — early-returning on it silently no-ops every write.
  Legacy-data migration must run after the remote load, exactly once. Always consume
  `chrome.runtime.lastError`; on `chrome.storage.sync` quota errors degrade to `.local`
  (never throw). Chunk by UTF-8 bytes, not chars (8KB *byte* item quota), and make deletes
  chunk-aware or orphaned `.meta/#n` chunks resurrect deleted values.
- **Event-driven + polling detection paths must be mutually exclusive**: when an rVFC path exists,
  gate the legacy poll on frame freshness, and make hysteresis time-based (not tick-count-based)
  or it collapses under event frequency.
- **`content: url(blob)` is the delivery for transformed images** (never mutate `img.src` —
  breaks lazy-loaders). Pair it with: transform results cached by `src|mode|params`, LRU with
  deferred blob revocation + pagehide sweep, and a kill-switch attribute.
- **Store quota/degrade + index rebuilds**: GM has no list API — the key index must be
  `existingIndex ∪ currentMirror`, never rebuilt from itself.

---

## Testing Requirements

- `node --check universal-smart-invert.user.js` must pass.
- `node test.js` must pass: legacy algorithm/benchmark tests + v2.0 site-engine tests against the
  real `window.__svi` exports (loaded via a minimal DOM/localStorage shim in Node).
- `node test-browser.js` must pass in headless Chrome (CDP): all image verdicts, CORS-SVG decode
  chain (second port, with and without intrinsic size), bg-image thumbnail, 20-icon negative grid,
  login-box bg-replace isolation, video-toggle reload (tab isolation), Alt+click override
  persistence, stats key presence, UI structure counts.
- Any bug fixed in production code gets a regression test in the same change (v2.0 example:
  whitelist-vs-override precedence).

## Code Review Checklist

- [ ] No runtime state in storage; migration strips runtime keys (v3→v4 pattern).
- [ ] New user-facing strings are Chinese; identifiers ASCII; new sections follow the numbered
      `// ===== N. =====` banner style.
- [ ] No `innerHTML` interpolation of dynamic data; no automatic network transmission (stats
      export is manual: copy/download JSON only).
- [ ] Observers debounced + idle-scheduled + hidden-paused; caches keyed by URL with TTL failure
      markers so retries don't hammer the network.
- [ ] Site-profile precedence intact: global defaults < builtin rule < user override, with the
      siteMode (blacklist/whitelist) gate applied before the merge and explicit `enabled`
      overrides still winning.
- [ ] README.md / README_EN.md / `@version` / `@description` updated together and claims match
      actual behavior (no over-claiming perf numbers).
