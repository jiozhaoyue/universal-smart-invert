// 审计: 各类体内 this.method() 调用 vs 本类实际定义的方法 —— 找 R15 同类死调用。
// 用法: node dev/audit-dead-calls.js   (零依赖)
// 注: 同一套逻辑已固化为 test.js 的**永久门禁**（R15c 块, 12 个类差集必须为空）——
//     本文件保留为诊断工具（给出逐类明细）; 两处口径需一致, 改一处须同步另一处。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8');
const lines = src.split('\n');

const classes = [];
const classRe = /^  class ([A-Za-z_$][\w$]*) \{/;
for (let i = 0; i < lines.length; i++) {
  const m = classRe.exec(lines[i]);
  if (m) classes.push({ name: m[1], start: i });
}
for (let c = 0; c < classes.length; c++) {
  const end = c + 1 < classes.length ? classes[c + 1].start : lines.length;
  let bodyEnd = end;
  for (let i = classes[c].start + 1; i < end; i++) {
    if (lines[i] === '  }') { bodyEnd = i; break; }
  }
  classes[c].body = lines.slice(classes[c].start, bodyEnd).join('\n');
  classes[c].startLine = classes[c].start + 1;
  classes[c].endLine = bodyEnd + 1;
}

console.log('classes: ' + classes.map(c => c.name + ':' + c.startLine + '-' + c.endLine).join(', '));

for (const cls of classes) {
  const code = cls.body.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const defined = new Set();
  for (const m of code.matchAll(/^    (?:static\s+|get\s+|set\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(/gm)) defined.add(m[1]);
  for (const m of code.matchAll(/^    (?:static\s+)?([A-Za-z_$][\w$]*)\s*=/gm)) defined.add(m[1]);
  // 剥字符串字面量 (减少注释样例里的噪声)
  const noStr = code
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const calls = new Map();
  const callLine = new Map();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\/\/.*$/, '');
    for (const m of l.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = m[1];
      calls.set(name, (calls.get(name) || 0) + 1);
      if (!callLine.has(name)) callLine.set(name, i + 1);
    }
  }
  const dead = [...calls.keys()].filter(n => !defined.has(n) && callLine.get(n) >= cls.startLine && callLine.get(n) <= cls.endLine);
  if (dead.length) {
    console.log('\n[' + cls.name + '] 未在本类定义的 this. 调用:');
    for (const n of dead) console.log('  this.' + n + '() x' + calls.get(n) + '  (首次 ~line ' + callLine.get(n) + ')');
  }
}
console.log('\naudit done');
