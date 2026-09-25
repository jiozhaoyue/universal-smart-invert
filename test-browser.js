// Automated Browser End-to-End Test for Universal Smart Invert Userscript (v2.0)
// Connects to Chrome via Chrome DevTools Protocol (CDP) and tests real image detection & UI
// v2.0 scenarios: cross-origin CORS SVG decode chain (star-history/camo fix), bilibili-style
// background-image thumbnails, repeated tiny icon shield, login-box-safe background replace,
// per-tab video-invert isolation across reload, and local stats persistence.
// v3.0 additions: node-only extension smoke (design §9 item 11 — build + manifest/version sync +
// content.js syntax + zip central directory), and Scenario 12 coexistence running the REAL built
// extension/content.js bundle (plain <script>) against the userscript in both orders.
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { readCentralDirectory } = require('./scripts/lib/zip');

const PORT = 8765;
const PORT2 = 8766; // 跨域 CORS 服务器 (模拟 GitHub camo / star-history 跨域图床)
// Chrome discovery: SVI_CHROME_PATH override first, then per-platform defaults.
// (CI uses browser-actions/setup-chrome + SVI_CHROME_PATH; local Windows keeps the default.)
const CHROME_CANDIDATES = process.env.SVI_CHROME_PATH
  ? [process.env.SVI_CHROME_PATH]
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'linux'
      ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
      : ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
const CHROME_PATH = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || CHROME_CANDIDATES[0];
const CDP_PORT = 9222;

// SVG image generators for testing
const SVG_TEMPLATES = {
  '/img/white-diagram.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#ffffff"/><path d="M20,20 L180,20 L180,130 L20,130 Z" stroke="#333" fill="none" stroke-width="2"/><text x="40" y="80" fill="#000" font-family="sans-serif" font-size="16">Architecture</text></svg>`,
  '/img/gray-chart.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#f5f5f5"/><rect x="30" y="50" width="30" height="80" fill="#475569"/><rect x="80" y="30" width="30" height="100" fill="#475569"/><rect x="130" y="70" width="30" height="60" fill="#475569"/></svg>`,
  '/img/cream-slide.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#faf0e6"/><text x="30" y="60" fill="#1c1917" font-size="16">Lecture: Chapter 1</text><text x="30" y="90" fill="#44403c" font-size="12">Formula: E = mc^2</text></svg>`,
  '/img/cool-blue.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#f0f8ff"/><rect x="40" y="40" width="120" height="70" rx="8" fill="#bae6fd" stroke="#0284c7" stroke-width="2"/><text x="65" y="80" fill="#0369a1" font-size="14">Step 1: Start</text></svg>`,
  '/img/thumb/wiki-diagram.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#ffffff"/><circle cx="100" cy="75" r="45" fill="none" stroke="#000" stroke-width="3"/><text x="75" y="80" fill="#000">Wiki/Thumb</text></svg>`,
  '/img/dark-scenery.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#0f172a"/><circle cx="100" cy="75" r="40" fill="#334155"/><text x="60" y="80" fill="#94a3b8">Dark Photo</text></svg>`,
  '/img/colorful-banner.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#ef4444"/><rect x="20" y="20" width="160" height="110" fill="#f59e0b"/><text x="50" y="80" fill="#fff" font-size="18">Sale 50% Off</text></svg>`,
  // 智能小元素屏蔽: 重复 20 次的迷你白色图标 (绝不能被反色)
  '/img/tiny-icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#ffffff"/><circle cx="16" cy="16" r="4" fill="#dddddd"/></svg>`,
  // GitHub camo / star-history 修复: 跨域 CORS SVG (有固有尺寸)
  '/img/camo-sized.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="100%" height="100%" fill="#ffffff"/><rect x="20" y="30" width="40" height="100" fill="#16a34a"/><rect x="80" y="60" width="40" height="70" fill="#16a34a"/><text x="130" y="90" fill="#111" font-size="16">star-history</text></svg>`,
  // GitHub camo / star-history 修复: 跨域 CORS SVG (无固有尺寸 → createImageBitmap 必然拒绝, 走临时 img 兜底)
  '/img/camo-nosize.svg': `<svg xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fdfdfd"/><circle cx="60" cy="60" r="40" fill="none" stroke="#333" stroke-width="4"/><text x="25" y="130" fill="#111" font-size="18">no-size SVG</text></svg>`,
  // ===== v3.0 特效基准图 =====
  // 亮度反色: 左半纯白 (应被反色), 右半高饱和蓝 (应保留, ΔRGB ≤ 40)
  '/img/fx-halfwhite.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect x="0" y="0" width="100" height="120" fill="#ffffff"/><rect x="100" y="0" width="100" height="120" fill="#1e50c8"/></svg>`,
  // 键色反色: 左半纯红 (键色, 应被反色), 右半纯白 (应保留)
  '/img/fx-redwhite.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect x="0" y="0" width="100" height="120" fill="#ff0000"/><rect x="100" y="0" width="100" height="120" fill="#ffffff"/></svg>`,
  // 彩色照片替代物 (luma 模式不应触碰): 高饱和多彩
  '/img/fx-photo.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="100%" height="100%" fill="#1a9632"/><circle cx="100" cy="60" r="40" fill="#e2483d"/><circle cx="60" cy="40" r="20" fill="#f5d312"/></svg>`,
  // 自学习规则: 4 张深色图 (分类器判定不该反色 → 反色只能来自学习规则)
  '/img/learn-dark-1.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#111827"/><text x="30" y="65" fill="#6b7280" font-size="14">dark-1</text></svg>`,
  '/img/learn-dark-2.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="30" y="65" fill="#9ca3af" font-size="14">dark-2</text></svg>`,
  '/img/learn-dark-3.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#0f172a"/><text x="30" y="65" fill="#94a3b8" font-size="14">dark-3</text></svg>`,
  '/img/learn-dark-4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#172554"/><text x="30" y="65" fill="#60a5fa" font-size="14">dark-4</text></svg>`,
  // 视频海报 (浅色 → data-svi-poster=light)
  '/img/light-poster.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#f8fafc"/><text x="90" y="95" fill="#334155" font-size="18">Poster</text></svg>`
};

// v3.1 基准图生成器: GitHub 式徽章/截图/logo、封面格、大图
function badgeSvg(i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="95" height="20"><rect width="100%" height="100%" fill="#f5f5f5"/><rect x="1" y="1" width="30" height="18" fill="#4c6ef5"/><text x="36" y="14" font-family="sans-serif" font-size="10" fill="#111">b${i}</text></svg>`;
}
function shotSvg(i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2018"><rect width="100%" height="100%" fill="#ffffff"/><rect x="200" y="300" width="1200" height="600" fill="none" stroke="#111" stroke-width="8"/><text x="220" y="280" font-family="sans-serif" font-size="120" fill="#111">Screenshot ${i}</text></svg>`;
}
function coverSvg(i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135"><rect width="100%" height="100%" fill="#f8fafc"/><rect x="20" y="20" width="200" height="70" rx="8" fill="#e2e8f0"/><text x="30" y="120" font-family="sans-serif" font-size="18" fill="#334155">Cover ${i}</text></svg>`;
}
Object.assign(SVG_TEMPLATES, {
  '/img/gh-logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#ffffff"/><circle cx="60" cy="60" r="40" fill="none" stroke="#111" stroke-width="6"/><text x="30" y="70" font-family="sans-serif" font-size="20" fill="#111">LOGO</text></svg>`,
  '/img/diagram-big.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#ffffff"/><circle cx="400" cy="200" r="120" fill="none" stroke="#111" stroke-width="6"/><path d="M100,500 L700,500" stroke="#111" stroke-width="6"/><text x="320" y="560" font-family="sans-serif" font-size="40" fill="#111">Big Diagram</text></svg>`,
  '/img/cover-card.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135"><rect width="100%" height="100%" fill="#fefce8"/><rect x="20" y="20" width="200" height="90" rx="8" fill="#e7e5e4"/><text x="30" y="125" font-family="sans-serif" font-size="16" fill="#333">Card Cover</text></svg>`,
});
for (let i = 1; i <= 15; i++) SVG_TEMPLATES[`/img/badge-${i}.svg`] = badgeSvg(i);
for (let i = 1; i <= 5; i++) SVG_TEMPLATES[`/img/shot-${i}.svg`] = shotSvg(i);
for (let i = 1; i <= 12; i++) SVG_TEMPLATES[`/img/cover-${i}.svg`] = coverSvg(i);

const userscriptCode = fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8');

// @version extracted from the userscript header (manifest sync assertion source of truth)
const USERSRC_VERSION = (userscriptCode.match(/@version\s+(\S+)/) || [])[1] || '';

// ============================================================
// v3.0 Node-only extension smoke (design §9 item 11) — distinct
// early phase, runs before the browser phase (and even when
// Chrome is absent). Builds the extension (gen-icons → build →
// pack), then asserts: manifest JSON valid, manifest.version ===
// userscript @version, content.js passes `node --check`, the zip
// exists and its central directory parses (zip lib reuse).
// ============================================================
function runExtensionSmoke() {
  const run = (args) => execFileSync(process.execPath, args, { cwd: __dirname, stdio: 'inherit' });
  console.log('[Ext Smoke] node-only extension smoke: gen-icons -> build-extension -> pack ...');
  run(['scripts/gen-icons.js']);
  run(['scripts/build-extension.js']);
  run(['scripts/pack.js']);

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'extension', 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'manifest must be MV3');
  assert.strictEqual(manifest.version, USERSRC_VERSION, 'manifest.version must equal userscript @version');
  assert.deepStrictEqual(manifest.permissions, ['storage'], 'manifest permissions must be ["storage"]');
  assert.deepStrictEqual(manifest.content_scripts, [{
    matches: ['<all_urls>', 'file://*/*'],
    js: ['content.js'],
    run_at: 'document_start',
    all_frames: true,
  }], 'content_scripts shape must match the design contract');
  // v4.5: toolbar popup wired into the manifest and packed
  assert.strictEqual(manifest.action && manifest.action.default_popup, 'popup.html', 'manifest.action.default_popup must point at popup.html');
  for (const pf of ['popup.html', 'popup.js']) {
    const p = path.join(__dirname, 'extension', pf);
    assert.ok(fs.existsSync(p), `popup file must be emitted: ${pf}`);
  }
  const popupJs = fs.readFileSync(path.join(__dirname, 'extension', 'popup.js'), 'utf8');
  assert.ok(popupJs.includes('svi-get-snapshot') && popupJs.includes('svi-site-power'), 'popup.js must speak the svi-* message protocol');
  run(['--check', 'extension/popup.js']);

  const contentCode = fs.readFileSync(path.join(__dirname, 'extension', 'content.js'), 'utf8');
  assert.ok(contentCode.includes('var EXT_MODE = true'), 'content.js must carry the EXT_MODE prelude');
  assert.ok(contentCode.includes('svi-get-snapshot'), 'content.js must register the svi-* popup message channel');
  run(['--check', 'extension/content.js']);

  const zipPath = path.join(__dirname, 'dist', `universal-smart-invert-extension-v${manifest.version}.zip`);
  assert.ok(fs.existsSync(zipPath), 'packed zip must exist in dist/');
  const zipBuf = fs.readFileSync(zipPath);
  const cd = readCentralDirectory(zipBuf);
  const names = cd.entries.map((e) => e.name);
  for (const expected of ['manifest.json', 'content.js', 'popup.html', 'popup.js', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png']) {
    assert.ok(names.includes(expected), `zip central directory must include ${expected}`);
  }
  assert.ok(cd.entries.every((e) => e.method === 0), 'zip entries must be stored-mode');
  console.log(`[Ext Smoke] OK — manifest v${manifest.version}; content.js ${contentCode.length} bytes, syntax OK; zip ${zipBuf.length} bytes, ${cd.count} entries, central directory parses`);
}

// Stripped userscript wrapper for plain browser context execution
const executableScript = userscriptCode
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
  .trim();

const ICON_GRID = Array.from({ length: 20 }, (_, i) => `<img class="icon" src="/img/tiny-icon.svg" alt="icon ${i}">`).join('\n    ');

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Smart Invert Browser Automation Test</title>
  <style>
    body { font-family: sans-serif; background: #121212; color: #fff; padding: 20px; }
    .gallery { display: flex; flex-wrap: wrap; gap: 15px; margin-top: 20px; }
    /* v3.1: 画廊容器类名 card → frame ("card" 在 v3.1 平衡策略中属于 chrome 上下文提示) */
    .frame { background: #1e1e1e; padding: 10px; border-radius: 8px; text-align: center; }
    img { display: block; width: 160px; height: 120px; border-radius: 4px; }
    #icon-grid img { width: 64px; height: 64px; }
    #bg-thumb { width: 120px; height: 80px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Smart Invert Automation Test Bench</h1>
  <div class="gallery">
    <div class="frame"><img id="img-white" src="/img/white-diagram.svg" alt="White diagram"><p>1. White Diagram</p></div>
    <div class="frame"><img id="img-gray" src="/img/gray-chart.svg" alt="Gray chart"><p>2. Gray Chart</p></div>
    <div class="frame"><img id="img-cream" src="/img/cream-slide.svg" alt="Cream slide"><p>3. Cream Slide</p></div>
    <div class="frame"><img id="img-blue" src="/img/cool-blue.svg" alt="Cool blue"><p>4. Cool Blue</p></div>
    <div class="frame"><img id="img-thumb" src="/img/thumb/wiki-diagram.svg" alt="Thumb URL"><p>5. Wiki Thumb</p></div>
    <div class="frame"><img id="img-dark" src="/img/dark-scenery.svg" alt="Dark scenery"><p>6. Dark Scenery</p></div>
    <div class="frame"><img id="img-color" src="/img/colorful-banner.svg" alt="Colorful banner"><p>7. Colorful Banner</p></div>
    <div class="frame"><img id="img-camo" src="http://127.0.0.1:${PORT2}/img/camo-sized.svg" alt="Camo sized"><p>8. CORS SVG (sized)</p></div>
    <div class="frame"><img id="img-camo-nosize" src="http://127.0.0.1:${PORT2}/img/camo-nosize.svg" alt="Camo nosize"><p>9. CORS SVG (no size)</p></div>
    <div class="frame"><div id="bg-thumb" style="background-image: url('/img/white-diagram.svg'); background-size: cover;"></div><p>10. BG-Image Thumb</p></div>
  </div>
  <div id="icon-grid">
    ${ICON_GRID}
  </div>

  <script>
    ${executableScript}
  </script>
</body>
</html>`;

// v3.0 基准页通用种子函数: 双写 svi:prefs (Store 命名空间) 与 legacy v4 键
const SEED_SNIPPET = `
  (function () {
    window.sviSeed = function (overrides) {
      try {
        var base = {};
        try { base = JSON.parse(localStorage.getItem('svi:prefs') || localStorage.getItem('universal_smart_invert_v4') || '{}'); } catch (e) {}
        for (var k in overrides) { if (Object.prototype.hasOwnProperty.call(overrides, k)) base[k] = overrides[k]; }
        var prefsCopy = Object.assign({}, base);
        delete prefsCopy.manualOverrides; // v3.0: 手动覆盖落盘位于 svi:overrides
        localStorage.setItem('universal_smart_invert_v4', JSON.stringify(base));
        localStorage.setItem('svi:prefs', JSON.stringify(prefsCopy));
      } catch (e) {}
    };
  })();
`;

// 画布 → captureStream → video 的基准生成器 (headless 友好, 无需真实视频文件)
const CANVAS_VIDEO_SNIPPET = `
  (function () {
    var cv = document.createElement('canvas');
    cv.width = 640; cv.height = 360;
    var ctx = cv.getContext('2d');
    var phase = 0;
    setInterval(function () {
      phase++;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 360);   // 左半白 (亮度反色目标)
      ctx.fillStyle = '#1e50c8'; ctx.fillRect(320, 0, 320, 360); // 右半高饱和蓝 (应保留)
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect((phase * 7) % 640, 0, 30, 360); // 移动条纹驱动新帧
    }, 50);
    var stream = cv.captureStream(30);
    var v = document.getElementById('bench-video');
    v.srcObject = stream;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  })();
`;

// —— v3.0 Scenario 4/5: 图片部分反色 (luma / key) ——
const FX_LUMA_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>FX Luma Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imgFxMode: 'luma' });<\/script>
<style>body { background: #121212; } img { display:block; width:200px; height:120px; margin: 12px; }</style>
</head><body>
  <img id="fx-half" src="/img/fx-halfwhite.svg" alt="halfwhite">
  <img id="fx-photo" src="/img/fx-photo.svg" alt="photo">
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

const FX_KEY_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>FX Key Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imgFxMode: 'key', imgFxParams: { lumCutoff: 190, satCutoff: 0.30, keyColor: '#ff0000', keyTol: 60 } });<\/script>
<style>body { background: #121212; } img { display:block; width:200px; height:120px; margin: 12px; }</style>
</head><body>
  <img id="fx-key" src="/img/fx-redwhite.svg" alt="redwhite">
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.0 Scenario 6: 视频特效 GPU 覆盖层 (luma) + PiP 流 ——
const VIDEO_FX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Video FX Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ videoFxMode: 'luma', autoDetect: false });<\/script>
<style>body { background: #121212; margin: 0; padding: 16px; } #player { position: relative; width: 640px; height: 360px; } #bench-video { width: 100%; height: 100%; display: block; }</style>
</head><body>
  <div id="player"><video id="bench-video" muted playsinline></video></div>
  <script>
    ${CANVAS_VIDEO_SNIPPET}
  <\/script>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.0 Scenario 7: 时间线记忆 (reference 预布防) ——
const VIDEO_TL_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Video Timeline Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ autoDetect: false, timelineMode: 'reference', imgFxMode: 'full', videoFxMode: 'off' });<\/script>
<style>body { background: #121212; margin: 0; padding: 16px; } #player { position: relative; width: 640px; height: 360px; } #bench-video { width: 100%; height: 100%; display: block; }</style>
</head><body>
  <div id="player"><video id="bench-video" muted playsinline></video></div>
  <script>
    ${CANVAS_VIDEO_SNIPPET}
  <\/script>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.2 Scenario 18: 视频画面调节 (CSS 路径 + 与反色组合 + 持久化) ——
const TUNE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Video Tune Bench</title>
<script>${SEED_SNIPPET};
  // 场景确定性: 仅在本标签会话首次进入时播种 (刷新持久化断言不能被种子重置)
  try {
    if (!sessionStorage.getItem('sviTuneSeeded')) {
      sviSeed({ autoDetect: false, videoFxMode: 'off', videoTune: { enabled: false, brightness: 1, contrast: 1, saturate: 1, warmth: 0, grayscale: 0 } });
      sessionStorage.setItem('sviTuneSeeded', '1');
    }
  } catch (e) {}
<\/script>
<style>body { background: #121212; margin: 0; padding: 16px; } #player { position: relative; width: 640px; height: 360px; } #bench-video { width: 100%; height: 100%; display: block; }</style>
</head><body>
  <div id="player"><video id="bench-video" muted playsinline></video></div>
  <script>
    ${CANVAS_VIDEO_SNIPPET}
  <\/script>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.0 Scenario 8: 自学习规则 (3 次 Alt+点击修正 .thumb-x 深色图 → 学习规则让第 4 张自动反色) ——
const LEARN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>RuleLearner Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imgFxMode: 'full' });
  // 场景确定性: 仅在本标签会话首次进入时清除历史学习规则与手动覆盖 (基准可重复运行, 且重载不误清)
  try {
    if (!sessionStorage.getItem('sviBenchCleaned')) {
      localStorage.removeItem('svi:learned');
      localStorage.removeItem('svi:overrides');
      sessionStorage.setItem('sviBenchCleaned', '1');
    }
  } catch (e) {}
<\/script>
<style>body { background: #121212; } img { display:block; width:160px; height:120px; margin: 10px; }</style>
</head><body>
  <img id="learn-1" class="thumb-x" src="/img/learn-dark-1.svg" alt="dark1">
  <img id="learn-2" class="thumb-x" src="/img/learn-dark-2.svg" alt="dark2">
  <img id="learn-3" class="thumb-x" src="/img/learn-dark-3.svg" alt="dark3">
  <img id="learn-4" class="thumb-x" src="/img/learn-dark-4.svg" alt="dark4">
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.0 Scenario 9: 媒体覆盖 (canvas / 视频海报 / Shadow DOM img / SVG image / input image) ——
const MEDIA_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Media Coverage Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imgFxMode: 'full' });<\/script>
<style>body { background: #121212; color: #eee; padding: 16px; } canvas { display:block; width:160px; height:120px; margin: 10px 0; } video { display:block; width:320px; height:180px; margin: 10px 0; } svg { display:block; width:200px; height:120px; margin: 10px 0; } input { display:block; width:200px; height:120px; margin: 10px 0; }</style>
</head><body>
  <canvas id="light-canvas" width="160" height="120"></canvas>
  <video id="poster-video" poster="/img/light-poster.svg" muted playsinline></video>
  <div id="shadow-host"></div>
  <svg viewBox="0 0 200 120" width="200" height="120"><image id="svg-image" href="/img/white-diagram.svg" x="0" y="0" width="200" height="120"/></svg>
  <input type="image" id="input-image" src="/img/gray-chart.svg" alt="input image">
  <script>
    // 浅色 canvas (脚本注入前预绘)
    var lc = document.getElementById('light-canvas');
    var lctx = lc.getContext('2d');
    lctx.fillStyle = '#ffffff'; lctx.fillRect(0, 0, 160, 120);
    lctx.strokeStyle = '#333'; lctx.strokeRect(10, 10, 140, 100);
    // Shadow DOM (在油猴补丁之前创建 → 依赖 collectExisting 兜底收集)
    document.getElementById('shadow-host').attachShadow({ mode: 'open' })
      .innerHTML = '<img id="shadow-img" src="/img/cream-slide.svg" style="display:block;width:200px;height:120px;">';
  <\/script>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.0 Scenario 10: 存储迁移与管理 (本页在脚本注入前种入 v2.0 形状键并移除 svi:prefs → 走迁移路径) ——
const STORAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Storage Bench</title>
<script>
  ${SEED_SNIPPET};
  (function () {
    try {
      localStorage.setItem('universal_smart_invert_v4', JSON.stringify({ bgReplace: true, statsEnabled: false }));
      localStorage.removeItem('svi:prefs');
      localStorage.removeItem('svi:overrides');
    } catch (e) {}
  })();
<\/script>
</head><body>
  <h1>Storage Bench</h1>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.0 Scenario 12: 共存握手 —— 注入真实构建产物 extension/content.js (含 EXT_MODE 前奏)
//     与 userscript, 两种顺序。前奏将 EXT_MODE 限制在 wrapper 作用域内 (对应真实内容脚本的
//     isolated world 语义): userscript 侧始终为 kind 'us', 插件侧为 'ext', 经
//     documentElement.dataset.sviOwner 裁决唯一所有者。
function coexistUsFirstHtml(extensionCode) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Coexistence us-first (real extension bundle)</title></head>
<body>
  <h1>Coexistence: userscript first, built extension bundle second</h1>
  <script>
    ${executableScript}
    window.__svi_us = window.__svi;
  <\/script>
  <script>
    ${extensionCode}
    window.__svi_ext = window.__svi;
  <\/script>
</body></html>`;
}

