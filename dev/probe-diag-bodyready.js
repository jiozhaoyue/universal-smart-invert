// 诊断: document-start 注入时 documentElement / document 是否可观察
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const http = require('http'); const os = require('os');
const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let CP = 35000 + (process.pid % 2000);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
const P = (p, q) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: p, path: q }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); });
const s = (ms) => new Promise(r => setTimeout(r, ms));
const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<html><body><p>hi</p></body></html>'); });
(async () => {
  await new Promise(r => srv.listen(36001, '127.0.0.1', r));
  const ch = spawn(CHROME, [`--remote-debugging-port=${CP}`, `--user-data-dir=${D}`, '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let t = null, n = 0;
  while (!t && n < 80) { try { t = await P(CP, '/json/list'); } catch (e) { n++; if (n % 30 === 0) CP++; } if (!t) await s(250); }
  const pg = t.find(x => x.type === 'page'); const ws = new WebSocket(pg.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = m => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
  const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await s(300);
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
    window.__diag = {};
    try { window.__diag.deAtStart = document.documentElement ? 'EXISTS' : 'NULL'; } catch (e) { window.__diag.deAtStart = 'ERR:' + e.message; }
    try { window.__diag.bodyAtStart = document.body ? 'EXISTS' : 'NULL'; } catch (e) { window.__diag.bodyAtStart = 'ERR'; }
    try { window.__diag.rsAtStart = document.readyState; } catch (e) { window.__diag.rsAtStart = 'ERR'; }
    window.__diag.moDE = null; window.__diag.moDoc = null; window.__diag.moErr = null;
    try {
      const m1 = new MutationObserver(() => { if (document.body && window.__diag.moDE === null) { window.__diag.moDE = Math.round(performance.now()); } });
      m1.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { window.__diag.moErr = 'DE:' + e.message; }
    try {
      const m2 = new MutationObserver(() => { if (document.body && window.__diag.moDoc === null) { window.__diag.moDoc = Math.round(performance.now()); } });
      m2.observe(document, { childList: true, subtree: true });
    } catch (e) { window.__diag.moErr = (window.__diag.moErr || '') + ' DOC:' + e.message; }
  `});
  await send('Page.navigate', { url: 'http://127.0.0.1:36001/' });
  await s(2000);
  const r = await send('Runtime.evaluate', { expression: 'window.__diag', returnByValue: true });
  console.log(JSON.stringify(r.result.result.value, null, 2));
  ws.close(); ch.kill(); try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
