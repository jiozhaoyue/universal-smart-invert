'use strict';
/*
 * scripts/build-crx.js — 本地零依赖产出 CRX3（v6.5 R7）
 *
 * 优先本机 Chrome 的 `--pack-extension`（与应用商店**同源实现**），无 Chrome 时降级
 * `npx --yes crx3`（与 release CI 现有路径一致）。
 *
 * **默认不生成密钥**（PRD R8/Notes：生成密钥是一次性且需用户确认的动作）：
 *   - 缺少 `crx-private-key.pem` 且未传 `--generate-key` → 打印指引并以非零码退出；
 *   - 传了 `--generate-key` → 由 Chrome 打包时顺带生成（零依赖），随后把生成的 .pem 移到约定路径，
 *     并在控制台**醒目提示立即离线备份**。
 *
 * 产物落 dist/（已 gitignore），命名与 pack.js 的 zip 规范一致。
 *
 * 用法:
 *   node scripts/build-crx.js                     # 用既有密钥签名打包
 *   node scripts/build-crx.js --generate-key      # 首次：生成密钥并打包（需用户确认后再执行）
 *   node scripts/build-crx.js --verify-only <crx> # 只做结构校验
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readCentralDirectory } = require('./lib/zip');

const ROOT = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT, 'extension');
const DIST_DIR = path.join(ROOT, 'dist');
const KEY_PATH = path.join(ROOT, 'crx-private-key.pem');

const CHROME_CANDIDATES = process.env.SVI_CHROME_PATH
  ? [process.env.SVI_CHROME_PATH]
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'linux'
      ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
      : ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];

function findChrome() {
  return CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || null;
}

// ---- CRX3 结构校验 (纯函数, 单测契约) ----
//   CRX3 布局: "Cr24" (4B) + version (4B, LE = 3) + header_size (4B, LE) + header(protobuf) + ZIP
//   这里刻意**不解析 protobuf**（签名细节与应用商店实现绑定），只做"结构自洽 + 内嵌 ZIP 可解析"
//   这一层能被单测覆盖、且足以发现截断 / 拼错 / 版本不对的检查。
function verifyCrx3(buf) {
  const errs = [];
  if (!buf || buf.length < 16) return { ok: false, errors: ['文件过短 (<16 字节)'] };
  const magic = buf.slice(0, 4).toString('latin1');
  if (magic !== 'Cr24') errs.push('魔数不是 Cr24: ' + JSON.stringify(magic));
  const version = buf.readUInt32LE(4);
  if (version !== 3) errs.push('CRX 版本不是 3: ' + version);
  const headerSize = buf.readUInt32LE(8);
  if (!(headerSize > 0) || headerSize > buf.length - 12) errs.push('头部长度不自洽: ' + headerSize);
  if (errs.length) return { ok: false, errors: errs };

  const zipStart = 12 + headerSize;
  const zip = buf.slice(zipStart);
  if (zip.length < 22) return { ok: false, errors: ['内嵌 ZIP 过短'] };
  if (zip.slice(0, 2).toString('latin1') !== 'PK') errs.push('内嵌 ZIP 不以 PK 开头');
  let entries = [];
  try {
    // readCentralDirectory 返回 { count, entries }
    const cd = readCentralDirectory(zip);
    entries = (cd && cd.entries) || [];
  } catch (e) {
    errs.push('内嵌 ZIP 中央目录解析失败: ' + e.message);
  }
  if (!entries.length && !errs.length) errs.push('内嵌 ZIP 里没有任何条目');
  return {
    ok: errs.length === 0, errors: errs, version: version, headerSize: headerSize,
    count: entries.length, entries: entries.map((e) => e.name),
  };
}

function fail(msg) {
  console.error('[build-crx] 错误: ' + msg);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const verifyOnlyIdx = argv.indexOf('--verify-only');
  if (verifyOnlyIdx >= 0) {
    const target = argv[verifyOnlyIdx + 1];
    if (!target) fail('--verify-only 需要一个 .crx 路径');
    const res = verifyCrx3(fs.readFileSync(path.resolve(ROOT, target)));
    if (!res.ok) fail('结构校验未通过: ' + res.errors.join('; '));
    console.log('[build-crx] 结构校验通过: ' + target + ' (' + res.entries.length + ' entries)');
    return;
  }

  const generateKey = argv.indexOf('--generate-key') >= 0;
  if (!fs.existsSync(EXT_DIR)) fail('extension/ 不存在 —— 先跑 node scripts/build-extension.js');

  if (!fs.existsSync(KEY_PATH) && !generateKey) {
    console.error('[build-crx] 找不到签名私钥: ' + path.relative(ROOT, KEY_PATH));
    console.error('  生成密钥是一次性动作, 需要你确认 (PRD v6-5 Notes), 因此默认不自动生成。');
    console.error('  确认后执行:  node scripts/build-crx.js --generate-key');
    console.error('  生成后请**立即离线备份**该 .pem —— 它决定扩展 ID 与升级链, 丢了就无法给已装用户升级。');
    console.error('  该文件已被 .gitignore 覆盖, 绝不入库。');
    process.exit(1);
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outName = 'universal-smart-invert-extension.crx';
  const outPath = path.join(DIST_DIR, outName);
  const chrome = findChrome();

  if (chrome) {
    const args = ['--pack-extension=' + EXT_DIR, '--no-message-box'];
    if (fs.existsSync(KEY_PATH)) args.push('--pack-extension-key=' + KEY_PATH);
    const res = spawnSync(chrome, args, { stdio: 'inherit' });
    // Chrome 把产物写在**扩展目录旁边**: <dir>.crx (+ 无密钥时 <dir>.pem)
    const chromeCrx = EXT_DIR + '.crx';
    const chromePem = EXT_DIR + '.pem';
    if (res.status !== 0 || !fs.existsSync(chromeCrx)) fail('Chrome 打包失败 (exit ' + res.status + ')');
    if (!fs.existsSync(KEY_PATH) && fs.existsSync(chromePem)) {
      fs.renameSync(chromePem, KEY_PATH);
      console.log('');
      console.log('  ⚠ 已生成签名密钥: ' + path.relative(ROOT, KEY_PATH));
      console.log('  ⚠ 请**立即离线备份**并妥善保管 —— 它决定扩展 ID 与升级链, 丢失后无法给已装用户升级。');
      console.log('  ⚠ 该文件已在 .gitignore 中, 绝不要提交进仓库。');
      console.log('');
    }
    fs.renameSync(chromeCrx, outPath);
    console.log('[build-crx] 用本机 Chrome 打包完成 (与应用商店同源实现)');
  } else {
    console.log('[build-crx] 未找到本机 Chrome → 降级 npx --yes crx3 (与 release CI 同路径)');
    const res = spawnSync('npx', ['--yes', 'crx3', '-p', KEY_PATH, '-o', outPath, EXT_DIR], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (res.status !== 0) fail('crx3 打包失败 (exit ' + res.status + ')');
  }

  const res = verifyCrx3(fs.readFileSync(outPath));
  if (!res.ok) fail('产物结构校验未通过: ' + res.errors.join('; '));
  console.log('[build-crx] 产物: ' + path.relative(ROOT, outPath) + ' (' + fs.statSync(outPath).size + ' bytes, ' + res.entries.length + ' entries)');
  console.log('[build-crx] 结构校验通过: Cr24 / CRX3 / 内嵌 ZIP 中央目录可解析');
  console.log('[build-crx] 提醒: 非商店来源的 CRX 在 Windows Chrome 上默认被阻止安装 (见 PUBLISHING.md)');
}

if (require.main === module) main();

module.exports = { verifyCrx3, KEY_PATH, DIST_DIR };
