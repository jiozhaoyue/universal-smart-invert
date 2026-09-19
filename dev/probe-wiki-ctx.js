// Measure context classification for the wikipedia logo img.
const { spawn } = require('child_process');
const fs = require('fs'); const http = require('http');
const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDataDir = fs.mkdtempSync(require('os').tmpdir() + '/svi-ctx-');
const chrome = spawn(CHROME, ['--remote-debugging-port=9230', '--user-data-dir=' + userDataDir, '--headless=new', '--disable-gpu', '--no-first-run', '--enable-unsafe-swiftshader', ...(process.env.HTTPS_PROXY ? ['--proxy-server=' + process.env.HTTPS_PROXY] : []), 'about:blank'], { stdio: 'ignore' });
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9230, path: p }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }); }).on('error', rej); }); }
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
  const expr = `(() => {
    const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || '').includes('enwiki-25'));
    if (!img) return { found: false };
    const CONTENT = '.markdown-body, [class*="article"], [class*="content"], .post-content, .rich-text, .comment-content';
    const CHROME = 'nav, header, footer, aside, [role="banner"], [class*="logo"], [class*="icon"], [aria-hidden="true"]';
    const chain = [];
    let n = img; let hops = 0;
    while (n && n !== document.body && hops < 8) { chain.push(n.tagName + (n.className && n.className.baseVal !== undefined ? '.' + n.className.baseVal : (n.className ? '.' + String(n.className).split(' ').join('.') : ''))); n = n.parentElement; hops++; }
    return {
      found: true,
      selfClass: String(img.className || ''),
      contentCtx: !!img.closest(CONTENT),
      chromeCtx: !!img.closest(CHROME),
      contentHit: img.closest(CONTENT) ? img.closest(CONTENT).tagName + '.' + String(img.closest(CONTENT).className).slice(0, 60) : null,
      chromeHit: img.closest(CHROME) ? img.closest(CHROME).tagName + '.' + String(img.closest(CHROME).className).slice(0, 60) : null,
      chain,
    };
  })()`;
  const res = (await send('Runtime.evaluate', { returnByValue: true, expression: expr })).result?.result?.value;
  console.log('LOGO-CTX', JSON.stringify(res, null, 1));
  ws.close(); chrome.kill(); try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch (e) {}
  process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
