// 看图类插件「放大浮层」反色探针 —— 合成夹具版 (Step 1.1)
//
// 目的: 裁决 design.md §7 阻塞表里不依赖第三方源码的几行 ——
//   M6  浮层 src 与缩略图 src 不同 → decisionBySrc 是否不命中
//   H1  「浮层插入 → 属性落地」的时延量级 (时延竞争是不是真瓶颈)
//   M1  跨域浮层像素不可读时的实际走向 (taint / 有无网络回退)
//   M11 srcset 换源 / 元素被替换 是否漏唤醒 (attachPendingWake 覆盖度)
//
// 零外部依赖: 自带 PNG 编码 (zlib) + 两个本地源站造跨域, 不联网、不装包。
// 用法:
//   node scripts/probe-viewer-overlay.js                 # 注入形态 (document_start 等价)
//   node scripts/probe-viewer-overlay.js --mode=late     # 晚注入形态 (@run-at document-end 近似)
//   node scripts/probe-viewer-overlay.js --json=out.jsonl
//
// 输出: stdout 人类可读表 + JSONL (每用例一行, 见 design.md §4.3)

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const CHROME_PATH = process.env.SVI_CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = Number(process.env.SVI_PROBE_PORT || 9224);

const argv = process.argv.slice(2);
const MODE = (argv.find((a) => a.startsWith('--mode=')) || '--mode=inject').split('=')[1];
const JSON_OUT = (argv.find((a) => a.startsWith('--json=')) || '').split('=')[1] || '';
// 机器卡 / 网络慢 的诚实模拟 (而不是靠推测)
const CPU_RATE = Number((argv.find((a) => a.startsWith('--cpu=')) || '').split('=')[1] || 0);
const NET_LATENCY = Number((argv.find((a) => a.startsWith('--net-latency=')) || '').split('=')[1] || 0);
// --ext: 不注入用户脚本, 改为把 extension/ 作为**真扩展**加载 (Extensions.loadUnpacked)。
// 目的: 判定扩展形态在「跨域无 CORS 原图」上的实际能力 —— 其 GM_xmlhttpRequest 是纯 fetch 垫片。
// 注意: 扩展跑在 isolated world, 主世界读不到 window.__svi, 故本模式下只看 DOM 属性 (用户可见的真相)。
const EXT_MODE = argv.includes('--ext');
// --gm: 装一个「真特权」GM_xmlhttpRequest 垫片 (经 CDP 转到 Node 侧取字节, 不受 CORS 限制),
//   用来代表「用户脚本 + 油猴」形态。默认关闭 (默认注入形态等于「无 GM 的下界」)。
const GM_MODE = argv.includes('--gm');
// --plugin=<dir>: 把第三方看图插件作为**真扩展**加载 (Extensions.loadUnpacked),
//   本脚本仍用注入形态 —— 避免两个扩展互相干扰 (design §4.1 选型)。
const PLUGIN_DIR = (argv.find((a) => a.startsWith('--plugin=')) || '').split('=')[1] || '';
const PIPE_MODE = EXT_MODE || !!PLUGIN_DIR;
// --mask: 额外跑一个「加载前遮罩」用例 (慢速大图 + 走生产路径武装 media 档)
const MASK_MODE = argv.includes('--mask');
// --inherit: 跑「原图链接继承」用例 (慢速原图 → 应靠继承提前反色) —— R3.2 的收益证据
const INHERIT_MODE = argv.includes('--inherit');
const EXT_DIR = path.join(__dirname, '..', 'extension');

