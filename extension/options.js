// options.js — 扩展设置页（v6.4 R1b：按 SVI_SETTINGS_SCHEMA 渲染**全部**设置项）。
//
// 三份东西全部来自构建期抽块，本文件自己**不写**设置清单、不写控件、不写控件样式：
//   settings-schema.js — 设置项单一真源（分组 / 键路径 / 控件种类 / 标签 / 范围）+ 默认值 + 浅色色卡
//   ui-controls.js     — SviControls 控件库（页面内面板用的同一套工厂）
//   options.html 里注入的面板 CSS — 控件样式（唯一的样式实现点）
//
// 存储口径（与内容脚本的 Store **同一份协议**，见 universal-smart-invert.user.js §2）：
//   · 逻辑键 `prefs` → 物理键 `svi:prefs`
//   · chrome.storage.sync 下超 CHUNK_SIZE 的值走分片：`svi:prefs.meta` = {chunks,bytes} + `svi:prefs#i`
//   · 后端链 sync → local（内容脚本在 sync 配额受限时会整体降级到 local，故读取两处都要试）
//
// 跨界面同步口径（如实说明，勿夸大）：内容脚本**没有** storage.onChanged 订阅，
//   `Store.onRemoteLoaded` 只在它自己启动装载远端命名空间时触发一次。因此本页写入后，
//   已经打开的页面**不会**即时跟随；页面刷新 / 新开标签页装载 `svi:prefs` 时才会读到新值。
'use strict';

