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

## v3.1 Additions (decision pipeline, inspector, policies)

- **Manual overrides must force-refresh decision snapshots**: `recordDecision` snapshots are
  normally write-once, but a user's Alt+click choice has higher precedence than any cached
  decision — the override path records with `force=true`, or the mutation fast-path re-inverts
  against the user's explicit choice.
- **Decision order is: manual override → snapshot → learned → seed → policy → pixel analysis.**
  A same-session pixel decision must never shadow a persisted override.
- **`composedPath()` retargets for OPEN shadow roots too** — do not skip hosts with `n.shadowRoot`
  when resolving the event target; the ShadowDomRegistry resolves both open and closed roots.
- **Event-to-media resolution must match the scan selectors exactly** (e.g. `input[type="image" i]`,
  not any `input`) or Alt+click on unrelated elements toasts and pollutes the rule learner.
- **Lazy-collect UI sections must not auto-refresh on modal open** — the collect button drives the
  (budgeted) scan; auto-refresh defeats the empty state and costs a page-wide sweep.
- Any computed-style sweep needs a candidate cap (align with the engine budgets, 1500).

## v3.3 Additions (settings panel IA, element rules, rule files)

- **Element-rule tier in the decision pipeline**: precedence is
  manual override > **element rule** > decision snapshot > learned rule > seed rule >
  small-element/policy gates > pixel analysis. A matching element rule must
  `recordDecision(src, verdict, 'element-rule', /* force */ true)` — explicit user
  configuration shadows a cached snapshot exactly like a manual override does. Every rule
  edit path (add/delete/import) must run `savePrefs()` (bumps `prefsRevision`, invalidating
  the site-profile cache) **and** `clearCacheAndRescan()` (+ bgImage `sweep()`), or the
  decide-once snapshot keeps the stale verdict.
- **Element-rule resolution contract**: `resolveSiteProfile` fills `profile.elementRules`
  with rules whose `pattern === '*'` or `hostMatchesPattern(host, pattern)`; array order is
  priority order (first match wins). Normalize through `normalizeElementRules()` (drops
  malformed entries, fills `id` via `hash32`, FIFO cap 200 keeping newest).
- **UI select options carry no parentheses/explanations**: option labels are short Chinese
  names only; explanations go in the option's `describe` field, rendered by `ui.selectRow`
  as a dynamic `svi-row-describe` line that syncs with the current value. Same for
  code/English terms (`CSS 滤镜`, `(GPU)`, hex, `svi:` keys, backend names) — Chinese in the
  DOM, raw value in `title` tooltips or developer comments only.
- **Settings layout modes contract**: prefs `settingsLayout: 'center'|'left'|'right'` and
  `settingsWidth` (clamped 320–600). Docked mode = `svi-modal-mask.docked`
  (transparent mask, `pointer-events: none`, window `pointer-events: auto`, solid window
  background — no backdrop blur means 98% alpha lets page content ghost through) +
  document-level click-outside close + Esc close. Drawer width is the CSS var
  `--svi-settings-w` on the window element. Mutating `state.settingsLayout` directly does
  nothing — layout only applies through `applySettingsLayout()` (the header segmented
  buttons are the single entry point; tests must click them, not poke prefs).
- **Rule file contract**: envelope `{ kind: 'svi-rules', schema: 1, version, exportedAt,
  rules: { siteMode, siteBlacklist, siteWhitelist, siteOverrides, elementRules,
  shieldColors, bgExcludeSelectors, learned } }`. Merge import dedups arrays, per-pattern
  merges `siteOverrides` (file wins per key), learned rules keep the higher `hits` per
  (host, stem). Replace import overwrites **only groups present in the file** — absent
  groups must not be cleared. After applying: `savePrefs` → `clearCacheAndRescan` →
  `updateImageFilterCss` → bgReplace re-eval → refresh site/element/smart/data sections.
- **Gotcha (testing)**: injecting the userscript via CDP
  `Page.addScriptToEvaluateOnNewDocument` (document-start) silently loses ALL styles —
  `injectStyles()` runs while `document.head`/`documentElement` are both still null and the
  fallback append no-ops. Class-based assertions keep passing (classList works), so the
  loss is invisible until you measure computed styles. Layout probes must inject via
  `Runtime.evaluate` after navigation (same as probe-github), not at document-start.

## v4.0 Additions (settings redesign, site power hot-apply)

