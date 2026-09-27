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

> **⚠ 本节的结论已在 v6.5 被推翻一半 —— 请连同 [v6.5 §1](#1-绿不是通过是没跑testjs-的三道假绿闸门) 一起读。**
> 下表「改为 300ms」当时确实是修复（症状消失），但**根因不是时长，是等待方式**：
> 固定等待永远只是概率，加多大都能被下一次挤压越过去。2026-09-27 那条
> `chunked key has meta manifest` 又以 300ms 复现了。正确做法是**有界轮询**（`pollUntil`），
> 不是把数字调大。下表保留为历史记录。

`test.js` 有两处同类断言曾**稳定失败**（非抖动），都是 `chrome.storage.sync` 异步 mock 的
分片写入需要十余次 1ms 往返，而等待时长是临界值：

| 断言 | 原等待 | 当时结果 | 当时改为 |
|---|---|---|---|
| `chunked write emits meta manifest` | 30ms | 稳定失败 | 300ms |
| `chunked key has meta manifest`（分片删除回归） | 60ms | 稳定失败 | 300ms |

定性方法（以第一处为例）：复制 `test.js` 仅把该处 `setTimeout(…, 30)` 改成 800ms
→ **exit=0 全绿**，证明是**测试等待时长不足**而非产品缺陷。

> 教训：这类「恰好够用」的等待时长在慢机器/高负载下必然翻车。改测试前**先用对照实验定性**
> （是产品缺陷还是测试问题），再决定改产品还是改测试 —— 不要凭断言失败就动产品代码。
> 另：定位可疑等待时，用括号配对从 `setTimeout(` 扫到匹配的 `}` 读其真实延迟值，
> 比按行号猜更可靠（同一个测试块里往往有多个嵌套 `setTimeout`）。
> **续（v6.5）**：定性之后还要问一句「这个等待**方式**对不对」——固定睡眠的正确性依赖
> 「本文件同步执行时间 + 全局负载不越过该值」，这是个**不可能被调准的数字**。判据是
> **条件式**的（等某个属性/键到位），就该写成有界轮询。

---

## v5.0 Additions (Action Registry 契约)

> 任务 v5-1。**任何新增元素动作或修改决策优先级之前，先读本节。**

### 1. 决策优先级链的真实形态（不是"一条链"，是**两段 + 中间一个缓存接缝**）

```
stage 'override' : manualElement → manual → elementRule
──【决策快照 decisionBySrc 命中即早退】──   ← 位置不得移动
stage 'rule'     : learned → seedProtect → faviconSkip → seedForceInvert
── 小元素门 / 策略门 / 像素管线 (不进 Registry) ──
```

三条硬约束：

1. **快照卡在两段之间**。把 `learned` 提到快照之前，会让「已有快照的 src」被学习规则翻转 —— 属行为改变。
2. `elementRules`（用户显式）与站点档案（`BUILTIN_RULES` 的 `protect` / `forceInvert`）**不是同一层**。
3. **`protect` 与 `forceInvert` 之间夹着 favicon 判定**，顺序不可合并或重排。

### 2. 单一解析入口 + 单一写入仲裁

| 契约 | 位置 | 规则 |
| :--- | :--- | :--- |
| `SOURCES` | 有序来源表, `stage` 标签决定调用点 | **新增来源只改表, 不改调用点** —— 这是 AC-1「唯一性」的落地方式 |
| `resolveStage(el, ctx, stage)` | 唯一解析入口 | 按表顺序短路, 首个命中即返回; 无人认领返回 `null` |
| `arbitrate(el, candidate)` | 唯一写入仲裁 | 手动结论幂等占优; **直写例外只有 `manual` 与 `fx-mutex` 两条**（v4.6 实测得出，不得扩大） |
| `actionEnabled(id)` | 动作"是否启用"的**唯一读取点** | UI / 引擎 / 触发器一律经此; 不得各自读 `state.actions` 或自行推断 |
| `applyResolvedAction(el, cand)` | 候选落点派发 | 动作关闭时执行 `revert` 清残留（**开关即回滚**） |

### 3. `verdict` 的语义约定（v5.0 起）

`verdict` 是 Registry 的通用决策词汇，不是 invert 专用：

- `'invert'` = **该候选动作生效**（对 hide 即"藏起来"，对 mask 即"盖住"）
- `'keep'` = **该候选动作不生效**
- `'skip'` = 维持 v3.x 既有语义（永不处理）

对 `invert` / `bgInvert` 而言前两者与字面一致。新增动作时沿用这套语义，不要另发明 `'on'` / `'off'`。

### 4. 执行器契约

```js
{ id, attr, scope: 'element'|'page', defaultEnabled,
  apply(el, params, source), revert(el), isActive(el) }
```

- `attr: null` 表示该动作不写元素属性。**`keep` 刻意不写属性** —— 若给每个"保持原样"的元素写标记，
  全动作关闭时的页面属性写入会比 v4.6.1 更多，破坏「默认零回归」。
- `apply` / `revert` 必须**幂等、不抛异常、不查布局**（不得出现逐元素 `getComputedStyle`）。
- 元素动作一律经 `applyFlagAction` 或同类写点，**不得在别处直接 `setAttribute`**。

### 5. 动作级手动结论（v5.0 阶段 B）

每种动作有自己的"用户手动表态"属性，**不能共用一个状态位**（"手动藏了"与"手动反色了"是两件事）：

| 动作 | 手动作用域属性 | on / off |
| :--- | :--- | :--- |
| invert / bgInvert / keep | `data-svi-manual`（属性 ∪ src 键, v4.6 语义不变） | `invert` / `restore` |
| hide | `data-svi-manual-hide` | `hide` / `show` |
| mask | `data-svi-manual-mask` | `mask` / `clear` |

### 6. 遮罩的唯一定义处

`MASK_PRESETS`（JS）是遮罩风格的**唯一真源**，CSS 只消费 `:root` 变量（`syncMaskVars()` 注入）。
**不要在 CSS 里另写一份预设值** —— 两处定义必然漂移。v5-5 的加载前 pending 遮罩必须复用本表。

伪元素优先（`[data-svi-masked]::after`，零 DOM 节点、随元素跟随、无 z-index 问题）。
**元素 `::after` 已被站点占用时：跳过该元素的遮罩并提示，不去 append 子节点** ——
往站点元素里塞子节点会改动其 DOM 结构（影响 `:first-child` / `:last-child` 选择器与站点脚本的
`childNodes` 假设），与本项目「绝不触碰站点结构」的纪律冲突。

### 7. 测试遮罩过渡的坑

> **⚠ 本条原先把根因写错了，v6.5 已更正（2026-09-27 实测复现 + 定位）。**

遮罩 `::after` 确有 `transition: opacity 140ms`，**施加遮罩后立刻 `getComputedStyle` 读到的是过渡
中间值**，读不到目标值 —— 这一半是对的。

但当时观察到的「`dim` 预设读到 `1` 而非 `0.75`」**不是过渡中间值**：`1` 是**上一档 `solid` 的值**。
真实根因是 **`data-svi-masked` 当时还停在 `solid`** —— 属性写入走**写点仲裁**，并不同步落地。
原结论「等 400ms 固定睡眠即可」因此在负载下会偶发红（2026-09-27 复现一次，复跑即绿）。

**正确的等待分两段，且顺序不能反**：

```js
// ① 先有界轮询"属性到位" —— 这是**必须为真**的条件, 不能靠赌
const waitAttr = async (want) => {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (el.getAttribute('data-svi-masked') === want) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
svi.ACTIONS.mask.apply(el, { style: style }, 'manual');
out[style] = { attrInTime: await waitAttr(style) };
// ② 属性到位后, 再等那个**有界延时** (140ms 过渡) 结束
await new Promise((r) => setTimeout(r, 400));
const cs = getComputedStyle(el, '::after');
```

**把「必须为真的条件」与「有界延时」分开处理**是这条的关键。收益不只是不抖：
诊断力也变了 —— `apply` 真没写入时报的是「attr 2s 内没变成 `dim`」（**产品缺陷**），
而不是一个看起来像「opacity 值不对」的假象（**测试计时**）。

配套要求：三档预设**各自**断言 `data-svi-masked` 等于该档 id（原先只断言了 `solid`），
否则「读到上一档的值」这类错位会被漏掉。

### 8. 新增动作的清单

1. `ACTIONS` 加执行器（`defaultEnabled: false`，保守）
2. `actionEnabled` 的语义确认（需要新偏好吗？还是一如 `peek` 复用既有键？）
3. `SOURCES` 若需承载规则 → `learned` 来源加分支 + `RuleLearner.record` 白名单加项
4. `state` 默认值 + `loadState` 规范化（**枚举白名单内联，不要用依赖 `const` 表的函数 —— 会撞 TDZ**）
5. CSS（消费 `:root` 变量，不写死预设值）
6. UI 一行（`buildActionsSection`）+ 关闭时的 `teardown(id)`
7. `test.js` 单测（执行器 / 开关矩阵 / 手动作用域 / 关闭即回滚）
8. `test-browser.js` 场景（落点 + computed 样式 + 开关即回滚）

---

## v5.2 Additions (撤销栈契约)

> 任务 v5-2。**任何"可逆"类功能之前先读本节。**

### 1. 撤销 = 反事实回退 **+ 持久化用户否决**（这是本片最重要的教训）

只摘属性 + 删决策快照是**不够**的：像素证据没有任何变化，下一次扫描会得到完全相同的结论，
撤销随即被撤销掉 —— 等于没撤销。**bench 立刻把这一点照了出来**（`Scenario 26` 初版断言
"撤销后 checked 为空"，实际 400ms 内元素已被重新标记并重新反色）。

正确语义 = 摘标记 + 清 `data-svi-checked-src` + 删 `decisionBySrc` + **写一条"用户否决"结论**
（元素级 `data-svi-manual='restore'` + src 级 `manualOverrides[host|src]='restore'`），
与「Alt+点击还原」同语义。`remember=false` 保留纯机械回退路径供内部工具/单测使用。

> 泛化：本项目里**任何"回退"都不能只回退状态** —— 只要产生原状态的那份证据还在，
> 回退就会在下一轮被推翻。回退必须同时**落下一个否决结论**。

### 2. bench 断言"回退"时的两个坑

- **别断言"清干净了"**：回退后元素会被合法地重新判定一次（`checked-src` 会再次写入）。
  断言应该是**"不再处于被回退的那个状态"**（如"不再反色"），不是"标记为空"。
- **别用会被前序场景污染的元素**：本 bench 会通过 Alt+点击留下 `manualOverrides`，
  而手动结论在回退时仍然占优 —— 拿这类元素做断言会把"手动占优"错读成"回退失效"。
  选取断言目标时要排除：元素带 `data-svi-manual`、或其 `src` 在 `manualOverrides` 里。

### 3. 撤销栈边界（刻意如此，不是遗漏）

- **仅内存**（标签页隔离，与 `runtime` 同纪律）：刷新即清空；
- **只记自动结论**：`NON_AUTO_REASONS = { manual, element-rule }` 不入栈 ——
  提供"撤销用户自己"没有语义。本项目里 **`reason` 码同时充当来源标签**（v5.1 SOURCES 的设计），
  所以判断"是否自动"直接查 reason，不需要另加 source 字段；
- **只记有可见状态的结论**（`verdict === 'invert'`）：keep / skip 没有东西可回退。

### 4. 提示层：新节点，不复用 `showToast`

`showToast` 是 `pointer-events:none` 的纯展示节点，且被 v4.6 断言覆盖。可交互提示用
**独立节点** `#svi-action-toast`（`pointer-events:auto`）。

**只在批量时提示**（≥3）：单张自动反色原本就不弹提示，每张都弹会变成噪音。
批量撤销走 LIFO 逆序连续回退。

### 5. 新增开关要问"它是不是真源"

`peek` 与 v5.2 的四个开关都刻意**没有**新增独立的 `state.actions.*` 条目：
`peek` 的真源是既有 `hoverRestore`，撤销相关的真源是 `state.undoEnabled` 等顶层偏好。
**不要为同一个语义造两个可写点** —— 两个开关控制同一件事必然互相打架，
且面板回显契约（v4.5 修过）会变成两处要同步。

### 6. 哨兵只记录与提示，不自动写规则

自动写规则会把"一次点击"放大成"永久决定"。同 `src` 重复还原时给出**说明性提示**
（解释"为什么它不再反色" —— 该结论本就已由 `manualOverrides` 持久化），
同 `stem` 重复还原时提示"可一键固化"，由用户在列表里显式选择。

---

## v5.3 Additions (数据闭环契约)

### 1. 新增可选来源一律靠 `enabled()` 退场，**不要从表里删条目**

`SOURCES` 现在有 10 条，其中 `learnedStrong` / `learnedWeak` / `shapePrior` 是**可选**的
（各带 `enabled()`）。做法是：条目**常量存在**，由 `enabled()` 决定是否参与。

理由：表的结构是"优先级链的完整形状"，删条目会让 `effectiveSourceIds()` 与结构断言无法
分离"结构"与"生效集合"两件事。**零回归的断言方式是断言 `effectiveSourceIds(stage)`**：

```js
// 默认（分级关、先验关）时必须逐项等于 v5-1
assert.deepStrictEqual(svi.effectiveSourceIds('rule'),
  ['learned', 'seedProtect', 'faviconSkip', 'seedForceInvert']);
```

### 2. 两条路径的阈值**不是同一组**（本片踩到的坑）

| 路径 | 阈值字段 | 默认 |
| :--- | :--- | :--- |
| **图片**浅色判定 | `imgLumCutoff` / `imgAreaThreshold` / `imgTolerance` | 180 / 48 / 35 |
| **视频**白底判定 | `whiteThreshold` / `lumThreshold` | 60 / 210 |

`whiteThreshold` / `lumThreshold` **只影响视频**。写阈值相关功能前先确认字段属于哪条路径 ——
本片初版把图片侧的校准写成了视频侧字段，靠"站点档案透传"的断言才暴露出来。

站点级阈值覆盖经 `resolveSiteProfile()` 透传 → `getEvalPrefs()`（图片路径）/
`LuminanceDetector`（视频路径）消费。**透了才生效** —— 只写 `siteOverrides` 不接透传
等于静默无效。

### 3. 校准只自动收紧（风险不对称）

- **收紧**（抬高阈值 = 更少东西被判为浅色 = 更少误反）→ 可自动；
- **放松**（更多反色）→ 只计算与展示，必须用户点。

理由：收紧错了只是少反几张（用户还能 Alt+点击），放松错了会在用户没要求时把东西反过来。

### 4. 规则合并取**大**不累加

`mergeRulesInto` —— 一致取 `max(hits)`，冲突保留 hits 高者，相等留本地。

**累加会让一份分享的规则包变成权重放大器**：反复导入同一文件即可把某条规则刷成强规则，
这是可被利用的污染。**幂等性是这条契约的验收方式**（重复导入同一文件权重不变）。

### 5. 测试写法：`returnByValue` 前的引用陷阱

`Runtime.evaluate(returnByValue: true)` 是**在 return 时**序列化的。若在返回对象里放了
一个"稍后会被别处改动的对象引用"（例：先捕获 `const ov = state.siteOverrides[host]`，
之后调用 `reset()` 删掉了字段，最后才 `return { ovLum: ov.imgLumCutoff }`），
读到的是**删除后的状态**。必须**即时取值**（`const ovLum = ov.imgLumCutoff` 紧跟在
赋值/应用动作之后）。本片据此误判过一次"收紧没生效"。

### 6. 诊断行必须在打开面板时刷新

`refreshActionsSection()` 由 `openSettingsModal` 调用。诊断/统计类文案若只在构建时渲染，
会停留在旧值 —— 与 v4.5 修过的"设置行不回显"是同一类缺陷，**每次新增诊断行都要接进刷新链**。

---

## v5.4 Additions (提前判定契约)

### 1. 视频判定：**只加门，不改默认路径**

`frameSequenceDecision(win, opts)` 返回 `{ whiteFlash, earlySwitch, ... }`，两个门全 false 时
调用方**必须原样采用单帧判结果**。这是把回归面压到最小的唯一做法 —— 改"整体判定方式"会让
所有既有视频场景无法逐帧解释。

**两个门的优先级：`earlySwitch` 先判。** 否则"暗→白的真实场景切换"与"转场白闪"在窗口形态上
完全相同，会被一起压掉。这是实现时纠正过的错（见 implement.md 偏离 1）。

### 2. 两条采样路径**必须共用同一判定函数**

`onFrame`（rVFC 逐帧）与 `tick`（250ms 兜底）在互斥切换时若各用各的判定，结论会抖动。
`HILStateMachine.detectSequenced()` 是唯一入口。

### 3. 序列窗只在状态机内累积、容量 ≤8、只存数值

热路径（每帧）不得分配对象、不得查布局。窗口用 `push` + `shift` 维护，长度上限固定。

### 4. 动图：**先闸门后付费**，且三个纯函数分离

| 纯函数 | 职责 |
| :--- | :--- |
| `animatedProbe(el, opts)` | 廉价闸门。**采样结果由调用方传入**（保持纯函数，不碰 DOM） |
| `animatedSpectrum(frames, opts)` | 全帧谱三分类。**混合型默认 keep** |
| `animatedStride(frameCount, cap)` | 分帧步长。**等间隔抽帧，不是"只解前 N 帧"** |

抽帧方式很重要：只解前 N 帧会**系统性偏向"开头是白底"的动图**，而场景切换往往在后面。

### 5. 混合型动图**不做逐帧切换**，且必须如实标注

CSS `filter` / `content:url` 都无法按时序切换。"按多数帧近似"是选项，不是等价物 ——
面板与 README 都要写明这一点。**不假装能做到**是本项目的硬要求。

### 6. 能力降级必须静默且可观测

`ImageDecoder` 缺失 → 返回 `null`（交回静态判定，行为等于上一版）+ 记一次
`animDecoderUnavailable` 供面板说明。**绝不抛错**（`analyzeAnimated` 整体包在 try/catch 内，
且 `typeof ImageDecoder !== 'function'` 是第一条判断）。

### 7. bench 断言的两条经验

- **别断言硬编码的控件数量**：v3.3 的"9 个滑块"断言在本片加两行后假失败。改为
  「下界 + 关键行标签都在 DOM 里」—— 这才贴近断言的**本意**（滑块没被折叠抽屉藏起来）。
- **别依赖被前序场景改过的开关**：`StatsManager.count()` 在 `state.statsEnabled === false`
  时是 no-op，而某个前序场景会把它关掉。断言计数类行为前要在场景内显式打开并还原。
- **判可见性不要用 `offsetParent`**：对 `position: fixed` 容器内的元素恒为 `null`。

---

## v5.5 Additions (加载前遮罩契约)

### 1. 默认值会**掩盖迁移分支**（本片最值得记的一条）

三档 `flashGuardLevel` 要从旧布尔 `flashGuard` 迁移。初版写成：

```js
if (['off','document','media'].indexOf(merged.flashGuardLevel) === -1) {
  merged.flashGuardLevel = (merged.flashGuard === false) ? 'off' : 'document';
}
```

**永远不执行** —— 因为 `merged = {...defaults, ...stored}`，而 `defaults.flashGuardLevel` 已经是
`'document'`，`merged` 里**永远有合法值**。

正确写法要判**存储里有没有这个键**：
```js
const rawLevel = (safeStored && typeof safeStored === 'object') ? safeStored.flashGuardLevel : undefined;
if (['off','document','media'].indexOf(rawLevel) === -1) { /* 迁移 */ }
```

> 泛化：**任何"字段缺失时从旧字段迁移"的逻辑都必须读原始存储对象，不能读合并后的对象**。
> 这条由单测直接钉住（`flashGuard:false → 'off'`）。

### 2. `sec` 不一定是 `ui.section()`

`buildDynamicThemeSection` 的 `sec` 是**裸 `document.createElement('div')`**，用
`sec.appendChild(row.row)`；而其它区块用的是 `ui.section()` 返回的 `{el, add}`，用 `sec.add(row)`。

混用会让**整个设置弹窗构建失败**（错误被吞掉，只表现为"弹窗不存在"）。
bench 场景 1 的 `UI Settings Modal: ✗ Missing` 是这类错误的唯一表征 ——
**改任何模态区块前先确认该方法的 `sec` 是哪一种**。

### 3. 打标路径：零布局、纯 CSS 门、集合兜底

- 打标只写属性，**绝不读布局**（不调 gBCR / gCSS）—— 它在 MutationObserver 回调里，属热路径；
- 灰罩门是**纯 CSS**（`html[data-svi-masking] [data-svi-pending]:not([data-svi-settled])`），
  摘罩只需摘属性，不需要删样式；
- `settleAll` 走**维护的元素集合**而不是全文档 `querySelector` —— 更快，且不依赖 DOM 查询能力
  （否则 Node 单测无法覆盖）。

### 4. 形态能力差异必须显式，且要有断言

用户脚本 `@run-at document-end` 时首屏已渲染 → **刻意不做首屏扫描**（`tag` 只由
MutationObserver 触发）。这样"首屏不被打标"是**结构保证**而不是运气，并可用 bench 断言
（Scenario 29b：`before === 0`）。

### 5. 逃生通道的优先级

`Esc` 只在 `pendingMask.count > 0` 时接管 —— 否则会抢掉"关闭弹窗 / 取消区域遮罩武装态"。
**新增全局快捷键/全局 Esc 行为时必须插在既有链的合适位置，不能无条件拦截。**



---

## v6.5 Additions (测试脚手架契约：绿不是通过，是没跑)

> 任务 v6-5 收尾期。**任何改动 `test.js` 异步用例块、或新写「等待异步落地」的断言之前，先读本节。**
> 本节管的是**脚手架的诚实性**：断言必须真的被执行、失败必须真的变红。

### 1. 「绿不是通过，是没跑」：`test.js` 的三道假绿闸门

`test.js` 的收尾方式（末尾 `setTimeout(…, ASYNC_BUDGET_MS)` → `process.exit(0)`）决定了
**任何异步用例都可能被静默丢下**。三道闸门必须同时在场，缺一条就会产生假绿。

| # | 闸门 | 契约 | 缺失时的后果（都实测过） |
| :--- | :--- | :--- | :--- |
| ① | **预算不变量** | `ASYNC_POLL_MS < ASYNC_BUDGET_MS`，收尾处自检 | 轮询 deadline 比预算长 → 超时分支**永不执行**，是死代码 |
| ② | **轮询台账** | 每个 `pollUntil` 开/关各记一次；收尾时 `pollFinished !== pollStarted` → `exit(1)` 点名 | 「没跑完」被读成「通过」 |
| ③ | **同类不等长** | 新加的有界轮询**必须**走 `pollUntil`，不得自带 `deadline = Date.now() + N` | 自带 deadline 会绕过 ① 的自检（实测原有三处：2000 / 3000 / 3000ms vs 当时 1500ms 预算 —— **全是死代码**） |

**实测证据（2026-09-27）**：闸门 ① 之前，`chunked key has meta manifest` 与
`quota failure degrades backend to chrome-local` 两条断言分别以 **13% ~ 50%** 的概率
**整块不执行**，而运行照样打印 `✓ All … passed successfully!`、退出码 0。
补上闸门后，同一份代码立刻显形为**红的** —— 这才是它本来的样子。

### 2. 固定等待 → 有界轮询：不是放宽断言

判据（问一句：**我等的这件事是不是"某个条件成立"？**）

- 是 → 用 `pollUntil(pred, cb)`（条件成立立刻往下走，绿路径反而更快）
- 否（真的是有界延时，例如 140ms CSS 过渡）→ 固定睡眠可以留，但**必须放在条件到位之后**

`pollUntil` 的契约：

- **超时后走同一组断言**，绝不吞失败 —— 真实缺陷（期望状态始终不出现）照旧变红；
- 期望值一个都不许动。改的是测试自己的计时器，不是判据。

### 3. 测试桩的存活期不能按固定时长算

**症状**：`quota failure degrades backend to chrome-local` 偶发红。
**根因**：用例把桩 `global.chrome` 的清理写成
`finally { setTimeout(() => delete global.chrome, 300) }`。桩是**配额错误被识别的前提** ——
`_makeChromeApi.lastError()` 读的就是 `chrome.runtime.lastError`，`_degradeToLocal` 还要求
`chrome.storage.local` 在场。而**分片写链是十几次串行的 1ms 模拟往返**，在定时器洪峰下
单次往返实测要几十毫秒 → 它常常跑不完这 300ms：桩先被删 → `lastError()` 读不到配额错误
→ 判定「写成功」→ **不降级**。
**修法**：桩的存活期 = **本用例的执行期**，在轮询回调里摘
（`try { verify(); } finally { dropChromeStub(); }`），同步阶段抛错时也要摘（外层 `catch`）。
**不要猜时长。**

### 4. 新增 / 修改异步用例块的清单

1. 等待写成 `pollUntil`；自带 deadline 的写法一律不许
2. 轮询条件取「**断言真正依赖的完整状态**」，不取最小的那个键。
   例：等分片**删除**时不能只等逻辑键 `svi:K` —— 实测它**先**被摘掉，`meta` / `#i` 后摘；
   条件要写成「三个键全没了」。否则轮询会提前返回，把「未摘干净」读成缺陷 —— **误报**
   （本轮真踩到过，被新加的断言当场咬住）
3. 用到的全局桩，存活期**绑在用例完成**上，不能是固定时长
4. 做完负向对照（见 §5）—— 改完必须证明它**还会红**

### 5. 改测试脚手架时的负向对照（必须做）

| 对照 | 注入的「错」 | 期望 |
| :--- | :--- | :--- |
| 断言敏感度 | 产品侧停用被守护的行为（如不摘 `meta` / 不降级） | 红，且报的是**被守护的那条**断言 |
| 轮询超时可达 | 把 `pollUntil` 的下一跳改成一个远超预算的延时 | `exit(1)` + 台账点名「N 个有界轮询没有走完」 |
| 预算不变量 | `ASYNC_POLL_MS >= ASYNC_BUDGET_MS` | `exit(1)` + 「脚手架自身不自洽」 |

**为什么必须做**：本轮四个对照里，有一个（`chunked key has meta manifest` 的元凶）
在修复前**跑出来是绿的** —— 没有对照，这个假绿会一直躺在门禁里当"通过"。

### 6. Wrong vs Correct

#### Wrong

```js
// ① 固定睡眠赌"已经写完了"; ② deadline 长于收尾预算(死代码); ③ 桩按固定时长清理
st.set('chunked', v); st.flush();
setTimeout(() => {
  assert.ok(snap['svi:chunked.meta'], 'chunked key has meta manifest');
}, 300);
const deadline = Date.now() + 3000;                 // > 预算 1500ms → 永不生效
setTimeout(() => { delete global.chrome; }, 300);   // 写链还没跑完, 桩就没了
```

#### Correct

```js
pollUntil(                                          // 条件成立即走; 超时走同一组断言
  () => !!mock.__snapshot()['svi:chunked.meta'],
  () => { try { verify(); } finally { dropChromeStub(); } }   // 桩跟着用例走完
);
// 且 ASYNC_POLL_MS(2000) < ASYNC_BUDGET_MS(3000); 收尾处自检 + 台账核对
```

## 0.6.6 Additions（启动时序 · 工作区行尾 · 门禁口径）

### 1. 启动动作必须在**它依赖的状态**就绪后重放（不是只在根就绪时跑一次）

本项目已有两条先例：`whenRootReady` 之于根节点、`Store.onRemoteLoaded → reapplyPrefsFromStore` 之于偏好。
0.6.6 修掉的是**同一约定的漏项**：元素 pending 遮罩的武装依赖「远端偏好（`flashGuardLevel` 的 `media` 档）
+ 本站样本（`siteMediaStore`）」——两者都要等 `Store.init()` 异步装载完成；而它唯一的武装点
`whenRootReady(setupPendingMask)` 在根就绪（≈`document_start`）时读到的还是**引导期默认档**，
于是早退且此后再无重放，扩展形态下该档**永不生效**（用户脚本形态因同步后端在构造期即装载而不受影响，
所以缺陷只在插件形态显形 —— 这类「只在异步后端形态显形」的漏项最容易漏测）。

约定（照此检查任何新的启动动作）：

- 依赖的异步状态有几类：**根节点** / **远端偏好** / **远端统计样本**。分别确认各自的重放点存在；
- 重放点上的动作**必须幂等**：复用既有守卫（如 `data-svi-masking`）、不得新增状态位；
- 用户显式选择的档位要能被**跨界面同步**（`chrome.storage.onChanged`）触发重放，否则「设置页改了、开着的页面不生效」；
- 只依赖**已装载状态**的读取不得**永久记忆**未就绪时的空值（`siteMediaStore.load()` 的记忆化就踩了这个），
  否则同一页内永远读不到真值。

### 2. 本机工作区行尾陷阱（假红/假绿的常见来源）

本仓 blob 实为 **CRLF**（`git cat-file -p HEAD:<file>` 逐行含 `\r`），而本机 `core.autocrlf=true`。

- **任何**让 git 触碰工作区文件的操作（`git checkout` / `git apply` / `git stash push|pop`）都会把工作区写成 CRLF；
- `test.js` 里有**源码扫描正则**（如 `/class UIController \{([\s\S]*?)\n  \}\n/`，要求 `}` 后紧跟 `\n`）
  与**构建产物逐字节比对**（`extension/popup.html` 里的 token 块 ↔ 用户脚本块）——CRLF 会让它们**假红**，
  且报错文案看着像真实缺陷（`R1b: 必须能定位 UIController 类体` / `R1: … 必须与用户脚本逐字节一致`）。
- **配方**：git 动作之后 → 文本文件归一到 LF → **重新** `gen-icons` + `build-extension` + `pack` → 再跑门禁。
- `git diff` 在两种行尾下都归一化为**内容级**差异，所以提交本身不会被行尾污染（但门禁会被）。

### 3. 门禁汇报三分口径（不得混算）

跑测试套件时必须区分三类，否则会同时造成「把未覆盖当绿」与「把抖动当产品回归」：

| 类别 | 判据 | 是否算红 |
| :--- | :--- | :--- |
| 真红 | 打印具体断言名 | 是 |
| SKIP 未验证 | `SKIP: 未验证 (CDP 未就绪)`（文档化降级路径，exit 0） | 否，但必须计入「未验证」次数 |
| 基础设施抖动 | `CDP 超时`、`等待超时: 探针攒够 60 帧`（rAF 停滞） | 否，但必须单独计数点名 |

另：**固定等待是概率，不是时长**（把 30ms 加到 300ms 仍是偶发）——凡「等某个异步写入/装载」，
一律用有界轮询等**状态**（谓词取断言依赖的**完整状态**，如「能重组出 `brightness=0.77` 的 `svi:prefs`」），
超时后走同一组断言、如实报红。

## 0.6.7 Additions（结构性豁免的单一实现点 · 有界轮询的谓词完备性）

### 1. 「按像素亮暗落反色」的每一条路径都必须过同一套结构性豁免

**契约**：任何"看像素亮暗 → 决定反不反色"的入口，在像素判定之前必须过**同一份**结构性豁免；
判据只有一份实现（`passesCoverGuard`），入口不得各写一份。

**为什么**：两条路径各写一份策略必然漂移，而漂移的表现是**用户可见且难以归因**的——
同一张浅色图用 `<img>` 渲染被判「封面→跳过」，换个渲染方式（`background-image` / `<video poster>`）
就按像素亮暗整张反色。B 站收藏夹/播放列表的封面整片被反色正是这条漂移（2026-09-27 修复）。

| 入口 | 必须过豁免 |
| :--- | :--- |
| `ImageInvertEngine.decideImage`（img / SVG image / input[type=image]） | 是（`classifySmallElement` + `passesImagePolicy`） |
| `BgImageEngine.processEl`（`background-image`） | 是（`passesCoverGuard` + `buildBgGuardInfo`） |
| `MediaCoverageEngine.processPoster`（`<video poster>`） | 是（同上；列表页里海报即封面） |
| `MediaCoverageEngine.processCanvas`（`<canvas>`） | **刻意不豁免**：canvas 内容是程序化图表/示意图，不是摄影封面；且 8×8 探针本就要求不透明像素 ≥ 8 |

**声明式优先**：站点档案 `bgImageSelectors` 是显式声明（"这些背景图就是要反的"，如 B站评论缩略图
`.b-img__inner`），**压过**启发式豁免。判定时必须只对该清单求 `matches`，
不得把 `[style*="background"]` 泛化发现混进去 —— 泛化发现正是豁免要拦的那一类，混入会让豁免永不生效。

**已知不对称（刻意保留，勿"顺手修"）**：背景图路径**没有**最小尺寸/重复贴图门
（`classifySmallElement` 的 `tiny` / `below-min` / `repeated-small`）。
原因是背景图路径的尺寸语义与 `<img>` 不同（评论缩略图刻意要反）。要收紧必须作为独立任务**两条路径一起**收。

**可观测**：豁免必须计数（`bgCoverGuarded` / `posterCoverGuarded`）并有中文原因码
（`SKIP_REASON_ZH['bg-cover']`）。静默跳过等于用户无从知晓。

### 2. 有界轮询的谓词必须取**终态**，不能取"某个标记出现了"

上一条说「有界轮询等状态」；本条的教训是**等的必须是终态**：

- 本项目有"临时结论"这一层（档 B 的 `keep/local-context`，带 `provisional: true`），
  它**也会写 `data-svi-checked-src`**。以"有标记"为谓词 ⇒ 把**升级窗口**读成产品缺陷，
  连续产出多种形态的假红（2026-09-27 实测三次不同红因）。
- 正确谓词 = 断言真正依赖的**权威**状态：`decisionBySrc` 里**非 provisional** 的结论
  （或已登记失败），外加另一条异步链的权威证据（如背景图引擎的 URL 结论缓存）。

推论：**报告必须能区分"没有属性"与"元素不在 DOM"、"空串属性值"与"无属性"**，
并把引擎内部态（理由码 / provisional 标记 / pending 集合 / `complete`+`naturalWidth`）打进出错现场。
只打印一个布尔，等于把红因留给下一轮猜。

## 0.6.8 Additions（第三方固化产物 · 同功能引擎的协作 · 并发会话下的门禁隔离）

### 1. 固化第三方产物必须**可验证**，否则"冻结"只是口号

引入第三方代码时，本仓的纪律是：

1. **逐字节拷贝**上游发布物到 `vendor/<name>/`，**禁止手改**；
2. 同目录放 `PROVENANCE.md`：上游仓 / 发布渠道 / **版本** / tarball URL 与其 SHA-256 /
   **文件 SHA-256 与字节数** / 冻结日期 / 升级步骤 / **已知边界**；
3. 一个零依赖的 `scripts/vendor-<name>.js`：`--verify`（默认）比对哈希、
   `--update <ver> [--yes]` 拉取并重算溯源表（不加 `--yes` 只预演）；
4. **校验接入 `test.js` 门禁** —— 篡改即红，且必须同时打印"记录哈希"与"实测哈希"。

双形态约定：CLI 直跑失败 `exit(1)`；被 `require` 时**抛错**（好让它能被摘成一条断言）。

**为什么**：不跟随上游是对维护成本的正确取舍，但代价是"我们手里的这份到底是什么"会失去约束。
溯源表 + 哈希门禁就是那份约束。

### 2. 与"同功能第三方引擎"共存时：协作而非叠加，且**绝不劫持**

页面上可能已经存在做同一件事的第三方（如用户自己装的 Dark Reader）。纪律：

- **让位优先**：对方已在跑 ⇒ 本插件**完全不介入**该能力（不 enable 也不 disable）。
  两套滤镜叠加的观感损伤比"少管一件事"严重得多。
- **绝不劫持**：只有"本插件请它开的"那一次才由本插件关 —— 必须记账（`owned`），
  **收尾不得关掉用户自己开的那个**。这条要有专门断言。
- **缺席等价**：对方不在场时，决策函数只返回"走自有路径"这一支，
  逐字节等价于引入前的行为。绝大多数用户属于这一类，等价性是这类改动唯一的安全底座。
- **决策是纯函数**：`pickXxxPlan({present, rivalEnabled, owned, want, pref})` → 分支字符串，
  单测矩阵覆盖四象限；执行层只做副作用与失败回退。
- **失败回退**：第三方 API 抛错 ⇒ 回退自有路径 + 计数，绝不因第三方异常而整体失效。

### 3. 并发会话下的门禁隔离（本机多会话同时跑同一套 bench）

固定资源（端口 / profile 目录）会让并发的两轮跑动**互相破坏**，而且失败形态**无法归属**：
- CDP 端口相同时，后来者会把前者的 Chrome 当"遗留实例"关掉（脚手架本就有这个清理逻辑）；
- 共用 profile 目录时，两轮都会 `rmSync` 对方刚写下的 localStorage。

表现是"页面完全没加载 / 夹具全部 missing / 偏好存活类断言随机红"——看起来像产品缺陷。
**配方**：脚手架必须让这几个资源可经环境变量覆盖
（`SVI_PORT` / `SVI_PORT2` / `SVI_CDP_PORT` / `SVI_PROFILE_DIR`），并发时把自己隔离到另一组。

### 4. 夹具不要依赖环境残留

bench 的 localStorage 在**同一轮内跨导航持久**：前面场景种下的偏好会让后面场景的
"前提断言"（如"这个能力此刻是关的"）直接不成立。**配方**：进入场景先**等 boot 完成**
（`window.__svi && __svi.enginesBooted`），再**显式写基线**，不要依赖"应该是默认值"。

另：`StatsManager.count` 在 `statsEnabled === false` 时是 **no-op**，而 `statsEnabled` 会被
别的场景关掉并留在 localStorage 里 ⇒ 计数断言以 `0 → 0` 变红，**看上去像产品没计数**。
夹具要断言计数时，显式把 `statsEnabled` 打开。
