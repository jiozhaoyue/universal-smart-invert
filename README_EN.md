# Universal Smart Video & Image Invert

<p align="center">
  <img src="https://img.shields.io/badge/version-1.3.1-blue.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Tampermonkey-Supported-orange.svg?style=flat-square" alt="Tampermonkey">
  <img src="https://img.shields.io/badge/ScriptCat-Supported-purple.svg?style=flat-square" alt="ScriptCat">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
</p>

An intelligent HTML5 userscript for video and web image color inversion, crafted for nighttime and long-session eye comfort.

Specifically designed to tame **blinding white PowerPoint/PDF lecture slides in tutorial videos**, and **harsh white-background architecture diagrams, UML charts, and technical figures in articles**.

---

## ✨ Key Features

### 1. 🎯 Precision Scoping (No Pollution)
- **Zero global pollution**: Never applies destructive filters to `html` or `body`.
- **Danmaku, subtitles & controls safe**: Filters are directly and atomically applied to `<video>` and `<img>` elements. Player controls, progress bars, menus, danmaku (Canvas/DOM), and external subtitles remain 100% untouched.
- **Smart video probe**: Accurately detects and tracks the active video and mini-player (PiP), filtering out small hover previews and banner ads.

### 2. 🧠 Intelligent White-Slide Detection
- **Ultra-lightweight detection (<0.01ms)**: Downscaled $16 \times 16$ sampling with integer bitwise math and early exit pruning (**~0.002ms per frame**, far faster than the 50ms imperceptible bar).
- **Dual-feature classification**: Evaluates high luminance ratio ($L > 210$) and low average saturation ($S \le 22\%$).
- **Anti-flicker hysteresis**: Dynamically calculated exit buffer to prevent stutter between slide transitions.

### 3. 🛠️ Dedicated Fine-Tuning Settings Modal (Sliders & Numeric Inputs)
- **Full settings modal**: Click "⚙️ 详细参数细调页面" in the capsule card to open the fine-tuning interface.
- **Bi-directional sliders and numeric inputs**: Every parameter provides both a draggable range slider and a direct number input box, updating live on video and images in milliseconds.
- **Comprehensive tuning**:
  - **🎨 Filter & Colors**: Brightness (0.50~1.50), Contrast (0.50~1.50), Saturation (0.00~2.00), Hue Rotate (0~360°).
  - **⚡ Transition**: Duration (0~1000ms, **default 0ms for instant switch without gradient**).
  - **🧠 Auto Detection**: Sampling interval (50~2000ms), White ratio (30%~95%), Luminance line (160~250), Exit buffer (200~5000ms).
  - **🖼️ Image Invert**: Minimum image dimension threshold (40~400px).
  - **🔄 Reset to Defaults**: Restore all parameters to factory defaults with one click.

### 4. 🤝 Non-Conflicting Human-in-the-Loop State Machine
- **Never fights the user**: Memorizes rejected scene fingerprints upon manual toggle (`Alt + I` or capsule click).
- **Suppression lock**: Remains silent as long as the scene characteristics persist, re-engaging only upon a genuine scene transition.

### 5. 🖼️ Web Diagram & Vector Invert (Smart Image Invert - v1.3.1 Enhanced)
- **CORS CDN Taint Solved**: Uses extension privilege `GM_xmlhttpRequest` to obtain clean image Blobs, completely eliminating canvas `SecurityError` on third-party CDNs (Zhihu, Bilibili, GitHub, Wikipedia, etc.).
- **Vector SVG & Alpha Filtering**: Accurately detects white-background inline `<svg>` diagrams and ignores transparent alpha pixels in PNG diagrams.
- **Strict exclusion**: Skips avatars, emojis, logos, and icons under 100px.
- **Lazy-load Resilient**: Monitors `src` and `data-src` attribute mutations to ensure lazy-loaded figures are reliably inverted.
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
| `Alt + Left Click` | Force toggle inversion on any image or SVG |
| Click Edge Pill | Expand/collapse floating mini control card |
| Drag Edge Pill | Drag vertically along screen edge |
| Hover on Inverted Image | Temporarily displays original image colors |

---

## 📄 License

Licensed under the [MIT License](./LICENSE).
