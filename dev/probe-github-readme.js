'use strict';
/*
 * dev/probe-github-readme.js — 真实站点现场取证：GitHub 仓库页 README 图片是否真反色（v6.6 R3）
 *
 * 为什么单独一个脚本：
 *   bench 用的是本地 fixture 页，真实站点有真实 CSP、真实 camo 代理图、真实懒加载 ——
 *   用户报障的正是「GitHub README 里的图片」。本脚本把这条真实路径变成**可复现、可留证**的一步。
 *
 * 形态：**真扩展**（`--remote-debugging-pipe` + CDP `Extensions.loadUnpacked`）。
 *   注意: Chrome / Edge 137+ **已忽略 `--load-extension`**（本项目实测 Chrome 153、Edge 153 均如此），
 *   所以只能用 CDP 的 loadUnpacked 通道 —— 这也是 v6-5 真扩展 E2E 必须采用的通道。
 *
 * 断言口径（**必须断言真实生效，不许只看属性**）：
 *   mdCount > 0  且  invCount === mdCount  且  filterNone === 0
 *   即：README 的每张图都被判为反色，且 computedStyle.filter 真的不是 none。
 *
 * 降级纪律（与 test-browser.js 一致）：无 Chrome / 无网 / 页面无 README 图 → 打印 SKIP 并以 0 退出。
 *
 * 用法:
 *   node dev/probe-github-readme.js
 *   node dev/probe-github-readme.js <仓库页 URL> <截图输出路径>
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

// 与本仓其他脚本一致的 Chrome 探测顺序
const CHROME_CANDIDATES = [
  process.env.SVI_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });

const CDP_PORT = Number(process.env.SVI_CDP_PORT || 9246);
const TARGET = process.argv[2] || 'https://github.com/qixing-jk/all-api-hub';
const SHOT = process.argv[3] || path.join(__dirname, 'shots', 'probe-github-readme.png');
const EXT_DIR = path.resolve(__dirname, '..', 'extension');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function skip(reason) {
  console.log('SKIP: 未验证 (' + reason + ')');
  process.exit(0);
}

if (!CHROME) skip('未找到 Chrome / Edge 可执行文件，可设 SVI_CHROME_PATH 指定');
if (!fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
  skip('extension/manifest.json 不存在 —— 先跑 node scripts/build-extension.js');
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-gh-'));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--enable-unsafe-swiftshader',
  '--enable-unsafe-extension-debugging', // loadUnpacked 通道的前置开关
  '--remote-debugging-pipe',             // fd 3 入 / fd 4 出, \0 结尾的 JSON
  '--window-size=1280,1400',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

// —— 极简 pipe 客户端（只用于 Extensions.loadUnpacked）——
let pipeBuf = '';
const pipePending = new Map();
let pipeSeq = 0;
chrome.stdio[4].on('data', (chunk) => {
  pipeBuf += chunk.toString('utf8');
  let idx;
  while ((idx = pipeBuf.indexOf('\0')) !== -1) {
    const msg = pipeBuf.slice(0, idx);
    pipeBuf = pipeBuf.slice(idx + 1);
    try {
      const g = JSON.parse(msg);
      if (g.id && pipePending.has(g.id)) { pipePending.get(g.id)(g); pipePending.delete(g.id); }
    } catch (e) { /* ignore */ }
  }
});
function pipeSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++pipeSeq;
    pipePending.set(i, resolve);
    chrome.stdio[3].write(JSON.stringify({ id: i, method, params }) + '\0');
    setTimeout(() => { if (pipePending.has(i)) { pipePending.delete(i); reject(new Error('pipe 超时: ' + method)); } }, 15000);
  });
}

const getJson = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

// 断言口径: README 图逐张「属性为真 + 滤镜真实生效」
const PROBE_EXPR = `(() => {
  const md = [...document.querySelectorAll('.markdown-body img')].filter((i) => i.naturalWidth > 0);
  return {
    url: location.href,
    mdCount: md.length,
    invCount: md.filter((i) => i.getAttribute('data-svi-inverted') === 'true').length,
    filterNone: md.filter((i) => (getComputedStyle(i).filter || 'none') === 'none').length,
    checkedCount: md.filter((i) => i.hasAttribute('data-svi-checked-src')).length,
    sviCssBytes: [...document.querySelectorAll('style')]
      .filter((s) => /data-svi-inverted/.test(s.textContent || ''))
      .reduce((n, s) => n + (s.textContent || '').length, 0),
    htmlClass: document.documentElement.className,
    mainWorldSvi: typeof window.__svi,
    pill: !!document.querySelector('.svi-capsule-root'),
    version: (window.__svi && window.__svi.version) || null,
  };
})()`;

// README FAQ 里给用户的「一行自检」—— 必须与文档**逐字一致**，本脚本顺带实跑一次以证明它可用
const FAQ_LINE = `({ver: window.__svi && window.__svi.version, css: [...document.querySelectorAll('style')].some(s => /data-svi-inverted/.test(s.textContent)), cls: document.documentElement.className, inv: document.querySelectorAll('[data-svi-inverted="true"]').length, n: document.querySelectorAll('.markdown-body img').length})`;

