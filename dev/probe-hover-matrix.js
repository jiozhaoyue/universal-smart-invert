// v4.6-3 复现探针: 「关闭悬停显示原图后仍还原原色」四通道 × 开关两态矩阵。
// 复用基建: test-browser.js 的 SEED_SNIPPET / executableScript 内联注入 / CANVAS_VIDEO_SNIPPET;
//          dev/probe-hover-real.js 的 CDP 启动骨架。零第三方依赖。
// 通道: 1) CSS filter 图 (data-svi-inverted)  2) fx 投递图 (data-svi-fx, imgFxMode=luma)
//       3) 背景图元素 (data-svi-bginv)        4) 视频 (胶囊手动反色 → 悬停观察)
// 附加判别: H1 悬停类残留 (悬停中经真实面板行切换) / H3 刷新持久化 (真实行切换后 reload)。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const net = require('net');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9343; // 避开 bench(9222) 与 probe-hover-real(9243) 及其它并行代理
const HTTP_PORT = 8877;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-hovermatrix-');

const userscriptCode = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8');
const SCRIPT_VERSION = (/@version\s+([\d.]+)/.exec(userscriptCode) || [])[1] || 'unknown';
const executableScript = userscriptCode
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
  .trim();

// —— 与 test-browser.js 相同的种子函数 (双写 svi:prefs 与 legacy v4 键) ——
const SEED_SNIPPET = `
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

// —— 与 test-browser.js 相同的 headless 视频生成器 ——
const CANVAS_VIDEO_SNIPPET = `
  (function () {
    var cv = document.createElement('canvas');
    cv.width = 640; cv.height = 360;
    var ctx = cv.getContext('2d');
    var phase = 0;
    setInterval(function () {
      phase++;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 360);
      ctx.fillStyle = '#1e50c8'; ctx.fillRect(320, 0, 320, 360);
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect((phase * 7) % 640, 0, 30, 360);
    }, 50);
    var stream = cv.captureStream(30);
    var v = document.getElementById('m-video');
    if (v) { v.srcObject = stream; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  })();
`;

const SVG_WHITE = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ffffff"/><line x1="20" y1="280" x2="380" y2="20" stroke="#111111" stroke-width="8"/><rect x="40" y="40" width="120" height="80" fill="none" stroke="#333333" stroke-width="6"/></svg>`;

// seed=0 时不写种子 (H3 持久化腿需要: 真实行切换后的值不被重播种子覆盖)
const FIXTURE_BODY = (execScript) => `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Hover Matrix Probe</title>
<script>
  ${SEED_SNIPPET};
  (function () {
    var q = new URLSearchParams(location.search);
    if (q.get('seed') === '0') return;
    sviSeed({
      hoverRestore: q.get('restore') !== '0',
      imagePolicy: 'balanced',
      imgFxMode: q.get('fx') || 'full'
    });
  })();
<\/script>
<style>
  body { background: #121212; }
  img { display:block; width:200px; height:150px; margin:16px; }
  #m-bg { width:200px; height:150px; margin:16px; }
  #m-video { display:block; width:320px; height:180px; margin:16px; }
</style>
</head><body>
  <img id="m-css" src="/img/white-diagram.svg" alt="css channel">
  <img id="m-fx" src="/img/white-diagram.svg?v=fx" alt="fx channel">
  <div id="m-bg" style="background-image: url('/img/white-diagram.svg'); background-size: cover;"></div>
  <video id="m-video" muted playsinline></video>
  <script>${CANVAS_VIDEO_SNIPPET}<\/script>
  <script>
    ${execScript}
  <\/script>
</body></html>`;

