# Universal Smart Video & Image Invert

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Tampermonkey-Supported-orange.svg?style=flat-square" alt="Tampermonkey">
  <img src="https://img.shields.io/badge/ScriptCat-Supported-purple.svg?style=flat-square" alt="ScriptCat">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
</p>

An intelligent HTML5 userscript for video and web image color inversion, crafted for nighttime and long-session eye comfort.

Specifically designed to tame **blinding white PowerPoint/PDF lecture slides in tutorial videos**, and **harsh white and light-colored architecture diagrams, UML charts, and technical figures in articles**.

---

## ✨ Key Features

### 1. 🎯 Precision Scoping (No Pollution)
- **Zero global pollution**: Never applies destructive filters to `html` or `body`.
- **Danmaku, subtitles & controls safe**: Filters are directly and atomically applied to `<video>` and `<img>` elements. Player controls, progress bars, menus, danmaku (Canvas/DOM), and external subtitles remain 100% untouched.
- **Smart video probe**: Accurately detects and tracks the active video and mini-player (PiP), filtering out small hover previews and banner ads.

### 2. 🧠 Intelligent White-Slide Detection
- **Ultra-lightweight detection (<0.01ms)**: Downscaled sampling with integer bitwise math and early exit pruning (**~0.002ms per frame**, far faster than the 50ms imperceptible bar).
- **Dual-feature classification**: Evaluates high luminance ratio ($L > 210$) and low average saturation ($S \le 22\%$).
- **Anti-flicker hysteresis**: Dynamically calculated exit buffer to prevent stutter between slide transitions.

### 3. 🛠️ Out-of-the-Box Presets & Collapsible Advanced Tuning
- **Simple by Default**: Open the modal to immediately find clean, zero-configuration preset cards (Soft Gray / AMOLED Black) and image light-color chips.
- **🎨 Interactive Color Map & Picker**: Native color picker lets you pick any custom light color with live HEX extraction and tolerance matching.
- **⚙️ Collapsible Advanced Accordion**: Draggable range sliders and numeric input boxes (brightness, contrast, saturation, hue, tolerance, cutoff, area ratio, min size) are neatly organized inside an accordion drawer.

### 4. 🤝 Non-Conflicting Human-in-the-Loop State Machine
- **Never fights the user**: Memorizes rejected scene fingerprints upon manual toggle (`Alt + I` or capsule click).
- **Suppression lock**: Remains silent as long as the scene characteristics persist, re-engaging only upon a genuine scene transition.