- **Site power is a runtime gate, never storage**: `runtime.siteActive` (in-memory) gates every
  engine entry (image process/flush/eager, Alt+click; video loops self-gate via
  `profile.enabled`). Suspending must strip the FULL side-effect surface in the same tick:
  html gate classes, `data-svi-*` attribute family (incl. `data-svi-checked`), video inline
  filter/transition, `.svi-fx-overlay` canvases, `svi-playing/svi-fx-hover`, poster marks,
  bgReplace off, video-tune class — then `updateImageFilterCss()` (profile disabled → classes
  off). Resuming must re-run `updateImageFilterCss()` + `applyVideoTune()` + rescan/sweep, or
  the gate classes stay dark (v4.0 lesson: resume without `updateImageFilterCss` left the page
  stripped but dark).
- **Boot-disabled pages must stay hot-enableable**: the engine boot block is extracted into
  idempotent `bootEngines()` (`window.__svi.enginesBooted`); with the site disabled at boot,
  engines never start but the capsule builds collapsed into a power badge
  (`.svi-capsule-root.svi-site-off`), so clicking it boots engines at runtime.
  `bindStateMachine`/`buildUI` are idempotent (guard flags) — the off-badge pre-build must not
  duplicate the capsule when `bootEngines()` later binds.
- **Tests toggle site power through the real control** (`.svi4-switch` click), never by poking
  prefs; Scenario 19 asserts same-tick teardown and reload-free restore.
- **v4 settings IA contract**: power banner (`.svi4-power`, hot switch) + 本站/全局 tabs
  (`.svi4-tabs`) + tri-state capability cards (`.svi4-card`, cycle 跟随全局→强制开→强制关,
  writes `siteOverrides[host]`, deletes the key to return to inherit). Site lists
  (mode/blacklist/whitelist) live in the 全局 tab (`#svi-sec-lists`) and call
  `evaluateSitePower()` after every change. Bench anchor ids preserved: `svi-sec-site`,
  `svi-sec-media`, `svi-sec-video`, `svi-sec-stats`, `svi-sec-shield`.


## v4.1 Additions (AGPL, readability absorption)

- **License is AGPL-3.0-or-later** — never copy code from AGPL projects without honoring the
  license (we now ARE one); MIT references remain only when describing third-party tools.
- **Readability features (font override / text stroke) follow the same hot-apply contract as
  the site power**: CSS vars + `html.svi-font-on` / `html.svi-stroke-on` gate classes (never
  filters), applied by `updateFontCss()` which must be called from boot, `Store.onRemoteLoaded`,
  the site-power resume path, and its classes stripped in `stripSviSideEffects()`.
  `FONT_STACKS` is defined BEFORE `loadState()` (loadState validates `fontFamilyPreset`
  against it). Selectors whitelist text-bearing elements and exclude svg/code/pre/kbd/samp
  subtrees; the stroke rule intentionally does NOT include `body` — assert stroke on a text
  element, not on body.


## v4.2 Additions (dynamic theme, scheduler, machine-generated rules/)

- **Dynamic dark theme (P1/P2) is a bucket-generation parameter, not a filter**:
  `applyDynamicThemeAdjust` wraps the three `map*` functions at bucket creation; default args
  are identity (the bench login-box baseline depends on it). Tone must NOT tint text — pass
  `'pure-black'` for fg buckets. Preference changes hot-apply through `bgr.rescan()` (rescan
  strips tags first, so computed styles revert to page originals before re-tagging).
- **The scheduler is a master gate on `evaluateSitePower` — and every powered-off path must
  know it**: `scheduleActiveNow()` gates `evaluateSitePower()`, but `updateImageFilterCss()`
  recomputes from the site profile ONLY; it must ALSO check `runtime.siteActive`, otherwise a
  schedule/power suspension gets its gate class re-lit on the next applier call (v4.2 lesson,
  caught by Scenario 22). Same for HIL `tick`/`onFrame` (`runtime.siteActive` early-return).
  The 60s poll is safe because `applySitePower` early-returns on unchanged state.
- **`rules/` artifacts are machine-generated and wholesale-regenerated — never hand-edited**;
  that is the one-click-merge-no-conflicts contract. `*.import.json` uses the `svi-rules`
  envelope consumed by 导入并合并 (array dedup = idempotent). `sync-darkreader.js` shells out
  to curl (proxy-aware, CI-safe); Dark Reader config files are SINGULAR (`.config`, not
  `.configs`) and are newline-separated host lists.


## v4.3 Additions (flash guard, partial recolor, sanity net)

