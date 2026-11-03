# Research: Similar Projects' Approaches

## Dark Reader (dynamic mode) — the reference for background replacement

Source: https://darkreader.org/blog/dynamic-theme/ , https://darkreader.org/help/en/

- **Dynamic mode** deeply analyzes the site's stylesheets, background colors/images, and vector
  graphics, then generates site-specific CSS at runtime — it never applies a blanket `filter` to
  `<html>`. Per-element color analysis and inversion achieves the best visual result.
- Modes offered: Dynamic (per-element analysis), Filter / Filter+ (CSS/SVG filters), Static
  (simple generated stylesheet).
- **Per-site control**: site list with enable/disable; per-site toggle; exclusion via selectors.
  Our v1.4.0 image/video engines already follow the "never a blanket filter" principle, so the new
  BackgroundReplaceEngine adopts the same philosophy: sample computed styles, map light colors to
  dark equivalents (hue-preserving lightness inversion), emit bucketed CSS overrides.
- Login-block protection maps to Dark Reader's per-site/selective exclusion lists: we exclude
  elements matching login selectors (`[class*="login" i]`, `[id*="login" i]`, …) plus a user-editable
  per-site exclusion selector list.

## Known ecosystem pain points we must solve (from the goal)

1. **GitHub camo-proxied images (e.g. star-history SVG) not inverted**
   - `camo.githubusercontent.com` does not send CORS headers → first canvas sample is tainted
     → script falls back to GM_xmlhttpRequest blob.
   - Bug in v1.4.0: the blob decode path calls `createImageBitmap(blob)` and if it throws
     (Chrome frequently refuses SVG blobs, esp. without intrinsic size) the whole analysis aborts —
     the temp-`<img>` + objectURL fallback below it is unreachable inside the same try block.
   - Fix: nested fallback chain canvas → blob → createImageBitmap (own try) → temp `<img>`
     decode; treat a *blank* first sample (opaqueCount < 8) as suspicious and also retry via blob.

2. **Bilibili comment thumbnails not inverted until opened**
   - Closed-state comment images are CSS `background-image` divs; the opened viewer uses real
     `<img>` (which v1.4.0 handles). Requires a background-image media engine.

3. **Tab isolation**
   - v1.4.0 persists `invertActive` to localStorage, so a new tab inherits the previous tab's
     video-invert state. Runtime state must live per-tab (in memory), only preferences persist.

4. **Smart small-element shielding (p0)** and **built-in site rule library (p1)**
   - Heuristics: rendered size, repetition count of same src at small size, container context
     (nav/header/logo vs article/markdown body), meta class/alt keywords.
   - Rule library pattern: per-host selector lists (protect / forceInvert) + flags
     (e.g. `disableVideoAuto` for pure video sites) — same shape as adblock filter lists but tiny.

5. **Local stats + developer export (p2)**
   - Everything stays in localStorage; export is an explicit user action (copy / download JSON).
   - Remember manual preferences: Alt+click overrides persisted per `host|src`.
