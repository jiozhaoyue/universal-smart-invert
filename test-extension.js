'use strict';
/*
 * test-extension.js — 真扩展 E2E（Trellis 任务 v6-5，阶段 2）
 *
 * 为什么单独一个套件（design D1）：
 *   `test-browser.js` 覆盖的是「把用户脚本用 <script> 注入页面」这一形态；本套件覆盖
 *   **真扩展形态**（真正的 MV3 扩展被浏览器加载，内容脚本跑在隔离世界）。两者断言口径不同
 *   （隔离世界下页面主世界拿不到 `window.__svi`），合并会让两边都难以验证，故独立成套。
 *
 * 通道（v6.6 R3 实测结论，覆盖 design D1 里写的 `--load-extension`）：
 *   Chrome / Edge **137+ 已忽略 `--load-extension`**（本项目在 Chrome 153 / Edge 153 上实测确认），
 *   因此改用 CDP 的 `Extensions.loadUnpacked`（经 `--remote-debugging-pipe`），
 *   并需 `--enable-unsafe-extension-debugging` 前置开关。
 *
 * 断言纪律：
 *   1. **先自验扩展真加载**（D1）：在内容脚本所在世界断言 `chrome.runtime.id` 等于 loadUnpacked
 *      返回的 ID、且 `getManifest().version` 等于构建产物版本 —— 绝不允许「静默测了个空页面」还报通过；
 *   2. 断言**真实生效**：不光看 DOM 属性，还要看 computedStyle.filter；
 *   3. 降级到「未验证」而非「通过」：无 Chrome 时打印 SKIP 并以 0 退出（与 test-browser.js 同纪律）。
 *
 * 用法:
 *   node test-extension.js
 *   SVI_CHROME_PATH=/path/to/chrome node test-extension.js   # 指定浏览器
 */

const { spawn, execFileSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
// SVI_EXT_DIR 用于负向对照（拿一个被改坏的副本跑，验证断言真的咬得住）；
// 指定它时跳过构建前置，避免把「被测副本」又覆盖回真源产物。
const EXT_DIR_OVERRIDE = process.env.SVI_EXT_DIR ? path.resolve(process.env.SVI_EXT_DIR) : null;
const EXT_DIR = EXT_DIR_OVERRIDE || path.join(ROOT, 'extension');
const CDP_PORT = Number(process.env.SVI_EXT_CDP_PORT || 9333);
const HTTP_PORT = Number(process.env.SVI_EXT_HTTP_PORT || 8791);
const BOOT_TIMEOUT_MS = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— Chrome 探测：与 test-browser.js 同语义 —— 设了 SVI_CHROME_PATH 就是**唯一**候选
// （这样才让「无 Chrome → 未验证」这条降级路径可被负向对照真正触发）
const CHROME_CANDIDATES = process.env.SVI_CHROME_PATH
  ? [process.env.SVI_CHROME_PATH]
  : [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) { try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ } }
  return null;
}

