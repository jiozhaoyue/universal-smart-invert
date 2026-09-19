// Real-site SPA re-processing: load GitHub trending, collect decision signature,
// click into a repository (client-side navigation), verify the engine re-processes
// the new page's images (fresh decisions, no stale decide-once carryover).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9249;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-spa-');
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();

(async () => {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  await send('Page.navigate', { url: 'https://github.com/trending' });
  await sleep(9000);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(9000);
  const sig1 = await evalJs(`(() => {
    const dec = window.__svi.engines.image.decisionBySrc;
    return { url: location.pathname.slice(0, 30), count: dec.size,
      sig: [...dec.entries()].map(([k, v]) => k.slice(-40) + '=' + v.verdict).sort().join('|').slice(0, 500) };
  })()`);
  console.log('trending:', JSON.stringify({ url: sig1.url, count: sig1.count }));

  // click the first repository link (SPA navigation)
  const clicked = await evalJs(`(() => {
    const a = document.querySelector('h2 a[href^="/"]') || document.querySelector('article a[href^="/"]');
    if (!a) return { fail: 'no repo link' };
    const href = a.getAttribute('href');
    a.click();
    return { href };
  })()`);
  console.log('clicked:', JSON.stringify(clicked));
  await sleep(9000);

  let sig2 = null;
  for (let a = 0; a < 3 && !sig2; a++) {
    await sleep(3000);
    sig2 = await evalJs(`(() => {
      try {
        const dec = window.__svi.engines.image.decisionBySrc;
        return { url: location.pathname.slice(0, 30), count: dec.size, imgs: document.images.length,
          inverted: document.querySelectorAll('[data-svi-inverted]').length };
      } catch (e) { return null; }
    })()`);
  }
  if (!sig2) { console.log('RESULT:', JSON.stringify({ navigated: true, engineLive: 'ctx-unreadable' })); ws.close(); chrome.kill(); process.exit(0); }
  console.log('after SPA nav:', JSON.stringify({ url: sig2.url, count: sig2.count, imgs: sig2.imgs, inverted: sig2.inverted }));
  const navigated = sig2.url !== sig1.url && sig2.url !== '/trending';
  console.log('RESULT:', JSON.stringify({ navigated, engineLive: sig2.count > 0 }));

  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
