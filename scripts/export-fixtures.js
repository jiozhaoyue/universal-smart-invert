#!/usr/bin/env node
/**
 * export-fixtures.js —— 把「用户教过的结论」转成回归测试用的 fixture
 *
 * 任务: v5-3 (R6 反哺 CI)
 * 设计: .trellis/tasks/09-25-v5-data-loop/design.md §D-6
 *
 * 用途
 *   `test.js` 会读取本脚本产出的 `dev/fixtures/verdicts.jsonl`, 断言**你教过的结论**
 *   仍然能由当前代码复现。这样"用户修正"就变成了 CI 保护网 —— 代码改动若破坏了
 *   你积累的判断, 测试会立刻失败。
 *
 * 输入从哪来
 *   本脚本**不读浏览器存储**(静态脚本读不到 localStorage)。它消费的是你在
 *   设置 → 💾 数据与备份 → 「导出全量备份」得到的 JSON。
 *
 * 用法
 *   node scripts/export-fixtures.js <导出的备份.json> [输出.jsonl]
 *   默认输出: dev/fixtures/verdicts.jsonl
 *
 * 隐私
 *   产出含**你自己的图片 URL**, 因此 `dev/fixtures/` 已在 .gitignore 中排除, 绝不入库。
 *   本脚本不联网、不上传任何内容。
 *
 * 幂等
 *   同一份输入重复导出, 产出逐字节一致 (按 host|stem|src 排序)。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DEFAULT = path.join(__dirname, '..', 'dev', 'fixtures', 'verdicts.jsonl');

// 手动覆盖的取值只可能是 'invert' | 'restore' (v4.6 语义) 或 {rect} 对象
function normalizeManual(v) {
  if (v === 'invert') return 'invert';
  if (v === 'restore') return 'keep';
  return null; // rect 之类不产出 fixture
}

// 学习规则的动作 → 期望结论
const ACTIONS = { invert: 'invert', protect: 'keep', hide: 'hide', mask: 'mask' };

function main() {
  const argv = process.argv.slice(2);
  const input = argv[0];
  const out = argv[1] || OUT_DEFAULT;

  if (!input) {
    console.error('用法: node scripts/export-fixtures.js <导出的备份.json> [输出.jsonl]');
    console.error('（备份来自 设置 → 💾 数据与备份 → 导出全量备份）');
    process.exit(2);
  }
  if (!fs.existsSync(input)) {
    console.error('找不到输入文件: ' + input);
    process.exit(2);
  }

  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch (e) {
    console.error('输入不是合法 JSON: ' + e.message);
    process.exit(2);
  }

  // 备份结构可能是 { prefs: {...} } 或直接是 prefs 本身 (两种导出路径都兼容)
  const prefs = (backup && typeof backup.prefs === 'object' && backup.prefs) ? backup.prefs : backup;
  const overrides = (prefs && typeof prefs.manualOverrides === 'object' && prefs.manualOverrides) || {};
  const learned = (backup && typeof backup.learned === 'object' && backup.learned)
    || (prefs && typeof prefs.learned === 'object' && prefs.learned) || {};

  const rows = [];

  // 1) 手动结论: key = '<host>|<src>' (host 本身可能含 '|'? 不会 —— host 不含竖线, 取首个 '|' 切分)
  for (const key of Object.keys(overrides)) {
    const idx = key.indexOf('|');
    if (idx <= 0) continue;
    const host = key.slice(0, idx);
    const src = key.slice(idx + 1);
    const expected = normalizeManual(overrides[key]);
    if (!expected || !src) continue;
    rows.push({ host, src, stem: '', expected, origin: 'manual' });
  }

  // 2) 学习规则: { <host>: { rules: [{stem, action, hits}] } }
  for (const host of Object.keys(learned)) {
    const hd = learned[host];
    const rules = (hd && Array.isArray(hd.rules)) ? hd.rules : [];
    for (const r of rules) {
      if (!r || !r.stem) continue;
      const expected = ACTIONS[r.action];
      if (!expected) continue;
      rows.push({ host, src: '', stem: r.stem, expected, origin: 'learned' });
    }
  }

  const dedup = new Map();
  for (const r of rows) {
    dedup.set([r.host, r.stem, r.src, r.origin].join('\u0000'), r);
  }
  const finalRows = Array.from(dedup.values()).sort((a, b) => {
    const ka = [a.host, a.stem, a.src, a.origin].join('\u0000');
    const kb = [b.host, b.stem, b.src, b.origin].join('\u0000');
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  });

  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, finalRows.map((r) => JSON.stringify(r)).join('\n') + (finalRows.length ? '\n' : ''), 'utf8');
  } catch (e) {
    console.error('写入失败: ' + e.message);
    process.exit(1);
  }

  const manual = finalRows.filter((r) => r.origin === 'manual').length;
  const learn = finalRows.filter((r) => r.origin === 'learned').length;
  console.log('[export-fixtures] 输入  : ' + input);
  console.log('[export-fixtures] 产出  : ' + out);
  console.log('[export-fixtures] 条目  : ' + finalRows.length + ' (手动结论 ' + manual + ' / 学习规则 ' + learn + ')');
  console.log('[export-fixtures] 提示  : dev/fixtures/ 已 gitignore (含你的图片 URL, 不入库)');
  console.log('[export-fixtures] 提示  : 之后跑 node test.js 即会多断言这一组');
}

main();
