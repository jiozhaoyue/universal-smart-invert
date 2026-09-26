'use strict';
/*
 * test-extension.js — 真扩展 E2E（Trellis 任务 v6-5，阶段 2 + 阶段 3）
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
 *   2. 断言**真实生效**：不光看 DOM 属性，还要看 computedStyle.filter / 真实 DOM 变化；
 *   3. 降级到「未验证」而非「通过」：无 Chrome 时打印 SKIP 并以 0 退出（与 test-browser.js 同纪律）。
 *   4. 首屏时序只对**复访**断言：README §13 明写「首访站点一律不遮，宁可白闪一次也不白藏」，
 *      把首访也断言成零白闪就是与产品文档打架。
 *
 * 用法:
 *   node test-extension.js
 *   SVI_EXT_DIR=<副本> node test-extension.js     # 负向对照：跑一个被改坏的副本
 *   SVI_CHROME_PATH=/path/to/chrome node test-extension.js
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

// —— 本地 fixture ——
// 6 张图（5 浅底 + 1 深底）：不只是为了覆盖两种判定，还因为「本站反色率门」要求
// 样本 ≥ 5 且反色率 ≥ 35% 才会武装元素遮罩（README §13），图太少会让复访也过不了门，
// 于是「首屏零白闪」这条永远测不到。
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
const IMG_IDS = ['light1', 'light2', 'light3', 'light4', 'light5'];
// 每张图各自包一层 <figure>：**不能**让它们互为同级兄弟 —— balanced 图像策略里
// `gridSiblings >= 4` 会判为「缩略图网格」而整组跳过（产品按设计如此，见 passesImagePolicy），
// fixture 长得像网格就会让本套件测了个空。
const PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>svi extension bench</title>
<style>body{margin:0;padding:16px;background:#fff;font:14px/1.6 system-ui}
figure{display:block;margin:0 0 10px}img{display:block;width:320px;height:200px}</style></head>
<body>
<h1>真扩展形态基准页</h1>
${IMG_IDS.map((id) => `<figure><img id="${id}" src="/${id}.svg" alt="article figure ${id}"></figure>`).join('\n')}
<figure><img id="dark-img" src="/dark.svg" alt="article figure dark"></figure>
</body></html>`;

// —— 首屏时序探针（经 Page.addScriptToEvaluateOnNewDocument 在**页面脚本之前**装上）——
// 跑在**自己的隔离世界**里，不碰页面主世界：实测把探针注进主世界会让内容脚本的隔离世界
// 抓不到（`window.__svi` 找不到），是踩过的坑，别改回默认世界。DOM 是跨世界共享的，读得到。
const PROBE_WORLD = '__svi_fp_probe__';
const FP_PROBE = `(() => {
  const fp = { frames: 0, bare: {}, pendingFirstAt: null, invertedFirstAt: null, gateClassAt: null };
  window.__fp = fp;
  try {
    const t0 = performance.now();
    const raf = (fn) => (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(fn) : setTimeout(() => fn(performance.now()), 16);
    const marked = (el) => el.hasAttribute('data-svi-pending') || el.hasAttribute('data-svi-settled') || el.hasAttribute('data-svi-inverted');
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    function frame() {
      try {
        fp.frames++;
        const t = performance.now() - t0;
        const de = document.documentElement;
        if (de && de.classList && de.classList.contains('svi-img-invert-on') && fp.gateClassAt === null) fp.gateClassAt = t;
        const imgs = document.images || [];
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i];
          if (!(img.complete && img.naturalWidth > 0)) continue;
          if (img.hasAttribute('data-svi-pending') && fp.pendingFirstAt === null) fp.pendingFirstAt = t;
          if (img.hasAttribute('data-svi-inverted') && fp.invertedFirstAt === null) fp.invertedFirstAt = t;
          if (!marked(img) && visible(img)) {
            const key = img.id || img.src;
            const b = fp.bare[key] || (fp.bare[key] = { firstAt: t, frames: 0 });
            b.frames++;
          }
        }
      } catch (e) {
        // 逐帧捕获：漏在外面的异常会让 rAF 循环静默停摆，测出来的就只剩「帧数过少」这一现象
        fp.err = String(e && e.message || e);
        return;
      }
      if (fp.frames < 400) raf(frame);
    }
    raf(frame);
  } catch (e) { window.__fpError = String(e && e.message || e); }
})()`;

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      if (/^\/(light\d*|late)\.svg$/.test(u)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(LIGHT_SVG); return; }
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

  // ---------- 场景 0（纯 Node）：形态能力边界必须被文档如实说明（design D4 的降级断言） ----------
  console.log('[Ext] Scenario 0: 形态边界文档如实说明（无需浏览器） ...');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(/document_start/.test(readme), 'README 必须写明扩展形态的 document_start 通道');
  assert.ok(/document-end/.test(readme), 'README 必须写明用户脚本形态在 document-end 启动');
  assert.ok(/首屏元素已经渲染过了|首访站点一律不遮/.test(readme),
    'README 必须写明「用户脚本形态的首屏元素已渲染」或「首访不遮」这类降级事实，不得只宣传能力不提边界');
  console.log('    README 同时写明能力与边界 ✓');

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
  let popupWs = null;
  let optionsWs = null;
  const cleanup = () => {
    try { if (optionsWs) optionsWs.close(); } catch (e) { /* ignore */ }
    try { if (popupWs) popupWs.close(); } catch (e) { /* ignore */ }
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
      // rAF 是首屏时序的测量仪器：窗口一旦被其它窗口遮挡，Chromium 会把 rAF 节流到近乎停摆
      // （实测被遮挡时 500ms 只跑 1 帧），故必须关掉三类后台节流，否则测到的不是页面时序而是节流。
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
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

    // —— CDP 客户端（页面 target）——
    const connect = async (wsUrl) => {
      const sock = new WebSocket(wsUrl);
      let seq = 0;
      const pend = new Map();
      const ctxs = [];
      sock.onmessage = (m) => {
        const g = JSON.parse(m.data);
        if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); return; }
        if (g.method === 'Runtime.executionContextCreated') ctxs.push(g.params.context);
      };
      await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error('WebSocket 连接失败')); });
      const send = (method, params = {}) => new Promise((res, rej) => {
        const i = ++seq;
        // 带超时：目标一旦被关掉/导航走，响应永不到来，没有超时就会**永久挂住**
        // （踩过一次：把断言写在 Target.closeTarget 之后，整轮跑了十分钟才被人为掐掉）
        const timer = setTimeout(() => {
          if (pend.has(i)) { pend.delete(i); rej(new Error('CDP 超时 (' + method + ')：目标可能已关闭或已导航')); }
        }, 20000);
        pend.set(i, (g) => { clearTimeout(timer); res(g); });
        sock.send(JSON.stringify({ id: i, method, params }));
      });
      const ev = async (expr, ctxId, awaitPromise = false) => {
        const r = await send('Runtime.evaluate', {
          expression: expr, returnByValue: true, awaitPromise,
          ...(ctxId ? { contextId: ctxId } : {}),
        });
        // 协议级错误（例如 contextId 已随导航失效）必须**抛出**：静默返回 undefined
        // 会让「等条件成立」的轮询一直空转到超时，把真因藏起来（踩过）。
        if (r.error) throw new Error('CDP ' + (r.error.message || JSON.stringify(r.error)));
        const rr = r.result || {};
        if (rr.exceptionDetails) throw new Error('页面内求值抛错: ' + ((rr.exceptionDetails.exception || {}).description || rr.exceptionDetails.text));
        return rr.result ? rr.result.value : undefined;
      };
      return { sock, send, ev, ctxs, resetCtxs: () => { ctxs.length = 0; } };
    };

    const pageTarget = targets.find((t) => t.type === 'page');
    assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, '必须有可附着的 page target');
    const P = await connect(pageTarget.webSocketDebuggerUrl);
    ws = P.sock;

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
    // 挑选「真的含 window.__svi」的那个世界 —— 不靠世界名猜，自证式挑选。
    //  两个加固（都来自实测）：
    //   1) **倒序**试：新文档的上下文排在数组后面，先试它；
    //   2) 每次探测**有界**（2.5s）：导航后数组里可能残留已销毁的上下文 —— 对已销毁的
    //      contextId 求值不一定报错，而是**永不到来**，没有上限就会把整轮拖到 20s 超时。
    //      （超时被丢弃的探测挂在后台，故必须带 catch，避免未处理的 rejection 把进程打掉。）
    const probeWorld = (c) => {
      const p = P.ev('typeof window.__svi', c.id);
      p.catch(() => { /* 后台超时/失效：忽略 */ });
      return Promise.race([p, new Promise((res) => setTimeout(() => res('__timeout__'), 2500))]);
    };
    const pickExtWorld = () => waitFor(async () => {
      for (const c of P.ctxs.slice().reverse()) {
        try { if ((await probeWorld(c)) === 'object') return c; } catch (e) { /* 上下文已失效 */ }
      }
      return null;
    }, BOOT_TIMEOUT_MS, '含 window.__svi 的隔离世界出现');
    // 时序探针住在自己的隔离世界（PROBE_WORLD）里，按世界名取它
    const pickProbeWorld = () => waitFor(async () => P.ctxs.find((c) => c.name === PROBE_WORLD) || null,
      BOOT_TIMEOUT_MS, '时序探针世界 ' + PROBE_WORLD + ' 出现');
    const booted = async () => (await P.ev('document.documentElement.classList.contains("svi-img-invert-on")')) === true;

    await P.send('Runtime.enable');
    await P.send('Page.enable');

    // ---------- 场景 2：document_start 首屏时序（首访允许白闪 / 复访要求零白闪） ----------
    console.log('[Ext] Scenario 2: document_start 首屏时序（首访 vs 复访）...');
    const inst = await P.send('Page.addScriptToEvaluateOnNewDocument', { source: FP_PROBE, worldName: PROBE_WORLD });
    const probeInstalled = { result: inst.result };
    const FP_READ = `(() => {
      const inv = {}; let invCount = 0, imgCount = 0;
      const detail = [];
      for (const img of document.images) {
        imgCount++;
        const k = img.id || img.src;
        if (img.getAttribute('data-svi-inverted') === 'true') { inv[k] = 1; invCount++; }
        detail.push({ id: img.id, complete: img.complete, nw: img.naturalWidth,
          inv: img.getAttribute('data-svi-inverted'), pend: img.hasAttribute('data-svi-pending'),
          cls: img.className, filter: (getComputedStyle(img).filter || 'none').slice(0, 40),
          rect: (() => { const r = img.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; })() });
      }
      return { fp: window.__fp || null, err: window.__fpError || null, inv, invCount, imgCount, detail };
    })()`;

    const runOnce = async (label) => {
      // 每次导航前清掉上一次的上下文表：否则按名字挑世界会挑到**上一轮遗留的**已失效上下文
      P.resetCtxs();
      await P.send('Page.navigate', { url: PAGE_URL });
      await waitFor(booted, BOOT_TIMEOUT_MS, label + ': 反色门类落地');
      const pw = await pickProbeWorld();
      // 这个 fixture 在本地，扩展 125ms 就引导完了 —— 比前几帧还早。探针的 bare 是**累积**的
      // （只增不减），所以先等帧数攒够再读，读到的才是完整时序；帧数太少则时序不可信。
      await waitFor(async () => (await P.ev('window.__fp ? window.__fp.frames : 0', pw.id)) >= 60,
        8000, label + ': 探针攒够 60 帧');
      const r = await P.ev(FP_READ, pw.id);
      assert.ok(r.fp, label + ': 首屏探针必须在页面脚本之前装上');
      assert.ok(!r.err && !r.fp.err, label + ': 探针不得抛错 (setup: ' + r.err + ' / frame: ' + r.fp.err + ')');
      assert.ok(r.fp.frames >= 20, label + ': 探针帧数过少 (' + r.fp.frames + ')，时序不可信');
      // 非空真守卫：没有任何图被判反色时，「零白闪」是**空真**断言，必须挡住
      assert.ok(r.invCount >= 1, label + ': 至少要有一张图被判反色，否则零白闪断言是空真 (' + r.invCount + ')');
      const flashed = Object.keys(r.fp.bare || {}).filter((k) => r.inv[k]);
      console.log(`    ${label}: 帧数=${r.fp.frames} 图数=${r.imgCount} 判反色=${r.invCount}` +
        ` 门类@${r.fp.gateClassAt === null ? '-' : Math.round(r.fp.gateClassAt) + 'ms'}` +
        ` pending@${r.fp.pendingFirstAt === null ? '-' : Math.round(r.fp.pendingFirstAt) + 'ms'}` +
        ` 反色@${r.fp.invertedFirstAt === null ? '-' : Math.round(r.fp.invertedFirstAt) + 'ms'}`);
      console.log(`    ${label}: 曾以原色出现的图 = ${flashed.length ? flashed.join(', ') : '(无)'}` +
        (flashed.length ? '  → ' + JSON.stringify(r.fp.bare) : ''));
      console.log('    [dbg] 逐图: ' + r.detail.map((d) => `${d.id}:${d.inv === 'true' ? 'inv' : d.inv === 'false' ? 'keep' : '-'}/${d.complete ? d.nw : 'x'}/${d.filter}`).join(' '));
      return r;
    };

    const first = await runOnce('首访');
    // 等站点样本落盘（反色率门要 ≥5 样本 + ≥35% 才武装遮罩）
    await sleep(1500);
    const revisit = await runOnce('复访');
    await P.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: probeInstalled.result.identifier });

    // 门的机制断言（确定性，不依赖帧时序）：站点样本已记录且达门
    // 注意：这里**不能** resetCtxs —— 刚跑完复访、页面还停在 PAGE_URL 上，会话表里就是本轮上下文。
    const ctxT = await pickExtWorld();
    const gate = await P.ev(`(() => {
      // 键必须与产品一致: profileKey() = location.hostname（**不含端口**），别用 location.host
      const S = window.__svi, key = location.hostname;
      const me = S.siteMediaStore.stats(key);
      const d = S.maskShouldArm(key, { seen: me.seen, inverted: me.inverted, minSeen: 5, rateThreshold: 0.35 });
      return { key: key, storeKeys: Object.keys(S.siteMediaStore.load()), seen: me.seen, inverted: me.inverted,
        armed: !!d.armed, reason: d.reason, maskArmed: !!S.pendingMask.armed };
    })()`, ctxT.id);
    console.log('    站样本门: ' + JSON.stringify(gate));
    assert.ok(gate.seen >= 5, '复访前本站样本必须已记录 (样本数 ' + gate.seen + ')，否则复访也过不了门');
    assert.strictEqual(gate.armed, true, '样本与反色率达标后该门必须武装，实测: ' + gate.reason);

    // 结论断言：复访（遮罩已武装）下，被判反色的图**从未以原色出现过**
    const revisitedFlash = Object.keys(revisit.fp.bare || {}).filter((k) => revisit.inv[k]);
    assert.deepStrictEqual(revisitedFlash, [],
      '复访必须零白闪：下列图在被反色前曾以原色出现过 → ' + JSON.stringify(revisit.fp.bare));
    console.log('    复访零白闪 ✓（首访白闪次数按 README §13 允许，仅作证据打印）');

    // ---------- 场景 3：隔离世界 + 扩展自验 ----------
    console.log('[Ext] Scenario 3: 隔离世界与扩展自验 ...');
    P.resetCtxs();
    await P.send('Page.navigate', { url: PAGE_URL });
    const extCtx = await pickExtWorld();
    console.log('    扩展世界 = ' + (extCtx.name || '(无名)') + ' @ ' + extCtx.origin);

    const selfCheck = await P.ev(`(() => {
      const m = chrome.runtime.getManifest();
      return { id: chrome.runtime.id, version: m.version };
    })()`, extCtx.id);
    assert.strictEqual(selfCheck.id, extId, '自验失败: 求值所在世界不是 loadUnpacked 加载的那个扩展');
    assert.strictEqual(selfCheck.version, wantVersion, `自验失败: 扩展版本应为 ${wantVersion}，实测 ${selfCheck.version}`);
    console.log('    自验通过: runtime.id 与版本一致 (' + selfCheck.version + ')');

    assert.strictEqual(await P.ev('typeof window.__svi', extCtx.id), 'object', '隔离世界里必须存在 window.__svi');
    assert.strictEqual(await P.ev('window.__svi.version', extCtx.id), wantVersion, '隔离世界的 __svi.version 应等于扩展版本');

    const mainType = await P.ev('typeof window.__svi'); // 不带 contextId = 页面主世界
    assert.strictEqual(mainType, 'undefined', '真扩展形态下主世界不得存在 window.__svi (隔离世界生效的判据)');
    const mainImgs = await P.ev('document.querySelectorAll("img").length');
    assert.strictEqual(mainImgs, IMG_IDS.length + 1, 'DOM 为两世界共享: 主世界应看得到全部图片');
    console.log('    主世界 typeof __svi = undefined ✓ | 主世界可见 img = ' + mainImgs);

    // ---------- 场景 4：反色真实生效（属性 + computedStyle） ----------
    console.log('[Ext] Scenario 4: 反色真实生效 (属性 + computedStyle) ...');
    const INV_EXPR = `(() => {
      const D = document.getElementById('dark-img');
      const lights = ${JSON.stringify(IMG_IDS)}.map((id) => document.getElementById(id));
      return {
        lightInv: lights.map((e) => e.getAttribute('data-svi-inverted') === 'true'),
        darkInv: D.getAttribute('data-svi-inverted') === 'true',
        lightFilter: getComputedStyle(lights[0]).filter, darkFilter: getComputedStyle(D).filter,
        cssBytes: [...document.querySelectorAll('style')]
          .filter((s) => /data-svi-inverted/.test(s.textContent || ''))
          .reduce((n, s) => n + (s.textContent || '').length, 0),
        htmlClass: document.documentElement.className,
        pill: !!document.querySelector('.svi-capsule-root'),
      };
    })()`;
    const r4 = await waitFor(async () => {
      const v = await P.ev(INV_EXPR);
      return v && v.lightInv && v.lightInv.every(Boolean) ? v : null;
    }, BOOT_TIMEOUT_MS, '浅底图全部被判定为反色');
    console.log('    ' + JSON.stringify(r4));
    assert.strictEqual(r4.lightInv.every(Boolean), true, '5 张浅底图必须全部被判为反色');
    assert.strictEqual(r4.darkInv, false, '深底图必须保持不反色');
    assert.notStrictEqual(r4.lightFilter, 'none', '浅底图的 computedStyle.filter 不得为 none (属性写了必须真生效)');
    assert.ok(r4.cssBytes > 40000, '主样式表必须在场 (实测 ' + r4.cssBytes + ' 字节)');

    // ---------- 场景 5：chrome.storage 持久化（清掉 localStorage 后偏好仍存活，D5） ----------
    console.log('[Ext] Scenario 5: chrome.storage 持久化 (清 localStorage 后仍存活) ...');
    const before = await P.ev(`(() => {
      const S = window.__svi;
      return { backend: (S.Store && S.Store.backend) || null, orig: S.prefs.hoverRestore !== false };
    })()`, extCtx.id);
    assert.ok(before.backend, '必须能读到 Store.backend');
    assert.ok(['chrome-sync', 'chrome-local'].includes(before.backend),
      `扩展形态下的存储后端必须是 chrome.storage 家族，实测 ${before.backend}`);
    console.log('    存储后端 = ' + before.backend + ' (非 localStorage/GM/memory)');

    await P.ev(`(async () => {
      window.__svi.prefs.hoverRestore = ${!before.orig};
      window.__svi.savePrefs();
      await new Promise((r) => setTimeout(r, 900));   // 防抖 300ms + 落盘余量
      return true;
    })()`, extCtx.id, true);

    await P.ev('(localStorage.clear(), localStorage.length)');
    P.resetCtxs();
    await P.send('Page.reload');
    const extCtx2 = await pickExtWorld();
    const after = await waitFor(async () => {
      // 前置条件必须包含 **Store 已完成远端命名空间装载** —— 只等 htmlClass 是竞态：
      //   引导期先按默认值渲染出 htmlClass, 之后 Store.init() 才异步把远端 svi:prefs 装进来
      //   （onRemoteLoaded 里才 `state = loadState()`）。少等这一步会读到默认值, 表现为随机红。
      const v = await P.ev('(() => ({ hover: window.__svi.prefs.hoverRestore, cls: document.documentElement.className, loaded: !!(window.__svi.Store && window.__svi.Store._remoteLoaded) }))()', extCtx2.id);
      return v && v.cls && v.loaded ? v : null;
    }, BOOT_TIMEOUT_MS, '重载后重新引导完成且远端偏好已装载');
    console.log('    重载后: hoverRestore = ' + after.hover + ' | htmlClass = ' + after.cls);
    assert.strictEqual(after.hover, !before.orig, '清掉 localStorage 并重载后，偏好必须仍存活 (chrome.storage 为真源)');
    assert.strictEqual(after.cls.includes('svi-hover-restore'), after.hover === true,
      '重载后 html 上的 svi-hover-restore 类必须与持久化后的偏好一致');

    // ---------- 场景 6：popup 端到端（版本/主机/计数 + 三条消息协议 + 内部页 unavailable） ----------
    console.log('[Ext] Scenario 6: popup 端到端 ...');
    const POPUP_URL = `chrome-extension://${extId}/popup.html`;
    // 注意：popup.html 自带 `<body class="available">` 与占位 "—"，那是**作者写的初始值**；
    // popup.js 要等快照回来才翻转类并填字段。读太早会读到未落定的中间态（踩过）。
    const POPUP_STATE = `(() => ({
      cls: document.body ? document.body.className : '',
      ver: (document.getElementById('ver') || {}).textContent || '',
      host: (document.getElementById('host') || {}).textContent || '',
      counts: (document.getElementById('counts') || {}).textContent || '',
    }))()`;
    // 等 popup 快照落定：出现了 unavailable，或版本已被填上（= available 路径落定）
    const settledPopup = (evFn, label) => waitFor(async () => {
      const v = await evFn(POPUP_STATE);
      if (!v) return null;
      return (/unavailable/.test(v.cls) || /^v\d/.test(v.ver)) ? v : null;
    }, 10000, label);

    // —— 顺序说明（踩过的坑）：先验「打在真页面上的 popup」，最后才验「内部页降级」。
    //    因为把同一个标签页导航到 popup.html 会把 fixture 页顶掉，popup 就再也看不到
    //    带内容脚本的标签页了（实测 tabsN 会变成 1，只剩它自己）。

    // 6a. 用**浏览器级** target 另开一个 popup 页，并在其脚本之前打桩 `chrome.tabs.query`：
    //     这是唯一的测试替身 —— CDP 无法点工具栏图标，"打开 popup 时哪个标签页是活动的"只能靠它伪造。
    //     popup 自身逻辑、三条消息、内容脚本响应全部真实。
    const browserWsUrl = (await getJson('/json/version')).webSocketDebuggerUrl;
    const B = await connect(browserWsUrl);
    //     manifest 只有 storage 权限、没有 tabs 权限 → `tab.url` 拿不到，所以**不能**按 url 认标签页；
    //     改为「谁的内容脚本能应答快照，谁就是本页」。
    const STUB = `(() => {
      const realQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async () => {
        const tabs = await realQuery({});
        const answering = [];
        for (const t of tabs) {
          try {
            const r = await chrome.tabs.sendMessage(t.id, { type: 'svi-get-snapshot' });
            if (r && r.ok) answering.push(t);
          } catch (e) { /* 无内容脚本 */ }
        }
        return answering.length ? answering : tabs;
      };
    })()`;
    const created = await B.send('Target.createTarget', { url: POPUP_URL });
    const popupTargetId = created.result && created.result.targetId;
    assert.ok(popupTargetId, 'Target.createTarget 必须返回 targetId: ' + JSON.stringify(created.error || created));
    let popupInfo = null;
    for (let i = 0; i < 40 && !popupInfo; i++) {
      const list = await getJson('/json/list');
      popupInfo = list.find((t) => t.id === popupTargetId && t.webSocketDebuggerUrl);
      if (!popupInfo) await sleep(250);
    }
    assert.ok(popupInfo, '必须能附到新建的 popup target');
    const U = await connect(popupInfo.webSocketDebuggerUrl);
    popupWs = U.sock;
    await U.send('Runtime.enable');
    await U.send('Page.enable');
    const stubbed = await U.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    assert.ok(stubbed.result && stubbed.result.identifier, '打桩脚本必须被装上');
    await U.send('Page.reload');

    // 由 popup 页把消息发给**能应答的那个标签页**（真实内容脚本）并返回响应
    const relay = (msg) => U.ev(`(async () => {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        try { const r = await chrome.tabs.sendMessage(t.id, ${JSON.stringify(msg)}); if (r && r.ok) return r; } catch (e) { /* 无内容脚本 */ }
      }
      return null;
    })()`, undefined, true);

    const popupReady = await settledPopup((e) => U.ev(e), 'popup 快照落定(打桩页)');
    assert.ok(/(^|\s)available(\s|$)/.test(popupReady.cls),
      '打桩后 popup 应进入 available 态，实测 className=' + popupReady.cls);
    console.log('    available 形态: ver="' + popupReady.ver + '" host="' + popupReady.host + '" counts="' + popupReady.counts + '"');
    assert.strictEqual(popupReady.ver, 'v' + wantVersion, 'popup 必须渲染扩展版本');
    assert.strictEqual(popupReady.host, '127.0.0.1', 'popup 必须渲染本站主机名');
    assert.ok(/6/.test(popupReady.counts), 'popup 计数行必须反映本站 6 张图，实测: ' + popupReady.counts);

    // 6b. 三条消息协议往返 —— 由 popup 页发往真实内容脚本，并断言**真实效果**
    const snap = await relay({ type: 'svi-get-snapshot' });
    assert.ok(snap, 'svi-get-snapshot 必须从内容脚本拿到快照');
    assert.strictEqual(snap.version, wantVersion, '快照版本应为 ' + wantVersion);
    assert.strictEqual(snap.host, '127.0.0.1', '快照主机应为 127.0.0.1');
    assert.strictEqual(snap.counts.img, IMG_IDS.length + 1, '快照应报告 ' + (IMG_IDS.length + 1) + ' 张图');
    console.log('    svi-get-snapshot → ' + JSON.stringify({ ok: snap.ok, version: snap.version, host: snap.host, counts: snap.counts }));

    const off = await relay({ type: 'svi-site-power', on: false });
    assert.ok(off && off.ok === true && off.siteActive === false, 'svi-site-power{on:false} 应返回 {ok:true, siteActive:false}，实测 ' + JSON.stringify(off));
    const torn = await waitFor(async () => (await P.ev('document.querySelectorAll(\'[data-svi-inverted="true"]\').length')) === 0,
      BOOT_TIMEOUT_MS, '关站后反色被拆除');
    assert.strictEqual(torn, true, '关站后本站不得再有被判反色的元素');
    console.log('    svi-site-power{off} → 反色已拆除 ✓');

    const on = await relay({ type: 'svi-site-power', on: true });
    assert.ok(on && on.ok === true && on.siteActive === true, 'svi-site-power{on:true} 应返回 siteActive:true，实测 ' + JSON.stringify(on));
    // 把 fixture 页**拉回前台**：popup 是独立标签页，它会抢走活动态，隐藏标签页里 rAF/idle 近乎停摆，
    // 引擎的重扫就不会推进（这属于测量环境问题，不是产品行为 —— 真实使用中 popup 是浮在页面上的）。
    await P.send('Page.bringToFront');
    const restored = await waitFor(
      async () => { const n = await P.ev('document.querySelectorAll(\'[data-svi-inverted="true"]\').length'); return n > 0 ? n : null; },
      10000, '开站后反色恢复').catch(() => null);
    if (restored === null) {
      const diag = await P.ev(`(() => ({
        htmlClass: document.documentElement.className,
        imgs: [...document.images].map((i) => i.id + ':' + i.getAttribute('data-svi-inverted') + '/' + i.hasAttribute('data-svi-checked-src')),
      }))()`);
      console.log('    [dbg] 开站后未恢复: ' + JSON.stringify(diag));
    }
    assert.ok(restored !== null, 'svi-site-power{on:true} 后反色必须恢复');
    console.log('    svi-site-power{on} → 反色已恢复 (' + restored + ' 张) ✓');

    const prefRes = await relay({ type: 'svi-set-pref', key: 'imagePolicy', value: 'conservative' });
    assert.ok(prefRes && prefRes.ok === true, 'svi-set-pref 应返回 ok:true，实测 ' + JSON.stringify(prefRes));
    // 主世界读不到 state，改由隔离世界核实「真的落到内容脚本的偏好上」
    // 注意：这里同样**不能** resetCtxs —— 页面没导航，会话表里就是当前上下文（踩过一次）
    const ctxP = await pickExtWorld();
    const applied = await P.ev('window.__svi.prefs.imagePolicy', ctxP.id);
    assert.strictEqual(applied, 'conservative', 'svi-set-pref 必须真的落到内容脚本的偏好上，实测 ' + applied);
    console.log('    svi-set-pref{imagePolicy:conservative} → 内容脚本偏好已更新 ✓');

    // 6d. v6.4 R3：三页签可切换（反色 / 本站 / 更多 —— 对齐 Dark Reader 的信息架构）
    const tabsInfo = await U.ev(`(() => {
      const names = ['filter', 'sites', 'more'];
      const vis = () => names.filter((n) => !document.getElementById('panel-' + n).hidden);
      const out = { buttons: names.map((n) => !!document.getElementById('tab-btn-' + n)), before: vis() };
      document.getElementById('tab-btn-sites').click();
      out.afterSites = vis();
      out.sitesSel = document.getElementById('tab-btn-sites').getAttribute('aria-selected');
      document.getElementById('tab-btn-more').click();
      out.afterMore = vis();
      document.getElementById('tab-btn-filter').click();
      out.afterFilter = vis();
      return out;
    })()`);
    console.log('    页签: ' + JSON.stringify(tabsInfo));
    assert.deepStrictEqual(tabsInfo.buttons, [true, true, true], 'popup 必须有 反色/本站/更多 三个页签');
    assert.deepStrictEqual(tabsInfo.before, ['filter'], '默认应停在「反色」页签，且同时只显示一个面板');
    assert.deepStrictEqual(tabsInfo.afterSites, ['sites'], '点「本站」应切到站点面板');
    assert.strictEqual(tabsInfo.sitesSel, 'true', '被选中的页签 aria-selected 必须为 true');
    assert.deepStrictEqual(tabsInfo.afterMore, ['more'], '点「更多」应切到更多面板');
    assert.deepStrictEqual(tabsInfo.afterFilter, ['filter'], '点回「反色」应切回');

    // 6e. v6.4 R3：站点名单只读摘要渲染（用「本站」页签的字段，与快照新增字段对齐）
    const siteInfo = await U.ev(`(() => ({
      mode: document.getElementById('site-mode').textContent,
      counts: document.getElementById('site-counts').textContent,
      overridden: document.getElementById('overridden').textContent,
      preview: document.getElementById('list-preview').textContent,
      verMore: document.getElementById('ver-more').textContent,
    }))()`);
    console.log('    站点名单: ' + JSON.stringify(siteInfo));
    assert.strictEqual(siteInfo.mode, '全部启用', '默认站点管理模式应渲染为「全部启用」');
    assert.ok(/黑名单 0 · 白名单 0/.test(siteInfo.counts), '名单条目行应报告黑/白名单条数，实测 ' + siteInfo.counts);
    assert.strictEqual(siteInfo.overridden, '0 个站点', '初始应无本站覆盖，实测 ' + siteInfo.overridden);
    assert.ok(siteInfo.preview && siteInfo.preview.length > 0, '名单摘要行不应为空');
    assert.strictEqual(siteInfo.verMore, 'v' + wantVersion, '「更多」页签也应渲染版本');

    // 6e2. 「更多」页签的三个入口必须在场，且设置页 URL 可解析
    //（只断言存在与可解析，不点「打开设置页」—— 它会 window.close() 掉本页，后续断言就没了）
    const moreInfo = await U.ev(`(() => ({
      btns: ['open-settings', 'open-options', 'reset-site'].map((id) => !!document.getElementById(id)),
      optionsUrl: chrome.runtime.getURL('options.html'),
    }))()`);
    assert.deepStrictEqual(moreInfo.btns, [true, true, true], '「更多」页签必须有 设置面板/设置页/清除覆盖 三个入口');
    assert.ok(/options\.html$/.test(moreInfo.optionsUrl), 'options.html 的扩展 URL 必须可解析，实测 ' + moreInfo.optionsUrl);

    // 6f. v6.4 R3：新增协议 svi-site-reset —— 先用面板自己的三态循环造出本站覆盖，再断言真被清掉
    const ctxW = await pickExtWorld();
    const seeded = await P.ev(`(() => {
      window.__svi.ui.cycleTriState('imageInvert');
      return Object.keys(window.__svi.prefs.siteOverrides || {});
    })()`, ctxW.id);
    assert.deepStrictEqual(seeded, ['127.0.0.1'], '必须先在扩展里造出本站覆盖，实测 ' + JSON.stringify(seeded));
    const snapBefore = await relay({ type: 'svi-get-snapshot' });
    assert.strictEqual(snapBefore.overriddenSites, 1, '快照应报告 1 个有覆盖的站点，实测 ' + snapBefore.overriddenSites);
    const resetRes = await relay({ type: 'svi-site-reset' });
    assert.ok(resetRes && resetRes.ok === true && resetRes.cleared === true,
      'svi-site-reset 应返回 {ok:true, cleared:true}，实测 ' + JSON.stringify(resetRes));
    const leftOver = await P.ev('Object.keys(window.__svi.prefs.siteOverrides || {}).length', ctxW.id);
    assert.strictEqual(leftOver, 0, '清除后本站覆盖必须为空，实测 ' + leftOver);
    const snapAfter = await relay({ type: 'svi-get-snapshot' });
    assert.strictEqual(snapAfter.overriddenSites, 0, '清除后快照的覆盖站点数应归零');
    console.log('    svi-site-reset → 本站覆盖已清空 ✓');

    // ---------- 场景 7：扩展设置页（options）端到端（v6.4 R1b） ----------
    //  为什么必须放在真浏览器里：html 的 token/面板 CSS 由构建注入、控件由抽出的 SviControls 搭、
    //  写入走 chrome.storage 的 svi:prefs 协议 —— 这三件事在 Node 桩里都证明不了。
    //  断言口径：① 与**真源 schema** 逐键比对渲染结果（不漏项 / 不多项 / 每类都是真控件）
    //           ② 页面上改一项 → 真的落到 svi:prefs（等 300ms 防抖）
    //           ③ 内容脚本重载后读到该值；④ 反向：内容脚本改 → options 重载后也读到（双向同步）
    console.log('[Ext] Scenario 7: 扩展设置页 (options) 端到端 ...');
    const schemaSrc = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8');
    const schemaBlock = /\/\* v6\.4-SETTINGS-SCHEMA-START \*\/([\s\S]*?)\/\* v6\.4-SETTINGS-SCHEMA-END \*\//.exec(schemaSrc);
    assert.ok(schemaBlock, 'options 场景: 必须能从用户脚本抽出设置清单真源');
    const SCHEMA = new Function(schemaBlock[1] + '\nreturn SVI_SETTINGS_SCHEMA;')();
    const DEF = new Function('return (' + /const DEFAULT_PREFS = (\{[\s\S]*?\n  \});/.exec(schemaSrc)[1] + ')')();
    const wantKeys = SCHEMA.reduce((a, g) => a.concat(g.items.map((it) => it.key)), []);
    const kindCount = (k) => SCHEMA.reduce((n, g) => n + g.items.filter((it) => it.kind === k).length, 0);

    const OPTIONS_URL = `chrome-extension://${extId}/options.html`;
    const createdOpt = await B.send('Target.createTarget', { url: OPTIONS_URL });
    const optTargetId = createdOpt.result && createdOpt.result.targetId;
    assert.ok(optTargetId, 'Target.createTarget(options.html) 必须返回 targetId: ' + JSON.stringify(createdOpt.error || createdOpt));
    let optInfo = null;
    for (let i = 0; i < 40 && !optInfo; i++) {
      const list = await getJson('/json/list');
      optInfo = list.find((t) => t.id === optTargetId && t.webSocketDebuggerUrl);
      if (!optInfo) await sleep(250);
    }
    assert.ok(optInfo, '必须能附到新建的 options target');
    const O = await connect(optInfo.webSocketDebuggerUrl);
    optionsWs = O.sock;
    await O.send('Runtime.enable');
    await O.send('Page.enable');

    // 测试侧的最小「分片感知」读取（与内容脚本 Store.readRaw 同规则）：
    // 断言 raw 存储而不是页面内存对象 —— 那样才是真的证明了「落盘」。
    const readPrefsRaw = () => O.ev(`(async () => {
      const g = (k) => new Promise((res) => chrome.storage.sync.get(k, (r) => res(r[k] === undefined ? null : r[k])));
      const metaRaw = await g('svi:prefs.meta');
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        let s = '';
        for (let i = 0; i < (meta.chunks || 0); i++) { const p = await g('svi:prefs#' + i); if (p == null) return null; s += p; }
        return s;
      }
      return g('svi:prefs');
    })()`, undefined, true);

    const optCount = await waitFor(async () => {
      const v = await O.ev('window.__sviOptions ? window.__sviOptions.itemCount : 0');
      return v > 0 ? v : null;
    }, BOOT_TIMEOUT_MS, 'options 页渲染完成');

    // 7a. 渲染结果与真源逐键比对
    //   v6.4 R2b: 控件词汇里出现了**复合控件**（colorList 的添加行带 1 个取色器；listEditor 的添加表单
    //   带 N 个下拉 + M 个文本框）。它们内部的原生元素**不属于**该 kind 自身的控制件，因此全局计数
    //   必须把「位于某个复合控件行内部」的元素排除掉 —— 否则「下拉数 == select+hour 项数」这条
    //   会因为复合控件多出几个下拉而失效（而那是好设计导致的，不是回归）。
    //   排除口径按**真源**判定（复合行的 key 来自 schema），不写死类名。
    const rendered = await O.ev(`(() => {
      const cards = [...document.querySelectorAll('main > .svi-collapsible')];
      const COMPOSITE = new Set((window.SVI_SETTINGS_SCHEMA || [])
        .flatMap((g) => g.items)
        .filter((it) => it.kind === 'colorList' || it.kind === 'listEditor')
        .map((it) => it.key));
      const inner = (el) => {
        let p = el.parentElement;
        while (p) {
          if (p.dataset && p.dataset.sviKey && COMPOSITE.has(p.dataset.sviKey)) return true;
          p = p.parentElement;
        }
        return false;
      };
      const outer = (sel) => [...document.querySelectorAll(sel)].filter((e) => !inner(e)).length;
      return {
        keys: [...document.querySelectorAll('[data-svi-key]')].map((e) => e.dataset.sviKey),
        groups: cards.map((e) => ({
          title: (e.querySelector('.svi-sec-title span') || {}).textContent || '',
          items: e.querySelectorAll('[data-svi-key]').length,
        })),
        heads: document.querySelectorAll('.svi-collapsible-head').length,
        checkboxes: outer('input[type=checkbox]'),
        ranges: outer('input[type=range]'),
        numbers: outer('input[type=number]'),
        selects: outer('select'),
        textareas: outer('textarea'),
        colors: outer('input[type=color]'),
        chips: document.querySelectorAll('.svi-color-chip').length,
        // 复合控件自带件的**真源驱动**核对（比全局计数更严：逐项按 schema 的字段形状比对）
        composite: (window.SVI_SETTINGS_SCHEMA || []).flatMap((g) => g.items)
          .filter((it) => it.kind === 'colorList' || it.kind === 'listEditor')
          .map((it) => {
            const row = document.querySelector('[data-svi-key="' + it.key + '"]');
            const fields = it.fields || [];
            const addBtn = row
              ? (row.querySelector('.svi-er-form button.svi-mini-btn') || row.querySelector('.svi-color-picker-controls button.svi-mini-btn'))
              : null;
            return {
              key: it.key,
              kind: it.kind,
              selects: row ? row.querySelectorAll('select').length : -1,
              wantSelects: fields.filter((f) => f.kind === 'select').length,
              texts: row ? row.querySelectorAll('input.svi-modal-text').length : -1,
              wantTexts: it.kind === 'listEditor' ? fields.filter((f) => f.kind !== 'select').length : 0,
              colors: row ? row.querySelectorAll('input[type=color]').length : -1,
              wantColors: it.kind === 'colorList' ? 1 : 0,
              addLabel: addBtn ? addBtn.textContent : '',
              wantAddLabel: it.addLabel || '',
            };
          }),
        errs: [...document.querySelectorAll('.svi-msg-error')].map((e) => e.textContent),
        area: window.__sviOptions.storageArea(),
        declaredGroups: window.__sviOptions.schemaGroups,
      };
    })()`);
    assert.strictEqual(optCount, wantKeys.length, 'options 页声明的项数必须等于真源项数');
    assert.strictEqual(rendered.declaredGroups, SCHEMA.length, 'options 页声明的分组数必须等于真源分组数');
    assert.deepStrictEqual(rendered.keys.slice().sort(), wantKeys.slice().sort(),
      'options 页渲染出的控件键必须与真源**逐键一致**（漏一项 / 多一项都算失败）');
    assert.deepStrictEqual(rendered.groups.map((g) => g.title), SCHEMA.map((g) => g.title),
      '分组标题必须与真源一致（顺序也一致）');
    assert.deepStrictEqual(rendered.groups.map((g) => g.items), SCHEMA.map((g) => g.items.length),
      '每个分组的项数必须与真源一致');
    assert.strictEqual(rendered.heads, SCHEMA.length, '每个分组都要有可折叠的标题行');
    assert.deepStrictEqual(rendered.errs, [], 'options 页不得出现「未实现的控件类型」告警: ' + JSON.stringify(rendered.errs));
    assert.strictEqual(rendered.area, 'sync', '扩展形态下 options 页应把偏好写在 chrome.storage.sync 上');
    assert.strictEqual(rendered.checkboxes, kindCount('toggle'), '开关控件数必须等于 schema 里 toggle 的项数');
    assert.strictEqual(rendered.ranges, kindCount('slider'), '滑块数必须等于 schema 里 slider 的项数');
    assert.strictEqual(rendered.numbers, kindCount('slider'), '每个滑块都要配一个数值输入框');
    assert.strictEqual(rendered.selects, kindCount('select') + kindCount('hour'), '下拉数必须等于 select + hour 的项数');
    assert.strictEqual(rendered.textareas, kindCount('text'), '多行文本框数必须等于 text 的项数');
    assert.strictEqual(rendered.colors, kindCount('color'), '取色器数必须等于 color 的项数（复合控件内部的取色器不计入）');
    assert.strictEqual(rendered.chips, 4, '色卡多选应渲染出 4 张浅色色卡');

    // 7a-2. 复合控件 (colorList / listEditor) 的「自带件」必须与真源声明的字段形状逐项对上
    //   —— 这比原来的全局计数更严：它按 schema 的 fields 声明核对每个复合控件里到底有几个什么控件。
    for (const c of rendered.composite) {
      assert.strictEqual(c.selects, c.wantSelects, c.key + ' 的添加表单下拉数必须等于 schema 声明的字段数');
      assert.strictEqual(c.texts, c.wantTexts, c.key + ' 的添加表单文本框数必须等于 schema 声明的字段数');
      assert.strictEqual(c.colors, c.wantColors, c.key + ' 的取色器数必须等于 schema 的声明');
      assert.strictEqual(c.addLabel, c.wantAddLabel, c.key + ' 的添加按钮文案必须等于 schema 的声明');
    }
    assert.ok(rendered.composite.length >= 2, '至少要有 colorList 与 listEditor 各一项落在设置页上');
    console.log('    复合控件: ' + rendered.composite.map((c) => c.key + '(' + c.kind + ' 下拉' + c.selects + '/文本框' + c.texts + '/取色器' + c.colors + ')').join(' '));
    console.log('    渲染: ' + rendered.groups.length + ' 组 / ' + rendered.keys.length + ' 项'
      + ' | 开关 ' + rendered.checkboxes + ' 滑块 ' + rendered.ranges + ' 下拉 ' + rendered.selects
      + ' 文本框 ' + rendered.textareas + ' 取色器 ' + rendered.colors + ' 色卡 ' + rendered.chips
      + ' | 存储后端 ' + rendered.area);

    // 7b. 渲染出来的值必须来自已存偏好（否则只是画了个壳）
    const shown = await O.ev(`(() => {
      const row = document.querySelector('[data-svi-key="maskBlur"]');
      const num = row && row.querySelector('input[type=number]');
      const togg = document.querySelector('[data-svi-key="hoverRestore"] input[type=checkbox]');
      const preset = document.querySelector('[data-svi-key="presetId"] select');
      return { num: num ? num.value : null, toggle: togg ? togg.checked : null, preset: preset ? preset.value : null };
    })()`);
    const raw0 = await readPrefsRaw();
    const stored0 = raw0 ? JSON.parse(raw0) : {};
    assert.strictEqual(shown.num, String(stored0.maskBlur), '滑块应显示已存偏好值');
    assert.strictEqual(shown.toggle, stored0.hoverRestore, '开关应显示已存偏好值');
    assert.strictEqual(shown.preset, stored0.presetId, '下拉应显示已存偏好值');
    console.log('    已存偏好回填: maskBlur=' + shown.num + ' hoverRestore=' + shown.toggle + ' presetId=' + shown.preset);

    // 7c. **先让 fixture 页腾位置**（这一步是本场景的实测教训，不是绕路）：
    //   内容脚本在 pagehide / visibilitychange(hidden) 时会 `flushEverything()` —— 把自己
    //   **内存里那份**偏好整份回写。所以「另一个界面刚写完」的窗口里若有旧页卸载，写入会被
    //   覆盖回旧值（实测：options 写 13 → 导航 P 时旧页整份回写 8 → 新页读到的是 8）。
    //   跨界面同步的真实口径因此是：**写入必须发生在旧页回写之后**（新开/刷新页面即见，
    //   但已打开且持有旧镜像的页面会把它按回去）。这里先把旧页导航走、等回写落盘，再写。
    await P.send('Page.navigate', { url: 'about:blank' });
    await sleep(1200);   // 卸载回写 = flushPrefsNow（防抖 300ms）+ Store.flush（400ms）+ 余量
    const parked = await readPrefsRaw();
    assert.ok(parked, 'fixture 页腾位置后, svi:prefs 必须仍然读得到（不许把偏好写丢）');
    console.log('    旧页已腾位置（卸载回写落盘: maskBlur=' + JSON.parse(parked).maskBlur + '）');

    // 7d. 在设置页上改一项 → 落到 svi:prefs（走真实的控件事件 + 300ms 防抖）
    const NEW_BLUR = 13;
    assert.notStrictEqual(NEW_BLUR, Number(JSON.parse(parked).maskBlur), 'fixture 前提: 新值必须不同于已存值, 否则断言是空真');
    const drove = await O.ev(`(() => {
      const num = document.querySelector('[data-svi-key="maskBlur"] input[type=number]');
      num.value = '${NEW_BLUR}';
      num.dispatchEvent(new Event('input', { bubbles: true }));   // 与用户输入同一条事件路径
      return num.value;
    })()`);
    assert.strictEqual(drove, String(NEW_BLUR), '数值框必须接受新值');
    const flushed = await waitFor(async () => {
      const raw = await readPrefsRaw();
      if (!raw) return null;
      let obj = null; try { obj = JSON.parse(raw); } catch (e) { return null; }
      return Number(obj.maskBlur) === NEW_BLUR ? obj : null;
    }, 8000, 'maskBlur=' + NEW_BLUR + ' 落到 svi:prefs');
    assert.strictEqual(Number(flushed.maskBlur), NEW_BLUR, 'options 页的改动必须真的落到存储里');
    const statusText = await O.ev('(document.getElementById("status") || {}).textContent || ""');
    assert.ok(/已保存/.test(statusText), '落盘后状态行应报告已保存, 实测: ' + JSON.stringify(statusText));
    console.log('    改 maskBlur=' + NEW_BLUR + ' → svi:prefs 已更新 (状态行: ' + statusText + ') ✓');

    // 7d-2. v6.4 R2b 新增的两个**复合控件**必须真的能写（渲染对 ≠ 能用；这条防「画了个壳」）
    //   色卡列表: 设探针色 → 点「添加屏蔽颜色」; 元素规则: 填选择器 → 点「添加规则」
    const preShield = Array.isArray(JSON.parse(parked).shieldColors) ? JSON.parse(parked).shieldColors : [];
    const preRules = Array.isArray(JSON.parse(parked).elementRules) ? JSON.parse(parked).elementRules : [];
    let PROBE_COLOR = '#123456';
    for (let i = 0; preShield.indexOf(PROBE_COLOR) >= 0 && i < 16; i++) {
      PROBE_COLOR = '#' + ((parseInt(PROBE_COLOR.slice(1), 16) + 0x111111) & 0xffffff).toString(16).padStart(6, '0');
    }
    assert.strictEqual(preShield.indexOf(PROBE_COLOR), -1, 'fixture 前提: 探针色不得已在既有屏蔽列表里');
    const PROBE_SEL = '#svi-r2b-probe';
    const droveComposite = await O.ev(`(() => {
      const shieldRow = document.querySelector('[data-svi-key="shieldColors"]');
      const native = shieldRow.querySelector('input[type=color]');
      native.value = '${PROBE_COLOR}';
      native.dispatchEvent(new Event('input', { bubbles: true }));
      shieldRow.querySelector('.svi-color-picker-controls button.svi-mini-btn').click();
      const listRow = document.querySelector('[data-svi-key="elementRules"]');
      const form = listRow.querySelector('.svi-er-form');
      const input = form.querySelector('input.svi-modal-text');
      input.value = '${PROBE_SEL}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.querySelector('button.svi-mini-btn').click();
      return {
        chips: shieldRow.querySelectorAll('.svi-shield-chip').length,
        rows: listRow.querySelectorAll('.svi-learned-row').length,
        formCleared: form.querySelector('input.svi-modal-text').value === '',
      };
    })()`);
    assert.strictEqual(droveComposite.chips, preShield.length + 1, '点「添加屏蔽颜色」应当场多出一张色卡');
    assert.strictEqual(droveComposite.rows, preRules.length + 1, '点「添加规则」应当场多出一行规则');
    assert.ok(droveComposite.formCleared, '添加成功后选择器输入框必须被清空（便于连续添加）');
    let compositeDbg = null;
    const compositeFlushed = await waitFor(async () => {
      const raw = await readPrefsRaw();
      if (!raw) return null;
      let obj = null; try { obj = JSON.parse(raw); } catch (e) { return null; }
      compositeDbg = { shield: obj.shieldColors, rules: obj.elementRules };
      const okColor = Array.isArray(obj.shieldColors) && obj.shieldColors.indexOf(PROBE_COLOR) >= 0;
      const okRule = Array.isArray(obj.elementRules) && obj.elementRules.some((r) => r && r.selector === PROBE_SEL && r.pattern === '*' && r.action === 'invert');
      return okColor && okRule ? obj : null;
    }, 8000, '复合控件的写入落到 svi:prefs').catch(() => null);
    assert.ok(compositeFlushed, '两个复合控件的写入都必须真的落到存储里; 实测 ' + JSON.stringify(compositeDbg));
    console.log('    复合控件写入 → svi:prefs: shieldColors +' + PROBE_COLOR + ' · elementRules +' + PROBE_SEL + ' ✓');

    // 7e. 内容脚本（新装的页面）读到该值 = 「刷新页面即见」
    P.resetCtxs();
    await P.send('Page.navigate', { url: PAGE_URL });
    await P.send('Page.bringToFront');   // 隐藏标签页里 rAF/idle 会停摆（踩过），把被测页拉回前台
    // 每轮重新挑世界 + 兜住导航瞬间的求值失败：上下文换代时旧 id 可能不再应答（踩过）
    let seenByPage = null;
    const readByPage = await waitFor(async () => {
      try {
        const c = await pickExtWorld();
        if (!c) return null;
        const v = await P.ev(`(() => {
          const S = window.__svi;
          if (!S || !S.prefs) return null;
          return {
            blur: S.prefs.maskBlur,
            backend: S.Store && S.Store.backend,
            hasShield: Array.isArray(S.prefs.shieldColors) && S.prefs.shieldColors.indexOf('${PROBE_COLOR}') >= 0,
            hasRule: Array.isArray(S.prefs.elementRules) && S.prefs.elementRules.some((r) => r && r.selector === '${PROBE_SEL}' && r.pattern === '*'),
            ruleId: (Array.isArray(S.prefs.elementRules) ? S.prefs.elementRules.find((r) => r && r.selector === '${PROBE_SEL}') : null),
          };
        })()`, c.id);
        seenByPage = v;
        return v && Number(v.blur) === NEW_BLUR ? v.blur : null;
      } catch (e) { return null; }
    }, BOOT_TIMEOUT_MS, '内容脚本装载到 options 写入的 maskBlur').catch(() => null);
    if (readByPage === null) {
      const rawNow = await readPrefsRaw();
      console.log('    [dbg] 重载后内容脚本读到 ' + JSON.stringify(seenByPage)
        + ' | 存储里的 svi:prefs.maskBlur=' + (rawNow ? JSON.parse(rawNow).maskBlur : '(读不到)'));
    }
    assert.strictEqual(Number(readByPage), NEW_BLUR, '重载后的内容脚本必须读到 options 页写入的值');
    const ctxPage = await pickExtWorld();
    console.log('    内容脚本重载后 prefs.maskBlur = ' + readByPage + ' ✓');
    // 同上：复合控件的写入也必须被内容脚本吃到（并照常走 normalizeElementRules 归一）
    assert.ok(seenByPage && seenByPage.hasShield, '内容脚本必须读到 options 写入的屏蔽色');
    assert.ok(seenByPage && seenByPage.hasRule, '内容脚本必须读到 options 写入的元素规则');
    assert.ok(seenByPage.ruleId && typeof seenByPage.ruleId.id === 'string' && seenByPage.ruleId.id.length > 0,
      '内容脚本侧的规则必须已带上由 normalizeElementRules 单点派生的 id');
    console.log('    内容脚本重载后: 屏蔽色 ' + PROBE_COLOR + ' 在场 · 元素规则 ' + PROBE_SEL
      + ' 在场 (id=' + seenByPage.ruleId.id + ') ✓');

    // 7e. 反向：内容脚本改一项 → options 页重载后读到（双向同步的另一半）
    const NEW_OPACITY = 0.35;
    assert.notStrictEqual(NEW_OPACITY, Number(DEF.maskHoverOpacity), 'fixture 前提: 反向用例的新值也必须不同于默认值');
    await P.ev(`(async () => {
      window.__svi.prefs.maskHoverOpacity = ${NEW_OPACITY};
      window.__svi.savePrefs();
      await new Promise((r) => setTimeout(r, 900));   // 防抖 300ms + 落盘余量
      return true;
    })()`, ctxPage.id, true);
    await O.send('Page.reload');
    const backRead = await waitFor(async () => {
      try {
        const v = await O.ev(`(() => {
          if (!window.__sviOptions) return null;
          const num = document.querySelector('[data-svi-key="maskHoverOpacity"] input[type=number]');
          return num ? num.value : null;
        })()`);
        return v === String(NEW_OPACITY) ? v : null;
      } catch (e) { return null; }   // 重载瞬间默认上下文尚未就绪 → 下一轮再试
    }, BOOT_TIMEOUT_MS, 'options 页重载后读到内容脚本写入的 maskHoverOpacity');
    assert.strictEqual(backRead, String(NEW_OPACITY), 'options 页重载后必须读到内容脚本写入的值');
    console.log('    内容脚本写入 maskHoverOpacity=' + NEW_OPACITY + ' → options 重载后已读到 ✓');

    // 收尾: 把这轮改过的项还原成**本轮开始前**的样子, 免得影响后续场景（用内容脚本自己的写点, 与产品同一路径）
    await P.ev(`(async () => {
      window.__svi.prefs.maskBlur = ${Number(DEF.maskBlur)};
      window.__svi.prefs.maskHoverOpacity = ${Number(DEF.maskHoverOpacity)};
      window.__svi.prefs.shieldColors = ${JSON.stringify(preShield)};
      window.__svi.prefs.elementRules = ${JSON.stringify(preRules)};
      window.__svi.savePrefs();
      await new Promise((r) => setTimeout(r, 900));
      return true;
    })()`, ctxPage.id, true);
    const restoredRaw = await readPrefsRaw();
    const restoredObj = restoredRaw ? JSON.parse(restoredRaw) : {};
    assert.strictEqual(Number(restoredObj.maskBlur), Number(DEF.maskBlur), '收尾必须把 maskBlur 还原成默认值');
    assert.strictEqual(Number(restoredObj.maskHoverOpacity), Number(DEF.maskHoverOpacity), '收尾必须把 maskHoverOpacity 还原成默认值');
    assert.deepStrictEqual(restoredObj.shieldColors || [], preShield, '收尾必须把屏蔽色列表还原成进场时的样子');
    assert.deepStrictEqual(restoredObj.elementRules || [], preRules, '收尾必须把元素规则列表还原成进场时的样子');
    console.log('    收尾还原: maskBlur=' + restoredObj.maskBlur + ' maskHoverOpacity=' + restoredObj.maskHoverOpacity
      + ' shieldColors=' + (restoredObj.shieldColors || []).length + ' 项 elementRules=' + (restoredObj.elementRules || []).length + ' 项 ✓');

    await B.send('Target.closeTarget', { targetId: optTargetId });   // 关掉之后不再断言（超时坑，见文件头）

    await U.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubbed.result.identifier });
    await B.send('Target.closeTarget', { targetId: popupTargetId });

    // 6c. 内部页降级（放在最后：这一步会把本页标签页顶掉）。
    //     未打桩地把 popup.html 当普通标签页打开 —— 它的「活动标签页」就是它自己（内部页），
    //     内容脚本不存在，因此必须渲染 `unavailable` 并保留占位值（真实行为，非模拟）。
    await P.send('Page.navigate', { url: POPUP_URL });
    const unavail = await settledPopup((e) => P.ev(e), 'popup 快照落定(内部页)');
    console.log('    内部页形态: body.className = "' + unavail.cls + '" | #ver 文本 = "' + unavail.ver + '"');
    assert.ok(/(^|\s)unavailable(\s|$)/.test(unavail.cls),
      'popup 在无内容脚本的页面上必须渲染 unavailable 态，实测 className=' + unavail.cls);
    assert.strictEqual(unavail.ver, '—', '内部页上 popup 不得渲染版本号（应保持占位），实测 ' + unavail.ver);

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
