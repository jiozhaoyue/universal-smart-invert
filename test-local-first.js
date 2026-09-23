// v4.6 本地优先判定单测 (独立可执行; 由 test.js require 或 `node test-local-first.js` 直跑)
// 覆盖: localEvidence 档位矩阵 / 档 B 保守约束 / pending 唤醒与档位升级 /
//       decide-once 幂等 / 回退开关 / eager 主路径 / 联网路径收敛 (R5)
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const rawSource = fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8');
const scriptSource = rawSource.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

// —— 最小浏览器环境桩 (与 test.js 同构; body 保持 null 以跳过引擎循环) ——
const storageData = {};
global.localStorage = {
  getItem: (k) => (k in storageData ? storageData[k] : null),
  setItem: (k, v) => { storageData[k] = String(v); },
  removeItem: (k) => { delete storageData[k]; },
};
global.location = { hostname: 'mail.163.com', href: 'https://mail.163.com/', protocol: 'https:' };
const makeElStub = () => ({
  style: { setProperty() {}, removeProperty() {} },
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
  appendChild() {}, append() {}, addEventListener() {},
  querySelectorAll() { return []; }, querySelector() { return null; },
  closest() { return null; }, matches() { return false; }, contains() { return false; },
  isConnected: true, parentNode: null, remove() {},
});
global.document = {
  documentElement: makeElStub(),
  head: makeElStub(),
  body: null,
  hidden: false,
  createElement: () => makeElStub(),
  addEventListener() {},
  removeEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
  getElementById() { return null; },
};
global.MutationObserver = class { observe() {} disconnect() {} unobserve() {} };
global.self = {};
global.window = global;
vm.runInThisContext(scriptSource, { filename: 'universal-smart-invert.user.js (v4.6 local-first tests)' });

const svi = global.window.__svi;
assert.ok(svi, 'window.__svi must be exported');
assert.strictEqual(typeof svi.localEvidence, 'function', 'localEvidence exported (v4.6 contract)');
assert.strictEqual(typeof svi.isProvisionalDecision, 'function', 'isProvisionalDecision exported');

