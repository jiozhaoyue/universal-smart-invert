// Real-site hover-restore verification on the inverted UML Fig1 diagram:
// hoverRestore=true  → hovering the inverted image restores original (filter none)
// hoverRestore=false → hovering keeps the inversion (filter invert(...))
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9243;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-hover-');
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  '--window-size=1440,900', 'about:blank',
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

  const TARGET_URL = 'https://en.wikipedia.org/wiki/UML_state_machine';

  for (const mode of [false, true]) {
    // seed pref BEFORE the script boots (post-load injection, so plain localStorage write works)
    await send('Page.navigate', { url: TARGET_URL });
    await sleep(9000);
    await evalJs(`localStorage.setItem('universal_smart_invert_v4', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('universal_smart_invert_v4') || '{}'), { hoverRestore: ${mode} }))); localStorage.setItem('svi:prefs', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('svi:prefs') || '{}'), { hoverRestore: ${mode} }))); 'seeded:' + ${mode}`);
    await send('Page.navigate', { url: TARGET_URL });
    await sleep(8000);
    await send('Runtime.evaluate', { expression: SRC });
    await sleep(9000);
    const hover = await evalJs(`(() => {
      const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('UML_state_machine_Fig1'));
      if (!img) return { found: false };
      img.scrollIntoView({ block: 'center' });
      const r = img.getBoundingClientRect();
      return { found: true, pt: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }, inv: img.getAttribute('data-svi-inverted'), restoreClass: document.documentElement.classList.contains('svi-hover-restore') };
    })()`);
    if (!hover || !hover.found) { console.log('mode', mode, ': Fig1 not found'); continue; }
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hover.pt.x, y: hover.pt.y });
    await sleep(400);
    const state = await evalJs(`(() => { const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('UML_state_machine_Fig1')); return { hoverFilter: getComputedStyle(img).filter.slice(0, 60), restoreClass: document.documentElement.classList.contains('svi-hover-restore'), pref: JSON.parse(localStorage.getItem('svi:prefs') || '{}').hoverRestore }; })()`);
    console.log('hoverRestore=' + mode + ' →', JSON.stringify(state));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
  }

  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
