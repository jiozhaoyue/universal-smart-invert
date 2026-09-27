#!/usr/bin/env node
// 固化第三方产物 Dark Reader 引擎的同步/校验入口 (零依赖)。
//
//   node scripts/vendor-darkreader.js            # 等价于 --verify
//   node scripts/vendor-darkreader.js --verify    # 校验 vendor/ 里文件的 SHA-256 与 PROVENANCE 表一致
//   node scripts/vendor-darkreader.js --update 4.9.134 [--yes]
//                                                # 拉取指定版本、逐字节替换、重算溯源表
//                                                # 不加 --yes 只打印将要发生的变化 (默认不写盘)
//
// **为什么要这个脚本**: 上游是活跃的扩展项目。我们只依赖它的一个稳定公开 API
// (enable/disable/isEnabled/setFetchMethod), 所以策略是**冻结**而非跟随; 冻结要成立,
// 就必须能随时回答两个问题: ①当前锁定的是哪个版本、从哪来、哈希是多少 (PROVENANCE.md);
// ②磁盘上的文件有没有被人手改过 (--verify, 已接入 test.js 门禁)。
// 升级是显式动作并单独成一个提交, 不让上游噪音混进本仓的 diff。
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'darkreader');
const ENGINE = path.join(VENDOR_DIR, 'darkreader.js');
const LICENSE = path.join(VENDOR_DIR, 'LICENSE');
const PROVENANCE = path.join(VENDOR_DIR, 'PROVENANCE.md');
const REGISTRY = 'https://registry.npmjs.org/darkreader/-/darkreader-%VERSION%.tgz';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// CLI 直跑 → 打印并 exit(1); 被 require (test.js 门禁) → 抛错, 由调用方摘住断言。
const CLI = require.main === module;
const die = (msg) => {
  if (CLI) { console.error('[vendor-darkreader] ' + msg); process.exit(1); }
  throw new Error(msg);
};