(async () => {
  let cleanup = () => { try { chrome.kill(); } catch (e) { } try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { } };
  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try { targets = await getJson('/json/list'); if (targets && targets.length) break; } catch (e) { }
      await sleep(300);
    }
    if (!targets) { cleanup(); skip('CDP 未就绪'); }

    const loaded = await pipeSend('Extensions.loadUnpacked', { path: EXT_DIR });
    const extId = loaded.result && loaded.result.id;
    if (!extId) { cleanup(); skip('Extensions.loadUnpacked 失败: ' + JSON.stringify(loaded.error || loaded)); }
    console.log('扩展已加载: ' + extId);

    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pend = new Map();
    const contexts = [];
    ws.onmessage = (m) => {
      const g = JSON.parse(m.data);
      if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); return; }
      if (g.method === 'Runtime.executionContextCreated') contexts.push(g.params.context);
    };
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const evIn = async (expr, ctxId) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, ...(ctxId ? { contextId: ctxId } : {}) });
      if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception || {}).description };
      return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await sleep(400);
    await send('Runtime.enable');
    await send('Page.enable');

    let loadedOk = false;
    for (let attempt = 0; attempt < 2 && !loadedOk; attempt++) {
      await send('Page.navigate', { url: TARGET });
      await sleep(15000);
      const href = await evIn('location.href');
      loadedOk = typeof href === 'string' && !/^chrome-error:|^about:neterror/.test(href);
      if (!loadedOk) console.log('第 ' + (attempt + 1) + ' 次导航失败 (' + href + ')，重试 ...');
    }
    if (!loadedOk) { try { ws.close(); } catch (e) { } cleanup(); skip('网络不可达 / 页面加载失败: ' + TARGET); }

    // 隔离世界优先（内容脚本所在世界）; 主世界用于「DOM 是否共享」的对照
    const iso = contexts.filter((c) => c.auxData && c.auxData.type === 'isolated').pop();
    const inIso = iso ? await evIn(PROBE_EXPR, iso.id) : null;
    const inMain = await evIn(PROBE_EXPR);
    const result = inIso && !inIso.__err ? inIso : inMain;
    if (!result || result.__err) { try { ws.close(); } catch (e) { } cleanup(); skip('页面状态读取失败: ' + JSON.stringify(result)); }

    console.log('--- 现场结果 ---');
    console.log(JSON.stringify(result, null, 1));
    if (inMain && !inMain.__err) {
      console.log('主世界对照: window.__svi = ' + inMain.mainWorldSvi + ' (真扩展下应为 undefined, 隔离世界生效)');
    }

    // README FAQ 的「一行自检」实跑。**两个世界都要看**：
    //   主世界 = 用户按 F12 在 Console 里粘贴时所在的世界；隔离世界 = 内容脚本所在世界。
    //   extension 形态下主世界拿不到 window.__svi（这正是隔离世界的证据），因此 ver 会是 undefined
    //   而脚本其实在正常运行 —— 文档里必须写明这一点，否则会误导用户。
    const faqMain = await evIn(FAQ_LINE);
    const faqIso = iso ? await evIn(FAQ_LINE, iso.id) : null;
    if (faqMain && !faqMain.__err) console.log('FAQ 一行自检（主世界 = 页面 Console）: ' + JSON.stringify(faqMain));
    if (faqIso && !faqIso.__err) console.log('FAQ 一行自检（隔离世界 = 内容脚本）: ' + JSON.stringify(faqIso));

    try {
      fs.mkdirSync(path.dirname(SHOT), { recursive: true });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot.result && shot.result.data) {
        fs.writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));
        console.log('截图: ' + path.relative(process.cwd(), SHOT));
      }
    } catch (e) { console.log('截图失败（不影响断言）: ' + e.message); }

    try { ws.close(); } catch (e) { }

    if (result.mdCount === 0) { cleanup(); skip('该页面没有 .markdown-body 图（或都没加载出来），无法断言'); }

    const problems = [];
    if (result.sviCssBytes <= 0) problems.push('主样式表不在场（滤镜规则不存在）');
    if (result.invCount !== result.mdCount) problems.push(`判定未覆盖: ${result.invCount}/${result.mdCount}`);
    if (result.filterNone !== 0) problems.push(`${result.filterNone} 张图 computedStyle.filter 仍是 none（属性写了但没生效）`);

    if (problems.length) {
      console.error('FAIL: ' + problems.join('; '));
      cleanup();
      process.exit(1);
    }
    console.log(`PASS: README 图 ${result.mdCount}/${result.mdCount} 反色且 filter 生效（样式表 ${result.sviCssBytes} 字节）`);
    cleanup();
    process.exit(0);
  } catch (e) {
    cleanup();
    console.error('ERROR: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
})();
