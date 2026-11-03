# Design: v2.0 Site Engine

Single-file userscript, vanilla JS, no build step. All new code lives in
`universal-smart-invert.user.js` and follows its existing section-comment style
(`// ===== N. 标题 =====`). Chinese user-facing strings, ASCII identifiers.

## 1. Storage model (R7 tab isolation + migration)

- `PREFS_KEY = 'universal_smart_invert_v4'` — persistent **preferences only**.
- `STATS_KEY  = 'universal_smart_invert_stats_v1'` — local stats (separate key).
- `runtime` — plain in-memory object (`invertActive`, `currentDetectedScene`,
  `userRejectedScene`, `normalSceneCount`, …). **Never** serialized. `state.invertActive` is
  removed from prefs; code reads/writes `runtime.invertActive`.
- Migration: if `v4` absent and legacy `universal_smart_invert_v3` present, copy it, delete
  runtime-only fields (`invertActive`), fill new defaults, save as v4. Legacy key left untouched
  (rollback safety). `loadState()` merge order: `{...DEFAULT_PREFS, ...stored}` (shallow) and
  deep-merge object fields (`imgPresets`, `siteOverrides`).

New pref fields:

```js
siteMode: 'all',            // 'all' | 'blacklist' | 'whitelist'
siteBlacklist: [],          // host patterns: 'example.com', '*.163.com'
siteWhitelist: [],
siteOverrides: {},          // { '<pattern>': { enabled, videoInvert, imageInvert, bgReplace, excludeSelectors: [], shieldColors: [] } }  (only set keys override)
rulesEnabled: true,         // built-in site rule library master switch
shieldColors: [],           // ['#rrggbb', ...] original colors never transformed (global)
manualOverrides: {},        // { '<host>|<src>': 'invert' | 'restore' }  cap 400 (FIFO)
statsEnabled: true,
bgReplace: false,           // global default for background replace (per-site override wins)
bgExcludeSelectors: [],     // global extra exclusion selectors for bg replace (login blocks etc.)
```

## 2. Site profiles (R2/R4)

`SiteProfile` resolution for `location.hostname` (cached per host + prefs-revision):

```
effective = merge(globalDefaults, BUILTIN_RULE(host), userOverride(host))
```

- Pattern match: `*.163.com` matches host and subdomains; bare `163.com` matches host + subdomains
  too (suffix match on `.`-boundary); `mail.163.com` exact only. First-match wins; user overrides
  are looked up by longest matching pattern.
- `BUILTIN_RULES` (array; order irrelevant except documented): entries shaped
  `{ pattern, name, protect: [sel], forceInvert: [sel], bgImageSelectors: [sel], disableVideoAuto, bgReplace }`.
  Required entries (R4 list): bilibili (incl. live), github, 163 (mail/web/blog), zhihu, weibo,
  youtube, douyin, iqiyi, youku, tencent video (v.qq.com), twitter/x, qq, taobao, jd,
  stackoverflow, juejin, csdn.
  - bilibili: `bgImageSelectors: ['.b-img__inner', '.reply-image .b-img', '[class*="image-box"] img', '.bili-comment-image']`,
    `protect: ['.bpx-player-control-wrap', '.bili-danmaku', '.squirtle-video-page']`.
  - github: `forceInvert: ['.markdown-body img', 'img[src*="camo.githubusercontent.com"]']`,
    `protect: ['.Avatar', '.avatar', 'img[src*="identicons"]']`.
  - youtube/douyin/iqiyi/youku/v.qq.com: `disableVideoAuto: true` (user goal: video sites usually
    already dark; keep manual mode available).
- `rulesEnabled: false` skips the builtin layer (unit-testable via exported resolver on
  `window.__svi`).

## 3. Small-element smart shield (R3/p0)

Pure decision function `classifySmallElement(img, ctx)` (exported on `window.__svi` for tests):

Inputs: rendered `clientWidth/clientHeight` (fallback naturalWidth/Height), meta string
(class+id+alt+role, lowercased), `srcOccurrences` (count of same src among currently scanned
imgs, tracked in a `Map` refreshed during `scanAll`/mutations, capped 500 entries),
`closestContent` (element matches content selector list
`.markdown-body, [class*="article"], [class*="content"], .post-content, .rich-text, .comment-content`).