function coexistExtFirstHtml(extensionCode) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Coexistence ext-first (real extension bundle)</title></head>
<body>
  <h1>Coexistence: built extension bundle first, userscript second</h1>
  <script>
    ${extensionCode}
    window.__svi_ext = window.__svi;
  <\/script>
  <script>
    ${executableScript}
    window.__svi_us = window.__svi;
  <\/script>
</body></html>`;
}

// 背景替换登录块基准页: 在脚本注入前预置偏好 (bgReplace=true)
// v3.0: 偏好经 Store 读取 svi:prefs 命名空间 (迁移后) —— 种子需双写 legacy v4 键与 svi:prefs
const RECOLOR_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    #halfbow { background: #ffffff; color: #000000; width: 420px; height: 160px; margin: 40px; padding: 20px; border: 2px solid #eeeeee; }
    #lightbox { background: #f8f8f8; width: 300px; height: 100px; margin: 40px; }
  </style>
</head>
<body>
  <div id="halfbow">黑字白底：局部改色只应改白底，绝不动黑字</div>
  <div id="lightbox"></div>
  <script>${SEED_SNIPPET}; sviSeed({ bgReplace: false });<\/script>
  <script>
    ${executableScript}
  <\/script>
</body>
</html>`;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Background Replace Login Bench</title>
  <script>
    ${SEED_SNIPPET}; sviSeed({ bgReplace: true });
  <\/script>
  <style>
    body { margin: 0; padding: 24px; background: #fafafa; color: #111111; font-family: sans-serif; }
    #loginBox { background: #ffffff; border: 1px solid #e0e0e0; width: 320px; padding: 24px; margin-top: 20px; color: #111111; border-radius: 8px; }
    #loginBox input { display: block; width: 90%; margin: 8px 0; padding: 6px; }
  </style>
</head>
<body>
  <h1>背景替换登录块基准页</h1>
  <p id="para">正文区域: 这部分浅色背景应当被替换为深色, 而登录块保持原样。</p>
  <div id="loginBox">
    <h2>用户登录</h2>
    <input placeholder="账号">
    <input placeholder="密码" type="password">
    <button>登录</button>
  </div>
  <script>
    ${executableScript}
  <\/script>
</body>
</html>`;

// —— v3.1 Scenario 13: GitHub 式页面 (eager 初始处理 / decide-once / SPA 换页) ——
// 15 枚 95×20 徽章 + logo 位于首屏, 3 张 3600×2018 白底截图位于折叠线以下但启动时已加载完成:
// 断言不滚动的情况下截图已被 eager 通道反色 (F2), 徽章首通决策与强制重扫后一致 (F3)
const GH_BADGES = Array.from({ length: 15 }, (_, i) => `<img class="gh-badge" src="/img/badge-${i + 1}.svg" alt="badge ${i + 1}">`).join('\n    ');
const GITHUB_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>GitHub-like Eager Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imagePolicy: 'balanced' });<\/script>
<style>
  body { background: #ffffff; margin: 0; padding: 24px; font-family: sans-serif; }
  .markdown-body { color: #111; }
  .gh-badge { display: inline-block; width: 95px; height: 20px; margin: 2px; }
  .gh-logo { display: block; width: 120px; height: 120px; }
  .gh-shot { display: block; width: 600px; margin-top: 24px; }
</style>
</head><body>
  <div class="markdown-body" id="md-content">
    <div id="badges-row">${GH_BADGES}</div>
    <img id="gh-logo" class="gh-logo" src="/img/gh-logo.svg" alt="logo">
    <div style="height: 1200px;">(below-fold spacer)</div>
    <img id="gh-shot-1" class="gh-shot" src="/img/shot-1.svg" alt="shot 1">
    <img id="gh-shot-2" class="gh-shot" src="/img/shot-2.svg" alt="shot 2">
    <img id="gh-shot-3" class="gh-shot" src="/img/shot-3.svg" alt="shot 3">
  </div>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.1 Scenario 14: 智能图片策略 —— B 站式封面格 (12 同尺寸浅色封面, 同父)
// + 卡片封面 (chrome 提示) + 孤立大图; balanced: 封面全跳过、大图反色; aggressive: 封面反色
const POLICY_COVERS = Array.from({ length: 12 }, (_, i) => `<img class="feed-cover" src="/img/cover-${i + 1}.svg" alt="cover ${i + 1}">`).join('\n    ');
const POLICY_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Image Policy Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imagePolicy: (new URLSearchParams(location.search).get('policy') || 'balanced'), imgFxMode: 'full' });<\/script>
<style>
  body { background: #121212; color: #eee; padding: 16px; }
  #feed-grid { display: flex; flex-wrap: wrap; width: 1100px; }
  .feed-cover { display: block; width: 240px; height: 135px; margin: 4px; }
  #card-cover { display: block; width: 160px; height: 120px; }
  #lone-diagram { display: block; width: 600px; margin-top: 24px; }
</style>
</head><body>
  <div id="feed-grid">${POLICY_COVERS}</div>
  <div class="video-card"><a href="#" id="card-link"><img id="card-cover" src="/img/cover-card.svg" alt="card cover"></a></div>
  <div id="diagram-wrap"><img id="lone-diagram" src="/img/diagram-big.svg" alt="lone diagram"></div>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.1 Scenario 15: 悬停显示原图开关 (hoverRestore=false: CSS 滤镜路径与 fx content:url 路径均保持反色) ——
// 配置经查询参数传入 (上一页 pagehide 落盘会覆盖导航前写入的种子, 必须在本页加载时种子)
const HOVER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Hover Restore Bench</title>
<script>
  ${SEED_SNIPPET};
  (function () {
    var q = new URLSearchParams(location.search);
    sviSeed({
      hoverRestore: q.get('restore') !== '0',
      imagePolicy: 'balanced',
      imgFxMode: q.get('fx') || 'full'
    });
  })();
<\/script>
<style>body { background: #121212; } img { display:block; width:200px; height:150px; margin: 16px; }
  #hover-bg { width:200px; height:150px; margin:16px; }</style>
</head><body>
  <img id="hover-css" src="/img/white-diagram.svg" alt="css path">
  <div id="hover-bg" style="background-image: url('/img/white-diagram.svg'); background-size: cover;"></div>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// —— v3.1 Scenario 16: 放大镜/看图类插件适配 —— 基础图先建立决策缓存,
// 再动态追加闭合 Shadow Root 宿主 (同 src 图) 与 body 尾部背景图覆盖层:
// 快路径同步反色 + 闭合根内 Alt+点击 可切换 + 背景图引擎覆盖 (R6) ——
const VIEWER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Viewer Extension Bench</title>
<script>${SEED_SNIPPET}; sviSeed({ imagePolicy: 'balanced', imgFxMode: 'full' });<\/script>
<style>body { background: #121212; } img { display:block; width:200px; height:150px; margin: 16px; }</style>
</head><body>
  <img id="viewer-base" src="/img/white-diagram.svg" alt="base">
  <div id="viewer-overlay-slot"></div>
  <script>
    ${executableScript}
  <\/script>
</body></html>`;

// 1. Create HTTP test servers (main + cross-origin CORS SVG host)
// Scenario 12 pages are registered in main() after the extension smoke builds the real bundle.
// v5.0: 元素动作 bench 页 (hide / mask / dim / peek 的落点与开关即回滚)
const ACTION_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Action bench</title>
<style>
  body { margin:0; background:#fff; font:14px sans-serif; }
  #act-wrap { display:flex; padding:8px; }
  .act-box { width:200px; height:120px; margin:8px; background:#f5f5f5; border:1px solid #ddd; }
  #act-target { width:220px; height:140px; margin:8px; background:#ffffff; border:1px solid #eee; }
</style></head>
<body>
  <div id="act-wrap">
    <div class="act-box" id="act-box-a">框 A</div>
    <div id="act-target">目标元素（遮罩 / 屏蔽 / 压暗用）</div>
    <div class="act-box" id="act-box-b">框 B</div>
  </div>
  <script>
    ${executableScript}
  </script>
</body></html>`;

const PAGES = {
  '/action-page': ACTION_HTML,
  '/login-page': LOGIN_HTML,
  '/recolor-page': RECOLOR_HTML,
  '/fx-luma-page': FX_LUMA_HTML,
  '/fx-key-page': FX_KEY_HTML,
  '/video-fx-page': VIDEO_FX_HTML,
  '/video-tl-page': VIDEO_TL_HTML,
  '/learn-page': LEARN_HTML,
  '/media-page': MEDIA_HTML,
  '/storage-page': STORAGE_HTML,
  '/github-page': GITHUB_HTML,
  '/policy-page': POLICY_HTML,
  '/hover-page': HOVER_HTML,
  '/viewer-page': VIEWER_HTML,
  '/tune-page': TUNE_HTML,
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_CONTENT);
    return;
  }
  if (PAGES[url]) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGES[url]);
    return;
  }
  if (SVG_TEMPLATES[url]) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(SVG_TEMPLATES[url]);
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const corsServer = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (SVG_TEMPLATES[url]) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(SVG_TEMPLATES[url]);
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

function listen(srv, port) {
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, () => resolve());
  });
}

function rgbLum(cssColor) {
  const m = /rgba?\(([^)]+)\)/.exec(cssColor || '');
  if (!m) return -1;
  const p = m[1].split(',').map((s) => parseFloat(s));
  return Math.round((p[0] * 77 + p[1] * 150 + p[2] * 29) >> 8);
}

async function main() {
  // —— v3.0 Phase 0: node-only extension smoke (design §9 item 11) ——
  // Runs before the browser phase; a failure here exits non-zero even
  // without Chrome, and the built bundle feeds the Scenario 12 pages.
  runExtensionSmoke();
  const extensionCode = fs.readFileSync(path.join(__dirname, 'extension', 'content.js'), 'utf8');
  PAGES['/coexist-us-first'] = coexistUsFirstHtml(extensionCode);
  PAGES['/coexist-ext-first'] = coexistExtFirstHtml(extensionCode);

  await listen(server, PORT);
  await listen(corsServer, PORT2);
  console.log(`[TestServer] Main bench at http://127.0.0.1:${PORT} (login page: /login-page)`);
  console.log(`[TestServer] Cross-origin CORS SVG host at http://127.0.0.1:${PORT2}`);

  // 2. Launch Chrome headless with CDP (graceful skip when Chrome is unavailable)
  //    (the node-only extension smoke in Phase 0 has already run at this point)
  if (!fs.existsSync(CHROME_PATH)) {
    console.warn(`[Browser] Chrome not found (tried ${CHROME_CANDIDATES.filter(Boolean).join(', ')}); skipping browser end-to-end tests.`);
    console.warn('[Browser] Set SVI_CHROME_PATH to point at a Chrome binary to enable the bench.');
    console.warn('[Browser] (Unit tests in test.js and the node-only extension smoke still passed.)');
    server.close();
    corsServer.close();
    process.exit(0);
  }

  // v3.0 加固: 若 9222 端口已被遗留 Chrome 占用, 先尝试优雅关闭, 避免连到过期实例
  try {
    const probe = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()).catch(() => null);
    if (probe && probe.webSocketDebuggerUrl) {
      console.warn('[Browser] Stale CDP endpoint detected; closing leftover Chrome ...');
      await new Promise((resolve) => {
        const sws = new WebSocket(probe.webSocketDebuggerUrl);
        sws.onopen = () => {
          try { sws.send(JSON.stringify({ id: 1, method: 'Browser.close', params: {} })); } catch (e) {}
          setTimeout(resolve, 1200);
        };
        sws.onerror = () => resolve();
      });
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (e) { /* ignore */ }

  console.log(`[Browser] Launching Headless Chrome: ${CHROME_PATH}`);
  // 固定 profile 目录跨运行持久化 (localStorage/overrides) —— 场景 1 断言假设全新存储,
  // 每次运行前清空保证确定性; 运行内的刷新持久化场景 (2b/18) 不受影响
  try { fs.rmSync(path.join(__dirname, '.chrome-test-profile'), { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader', // v3.0: 视频特效 GPU 覆盖层基准需要 SwiftShader WebGL
    '--no-first-run',
    '--no-default-browser-check',
    // CI (ubuntu) runners: sandbox of the bench Chrome instance is unnecessary
    // and often blocks in containerized runners — disabled for the bench only.
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    '--user-data-dir=' + path.join(__dirname, '.chrome-test-profile'),
    `http://127.0.0.1:${PORT}`
  ]);

  chromeProc.on('error', (err) => {
    console.error('Failed to launch Chrome:', err);
    process.exit(1);
  });

  // Helper: wait for CDP port to open
  async function waitForCDP(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          const list = await res.json();
          const target = list.find((t) => t.type === 'page');
          if (target && target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('CDP failed to become ready');
  }

  let ws = null;
  try {
    const wsUrl = await waitForCDP();
    console.log(`[Browser] Connected to CDP WebSocket: ${wsUrl}`);

    ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.onopen = resolve);

    let msgId = 1;
    function sendCdp(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const onMsg = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === id) {
            ws.removeEventListener('message', onMsg);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    let pageErrorCount = 0; // v3.0: 页面异常计数 (file:// 场景要求零异常)
    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('[Chrome Console]', ...data.params.args.map(a => a.value || a.description));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        pageErrorCount++;
        console.error('[Chrome Exception]', data.params.exceptionDetails);
      }
    });

    await sendCdp('Runtime.enable');
    await sendCdp('Page.enable');

    // ============================================================
    // Scenario 1: main page — image engines, camo SVG decode chain,
    // bg-image thumbnail, icon-grid shield, UI sections, stats
    // ============================================================
    console.log('[Test] Navigating to main bench page ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}` });

    // Wait for images, blob decode chain, bg-image analysis and idle sweeps
    console.log('[Test] Waiting for image analysis to complete in Chrome...');
    await new Promise((r) => setTimeout(r, 4000));

    const evalRes = await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const results = {};
        const ids = ['img-white', 'img-gray', 'img-cream', 'img-blue', 'img-thumb', 'img-dark', 'img-color', 'img-camo', 'img-camo-nosize'];
        ids.forEach(id => {
          const el = document.getElementById(id);
          results[id] = {
            inverted: el ? el.getAttribute('data-svi-inverted') === 'true' : false,
            checkedSrc: el ? !!el.getAttribute('data-svi-checked-src') : false
          };
        });

        const icons = Array.from(document.querySelectorAll('#icon-grid img'));
        results.iconGrid = {
          count: icons.length,
          invertedCount: icons.filter(i => i.getAttribute('data-svi-inverted') === 'true').length
        };

        const bgThumb = document.getElementById('bg-thumb');
        results.bgThumb = { bginv: bgThumb ? bgThumb.getAttribute('data-svi-bginv') === 'true' : false };

        const statsExport = window.__svi ? window.__svi.exportStats() : null; // 开发者导出路径 (导出前强制落盘)
        const statsRaw = localStorage.getItem('universal_smart_invert_stats_v1');
        let statsParsed = null;
        try { statsParsed = statsRaw ? JSON.parse(statsRaw) : null; } catch (e) {}

        results.ui = {
          hasPill: !!document.querySelector('.svi-trigger-pill'),
          hasModal: !!document.querySelector('.svi-modal-mask'),
          chipsCount: document.querySelectorAll('.svi-color-chip').length,
          hasPicker: !!document.querySelector('.svi-color-input-native'),
          hasElementRuleForm: !!document.querySelector('.svi-er-form'),
          actionBtnCount: document.querySelectorAll('.svi-action-btn').length,
          hasSiteSection: !!document.getElementById('svi-sec-site'),
          hasShieldSection: !!document.getElementById('svi-sec-shield'),
          hasStatsSection: !!document.getElementById('svi-sec-stats'),
          hasMediaSection: !!document.getElementById('svi-sec-media'),
          hoverRestoreClass: document.documentElement.classList.contains('svi-hover-restore')
        };
        results.statsKey = {
          exists: !!statsRaw,
          parsed: !!statsParsed,
          imagesAnalyzed: statsParsed ? (statsParsed.counters && statsParsed.counters.imagesAnalyzed) || 0 : 0,
          exportImagesAnalyzed: statsExport ? (statsExport.counters && statsExport.counters.imagesAnalyzed) || 0 : -1,
          exportSchema: statsExport ? statsExport.schema : -1
        };
        return results;
      })()`,
      returnByValue: true
    });

    const report = evalRes.result.value;
    console.log('\n[Browser Test Results — Scenario 1: engines + UI + stats]');
    console.log('----------------------------------------------------');
    console.log(`1. Pure White Diagram:       Inverted = ${report['img-white'].inverted} (Expected: true)`);
    console.log(`2. Light Gray Chart:         Inverted = ${report['img-gray'].inverted} (Expected: true)`);
    console.log(`3. Warm Cream Slide:         Inverted = ${report['img-cream'].inverted} (Expected: true)`);
    console.log(`4. Pale Blue Flowchart:      Inverted = ${report['img-blue'].inverted} (Expected: true)`);
    console.log(`5. Wiki/Thumb URL Diagram:   Inverted = ${report['img-thumb'].inverted} (Expected: true)`);
    console.log(`6. Dark Scenery Photo:       Inverted = ${report['img-dark'].inverted} (Expected: false)`);
    console.log(`7. High-Sat Colorful Banner: Inverted = ${report['img-color'].inverted} (Expected: false)`);
    console.log(`8. CORS SVG (sized):         Inverted = ${report['img-camo'].inverted} (Expected: true)`);
    console.log(`9. CORS SVG (no size):       Inverted = ${report['img-camo-nosize'].inverted} (Expected: true)`);
    console.log(`10. BG-Image Thumb div:      data-svi-bginv = ${report.bgThumb.bginv} (Expected: true)`);
    console.log(`Icon grid (20 tiny repeats): ${report.iconGrid.invertedCount}/${report.iconGrid.count} inverted (Expected: 0)`);
    console.log(`Stats key parsed:            ${report.statsKey.parsed} imagesAnalyzed = ${report.statsKey.imagesAnalyzed} (Expected: parsed + >=1)`);
    console.log('----------------------------------------------------');
    console.log(`UI Float Pill:               ${report.ui.hasPill ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Settings Modal:           ${report.ui.hasModal ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Color Chips (Presets):    ${report.ui.chipsCount} chips loaded`);
    console.log(`UI Color Picker:             ${report.ui.hasPicker ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Collapsible Accordion:    ${report.ui.hasAccordion ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Panel Action Buttons:     ${report.ui.actionBtnCount} (Expected: 4, incl. 背景替换)`);
    console.log(`Modal Site Section:          ${report.ui.hasSiteSection ? '✓ Present' : '✗ Missing'}`);
    console.log(`Modal Shield Section:        ${report.ui.hasShieldSection ? '✓ Present' : '✗ Missing'}`);
    console.log(`Modal Stats Section:         ${report.ui.hasStatsSection ? '✓ Present' : '✗ Missing'}`);
    console.log('----------------------------------------------------\n');

    // Assertions — original image engine behaviors must not regress
    assert.strictEqual(report['img-white'].inverted, true, 'White diagram must be inverted');
    assert.strictEqual(report['img-gray'].inverted, true, 'Light gray chart must be inverted');
    assert.strictEqual(report['img-cream'].inverted, true, 'Warm cream slide must be inverted');
    assert.strictEqual(report['img-blue'].inverted, true, 'Pale blue flowchart must be inverted');
    assert.strictEqual(report['img-thumb'].inverted, true, 'Wiki thumb URL diagram must be inverted');
    assert.strictEqual(report['img-dark'].inverted, false, 'Dark photo must NOT be inverted');
    assert.strictEqual(report['img-color'].inverted, false, 'Colorful banner must NOT be inverted');

    // R6: star-history / camo cross-origin SVG decode chain
    assert.strictEqual(report['img-camo'].inverted, true, 'Cross-origin CORS SVG with intrinsic size must be inverted');
    assert.strictEqual(report['img-camo-nosize'].inverted, true, 'Cross-origin CORS SVG without intrinsic size must be inverted (temp-img fallback)');

    // R8: bilibili-style background-image thumbnail
    assert.strictEqual(report.bgThumb.bginv, true, 'Light background-image div must get data-svi-bginv=true');

    // R3: repeated tiny icon grid must never be auto-inverted
    assert.strictEqual(report.iconGrid.count, 20, 'Icon grid must contain 20 icons');
    assert.strictEqual(report.iconGrid.invertedCount, 0, 'Repeated tiny icons must NOT be inverted');

    // UI: 4 panel buttons + three new modal sections
    assert.strictEqual(report.ui.hasPill, true, 'Floating pill UI must exist');
    assert.strictEqual(report.ui.hasModal, true, 'Settings modal must exist');
    assert.strictEqual(report.ui.hasPicker, true, 'Native color picker must exist');
    assert.strictEqual(report.ui.hasElementRuleForm, true, 'Element rule form must exist (v3.3 element rules)');
    assert.strictEqual(report.ui.actionBtnCount, 4, 'Panel must have 4 action buttons (video/smart/image/bg-replace)');
    assert.strictEqual(report.ui.hasSiteSection, true, 'Modal 站点与规则 section must exist');
    assert.strictEqual(report.ui.hasShieldSection, true, 'Modal 原色屏蔽 section must exist');
    assert.strictEqual(report.ui.hasStatsSection, true, 'Modal 数据与反馈 section must exist');
    assert.strictEqual(report.ui.hasMediaSection, true, 'Modal 当前页媒体 section must exist (v3.1)');
    assert.strictEqual(report.ui.hoverRestoreClass, true, 'html.svi-hover-restore must be on by default (v3.1)');

    // R5: stats key must exist and parse after activity (flushed via the designed export path)
    assert.strictEqual(report.statsKey.parsed, true, 'localStorage stats key must exist and parse');
    assert.ok(report.statsKey.imagesAnalyzed >= 1, 'persisted stats counters must record image analysis activity');
    assert.ok(report.statsKey.exportImagesAnalyzed >= 1, 'export JSON must contain image analysis counter');
    assert.strictEqual(report.statsKey.exportSchema, 1, 'export JSON envelope schema must be 1');

    // ============================================================
    // Scenario 1b (v3.3): 元素级规则 —— 保护/强制反色立即生效, 删除后恢复自动决策
    // ============================================================
    console.log('[Test] Scenario 1b: element rules (protect / invert) ...');
    await new Promise((r) => setTimeout(r, 300));
    const erBefore = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const before = {
          white: document.getElementById('img-white').getAttribute('data-svi-inverted') === 'true',
          dark: document.getElementById('img-dark').getAttribute('data-svi-inverted') === 'true'
        };
        window.__svi.prefs.elementRules = [{ id: 'er-protect', pattern: '*', selector: '#img-white', action: 'protect', note: '', createdAt: Date.now() }];
        window.__svi.savePrefs();
        window.__svi_image_engine.clearCacheAndRescan();
        return before;
      })()`,
      returnByValue: true
    })).result.value;
    await new Promise((r) => setTimeout(r, 1500));
    const erProtected = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        white: document.getElementById('img-white').getAttribute('data-svi-inverted') === 'true',
        dark: document.getElementById('img-dark').getAttribute('data-svi-inverted') === 'true'
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(erBefore.white, true, 'pre-condition: light image inverted before element rule');
    assert.strictEqual(erBefore.dark, false, 'pre-condition: dark image not inverted before element rule');
    assert.strictEqual(erProtected.white, false, 'protect element rule must remove inversion from matched image');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.__svi.prefs.elementRules = [{ id: 'er-invert', pattern: '*', selector: '#img-dark', action: 'invert', note: '', createdAt: Date.now() }];
        window.__svi.savePrefs();
        window.__svi_image_engine.clearCacheAndRescan();
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 1500));
    const erInverted = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        white: document.getElementById('img-white').getAttribute('data-svi-inverted') === 'true',
        dark: document.getElementById('img-dark').getAttribute('data-svi-inverted') === 'true'
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(erInverted.dark, true, 'invert element rule must force-invert the matched dark image');
    assert.strictEqual(erInverted.white, true, 'removing protect rule must restore auto pixel inversion');
    // 清理: 清空规则恢复默认世界 (后续场景依赖干净状态)
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.prefs.elementRules = []; window.__svi.savePrefs(); window.__svi_image_engine.clearCacheAndRescan(); return true; })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 800));

    // ============================================================
    // Scenario 2 (R7): toggle 视频反色 via the UI button, then reload —
    // fresh page must start with video invert OFF and no invertActive in storage
    // ============================================================
    console.log('[Test] Scenario 2: toggling 视频反色 via UI button ...');
    await new Promise((r) => setTimeout(r, 300));
    const toggleRes = await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const pill = document.querySelector('.svi-trigger-pill');
        if (pill) pill.click();
        const btns = document.querySelectorAll('.svi-action-btn');
        const videoBtn = btns[0];
        const labelBefore = videoBtn ? videoBtn.textContent : '';
        if (videoBtn) videoBtn.click();
        const v4raw = localStorage.getItem('universal_smart_invert_v4');
        let v4 = null;
        try { v4 = v4raw ? JSON.parse(v4raw) : {}; } catch (e) { v4 = { parseError: true }; }
        return {
          clicked: !!videoBtn,
          labelBefore,
          labelAfter: videoBtn ? videoBtn.textContent : '',
          runtimeInvertActive: window.__svi ? window.__svi.runtime.invertActive : null,
          v4Exists: !!v4raw,
          v4HasInvertActive: v4 ? ('invertActive' in v4) : null
        };
      })()`,
      returnByValue: true
    });
    const toggle = toggleRes.result.value;
    console.log(`Toggle result: clicked=${toggle.clicked} label "${toggle.labelBefore}" -> "${toggle.labelAfter}" runtime.invertActive=${toggle.runtimeInvertActive}`);
    assert.strictEqual(toggle.clicked, true, 'video invert button must be clickable');
    assert.strictEqual(toggle.runtimeInvertActive, true, 'runtime.invertActive must be true after UI toggle');
    assert.ok(toggle.v4HasInvertActive === false, 'video invert state must NEVER be written to prefs storage (R7)');

    // ============================================================
    // Scenario 2b (R5): Alt+click manual override on the dark photo —
    // decision must persist to prefs and survive a reload
    // ============================================================
    console.log('[Test] Scenario 2b: Alt+click manual override on dark photo ...');
    await new Promise((r) => setTimeout(r, 300));
    const altRes = await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('img-dark');
        img.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }));
        const mo = window.__svi ? window.__svi.prefs.manualOverrides : {};
        return {
          invertedAfterClick: img.getAttribute('data-svi-inverted') === 'true',
          overrideCount: Object.keys(mo).length,
          hasDarkKey: Object.keys(mo).some(k => k.indexOf('dark-scenery.svg') !== -1)
        };
      })()`,
      returnByValue: true
    });
    const altClick = altRes.result.value;
    console.log(`Alt+click: img-dark inverted=${altClick.invertedAfterClick} overrides=${altClick.overrideCount} darkKey=${altClick.hasDarkKey}`);
    assert.strictEqual(altClick.invertedAfterClick, true, 'Alt+click must force-invert the dark photo');
    assert.ok(altClick.overrideCount >= 1, 'manual override must be persisted in prefs');
    assert.strictEqual(altClick.hasDarkKey, true, 'manual override key host|src must reference dark-scenery.svg');

    await new Promise((r) => setTimeout(r, 600)); // 等待防抖落盘
    console.log('[Test] Scenario 2b: reloading main page to verify override survival ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}` });
    await new Promise((r) => setTimeout(r, 3500));
    const survRes = await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('img-dark');
        return { invertedAfterReload: img ? img.getAttribute('data-svi-inverted') === 'true' : false };
      })()`,
      returnByValue: true
    });
    console.log(`After reload: img-dark inverted=${survRes.result.value.invertedAfterReload} (Expected: true, decision remembered)`);
    assert.strictEqual(survRes.result.value.invertedAfterReload, true, 'manual override must survive reload (R5)');

    // ============================================================
    // Scenario 3 (R1/R7): login page with bgReplace pre-seeded —
    // body goes dark, login box unchanged, fresh page video invert OFF
    // ============================================================
    console.log('[Test] Scenario 3: navigating to /login-page (bgReplace pre-seeded) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/login-page` });
    await new Promise((r) => setTimeout(r, 3000));

    const loginRes = await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const bodyLum = (() => {
          const c = getComputedStyle(document.body).backgroundColor;
          const m = /rgba?\\(([^)]+)\\)/.exec(c);
          if (!m) return -1;
          const p = m[1].split(',').map(s => parseFloat(s));
          return Math.round((p[0] * 77 + p[1] * 150 + p[2] * 29) >> 8);
        })();
        const loginLum = (() => {
          const c = getComputedStyle(document.getElementById('loginBox')).backgroundColor;
          const m = /rgba?\\(([^)]+)\\)/.exec(c);
          if (!m) return -1;
          const p = m[1].split(',').map(s => parseFloat(s));
          return Math.round((p[0] * 77 + p[1] * 150 + p[2] * 29) >> 8);
        })();
        const v4raw = localStorage.getItem('universal_smart_invert_v4');
        let v4 = null;
        try { v4 = v4raw ? JSON.parse(v4raw) : {}; } catch (e) { v4 = {}; }
        return {
          bodyLum,
          loginLum,
          bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
          runtimeInvertActive: window.__svi ? window.__svi.runtime.invertActive : null,
          v4HasInvertActive: v4 ? ('invertActive' in v4) : null
        };
      })()`,
      returnByValue: true
    });
    const login = loginRes.result.value;
    console.log(`Login page: bodyLum=${login.bodyLum} (Expected < 120) loginLum=${login.loginLum} (Expected > 200) bgrOn=${login.bgrOn} runtimeInvertActive=${login.runtimeInvertActive}`);
    assert.strictEqual(login.runtimeInvertActive, false, 'fresh page/reload must start with video invert OFF (R7)');
    assert.ok(login.v4HasInvertActive === false, 'prefs storage must never contain invertActive after reload (R7)');
    assert.strictEqual(login.bgrOn, true, 'background replace must be active (data-svi-bgr-on)');
    assert.ok(login.bodyLum >= 0 && login.bodyLum < 120, 'light body background must be replaced with dark equivalent (R1)');
    assert.ok(login.loginLum > 200, 'login box background must stay unchanged (R1 login-block safe)');

    // ============================================================
    // v3.0 辅助: 页面内条件等待 (轮询 CDP evaluate)
    // ============================================================
    async function waitForExpr(expression, timeoutMs, pollMs) {
      const deadline = Date.now() + (timeoutMs || 10000);
      while (Date.now() < deadline) {
        try {
          const r = await sendCdp('Runtime.evaluate', { expression, returnByValue: true });
          if (r && r.result && r.result.value === true) return true;
        } catch (e) { /* ignore */ }
        await new Promise((r2) => setTimeout(r2, pollMs || 300));
      }
      return false;
    }

    function rgbDelta(a, b) {
      return [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])];
    }

    // ============================================================
    // Scenario 4 (R1): luma 部分反色 —— content:url 投递 + blob 像素读回 + 悬停还原 + kill switch
    // ============================================================
    console.log('[Test] Scenario 4: navigating to /fx-luma-page (luma fx) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/fx-luma-page` });
    await new Promise((r) => setTimeout(r, 4500));

    const fxLuma = (await sendCdp('Runtime.evaluate', {
      expression: `(async () => {
        const img = document.getElementById('fx-half');
        const out = {
          hasFxAttr: img.getAttribute('data-svi-fx') !== null,
          cssInverted: img.getAttribute('data-svi-inverted') === 'true',
          fxStyleHasContentRule: ((document.getElementById('svi-fx-style') || {textContent: ''}).textContent.indexOf('content: url(') !== -1),
          contentComputed: getComputedStyle(img).content
        };
        const fx = window.__svi_image_fx;
        let entry = null;
        if (fx && fx.lru) { for (const v of fx.lru.values()) { entry = v; break; } }
        out.hasBlob = !!(entry && entry.blobUrl);
        if (entry) {
          const im = await new Promise((resolve, reject) => {
            const i2 = new Image();
            i2.onload = () => resolve(i2);
            i2.onerror = () => reject(new Error('blob load fail'));
            i2.src = entry.blobUrl;
          });
          const cv = document.createElement('canvas');
          cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          const ctx = cv.getContext('2d');
          ctx.drawImage(im, 0, 0);
          const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
          out.whiteRegion = px(30, 60);
          out.blueRegion = px(170, 60);
        }
        const photo = document.getElementById('fx-photo');
        out.photoHasFx = photo.getAttribute('data-svi-fx') !== null;
        return out;
      })()`,
      returnByValue: true,
      awaitPromise: true
    })).result.value;
    console.log('Luma fx result:', JSON.stringify(fxLuma));
    assert.strictEqual(fxLuma.hasFxAttr, true, 'luma: img must carry data-svi-fx');
    assert.strictEqual(fxLuma.cssInverted, false, 'luma: data-svi-inverted must stay OFF for content-swapped img');
    assert.strictEqual(fxLuma.fxStyleHasContentRule, true, 'luma: content:url rule must be injected');
    assert.strictEqual(fxLuma.hasBlob, true, 'luma: processed blob must be cached in engine LRU');
    assert.ok(fxLuma.whiteRegion[0] < 60 && fxLuma.whiteRegion[1] < 60 && fxLuma.whiteRegion[2] < 60,
      'luma: white region must be inverted to dark in processed blob, got ' + JSON.stringify(fxLuma.whiteRegion));
    const blueDelta = rgbDelta(fxLuma.blueRegion, [30, 80, 200]);
    assert.ok(blueDelta.every((d) => d <= 40),
      'luma: saturated blue region must stay within ΔRGB ≤ 40, got ' + JSON.stringify(fxLuma.blueRegion));
    assert.strictEqual(fxLuma.photoHasFx, false, 'luma: colorful photo must NOT be fx-delivered');

    // 悬停还原 (CDP 真实鼠标事件触发 :hover 与委托监听双通道)
    const fxRect = JSON.parse((await sendCdp('Runtime.evaluate', {
      expression: `JSON.stringify(document.getElementById('fx-half').getBoundingClientRect())`,
      returnByValue: true
    })).result.value);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(fxRect.left + fxRect.width / 2),
      y: Math.round(fxRect.top + fxRect.height / 2)
    });
    await new Promise((r) => setTimeout(r, 250));
    const hoverRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('fx-half');
        return { hoverClass: img.classList.contains('svi-fx-hover'), content: getComputedStyle(img).content };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Hover state:', JSON.stringify(hoverRes));
    assert.ok(hoverRes.content.indexOf('blob:') === -1, 'hover must restore original rendering (content unset), got ' + hoverRes.content);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
    await new Promise((r) => setTimeout(r, 250));
    const unhoverRes = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.getElementById('fx-half')).content`,
      returnByValue: true
    })).result.value;
    assert.ok(String(unhoverRes).indexOf('blob:') !== -1, 'moving away must restore the fx content delivery');

    // Alt+点击 kill switch
    const killRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('fx-half');
        img.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }));
        const off1 = img.getAttribute('data-svi-fx-off') === 'true';
        const content1 = getComputedStyle(img).content;
        img.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }));
        const off2 = img.getAttribute('data-svi-fx-off') === 'true';
        return { off1, content1, off2 };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(killRes.off1, true, 'Alt+click must toggle data-svi-fx-off ON');
    assert.ok(killRes.content1.indexOf('blob:') === -1, 'kill switch must show original image');
    assert.strictEqual(killRes.off2, false, 'second Alt+click must re-enable the fx delivery');

    // ============================================================
    // Scenario 5 (R1): key 键色反色 —— 仅键色区域被反色
    // ============================================================
    console.log('[Test] Scenario 5: navigating to /fx-key-page (key fx) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/fx-key-page` });
    await new Promise((r) => setTimeout(r, 4500));
    const fxKey = (await sendCdp('Runtime.evaluate', {
      expression: `(async () => {
        const fx = window.__svi_image_fx;
        let entry = null;
        if (fx && fx.lru) { for (const v of fx.lru.values()) { entry = v; break; } }
        if (!entry) return { hasBlob: false };
        const im = await new Promise((resolve, reject) => {
          const i2 = new Image();
          i2.onload = () => resolve(i2);
          i2.onerror = () => reject(new Error('blob load fail'));
          i2.src = entry.blobUrl;
        });
        const cv = document.createElement('canvas');
        cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.drawImage(im, 0, 0);
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        return { hasBlob: true, redRegion: px(30, 60), whiteRegion: px(170, 60) };
      })()`,
      returnByValue: true,
      awaitPromise: true
    })).result.value;
    console.log('Key fx result:', JSON.stringify(fxKey));
    assert.strictEqual(fxKey.hasBlob, true, 'key: processed blob must exist');
    const redDelta = rgbDelta(fxKey.redRegion, [0, 255, 255]);
    assert.ok(redDelta.every((d) => d <= 40),
      'key: red (key color) region must invert to cyan, got ' + JSON.stringify(fxKey.redRegion));
    const whiteDelta = rgbDelta(fxKey.whiteRegion, [255, 255, 255]);
    assert.ok(whiteDelta.every((d) => d <= 5),
      'key: white (non-key) region must stay unchanged, got ' + JSON.stringify(fxKey.whiteRegion));

    // ============================================================
    // Scenario 6 (R2): 视频特效 GPU 覆盖层 (SwiftShader) + PiP 流
    // ============================================================
    console.log('[Test] Scenario 6: navigating to /video-fx-page (WebGL overlay luma) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/video-fx-page` });
    const videoReady = await waitForExpr(`(() => {
      const v = document.getElementById('bench-video');
      return !!(v && v.currentTime > 0.4 && window.__svi && window.__svi.engines.videoFx);
    })()`, 15000);
    assert.ok(videoReady, 'bench video must be playing (currentTime advancing)');

    // 手动开启反色 → 覆盖层创建并 luma 渲染 (autoDetect 已种子关闭)
    await sendCdp('Runtime.evaluate', { expression: `window.__svi.engines.hil.onUserToggleInvert(); 'on'`, returnByValue: true });
    const overlayReady = await waitForExpr(`(() => {
      const ov = document.querySelector('.svi-fx-overlay');
      return !!(ov && ov.width >= 2);
    })()`, 8000);
    console.log('Overlay ready:', overlayReady);
    await new Promise((r) => setTimeout(r, 1200));
    const overlayData = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const ov = document.querySelector('.svi-fx-overlay');
        if (!ov) return { found: false, available: window.__svi.engines.videoFx.available, reason: window.__svi.engines.videoFx.unavailableReason };
        const cv = document.createElement('canvas');
        cv.width = ov.width; cv.height = ov.height;
        const ctx = cv.getContext('2d');
        ctx.drawImage(ov, 0, 0);
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        return {
          found: true,
          w: ov.width, h: ov.height,
          internalCapped: ov.width <= 1920 && ov.height <= 1080,
          leftWhite: px(Math.round(ov.width * 0.25), Math.round(ov.height / 2)),
          rightBlue: px(Math.round(ov.width * 0.75), Math.round(ov.height / 2)),
          cssFilterOnVideo: document.getElementById('bench-video').style.getPropertyValue('filter') || '(none)'
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Overlay readback:', JSON.stringify(overlayData));
    assert.strictEqual(overlayData.found, true, 'WebGL overlay canvas must exist for positioned video (got reason: ' + (overlayData.reason || 'n/a') + ')');
    assert.strictEqual(overlayData.internalCapped, true, 'overlay internal resolution must be capped at 1080p');
    assert.ok(overlayData.leftWhite[0] < 90 && overlayData.leftWhite[1] < 90 && overlayData.leftWhite[2] < 90,
      'overlay luma: white half must render inverted (dark), got ' + JSON.stringify(overlayData.leftWhite));
    const ovBlueDelta = rgbDelta(overlayData.rightBlue, [30, 80, 200]);
    assert.ok(ovBlueDelta.every((d) => d <= 45),
      'overlay luma: saturated blue half must be preserved, got ' + JSON.stringify(overlayData.rightBlue));
    assert.strictEqual(overlayData.cssFilterOnVideo, '(none)', 'CSS filter must be suppressed while overlay is active');

    // PiP 路径: 处理流必须产出至少一条视频轨
    const pipStream = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const s = window.__svi.engines.videoFx.captureProcessedStream(document.getElementById('bench-video'));
        return { tracks: s.getTracks().length, kind: s.getTracks()[0] ? s.getTracks()[0].kind : null };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('PiP stream:', JSON.stringify(pipStream));
    assert.ok(pipStream.tracks >= 1, 'captureStream must yield at least one track');
    assert.strictEqual(pipStream.kind, 'video', 'first track must be a video track');

    // ============================================================
    // Scenario 7 (R3): 时间线记忆 —— 手动修正记录片段, 重载后 reference 模式自动布防
    // ============================================================
    console.log('[Test] Scenario 7: navigating to /video-tl-page (timeline record) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/video-tl-page` });
    const tlPlaying = await waitForExpr(`(() => {
      const v = document.getElementById('bench-video');
      return !!(v && v.currentTime > 0.4 && window.__svi && window.__svi.engines.hil);
    })()`, 15000);
    assert.ok(tlPlaying, 'timeline bench video must be playing');
    await sendCdp('Runtime.evaluate', { expression: `window.__svi.engines.hil.onUserToggleInvert(); 'on'`, returnByValue: true });
    await new Promise((r) => setTimeout(r, 1600));
    await sendCdp('Runtime.evaluate', { expression: `window.__svi.engines.hil.onUserToggleInvert(); 'off'`, returnByValue: true });
    await new Promise((r) => setTimeout(r, 900)); // Store 400ms 防抖落盘
    const segRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const data = window.__svi.Store.get('timeline', {});
        const keys = Object.keys(data);
        let segs = null;
        for (const k of keys) { if (data[k].segs && data[k].segs.length) { segs = data[k].segs; break; } }
        return { keyCount: keys.length, segs };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Recorded timeline:', JSON.stringify(segRes));
    assert.ok(segRes.segs && segRes.segs.length >= 1, 'timeline must record at least one invert-active segment');

    console.log('[Test] Scenario 7: reloading to verify reference-mode auto-arm ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/video-tl-page` });
    const segEnd = segRes.segs[segRes.segs.length - 1][1];
    const armed = await waitForExpr(`(() => {
      const v = document.getElementById('bench-video');
      return !!(v && v.currentTime > 0.9 && v.currentTime < ${(segEnd + 0.4).toFixed(2)} && window.__svi && window.__svi.runtime.invertActive === true);
    })()`, 15000);
    assert.ok(armed, 'reference mode must auto-arm inversion inside the learned segment (no user action)');
    const disarmed = await waitForExpr(`(() => {
      const v = document.getElementById('bench-video');
      return !!(v && v.currentTime > ${(segEnd + 0.6).toFixed(2)} && window.__svi.runtime.invertActive === false);
    })()`, 15000);
    assert.ok(disarmed, 'reference mode must disarm outside the learned segment');

    // ============================================================
    // Scenario 8 (R4): 自学习规则 —— 3 次 Alt+点击修正 → 学习规则在全新加载中自动反色第 4 张
    // ============================================================
    console.log('[Test] Scenario 8: navigating to /learn-page (rule learning) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/learn-page` });
    await new Promise((r) => setTimeout(r, 3500));
    const clickRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        let invertedBefore = 0;
        for (let i = 1; i <= 3; i++) {
          const img = document.getElementById('learn-' + i);
          if (img.getAttribute('data-svi-inverted') === 'true') invertedBefore++;
          img.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }));
        }
        return { invertedBefore, rules: window.__svi.RuleLearner.rulesFor(window.__svi.profileKey()) };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('RuleLearner after 3 corrections:', JSON.stringify(clickRes));
    assert.strictEqual(clickRes.invertedBefore, 0, 'dark images must not be auto-inverted before corrections');
    assert.ok(clickRes.rules.some((r) => r.stem === 'img.thumb-x' && r.hits >= 3), '3 corrections must aggregate into one learned rule with hits ≥ 3');
    await new Promise((r) => setTimeout(r, 900)); // 落盘
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/learn-page` });
    await new Promise((r) => setTimeout(r, 4000));
    const learnedRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const out = {};
        for (let i = 1; i <= 4; i++) {
          out['learn-' + i] = document.getElementById('learn-' + i).getAttribute('data-svi-inverted') === 'true';
        }
        out.smartSection = !!document.getElementById('svi-sec-site');
        out.smartText = document.getElementById('svi-sec-site') ? document.getElementById('svi-sec-site').textContent : '';
        return out;
      })()`,
      returnByValue: true
    })).result.value;
    console.log('After reload:', JSON.stringify(learnedRes));
    assert.strictEqual(learnedRes['learn-4'], true, 'learned rule must auto-invert the untouched 4th dark image on fresh load');
    assert.ok(learnedRes.smartSection, '🧠智能 section must exist');
    assert.ok(learnedRes.smartText.indexOf('img.thumb-x') !== -1, 'learned rule must be listed in the 🧠智能 section');

    // ============================================================
    // Scenario 9 (R8): 媒体覆盖 —— canvas / 视频海报 / Shadow DOM img / SVG image / input image
    // ============================================================
    console.log('[Test] Scenario 9: navigating to /media-page (media coverage) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/media-page` });
    await new Promise((r) => setTimeout(r, 6000));
    const mediaRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const cv = document.getElementById('light-canvas');
        const pv = document.getElementById('poster-video');
        const sh = document.getElementById('shadow-host').shadowRoot.getElementById('shadow-img');
        const si = document.getElementById('svg-image');
        const ii = document.getElementById('input-image');
        return {
          canvasInverted: cv.getAttribute('data-svi-inverted') === 'true',
          posterLight: pv.dataset.sviPoster === 'light',
          shadowImgInverted: !!(sh && sh.getAttribute('data-svi-inverted') === 'true'),
          svgImageInverted: !!(si && si.getAttribute('data-svi-inverted') === 'true'),
          inputImageInverted: !!(ii && ii.getAttribute('data-svi-inverted') === 'true'),
          overlayCanvasTouched: !!cv.classList.contains('svi-fx-overlay')
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Media coverage:', JSON.stringify(mediaRes));
    assert.strictEqual(mediaRes.canvasInverted, true, 'light canvas must be inverted');
    assert.strictEqual(mediaRes.posterLight, true, 'light video poster must be tagged data-svi-poster=light');
    assert.strictEqual(mediaRes.shadowImgInverted, true, 'shadow-DOM img must be inverted');
    assert.strictEqual(mediaRes.svgImageInverted, true, 'inline SVG <image> must be inverted');
    assert.strictEqual(mediaRes.inputImageInverted, true, 'input[type=image] must be inverted');

    // ============================================================
    // Scenario 10 (R6): 存储迁移与管理 —— v2.0 键迁移 / 键删除 / 导出解析
    // (迁移由 /storage-page 自身的注入前种子驱动: 种 v4 + 删 svi:prefs → 用户脚本
    //  引导时走遗留迁移路径, 同页断言, 避免 pagehide 落盘覆盖种子)
    // ============================================================
    console.log('[Test] Scenario 10: navigating to /storage-page (storage migration) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/storage-page` });
    await new Promise((r) => setTimeout(r, 4500));
    const storageRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const out = {};
        const sp = localStorage.getItem('svi:prefs');
        out.sviPrefsParses = !!sp;
        if (sp) {
          try {
            const parsed = JSON.parse(sp);
            out.markerStatsEnabled = parsed.statsEnabled === false;
            out.markerBgReplace = parsed.bgReplace === true;
            out.noManualOverrides = !('manualOverrides' in parsed);
          } catch (e) { out.sviPrefsParses = false; }
        }
        out.legacyV4Untouched = !!localStorage.getItem('universal_smart_invert_v4');
        out.overridesKey = !!localStorage.getItem('svi:overrides');
        out.backend = window.__svi.Store.backend;
        out.describeCount = window.__svi.Store.describe().length;
        out.storageSection = !!document.getElementById('svi-sec-stats');
        out.badgeText = (document.querySelector('#svi-sec-stats .svi-backend-badge') || {textContent: ''}).textContent;
        out.exportParses = (() => { try { JSON.stringify(window.__svi.Store.exportAll()); return true; } catch (e) { return false; } })();
        // 键删除
        try {
          window.__svi.Store.remove('timeline');
          window.__svi.Store.flush();
          out.timelineDeleted = !localStorage.getItem('svi:timeline');
        } catch (e) { out.timelineDeleted = false; }
        return out;
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Storage:', JSON.stringify(storageRes));
    assert.strictEqual(storageRes.sviPrefsParses, true, 'svi:prefs must be recreated by migration');
    assert.strictEqual(storageRes.markerStatsEnabled, true, 'migrated prefs must carry the v2.0 seeded marker (statsEnabled=false)');
    assert.strictEqual(storageRes.markerBgReplace, true, 'migrated prefs must carry the v2.0 seeded bgReplace');
    assert.strictEqual(storageRes.noManualOverrides, true, 'manualOverrides must not live inside svi:prefs');
    assert.strictEqual(storageRes.legacyV4Untouched, true, 'legacy v4 key must be preserved for rollback');
    assert.ok(storageRes.describeCount >= 1, 'storage manager must list keys');
    assert.strictEqual(storageRes.storageSection, true, '💾存储 section must exist');
    assert.ok(storageRes.badgeText.length > 0, 'backend badge must show a label');
    assert.strictEqual(storageRes.exportParses, true, 'export JSON must serialize');
    assert.strictEqual(storageRes.timelineDeleted, true, 'key delete must remove the backend entry');

    // ============================================================
    // Scenario 11 (R7): file:// 支持 —— 引导 + UI + 零页面异常
    // ============================================================
    console.log('[Test] Scenario 11: file:// page ...');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-file-test-'));
    const FILE_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>SVI file bench</title>
<style>img { display:block; width:200px; height:120px; }</style>
</head><body>
  <h1>file bench</h1>
  <img id="f-img" src="./pic.svg" alt="local pic">
  <script>
    ${executableScript}
  <\/script>
</body></html>`;
    fs.writeFileSync(path.join(tmpDir, 'page.html'), FILE_PAGE);
    fs.writeFileSync(path.join(tmpDir, 'pic.svg'), SVG_TEMPLATES['/img/white-diagram.svg']);
    const fileUrl = 'file:///' + path.resolve(tmpDir, 'page.html').replace(/\\/g, '/');
    console.log('[Test] file URL:', fileUrl);
    pageErrorCount = 0;
    await sendCdp('Page.navigate', { url: fileUrl });
    await new Promise((r) => setTimeout(r, 4500));
    const fileRes = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        booted: !!(window.__svi && window.__svi.version),
        version: window.__svi ? window.__svi.version : null,
        hasPill: !!document.querySelector('.svi-trigger-pill'),
        hasStorageSection: !!document.getElementById('svi-sec-stats'),
        imgTagged: !!document.getElementById('f-img').getAttribute('data-svi-failed'),
        runtimeBlockedFlag: !!(window.__svi && window.__svi.runtime && window.__svi.runtime.fileAccessBlocked)
      }))()`,
      returnByValue: true
    })).result.value;
    console.log('file:// result:', JSON.stringify(fileRes), 'pageErrors =', pageErrorCount);
    assert.strictEqual(fileRes.booted, true, 'script must boot on file:// pages');
    assert.strictEqual(fileRes.version, USERSRC_VERSION, 'file:// page must report the @version');
    assert.strictEqual(fileRes.hasPill, true, 'UI must be present on file:// pages');
    assert.strictEqual(fileRes.hasStorageSection, true, 'storage section (with file hint) must exist');
    assert.strictEqual(pageErrorCount, 0, 'file:// page must boot with zero uncaught page errors');

    // ============================================================
    // Scenario 12 (R9-core): 共存握手 —— 首启动者认领, 后到者休眠 (两种顺序)
    // v3.0: 第二参与方为真实构建产物 extension/content.js (含 EXT_MODE 前奏),
    // 不再是模拟的 window.EXT_MODE 注入。
    // ============================================================
    console.log('[Test] Scenario 12: coexistence handshake (us first) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/coexist-us-first` });
    await new Promise((r) => setTimeout(r, 3000));
    const coexistUs = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        owner: (document.documentElement.dataset.sviOwner || '').split('|')[0],
        usBooted: !!(window.__svi_us && window.__svi_us.version && !window.__svi_us.dormant),
        extDormant: !!(window.__svi_ext && window.__svi_ext.dormant === true),
        singleUI: document.querySelectorAll('.svi-capsule-root').length
      }))()`,
      returnByValue: true
    })).result.value;
    console.log('Coexistence us-first:', JSON.stringify(coexistUs));
    assert.strictEqual(coexistUs.owner, 'us', 'userscript must claim the page');
    assert.strictEqual(coexistUs.usBooted, true, 'first booter must boot normally');
    assert.strictEqual(coexistUs.extDormant, true, 'second (ext-kind) booter must go dormant');
    assert.strictEqual(coexistUs.singleUI, 1, 'exactly one UI instance must exist');

    console.log('[Test] Scenario 12: coexistence handshake (ext first) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/coexist-ext-first` });
    await new Promise((r) => setTimeout(r, 3000));
    const coexistExt = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        owner: (document.documentElement.dataset.sviOwner || '').split('|')[0],
        extBooted: !!(window.__svi_ext && window.__svi_ext.version && !window.__svi_ext.dormant),
        usDormant: !!(window.__svi_us && window.__svi_us.dormant === true),
        singleUI: document.querySelectorAll('.svi-capsule-root').length
      }))()`,
      returnByValue: true
    })).result.value;
    console.log('Coexistence ext-first:', JSON.stringify(coexistExt));
    assert.strictEqual(coexistExt.owner, 'ext', 'ext-kind script must claim the page');
    assert.strictEqual(coexistExt.extBooted, true, 'ext-first booter must boot normally');
    assert.strictEqual(coexistExt.usDormant, true, 'second (userscript) booter must go dormant');
    assert.strictEqual(coexistExt.singleUI, 1, 'exactly one UI instance must exist');

    // ============================================================
    // Scenario 13 (v3.1 R1/R2): GitHub 式页面 —— eager 初始处理 (折叠线下但已加载
    // 完成的截图不滚动即反色, F2), 徽章首通决策与强制重扫后一致 (F3/decide-once),
    // 缓存快路径 + SPA 换页重处理
    // ============================================================
    console.log('[Test] Scenario 13: navigating to /github-page (eager pass, no scrolling) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/github-page` });
    await new Promise((r) => setTimeout(r, 5000)); // eager 首扫 + 2.5s 补扫, 期间绝不滚动

    const ghState = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const ids = ['gh-shot-1', 'gh-shot-2', 'gh-shot-3', 'gh-logo'];
        const shots = {};
        ids.forEach((id) => {
          const el = document.getElementById(id);
          shots[id] = {
            inverted: el ? el.getAttribute('data-svi-inverted') === 'true' : false,
            checked: el ? !!el.getAttribute('data-svi-checked-src') : false,
            top: el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1
          };
        });
        const badges = Array.from(document.querySelectorAll('.gh-badge'));
        const eng = window.__svi.engines.image;
        return {
          scrollY: window.scrollY,
          shots,
          badgeCount: badges.length,
          badgesInverted: badges.filter((b) => b.getAttribute('data-svi-inverted') === 'true').length,
          badgesChecked: badges.filter((b) => !!b.getAttribute('data-svi-checked-src')).length,
          badgeFirstPassReason: eng ? (eng.decisionBySrc.get(badges[0] ? badges[0].src : '') || {}).reason : null
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('GitHub-like pre-scroll state:', JSON.stringify(ghState));
    assert.strictEqual(ghState.scrollY, 0, 'assertions must hold BEFORE any scrolling');
    assert.ok(ghState.shots['gh-shot-1'].top > 600, 'screenshots are below the fold (fixture sanity)');
    for (const id of ['gh-shot-1', 'gh-shot-2', 'gh-shot-3']) {
      assert.strictEqual(ghState.shots[id].inverted, true, `${id} must be inverted WITHOUT scrolling (eager initial pass, F2)`);
      assert.strictEqual(ghState.shots[id].checked, true, `${id} must carry a final decision marker`);
    }
    assert.strictEqual(ghState.shots['gh-logo'].inverted, true, 'logo must be inverted via eager pass');
    assert.strictEqual(ghState.badgeCount, 15, 'badge grid must contain 15 badges');
    assert.strictEqual(ghState.badgesChecked, 15, 'all badges must have a decision on the FIRST pass (no undecided stragglers)');
    assert.strictEqual(ghState.badgesInverted, 0, 'badges stay unforced (tiny gate) before seed rule injection');

    // 种子规则注入 (模拟 github.com 内置规则) + 显式重扫: 强制反色必须先于小元素门 (F3 顺序修复)
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.__svi.BUILTIN_RULES.push({
          pattern: '127.0.0.1', name: 'BenchGitHubLike', protect: [],
          forceInvert: ['.markdown-body img'], bgImageSelectors: [], disableVideoAuto: false, bgReplace: false
        });
        window.__svi.invalidateProfileCache(); // 站点档案按 (host, 偏好版本) 缓存, 注入规则后需失效
        window.__svi.engines.image.clearCacheAndRescan();
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 1500));
    const afterRule = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const badges = Array.from(document.querySelectorAll('.gh-badge'));
        const shots = ['gh-shot-1', 'gh-shot-2', 'gh-shot-3', 'gh-logo'].map((id) => document.getElementById(id).getAttribute('data-svi-inverted') === 'true');
        const eng = window.__svi.engines.image;
        return {
          badgesInverted: badges.filter((b) => b.getAttribute('data-svi-inverted') === 'true').length,
          badgeReason: eng ? (eng.decisionBySrc.get(badges[0].src) || {}).reason : null,
          shots,
          snapshot: Array.from(document.querySelectorAll('.markdown-body img')).map((i) => i.getAttribute('data-svi-inverted') === 'true' ? 1 : 0).join('')
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('After seed rule + rescan:', JSON.stringify(afterRule));
    assert.strictEqual(afterRule.badgesInverted, 15, 'forceInvert must outrank the tiny gate (badges invert after rule injection, F3)');
    assert.strictEqual(afterRule.badgeReason, 'seed-force', 'badge decision reason is seed-force');
    assert.ok(afterRule.shots.every(Boolean), 'shots stay inverted after rescan');

    // decide-once 稳定性: 再次强制重扫, 全部决策必须逐位一致 (同图永不翻转)
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.engines.image.clearCacheAndRescan(); return true; })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 1500));
    const afterRescan2 = (await sendCdp('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('.markdown-body img')).map((i) => i.getAttribute('data-svi-inverted') === 'true' ? 1 : 0).join('')`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(afterRescan2, afterRule.snapshot, 'decide-once: two forced rescans produce identical decisions');

    // 缓存快路径: 追加一张已决 src 的图 (折叠线下, IO 不可达) → 变更 flush 同步反色
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const im = document.createElement('img');
        im.id = 'fast-path-img';
        im.src = '/img/shot-1.svg';
        im.style.cssText = 'display:block;width:600px;margin-top:24px;';
        document.getElementById('md-content').appendChild(im);
        return true;
      })()`,
      returnByValue: true
    });
    const fastPathOk = await waitForExpr(`(() => {
      const el = document.getElementById('fast-path-img');
      return !!(el && el.getAttribute('data-svi-inverted') === 'true' && el.getAttribute('data-svi-checked-src'));
    })()`, 4000);
    assert.ok(fastPathOk, 'mutation fast-path must apply the cached decision synchronously to new media');

    // SPA 换页: pushState + 内容替换 → 新 src 图重处理
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        history.pushState({}, '', '/github-page-2');
        const md = document.getElementById('md-content');
        md.innerHTML = '<img id="spa-img-1" src="/img/shot-4.svg" style="display:block;width:600px;">'
          + '<img id="spa-img-2" src="/img/shot-5.svg" style="display:block;width:600px;margin-top:24px;">';
        return true;
      })()`,
      returnByValue: true
    });
    const spaOk = await waitForExpr(`(() => {
      const a = document.getElementById('spa-img-1');
      const b = document.getElementById('spa-img-2');
      return !!(a && b && a.getAttribute('data-svi-inverted') === 'true' && b.getAttribute('data-svi-inverted') === 'true');
    })()`, 8000);
    assert.ok(spaOk, 'SPA-swap content replacement must re-process new images (white screenshots invert)');

    // ============================================================
    // Scenario 14 (v3.1 R4): 智能图片策略 —— balanced 封面格全跳过/孤立大图反色,
    // aggressive 封面反色 (v3.0 行为)
    // ============================================================
    console.log('[Test] Scenario 14: navigating to /policy-page (balanced) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/policy-page` });
    await new Promise((r) => setTimeout(r, 5000));
    const policyBalanced = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const covers = Array.from(document.querySelectorAll('.feed-cover'));
        const card = document.getElementById('card-cover');
        const diagram = document.getElementById('lone-diagram');
        const st = (el) => ({ inverted: el.getAttribute('data-svi-inverted') === 'true', checked: !!el.getAttribute('data-svi-checked-src') });
        const eng = window.__svi.engines.image;
        return {
          policy: window.__svi.prefs.imagePolicy,
          coverCount: covers.length,
          covers: covers.map(st),
          coverReason: eng ? (eng.decisionBySrc.get(covers[0].src) || {}).reason : null,
          card: st(card),
          cardReason: eng ? (eng.decisionBySrc.get(card.src) || {}).reason : null,
          diagram: st(diagram)
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Policy balanced:', JSON.stringify(policyBalanced));
    assert.strictEqual(policyBalanced.policy, 'balanced', 'policy seeded to balanced');
    assert.strictEqual(policyBalanced.coverCount, 12, 'cover grid must contain 12 covers');
    assert.ok(policyBalanced.covers.every((c) => c.checked), 'all covers decided on this pass');
    assert.ok(policyBalanced.covers.every((c) => !c.inverted), 'balanced: grid-repeated covers must NOT invert (bilibili 封面格)');
    assert.strictEqual(policyBalanced.coverReason, 'policy', 'cover skip reason is policy (grid heuristic)');
    assert.strictEqual(policyBalanced.card.checked, true, 'card cover decided');
    assert.strictEqual(policyBalanced.card.inverted, false, 'balanced: card/cover chrome context must NOT invert');
    assert.strictEqual(policyBalanced.cardReason, 'policy', 'card cover skip reason is policy (chrome heuristic)');
    assert.strictEqual(policyBalanced.diagram.inverted, true, 'balanced: lone large white diagram must invert');

    // aggressive: 同一页面, 封面反色 (v3.0 行为)。配置经查询参数传入
    // (上一页 pagehide 落盘会覆盖导航前 evaluate 写入的种子, 必须由本页加载时种子)
    console.log('[Test] Scenario 14b: /policy-page?policy=aggressive ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/policy-page?policy=aggressive` });
    await new Promise((r) => setTimeout(r, 5000));
    const policyAggr = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const covers = Array.from(document.querySelectorAll('.feed-cover'));
        return {
          policy: window.__svi.prefs.imagePolicy,
          coversInverted: covers.filter((c) => c.getAttribute('data-svi-inverted') === 'true').length,
          diagramInverted: document.getElementById('lone-diagram').getAttribute('data-svi-inverted') === 'true'
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Policy aggressive:', JSON.stringify(policyAggr));
    assert.strictEqual(policyAggr.policy, 'aggressive', 'policy seeded to aggressive');
    assert.strictEqual(policyAggr.coversInverted, 12, 'aggressive: cover grid inverts (v3.0 size-gates-only behavior)');
    assert.strictEqual(policyAggr.diagramInverted, true, 'aggressive: diagram still inverts');

    // ============================================================
    // Scenario 15 (v3.1 R5): 悬停显示原图开关 —— hoverRestore=false 时
    // CSS 滤镜路径与 fx content:url 路径悬停均保持反色; 恢复 true 后悬停还原
    // ============================================================
    async function hoverAssert(expr, timeoutMs) {
      return waitForExpr(expr, timeoutMs || 6000);
    }
    console.log('[Test] Scenario 15a: /hover-page?restore=0&fx=full (hoverRestore=false, CSS filter path) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/hover-page?restore=0&fx=full` });
    await new Promise((r) => setTimeout(r, 4000));
    const hoverSetup = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('hover-css');
        return {
          inverted: img.getAttribute('data-svi-inverted') === 'true',
          restoreClass: document.documentElement.classList.contains('svi-hover-restore'),
          bgInv: document.getElementById('hover-bg').getAttribute('data-svi-bginv'),
          rect: JSON.stringify(img.getBoundingClientRect()),
          bgRect: JSON.stringify(document.getElementById('hover-bg').getBoundingClientRect())
        };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(hoverSetup.inverted, true, 'hover bench: white diagram inverted (CSS filter path)');
    assert.strictEqual(hoverSetup.restoreClass, false, 'svi-hover-restore class must be OFF when pref disabled');
    // v4.6-3: 背景图通道元素须被 BgImageEngine 打标 (首扫在 +5s, 轮询等待)
    const bgTagged = await hoverAssert(`document.getElementById('hover-bg').getAttribute('data-svi-bginv') === 'true'`, 9000);
    assert.strictEqual(bgTagged, true, 'hover bench: bg-image element must be tagged data-svi-bginv (v4.6-3 four-channel matrix)');
    const cssRect = JSON.parse(hoverSetup.rect);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(cssRect.left + cssRect.width / 2),
      y: Math.round(cssRect.top + cssRect.height / 2)
    });
    await new Promise((r) => setTimeout(r, 250));
    const cssHover = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.getElementById('hover-css')).filter`,
      returnByValue: true
    })).result.value;
    console.log('CSS path hover filter:', cssHover);
    assert.ok(String(cssHover).indexOf('invert(1)') !== -1, 'hoverRestore=false: CSS filter path keeps inversion on hover, got ' + cssHover);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
    // v4.6-3: 背景图通道关闭态悬停 —— filter 必须保持反色
    const bgRect15 = JSON.parse(hoverSetup.bgRect);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(bgRect15.left + bgRect15.width / 2),
      y: Math.round(bgRect15.top + bgRect15.height / 2)
    });
    await new Promise((r) => setTimeout(r, 250));
    const bgHoverOff = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.getElementById('hover-bg')).filter`,
      returnByValue: true
    })).result.value;
    console.log('BG path hover filter (restore=0):', bgHoverOff);
    assert.ok(String(bgHoverOff).indexOf('invert(1)') !== -1, 'hoverRestore=false: bg-image path keeps inversion on hover, got ' + bgHoverOff);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });

    console.log('[Test] Scenario 15b: /hover-page?restore=0&fx=luma (hoverRestore=false, fx content:url path) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/hover-page?restore=0&fx=luma` });
    await new Promise((r) => setTimeout(r, 4500));
    const fxSetup = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('hover-css');
        return { hasFx: img.hasAttribute('data-svi-fx'), rect: JSON.stringify(img.getBoundingClientRect()) };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(fxSetup.hasFx, true, 'fx bench: img delivered via content:url (luma)');
    const fxRect15 = JSON.parse(fxSetup.rect);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(fxRect15.left + fxRect15.width / 2),
      y: Math.round(fxRect15.top + fxRect15.height / 2)
    });
    await new Promise((r) => setTimeout(r, 250));
    const fxHover = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('hover-css');
        return { hoverClass: img.classList.contains('svi-fx-hover'), content: getComputedStyle(img).content };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('fx path hover:', JSON.stringify(fxHover));
    assert.strictEqual(fxHover.hoverClass, false, 'hoverRestore=false: fx hover class must not be added');
    assert.ok(String(fxHover.content).indexOf('blob:') !== -1, 'hoverRestore=false: fx content:url delivery must persist on hover, got ' + fxHover.content);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });

    console.log('[Test] Scenario 15c: /hover-page?restore=1&fx=full (hoverRestore back ON, CSS path restores) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/hover-page?restore=1&fx=full` });
    await new Promise((r) => setTimeout(r, 4000));
    const backOn = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('hover-css');
        return {
          inverted: img.getAttribute('data-svi-inverted') === 'true',
          restoreClass: document.documentElement.classList.contains('svi-hover-restore'),
          rect: JSON.stringify(img.getBoundingClientRect())
        };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(backOn.restoreClass, true, 'toggling hoverRestore back ON re-adds svi-hover-restore');
    const backRect = JSON.parse(backOn.rect);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(backRect.left + backRect.width / 2),
      y: Math.round(backRect.top + backRect.height / 2)
    });
    await new Promise((r) => setTimeout(r, 250));
    const backHover = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.getElementById('hover-css')).filter`,
      returnByValue: true
    })).result.value;
    assert.ok(/^none/.test(String(backHover)), 'hoverRestore=true: hover restores original (filter none), got ' + backHover);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
    // v4.6-3: 背景图通道开启态悬停 —— filter 必须还原 none (防过度修复)
    const backSetup2 = (await sendCdp('Runtime.evaluate', {
      expression: `JSON.stringify(document.getElementById('hover-bg').getBoundingClientRect())`,
      returnByValue: true
    })).result.value;
    const backBgRect = JSON.parse(backSetup2);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(backBgRect.left + backBgRect.width / 2),
      y: Math.round(backBgRect.top + backBgRect.height / 2)
    });
    await new Promise((r) => setTimeout(r, 250));
    const bgHoverOn = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.getElementById('hover-bg')).filter`,
      returnByValue: true
    })).result.value;
    console.log('BG path hover filter (restore=1):', bgHoverOn);
    assert.ok(/^none/.test(String(bgHoverOn)), 'hoverRestore=true: bg-image path restores original on hover, got ' + bgHoverOn);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });

    // ============================================================
    // Scenario 16 (v3.1 R6): 放大镜/看图类插件适配 —— 闭合 Shadow Root 快路径 + Alt+点击 + body 尾部背景图覆盖层
    // ============================================================
    console.log('[Test] Scenario 16: navigating to /viewer-page (viewer extension sim) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer-page` });
    await new Promise((r) => setTimeout(r, 4000));
    const baseReady = (await sendCdp('Runtime.evaluate', {
      expression: `document.getElementById('viewer-base').getAttribute('data-svi-inverted') === 'true'`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(baseReady, true, 'base img must be decided+inverted first (decision cache seeded)');

    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const host = document.createElement('div');
        host.id = 'viewer-host';
        const root = host.attachShadow({ mode: 'closed' });
        window.__sviBenchRoot = root;
        const im = document.createElement('img');
        im.id = 'viewer-shadow-img';
        im.src = '/img/white-diagram.svg';
        im.style.cssText = 'display:block;width:240px;height:180px;';
        root.appendChild(im);
        document.getElementById('viewer-overlay-slot').appendChild(host);
        const overlay = document.createElement('div');
        overlay.id = 'viewer-overlay';
        overlay.style.cssText = 'width:200px;height:150px;background-image:url(/img/white-diagram.svg);background-size:cover;';
        document.body.appendChild(overlay);
        return true;
      })()`,
      returnByValue: true
    });
    const viewerReady = await waitForExpr(`(() => {
      const root = window.__sviBenchRoot;
      const im = root && root.getElementById('viewer-shadow-img');
      const ov = document.getElementById('viewer-overlay');
      return !!(im && im.getAttribute('data-svi-inverted') === 'true' && ov && ov.getAttribute('data-svi-bginv') === 'true');
    })()`, 10000);
    assert.ok(viewerReady, 'closed-shadow img must auto-invert via fast-path AND body-end overlay bg-image must invert');

    // Alt+点击 (bubbles+composed) 穿透闭合根切换反色
    const toggle1 = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const im = window.__sviBenchRoot.getElementById('viewer-shadow-img');
        const wasInverted = im.getAttribute('data-svi-inverted') === 'true';
        im.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, composed: true, cancelable: true }));
        return { wasInverted, afterFirst: im.getAttribute('data-svi-inverted') === 'true', overrideRecorded: Object.keys(window.__svi.prefs.manualOverrides).some((k) => k.indexOf('white-diagram') !== -1) };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Viewer Alt+click 1:', JSON.stringify(toggle1));
    assert.strictEqual(toggle1.wasInverted, true, 'shadow img starts inverted');
    assert.strictEqual(toggle1.afterFirst, false, 'Alt+click inside closed shadow root must restore (toggle off)');
    assert.strictEqual(toggle1.overrideRecorded, true, 'override recorded for the shadow img src');
    const toggle2 = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const im = window.__sviBenchRoot.getElementById('viewer-shadow-img');
        im.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, composed: true, cancelable: true }));
        return im.getAttribute('data-svi-inverted') === 'true';
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(toggle2, true, 'second Alt+click re-inverts (toggle roundtrip)');

    // ============================================================
    // Scenario 17 (v3.1 R3): 当前页媒体面板 —— 打开区块, 断言列表/切换/定位
    // ============================================================
    console.log('[Test] Scenario 17: navigating to main page, opening 当前页媒体 section ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}` });
    await new Promise((r) => setTimeout(r, 3500));
    // 场景内自建反色状态 (Scenario 10 的迁移基准会重置存储, 2b 的覆盖不再存在)
    const darkSeed = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('img-dark');
        img.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }));
        return img.getAttribute('data-svi-inverted') === 'true';
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(darkSeed, true, 'Alt+click within the scenario must invert img-dark (fixture sanity)');
    const mediaOpen = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.__svi.ui.openSettingsModal();
        const sec = document.getElementById('svi-sec-media');
        if (!sec) return { section: false };
        const btns = Array.from(sec.querySelectorAll('button'));
        // v5.2: 本场景守护的是 v3.1 的「全部媒体」视图 —— 该视图默认已不是首屏视图
        // (默认改为「已处理」，见 Scenario 26), 但**视图本身行为不变**, 故此处显式切过去。
        const allView = btns.find((b) => b.textContent.indexOf('全部媒体') !== -1);
        if (allView) allView.click();
        const collect = btns.find((b) => b.textContent.indexOf('采集') !== -1);
        if (collect) collect.click();
        return { section: true, rows: sec.querySelectorAll('.svi-media-row').length };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Media section:', JSON.stringify(mediaOpen));
    assert.strictEqual(mediaOpen.section, true, '当前页媒体 section must exist');
    assert.ok(mediaOpen.rows >= 10, 'media inspector must list the known page media (gallery + icons + bg-thumb)');

    const mediaToggle = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const rows = Array.from(document.querySelectorAll('#svi-sec-media .svi-media-row'));
        const row = rows.find((r) => r._sviTarget && r._sviTarget.id === 'img-dark');
        if (!row) return { found: false };
        const before = {
          stateText: row.querySelector('.svi-media-state').textContent,
          inverted: row._sviTarget.getAttribute('data-svi-inverted') === 'true'
        };
        const toggleBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === '复原' || b.textContent === '反色');
        toggleBtn.click();
        return { found: true, before, afterInverted: row._sviTarget.getAttribute('data-svi-inverted') === 'true' };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Media toggle:', JSON.stringify(mediaToggle));
    assert.strictEqual(mediaToggle.found, true, 'media inspector must map rows to page elements (img-dark)');
    assert.strictEqual(mediaToggle.before.inverted, true, 'img-dark starts inverted (manual override from Scenario 2b)');
    assert.strictEqual(mediaToggle.afterInverted, false, 'inspector 反色/复原 toggle must flip the media state');

    const mediaLocate = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return window.scrollY;
      })()`,
      returnByValue: true
    })).result.value;
    assert.ok(mediaLocate > 100, 'page scrolled to bottom before 定位 (fixture sanity)');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const rows = Array.from(document.querySelectorAll('#svi-sec-media .svi-media-row'));
        const row = rows.find((r) => r._sviTarget && r._sviTarget.id === 'img-white');
        const locateBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === '定位');
        locateBtn.click();
        return true;
      })()`,
      returnByValue: true
    });
    const located = await waitForExpr(`(() => {
      const el = document.getElementById('img-white');
      const rect = el.getBoundingClientRect();
      return rect.top > -10 && rect.top < window.innerHeight && window.scrollY < ${mediaLocate} - 10;
    })()`, 5000);
    assert.ok(located, '定位 must scrollIntoView the target element (img-white back in view)');
    const flashOk = await waitForExpr(`document.getElementById('img-white').classList.contains('svi-locate-flash')`, 2000);
    assert.ok(flashOk, '定位 must flash the outline highlight class');

    // ============================================================
    // Scenario 18 (v3.2 R1-R3): 视频画面调节 —— CSS 路径 / 反色组合 / 预设 / 持久化
    // ============================================================
    console.log('[Test] Scenario 18: navigating to /tune-page (video tune) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/tune-page` });
    await new Promise((r) => setTimeout(r, 3500));
    const tuneBaseline = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const v = document.getElementById('bench-video');
        return { computed: getComputedStyle(v).filter, cls: document.documentElement.classList.contains('svi-video-tune') };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(tuneBaseline.computed, 'none', 'tune disabled by default → video filter none');
    assert.strictEqual(tuneBaseline.cls, false, 'svi-video-tune class absent by default');

    const tuneOpen = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.__svi.ui.openSettingsModal();
        const sec = document.getElementById('svi-sec-video');
        if (!sec) return { section: false };
        return {
          section: true,
          sliders: sec.querySelectorAll('input[type="range"]').length,
          // v5.4: 断言改为"下界 + 全部可见"而不是硬编码数量 ——
          // 硬编码数量会在每次新增设置行时假失败, 而这条断言的**本意**是
          // "滑块没有被折叠抽屉藏起来" (v3.3 accordion dissolved)。
          // v5.4: 断言改为「下界 + 关键行标签都在」而不是硬编码数量 ——
          // 硬编码数量会在每次新增设置行时假失败(v5.4 加了两行帧序列), 而这条断言的**本意**是
          // "滑块没有被折叠抽屉藏起来"(v3.3 accordion dissolved), 用标签在不在更贴本意也更稳。
          // 注: 不判可见性 —— 视频区块在「全局」页签, 未切到该页签时 rect 高度为 0。
          hasTuneLabels: ['亮度', '对比度', '饱和度', '暖色', '黑白'].every((t) => sec.textContent.indexOf(t) >= 0),
          presets: ['护眼', '夜间', '鲜艳', '还原'].map((t) => !!Array.from(sec.querySelectorAll('button')).find((b) => b.textContent === t)),
        };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(tuneOpen.section, true, '视频画面调节 section must exist');
    assert.ok(tuneOpen.sliders >= 9, 'video section must expose at least the 5 tune + 4 algorithm sliders (v3.3 accordion dissolved), got ' + tuneOpen.sliders);
    assert.strictEqual(tuneOpen.hasTuneLabels, true, '5 个画面调节行的标签必须都在 DOM 里 (未被折叠抽屉隐藏)');
    assert.deepStrictEqual(tuneOpen.presets, [true, true, true, true], 'preset buttons 护眼/夜间/鲜艳/还原 present');

    const tuneEye = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const sec = document.getElementById('svi-sec-video');
        Array.from(sec.querySelectorAll('button')).find((b) => b.textContent === '护眼').click();
        const v = document.getElementById('bench-video');
        return {
          cls: document.documentElement.classList.contains('svi-video-tune'),
          computed: getComputedStyle(v).filter,
        };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(tuneEye.cls, true, '护眼 preset must enable the tune class');
    assert.ok(tuneEye.computed.includes('brightness(0.85)'), 'non-inverted video must carry tune filter via stylesheet, got: ' + tuneEye.computed);
    assert.ok(tuneEye.computed.includes('sepia(0.15)'), 'warmth must apply via stylesheet rule');

    // 反色组合: 点击面板 视频反色 → 内联滤镜 = 反色链 + 画面调节链
    const tuneCompose = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('.svi-capsule-root .svi-action-btn')).find((b) => b.textContent.indexOf('视频') !== -1);
        btn.click();
        const v = document.getElementById('bench-video');
        return { inline: v.style.filter };
      })()`,
      returnByValue: true
    })).result.value;
    assert.ok(tuneCompose.inline.includes('invert(1)'), 'active video must invert');
    assert.ok(tuneCompose.inline.includes('brightness(0.85)'), 'inverted video inline filter must compose the tune chain, got: ' + tuneCompose.inline);
    // 关闭反色 → 内联移除, 样式表画面调节仍然生效
    const tuneAfterOff = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('.svi-capsule-root .svi-action-btn')).find((b) => b.textContent.indexOf('视频') !== -1);
        btn.click();
        const v = document.getElementById('bench-video');
        return { inline: v.style.filter || '(none)', computed: getComputedStyle(v).filter };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(tuneAfterOff.inline, '(none)', 'inversion off → inline filter removed');
    assert.ok(tuneAfterOff.computed.includes('brightness(0.85)'), 'stylesheet tune still applies after inversion off');

    // 还原 + 持久化: 护眼 → 重载 → 仍然生效
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const sec = document.getElementById('svi-sec-video');
        Array.from(sec.querySelectorAll('button')).find((b) => b.textContent === '还原').click();
        return document.documentElement.classList.contains('svi-video-tune');
      })()`,
      returnByValue: true
    });
    const tuneResetOk = await waitForExpr(`!document.documentElement.classList.contains('svi-video-tune')`, 3000);
    assert.ok(tuneResetOk, '还原 preset must clear the tune class');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const sec = document.getElementById('svi-sec-video');
        Array.from(sec.querySelectorAll('button')).find((b) => b.textContent === '夜间').click();
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 800)); // 等待防抖落盘
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/tune-page` });
    await new Promise((r) => setTimeout(r, 3500));
    const tunePersist = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const v = document.getElementById('bench-video');
        return { computed: getComputedStyle(v).filter, cls: document.documentElement.classList.contains('svi-video-tune') };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(tunePersist.cls, true, 'video tune must persist across reload');
    assert.ok(tunePersist.computed.includes('brightness(0.7)'), 'persisted tune must re-apply after reload, got: ' + tunePersist.computed);

    // ============================================================
    // Scenario 19 (v4.0): site power hot-apply — clicking the power
    // switch off must revert the page in the same tick (no reload);
    // re-enabling restores inversion without reload.
    // ============================================================
    console.log('[Test] Scenario 19: site power hot-apply (disable → instant teardown → re-enable) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await new Promise((r) => setTimeout(r, 5000));
    await waitForExpr(`document.querySelectorAll('[data-svi-inverted="true"]').length > 0`, 10000);
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.ui.openSettingsModal(); return !!document.querySelector('.svi4-switch'); })()`,
      returnByValue: true
    });
    // 规格契约: 只点击真实控件 (电源开关), 不直接改偏好
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { document.querySelector('.svi4-switch').click(); return true; })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 300));
    const offState = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        invertOn: document.documentElement.classList.contains('svi-img-invert-on'),
        inverted: document.querySelectorAll('[data-svi-inverted]').length,
        bginv: document.querySelectorAll('[data-svi-bginv]').length,
        marks: document.querySelectorAll('[data-svi-checked], [data-svi-checked-src]').length,
        overlay: document.querySelectorAll('.svi-fx-overlay').length,
        tune: document.documentElement.classList.contains('svi-video-tune'),
        capsuleOff: document.querySelector('.svi-capsule-root').classList.contains('svi-site-off'),
        switchOn: document.querySelector('.svi4-switch').classList.contains('on'),
        modalStill: !!document.querySelector('.svi-modal-mask.show')
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(offState.invertOn, false, 'power off must remove the img invert gate class instantly');
    assert.strictEqual(offState.inverted, 0, 'power off must strip data-svi-inverted instantly');
    assert.strictEqual(offState.bginv, 0, 'power off must strip data-svi-bginv instantly');
    assert.strictEqual(offState.marks, 0, 'power off must strip decision marks instantly');
    assert.strictEqual(offState.overlay, 0, 'power off must remove fx overlays instantly');
    assert.strictEqual(offState.tune, false, 'power off must clear the video tune gate class');
    assert.strictEqual(offState.capsuleOff, true, 'capsule must collapse to the power badge');
    assert.strictEqual(offState.switchOn, false, 'power switch must reflect the off state');
    assert.strictEqual(offState.modalStill, true, 'settings modal stays open after power off');
    // 热恢复 (不刷新)
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { document.querySelector('.svi4-switch').click(); return true; })()`,
      returnByValue: true
    });
    const restored = await waitForExpr(`document.querySelectorAll('[data-svi-inverted="true"]').length > 0`, 10000);
    assert.ok(restored, 're-enable must restore image inversion without reload');
    const reOn = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        invertOn: document.documentElement.classList.contains('svi-img-invert-on'),
        capsuleOff: document.querySelector('.svi-capsule-root').classList.contains('svi-site-off'),
        switchOn: document.querySelector('.svi4-switch').classList.contains('on')
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(reOn.invertOn, true, 'img invert gate class must return after re-enable');
    assert.strictEqual(reOn.capsuleOff, false, 'capsule must be restored after re-enable');
    assert.strictEqual(reOn.switchOn, true, 'power switch must reflect the on state');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`,
      returnByValue: true
    });

    // ============================================================
    // Scenario 20 (v4.1): readability absorption — Dark Reader-style
    // font override + text stroke via real clicks in the 全局 tab.
    // ============================================================
    console.log('[Test] Scenario 20: font override + text stroke (global tab) ...');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.ui.openSettingsModal(); return true; })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局'); t.click(); return !!document.getElementById('svi-sec-readability'); })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    const fontBefore = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        cls: document.documentElement.classList.contains('svi-font-on'),
        bodyFont: getComputedStyle(document.body).fontFamily
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(fontBefore.cls, false, 'font override must default off');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const row = [...document.querySelectorAll('#svi-sec-readability .svi-site-check-row')].find(r => r.textContent.includes('字体覆盖'));
        row.querySelector('input.svi-check').click();
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    const fontOn = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        cls: document.documentElement.classList.contains('svi-font-on'),
        varSet: document.documentElement.style.getPropertyValue('--svi-font-family').length > 0,
        bodyFont: getComputedStyle(document.body).fontFamily
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(fontOn.cls, true, 'font toggle must add the gate class');
    assert.ok(fontOn.varSet, 'font family css var must be set');
    assert.notStrictEqual(fontOn.bodyFont, fontBefore.bodyFont, 'body computed font-family must change, got: ' + fontOn.bodyFont);
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const row = [...document.querySelectorAll('#svi-sec-readability .svi-modal-row')].find(r => r.textContent.includes('文字描边'));
        const slider = row.querySelector('input[type="range"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(slider, '0.5');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    const strokeOn = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('h1, h2, p, a, span, button, label') || document.body;
        return {
          cls: document.documentElement.classList.contains('svi-stroke-on'),
          varVal: document.documentElement.style.getPropertyValue('--svi-text-stroke'),
          width: getComputedStyle(el).webkitTextStrokeWidth
        };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(strokeOn.cls, true, 'stroke slider must add the stroke gate class');
    assert.strictEqual(strokeOn.varVal, '0.50px', 'stroke css var must track the slider');
    assert.ok(strokeOn.width && strokeOn.width !== '0px', 'text elements must receive the stroke, got: ' + strokeOn.width);
    // 还原默认 (不残留到复跑)
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const sec = document.getElementById('svi-sec-readability');
        [...sec.querySelectorAll('.svi-site-check-row')].find(r => r.textContent.includes('字体覆盖')).querySelector('input.svi-check').click();
        const srow = [...sec.querySelectorAll('.svi-modal-row')].find(r => r.textContent.includes('文字描边'));
        const slider = srow.querySelector('input[type="range"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(slider, '0');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
      returnByValue: true
    });
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`,
      returnByValue: true
    });
    const fontClean = await waitForExpr(`!document.documentElement.classList.contains('svi-font-on') && !document.documentElement.classList.contains('svi-stroke-on')`, 3000);
    assert.ok(fontClean, 'disabling font override and stroke must clear the gate classes');

    // ============================================================
    // Scenario 20b (v4.5): settings row sync audit — every static row must
    // display the live state value at modal open. v4.5 fix: inline
    // `sec.add(ui.xxxRow(...))` rows were never registered into rowSyncs
    // (ui.section().add registers into a section-local list nobody calls),
    // so the 悬停显示原图 checkbox displayed "off" while the feature was on
    // and the first user click wrote the OPPOSITE value (hover bug).
    // ============================================================
    console.log('[Test] Scenario 20b: settings row sync audit ...');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.ui.openSettingsModal(); return true; })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 300));
    // v4.6-3 版本自检 (H4 分支交付物): 面板头部必须显著显示运行版本徽标
    const verBadge = (await sendCdp('Runtime.evaluate', {
      expression: `(() => { const v = document.querySelector('.svi-modal-ver'); return v ? v.textContent : null; })()`,
      returnByValue: true
    })).result.value;
    assert.ok(verBadge && /^v\d+\.\d+\.\d+$/.test(verBadge), 'settings modal must display a version badge (.svi-modal-ver), got: ' + verBadge);
    const userscriptVersion = (/@version\s+([\d.]+)/.exec(userscriptCode) || [])[1];
    assert.strictEqual(verBadge, 'v' + userscriptVersion, 'version badge must match the userscript @version');
    const rowAudit = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const prefs = window.__svi.prefs;
        // v4.5: 按区块 id 圈定, 避免跨区文本误匹配 (如「本站图片特效」hint 含「图片特效模式」)
        const findIn = (secId, text) => {
          const sec = document.getElementById(secId);
          if (!sec) return null;
          return [...sec.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes(text)) || null;
        };
        const checkVal = (secId, text) => {
          const row = findIn(secId, text);
          if (!row) return null;
          const cb = row.querySelector('input.svi-check');
          return cb ? cb.checked : null;
        };
        const selectVal = (secId, text) => {
          const row = findIn(secId, text);
          if (!row) return null;
          const sel = row.querySelector('select');
          return sel ? sel.value : null;
        };
        return {
          hoverRestore: { pref: prefs.hoverRestore !== false, shown: checkVal('svi-sec-appearance', '悬停显示原图') },
          generalLight: { pref: prefs.imgGeneralLight !== false, shown: checkVal('svi-sec-image', '全浅色通用自适应检测') },
          policy: { pref: prefs.imagePolicy, shown: selectVal('svi-sec-image', '智能图片策略') },
          imgFxMode: { pref: prefs.imgFxMode, shown: selectVal('svi-sec-image', '图片特效模式') },
          videoFxMode: { pref: prefs.videoFxMode, shown: selectVal('svi-sec-video', '视频特效引擎') },
          timelineMode: { pref: prefs.timelineMode, shown: selectVal('svi-sec-video', '时间线记忆') },
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Row sync audit:', JSON.stringify(rowAudit));
    assert.strictEqual(rowAudit.hoverRestore.shown, rowAudit.hoverRestore.pref, 'hover-restore checkbox must display the live pref at modal open (v4.5 regression)');
    assert.strictEqual(rowAudit.generalLight.shown, rowAudit.generalLight.pref, 'general-light checkbox must display the live pref at modal open (v4.5 regression)');
    for (const key of ['policy', 'imgFxMode', 'timelineMode']) {
      assert.strictEqual(rowAudit[key].shown, rowAudit[key].pref, key + ' select must display the live pref at modal open (v4.5 regression)');
    }
    if (rowAudit.videoFxMode.shown !== null) {
      assert.strictEqual(rowAudit.videoFxMode.shown, rowAudit.videoFxMode.pref, 'videoFxMode select must display the live pref at modal open (v4.5 regression)');
    }
    // The toggle must be live-writable: flip hoverRestore off via the real row, class drops same-tick
    const hoverFlip = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const row = [...document.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes('悬停显示原图'));
        const cb = row.querySelector('input.svi-check');
        cb.click();
        return { checked: cb.checked, cls: document.documentElement.classList.contains('svi-hover-restore') };
      })()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(hoverFlip.checked, false, 'single click on the hover row must write pref=false');
    assert.strictEqual(hoverFlip.cls, false, 'hover-restore gate class must drop same-tick on toggle-off');
    // flip back for later scenarios
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const row = [...document.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes('悬停显示原图'));
        row.querySelector('input.svi-check').click();
        return true;
      })()`,
      returnByValue: true
    });
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`,
      returnByValue: true
    });

    // ============================================================
    // Scenario 21 (v4.2 P1/P2): dynamic dark theme tuning — tone +
    // brightness sliders re-map bucket colors on /login-page (real clicks).
    // ============================================================
    console.log('[Test] Scenario 21: dynamic dark theme tone/brightness (bgReplace) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/login-page` });
    await new Promise((r) => setTimeout(r, 4000));
    const baseBg = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyTag: document.body.getAttribute('data-svi-bgr-bg'),
        flashguard: document.documentElement.hasAttribute('data-svi-flashguard')
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(baseBg.bgrOn, true, 'login page must have bgReplace active');
    assert.strictEqual(baseBg.flashguard, false, 'flash guard must hand off after bgReplace activates');
    assert.ok(baseBg.bodyTag, 'body must carry the base-color bucket on a fresh load (v4.5 flash-guard poisoning regression), got: ' + baseBg.bodyTag);
    assert.notStrictEqual(baseBg.bodyBg, 'rgb(250, 250, 250)', 'body base color must be re-mapped dark on a fresh load (v4.5 regression)');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.ui.openSettingsModal(); const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局'); t.click(); return !!document.getElementById('svi-sec-dynamic'); })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    const setSelect = (rowText, value) => `(() => {
      const row = [...document.querySelectorAll('#svi-sec-dynamic .svi-modal-row')].find(r => r.textContent.includes('${rowText}'));
      const sel = row.querySelector('select');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, '${value}');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`;
    await sendCdp('Runtime.evaluate', {
      expression: setSelect('色调', 'dark-gray'),
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 1500));
    const grayBg = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.body).backgroundColor`,
      returnByValue: true
    })).result.value;
    assert.notStrictEqual(grayBg, baseBg.bodyBg, 'dark-gray tone must re-map the body bucket color, got: ' + grayBg);
    await sendCdp('Runtime.evaluate', {
      expression: setSelect('色调', 'warm-black'),
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 1500));
    const warmBg = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.body).backgroundColor`,
      returnByValue: true
    })).result.value;
    assert.notStrictEqual(warmBg, grayBg, 'warm-black tone must differ from dark-gray');
    await sendCdp('Runtime.evaluate', {
      expression: setSelect('色调', 'pure-black'),
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 1500));
    const backBg = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.body).backgroundColor`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(backBg, baseBg.bodyBg, 'pure-black must restore the baseline bucket color');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`,
      returnByValue: true
    });

    // ============================================================
    // Scenario 22 (v4.2 P5): scheduler — a window excluding the current
    // hour strips the page; widening to include it restores (real clicks).
    // ============================================================
    console.log('[Test] Scenario 22: time-window scheduler hot switching ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await new Promise((r) => setTimeout(r, 5000));
    await waitForExpr(`document.querySelectorAll('[data-svi-inverted="true"]').length > 0`, 10000);
    const nowHour = (await sendCdp('Runtime.evaluate', { expression: `new Date().getHours()`, returnByValue: true })).result.value;
    const offStart = (nowHour + 1) % 24;
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { window.__svi.ui.openSettingsModal(); const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局'); t.click(); return !!document.getElementById('svi-sec-scheduler'); })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const row = [...document.querySelectorAll('#svi-sec-scheduler .svi-site-check-row')].find(r => r.textContent.includes('定时启停'));
        row.querySelector('input.svi-check').click();
        return true;
      })()`,
      returnByValue: true
    });
    const setHour = (rowText, value) => `(() => {
      const row = [...document.querySelectorAll('#svi-sec-scheduler .svi-modal-row')].find(r => r.textContent.includes('${rowText}'));
      const sel = row.querySelector('select');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, String(${value}));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`;
    // 窗口排除当前小时 → 页面应热停用
    await sendCdp('Runtime.evaluate', { expression: setHour('开始时刻', offStart), returnByValue: true });
    await sendCdp('Runtime.evaluate', { expression: setHour('结束时刻', nowHour), returnByValue: true });
    const schedOff = await waitForExpr(`document.querySelectorAll('[data-svi-inverted]').length === 0 && !document.documentElement.classList.contains('svi-img-invert-on')`, 5000);
    assert.ok(schedOff, 'outside the schedule window the page must be hot-suspended');
    // 窗口包含当前小时 → 热恢复
    await sendCdp('Runtime.evaluate', { expression: setHour('开始时刻', nowHour), returnByValue: true });
    await sendCdp('Runtime.evaluate', { expression: setHour('结束时刻', (nowHour + 1) % 24), returnByValue: true });
    const schedOn = await waitForExpr(`document.querySelectorAll('[data-svi-inverted="true"]').length > 0`, 10000);
    assert.ok(schedOn, 'inside the schedule window inversion must hot-restore');
    // 还原: 关闭定时模式
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const row = [...document.querySelectorAll('#svi-sec-scheduler .svi-site-check-row')].find(r => r.textContent.includes('定时启停'));
        row.querySelector('input.svi-check').click();
        const b = document.querySelector('.svi-modal-close');
        if (b) b.click();
        return true;
      })()`,
      returnByValue: true
    });

    // ============================================================
    // Scenario 23 (v4.3): element-rule "recolor" - partial change: the
    // white parts of a black-and-white element are bucket-recolored while
    // the black text stays untouched (no filter, no full-element invert).
    // ============================================================
    console.log('[Test] Scenario 23: element-rule recolor (partial light-part change) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/recolor-page` });
    await new Promise((r) => setTimeout(r, 4000));
    const recBefore = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({ bg: getComputedStyle(document.getElementById('halfbow')).backgroundColor, partial: document.documentElement.hasAttribute('data-svi-bgr-partial') }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(recBefore.bg, 'rgb(255, 255, 255)', 'precondition: element starts white');
    assert.strictEqual(recBefore.partial, false, 'precondition: no partial gate before the rule');
    // 真实 UI 路径: 站点页签 → 元素规则表单 (本站 / 局部改色 / #halfbow)
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.__svi.ui.openSettingsModal();
        const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '本站');
        t.click();
        return !!document.querySelector('.svi-er-form');
      })()`,
      returnByValue: true
    });
    await new Promise((r) => setTimeout(r, 200));
    await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const form = document.querySelector('.svi-er-form');
        const ssel = form.querySelectorAll('select')[1]; // 第 2 个下拉 = 动作 (反色/保护/改色)
        const ssetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        ssetter.call(ssel, 'recolor');
        ssel.dispatchEvent(new Event('change', { bubbles: true }));
        const input = form.querySelector('input.svi-modal-text');
        const isetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        isetter.call(input, '#halfbow');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = [...form.querySelectorAll('button')].find((b) => b.textContent === '添加规则');
        const dbg = { selects: [...form.querySelectorAll('select')].map(x => x.value), input: form.querySelector('input.svi-modal-text').value, btnFound: !!btn };
        btn.click();
        dbg.afterRules = JSON.parse(JSON.stringify((window.__svi.prefs.elementRules || [])));
        dbg.err = null;
        return dbg;
      })()`,
      returnByValue: true
    });
    const recAfter = await waitForExpr(`document.documentElement.hasAttribute('data-svi-bgr-partial') && getComputedStyle(document.getElementById('halfbow')).backgroundColor !== 'rgb(255, 255, 255)'`, 12000);
    assert.ok(recAfter, 'recolor rule must tag the element and darken its light background');
    const recCheck = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('halfbow');
        return {
          bg: getComputedStyle(el).backgroundColor,
          text: getComputedStyle(el).color,
          tagged: el.hasAttribute('data-svi-bgr-bg')
        };
      })()`,
      returnByValue: true
    })).result.value;
    assert.ok(recCheck.tagged, 'element must carry the bgr-bg bucket tag');
    assert.notStrictEqual(recCheck.bg, 'rgb(255, 255, 255)', 'white background must be recolored dark, got: ' + recCheck.bg);
    // 配对映射: 底变暗则文字提亮 (可读性); "局部"的语义 = 作用域隔离于该元素, 而非冻结文字颜色
    assert.notStrictEqual(recCheck.text, 'rgb(0, 0, 0)', 'paired mapping must lighten black text for contrast on the darkened card');
    const sibling = (await sendCdp('Runtime.evaluate', {
      expression: `getComputedStyle(document.getElementById('lightbox')).backgroundColor`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(sibling, 'rgb(248, 248, 248)', 'scope isolation: sibling elements must stay untouched');
    await sendCdp('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`,
      returnByValue: true
    });

    // ============================================================
    // Scenario 24 (v4.3): flash-black guard non-regression - on a
    // dynamic-theme page the guard may paint early black but MUST be
    // fully removed after activation (no stuck black, no leftover style).
    // ============================================================
    console.log('[Test] Scenario 24: flash-black guard self-cleanup ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/login-page` });
    await new Promise((r) => setTimeout(r, 4500));
    const guardState = (await sendCdp('Runtime.evaluate', {
      expression: `(() => ({
        attr: document.documentElement.hasAttribute('data-svi-flashguard'),
        style: !!document.getElementById('svi-flashguard'),
        bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
        bodyBg: getComputedStyle(document.body).backgroundColor
      }))()`,
      returnByValue: true
    })).result.value;
    assert.strictEqual(guardState.attr, false, 'flash guard attribute must be removed after activation');
    assert.strictEqual(guardState.style, false, 'flash guard style node must be removed');
    assert.strictEqual(guardState.bgrOn, true, 'bgReplace must be active on the login page');
    assert.notStrictEqual(guardState.bodyBg, 'rgb(255, 255, 255)', 'page stays dark after guard hand-off');

    // ============================================================
    // Scenario 25 (v5.0): 元素动作 (hide / mask / dim / peek)
    //   - 默认全关时零新增属性写入 (父任务 AC-3)
    //   - 各动作执行器落点 + computed 样式真实生效
    //   - 开关即回滚: 关闭动作后无残留标记
    // ============================================================
    console.log('[Test] Scenario 25: v5.0 element actions (hide / mask / dim / peek) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/action-page` });
    await new Promise((r) => setTimeout(r, 2500));

    const evalInPage = async (expr) => (await sendCdp('Runtime.evaluate', {
      expression: expr, returnByValue: true
    })).result.value;
    // 需要等 CSS 过渡结束的断言走这个 (遮罩 ::after 有 140ms opacity 过渡,
    // 否则 getComputedStyle 读到的是过渡中间值而非目标值)
    const evalInPageAsync = async (expr) => (await sendCdp('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    })).result.value;

    // 25a. 默认全关 → 页面不得出现任何新动作痕迹
    const actDefault = await evalInPage(`(() => ({
      hidden: document.querySelectorAll('[data-svi-hidden]').length,
      masked: document.querySelectorAll('[data-svi-masked]').length,
      dimNode: !!document.querySelector('.svi-page-dim'),
      peekOn: document.documentElement.classList.contains('svi-peek-on'),
      hasSection: !!document.getElementById('svi-sec-actions'),
      hoverRestore: window.__svi.prefs.hoverRestore,
      peekEnabled: window.__svi.actionEnabled('peek')
    }))()`);
    assert.strictEqual(actDefault.hidden, 0, '默认关闭时不得写入 data-svi-hidden (AC-3)');
    assert.strictEqual(actDefault.masked, 0, '默认关闭时不得写入 data-svi-masked (AC-3)');
    assert.strictEqual(actDefault.dimNode, false, '默认关闭时不得创建 dim 层 (AC-3)');
    assert.strictEqual(actDefault.peekOn, true, 'peek 门默认随 hoverRestore 开启; probe=' + JSON.stringify(actDefault));

    // 25b. hide: 属性门 + computed display + revert
    const hideRes = await evalInPage(`(() => {
      const svi = window.__svi;
      const el = document.getElementById('act-box-a');
      svi.prefs.actions.hide.enabled = true;
      svi.ACTIONS.hide.apply(el, { scope: 'session' }, 'manual');
      const onAttr = el.getAttribute('data-svi-hidden');
      const onDisplay = getComputedStyle(el).display;
      svi.prefs.actions.hide.enabled = false;
      svi.ACTIONS.hide.revert(el);
      return { onAttr, onDisplay, offAttr: el.getAttribute('data-svi-hidden'), offDisplay: getComputedStyle(el).display };
    })()`);
    assert.strictEqual(hideRes.onAttr, 'session', 'hide 写入 scope 值');
    assert.strictEqual(hideRes.onDisplay, 'none', 'hide 生效时必须 computed display:none');
    assert.strictEqual(hideRes.offAttr, null, 'hide revert 摘除属性门');
    assert.notStrictEqual(hideRes.offDisplay, 'none', 'revert 后元素重新可见');

    // 25c. mask: 三档预设的 ::after 真实落地 (值取自 MASK_PRESETS, 唯一定义处)
    const maskRes = await evalInPageAsync(`(async () => {
      const svi = window.__svi;
      const el = document.getElementById('act-target');
      svi.prefs.actions.mask.enabled = true;
      const settle = () => new Promise((r) => setTimeout(r, 400));
      const out = {};
      for (const style of ['solid', 'dim', 'frost']) {
        svi.ACTIONS.mask.apply(el, { style: style }, 'manual');
        await settle(); // ::after 有 140ms opacity 过渡, 等它结束再读计算值
        const cs = getComputedStyle(el, '::after');
        out[style] = {
          attr: el.getAttribute('data-svi-masked'),
          opacity: cs.opacity,
          blur: cs.backdropFilter || cs.webkitBackdropFilter || '',
          content: cs.content
        };
      }
      svi.ACTIONS.mask.revert(el);
      out.removed = el.getAttribute('data-svi-masked');
      svi.prefs.actions.mask.enabled = false;
      return out;
    })()`);
    assert.strictEqual(maskRes.solid.attr, 'solid', 'mask 写入预设 id');
    assert.strictEqual(parseFloat(maskRes.solid.opacity), 1, 'solid = 全遮挡 (opacity 1)');
    assert.strictEqual(parseFloat(maskRes.dim.opacity), 0.75, 'dim 预设不透明度取自 MASK_PRESETS');
    assert.strictEqual(parseFloat(maskRes.frost.opacity), 0.35, 'frost 预设不透明度取自 MASK_PRESETS');
    assert.ok(/blur/.test(maskRes.frost.blur), 'frost 必须应用 backdrop-filter 模糊, got ' + maskRes.frost.blur);
    assert.notStrictEqual(maskRes.solid.content, 'none', '遮罩伪元素必须生成内容');
    assert.strictEqual(maskRes.removed, null, 'mask revert 摘除属性门');

    // 25d. dim: 全页层 + 不拦点击 + revert
    const dimRes = await evalInPage(`(() => {
      const svi = window.__svi;
      svi.prefs.actions.dim.enabled = true;
      svi.ACTIONS.dim.apply();
      const n = document.querySelector('.svi-page-dim');
      const cs = n ? getComputedStyle(n) : null;
      const out = {
        exists: !!n,
        pe: cs ? cs.pointerEvents : '',
        opacity: cs ? cs.opacity : '',
        position: cs ? cs.position : '',
        inset: n ? n.getBoundingClientRect().width : 0
      };
      svi.ACTIONS.dim.revert();
      out.afterRevert = !!document.querySelector('.svi-page-dim');
      svi.prefs.actions.dim.enabled = false;
      return out;
    })()`);
    assert.strictEqual(dimRes.exists, true, 'dim 层已创建');
    assert.strictEqual(dimRes.pe, 'none', 'dim 层必须不拦点击 (pointer-events:none)');
    assert.strictEqual(dimRes.position, 'fixed', 'dim 层为 fixed 全页层');
    assert.strictEqual(parseFloat(dimRes.opacity), 0.35, 'dim 不透明度取自 state.pageDimOpacity');
    assert.ok(dimRes.inset > 100, 'dim 层覆盖整个视口宽度, got ' + dimRes.inset);
    assert.strictEqual(dimRes.afterRevert, false, 'dim revert 移除层');

    // 25e. peek 门随 hoverRestore 单一真源切换
    const peekRes = await evalInPage(`(() => {
      const svi = window.__svi;
      svi.prefs.hoverRestore = false;
      svi.ACTIONS.peek.revert();
      const off = document.documentElement.classList.contains('svi-peek-on');
      svi.prefs.hoverRestore = true;
      svi.ACTIONS.peek.apply();
      const back = document.documentElement.classList.contains('svi-peek-on');
      return { off, back };
    })()`);
    assert.strictEqual(peekRes.off, false, 'hoverRestore=false 时 peek 门关闭');
    assert.strictEqual(peekRes.back, true, 'hoverRestore=true 时 peek 门恢复');

    // 25f. 开关即回滚: 关掉动作后 applyResolvedAction 必须清残留
    const rollbackRes = await evalInPage(`(() => {
      const svi = window.__svi;
      const el = document.getElementById('act-box-b');
      svi.prefs.actions.hide.enabled = true;
      el.setAttribute('data-svi-hidden', 'session');
      svi.prefs.actions.hide.enabled = false;
      const ret = svi.applyResolvedAction(el, { actionId: 'hide', verdict: 'invert', reason: 'learned' });
      return { ret, attr: el.getAttribute('data-svi-hidden') };
    })()`);
    assert.strictEqual(rollbackRes.ret, false, '动作关闭时 applyResolvedAction 返回 false');
    assert.strictEqual(rollbackRes.attr, null, '动作关闭时必须清掉残留标记 (开关即回滚)');

    // ============================================================
    // Scenario 26 (v5.2): 复查与撤销
    //   - 自动结论确实进撤销栈与「已处理」日志 (真实决策路径, 不是直接调栈)
    //   - 撤销 = 反事实回退 (摘标记 + 清 checked, 元素回到"未处理")
    //   - 「已处理」视图条目数 == 日志长度; 「全部媒体」视图不回归
    // ============================================================
    console.log('[Test] Scenario 26: v5.2 review & undo (Alt+Z) ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await new Promise((r) => setTimeout(r, 5000)); // 等首屏自动判定 + 空闲扫描落定

    const rev1 = await evalInPageAsync(`(async () => {
      const svi = window.__svi;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {
        logLen: svi.processedLog.items.length,
        undoLen: svi.undoStack.items.length,
      };
      // 选一个"干净"的栈顶条目: 元素仍在文档、无手动结论、其 src 无持久化手动覆盖。
      // (前序场景会通过 Alt+点击留下 manualOverrides —— 手动结论在撤销时仍然占优,
      //  拿这类条目做断言会把"手动占优"错读成"撤销失效")
      const stack = svi.undoStack.items;
      let pick = null;
      for (let i = stack.length - 1; i >= 0; i--) {
        const e = stack[i];
        if (!e || !e.el || !e.el.isConnected || typeof e.el.getAttribute !== 'function') continue;
        if (e.el.getAttribute('data-svi-manual')) continue;
        if (e.src && svi.prefs.manualOverrides[svi.manualOverrideKey(svi.profileKey(), e.src)]) continue;
        pick = e;
        break;
      }
      out.hasPick = !!pick;
      if (pick) {
        out.reason = pick.reason;
        out.actIdBefore = pick.el.getAttribute('data-svi-inverted');
        out.checkedBefore = pick.el.getAttribute('data-svi-checked-src');
        out.ok = svi.undoEntry(pick);
        // 撤销瞬间 (同步) 的清理状态 —— 此刻 checked 必须已摘
        out.checkedImmediate = pick.el.getAttribute('data-svi-checked-src');
        await wait(500);
        // 500ms 后: 元素会被合法地重新判定一次, 并因"用户否决"结论落为原样。
        // 因此这里断言的是"不再反色", 不是"checked 仍为空" (后者会误读成回归)。
        out.actIdAfter = pick.el.getAttribute('data-svi-inverted');
        out.settledChecked = pick.el.getAttribute('data-svi-checked-src');
      }
      // LIFO 语义单独验证 (不与上面那个元素绑定)
      const n0 = svi.undoStack.items.length;
      out.popped = svi.undoLast(1);
      out.stackShrank = n0 - svi.undoStack.items.length;
      return out;
    })()`);
    assert.ok(rev1.logLen > 0, '自动判定必须写入「已处理」日志 (实际 ' + rev1.logLen + ' 条)');
    assert.ok(rev1.undoLen > 0, '自动结论必须进入撤销栈 (实际 ' + rev1.undoLen + ' 条)');
    assert.ok(rev1.hasPick, '撤销栈中必须存在一个无手动结论的自动条目可供断言');
    assert.strictEqual(rev1.actIdBefore, 'true', '撤销前该元素处于反色态 (reason=' + rev1.reason + ')');
    assert.strictEqual(rev1.ok, true, 'undoEntry 返回 true');
    assert.strictEqual(rev1.checkedImmediate, null, '撤销瞬间必须同步清掉 checked 标记 (反事实回退的第一步)');
    assert.strictEqual(rev1.actIdAfter, null, '撤销 500ms 后必须仍不反色 (用户否决已持久化, 不是被下一次扫描翻回来)');
    assert.strictEqual(rev1.popped, 1, 'undoLast(1) 必须撤销 1 项');
    assert.strictEqual(rev1.stackShrank, 1, '撤销后栈长度必须减 1 (LIFO)');

    const rev2 = await evalInPageAsync(`(async () => {
      const svi = window.__svi;
      const ui = svi.ui;
      ui.openSettingsModal();
      ui.mediaShownCount = 200;
      ui.mediaView = 'processed';
      ui.refreshMediaSection();
      const processedRows = ui.mediaListBox.querySelectorAll('.svi-media-row').length;
      const processedSummary = ui.mediaSummary ? ui.mediaSummary.el.textContent : '';
      ui.mediaView = 'all';
      ui.mediaShownCount = 200;
      ui.refreshMediaSection();
      const allRows = ui.mediaListBox.querySelectorAll('.svi-media-row').length;
      const allSummary = ui.mediaSummary ? ui.mediaSummary.el.textContent : '';
      ui.closeSettingsModal();
      return {
        processedRows, processedSummary, allRows, allSummary,
        logLen: svi.processedLog.items.length,
        sectionTitle: !!document.getElementById('svi-sec-media')
      };
    })()`);
    assert.strictEqual(rev2.sectionTitle, true, '媒体区块仍然存在');
    assert.ok(rev2.processedRows > 0, '「已处理」视图必须渲染出行, got ' + rev2.processedRows);
    assert.ok(rev2.processedRows <= rev2.logLen, '「已处理」行数不得超过日志长度（避免凭空造行）');
    assert.ok(rev2.processedSummary.indexOf('已处理') >= 0, '「已处理」视图摘要须标明已处理数, got ' + rev2.processedSummary);
    assert.ok(rev2.allRows > 0, '「全部媒体」视图必须仍然可用 (v3.1 行为不回归), got ' + rev2.allRows);
    assert.ok(rev2.allSummary.indexOf('共 ') >= 0, '「全部媒体」摘要格式不回归, got ' + rev2.allSummary);

    // ============================================================
    // Scenario 27 (v5.3): 数据闭环
    //   - 判定来源分布与真实会话日志一致 (面板数字 == 实际决策)
    //   - hits 分级开关的"生效集合"回退语义 (关 = v5-1 集合)
    //   - 阈值校准建议计算 + 只收紧 + 恢复默认
    // ============================================================
    console.log('[Test] Scenario 27: v5.3 data loop (distribution / grading / calibration) ...');

    const dl1 = await evalInPageAsync(`(async () => {
      const svi = window.__svi;
      const ui = svi.ui;
      ui.openSettingsModal();
      await new Promise((r) => setTimeout(r, 120));
      const dist = svi.sourceDistribution(svi.processedLog.items);
      const diagText = ui.dataLoopDiag ? ui.dataLoopDiag.el.textContent : '';
      const calibText = ui.calibDiag ? ui.calibDiag.el.textContent : '';
      const ruleSrcOff = svi.effectiveSourceIds('rule').join(',');
      svi.prefs.learnGrading = true;
      ui.modalControls && ui.modalControls.syncAll();
      const ruleSrcOn = svi.effectiveSourceIds('rule').join(',');
      svi.prefs.learnGrading = false;
      const back = svi.effectiveSourceIds('rule').join(',');
      ui.closeSettingsModal();
      return {
        total: dist.total, byReason: dist.byReason, diagText, calibText,
        ruleSrcOff, ruleSrcOn, back,
        logLen: svi.processedLog.items.length,
      };
    })()`);
    assert.ok(dl1.diagText.indexOf('本页判定来源') >= 0, '面板必须有判定来源行, got ' + dl1.diagText);
    assert.ok(dl1.total === dl1.logLen, '分布总数必须等于会话日志长度 (' + dl1.total + ' vs ' + dl1.logLen + ')');
    assert.ok(dl1.diagText.indexOf(String(dl1.total) + ' 项') >= 0, '面板数字必须与分布一致, got ' + dl1.diagText);
    assert.strictEqual(dl1.ruleSrcOff, 'learned,seedProtect,faviconSkip,seedForceInvert',
      '分级关时生效来源集合必须与 v5-1 逐项一致 (零回归)');
    assert.strictEqual(dl1.ruleSrcOn, 'learnedStrong,seedProtect,faviconSkip,seedForceInvert,learnedWeak',
      '分级开时弱规则必须排在所有种子之后 (即"只能覆盖像素结论")');
    assert.strictEqual(dl1.back, dl1.ruleSrcOff, '关回来必须精确还原生效集合');
    assert.ok(dl1.calibText.indexOf('阈值校准') >= 0, '面板必须有校准行, got ' + dl1.calibText);

    const dl2 = await evalInPageAsync(`(async () => {
      const svi = window.__svi;
      const host = svi.profileKey();
      svi.corrections.data = null;
      const hd = svi.corrections.host(host);
      hd.falseInvert = 0; hd.falseKeep = 0;
      const before = svi.calibrate.suggest(host);
      const baseLum = Number(svi.prefs.imgLumCutoff) || 180;
      hd.falseInvert = 8; hd.falseKeep = 1;
      const tight = svi.calibrate.suggest(host);
      const applied = svi.calibrate.apply(host, 'tighten');
      // 注意: 必须**即时取值** —— ov 是引用, 后面的 reset() 会把字段删掉,
      // 等到 returnByValue 序列化时读到的就是已删除状态 (这是测试写法的坑, 不是产品缺陷)。
      const ov = svi.prefs.siteOverrides[host] || {};
      const ovLum = ov.imgLumCutoff;
      const ovArea = ov.imgAreaThreshold;
      const profileLum = svi.resolveSiteProfile(host).imgLumCutoff;
      hd.falseInvert = 0; hd.falseKeep = 8;
      const loose = svi.calibrate.suggest(host);
      const resetOk = svi.calibrate.reset(host);
      const after = svi.prefs.siteOverrides[host] && svi.prefs.siteOverrides[host].imgLumCutoff;
      return {
        beforeDir: before.direction, tightDir: tight.direction, looseDir: loose.direction,
        applied, ovLum, ovArea, baseLum, resetOk, profileLum,
        afterReset: typeof after === 'number',
        calibratedFlag: svi.calibrate.calibrated(host),
      };
    })()`);
    assert.strictEqual(dl2.beforeDir, null, '样本不足时不给方向 (不瞎调)');
    assert.strictEqual(dl2.tightDir, 'tighten', '误反占优 → 建议收紧');
    assert.strictEqual(dl2.looseDir, 'loosen', '误保占优 → 只是"建议"放松');
    assert.strictEqual(dl2.applied, true, 'apply 返回 true');
    assert.ok(dl2.ovLum > dl2.baseLum, '收紧必须抬高明度线 (' + dl2.baseLum + ' → ' + dl2.ovLum + ')');
    assert.ok(typeof dl2.ovArea === 'number', '收紧同时写面积门 imgAreaThreshold (图片侧另一个关键阈值)');
    assert.strictEqual(dl2.profileLum, dl2.ovLum, '站点档案必须透传校准后的阈值 (否则写了也不生效)');
    assert.strictEqual(dl2.resetOk, true, '恢复默认返回 true');
    assert.strictEqual(dl2.afterReset, false, '恢复后站点覆盖里不再有 imgLumCutoff');

    // ============================================================
    // Scenario 28 (v5.4): 提前判定 (帧序列两个门 / 动图闸门与降级)
    //   - 帧序列: 状态机方法存在 + 两个门的语义 (跃变优先于白闪)
    //   - 动图: 无 ImageDecoder 时静默降级不抛错; 闸门不误伤静态图
    // ============================================================
    console.log('[Test] Scenario 28: v5.4 pre-decide (frame sequence / animated) ...');

    const fs1 = await evalInPageAsync(`(() => {
      const svi = window.__svi;
      const hil = svi.engines.hil;
      const o = { threshold: 0.6, sceneDelta: 0.35, flashRatio: 0.5 };
      const dJump = svi.frameSequenceDecision([0.1, 0.1, 0.9], o);
      const dFlash = svi.frameSequenceDecision([0.3, 0.45, 0.62], o);
      const dStable = svi.frameSequenceDecision([0.9, 0.9, 0.9], o);
      return {
        hasMethod: !!(hil && typeof hil.detectSequenced === 'function'),
        defaultOn: svi.prefs.frameSequence !== false,
        jumpEarly: dJump.earlySwitch, jumpFlash: dJump.whiteFlash,
        flashFlag: dFlash.whiteFlash, flashEarly: dFlash.earlySwitch,
        stableBoth: dStable.earlySwitch || dStable.whiteFlash,
      };
    })()`);
    assert.strictEqual(fs1.hasMethod, true, 'HILStateMachine.detectSequenced 必须存在 (onFrame 与 tick 共用同一判定)');
    assert.strictEqual(fs1.defaultOn, true, '帧序列判定默认开');
    assert.strictEqual(fs1.jumpEarly, true, '明确跃变 → 提前切换');
    assert.strictEqual(fs1.jumpFlash, false, '跃变优先: 真场景切换不得被白闪门压掉');
    assert.strictEqual(fs1.flashFlag, true, '孤立白帧 → 转场白闪');
    assert.strictEqual(fs1.flashEarly, false, '白闪不构成提前切换');
    assert.strictEqual(fs1.stableBoth, false, '稳定态两个门都不得触发 (默认路径不改)');

    const an1 = await evalInPageAsync(`(async () => {
      const svi = window.__svi;
      const eng = svi.engines.image;
      const before = (svi.engines.hil && svi.stats.counters && svi.stats.counters.animDecoderUnavailable) || 0;
      const savedStats = svi.prefs.statsEnabled;
      svi.prefs.statsEnabled = true; // 前序场景可能关掉了统计; count() 在关闭时是 no-op
      const c0 = (svi.stats.counters || {}).animDecoderUnavailable || 0;
      const saved = window.ImageDecoder;
      let r = 'unset';
      let threw = false;
      let typeAfter = '';
      window.ImageDecoder = undefined; // 模拟不支持该 API 的浏览器
      try {
        typeAfter = typeof ImageDecoder;
        r = await eng.analyzeAnimated(document.createElement('img'), 'https://x.test/a.gif');
      }
      catch (e) { threw = true; r = 'ERR:' + (e && e.message); }
      const c1 = (svi.stats.counters || {}).animDecoderUnavailable || 0;
      window.ImageDecoder = saved;
      svi.prefs.statsEnabled = savedStats;
      return {
        r: (r === null ? null : String(r)), threw, c0, c1, supported: typeof saved === 'function',
        typeAfter, hasMethod: typeof eng.analyzeAnimated === 'function',
        statsEnabled: savedStats, animatedDetect: svi.prefs.animatedDetect,
      };
    })()`);
    assert.strictEqual(an1.threw, false, '无 ImageDecoder 时不得抛错 (静默降级)');
    assert.strictEqual(an1.r, null, '无 ImageDecoder 时返回 null → 交给静态判定, 行为与 v5.3 一致');
    assert.ok(an1.c1 > an1.c0, '必须记一次 animDecoderUnavailable (面板要据此说明); probe=' + JSON.stringify(an1));

    const an2 = await evalInPageAsync(`(() => {
      const svi = window.__svi;
      return {
        staticPng: svi.animatedProbe({}, { src: 'https://x.test/a.png' }).animated,
        gif: svi.animatedProbe({}, { src: 'https://x.test/a.gif' }).animated,
        pngDelta: svi.animatedProbe({}, { src: 'https://x.test/a.png', sampleA: 0.1, sampleB: 0.9 }).animated,
        mixed: svi.animatedSpectrum([0.9, 0.9, 0.1, 0.1, 0.1], { threshold: 0.6, allLightRatio: 0.9 }).verdict,
        light: svi.animatedSpectrum([0.9, 0.9, 0.95], { threshold: 0.6, allLightRatio: 0.9 }).verdict,
        stride: svi.animatedStride(1000, 60),
      };
    })()`);
    assert.strictEqual(an2.staticPng, false, '静态 png 不得进动图重路径');
    assert.strictEqual(an2.gif, true, 'gif 进重路径');
    assert.strictEqual(an2.pngDelta, true, '后缀不可靠时用像素门兜底');
    assert.strictEqual(an2.mixed, 'keep', '混合型动图默认保持原样 (不假装能逐帧切换)');
    assert.strictEqual(an2.light, 'invert', '全浅动图反色');
    assert.strictEqual(an2.stride, 17, '1000 帧抽 60 → 步长 17 (抽帧覆盖全段而不是只解开头)');

    console.log('\n🎉 ALL BROWSER AUTOMATION TESTS PASSED 100% SUCCESFULLY!\n');

    await new Promise((r) => setTimeout(r, 400)); // Windows 重定向: 等待 stdout 刷盘再退出


    ws.close();
    chromeProc.kill();
    server.close();
    corsServer.close();
    process.exit(0);

  } catch (err) {
    console.error('Test failed with error:', err);
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill(); } catch (e) {}
    server.close();
    corsServer.close();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  server.close();
  corsServer.close();
  process.exit(1);
});