(function () {
  const C = window.SviControls;
  const SCHEMA = window.SVI_SETTINGS_SCHEMA || [];
  const DEFAULTS = window.SVI_DEFAULTS || {};
  const CARDS = window.SVI_IMG_COLOR_PRESETS || [];

  const PREFIX = 'svi:';      // 与内容脚本 SVI_PREFIX 同值
  const LOGICAL = 'prefs';
  const CHUNK_SIZE = 7000;    // 与内容脚本 Store.CHUNK_SIZE 同值（test.js 有断言：两处必须相等）
  const DEBOUNCE_MS = 300;    // 与内容脚本 savePrefs 的防抖时长同值

  const root = document.getElementById('svi-options-root');
  const statusEl = document.getElementById('status');
  const verEl = document.getElementById('ver');

  // ============================================================
  // 1. 存储桥（Store 协议的最小复刻：只碰 prefs 一个逻辑键）
  // ============================================================
  function areaList() {
    const out = [];
    try { if (chrome && chrome.storage && chrome.storage.sync) out.push({ name: 'sync', area: chrome.storage.sync, chunk: true }); } catch (e) { /* ignore */ }
    try { if (chrome && chrome.storage && chrome.storage.local) out.push({ name: 'local', area: chrome.storage.local, chunk: false }); } catch (e) { /* ignore */ }
    return out;
  }

  const lastErr = () => { try { return (chrome && chrome.runtime && chrome.runtime.lastError) || null; } catch (e) { return null; } };

  const getOne = (area, k) => new Promise((resolve) => {
    try {
      area.get(PREFIX + k, (res) => {
        if (lastErr()) { resolve(null); return; }
        const v = res ? res[PREFIX + k] : null;
        resolve(v == null ? null : String(v));
      });
    } catch (e) { resolve(null); }
  });

  const setOne = (area, k, v) => new Promise((resolve) => {
    try { area.set({ [PREFIX + k]: v }, () => resolve(!lastErr())); } catch (e) { resolve(false); }
  });

  const removeOne = (area, k) => new Promise((resolve) => {
    try { area.remove(PREFIX + k, () => resolve(!lastErr())); } catch (e) { resolve(false); }
  });

  // 分片切分：按 **UTF-8 字节**预算切片（与 Store.chunkRaw 逐条同规则），
  // 保证含中文的分片也不超 chrome.storage.sync 单条 8192 字节配额。
  function chunkRaw(raw) {
    const budget = CHUNK_SIZE;
    const parts = [];
    let start = 0;
    let acc = 0;
    let i = 0;
    while (i < raw.length) {
      const c = raw.charCodeAt(i);
      let bytes;
      let advance = 1;
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < raw.length) { bytes = 4; advance = 2; }
      else if (c < 0x80) bytes = 1;
      else if (c < 0x800) bytes = 2;
      else bytes = 3;
      if (acc + bytes > budget) { parts.push(raw.slice(start, i)); start = i; acc = 0; continue; }
      acc += bytes;
      i += advance;
    }
    if (start < raw.length) parts.push(raw.slice(start));
    return parts;
  }

  async function clearChunks(area) {
    const metaRaw = await getOne(area, LOGICAL + '.meta');
    if (!metaRaw) return;
    try {
      const meta = JSON.parse(metaRaw);
      for (let i = 0; i < (meta.chunks || 0) + 8; i++) await removeOne(area, LOGICAL + '#' + i);
    } catch (e) { /* 坏 meta 也照样清 meta 键 */ }
    await removeOne(area, LOGICAL + '.meta');
  }

  async function readLogical(area) {
    const metaRaw = await getOne(area, LOGICAL + '.meta');
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        let s = '';
        for (let i = 0; i < (meta.chunks || 0); i++) {
          const part = await getOne(area, LOGICAL + '#' + i);
          if (part == null) return null; // 分片不全 → 视为没有（绝不半份拼出来）
          s += part;
        }
        return s;
      } catch (e) { /* 坏 meta → 退回整值 */ }
    }
    return getOne(area, LOGICAL);
  }

  async function writeLogical(target, raw) {
    if (target.chunk && raw.length > CHUNK_SIZE) {
      const parts = chunkRaw(raw);
      await clearChunks(target.area);
      if (!(await setOne(target.area, LOGICAL + '.meta', JSON.stringify({ chunks: parts.length, bytes: raw.length })))) return false;
      for (let i = 0; i < parts.length; i++) {
        if (!(await setOne(target.area, LOGICAL + '#' + i, parts[i]))) return false;
      }
      await removeOne(target.area, LOGICAL); // 清掉可能存在的旧整值，避免双写歧义
      return true;
    }
    const ok = await setOne(target.area, LOGICAL, raw);
    if (!ok) return false;
    await clearChunks(target.area); // 缩容后残留的分片会让下次读取拼出旧值
    return true;
  }

  // ============================================================
  // 2. 页面状态（读到 + 本地改动 → 去抖整对象写回）
  // ============================================================
  let prefs = {};
  let target = null;       // 落盘目标（优先 sync）
  let writeTimer = null;

  function setStatus(text, cls) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = cls || '';
  }

  async function load() {
    for (const a of areaList()) {
      const raw = await readLogical(a.area);
      if (raw == null) continue;
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) { prefs = obj; target = a; return true; }
      } catch (e) { /* 坏值 → 试下一个后端 */ }
    }
    const list = areaList();
    target = list.length ? list[0] : null;
    return false;
  }

  function scheduleSave() {
    setStatus('保存中…', '');
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  async function flush() {
    writeTimer = null;
    if (!target) { setStatus('保存失败：扩展存储不可用', 'err'); return; }
    const raw = JSON.stringify(prefs);
    if (await writeLogical(target, raw)) { setStatus('已保存', 'ok'); return; }
    // sync 写失败（配额 / 限流）→ 再往 local 写一份兜底，但**不**改 target：
    // 下次改动仍优先写 sync，一旦恢复，主源就回到 sync（与内容脚本的 backend 链一致）。
    const local = areaList().find((a) => a.name === 'local');
    if (local && local !== target && await writeLogical(local, raw)) { setStatus('已保存到本地存储（云同步受限）', ''); return; }
    setStatus('保存失败（云同步受限且本地写入也失败）', 'err');
  }

  // ============================================================
  // 3. 键路径读写（支持点号路径，如 videoTune.brightness / actions.hide.enabled）
  // ============================================================
  function getPath(obj, path) {
    const ps = String(path).split('.');
    let cur = obj;
    for (const k of ps) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[k];
    }
    return cur;
  }

  function setPath(obj, path, val) {
    const ps = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < ps.length - 1; i++) {
      if (cur[ps[i]] == null || typeof cur[ps[i]] !== 'object') cur[ps[i]] = {};
      cur = cur[ps[i]];
    }
    cur[ps[ps.length - 1]] = val;
  }

  // 值缺失时用 DEFAULT_PREFS 的同一路径兜底（schema 每个键都有默认值，单测把关）
  function readVal(item) {
    const v = getPath(prefs, item.key);
    return v === undefined ? getPath(DEFAULTS, item.key) : v;
  }

  function writeVal(item, v) {
    setPath(prefs, item.key, v);
    scheduleSave();
  }

  const round = (n, d) => { const p = Math.pow(10, d); return Math.round(n * p) / p; };

  // ============================================================
  // 4. 按 schema 渲染（每个 item → 一个 SviControls 控件）
  // ============================================================
  //   kind 词汇与工厂的对应关系（schema 的 kind 是枚举，不认识的 kind 必须显式报错而不是静默跳过）
  const KINDS = {
    toggle(item) {
      return C.toggleRow(item.label, item.hint, () => !!readVal(item), (v) => writeVal(item, !!v));
    },
    slider(item) {
      const sc = Number(item.scale) || 1;
      const num = () => { const n = Number(readVal(item)); return isFinite(n) ? n : (Number(item.min) || 0); };
      return C.sliderRow(item.label, item.hint,
        () => round(num() * sc, 3),
        (v) => writeVal(item, sc === 1 ? v : round(v / sc, 4)),
        item.min, item.max, item.step, item.unit || '');
    },
    select(item) {
      const opts = (item.options || []).map((o) => ({ v: o[0], label: o[1], describe: o[2] || '' }));
      return C.selectRow(item.label, item.hint, opts,
        () => String(readVal(item)),
        (v) => writeVal(item, v));
    },
    // 时刻：面板里也是运行时构造的 0~23 数组（buildScheduleSection 内联），此处同构重建
    hour(item) {
      const hours = [];
      for (let h = 0; h < 24; h++) hours.push({ v: String(h), label: h + ' 时', describe: '' });
      return C.selectRow(item.label, item.hint, hours,
        () => String(Math.round(Number(readVal(item)) || 0)),
        (v) => writeVal(item, Math.round(Number(v)) || 0));
    },
    // 多行域名名单：存储是数组，界面是每行一条（与面板 textRow 的读写语义逐条一致）
    text(item) {
      return C.textRow(item.label, item.hint,
        () => (Array.isArray(readVal(item)) ? readVal(item).join('\n') : ''),
        item.rows || 3,
        (s) => writeVal(item, String(s).split(/\n+/).map((x) => x.trim()).filter(Boolean)),
        '');
    },
    color(item) {
      // 空值由控件自己兜底（pickerRow 内部有 '#' 头部默认，且那是它的单一实现点）
      return C.pickerRow(item.label, item.hint, () => String(readVal(item) || ''), (v) => writeVal(item, v));
    },
    // 色卡多选（如「预设浅色色卡」）：候选项来自构建期抽出的 IMG_COLOR_PRESETS
    chipsOf(item) {
      return C.chipRow(
        CARDS.map((c) => ({ id: c.id, label: c.name, color: c.color })),
        (id) => { const m = getPath(prefs, item.key); return !!(m && typeof m === 'object' && m[id]); },
        (id) => {
          const m = getPath(prefs, item.key);
          const next = (m && typeof m === 'object') ? m : {};
          next[id] = !next[id];
          writeVal(item, next);
        });
    },
  };

  let synced = [];

  function buildItem(item) {
    const make = KINDS[item.kind];
    if (!make) {
      // 显式失败：schema 里出现没实现过的 kind 时必须看得见（静默跳过 = 设置项凭空消失）
      return C.infoLine('未实现的控件类型: ' + item.kind + '（' + item.key + '）', 'svi-msg svi-msg-error');
    }
    const ctl = make(item);
    const rowEl = ctl.row || ctl.el;
    if (rowEl && rowEl.dataset) rowEl.dataset.sviKey = item.key; // E2E / 单测的稳定锚点
    return ctl;
  }

  function build() {
    if (!root) return 0;
    root.textContent = '';
    synced = [];
    let count = 0;
    for (const group of SCHEMA) {
      const card = C.collapsible(group.title, group.items.length + ' 项', false);
      for (const item of group.items) {
        card.add(buildItem(item));
        count++;
      }
      synced.push(card);
      root.appendChild(card.el);
    }
    return count;
  }

  function syncAll() {
    for (const card of synced) card.syncAll();
  }

  // ============================================================
  // 5. 启动
  // ============================================================
  (async function main() {
    if (verEl) {
      try { verEl.textContent = 'v' + (chrome.runtime.getManifest().version || ''); } catch (e) { /* ignore */ }
    }
    if (!root) return;
    if (!C || !SCHEMA.length) {
      setStatus('设置清单不可用（构建产物缺失）', 'err');
      return;
    }
    const found = await load();
    if (!target) {
      setStatus('扩展存储不可用（本页需以扩展页方式打开）', 'err');
      return;
    }
    const count = build();
    syncAll();
    setStatus(found ? '已就绪' : '已就绪（未读到已存偏好，按默认值显示）', found ? 'ok' : '');
    // 调试 / E2E 句柄（只读 + 立即落盘；不参与页面逻辑）
    window.__sviOptions = {
      schemaGroups: SCHEMA.length,
      itemCount: count,
      defaultKeys: Object.keys(DEFAULTS).length,
      storageArea: () => (target ? target.name : null),
      prefs: () => prefs,
      saveNow: flush,
      render: build,
    };
  })();
})();