// —— 本地 fixture：浅底图（应反色）与深底图（应保持），走 http 以便 canvas 采样同源可读 ——
const LIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
<rect width="320" height="200" fill="#f6f2e4"/>
<rect x="40" y="40" width="80" height="120" fill="#333a45"/>
<rect x="160" y="60" width="120" height="80" fill="#2f6f4f"/>
</svg>`;
const DARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
<rect width="320" height="200" fill="#14161a"/>
<circle cx="90" cy="100" r="46" fill="#e8eef7"/>
<rect x="180" y="70" width="100" height="60" fill="#7aa2f7"/>
</svg>`;
const PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>svi extension bench</title>
<style>body{margin:0;padding:24px;background:#fff;font:14px/1.6 system-ui}
img{display:block;width:320px;height:200px;margin-bottom:16px}</style></head>
<body>
<h1>真扩展形态基准页</h1>
<img id="light-img" src="/light.svg" alt="light">
<img id="dark-img" src="/dark.svg" alt="dark">
</body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      if (u === '/light.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(LIGHT_SVG); return; }
      if (u === '/dark.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(DARK_SVG); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE_HTML);
    });
    srv.listen(HTTP_PORT, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  // ---------- 阶段 0：构建前置（测最新产物，不测陈旧副本） ----------
  if (EXT_DIR_OVERRIDE) {
    console.log('[Ext] SVI_EXT_DIR 已指定 → 跳过构建前置，被测副本: ' + EXT_DIR);
  } else {
    console.log('[Ext] 构建前置: gen-icons → build-extension');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-icons.js')], { stdio: 'pipe' });
    const buildOut = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-extension.js')], { stdio: 'pipe' }).toString();
    const verLine = (buildOut.split(/\r?\n/).find((l) => /version/.test(l)) || '').trim();
    console.log('[Ext] ' + (verLine || 'build-extension 完成'));
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  const wantVersion = manifest.version;

  // ---------- 降级纪律：无 Chrome → 打印「未验证」并以 0 退出 ----------
  const chromePath = findChrome();
  if (!chromePath) {
    console.log('[Ext] SKIP: 未验证 (未找到浏览器，试过: ' + CHROME_CANDIDATES.join(', ') + '；可设 SVI_CHROME_PATH 指定)');
    process.exit(0);
  }
  console.log('[Ext] 浏览器: ' + chromePath);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-ext-'));
  let httpSrv = null;
  let chrome = null;
  let ws = null;
  const cleanup = () => {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    try { if (chrome) chrome.kill(); } catch (e) { /* ignore */ }
    try { if (httpSrv) httpSrv.close(); } catch (e) { /* ignore */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  };

  try {
    httpSrv = await startServer();
    const PAGE_URL = `http://127.0.0.1:${HTTP_PORT}/`;

    chrome = spawn(chromePath, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-pipe',              // fd3 入 / fd4 出：Extensions.loadUnpacked 只能走这条
      '--enable-unsafe-extension-debugging',  // loadUnpacked 通道的前置开关
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-unsafe-swiftshader',
      '--window-size=1280,900',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

    // —— pipe 客户端（只为 Extensions.loadUnpacked）——
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
    const pipeSend = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++pipeSeq;
      pipePending.set(i, resolve);
      chrome.stdio[3].write(JSON.stringify({ id: i, method, params }) + '\0');
      setTimeout(() => { if (pipePending.has(i)) { pipePending.delete(i); reject(new Error('pipe 超时: ' + method)); } }, 15000);
    });

    const getJson = (p) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      }).on('error', reject);
    });

    let targets = null;
    for (let i = 0; i < 40 && !targets; i++) {
      try { const t = await getJson('/json/list'); if (t && t.length) targets = t; } catch (e) { /* 未就绪 */ }
      if (!targets) await sleep(300);
    }
    if (!targets) { cleanup(); console.log('[Ext] SKIP: 未验证 (CDP 未就绪)'); process.exit(0); }

    // ---------- 场景 1：真扩展被加载 ----------
    console.log('[Ext] Scenario 1: 真扩展加载 (Extensions.loadUnpacked) ...');
    const loaded = await pipeSend('Extensions.loadUnpacked', { path: EXT_DIR });
    const extId = loaded.result && loaded.result.id;
    assert.ok(extId, 'Extensions.loadUnpacked 必须返回扩展 ID (否则浏览器未加载任何扩展): ' + JSON.stringify(loaded.error || loaded));
    console.log('    扩展 ID = ' + extId);

    // —— CDP 客户端（WebSocket）——
    const pageTarget = targets.find((t) => t.type === 'page');
    assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, '必须有可附着的 page target');
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgSeq = 0;
    const pending = new Map();
    let isolatedContexts = [];
    ws.onmessage = (m) => {
      const g = JSON.parse(m.data);
      if (g.id && pending.has(g.id)) { pending.get(g.id)(g); pending.delete(g.id); return; }
      if (g.method === 'Runtime.executionContextCreated') {
        const c = g.params.context;
        if (c.auxData && c.auxData.type === 'isolated') isolatedContexts.push(c);
      }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });

    const send = (method, params = {}) => new Promise((res) => {
      const i = ++msgSeq;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const evIn = async (expr, ctxId, awaitPromise = false) => {
      const r = await send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise,
        ...(ctxId ? { contextId: ctxId } : {}),
      });
      const rr = r.result || {};
      if (rr.exceptionDetails) throw new Error('页面内求值抛错: ' + ((rr.exceptionDetails.exception || {}).description || rr.exceptionDetails.text));
      return rr.result ? rr.result.value : undefined;
    };
    // 有界轮询：等条件成立，不在热路径上赌固定 sleep
    const waitFor = async (fn, timeoutMs, label) => {
      const t0 = Date.now();
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > timeoutMs) throw new Error('等待超时: ' + label);
        await sleep(250);
      }
    };
    // 挑选「真的含 window.__svi」的那个隔离世界 —— 不靠世界名猜，自证式挑选
    const pickExtWorld = () => waitFor(async () => {
      for (const c of isolatedContexts) {
        try { if ((await evIn('typeof window.__svi', c.id)) === 'object') return c; } catch (e) { /* 上下文已失效 */ }
      }
      return null;
    }, BOOT_TIMEOUT_MS, '含 window.__svi 的隔离世界出现');

    await send('Runtime.enable');
    await send('Page.enable');

    // ---------- 场景 2：隔离世界 + 扩展自验 ----------
    console.log('[Ext] Scenario 2: 隔离世界与扩展自验 ...');
    await send('Page.navigate', { url: PAGE_URL });
    const extCtx = await pickExtWorld();
    console.log('    扩展世界 = ' + (extCtx.name || '(无名)') + ' @ ' + extCtx.origin);

    const selfCheck = await evIn(`(() => {
      const m = chrome.runtime.getManifest();
      return { id: chrome.runtime.id, version: m.version, name: m.name };
    })()`, extCtx.id);
    assert.strictEqual(selfCheck.id, extId, '自验失败: 求值所在世界不是 loadUnpacked 加载的那个扩展');
    assert.strictEqual(selfCheck.version, wantVersion, `自验失败: 扩展版本应为 ${wantVersion}，实测 ${selfCheck.version}`);
    console.log('    自验通过: runtime.id 与版本一致 (' + selfCheck.version + ')');

    const isoType = await evIn('typeof window.__svi', extCtx.id);
    assert.strictEqual(isoType, 'object', '隔离世界里必须存在 window.__svi');
    assert.strictEqual(await evIn('window.__svi.version', extCtx.id), wantVersion, '隔离世界的 __svi.version 应等于扩展版本');

    const mainType = await evIn('typeof window.__svi'); // 不带 contextId = 页面主世界
    assert.strictEqual(mainType, 'undefined', '真扩展形态下主世界不得存在 window.__svi (隔离世界生效的判据)');
    const mainImgs = await evIn('document.querySelectorAll("img").length');
    assert.strictEqual(mainImgs, 2, 'DOM 为两世界共享: 主世界应看得到两张图');
    console.log('    主世界 typeof __svi = undefined ✓ | 主世界可见 img = ' + mainImgs);

    // ---------- 场景 3：反色真实生效（属性 + computedStyle） ----------
    console.log('[Ext] Scenario 3: 反色真实生效 (属性 + computedStyle) ...');
    const INV_EXPR = `(() => {
      const L = document.getElementById('light-img'), D = document.getElementById('dark-img');
      const inv = (e) => e.getAttribute('data-svi-inverted') === 'true';
      return {
        lightInv: inv(L), darkInv: inv(D),
        lightFilter: getComputedStyle(L).filter, darkFilter: getComputedStyle(D).filter,
        cssBytes: [...document.querySelectorAll('style')]
          .filter((s) => /data-svi-inverted/.test(s.textContent || ''))
          .reduce((n, s) => n + (s.textContent || '').length, 0),
        htmlClass: document.documentElement.className,
        pill: !!document.querySelector('.svi-capsule-root'),
      };
    })()`;
    const r3 = await waitFor(async () => {
      const v = await evIn(INV_EXPR);
      return v && v.lightInv ? v : null;
    }, BOOT_TIMEOUT_MS, '浅底图被判定为反色');
    console.log('    ' + JSON.stringify(r3));
    assert.strictEqual(r3.lightInv, true, '浅底图必须被判为反色');
    assert.strictEqual(r3.darkInv, false, '深底图必须保持不反色');
    assert.notStrictEqual(r3.lightFilter, 'none', '浅底图的 computedStyle.filter 不得为 none (属性写了必须真生效)');
    assert.ok(r3.cssBytes > 40000, '主样式表必须在场 (实测 ' + r3.cssBytes + ' 字节)');

    // ---------- 场景 4：chrome.storage 持久化（清掉 localStorage 后偏好仍存活，D5） ----------
    console.log('[Ext] Scenario 4: chrome.storage 持久化 (清 localStorage 后仍存活) ...');
    const before = await evIn(`(() => {
      const S = window.__svi;
      return { backend: (S.Store && S.Store.backend) || null, orig: S.prefs.hoverRestore !== false };
    })()`, extCtx.id);
    assert.ok(before.backend, '必须能读到 Store.backend');
    assert.ok(['chrome-sync', 'chrome-local'].includes(before.backend),
      `扩展形态下的存储后端必须是 chrome.storage 家族，实测 ${before.backend}`);
    console.log('    存储后端 = ' + before.backend + ' (非 localStorage/GM/memory)');

    // 翻转一个「可观察」偏好（hoverRestore 驱动 html.svi-hover-restore 类），走扩展自己的保存路径
    await evIn(`(async () => {
      window.__svi.prefs.hoverRestore = ${!before.orig};
      window.__svi.savePrefs();
      await new Promise((r) => setTimeout(r, 900));   // 防抖 300ms + 落盘余量
      return true;
    })()`, extCtx.id, true);

    // 清掉 localStorage —— 若偏好仍能恢复，说明真源是 chrome.storage
    await evIn('(localStorage.clear(), localStorage.length)');
    await send('Page.reload');
    isolatedContexts = [];
    const extCtx2 = await pickExtWorld();
    const after = await waitFor(async () => {
      const v = await evIn('(() => ({ hover: window.__svi.prefs.hoverRestore, cls: document.documentElement.className }))()', extCtx2.id);
      return v && v.cls ? v : null;
    }, BOOT_TIMEOUT_MS, '重载后重新引导完成');
    console.log('    重载后: hoverRestore = ' + after.hover + ' | htmlClass = ' + after.cls);
    assert.strictEqual(after.hover, !before.orig, '清掉 localStorage 并重载后，偏好必须仍存活 (chrome.storage 为真源)');
    assert.strictEqual(after.cls.includes('svi-hover-restore'), after.hover === true,
      '重载后 html 上的 svi-hover-restore 类必须与持久化后的偏好一致');

    console.log('\n🎉 真扩展 E2E 全部通过');
    cleanup();
    process.exit(0);
  } catch (e) {
    cleanup();
    console.error('\n❌ 真扩展 E2E 失败: ' + (e && e.message ? e.message : e));
    if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
  }
})();
