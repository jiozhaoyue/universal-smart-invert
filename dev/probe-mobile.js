// Mobile-viewport visual check: settings modal + capsule at 375x812 (iPhone-ish)
// and a coarse-pointer media emulation, to visually verify the v4.5 responsive CSS.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9242;
const outDir = path.join(__dirname, 'shots', 'mobile');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 8895;

const SEED = `<script>window.sviSeed=function(o){try{var b={};try{b=JSON.parse(localStorage.getItem('svi:prefs')||'{}')}catch(e){}for(var k in o)b[k]=o[k];localStorage.setItem('universal_smart_invert_v4',JSON.stringify(b));var c=Object.assign({},b);delete c.manualOverrides;localStorage.setItem('svi:prefs',JSON.stringify(c));}catch(e){}};sviSeed({});<\/script>`;
const PAGE = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${SEED}
<style>body{margin:0;padding:16px;background:#fafafa;color:#111;font-family:sans-serif}p{line-height:1.6}</style></head>
<body><h1>移动端响应式基准</h1><p>窄屏 (375px) 下打开设置面板: 面板应全宽、控件为触控目标、拖拽把手隐藏。</p>
<p>正文图片: <img id="pic" src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="400" height="260" fill="#ffffff"/><rect x="10" y="10" width="380" height="240" fill="none" stroke="#111" stroke-width="4"/><circle cx="200" cy="130" r="70" fill="#eef" stroke="#333" stroke-width="3"/></svg>')}" style="width:100%;height:auto"></p></body></html>`;

const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); });
server.listen(PORT, '127.0.0.1');

const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-mob-');
const chrome = spawn(CHROME, [
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
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  // emulate a phone: 375x812, mobile, coarse pointer
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(5000);

  // open settings modal
  await evalJs(`(() => { window.__svi.ui.openSettingsModal(); return true; })()`);
  await sleep(800);
  const m = await evalJs(`(() => {
    const win = document.querySelector('.svi-modal-window');
    const handle = document.querySelector('.svi-drag-handle');
    const sel = document.querySelector('.svi-modal-select');
    const num = document.querySelector('.svi-modal-num-input');
    const fs = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : null;
    return {
      innerWidth: window.innerWidth,
      winWidth: win ? Math.round(win.getBoundingClientRect().width) : null,
      winLeft: win ? Math.round(win.getBoundingClientRect().left) : null,
      handleDisplay: handle ? getComputedStyle(handle).display : null,
      selFont: fs(sel), numFont: fs(num),
      selHeight: sel ? Math.round(sel.getBoundingClientRect().height) : null,
    };
  })()`);
  console.log('modal@375:', JSON.stringify(m));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'modal-375.png'), Buffer.from(shot.result.data, 'base64'));

  // close modal, screenshot capsule panel open state
  await evalJs(`(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`);
  await sleep(500);
  await evalJs(`(() => { const c = document.querySelector('.svi-trigger-pill'); if (c) c.click(); return true; })()`);
  await sleep(700);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'capsule-375.png'), Buffer.from(shot2.result.data, 'base64'));

  console.log('shots:', outDir);
  ws.close(); chrome.kill(); server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); server.close(); process.exit(1); });