### 5. 🖼️ Multi-Light-Color Image Detection (Smart Image Invert - v1.4.0 Major Upgrade)
- **Full Light-Color Spectrum**: Not just pure white (#FFF), but also paper light-gray (#F5F5F5), warm cream/sepia (#FAF0E6), and pale blue (#F0F8FF).
- **One-Click Preset Chips**: 4 interactive color chips to toggle specific light-color categories on the fly.
- **Ultra-Low Resource Footprint (8×8 Grid)**: Per-image classification takes just **~0.0007ms (0.7 microseconds)**.
- **Canvas Taint Isolation**: Fresh micro-canvas per analysis avoids canvas tainted lockouts.
- **Clean Filtering**: Eliminates accidental URL blacklist matching on `thumb` and `header` paths, allowing Wikimedia and Zhihu diagrams to invert reliably.
- **Alt + Left Click Force Toggle**: Press `Alt` and click any image or SVG to immediately force invert or restore.
- **Pure CSS Hover-to-Restore**: Hovering mouse over any inverted image instantly and smoothly restores its original colors using GPU hardware acceleration.

### 6. 💊 Minimalist Capsule & Global Shortcuts
- **Edge-snapped pill**: Small translucent trigger tucked at the screen edge; drag vertically to reposition.
- **Fullscreen auto-hide**: Hides automatically in fullscreen mode.
- **Shortcuts**:
  - `Alt + I`: Toggle video inversion (with manual override lock);
  - `Alt + A`: Toggle smart auto mode;
  - `Alt + Left Click`: Force toggle inversion on any specific image or SVG.

---

## 🆕 What's New in v2.0 (Site Engine)

### 1. 🌗 Background Replace Engine (Login-Box Safe)
- One-click dark mode for light sites like 163 NetEase: samples computed styles per element and maps light backgrounds to **hue-preserving dark equivalents** with mirrored light text — never a global filter.
- **Login blocks are never covered or recolored**: built-in login selectors (`login`/`signin`/`passport`...) plus per-site exclusion lists keep the login box untouched.
- The capsule panel gains a 4th button, **背景替换 (Background Replace)**, toggled per site; `img/video/svg/canvas/iframe` are never touched.

### 2. 🌐 Site Rules & Blacklist/Whitelist (New Modal Section)
- Per-site overrides: script enabled / image invert / video invert / background replace, all taking precedence over global defaults.
- Global site management: **All enabled / Blacklist / Whitelist** (Dark Reader style) with wildcard patterns such as `*.163.com`, one per line.
- Master switch for the built-in rule library; matched rules are visible in the modal (rule name + protect/force-invert/bg-image selector counts).

### 3. 🛡️ Original-Color Shield
- Maintain a list of original colors that are never transformed (color-picker add, chip remove): shielded colors are skipped by both **background replace and image inversion** — ideal for brand or warning colors.

### 4. 📚 Built-in Mainstream-Site Media Rule Library
- Covers Bilibili (incl. live), GitHub, 163 NetEase, Zhihu, Weibo, YouTube, Douyin, iQiyi, Youku, Tencent Video, Twitter/X, QQ, Taobao, JD, Stack Overflow, Juejin, CSDN and more.
- Each rule carries protect selectors (avatars/player controls), force-invert selectors (e.g. GitHub `.markdown-body` and camo images) and background-image selectors, plus a flag to disable video auto-detection on pure video sites.

### 5. 🧩 Smart Small-Element Shield (p0)
- Avatars/icons/badges (meta keywords, tiny rendered size, **same-src repeated ≥ 3 times**, nav/header chrome context) are never auto-inverted.
- Content contexts (`.markdown-body`, article/comment bodies) are exempt from misclassification — 300px white diagrams still invert.

### 6. 📑 Per-Tab Isolation
- Video invert and other runtime state live in memory only — **each tab is fully independent**, nothing is written to storage; a new tab or reload always starts with video invert off.
- Preferences moved to a fresh storage key (legacy v3 data migrates automatically; the old key is kept for rollback).

### 7. 📊 Local Stats & Developer Export
- Local counters (images analyzed/inverted, background images, CORS fallbacks, video auto activations, bg-replace pages) plus a capped 200-entry action log.
- **Stored locally only, never uploaded automatically**; copy JSON / download JSON / clear directly from the settings modal — attach the export when filing issues.

### 8. 🔧 Notable Fixes
- **GitHub star-history / camo images not inverted**: rebuilt decode chain — canvas sample → taint or blank sample → blob refetch → `createImageBitmap` (own try/catch) → temp `<img>` + objectURL fallback decode; cross-origin SVGs without intrinsic dimensions now invert reliably.
- **Bilibili comment thumbnails not inverted**: new background-image engine inverts light `background-image` thumbnails without opening them; hover restores original colors.

---

## 🚀 Installation

Install directly via any userscript manager (Tampermonkey, Violentmonkey, or ScriptCat) by clicking the GitHub Raw link below:

👉 **[Click to Install Latest Script (GitHub Raw)](https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js)**

Or copy the link into your userscript manager's "Install from URL" input:
```
https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
```

---

## 🔄 Automatic Browser Updates

### 1. Online Production: Background Auto-Check & Update
- **Auto check**: The script includes standard `@updateURL` and `@downloadURL` headers.
- **Scheduled upgrades**: Tampermonkey automatically checks for new GitHub versions according to your configured interval (e.g. daily) and updates seamlessly in the background.
- **Instant manual check**: Click the Tampermonkey icon -> "Check for userscript updates" anytime to update immediately.

### 2. Local Development: Zero-Latency Hot Reload
To iterate on the code locally and see updates immediately:
1. Open `chrome://extensions`, find Tampermonkey/ScriptCat -> "Details" -> toggle **"Allow access to file URLs"** ON.
2. Install the local loader [`dev-loader.user.js`](./dev-loader.user.js) in your userscript manager.
3. Edit `universal-smart-invert.user.js` in your IDE, save, and press `F5` in your browser to test live changes instantly!

---

## ⌨️ Shortcuts & Controls

| Shortcut / Action | Description |
| :--- | :--- |
| `Alt + I` | Toggle video invert (with manual override lock) |
| `Alt + A` | Toggle smart auto-detection mode |
| `Alt + Left Click` | Force toggle inversion on any image or SVG (remembered per site since v2.0) |
| Click Edge Pill | Expand/collapse floating mini control card |
| Drag Edge Pill | Drag vertically along screen edge |
| Hover on Inverted Image | Temporarily displays original image colors |

---

## 📄 License

Licensed under the [MIT License](./LICENSE).
