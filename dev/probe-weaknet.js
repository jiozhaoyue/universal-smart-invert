// v4.6-1 弱网/离线判定时序探针 (本地优先判定子任务)
// 用途:
//   1) 复现: 限速/慢源下, 未解码图片长时间不判定 (决策空洞) —— bisect 证据
//   2) 验证: 修复后首屏可见媒体 ≤500ms 拿到本地决策 (档 B) —— R3
//   3) 三态一致性: 正常 / 限速 / 断网(缓存) 稳态决策集合对比 —— R4
// 教训落实: CDP 端口与输出目录一律按 PID 派生 (并行探针冲突是已知事故), 本地慢源自持, 不依赖外网。
// 用法:
//   node dev/probe-weaknet.js                 # 默认: 限速复现 (300kbps/400ms RTT)
//   node dev/probe-weaknet.js --offline       # 断网 + 缓存重载 (三态一致性用)
//   node dev/probe-weaknet.js --fast          # 正常网对照
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PID = process.pid;
// 端口按 PID 派生: 19000 + pid%2000 (CDP), 21000 + pid%2000 (本地慢源), 冲突时 +1 重试
let CDP_PORT = 19000 + (PID % 2000);
let HTTP_PORT = 21000 + (PID % 2000);
const OUT_DIR = path.join(__dirname, 'shots', `weaknet-pid${PID}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const MODE = process.argv.includes('--offline') ? 'offline' : (process.argv.includes('--fast') ? 'fast' : 'throttle');
// 限速档: 300kbps 下行 / 400ms RTT (CDP Network.emulateNetworkConditions 语义)
const THROTTLE = { offline: false, latency: 400, downloadThroughput: 300 * 1024 / 8, uploadThroughput: 300 * 1024 / 8 };
const OFFLINE = { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 };

// —— 首屏测试页: 6 张可见图片, 服务端人为延迟 0/1/2/5/10/15s; 尺寸各异避免同尺寸网格策略门 ——
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>weaknet probe</title></head>
<body style="background:#fff">
<div style="width:900px">
  ${[0, 1, 2, 5, 10, 15].map((d, i) => `<p>img delay=${d}s</p><img id="i${d}" width="${600 - i * 7}" height="${300 - i * 5}" src="/img${d}.png" alt="d${d}">`).join('')}
</div></body></html>`;

// 运行时构建合法白底 PNG (1x1 RGBA 白; CRC32 完整, 浏览器必能解码; 避免手写 base64 损坏)
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
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  // 原始数据: 每行 filter 0 + 白色像素
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

(async () => {
  await startServer();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `svi-weaknet-${PID}-`));
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  let tries = 0;
  while (!targets && tries < 120) { // 每端口试 30 次 × 250ms, 不通才换下一个端口 (修并行探针端口避让)
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

  // 先注入脚本, 再导航 (document-start 等价), 立即施加网络条件
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  const cond = MODE === 'offline' ? OFFLINE : (MODE === 'throttle' ? THROTTLE : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Network.emulateNetworkConditions', cond);

  // offline 模式: 先联网暖缓存, 再断网重载 (资源走磁盘缓存)
  const url = `http://127.0.0.1:${HTTP_PORT}/`;
  if (MODE === 'offline') {
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.navigate', { url });
    await sleep(3000); // 等 10s 图不完成没关系, 只暖 HTML + 短延迟图
  }

  const t0 = Date.now();
  await send('Page.navigate', { url });

  // 时间线采样: 每 100ms 一次, 共 18s; 记录每张图的 checked/inverted/reason 与 absolute time
  const timeline = [];
  const snapExpr = `(() => {
    const eng = (window.__svi && window.__svi.engines) ? window.__svi.engines.image : null;
    const out = [];
    for (const d of [0, 1, 2, 5, 10, 15]) {
      const el = document.getElementById('i' + d);
      if (!el) { out.push({ id: 'i' + d, missing: true }); continue; }
      const s = eng && eng.decisionBySrc ? eng.decisionBySrc.get(el.src) : null;
      out.push({
        id: 'i' + d,
        complete: el.complete, nw: el.naturalWidth,
        checked: el.hasAttribute('data-svi-checked-src'),
        inverted: el.getAttribute('data-svi-inverted') === 'true',
        failed: el.hasAttribute('data-svi-failed'),
        verdict: s ? s.verdict : null,
        reason: s ? s.reason : null,
      });
    }
    const eng2 = (window.__svi && window.__svi.engines) ? window.__svi.engines.image : null;
    return { t: Date.now(), imgs: out, pending: eng2 && eng2.pending ? eng2.pending.size : null };
  })()`;
  let done = false;
  while (Date.now() - t0 < 18000 && !done) {
    const r = await send('Runtime.evaluate', { expression: snapExpr, returnByValue: true });
    const v = r.result && r.result.result && r.result.result.value;
    if (v) {
      v.rel = Date.now() - t0;
      timeline.push(v);
      // fast/throttle: 全部完成且全部 checked (或失败) 即可提前收尾; offline: 跑满 12s 记稳态
      if (MODE !== 'offline' && v.imgs.every((x) => (x.complete && (x.checked || x.failed)))) done = true;
    }
    await sleep(100);
  }

  // 摘要: 每图首次决策时刻 (checked=true 的最早采样) + 稳态决策
  const summary = { mode: MODE, url, pid: PID, cdpPort: CDP_PORT, httpPort: HTTP_PORT, throttled: MODE === 'throttle' ? THROTTLE : null, startAt: new Date(t0).toISOString(), firstDecision: {}, steady: null, timeline };
  for (const d of [0, 1, 2, 5, 10, 15]) {
    const hit = timeline.find((s) => s.imgs.some((x) => x.id === 'i' + d && (x.checked || x.failed)));
    if (hit) {
      const x = hit.imgs.find((y) => y.id === 'i' + d);
      summary.firstDecision['i' + d] = { relMs: hit.rel, verdict: x.verdict, reason: x.reason, checked: x.checked, failed: x.failed };
    } else {
      summary.firstDecision['i' + d] = { relMs: null, note: 'no decision within 18s' };
    }
  }
  const last = timeline[timeline.length - 1];
  summary.steady = last ? { relMs: last.rel, imgs: last.imgs } : null;

  fs.writeFileSync(path.join(OUT_DIR, `summary-${MODE}.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: true, mode: MODE, outDir: OUT_DIR, firstDecision: summary.firstDecision }, null, 2));

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED', e); process.exit(1); });
