// v4.6-2 复现脚本: Alt+点击手动反色被异步回写覆盖
// 用法: node dev/repro-altclick.js   (在仓库根目录执行)
//
// 设计: 以 test.js 同款最小 DOM 桩加载真实 userscript 源码, 用真实引擎实例驱动
// 四条路径; 修复前应打印 [FAIL-BUG](证明缺陷存在), 修复后应全部 [PASS-OK]。
// 本脚本不修改产品代码 —— 它只是探针。
//
// 场景:
//   A. fx 投递回调覆盖手动杀停结论 (design.md H1):
//      已投递图片 + 二次投递在途, Alt+点击杀停 → 异步 applyTo 回调擦掉 fx-off。
//   B. fx 杀停的 CSS 兜底规则在级联中必输 (H4 变体):
//      img[data-svi-fx][data-svi-fx-off] 与 per-element content:url 规则同特异性,
//      但写在更早的样式节点 → 后建节点获胜 → 杀停后视觉仍显示变换图。
//   C. canvas 首扫覆盖手动结论 (H8, 代码时序推导):
//      未判定 canvas 先被手动反色 → 首个 processCanvas 按像素分析改写属性。
//   D. recordDecision force 语义对照 (H2/H6): 手动快照必须压过后续非强制决策。

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ============ 最小浏览器桩 (富元素版, 支持属性读写真值) ============
const bus = new Map(); // target -> Map(type -> [fn])
function busAdd(target, type, fn) {
  if (!bus.has(target)) bus.set(target, new Map());
  const m = bus.get(target);
  if (!m.has(type)) m.set(type, []);
  m.get(type).push(fn);
}

// canvas 桩: 引擎 8×8 探针 (document.createElement('canvas')) 与目标 canvas 都走这里;
// 统一返回深色不透明像素 (isLight=false) 的 2D 上下文桩
const CANVAS_PX = new Uint8ClampedArray(8 * 8 * 4);
for (let i = 0; i < CANVAS_PX.length; i += 4) {
  CANVAS_PX[i] = 20; CANVAS_PX[i + 1] = 20; CANVAS_PX[i + 2] = 20; CANVAS_PX[i + 3] = 255;
}
function canvasCtxStub() {
  return {
    drawImage() {},
    getImageData: () => ({ width: 8, height: 8, data: CANVAS_PX }),
  };
}

function makeEl(tag) {
  const attrs = new Map();
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    isConnected: true,
    parentNode: null,
    complete: true,
    naturalWidth: 100,
    naturalHeight: 100,
    clientWidth: 300,
    clientHeight: 200,
    width: 300,
    height: 200,
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    setAttribute(n, v) { attrs.set(n, String(v)); },
    removeAttribute(n) { attrs.delete(n); },
    hasAttribute(n) { return attrs.has(n); },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; if (on) this._s.add(c); else this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(t, fn) { busAdd(el, t, fn); },
    removeEventListener() {},
    appendChild() {}, append() {}, remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    matches() { return false; },
    contains() { return false; },
  };
  return el;
}

const storageData = {};
global.localStorage = {
  getItem: (k) => (k in storageData ? storageData[k] : null),
  setItem: (k, v) => { storageData[k] = String(v); },
  removeItem: (k) => { delete storageData[k]; },
};
global.location = { hostname: 'example.com', href: 'https://example.com/page', protocol: 'https:' };

const htmlEl = makeEl('html');
const headEl = makeEl('head');
const bodyEl = makeEl('body');
const docStub = {
  documentElement: htmlEl,
  head: headEl,
  body: null, // 先 null → whenBodyReady 轮询 → 稍后置位触发引擎 boot
  hidden: false,
  createElement: (tag) => {
    const el = makeEl(tag);
    // 引擎 8×8 探针画布 (processCanvas 内 document.createElement('canvas')) 也要能取到 2D 上下文
    if (String(tag).toLowerCase() === 'canvas') el.getContext = canvasCtxStub;
    return el;
  },
  addEventListener(t, fn) { busAdd(docStub, t, fn); },
  removeEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
  getElementById() { return null; },
  // 复现真实 Alt+click: bindManualToggle 以 capture 监听 document
  dispatchClick(e) {
    const m = bus.get(docStub);
    const ls = (m && m.get('click')) || [];
    ls.forEach((fn) => fn(e));
  },
};
global.document = docStub;
global.MutationObserver = class { observe() {} disconnect() {} unobserve() {} };
global.self = {}; // ≠ window.top → 不构建 UI
global.addEventListener = (t, fn) => busAdd(global, t, fn);
global.removeEventListener = () => {};
global.getComputedStyle = () => ({ backgroundColor: '', backgroundImage: '' });
global.window = global;

// ============ 加载真实脚本 ============
const scriptSource = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');
vm.runInThisContext(scriptSource, { filename: 'universal-smart-invert.user.js (repro)' });
const svi = global.window.__svi;
if (!svi) { console.error('FATAL: window.__svi not exported'); process.exit(1); }

// body 就绪 → 引擎 boot (真实 bootEngines 路径)
docStub.body = bodyEl;

let asyncPending = 1; // 场景 A 的异步断言
const results = [];
function verdict(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '[PASS-OK]  ' : '[FAIL-BUG] ') + name + (detail ? ' :: ' + detail : ''));
}

