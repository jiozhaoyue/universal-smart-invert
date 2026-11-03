// TEMP PROBE #4 (research-only). Isolates WHY Escape does not close the modal on the 全局 tab.
// Usage: node <this file>
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9811 + (process.pid % 200);
const WIDTH = 1100, HEIGHT = 900;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect4-'));
const probePage = path.join(userDataDir, 'p.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#eee">x</body></html>');
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
  const realEsc = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await sleep(250); };
  const open = () => evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`);

  await sleep(400); await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);
  await evalJson(fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==UserScript==/, '').trim());
  await sleep(1600);
  const out = {};

  // instrument keydown visibility at document level (probe-side only)
  await evalJson(`window.__escSeen = 0; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escSeen++; }, true);`);

  // A: 本站 tab  → real Escape
  await evalJson('window.__svi.ui.openSettingsModal()'); await sleep(500);
  await realEsc();
  out.A_siteTab_escapeCloses = !(await open());
  out.A_escSeen = await evalJson('window.__escSeen');

  // B: 全局 tab → real Escape (input likely focused after a click)
  await evalJson(`(function(){ if(!document.querySelector('.svi-modal-mask').classList.contains('show')) window.__svi.ui.openSettingsModal(); })()`); await sleep(400);
  await evalJson(`(() => { const t=[...document.querySelectorAll('.svi4-tab')].find(b=>b.textContent==='全局'); if(t) t.click(); })()`); await sleep(400);
  out.B_before = { open: await open(), active: await evalJson('document.activeElement.tagName') };
  await realEsc();
  out.B_globalTab_escapeCloses = !(await open());
  out.B_escSeen = await evalJson('window.__escSeen');

  // C: blur the active element, then Escape
  await evalJson(`(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); })()`);
  await sleep(150);
  out.C_activeAfterBlur = await evalJson('document.activeElement.tagName');
  await realEsc();
  out.C_afterBlur_escapeCloses = !(await open());
  out.C_escSeen = await evalJson('window.__escSeen');

  // D: with NO color input focused, does the modal's own keydown handler run? (synthetic event)
  if (!(await open())) { await evalJson('window.__svi.ui.openSettingsModal()'); await sleep(400); }
  await evalJson(`(() => { const t=[...document.querySelectorAll('.svi4-tab')].find(b=>b.textContent==='全局'); if(t) t.click(); })()`); await sleep(300);
  await evalJson(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(250);
  out.D_syntheticEscape_closes = !(await open());

  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe4 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
