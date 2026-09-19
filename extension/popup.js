// popup.js — Dark Reader-style toolbar popup for the svi extension (MV3).
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

async function loadSnapshot() {
  const snap = await send({ type: 'svi-get-snapshot' });
  const unavailable = !snap || !snap.ok || snap.dormant;
  document.body.classList.toggle('available', !unavailable);
  document.body.classList.toggle('unavailable', !!unavailable);
  if (unavailable) return;
  $('ver').textContent = 'v' + (snap.version || '');
  $('host').textContent = snap.host || location.hostname || '';
  $('power').checked = snap.siteActive !== false;
  $('policy').value = snap.imagePolicy || 'balanced';
  $('imgfx').value = snap.imgFxMode || 'full';
  $('imginv').checked = snap.imageOn !== false;
  $('hover').checked = snap.hoverRestore !== false;
  $('chip-soft-gray').classList.toggle('on', snap.presetId !== 'amoled');
  $('chip-amoled').classList.toggle('on', snap.presetId === 'amoled');
  const c = snap.counts || {};
  $('counts').textContent =
    `已反色图片 ${c.inverted || 0} · 特效图 ${c.fx || 0} · 背景图 ${c.bginv || 0} · 视频 ${c.video || 0} / 共 ${c.img || 0} 图`;
  document.querySelector('.power-row').classList.toggle('off', snap.siteActive === false);
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

(async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs && tabs[0] ? tabs[0].id : null;
  } catch (e) {
    tabId = null;
  }
  loadSnapshot();
})();
