// 三态一致性比对 (R4): 读取三份 probe-weaknet summary, 对比每图稳态决策
// 用法: node dev/compare-states.js <fastSummary> <throttleSummary> <offlineSummary>
'use strict';
const fs = require('fs');

const [fastP, thrP, offP] = process.argv.slice(2);
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ids = ['i0', 'i1', 'i2', 'i5', 'i10', 'i15'];

const steady = (sum) => {
  const out = {};
  const last = sum.timeline && sum.timeline[sum.timeline.length - 1];
  if (last) last.imgs.forEach((x) => { out[x.id] = { verdict: x.verdict, reason: x.reason, checked: x.checked, failed: x.failed }; });
  return out;
};

const F = steady(load(fastP));
const T = steady(load(thrP));
const O = steady(load(offP));

const rows = [];
let same = 0;
let diff = 0;
for (const id of ids) {
  const f = F[id] || { note: 'absent' };
  const t = T[id] || { note: 'absent' };
  const o = O[id] || { note: 'absent' };
  // 判定等价: 三态中"已取得决策"的稳态集合里 verdict+reason 相同 (未取得=网络确实取不到, 允许)
  const decided = [f, t, o].filter((x) => x.verdict);
  const uniq = [...new Set(decided.map((x) => x.verdict + '/' + x.reason))];
  const eq = uniq.length <= 1;
  if (eq && decided.length) same++;
  if (!eq) diff++;
  rows.push({ id, fast: f.verdict ? f.verdict + '/' + f.reason : (f.failed ? 'failed' : 'undecided'),
    throttle: t.verdict ? t.verdict + '/' + t.reason : (t.failed ? 'failed' : 'undecided'),
    offline: o.verdict ? o.verdict + '/' + o.reason : (o.failed ? 'failed' : 'undecided'),
    consistent: eq });
}
console.log(JSON.stringify({ rows, decidedSteadyConsistent: same, inconsistent: diff }, null, 2));
