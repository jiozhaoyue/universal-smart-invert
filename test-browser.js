// Automated Browser End-to-End Test for Universal Smart Invert Userscript
// Connects to Chrome via Chrome DevTools Protocol (CDP) and tests real image detection & UI
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PORT = 8765;
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
  '/img/colorful-banner.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#ef4444"/><rect x="20" y="20" width="160" height="110" fill="#f59e0b"/><text x="50" y="80" fill="#fff" font-size="18">Sale 50% Off</text></svg>`
};

const userscriptCode = fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8');

// Stripped userscript wrapper for plain browser context execution
const executableScript = userscriptCode
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
  .trim();

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
  </div>

  <script>
    ${executableScript}
  </script>
</body>
</html>`;

// 1. Create HTTP test server
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_CONTENT);
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

server.listen(PORT, async () => {
  console.log(`[TestServer] Running at http://127.0.0.1:${PORT}`);

  // 2. Launch Chrome headless with CDP
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

  try {
    const wsUrl = await waitForCDP();
    console.log(`[Browser] Connected to CDP WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

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

    console.log('[Test] Navigating to http://127.0.0.1:8765 ...');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}` });

    // Wait for images to load and ImageInvertEngine to finish processing
    console.log('[Test] Waiting for image analysis to complete in Chrome...');
    await new Promise((r) => setTimeout(r, 2000));

    // Run DOM assertion query via CDP
    const evalRes = await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const results = {};
        const ids = ['img-white', 'img-gray', 'img-cream', 'img-blue', 'img-thumb', 'img-dark', 'img-color'];
        ids.forEach(id => {
          const el = document.getElementById(id);
          results[id] = {
            inverted: el ? el.getAttribute('data-svi-inverted') === 'true' : false,
            checkedSrc: el ? !!el.getAttribute('data-svi-checked-src') : false
          };
        });

        // Test modal UI presence
        const pill = document.querySelector('.svi-trigger-pill');
        const modal = document.querySelector('.svi-modal-mask');
        const chips = document.querySelectorAll('.svi-color-chip');
        const picker = document.querySelector('.svi-color-input-native');
        const accordion = document.querySelector('.svi-accordion');

        results.ui = {
          hasPill: !!pill,
          hasModal: !!modal,
          chipsCount: chips.length,
          hasPicker: !!picker,
          hasAccordion: !!accordion
        };

        return results;
      })()`,
      returnByValue: true
    });

    const report = evalRes.result.value;
    console.log('\n[Browser Test Results]:');
    console.log('----------------------------------------------------');
    console.log(`1. Pure White Diagram:       Inverted = ${report['img-white'].inverted} (Expected: true)`);
    console.log(`2. Light Gray Chart:         Inverted = ${report['img-gray'].inverted} (Expected: true)`);
    console.log(`3. Warm Cream Slide:         Inverted = ${report['img-cream'].inverted} (Expected: true)`);
    console.log(`4. Pale Blue Flowchart:      Inverted = ${report['img-blue'].inverted} (Expected: true)`);
    console.log(`5. Wiki/Thumb URL Diagram:   Inverted = ${report['img-thumb'].inverted} (Expected: true)`);
    console.log(`6. Dark Scenery Photo:       Inverted = ${report['img-dark'].inverted} (Expected: false)`);
    console.log(`7. High-Sat Colorful Banner: Inverted = ${report['img-color'].inverted} (Expected: false)`);
    console.log('----------------------------------------------------');
    console.log(`UI Float Pill:               ${report.ui.hasPill ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Settings Modal:           ${report.ui.hasModal ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Color Chips (Presets):    ${report.ui.chipsCount} chips loaded`);
    console.log(`UI Color Picker:             ${report.ui.hasPicker ? '✓ Present' : '✗ Missing'}`);
    console.log(`UI Collapsible Accordion:    ${report.ui.hasAccordion ? '✓ Present' : '✗ Missing'}`);
    console.log('----------------------------------------------------\n');

    // Assertions
    assert.strictEqual(report['img-white'].inverted, true, 'White diagram must be inverted');
    assert.strictEqual(report['img-gray'].inverted, true, 'Light gray chart must be inverted');
    assert.strictEqual(report['img-cream'].inverted, true, 'Warm cream slide must be inverted');
    assert.strictEqual(report['img-blue'].inverted, true, 'Pale blue flowchart must be inverted');
    assert.strictEqual(report['img-thumb'].inverted, true, 'Wiki thumb URL diagram must be inverted');
    assert.strictEqual(report['img-dark'].inverted, false, 'Dark photo must NOT be inverted');
    assert.strictEqual(report['img-color'].inverted, false, 'Colorful banner must NOT be inverted');

    assert.strictEqual(report.ui.hasPill, true, 'Floating pill UI must exist');
    assert.strictEqual(report.ui.hasModal, true, 'Settings modal must exist');
    assert.strictEqual(report.ui.hasPicker, true, 'Native color picker must exist');
    assert.strictEqual(report.ui.hasAccordion, true, 'Collapsible accordion must exist');

    console.log('🎉 ALL BROWSER AUTOMATION TESTS PASSED 100% SUCCESFULLY!\n');

    ws.close();
    chromeProc.kill();
    server.close();
    process.exit(0);

  } catch (err) {
    console.error('Test failed with error:', err);
    chromeProc.kill();
    server.close();
    process.exit(1);
  }
});
