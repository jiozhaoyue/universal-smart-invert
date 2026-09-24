// v4.6 追加: 弱网首屏延迟分解探针 (非侵入式, 不改动真源)
// 目的: 回答「169ms 插件可归因延迟到底花在哪」—— 为「再优化」提供数据依据。
//
// 手法: 在 addScriptToEvaluateOnNewDocument 阶段注入第二个**观测脚本** (先于用户脚本注入,
//   或后于亦可 —— 它只装 MutationObserver 与 performance 打点, 不碰任何引擎内部状态)。
//   通过观测插件写下的 data-svi-checked-src 属性首次出现在图片上的时刻,
//   反推插件首个决策的精确时间戳, 并与导航里程碑对比:
//
//   navigationStart
//     └─ responseEnd         (HTML 到达; 含注入的 RTT)
//          └─ bodyCreated     (whenBodyReady 的起跑线)
//               └─ firstDecision  (插件首个决策落点)
//
// 关键指标: firstDecision - bodyCreated = **插件可归因延迟**(纯插件开销)
//           firstDecision - responseEnd  = 插件端到端(含 body 等待)
//
// 用法: node dev/probe-latency-breakdown.js [--fast]
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PID = process.pid;
let CDP_PORT = 23000 + (PID % 2000);
let HTTP_PORT = 25000 + (PID % 2000);
const OUT_DIR = path.join(__dirname, 'shots', `latency-pid${PID}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const FAST = process.argv.includes('--fast');
// 与 probe-weaknet 保持一致: 300kbps / 400ms RTT
const THROTTLE = { offline: false, latency: 400, downloadThroughput: 300 * 1024 / 8, uploadThroughput: 300 * 1024 / 8 };
const NO_LIMIT = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

const DELAYS = [0, 1, 2, 5, 10, 15];
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>latency breakdown</title></head>
<body style="background:#fff">
<div style="width:900px">
  ${DELAYS.map((d, i) => `<p>img delay=${d}s</p><img id="i${d}" width="${600 - i * 7}" height="${300 - i * 5}" src="/img${d}.png" alt="d${d}">`).join('')}
</div></body></html>`;

function buildWhitePng(w, h) {
  const zlib = require('zlib');
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.alloc(1 + w * 4);
  for (let x = 0; x < w; x++) { row[1 + x * 4] = 255; row[2 + x * 4] = 255; row[3 + x * 4] = 255; row[4 + x * 4] = 255; }
  const lines = [];
  for (let y = 0; y < h; y++) lines.push(row);
  const idat = zlib.deflateSync(Buffer.concat(lines));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG_WHITE = buildWhitePng(8, 8);

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const m = /^\/img(\d+)\.png$/.exec(req.url || '');
      if (m) {
        const delay = Number(m[1]) * 1000;
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG_WHITE.length });
          res.end(PNG_WHITE);
        }, delay);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    });
    srv.on('error', () => { HTTP_PORT += 1; srv.listen(HTTP_PORT, '127.0.0.1'); });
    srv.listen(HTTP_PORT, '127.0.0.1', () => resolve(srv));
  });
}

function httpGetJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 观测脚本: 只读打点, 绝不触碰插件内部状态 ——
// 记录: 脚本起跑点 / body 出现点 / 每张图首次出现 data-svi-checked-src 的时刻 + 导航里程碑
const OBSERVER_SRC = `
(() => {
  const marks = { scriptStart: performance.now(), bodyAt: null, engineAt: null, firstDecision: {}, decisions: [] };
  window.__svi_lat = marks;
  const imgs = () => Array.from(document.querySelectorAll('img[id^="i"]'));
  // body 出现打点 (轮询 1ms 精度, 仅观测)
  // 注意: body 出现在 boot 之前且主线程尚空闲, 故该点可信。
  const bodyWatch = setInterval(() => {
    if (document.body) { marks.bodyAt = performance.now(); clearInterval(bodyWatch); }
  }, 1);
  // 引擎就绪打点 (仅观测) —— 仅作**上界**参考:
  // setInterval 在主线程被 boot 同步占满时会被推迟, 因此该值可能明显晚于真实就绪时刻,
  // 不可作为"boot 耗时"结论使用 (曾观测到 engineAt 晚于 firstDecision 的非物理结果)。
  // 判定"插件可归因延迟"一律以 bodyAt → firstDecision (事件驱动打点) 为准。
  const engineWatch = setInterval(() => {
    if (window.__svi_image_engine) { marks.engineAt = performance.now(); clearInterval(engineWatch); }
  }, 1);
  // 观测插件写下的 data-svi-checked-src
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'attributes') continue;
      if (m.attributeName !== 'data-svi-checked-src') continue;
      const el = m.target;
      if (!el || !el.id) continue;
      if (marks.firstDecision[el.id] == null) {
        marks.firstDecision[el.id] = performance.now();
        marks.decisions.push({ id: el.id, at: performance.now(), verdict: el.getAttribute('data-svi-inverted') === 'true' ? 'invert' : 'keep' });
      }
    }
  });
  const attach = () => {
    mo.observe(document.documentElement || document, { attributes: true, subtree: true, attributeFilter: ['data-svi-checked-src'] });
  };
  if (document.documentElement) attach(); else document.addEventListener('readystatechange', attach, { once: true });
  // 导航里程碑
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      marks.nav = { startTime: nav.startTime, responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, domComplete: nav.domComplete };
    }
  } catch (e) { /* ignore */ }
})();
`;

(async () => {
  await startServer();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `svi-lat-${PID}-`));
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  let tries = 0;
  while (!targets && tries < 120) {
    try { targets = await httpGetJson(CDP_PORT, '/json/list'); } catch (e) {
      tries++;
      if (tries % 30 === 0) CDP_PORT += 1;
    }
    if (!targets) await sleep(250);
  }
  if (!targets) { console.error(JSON.stringify({ ok: false, why: 'CDP unreachable' })); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await sleep(400);

  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();

  await send('Page.enable');
  await send('Network.enable');
  // 观测脚本先注入 (它只装 observer/打点, 不干预插件)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SRC });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await send('Network.emulateNetworkConditions', FAST ? NO_LIMIT : THROTTLE);

  const url = `http://127.0.0.1:${HTTP_PORT}/`;
  await send('Page.navigate', { url });
  // 等全部 6 张图落判 (最长 15s 图 + 余量)
  await sleep(18000);

  const r = await send('Runtime.evaluate', { expression: 'window.__svi_lat', returnByValue: true });
  const lat = (r.result && r.result.result && r.result.result.value) || null;

  const out = { mode: FAST ? 'fast' : 'throttle', url, pid: PID, throttled: FAST ? null : THROTTLE, lat };
  if (lat && lat.nav) {
    const base = lat.scriptStart;
    out.breakdown = {
      responseEnd_minus_scriptStart: Math.round(lat.nav.responseEnd - base),
      bodyAt_minus_scriptStart: lat.bodyAt != null ? Math.round(lat.bodyAt - base) : null,
      engineAt_minus_scriptStart: lat.engineAt != null ? Math.round(lat.engineAt - base) : null,
      domContentLoaded_minus_scriptStart: Math.round(lat.nav.domContentLoaded - base),
    };
    // 两段拆解: body 前的导航/解析等待 vs body 后到引擎就绪的 boot 开销
    if (lat.bodyAt != null && lat.engineAt != null) {
      out.split = {
        waitForBodyMs: Math.round(lat.bodyAt - base),
        bootToEngineMs: Math.round(lat.engineAt - lat.bodyAt),
      };
    }
    out.perImage = {};
    for (const d of DELAYS) {
      const at = lat.firstDecision['i' + d];
      out.perImage['i' + d] = at != null ? {
        relMs: Math.round(at - base),
        pluginAttributableMs: lat.bodyAt != null ? Math.round(at - lat.bodyAt) : null,
        afterEngineMs: lat.engineAt != null ? Math.round(at - lat.engineAt) : null,
      } : { relMs: null, note: 'no decision observed' };
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, `latency-${out.mode}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, mode: out.mode, outDir: OUT_DIR, breakdown: out.breakdown, split: out.split, perImage: out.perImage }, null, 2));

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED', e); process.exit(1); });
