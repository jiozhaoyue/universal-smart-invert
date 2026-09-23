// v4.6-4 CDP 探针: 在本文件 (离线 fixture) 上注入 userscript, 导出四案例矩阵判定 + 截图。
// 用法: node dev/probe-veil-fixture.js [--out <json路径>] [--png <png路径>]
// 说明:
//  - 每次运行用独立临时 profile (mkdtemp), 端口默认 9331 (可用 SVI_PROBE_PORT 覆盖),
//    与 test-browser.js 的固定 profile/端口互不争用 (并行 worktree 安全)。
//  - 遵循 spec v3.3 教训: 通过 Runtime.evaluate 在导航完成后注入 (document-start 注入会丢样式)。
//  - 修复前运行: A 案应呈 inverted=true (误反色复现); 修复后运行: A 案 keep + 决策原因 masked-dark。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = Number(process.env.SVI_PROBE_PORT || 9331);
const FIXTURE = path.join(__dirname, 'fixtures', 'dark-veil.html');

const argVal = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const OUT_JSON = argVal('--out');
const OUT_PNG = argVal('--png');

const userDataDir = fs.mkdtempSync(require('os').tmpdir() + path.sep + 'svi-veil-probe-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files',
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
  for (let i = 0; i < 40; i++) {
    try { targets = await get('/json/list'); if (targets) break; } catch (e) { /* retry */ }
    await sleep(250);
  }
  if (!targets) { console.error('CDP not reachable'); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') events.push(msg);
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await sleep(400);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: pathToFileURL(FIXTURE).href });
  await sleep(1200); // fixture 内联脚本生成 data URI 图片

  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await send('Runtime.evaluate', { expression: src, returnByValue: false }); // 导航完成后注入 (保留样式)

  // 等待全部 img 完成决策 (data-svi-checked-src)
  let checked = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const r = await send('Runtime.evaluate', {
      expression: '[...document.querySelectorAll("img[data-case]")].filter(x => x.hasAttribute("data-svi-checked-src")).length',
      returnByValue: true,
    });
    checked = r.result && r.result.result && r.result.result.value;
    if (checked >= 18) break;
  }
  await sleep(1500); // 余量: 让复检网/最终属性落定

  const expr = `(() => {
    const engine = window.__svi_image_engine;
    const svi = window.__svi;
    const cases = [...document.querySelectorAll('img[data-case]')].map((img) => {
      const src = img.currentSrc || img.src || '';
      const d = engine && engine.decisionBySrc ? engine.decisionBySrc.get(src) : null;
      let mctx = null;
      try { mctx = svi && typeof svi.maskedDarkContext === 'function' ? svi.maskedDarkContext(img) : undefined; } catch (e) { mctx = { error: String(e) }; }
      return {
        k: img.getAttribute('data-case'),
        inv: img.getAttribute('data-svi-inverted') === 'true',
        checked: img.hasAttribute('data-svi-checked-src'),
        verdict: d ? d.verdict : null,
        reason: d ? d.reason : null,
        mctx,
      };
    });
    return {
      url: location.href,
      sviVersion: svi && svi.version,
      enginePresent: !!engine,
      totalChecked: cases.filter(c => c.checked).length,
      cases,
    };
  })()`;
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const out = res.result && res.result.result && res.result.result.value;

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (OUT_PNG && shot && shot.result && shot.result.data) {
    fs.writeFileSync(OUT_PNG, Buffer.from(shot.result.data, 'base64'));
  }

  const errs = events.slice(0, 5).map((e) => e.params.exceptionDetails && (e.params.exceptionDetails.exception ? e.params.exceptionDetails.exception.description : e.params.exceptionDetails.text));
  out.pageExceptions = errs;
  console.log(JSON.stringify(out, null, 2));
  if (OUT_JSON) fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
