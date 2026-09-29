// 一次性实证探针：构建产物里的 design token 到底有没有**生效**（不只是「存在」）。
// 背景：build-extension.js 把 v6.4-TOKENS 块的**裸声明**注入 HTML 的 <style> 顶层，
//       没有 :root{...} 包裹。本探针用真 Chrome 读 CSSOM 与 computed style 判定真假。
// 用法: node .trellis/tasks/09-28-ui-overhaul-darkreader-parity/research/probe-token-application.js
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '../../../..');
const CHROME = process.env.SVI_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9247 + (process.pid % 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

function connect(wsUrl) {
  return new Promise((res, rej) => {
    const sock = new WebSocket(wsUrl);
    let seq = 0; const pend = new Map();
    sock.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
    sock.onopen = () => res({
      send: (method, params = {}) => new Promise((r) => { const i = ++seq; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); }),
      close: () => sock.close(),
    });
    sock.onerror = () => rej(new Error('ws fail'));
  });
}

const PROBE = `(() => {
  const cs = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const sheets = [...document.styleSheets].map((s) => {
    let rules = [];
    try { rules = [...s.cssRules].map((r) => r.selectorText || (r.cssText || '').slice(0, 40)); } catch (e) { rules = ['<inaccessible>']; }
    return rules;
  });
  return {
    url: location.href.split('/').slice(-1)[0],
    tokenVar_raw: cs.getPropertyValue('--svi-bg'),
    tokenVar_bgDeep: cs.getPropertyValue('--svi-bg-deep'),
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    colorScheme: cs.getPropertyValue('color-scheme'),
    sheetSelectors: sheets,
  };
})()`;

(async () => {
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'svi-tokprobe-'));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--window-size=520,900',
  ], { stdio: 'ignore' });
  chrome.on('error', (e) => { console.error('chrome 启动失败: ' + e.message); process.exit(1); });

  const targets = [
    path.join(ROOT, 'extension', 'popup.html'),
    path.join(ROOT, 'extension', 'options.html'),
  ];

  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) { try { ver = await getJson('/json/version'); } catch (e) { await sleep(250); } }
  if (!ver) { console.error('CDP 未就绪'); chrome.kill(); process.exit(1); }
  const B = await connect(ver.webSocketDebuggerUrl);

  const out = [];
  for (const f of targets) {
    const created = await B.send('Target.createTarget', { url: 'file:///' + f.replace(/\\/g, '/') });
    const tid = created.result.targetId;
    let info = null;
    for (let i = 0; i < 40 && !info; i++) {
      const list = await getJson('/json/list');
      info = list.find((t) => t.id === tid && t.webSocketDebuggerUrl);
      if (!info) await sleep(200);
    }
    const C = await connect(info.webSocketDebuggerUrl);
    await C.send('Runtime.enable');
    await sleep(600);
    const r = await C.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    out.push(r.result.result.value);
    C.close();
    await B.send('Target.closeTarget', { targetId: tid });
  }

  console.log(JSON.stringify(out, null, 2));
  console.log('\n=== 判定 ===');
  for (const o of out) {
    const tok = (o.tokenVar_raw || '').trim();
    const inert = tok === '';
    console.log(`${o.url.padEnd(14)} --svi-bg=${tok === '' ? '(空 → 未生效)' : tok} | body背景=${o.bodyBg} | color-scheme=${o.colorScheme.trim() || '(空)'} | token块${inert ? '❌ 惰性' : '✅ 生效'}`);
  }

  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})();
