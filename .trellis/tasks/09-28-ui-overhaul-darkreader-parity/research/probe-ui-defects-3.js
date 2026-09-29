// TEMP PROBE #3 (research-only). DEFINITIVE test for defect 5: sends REAL CDP mouse clicks
// (Input.dispatchMouseEvent) — not synthetic dispatchEvent — and records where the browser
// routes them (document.activeElement) and whether the modal closes. Also tests real Escape.
// Usage: node <this file>
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9611 + (process.pid % 300);
const WIDTH = 1100, HEIGHT = 900;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect3-'));
const probePage = path.join(userDataDir, 'probe.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"><title>p3</title></head><body style="background:#eee">夹具</body></html>');
const chrome = spawn(CHROME_PATH, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], { stdio: 'ignore' });

const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(SHOTS, name + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return path.relative(ROOT, f); };
  const realClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(150);
  };
  const activeInfo = () => evalJson(`(() => { const a = document.activeElement; return a ? (a.tagName + (a.className ? '.' + a.className : '') + (a.tagName === 'INPUT' ? '[type=' + a.type + ']' : '')) : null; })()`);

  await sleep(400);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);
  await evalJson(fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==UserScript==/, '').trim());
  await sleep(1600);

  const out = { note: 'real CDP mouse input; activeElement proves the browser routed the click to the invisible color input', results: {} };

  // ---------- control: 本站 tab (color inputs hidden → should behave) ----------
  await evalJson('window.__svi.ui.openSettingsModal()'); await sleep(500);
  out.results.siteTab = { shown: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };
  const winSite = await evalJson(`(() => { const w = document.querySelector('.svi-modal-window').getBoundingClientRect(); return [Math.round(w.x), Math.round(w.y), Math.round(w.width), Math.round(w.height)]; })()`);
  const gutterX = Math.max(5, Math.round(winSite[0] / 2)); const gutterY = Math.round(HEIGHT / 2);
  out.results.siteTab.gutterPoint = [gutterX, gutterY];
  await realClick(gutterX, gutterY);
  out.results.siteTab.afterClick = { active: await activeInfo(), modalStillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };
  // reopen for next scenario
  await evalJson(`(function(){ const m=document.querySelector('.svi-modal-mask'); if(!m.classList.contains('show')) window.__svi.ui.openSettingsModal(); })()`);
  await sleep(400);

  // ---------- test: 全局 tab ----------
  await evalJson(`(() => { const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局'); if (t) t.click(); return !!t; })()`);
  await sleep(500);
  const winG = await evalJson(`(() => { const w = document.querySelector('.svi-modal-window').getBoundingClientRect(); return [Math.round(w.x), Math.round(w.y), Math.round(w.width), Math.round(w.height)]; })()`);
  const gx = Math.max(5, Math.round(winG[0] / 2)); const gy = Math.round(HEIGHT / 2);
  out.results.globalTab = { windowRect: winG, gutterPoint: [gx, gy] };
  out.results.globalTab.beforeClick = { active: await activeInfo(), modalOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };
  await realClick(gx, gy);
  out.results.globalTab.afterGutterClick = { active: await activeInfo(), modalStillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };
  out.results.globalTab.shot = await shot('defect5-d-global-realclick-gutter');

  // click exactly on the close button (real input)
  const cb = await evalJson(`(() => { const b=document.querySelector('.svi-modal-close'); const r=b.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`);
  await realClick(cb[0], cb[1]);
  out.results.globalTab.afterCloseBtnClick = { point: cb, active: await activeInfo(), modalStillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };

  // press Escape (real key) up to 3 times; record modal state after each
  const escInfo = [];
  for (let i = 0; i < 3; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(300);
    escInfo.push({ press: i + 1, modalStillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`), active: await activeInfo() });
  }
  out.results.escapeSequence = escInfo;
  out.results.afterEscape = { modalStillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };

  fs.writeFileSync(path.join(__dirname, 'probe-ui-defects-3.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe3 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
