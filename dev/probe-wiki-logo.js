// Measure enwiki-25.svg canvas stats (opaque ratio / luminance) on the live page.
const { spawn } = require('child_process');
const fs = require('fs'); const http = require('http');
const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDataDir = fs.mkdtempSync(require('os').tmpdir() + '/svi-an-');
const chrome = spawn(CHROME, ['--remote-debugging-port=9229', '--user-data-dir=' + userDataDir, '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader', ...(process.env.HTTPS_PROXY ? ['--proxy-server=' + process.env.HTTPS_PROXY] : []), 'about:blank'], { stdio: 'ignore' });
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9229, path: p }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }); }).on('error', rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let t = null; for (let i = 0; i < 30; i++) { try { t = await get('/json/list'); break } catch (e) {} await sleep(300); }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = m => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
  const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'https://en.wikipedia.org/wiki/Photography' });
  await sleep(9000);
  const expr = `(async () => {
    const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('enwiki-25'));
    if (!img) return { found: false };
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let opaque = 0, light = 0, tot = cv.width * cv.height, lumSum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]; if (a > 10) { opaque++; const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; lumSum += lum; if (lum >= 210) light++; }
    }
    return { found: true, w: cv.width, h: cv.height, opaqueRatio: +(opaque / tot).toFixed(3), lightAmongOpaque: opaque ? +(light / opaque).toFixed(3) : null, meanLumOpaque: opaque ? Math.round(lumSum / opaque) : null };
  })()`;
  const res = (await send('Runtime.evaluate', { returnByValue: true, expression: expr, awaitPromise: true })).result?.result?.value;
  console.log('LOGO-STATS', JSON.stringify(res));
  ws.close(); chrome.kill(); try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch (e) {}
  process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