Decision (skip → don't invert):
1. meta icon regex (existing) → skip, unless closestContent AND rendered ≥ 48px.
2. both dims > 0 and max dim < 96 AND (srcOccurrences ≥ 3 OR closest
   `nav, header, footer, aside, [role="banner"], [class*="logo"], [class*="icon"], [aria-hidden="true"]`) → skip.
3. size gates: `< 24` always skip; `< minImgSize` both dims skip (existing behavior).
Content-context images only bypass rule 2's context branch, not the size gates.

## 4. Image decode chain fix (R6 — star-history/camo)

`analyzeImage(img)` replaces the inline logic in `processImage`:

```
sampleCanvas(img, 8) → { data, opaqueCount }        // try/catch taint
if (tainted || opaqueCount < 8) → blobFallback(src)  // blank is suspicious (SVG, alpha)
result = evaluateImagePixels(data)
```

`blobFallback(src)`:
1. `blob = await gmFetchBlob(src)` (existing helper).
2. decode: `try { bitmap = await createImageBitmap(blob); draw(bitmap) } catch { temp <img> +
   objectURL draw }` — **nested try/catch is mandatory** (this is the star-history bug: v1.4.0
   aborts the whole fallback when `createImageBitmap` rejects on SVG blobs).
3. decode onto a fresh 16×16 canvas (SVG edge quality), evaluate, cache by src.
Record `taintFallbacks` stat. Network failure → leave image unchecked (no repeat attempts;
`data-svi-checked-src` only set after a decision, and a `data-svi-failed` marker with TTL).

## 5. Background-image engine (R8 — bilibili comment thumbnails)

`BgImageEngine` (sibling of ImageInvertEngine, shares cache/eval helpers):

- Candidate discovery: MutationObserver (childList + `style` attribute filter) collects added
  nodes; query within them `[style*="background"]` plus per-profile `bgImageSelectors`; plus an
  idle full-sweep (`requestIdleCallback` fallback `setTimeout(..., 1500)`) capped at 1500 elements,
  every 5s max, skipped when `document.hidden`.
- Element gate: rendered ≥ 32×32; computed `background-image` contains `url(`.
- URL evaluation: same decode chain via `new Image()` load → canvas (same-origin or CORS) →
  taint → `gmFetchBlob` → nested decode (reuse §4 helper). Cache by absolute URL.
- Light result → set `data-svi-bginv="true"` on the element. CSS (added to existing block):
  `[data-svi-bginv="true"] { filter: var(--svi-img-filter) !important; transition: var(--svi-img-transition) !important; }
   [data-svi-bginv="true"]:hover { filter: none !important; }`
- Honor manual overrides keyed `host|url`, and image engine master switch.

## 6. BackgroundReplaceEngine (R1 — 163 etc.)

Dark Reader dynamic-mode-inspired, element-tagging bucket approach:

- Enabled when effective profile `bgReplace === true` (user override) — builtin rule may default
  it on for 163.
- Scan (idle-scheduled chunks of 400 elements, budget 4000/page, paused when hidden):
  all elements except `img, video, svg, canvas, iframe, script, style, link, noscript, [data-svi-bgr]`
  and any element with `closest(exclusionSelector)`.
  Exclusion selectors = `LOGIN_SELECTORS` (built-in:
  `[class*="login" i], [id*="login" i], [class*="signin" i], [class*="LoginPanel"], form[action*="login" i], [class*="passport"]`)
  ∪ profile/user `excludeSelectors` ∪ global `bgExcludeSelectors`.
- Per element: computed `backgroundColor` (non-transparent) with luminance ≥ 160 → tag
  `data-svi-bgr-bg="<bucket>"`; computed `color` with luminance ≤ 90 → tag
  `data-svi-bgr-fg="<bucket>"` (bucket = rgb quantized to 8/channel, hex). Shield colors
  (`shieldColors` + profile) within tolerance 24 → element skipped entirely.
- Generated CSS into one `<style id="svi-bgr-style">`:
  `[data-svi-bgr-bg="k"] { background-color: <mapped> !important; }
   [data-svi-bgr-fg="k"] { color: <mapped> !important; }
   html[data-svi-bgr-on] [data-svi-bgr-bg] { border-color: <derived-mid> !important; }` — only
  emit border rule when the element actually has a visible border color sampled (store border
  buckets separately, `data-svi-bgr-bd`).
- Color mapping (pure fn `mapLightToDark(r,g,b)` + `mapDarkToLight(r,g,b)`, unit-tested): convert
  to HSL, keep hue, `L' = 100 − L` clamped to [8, 92], `S' = min(S, 48)` for backgrounds; text
  mapping mirrors it. Implementation must be the integer-lightweight variant.
- Root tag: `document.documentElement.setAttribute('data-svi-bgr-on','')`; toggle off removes
  attributes + style node.
- Refresh: debounced (800ms, idle) MutationObserver re-scan of added subtrees only; page-level
  rescan button in UI; stat `bgReplacePages` counts activations (once per page).

## 7. Stats (R5/p2)

`StatsManager`: `{ counters: {...}, log: [{t, host, type, detail}] }`, log capped 200, saved
throttled (dirty flag flushed on `visibilitychange` hidden + every 30s + before export).
`exportJson()` → `{ exportedAt, version, prefs: <sanitized prefs, no manualOverrides URLs>… no —
include manualOverrides; it is local data the developer may want; sanitize nothing except drop
nothing. Add `'svi-export'` envelope with `schema: 1 }`. UI buttons: 复制到剪贴板 / 下载 JSON /
清空统计. Absolute rule: no automatic network send.

## 8. UI (R2)

- Panel card row 1 becomes 4 buttons: 视频反色 / 智能检测 / 图片反色 / 背景替换 (背景替换 toggles
  per-site override for current host; hidden if profile disables it? Always visible).
- Modal adds three sections before 高级折叠抽屉:
  1. `🌐 站点与规则` — current host label; checkboxes 本站启用 / 本站图片反色 / 本站视频反色 /
     本站背景替换 (write into `siteOverrides[host]`); site mode `<select>` (全部/黑名单/白名单)
     + two textareas (blacklist/whitelist, one pattern per line); builtin-rule summary line
     (matched rule name + counts; "无" when none).
  2. `🛡️ 原色屏蔽` — chips of `shieldColors` (click × removes), native color input + 添加 button;
     hint text explaining shield semantics.
  3. `📊 数据与反馈` — stats summary line (formatted counters), buttons 复制 JSON / 下载 JSON /
     清空, privacy note (仅本地存储，绝不自动上传).
- Existing modal logic reused (`makeRow`, chip styles); new sections follow the same
  `.svi-modal-section` markup.

## 9. Boot & robustness (R9)

- Boot order: resolve site profile → if `enabled === false` for this site (siteMode lists or
  override) → expose `window.__svi = { disabled: true }` and bail (no UI, no engines).
- `window.__svi` debug handle always: `{ version, runtime, prefs, profile, engines… }`.
- UI built only when `window.self === window.top` (iframes run engines silently).
- `whenBodyReady(cb)`: if `document.body` exists call now, else poll `setTimeout` 50ms up to 3s,
  then give up gracefully (documentElement fallback for observers).
- Every engine constructor wrapped in try/catch; one engine failing must not kill the others.
- Video sampling loop: skip `detect()` when `document.hidden` (pause) and when no video; MutationObserver
  callbacks debounced via microtask-batched scheduling (ImageInvertEngine/BgImageEngine coalesce
  mutation records for ≤ 100ms before scanning).

## 10. Metadata & docs

- `@version 2.0.0`; zh/en `@description` updated to mention 背景替换/站点规则/标签页隔离/数据导出.
- README/README_EN: new feature sections, version badge 2.0.0, quickkeys unchanged.

## 11. Test plan

- `test.js` additions (pure logic, Node): site pattern matcher + profile merge; small-element
  classifier; `mapLightToDark/mapDarkToLight` round-trip sanity (light→dark, luminance bounds);
  shield-color tolerance check; manual-override key + cap; migration strips runtime keys; stats
  export schema + log cap; BUILTIN_RULES sanity (unique patterns, selectors are arrays of
  non-empty strings, required hosts present).
- `test-browser.js` additions: camo-sim (second port, CORS `*`): SVG with intrinsic size AND one
  without → both inverted; bilibili-style bg-image thumbnail div → inverted; 20-icon grid → none
  inverted; login-box page with bgReplace pref pre-seeded → body dark, login box unchanged;
  video-invert toggle + reload → fresh page shows off, prefs contain no `invertActive`; stats key
  populated.
