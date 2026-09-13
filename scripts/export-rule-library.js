// Generate the rule-library reference artifact from the REAL shipped userscript.
// Same Node shim pattern as test.js (zero npm dependencies). Fully regenerated
// every run — idempotent output, git-clean merges.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const header = fs.readFileSync(path.join(root, 'universal-smart-invert.user.js'), 'utf8');
const version = (header.match(/\/\/\s*@version\s+(\S+)/) || [])[1];
assert.ok(version, 'cannot read @version from userscript header');
const src = header.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

const storageData = {};
global.localStorage = {
  getItem: (k) => (k in storageData ? storageData[k] : null),
  setItem: (k, v) => { storageData[k] = String(v); },
  removeItem: (k) => { delete storageData[k]; },
};
global.location = { hostname: 'example.com', href: 'https://example.com/', protocol: 'https:' };
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
  addEventListener() {}, removeEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
  getElementById() { return null; },
};
global.MutationObserver = class { observe() {} disconnect() {} unobserve() {} };
global.self = {};
global.window = global;

vm.runInThisContext(src, { filename: 'universal-smart-invert.user.js' });
const svi = global.window.__svi;
assert.ok(svi, 'window.__svi must be exported');
assert.ok(Array.isArray(svi.BUILTIN_RULES) && svi.BUILTIN_RULES.length > 0, 'BUILTIN_RULES must be a non-empty array');

const out = {
  schema: 1,
  kind: 'svi-rule-library',
  generatedAt: new Date().toISOString(),
  version,
  count: svi.BUILTIN_RULES.length,
  builtinRules: JSON.parse(JSON.stringify(svi.BUILTIN_RULES)),
};

const rulesDir = path.join(root, 'rules');
fs.mkdirSync(rulesDir, { recursive: true });
const target = path.join(rulesDir, 'svi-rule-library.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log('[export-rule-library] wrote', path.relative(root, target), '(' + out.count + ' builtin rules, v' + version + ')');
process.exit(0); // 用户脚本启动桩含常驻定时器, 显式退出
