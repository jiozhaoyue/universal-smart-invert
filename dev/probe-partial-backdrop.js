// dev/probe-partial-backdrop.js — 部分反色技术路线可行性实测 (一次性 spike, 非测试套件)
//
// 核心问题: 给一个覆盖层同时设置 `backdrop-filter: invert(1)` 与
// `clip-path` / `mask-image` 时, Chromium 是「只反色选区」还是「整层反色」?
// 这决定 v6「部分反色」走 backdrop-filter 单层方案, 还是必须退到克隆层方案。
//
// 方法: 真实 Chrome (CDP) 渲染 6 个用例 → 元素截图 → ffmpeg 解成 raw RGB → 采样像素。
// 判据: 每个用例的白底画布上, 「中心点」与「角落点」的 RGB 是否被反色。
//
// 用法: node dev/probe-partial-backdrop.js

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const VIDEO = path.join(SHOTS, 'partial-test.webm');
const PORT = 8791;
const CDP_PORT = 9331;
const CHROME = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 每个用例: 400x300 的 #fff 画布 + 一个覆盖层。
// 若 clip/mask 生效 → 中心被反色(黑) 且 角落保持白;
// 若失效(整层反色)   → 中心黑 且 角落也黑。
const USE_A_VIDEO = process.env.PROBE_VIDEO === '1';

const CASES = [
  { id: 'A-clip-circle', css: 'clip-path: circle(35% at 50% 50%);' },
  { id: 'B-mask-radial', css: 'mask-image: radial-gradient(circle 70px at 50% 50%, #000 60%, transparent 100%);' },
  { id: 'C-control-none', css: '' },
  { id: 'D-clip-polygon', css: 'clip-path: polygon(20% 20%, 80% 20%, 80% 80%, 20% 80%);' },
  { id: 'E-clip-url-obb', css: 'clip-path: url(#sviClip);' },
  { id: 'F-clip-inset', css: 'clip-path: inset(25% 25% 25% 25%);' },
  // G: 「挖洞」几何 —— 外框减选区 (evenodd)。这是「选区保留原色 / 其余反色」模式的底座。
  //    预期与 A-F 相反: 中心(洞内)=原色 765, 四角(环上)=反色 0。
  { id: 'G-clip-donut-evenodd', css: 'clip-path: url(#sviDonut);' },
  // ===== H/I/J: 钉死「覆盖层该做成什么」—— 三种载体形态 =====
  // H: 覆盖层做成「外层包裹 div 的 ::after」—— CSS 中 ::after 是最后一个子元素, 绘制在内容之上
  { id: 'H-after-wrapper', css: '', mode: 'wrapper-after' },
  // I: 覆盖层做成「媒体元素自身的 ::after」—— 媒体是 replaced element, 预期伪元素不生成
  { id: 'I-after-img', css: '', mode: 'img-after' },
  // J: 覆盖层做成「真实 DOM 节点 + z-index:1」—— 现有 .svi-fx-overlay 的形态
  { id: 'J-dom-zindex', css: 'z-index:1;', mode: 'dom' },
];

// 视口高度必须覆盖全部 stage(400x300 + 16px 边距), 否则靠后的用例截到视口外 → 采到 body 底色
const PAGE_H = 16 + CASES.length * 316 + 200;

function buildHtml() {
  const media = USE_A_VIDEO
    ? `<video id="m" src="/partial-test.webm" autoplay muted loop playsinline
              style="width:400px;height:300px;object-fit:fill;position:absolute;inset:0;"></video>`
    : `<img id="m" src="/white.svg" style="width:400px;height:300px;object-fit:fill;position:absolute;inset:0;">`;
  const boxes = CASES.map((c) => {
    const mode = c.mode || 'dom';
    // 只有 mode==='dom' 才插真实 DOM 覆盖层; 伪元素形态绝不能同时插 (否则二次反色)
    const inner = mode === 'dom' ? `<div class="ov" style="${c.css}"></div>` : '';
    // I: 伪元素挂在 <img> 自身 → 给 img 一个 id 供 CSS 选择
    const mediaHtml = mode === 'img-after' ? media.replace('id="m"', `id="m" class="ov-on-img"`) : media;
    return `
  <div class="stage" id="${c.id}">
    ${mediaHtml}
    ${inner}
  </div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#888;}
  .stage{position:relative;width:400px;height:300px;margin:8px;background:#fff;overflow:hidden;}
  .ov{position:absolute;inset:0;backdrop-filter:invert(1);-webkit-backdrop-filter:invert(1);pointer-events:none;}
  /* H: 外层包裹 div 的 ::after (CSS 中 ::after 绘制在内容之上) */
  #H-after-wrapper::after{
    content:'';position:absolute;inset:0;pointer-events:none;
    backdrop-filter:invert(1);-webkit-backdrop-filter:invert(1);
    clip-path: inset(25% 25% 25% 25%);
  }
  /* I: 媒体元素自身的 ::after (replaced element —— 预期伪元素根本不生成) */
  .ov-on-img::after{
    content:'';position:absolute;inset:0;pointer-events:none;
    backdrop-filter:invert(1);-webkit-backdrop-filter:invert(1);
    clip-path: inset(25% 25% 25% 25%);
  }
  </style></head><body>
  <svg width="0" height="0"><defs>
    <clipPath id="sviClip" clipPathUnits="objectBoundingBox">
      <rect x="0.25" y="0.25" width="0.5" height="0.5"/>
    </clipPath>
    <clipPath id="sviDonut" clipPathUnits="objectBoundingBox">
      <path clip-rule="evenodd" d="M0 0 H1 V1 H0 Z M0.25 0.25 H0.75 V0.75 H0.25 Z"/>
    </clipPath>
  </defs></svg>
  ${boxes}
  <script>window.__ready = 0; window.addEventListener('load', () => {
    const m = document.getElementById('m');
    const done = () => { window.__ready = 1; };
    if (m && m.tagName === 'VIDEO') { m.play().then(done).catch(done); setTimeout(done, 800); }
    else if (m && m.complete) done(); else if (m) m.onload = done; else done();
  });</script>
  </body></html>`;
}

const WHITE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#ffffff"/></svg>`;

function serve() {
  const html = buildHtml();
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/partial-test.webm')) {
      res.writeHead(200, { 'Content-Type': 'video/webm' });
      res.end(fs.readFileSync(VIDEO));
    } else if (req.url.startsWith('/white.svg')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(WHITE_SVG);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    }
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

// —— 极简 CDP 客户端 (与 test-browser.js 同风格) ——
let ws, msgId = 0;
const pending = new Map();
function sendCdp(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
  });
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', reject);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve: rs, reject: rj } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rj(new Error(m.error.message)) : rs(m.result);
      }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

