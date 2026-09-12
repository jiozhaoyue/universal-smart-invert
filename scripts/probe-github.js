// One-off CDP probe: diagnose script state on a live GitHub README page
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9223;
const TARGET = process.argv[2] || 'https://github.com/ZeroDeng01/sublinkPro/blob/main/README.zh-CN.md';

const userDataDir = fs.mkdtempSync(require('os').tmpdir() + '/svi-probe-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  'about:blank',
], { stdio: 'ignore' });

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function put(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path, method: 'PUT' }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
    });
    req.on('error', reject);
    req.end(body || '');
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // wait for CDP
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
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') events.push(msg);
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await sleep(500);
  await send('Runtime.enable');
  await send('Page.enable');
  const src = fs.readFileSync(__dirname + '/../universal-smart-invert.user.js', 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await send('Page.navigate', { url: TARGET });
  await sleep(9000); // let GitHub fully render README

  const expr = `(() => {
    const imgs = [...document.querySelectorAll('img')];
    const md = [...document.querySelectorAll('.markdown-body img')];
    return {
      url: location.href,
      title: document.title,
      svi: typeof window.__svi === 'object' && window.__svi ? { version: window.__svi.version, dormant: !!window.__svi.dormant } : null,
      sviVersion: window.__svi && window.__svi.version,
      dormant: window.__svi && window.__svi.dormant,
      owner: document.documentElement.dataset.sviOwner || null,
      totalImgs: imgs.length,
      mdImgs: md.length,
      inverted: imgs.filter(i => i.getAttribute('data-svi-inverted') === 'true').length,
      fx: imgs.filter(i => i.hasAttribute('data-svi-fx')).length,
      checked: imgs.filter(i => i.hasAttribute('data-svi-checked-src')).length,
      failed: imgs.filter(i => i.hasAttribute('data-svi-failed')).length,
      camo: imgs.filter(i => (i.currentSrc||i.src||'').includes('camo')).length,
      pill: !!document.querySelector('.svi-capsule-root'),
      mdSamples: md.slice(0, 5).map(i => ({ src: (i.currentSrc||i.src||'').slice(0,90), cls: i.className.slice(0,40), w: i.clientWidth, h: i.clientHeight, nw: i.naturalWidth, inv: i.getAttribute('data-svi-inverted'), chk: i.hasAttribute('data-svi-checked-src'), fail: i.hasAttribute('data-svi-failed') })),
      profile: (window.__svi && window.__svi.profile) ? JSON.parse(JSON.stringify(window.__svi.profile)).name || 'resolved' : null,
    };
  })()`;
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(res.result?.result?.value ?? res, null, 2));

  const errs = events.filter(e => e.method === 'Runtime.exceptionThrown').slice(0, 5)
    .map(e => e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text);
  const logs = events.filter(e => e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'error' || e.params.type === 'warning' || (e.params.args[0]||{}).value && String(e.params.args[0].value).includes('SmartInvert'))).slice(0, 10)
    .map(e => e.params.args.map(a => a.value || a.description || '').join(' '));
  console.log('PAGE EXCEPTIONS:', JSON.stringify(errs, null, 1));
  console.log('RELEVANT CONSOLE:', JSON.stringify(logs, null, 1));

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