// —— 从 PROVENANCE.md 读取锁定的元数据 (单一真源就是那张表) ——
function readProvenance() {
  if (!fs.existsSync(PROVENANCE)) die('PROVENANCE.md 缺失 —— 无溯源即视为未完成');
  const text = fs.readFileSync(PROVENANCE, 'utf8');
  const grab = (label) => {
    const re = new RegExp('\\|\\s*' + label + '\\s*\\|\\s*([^|\\n]+?)\\s*\\|');
    const m = text.match(re);
    return m ? m[1].replace(/[*`]/g, '').trim() : null;
  };
  return {
    text,
    version: grab('版本'),
    tarballSha: grab('tarball SHA-256'),
    fileSha: grab('本目录 `darkreader.js` SHA-256'),
    fileBytes: grab('本目录 `darkreader.js` 字节数'),
  };
}

function verify() {
  const p = readProvenance();
  if (!p.fileSha) die('PROVENANCE.md 里没有 darkreader.js 的 SHA-256 —— 溯源表不完整');
  if (!fs.existsSync(ENGINE)) die('vendor/darkreader/darkreader.js 缺失');
  const buf = fs.readFileSync(ENGINE);
  const got = sha256(buf);
  if (got !== p.fileSha) {
    die(`vendor/darkreader/darkreader.js 哈希不符 ——\n  记录: ${p.fileSha}\n  实测: ${got}\n` +
        '  该文件是冻结产物, 不得手改; 需要升级请用 --update。');
  }
  if (p.fileBytes && String(buf.length) !== String(p.fileBytes)) {
    die(`字节数不符: 记录 ${p.fileBytes}, 实测 ${buf.length}`);
  }
  const lic = fs.existsSync(LICENSE) ? fs.readFileSync(LICENSE, 'utf8') : '';
  if (!/MIT License/.test(lic)) die('vendor/darkreader/LICENSE 缺失或不是 MIT 文本 (分发义务)');
  console.log(`[vendor-darkreader] OK — darkreader@${p.version} · ${buf.length} 字节 · sha256 ${got.slice(0, 16)}… · MIT 许可在场`);
  return p;
}

// —— 零依赖 tar 读取 (只取我们需要的两个成员) ——
function untar(buffer, want) {
  const out = {};
  let off = 0;
  while (off + 512 <= buffer.length) {
    const header = buffer.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;               // 结束块
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const body = buffer.subarray(off + 512, off + 512 + size);
    if (want.includes(name)) out[name] = Buffer.from(body);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

// —— 取 tarball ——
// 国际网络在本机走代理 (HTTPS_PROXY), 因此**必须**支持 CONNECT 隧道: 直接 https.get 会
// TLS 超时 (实测)。零依赖实现: http.request 发 CONNECT → 在隧道 socket 上 tls.connect。
const http = require('http');
const tls = require('tls');

function proxyUrl() {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
}

function fetchViaProxy(url, proxy, depth = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const p = new URL(proxy);
    const connectReq = http.request({
      host: p.hostname,
      port: p.port || 8080,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      headers: { Host: `${target.hostname}:${target.port || 443}` },
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { reject(new Error(`proxy CONNECT ${res.statusCode}`)); socket.destroy(); return; }
      const tlsSock = tls.connect({ socket, servername: target.hostname }, () => {
        tlsSock.write(
          `GET ${target.pathname}${target.search} HTTP/1.1\r\n` +
          `Host: ${target.hostname}\r\n` +
          'User-Agent: svi-vendor-darkreader\r\n' +
          'Accept: */*\r\n' +
          'Connection: close\r\n\r\n'
        );
      });
      const chunks = [];
      tlsSock.on('data', (c) => chunks.push(c));
      tlsSock.on('end', () => {
        const raw = Buffer.concat(chunks);
        const sep = raw.indexOf('\r\n\r\n');
        if (sep < 0) { reject(new Error('proxy 响应无法解析')); return; }
        const head = raw.subarray(0, sep).toString('latin1');
        const status = parseInt((head.match(/^HTTP\/\d\.\d (\d+)/) || [])[1] || '0', 10);
        if (status === 301 || status === 302 || status === 307 || status === 308) {
          const loc = (head.match(/^location:\s*(.+)$/im) || [])[1];
          if (loc && depth < 5) { resolve(fetchViaProxy(loc.trim(), proxy, depth + 1)); return; }
        }
        if (status !== 200) { reject(new Error(`HTTP ${status} (via proxy)`)); return; }
        // 分块传输: 只在此处做最小解码 (registry 对大文件会 chunked)
        resolve(dechunkIfNeeded(head, raw.subarray(sep + 4)));
      });
      tlsSock.on('error', reject);
    });
    connectReq.on('error', reject);
    connectReq.setTimeout(60000, () => connectReq.destroy(new Error('proxy CONNECT timeout')));
    connectReq.end();
  });
}

function dechunkIfNeeded(head, body) {
  if (!/transfer-encoding:\s*chunked/i.test(head)) return body;
  const out = [];
  let off = 0;
  while (off < body.length) {
    const nl = body.indexOf('\r\n', off);
    if (nl < 0) break;
    const size = parseInt(body.subarray(off, nl).toString('ascii').trim(), 16);
    if (!size) break;
    out.push(body.subarray(nl + 2, nl + 2 + size));
    off = nl + 2 + size + 2;
  }
  return Buffer.concat(out);
}

function fetchTarball(version) {
  const url = REGISTRY.replace('%VERSION%', version);
  const proxy = proxyUrl();
  if (proxy) return fetchViaProxy(url, proxy);
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'svi-vendor-darkreader' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); res.resume(); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

async function update(version, write) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) die('版本号必须是 x.y.z 形态');
  const prev = readProvenance();
  console.log(`[vendor-darkreader] 拉取 darkreader@${version} ...`);
  const tgz = await fetchTarball(version);
  const tgzSha = sha256(tgz);
  const files = untar(zlib.gunzipSync(tgz), ['package/darkreader.js', 'package/LICENSE']);
  const eng = files['package/darkreader.js'];
  const lic = files['package/LICENSE'];
  if (!eng || !eng.length) die('tarball 里没有 package/darkreader.js');
  if (!lic || !/MIT License/.test(lic.toString('utf8'))) die('tarball 里没有 MIT LICENSE');

  const newSha = sha256(eng);
  console.log(`[vendor-darkreader] 当前锁定: ${prev.version} (${prev.fileSha ? prev.fileSha.slice(0, 16) + '…' : '?'})`);
  console.log(`[vendor-darkreader] 将要写入: ${version} (${newSha.slice(0, 16)}…) · ${eng.length} 字节`);
  if (!write) {
    console.log('[vendor-darkreader] 这是预演 (未写盘)。确认后加 --yes。');
    return 0;
  }
  fs.writeFileSync(ENGINE, eng);
  fs.writeFileSync(LICENSE, lic);
  // 重算溯源表 (只替换表格里的四行, 其余说明文字保持人工撰写的内容)
  let text = prev.text;
  const setRow = (label, value) => {
    const re = new RegExp('(\\|\\s*' + label + '\\s*\\|\\s*)`?[^`|\\n]+?`?(\\s*\\|)');
    if (!re.test(text)) die(`PROVENANCE.md 里找不到行: ${label}`);
    text = text.replace(re, `$1${value}$2`);
  };
  setRow('版本', `**${version}**`);
  setRow('tarball', '`https://registry.npmjs.org/darkreader/-/darkreader-' + version + '.tgz`');
  setRow('tarball SHA-256', '`' + tgzSha + '`');
  setRow('本目录 `darkreader.js` SHA-256', '`' + newSha + '`');
  setRow('本目录 `darkreader.js` 字节数', String(eng.length));
  text = text.replace(/(\| 冻结日期 \| )([^|]+)(\|)/, (m, a, b, c) => a + new Date().toISOString().slice(0, 10) + c);
  fs.writeFileSync(PROVENANCE, text);
  console.log('[vendor-darkreader] 已写入。请接着跑 node scripts/smoke-darkreader.js 与门禁。');
  return 0;
}

module.exports = { verify, readProvenance, sha256, untar };

if (CLI) {
  const argv = process.argv.slice(2);
  (async () => {
    if (argv.includes('--update')) {
      const v = argv[argv.indexOf('--update') + 1];
      const code = await update(v, argv.includes('--yes'));
      process.exit(code);
    }
    verify();
  })().catch((e) => die(e && e.stack || String(e)));
}
