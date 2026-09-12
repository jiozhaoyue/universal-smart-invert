// 任务内一次性探针 (不入库): 验证 v3.3 设置面板在多视口 × 三形态下的布局健壮性
// —— 无横向滚动、无控件出界。用法: node ui-layout-probe.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8931;
const CDP_PORT = 8932;
const ROOT = path.resolve(__dirname, '../../..');
const scriptSource = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8');
const CHROME_CANDIDATES = process.env.SVI_CHROME_PATH
  ? [process.env.SVI_CHROME_PATH]
  : ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
const CHROME_PATH = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || CHROME_CANDIDATES[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCDP(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        const list = await res.json();
        const target = list.find((t) => t.type === 'page');
        if (target && target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      }
    } catch (e) { /* ignore */ }
    await sleep(200);
  }
  throw new Error('CDP failed to become ready');
}

async function main() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body><h1>probe</h1></body></html>');
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  try { fs.rmSync(path.join(__dirname, '.probe-profile'), { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + path.join(__dirname, '.probe-profile'),
    `http://127.0.0.1:${PORT}`,
  ]);
  chromeProc.on('error', (err) => { console.error('Failed to launch Chrome:', err); process.exit(1); });

  const wsUrl = await waitForCDP();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let msgId = 1;
  function sendCdp(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      const onMsg = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) {
          ws.removeEventListener('message', onMsg);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCdp('Page.enable');
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1200);
  // 模拟油猴 document-end 注入: 页面就绪后再执行脚本 (document-start 注入会因 head 未就绪丢样式)
  await sendCdp('Runtime.evaluate', { expression: scriptSource, returnByValue: true });
  await sleep(1500);

  const measure = async (label) => {
    const r = (await sendCdp('Runtime.evaluate', {
      expression: `(() => {
        window.__svi.ui.openSettingsModal();
        const win = document.querySelector('.svi-modal-window');
        const body = document.querySelector('.svi-modal-body');
        const vw = window.innerWidth;
        let overflowRight = 0;
        win.querySelectorAll('select, input, textarea, button').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.width > 0) overflowRight = Math.max(overflowRight, b.right - vw);
        });
        return {
          label: ${JSON.stringify(label)},
          layout: win.className.indexOf('layout-left') !== -1 ? 'left' : (win.className.indexOf('layout-right') !== -1 ? 'right' : 'center'),
          docked: document.querySelector('.svi-modal-mask').classList.contains('docked'),
          hScroll: body.scrollWidth > body.clientWidth + 1,
          pageHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          overflowPx: Math.round(overflowRight * 10) / 10,
          winWidth: Math.round(win.getBoundingClientRect().width),
          computedWidth: getComputedStyle(win).width,
          varVal: win.style.getPropertyValue('--svi-settings-w'),
          classes: win.className,
          ruleFound: (() => {
            try {
              const probes = ['.svi-capsule-root', '.svi-video-tune', '.svi-modal-mask', '.svi-modal-window', '.svi-er-form', '.svi-row-describe', 'layout-left'];
              const have = {};
              for (const p of probes) have[p] = false;
              for (const sheet of document.styleSheets) {
                let rules;
                try { rules = sheet.cssRules; } catch (e) { continue; }
                for (const r of rules) {
                  const sel = r.selectorText || (r.cssText || '');
                  for (const p of probes) { if (sel.indexOf(p) !== -1) have[p] = true; }
                }
              }
              return JSON.stringify(have);
            } catch (e) { return 'ERR:' + e.message; }
          })()
        };
      })()`,
      returnByValue: true,
    })).result.value;
    console.log(JSON.stringify(r));
    return r;
  };

  let allOk = true;
  let shotIdx = 0;
  for (const [w, h] of [[1280, 800], [500, 600]]) {
    await sendCdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    for (const layout of [['center', '居中'], ['left', '靠左'], ['right', '靠右']]) {
      await sendCdp('Runtime.evaluate', {
        expression: `(function () {
          const btn = Array.from(document.querySelectorAll('.svi-layout-btn')).find(function (b) { return b.textContent === '${layout[1]}'; });
          if (btn) btn.click();
          return !!btn;
        })()`,
        returnByValue: true,
      });
      await sleep(200);
      const m = await measure(`${w}x${h} ${layout[0]}`);
      if (m.hScroll || m.pageHScroll || m.overflowPx > 0) allOk = false;
      if (process.env.SVI_PROBE_SHOTS) {
        const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(__dirname, `shot-${shotIdx}-${w}x${h}-${layout[0]}.png`), Buffer.from(shot.data, 'base64'));
        shotIdx++;
      }
    }
  }

  ws.close();
  chromeProc.kill();
  server.close();
  console.log(allOk ? 'PROBE PASS: no horizontal scroll / overflow in any viewport-layout combo' : 'PROBE FAIL');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
