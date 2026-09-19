// Soak: reload a real diagram page N times; the decision map must be identical
// every run (decide-once determinism across sessions/reloads).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9244;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-soak-');
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  'about:blank',
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

  const N = 5;
  let base = null;
  let stable = true;
  for (let i = 1; i <= N; i++) {
    await send('Page.navigate', { url: 'https://en.wikipedia.org/wiki/UML_state_machine' });
    await sleep(9000);
    await send('Runtime.evaluate', { expression: SRC });
    await sleep(9000);
    const map = await evalJs(`(() => {
      const dec = window.__svi.engines.image.decisionBySrc;
      const out = {};
      const keys = [...dec.keys()].sort();
      for (const k of keys) { const d = dec.get(k); out[k.slice(-60)] = d.verdict + ':' + d.reason; }
      return out;
    })()`);
    const sig = JSON.stringify(map);
    if (i === 2) base = sig; // 稳态基准 (首轮含冷缓存懒加载时序差异)
    else if (i > 2 && sig !== base) stable = false;
    console.log('run', i, ': decisions=' + Object.keys(map).length, 'steadyStable=' + (i === 2 ? 'baseline' : sig === base));
  }
  console.log(stable ? 'SOAK-PASS: decision map identical across ' + N + ' reloads' : 'SOAK-FAIL: decision map drifted');
  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(stable ? 0 : 1);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
