'use strict';
/*
 * test-firefox.js — Firefox 端到端 E2E（Mozilla 官方通道，零自研协议）
 *
 * 通道组成（全部为现成方案）：
 *   - mozilla/geckodriver          官方 WebDriver 实现（W3C WebDriver 协议）
 *   - POST /session/:id/moz/addon/install
 *                                  Firefox 专有的 WebDriver **扩展命令**
 *                                  （已被 Selenium / WebdriverIO 实现），
 *                                  载荷 = 扩展 zip 的 base64
 *   - scripts/pack.js              项目已产出的确定性 ZIP（manifest 在根），
 *                                  正是该命令所需 → 不新增任何打包逻辑
 *
 * 与 test-extension.js 的分工：
 *   Chromium 系（Chrome / Edge）→ CDP `Extensions.loadUnpacked`
 *   Firefox 系                  → 本文件（WebDriver `moz/addon/install`）
 *
 * 断言（对齐 prd.md 的验收标准）：
 *   F1  扩展装载成功，且返回的 addon id **等于** manifest 的 gecko.id
 *       （证明 FF 用的是我们的固定身份，而非随机临时 id）
 *   F2  浅色图真实反色：computedStyle.filter 含 invert(1)
 *   F3  深色图不反色（避免"全盘反色"的假通过）
 *   F4  html.class 含 svi-img-invert-on（扩展确实接管了页面）
 *
 * 降级约定（与 test-extension.js 一致）：找不到 geckodriver 或 Firefox 时，
 * 输出「未验证」并以 0 退出 —— **但绝不把未验证伪装成通过**。
 *
 * 用法：
 *   node test-firefox.js
 *   SVI_GECKODRIVER=<path>  SVI_FIREFOX=<path>  node test-firefox.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const EXT_DIR = path.join(ROOT, 'extension');
const MANIFEST = path.join(EXT_DIR, 'manifest.json');
const DIST_DIR = path.join(ROOT, 'dist');

const GD_PORT = Number(process.env.SVI_GD_PORT || 4457);
const HTTP_PORT = Number(process.env.SVI_FF_HTTP_PORT || 8793);
const LOAD_TIMEOUT_MS = 20000; // 装载后等待反色生效的上限
const POLL_MS = 400;

function log(msg) { console.log('[FF] ' + msg); }
function fail(msg) { console.error('[FF] ERROR: ' + msg); }

// —— 二进制探测（env > 项目内 <dev/tools> > 系统默认位置）——

function findGeckodriver() {
  const cands = [];
  if (process.env.SVI_GECKODRIVER) cands.push(process.env.SVI_GECKODRIVER);
  cands.push(path.join(ROOT, 'dev', 'tools', 'geckodriver.exe'));
  cands.push(path.join(ROOT, 'dev', 'tools', 'geckodriver'));
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

function findFirefox() {
  const cands = [];
  if (process.env.SVI_FIREFOX) cands.push(process.env.SVI_FIREFOX);
  if (process.platform === 'win32') {
    cands.push('C:\\Program Files\\Mozilla Firefox\\firefox.exe');
    cands.push('C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe');
  } else if (process.platform === 'darwin') {
    cands.push('/Applications/Firefox.app/Contents/MacOS/firefox');
  } else {
    cands.push('/usr/bin/firefox', '/usr/local/bin/firefox');
  }
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

// —— fixture（复用 test-browser.js 里那组已被判定管线认可的同源 SVG）——

const WHITE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#ffffff"/><path d="M20,20 L180,20 L180,130 L20,130 Z" stroke="#333" fill="none" stroke-width="2"/><text x="40" y="80" fill="#000" font-family="sans-serif" font-size="16">Architecture</text></svg>';
const DARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#0f172a"/><circle cx="100" cy="75" r="40" fill="#334155"/><text x="60" y="80" fill="#94a3b8">Dark Photo</text></svg>';

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Firefox WebDriver E2E fixture</title>
  <style>
    body { font-family: sans-serif; background: #121212; color: #fff; padding: 20px; }
    img { display: block; width: 200px; height: 150px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Firefox WebDriver E2E</h1>
  <img id="img-white" src="/img/white.svg" alt="white diagram">
  <img id="img-dark" src="/img/dark.svg" alt="dark photo">
</body>
</html>`;

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(FIXTURE_HTML);
        return;
      }
      if (url === '/img/white.svg') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(WHITE_SVG);
        return;
      }
      if (url === '/img/dark.svg') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(DARK_SVG);
        return;
      }
      res.writeHead(404); res.end('Not Found');
    });
    srv.once('error', reject);
    srv.listen(HTTP_PORT, '127.0.0.1', () => resolve(srv));
  });
}

// —— 极简 WebDriver 客户端（W3C 协议，node 内置 fetch）——

async function wd(method, urlPath, body) {
  const res = await fetch(`http://127.0.0.1:${GD_PORT}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 保留原始文本 */ }
  if (!res.ok) {
    const detail = json && json.value ? JSON.stringify(json.value) : text.slice(0, 300);
    const err = new Error(`${method} ${urlPath} → HTTP ${res.status}: ${detail}`);
    err.wd = json && json.value;
    throw err;
  }
  return json ? json.value : null;
}

