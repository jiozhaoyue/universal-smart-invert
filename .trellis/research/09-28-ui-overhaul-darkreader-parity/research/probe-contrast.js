// 对比度基线探针（静态形）——独立复算 design.md §2C / §3.3 的比值，不照抄其数字。
// 用法: node .trellis/tasks/09-28-ui-overhaul-darkreader-parity/research/probe-contrast.js
// Step A 将以「浏览器 computed style」形式固化为正式断言（对应 PRD AC3）。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const US = path.join(ROOT, 'universal-smart-invert.user.js');

function relativeLum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(c1, c2) {
  const [a, b] = [relativeLum(c1), relativeLum(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
function hex(h) {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
// 把带 alpha 的前景色合成到不透明底色上（AC3 的「相邻非透明背景祖先」规则）
function over(fg, alpha, bg) { return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))); }

// —— 从用户脚本的 token 块解析真实取值（不硬编码） ——
const src = fs.readFileSync(US, 'utf8');
const block = src.slice(src.indexOf('v6.4-TOKENS-START'), src.indexOf('v6.4-TOKENS-END'));
const T = {};
for (const m of block.matchAll(/(--svi-[a-z0-9-]+)\s*:\s*([^;]+);/g)) T[m[1]] = m[2].trim();

const bg = hex(T['--svi-bg']);
const bgDeep = hex(T['--svi-bg-deep']);

const rows = [
  ['按钮填充 --svi-ctl-bg vs 面板底 --svi-bg', hex(T['--svi-ctl-bg']), bg, 1.00],
  ['按钮现用描边 --svi-ctl-hover vs --svi-bg', hex(T['--svi-ctl-hover']), bg, 1.38],
  ['DR 原描边 --svi-border vs --svi-bg', hex(T['--svi-border']), bg, 2.95],
  ['.svi-action-btn 描边 rgba(white,.12) 合成后 vs --svi-bg', over([255, 255, 255], 0.12, bg), bg, 1.44],
  ['.svi-preset-btn 描边 rgba(white,.08) 合成后 vs --svi-bg', over([255, 255, 255], 0.08, bg), bg, null],
  ['候选描边 #35798a vs --svi-bg', hex('#35798a'), bg, 3.428],
  ['候选描边 #3a8091 vs --svi-bg', hex('#3a8091'), bg, 3.769],
  ['popup .tab 选中描边 --svi-fg vs --svi-bg-deep', hex(T['--svi-fg']), bgDeep, null],
  ['popup 控件描边 --svi-ctl-hover vs --svi-bg-deep', hex(T['--svi-ctl-hover']), bgDeep, null],
  ['popup .tab 未选中描边 transparent(裸底)', bgDeep, bgDeep, 1.0],
];

const AA = 3.0; // WCAG 1.4.11 非文本对比度下限
console.log('token 源: ' + US);
console.log('面板底 --svi-bg = ' + T['--svi-bg'] + ' | popup 底 --svi-bg-deep = ' + T['--svi-bg-deep']);
console.log('');
console.log('| 组合 | 计算值 | 期望(ref) | ≥3:1 |');
console.log('|---|---|---|---|');
let fail = 0;
for (const [label, fg, back, expect] of rows) {
  const r = ratio(fg, back);
  const ok = r >= AA;
  if (!ok) fail++;
  const exp = expect === null ? '—' : expect.toFixed(2) + (Math.abs(r - expect) <= 0.02 ? ' ✓一致' : ' ✗不符');
  console.log(`| ${label} | ${r.toFixed(3)}:1 | ${exp} | ${ok ? '✅' : '❌'} |`);
}
console.log('');
console.log(`不达 3:1 的组合: ${fail} / ${rows.length}`);
