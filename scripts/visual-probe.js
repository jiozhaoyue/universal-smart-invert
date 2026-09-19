// Visual probe: load real pages, inject the CURRENT userscript, screenshot before/after,
// and dump per-image decision reports (verdict + reason) for human/visual judgement.
// Usage: node scripts/visual-probe.js <url> [<url>...] [--wait ms] [--settle ms] [--full]
// Output: dev/shots/<ts>/<slug>-before.png / -after.png / -report.json / index.json
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9225 + (process.pid % 400); // 并行运行防端口冲突

const args = process.argv.slice(2);
const urls = [];
let waitMs = 9000;      // settle after navigation before "before" shot
let settleMs = 10000;   // settle after script injection before "after" shot
let fullPage = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--wait') waitMs = Number(args[++i]) || waitMs;
  else if (a === '--settle') settleMs = Number(args[++i]) || settleMs;
  else if (a === '--full') fullPage = true;
  else urls.push(a);
}
if (!urls.length) {
  console.error('usage: node scripts/visual-probe.js <url> [<url>...] [--wait ms] [--settle ms] [--full]');
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'dev', 'shots', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-pid' + process.pid);
fs.mkdirSync(outDir, { recursive: true });

const userDataDir = fs.mkdtempSync(require('os').tmpdir() + '/svi-vprobe-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader',
  `--window-size=1440,900`,
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
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
    try { targets = await get('/json/list'); if (targets) break; } catch (e) {}
    await sleep(300);
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
    else if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') events.push(msg);
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await sleep(400);
  await send('Runtime.enable');
  await send('Page.enable');

  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();

  const REPORT_EXPR = `(() => {
    const media = [...document.querySelectorAll('img, video')].slice(0, 60);
    const dec = (window.__svi && window.__svi.engines && window.__svi.engines.image && window.__svi.engines.image.decisionBySrc) || new Map();
    const decObj = {};
    try { for (const [k, v] of dec) decObj[k.length > 110 ? k.slice(0, 110) : k] = v; } catch (e) {}
    return {
      url: location.href.slice(0, 150),
      title: document.title.slice(0, 90),
      sviVersion: window.__svi && window.__svi.version,
      dormant: !!(window.__svi && window.__svi.dormant),
      owner: document.documentElement.dataset.sviOwner || null,
      htmlClasses: document.documentElement.className,
      bodyClasses: document.body ? document.body.className : null,
      counts: {
        img: document.images.length,
        video: document.querySelectorAll('video').length,
        inverted: document.querySelectorAll('[data-svi-inverted="true"]').length,
        fx: document.querySelectorAll('[data-svi-fx]').length,
        bginv: document.querySelectorAll('[data-svi-bginv="true"]').length,
        failed: document.querySelectorAll('[data-svi-failed]').length,
      },
      media: media.map((m) => ({
        tag: m.tagName.toLowerCase(),
        src: String(m.currentSrc || m.src || '').slice(0, 110),
        inv: m.getAttribute('data-svi-inverted'),
        fx: m.hasAttribute('data-svi-fx'),
        bginv: m.getAttribute('data-svi-bginv'),
        checked: m.hasAttribute('data-svi-checked-src'),
        failed: m.hasAttribute('data-svi-failed'),
        w: m.clientWidth, h: m.clientHeight,
        filter: (getComputedStyle(m).filter || '').slice(0, 80),
      })),
      decisions: decObj,
    };
  })()`;

  const slug = (u, i) => {
    let s = '';
    try { s = new URL(u).hostname.replace(/^www\./, '') + '-' + new URL(u).pathname.replace(/[^a-z0-9]+/gi, '-').slice(0, 40); } catch (e) { s = 'page' + i; }
    return (i + 1) + '-' + s.replace(/^-+|-+$/g, '').slice(0, 60);
  };

  const index = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const base = slug(url, i);
    console.log(`\n===== [${i + 1}/${urls.length}] ${url}`);
    events.length = 0;
    await send('Page.navigate', { url });
    await sleep(waitMs);

    // BEFORE shot (no script)
    const before = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, base + '-before.png'), Buffer.from(before.result.data, 'base64'));

    // Inject current script AFTER load (keeps styles intact, matches real Runtime.evaluate probe)
    for (let attempt = 0; attempt < 3; attempt++) {
      const inj = await send('Runtime.evaluate', { expression: src });
      if (inj && inj.result && (inj.result.exceptionDetails || inj.result.subtype === 'error')) {
        console.log('INJECT ERROR:', JSON.stringify(inj.result.exceptionDetails || inj.result.description || '').slice(0, 600));
      }
      await sleep(2500);
      const alive = (await send('Runtime.evaluate', { expression: '!!(window.__svi && window.__svi.version) && !window.__svi.dormant', returnByValue: true })).result?.result?.value;
      if (alive) break;
      if (attempt === 2) console.log('WARN: script did not boot after 3 injection attempts');
    }
    await sleep(settleMs);

    const rep = (await send('Runtime.evaluate', { expression: REPORT_EXPR, returnByValue: true })).result?.result?.value ?? {};
    fs.writeFileSync(path.join(outDir, base + '-report.json'), JSON.stringify(rep, null, 2));

    const after = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, base + '-after.png'), Buffer.from(after.result.data, 'base64'));
    if (fullPage) {
      const metrics = (await send('Page.getLayoutMetrics')).result;
      const ch = Math.min(Math.ceil(metrics.cssContentSize.height), 8000);
      const cw = Math.min(Math.ceil(metrics.cssContentSize.width), 4000);
      await send('Emulation.setDeviceMetricsOverride', { width: cw, height: ch, deviceScaleFactor: 0.5, mobile: false });
      await sleep(700);
      const fp = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, base + '-after-full.png'), Buffer.from(fp.result.data, 'base64'));
      await send('Emulation.clearDeviceMetricsOverride');
      await sleep(300);
    }

    const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').slice(0, 5)
      .map((e) => e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text);
    const entry = {
      url, base, counts: rep.counts || {},
      sviVersion: rep.sviVersion, dormant: rep.dormant, htmlClasses: rep.htmlClasses,
      exceptions: errs,
    };
    index.push(entry);
    console.log(JSON.stringify(entry, null, 1));
  }

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pages: index }, null, 2));
  console.log('\nshots dir:', outDir);
  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
