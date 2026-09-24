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

## v4.6 Additions (manual-verdict guard, single state-write gate)

- **Alt+click manual verdicts are authoritative and idempotent (v4.6-2)** — every non-manual write
  of `data-svi-inverted` MUST go through the single gate `applyInvertState(el, want, reason)`,
  which re-resolves the manual input (element marker `data-svi-manual="invert|restore"` first,
  then `host|src` memory) before writing; reasons `manual` and `fx-mutex` bypass the gate.
  Direct `setAttribute/removeAttribute('data-svi-inverted')` in decision paths is forbidden
  (mechanical resets in strip/rescan are the documented exception).
- **The fx delivery callback must never clobber manual state**: `ImageFxEngine.applyTo` gives up
  when the element is killed (`data-svi-fx-off="true"` → plain return, keep attrs so the media
  panel state text and the second-click re-enable state machine survive) or when a restore
  override exists (`manualStateFor(el) === false` → `clearFor`). Unconditional attribute
  stripping in `applyTo` was the root cause of "Alt+click never works on fx-delivered images".
- **The fx per-element rule selector must exclude the kill state** —
  `img[data-svi-fx="ID"]:not([data-svi-fx-off="true"])`. The global fallback
  `img[data-svi-fx][data-svi-fx-off] { content: normal }` in the main stylesheet LOSES the
  cascade to the later-created `#svi-fx-style` node (same specificity + both `!important`),
  so relying on the fallback alone leaves the kill switch visually dead.
- **Src-less media (canvas, bg elements) carry the manual verdict via the element marker**
  `data-svi-manual`; first-scan writers (`MediaCoverageEngine.processCanvas`, BgImageEngine
  element writes) must consult it, otherwise the first pixel analysis after a user click
  reverts the choice (deterministic "click twice" pattern).
- **Manual toggles write the four-tuple in the same frame**: render attribute +
  `data-svi-manual` marker + `manualOverrides[host|src]` + force-refreshed decision snapshot
  (`recordDecision(..., 'manual', true)`), then propagate to same-src connected siblings
  (bounded 24; fx siblings only toggle `data-svi-fx-off`, never the CSS-filter attribute).
- **Testing gotchas for this layer**: in the Node shim, `Store.init`'s async reload detaches
  the module `state` from `svi.prefs` — memory-path assertions must seed localStorage and
  re-boot the script (a third `vm.runInThisContext`) instead of mutating `prefs` in place;
  direct-constructing engine classes needs `global.addEventListener` stubs; the bench itself
  regenerates `extension/**` in its smoke step (deterministic output).

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
---

## v4.6 Additions (local-first decisions, network-independent judging)

- **Decision evidence is local-first; network delivery is only an upgrade channel.**
  `localEvidence(el)` (§14.5) classifies each media element into tier A (decoded pixels →
  pixel pipeline), tier B (laid-out but undecoded placeholder → immediate conservative local
  verdict), tier C (no layout → register-only). `processImage` never gates on `complete`:
  the eager pre-scroll pass now feeds tier B/C elements through the same unified pipeline
  (rollback switch `state.localFirstDecide=false` restores v4.5 behavior and is unit-locked).
- **Tier B is conservative by contract**: only `keep` (reason `local-context` /
  `local-inline-hint`) or an existing rule verdict (manual/element/learned/seed) may be
  recorded — never an invert from cssContext alone. Provisional snapshots carry
  `provisional: true` on the decision object.
- **Tier upgrades are the one sanctioned decide-once refresh** (same precedent as manual
  overrides): when decoded evidence arrives (load via `attachPendingWake`), the provisional
  snapshot is deleted and the full pipeline re-decides; same-tier re-entry must never flip
  a verdict. After any await inside `decideImage`, re-read the snapshot: a racing
  authoritative decision wins; only a provisional one yields to the pixel verdict.
- **Pending registry**: `pendingEls` is a bounded LRU (≤500) cleared by
  `clearCacheAndRescan`; wake channels are load / IO re-entry / Mutation — never a hanging
  timeout. Media without a `complete` lifecycle (SVG `<image>`, `input[type=image]`)
  classify as tier A (v4.5 `ready=true` parity) — do NOT send them to tier C or they never
  decide (bench Scenario 9 regression).
