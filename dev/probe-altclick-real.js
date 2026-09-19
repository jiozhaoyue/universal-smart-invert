// Real-site Alt+click manual override loop (the data-driven correction path):
// 1) Fig1 auto-inverts (pixel)
// 2) Alt+click → manual restore, decision recorded with reason 'manual'
// 3) reload → override persists (image stays original without re-judging)
// 4) Alt+click again → back to inverted
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9247;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-alt-');
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
const URL_TARGET = 'https://en.wikipedia.org/wiki/UML_state_machine';

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

  const loadAndBoot = async () => {
    await send('Page.navigate', { url: URL_TARGET });
    await sleep(8000);
    await send('Runtime.evaluate', { expression: SRC });
    await sleep(9000);
    // scroll Fig1 into view and return its center + state
    return evalJs(`(() => {
      const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('UML_state_machine_Fig1'));
      if (!img) return { found: false };
      img.scrollIntoView({ block: 'center' });
      const r = img.getBoundingClientRect();
      return { found: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        inv: img.getAttribute('data-svi-inverted'),
        reason: (window.__svi.engines.image.decisionBySrc.get([...window.__svi.engines.image.decisionBySrc.keys()].find(k => k.includes('UML_state_machine_Fig1'))) || {}).reason };
    })()`);
  };

  const altClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers: 1 }); // 1 = Alt
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers: 1 });
    await sleep(800);
  };

  // 1. first pass: auto invert
  const s1 = await loadAndBoot();
  console.log('pass1:', JSON.stringify(s1));

  // 2. Alt+click → manual restore
  if (s1.found) {
    await altClick(s1.x, s1.y);
    const s2 = await evalJs(`(() => {
      const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('UML_state_machine_Fig1'));
      const eng = window.__svi.engines.image;
      let d = null; for (const [k, v] of eng.decisionBySrc) if (k.includes('UML_state_machine_Fig1')) d = v;
      const ov = JSON.parse(localStorage.getItem('svi:overrides') || '{}');
      return { inv: img.getAttribute('data-svi-inverted'), verdict: d && d.verdict, reason: d && d.reason, overrideKeys: Object.keys(ov).length };
    })()`);
    console.log('after Alt+click:', JSON.stringify(s2));

    // 3. reload → override persists
    const s3 = await loadAndBoot();
    console.log('after reload:', JSON.stringify(s3));

    // 4. Alt+click again → back to inverted
    if (s3.found) {
      await altClick(s3.x, s3.y);
      const s4 = await evalJs(`(() => {
        const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('UML_state_machine_Fig1'));
        const eng = window.__svi.engines.image;
        let d = null; for (const [k, v] of eng.decisionBySrc) if (k.includes('UML_state_machine_Fig1')) d = v;
        return { inv: img.getAttribute('data-svi-inverted'), verdict: d && d.verdict, reason: d && d.reason };
      })()`);
      console.log('after 2nd Alt+click:', JSON.stringify(s4));
    }
  }

  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
