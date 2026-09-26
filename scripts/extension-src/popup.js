// popup.js — 扩展工具栏弹窗（v6.4 R3：三页签「反色 / 本站 / 更多」，对齐 Dark Reader 的信息架构）。
// Talks to the content script through the sv*-prefixed onMessage channel
// (see the boot section of universal-smart-invert.user.js). Every command
// reuses the settings panel's own handlers, so semantics cannot diverge.
'use strict';

const $ = (id) => document.getElementById(id);

let tabId = null;

function send(msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        void chrome.runtime.lastError; // no listener (browser pages) → resolve null
        resolve(res || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

// —— 页签切换（v6.4 R3）：纯本地 UI 状态，不牵动任何协议 ——
const TABS = ['filter', 'sites', 'more'];
function selectTab(name) {
  if (TABS.indexOf(name) === -1) return;
  for (const t of TABS) {
    const btn = $('tab-btn-' + t);
    const panel = $('panel-' + t);
    const on = t === name;
    if (btn) btn.setAttribute('aria-selected', on ? 'true' : 'false');
    if (panel) panel.hidden = !on;
  }
}
function initTabs() {
  for (const t of TABS) {
    const btn = $('tab-btn-' + t);
    if (btn) btn.addEventListener('click', () => selectTab(t));
  }
}

async function loadSnapshot() {
  const snap = await send({ type: 'svi-get-snapshot' });
  const unavailable = !snap || !snap.ok || snap.dormant;
  document.body.classList.toggle('available', !unavailable);
  document.body.classList.toggle('unavailable', !!unavailable);
  if (unavailable) return;

  // 反色页签
  $('ver').textContent = 'v' + (snap.version || '');
  $('power').checked = snap.siteActive !== false;
  $('policy').value = snap.imagePolicy || 'balanced';
  $('imgfx').value = snap.imgFxMode || 'full';
  $('imginv').checked = snap.imageOn !== false;
  $('hover').checked = snap.hoverRestore !== false;
  $('chip-soft-gray').classList.toggle('on', snap.presetId !== 'amoled');
  $('chip-amoled').classList.toggle('on', snap.presetId === 'amoled');

  // 本站页签
  $('host').textContent = snap.host || location.hostname || '';
  const c = snap.counts || {};
  $('counts').textContent =
    `已反色图片 ${c.inverted || 0} · 特效图 ${c.fx || 0} · 背景图 ${c.bginv || 0} · 视频 ${c.video || 0} / 共 ${c.img || 0} 图`;
  const modeLabel = { all: '全部启用', blacklist: '黑名单', whitelist: '白名单' }[snap.siteMode] || '全部启用';
  $('site-mode').textContent = modeLabel;
  $('site-counts').textContent = `黑名单 ${snap.blacklistCount || 0} · 白名单 ${snap.whitelistCount || 0}`;
  $('overridden').textContent = (snap.overriddenSites || 0) + ' 个站点';
  const preview = Array.isArray(snap.listPreview) ? snap.listPreview : [];
  $('list-preview').textContent = preview.length
    ? preview.join(' · ') + (snap.siteMode === 'whitelist' ? (snap.whitelistCount > preview.length ? ' …' : '') : (snap.blacklistCount > preview.length ? ' …' : ''))
    : '（名单为空，可在设置面板里维护）';
  document.querySelector('.power-row').classList.toggle('off', snap.siteActive === false);

  // 更多页签
  $('ver-more').textContent = 'v' + (snap.version || '');
}

$('power').addEventListener('change', async (e) => {
  const on = e.target.checked;
  await send({ type: 'svi-site-power', on });
  loadSnapshot();
});

$('policy').addEventListener('change', (e) => {
  send({ type: 'svi-set-pref', key: 'imagePolicy', value: e.target.value });
});

$('imgfx').addEventListener('change', (e) => {
  send({ type: 'svi-set-pref', key: 'imgFxMode', value: e.target.value });
});

$('imginv').addEventListener('change', (e) => {
  send({ type: 'svi-set-pref', key: 'imageInvert', value: e.target.checked });
});

$('hover').addEventListener('change', (e) => {
  send({ type: 'svi-set-pref', key: 'hoverRestore', value: e.target.checked });
});

for (const [chip, preset] of [['chip-soft-gray', 'soft-gray'], ['chip-amoled', 'amoled']]) {
  $(chip).addEventListener('click', async () => {
    await send({ type: 'svi-set-pref', key: 'presetId', value: preset });
    loadSnapshot();
  });
}

$('open-settings').addEventListener('click', async () => {
  await send({ type: 'svi-open-settings' });
  window.close();
});

// 扩展设置页：优先官方 API；极少数形态下不可用则退回开标签页
$('open-options').addEventListener('click', () => {
  try {
    if (chrome.runtime.openOptionsPage) { chrome.runtime.openOptionsPage(); window.close(); return; }
  } catch (e) { /* ignore */ }
  try { chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }); window.close(); } catch (e) { /* ignore */ }
});

$('reset-site').addEventListener('click', async () => {
  const btn = $('reset-site');
  const res = await send({ type: 'svi-site-reset' });
  const old = btn.textContent;
  btn.textContent = res && res.ok ? (res.cleared ? '已清除本站覆盖' : '本站没有覆盖') : '清除失败（本页不可用）';
  setTimeout(() => { btn.textContent = old; }, 1400);
  loadSnapshot();
});

(async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs && tabs[0] ? tabs[0].id : null;
  } catch (e) {
    tabId = null;
  }
  initTabs();
  loadSnapshot();
})();
