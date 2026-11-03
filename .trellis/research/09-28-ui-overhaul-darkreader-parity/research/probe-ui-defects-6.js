// TEMP PROBE #6 (research-only). Uses DOMDebugger.getEventListeners to enumerate the REAL
// document-level keydown/click listeners (source line numbers) so we can see whether the modal's
// Escape handler is registered at all.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9211 + (process.pid % 60);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect6-'));
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
  await evalJson('window.__svi.ui.openSettingsModal()'); await sleep(500);

  // collect the script sourceURLs so we can map scriptId -> line
  const scripts = await send('Debugger.enable');
  const objId = (await send('Runtime.evaluate', { expression: 'document' })).result.result.objectId;
  const listeners = await send('DOMDebugger.getEventListeners', { objectId: objId, depth: 1 });
  const keydowns = (listeners.result.listeners || []).filter((l) => l.type === 'keydown');
  const clicks = (listeners.result.listeners || []).filter((l) => l.type === 'click');
  const brief = (l) => ({ type: l.type, useCapture: l.useCapture, line: l.lineNumber, col: l.columnNumber, scriptId: l.scriptId, passive: l.passive });

  // get the source URL for each scriptId
  const srcOf = {};
  await send('Debugger.enable');
  // gather via Debugger.scriptParsed events? simpler: use Runtime.evaluate to read the userscript's sourceURL
  const out = {
    documentKeydownListeners: keydowns.map(brief),
    documentClickListeners: clicks.map(brief),
    // does the userscript define its own sourceURL?
    sourceURL: await evalJson(`(() => { try { return (new Error()).stack.split('\\n').length > 0 ? (document.currentScript && document.currentScript.src) || null : null; } catch(e){ return null; } })()`),
  };

  // Resolve scriptId -> url via Debugger.scriptParsed events captured after a reload is overkill;
  // instead ask the debugger for the script source of the keydown listeners' scriptId.
  out.listenerSources = {};
  for (const l of keydowns.concat(clicks)) {
    if (out.listenerSources[l.scriptId]) continue;
    try {
      const src = await send('Debugger.getScriptSource', { scriptId: l.scriptId });
      const text = (src.result && src.result.scriptSource) || '';
      out.listenerSources[l.scriptId] = {
        len: text.length,
        line: text.split('\n')[l.lineNumber] || null,
        url: (text.match(/\/\/# sourceURL=([^\n]+)/) || [])[1] || (text.slice(0, 120)),
      };
    } catch (e) { out.listenerSources[l.scriptId] = 'ERR ' + e.message; }
  }

  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe6 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
