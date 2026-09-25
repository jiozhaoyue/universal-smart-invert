'use strict';
/*
 * dev/probe-style-mount.js — 样式挂载取证探针（v6.6 R1 的证据工具）
 *
 * 用途：钩住 createElement / appendChild / insertBefore / replaceChild，抓出「样式节点被创建、
 * 文本已写入、但**从未挂载**」这一静默失效。它是 v6.6 缺陷定位的决定性证据工具，
 * 同一份脚本在修复前后跑出的差异即为「红 → 绿」：
 *
 *   修复前（HEAD）:
 *     { kind: "createElement(style)", head: "head=NULL", stack: "... injectStyles ..." }
 *     { kind: "style-text-set", len: 45523, head: " :root { --svi-img-fi…" }
 *     （此后无任何 style-attached —— 整张样式表被丢弃，页面无异常、无日志）
 *   修复后:
 *     同样的 createElement(head=NULL) + text-set，随后出现 style-attached（根一出现即补挂）
 *
 * 为什么用 document_start 注入：`Page.addScriptToEvaluateOnNewDocument` 会在 <html> 创建**之前**
 * 执行脚本，此时 document.head 与 document.documentElement 都是 null —— 正是缺陷的触发条件。
 * （bench 是把脚本内联进 HTML，head 必然存在，因此这条路从未被覆盖。）
 *
 * 用法:
 *   node dev/probe-style-mount.js
 *   node dev/probe-style-mount.js <任意页面 URL>
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const CHROME_PATH = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9230;
const TARGET = process.argv[2] || 'https://github.com/qixing-jk/all-api-hub';
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-probe8-');
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--window-size=1280,1400',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  'about:blank',
], { stdio: 'ignore' });
const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const HOOK = `
(() => {
  const log = [];
  window.__sviHookLog = log;
  const t0 = Date.now();
  const rec = (kind, target, node) => {
    try {
      const txt = node && node.textContent ? String(node.textContent) : '';
      if (txt.indexOf('--svi-img-filter') === -1 && txt.indexOf('data-svi-inverted') === -1 && txt.indexOf('svi-capsule') === -1) return;
      log.push({ t: Date.now() - t0, kind, target: target && target.tagName, node: node && node.tagName, len: txt.length,
                 head: txt.slice(0, 40).replace(/\\s+/g,' ') });
    } catch (e) {}
  };
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, opts) {
    const el = origCreate.call(this, tag, opts);
    if (String(tag).toLowerCase() === 'style') {
      const stack = (new Error().stack || '').split('\\n').slice(1, 4).map(s => s.trim().slice(0, 90));
      log.push({ t: Date.now() - t0, kind: 'createElement(style)', target: 'DOC', node: 'STYLE', len: 0,
                 head: 'head=' + (this.head ? 'yes' : 'NULL') + ' | ' + stack.join(' <- ') });
      // 观察其文本赋值与去向
      let _len = 0;
      try {
        Object.defineProperty(el, '__sviTag', { value: true });
      } catch (e) {}
      const obs = new MutationObserver(() => {
        const L = (el.textContent || '').length;
        if (L !== _len) { _len = L; log.push({ t: Date.now() - t0, kind: 'style-text-set', target: 'STYLE', node: 'STYLE', len: L, head: (el.textContent||'').slice(0,35).replace(/\\s+/g,' ') }); }
        if (el.parentNode) log.push({ t: Date.now() - t0, kind: 'style-attached', target: el.parentNode.tagName, node: 'STYLE', len: L, head: '' });
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
      const iv = setInterval(() => { if (el.parentNode || Date.now() - t0 > 12000) { if (el.parentNode) log.push({ t: Date.now() - t0, kind: 'style-parent(scan)', target: el.parentNode.tagName, node: 'STYLE', len: (el.textContent||'').length, head: '' }); clearInterval(iv); } }, 500);
    }
    return el;
  };
  const origAppend = Node.prototype.appendChild;
  Node.prototype.appendChild = function (n) { rec('appendChild', this, n); return origAppend.call(this, n); };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (n, ref) { rec('insertBefore', this, n); return origInsert.call(this, n, ref); };
  const origReplace = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function (n, old) { rec('replaceChild', this, n); return origReplace.call(this, n, old); };
  log.push({ t: 0, kind: 'hooks-installed', target: null, node: null, len: 0, head: '' });
})();
`;

(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) { try { targets = await get('/json/list'); if (targets && targets.length) break; } catch (e) { } await sleep(300); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception || {}).description }; return r.result?.result?.value; };
  await sleep(500);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const src = fs.readFileSync(path.join(__dirname, '..', 'universal-smart-invert.user.js'), 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
  await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await send('Page.navigate', { url: TARGET });
  await sleep(14000);
  console.log('HOOK LOG (SVI 相关挂载):');
  const log = await ev(`window.__sviHookLog || []`);
  for (const e of (log || [])) console.log(JSON.stringify(e));
  console.log('FINAL:', JSON.stringify(await ev(`(() => ({ head: document.head ? document.head.childElementCount : -1,
     styleInHead: document.head ? [...document.head.querySelectorAll('style')].map(s=>(s.textContent||'').length) : null,
     styleInHtml: [...document.documentElement.querySelectorAll(':scope > style')].map(s=>(s.textContent||'').length),
     rootVar: document.documentElement.style.getPropertyValue('--svi-img-filter'),
     htmlClass: document.documentElement.className }))()`)));
  ws.close(); chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { }
  process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
