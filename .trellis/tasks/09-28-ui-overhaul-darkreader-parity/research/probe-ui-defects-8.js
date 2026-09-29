// TEMP PROBE #8 (research-only). Dumps the UIController prototype method names to see whether
// region-mask methods (cancelRegionMask / armRegionMask) exist on it at all.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9111 + (process.pid % 60);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect8-'));
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
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);
  await evalJson(fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==UserScript==/, '').trim());
  await sleep(1600);
  const out = await evalJson(`(() => {
    const ui = window.__svi.ui;
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(ui));
    const eng = window.__svi_image_engine;
    const engProto = eng ? Object.getOwnPropertyNames(Object.getPrototypeOf(eng)) : [];
    return {
      uiCtor: ui.constructor.name,
      uiHasCancelRegionMask: typeof ui.cancelRegionMask,
      uiHasArmRegionMask: typeof ui.armRegionMask,
      uiHasAddRegionMask: typeof ui.addRegionMask,
      uiRegionMethods: proto.filter(n => /region/i.test(n)),
      engineCtor: eng ? eng.constructor.name : null,
      engineRegionMethods: engProto.filter(n => /region/i.test(n)),
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe8 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
