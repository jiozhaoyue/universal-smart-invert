// v6.4 设置页 (options) —— **第一轮只交付外壳与 token 机制**, 区块内容随「重建层」交付。
//
// 为什么先建壳: R1 要求 token 有**三处消费点**(内嵌面板 / popup / options 页)并逐字节一致,
// 没有第三个消费点时这条验收无法成立。壳里已经用 token 取色, 于是「三处同源」当场可测。
//
// 与扩展契约的关系: 本页只读 `svi-get-snapshot` 拿站点状态, 设置读写一律走 popup.js 已有的
// 同一条消息协议 (`svi-set-pref`), 绝不自建第二套 —— 语义分叉是这套代码最怕的事。
'use strict';

(function () {
  const ver = document.getElementById('ver');
  if (ver) ver.textContent = 'v' + (chrome.runtime.getManifest().version || '');

  const root = document.getElementById('svi-options-root');
  if (!root) return;

  // 第一轮: 只探测一次站点状态, 证明消息通道可用; 区块挂载留给重建层。
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'svi-get-snapshot' }, (res) => {
        if (chrome.runtime.lastError || !res) return; // 内容脚本未就绪: 静默 (不打扰用户)
        const line = document.createElement('p');
        line.textContent = '当前站点: ' + String(res.host || '') + ' · 脚本' + (res.active ? '已启用' : '未启用');
        root.appendChild(line);
      });
    });
  } catch (e) { /* ignore */ }
})();
