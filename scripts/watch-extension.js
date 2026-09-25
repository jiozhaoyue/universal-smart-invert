'use strict';
/*
 * scripts/watch-extension.js — 源码变更 → 自动重建 extension/（v6.6 R4，零依赖）
 *
 * 用途：Edge / Chrome 以「加载已解压的扩展」指向本仓的 `extension/` 目录时，
 * 该目录内容一旦更新，浏览器侧点一下「重新加载」即可生效。本脚本负责让那个目录
 * **始终是最新构建** —— 这正是「始终同步最新」在本地方案里能成立的前提。
 *
 * 监听：`universal-smart-invert.user.js`（唯一真源）与 `scripts/extension-src/`（popup / options 源）
 * 变更 → 防抖 → 依次 `gen-icons` → `build-extension`（可选 `--pack`）。
 *
 * 纪律：
 *   - **零依赖**：只用 fs / child_process，不引入 chokidar 之类；
 *   - **单次重建失败不退出**：watch 场景下退出等于失去保护，改为打印错误后继续监听；
 *   - `--pack` 只在显式指定时跑（zip 属产物，默认不生成，避免无谓噪声）。
 *
 * 用法:
 *   node scripts/watch-extension.js                 # 监听并重建（默认防抖 300ms）
 *   node scripts/watch-extension.js --pack          # 重建后顺带跑 pack.js
 *   node scripts/watch-extension.js --debounce 800  # 自定义防抖窗口（毫秒）
 *   node scripts/watch-extension.js --once          # 只重建一次后退出（供门禁/CI 用）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC_FILE = path.join(ROOT, 'universal-smart-invert.user.js');
const EXT_SRC_DIR = path.join(__dirname, 'extension-src');
const EXT_OUT_DIR = path.join(ROOT, 'extension');

// —— 参数解析 ——
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f, def) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const DEBOUNCE_MS = Math.max(50, Number(flagValue('--debounce', '300')) || 300);
const ONCE = hasFlag('--once');
const WITH_PACK = hasFlag('--pack');

function log(msg) {
  console.log('[watch-extension] ' + msg);
}
function warn(msg) {
  console.warn('[watch-extension] ' + msg);
}

// 依次跑构建链。任一步失败只记录，不抛出（watch 必须活下去）。
function rebuild(reason) {
  const t0 = Date.now();
  const steps = [
    ['scripts/gen-icons.js', []],
    ['scripts/build-extension.js', []],
  ];
  if (WITH_PACK) steps.push(['scripts/pack.js', []]);
  for (const [rel, args] of steps) {
    try {
      execFileSync(process.execPath, [path.join(ROOT, rel), ...args], { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      warn('重建失败于 ' + rel + '（继续监听）: ' + (e && e.message ? e.message : e));
      return false;
    }
  }
  let stamp = '';
  try {
    const st = fs.statSync(path.join(EXT_OUT_DIR, 'content.js'));
    stamp = ' | content.js ' + st.size + ' 字节';
  } catch (e) { /* ignore */ }
  log('重建完成（' + reason + '，' + (Date.now() - t0) + 'ms）' + stamp);
  return true;
}

// 目录内容摘要（名 + mtime + 大小）。用于兜底：fs.watch 在部分平台/编辑器下
// 对「新文件」只发 rename 甚至不发事件，靠摘要比对能补上。
function dirDigest(dir) {
  const parts = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      try {
        const st = fs.statSync(full);
        parts.push(path.relative(dir, full).split(path.sep).join('/') + ':' + st.mtimeMs + ':' + st.size);
      } catch (e) { /* ignore */ }
    }
  };
  walk(dir);
  return parts.join('|');
}

function main() {
  if (!fs.existsSync(SRC_FILE)) {
    warn('找不到真源文件: ' + SRC_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(EXT_SRC_DIR)) {
    warn('找不到扩展源目录: ' + EXT_SRC_DIR);
    process.exit(1);
  }

  log('首次重建 ...');
  rebuild('启动');

  if (ONCE) {
    log('--once 已指定，重建一次后退出');
    return;
  }

  let timer = null;
  let pendingReason = '';
  let lastDigest = dirDigest(EXT_SRC_DIR);
  const schedule = (reason) => {
    pendingReason = pendingReason ? pendingReason + ' + ' + reason : reason;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const why = pendingReason;
      pendingReason = '';
      rebuild(why);
      // 重建后刷新摘要: 否则摘要兜底会把同一次改动再判成一次变更 (双重建)
      lastDigest = dirDigest(EXT_SRC_DIR);
    }, DEBOUNCE_MS);
  };

  // 1) 真源文件（按文件监听：编辑器多为原子替换，rename 也要接）
  try {
    fs.watch(SRC_FILE, { persistent: true }, () => schedule('用户脚本'));
    log('监听: ' + path.relative(ROOT, SRC_FILE));
  } catch (e) {
    warn('监听真源文件失败: ' + (e && e.message ? e.message : e));
  }

  // 2) 扩展源目录（非递归监听 + 递归摘要兜底）
  try {
    fs.watch(EXT_SRC_DIR, { persistent: true }, () => schedule('extension-src'));
    log('监听: ' + path.relative(ROOT, EXT_SRC_DIR));
  } catch (e) {
    warn('监听扩展源目录失败: ' + (e && e.message ? e.message : e));
  }

  // 3) 摘要兜底轮询：平台/编辑器漏事件时补上（间隔取防抖窗口的 2 倍，最低 500ms）
  const pollMs = Math.max(500, DEBOUNCE_MS * 2);
  setInterval(() => {
    const now = dirDigest(EXT_SRC_DIR);
    if (now !== lastDigest) {
      lastDigest = now;
      schedule('extension-src（摘要兜底）');
    }
  }, pollMs);
  log('摘要兜底轮询: ' + pollMs + 'ms；防抖窗口: ' + DEBOUNCE_MS + 'ms');
  log('就绪。改源码即自动重建；浏览器侧点「重新加载」使扩展生效。Ctrl+C 退出。');
}

main();
