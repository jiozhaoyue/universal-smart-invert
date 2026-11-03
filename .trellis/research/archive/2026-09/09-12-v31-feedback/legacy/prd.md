# PRD: v3.1 Feedback Hardening

Source requirement (user feedback, translated):

> 1. On GitHub repo pages like sublinkPro's README the script seems not to work — investigate.
> 2. Sometimes image inversion doesn't take effect.
> 3. Some media elements can't be clicked/Alt+clicked (nested under overlays) but are visible —
>    provide a way, e.g. a "current page media" settings page listing them.
> 4. What should the default mode be — whitelist or blacklist? (User's bilibili usage: course/PPT
>    videos benefit from smart inversion; normal UP主 video pages are full of covers that should
>    mostly stay original even when light; manual tuning works but they want smart handling of
>    likely-white content, i.e. decide WHEN to invert by default, optimize for common sites and
>    generalize.)
> 5. Add a setting so hovering an inverted image does NOT reveal the original.
> 6. Adapt to hover-zoom/viewer extensions (浮图秀-like) so the enlarged view stays inverted.
> 7. "and some more" — open-ended polish.

## Requirements & Acceptance Criteria

### R1 — GitHub / SPA initial-viewport fix (grounded by live probe, research/live-probe.md)
- Eager initial processing: images that are complete and ≥ min size get processed without waiting
  for viewport intersection, within a budget (config `eagerScanBudget`, default 80); IO margin
  stays for the rest. First paint of a README must show content images inverted without scrolling.
- Decide-once consistency: identical inputs must produce identical invert/skip decisions
  regardless of which pass processed them (fixes the probe's badge flip, F3). Re-evaluation only
  via explicit cache clear.
- Bench (offline, GitHub-like local page): badge grid + below-fold screenshots; assert initial
  state (before any scroll): all eager-processed content images inverted AND badge decisions
  equal to post-scroll decisions.
- README gains a troubleshooting entry (stale TM install / private-repo update 404, F4).

### R2 — Reliability audit ("sometimes images don't invert")
- Audit and fix the full decision path: single decision function; `data-svi-checked-src` set
  only after a decision; failed analyses retry with bounded TTL; load-event handling for
  late-loading images; mutation flush re-observes; no stuck hover/fx state.
- **AC**: bench scenario exercising rapid dynamic additions + late loads + re-checks yields
  deterministic results across two fresh runs.

### R3 — 当前页媒体 inspector (for unclickable/overlay-nested media)
- New modal section listing all detected media on the page: type (img/canvas/svg/video/bg-img),
  rendered size, short src, current state (已反色/原样/跳过原因). Per item: 反色/复原 toggle,
  定位 (scrollIntoView + temporary outline flash). Refresh button + item cap (200, load more).
- **AC**: bench opens the section, asserts items listed for known page, toggle flips the media
  state, 定位 scrolls to the element.

### R4 — Smart default policy for image inversion (user's "什么时候该反")
- New `imagePolicy: 'balanced' | 'conservative' | 'aggressive'` (default **balanced**):
  - aggressive = v3.0 behavior (size gates only);
  - balanced = content-context OR (maxDim ≥ 96 AND NOT grid-repeated (≥4 same-class/same-size
    siblings in a grid/flex row) AND NOT chrome-context (nav/header/card-link cover patterns));
  - conservative = content-context OR maxDim ≥ 200.
- forceInvert (seed) and learned rules still override policy; manual Alt+click always wins.
- Global `siteMode` default stays **'all' (blacklist semantics)** — documented rationale: a
  whitelist default makes the script dead on unconfigured sites; granularity comes from the
  image policy + video smart detection + per-site overrides. bilibili covers skip via the grid
  heuristic without a hand rule (validated on a local bilibili-like grid page).
- **AC**: unit tests per mode; bench: a cover-grid page inverts nothing in balanced mode while a
  lone large white diagram inverts; aggressive mode inverts the grid images.

### R5 — Hover-restore on/off setting
- `hoverRestore` pref (default true = current behavior). When false, hovering an inverted image
  (CSS-filter path AND fx content:url path) keeps the inverted view.
- **AC**: bench toggles the setting; computed hover state no longer restores; toggling back works.

### R6 — Hover-zoom/viewer extension compatibility (浮图秀-like)
- Alt+click uses `event.composedPath()` so elements inside (closed) shadow roots can be toggled.
- Fast-path: dynamically added media whose src already has a cached decision gets its attribute
  synchronously in the mutation flush (viewer overlays appear inverted instantly).
- Bg-image engine confirms coverage for extension overlay elements (inline style background-image
  near body end).
- **AC**: bench simulates a viewer extension: appends a closed-shadow-root host containing an img
  with an already-seen src → inverted without scroll/click; Alt+click inside that shadow root
  toggles it; an overlay div with background-image of a seen light src → inverted.

### R7 — Version/docs
- v3.1.0 header + descriptions; README/README_EN: 当前页媒体 / 智能图片策略 / 悬停原图开关 /
  viewer 适配 + GitHub 不生效 troubleshooting (F4). All v3.0 behaviors preserved.

## Out of scope
- Renaming/demoting the builtin seed rule table (done in v3.0).
- Changing video smart detection defaults (already fine per user: course PPT works).