// ===== 最小 PNG 编码 (真彩 8bit, 无滤波) =====
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0; // filter type 0
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = rgb[0]; raw[p + 1] = rgb[1]; raw[p + 2] = rgb[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const LIGHT_PNG = makePng(240, 160, [245, 245, 245]);   // 亮图 → 期望反色
const DARK_PNG = makePng(240, 160, [18, 18, 18]);       // 暗图 → 期望 keep (反例)
const LIGHT2_PNG = makePng(200, 140, [248, 246, 240]);  // 另一张亮图 (overlay 专用 src)
const BIG_LIGHT_PNG = makePng(2400, 1600, [244, 244, 244]); // 「原图」量级 (测解码成本)
// 6 张互不相同的文章内嵌照片 (测「浮层继承缩略图结论」时的继承源)
const THUMB_PNGS = [
  makePng(300, 220, [246, 246, 244]), makePng(360, 260, [250, 248, 240]),
  makePng(420, 300, [240, 246, 248]), makePng(480, 340, [252, 250, 246]),
  makePng(540, 380, [244, 244, 250]), makePng(600, 420, [248, 244, 244]),
];
const BIG_PNGS = [
  makePng(1800, 1300, [248, 248, 246]), makePng(1900, 1400, [252, 250, 244]),
  makePng(2000, 1500, [244, 248, 250]), makePng(2100, 1600, [254, 252, 248]),
  makePng(2200, 1700, [246, 246, 252]), makePng(2300, 1800, [250, 246, 246]),
];

// ===== 夹具页 (origin A = 内容页; origin B = 跨域图片源) =====
const CASES = ['C1_fresh_sameorigin', 'C2_seen_src', 'C3_crossorigin', 'C4_srcset_swap',
  'C5_node_replace', 'C6_dark_negative', 'C7_big_sameorigin', 'C8_bgimage_overlay'];

function fixtureHtml(thumbsrc) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>SVI overlay probe</title>
<style>
  body{margin:0;background:#fff;font:14px/1.5 sans-serif}
  /* 刻意不做等宽网格 —— 均匀网格会命中封面网格启发式 (passesCoverGuard) 而整体 skip,
     那样夹具基线就不成立。这里是「文章页内嵌照片」形态。 */
  #content{max-width:760px;margin:0 auto;padding:16px 20px}
  #content img{display:block;margin:20px 0;height:auto}
  #content p{margin:12px 0}
  .ov{position:fixed;left:40px;top:40px;width:560px;height:380px;z-index:2147483000;
      box-shadow:0 8px 40px rgba(0,0,0,.4);object-fit:contain;background:#fff}
  .ovbg{position:fixed;left:40px;top:40px;width:560px;height:380px;z-index:2147483000;
        background-size:contain;background-repeat:no-repeat;background-color:#fff}
  #probeHost{position:fixed;left:0;top:0;width:0;height:0;}
</style></head><body>
<div id="content" class="content">
  <p>探针夹具: 文章页内嵌照片 (非线性网格), 用于测「悬停放大浮层」的反色行为。</p>
</div>
<div id="probeHost"></div>
<script>
window.__probe = { t0:null, added:null, inverted:null, attrInverted:null, failedAt:null, srcChangedAt:null, events:[] };
// 缩略图: 12 张互不相同的亮图 (刻意不复用同一 src —— 同 src 重复 ≥3 且尺寸偏小会被策略判
//   repeated-small 而 skip, 那会让「浮层继承缩略图结论」这条用例测不出东西)
(function(){
  const g = document.getElementById('content');
  for (let i=0;i<6;i++){
    // 看图插件的通用触发形态: <a href="原图.ext"><img 缩略图></a>
    const a = document.createElement('a');
    a.href = '/big-' + i + '.png';
    a.dataset.thumbLink = String(i);
    const im = document.createElement('img');
    im.src = '/thumb-' + i + '.png';
    im.dataset.thumb = String(i);
    // 尺寸刻意逐张不同: 同父同标签且尺寸 ±8px 的兄弟 >=4 会被判「网格贴图」而 skip
    im.style.width = (300 + i * 70) + 'px';
    a.appendChild(im);
    g.appendChild(a);
    const p = document.createElement('p');
    p.textContent = '正文段落 ' + (i+1) + ' —— 照片之间夹正文, 避免形成网格骨架。';
    g.appendChild(p);
  }
  // 继承源: href 指向慢速原图, 内部缩略图是同内容的快图 → 缩略图先有权威结论,
  //   浮层(src=该 href)出现时应当**继承**它, 而不必等那 2.5s
  const ah = document.createElement('a');
  ah.href = '/big-slow.png';
  ah.id = 'inherit-link';
  const th = document.createElement('img');
  th.src = '/thumb-inh.png';
  th.style.width = '430px';   // 与 #content 里那 6 张同形态 (300~600px), 避免被封面/骨架启发式 skip
  ah.appendChild(th);
  g.appendChild(ah);
})();
window.__probeUrls = { light:'${thumbsrc}/light.png', light2:'${thumbsrc}/light2.png',
                       dark:'${thumbsrc}/dark.png', thumb:'/thumb-0.png' };
// 时间线观测: MutationObserver 记「浮层节点插入」; rAF 轮询记「反色属性落地」
// 扫描"浮层": 先找高 z-index 的定位容器, 再把**容器内的所有媒体**一并上报
//   (第三方插件常把真正 <img> 放在容器里且自身 position:static —— 只按定位筛会漏掉它)
window.__probeFindOverlays = function(){
  const isOurUI = (el) => !!(el.closest && (el.closest('.svi-capsule-root') || el.closest('.svi-modal-mask')
    || el.closest('.svi-panel-card') || el.closest('.svi-action-toast')));
  const seen = new Set();
  const containers = [];
  const media = [];
  const mediaInfo = (el) => {
    let cs; try { cs = getComputedStyle(el); } catch (e) { return null; }
    const r = el.getBoundingClientRect();
    return {
      tag: String(el.tagName || '').toLowerCase(), id: el.id || '',
      cls: String(el.className || '').slice(0, 50),
      src: String(el.currentSrc || el.getAttribute('src') || '').slice(0, 130),
      pos: cs.position, w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility,
      natural: [el.naturalWidth || 0, el.naturalHeight || 0],
      inverted: el.getAttribute('data-svi-inverted'), fx: el.hasAttribute('data-svi-fx'),
      bginv: el.hasAttribute('data-svi-bginv'), checked: el.hasAttribute('data-svi-checked-src'),
      failed: el.hasAttribute('data-svi-failed'), pending: el.hasAttribute('data-svi-pending'),
      filter: cs.filter,
    };
  };
  const addMedia = (scope, who) => {
    let ms = []; try { ms = scope.querySelectorAll('img,video,canvas'); } catch (e) { return; }
    for (const m of ms) {
      if (seen.has(m) || isOurUI(m)) continue;
      seen.add(m);
      const info = mediaInfo(m);
      if (info) media.push(Object.assign(info, { inContainer: who }));
    }
  };
  const visit = (root) => {
    let all = []; try { all = root.querySelectorAll('*'); } catch (e) { return; }
    for (const el of all) {
      try { if (el.shadowRoot) visit(el.shadowRoot); } catch (e) {}
      if (isOurUI(el)) continue;
      let cs; try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (!(r.width >= 150 && r.height >= 120)) continue;
      const zi = parseInt(cs.zIndex, 10);
      if (isNaN(zi) || zi < 1000) continue;
      const who = (el.id || String(el.className || '').slice(0, 30) || el.tagName);
      containers.push({
        id: el.id || '', cls: String(el.className || '').slice(0, 50), z: zi, pos: cs.position,
        w: Math.round(r.width), h: Math.round(r.height), shadow: !!el.shadowRoot,
        bg: (cs.backgroundImage && cs.backgroundImage !== 'none') ? cs.backgroundImage.slice(0, 90) : null,
      });
      addMedia(el, who);
      try { if (el.shadowRoot) addMedia(el.shadowRoot, who + '#shadow'); } catch (e) {}
    }
  };
  visit(document);
  const dec = {};
  try {
    const e = window.__svi && window.__svi.engines && window.__svi.engines.image;
    if (e) for (const m of media) { const rec = m.src && e.decisionBySrc.get(m.src); if (rec) dec[m.src] = { verdict: rec.verdict, reason: rec.reason, provisional: !!rec.provisional }; }
  } catch (e) {}
  const pm = (window.__svi && window.__svi.pendingMask) || null;
  // 页面指纹: 用来判定"第三方插件的内容脚本到底有没有跑" (Imagus 走 chrome.userScripts,
  //   需要用户在扩展详情页手动允许「Allow User Scripts」, CDP 无法代翻)
  const fp = {};
  try {
    fp.htmlChildren = [...document.documentElement.children]
      .map((e) => e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.slice(0, 24) : ''))
      .slice(0, 12);
    fp.hasImagus = !!document.querySelector('#imagus-popup') || !!document.querySelector('div[class*="imagus"]');
    fp.styleCount = document.querySelectorAll('style').length;
    fp.sviOwner = document.documentElement.dataset.sviOwner || null;
    fp.sviMasking = document.documentElement.hasAttribute('data-svi-masking');
  } catch (e) { fp.err = String(e && e.message); }
  return { containers: containers, media: media, decisions: dec, fingerprint: fp,
           maskArmed: !!(pm && pm.armed), maskCount: pm ? pm.count : 0 };
};

window.__probeArm = function(){
  window.__probe = { t0: performance.now(), added:null, inverted:null,
                     attrInverted:null, failedAt:null, srcChangedAt:null, events:[] };
  const P = window.__probe;
  const isOv = (n) => n && n.nodeType===1 &&
    (n.classList && (n.classList.contains('ov') || n.classList.contains('ovbg')));
  const mo = new MutationObserver((ms)=>{
    for (const m of ms){
      if (m.type==='childList'){
        for (const n of m.addedNodes){ if (isOv(n) && P.added===null) P.added = performance.now(); }
      }
      if (m.type==='attributes'){
        const t = m.target;
        if (!isOv(t)) continue;
        const at = performance.now();
        if (P.added!==null) P.events.push(m.attributeName + '@' + +(at - P.t0).toFixed(1));
        // 属性落地时刻 (MO 观测, 不受 rAF 节流影响) —— lag 的主口径
        if (P.added!==null && P.attrInverted===null &&
            (m.attributeName==='data-svi-inverted' || m.attributeName==='data-svi-fx' || m.attributeName==='data-svi-bginv')){
          P.attrInverted = at;
        }
        if (P.added!==null && P.failedAt===null && m.attributeName==='data-svi-failed') P.failedAt = at;
        if (P.added!==null && P.srcChangedAt===null && (m.attributeName==='src' || m.attributeName==='srcset')) P.srcChangedAt = at;
      }
    }
  });
  mo.observe(document.body, {childList:true, subtree:true, attributes:true,
    attributeFilter:['data-svi-inverted','data-svi-fx','data-svi-bginv','data-svi-checked-src','data-svi-failed','src','srcset']});
  P._mo = mo;
  (function poll(){
    const o = document.querySelector('.ov') || document.querySelector('.ovbg');
    if (o && P.added!==null && P.inverted===null){
      const inv = o.getAttribute('data-svi-inverted')==='true'
        || o.hasAttribute('data-svi-fx') || o.hasAttribute('data-svi-bginv')
        || getComputedStyle(o).filter.indexOf('invert')>=0;
      if (inv) P.inverted = performance.now();
    }
    requestAnimationFrame(poll);
  })();
  P.t0 = performance.now();
};
// 走**生产路径**武装 media 档遮罩: 与面板按钮同款 (写 siteOverrides[host].pendingMask='on'
//   → setupPendingMask())。探针不发明新入口。
window.__probeArmMask = function(){
  try {
    const svi = window.__svi;
    if (!svi || !svi.setupPendingMask) return { ok: false, why: 'no-svi' };
    svi.prefs.flashGuardLevel = 'media';
    const ov = (svi.prefs.siteOverrides = svi.prefs.siteOverrides || {});
    const key = location.hostname;
    ov[key] = Object.assign(ov[key] || {}, { pendingMask: 'on' });
    svi.setupPendingMask();
    const pm = svi.pendingMask;
    return { ok: true, key: key, armed: !!(pm && pm.armed), masking: document.documentElement.hasAttribute('data-svi-masking') };
  } catch (e) { return { ok: false, why: String(e && e.message) }; }
};

// 采样某元素的"占位观感": 背景色/可见性/滤镜 —— 用来判定盒子是深色还是白的
window.__probeSampleBox = function(sel){
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    vis: cs.visibility, bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0, 60),
    filter: cs.filter, pending: el.hasAttribute('data-svi-pending'),
    settled: el.getAttribute('data-svi-settled'),
    inverted: el.getAttribute('data-svi-inverted'),
    nw: el.naturalWidth || 0, complete: !!el.complete,
    w: Math.round(r.width), h: Math.round(r.height), opacity: cs.opacity,
  };
};

window.__probeCaseSrc = function(c){
  const U = window.__probeUrls;
  const rel = (c==='C2_seen_src') ? U.thumb
    : (c==='C3_crossorigin') ? U.light
    : (c==='C6_dark_negative') ? '/dark.png'
    : (c==='C7_big_sameorigin') ? '/big.png'
    : (c==='C9_mask_slow') ? '/big-slow.png'
    : (c==='C10_inherit_slow') ? '/big-slow.png'
    : '/overlay-fresh.png';
  const a = document.createElement('a'); a.href = rel; return a.href;
};
// 触发: 六种用例
window.__probeRun = function(c){
  const U = window.__probeUrls;
  const host = document.getElementById('probeHost');
  window.__probeArm();
  const add = (el) => host.appendChild(el);
  const mkImg = (src, cls) => { const i = document.createElement('img'); i.className = cls||'ov'; i.src = src; return i; };
  if (c==='C1_fresh_sameorigin'){ add(mkImg('/overlay-fresh.png')); return; }
  if (c==='C2_seen_src'){ add(mkImg(U.thumb)); return; }
  if (c==='C3_crossorigin'){ add(mkImg(U.light)); return; }
  if (c==='C6_dark_negative'){ add(mkImg('/dark.png')); return; }
  if (c==='C7_big_sameorigin'){ add(mkImg('/big.png')); return; }
  if (c==='C9_mask_slow'){ add(mkImg('/big-slow.png')); return; }
  if (c==='C10_inherit_slow'){ add(mkImg('/big-slow.png')); return; }
  if (c==='C8_bgimage_overlay'){
    const d = document.createElement('div');
    d.className = 'ovbg';
    d.style.backgroundImage = 'url(/overlay-fresh.png)';
    add(d);
    return;
  }
  if (c==='C4_srcset_swap'){
    const i = mkImg('/thumb-0.png'); add(i);
    // 换源: 插件常把 srcset 指向更大图 (元素不变, 内容变)
    setTimeout(()=>{ i.srcset='/overlay-fresh.png 2x'; i.src='/overlay-fresh.png'; }, 60);
    return;
  }
  if (c==='C5_node_replace'){
    const i = mkImg('/thumb-0.png'); add(i);
    // 模拟插件换元素: 旧节点被移除, 新节点带新 src
    setTimeout(()=>{ const j = mkImg('/overlay-fresh.png'); i.replaceWith(j); }, 60);
    return;
  }
};
</script></body></html>`;
}

// ===== 两个本地源站 =====
function serve(routes) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      const hit = routes[u];
      if (!hit) { res.writeHead(404); res.end('nope'); return; }
      // body 可为函数 (延迟求值: 需要另一个源站的端口时用)
      const body = (typeof hit.body === 'function') ? hit.body() : hit.body;
      const emit = () => {
        res.writeHead(200, { 'Content-Type': hit.type, 'Content-Length': body.length,
          // 刻意不发 CORS 头 (源站 B 走这条) → 跨域画布污染
          ...(hit.cors ? { 'Access-Control-Allow-Origin': '*' } : {}) });
        res.end(body);
      };
      // delayMs: 造「媒体晚到」的窗口, 用于观测加载前遮罩 (否则本地图瞬间就到, 遮罩看不见)
      if (hit.delayMs) setTimeout(emit, hit.delayMs); else emit();
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// ===== CDP 小工具 =====
function cdpGet(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Node 侧取字节 (不受页面 CORS 限制) —— 特权 GM 垫片的实现基础
function nodeGetBytes(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    http.get({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// 页面侧垫片源码 (必须在用户脚本之前执行)
const GM_SHIM_SOURCE = `(function(){
  var c = 0, pend = {};
  window.__gmDeliver = function(rid, b64){
    var o = pend[rid]; if (!o) return; delete pend[rid];
    try {
      var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
      for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
      var blob = new Blob([u]);
      o.onload({ status: 200, response: blob, responseHeaders: '' });
    } catch (e) { try { o.onerror && o.onerror(e); } catch (e2) {} }
  };
  window.GM_xmlhttpRequest = function(o){
    var rid = 'g' + (++c); pend[rid] = o;
    try { __gmReq(JSON.stringify({ rid: rid, url: o.url })); }
    catch (e) { try { o.onerror && o.onerror(e); } catch (e2) {} }
  };
  window.GM = { xmlHttpRequest: window.GM_xmlhttpRequest };
})();`;

// ===== 主流程 =====
(async () => {
  // 源站 A: 夹具页 + 同源图片 (带 CORS, 用于 C1/C2); 源站 B: 跨域图片 (无 CORS, 用于 C3)
  const A = await serve({
    '/': { type: 'text/html; charset=utf-8', body: () => Buffer.from(fixtureHtml('http://127.0.0.1:' + B.port), 'utf8') },
    '/light.png': { type: 'image/png', body: LIGHT_PNG, cors: true },
    '/light2.png': { type: 'image/png', body: LIGHT2_PNG, cors: true },
    '/dark.png': { type: 'image/png', body: DARK_PNG, cors: true },
    '/big.png': { type: 'image/png', body: BIG_LIGHT_PNG, cors: true },
    // 慢 2.5s 的大图: 遮罩观测窗口 (实现按用户要求改为「深色占盒」后, 此处应读到深色)
    '/big-slow.png': { type: 'image/png', body: BIG_LIGHT_PNG, cors: true, delayMs: 2500 },
    '/thumb-inh.png': { type: 'image/png', body: LIGHT2_PNG, cors: true },
    ...Object.fromEntries(THUMB_PNGS.map((b, i) => [`/thumb-${i}.png`, { type: 'image/png', body: b, cors: true }])),
    ...Object.fromEntries(THUMB_PNGS.map((b, i) => [`/big-${i}.png`, { type: 'image/png', body: BIG_PNGS[i], cors: true }])),
    '/overlay-fresh.png': { type: 'image/png', body: LIGHT2_PNG, cors: true },
  });
  const B = await serve({
    '/light.png': { type: 'image/png', body: LIGHT_PNG },          // 无 CORS → 污染
    '/light2.png': { type: 'image/png', body: LIGHT2_PNG },
    '/dark.png': { type: 'image/png', body: DARK_PNG },
  });
  const html = fixtureHtml(`http://127.0.0.1:${B.port}`);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svi-overlay-probe-'));
  if (EXT_MODE && !fs.existsSync(EXT_DIR)) { console.error('extension/ 不存在, 先跑 node scripts/build-extension.js'); process.exit(1); }
  const PLUGIN_PATH = PLUGIN_DIR ? path.resolve(PLUGIN_DIR) : '';
  if (PLUGIN_PATH && !fs.existsSync(PLUGIN_PATH)) { console.error('插件目录不存在: ' + PLUGIN_PATH); process.exit(1); }
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    ...(PIPE_MODE
      // 与 test-extension.js 同形: Extensions.loadUnpacked 只能走 pipe, 且该套件是 headed 形态
      ? ['--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--window-size=1280,900']
      : ['--headless=new']),
    '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader',
    // AGENTS.md: 三个节流/后台化开关缺一, 窗口被遮挡时 rAF 会掉到 ~1 帧/500ms
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
    'about:blank',
  ], { stdio: PIPE_MODE ? ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] : 'ignore' });

  // —— pipe 客户端 (只在 EXT_MODE 下用于 Extensions.loadUnpacked) ——
  let pipeBuf = '';
  const pipePending = new Map();
  let pipeSeq = 0;
  const pipeSend = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++pipeSeq;
    pipePending.set(i, resolve);
    chrome.stdio[3].write(JSON.stringify({ id: i, method, params }) + '\u0000');
    setTimeout(() => { if (pipePending.has(i)) { pipePending.delete(i); reject(new Error('pipe 超时: ' + method)); } }, 15000);
  });
  if (PIPE_MODE) {
    chrome.stdio[4].on('data', (chunk) => {
      pipeBuf += chunk.toString('utf8');
      let idx;
      while ((idx = pipeBuf.indexOf('\u0000')) !== -1) {
        const msg = pipeBuf.slice(0, idx);
        pipeBuf = pipeBuf.slice(idx + 1);
        try {
          const g = JSON.parse(msg);
          if (g.id && pipePending.has(g.id)) { pipePending.get(g.id)(g); pipePending.delete(g.id); }
        } catch (e) { /* ignore */ }
      }
    });
  }

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await cdpGet(CDP_PORT, '/json/list'); if (targets) break; } catch (e) {}
    await sleep(300);
  }
  if (!targets) { console.error('CDP 不可达'); chrome.kill(); A.srv.close(); B.srv.close(); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  // 必须**等 onopen** 才能发消息: 未打开就 ws.send, 请求会石沉大海 → 表现为无超时能力的
  //   "永久挂住"。Imagus 启动更重 (多一个 SW + userScripts 通道), 实测正是栽在这里。
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WS 未在 20s 内打开')), 20000);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = (e) => { clearTimeout(t); reject(new Error('WS 连接失败: ' + (e.message || 'unknown'))); };
  });
  ws.onerror = (e) => { console.error('WS 错误 (已连接后)', e.message || e); };
  let id = 0;
  const pending = new Map();
  const pageExns = [];
  const ctxs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.executionContextCreated') { ctxs.push(msg.params.context); }
    else if (msg.method === 'Runtime.consoleAPICalled') {
      try {
        const txt = (msg.params.args || []).map((a) => (a.value !== undefined ? a.value : (a.description || ''))).join(' ');
        if (/SVI-SW|SVI-INH|SVI-DIAG/.test(txt)) pageExns.push('[console] ' + txt);
      } catch (e) { /* ignore */ }
    }
    else if (msg.method === 'Runtime.exceptionThrown') {
      pageExns.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    } else if (msg.method === 'Runtime.bindingCalled' && msg.params.name === '__gmReq') {
      let req = null;
      try { req = JSON.parse(msg.params.payload); } catch (e) { /* ignore */ }
      if (req && req.rid) {
        nodeGetBytes(req.url)
          .then((buf) => evaluate(`window.__gmDeliver(${JSON.stringify(req.rid)}, ${JSON.stringify(buf.toString('base64'))})`))
          .catch(() => evaluate(`window.__gmDeliver(${JSON.stringify(req.rid)}, '')`));
      }
    }
  };
  // send 必须带超时: 目标一旦被关掉/导航走, 响应永不到来 → 无超时就是**永久挂住**
  //   (AGENTS.md 已记载该坑; 本次实测又踩了一次 —— 探针 400s 无输出)。
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => {
      if (pending.has(i)) { pending.delete(i); rej(new Error('CDP 超时 (' + method + ')')); }
    }, 20000);
    pending.set(i, (g) => { clearTimeout(timer); res(g); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const dbg = (m) => process.stderr.write('[probe] ' + m + '\n');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
    }
    return r.result?.result?.value;
  };

  await sleep(400);
  await send('Runtime.enable');
  await send('Page.enable');
  if (CPU_RATE > 0) {
    await send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
    console.log(`[限速] CPU 降速 x${CPU_RATE}`);
  }
  if (NET_LATENCY > 0) {
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', {
      offline: false, latency: NET_LATENCY,
      downloadThroughput: 500 * 1024 / 8, uploadThroughput: 500 * 1024 / 8,
    });
    console.log(`[限速] 网络往返 +${NET_LATENCY}ms / 500kbps`);
  }

  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();

  const rows = [];
  const record = (o) => { rows.push(o); console.log(JSON.stringify(o)); };

  if (PLUGIN_PATH) {
    dbg('loadUnpacked: ' + PLUGIN_PATH);
    const loaded = await pipeSend('Extensions.loadUnpacked', { path: PLUGIN_PATH });
    const pid = loaded.result && loaded.result.id;
    if (!pid) { console.error('插件加载失败: ' + JSON.stringify(loaded.error || loaded)); chrome.kill(); process.exit(1); }
    console.log('[Plugin] 已加载第三方扩展 id=' + pid + ' ← ' + PLUGIN_PATH);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    await send('Page.navigate', { url: `http://127.0.0.1:${A.port}/` });
  } else if (GM_MODE && !EXT_MODE) {
    await send('Runtime.addBinding', { name: '__gmReq' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: GM_SHIM_SOURCE });
    console.log('[GM] 已装特权 GM_xmlhttpRequest 垫片 (经 CDP 转发到 Node 侧取字节)');
  }
  if (EXT_MODE) {
    const loaded = await pipeSend('Extensions.loadUnpacked', { path: EXT_DIR });
    const extId = loaded.result && loaded.result.id;
    if (!extId) { console.error('扩展加载失败: ' + JSON.stringify(loaded.error || loaded)); chrome.kill(); process.exit(1); }
    console.log('[Ext] 已加载扩展 id=' + extId + ' (isolated world; 本模式只看 DOM 属性)');
    await send('Page.navigate', { url: `http://127.0.0.1:${A.port}/` });
  } else if (MODE === 'inject') {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    await send('Page.navigate', { url: `http://127.0.0.1:${A.port}/` });
  } else {
    await send('Page.navigate', { url: `http://127.0.0.1:${A.port}/` });
  }

  // 有头形态 (ext 走的通道) 下窗口可能不在前台 → rAF/IO 空闲回调停摆, 后几个用例会
  //   **完全不被处理**, 看起来像产品缺陷 (AGENTS.md 已记载这一类假缺陷)。置前台 + 焦点模拟。
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  await sleep(1200);   // 等内容脚本起来, 隔离世界才存在
  if (EXT_MODE) {
    // 诊断 R3.3: 后台脚本是否真的起来了 + 内容脚本发消息的真实结果
    const list = await cdpGet(CDP_PORT, '/json/list');
    const types = (list || []).map((t) => t.type + (t.url ? ':' + String(t.url).slice(0, 50) : ''));
    console.log('[SW 诊断] targets: ' + JSON.stringify(types));
    const iso = ctxs.find((c) => c.auxData && c.auxData.isDefault === false);
    console.log('[SW 诊断] isolated ctx: ' + (iso ? iso.id : 'NONE'));
    if (iso) {
      const r = await send('Runtime.evaluate', {
        contextId: iso.id, returnByValue: true, awaitPromise: true,
        expression: `(new Promise(function(res){
          try {
            chrome.runtime.sendMessage({ type: 'svi-fetch-bytes', url: 'http://127.0.0.1:${B.port}/light.png' }, function (out) {
              res({ got: out ? { ok: out.ok, why: out.why, size: out.size } : null,
                    lastError: (chrome.runtime.lastError ? chrome.runtime.lastError.message : null),
                    hasSend: typeof chrome.runtime.sendMessage === 'function' });
            });
          } catch (e) { res({ throw: String(e && e.message) }); }
        }))`,
      });
      console.log('[SW 诊断] sendMessage 结果: ' + JSON.stringify(r.result && r.result.result && r.result.result.value));
    }
  }

  await sleep(1500);
  if (MODE === 'late') {
    // 近 @run-at document-end: DOM 就绪后再注入
    await evaluate(src);
    await sleep(1500);
  }

  // 夹具基线有界轮询 (本仓纪律: 有界等待必须可观测, 不靠固定 sleep 赌时序 —— 曾因固定
  //   等待窗口太短而误报「基线不成立」, 那是噪声不是缺陷)
  const BASE_WAIT_MS = 20000;
  const t0base = Date.now();
  let baseOk = false;
  while (Date.now() - t0base < BASE_WAIT_MS) {
    const n = await evaluate(`document.querySelectorAll('#content img[data-svi-checked-src]').length`);
    if (typeof n === 'number' && n >= 6) { baseOk = true; break; }
    await sleep(250);
  }
  console.log(`[基线] 缩略图决策完成: ${baseOk ? 'OK' : '超时'} (等待 ${Date.now() - t0base}ms)`);

  // 夹具自检: 缩略图是否真的走完了决策 (否则基线本身不成立)
  dbg('夹具自检…');
  const pre = await evaluate(`(() => {
    const svi = window.__svi;
    const imgs = [...document.querySelectorAll('#content img')];
    return {
      extMode: ${EXT_MODE},
      sviPresent: ${EXT_MODE} ? null : !!(svi && svi.version),
      version: svi && svi.version,
      dormant: !!(svi && svi.dormant),
      owner: document.documentElement.dataset.sviOwner || null,
      thumbs: imgs.length,
      thumbsChecked: imgs.filter(i=>i.hasAttribute('data-svi-checked-src')).length,
      thumbsInverted: imgs.filter(i=>i.getAttribute('data-svi-inverted')==='true'||i.hasAttribute('data-svi-fx')).length,
      decisionBySrcSize: ${EXT_MODE} ? null : (()=>{ try { return svi.engines.image.decisionBySrc.size; } catch(e){ return -1; } })(),
      counters: (()=>{ try { return JSON.parse(JSON.stringify(svi.stats.snapshot ? svi.stats.snapshot() : svi.stats.counters || {})); } catch(e){ return null; } })(),
    };
  })()`);
  console.log('--- 夹具自检 ---');
  console.log(JSON.stringify(pre, null, 1));
  if (!pre || (!EXT_MODE && !pre.sviPresent) || pre.thumbsChecked < 6 || !baseOk) {
    console.error('夹具基线不成立 (脚本未接管或缩略图未决策完), 结论不可用');
  }

  if (MASK_MODE) {
    const armed = await evaluate(`window.__probeArmMask()`);
    console.log('[Mask] 武装结果: ' + JSON.stringify(armed));
  }

  const caseList = CASES
    .concat(MASK_MODE ? ['C9_mask_slow'] : [])
    .concat(INHERIT_MODE ? ['C10_inherit_slow'] : []);
  if (!PLUGIN_PATH) for (const c of caseList) {
    // preHit 必须在触发**之前**测 —— 事后读 decisionBySrc 恒为 true (探针自身缺陷, 已修)
    const caseSrc = await evaluate(`window.__probeCaseSrc(${JSON.stringify(c)})`);
    const preHit = EXT_MODE ? null : await evaluate(
      `(()=>{ try { return window.__svi.engines.image.decisionBySrc.has(${JSON.stringify(caseSrc)}); } catch(e){ return null; } })()`);
    const triggered = await evaluate(`window.__probeRun(${JSON.stringify(c)}); 'ok'`);
    if (triggered !== 'ok') { record({ case: c, error: String(triggered) }); continue; }
    if (c === 'C9_mask_slow') {
      await sleep(600);   // 仍在加载 (图 2.5s 才到) —— 这一刻正是用户看到"白区"的时刻
      const during = await evaluate(`window.__probeSampleBox('.ov')`);
      record({ case: 'C9_mask_slow@during-load', phase: 'loading', box: during });
    }
    await sleep(3000); // 给足时延余量 (H1 要测的就是这期间发生了什么)
    const out = await evaluate(`(() => {
      const P = window.__probe;
      const o = document.querySelector('.ov') || document.querySelector('.ovbg');
      const src = o ? (o.currentSrc || o.src || '') : '';
      const svi = window.__svi;
      let rec = null, hit = false;
      try {
        if (!${EXT_MODE}) { rec = svi.engines.image.decisionBySrc.get(src) || null; hit = !!rec; }
      } catch (e) {}
      return {
        src,
        addedMs: P.added===null ? null : +(P.added - P.t0).toFixed(1),
        // lag 主口径 = 属性落地 (MO 观测, 不受 rAF 节流影响); rAF 口径留作交叉校验
        attrInvertedMs: P.attrInverted===null ? null : +(P.attrInverted - P.t0).toFixed(1),
        attrLagMs: (P.added!==null && P.attrInverted!==null) ? +(P.attrInverted - P.added).toFixed(1) : null,
        rAFInvertedMs: P.inverted===null ? null : +(P.inverted - P.t0).toFixed(1),
        failedMs: P.failedAt===null ? null : +(P.failedAt - P.t0).toFixed(1),
        srcChangedMs: P.srcChangedAt===null ? null : +(P.srcChangedAt - P.t0).toFixed(1),
        finalInverted: o ? (o.getAttribute('data-svi-inverted')==='true' || o.hasAttribute('data-svi-fx') || o.hasAttribute('data-svi-bginv')) : null,
        filter: o ? getComputedStyle(o).filter : null,
        checkedSrc: o ? o.hasAttribute('data-svi-checked-src') : null,
        failed: o ? o.hasAttribute('data-svi-failed') : null,
        decision: rec ? { verdict: rec.verdict, reason: rec.reason, provisional: !!rec.provisional } : null,
        decisionBySrcHit: hit,
        // 继承诊断 (R3.2): 继承源链接与其中缩略图的结论 + 计数器
        inheritDiag: (() => {
          try {
            const svi = window.__svi;
            const a = document.getElementById('inherit-link');
            const th = a ? a.querySelector('img') : null;
            const ts = th ? (th.currentSrc || th.src) : null;
            const d = (svi && ts) ? (svi.engines.image.decisionBySrc.get(ts) || null) : null;
            return {
              linkHref: a ? a.href : null,
              thumbSrc: ts,
              thumbDecision: d ? { verdict: d.verdict, reason: d.reason, provisional: !!d.provisional } : null,
              overlayInherits: (svi && svi.stats && svi.stats.counters) ? (svi.stats.counters.overlayInherits || 0) : null,
            };
          } catch (e) { return { err: String(e && e.message) }; }
        })(),
        events: P.events.slice(0, 12),
      };
    })()`);
    record({
      case: c, mode: MODE, cpu: CPU_RATE, netLatency: NET_LATENCY,
      srcExpected: caseSrc, preHitDecisionBySrc: preHit,
      ...(out && typeof out === 'object' ? out : { error: String(out) }),
    });
    // 用例间清场: 移除浮层, 避免互相干扰
    await evaluate(`document.querySelectorAll('.ov,.ovbg').forEach(n=>n.remove()); 'cleared'`);
    await sleep(300);
  }

  // ---- 插件模式: 真实 hover 驱动第三方插件放大 ----
  if (PLUGIN_PATH) {
    dbg('开始插件 hover 用例');
    for (const i of [0, 1, 2]) {
      const box = await evaluate(`(() => {
        const a = document.querySelectorAll('#content a')[${i}];
        if (!a) return null;
        const r = a.getBoundingClientRect();
        a.scrollIntoView({ block: 'center' });
        const r2 = a.getBoundingClientRect();
        return { x: Math.round(r2.left + r2.width / 2), y: Math.round(r2.top + r2.height / 2), href: a.href };
      })()`);
      if (!box || !box.x) { record({ case: 'P' + i + '_hover', error: '链接不可见或不存在' }); continue; }
      // 先移开再进入, 确保产生 mouseover 边界
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3, buttons: 0 });
      await sleep(500);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
      await sleep(3000);   // 插件有自己的悬停延迟
      dbg('扫描浮层…');
      const out = await evaluate(`(() => {
        const r = window.__probeFindOverlays ? window.__probeFindOverlays() : null;
        return r;
      })()`);
      record({
        case: 'P' + i + '_hover', plugin: path.basename(PLUGIN_PATH),
        hoverHref: box.href,
        ...(out && typeof out === 'object' ? out : { error: String(out) }),
      });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3, buttons: 0 });
      await sleep(700);
    }
  }

  const tail = await evaluate(`(() => {
    try {
      const s = window.__svi.stats;
      return JSON.parse(JSON.stringify((s && s.snapshot) ? s.snapshot() : (s && s.counters) || {}));
    } catch (e) { return null; }
  })()`);
  console.log('--- 计数尾部 (找 taintFallbacks) ---');
  console.log(JSON.stringify(tail, null, 1));
  console.log('--- 页面异常 ---');
  console.log('总数 ' + pageExns.length);
  console.log(JSON.stringify(pageExns.slice(0, 200), null, 1));

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    console.log(`已写 ${JSON_OUT} (${rows.length} 行)`);
  }

  ws.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  A.srv.close(); B.srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
