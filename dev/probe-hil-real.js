// Real-site HIL (video auto-detect) verification: play a bilibili video and
// sample the state machine + applied filter over time from the MAIN world
// (the probe injects the userscript there, so window.__svi is reachable).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9246;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-hil-');
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
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
  const evalJs = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  await send('Page.navigate', { url: 'https://www.bilibili.com/video/BV1GJ411x7h7' });
  await sleep(11000);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(7000);

  // try to start playback (autoplay policy relaxed; click the big play button as fallback)
  const playState = await evalJs(`(async () => {
    const v = document.querySelector('video');
    if (!v) return { found: false };
    try { await v.play(); } catch (e) { return { found: true, playErr: String(e).slice(0, 80) }; }
    return { found: true, playing: !v.paused };
  })()`, true);
  console.log('play:', JSON.stringify(playState));

  // sample HIL-relevant state for ~12s
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    const s = await evalJs(`(() => {
      const v = document.querySelector('video');
      const hil = window.__svi.engines.hil;
      const st = v ? getComputedStyle(v).filter : 'no-video';
      return {
        t: Date.now() % 100000,
        paused: v ? v.paused : null,
        currentTime: v ? +v.currentTime.toFixed(1) : null,
        videoFilter: st === 'none' ? 'none' : String(st).slice(0, 50),
        sviTag: v ? v.getAttribute('data-svi-inverted') : null,
        sviPlaying: v ? v.classList.contains('svi-playing') : null,
        whiteSlideActive: hil ? !!hil.runtimeLikeInvertActive : undefined,
        invertActiveViaUi: (() => { try { return window.__svi.ui ? undefined : undefined; } catch (e) { return null; } })(),
      };
    })()`);
    samples.push(s);
  }
  for (const s of samples) console.log('SAMPLE', JSON.stringify(s));
  const anyPlaying = samples.some((s) => s.paused === false);
  const invertedAtSomePoint = samples.some((s) => s.sviTag === 'true' || (s.videoFilter && s.videoFilter !== 'none'));
  console.log('RESULT:', JSON.stringify({ anyPlaying, invertedAtSomePoint }));

  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