- **Flash-black guard is opt-out and self-cleaning**: document-start black paint ONLY for
  sites whose resolved profile has `bgReplace === true` (light pages would flash black→white,
  which is worse); hand-off on `data-svi-bgr-on`, plus load/5s fallbacks. `state.flashGuard`
  setting tears down instantly via `window.__svi.flashGuardOff` (attached AFTER the `__svi`
  literal — assigning at the guard's definition site crashes boot; caught by Scenario 1).
- **Extension runs at document_start** (manifest + CI smoke assert it); boot must tolerate
  head-less early documents (injectStyles falls back to documentElement, engines wait on
  whenBodyReady).
- **Element-rule action "recolor" = scoped bucket recolor, not literal color freeze**: the
  bucket engine's paired mapping (light bg→dark AND dark fg→light) is what keeps the darkened
  card readable; "partial" means scope isolation (matched element only). Engine surfaces:
  `bgr.partialTag(el)` / `bgr.applyPartialRules()` driven from the bg-image sweep, CSS gate
  `html:is([data-svi-bgr-on],[data-svi-bgr-partial])`, torn down with site power.
- **Inversion sanity net**: `analyzeSrc` now returns `meanLum`/`opaqueRatio`; decide-time gate
  refuses auto-invert when `isLight && meanLum < 96` (reason 'sanity-dark'); pixel-invert
  verdicts get ONE bounded re-validation (~6s, queue ≤12) that flips cache+snapshot+tags on a
  genuine misjudge. Trust gate: flip only when `opaqueRatio >= 0.5` — transparent-heavy SVG
  blob samples (dark lines on transparent) would otherwise flip white diagrams to keep
  (caught by Scenario 1).
- **Bench pages embed the script themselves** (`${executableScript}` + optional
  `${SEED_SNIPPET}; sviSeed({...})` BEFORE it) — a route without the inline script has no
  `window.__svi`; same-origin localStorage persists across scenarios, so a page needing
  isolation must seed overrides explicitly (e.g. `sviSeed({ bgReplace: false })`).

## Testing Requirements

- **The bench's fixed Chrome profile (`.chrome-test-profile/`) persists localStorage across
  runs** — scenario 1 asserts a fresh-storage world, so the runner MUST wipe the profile dir
  before spawning Chrome (v3.2 lesson: a leftover Alt+click override from a previous run made
  the dark-photo verdict fail and looked like a production regression). In-run reload
  persistence scenarios (2b/18) are unaffected by the wipe.

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

## v4.6 Additions (toggle rows, gate-class residues, version self-check)

- **Toggle rows must be captured and registered into `rowSyncs`** — never inline
  `sec.add(ui.toggleRow(...))`. The inline pattern drops the returned row object, so its
  `sync()` never runs: the checkbox renders the browser default (unchecked) regardless of the
  live pref, and the user's first click on an unchecked box writes `onSet(true)` — the exact
  OPPOSITE of the visible state. This was the real root cause of "悬停显示原图关不掉"
  (v3.1.0–v4.3.0 shipped it; fixed in v4.5.0 via `const hoverRow = …; rowSyncs.push(() =>
  hoverRow.sync())`; re-proven on a real browser by the v4.6-3 old-version control leg in
  `dev/probe-hover-matrix.js`). Rule of thumb: a row whose getter exists but whose `sync` is
  unregistered is a display/write desync waiting to be reported as "the toggle does nothing".
- **Gate-prefix suppression beats residue cleanup** — hover-restore CSS lives under
  `html.svi-hover-restore` (single gate class written only by `updateImageFilterCss` from
  `state.hoverRestore`). A stale `.svi-fx-hover` on an element therefore CANNOT restore colors
  once the gate class is off (proven live); toggling does not need to sweep residue classes to
  be correct (the `mouseout` handler still clears them). When adding a new hover/restore
  channel, prefix it with the same gate class instead of inventing a second toggle source.
- **Dead gate rules hide unimplemented features** — `video[data-svi-inverted="true"]:hover`
  never matches because `MEDIA_SELECTOR` excludes `video`; videos keep their inline
  `!important` filter on hover in BOTH toggle states. Don't assume a CSS hover rule means the
  feature exists — probe the live channel before claiming coverage (four-channel matrix:
  CSS-filter img / fx content:url img / bg-image el / video).
- **Version self-check is local-only** — the settings modal header carries a `.svi-modal-ver`
  badge (`v` + `SCRIPT_VERSION`) so users on stale installs can self-identify (the ≤4.3.0
  cohort above). No remote version polling: automatic network telemetry stays forbidden.
  Bench asserts the badge exists and equals `@version` (Scenario 20b).
