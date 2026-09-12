# Implement Plan: v3.0

Two sequential implement dispatches on the same canonical file; keep it runnable + test trio green
after every step (`node --check universal-smart-invert.user.js && node test.js`, browser bench at
milestones).

## Dispatch A — userscript core (steps 1–8)

1. **Store (R6)**: implement Store (backend chain, mirror, debounce, chunking for sync quota,
   namespace, describe/export/import/clear) + legacy migration; route prefs/stats/overrides/
   learned/timeline through it; prefs schema-3 fields per design §8; loadState normalization.
2. **Pure math + exports (R1/R3/R4)**: transformPixel, mergeSegments, lookupSegment,
   selectorStem, mediaDominantViewport; expose on window.__svi.
3. **ImageFxEngine (R1)**: modes full/luma/key/rect + effects, content:url delivery + hover
   restore + Alt+click kill-switch, queue/LRU/blob revocation, Alt+Shift+drag rect capture,
   integration after ImageInvertEngine decision.
4. **VideoFxEngine (R2)**: WebGL overlay + rVFC loop + uniforms per design §2c, PiP action,
   fallbacks; HILStateMachine integration (overlay suppresses CSS filter).
5. **Predictive video (R3)**: rVFC-driven detection path + TimelineLearner record/pre-arm
   (reference/takeover) + anti-fight windows.
6. **RuleLearner + smart media (R4/R8)**: learned-rule write path + precedence (user > learned >
   seed), media-dominant suppression of bg scans; canvas/poster/shadow-DOM (attachShadow patch)/
   SVG image/input-image coverage in all engines.
7. **UI refactor + new sections (R5)**: component builders; rebuild all sections/panel; add
   ✨效果 / 🧠智能 / 💾存储; 5-button panel row; modal order per design §5.
8. **file:// + coexistence (R7/R9-core)**: @match, profile key, GM-only blob on file:, hint;
   ownership heartbeat handshake. Extend test.js + test-browser.js per design §9 items 1–10.
   Run full trio until green.

## Dispatch B — extension + CI (steps 9–11)

9. **Build + icons + pack**: scripts/build-extension.js, gen-icons.js, lib/zip.js, pack.js;
   extension/manifest.json generation; dist/ gitignore.
10. **Workflows**: .github/workflows/ci.yml + release.yml per design §7 (guarded CWS publish,
    crx3 with secret, gh-release artifact upload); PUBLISHING.md update (secrets setup guide).
11. **Docs**: README/README_EN v3.0.0 sections; extension smoke test wired into test-browser.js
    item 11. Run trio + build until green.

## Validation commands

```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js
node scripts/build-extension.js && node scripts/pack.js
```

## Review gates

- After step 8 (core) and step 11 (extension): full-scope trellis-check pass.
- Rollback: git revert of the single feat commit(s); legacy storage keys never deleted.
