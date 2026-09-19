// Definitive bgr scan timeline: wrap engine instance methods, poll counters, measure rIC in-page.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9228;
const PORT = 8893;

const SEED = `<script>window.sviSeed=function(o){try{var b={};try{b=JSON.parse(localStorage.getItem('svi:prefs')||'{}')}catch(e){}for(var k in o)b[k]=o[k];var c=Object.assign({},b);delete c.manualOverrides;localStorage.setItem('universal_smart_invert_v4',JSON.stringify(b));localStorage.setItem('svi:prefs',JSON.stringify(c));}catch(e){}};sviSeed({bgReplace:true});<\/script>`;
const PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8">${SEED}<style>body{margin:0;padding:24px;background:#fafafa;color:#111;font-family:sans-serif}</style></head><body><h1>ric+bgr probe</h1><p id="para">正文</p><div id="box" style="background:#ffffff;border:1px solid #e0e0e0;width:320px;padding:24px">登录块</div></body></html>`;

const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); });
server.listen(PORT, '127.0.0.1');

const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-bgr-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank',
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
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(1200);

  // Wrap engine instance methods + rIC probe
  console.log('wrap →', JSON.stringify(await evalJs(`(() => {
    const bgr = window.__svi.engines.bgReplace;
    window.__log = [];
    const t = (name, fn) => function (...a) { window.__log.push([Date.now() % 100000, name, a[0] && a[0].tagName]); return fn.apply(this, a); };
    if (bgr) {
      bgr.tagElement = t('tagElement', bgr.tagElement);
      bgr.applyCss = t('applyCss', bgr.applyCss);
      bgr.startScan = t('startScan', bgr.startScan);
      bgr.rescan = t('rescan', bgr.rescan);
      bgr.isExcluded = t('isExcluded', bgr.isExcluded);
    }
    window.__ricT0 = performance.now();
    requestIdleCallback(() => { window.__ricFired = Math.round(performance.now() - window.__ricT0); }, { timeout: 1000 });
    setTimeout(() => { if (window.__ricFired == null) window.__ricFired = 'NOT-FIRED-3s'; }, 3000);
    return { boot: !!bgr, scanGen: bgr.scanGen, buckets: bgr.bucketsBg.size };
  })()`)));

  for (let s = 1; s <= 12; s++) {
    await sleep(1000);
    const st = await evalJs(`(() => {
      const bgr = window.__svi.engines.bgReplace;
      return {
        t: ${s},
        tags: document.querySelectorAll('[data-svi-bgr-bg]').length,
        buckets: bgr ? bgr.bucketsBg.size : -1,
        gen: bgr ? bgr.scanGen : -1,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        ric: window.__ricFired != null ? window.__ricFired : 'pending',
      };
    })()`);
    console.log(JSON.stringify(st));
    if (s === 6) console.log('log@6s:', JSON.stringify(await evalJs(`window.__log.slice(0, 30)`)));
  }
  console.log('log@12s:', JSON.stringify(await evalJs(`window.__log.slice(0, 60)`)));
  console.log('detail:', JSON.stringify(await evalJs(`(() => {
    const bgr = window.__svi.engines.bgReplace;
    const tagged = [...document.querySelectorAll('[data-svi-bgr-bg]')].map(e => e.tagName + '=' + e.getAttribute('data-svi-bgr-bg'));
    const css = bgr.styleNode ? bgr.styleNode.textContent : null;
    const ruleMatch = css ? css.split('}').filter(Boolean).map(r => ({ r: r.slice(0, 120), hits: (() => { try { return document.querySelectorAll(r.split('{')[0]).length; } catch (e) { return 'ERR'; } })() })) : null;
    return {
      tagged, cssLen: css ? css.length : 0, css: css ? css.slice(0, 260) : null,
      ruleMatch,
      bodyComputedBg: getComputedStyle(document.body).backgroundColor,
      bodyAttr: document.body.getAttribute('data-svi-bgr-bg'),
      bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
      styleConnected: bgr.styleNode ? bgr.styleNode.isConnected : null,
      styleParent: bgr.styleNode && bgr.styleNode.parentNode ? bgr.styleNode.parentNode.nodeName : null,
      buckets: [...bgr.bucketsBg.entries()],
    };
  })()`)));
  ws.close(); chrome.kill(); server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); server.close(); process.exit(1); });
