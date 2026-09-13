// ==UserScript==
// @name         全网通用智能反色 · 本地开发加载器（网关版）
// @name:en      SVI Local Dev Loader (Gateway)
// @namespace    https://github.com/jiozhaoyue/universal-smart-invert
// @version      2.0.0
// @description  开发辅助（勿分发）：按网关列表依次尝试加载最新的全网通用智能反色脚本（回环 / 局域网 / file:// 均可），编辑保存后刷新页面即生效。服务端用现成开源的 http-server：npx --yes http-server . -p 8124 -c-1 --cors。调试期间请停用正式安装的反色脚本副本（共存握手会让后启动方休眠）。
// @author       jiozhaoyue
// @license      AGPL-3.0-or-later
// @match        *://*/*
// @match        file:///*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @connect      192.168.1.100
// ==/UserScript==
(function () {
  'use strict';

  // ===== 网关列表（按顺序尝试，第一个连通的生效）=====
  // 1. 回环：http-server 启动后固定可用
  // 2. 局域网：改成你自己的内网 IP（http-server 启动时会把所有可用地址打印出来），
  //    并同步修改上方 @connect 声明（脚本管理器首次请求会弹窗询问，允许即可）
  // 3. file://（可选）：需要脚本管理器「允许访问文件网址」权限；取消注释并改成你的路径
  var GATEWAYS = [
    'http://127.0.0.1:8124',
    'http://192.168.1.100:8124',
    // 'file:///D:/Repo/Github-repo/Private/video-Invertcolors/universal-smart-invert.user.js',
  ];
  var PATH = '/universal-smart-invert.user.js';

  var gmx = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest
    : (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest : null;
  if (!gmx) {
    console.warn('[SVI-Dev] 当前脚本管理器未提供 GM_xmlhttpRequest，加载器无法工作');
    return;
  }

  function apply(src, gateway) {
    try {
      // 与正式安装一致：在脚本沙箱作用域内执行（window/document 与页面共享）
      (new Function(src))();
      console.info('[SVI-Dev] 已从 ' + gateway + ' 加载本地脚本 @ ' + new Date().toLocaleTimeString());
    } catch (e) {
      console.error('[SVI-Dev] 脚本执行失败:', e);
    }
  }

  function tryGateway(i) {
    if (i >= GATEWAYS.length) {
      console.warn('[SVI-Dev] 所有网关均不可达（服务启动了吗？防火墙/代理放行了吗？）:', GATEWAYS.join(', '));
      return;
    }
    var gateway = GATEWAYS[i];
    var url = gateway + PATH + '?t=' + Date.now(); // 时间戳防缓存
    gmx({
      method: 'GET',
      url: url,
      timeout: 2500,
      onload: function (r) {
        if (r.status === 200 && r.responseText && r.responseText.indexOf('// ==UserScript==') !== -1) {
          apply(r.responseText, gateway);
        } else {
          console.warn('[SVI-Dev] 网关 ' + gateway + ' 返回 ' + r.status + '，尝试下一个');
          tryGateway(i + 1);
        }
      },
      onerror: function () { tryGateway(i + 1); },
      ontimeout: function () { tryGateway(i + 1); },
    });
  }

  tryGateway(0);
})();