const FIXTURE_HTML = FIXTURE_BODY(executableScript);
// 旧版对照 (H4): 由 git show 提取的历史版本源码, 同一 fixture 验证用户症状
let OLD_HTML = null;
{
  const { execSync } = require('child_process');
  try {
    const oldSrc = execSync('git show 8c1ee9f~1:universal-smart-invert.user.js', { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const oldScript = oldSrc.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
    OLD_HTML = FIXTURE_BODY(oldScript);
    console.log('[Probe] old-version leg enabled (8c1ee9f~1)');
  } catch (e) {
    console.log('[Probe] old-version extraction failed, skipping: ' + e.message);
  }
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
function freePort(start) {
  return new Promise((resolve) => {
    const tryNext = (p) => {
      const srv = net.createServer();
      srv.once('error', () => tryNext(p + 1));
      srv.once('listening', () => srv.close(() => resolve(p)));
      srv.listen(p, '127.0.0.1');
    };
    tryNext(start);
  });
}

async function main() {
  const OLD_ONLY = process.argv.includes('--old-only');
  const port = await freePort(HTTP_PORT);
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/hover-matrix.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(FIXTURE_HTML);
      return;
    }
    if (url === '/old-hover-matrix.html' && OLD_HTML) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(OLD_HTML);
      return;
    }
    if (url === '/img/white-diagram.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(SVG_WHITE);
      return;
    }
    res.writeHead(404); res.end('Not Found');
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  console.log(`[Probe] fixture at http://127.0.0.1:${port}/hover-matrix.html`);

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  if (!targets) throw new Error('CDP 未就绪');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onerror = (e) => console.error('[Probe] ws error:', e.message || e);
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  const FIX = `http://127.0.0.1:${port}/hover-matrix.html`;
  const report = { scriptVersion: SCRIPT_VERSION, matrix: [], extras: {} };

  // 采集一个元素的完整通道状态
  const collect = `(() => {
    const pick = (el) => el ? {
      inverted: el.getAttribute('data-svi-inverted'),
      fx: el.getAttribute('data-svi-fx'),
      bginv: el.getAttribute('data-svi-bginv'),
      classList: Array.from(el.classList),
      filter: getComputedStyle(el).filter,
      content: getComputedStyle(el).content
    } : null;
    const out = {
      gateClass: document.documentElement.classList.contains('svi-hover-restore'),
      css: pick(document.getElementById('m-css')),
      fx: pick(document.getElementById('m-fx')),
      bg: pick(document.getElementById('m-bg')),
      video: (() => { const v = document.getElementById('m-video'); return v ? {
        filter: getComputedStyle(v).filter, inline: v.style.filter || '', playing: !v.paused
      } : null; })(),
      pref: (() => { try { return JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore; } catch (e) { return null; } })()
    };
    return out;
  })()`;

  const rectOf = (sel) => `JSON.stringify((function(){ const e = document.querySelector('${sel}'); const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })())`;
  const hoverEl = async (sel) => {
    const r = JSON.parse(await evalJs(rectOf(sel)));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(r.l + r.w / 2), y: Math.round(r.t + r.h / 2) });
    await sleep(350);
  };
  const unhover = async () => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 }); await sleep(200); };

  // ============ 矩阵: restore × fxMode ============
  if (!OLD_ONLY) {
    for (const restore of [0, 1]) {
      for (const fx of ['full', 'luma']) {
        const url = `${FIX}?restore=${restore}&fx=${fx}`;
        console.log(`[Probe] navigate restore=${restore} fx=${fx}`);
        await send('Page.navigate', { url });
        await sleep(6500); // bginv sweep 首扫在 +5s
        const before = await evalJs(collect);

        // 逐通道悬停
        const after = {};
        await hoverEl('#m-css'); after.css = await evalJs(collect); await unhover();
        await hoverEl('#m-fx'); after.fx = await evalJs(collect); await unhover();
        await hoverEl('#m-bg'); after.bg = await evalJs(collect); await unhover();
        report.matrix.push({ restore, fx, before, after });
        console.log(`  gate=${before.gateClass} css.inv=${before.css && before.css.inverted} fx.attr=${before.fx && before.fx.fx} bg.inv=${before.bg && before.bg.bginv}`);
      }
    }
  }

  // ============ 视频通道: 胶囊手动反色后悬停 (restore=1 与 0 各一次) ============
  if (!OLD_ONLY) {
    for (const restore of [1, 0]) {
    await send('Page.navigate', { url: `${FIX}?restore=${restore}&fx=full` });
    await sleep(5000);
    await evalJs(`(() => { const pill = document.querySelector('.svi-trigger-pill'); if (pill) pill.click(); const btns = document.querySelectorAll('.svi-action-btn'); if (btns[0]) btns[0].click(); return true; })()`);
    await sleep(1200);
    const vBefore = await evalJs(`(() => { const v = document.getElementById('m-video'); return { invertActive: (window.__svi && window.__svi.state) ? undefined : undefined, filter: getComputedStyle(v).filter, inline: v.style.filter || '' }; })()`);
    await hoverEl('#m-video');
    const vAfter = await evalJs(`(() => { const v = document.getElementById('m-video'); return { filter: getComputedStyle(v).filter, inline: v.style.filter || '' }; })()`);
    report.extras['video@restore=' + restore] = { vBefore, vAfter };
    console.log(`[Probe] video restore=${restore}: before=${vBefore.filter.slice(0,40)} hover=${vAfter.filter.slice(0,40)}`);
    await unhover();
  }

  // ============ H1: 悬停中经真实面板行关闭 (fx=luma, restore=1) ============
  {
    await send('Page.navigate', { url: `${FIX}?restore=1&fx=luma` });
    await sleep(6000);
    await evalJs(`(() => { window.__svi.ui.openSettingsModal(); return true; })()`);
    await sleep(300);
    // 1) 合成残留: 强行给 fx 图加 .svi-fx-hover, 再经真实行关闭 → 门类应熄灭, content 不应变回原图
    const h1a = await evalJs(`(() => {
      const img = document.getElementById('m-fx');
      img.classList.add('svi-fx-hover');
      const row = [...document.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes('悬停显示原图'));
      const cb = row.querySelector('input.svi-check');
      cb.click();
      return {
        cbChecked: cb.checked,
        gateClass: document.documentElement.classList.contains('svi-hover-restore'),
        elClass: Array.from(img.classList),
        content: getComputedStyle(img).content,
        pref: (() => { try { return JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore; } catch (e) { return null; } })()
      };
    })()`);
    console.log(`[Probe] H1a 残留+关闭: ${JSON.stringify(h1a)}`);
    // 关闭再刷新 (seed=0: 读持久值而非重播种子) → H3 持久化断言
    await send('Page.navigate', { url: `${FIX}?restore=1&fx=luma&seed=0` });
    await sleep(6000);
    const h3a = await evalJs(`(() => {
      const img = document.getElementById('m-fx');
      return {
        gateClass: document.documentElement.classList.contains('svi-hover-restore'),
        pref: (() => { try { return JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore; } catch (e) { return null; } })(),
        fx: img.getAttribute('data-svi-fx'),
        content: getComputedStyle(img).content
      };
    })()`);
    console.log(`[Probe] H3a 关闭后刷新(持久): ${JSON.stringify(h3a)}`);
    report.extras.H1_residue = h1a;
    report.extras.H3_off_reload = h3a;
    // 2) 经真实行重新开启 → 刷新 → 仍开 (双向持久化)
    await evalJs(`(() => { window.__svi.ui.openSettingsModal(); return true; })()`);
    await sleep(300);
    await evalJs(`(() => { const row = [...document.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes('悬停显示原图')); row.querySelector('input.svi-check').click(); return true; })()`);
    await sleep(300);
    await send('Page.navigate', { url: `${FIX}?restore=1&fx=luma&seed=0` });
    await sleep(6000);
    const h3b = await evalJs(`(() => {
      const img = document.getElementById('m-fx');
      return {
        gateClass: document.documentElement.classList.contains('svi-hover-restore'),
        pref: (() => { try { return JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore; } catch (e) { return null; } })(),
        content: getComputedStyle(img).content
      };
    })()`);
    // 开启态下悬停 fx 图 → 应还原原图 (防过度修复断言)
    await hoverEl('#m-fx');
    const h3bHover = await evalJs(`(() => { const img = document.getElementById('m-fx'); return { hoverClass: img.classList.contains('svi-fx-hover'), content: getComputedStyle(img).content }; })()`);
    await unhover();
    report.extras.H3_on_reload = h3b;
    report.extras.H3_on_hover = h3bHover;
    console.log(`[Probe] H3b 开启后刷新: ${JSON.stringify(h3b)} 悬停=${JSON.stringify(h3bHover)}`);
  }
  } // end if (!OLD_ONLY)

  // ============ H5: 门类写入点审计 (boot 后 html 类集合快照) ============
  if (!OLD_ONLY) report.extras.htmlClasses = await evalJs(`Array.from(document.documentElement.classList)`);

  // ============ H4 旧版对照: 同一 fixture 跑 v4.3.0 (8c1ee9f~1) 复现用户症状 ============
  if (OLD_HTML) {
    const OFIX = `http://127.0.0.1:${port}/old-hover-matrix.html`;
    // (1) 默认开 (restore=1 种子) → 开面板 → 复选框应显示未勾选 (回显缺陷) → 点击 → 写回 true
    await send('Page.navigate', { url: `${OFIX}?restore=1&fx=full&seed=1` });
    await sleep(6500);
    await evalJs(`(() => { window.__svi.ui.openSettingsModal(); return true; })()`);
    await sleep(300);
    const oldA = await evalJs(`(() => {
      const row = [...document.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes('悬停显示原图'));
      const cb = row.querySelector('input.svi-check');
      const shownBefore = cb.checked;
      cb.click();
      return { shownBefore, checkedAfterClick: cb.checked };
    })()`);
    await sleep(900); // savePrefs 防抖落盘
    const oldA2 = await evalJs(`(() => ({
      gateClass: document.documentElement.classList.contains('svi-hover-restore'),
      pref: (() => { try { return JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore; } catch (e) { return null; } })()
    }))()`);
    console.log(`[Probe] OLD 回显+首次点击: ${JSON.stringify(oldA)} 落盘后=${JSON.stringify(oldA2)}`);
    await evalJs(`(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`);
    await sleep(400);
    // (2) 点击后悬停 CSS 图 → 是否仍还原原图 (用户症状: 关不掉)
    await hoverEl('#m-css');
    const oldHover = await evalJs(`(() => ({ filter: getComputedStyle(document.getElementById('m-css')).filter, inverted: document.getElementById('m-css').getAttribute('data-svi-inverted') }))()`);
    await unhover();
    console.log(`[Probe] OLD 点击后悬停: ${JSON.stringify(oldHover)}`);
    // (3) 再点一次 (第二次点击才真正写 false) → 门类应熄灭
    await evalJs(`(() => { window.__svi.ui.openSettingsModal(); return true; })()`);
    await sleep(300);
    await evalJs(`(() => { const row = [...document.querySelectorAll('.svi-site-check-row, .svi-modal-row')].find(r => r.textContent.includes('悬停显示原图')); row.querySelector('input.svi-check').click(); return true; })()`);
    await sleep(900);
    const oldB = await evalJs(`(() => ({ gateClass: document.documentElement.classList.contains('svi-hover-restore'), pref: (() => { try { return JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore; } catch (e) { return null; } })() }))()`);
    await evalJs(`(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`);
    await sleep(400);
    await hoverEl('#m-css');
    const oldHover2 = await evalJs(`(() => ({ filter: getComputedStyle(document.getElementById('m-css')).filter }))()`);
    await unhover();
    console.log(`[Probe] OLD 第二次点击: ${JSON.stringify(oldB)} 悬停=${JSON.stringify(oldHover2)}`);
    report.extras.oldVersion = { version: '4.3.0 (8c1ee9f~1)', displayClick: oldA, persistedAfterClick: oldA2, hoverAfterClick: oldHover, secondClick: oldB, hoverAfterSecondClick: oldHover2 };
  }

  ws.close(); chrome.kill();
  server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}

  const outDir = path.join(__dirname, '..', '.trellis', 'tasks', '09-23-v46-3-hover-restore-off', 'research');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `repro-raw-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`[Probe] report → ${outFile}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