// 用 ffmpeg 把 PNG 解成 raw RGB —— 零 npm 依赖的取像素方式。
function samplePixels(pngPath) {
  const raw = execFileSync(process.env.SVI_FFMPEG || 'C:\\ffmpeg\\bin\\ffmpeg.exe',
    ['-y', '-loglevel', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1 << 28 });
  return (x, y, w) => {
    const i = (y * w + x) * 3;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };
}

async function main() {
  if (!fs.existsSync(VIDEO)) { console.error('缺少测试视频, 请先跑 ffmpeg 生成 ' + VIDEO); process.exit(1); }
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();

  const profile = path.join(ROOT, '.chrome-test-profile', 'partial-probe');
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    `--window-size=500,${PAGE_H}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 60; i++) {
    try { list = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`); if (list.some((t) => t.type === 'page')) break; } catch (e) { /* retry */ }
    await sleep(250);
  }
  if (!list) { console.error('Chrome CDP 未就绪'); chrome.kill(); server.close(); process.exit(1); }
  const page = list.find((t) => t.type === 'page');
  await connect(page.webSocketDebuggerUrl);

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('Emulation.setDeviceMetricsOverride', { width: 500, height: PAGE_H, deviceScaleFactor: 1, mobile: false });
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1800);

  const ready = await sendCdp('Runtime.evaluate', { expression: 'window.__ready', returnByValue: true });
  console.log(`media=${USE_A_VIDEO ? 'video' : 'img'}  ready=${ready.result.value}`);

  // 断言 media 是否真的解码出了画面 (视频用例)
  const mediaState = await sendCdp('Runtime.evaluate', {
    expression: `(() => { const m = document.getElementById('m');
      return JSON.stringify({ tag: m.tagName, vw: m.videoWidth || m.naturalWidth, vh: m.videoHeight || m.naturalHeight,
        t: m.currentTime || 0, paused: m.paused }); })()`,
    returnByValue: true,
  });
  console.log('media state:', mediaState.result.value);

  const results = [];
  for (const c of CASES) {
    const box = await sendCdp('Runtime.evaluate', {
      expression: `(() => { const r = document.getElementById('${c.id}').getBoundingClientRect();
        return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height}); })()`,
      returnByValue: true,
    });
    const rect = JSON.parse(box.result.value);
    const shot = await sendCdp('Page.captureScreenshot', {
      format: 'png',
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
    });
    const png = path.join(SHOTS, `partial-${c.id}.png`);
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    const px = samplePixels(png);
    const w = Math.round(rect.width), h = Math.round(rect.height);
    const center = px(Math.round(w / 2), Math.round(h / 2), w);
    const corner = px(4, 4, w);
    const corner2 = px(w - 5, h - 5, w);
    const lum = (p) => p[0] + p[1] + p[2];
    // 反色判定: 白(≈765) → 黑(≈0)
    const centerInverted = lum(center) < 150;
    const cornerInverted = lum(corner) < 150;
    const corner2Inverted = lum(corner2) < 150;
    results.push({ id: c.id, center, corner, corner2, centerInverted, cornerInverted, corner2Inverted });
    console.log(
      `${c.id.padEnd(18)} center=${lum(center).toString().padStart(3)} (${centerInverted ? '反色' : '原色'})` +
      `  corner=${lum(corner).toString().padStart(3)} (${cornerInverted ? '反色' : '原色'})` +
      `  corner2=${lum(corner2).toString().padStart(3)} (${corner2Inverted ? '反色' : '原色'})`
    );
  }

  console.log('\n================ 结论 ================');
  const control = results.find((r) => r.id === 'C-control-none');
  if (!control.centerInverted) {
    console.log('⚠ 对照组未反色 —— 环境有问题 (headless 可能不合成 backdrop-filter), 本次结论不可用。');
  } else {
    for (const r of results) {
      if (r.id === 'C-control-none') continue;
      const shaped = !r.cornerInverted && r.centerInverted;
      const all = r.centerInverted && r.cornerInverted;
      const verdict = shaped ? '✓ 选区裁剪生效 (只反色选区)'
        : all ? '✗ 裁剪失效 (整层反色)'
          : '? 未反色';
      console.log(`${r.id.padEnd(18)} ${verdict}`);
    }
    console.log('\n说明: 若 D/E/F 同为 ✓ → clip-path 各形态均可用于部分反色;');
    console.log('      若 B 为 ✓ 而 A/D/E/F 为 ✗ → 只能用 mask-image 路线;');
    console.log('      若全部 ✗ → backdrop-filter 路线不成立, 须走克隆层方案。');
  }

  ws.close();
  chrome.kill();
  server.close();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
