// Focused dynamic repro: drives the REAL settings UI (no reload) to reproduce
// (A) Scenario 21 pure-black bucket regression, (B) hover-restore toggle-off not applying live.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9226;
const PORT = 8891;

const SEED = `
  (function () {
    window.sviSeed = function (overrides) {
      try {
        var base = {};
        try { base = JSON.parse(localStorage.getItem('svi:prefs') || localStorage.getItem('universal_smart_invert_v4') || '{}'); } catch (e) {}
        for (var k in overrides) { if (Object.prototype.hasOwnProperty.call(overrides, k)) base[k] = overrides[k]; }
        var prefsCopy = Object.assign({}, base);
        delete prefsCopy.manualOverrides;
        localStorage.setItem('universal_smart_invert_v4', JSON.stringify(base));
        localStorage.setItem('svi:prefs', JSON.stringify(prefsCopy));
      } catch (e) {}
    };
  })();
`;

const LOGIN_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>BGR Dynamic</title>
<script>${SEED}; sviSeed({ bgReplace: true });<\/script>
<style>
  body { margin: 0; padding: 24px; background: #fafafa; color: #111111; font-family: sans-serif; }
  #loginBox { background: #ffffff; border: 1px solid #e0e0e0; width: 320px; padding: 24px; margin-top: 20px; color: #111111; border-radius: 8px; }
  #loginBox input { display: block; width: 90%; margin: 8px 0; padding: 6px; }
</style></head><body>
  <h1>背景替换登录块基准页</h1><p id="para">正文区域: 浅色背景应替换为深色。</p>
  <div id="loginBox"><h2>用户登录</h2><input placeholder="账号"><input placeholder="密码" type="password"><button>登录</button></div>
</body></html>`;

// White diagram as a tiny inline SVG data URI (light image → should invert)
const DIAGRAM = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#ffffff"/><rect x="20" y="20" width="280" height="200" fill="none" stroke="#111111" stroke-width="4"/><circle cx="160" cy="120" r="60" fill="#eeeeee" stroke="#333333" stroke-width="3"/></svg>');
const HOVER_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Hover Dynamic</title>
<script>${SEED}; sviSeed({ hoverRestore: true, imagePolicy: 'balanced' });<\/script>
<style>body { background: #121212; margin:0; padding:40px; } img { display:block; width:320px; height:240px; }</style></head><body>
  <img id="hover-css" src="${DIAGRAM}" alt="css path">
</body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const html = url === '/login' ? LOGIN_HTML : url === '/hover' ? HOVER_HTML : null;
  if (html) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
  res.writeHead(404); res.end('nope');
});
server.listen(PORT, '127.0.0.1');

const userDataDir = fs.mkdtempSync(require('os').tmpdir() + '/svi-dyn-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--window-size=1280,900', 'about:blank',
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

  // ============ (A) Scenario 21 dynamic-theme tone cycle ============
  console.log('===== A: dynamic theme tone cycle (login page, bgReplace on) =====');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/login` });
  await sleep(4000);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(6000);
  console.log('baseline:', JSON.stringify(await evalJs(`(() => {
    const bgr = window.__svi.engines.bgReplace;
    const hil = window.__svi.engines.hil;
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
      bodyTag: document.body.getAttribute('data-svi-bgr-bg'),
      bucketCount: bgr ? bgr.bucketsBg.size : -1,
      bgrActive: bgr ? bgr.active : null,
      scanGen: bgr ? bgr.scanGen : null,
      mediaDominant: hil ? !!hil.mediaDominant : null,
      hidden: document.hidden,
      hasRIC: typeof window.requestIdleCallback === 'function',
      taggedCount: document.querySelectorAll('[data-svi-bgr-bg]').length,
    };
  })()`)));
  console.log('ric-in-page:', JSON.stringify(await evalJs(`new Promise(r => { const t0 = performance.now(); requestIdleCallback(() => r({ms: Math.round(performance.now()-t0)}), {timeout: 300}); setTimeout(() => r({ms: 'guard-4s'}), 4000); })`)));
  await sleep(6000);
  console.log('baseline+6s:', JSON.stringify(await evalJs(`(() => {
    const bgr = window.__svi.engines.bgReplace;
    return {
      bodyTag: document.body.getAttribute('data-svi-bgr-bg'),
      bucketCount: bgr ? bgr.bucketsBg.size : -1,
      taggedCount: document.querySelectorAll('[data-svi-bgr-bg]').length,
      styleLen: bgr && bgr.styleNode ? bgr.styleNode.textContent.length : null,
    };
  })()`)));
  const setSelect = (rowText, value) => `(() => {
    window.__svi.ui.openSettingsModal();
    const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局'); if (t) t.click();
    const row = [...document.querySelectorAll('#svi-sec-dynamic .svi-modal-row')].find(r => r.textContent.includes('${rowText}'));
    const sel = row.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, '${value}');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()`;
  for (const tone of ['dark-gray', 'warm-black', 'pure-black']) {
    console.log('set tone →', await evalJs(setSelect('色调', tone)));
    await sleep(1600);
    console.log('  ' + tone + ':', JSON.stringify(await evalJs(`(() => ({
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyTag: document.body.getAttribute('data-svi-bgr-bg'),
      bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
      bucketCount: window.__svi.engines.bgReplace ? window.__svi.engines.bgReplace.bucketsBg.size : -1,
      prefTone: (JSON.parse(localStorage.getItem('svi:prefs') || '{}').bgTone),
    }))()`)));
  }

  // ============ (B) hover-restore live toggle ============
  console.log('\n===== B: hover-restore live toggle (hover page) =====');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/hover` });
  await sleep(3000);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(5000);
  const hoverAt = async () => {
    const r = await evalJs(`JSON.stringify(document.getElementById('hover-css').getBoundingClientRect())`);
    const rc = JSON.parse(r);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(rc.left + rc.width / 2), y: Math.round(rc.top + rc.height / 2) });
    await sleep(300);
    return evalJs(`(() => { const i = document.getElementById('hover-css'); return {
      filter: getComputedStyle(i).filter.slice(0, 90),
      restoreClass: document.documentElement.classList.contains('svi-hover-restore'),
      inv: i.getAttribute('data-svi-inverted'),
    }; })()`);
  };
  console.log('ON-state hover:', JSON.stringify(await hoverAt()));
  // Toggle OFF via the REAL UI row (外观与画面 section)
  console.log('toggle inspect →', await evalJs(`(() => {
    window.__svi.ui.openSettingsModal();
    const rows = [...document.querySelectorAll('.svi-site-check-row')].filter(r => r.textContent.includes('悬停显示原图'));
    const masks = document.querySelectorAll('.svi-modal-mask').length;
    const shown = document.querySelectorAll('.svi-modal-mask.show').length;
    const row = rows[0];
    if (!row) return 'row not found';
    const cb = row.querySelector('input.svi-check');
    window.__spCalls = 0; const orig = window.__svi.savePrefs;
    window.__svi.savePrefs = function () { window.__spCalls++; return orig.apply(this, arguments); };
    return {
      matchCount: rows.length,
      masks, shown,
      connected: row.isConnected,
      sectionClass: row.parentElement ? row.parentElement.className : null,
      cbCheckedBefore: cb.checked,
      rowText: row.textContent.slice(0, 60),
    };
  })()`));
  console.log('direct change dispatch →', await evalJs(`(() => {
    const row = [...document.querySelectorAll('.svi-site-check-row')].filter(r => r.textContent.includes('悬停显示原图'))[0];
    const cb = row.querySelector('input.svi-check');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return { checked: cb.checked, state: window.__svi.prefs.hoverRestore, sp: window.__spCalls };
  })()`));
  await sleep(300);
  console.log('single real click from synced-ON →', await evalJs(`(() => {
    window.__svi.ui.openSettingsModal();
    const row = [...document.querySelectorAll('.svi-site-check-row')].filter(r => r.textContent.includes('悬停显示原图'))[0];
    const cb = row.querySelector('input.svi-check');
    const before = cb.checked;
    cb.click();
    return { before, after: cb.checked, state: window.__svi.prefs.hoverRestore,
      restoreClass: document.documentElement.classList.contains('svi-hover-restore') };
  })()`));
  // Close modal so the mouse can actually reach the image
  await evalJs(`(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`);
  await sleep(300);
  console.log('OFF-state hover (modal closed):', JSON.stringify(await hoverAt()));
  // Re-enable via UI once more (full cycle)
  console.log('re-enable click →', await evalJs(`(() => {
    window.__svi.ui.openSettingsModal();
    const row = [...document.querySelectorAll('.svi-site-check-row')].filter(r => r.textContent.includes('悬停显示原图'))[0];
    const cb = row.querySelector('input.svi-check');
    const before = cb.checked;
    cb.click();
    return { before, after: cb.checked, state: window.__svi.prefs.hoverRestore,
      restoreClass: document.documentElement.classList.contains('svi-hover-restore') };
  })()`));
  await evalJs(`(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`);
  await sleep(300);
  console.log('re-ON hover (modal closed):', JSON.stringify(await hoverAt()));
  // And with a fresh page-load of the same pref (persisted path)
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/hover` });
  await sleep(3000);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(5000);
  console.log('after reload:', JSON.stringify(await evalJs(`(() => ({
    restoreClass: document.documentElement.classList.contains('svi-hover-restore'),
    stateVal: window.__svi.prefs ? window.__svi.prefs.hoverRestore : 'n/a',
  }))()`)));
  console.log('reloaded OFF-state hover:', JSON.stringify(await hoverAt()));

  ws.close(); chrome.kill(); server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); server.close(); process.exit(1); });
