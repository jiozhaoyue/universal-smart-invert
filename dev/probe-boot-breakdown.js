// v4.6 追加: boot 引擎构造耗时分解 (插桩副本, 真源零改动)
//
// 目的: 精确回答「图像引擎排在视频引擎之后构造, 让首屏图片判定慢了多少」——
//   即「把图像引擎提到 boot 最前」这一优化能省下多少毫秒。
//
// 手法: 读取真源文本 → 在**内存中**对每个 `new XxxEngine()` 语句外包一层计时标记
//   (写入 window.__boot.marks, 用 performance.now()) → 注入插桩副本。
//   真源文件不被写入、不被修改; 插桩只影响本次探针的浏览器实例。
//
// 为什么不用轮询: boot 的同步块会推迟 setInterval, 导致所有引擎显示同一时刻
//   (实测全部 148ms, 且晚于 76ms 的首个决策) —— 轮询在此场景不可用。
//   本探针的标记在**语句内部**同步写入, 不受调度推迟影响, 因此可信。
//
// 用法: node dev/probe-boot-breakdown.js
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PID = process.pid;
let CDP_PORT = 31000 + (PID % 2000);
let HTTP_PORT = 33000 + (PID % 2000);
const OUT_DIR = path.join(__dirname, 'shots', `bootbreak-pid${PID}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const THROTTLE = { offline: false, latency: 400, downloadThroughput: 300 * 1024 / 8, uploadThroughput: 300 * 1024 / 8 };

const DELAYS = [0, 1, 2, 5, 10, 15];
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>boot breakdown</title></head>
<body style="background:#fff">
<div style="width:900px">
  ${DELAYS.map((d, i) => `<img id="i${d}" width="${600 - i * 7}" height="${300 - i * 5}" src="/img${d}.png" alt="d${d}">`).join('')}
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

// —— 插桩: 在 boot 里已知的 9 行引擎赋值语句**之后**插入累计时间戳 ——
// 仅在**副本**上做; 真源不落盘、不改动。
//
// 为何用精确锚点而非正则: 早期版本用宽松正则 `= new X(...)` 全局替换, 误匹配 66 处
// 并破坏脚本 (firstDecision 变 null)。这 9 行字符串在源码中各出现一次且唯一,
// 用它们做锚点既精确又不改变任何语义 (只在语句之间插入一条观测语句)。
//
// 记录的是每个引擎**赋值完成**的累计时刻, 因此相邻差值 = 该引擎的构造耗时,
// 而 `image` 之前各引擎耗时之和 = 「把图像引擎提到最前」理论上能省的毫秒数。
const ENGINE_ANCHORS = [
  ['window.__svi.enginesBooted = true;', 'bootStart'],
  // bootEngines 的 whenBodyReady 回调入口 (锚在回调体首条注释上, 唯一)
  ['    // 补丁安装前已存在的开放 Shadow Root: 有界一次性收集 (先于引擎首扫)', 'callbackEnter'],
  // collectExisting 调用点: 前后各打一点, 用于把「等 body 的轮询延迟」与「收集本身耗时」分开
  ['try { ShadowDomRegistry.collectExisting(1000); } catch (e) { /* ignore */ }', 'collectEnd'],
  ['window.__svi.engines.video = probeManager;', 'video'],
  ['window.__svi.engines.detector = detector;', 'detector'],
  ['window.__svi.engines.videoFx = videoFxEngine;', 'videoFx'],
  ['window.__svi.engines.hil = stateMachine;', 'hil'],
  ['window.__svi.engines.image = imageEngine;', 'image'],
  ['window.__svi.engines.imageFx = imageFxEngine;', 'imageFx'],
  ['window.__svi.engines.bgImage = bgImageEngine;', 'bgImage'],
  ['window.__svi.engines.bgReplace = bgrEngine;', 'bgReplace'],
  ['window.__svi.engines.mediaCoverage = mediaCoverage;', 'mediaCoverage'],
];

// 每个锚点之后的插桩语句: 记录该点到达的绝对时刻 (相对脚本起跑点)
const MARK_STMT = (key) =>
  `\n      try { (window.__boot = window.__boot || { marks: [] }).marks.push({ k: '${key}', at: performance.now() }); } catch (e) {}`;

function instrument(src) {
  let out = src;
  let n = 0;
  const missing = [];
  for (const [anchor, key] of ENGINE_ANCHORS) {
    if (!out.includes(anchor)) { missing.push(key); continue; }
    if (key === 'collectEnd') {
      // 特殊: 调用点前置 + 后置各一点 —— 前置点即「回调真正开始执行」的时刻
      out = out.replace(anchor,
        `try { (window.__boot = window.__boot || { marks: [] }).marks.push({ k: 'collectStart', at: performance.now() }); } catch (e) {} ` +
        anchor +
        MARK_STMT(key));
    } else {
      out = out.replace(anchor, anchor + MARK_STMT(key));
    }
    n++;
  }
  return { code: out, count: n, missing };
}

(async () => {
  await startServer();

  const raw = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8');
  const stripped = raw.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  const inst = instrument(stripped);
  if (inst.missing.length) {
    console.error(JSON.stringify({ ok: false, why: 'anchors missing', missing: inst.missing }));
    process.exit(1);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `svi-boot-${PID}-`));
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

  const OBSERVER_SRC = `
(() => {
  const M = { start: performance.now(), bodyAt: null, firstDecision: null, imgFirstSeen: {}, engineAt: null };
  window.__lat2 = M;
  const bw = setInterval(() => { if (document.body) { M.bodyAt = performance.now(); clearInterval(bw); } }, 1);
  // 引擎可见时刻 (轮询; 仅上界参考)
  const ew = setInterval(() => { if (window.__svi_image_engine) { M.engineAt = performance.now(); clearInterval(ew); } }, 1);
  // 每张图首次出现在 DOM 的时刻 (事件驱动, 可信) —— 用于区分
  // 「引擎慢」与「DOM 里本来就没图, 引擎无从判起」
  const scanImgs = () => {
    for (const el of document.querySelectorAll('img[id^="i"]')) {
      if (M.imgFirstSeen[el.id] == null) M.imgFirstSeen[el.id] = performance.now();
    }
  };
  const mo2 = new MutationObserver(scanImgs);
  const at2 = () => { mo2.observe(document, { childList: true, subtree: true }); scanImgs(); };
  if (document.documentElement || document.body) at2(); else document.addEventListener('readystatechange', at2, { once: true });
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type !== 'attributes' || m.attributeName !== 'data-svi-checked-src') continue;
      if (M.firstDecision == null) { M.firstDecision = performance.now(); M.firstId = m.target && m.target.id; }
    }
  });
  const at = () => mo.observe(document, { attributes: true, subtree: true, attributeFilter: ['data-svi-checked-src'] });
  at();
})();
`;

  await send('Page.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SRC });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: inst.code });
  await send('Network.emulateNetworkConditions', THROTTLE);

  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  await sleep(8000);

  const r1 = await send('Runtime.evaluate', { expression: 'window.__boot', returnByValue: true });
  const boot = (r1.result && r1.result.result && r1.result.result.value) || null;
  const r2 = await send('Runtime.evaluate', { expression: 'window.__lat2', returnByValue: true });
  const lat = (r2.result && r2.result.result && r2.result.result.value) || null;

  const out = { ok: true, pid: PID, instrumentedSites: inst.count, missingAnchors: inst.missing, throttled: THROTTLE, boot, lat };
  if (boot && lat) {
    const b = lat.start;
    // marks 记录的是「该引擎赋值完成」的累计时刻 (ms, 相对脚本起跑点)
    const marks = (boot.marks || []).map((m) => ({ k: m.k, at: Math.round(m.at - b) }));
    // 相邻差值 = 该引擎自身构造耗时 (含其 init/首扫的同步部分)
    const deltas = marks.map((m, i) => ({ k: m.k, at: m.at, took: i === 0 ? m.at : m.at - marks[i - 1].at }));
    const imgIdx = marks.findIndex((m) => m.k === 'image');
    out.analysis = {
      bodyAt_ms: lat.bodyAt != null ? Math.round(lat.bodyAt - b) : null,
      engineVisibleAt_ms: lat.engineAt != null ? Math.round(lat.engineAt - b) : null,
      imgFirstSeen_ms: Object.fromEntries(Object.entries(lat.imgFirstSeen || {}).map(([k, v]) => [k, Math.round(v - b)])),
      firstDecision_ms: lat.firstDecision != null ? Math.round(lat.firstDecision - b) : null,
      firstDecisionId: lat.firstId || null,
      engineMarks: deltas,
      imageEngineAt_ms: imgIdx >= 0 ? marks[imgIdx].at : null,
      // 图像引擎之前构造的引擎累计耗时 = 「把它提到最前」理论上能省的毫秒数
      costBeforeImageEngine_ms: imgIdx > 0 ? marks[imgIdx].at - marks[0].at : 0,
      costBeforeImageEngine_list: imgIdx > 0 ? deltas.slice(0, imgIdx) : [],
    };
  }

  fs.writeFileSync(path.join(OUT_DIR, 'boot-breakdown.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.analysis || out, null, 2));

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED', e); process.exit(1); });
