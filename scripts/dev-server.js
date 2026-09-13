// 脚本猫本地实时调试服务器 (零依赖): 托管开发加载器与最新脚本源码。
// 用法: node scripts/dev-server.js  →  浏览器打开 http://127.0.0.1:8124/ 按提示安装加载器。
// 实时性: 加载器在每次页面加载时从本服务器拉取最新 universal-smart-invert.user.js,
//         因此编辑保存后无需重新安装/检查更新, 刷新页面即生效。
// 注意: 仅监听 127.0.0.1 (不对外网开放); 与正式安装的副本共存时, 共存握手会让后启动方
//       休眠 —— 调试期间请在脚本猫中停用正式安装的「全网通用智能视频与图片反色」。
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.SVI_DEV_PORT) || 8124;
const SCRIPT_PATH = path.resolve(__dirname, '..', 'universal-smart-invert.user.js');

// 开发加载器: 每页拉取最新源码并在脚本沙箱内执行 (GM 通道绕过页面 CSP;
// 不走 <script src> 注入, 否则 GitHub 等严格 CSP 站点会拦截外链脚本)
const LOADER_TEMPLATE = `// ==UserScript==
// @name         全网通用智能反色 · 本地开发加载器
// @name:en      SVI Local Dev Loader
// @namespace    https://github.com/jiozhaoyue/universal-smart-invert
// @version      1.0.0
// @description  开发辅助（勿分发）：从本地开发服务器实时加载全网通用智能反色脚本，编辑保存后刷新页面即生效。使用前请运行 node scripts/dev-server.js，并停用正式安装的反色脚本副本（共存握手会让后启动方休眠）。
// @author       jiozhaoyue
// @license      MIT
// @match        *://*/*
// @match        file:///*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==
(function () {
  'use strict';
  var PORT = __PORT__;
  var gmx = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest
    : (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest : null;
  if (!gmx) {
    console.warn('[SVI-Dev] 当前脚本管理器未提供 GM_xmlhttpRequest, 加载器无法工作');
    return;
  }
  gmx({
    method: 'GET',
    url: 'http://127.0.0.1:' + PORT + '/universal-smart-invert.user.js?t=' + Date.now(),
    timeout: 5000,
    onload: function (r) {
      if (r.status !== 200) {
        console.warn('[SVI-Dev] 本地服务器返回 ' + r.status + ' —— 请确认已运行 node scripts/dev-server.js');
        return;
      }
      try {
        // 与正式安装一致: 在脚本沙箱作用域内执行 (window/document 与页面共享)
        (new Function(r.responseText))();
        console.info('[SVI-Dev] 已加载本地脚本 @ ' + new Date().toLocaleTimeString());
      } catch (e) {
        console.error('[SVI-Dev] 脚本执行失败:', e);
      }
    },
    onerror: function () {
      console.warn('[SVI-Dev] 无法连接 http://127.0.0.1:' + PORT + ' —— 请运行 node scripts/dev-server.js');
    },
  });
})();
`;

const INSTALL_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>SVI 本地开发调试</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #1e293b; line-height: 1.7; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  .btn { display: inline-block; background: #2563eb; color: #fff; padding: 8px 18px; border-radius: 8px; text-decoration: none; margin: 4px 0; }
  .warn { background: #fef3c7; border: 1px solid #f59e0b55; border-radius: 8px; padding: 10px 14px; }
</style></head>
<body>
<h1>🛠️ 全网通用智能反色 · 本地实时调试</h1>
<ol>
  <li>点下方按钮安装「开发加载器」（只需安装一次）：</li>
</ol>
<p><a class="btn" href="/svi-dev-loader.user.js">安装开发加载器</a></p>
<ol start="2">
  <li>在脚本猫中<strong>停用</strong>正式安装的「全网通用智能视频与图片反色」（避免共存握手让加载器休眠）。</li>
  <li>编辑仓库里的 <code>universal-smart-invert.user.js</code> 并保存，然后<strong>刷新任意网页</strong>即运行最新代码；控制台会出现 <code>[SVI-Dev] 已加载本地脚本</code> 标识。</li>
</ol>
<p class="warn">⚠️ 仅本机 127.0.0.1 可访问；调试完成后可停用/卸载加载器。</p>
</body></html>`;

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    send(res, 200, INSTALL_PAGE, 'text/html; charset=utf-8');
  } else if (url === '/svi-dev-loader.user.js') {
    send(res, 200, LOADER_TEMPLATE.replace('__PORT__', String(PORT)), 'text/javascript; charset=utf-8');
  } else if (url === '/universal-smart-invert.user.js') {
    fs.readFile(SCRIPT_PATH, (err, buf) => {
      if (err) send(res, 500, '读取 universal-smart-invert.user.js 失败: ' + err.message);
      else send(res, 200, buf, 'text/javascript; charset=utf-8');
    });
  } else {
    send(res, 404, 'Not Found');
  }
});

// 文件变更提示 (服务器每次请求都读最新文件, watch 仅用于控制台可见性)
let watchTimer = null;
try {
  fs.watch(SCRIPT_PATH, () => {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      console.log('[dev-server] 检测到脚本变更 —— 刷新页面即生效 (' + new Date().toLocaleTimeString() + ')');
    }, 120);
  });
} catch (e) { /* 平台不支持 watch 时静默降级 */ }

server.listen(PORT, '127.0.0.1', () => {
  console.log('[dev-server] 脚本猫本地实时调试已启动');
  console.log('  安装页:   http://127.0.0.1:' + PORT + '/          (浏览器打开, 按提示安装加载器)');
  console.log('  脚本源:   http://127.0.0.1:' + PORT + '/universal-smart-invert.user.js');
  console.log('  停止:     Ctrl+C');
});
