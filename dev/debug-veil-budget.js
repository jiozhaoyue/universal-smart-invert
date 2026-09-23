// 一次性调试: 复现 test.js 预算用例, 逐元素打印 gBCR 调用来源
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const scriptSource = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8')
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');
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
  documentElement: makeElStub(), head: makeElStub(), body: null, hidden: false,
  createElement: () => makeElStub(), addEventListener() {}, removeEventListener() {},
  querySelectorAll() { return []; }, querySelector() { return null; }, getElementById() { return null; },
};
global.MutationObserver = class { observe() {} disconnect() {} unobserve() {} };
global.self = {};
global.window = global;
vm.runInThisContext(scriptSource, { filename: 'universal-smart-invert.user.js' });

const STYLE_DEFAULTS = {
  position: 'static', zIndex: 'auto', content: 'none',
  backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
  opacity: '1', backdropFilter: 'none',
};
const RECT = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
const created = [];
function makeEl(o) {
  o = o || {};
  const el = {
    nodeType: 1,
    _styles: Object.assign({}, STYLE_DEFAULTS, o.styles || {}),
    _pseudo: o.pseudo || {},
    _rect: o.rect || RECT(0, 0, 280, 170),
    parentElement: null,
    children: o.children || [],
    _gcrCalls: 0,
    getBoundingClientRect() { this._gcrCalls++; return this._rect; },
    contains() { return false; },
  };
  for (const c of el.children) { c.parentElement = el; created.push(c); }
  created.push(el);
  return el;
}
global.window.getComputedStyle = (el, pseudo) => {
  if (pseudo) {
    const map = (el && el._pseudo && el._pseudo[pseudo]) || null;
    return Object.assign({}, STYLE_DEFAULTS, map || {});
  }
  return (el && el._styles) ? el._styles : Object.assign({}, STYLE_DEFAULTS);
};

created.length = 0;
const imgBudget = makeEl({ rect: RECT(10, 10, 270, 160) });
const sibs = [];
for (let i = 0; i < 4; i++) {
  sibs.push(makeEl({
    rect: RECT(i * 30, 0, i * 30 + 80, 60),
    styles: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.9)' },
  }));
}
const midBudget = makeEl({});
const topBudget = makeEl({});
const veilBox = makeEl({
  pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.7)' } },
});
imgBudget.parentElement = makeEl({ children: [imgBudget].concat(sibs) });
imgBudget.parentElement.parentElement = midBudget;
midBudget.parentElement = topBudget;
topBudget.parentElement = veilBox;
const r = global.window.__svi.maskedDarkContext(imgBudget);
console.log('result:', JSON.stringify(r));
console.log('per-element gcr:');
for (const e of created) {
  if (e._gcrCalls) console.log('  calls=' + e._gcrCalls, 'rect=', JSON.stringify(e._rect), 'bg=', e._styles.backgroundColor, 'pos=', e._styles.position);
}
console.log('TOTAL(created-sum):', created.reduce((n, e) => n + e._gcrCalls, 0));
console.log('TOTAL(unique):', Array.from(new Set(created)).reduce((n, e) => n + e._gcrCalls, 0));
process.exit(0);
