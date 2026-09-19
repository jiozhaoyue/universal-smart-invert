// Minimal: measure requestIdleCallback latency in headless CDP contexts.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9227;
const PORT = 8892;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-ric-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader',
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
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body><h1>ric test</h1></body></html>'); });
server.listen(PORT, '127.0.0.1');

(async () => {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await get('/json/list'); if (targets) break; } catch (e) {} await sleep(300); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalP = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2000);

  for (const expr of [
    `new Promise(r => { const t0 = performance.now(); requestIdleCallback(() => r({via:'ric', ms: Math.round(performance.now()-t0)}), {timeout: 300}); setTimeout(() => r({via:'timeout-guard', ms: Math.round(performance.now()-t0)}), 4000); })`,
    `new Promise(r => { const t0 = performance.now(); requestIdleCallback(() => r({via:'ric-notimeout', ms: Math.round(performance.now()-t0)})); setTimeout(() => r({via:'timeout-guard', ms: Math.round(performance.now()-t0)}), 4000); })`,
    `new Promise(r => { const t0 = performance.now(); let n = 0; const loop = () => { n++; if (n < 200) requestAnimationFrame(loop); }; requestAnimationFrame(loop); requestIdleCallback(() => r({via:'ric-under-raf-load', ms: Math.round(performance.now()-t0), frames: n}), {timeout: 1000}); setTimeout(() => r({via:'timeout-guard', ms: Math.round(performance.now()-t0), frames: n}), 5000); })`,
  ]) {
    console.log(JSON.stringify(await evalP(expr)));
  }
  ws.close(); chrome.kill(); server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); server.close(); process.exit(1); });
