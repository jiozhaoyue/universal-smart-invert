# Implement Plan: v2.0 Site Engine

Ordered checklist. Each step keeps the script runnable (`node -c` style sanity via
`node --check universal-smart-invert.user.js`) and ends with tests green.

## Steps

1. **Header + storage split (R7)**
   - Bump `@version` 2.0.0; update zh/en `@description`.
   - Rename `STORAGE_KEY` → `PREFS_KEY = 'universal_smart_invert_v4'`; add `STATS_KEY`, `LEGACY_KEY`.
   - `DEFAULT_PREFS` = old DEFAULT_STATE minus runtime fields (`invertActive`) plus new fields
     (design §1). Add `runtime` object. `loadState` with v3→v4 migration + deep-merge of
     `imgPresets`/`siteOverrides`. All former `saveState()` calls that persisted `invertActive`
     removed; HIL state machine + UI read/write `runtime.*` for video state only.

2. **Utils + SiteProfile + BUILTIN_RULES (R2/R4)**
   - Add utils: `parseColorString` (rgb/rgba/hex → [r,g,b,a]), `relLuminance`, `hsl` helpers,
     `hostMatchesPattern(host, pattern)`, `debounce`, `idleFn` (rIC fallback).
   - `BUILTIN_RULES` per design §2 (all hosts from R4).
   - `SiteProfile.resolve()` + cache; honor `siteMode` lists + `rulesEnabled`.

3. **Image engine upgrades (R3/R6/R5)**
   - Extract pure `classifySmallElement` + repetition map; integrate into `processImage`.
   - `analyzeImage` decode chain with nested createImageBitmap/temp-img fallback (design §4);
     blank-sample retry; `data-svi-failed` TTL marker.
   - Manual overrides: on Alt+click persist `manualOverrides['host|src']`; on process, apply
     stored override before detection; cap 400.

4. **BgImageEngine (R8)** per design §5, sharing decode helpers.

5. **BackgroundReplaceEngine (R1)** per design §6 incl. pure `mapLightToDark/mapDarkToLight`,
   login exclusions, shield colors, idle chunked scans.

6. **StatsManager (R5)** per design §7.

7. **UI additions (R2)** — panel 4th button, three modal sections, keep existing behaviors
   intact; all new prefs writes go through `savePrefs()` (debounced 300ms).

8. **Boot robustness + perf (R9)** — whenBodyReady, top-frame UI gate, error-isolated engine
   inits, visibility pauses, debounced observers, `window.__svi`.

9. **Unit tests** — extend `test.js` per design §11; run `node test.js`.

10. **Browser bench** — extend `test-browser.js` per design §11 (second CORS port for camo-sim,
    bg-image div, icon grid, login-box + bgReplace seed, video-toggle reload isolation, stats);
    run `node test-browser.js` (Chrome at the hardcoded path; skip gracefully if absent).

11. **Docs** — README.md + README_EN.md: version badge, new feature sections (背景替换、站点规则、
    原色屏蔽、数据导出、标签页隔离), keep style/tone of existing docs.

## Validation commands

```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js
```

## Review gates

- After step 5 (engines complete) and step 10 (bench green) — full-scope check before commit.
- Rollback: single-file script; revert via git checkout of the file.
