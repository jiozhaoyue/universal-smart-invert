# Design: v3.1 Feedback Hardening

Base: `universal-smart-invert.user.js` v3.0.0 (~7254 lines). Version → 3.1.0. Preserve all v3.0
behaviors. Live-probe evidence in research/live-probe.md; keep `scripts/probe-github*.js` as dev
tools (proxy-aware, target via argv).

## 1. Decision unification (R1/R2 — the core refactor)

- Extract ONE function `decideImage(img, src)` used by every entry path (IO callback, mutation
  flush, eager pass, refreshSrcCounts aftermath, manual rescan). Pipeline order inside it:
  1. manual override (`svi:overrides`) → apply, done.
  2. learned rule (user > learned > seed precedence) → apply, done.
  3. seed forceInvert / protect match → apply, done (fixes F3: forceInvert must fire on the
     FIRST pass, not only post-scroll passes).
  4. policy gates (R4) + size gates + meta/classifier.
  5. pixel analysis (v3.0 decode chain) → decision.
- Set `data-svi-checked-src` ONLY after a decision is reached; failures get
  `data-svi-failed` + bounded TTL re-check (max 3 attempts, 60s) then permanent skip with a
  recorded reason (stats). The cached decision (light/not-light) is final until
  `clearCacheAndRescan()`; nothing may re-analyze an already-decided src (F3 root cause).
- Repetition/context classification must be computed ONCE per decision from the current DOM
  snapshot and stored WITH the decision, so later DOM changes never flip it.

## 2. Eager initial pass (R1)

- After boot scan: iterate `img, svg image, input[type=image]` that are `complete` with
  naturalWidth > 0, up to `eagerScanBudget` (pref, default 80), queued through the existing
  decision pipeline (priority queue ahead of IO entries). IO rootMargin stays 300px for the tail.
- Below-fold images keep lazy processing (by design) — the fix targets everything ALREADY LOADED
  at boot, which on GitHub READMEs is every image (GitHub does not lazy-load README imgs).
- Mutation fast-path (also R6): in the mutation flush, for any added/changed media whose src is
  in the decision cache, apply the cached decision synchronously (no queue, no re-analysis).

## 3. Media inspector (R3)

- New modal section `🖼️ 当前页媒体` with 采集/刷新 button. Collector (budget 400 elements):
  all `img, video, canvas, svg, svg image, input[type=image]` + elements with
  `data-svi-bginv` + elements whose computed background-image is a url (reuse BgImageEngine's
  candidate scan). Each row: `[类型] WxH · src(截断36字) · 状态`（已反色 / 原样 / 跳过:原因）.
- Row actions: `反色/复原` (toggles via the same override path as Alt+click, incl. composedPath
  resolution), `定位` (`scrollIntoView({block:'center'})` + 1.2s outline flash via injected
  class). List capped 200 + `加载更多`; empty state text when none.
- Rows rebuild on the v3.0 `ui` builders; state text via textContent only (XSS rule).

## 4. Smart image policy (R4)

- Pref `imagePolicy` (default 'balanced') + UI select in ✨效果 (image area) with hint text.
- `passesImagePolicy(info)` pure fn (exported): inputs {maxDim, contentContext, chromeContext,
  gridSiblings, metaIcon}. Grid detection: within the same parent, count siblings sharing
  `offsetWidth/Height ±8px` and same tag; ≥4 → grid. Chrome-context: `closest('nav, header,
  aside, footer, [class*="card"], [class*="cover"], a:has(> img:only-child)')`-style patterns
  implemented without `:has` (walk parent chain, check class hints + single-img-anchor).
- balanced rule: `contentContext || (maxDim >= 96 && !grid && !chromeContext)`; conservative:
  `contentContext || maxDim >= 200`; aggressive: true (v3.0 gates only).
- Seed `forceInvert` entries bypass policy; `protect` entries bypass everything (unchanged).
- Bench: local bilibili-like page (grid of 12 same-size light covers + 1 large lone white
  diagram): balanced → covers skip, diagram inverts; aggressive → covers invert. Unit tests per
  mode incl. grid threshold boundary (4 vs 3).

## 5. Hover restore toggle (R5)

- Pref `hoverRestore` (default true). CSS: the `:hover { filter: none / content: unset }` rules
  are emitted under `html.svi-hover-restore` (class synced from pref). Fx JS fallback path
  checks the pref before toggling.
- UI toggle in 🌙基础 section: 悬停显示原图 (默认开).

## 6. Viewer compatibility (R6)

- Alt+click handler switches `e.target.closest(...)` for `e.composedPath().find(n => n.tagName &&
  /^(img|svg|canvas|video)$/i.test(n.tagName) || n.hasAttribute?.('data-svi-bginv'))` — reaches
  media inside closed shadow roots; existing behavior otherwise unchanged.
- Ensure BgImageEngine mutation scan includes elements added at body end (extension overlays
  append there); add regression bench.
- Bench: closed-shadow host with cached-src img → auto-inverted via fast-path; Alt+click
  dispatch (bubbles: true, composed: true) toggles it; overlay div with background-image of a
  seen light src → inverted.

## 7. Bench additions (all offline/local)

1. GitHub-like page: badge grid (15 × 95×20 camo-style SVGs) + 3 below-fold 3600×2018-ish white
   screenshots + 1 logo; assert BEFORE scroll: all screenshots inverted (eager pass), badge
   decisions stable AND equal after forced rescan; SPA-swap (pushState + content replace) to a
   second "page" re-processes its images.
2. Determinism: run the decision pipeline twice on cloned fixtures → identical results.
3. Media inspector: list contains known items; toggle works; 定位 scrolls.
4. Policy: cover-grid page (balanced vs aggressive), unit-level mode tests.
5. hoverRestore off: hover keeps inversion (both paths).
6. Viewer: closed-shadow fast-path + composedPath Alt+click + overlay bg-image.

## 8. Docs

- README/README_EN v3.1.0: 当前页媒体面板 / 智能图片策略（平衡默认）/ 悬停原图开关 /
  放大镜类插件适配 + 「GitHub 不生效排查」troubleshooting block (F4: check TM version; private
  repo raw 404 breaks auto-update; manual reinstall link).
- `@version 3.1.0`, zh/en descriptions updated (add 当前页媒体/智能策略/悬停开关).
