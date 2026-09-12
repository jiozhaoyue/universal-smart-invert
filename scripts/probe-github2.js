// Probe v2: scroll-through + per-image classification + pjax navigation test
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9224;
const TARGET = 'https://github.com/ZeroDeng01/sublinkPro/blob/main/README.zh-CN.md';
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-probe2-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  'about:blank',
], { stdio: 'ignore' });

const get = (p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}}); }).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') events.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') events.push('console: ' + msg.params.args.map(a=>a.value||a.description||'').join(' '));
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalP = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await sleep(500);
  await send('Runtime.enable'); await send('Page.enable');
  const src = fs.readFileSync(__dirname + '/../universal-smart-invert.user.js', 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await send('Page.navigate', { url: TARGET });
  await sleep(7000);

  // scroll through the whole page slowly to trigger IO + lazy loads
  await evalP(`(async () => {
    const step = Math.floor(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 350));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 1200));
  })()`);

  const dump = await evalP(`(() => {
    const imgs = [...document.querySelectorAll('.markdown-body img')];
    return {
      counts: { total: imgs.length, inv: imgs.filter(i=>i.getAttribute('data-svi-inverted')==='true').length, chk: imgs.filter(i=>i.hasAttribute('data-svi-checked-src')).length, fail: imgs.filter(i=>i.hasAttribute('data-svi-failed')).length },
      rows: imgs.map((i, n) => ({ n,
        src: (i.currentSrc||i.src||'').replace('https://','').slice(0,72),
        w: i.clientWidth, h: i.clientHeight, nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete,
        inv: i.getAttribute('data-svi-inverted'), chk: i.hasAttribute('data-svi-checked-src'), fail: i.hasAttribute('data-svi-failed'),
        loading: i.getAttribute('loading'), cls: (i.className||'').slice(0,26), alt: (i.alt||'').slice(0,26) })),
    };
  })()`);
  console.log('== markdown images after scroll ==');
  console.log(JSON.stringify(dump.counts));
  for (const r of dump.rows) console.log(JSON.stringify(r));

  // pjax test: navigate via GitHub's internal link (SPA) to the repo root
  const pjax = await evalP(`(async () => {
    const a = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/ZeroDeng01/sublinkPro');
    if (!a) return { clicked: false };
    a.click();
    await new Promise(r => setTimeout(r, 6000));
    const imgs2 = [...document.querySelectorAll('img')];
    return { clicked: true, url: location.pathname, pill: !!document.querySelector('.svi-capsule-root'), sviVersion: window.__svi && window.__svi.version, totalImgs: imgs2.length,
      inv: imgs2.filter(i=>i.getAttribute('data-svi-inverted')==='true').length, chk: imgs2.filter(i=>i.hasAttribute('data-svi-checked-src')).length };
  })()`);
  console.log('== after pjax nav to repo root ==');
  console.log(JSON.stringify(pjax));

  console.log('EXCEPTIONS:', JSON.stringify(events.slice(0,6), null, 1));
  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