- **Zero automatic network paths**: `gmFetchText` has exactly one call site, inside
  `importRulesFromUrl` (manual button only; static assert in test-local-first.js).
  `@connect *` stays solely for that plus the cross-origin pixel-sampling blob fallback
  (`gmFetchBlob` fetches the image's own data, not telemetry) — documented in the header
  block and the 数据与备份 UI (手动导入通道 label). Never add startup/scan-time fetches.
- **Probe infrastructure**: CDP ports and shot directories derive from `process.pid`
  (parallel-agent collisions are a known incident). `dev/probe-weaknet.js` reproduces
  throttled states (300kbps/400ms RTT) with a self-hosted delayed server — the
  network-coupled decision latency (956ms→18s+ undecided) is the bisected v3.1.0 regression
  signature (task 09-23-v4.6-1 research/bisect-report.md); three-state steady decision
  equality (fast/throttle/offline) is asserted via `dev/compare-states.js`.

---

## v4.6 Integration Notes (并行 worktree、存储回退、退出码)

多分支并行改**同一个 8300 行单文件**时的实战教训（非风格要求，都是踩过的坑）：

- **并行 worker 必须用 git worktree 隔离**（`.worktrees/v46-impl-N` + `v46/impl-N` 分支，已 gitignore）。
  共享工作区同时改同一文件必然互相覆盖，且各自的 `node test.js` 结果不可信。
  合并顺序：小改动先合（UI/页脚）→ 管线类后合；冲突集中在
  `.trellis/spec/**`（两边都追加同名小节）与 `extension/content.js`（生成物，重新生成即可）。
- **`LoadState` 的遗留键回退不能是“二选一”**：`svi:prefs` 按设计 `delete manualOverrides`，
  所以“命名空间已写”时 `safeStored.manualOverrides` 回退必然落空；且“现代键存在但为空”会短路
  回退。正确做法：现代键**非空**优先；否则把 `safeStored` 与原始遗留键**合并**（遗留键最后写入，
  冲突以它为准）。手动覆盖是用户数据，绝不能因另一个键存在就丢弃。
- **能力检测优于真值判断**：`if (document.body)` 不足以保护 `document.body.classList.toggle()` ——
  宿主文档/测试桩可能是“存在但缺 classList/style”的对象（实测导致 boot 中断）。
  已改为 `rootEl.classList && rootEl.style` / `bodyEl.classList`。
- **异步测试块的全局污染会打到后面的 boot**：测试里替换 `window.getComputedStyle`、
  `document.body`、`document.documentElement` 的块若在 await 窗口内执行且不还原，
  会让后续 `vm.runInThisContext` 的 boot 跑在桩环境上（本次集成失败的最后一层原因）。
  临时桩一律 `try/finally` 还原。
- **不要“种外部存储再 boot”来模拟重载**：依赖存储内部键在多次 boot 之间不被清理，时序脆弱。
  改用真实钩子（如 `Store.onRemoteLoaded()` = 后端命名空间装载完成 → `state = loadState()`），
  无时序依赖且与真实页面路径一致。
- **PowerShell 陷阱**：`node test.js | Select-Object -First N` 会在取够 N 行后关闭管道，
  **杀掉 node 并让 `$LASTEXITCODE` 变成 1**。判断门禁必须重定向到文件（`*> $env:TEMP\x.log`）
  或用异步终端；不要用 `-First` 截断长跑命令的输出。
- **集成期必须重跑全量门禁**：分支各自绿 ≠ 合并后绿。四绿（`node --check` / `node test.js` /
  `node test-browser.js` / `build-extension.js && pack.js`）在合并后全部重跑才算完成。

## v4.6.1 Notes (启动时序、测量方法论、测试等待时长)

2026-09-24 收尾会话的追加修复与教训。核心是「**先量清楚再改**」——本轮两次归因错误都源于测量方法不可靠。

### 1. `whenBodyReady` 改事件驱动（真实修复）

`@run-at document-end` 的 userscript 执行时 body 已存在（零等待），但**扩展形态 `run_at: document_start`**
执行时 body 尚未创建，原实现 `setInterval(…, 50)` 轮询使回调平均晚 **50ms** 才起跑
（三次复现 50/52/53ms）—— 而全部引擎构造本身仅约 10ms，即这是启动路径上最大的单项可归因延迟。

- 改为 `MutationObserver` 事件驱动；**必须 `observe(document)`，不能 `observe(document.documentElement)`**：
  `document_start` 时刻 `document.documentElement` **仍是 null**（实测 `readyState=loading`），
  `observe(null)` 抛 `parameter 1 is not of type 'Node'`，被 try/catch 吞掉后**静默退化回 50ms 轮询**
  —— 首次修复就是这样失效的（`dev/probe-diag-bodyready.js` 证实的）。
- 保留 50ms 轮询与硬超时作兜底（覆盖 `MutationObserver` 不可用或观察器错过插入时刻）。
- A/B 实测（`dev/probe-boot-breakdown.js`，三次复现）：等待 body **51ms → 2ms**，
  首个决策 **75/77/77ms → 44/46/49ms**（约 −40%）。

### 2. 测量方法论：**轮询打点在本项目不可信**

排查启动延迟时，用 `setInterval(…, 1)` 记录「某引擎何时可见」得到过**非物理结果**：
所有引擎都报同一时刻（148ms），且**晚于** 76ms 就已落下的首个决策 —— 因为 boot 的同步块
占满主线程时 `setInterval` 回调被推迟。**结论：主线程繁忙期的时刻只能用事件驱动打点**
（`MutationObserver` / 在插桩语句内同步写入 `performance.now()`），轮询值只能当上界参考。

### 3. 插桩要精确锚点，不要宽正则

初次用 `/=\s*new\s+([A-Z]\w*)\(([^;]*?)\);/g` 全局替换来给引擎构造计时，**误匹配 66 处并破坏脚本**
（`firstDecision` 直接变 null）。改用 9 行唯一的赋值语句做锚点，零风险且不改语义。

### 4. 异步写入链的测试等待时长要留余量

`test.js` 有两处同类断言**稳定失败**（非抖动），都是 `chrome.storage.sync` 异步 mock 的
分片写入需要十余次 1ms 往返，而等待时长是临界值：

| 断言 | 原等待 | 结果 | 改为 |
|---|---|---|---|
| `chunked write emits meta manifest` | 30ms | 稳定失败 | 300ms |
| `chunked key has meta manifest`（分片删除回归） | 60ms | 稳定失败 | 300ms |

定性方法（以第一处为例）：复制 `test.js` 仅把该处 `setTimeout(…, 30)` 改成 800ms
→ **exit=0 全绿**，证明是**测试等待时长不足**而非产品缺陷。

> 教训：这类「恰好够用」的等待时长在慢机器/高负载下必然翻车。改测试前**先用对照实验定性**
> （是产品缺陷还是测试问题），再决定改产品还是改测试 —— 不要凭断言失败就动产品代码。
> 另：定位可疑等待时，用括号配对从 `setTimeout(` 扫到匹配的 `}` 读其真实延迟值，
> 比按行号猜更可靠（同一个测试块里往往有多个嵌套 `setTimeout`）。

