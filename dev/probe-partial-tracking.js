// dev/probe-partial-tracking.js — 补测: backdrop-filter 是逐帧重采样还是静态快照?
// 方法: 播放一段「白/黑每 0.5s 交替」的视频, 在覆盖层正下方连续采样中心像素。
//       若采样值随时间交替 → 逐帧跟随 (部分反色对视频成立);
//       若恒定不变          → 静态快照 (视频部分反色不可行)。
// 用法: node dev/probe-partial-tracking.js

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const VIDEO = path.join(SHOTS, 'tracking-test.webm');
const PORT = 8792;
const CDP_PORT = 9332;
const CHROME = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FFMPEG = process.env.SVI_FFMPEG || 'C:\\ffmpeg\\bin\\ffmpeg.exe';

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#888;}
#stage{position:relative;width:320px;height:240px;margin:8px;background:#fff;overflow:hidden;}
#v{width:320px;height:240px;object-fit:fill;display:block;}
#ov{position:absolute;inset:0;backdrop-filter:invert(1);-webkit-backdrop-filter:invert(1);pointer-events:none;}
</style></head><body>
<div id="stage"><video id="v" src="/t.webm" autoplay muted loop playsinline></video><div id="ov"></div></div>
<script>window.__ready=0;const v=document.getElementById('v');
v.addEventListener('playing',()=>{window.__ready=1});
setTimeout(()=>{window.__ready=1},1500);</script>
</body></html>`;

let ws, msgId = 0; const pending = new Map();
function sendCdp(m, p) {
  return new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p || {} }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 20000);
  });
}
function connect(u) {
  return new Promise((res, rej) => {
    ws = new WebSocket(u);
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', rej);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function centerLum(pngPath, w, h) {
  const raw = execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  const i = (Math.round(h / 2) * w + Math.round(w / 2)) * 3;
  return raw[i] + raw[i + 1] + raw[i + 2];
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=6',
    '-vf', "drawbox=x=0:y=0:w=320:h=240:color=black@1:t=fill:enable='lt(mod(t\\,1)\\,0.5)'",
    '-c:v', 'libvpx-vp9', '-b:v', '200k', '-pix_fmt', 'yuv420p', VIDEO]);

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/t.webm')) { res.writeHead(200, { 'Content-Type': 'video/webm' }); res.end(fs.readFileSync(VIDEO)); }
    else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HTML); }
  });
  await new Promise((r) => server.listen(PORT, r));

  const profile = path.join(ROOT, '.chrome-test-profile', 'partial-probe');
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
    '--window-size=400,300', 'about:blank'], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); if (list.some((t) => t.type === 'page')) break; } catch (e) { /* retry */ } await sleep(250); }
  const page = list.find((t) => t.type === 'page');
  await connect(page.webSocketDebuggerUrl);
  await sendCdp('Page.enable'); await sendCdp('Runtime.enable');
  await sendCdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 300, deviceScaleFactor: 1, mobile: false });
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2000);

  const r = JSON.parse((await sendCdp('Runtime.evaluate', { expression:
    `JSON.stringify(document.getElementById('stage').getBoundingClientRect())`, returnByValue: true })).result.value);
  const clip = { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };

  const samples = [];
  for (let i = 0; i < 12; i++) {
    const shot = await sendCdp('Page.captureScreenshot', { format: 'png', clip });
    const p = path.join(SHOTS, `tracking-${i}.png`);
    fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
    const lum = centerLum(p, Math.round(r.width), Math.round(r.height));
    const ct = (await sendCdp('Runtime.evaluate', { expression: `document.getElementById('v').currentTime.toFixed(2)`, returnByValue: true })).result.value;
    samples.push({ t: ct, lum });
    console.log(`sample ${String(i).padStart(2)}  videoT=${ct}s  centerLum=${String(lum).padStart(3)}`);
    await sleep(180);
  }

  const distinct = new Set(samples.map((s) => s.lum > 380 ? 'dark' : 'light'));
  console.log('\n================ 结论 ================');
  if (distinct.size > 1) {
    console.log('✓ 采样值随时间交替 → backdrop-filter 逐帧重采样, 视频部分反色成立。');
  } else {
    console.log('✗ 采样值恒定 → 覆盖层采到静态快照, 视频部分反色须改用克隆层/其他方案。');
  }

  ws.close(); chrome.kill(); server.close(); await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
