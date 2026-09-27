// 通用实时媒体探针 (零依赖): 把当前用户脚本注入任意页面, 回读每个媒体元素的决策与成因。
//
// 用法:
//   node scripts/probe-media.js <url> [--wait 9000] [--top 40] [--sel "img,video"] [--out file.json]
//
// 与 probe-github.js 的分工: 后者是 GitHub README 的一次性专用探针 (选择器写死);
// 本脚本是**通用形态** —— 选择器可传, 输出为「元素 → 决策 → 成因」的结构化表,
// 用于定位"某类元素被误判"的通病 (封面网格 / 播放列表缩略图 / 懒加载占位图…)。
//
// 代理: HTTPS_PROXY / HTTP_PROXY 有值时才把 --proxy-server 传给 Chrome (国内站点请留空)。
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = Number(process.env.SVI_PROBE_PORT || 9224);

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const TARGET = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (!TARGET) {
  console.error('usage: node scripts/probe-media.js <url> [--wait 9000] [--top 40] [--sel "img,video,canvas"] [--out file.json]');
  process.exit(2);
}
const WAIT = Number(arg('wait', 9000));
const TOP = Number(arg('top', 40));
const SEL = arg('sel', 'img, video, canvas, [data-svi-inverted], [data-svi-bginv], [data-svi-checked-src]');
const OUT = arg('out', '');
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-probe-'));
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader',
  '--window-size=1440,900',
  ...(PROXY ? [`--proxy-server=${PROXY}`] : []),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await get('/json/list'); if (targets && targets.length) break; } catch (e) { /* retry */ }
    await sleep(300);
  }
  if (!targets) { console.error('CDP not reachable'); chrome.kill(); process.exit(1); }
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
  await new Promise((r) => { ws.onopen = r; });

  await send('Runtime.enable');
  await send('Page.enable');
  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  console.log(`[probe] navigate → ${TARGET}`);
  await send('Page.navigate', { url: TARGET });
  await sleep(WAIT);

  // 需求诊断要点: 对每个媒体元素回答四问 —— ①被判成了什么 ②走哪条来源 ③为什么 ④它长在什么结构里
  const expr = `(() => {
    const SEL = ${JSON.stringify(SEL)};
    const TOP = ${TOP};
    const short = (s) => String(s || '').replace(/^https?:\\/\\//, '').slice(0, 110);
    const chainOf = (el) => {
      const out = [];
      let n = el.parentElement, hops = 0;
      while (n && n !== document.documentElement && hops < 7) {
        hops++;
        const cls = (typeof n.className === 'string') ? n.className : (n.className && n.className.baseVal) || '';
        const s = String(cls || '') + (n.id ? '#' + n.id : '');
        out.push(n.tagName.toLowerCase() + (s ? '.' + s.trim().split(/\\s+/).slice(0, 3).join('.') : ''));
        n = n.parentElement;
      }
      return out;
    };
    // processedLog: 元素引用 → 本页决策条目 (v5.2「本页已处理」会话日志)
    const logged = new Map();
    try {
      const pl = window.__svi && window.__svi.processedLog;
      if (pl && Array.isArray(pl.items)) for (const it of pl.items) { try { logged.set(it.el, it); } catch (e) {} }
    } catch (e) {}
    const all = [...document.querySelectorAll(SEL)];
    const rows = all.slice(0, TOP).map((el) => {
      const it = logged.get(el) || null;
      const attrs = {};
      for (const a of el.attributes || []) if (a.name.startsWith('data-svi')) attrs[a.name] = a.value;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        src: short(el.currentSrc || el.src || el.getAttribute('src') || cs.backgroundImage || ''),
        cls: String((typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '')).slice(0, 90),
        box: el.clientWidth + 'x' + el.clientHeight,
        natural: (el.naturalWidth || 0) + 'x' + (el.naturalHeight || 0),
        bg: cs.backgroundImage && cs.backgroundImage !== 'none' ? 'yes' : '',
        attrs: attrs,
        logged: it ? { action: it.actionId, reason: it.reason, stem: it.stem } : null,
        chain: chainOf(el),
      };
    });
    const svi = window.__svi || {};
    return {
      url: location.href,
      title: document.title,
      sviVersion: svi.version || null,
      owner: document.documentElement.dataset.sviOwner || null,
      policy: svi.prefs ? svi.prefs.imagePolicy : null,
      profile: svi.profile ? { name: svi.profile.name, imageInvert: svi.profile.imageInvert, protect: (svi.profile.protect || []).length } : null,
      counts: {
        total: all.length,
        inverted: all.filter((e) => e.getAttribute('data-svi-inverted') === 'true').length,
        bginv: all.filter((e) => e.getAttribute('data-svi-bginv') === 'true').length,
        checked: all.filter((e) => e.hasAttribute('data-svi-checked-src')).length,
        failed: all.filter((e) => e.hasAttribute('data-svi-failed')).length,
        loggedItems: logged.size,
      },
      rows: rows,
    };
  })()`;
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const value = res.result && res.result.result && res.result.result.value;
  if (!value) {
    console.error('evaluate failed:', JSON.stringify(res).slice(0, 800));
  } else {
    console.log(JSON.stringify(value, null, 2));
    if (OUT) { fs.writeFileSync(OUT, JSON.stringify(value, null, 2)); console.log('[probe] wrote ' + OUT); }
  }

  const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').slice(0, 6)
    .map((e) => e.params.exceptionDetails && (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || e.params.exceptionDetails.text));
  const logs = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type !== 'log').slice(0, 12)
    .map((e) => e.params.type + ': ' + e.params.args.map((a) => a.value || a.description || '').join(' '));
  console.log('PAGE EXCEPTIONS:', JSON.stringify(errs, null, 1));
  console.log('CONSOLE (warn/error):', JSON.stringify(logs, null, 1));

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.error(e); try { chrome.kill(); } catch (x) {} process.exit(1); });
