// Automated Browser End-to-End Test for Universal Smart Invert Userscript (v2.0)
// Connects to Chrome via Chrome DevTools Protocol (CDP) and tests real image detection & UI
// v2.0 scenarios: cross-origin CORS SVG decode chain (star-history/camo fix), bilibili-style
// background-image thumbnails, repeated tiny icon shield, login-box-safe background replace,
// per-tab video-invert isolation across reload, and local stats persistence.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PORT = 8765;
const PORT2 = 8766; // 跨域 CORS 服务器 (模拟 GitHub camo / star-history 跨域图床)
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
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
  '/img/camo-nosize.svg': `<svg xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fdfdfd"/><circle cx="60" cy="60" r="40" fill="none" stroke="#333" stroke-width="4"/><text x="25" y="130" fill="#111" font-size="18">no-size SVG</text></svg>`
};

const userscriptCode = fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8');

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
    .card { background: #1e1e1e; padding: 10px; border-radius: 8px; text-align: center; }
    img { display: block; width: 160px; height: 120px; border-radius: 4px; }
    #icon-grid img { width: 64px; height: 64px; }
    #bg-thumb { width: 120px; height: 80px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Smart Invert Automation Test Bench</h1>
  <div class="gallery">
    <div class="card"><img id="img-white" src="/img/white-diagram.svg" alt="White diagram"><p>1. White Diagram</p></div>
    <div class="card"><img id="img-gray" src="/img/gray-chart.svg" alt="Gray chart"><p>2. Gray Chart</p></div>
    <div class="card"><img id="img-cream" src="/img/cream-slide.svg" alt="Cream slide"><p>3. Cream Slide</p></div>
    <div class="card"><img id="img-blue" src="/img/cool-blue.svg" alt="Cool blue"><p>4. Cool Blue</p></div>
    <div class="card"><img id="img-thumb" src="/img/thumb/wiki-diagram.svg" alt="Thumb URL"><p>5. Wiki Thumb</p></div>
    <div class="card"><img id="img-dark" src="/img/dark-scenery.svg" alt="Dark scenery"><p>6. Dark Scenery</p></div>
    <div class="card"><img id="img-color" src="/img/colorful-banner.svg" alt="Colorful banner"><p>7. Colorful Banner</p></div>
    <div class="card"><img id="img-camo" src="http://127.0.0.1:${PORT2}/img/camo-sized.svg" alt="Camo sized"><p>8. CORS SVG (sized)</p></div>
    <div class="card"><img id="img-camo-nosize" src="http://127.0.0.1:${PORT2}/img/camo-nosize.svg" alt="Camo nosize"><p>9. CORS SVG (no size)</p></div>
    <div class="card"><div id="bg-thumb" style="background-image: url('/img/white-diagram.svg'); background-size: cover;"></div><p>10. BG-Image Thumb</p></div>
  </div>
  <div id="icon-grid">
    ${ICON_GRID}
  </div>

  <script>
    ${executableScript}
  </script>
</body>
</html>`;

// 背景替换登录块基准页: 在脚本注入前预置 localStorage 偏好 (bgReplace=true)
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Background Replace Login Bench</title>
  <script>
    localStorage.setItem('universal_smart_invert_v4', JSON.stringify({ bgReplace: true }));
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

// 1. Create HTTP test servers (main + cross-origin CORS SVG host)
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_CONTENT);
    return;
  }
  if (url === '/login-page') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(LOGIN_HTML);
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
  await listen(server, PORT);
  await listen(corsServer, PORT2);
  console.log(`[TestServer] Main bench at http://127.0.0.1:${PORT} (login page: /login-page)`);
  console.log(`[TestServer] Cross-origin CORS SVG host at http://127.0.0.1:${PORT2}`);

  // 2. Launch Chrome headless with CDP (graceful skip when Chrome is unavailable)
  if (!fs.existsSync(CHROME_PATH)) {
    console.warn(`[Browser] Chrome not found at ${CHROME_PATH}; skipping browser end-to-end tests.`);
    console.warn('[Browser] (Unit tests in test.js still cover the v2.0 pure logic.)');
    server.close();
    corsServer.close();
    process.exit(0);
  }

  console.log(`[Browser] Launching Headless Chrome: ${CHROME_PATH}`);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
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

    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('[Chrome Console]', ...data.params.args.map(a => a.value || a.description));
      }
      if (data.method === 'Runtime.exceptionThrown') {
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
          hasAccordion: !!document.querySelector('.svi-accordion'),
          actionBtnCount: document.querySelectorAll('.svi-action-btn').length,
          hasSiteSection: !!document.getElementById('svi-sec-site'),
          hasShieldSection: !!document.getElementById('svi-sec-shield'),
          hasStatsSection: !!document.getElementById('svi-sec-stats')
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
    assert.strictEqual(report.ui.hasAccordion, true, 'Collapsible accordion must exist');
    assert.strictEqual(report.ui.actionBtnCount, 4, 'Panel must have 4 action buttons (video/smart/image/bg-replace)');
    assert.strictEqual(report.ui.hasSiteSection, true, 'Modal 站点与规则 section must exist');
    assert.strictEqual(report.ui.hasShieldSection, true, 'Modal 原色屏蔽 section must exist');
    assert.strictEqual(report.ui.hasStatsSection, true, 'Modal 数据与反馈 section must exist');

    // R5: stats key must exist and parse after activity (flushed via the designed export path)
    assert.strictEqual(report.statsKey.parsed, true, 'localStorage stats key must exist and parse');
    assert.ok(report.statsKey.imagesAnalyzed >= 1, 'persisted stats counters must record image analysis activity');
    assert.ok(report.statsKey.exportImagesAnalyzed >= 1, 'export JSON must contain image analysis counter');
    assert.strictEqual(report.statsKey.exportSchema, 1, 'export JSON envelope schema must be 1');

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

    console.log('\n🎉 ALL BROWSER AUTOMATION TESTS PASSED 100% SUCCESFULLY!\n');

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