setTimeout(() => {
  const imgEng = svi.engines.image;         // ImageInvertEngine 实例
  const fx = svi.engines.imageFx;           // ImageFxEngine 实例
  const mc = svi.engines.mediaCoverage;     // MediaCoverageEngine 实例
  if (!imgEng || !fx || !mc) {
    console.error('FATAL: engines not booted image=%s fx=%s mediaCoverage=%s', !!imgEng, !!fx, !!mc);
    process.exit(1);
  }
  const SRC = 'https://cdn.example.com/photo.jpg';
  const KEY = svi.manualOverrideKey(svi.profileKey(), SRC);

  // 模拟 fx 解码成功后的真实回调尾段: 逐 target applyTo (生产 process() 的同一写状态入口)
  fx.process = async function (job) {
    await new Promise((r) => setTimeout(r, 30)); // 模拟解码耗时
    for (const el of job.targets) {
      if (el && el.isConnected) this.applyTo(el, 'fxdeadbeef', 'blob:https://example.com/fx-' + job.key, job.key);
    }
  };

  function altClick(el) {
    docStub.dispatchClick({
      altKey: true, button: 0, target: el,
      composedPath: () => [el],
      preventDefault() {}, stopPropagation() {},
    });
  }

  // ============ 场景 A: fx 投递回调覆盖手动杀停 (H1) ============
  {
    const a = makeEl('img');
    a.currentSrc = SRC; a.src = SRC;
    a.setAttribute('data-svi-fx', 'fx11112222'); // 已投递态: 视觉=已反色
    fx.enqueue(a, SRC, true);                    // 模拟换参重投递在途 (回调未到)
    altClick(a);                                 // Alt+点击 = 杀停 (还原原图)
    const afterClick = {
      fxOff: a.getAttribute('data-svi-fx-off') === 'true',
      manual: (svi.prefs.manualOverrides || {})[KEY] || null,
    };
    setTimeout(() => {
      const afterCb = {
        fxOff: a.getAttribute('data-svi-fx-off') === 'true', // 杀停态保留 (视觉还原由 :not 规则完成)
        fx: !!a.getAttribute('data-svi-fx'),
        manual: (svi.prefs.manualOverrides || {})[KEY] || null,
      };
      // 期望: 点击后 fx-off=true; 回调落地后 fx-off 仍 true (在途投递不得回写), 手动结论 restore 存活
      const pass = afterClick.fxOff && afterCb.fxOff && afterClick.manual === 'restore' && afterCb.manual === 'restore';
      verdict('A: fx 回调不覆盖手动杀停 (H1)', pass,
        'afterClick.fxOff=' + afterClick.fxOff + ' manual=' + afterClick.manual
        + ' afterCb.fxOff=' + afterCb.fxOff + ' afterCb.fx=' + afterCb.fx
        + ' afterCb.manual=' + afterCb.manual);
      asyncPending--;
      if (asyncPending === 0) finish();
    }, 80);
  }

  // ============ 场景 B: 杀停规则选择器是否排除 fx-off (H4 变体) ============
  {
    const SRC_B = 'https://cdn.example.com/photo-b.jpg'; // 独立 src: 不受场景 A 手动结论干扰
    const b = makeEl('img');
    b.currentSrc = SRC_B; b.src = SRC_B;
    b.setAttribute('data-svi-fx', 'fx33334444');
    fx.ensureStyleNode();
    if (fx._rules) fx._rules.clear();
    fx.applyTo(b, 'fx33334444', 'blob:https://example.com/x', 'k-b');
    const rule = (fx._rules ? Array.from(fx._rules.values())[0] : '') || '';
    const pass = rule.indexOf('data-svi-fx-off') !== -1;
    verdict('B: content:url 规则排除 fx-off 态 (H4 变体: 级联必输)', pass, rule.slice(0, 140));
  }

  // ============ 场景 C: canvas 首扫覆盖手动反色 (H8) ============
  {
    const c = makeEl('canvas');
    // 深色不透明像素 (isLight=false): 引擎分析结论 = 保持原样 → 会摘掉手动反色
    const px = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < px.length; i += 4) { px[i] = 20; px[i + 1] = 20; px[i + 2] = 20; px[i + 3] = 255; }
    c.getContext = () => ({
      drawImage() {},
      getImageData: () => ({ width: 8, height: 8, data: px }),
    });
    altClick(c);                    // 用户先 Alt+点击 (该 canvas 尚未被引擎判定)
    const afterClick = c.getAttribute('data-svi-inverted') === 'true';
    mc.processCanvas(c);            // 引擎首扫 (≤5s sweep 真实路径)
    const afterScan = c.getAttribute('data-svi-inverted') === 'true';
    // 期望: 手动反色不被像素分析覆盖
    const pass = afterClick && afterScan;
    verdict('C: canvas 首扫不覆盖手动反色 (H8)', pass,
      'afterClick=' + afterClick + ' afterScan=' + afterScan + ' (深色像素分析把手动结论拉回)');
  }

  // ============ 场景 D: 手动快照压过非强制决策 (H2/H6 对照) ============
  {
    const d1 = imgEng.recordDecision(SRC, 'keep', 'manual', true);
    const d2 = imgEng.recordDecision(SRC, 'invert', 'pixel'); // 非 force → 必须返回手动快照
    const pass = d1.verdict === 'keep' && d2.verdict === 'keep' && d2.reason === 'manual';
    verdict('D: recordDecision 手动快照幂等占优 (H2/H6 对照)', pass, 'd2=' + d2.verdict + '/' + d2.reason);
    imgEng.decisionBySrc.delete(SRC);
  }

  // 汇总延迟到场景 A 的异步断言落地之后 (asyncPending 归零或兜底超时)
  const finish = () => {
    const bugs = results.filter((r) => !r.pass).length;
    console.log('\n==== 复现汇总: ' + results.length + ' 项, 缺陷 ' + bugs + ' 项 ====');
    setTimeout(() => process.exit(0), 60);
  };
  setTimeout(() => { asyncPending = 0; finish(); }, 1200); // 兜底: A 断言永不落地也退出
}, 250); // 等 whenBodyReady 轮询命中
