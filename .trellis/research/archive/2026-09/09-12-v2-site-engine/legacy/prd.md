# PRD: v2.0 Site Engine Upgrade

Source requirement (user goal, translated):

> Tampermonkey script. Force background replacement on sites like 163 without covering the login
> block. Allow more settings options (sites, some original-color shielding, some rules — look at
> how similar projects do it). p0: smart small-element shielding. p1: when smart detection cannot
> solve it, ship a rule library of media elements for mainstream sites (some video sites need no
> inversion). p2: remember user preferences, collect data locally, can be sent to the developer.
> Known: GitHub star-history images are not inverted. Need tab isolation — tabs must not affect
> each other. Bilibili comment images are only inverted when opened, not as thumbnails.
> Make reasonable changes, add a massive amount of features, optimize performance, be unaffected
> by network and browser state, until all modifications are complete.

## Requirements & Acceptance Criteria

### R1 — Force background replacement, login-block safe (163 etc.)
- New per-site "背景替换" (background replace) mode: dynamically overrides light page backgrounds
  with dark equivalents (hue-preserving), keeps text readable; never touches `img/video/svg/canvas`.
- Elements matching login-block selectors (built-in list + user per-site exclusion list) keep their
  original appearance — not covered, not recolored.
- **AC**: on a test page (light body + light login box), enabling bg replace yields dark body
  computed background while the login box computed background is unchanged; toggling off restores.

### R2 — More settings options (sites / original-color shielding / rules)
- Per-site settings: script enabled, video invert, image invert, background replace; managed site
  list with global mode 全部启用 / 黑名单 / 白名单 (Dark Reader style).
- 原色屏蔽 (color shield): user-defined original colors that are never transformed (skipped by
  background replace color mapping and by image light-color inversion).
- Built-in rule library is viewable: settings modal shows the active built-in rules for the
  current site.
- **AC**: modal renders the three new sections; per-site override for current host persists and
  changes engine behavior on that host only.

### R3 — p0 Smart small-element shielding
- Images/SVGs classified as icons/logos/badges (small rendered size + repetition or nav/logo
  context) are never auto-inverted; content-context images (markdown body, article content) are
  exempt from icon classification.
- **AC**: a grid of 20 repeats of the same tiny white icon SVG → none inverted; a single 300px
  white diagram still inverted; a white diagram inside `.markdown-body` still inverted.

### R4 — p1 Built-in mainstream-site media rule library
- `BUILTIN_SITE_RULES`: per-host selector lists (`protect`, `forceInvert`) + flags
  (`disableVideoAuto` for pure video sites, `bgImageSelectors` priority lists).
  Must include at least: bilibili (comment bg-image thumbnails), github (markdown content + camo),
  163/mail, zhihu, weibo, youtube, douyin, iqiyi, youku, tencent video, twitter/x, qq, taobao, jd,
  bilibili live, stackoverflow, juejin, csdn.
- Rules are a master-toggleable layer merged under user per-site overrides.
- **AC**: rule resolution unit tests pass; on the bench, a bilibili-style comment thumbnail div
  (background-image) gets inverted.

### R5 — p2 Preferences memory + local stats + developer export
- Alt+click manual per-image overrides are persisted per `host|src` and re-applied on later visits.
- Local stats module: counters (images analyzed/inverted, bg images, taint fallbacks, video auto
  activations, bg-replace pages) + capped action log. Local only; export via copy/download JSON;
  clear button. No automatic network transmission, ever.
- **AC**: stats key exists in localStorage after activity; export JSON parses and contains
  counters; manual override survives reload (bench).

### R6 — GitHub star-history / camo image fix
- Robust decode chain: canvas sample → on taint OR blank sample → GM/fetch blob →
  `createImageBitmap` (own try/catch) → temp `<img>` + objectURL decode. SVG blobs must decode.
- **AC**: cross-origin (CORS-enabled) SVG served from a second port on the bench gets inverted;
  an SVG served without intrinsic dimensions also gets inverted.

### R7 — Tab isolation
- Runtime state (`invertActive`, current video, transient UI state) is per-tab, in memory only —
  never written to storage. Only preferences persist. New tab / reload starts with video invert
  off. UI capsule is built only in the top frame; engines still run in iframes.
- **AC**: bench toggles video invert, reloads, and the fresh page shows video invert off with no
  `invertActive` in localStorage.

### R8 — Bilibili comment thumbnail (background-image) inversion
- Background-image engine: elements whose `background-image` is a light image get inverted via
  CSS filter on the element (hover restores original), cached per URL, CORS-fallback via blob.
- **AC**: bench div with light background-image gets inverted without being opened.

### R9 — Massive features, performance, robustness
- Performance: batched/debounced MutationObservers, idle-scheduled background scans with element
  budgets, visibility-aware video sampling pause, per-URL caches, early-exit classification.
- Robustness: boots without crash when `document.body` is missing (bounded retry); every engine
  init error-isolated; CORS/network failures degrade to manual modes; works fully offline.
- Version bumped to 2.0.0 with updated metadata descriptions; README + README_EN updated; unit
  tests (`node test.js`) and browser bench (`node test-browser.js`) extended and green.

## Out of scope
- Automatic telemetry upload (never; export is manual only).
- Rewriting engines as a build-step project (stays a single-file userscript, no toolchain).
