// E2E for the rules-pack import path: serve rules/svi-pack.import.json over
// HTTP, merge it via the real UI handler (uiController.applyRulesPayload),
// and assert the envelope groups land in prefs + hot-apply runs.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9245;
const PORT = 8896;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-pack-');
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

const PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#fafafa;color:#111;font-family:sans-serif}</style></head><body><h1>pack import</h1><img src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22200%22%3E%3Crect%20width%3D%22300%22%20height%3D%22200%22%20fill%3D%22%23ffffff%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2210%22%20width%3D%22280%22%20height%3D%22180%22%20fill%3D%22none%22%20stroke%3D%22%23111%22%20stroke-width%3D%224%22%2F%3E%3C%2Fsvg%3E"></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/pack.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(path.join(__dirname, '..', 'rules', 'svi-pack.import.json')));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
server.listen(PORT, '127.0.0.1');

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

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2000);
  await send('Runtime.evaluate', { expression: SRC });
  await sleep(5000);

  const r = await evalJs(`(async () => {
    const ui = window.__svi.ui;
    if (!ui || typeof ui.applyRulesPayload !== 'function') return { fail: 'applyRulesPayload unreachable' };
    const pack = await fetch('http://127.0.0.1:${PORT}/pack.json').then(r => r.json());
    const before = {
      blacklist: (window.__svi.prefs.siteBlacklist || []).length,
      elementRules: (window.__svi.prefs.elementRules || []).length,
      overrides: Object.keys(window.__svi.prefs.siteOverrides || {}).length,
    };
    ui.applyRulesPayload(pack.rules, false);
    // applyRulesPayload runs savePrefs + clearCacheAndRescan synchronously/deferred
    await new Promise(r2 => setTimeout(r2, 1500));
    const after = {
      blacklist: (window.__svi.prefs.siteBlacklist || []).length,
      elementRules: (window.__svi.prefs.elementRules || []).length,
      overrides: Object.keys(window.__svi.prefs.siteOverrides || {}).length,
    };
    // 幂等: 二次合并不增
    ui.applyRulesPayload(pack.rules, false);
    await new Promise(r2 => setTimeout(r2, 1000));
    const again = {
      blacklist: (window.__svi.prefs.siteBlacklist || []).length,
      elementRules: (window.__svi.prefs.elementRules || []).length,
    };
    return { before, after, again,
      blacklistMerged: after.blacklist >= 1200,
      elementRulesMerged: after.elementRules >= 30,
      idempotent: again.blacklist === after.blacklist && again.elementRules === after.elementRules,
      diagramStillInverted: document.querySelector('img') ? document.querySelector('img').getAttribute('data-svi-inverted') : null };
  })()`, true);
  console.log('PACK-IMPORT:', JSON.stringify(r, null, 1));

  // full UI click path: fill input → click 从链接导入 → gmFetchText(fetch) → merge
  const clickPath = await evalJs(`(async () => {
    window.__svi.ui.openSettingsModal();
    const tabs = [...document.querySelectorAll('.svi4-tab')];
    const g = tabs.find(b => b.textContent === '全局'); if (g) g.click();
    const sec = document.getElementById('svi-sec-stats');
    const input = sec.querySelector('input.svi-modal-text[placeholder*="规则包链接"]');
    if (!input) return { fail: 'input row not found' };
    input.value = 'http://127.0.0.1:${PORT}/pack.json';
    const btn = input.parentElement.querySelector('button');
    btn.click();
    await new Promise(r2 => setTimeout(r2, 2500));
    const prefs = window.__svi.prefs;
    return { blacklist: (prefs.siteBlacklist || []).length, elementRules: (prefs.elementRules || []).length,
      toast: (document.querySelector('#svi-toast') || {}).textContent || null };
  })()`, true);
  console.log('CLICK-PATH:', JSON.stringify(clickPath));

  // visual: the new inline pack-import row in the data section
  const outDir2 = path.join(__dirname, 'shots', 'pack-import');
  fs.mkdirSync(outDir2, { recursive: true });
  await evalJs(`(() => {
    window.__svi.ui.openSettingsModal();
    const tabs = [...document.querySelectorAll('.svi4-tab')];
    const g = tabs.find(b => b.textContent === '全局'); if (g) g.click();
    const sec = document.getElementById('svi-sec-stats');
    if (!sec) return { sec: false };
    sec.scrollIntoView({ block: 'center' });
    const input = sec.querySelector('input.svi-modal-text[placeholder*="规则包链接"]');
    const res = { sec: true, rowFound: !!input, btnText: input ? input.parentElement.querySelector('button').textContent : null }; console.log('PACK-ROW:', JSON.stringify(res)); return res;
  })()`);
  await sleep(600);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir2, 'pack-row-modal.png'), Buffer.from(shot2.result.data, 'base64'));
  await evalJs(`(() => { const b = document.querySelector('.svi-modal-close'); if (b) b.click(); return true; })()`);
  console.log('pack-row shot:', outDir2);

  ws.close(); chrome.kill(); server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); server.close(); process.exit(1); });
