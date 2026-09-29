// TEMP PROBE #2 (research-only). Switches to the 全局 tab (where the color inputs live) and
// measures whether the invisible native <input type=color> covers the whole viewport and steals
// clicks. Uses a WIDE viewport so the centered modal leaves real mask area around it.
// Usage: node <this file> [--width 1100] [--height 900]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9711 + (process.pid % 300);
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) || d : d; };
const WIDTH = num('--width', 1100);
const HEIGHT = num('--height', 900);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect2-'));
const probePage = path.join(userDataDir, 'probe.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"><title>svi defect probe 2</title></head>'
  + '<body style="background:#f5f5f5;font:14px system-ui"><h1>缺陷复现夹具 2</h1></body></html>');

const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', '--enable-unsafe-swiftshader',
  `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
], { stdio: 'ignore' });

const get = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
    let b = ''; res.on('data', (c) => (b += c));
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on('error', reject);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  if (!targets) { console.error('CDP not reachable'); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(SHOTS, name + '.png');
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return { file: path.relative(ROOT, file), bytes: fs.statSync(file).size };
  };

  await sleep(400);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);
  const src = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==UserScript==/, '').trim();
  await evalJson(src); await sleep(1600);
  const boot = await evalJson('!!(window.__svi && window.__svi.ui)');
  if (!boot) { console.error('no boot'); process.exit(1); }

  const out = { width: WIDTH, height: HEIGHT, results: {} };
  await evalJson('window.__svi.ui.openSettingsModal()');
  await sleep(600);

  // helper: hit-test + geometry snapshot, evaluated fresh each time
  const snapshot = () => evalJson(`(() => {
    const at = (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return null;
      return el.tagName + (el.className ? '.' + el.className : '') + (el.tagName==='INPUT' ? '[type='+el.type+']' : ''); };
    const inputs = [...document.querySelectorAll('input[type=color]')].map((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      let cb = el.parentElement; while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
               fullViewport: r.width >= innerWidth - 2 && r.height >= innerHeight - 2,
               opacity: cs.opacity, containingBlock: cb ? cb.className : null,
               section: el.closest('.svi-modal-section') ? el.closest('.svi-modal-section').querySelector('.svi-sec-title').textContent : null };
    });
    const mask = document.querySelector('.svi-modal-mask');
    return {
      vp: [innerWidth, innerHeight], modalShown: mask.classList.contains('show'),
      inputs,
      hit: { topLeft: at(4,4), topRight: at(innerWidth-4,4), bottomLeft: at(4,innerHeight-4),
             outsideLeftMid: at(4, Math.round(innerHeight/2)), center: at(Math.round(innerWidth/2), Math.round(innerHeight/2)) },
    };
  })()`);

  out.results.siteTab = await snapshot();
  out.results.siteTabShot = await shot('defect5-a-site-tab');

  // switch to 全局 tab where 图片反色 (pickerRow) 与 原色屏蔽 (colorList) live
  await evalJson(`(() => { const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局'); if (t) t.click(); return !!t; })()`);
  await sleep(600);
  out.results.globalTab = await snapshot();
  out.results.globalTabShot = await shot('defect5-b-global-tab');

  // scroll the body so the 原色屏蔽 color input is in view, then re-measure
  await evalJson(`(() => { const sec = document.getElementById('svi-sec-shield'); if (sec) sec.scrollIntoView({block:'center'}); return !!sec; })()`);
  await sleep(500);
  out.results.shieldScrolled = await snapshot();
  out.results.shieldShot = await shot('defect5-c-shield-scrolled');

  // Behavioural: click the visible color swatch (preview box) -> does a click even reach it?
  out.results.clickOnSwatch = await evalJson(`(() => {
    const wrap = document.querySelector('#svi-sec-shield .svi-color-picker-row .svi-color-input-native');
    if (!wrap) return { found: false };
    const r = wrap.getBoundingClientRect();
    const cx = r.x + r.width/2, cy = r.y + r.height/2;
    const top = document.elementFromPoint(cx, cy);
    return { found: true, inputRect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
             topmostAtThatPoint: top ? top.tagName + '.' + (top.className||'') + (top.tagName==='INPUT'?'[type='+top.type+']':'') : null,
             topmostIsThisInput: top === wrap };
  })()`);

  // Behavioural: click a point in the MASK (left gutter, outside the window) -> should close (center layout)
  out.results.clickMaskGutter = await evalJson(`(() => {
    const mask = document.querySelector('.svi-modal-mask');
    const win = document.querySelector('.svi-modal-window'); const wr = win.getBoundingClientRect();
    const x = Math.max(3, Math.round(wr.x / 2)), y = Math.round(innerHeight/2);
    const el = document.elementFromPoint(x, y);
    const before = mask.classList.contains('show');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const after = mask.classList.contains('show');
    return { point: [x,y], hit: el.tagName + '.' + (el.className||''), hitIsMask: el === mask,
             before, after, closed: before && !after };
  })()`);

  fs.writeFileSync(path.join(__dirname, 'probe-ui-defects-2.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe2 failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
