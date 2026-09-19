// Generate the ONE-FILE distributable rules pack (rules/svi-pack.import.json):
//   siteBlacklist  ← Dark Reader upstream dark-sites (darkreader-compat.json)
//   siteOverrides  ← BUILTIN_RULES non-default fields (bgReplace / excludeSelectors)
//   elementRules   ← BUILTIN_RULES forceInvert[] → action 'invert', protect[] → action 'keep'
//
// svi-rules envelope, merge-importable via 设置 → 数据与备份 → 导入并合并 / 从链接导入.
// Deterministic content EXCEPT generatedAt/version (regenerate deliberately, commit once).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const header = fs.readFileSync(path.join(root, 'universal-smart-invert.user.js'), 'utf8');
const version = (header.match(/\/\/\s*@version\s+(\S+)/) || [])[1];
assert.ok(version, 'cannot read @version from userscript header');
const src = header.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

// —— same Node shim pattern as scripts/export-rule-library.js / test.js ——
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
assert.ok(Array.isArray(svi.BUILTIN_RULES) && svi.BUILTIN_RULES.length > 0, 'BUILTIN_RULES must be a non-empty array');

// —— Dark Reader 上游黑名单 ——
const compatPath = path.join(root, 'rules', 'darkreader-compat.json');
let siteBlacklist = [];
if (fs.existsSync(compatPath)) {
  const compat = JSON.parse(fs.readFileSync(compatPath, 'utf8'));
  siteBlacklist = (compat.darkSites || []).filter((s) => typeof s === 'string' && s.trim());
}

// —— BUILTIN_RULES → 可分发表示 (元素级规则 + 本站覆盖) ——
// 动作词表与 normalizeElementRules 一致: invert / protect / recolor。
// 注意: bgImageSelectors 是 BgImageEngine 专属字段, 元素级规则/覆盖键无法等价表达 → 不翻译,
// 内置规则随脚本本体分发, 规则包只补齐「旧脚本版本/其它反色扩展用户」可消费的部分。
const elementRules = [];
const siteOverrides = {};
let dupRules = 0;
for (const rule of svi.BUILTIN_RULES) {
  if (!rule || typeof rule.pattern !== 'string' || !rule.pattern) continue;
  const selectors = [];
  for (const sel of (rule.forceInvert || [])) selectors.push({ sel, action: 'invert' });
  for (const sel of (rule.protect || [])) selectors.push({ sel, action: 'protect' });
  for (const { sel, action } of selectors) {
    if (!sel || typeof sel !== 'string') continue;
    if (elementRules.some((er) => er.pattern === rule.pattern && er.selector === sel)) { dupRules++; continue; }
    elementRules.push({ pattern: rule.pattern, action, selector: sel });
  }
  const ov = {};
  if (rule.bgReplace === true) ov.bgReplace = true;
  if (Array.isArray(rule.excludeSelectors) && rule.excludeSelectors.length) ov.excludeSelectors = rule.excludeSelectors.slice();
  if (Object.keys(ov).length) siteOverrides[rule.pattern] = ov;
}

const out = {
  kind: 'svi-rules',
  schema: 1,
  version,
  generatedAt: new Date().toISOString(),
  generator: 'scripts/export-rules-pack.js',
  note: '一体化分发规则包: Dark Reader 上游暗色名单 + 内置站点适配的可翻译子集 (元素级规则/本站覆盖)。',
  rules: {
    siteBlacklist,
    siteOverrides,
    elementRules,
  },
};

const rulesDir = path.join(root, 'rules');
fs.mkdirSync(rulesDir, { recursive: true });
const target = path.join(rulesDir, 'svi-pack.import.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log('[export-rules-pack] wrote', path.relative(root, target),
  '(siteBlacklist=' + siteBlacklist.length + ', siteOverrides=' + Object.keys(siteOverrides).length +
  ', elementRules=' + elementRules.length + ', dupSkipped=' + dupRules + ', v' + version + ')');
process.exit(0); // 用户脚本启动桩含常驻定时器, 显式退出