// —— 证据桩 (只读可观测; rectReads 计数用于无强制布局断言) ——
const makeEvStub = (opts) => {
  const o = opts || {};
  const attrs = {};
  const listeners = {};
  let rectReads = 0;
  return {
    nodeType: 1,
    tagName: 'IMG',
    complete: o.noComplete ? undefined : (o.complete === undefined ? false : o.complete),
    naturalWidth: o.naturalWidth || 0,
    naturalHeight: o.naturalHeight || 0,
    currentSrc: o.src || '',
    clientWidth: o.cw || 0,
    clientHeight: o.ch || 0,
    attrs,
    listeners,
    get rectReads() { return rectReads; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return (k in attrs) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect() { rectReads++; return { width: o.rectW != null ? o.rectW : (o.cw || 0), height: o.rectH != null ? o.rectH : (o.ch || 0) }; },
    parentElement: null,
    matches() { return !!o.matchesHit; },
    closest() { return null; },
    isConnected: true,
  };
};

(async () => {
  // —— 4.6-1 localEvidence 档位矩阵 (design §2) ——
  const evA = svi.localEvidence(makeEvStub({ complete: true, naturalWidth: 300, cw: 600, ch: 300 }));
  assert.strictEqual(evA.tier, 'A', 'decoded pixels => tier A');
  assert.strictEqual(evA.hasDecodedPixels, true, 'decoded flag on');
  const evB = svi.localEvidence(makeEvStub({ complete: false, cw: 600, ch: 300 }));
  assert.strictEqual(evB.tier, 'B', 'laid-out but undecoded => tier B (placeholder)');
  assert.strictEqual(evB.visible, true, 'tier B locally visible');
  const evC = svi.localEvidence(makeEvStub({ complete: false }));
  assert.strictEqual(evC.tier, 'C', 'no layout evidence => tier C');
  assert.strictEqual(evC.visible, false, 'tier C not visible');
  const evH = svi.localEvidence(makeEvStub({ complete: true, naturalWidth: 0, cw: 0, ch: 0 }));
  assert.strictEqual(evH.tier, 'C', 'complete-but-empty stays C');
  // 无 complete 生命周期的媒体 (SVG <image> / input[type=image]): 视作档 A (v4.5 对齐)
  const evS = svi.localEvidence(makeEvStub({ noComplete: true, cw: 300, ch: 150 }));
  assert.strictEqual(evS.tier, 'A', 'media without complete lifecycle (svg image/input image) => tier A');
  // 只读 + 幂等 + 无布局抖动 (每次调用至多一次 rect 读取)
  const stubRO = makeEvStub({ complete: false, cw: 400, ch: 200 });
  const e1 = svi.localEvidence(stubRO);
  const e2 = svi.localEvidence(stubRO);
  assert.strictEqual(e1.tier, e2.tier, 'localEvidence idempotent');
  assert.strictEqual(stubRO.rectReads, 2, 'exactly one rect read per call');
  assert.strictEqual(Object.keys(stubRO.attrs).length, 0, 'localEvidence never mutates the element');
  // 内联提示: width/height 属性属本地已声明尺寸 (弱网下先于字节可知)
  const evI = makeEvStub({ complete: false, cw: 0, ch: 0 });
  evI.attrs['width'] = '600'; evI.attrs['height'] = '300';
  assert.strictEqual(svi.localEvidence(evI).inlineHint.width, 600, 'inline width hint captured');
  assert.strictEqual(svi.localEvidence(evI).inlineHint.height, 300, 'inline height hint captured');

  // —— 4.6-2 档 B 保守判定: keep (provisional) + pending 登记; 绝不凭 cssContext 反色 ——
  const engB = new svi.ImageInvertEngine();
  const srcB = 'https://mail.163.com/static/placeholder.png';
  const imgB = makeEvStub({ complete: false, cw: 600, ch: 300, src: srcB });
  imgB.attrs['width'] = '600'; imgB.attrs['height'] = '300';
  await engB.processImage(imgB);
  const dB = engB.decisionBySrc.get(srcB);
  assert.ok(dB, 'tier B placeholder must decide WITHOUT network (R1/R3)');
  assert.strictEqual(dB.verdict, 'keep', 'tier B conservative verdict = keep');
  assert.ok(dB.reason === 'local-inline-hint' || dB.reason === 'local-context', 'tier B audit reason (C2), got ' + dB.reason);
  assert.strictEqual(dB.provisional, true, 'tier B snapshot flagged provisional (C4)');
  assert.strictEqual(imgB.attrs['data-svi-checked-src'], srcB, 'decision marker written on B');
  assert.ok(engB.pendingEls.has(imgB), 'tier B registered in pending registry');
  assert.notStrictEqual(dB.verdict, 'invert', 'cssContext alone never inverts (design §5)');

  // —— 4.6-3 pending 唤醒与档位升级 (B→A): 像素证据到达即权威重判 ——
  engB.cache.set(srcB, true); // 预置像素结论 (isLight => invert; 免 canvas 桩)
  const loadHandlers = (imgB.listeners.load || []).slice();
  assert.ok(loadHandlers.length >= 1, 'pending wake listener (load) attached');
  imgB.complete = true; imgB.naturalWidth = 300; // 字节到达: 本地证据升级为档 A
  loadHandlers[0]();
  await new Promise((r) => setTimeout(r, 30));
  const dUp = engB.decisionBySrc.get(srcB);
  assert.strictEqual(dUp.verdict, 'invert', 'tier upgrade re-decides authoritatively');
  assert.strictEqual(dUp.reason, 'pixel', 'upgraded reason is pixel');
  assert.strictEqual(dUp.provisional, undefined, 'provisional cleared after upgrade');
  assert.ok(!engB.pendingEls.has(imgB), 'pending cleared after wake');
  assert.strictEqual(imgB.attrs['data-svi-inverted'], 'true', 'invert applied after upgrade');

  // —— 4.6-4 decide-once 幂等: 同档输入两轮结论一致 (不翻转) ——
  const engD = new svi.ImageInvertEngine();
  const srcD = 'https://mail.163.com/static/ph2.png';
  const imgD1 = makeEvStub({ complete: false, cw: 500, ch: 260, src: srcD });
  const imgD2 = makeEvStub({ complete: false, cw: 500, ch: 260, src: srcD });
  await engD.processImage(imgD1);
  const d1 = engD.decisionBySrc.get(srcD);
  await engD.processImage(imgD2);
  const d2 = engD.decisionBySrc.get(srcD);
  assert.strictEqual(d1.verdict, d2.verdict, 'same-tier re-entry keeps verdict stable');
  assert.strictEqual(d2.provisional, true, 'provisional preserved across same-tier entries');

  // —— 4.6-5 回退开关: localFirstDecide=false 恢复 v4.5 行为 ——
  const oldFlag = svi.prefs.localFirstDecide;
  svi.prefs.localFirstDecide = false;
  const engR = new svi.ImageInvertEngine();
  const srcR = 'https://mail.163.com/static/ph3.png';
  const imgR = makeEvStub({ complete: false, cw: 600, ch: 300, src: srcR });
  await engR.processImage(imgR);
  const dR = engR.decisionBySrc.get(srcR);
  assert.ok(!engR.decisionBySrc.has(srcR), 'rollback: undecoded img stays undecided (v4.5 behavior)');
  assert.ok(engR.pendingEls.size === 0, 'rollback: no pending registration');
  svi.prefs.localFirstDecide = oldFlag;

  // —— 4.6-6 eager 主路径: 首屏未解码媒体不再被跳过 (R3 抢先) ——
  const oldBody = global.document.body;
  const imgE = makeEvStub({ complete: false, cw: 640, ch: 320, src: 'https://mail.163.com/static/eager.png' });
  global.document.body = { querySelectorAll: (sel) => (String(sel).indexOf('img') !== -1 ? [imgE] : []) };
  const engE = new svi.ImageInvertEngine();
  engE.runEagerPass();
  await new Promise((r) => setTimeout(r, 20)); // processImage 异步: 让微任务落地
  assert.ok(engE.decisionBySrc.has(imgE.currentSrc), 'eager pass handles undecoded first-screen media');
  assert.strictEqual(engE.decisionBySrc.get(imgE.currentSrc).verdict, 'keep', 'eager local conservative verdict');
  assert.ok(engE.pendingEls.has(imgE), 'eager registers pending for later wake');
  global.document.body = oldBody;

  // —— 4.6-7 联网路径收敛 (R5): gmFetchText 唯一调用点在用户手动导入动作内 ——
  const defIdx = scriptSource.indexOf('function gmFetchText(');
  assert.ok(defIdx > 0, 'gmFetchText defined');
  const callIdx = scriptSource.indexOf('await gmFetchText(');
  const importFnIdx = scriptSource.indexOf('async importRulesFromUrl(');
  assert.ok(importFnIdx > 0 && callIdx > importFnIdx, 'gmFetchText called only inside importRulesFromUrl (user action)');
  const importRefs = (scriptSource.match(/importRulesFromUrl\(/g) || []).length;
  assert.ok(importRefs <= 2, 'importRulesFromUrl referenced only by definition + manual button handler, got ' + importRefs);
  assert.ok(scriptSource.indexOf('手动导入通道') !== -1, 'manual-import UI explicitly labeled');
  const rawHeader = rawSource.slice(0, rawSource.indexOf('==/UserScript=='));
  assert.ok(rawHeader.indexOf('@connect') !== -1, '@connect retained (pixel fallback + manual import)');
  assert.ok(rawHeader.indexOf('唯一保留的联网能力') !== -1, '@connect rationale documented in header');

  console.log('✓ v4.6 unit tests passed: localEvidence tiers / tier-B conservative verdict / pending wake & tier upgrade / decide-once stability / rollback switch / eager main path / network-path convergence');
  if (typeof module !== 'undefined' && module.parent) return; // 被 test.js require: 静默返回
})().catch((err) => {
  console.error('v4.6 async unit tests failed:', err);
  process.exit(1);
});