async function waitForGeckodriver(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await wd('GET', '/status');
      return true;
    } catch (e) { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

// 页面探针：在页面上下文中读真实渲染结果（execute/sync 的 script 以函数体形式传入）
const PROBE_SCRIPT = [
  'var out = {};',
  'var imgs = document.querySelectorAll("img");',
  'for (var i = 0; i < imgs.length; i++) {',
  '  var im = imgs[i];',
  '  var cs = getComputedStyle(im);',
  '  out[im.id || ("img-" + i)] = {',
  '    filter: cs.filter,',
  '    inverted: /invert\\(/.test(cs.filter) || im.hasAttribute("data-svi-invert")',
  '  };',
  '}',
  'return { htmlClass: document.documentElement.className, imgs: out };',
].join('\n');

// 始终重新打包。pack.js 是确定性的（内容相同 ⇒ 字节相同），但**必须每次重跑**：
// 版本号未变时会复用上一版 manifest 打出的陈旧 zip，而装载载荷恰恰是这个 zip。
// 首轮实测就踩到了 —— extension/ 已含 gecko.id，zip 里却还是旧的，Firefox 于是
// 分配了随机 @temporary-addon id，F1 直接失败。
function packFreshZip(manifestVersion) {
  log('重新打包（scripts/pack.js）...');
  execFileSync(process.execPath, [path.join('scripts', 'pack.js')], { cwd: ROOT, stdio: 'inherit' });
  const zipPath = path.join(DIST_DIR, `universal-smart-invert-extension-v${manifestVersion}.zip`);
  if (!fs.existsSync(zipPath)) throw new Error('打包产物不存在: ' + zipPath);
  return zipPath;
}

(async function main() {
  const geckodriver = findGeckodriver();
  const firefox = findFirefox();

  if (!geckodriver || !firefox) {
    const missing = [];
    if (!geckodriver) missing.push('geckodriver（可设 SVI_GECKODRIVER，或放到 dev/tools/）');
    if (!firefox) missing.push('Firefox（可设 SVI_FIREFOX）');
    log('SKIP: 未验证（缺少 ' + missing.join('；') + '）');
    log('说明：这是**未验证**，不是通过 —— 补上依赖后重跑本脚本。');
    process.exit(0);
  }
  log('geckodriver: ' + geckodriver);
  log('firefox    : ' + firefox);

  if (!fs.existsSync(MANIFEST)) throw new Error('extension/manifest.json 不存在，请先 node scripts/build-extension.js');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const geckoId = manifest.browser_specific_settings
    && manifest.browser_specific_settings.gecko
    && manifest.browser_specific_settings.gecko.id;
  if (!geckoId) throw new Error('manifest 缺少 browser_specific_settings.gecko.id（Firefox MV3 必需）');
  log('manifest gecko.id = ' + geckoId);

  const zipPath = packFreshZip(manifest.version);
  const zipB64 = fs.readFileSync(zipPath).toString('base64');
  log('装载载荷 = ' + path.basename(zipPath) + '（' + zipB64.length + ' base64 字符）');

  const srv = await startFixtureServer();
  // geckodriver 自行创建并销毁临时 profile（不触碰用户 profile），此处无需管理
  const gd = spawn(geckodriver, ['--port', String(GD_PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let gdStderr = '';
  gd.stderr.on('data', (d) => { gdStderr += d.toString(); });

  let sessionId = null;
  let passed = 0;
  try {
    if (!(await waitForGeckodriver(15000))) throw new Error('geckodriver 未在 15s 内就绪:\n' + gdStderr);
    log('geckodriver 就绪');

    const created = await wd('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          'moz:firefoxOptions': { binary: firefox, args: ['-headless'] },
        },
      },
    });
    sessionId = created.sessionId;
    log('session = ' + sessionId + '（browser ' + (created.capabilities && created.capabilities.browserVersion) + '）');

    // —— F1: 官方命令装载扩展，且身份必须是我们的固定 gecko.id ——
    log('F1: moz/addon/install（temporary）...');
    const installed = await wd('POST', `/session/${sessionId}/moz/addon/install`, {
      addon: zipB64,
      temporary: true,
    });
    const addonId = typeof installed === 'string' ? installed : (installed && installed.value) || String(installed);
    log('  装载返回 id = ' + addonId);
    if (addonId !== geckoId) {
      throw new Error('addon id 不等于 manifest 的 gecko.id（期望 ' + geckoId + '，得到 ' + addonId + '）'
        + ' —— 说明身份未被 Firefox 采纳');
    }
    log('  ✓ F1 通过：id 与 gecko.id 一致');
    passed++;

    // —— 打开 fixture 并等待反色生效 ——
    await wd('POST', `/session/${sessionId}/url`, { url: `http://127.0.0.1:${HTTP_PORT}/` });
    log('已打开 fixture: http://127.0.0.1:' + HTTP_PORT + '/');

    let report = null;
    const deadline = Date.now() + LOAD_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        report = await wd('POST', `/session/${sessionId}/execute/sync`, { script: PROBE_SCRIPT, args: [] });
      } catch (e) { report = null; }
      if (report && report.imgs && report.imgs['img-white'] && report.imgs['img-white'].inverted) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (!report || !report.imgs) throw new Error('页面探针始终无返回（执行上下文异常）');
    log('探针结果: ' + JSON.stringify(report));

    // —— F2/F3: 浅色反色、深色不反色 ——
    const white = report.imgs['img-white'];
    const dark = report.imgs['img-dark'];
    if (!white || !white.inverted) throw new Error('F2 失败：浅色图未反色（filter=' + (white && white.filter) + '）');
    log('  ✓ F2 通过：浅色图已反色（filter=' + white.filter + '）');
    passed++;

    if (dark && dark.inverted) throw new Error('F3 失败：深色图被误反色（filter=' + dark.filter + '）');
    log('  ✓ F3 通过：深色图未被反色');
    passed++;

    // —— F4: 扩展确实接管了页面 ——
    if (!/svi-img-invert-on/.test(report.htmlClass || '')) {
      throw new Error('F4 失败：html.class 不含 svi-img-invert-on（实际 "' + report.htmlClass + '"）');
    }
    log('  ✓ F4 通过：html.class = "' + report.htmlClass + '"');
    passed++;

    console.log('\n🎉 Firefox E2E 通过（' + passed + '/4 断言）: ' + geckoId);
  } finally {
    if (sessionId) { try { await wd('DELETE', `/session/${sessionId}`); } catch (e) { /* ignore */ } }
    try { gd.kill(); } catch (e) { /* ignore */ }
    try { srv.close(); } catch (e) { /* ignore */ }
  }
})().catch((err) => {
  fail(err && err.message ? err.message : String(err));
  process.exit(1);
});
