// Panel screenshot probe: boot the CURRENT userscript on a local fixture page, open the
// settings panel, and capture per-tab PNGs (both the 站 / 全局 tabs, plus the tips section).
// Purpose: visual review of panel chrome (icons / spacing / colours) that assertions can't judge.
// Usage: node scripts/panel-shot.js [--width 480] [--height 900] [--dsf 2] [--scale 2]
// Output: dev/shots/panel-<ts>/panel-site.png, panel-global.png, panel-readability.png, index.json
//
// NOTE (spec gotcha, copied from check-panel-overflow.js): the userscript must be injected via
// Runtime.evaluate AFTER navigation. document-start injection loses ALL styles silently, and a
// screenshot of an unstyled panel would look "almost fine" while proving nothing.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9227 + (process.pid % 400); // parallel runs must not collide (lesson from visual-probe.js)

const argv = process.argv.slice(2);
const num = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? Number(argv[i + 1]) || dflt : dflt; };
const WIDTH = num('--width', 480);
const HEIGHT = num('--height', 940);
const DSF = num('--dsf', 2);          // device scale factor (2 = retina-quality output)
const SCALE = num('--scale', 2);      // captureScreenshot scale multiplier

const outDir = path.join(__dirname, '..', 'dev', 'shots', 'panel-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-pid' + process.pid);
fs.mkdirSync(outDir, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-panelshot-'));
const probePage = path.join(userDataDir, 'probe.html');
fs.writeFileSync(probePage, '<!doctype html><html><head><meta charset="utf-8"><title>svi panel shot</title></head>'
  + '<body style="background:#f5f5f5;font:14px system-ui"><h1>面板截图夹具</h1>'
  + '<p>仅用于把用户脚本跑起来, 内容无关紧要。</p></body></html>');

const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars',
  `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank',
], { stdio: 'ignore' });

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { targets = await get('/json/list'); if (targets) break; } catch (e) { /* retry */ }
    await sleep(300);
  }
  if (!targets) { console.error('CDP not reachable'); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(outDir, name + '.png');
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return { file: path.relative(path.join(__dirname, '..'), file), bytes: fs.statSync(file).size };
  };

  await sleep(400);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: DSF, mobile: false });
  await send('Page.navigate', { url: 'file:///' + probePage.replace(/\\/g, '/').replace(/^\/+/, '') });
  await sleep(1200);

  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await evalJson(src);
  await sleep(1600);

  const boot = await evalJson('(() => ({ svi: !!(window.__svi && window.__svi.ui), ver: window.__svi && window.__svi.version }))()');
  if (!boot.svi) { console.error('userscript did not boot on the fixture page'); process.exit(1); }

  const out = { version: boot.ver, width: WIDTH, height: HEIGHT, dsf: DSF, shots: [] };
  const FULL = argv.indexOf('--full') >= 0;

  // 模态面板 (居中布局; 停靠布局另截一张)
  await evalJson('window.__svi.ui.openSettingsModal()');
  await sleep(500);

  if (FULL) {
    // 整幅模式: 临时把模态体的高度限制解开, 让整块面板进入布局, 一次截全。
    //   刻意声明为「调用方一次截图前的调试改动」: 它只影响 probe 自己这一次截图,
    //   不改产品代码; 用完不还原也没关系 (进程马上退出, 且用的是临时 profile)。
    const expanded = await evalJson(`(() => {
      const b = document.querySelector('.svi-modal-body');
      const w = document.querySelector('.svi-modal-window');
      if (!b || !w) return null;
      b.style.maxHeight = 'none';
      b.style.overflow = 'visible';
      w.style.maxHeight = 'none';
      return { bodyH: Math.round(b.getBoundingClientRect().height), winH: Math.round(w.getBoundingClientRect().height) };
    })()`);
    if (!expanded) { console.error('--full: 找不到模态体'); process.exit(1); }
    await sleep(500);
    out.expanded = expanded;
    // 面板默认停在「本站」页签 → 先显式切到「全局」再截, 免得两张图是同一边
    const click = (label) => evalJson(`(function () {
      const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '${label}');
      if (t) t.click();
      return !!t;
    })()`);
    out.tabSwitched = { global: await click('全局') };
    await sleep(400);
    out.shots.push(Object.assign({ tab: 'full-global' }, await shot('panel-full-global')));
    out.tabSwitched.site = await click('本站');
    await sleep(400);
    out.shots.push(Object.assign({ tab: 'full-site' }, await shot('panel-full-site')));
    fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    try { ws.close(); } catch (e) { /* ignore */ }
    try { chrome.kill(); } catch (e) { /* ignore */ }
    process.exit(0);
  }

  out.shots.push(Object.assign({ tab: 'global' }, await shot('panel-global')));

  await evalJson(`(function () {
    const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '本站');
    if (t) t.click();
  })()`);
  await sleep(400);
  out.shots.push(Object.assign({ tab: 'site' }, await shot('panel-site')));

  // 「字体与可读性」区块 (它在面板末尾, 需要滚动才可见 —— 直接滚到它再截)
  const scrolled = await evalJson(`(function () {
    const t = [...document.querySelectorAll('.svi4-tab')].find(b => b.textContent === '全局');
    if (t) t.click();
    const sec = document.getElementById('svi-sec-readability');
    if (!sec) return false;
    sec.scrollIntoView({ block: 'start' });
    return true;
  })()`);
  await sleep(400);
  if (scrolled) out.shots.push(Object.assign({ tab: 'readability' }, await shot('panel-readability')));

  // 胶囊本体 (面板关掉, 截右下角那颗)
  await evalJson('window.__svi.ui.closeSettingsModal()');
  await sleep(300);
  out.shots.push(Object.assign({ tab: 'capsule' }, await shot('capsule')));

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  try { ws.close(); } catch (e) { /* ignore */ }
  try { chrome.kill(); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => {
  console.error('panel-shot failed: ' + (e && e.message ? e.message : e));
  process.exit(1);
});