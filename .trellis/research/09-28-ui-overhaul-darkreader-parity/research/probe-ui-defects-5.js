// TEMP PROBE #5 (research-only). Instruments closeSettingsModal to find why Escape does nothing.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9911 + (process.pid % 80);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect5-'));
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
  const out = {};

  // enumerate the page's document-level keydown listeners? not possible; instead instrument the method
  out.wrap = await evalJson(`(() => {
    window.__probe = { closeCalls: 0, err: null };
    const ui = window.__svi.ui;
    const orig = ui.closeSettingsModal.bind(ui);
    ui.closeSettingsModal = function () { window.__probe.closeCalls++; return orig(); };
    return { hasUI: !!ui, hasMethod: typeof orig === 'function' };
  })()`);

  await evalJson('window.__svi.ui.openSettingsModal()'); await sleep(500);
  out.opened = await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`);

  // ensure focus is not in an input
  await evalJson(`(() => { try { document.activeElement.blur(); } catch(e){} return document.activeElement.tagName; })()`);
  out.afterBlurActive = await evalJson('document.activeElement.tagName');

  // synthetic Escape on the real target
  await evalJson(`(() => { const t = document.activeElement || document.body; t.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', keyCode:27, bubbles:true, cancelable:true })); return true; })()`);
  await sleep(250);
  out.afterSyntheticEsc = { closeCalls: await evalJson('window.__probe.closeCalls'), stillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };

  // real CDP Escape
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(250);
  out.afterRealEsc = { closeCalls: await evalJson('window.__probe.closeCalls'), stillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };

  // prove the wrapper works at all
  await evalJson('window.__svi.ui.closeSettingsModal()'); await sleep(100);
  out.afterDirectCall = { closeCalls: await evalJson('window.__probe.closeCalls'), stillOpen: await evalJson(`document.querySelector('.svi-modal-mask').classList.contains('show')`) };

  // look for the modal Escape listener by re-registering and observing order via a marker
  out.listenerDiag = await evalJson(`(() => {
    // count how many document keydown listeners exist by monkey-patching addEventListener is not possible retroactively;
    // instead: register a capture listener that inspects, and a bubble listener to see if propagation survives
    let capSaw = 0, bubSaw = 0;
    document.addEventListener('keydown', () => { capSaw++; }, true);
    document.addEventListener('keydown', () => { bubSaw++; });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    return { capSaw, bubSaw };
  })()`);

  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe5 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
