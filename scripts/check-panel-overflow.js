// CDP layout probe: open the settings panel at many viewport widths x all three
// layout modes and assert NO element overflows horizontally (hard rule: the
// panel must never show a horizontal scrollbar or clip content).
// NOTE (spec gotcha): inject the userscript via Runtime.evaluate AFTER
// navigation — document-start injection silently loses ALL styles.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9226;
const WIDTHS = [1366, 1024, 800, 640, 480, 375, 320];

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-overflow-'));
// Local page (file:// keeps localStorage usable, unlike data:) so the boot
// storage layer behaves like a real page; content is irrelevant.
const probePage = path.join(userDataDir, 'probe.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"><title>svi overflow probe</title></head><body><h1>probe</h1></body></html>');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files',
  'about:blank',
], { stdio: 'ignore' });

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { targets = await get('/json/list'); if (targets) break; } catch (e) {}
    await sleep(300);
  }
  if (!targets) { console.error('CDP not reachable'); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result.result.value;
  };

  await sleep(500);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);

  const src = fs.readFileSync(__dirname + '/../universal-smart-invert.user.js', 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await evalJson(src);
  await sleep(1500);

  const boot = await evalJson(`(() => ({
    svi: !!(window.__svi && window.__svi.ui),
    version: window.__svi && window.__svi.version,
  }))()`);
  if (!boot.svi) { console.error('userscript did not boot on probe page'); process.exit(1); }
  await evalJson(`window.__svi.ui.openSettingsModal()`);
  await sleep(400);

  const measureExpr = `(function () {
    const win = document.querySelector('.svi-modal-window');
    if (!win) return { modal: false };
    const bad = [];
    const all = [win, ...win.querySelectorAll('*')];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        bad.push({ cls: (el.className || '').toString().slice(0, 60) || el.tagName, sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    const grid = win.querySelectorAll('.svi-stats-grid .svi-stats-cell').length;
    const previews = win.querySelectorAll('.svi-store-key-preview').length;
    return {
      modal: true,
      layout: document.querySelector('.svi-modal-mask').className.replace('svi-modal-mask', '').trim() || 'center',
      winW: Math.round(win.getBoundingClientRect().width),
      docClientW: win.parentElement.clientWidth,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      statsCells: grid,
      storePreviews: previews,
      overflows: bad.slice(0, 8),
    };
  })()`;

  const results = [];
  let failures = 0;
  for (const width of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    for (const layout of ['center', 'left', 'right']) {
      await evalJson(`(function () {
        const btns = document.querySelectorAll('.svi-layout-btn');
        const map = { center: 0, left: 1, right: 2 };
        btns[map['${layout}']].click();
      })()`);
      await sleep(250);
      const r = await evalJson(measureExpr);
      r.viewport = width;
      results.push(r);
      const bad = !r.modal || r.hScroll || (r.overflows && r.overflows.length) ||
        (layout === 'center' && r.statsCells !== 11) || r.storePreviews !== 0;
      if (bad) failures++;
      console.log(JSON.stringify(r));
    }
  }

  console.log(failures === 0 ? 'PANEL OVERFLOW CHECK: PASS (all widths x layouts)' : `PANEL OVERFLOW CHECK: FAIL (${failures} bad configs)`);
  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); chrome.kill(); try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e2) {} process.exit(1); });
