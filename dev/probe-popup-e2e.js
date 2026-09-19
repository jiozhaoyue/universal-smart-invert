// End-to-end popup test with a REAL installed extension:
// 1) launch Chrome --load-extension=extension
// 2) load a real page, find the content script's ISOLATED world via
//    Runtime.executionContextCreated, read chrome.runtime.id + __svi there
// 3) open popup.html in a tab, drive the svi-* protocol from the popup
//    against the content tab, and screenshot the popup UI.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9241;
const outDir = path.join(__dirname, 'shots', 'popup-e2e');
fs.mkdirSync(outDir, { recursive: true });
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-popup-');
const extPath = path.join(__dirname, '..', 'extension');
// Branded Chrome 137+ ignores --load-extension; use CDP Extensions.loadUnpacked
// over --remote-debugging-pipe (fd 3 in / fd 4 out, \0-terminated JSON).
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader',
  '--enable-unsafe-extension-debugging', '--remote-debugging-pipe',
  '--window-size=1280,900', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

// —— minimal pipe client for Extensions.loadUnpacked ——
let pipeBuf = '';
const pipePending = new Map();
let pipeSeq = 0;
chrome.stdio[4].on('data', (chunk) => {
  pipeBuf += chunk.toString('utf8');
  let idx;
  while ((idx = pipeBuf.indexOf('\0')) !== -1) {
    const msg = pipeBuf.slice(0, idx);
    pipeBuf = pipeBuf.slice(idx + 1);
    try {
      const g = JSON.parse(msg);
      if (g.id && pipePending.has(g.id)) { pipePending.get(g.id)(g); pipePending.delete(g.id); }
    } catch (e) { /* ignore */ }
  }
});
function pipeSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++pipeSeq;
    pipePending.set(i, resolve);
    chrome.stdio[3].write(JSON.stringify({ id: i, method, params }) + '\0');
    setTimeout(() => { if (pipePending.has(i)) { pipePending.delete(i); reject(new Error('pipe timeout: ' + method)); } }, 15000);
  });
}

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }

  // load our extension via the pipe (branded Chrome 137+ ignores --load-extension)
  const loaded = await pipeSend('Extensions.loadUnpacked', { path: extPath });
  const extId = loaded.result && loaded.result.id;
  console.log('Extensions.loadUnpacked:', JSON.stringify(loaded.result || loaded.error || loaded));
  if (!extId) { console.error('FAIL: loadUnpacked failed'); process.exit(1); }

  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const contexts = [];
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
    if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); return; }
    if (g.method === 'Runtime.executionContextCreated') contexts.push(g.params.context);
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalIn = async (expression, ctxId, awaitPromise = false) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, ...(ctxId ? { contextId: ctxId } : {}) })).result?.result?.value;

  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  // 1. real content page
  await send('Page.navigate', { url: 'https://www.bbc.com/news' });
  await sleep(13000);
  const isoCtx = contexts.find((c) => c.auxData && c.auxData.type === 'isolated');
  console.log('isolated contexts:', contexts.filter((c) => c.auxData && c.auxData.type === 'isolated').length, '/', contexts.length);
  if (isoCtx) {
    const r = await evalIn(`({ extId: (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || null, svi: (window.__svi && window.__svi.version) || null, host: location.host })`, isoCtx.id);
    console.log('content-script world:', JSON.stringify(r));
  }
  if (!extId) { console.error('FAIL: content-script isolated world not found'); process.exit(1); }
  console.log('our extension id:', extId);

  // 2. open popup.html as a BACKGROUND (inactive) tab — mirrors real usage
  // where the content page stays the active tab, so popup.js's
  // chrome.tabs.query({active:true,currentWindow:true}) resolves to the
  // content page and renders the full panel
  await send('Target.createTarget', { url: `chrome-extension://${extId}/popup.html`, background: true });
  await sleep(2500);
  const list2 = await get('/json/list');
  const popupTarget = list2.find((t) => (t.url || '').includes('popup.html') && (t.title || '').includes('智能反色'))
    || list2.filter((t) => (t.url || '').includes(extId)).pop();
  if (!popupTarget) { console.error('FAIL: popup tab not found'); process.exit(1); }
  console.log('popup tab:', JSON.stringify({ title: popupTarget.title, url: (popupTarget.url || '').slice(0, 60) }));
  const ws2 = new WebSocket(popupTarget.webSocketDebuggerUrl);
  let id2 = 0; const pend2 = new Map();
  ws2.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pend2.has(g.id)) { pend2.get(g.id)(g); pend2.delete(g.id); } };
  const send2 = (method, params = {}) => new Promise((res) => { const i = ++id2; pend2.set(i, res); ws2.send(JSON.stringify({ id: i, method, params })); });
  const eval2 = async (expression, awaitPromise = false) =>
    (await send2('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.result?.value;
  await sleep(300); await send2('Runtime.enable'); await send2('Page.enable');
  const dbg = await eval2(`({ title: document.title, href: location.href.slice(0, 60), ready: document.readyState, bodyClass: document.body ? document.body.className : null })`);
  console.log('popup debug:', JSON.stringify(dbg));

  // popup self-state: active tab is the popup itself → unavailable branch expected
  const selfState = await eval2(`(() => ({ bodyClass: document.body.className, host: document.getElementById('host').textContent, ver: document.getElementById('ver').textContent }))()`);
  console.log('popup self view:', JSON.stringify(selfState));

  // 3. drive the real protocol from popup context toward the BBC tab
  const e2e = await eval2(`(async () => {
    // no "tabs" permission → no tab.url; the active tab IS the content page
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); const ct = tabs[0] ? { id: tabs[0].id } : null;
    const contentTab = tabs[0];
    if (!contentTab) return { fail: 'no active tab' };
    const send = (msg) => new Promise((res) => { try { chrome.tabs.sendMessage(contentTab.id, msg, (r) => { const err = chrome.runtime.lastError; res({ r: r || null, err: err ? err.message : null, tabId: contentTab.id }); }); } catch (e) { res({ r: null, err: 'THROW:' + String(e) }); } });
    const snap = await send({ type: 'svi-get-snapshot' });
    const off = await send({ type: 'svi-site-power', on: false });
    const snapOff = await send({ type: 'svi-get-snapshot' });
    const on = await send({ type: 'svi-site-power', on: true });
    const preset = await send({ type: 'svi-set-pref', key: 'presetId', value: 'amoled' });
    const hov = await send({ type: 'svi-set-pref', key: 'hoverRestore', value: false });
    const bad = await send({ type: 'svi-set-pref', key: 'nope', value: 1 });
    const first = snap && (snap.err || snap.r === null) ? snap : null; return { firstErr: first ? first.err : null, firstTabId: first ? first.tabId : null, host: snap && snap.r && snap.r.host, siteActive: snap && snap.r && snap.r.siteActive, version: snap && snap.r && snap.r.version,
      offOk: !!(off && off.r && off.r.ok), activeAfterOff: snapOff && snapOff.r && snapOff.r.siteActive, onOk: !!(on && on.r && on.r.ok),
      presetOk: !!(preset && preset.r && preset.r.ok), hoverOk: !!(hov && hov.r && hov.r.ok), badRejected: !!(bad && bad.r && bad.r.ok === false) };
  })()`, true);
  console.log('popup e2e protocol:', JSON.stringify(e2e));

  // 4. popup UI screenshot at a phone-ish size
  await send2('Emulation.setDeviceMetricsOverride', { width: 320, height: 560, deviceScaleFactor: 1, mobile: true });
  await sleep(600);
  const shot = await send2('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'popup-320.png'), Buffer.from(shot.result.data, 'base64'));

  // 5. BBC page after popup commands (amoled preset + hover off + site re-powered)
  await send('Page.bringToFront', {});
  await sleep(1500);
  const after = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'bbc-after-popup-commands.png'), Buffer.from(after.result.data, 'base64'));

  console.log('shots:', outDir);
  ws.close(); ws2.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
