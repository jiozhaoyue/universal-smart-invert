// TEMP PROBE #7 (research-only). Captures page exceptions + console during Escape, enumerates
// listeners on body/html, and reports pendingMask side-effect state.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9311 + (process.pid % 60);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect7-'));
const probePage = path.join(userDataDir, 'p.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#eee">x</body></html>');
const chrome = spawn(CHROME_PATH, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', '--window-size=1100,900', 'about:blank'], { stdio: 'ignore' });
const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method) { events.push(msg); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result.result.value; };
  await sleep(400); await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);
  await evalJson(fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==UserScript==/, '').trim());
  await sleep(1600);
  await evalJson('window.__svi.ui.openSettingsModal()'); await sleep(500);

  const bodyObj = (await send('Runtime.evaluate', { expression: 'document.body' })).result.result.objectId;
  const bodyL = (await send('DOMDebugger.getEventListeners', { objectId: bodyObj })).result.listeners.filter((l) => l.type === 'keydown').map((l) => ({ line: l.lineNumber, cap: l.useCapture }));
  const htmlObj = (await send('Runtime.evaluate', { expression: 'document.documentElement' })).result.result.objectId;
  const htmlL = (await send('DOMDebugger.getEventListeners', { objectId: htmlObj })).result.listeners.filter((l) => l.type === 'keydown').map((l) => ({ line: l.lineNumber, cap: l.useCapture }));

  const before = { pendingEls: await evalJson(`document.querySelectorAll('[data-svi-pending]').length`), toasts: await evalJson(`document.querySelectorAll('#svi-toast, .svi-toast').length`) };
  events.length = 0;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(400);
  const after = { pendingEls: await evalJson(`document.querySelectorAll('[data-svi-pending]').length`), stillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };
  const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => ({ text: (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text, line: e.params.exceptionDetails.lineNumber }));
  const logs = events.filter((e) => e.method === 'Runtime.consoleAPICalled' || e.method === 'Log.entryAdded').map((e) => JSON.stringify(e.params).slice(0, 300));

  console.log(JSON.stringify({ bodyKeydownListeners: bodyL, htmlKeydownListeners: htmlL, before, after, exceptions, logs: logs.slice(0, 10) }, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe7 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
