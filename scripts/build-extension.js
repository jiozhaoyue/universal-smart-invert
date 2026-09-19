'use strict';
/*
 * scripts/build-extension.js — derive the MV3 extension from the userscript (zero dependencies).
 *
 * Reads universal-smart-invert.user.js and emits:
 *   - extension/content.js    = prelude (EXT_MODE + GM shims) + core body (metadata stripped)
 *   - extension/manifest.json = MV3 manifest with name/version/description synced from the header
 *
 * Prelude contract (extension form of the userscript):
 *   - EXT_MODE lives in the prelude's wrapper scope: the core reads it via
 *     `typeof EXT_MODE !== 'undefined'` to claim coexistence owner kind 'ext'
 *     (document.documentElement.dataset.sviOwner). It is deliberately NOT a
 *     page global, mirroring the isolated-world semantics of a real content
 *     script — a userscript on the same page keeps kind 'us'.
 *   - GM_xmlhttpRequest: fetch-based shim implementing the exact contract the
 *     core's gmFetchBlob relies on: { method, url, responseType:'blob', timeout }
 *     with onload({status, response}) / onerror(err) / ontimeout().
 *   - GM.xmlHttpRequest: alias of the same shim (the core's fallback lookup).
 *   - GM_addStyle: <style>-element shim (the core also has its own fallback,
 *     the shim keeps parity with the userscript @grant list).
 *   - Store backend: NO shim needed — the core's Store.detectBackend() prefers
 *     chrome.storage.sync/local natively (manifest permission "storage").
 *
 * Deterministic and idempotent: identical source → byte-identical outputs
 * (no timestamps; stable JSON key order). Re-running never dirties the tree.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'universal-smart-invert.user.js');
const OUT_DIR = path.join(ROOT, 'extension');
const CONTENT_OUT = path.join(OUT_DIR, 'content.js');
const MANIFEST_OUT = path.join(OUT_DIR, 'manifest.json');

const ICON_SIZES = [16, 32, 48, 128];
const MAX_DESCRIPTION = 132; // Chrome limit for manifest.description
const MAX_NAME = 75;         // Chrome limit for manifest.name

function fail(msg) {
  console.error('[build-extension] ERROR: ' + msg);
  process.exit(1);
}

// —— metadata parsing ——

function parseMetadata(source) {
  const m = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!m) fail('userscript metadata block (==UserScript==) not found');
  const out = {};
  const re = /^\/\/\s*@([^\s:]+)\s+(.*)$/gm;
  let match;
  while ((match = re.exec(m[1])) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (out[key] === undefined) out[key] = value; // first occurrence wins (@name before @name:en)
  }
  return out;
}

// MV3 version must be dot-separated integers; strip any suffix like "-beta".
function sanitizeVersion(v) {
  const cleaned = String(v || '').replace(/[^0-9.]/g, '').replace(/^\.+|\.+$/g, '');
  if (!cleaned || !/^\d+(\.\d+)*$/.test(cleaned)) fail('cannot derive an MV3 version from @version "' + v + '"');
  return cleaned;
}

// Chrome enforces hard length limits; clip at a word boundary when possible.
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > Math.floor(max * 0.6) ? cut.slice(0, space) : cut).trimEnd();
}

// —— prelude ——

function prelude(version) {
  return `/*!
 * ============================================================
 * universal-smart-invert — browser extension content script
 * GENERATED FILE — DO NOT EDIT.
 * Built by scripts/build-extension.js from universal-smart-invert.user.js
 * Source version: ${version}
 *
 * Prelude contract (see scripts/build-extension.js header):
 *   - EXT_MODE (wrapper scope)   → core claims coexistence kind 'ext'
 *   - GM_xmlhttpRequest          → fetch shim (blob / onload / onerror / ontimeout)
 *   - GM.xmlHttpRequest          → alias of the same shim (core fallback path)
 *   - GM_addStyle                → <style> element shim
 *   - Store backend              → none needed; core detects chrome.storage natively
 * ============================================================ */
