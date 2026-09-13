# v4 settings UI ground-up rebuild + site power hot-apply

## Goal

Rebuild the settings page/UI from scratch with a Dark Reader-class IA (site power switch in header, site/global tabs, tri-state inherit-override model, mode cards, zero redundancy) and make the per-site disable toggle hot: instantly tear down every engine side effect on the page and restore without reload on re-enable.

## Requirements

### R1 site power hot-apply (hard requirement)
- Toggling the site power OFF in settings must, on the current page and immediately:
  no `svi-*` classes on html/body; zero `data-svi-*` attributes on page elements;
  video filters / video tune / WebGL FX overlays removed; capsule UI hidden — the page
  must look exactly like the script is not running.
- Re-enabling restores instantly without reload (image rescan, video auto-detect resume, UI back).
- Also hot-applies when lists/siteMode/rule-file imports disable or enable the current site.
- While suspended, every engine entry point (observers, sweeps, video discovery, HIL,
  Alt+click) is gated and must not re-apply anything.

### R2 settings UI rebuild (v4.0)
- IA: header shows site host + large power switch (hot); body has two tabs 「本站」「全局」;
  site tab = mode cards, tri-state inherit rows (跟随全局/强制开/强制关), 当前页媒体,
  element rules; global tab = engine defaults, appearance, site lists, color shield,
  data & backup (stats grid kept), tips.
- Zero redundancy: site-level controls use the tri-state inherit model, never duplicate
  global toggles.
- Visual language completely different from v3.3: new large switch, tabs, mode-card,
  tri-state segmented components.
- Parallel data stays table-like grids (v3.3.1 paradigm; no inline symbol-joined runs).

## Constraints
- All modal/panel UI via the `ui.*` builder library; Chinese strings; DOM APIs only.
- Engine decision pipeline untouched; suspension is an entry-point gate only.
- All hard rules hold: no runtime state persisted, sviOwner handshake intact,
  decide-once semantics intact, no blanket html/body filters.
- `@version` → 4.0.0; build-extension in the same change.

## Acceptance Criteria

- [ ] `node --check`, `node test.js`, `node test-browser.js` (with new hot-toggle scenario),
      `node scripts/build-extension.js && node scripts/pack.js` all green.
- [ ] `scripts/check-panel-overflow.js`: zero horizontal overflow at all widths/layouts.
- [ ] New bench scenario: with inverted images on the page, clicking power OFF asserts
      classes/attributes cleared in the same tick; re-enable restores without reload.
