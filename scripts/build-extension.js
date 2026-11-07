'use strict';
/*
 * scripts/build-extension.js — derive the MV3 extension from the userscript (zero dependencies).
 *
 * Reads universal-smart-invert.user.js and emits:
 *   - extension/content.js    = prelude (EXT_MODE + GM shims) + core body (metadata stripped)
 *   - extension/manifest.json = MV3 manifest with name/version/description synced from the header
 *   - extension/popup.*, options.*    = copied from scripts/extension-src/, with the design token
 *                                       block injected into every HTML (v6.4)
 *   - extension/ui-controls.js        = SviControls library block (v6.4 R1a)
 *   - extension/settings-schema.js    = settings schema + DEFAULT_PREFS + light colour cards
 *                                       + PRESET_PARAMS (v6.4 R1a/R1b; params v0.6.15 D7)
 *   - extension/options.html 额外注入整份面板 CSS（去掉 token 块，v6.4 R1b）——
 *     它整页都由 SviControls 搭出来，控件样式只能有一个实现点。
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
const MAX_NAME_FIREFOX = 45; // Firefox limit for manifest.name (stricter than Chrome)

function fail(msg) {
  console.error('[build-extension] ERROR: ' + msg);
  process.exit(1);
}

// —— metadata parsing ——

function parseMetadata(source) {
  const m = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!m) fail('userscript metadata block (==UserScript==) not found');
  const out = {};
  // Key may contain ':' (e.g. @name:ext, @name:zh-CN) — the whole token before
  // the first whitespace is the key, so localized / variant keys stay distinct.
  const re = /^\/\/\s*@([^\s]+)\s+(.*)$/gm;
  let match;
  while ((match = re.exec(m[1])) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (out[key] === undefined) out[key] = value; // first occurrence wins
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

  // 09-29 (R3.3): 取字节请求优先走**后台脚本的跨域通道**（内容脚本自己 fetch 受 CORS 限制）,
  // 通道不可用/失败/超时才回落 plain fetch。契约形状保持不变（blob / onload / onerror /
  // ontimeout）—— 核心的 gmFetchBlob 只认这个形状, 故核心零改动。
  function __sviGmXhrViaSw(opts, onFail) {
    var settled = false;
    var timer = null;
    var once = function (fn) {
      return function () { if (settled) return; settled = true; if (timer) clearTimeout(timer); fn.apply(null, arguments); };
    };
    var fail = once(onFail);
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') { fail(); return; }
      if (opts.timeout > 0) timer = setTimeout(fail, opts.timeout);
      chrome.runtime.sendMessage({ type: 'svi-fetch-bytes', url: opts.url }, function (res) {
        // lastError 必须在回调内读取, 否则控制台会报 unchecked runtime.lastError
        var lastErr = (typeof chrome.runtime.lastError !== 'undefined') ? chrome.runtime.lastError : null;
        if (lastErr || !res || !res.ok || typeof res.b64 !== 'string') { fail(); return; }
        var done = once(function () {
          try {
            // 解 base64 → Uint8Array → Blob (见 sw.js 顶部注释: 为什么不能直接传字节)
            var bin = atob(res.b64);
            var u8 = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            var blob = new Blob([u8], { type: res.type || 'application/octet-stream' });
            if (typeof opts.onload === 'function') opts.onload({ status: 200, response: blob, responseHeaders: '' });
          } catch (e) { if (typeof opts.onerror === 'function') opts.onerror(e); }
        });
        done();
      });
    } catch (e) { fail(); }
  }

  // GM_xmlhttpRequest shim over fetch. Matches the core's gmFetchBlob usage:
  // responseType 'blob' → res.response is a Blob; 2xx + truthy response →
  // onload; abort on opts.timeout (ms) → ontimeout; network failure → onerror.
  // Note: an MV3 content script cannot bypass page CORS with fetch; the
  // core's decode chain already degrades gracefully when a fetch fails.
  function __sviGmXhrViaFetch(opts) {
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

  function __sviGmXhr(opts) {
    opts = opts || {};
    // 只有"取字节"(responseType blob) 才值得多一层转发; 文本拉取走页面 fetch 更直接
    if (opts.responseType !== 'blob' || opts.method === 'POST') { __sviGmXhrViaFetch(opts); return; }
    var fellBack = false;
    __sviGmXhrViaSw(opts, function () {
      if (fellBack) return;
      fellBack = true;
      __sviGmXhrViaFetch(opts);
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

  // 扩展显示名:优先取 header 中的 @name:ext(显式短名,便于同时满足两个引擎);
  // 回退时按 **Firefox** 上限裁剪 —— 单份 manifest 同时服务 Chromium 与 Firefox,
  // 故取两者中更严的上限 (Chrome 75 / Firefox 45)。
  const extName = meta['name:ext'] || clip(meta.name, MAX_NAME_FIREFOX);
  if (extName.length > MAX_NAME_FIREFOX) {
    fail('扩展显示名超过 Firefox 上限 ' + MAX_NAME_FIREFOX + ' 字符 (当前 ' + extName.length
      + '): "' + extName + '" —— 请修短 header 里的 @name:ext');
  }
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
    // v6.4: 独立设置页 (与内嵌面板 / popup 同源 token 与控件库)
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
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

  // v6-5 R2: 扩展身份固定 —— manifest.key = scripts/extension-key.json 的公钥真源。
  //   key 决定扩展 ID, 装上之后在任何机器上都可复现 (任何机器重新构建产物 → 同一个 ID)。
  //   **私钥不入库** (crx-private-key.pem, 已 gitignore, 只在本机并离线备份); 公钥是公开数据,
  //   入库才能让别的机器/CI 产出同一个 ID。
  //   自洽性在此刻校验: 若本机有私钥, 它推导出的公钥必须与 key 文件一致 ——
  //   否则签出来的 CRX 其 ID 会与清单声明不符, 浏览器拒绝安装, 而打包那一步是静默的。
  let extId = null;
  let geckoId = null;
  const keyJsonPath = path.join(__dirname, 'extension-key.json');
  if (fs.existsSync(keyJsonPath)) {
    let keyInfo;
    try {
      keyInfo = JSON.parse(fs.readFileSync(keyJsonPath, 'utf8'));
    } catch (e) {
      fail('scripts/extension-key.json 不是合法 JSON: ' + e.message);
    }
    if (!keyInfo || !keyInfo.key) fail('scripts/extension-key.json 缺少 key 字段');
    const { extensionIdFromKeyB64, publicKeyB64FromPrivatePem } = require('./build-crx.js');
    extId = extensionIdFromKeyB64(keyInfo.key);
    if (keyInfo.extensionId && keyInfo.extensionId !== extId) {
      fail('scripts/extension-key.json 自身不自洽: extensionId=' + keyInfo.extensionId
        + ' 但 key 推导出 ' + extId + ' (手改过?)');
    }
    const pemPath = path.join(ROOT, 'crx-private-key.pem');
    if (fs.existsSync(pemPath)) {
      const pemPub = publicKeyB64FromPrivatePem(fs.readFileSync(pemPath, 'utf8'));
      if (pemPub !== keyInfo.key) {
        fail('本机签名私钥与 key 文件里的公钥不匹配 (私钥侧 ID ' + extensionIdFromKeyB64(pemPub)
          + ' ≠ 清单侧 ID ' + extId + ') —— 换过密钥就必须重新生成 key 文件, 见 build-crx.js 的 _rotate 说明');
      }
    }
    manifest.key = keyInfo.key;
    geckoId = keyInfo.geckoId || null;
  }
  if (!geckoId) {
    fail('scripts/extension-key.json 缺少 geckoId —— Firefox MV3 签名必需'
      + ' (见 .trellis/tasks/09-28-firefox-support/prd.md)');
  }

  // Firefox 身份与合规字段。Chrome 完全忽略 browser_specific_settings,故单份
  // manifest 同时服务两个引擎。
  //   gecko.id                    MV3 签名必需;缺失时 Firefox 会分配随机临时 id,
  //                               并连带让 chrome.storage.sync 在 Firefox 下不稳定。
  //   data_collection_permissions 2025-11-03 起 AMO 新提交强制要求;
  //                               本扩展无任何自动网络遥测,故 required 为 none。
  //   strict_min_version          该字段可用的最低 Firefox 线 (140 / Android 142),见块内说明。
  manifest.browser_specific_settings = {
    gecko: {
      id: geckoId,
      data_collection_permissions: { required: ['none'] },
      // data_collection_permissions 由 Firefox 140 引入 —— 低版本无从表达该字段,
      // 故 strict_min_version 必须 >= 140 (lint 的 KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION)。
      strict_min_version: '140.0',
    },
    // 显式声明 Android 门槛:该字段在 Firefox for Android 需 142,
    // 不声明则回退到 gecko 的 140 并持续告警。
    gecko_android: { strict_min_version: '142.0' },
  };
  // 09-29 (task 09-29-viewer-plugin-adapt R3.3): 跨域取字节通道 —— 后台脚本 + 全站 host 权限。
  //   MV3 下**内容脚本的 fetch 受 CORS 限制**, 只有后台脚本能凭 host_permissions 跨域取图;
  //   否则「跨域且源站不发 CORS」的原图永远拿不到字节 → 永不反色 (实测见该任务 research/)。
  //   `background` **两键并存**: Chromium 用 service_worker, Firefox MV3 用 scripts
  //   (Firefox 不支持 MV3 的 service_worker), 各引擎忽略不认识的那个键 ——
  //   这是本仓「绝不分叉产物目录」约束下的唯一写法。可用性由 web-ext lint + 双引擎实载把关。
  manifest.host_permissions = ['<all_urls>'];
  manifest.background = { service_worker: 'sw.js', scripts: ['sw.js'] };
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // v4.5: popup / options sources live in scripts/extension-src/ and are copied —
  // the extension/ directory stays fully generated (no hand-edited artifacts).
  //
  // v6.4: HTML 产物在**构建时注入设计 token** —— token 的唯一真源是用户脚本里
  //   `v6.4-TOKENS-START/END` 之间的那一块; 这里把它抽出来, 替换掉 HTML 里的
  //   `/* SVI_TOKEN_INJECT */` 占位。三处(用户脚本 / popup / options)的逐字节一致性
  //   由 test.js 断言把关 —— 这是「单文件真源」约束下唯一可行的同源机制。
  let tokenLines = 0;
  const tokenBlock = (() => {
    const m = /\/\* v6\.4-TOKENS-START \*\/([\s\S]*?)\/\* v6\.4-TOKENS-END \*\//.exec(source);
    if (!m) fail('design tokens not found in userscript (expected v6.4-TOKENS-START/END block)');
    tokenLines = m[1].trim().split(String.fromCharCode(10)).length;
    return m[1];
  })();
  // v6.4 R1b: 设置页（options）还要**整份面板 CSS** —— 它渲染的是同一套 `SviControls`
  //   控件（`.svi-modal-*` / `.svi-chip` / `.svi-msg` 等），控件样式只能有一个实现点。
  //   页面内面板的 CSS 就是那个点，故同样在构建期抽块注入 options.html 的
  //   `/* SVI_PANEL_CSS_INJECT */` 占位，而不是在扩展页里手写第二套控件样式。
  //   注入的是**去掉 token 块**的版本：token 已由上面的占位单独注入，避免同页定义两次。
  //   （test.js 的零字面量断言会把 options.html 里 token 块之外的 #hex / rgba() 全部揪出来，
  //   抽块后的面板 CSS 必须保持零字面量 —— 面板 CSS 本身已经全部走 var(--svi-*)。）
  const panelCss = (() => {
    const m = /const css = `([\s\S]*?)`;/.exec(source);
    if (!m) fail('panel CSS template (const css = `...`) not found in userscript');
    const stripped = m[1].replace(/\/\* v6\.4-TOKENS-START \*\/[\s\S]*?\/\* v6\.4-TOKENS-END \*\//,
      '/* 设计 token 由上方 SVI_TOKEN_INJECT 占位注入，此处不再重复定义 */');
    if (stripped === m[1]) fail('panel CSS 里没找到 v6.4-TOKENS 块 —— 抽块前请先确认锚点还在');
    return stripped;
  })();

  // v6.4 R1: 控件库与设置项 schema 同样是「真源在用户脚本、构建时抽出」——
  //   `v6.4-CONTROLS-START/END`（SviControls 控件库，块内零外部依赖，抽到扩展页即可直接用）
  //   与 `v6.4-SETTINGS-SCHEMA-START/END`（设置项单一真源，供 options 页渲染）。
  //   两者**缺标记即构建失败**，防止有人手写第二份控件库 / 第二份设置清单把同源机制绕过去。
  //   v0.6.15 (D2): 这两块要**先于** HTML 产物处理抽出 —— popup.html 的下拉选项集
  //   也改为构建期从 schema 注入（此前手写第二份选项集漂移成 4/8）。
  const extractBlock = (what, startMark, endMark) => {
    const re = new RegExp('/\\* ' + startMark + ' \\*/([\\s\\S]*?)/\\* ' + endMark + ' \\*/');
    const m = re.exec(source);
    if (!m) fail(what + ' block not found in userscript (expected ' + startMark + '/' + endMark + ')');
    return m[1].trim();
  };
  const controlsBlock = extractBlock('SviControls', 'v6\\.4-CONTROLS-START', 'v6\\.4-CONTROLS-END');
  const schemaBlock = extractBlock('settings schema', 'v6\\.4-SETTINGS-SCHEMA-START', 'v6\\.4-SETTINGS-SCHEMA-END');

  // 默认值表：DEFAULT_PREFS 是纯字面量（构建期已核对块内无外部标识符），故可直接求值。
  const dpMatch = /const DEFAULT_PREFS = (\{[\s\S]*?\n  \});/.exec(source);
  if (!dpMatch) fail('DEFAULT_PREFS not found in userscript');
  let defaults = null;
  try {
    defaults = new Function('return (' + dpMatch[1] + ')')();
  } catch (e) {
    fail('DEFAULT_PREFS 求值失败（它应保持纯字面量，不许引用外部标识符）: ' + e.message);
  }

  // 浅色色卡清单（`chipsOf` 控件的候选项）：同样是**构建期抽出**而非在扩展页里另写一份。
  //   options 页只拿得到色卡的 id/名称/颜色，判定用的 rgb 三元组留在脚本侧（页面不需要）。
  const cpMatch = /const IMG_COLOR_PRESETS = (\[[\s\S]*?\n  \]);/.exec(source);
  if (!cpMatch) fail('IMG_COLOR_PRESETS not found in userscript');
  let colorPresets = null;
  try {
    colorPresets = new Function('return (' + cpMatch[1] + ')')();
  } catch (e) {
    fail('IMG_COLOR_PRESETS 求值失败（它应保持纯字面量）: ' + e.message);
  }
  if (!colorPresets.length || colorPresets.some((c) => !c || !c.id || !c.color)) {
    fail('IMG_COLOR_PRESETS 形状不符（每项需要 id / name / color）');
  }

  // v0.6.15 (D7): 预设参数表 —— options 页选回预设时要把四个画面微调键重置成预设值
  //   （与脚本侧 onUserSelectPreset 同语义）。PRESETS 同为纯字面量，构建期求值抽出。
  const ppMatch = /const PRESETS = (\{[\s\S]*?\n  \});/.exec(source);
  if (!ppMatch) fail('PRESETS not found in userscript');
  let presetsTable = null;
  try {
    presetsTable = new Function('return (' + ppMatch[1] + ')')();
  } catch (e) {
    fail('PRESETS 求值失败（它应保持纯字面量）: ' + e.message);
  }
  const presetParams = {};
  for (const p of Object.values(presetsTable)) {
    const missing = ['brightness', 'contrast', 'saturate', 'hueRotate'].filter((k) => typeof p[k] !== 'number');
    if (missing.length) fail('PRESETS.' + p.id + ' 缺参数 ' + missing.join('/') + ' —— options 页选回预设要重置它们');
    presetParams[p.id] = { brightness: p.brightness, contrast: p.contrast, saturate: p.saturate, hueRotate: p.hueRotate };
  }

  // v0.6.15 (D2): schema select 项的选项集 → popup.html 占位注入。
  const schemaList = (() => {
    try { return new Function(schemaBlock + '\nreturn SVI_SETTINGS_SCHEMA;')(); } catch (e) { return null; }
  })();
  if (!Array.isArray(schemaList) || !schemaList.length) fail('SVI_SETTINGS_SCHEMA 求值失败（schema 块应为纯声明）');
  const schemaItemByKey = new Map();
  for (const g of schemaList) for (const it of g.items) schemaItemByKey.set(it.key, it);

  const HTML_FILES = ['popup.html', 'popup.js', 'options.html', 'options.js'];
  const popupSrcDir = path.join(__dirname, 'extension-src');
  let injectedImgFxOptions = 0;
  for (const f of HTML_FILES) {
    const from = path.join(popupSrcDir, f);
    if (!fs.existsSync(from)) fail('popup/options source missing: ' + path.relative(ROOT, from));
    let out = fs.readFileSync(from, 'utf8');
    if (f.endsWith('.html')) {
      if (out.indexOf('/* SVI_TOKEN_INJECT */') < 0) {
        fail(f + ' is missing the /* SVI_TOKEN_INJECT */ placeholder — tokens must be injected, never hand-written');
      }
      out = out.replace('/* SVI_TOKEN_INJECT */', tokenBlock.trim());
      // v0.6.15 (D2): popup 下拉选项集从 schema 注入 —— 占位必须存在（手写选项集 = 第二份真源）
      if (f === 'popup.html' && out.indexOf('<!-- SVI_SCHEMA_OPTIONS:imgFxMode -->') < 0) {
        fail('popup.html is missing the <!-- SVI_SCHEMA_OPTIONS:imgFxMode --> placeholder — 下拉选项集必须由 schema 注入, 不得手写第二份');
      }
      out = out.replace(/<!-- SVI_SCHEMA_OPTIONS:([A-Za-z0-9_.]+) -->/g, (whole, key) => {
        const item = schemaItemByKey.get(key);
        if (!item || item.kind !== 'select' || !Array.isArray(item.options)) {
          fail('SVI_SCHEMA_OPTIONS:' + key + ' —— schema 里没有这个 select 项（popup.html 占位键拼错?）');
        }
        if (key === 'imgFxMode') injectedImgFxOptions++;
        return item.options.map((o) => '<option value="' + o[0] + '">' + o[1] + '</option>').join('\n        ');
      });
      if (f === 'popup.html' && injectedImgFxOptions !== 1) {
        fail('popup.html 的 imgFxMode 占位注入了 ' + injectedImgFxOptions + ' 次（应为 1）—— 占位写重了?');
      }
    }
    if (f === 'popup.js') {
      // v0.6.15 (D5): popup 的默认值回退改引构建期注入的 SVI_DEFAULTS —— 消灭第三份字面量
      if (out.indexOf('/* SVI_DEFAULTS_INJECT */') < 0) {
        fail('popup.js is missing the /* SVI_DEFAULTS_INJECT */ placeholder — 默认值必须构建期注入, 不得手写第二份');
      }
      out = out.replace('/* SVI_DEFAULTS_INJECT */', 'const SVI_DEFAULTS = ' + JSON.stringify(defaults, null, 2) + ';');
    }
    // 面板 CSS 占位只在需要的页面出现: options 必须有（它整页都由控件库搭出来）；
    // popup 是 320px 宽的紧凑自绘页，不消费它，故不强制。
    if (out.indexOf('/* SVI_PANEL_CSS_INJECT */') >= 0) {
      out = out.replace('/* SVI_PANEL_CSS_INJECT */', panelCss);
    } else if (f === 'options.html') {
      fail('options.html is missing the /* SVI_PANEL_CSS_INJECT */ placeholder — 控件样式必须注入, 不得手写第二套');
    }
    fs.writeFileSync(path.join(OUT_DIR, f), out, 'utf8');
  }

  // 09-29 (R3.3): 后台脚本产物 —— 与 popup/options 同源 (真源在 scripts/extension-src/,
  //   extension/ 目录整体由构建产出, 不手改)。缺源即构建失败。
  const swFrom = path.join(popupSrcDir, 'sw.js');
  if (!fs.existsSync(swFrom)) fail('sw.js source missing: ' + path.relative(ROOT, swFrom));
  fs.writeFileSync(path.join(OUT_DIR, 'sw.js'), fs.readFileSync(swFrom, 'utf8'), 'utf8');

  const schemaOut = 'settings-schema.js';
  const controlsOut = 'ui-controls.js';
  fs.writeFileSync(path.join(OUT_DIR, controlsOut),
    '// 构建产物：由 scripts/build-extension.js 从用户脚本的 v6.4-CONTROLS 块抽出，勿手改。\n'
    + '// 供扩展设置页（options）复用同一套控件库 —— 单文件真源约束下的同源机制。\n'
    + '(function () {\n  \'use strict\';\n' + controlsBlock + '\n  window.SviControls = SviControls;\n})();\n', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, schemaOut),
    '// 构建产物：由 scripts/build-extension.js 从用户脚本的 v6.4-SETTINGS-SCHEMA 块抽出，勿手改。\n'
    + '\'use strict\';\n' + schemaBlock
    + '\nconst SVI_DEFAULTS = ' + JSON.stringify(defaults, null, 2) + ';\n'
    // chipsOf 的候选项（浅色色卡）：id / 名称 / 色值，末尾不带 rgb 判定数据
    + 'const SVI_IMG_COLOR_PRESETS = '
    + JSON.stringify(colorPresets.map((c) => ({ id: c.id, name: c.name, color: c.color })), null, 2) + ';\n'
    // v0.6.15 (D7): 预设参数表 —— options 页选回预设时重置画面微调四键（onUserSelectPreset 同语义）
    + 'const SVI_PRESET_PARAMS = ' + JSON.stringify(presetParams, null, 2) + ';\n'
    + 'window.SVI_SETTINGS_SCHEMA = SVI_SETTINGS_SCHEMA;\n'
    + 'window.SVI_DEFAULTS = SVI_DEFAULTS;\n'
    + 'window.SVI_IMG_COLOR_PRESETS = SVI_IMG_COLOR_PRESETS;\n'
    + 'window.SVI_PRESET_PARAMS = SVI_PRESET_PARAMS;\n', 'utf8');

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
  console.log('[build-extension] ext id     : ' + (extId || '(无 scripts/extension-key.json —— 扩展 ID 将由浏览器随机分配)')
    + (extId ? ' (由公钥真源推导, 任何机器上可复现)' : ''));
  console.log('[build-extension] name       : ' + manifest.name);
  console.log('[build-extension] description: ' + manifest.description + (manifest.description.length < meta.description.length ? ' ... [clipped to ' + MAX_DESCRIPTION + ' chars]' : ''));
  console.log('[build-extension] wrote      : ' + path.relative(ROOT, CONTENT_OUT) + ' (' + content.length + ' bytes, ' + content.split('\n').length + ' lines)');
  console.log('[build-extension] wrote      : ' + path.relative(ROOT, MANIFEST_OUT));
  console.log('[build-extension] wrote      : ' + HTML_FILES.map((f) => path.relative(ROOT, path.join(OUT_DIR, f))).join(', '));
  console.log('[build-extension] tokens     : 已注入 popup/options (' + tokenLines + ' 行, 真源 = userscript 的 v6.4-TOKENS 块)');
  console.log('[build-extension] panel CSS  : 已注入 options.html ('
    + panelCss.trim().split(String.fromCharCode(10)).length + ' 行面板 CSS, 去掉 token 块) —— 控件样式单一实现点');
  console.log('[build-extension] blocks     : 已抽出 ' + controlsOut + ' (' + controlsBlock.split('\n').length
    + ' 行控件库) + ' + schemaOut + ' (' + schemaBlock.split('\n').length
    + ' 行 schema, ' + (defaults ? Object.keys(defaults).length : 0) + ' 个默认值'
    + ', ' + colorPresets.length + ' 张浅色色卡)');
  console.log('[build-extension] icons OK   : ' + ICON_SIZES.map((s) => `icon${s}.png`).join(', '));
  console.log('[build-extension] prelude    : EXT_MODE=true (wrapper scope) + GM_xmlhttpRequest/GM.xmlHttpRequest/GM_addStyle shims; Store uses chrome.storage natively');
}

main();