(function () {
  'use strict';

  // Coexistence handshake: the core below resolves OWNER_KIND to 'ext' from
  // this wrapper-scoped flag. Kept off window so page scripts (and a
  // userscript sharing this world in tests) never observe it.
  var EXT_MODE = true;

  // GM_xmlhttpRequest shim over fetch. Matches the core's gmFetchBlob usage:
  // responseType 'blob' → res.response is a Blob; 2xx + truthy response →
  // onload; abort on opts.timeout (ms) → ontimeout; network failure → onerror.
  // Note: an MV3 content script cannot bypass page CORS with fetch; the
  // core's decode chain already degrades gracefully when a fetch fails.
  function __sviGmXhr(opts) {
    opts = opts || {};
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var timer = null;
    if (ctrl && opts.timeout > 0) {
      timer = setTimeout(function () {
        timedOut = true;
        try { ctrl.abort(); } catch (e) { /* ignore */ }
      }, opts.timeout);
    }
    fetch(opts.url, { method: opts.method || 'GET', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (opts.responseType === 'blob') {
          return res.blob().then(function (blob) { return { status: res.status, response: blob }; });
        }
        return res.text().then(function (text) { return { status: res.status, response: text }; });
      })
      .then(function (result) {
        if (timer) clearTimeout(timer);
        if (typeof opts.onload === 'function') opts.onload(result);
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (timedOut) {
          if (typeof opts.ontimeout === 'function') opts.ontimeout();
          return;
        }
        if (typeof opts.onerror === 'function') opts.onerror(err);
      });
  }

  var GM_xmlhttpRequest = __sviGmXhr;
  var GM = { xmlHttpRequest: __sviGmXhr };

  var GM_addStyle = function (css) {
    try {
      var el = document.createElement('style');
      el.textContent = String(css);
      (document.head || document.documentElement).appendChild(el);
    } catch (e) { /* ignore */ }
  };

  /* ==== core body (userscript source, metadata block stripped) ==== */
__BODY__
})();
`;
}

// —— main ——

function main() {
  const source = fs.readFileSync(SRC, 'utf8');
  const meta = parseMetadata(source);

  if (!meta.version) fail('@version not found in userscript header');
  if (!meta.name) fail('@name not found in userscript header');
  if (!meta.description) fail('@description not found in userscript header');
  const version = sanitizeVersion(meta.version);

  // Core body: strip the metadata block, keep everything else byte-for-byte.
  const body = source
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
    .trim();

  const content = prelude(version).replace('__BODY__', () => body);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(CONTENT_OUT, content, 'utf8');

  const extName = clip(meta.name, MAX_NAME);
  const manifest = {
    manifest_version: 3,
    name: extName,
    version: version,
    description: clip(meta.description, MAX_DESCRIPTION),
    icons: {},
    // v4.5: Dark Reader 式工具栏弹出面板 (与页面内设置面板语义一致的消息通道)
    action: {
      default_popup: 'popup.html',
      default_title: extName,
      default_icon: {},
    },
    permissions: ['storage'],
    content_scripts: [
      {
        matches: ['<all_urls>', 'file://*/*'],
        js: ['content.js'],
        // v4.3: document_start —— 内容脚本随 HTML 起步即执行, 防闪光黑底守卫先于首次绘制
        run_at: 'document_start',
        all_frames: true,
      },
    ],
  };
  for (const size of ICON_SIZES) {
    manifest.icons[String(size)] = `icons/icon${size}.png`;
    manifest.action.default_icon[String(size)] = `icons/icon${size}.png`;
  }
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // v4.5: popup sources live in scripts/extension-src/ and are copied verbatim —
  // the extension/ directory stays fully generated (no hand-edited artifacts).
  const POPUP_FILES = ['popup.html', 'popup.js'];
  const popupSrcDir = path.join(__dirname, 'extension-src');
  for (const f of POPUP_FILES) {
    const from = path.join(popupSrcDir, f);
    if (!fs.existsSync(from)) fail('popup source missing: ' + path.relative(ROOT, from));
    fs.writeFileSync(path.join(OUT_DIR, f), fs.readFileSync(from, 'utf8'), 'utf8');
  }

  // Icons are produced by scripts/gen-icons.js; verify presence so the
  // manifest never references missing files in an unpacked load.
  const missingIcons = ICON_SIZES
    .map((s) => path.join(OUT_DIR, 'icons', `icon${s}.png`))
    .filter((p) => !fs.existsSync(p));
  if (missingIcons.length) {
    fail('missing icons (' + missingIcons.map((p) => path.relative(ROOT, p)).join(', ')
      + ') — run: node scripts/gen-icons.js');
  }

  console.log('[build-extension] userscript : ' + path.relative(ROOT, SRC));
  console.log('[build-extension] version    : ' + version);
  console.log('[build-extension] name       : ' + manifest.name);
  console.log('[build-extension] description: ' + manifest.description + (manifest.description.length < meta.description.length ? ' ... [clipped to ' + MAX_DESCRIPTION + ' chars]' : ''));
  console.log('[build-extension] wrote      : ' + path.relative(ROOT, CONTENT_OUT) + ' (' + content.length + ' bytes, ' + content.split('\n').length + ' lines)');
  console.log('[build-extension] wrote      : ' + path.relative(ROOT, MANIFEST_OUT));
  console.log('[build-extension] wrote      : ' + POPUP_FILES.map((f) => path.relative(ROOT, path.join(OUT_DIR, f))).join(', '));
  console.log('[build-extension] icons OK   : ' + ICON_SIZES.map((s) => `icon${s}.png`).join(', '));
  console.log('[build-extension] prelude    : EXT_MODE=true (wrapper scope) + GM_xmlhttpRequest/GM.xmlHttpRequest/GM_addStyle shims; Store uses chrome.storage natively');
}

main();
