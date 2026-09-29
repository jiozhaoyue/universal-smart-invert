// TEMP PROBE (research-only; not a product script). Boots the current userscript on a local
// fixture, opens the settings modal + the floating capsule panel, and measures/screenshots the six
// reported UI defects. Usage: node <this file> [--width 480] [--height 940]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9411 + (process.pid % 300);

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) || d : d; };
const WIDTH = num('--width', 480);
const HEIGHT = num('--height', 940);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-defect-'));
const probePage = path.join(userDataDir, 'probe.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"><title>svi defect probe</title></head>'
  + '<body style="background:#f5f5f5;font:14px system-ui"><h1>缺陷复现夹具</h1>'
  + '<p>用于把用户脚本跑起来, 内容无关紧要。</p></body></html>');

const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', '--enable-unsafe-swiftshader',
  `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank',
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
  for (let i = 0; i < 40; i++) {
    try { targets = await get('/json/list'); if (targets) break; } catch (e) { /* retry */ }
    await sleep(300);
  }
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
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);

  const src = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await evalJson(src);
  await sleep(1600);

  const boot = await evalJson('(() => ({ svi: !!(window.__svi && window.__svi.ui), ver: window.__svi && window.__svi.version }))()');
  console.error('boot=', JSON.stringify(boot));
  if (!boot.svi) { console.error('userscript did not boot'); process.exit(1); }

  const out = { version: boot.ver, width: WIDTH, height: HEIGHT, results: {} };

  // ---------- DEFECT 4: capsule pill + panel card, no close control ----------
  await evalJson(`(() => { const ui = window.__svi.ui; ui.togglePanel(); return true; })()`);
  await sleep(500);
  out.results.capsule = await evalJson(`(() => {
    const root = document.querySelector('.svi-capsule-root');
    const pill = document.querySelector('.svi-trigger-pill');
    const card = document.querySelector('.svi-panel-card');
    const q = (el, s) => el ? [...el.querySelectorAll(s)].map(b => (b.textContent||'').trim()) : [];
    const cardBtns = card ? [...card.querySelectorAll('button')].map(b => (b.className||'')+' :: '+((b.textContent||'').trim()||'(no-text)')) : [];
    return {
      rootExists: !!root,
      pillTag: pill ? pill.tagName : null,
      pillIsButton: pill ? pill.tagName === 'BUTTON' : null,
      cardShown: card ? card.classList.contains('show') : null,
      cardButtons: cardBtns,
      // any element inside the card whose title/aria/text mentions 关闭/close/x ?
      closeCandidates: card ? [...card.querySelectorAll('[title],[aria-label],button')].filter(el => /close|关闭|收起|×|✕/i.test((el.getAttribute('title')||'')+(el.getAttribute('aria-label')||'')+(el.textContent||''))).map(el=>el.className||el.tagName) : [],
      offBadgeDisplay: getComputedStyle(document.querySelector('.svi-off-badge')).display,
    };
  })()`);
  out.results.capsuleShot = await shot('defect4-capsule-panel-open');
  await evalJson('window.__svi.ui.togglePanel()');
  await sleep(300);
  out.results.capsuleClosed = await shot('defect4-capsule-pill-closed');

  // ---------- open the settings modal ----------
  await evalJson('window.__svi.ui.openSettingsModal()');
  await sleep(600);

  // ---------- DEFECT 2: button borders (computed styles) ----------
  out.results.buttonBorders = await evalJson(`(() => {
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null;
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { sel, borderTop: cs.borderTopWidth+' '+cs.borderTopStyle+' '+cs.borderTopColor,
               borderRight: cs.borderRightWidth, borderBottom: cs.borderBottomWidth, borderLeft: cs.borderLeftWidth,
               borderColor: cs.borderTopColor, bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) }; };
    return { action: pick('.svi-action-btn'), preset: pick('.svi-preset-btn'),
             openModal: pick('.svi-open-modal-btn'), pip: pick('.svi-pip-btn'),
             tab: pick('.svi4-tab'), close: pick('.svi-modal-close'), done: pick('.svi-btn-done'),
             reset: pick('.svi-btn-reset'), chip: pick('.svi-chip'), miniBtn: pick('.svi-mini-btn'),
             nativeColorCount: document.querySelectorAll('input[type=color]').length,
             borderToken: getComputedStyle(document.querySelector('.svi-modal-window')).getPropertyValue('--svi-border-w') };
  })()`);
  out.results.modalShot = await shot('defect1-2-modal-site-tab');

  // ---------- DEFECT 5: the native color input overlay ----------
  // (a) geometry of EVERY native color input relative to the viewport
  out.results.colorInputs = await evalJson(`(() => {
    const vw = innerWidth, vh = innerHeight;
    return [...document.querySelectorAll('input[type=color]')].map((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      const parent = el.parentElement;
      const cs2 = getComputedStyle(parent);
      // walk up to the first positioned ancestor
      let cb = parent, cbCls = null;
      while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
      cbCls = cb ? (cb.className || cb.tagName) : '(none)';
      return {
        cls: el.className, parentCls: parent ? parent.className : null, parentPos: cs2.position,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        coversViewport: r.width >= vw - 2 && r.height >= vh - 2,
        opacity: cs.opacity, position: cs.position, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents,
        containingBlock: cbCls,
        appxSection: el.closest('.svi-modal-section') ? (el.closest('.svi-modal-section').querySelector('.svi-sec-title')||{}).textContent : null,
      };
    });
  })()`);
  // (b) what element is on top at various probe points (would a click reach the mask/close?)
  out.results.hitTest = await evalJson(`(() => {
    const at = (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return null;
      return { tag: el.tagName, cls: el.className || '', isNativeColor: el.tagName==='INPUT' && el.type==='color',
               insideModal: !!el.closest('.svi-modal-window'), isMask: el.classList.contains('svi-modal-mask') }; };
    const cb = document.querySelector('.svi-modal-close');
    const cr = cb ? cb.getBoundingClientRect() : null;
    const win = document.querySelector('.svi-modal-window'); const wr = win.getBoundingClientRect();
    return {
      centerViewport: at(innerWidth/2, innerHeight/2),
      topLeftViewport: at(12, 12),
      bottomLeftViewport: at(12, innerHeight-12),
      onCloseButton: cr ? at(cr.x + cr.width/2, cr.y + cr.height/2) : null,
      justOutsideWindow: { x: Math.round(wr.x) - 20, y: Math.round(wr.y + wr.height/2), hit: at(Math.max(4, wr.x-20), wr.y + wr.height/2) },
    };
  })()`);
  out.results.modalFullShot = await shot('defect5-modal-colorinput-overlay');

  // (c) behavioural: simulate a click on "outside" (mask area) and see whether the modal closes
  out.results.clickOutsideTest = await evalJson(`(() => {
    const mask = document.querySelector('.svi-modal-mask');
    const before = mask.classList.contains('show');
    const el = document.elementFromPoint(12, innerHeight - 12);
    // dispatch a real bubbling click at that point (what a user's click would hit)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const after = mask.classList.contains('show');
    return { before, hitElement: el.tagName + '.' + (el.className||''), after, closedByOutsideClick: before && !after };
  })()`);
  await sleep(200);
  out.results.afterOutsideClickShot = await shot('defect5-after-outside-click');

  // (d) click the close button itself and see whether it closes
  out.results.clickCloseTest = await evalJson(`(() => {
    const mask = document.querySelector('.svi-modal-mask');
    const before = mask.classList.contains('show');
    const cb = document.querySelector('.svi-modal-close'); const r = cb.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const after = mask.classList.contains('show');
    return { before, hitElement: el.tagName + '.' + (el.className||''), after, closedByCloseBtn: before && !after };
  })()`);

  fs.writeFileSync(path.join(__dirname, 'probe-ui-defects.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) {} try { chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('probe failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
