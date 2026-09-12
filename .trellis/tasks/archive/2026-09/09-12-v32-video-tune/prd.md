# PRD: v3.2 Video Tune (独立视频画面调节)

User request: 「增加降低亮度等视频效果调整的功能」— add video picture adjustments such as
brightness reduction, independent of the inversion feature.

## Requirements

### R1 — Independent video picture adjustments
- Tune controls applying to ALL `<video>` elements on the page, independent of (and composable
  with) video inversion: 亮度 brightness (0.30–1.70), 对比度 contrast (0.30–1.70),
  饱和度 saturate (0.00–2.00), 暖色 warmth (sepia 0–1), 黑白 grayscale (0–1).
- Default OFF, all values neutral; zero cost when neutral.
- **AC (bench /tune-page)**: enabling with brightness 0.8 + warmth yields computed filter
  `brightness(0.8) … sepia(...)` on a NON-inverted video; toggling video inversion composes BOTH
  chains in the active video's inline filter; disabling clears the rule.

### R2 — Composition with the existing video pipelines
- Non-inverted videos: tune via a stylesheet rule (`html.svi-video-tune video`) using a CSS
  variable; the inversion path (inline !important) keeps winning for the active inverted video,
  so its inline filter string must append the tune chain (no double-apply, no loss).
- VideoFxEngine (WebGL overlay, when the user opted into a GPU mode) must carry the tune too:
  brightness/contrast/saturate multiply the existing uniform values and new u_sepia/u_gray
  uniforms handle warmth/grayscale.
- **AC**: bench asserts the composed inline filter on the inverted active video contains both
  `invert(` and `brightness(0.8)`; overlay path covered by unit-level math (shader composition).

### R3 — UI + persistence
- New modal section 🎚️ 视频画面调节 (built with the shared `ui` builders): enable toggle +
  five slider rows + one-shot preset buttons 护眼 (b 0.85, warmth 0.15) / 夜间 (b 0.70,
  warmth 0.25, sat 0.90) / 鲜艳 (sat 1.35) / 还原 (all neutral). Every change persists
  immediately and re-applies live.
- Persisted via prefs (`videoTune` object, schema-normalized like imgFxParams); survives reload.
- **AC**: bench sets values via the UI path, reloads, values still applied; modal section
  renders with 5 sliders.

### R4 — Version/docs/tests
- v3.2.0 header + zh/en description; README/README_EN one feature bullet block; test.js units
  for `buildVideoTuneFilter` (neutral/partial/clamp); extension rebuilt in sync.

## Out of scope
- Per-site videoTune overrides (global only for now), per-video UI picker, gamma curves.
