// ==UserScript==
// @name         全网通用智能视频与图片反色 (Universal Smart Video & Image Invert)
// @name:zh-CN   全网通用智能视频与图片反色
// @name:en      Universal Smart Video & Image Invert
// @namespace    https://github.com/jiozhaoyue/universal-smart-invert
// @version      2.0.0
// @description  全网通用智能HTML5视频与图片反色脚本 (v2.0)。新增: 背景替换引擎 (浅色页面一键深色化, 登录块原样保护)、内置主流网站规则库 (B站/GitHub/网易/知乎等)、原色屏蔽、智能小元素屏蔽、标签页隔离 (反色状态不跨标签页串扰)、本地数据统计与开发者导出; 修复 GitHub camo/star-history 跨域 SVG 反色与 B站评论背景图缩略图反色。
// @description:zh-CN 全网通用智能HTML5视频与图片反色脚本 (v2.0)。新增: 背景替换引擎 (浅色页面一键深色化, 登录块原样保护)、内置主流网站规则库、原色屏蔽、智能小元素屏蔽、标签页隔离、本地数据统计与开发者导出; 修复 GitHub camo/star-history 跨域 SVG 反色与 B站评论背景图缩略图反色。
// @description:en Universal HTML5 smart video and image invert userscript (v2.0). New: background-replace engine (dark mode for light pages, login-box safe), built-in site rule library (Bilibili/GitHub/163/Zhihu and more), original-color shield, smart small-element shield, per-tab isolation, local stats with manual developer export; fixes GitHub camo/star-history cross-origin SVG inversion and Bilibili comment background-image thumbnails.
// @author       jiozhaoyue
// @license      MIT
// @icon         data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%231e293b%22 stroke=%22%2338bdf8%22 stroke-width=%228%22/><path d=%22M50 4 A46 46 0 0 1 50 96 Z%22 fill=%22%2338bdf8%22/></svg>
// @homepageURL  https://github.com/jiozhaoyue/universal-smart-invert
// @supportURL   https://github.com/jiozhaoyue/universal-smart-invert/issues
// @updateURL    https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
// @downloadURL  https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// @connect      *
// @run-at       document-end
// @compatible   chrome
// @compatible   edge
// @compatible   firefox
// @compatible   opera
// @compatible   safari
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // 1. 配置与常量定义
  // ==========================================
  const SCRIPT_VERSION = '2.0.0';
  const PREFS_KEY = 'universal_smart_invert_v4';   // 持久化偏好专用 (仅偏好, 绝不含运行时状态)
  const LEGACY_KEY = 'universal_smart_invert_v3';  // v1.x 旧键 (仅读取迁移, 保留不删以便回滚)
  const STATS_KEY = 'universal_smart_invert_stats_v1'; // 本地统计数据 (独立键)

  const PRESETS = {
    'soft-gray': {
      id: 'soft-gray',
      name: '柔和灰',
      brightness: 0.92,
      contrast: 0.90,
      saturate: 1.00,
      hueRotate: 180,
      filter: 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)',
    },
    'amoled': {
      id: 'amoled',
      name: '纯黑',
      brightness: 0.75,
      contrast: 1.10,
      saturate: 1.00,
      hueRotate: 180,
      filter: 'invert(1) hue-rotate(180deg) brightness(0.75) contrast(1.10)',
    },
  };

  const IMG_COLOR_PRESETS = [
    { id: 'white', name: '标准纯白', color: '#FFFFFF', rgb: [255, 255, 255] },
    { id: 'gray', name: '纸质浅灰', color: '#F5F5F5', rgb: [245, 245, 245] },
    { id: 'cream', name: '米黄暖白', color: '#FAF0E6', rgb: [250, 240, 230] },
    { id: 'coolBlue', name: '冷调淡蓝', color: '#F0F8FF', rgb: [240, 248, 255] },
  ];

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return [255, 255, 255];
    const c = hex.replace('#', '').trim();
    if (c.length === 3) {
      return [
        parseInt(c[0] + c[0], 16),
        parseInt(c[1] + c[1], 16),
        parseInt(c[2] + c[2], 16)
      ];
    }
    if (c.length === 6) {
      return [
        parseInt(c.substring(0, 2), 16),
        parseInt(c.substring(2, 4), 16),
        parseInt(c.substring(4, 6), 16)
      ];
    }
    return [255, 255, 255];
  }

  const DEFAULT_PREFS = {
    enabled: true,           // 脚本总使能
    autoDetect: true,        // 视频智能自动反色检测
    imageInvert: true,       // 网页浅色图片智能反色 (总开关)
    presetId: 'soft-gray',   // 当前预设 ('soft-gray' | 'amoled' | 'custom')

    // 网页浅色图表检测与色图参数 (开箱即用)
    imgGeneralLight: true,   // 全浅色通用自适应检测
    imgPresets: {            // 预设浅色色卡开关 (默认全部激活)
      white: true,
      gray: true,
      cream: true,
      coolBlue: true
    },
    imgCustomColor: '#ffffff', // 自定义色图选色 (HEX)
    imgTolerance: 35,        // 目标色彩色差容差 (10 ~ 80)
    imgLumCutoff: 180,       // 浅色感知明度阈值 (150 ~ 240)
    imgAreaThreshold: 48,    // 浅色面积占比阈值百分比 (25 ~ 90)
    minImgSize: 48,          // 正文图片最小检测尺寸: 32 ~ 300px

    // 滤镜微调参数 (双向滑动条 + 数值填空)
    brightness: 0.92,
    contrast: 0.90,
    saturate: 1.00,
    hueRotate: 180,

    // 切换速度与过渡动画
    transitionMs: 0,

    // 智能检测参数
    sampleIntervalMs: 250,
    whiteThreshold: 60,
    lumThreshold: 210,
    exitHysteresisMs: 1500,

    settingsOpen: false,
    advancedOpen: false,
    pos: { x: null, y: null, edge: 'right' }, // 悬浮胶囊位置

    // ===== v2.0 新增偏好 =====
    siteMode: 'all',           // 站点管理模式: 'all' | 'blacklist' | 'whitelist'
    siteBlacklist: [],         // 黑名单域名模式: 'example.com', '*.163.com'
    siteWhitelist: [],         // 白名单域名模式
    siteOverrides: {},         // 本站覆盖: { '<pattern>': { enabled, videoInvert, imageInvert, bgReplace, excludeSelectors: [], shieldColors: [] } }
    rulesEnabled: true,        // 内置站点规则库总开关
    shieldColors: [],          // 全局原色屏蔽列表 ('#rrggbb')
    manualOverrides: {},       // Alt+点击手动覆盖记忆: { '<host>|<src>': 'invert' | 'restore' } (FIFO 上限 400)
    statsEnabled: true,        // 本地数据统计开关
    bgReplace: false,          // 背景替换全局默认 (站点覆盖优先)
    bgExcludeSelectors: [],    // 背景替换全局排除选择器 (登录块等)
  };

  // 运行时状态 (仅存于内存, 每个标签页独立, 绝不写入 localStorage —— 标签页隔离)
  const runtime = {
    invertActive: false,          // 视频反色当前是否生效
    currentDetectedScene: 'normal',
    userRejectedScene: null,
    normalSceneCount: 0,
  };

  // 智能小元素屏蔽上下文选择器 (p0)
  const CONTENT_CONTEXT_SELECTOR = '.markdown-body, [class*="article"], [class*="content"], .post-content, .rich-text, .comment-content';
  const CHROME_CONTEXT_SELECTOR = 'nav, header, footer, aside, [role="banner"], [class*="logo"], [class*="icon"], [aria-hidden="true"]';
  const META_ICON_RE = /(avatar|user-pic|profile-pic|emoji|emoticon|captcha)/;

  // 背景替换内置登录块保护选择器 (绝不覆盖登录区域)
  const LOGIN_SELECTORS = [
    '[class*="login" i]',
    '[id*="login" i]',
    '[class*="signin" i]',
    '[class*="LoginPanel"]',
    'form[action*="login" i]',
    '[class*="passport"]',
  ];

  // 背景替换扫描跳过的媒体/资源标签 (绝不触碰 img/video/svg/canvas/iframe)
  const BGR_SKIP_TAGS_RE = /^(img|video|svg|canvas|iframe|script|style|link|noscript|meta|template)$/i;

  // ==========================================
  // 2. 状态持久化与偏好读写 (v3 → v4 迁移)
  // ==========================================
  let state = loadState();

  function loadState() {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    let stored = null;
    let fromLegacy = false;
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        stored = JSON.parse(raw);
      } else {
        const legacyRaw = localStorage.getItem(LEGACY_KEY);
        if (legacyRaw) {
          stored = JSON.parse(legacyRaw);
          fromLegacy = true;
        }
      }
    } catch (e) {
      console.warn('[SmartInvert] Failed to load prefs:', e);
      stored = null;
    }

    const safeStored = (stored && typeof stored === 'object') ? stored : {};
    const merged = { ...defaults, ...safeStored };
    // 对象字段深合并, 防止旧数据缺键导致整块丢失
    merged.imgPresets = { ...defaults.imgPresets, ...(safeStored.imgPresets || {}) };
    merged.siteOverrides = { ...(safeStored.siteOverrides || {}) };
    merged.pos = { ...defaults.pos, ...(safeStored.pos || {}) };
    // v2.0 新增字段规范化: 存储层数据异常 (损坏/手工篡改) 时回退默认, 防止引擎与 UI 崩溃
    if (!Array.isArray(merged.siteBlacklist)) merged.siteBlacklist = [];
    if (!Array.isArray(merged.siteWhitelist)) merged.siteWhitelist = [];
    if (!Array.isArray(merged.bgExcludeSelectors)) merged.bgExcludeSelectors = [];
    if (!Array.isArray(merged.shieldColors)) merged.shieldColors = [];
    // 原色屏蔽仅接受标准 #rrggbb (拾色器来源), 杜绝异常字符串进入样式与 DOM
    merged.shieldColors = merged.shieldColors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c));
    if (!merged.manualOverrides || typeof merged.manualOverrides !== 'object' || Array.isArray(merged.manualOverrides)) {
      merged.manualOverrides = {};
    }
    if (merged.siteMode !== 'all' && merged.siteMode !== 'blacklist' && merged.siteMode !== 'whitelist') {
      merged.siteMode = 'all';
    }
    // 标签页隔离: 运行时状态绝不入库
    delete merged.invertActive;

    if (fromLegacy) {
      // 迁移落盘 (旧 v3 键原样保留, 便于回滚)
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch (e) { /* ignore */ }
    }
    return merged;
  }

  let savePrefsTimer = null;
  let prefsRevision = 0;

  // 所有偏好写入统一走防抖保存 (300ms)
  function savePrefs() {
    prefsRevision++;
    clearTimeout(savePrefsTimer);
    savePrefsTimer = setTimeout(flushPrefsNow, 300);
  }

  function flushPrefsNow() {
    clearTimeout(savePrefsTimer);
    savePrefsTimer = null;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[SmartInvert] Failed to save prefs:', e);
    }
  }

  function getActiveFilter() {
    if (state.presetId === 'custom') {
      const b = Number(state.brightness || 0.92).toFixed(2);
      const c = Number(state.contrast || 0.90).toFixed(2);
      const s = Number(state.saturate || 1.00).toFixed(2);
      const h = Math.round(state.hueRotate || 180);
      return `invert(1) hue-rotate(${h}deg) brightness(${b}) contrast(${c}) saturate(${s})`;
    }
    const p = PRESETS[state.presetId];
    return p ? p.filter : PRESETS['soft-gray'].filter;
  }

  function updateImageFilterCss() {
    const f = getActiveFilter();
    const t = (state.transitionMs && state.transitionMs > 0)
      ? `filter ${state.transitionMs}ms cubic-bezier(0.4, 0, 0.2, 1)`
      : 'none';
    const profile = getSiteProfile();
    const imgOn = !!state.imageInvert && profile.enabled !== false && profile.imageInvert !== false;
    if (document.documentElement) {
      document.documentElement.style.setProperty('--svi-img-filter', f);
      document.documentElement.style.setProperty('--svi-img-transition', t);
      document.documentElement.classList.toggle('svi-img-invert-on', imgOn);
    }
    if (document.body) {
      document.body.classList.toggle('svi-img-invert-on', imgOn);
    }
  }

  // ==========================================
  // 3. 通用工具函数 (颜色 / 模式匹配 / 调度 / 手动覆盖)
  // ==========================================
  function parseColorString(str) {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim().toLowerCase();
    if (s === 'transparent' || s === 'none') return [0, 0, 0, 0];
    if (s.startsWith('#')) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
          1
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16),
          1
        ];
      }
      if (hex.length === 8) {
        return [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16),
          parseInt(hex.substring(6, 8), 16) / 255
        ];
      }
      return null;
    }
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter((x) => x.length > 0);
      if (parts.length >= 3) {
        const r = Math.max(0, Math.min(255, Math.round(parseFloat(parts[0]) || 0)));
        const g = Math.max(0, Math.min(255, Math.round(parseFloat(parts[1]) || 0)));
        const b = Math.max(0, Math.min(255, Math.round(parseFloat(parts[2]) || 0)));
        let a = 1;
        if (parts.length > 3) {
          a = parts[3].endsWith('%') ? (parseFloat(parts[3]) || 0) / 100 : (parseFloat(parts[3]) || 0);
        }
        return [r, g, b, Math.max(0, Math.min(1, a))];
      }
    }
    return null;
  }

  // ITU-R BT.601 快速整数明度 (0 ~ 255)
  function relLuminance(r, g, b) {
    return (r * 77 + g * 150 + b * 29) >> 8;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [
      Math.round(f(0) * 255),
      Math.round(f(8) * 255),
      Math.round(f(4) * 255)
    ];
  }

  // 浅色 → 深色映射: 保留色相, 明度反转并限制在 [8, 92], 饱和度压到 48 以内 (纯函数)
  function mapLightToDark(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    const l2 = Math.min(92, Math.max(8, 100 - hsl[2]));
    const s2 = Math.min(hsl[1], 48);
    return hslToRgb(hsl[0], s2, l2);
  }

  // 深色 → 浅色映射 (文字用, 与背景映射互为镜像)
  function mapDarkToLight(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    const l2 = Math.min(92, Math.max(8, 100 - hsl[2]));
    const s2 = Math.min(hsl[1], 48);
    return hslToRgb(hsl[0], s2, l2);
  }

  // 边框映射: 映射为中间偏暗的色调, 保证深色底上仍可见
  function mapBorderToDark(r, g, b) {
    const hsl = rgbToHsl(r, g, b);
    const l2 = Math.min(46, Math.max(18, 100 - hsl[2]));
    const s2 = Math.min(hsl[1], 40);
    return hslToRgb(hsl[0], s2, l2);
  }

  function quantizeRgb(rgb) {
    return [
      Math.max(0, Math.min(255, Math.round(rgb[0] / 8) * 8)),
      Math.max(0, Math.min(255, Math.round(rgb[1] / 8) * 8)),
      Math.max(0, Math.min(255, Math.round(rgb[2] / 8) * 8))
    ];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function bucketKey(rgb) {
    return rgbToHex(quantizeRgb(rgb));
  }

  // 原色屏蔽判定: 各通道差值均不超过容差即视为命中 (默认容差 24)
  function isShieldedColor(rgb, shieldList, tolerance) {
    const tol = typeof tolerance === 'number' ? tolerance : 24;
    if (!rgb || !Array.isArray(shieldList) || shieldList.length === 0) return false;
    for (let i = 0; i < shieldList.length; i++) {
      const sc = shieldList[i];
      if (Math.abs(rgb[0] - sc[0]) <= tol && Math.abs(rgb[1] - sc[1]) <= tol && Math.abs(rgb[2] - sc[2]) <= tol) {
        return true;
      }
    }
    return false;
  }

  function parseShieldColors(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const c of list) {
      if (typeof c !== 'string') continue;
      const rgb = parseColorString(c);
      if (rgb) out.push([rgb[0], rgb[1], rgb[2]]);
    }
    return out;
  }

  // 域名模式匹配: '*.163.com' 与 '163.com' 均匹配本域+子域 (点边界后缀匹配); 'mail.163.com' 仅精确匹配
  function hostMatchesPattern(host, pattern) {
    if (!host || !pattern || typeof pattern !== 'string') return false;
    const h = String(host).toLowerCase().replace(/\.$/, '');
    const p = pattern.trim().toLowerCase();
    if (!p) return false;
    if (p === '*' || p === '*.*') return true;
    if (p.startsWith('*.')) {
      const base = p.slice(2);
      if (!base) return false;
      return h === base || h.endsWith('.' + base);
    }
    if (p.includes('*')) {
      try {
        const re = new RegExp('^' + p.split('*').map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        return re.test(h);
      } catch (e) {
        return false;
      }
    }
    // 已带子域的完整主机名 (≥3 段): 仅精确匹配
    if (p.split('.').length >= 3) {
      return h === p;
    }
    return h === p || h.endsWith('.' + p);
  }

  function safeMatches(el, selectors) {
    if (!el || !Array.isArray(selectors) || selectors.length === 0) return false;
    try {
      return el.matches(selectors.join(','));
    } catch (e) {
      return false;
    }
  }

  function debounce(fn, waitMs) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  function requestIdle(fn, timeoutMs) {
    const timeout = timeoutMs || 1500;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout });
    } else {
      setTimeout(fn, timeout);
    }
  }

  // 鲁棒启动: body 未就绪时以 50ms 间隔有界重试 (最多 3s), 之后优雅放弃
  function whenBodyReady(cb, timeoutMs) {
    const timeout = timeoutMs || 3000;
    if (document.body) {
      cb();
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (document.body || Date.now() - startedAt >= timeout) {
        clearInterval(timer);
        cb();
      }
    }, 50);
  }

  function manualOverrideKey(host, src) {
    return host + '|' + src;
  }

  // 手动覆盖写入: FIFO 上限 cap (默认 400)
  function addManualOverride(store, key, value, cap) {
    const max = cap || 400;
    if (!store || typeof store !== 'object' || !key) return;
    delete store[key];
    store[key] = value;
    const keys = Object.keys(store);
    if (keys.length > max) {
      const remove = keys.slice(0, keys.length - max);
      for (const k of remove) delete store[k];
    }
  }

  function showToast(msg) {
    let toast = null;
    try { toast = document.getElementById('svi-toast'); } catch (e) { return; }
    if (!toast) {
      try {
        toast = document.createElement('div');
        toast.id = 'svi-toast';
        toast.style.cssText = `
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.92);
          color: #38bdf8;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
          z-index: 2147483647;
          pointer-events: none;
          transition: opacity 0.2s ease;
          opacity: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        (document.body || document.documentElement).appendChild(toast);
      } catch (e) {
        return;
      }
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1600);
  }

  function extractCssUrls(bgValue) {
    const out = [];
    if (!bgValue || typeof bgValue !== 'string') return out;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    let m;
    while ((m = re.exec(bgValue)) !== null) {
      out.push(m[2].trim());
      if (out.length >= 5) break;
    }
    return out;
  }

  function loadImageEl(url, timeoutMs) {
    const timeout = timeoutMs || 8000;
    return new Promise((resolve, reject) => {
      const im = new Image();
      let settled = false;
      const to = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('image load timeout'));
        }
      }, timeout);
      im.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(to);
          resolve(im);
        }
      };
      im.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(to);
          reject(new Error('image load error'));
        }
      };
      im.src = url;
    });
  }

  // ==========================================
  // 4. 内置站点规则库与站点档案解析 (BUILTIN_RULES & SiteProfile)
  // ==========================================
  const BUILTIN_RULES = [
    {
      pattern: 'bilibili.com',
      name: '哔哩哔哩',
      protect: ['.bpx-player-control-wrap', '.bili-danmaku', '.squirtle-video-page', '.bilibili-player-video-danmaku'],
      forceInvert: [],
      bgImageSelectors: ['.b-img__inner', '.reply-image .b-img', '[class*="image-box"] img', '.bili-comment-image'],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'live.bilibili.com',
      name: '哔哩哔哩直播',
      protect: ['.bilibili-live-player-video-danmaku', '.bpx-player-control-wrap'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: true,
      bgReplace: false,
    },
    {
      pattern: 'github.com',
      name: 'GitHub',
      protect: ['.Avatar', '.avatar', 'img[src*="identicons"]'],
      forceInvert: ['.markdown-body img', 'img[src*="camo.githubusercontent.com"]'],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: '163.com',
      name: '网易 163 (邮箱/门户/博客)',
      protect: [],
      forceInvert: ['.mail-body img', 'img[src*="coremail"]'],
      bgImageSelectors: ['[class*="bg-img"]', '.mail-bg'],
      disableVideoAuto: false,
      bgReplace: true,
    },
    {
      pattern: 'zhihu.com',
      name: '知乎',
      protect: ['.Avatar', '.avatar'],
      forceInvert: ['.RichContent-inner img'],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'weibo.com',
      name: '微博',
      protect: ['.avatar'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'youtube.com',
      name: 'YouTube',
      protect: ['.ytp-chrome-bottom', '.ytp-chrome-controls', '.ytp-cued-thumbnail-overlay'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: true,
      bgReplace: false,
    },
    {
      pattern: 'douyin.com',
      name: '抖音',
      protect: ['.xg-controls', '.xgplayer'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: true,
      bgReplace: false,
    },
    {
      pattern: 'iqiyi.com',
      name: '爱奇艺',
      protect: ['.iqp-player-interface'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: true,
      bgReplace: false,
    },
    {
      pattern: 'youku.com',
      name: '优酷',
      protect: ['.kui-control-bar'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: true,
      bgReplace: false,
    },
    {
      pattern: 'v.qq.com',
      name: '腾讯视频',
      protect: ['.txp_player_controls', '.txp-popup'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: true,
      bgReplace: false,
    },
    {
      pattern: 'twitter.com',
      name: 'Twitter/X',
      protect: [],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'x.com',
      name: 'Twitter/X',
      protect: [],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'qq.com',
      name: '腾讯 (QQ/邮箱/门户)',
      protect: ['.avatar'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'taobao.com',
      name: '淘宝',
      protect: ['[class*="avatar"]'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'jd.com',
      name: '京东',
      protect: ['#ttbar-login', '.avatar'],
      forceInvert: [],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'stackoverflow.com',
      name: 'Stack Overflow',
      protect: ['.s-avatar'],
      forceInvert: ['.s-prose img'],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'juejin.cn',
      name: '掘金',
      protect: ['.avatar'],
      forceInvert: ['.markdown-body img'],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
    {
      pattern: 'csdn.net',
      name: 'CSDN',
      protect: ['.avatar', '.profile-img'],
      forceInvert: ['#content_views img', '.markdown_views img'],
      bgImageSelectors: [],
      disableVideoAuto: false,
      bgReplace: false,
    },
  ];

  function findBuiltinRule(host) {
    for (const rule of BUILTIN_RULES) {
      if (hostMatchesPattern(host, rule.pattern)) return rule;
    }
    return null;
  }

  function findUserOverride(host) {
    const patterns = Object.keys(state.siteOverrides || {});
    patterns.sort((a, b) => b.length - a.length); // 最长匹配优先
    for (const p of patterns) {
      if (hostMatchesPattern(host, p)) {
        return { pattern: p, override: state.siteOverrides[p] };
      }
    }
    return null;
  }

  // 站点档案解析 (纯函数, 可单测): effective = merge(全局默认, 内置规则, 用户本站覆盖)
  function resolveSiteProfile(host) {
    const rule = state.rulesEnabled === false ? null : findBuiltinRule(host);
    const overrideEntry = findUserOverride(host);
    const override = overrideEntry ? overrideEntry.override : null;

    const profile = {
      host,
      ruleName: rule ? rule.name : null,
      builtin: rule,
      overridePattern: overrideEntry ? overrideEntry.pattern : null,
      override,
      enabled: true,
      videoInvert: true,
      imageInvert: true,
      bgReplace: !!state.bgReplace,
      disableVideoAuto: rule ? !!rule.disableVideoAuto : false,
      protect: rule ? (rule.protect || []).slice() : [],
      forceInvert: rule ? (rule.forceInvert || []).slice() : [],
      bgImageSelectors: rule ? (rule.bgImageSelectors || []).slice() : [],
      excludeSelectors: [],
      shieldColors: (state.shieldColors || []).slice(),
    };

    if (rule && rule.bgReplace) profile.bgReplace = true;
    if (rule && Array.isArray(rule.excludeSelectors)) profile.excludeSelectors.push(...rule.excludeSelectors);

    // 站点管理模式 (黑名单/白名单) —— 粗粒度门控, 先于本站覆盖应用:
    // 只负责"禁用", 是否重新启用/禁用由更具体的本站覆盖 (显式 enabled) 决定
    if (state.siteMode === 'blacklist') {
      const bl = state.siteBlacklist || [];
      if (bl.some((p) => hostMatchesPattern(host, p))) profile.enabled = false;
    } else if (state.siteMode === 'whitelist') {
      const wl = state.siteWhitelist || [];
      if (!wl.some((p) => hostMatchesPattern(host, p))) profile.enabled = false;
    }

    if (override && typeof override === 'object') {
      if (override.enabled !== undefined) profile.enabled = !!override.enabled;
      if (override.videoInvert !== undefined) profile.videoInvert = !!override.videoInvert;
      if (override.imageInvert !== undefined) profile.imageInvert = !!override.imageInvert;
      if (override.bgReplace !== undefined) profile.bgReplace = !!override.bgReplace;
      if (Array.isArray(override.excludeSelectors)) profile.excludeSelectors.push(...override.excludeSelectors);
      if (Array.isArray(override.shieldColors)) profile.shieldColors.push(...override.shieldColors);
    }

    return profile;
  }

  // 每主机 + 偏好版本号缓存
  const profileCache = new Map();

  function getSiteProfile() {
    const host = location.hostname;
    const cached = profileCache.get(host);
    if (cached && cached.rev === prefsRevision) return cached.profile;
    const profile = resolveSiteProfile(host);
    profileCache.set(host, { rev: prefsRevision, profile });
    return profile;
  }

  // ==========================================
  // 5. 样式注入 (极简胶囊、控制卡片、高级设置弹窗)
  // ==========================================
  function injectStyles() {
    const css = `
      :root {
        --svi-img-filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90);
        --svi-img-transition: none;
      }
      .svi-capsule-root {
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        user-select: none;
        box-sizing: border-box;
      }
      .svi-capsule-root * {
        box-sizing: border-box;
      }
      /* 贴边微型触发小圆点/药丸 */
      .svi-trigger-pill {
        width: 14px;
        height: 38px;
        border-radius: 8px 0 0 8px;
        background: rgba(30, 32, 40, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-right: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: width 0.15s ease, background 0.15s ease, opacity 0.15s ease;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        opacity: 0.55;
      }
      .svi-trigger-pill.left-edge {
        border-radius: 0 8px 8px 0;
        border-right: 1px solid rgba(255, 255, 255, 0.15);
        border-left: none;
      }
      .svi-trigger-pill:hover {
        width: 20px;
        opacity: 1;
        background: rgba(30, 32, 40, 0.95);
      }
      /* 状态指示点 */
      .svi-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #888;
        transition: background 0.2s ease;
      }
      .svi-status-dot.active-auto {
        background: #10b981;
        box-shadow: 0 0 6px #10b981;
      }
      .svi-status-dot.active-manual {
        background: #3b82f6;
        box-shadow: 0 0 6px #3b82f6;
      }
      .svi-status-dot.cors-warn {
        background: #f59e0b;
      }

      /* 展开式微型控制面板 */
      .svi-panel-card {
        display: none;
        position: absolute;
        top: -60px;
        right: 22px;
        width: 250px;
        background: rgba(22, 24, 30, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
        border-radius: 12px;
        padding: 12px;
        color: #f1f3f9;
        font-size: 13px;
        flex-direction: column;
        gap: 10px;
        z-index: 2147483647;
      }
      .svi-capsule-root.left-edge .svi-panel-card {
        right: auto;
        left: 22px;
      }
      .svi-panel-card.show {
        display: flex;
      }
      .svi-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        font-size: 13px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .svi-card-status-badge {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
        color: #bbb;
      }
      .svi-card-status-badge.green {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }
      .svi-card-status-badge.blue {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .svi-card-status-badge.yellow {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }

      .svi-btn-row {
        display: flex;
        gap: 6px;
      }
      .svi-action-btn {
        flex: 1;
        padding: 6px 4px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
        color: #e2e8f0;
        border-radius: 8px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .svi-action-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.2);
      }
      .svi-action-btn.active {
        background: #2563eb;
        border-color: #3b82f6;
        color: #fff;
        font-weight: 600;
      }
      .svi-btn-row-4 .svi-action-btn {
        font-size: 10px;
        padding: 6px 2px;
      }

      .svi-preset-row {
        display: flex;
        gap: 6px;
      }
      .svi-preset-btn {
        flex: 1;
        padding: 4px 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        text-align: center;
        transition: all 0.15s ease;
      }
      .svi-preset-btn.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.15);
        color: #93c5fd;
        font-weight: 600;
      }

      .svi-open-modal-btn {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid rgba(59, 130, 246, 0.3);
        background: rgba(59, 130, 246, 0.12);
        color: #93c5fd;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
        transition: all 0.15s ease;
      }
      .svi-open-modal-btn:hover {
        background: rgba(59, 130, 246, 0.25);
        border-color: #3b82f6;
      }

      .svi-card-footer {
        font-size: 11px;
        color: #64748b;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 4px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .svi-hidden-fullscreen {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* 网页图片与矢量图智能反色规则 */
      html.svi-img-invert-on img[data-svi-inverted="true"],
      html.svi-img-invert-on svg[data-svi-inverted="true"],
      body.svi-img-invert-on img[data-svi-inverted="true"],
      body.svi-img-invert-on svg[data-svi-inverted="true"] {
        filter: var(--svi-img-filter, invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)) !important;
        transition: var(--svi-img-transition, none) !important;
      }
      html.svi-img-invert-on img[data-svi-inverted="true"]:hover,
      html.svi-img-invert-on svg[data-svi-inverted="true"]:hover,
      body.svi-img-invert-on img[data-svi-inverted="true"]:hover,
      body.svi-img-invert-on svg[data-svi-inverted="true"]:hover {
        filter: none !important;
      }

      /* 背景图反色 (B站评论缩略图等 background-image 元素) */
      html.svi-img-invert-on [data-svi-bginv="true"],
      body.svi-img-invert-on [data-svi-bginv="true"] {
        filter: var(--svi-img-filter, invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)) !important;
        transition: var(--svi-img-transition, none) !important;
      }
      html.svi-img-invert-on [data-svi-bginv="true"]:hover,
      body.svi-img-invert-on [data-svi-bginv="true"]:hover {
        filter: none !important;
      }

      /* v2.0 模态新增区块 (站点规则 / 原色屏蔽 / 数据统计) */
      .svi-modal-select {
        background: rgba(15, 23, 42, 0.9);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        font-size: 12px;
        padding: 4px 6px;
        outline: none;
        cursor: pointer;
      }
      .svi-modal-textarea {
        width: 100%;
        min-height: 52px;
        background: rgba(15, 23, 42, 0.8);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        font-size: 11px;
        font-family: monospace;
        padding: 6px 8px;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      }
      .svi-modal-textarea:focus {
        border-color: #38bdf8;
      }
      .svi-site-check-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .svi-check {
        width: 15px;
        height: 15px;
        accent-color: #38bdf8;
        cursor: pointer;
        flex-shrink: 0;
      }
      .svi-hint-line {
        font-size: 10px;
        color: #64748b;
        line-height: 1.6;
      }
      .svi-stats-summary {
        font-size: 11px;
        color: #94a3b8;
        font-family: monospace;
        line-height: 1.7;
      }
      .svi-mini-btn {
        padding: 5px 10px;
        background: rgba(59, 130, 246, 0.12);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #93c5fd;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .svi-mini-btn:hover {
        background: rgba(59, 130, 246, 0.25);
      }
      .svi-mini-btn.danger {
        background: rgba(239, 68, 68, 0.10);
        border-color: rgba(239, 68, 68, 0.3);
        color: #f87171;
      }
      .svi-mini-btn.danger:hover {
        background: rgba(239, 68, 68, 0.22);
      }
      .svi-shield-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        font-size: 11px;
        color: #cbd5e1;
        font-family: monospace;
      }
      .svi-shield-chip .svi-shield-x {
        cursor: pointer;
        color: #f87171;
        font-weight: 700;
        padding: 0 2px;
      }
      .svi-btn-row-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      /* ==========================================
         高级参数精细设置模态窗口 (Modal Settings Page)
         ========================================== */
      .svi-modal-mask {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 2147483647;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .svi-modal-mask.show {
        display: flex;
      }
      .svi-modal-window {
        width: 480px;
        max-width: 92vw;
        max-height: 86vh;
        background: rgba(22, 25, 34, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: #f1f5f9;
        animation: sviFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes sviFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      .svi-modal-header {
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .svi-modal-title {
        font-size: 15px;
        font-weight: 600;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .svi-modal-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 18px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 6px;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .svi-modal-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }
      .svi-modal-body {
        padding: 16px 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .svi-modal-section {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .svi-sec-title {
        font-size: 12px;
        font-weight: 600;
        color: #38bdf8;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .svi-modal-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .svi-modal-label-box {
        width: 140px;
        flex-shrink: 0;
      }
      .svi-modal-label {
        font-size: 12px;
        color: #e2e8f0;
      }
      .svi-modal-hint {
        font-size: 10px;
        color: #64748b;
      }
      .svi-modal-controls {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .svi-modal-slider {
        flex: 1;
        height: 4px;
        accent-color: #38bdf8;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
      }
      .svi-modal-num-input {
        width: 60px;
        padding: 4px 6px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #38bdf8;
        font-size: 12px;
        font-family: monospace;
        text-align: right;
        outline: none;
      }
      .svi-modal-num-input:focus {
        border-color: #38bdf8;
        box-shadow: 0 0 0 1px #38bdf8;
      }
      .svi-modal-unit {
        font-size: 11px;
        color: #94a3b8;
        width: 24px;
        flex-shrink: 0;
      }
      .svi-modal-footer {
        padding: 12px 18px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(15, 23, 42, 0.4);
      }
      .svi-modal-perf {
        font-size: 11px;
        color: #10b981;
        font-family: monospace;
      }
      .svi-footer-actions {
        display: flex;
        gap: 8px;
      }
      .svi-btn-reset {
        padding: 6px 12px;
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .svi-btn-reset:hover {
        background: rgba(239, 68, 68, 0.25);
      }
      .svi-btn-done {
        padding: 6px 14px;
        background: #2563eb;
        border: 1px solid #3b82f6;
        color: #fff;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.15s ease;
      }
      .svi-btn-done:hover {
        background: #1d4ed8;
      }

      /* 浅色色卡网格与色图选择器 */
      .svi-color-chips-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-top: 4px;
      }
      .svi-color-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
        color: #94a3b8;
        font-size: 12px;
      }
      .svi-color-chip:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f1f5f9;
      }
      .svi-color-chip.active {
        background: rgba(56, 189, 248, 0.14);
        border-color: #38bdf8;
        color: #38bdf8;
        font-weight: 500;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
      }
      .svi-color-chip-swatch {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.25);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        flex-shrink: 0;
      }
      .svi-color-chip-check {
        margin-left: auto;
        font-size: 11px;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .svi-color-chip.active .svi-color-chip-check {
        opacity: 1;
      }
      .svi-color-picker-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        margin-top: 6px;
      }
      .svi-color-picker-label {
        font-size: 12px;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .svi-color-picker-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .svi-color-input-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        cursor: pointer;
      }
      .svi-color-input-native {
        opacity: 0;
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
      }
      .svi-color-preview-box {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        font-size: 11px;
        font-family: monospace;
        color: #38bdf8;
      }
      .svi-color-preview-circle {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.3);
      }

      /* 高级折叠面板 Accordion */
      .svi-accordion {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        overflow: hidden;
      }
      .svi-accordion-header {
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.03);
        user-select: none;
        transition: background 0.15s ease;
      }
      .svi-accordion-header:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .svi-accordion-title {
        font-size: 12px;
        font-weight: 600;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .svi-accordion-icon {
        font-size: 11px;
        color: #64748b;
        transition: transform 0.2s ease;
      }
      .svi-accordion.open .svi-accordion-icon {
        transform: rotate(90deg);
        color: #38bdf8;
      }
      .svi-accordion-content {
        display: none;
        padding: 12px;
        flex-direction: column;
        gap: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .svi-accordion.open .svi-accordion-content {
        display: flex;
      }
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const el = document.createElement('style');
      el.textContent = css;
      const styleRoot = document.head || document.documentElement;
      if (styleRoot) styleRoot.appendChild(el);
    }
  }

  // ==========================================
  // 6. 主视频探针 (VideoProbeManager)
  // ==========================================
  class VideoProbeManager {
    constructor() {
      this.currentVideo = null;
      this.observers = [];
      this.initObserver();
    }

    initObserver() {
      const observer = new MutationObserver(() => {
        this.updateActiveVideo();
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      this.observers.push(observer);
    }

    findBestVideo() {
      const allVideos = Array.from(document.querySelectorAll('video'));
      if (!allVideos.length) return null;

      let best = null;
      let highestScore = -1;

      for (const v of allVideos) {
        const rect = v.getBoundingClientRect();
        if (rect.width < 220 || rect.height < 140) continue;

        let score = rect.width * rect.height;
        if (!v.paused && !v.ended && v.currentTime > 0) {
          score += 20000000;
        }
        if (rect.top >= -50 && rect.bottom <= window.innerHeight + 50) {
          score += 1000000;
        }

        if (score > highestScore) {
          highestScore = score;
          best = v;
        }
      }

      return best || allVideos[0];
    }

    updateActiveVideo() {
      const candidate = this.findBestVideo();
      if (candidate !== this.currentVideo) {
        if (this.currentVideo) {
          this.currentVideo.style.removeProperty('filter');
          this.currentVideo.style.removeProperty('transition');
        }
        this.currentVideo = candidate;
        if (this.currentVideo && runtime.invertActive) {
          this.applyFilterToCurrent();
        }
      }
      return this.currentVideo;
    }

    applyFilterToCurrent() {
      if (!this.currentVideo) return;
      const filterString = getActiveFilter();
      const transitionVal = (state.transitionMs && state.transitionMs > 0)
        ? `filter ${state.transitionMs}ms cubic-bezier(0.4, 0, 0.2, 1)`
        : 'none';

      this.currentVideo.style.setProperty('transition', transitionVal, 'important');
      if (runtime.invertActive) {
        this.currentVideo.style.setProperty('filter', filterString, 'important');
      } else {
        this.currentVideo.style.removeProperty('filter');
      }
    }
  }

  // ==========================================
  // 7. 离屏极速采样检测器 (LuminanceDetector - < 5ms 无感优化)
  // ==========================================
  class LuminanceDetector {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 16;
      this.canvas.height = 16;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.isCorsRestricted = false;
      this.lastDurationMs = 0;
    }

    detect(video) {
      if (!video || video.paused || video.ended || video.readyState < 2) {
        return null;
      }
      if (this.isCorsRestricted) {
        return null;
      }

      const t0 = performance.now();

      try {
        this.ctx.drawImage(video, 0, 0, 16, 16);
        const imgData = this.ctx.getImageData(0, 0, 16, 16);
        const data = imgData.data;
        const totalPixels = 256; // 16 * 16

        let whitePixelCount = 0;
        let nonWhiteCount = 0;
        let totalSaturation = 0;

        const thresholdRatio = (state.whiteThreshold || 60) / 100;
        const lumCutoff = state.lumThreshold || 210;
        const maxNonWhiteAllowed = Math.floor(totalPixels * (1 - thresholdRatio));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // ITU-R BT.601 快速整数定点位运算明度
          const lum = (r * 77 + g * 150 + b * 29) >> 8;
          if (lum >= lumCutoff) {
            whitePixelCount++;
          } else {
            nonWhiteCount++;
            if (nonWhiteCount > maxNonWhiteAllowed) {
              this.lastDurationMs = performance.now() - t0;
              return {
                scene: 'normal',
                whiteRatio: whitePixelCount / totalPixels,
                durationMs: this.lastDurationMs,
              };
            }
          }

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          totalSaturation += max === 0 ? 0 : (max - min) / max;
        }

        const whiteRatio = whitePixelCount / totalPixels;
        const avgSaturation = totalSaturation / totalPixels;

        const isWhiteSlide = whiteRatio >= thresholdRatio && avgSaturation <= 0.22;
        this.lastDurationMs = performance.now() - t0;

        return {
          scene: isWhiteSlide ? 'white_slide' : 'normal',
          whiteRatio,
          avgSaturation,
          durationMs: this.lastDurationMs,
        };
      } catch (err) {
        if (err.name === 'SecurityError' || (err.message && err.message.includes('tainted'))) {
          this.isCorsRestricted = true;
          console.info('[SmartInvert] Video is cross-origin restricted. Falling back to manual mode.');
        }
        return null;
      }
    }
  }

  // ==========================================
  // 8. 无对抗人机协同状态机 (HILStateMachine) —— 视频状态仅存 runtime (标签页隔离)
  // ==========================================
  class HILStateMachine {
    constructor(probe, detector, ui) {
      this.probe = probe;
      this.detector = detector;
      this.ui = ui;
      this.timer = null;
      this.startLoop();
    }

    startLoop() {
      if (this.timer) clearTimeout(this.timer);
      const run = () => {
        this.tick();
        const interval = state.sampleIntervalMs || 250;
        this.timer = setTimeout(run, interval);
      };
      this.timer = setTimeout(run, state.sampleIntervalMs || 250);
    }

    tick() {
      if (!this.probe) return;
      const profile = getSiteProfile();
      if (profile.enabled === false || profile.videoInvert === false) return;

      // 页面隐藏时暂停视频采样, 节省后台资源
      if (document.hidden) return;

      const video = this.probe.updateActiveVideo();
      if (!video) return;

      if (!state.autoDetect || profile.disableVideoAuto || (this.detector && this.detector.isCorsRestricted)) {
        this.ui && this.ui.updateStatusBadge();
        return;
      }
      if (!this.detector) return;

      const result = this.detector.detect(video);
      if (!result) {
        this.ui && this.ui.updateStatusBadge();
        return;
      }

      const newScene = result.scene;

      if (newScene !== runtime.currentDetectedScene) {
        runtime.currentDetectedScene = newScene;
        if (runtime.userRejectedScene && runtime.userRejectedScene !== newScene) {
          runtime.userRejectedScene = null;
        }
      }

      if (newScene === 'white_slide') {
        runtime.normalSceneCount = 0;
        if (runtime.userRejectedScene === 'white_slide') {
          this.ui && this.ui.updateStatusBadge();
          return;
        }
        if (!runtime.invertActive) {
          runtime.invertActive = true;
          this.probe.applyFilterToCurrent();
          this.ui && this.ui.syncVisuals();
          StatsManager.count('videoAutoActivations');
          StatsManager.record('video-auto', 'white_slide 激活');
        }
      } else {
        runtime.normalSceneCount++;
        if (runtime.userRejectedScene === 'normal') {
          this.ui && this.ui.updateStatusBadge();
          return;
        }
        const hysteresisMs = state.exitHysteresisMs || 1500;
        const exitTicks = Math.max(2, Math.round(hysteresisMs / (state.sampleIntervalMs || 250)));
        if (runtime.invertActive && runtime.normalSceneCount >= exitTicks) {
          runtime.invertActive = false;
          this.probe.applyFilterToCurrent();
          this.ui && this.ui.syncVisuals();
          StatsManager.record('video-auto', '恢复 normal 画面');
        }
      }

      this.ui && this.ui.updateStatusBadge();
    }

    onUserToggleInvert() {
      const profile = getSiteProfile();
      if (profile.videoInvert === false) {
        showToast('本站已禁用视频反色');
        return;
      }
      runtime.invertActive = !runtime.invertActive;
      runtime.userRejectedScene = runtime.currentDetectedScene;
      this.probe && this.probe.applyFilterToCurrent();
      this.ui && this.ui.syncVisuals();
      // 视频反色状态仅存内存 (标签页隔离), 绝不写库
    }

    onUserToggleAuto() {
      state.autoDetect = !state.autoDetect;
      runtime.userRejectedScene = null;
      runtime.normalSceneCount = 0;
      this.ui && this.ui.syncVisuals();
      savePrefs();
    }

    onUserSelectPreset(presetId) {
      if (PRESETS[presetId]) {
        state.presetId = presetId;
        state.brightness = PRESETS[presetId].brightness;
        state.contrast = PRESETS[presetId].contrast;
        state.saturate = PRESETS[presetId].saturate;
        state.hueRotate = PRESETS[presetId].hueRotate;
      }
      updateImageFilterCss();
      if (runtime.invertActive) {
        this.probe && this.probe.applyFilterToCurrent();
      }
      this.ui && this.ui.syncVisuals();
      if (this.ui && this.ui.modalControls) this.ui.modalControls.syncAll();
      savePrefs();
    }

    onCustomParamChange() {
      state.presetId = 'custom';
      updateImageFilterCss();
      if (runtime.invertActive) {
        this.probe && this.probe.applyFilterToCurrent();
      }
      this.ui && this.ui.syncVisuals();
      savePrefs();
    }

    onUpdateTransition(ms) {
      state.transitionMs = ms;
      updateImageFilterCss();
      this.probe && this.probe.applyFilterToCurrent();
      savePrefs();
    }

    onUpdateInterval(ms) {
      state.sampleIntervalMs = ms;
      this.startLoop();
      savePrefs();
    }

    resetDefaults() {
      Object.assign(state, JSON.parse(JSON.stringify(DEFAULT_PREFS)));
      savePrefs();
      updateImageFilterCss();
      this.onUpdateInterval(state.sampleIntervalMs);
      this.probe && this.probe.applyFilterToCurrent();
      this.ui && this.ui.syncVisuals();
      if (this.ui && this.ui.modalControls) this.ui.modalControls.syncAll();
      // 背景替换引擎与重置后的站点档案重新对齐 (防止按钮显示"关"而引擎仍在运行)
      try { applyBackgroundReplace(getSiteProfile().bgReplace === true); } catch (e) { /* ignore */ }
    }
  }

  // ==========================================
  // 9. 图片像素分析与解码链 (star-history/camo 跨域修复核心)
  // ==========================================
  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      const gmXhr = (typeof GM_xmlhttpRequest === 'function')
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest : null);

      if (gmXhr) {
        gmXhr({
          method: 'GET',
          url: url,
          responseType: 'blob',
          timeout: 8000,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300 && res.response) {
              resolve(res.response);
            } else {
              reject(new Error(`GM_xhr HTTP ${res.status}`));
            }
          },
          onerror: (err) => reject(err),
          ontimeout: () => reject(new Error('GM_xhr timeout'))
        });
        return;
      }

      if (typeof fetch === 'function') {
        fetch(url, { mode: 'cors' })
          .then((r) => {
            if (!r.ok) throw new Error(`fetch HTTP ${r.status}`);
            return r.blob();
          })
          .then(resolve)
          .catch(reject);
        return;
      }

      reject(new Error('No network fetcher available'));
    });
  }

  function evaluateImagePixels(data, s = state) {
    const lumCutoff = s.imgLumCutoff || 180;
    const areaThreshold = (s.imgAreaThreshold || 48) / 100;
    const toleranceSq = ((s.imgTolerance || 35) * 2.55) ** 2;
    const generalLight = s.imgGeneralLight !== false;

    const activePresets = [];
    if (s.imgPresets) {
      for (const p of IMG_COLOR_PRESETS) {
        if (s.imgPresets[p.id]) {
          activePresets.push(p.rgb);
        }
      }
    }
    const customRgb = s.imgCustomColor ? hexToRgb(s.imgCustomColor) : null;
    const shieldRgb = parseShieldColors(s.shieldColors);

    let lightCount = 0;
    let opaqueCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 64) continue; // 忽略透明像素
      opaqueCount++;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 原色屏蔽: 命中屏蔽列表的像素永不参与浅色判定
      if (shieldRgb.length) {
        let shielded = false;
        for (let si = 0; si < shieldRgb.length; si++) {
          const sc = shieldRgb[si];
          if (Math.abs(r - sc[0]) <= 24 && Math.abs(g - sc[1]) <= 24 && Math.abs(b - sc[2]) <= 24) {
            shielded = true;
            break;
          }
        }
        if (shielded) continue;
      }

      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;

      let isLight = false;

      // 1. 全浅色通用自适应
      if (generalLight && lum >= lumCutoff && sat <= 0.38) {
        isLight = true;
      } else {
        // 2. 匹配预设色卡
        for (let j = 0; j < activePresets.length; j++) {
          const p = activePresets[j];
          const d2 = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
          if (d2 <= toleranceSq) {
            isLight = true;
            break;
          }
        }
        // 3. 匹配自定义色图选色
        if (!isLight && customRgb) {
          const d2 = (r - customRgb[0]) ** 2 + (g - customRgb[1]) ** 2 + (b - customRgb[2]) ** 2;
          if (d2 <= toleranceSq) {
            isLight = true;
          }
        }
      }

      if (isLight) lightCount++;
    }

    if (opaqueCount < 8) return false;
    return (lightCount / opaqueCount) >= areaThreshold;
  }

  // 将任意可绘制对象 (img/video/bitmap) 采样为像素数据; 跨域污染时抛错
  function sampleDrawable(drawable, size = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(drawable, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    let opaqueCount = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] >= 64) opaqueCount++;
    }
    return { data: d, opaqueCount };
  }

  // blob 解码: createImageBitmap (独立 try/catch) 失败时, 临时 <img> + objectURL 兜底 —— star-history/camo 修复核心
  async function decodeBlobSample(blob, size = 16) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let decoded = false;
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob);
        try {
          ctx.drawImage(bitmap, 0, 0, size, size);
          decoded = true;
        } finally {
          if (bitmap && typeof bitmap.close === 'function') bitmap.close();
        }
      } catch (e) {
        // Chrome 对很多 SVG blob (尤其是无固有尺寸的) 会拒绝 createImageBitmap,
        // 这里必须吞掉异常, 让下方临时 <img> 解码链继续执行
        decoded = false;
      }
    }

    if (!decoded) {
      const objUrl = URL.createObjectURL(blob);
      try {
        const tempImg = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('Temp img decode failed'));
          im.src = objUrl;
        });
        ctx.drawImage(tempImg, 0, 0, size, size);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }

    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    let opaqueCount = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] >= 64) opaqueCount++;
    }
    return { data: d, opaqueCount };
  }

  // 统一解码链: 本地采样 → 跨域污染或空白采样 (SVG/alpha 嫌疑) → blob 回退 (GM/fetch → 嵌套解码)
  async function analyzeSrc(src, drawable, prefsState = state) {
    let sample = null;
    if (drawable) {
      try {
        sample = sampleDrawable(drawable, 8);
      } catch (e) {
        sample = null; // SecurityError / tainted canvas
      }
    }

    if (sample && sample.opaqueCount >= 8) {
      return { ok: true, isLight: evaluateImagePixels(sample.data, prefsState), viaFallback: false };
    }

    StatsManager.count('taintFallbacks');
    try {
      const blob = await gmFetchBlob(src);
      const s16 = await decodeBlobSample(blob, 16);
      if (s16.opaqueCount < 8) return { ok: false };
      return { ok: true, isLight: evaluateImagePixels(s16.data, prefsState), viaFallback: true };
    } catch (e) {
      return { ok: false };
    }
  }

  // 智能小元素屏蔽判定 (p0, 纯函数, 输入为普通对象便于单测)
  function classifySmallElement(info) {
    const w = info.w | 0;
    const h = info.h | 0;
    const maxDim = Math.max(w, h);

    // 1. 元数据图标特征 (头像/表情/验证码等) → 跳过; 例外: 正文上下文且渲染尺寸 ≥ 48px
    if (META_ICON_RE.test(info.meta || '') && !(info.isContentContext && maxDim >= 48)) {
      return { skip: true, reason: 'meta-icon' };
    }

    // 2. 小尺寸 + (同 src 重复 ≥ 3 次 或 处于导航/页头/图标等页面骨架上下文) → 跳过
    if (w > 0 && h > 0 && maxDim < 96) {
      const repeated = (info.srcOccurrences | 0) >= 3;
      const chrome = !info.isContentContext && !!info.isChromeContext;
      if (repeated) return { skip: true, reason: 'repeated-small' };
      if (chrome) return { skip: true, reason: 'chrome-small' };
    }

    // 3. 尺寸硬门槛 (正文上下文也不豁免)
    if ((w > 0 && w < 24) || (h > 0 && h < 24)) {
      return { skip: true, reason: 'tiny' };
    }
    const min = info.minImgSize || 48;
    if (w > 0 && h > 0 && w < min && h < min) {
      return { skip: true, reason: 'below-min' };
    }

    return { skip: false, reason: 'ok' };
  }

  // 从真实 img 元素构建 classifySmallElement 的输入
  function buildClassifyInfo(img, srcCountMap) {
    const src = img.currentSrc || img.src || '';
    let meta = '';
    try {
      meta = ((img.className || '') + ' ' + (img.id || '') + ' ' + (img.alt || '') + ' ' + (img.getAttribute('role') || '')).toLowerCase();
    } catch (e) { /* ignore */ }

    const w = img.clientWidth || img.naturalWidth || img.width || 0;
    const h = img.clientHeight || img.naturalHeight || img.height || 0;

    let isContent = false;
    let isChrome = false;
    try { isContent = !!(img.closest && img.closest(CONTENT_CONTEXT_SELECTOR)); } catch (e) { /* ignore */ }
    try { isChrome = !!(img.closest && img.closest(CHROME_CONTEXT_SELECTOR)); } catch (e) { /* ignore */ }

    return {
      w: w || 0,
      h: h || 0,
      meta,
      srcOccurrences: (src && srcCountMap && srcCountMap.get(src)) || (src ? 1 : 0),
      isContentContext: isContent,
      isChromeContext: isChrome,
      minImgSize: state.minImgSize || 48,
    };
  }

  // 合并站点级原色屏蔽后的求值偏好快照
  function getEvalPrefs() {
    const profile = getSiteProfile();
    if (profile.shieldColors && profile.shieldColors.length) {
      return Object.assign({}, state, { shieldColors: profile.shieldColors });
    }
    return state;
  }

  // ==========================================
  // 10. 网页图片与矢量图智能反色引擎 (ImageInvertEngine)
  // ==========================================
  class ImageInvertEngine {
    constructor() {
      this.observer = null;
      this.cache = new Map();
      this.maxCacheSize = 1000;
      this.srcCount = new Map();      // 同 src 重复计数 (小元素重复判定), 上限 500
      this.pendingMutNodes = new Set();
      this.mutTimer = null;
      this.init();
      this.bindManualToggle();
      window.__svi_image_engine = this;
    }

    getCleanCanvas(size = 8) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      return canvas;
    }

    init() {
      if (typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target;
            this.observer.unobserve(target);
            if (target.tagName === 'IMG') {
              this.processImage(target);
            } else if (target.tagName && target.tagName.toLowerCase() === 'svg') {
              this.processSvg(target);
            }
          }
        });
      }, { rootMargin: '300px' });

      this.scanAll();

      const mo = new MutationObserver((mutations) => {
        // 变更记录先合并去重, ≤100ms 后批量处理 (性能: 避免高频 DOM 抖动逐条扫描)
        for (const m of mutations) {
          if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                this.pendingMutNodes.add(node);
              }
            }
          } else if (m.type === 'attributes') {
            const node = m.target;
            if (node && node.nodeType === 1) {
              this.pendingMutNodes.add(node);
            }
          }
        }
        if (this.pendingMutNodes.size) {
          clearTimeout(this.mutTimer);
          this.mutTimer = setTimeout(() => this.flushMutations(), 100);
        }
      });

      mo.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'data-src', 'data-original']
      });
    }

    flushMutations() {
      if (document.hidden) {
        // 页面隐藏时挂起, 稍后重试
        this.mutTimer = setTimeout(() => this.flushMutations(), 1000);
        return;
      }
      const nodes = Array.from(this.pendingMutNodes);
      this.pendingMutNodes.clear();
      for (const node of nodes) {
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (tag === 'img' || tag === 'svg') {
          this.observe(node);
        } else if (node.querySelectorAll) {
          try {
            node.querySelectorAll('img, svg').forEach((el) => this.observe(el));
          } catch (e) { /* ignore */ }
        }
      }
      this.refreshSrcCounts();
    }

    // 同 src 重复计数: 每次全量重算 (不可累加, 否则动态页面多次刷新后计数虚高,
    // 会把正常小图误判为"重复贴图"而跳过反色); 上限 500 条防止超大页面无界增长
    refreshSrcCounts() {
      const root = document.body || document.documentElement;
      if (!root || !root.querySelectorAll) return;
      const next = new Map();
      try {
        root.querySelectorAll('img').forEach((img) => {
          const s = img.currentSrc || img.src;
          if (s) next.set(s, (next.get(s) || 0) + 1);
        });
      } catch (e) { /* ignore */ }
      if (next.size > 500) {
        const trimmed = new Map();
        let n = 0;
        for (const entry of next) {
          if (n++ >= 500) break;
          trimmed.set(entry[0], entry[1]);
        }
        this.srcCount = trimmed;
        return;
      }
      this.srcCount = next;
    }

    scanAll() {
      const root = document.body || document.documentElement;
      if (!root) return;
      this.refreshSrcCounts();
      try {
        root.querySelectorAll('img, svg').forEach((el) => this.observe(el));
      } catch (e) { /* ignore */ }
    }

    clearCacheAndRescan() {
      this.cache.clear();
      const bg = window.__svi && window.__svi.engines ? window.__svi.engines.bgImage : null;
      if (bg && bg.cache) bg.cache.clear();
      const root = document.body || document.documentElement;
      if (!root) return;
      try {
        root.querySelectorAll('img, svg').forEach((el) => {
          el.removeAttribute('data-svi-checked-src');
          el.removeAttribute('data-svi-checked');
          this.observe(el);
        });
      } catch (e) { /* ignore */ }
      this.scanAll();
    }

    observe(el) {
      if (!this.observer || !el) return;
      if (el.tagName === 'IMG') {
        const src = el.currentSrc || el.src;
        if (src && el.getAttribute('data-svi-checked-src') === src) return;
      }
      this.observer.observe(el);
    }

    bindManualToggle() {
      document.addEventListener('click', (e) => {
        if (e.altKey) {
          const target = e.target.closest('img, svg');
          if (target) {
            e.preventDefault();
            e.stopPropagation();
            const isCurrentlyInverted = target.getAttribute('data-svi-inverted') === 'true';
            if (isCurrentlyInverted) {
              target.removeAttribute('data-svi-inverted');
              showToast('已恢复原色 (Alt+点击)');
            } else {
              target.setAttribute('data-svi-inverted', 'true');
              showToast('已手动反色 (Alt+点击)');
            }
            // 持久化手动覆盖记忆 (host|src → 决策), 下次访问自动应用
            const src = target.currentSrc || target.src || target.getAttribute('data-src') || '';
            if (src) {
              addManualOverride(state.manualOverrides, manualOverrideKey(location.hostname, src), isCurrentlyInverted ? 'restore' : 'invert', 400);
              savePrefs();
            }
          }
        }
      }, true);
    }

    processSvg(svg) {
      if (svg.hasAttribute('data-svi-checked')) return;
      svg.setAttribute('data-svi-checked', 'true');

      const w = svg.clientWidth || svg.width?.baseVal?.value || 0;
      const h = svg.clientHeight || svg.height?.baseVal?.value || 0;
      if (w < 24 || h < 24) return;

      const meta = ((svg.className?.baseVal || '') + ' ' + (svg.id || '')).toLowerCase();
      if (/(avatar|emoji|spin|loader)/.test(meta)) return;

      const rect = svg.querySelector('rect:first-child');
      if (rect) {
        const fill = (rect.getAttribute('fill') || '').toLowerCase();
        if (fill === '#fff' || fill === '#ffffff' || fill === 'white' || fill === 'rgb(255,255,255)') {
          svg.setAttribute('data-svi-inverted', 'true');
          return;
        }
      }

      if (window.getComputedStyle) {
        const styleBg = window.getComputedStyle(svg).backgroundColor;
        if (styleBg === 'rgb(255, 255, 255)' || styleBg === '#fff' || styleBg === '#ffffff') {
          svg.setAttribute('data-svi-inverted', 'true');
        }
      }
    }

    async processImage(img) {
      const src = img.currentSrc || img.src;
      if (!src) return;

      if (img.getAttribute('data-svi-checked-src') === src) return;

      // 失败 TTL 标记: 60s 内不重复尝试 (网络失败优雅降级)
      const failedTs = parseInt(img.getAttribute('data-svi-failed') || '0', 10);
      if (failedTs && Date.now() - failedTs < 60000) return;

      const profile = getSiteProfile();
      if (state.imageInvert === false || profile.enabled === false || profile.imageInvert === false) return;

      // 1. 手动覆盖记忆最高优先 (Alt+点击 的持久化决策)
      const ov = state.manualOverrides[manualOverrideKey(location.hostname, src)];
      if (ov === 'invert' || ov === 'restore') {
        img.setAttribute('data-svi-checked-src', src);
        if (ov === 'invert') {
          img.setAttribute('data-svi-inverted', 'true');
        } else {
          img.removeAttribute('data-svi-inverted');
        }
        return;
      }

      // 2. 站点规则保护选择器 (头像/图标/播放器内部等永不反色)
      if (safeMatches(img, profile.protect)) {
        img.setAttribute('data-svi-checked-src', src);
        return;
      }

      // 3. favicon 类直接跳过
      if (/\.(ico|cur)(\?.*)?$/i.test(src)) {
        img.setAttribute('data-svi-checked-src', src);
        return;
      }

      // 4. 智能小元素屏蔽 (p0: 图标/徽章/重复贴图永不自动反色)
      const verdict = classifySmallElement(buildClassifyInfo(img, this.srcCount));
      if (verdict.skip) {
        img.setAttribute('data-svi-checked-src', src);
        return;
      }

      // 5. 站点规则强制反色选择器 (GitHub markdown/camo 等)
      if (safeMatches(img, profile.forceInvert)) {
        img.setAttribute('data-svi-checked-src', src);
        if (this.cache.size >= this.maxCacheSize) {
          this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(src, true);
        img.setAttribute('data-svi-inverted', 'true');
        StatsManager.count('imagesInverted');
        return;
      }

      const runCheck = async () => {
        if (img.getAttribute('data-svi-checked-src') === src) return;
        img.setAttribute('data-svi-checked-src', src);

        if (this.cache.has(src)) {
          if (this.cache.get(src)) {
            img.setAttribute('data-svi-inverted', 'true');
          } else {
            img.removeAttribute('data-svi-inverted');
          }
          return;
        }

        const r = await analyzeSrc(src, img, getEvalPrefs());
        if (!r.ok) {
          // 网络或格式异常: 不设 checked-src (视为未决), 记录失败 TTL 防抖
          img.removeAttribute('data-svi-checked-src');
          img.setAttribute('data-svi-failed', String(Date.now()));
          return;
        }

        if (this.cache.size >= this.maxCacheSize) {
          this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(src, r.isLight);
        StatsManager.count('imagesAnalyzed');

        if (r.isLight) {
          img.setAttribute('data-svi-inverted', 'true');
          StatsManager.count('imagesInverted');
        } else {
          img.removeAttribute('data-svi-inverted');
        }
      };

      if (img.complete && img.naturalWidth > 0) {
        await runCheck();
      } else {
        img.addEventListener('load', () => runCheck(), { once: true });
      }
    }
  }

  // ==========================================
  // 11. 背景图反色引擎 (BgImageEngine - B站评论缩略图等 background-image 元素)
  // ==========================================
  class BgImageEngine {
    constructor() {
      this.cache = new Map();       // url → isLight (每 URL 缓存)
      this.failed = new Map();      // url → 失败时间戳 (TTL 60s)
      this.waitingEls = new Map();  // url → 等待判定结果的元素集合 (判定后立即回填)
      this.inflight = new Set();
      this.elLastUrl = new WeakMap();
      this.pendingNodes = new Set();
      this.flushTimer = null;
      this.sweepTimer = null;
      this.lastSweep = 0;
      this.init();
    }

    candidateSelector() {
      const parts = ['[style*="background"]'];
      const profile = getSiteProfile();
      if (profile && Array.isArray(profile.bgImageSelectors)) {
        for (const sel of profile.bgImageSelectors) {
          if (sel && typeof sel === 'string') parts.push(sel);
        }
      }
      return parts.join(',');
    }

    init() {
      try {
        this.mo = new MutationObserver((records) => this.onMutations(records));
        this.mo.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style']
        });
      } catch (e) { /* ignore */ }
      this.scheduleSweep();
    }

    onMutations(records) {
      for (const m of records) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) this.pendingNodes.add(node);
          }
        } else if (m.type === 'attributes') {
          if (m.target && m.target.nodeType === 1) this.pendingNodes.add(m.target);
        }
      }
      if (this.pendingNodes.size) {
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => this.flushPending(), 100); // ≤100ms 合并处理
      }
    }

    flushPending() {
      if (document.hidden) {
        this.flushTimer = setTimeout(() => this.flushPending(), 1500);
        return;
      }
      const nodes = Array.from(this.pendingNodes);
      this.pendingNodes.clear();
      let sel = '';
      try { sel = this.candidateSelector(); } catch (e) { return; }
      for (const node of nodes) {
        try {
          if (sel && node.matches && node.matches(sel)) this.processEl(node);
          if (sel && node.querySelectorAll) node.querySelectorAll(sel).forEach((el) => this.processEl(el));
        } catch (e) { /* ignore */ }
      }
    }

    scheduleSweep() {
      requestIdle(() => this.tick(), 1500);
    }

    tick() {
      if (!document.body) return; // 页面未就绪或已离开
      if (!document.hidden) this.sweep();
      this.sweepTimer = setTimeout(() => this.tick(), 5000); // 每 5s 至多一次
    }

    sweep() {
      const now = Date.now();
      if (now - this.lastSweep < 4500) return;
      this.lastSweep = now;
      let sel = '';
      try { sel = this.candidateSelector(); } catch (e) { return; }
      if (!sel) return;
      let els = [];
      try { els = document.body.querySelectorAll(sel); } catch (e) { return; }
      const cap = Math.min(els.length, 1500); // 全量扫描元素预算
      for (let i = 0; i < cap; i++) {
        this.processEl(els[i]);
      }
    }

    processEl(el) {
      if (!el || el.nodeType !== 1) return;
      const profile = getSiteProfile();
      if (state.imageInvert === false || profile.enabled === false || profile.imageInvert === false) return;

      // 元素门槛: 渲染尺寸 ≥ 32×32
      const w = el.clientWidth || 0;
      const h = el.clientHeight || 0;
      if (w > 0 && h > 0 && (w < 32 || h < 32)) return;

      let bg = '';
      try {
        bg = window.getComputedStyle(el).backgroundImage || '';
      } catch (e) {
        return;
      }
      if (!bg || bg.indexOf('url(') === -1) return;

      const urls = extractCssUrls(bg);
      if (!urls.length) return;

      for (const raw of urls) {
        let abs = raw;
        try { abs = new URL(raw, location.href).href; } catch (e) { continue; }
        if (/^data:/i.test(abs)) continue;
        if (this.elLastUrl.get(el) === abs) return; // 该元素此 URL 已处理过

        const decision = this.decideUrl(abs);
        if (decision === null) {
          // 未知 (分析中/失败): 挂起等待, 判定落定后立即回填
          if (!this.waitingEls.has(abs)) this.waitingEls.set(abs, new Set());
          this.waitingEls.get(abs).add(el);
          continue;
        }

        this.elLastUrl.set(el, abs);
        if (decision === true) {
          el.setAttribute('data-svi-bginv', 'true');
        } else {
          el.removeAttribute('data-svi-bginv');
        }
        return; // 只采用第一个可判定的 url
      }
    }

    decideUrl(url) {
      // 手动覆盖记忆优先 (host|url)
      const ov = state.manualOverrides[manualOverrideKey(location.hostname, url)];
      if (ov === 'invert') return true;
      if (ov === 'restore') return false;

      if (this.cache.has(url)) return this.cache.get(url);

      const failedAt = this.failed.get(url) || 0;
      if (failedAt && Date.now() - failedAt < 60000) return null;
      if (this.inflight.has(url)) return null;

      this.inflight.add(url);
      this.loadAndAnalyze(url)
        .then((isLight) => {
          this.inflight.delete(url);
          const waiters = this.waitingEls.get(url);
          this.waitingEls.delete(url);
          if (isLight === null) {
            this.failed.set(url, Date.now());
            return;
          }
          if (this.cache.size >= 800) {
            this.cache.delete(this.cache.keys().next().value);
          }
          this.cache.set(url, isLight);
          if (isLight) StatsManager.count('bgImagesInverted');
          if (waiters) {
            for (const el of waiters) {
              try { this.processEl(el); } catch (e) { /* ignore */ }
            }
          }
        })
        .catch(() => {
          this.inflight.delete(url);
          this.waitingEls.delete(url);
          this.failed.set(url, Date.now());
        });
      return null;
    }

    async loadAndAnalyze(url) {
      let drawable = null;
      try {
        drawable = await loadImageEl(url, 8000);
      } catch (e) {
        return null;
      }
      const r = await analyzeSrc(url, drawable, getEvalPrefs());
      return r.ok ? r.isLight : null;
    }
  }

  // ==========================================
  // 12. 背景替换引擎 (BackgroundReplaceEngine - 163 等浅色站点, 登录块原样保护)
  // ==========================================
  class BackgroundReplaceEngine {
    constructor() {
      this.active = false;
      this.activatedOnce = false;
      this.scanGen = 0;
      this.profile = null;
      this.bucketsBg = new Map(); // 色桶 key → 映射后 [r,g,b]
      this.bucketsFg = new Map();
      this.bucketsBd = new Map();
      this.shieldRgb = [];
      this.exclusionSelector = LOGIN_SELECTORS.join(',');
      this.pendingRoots = new Set();
      this.rescanTimer = null;
      this.styleNode = null;
      this.initObserver();
    }

    initObserver() {
      try {
        this.mo = new MutationObserver((records) => this.onMutations(records));
        this.mo.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
        });
      } catch (e) { /* ignore */ }
    }

    onMutations(records) {
      if (!this.active) return;
      let added = 0;
      for (const m of records) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              this.pendingRoots.add(node);
              added++;
            }
          }
        }
      }
      if (added) {
        clearTimeout(this.rescanTimer);
        this.rescanTimer = setTimeout(() => this.flushPendingRoots(), 800); // 防抖重扫新增子树
      }
    }

    flushPendingRoots() {
      if (!this.active) return;
      if (document.hidden) {
        this.rescanTimer = setTimeout(() => this.flushPendingRoots(), 1500);
        return;
      }
      const roots = Array.from(this.pendingRoots);
      this.pendingRoots.clear();
      let processed = 0;
      for (const root of roots) {
        if (processed >= 2000) break;
        try {
          processed += this.processSubtree(root, 2000 - processed);
        } catch (e) { /* ignore */ }
      }
      if (processed) this.applyCss();
    }

    buildExclusionSelector(profile) {
      const parts = LOGIN_SELECTORS.slice();
      if (profile && Array.isArray(profile.excludeSelectors)) parts.push(...profile.excludeSelectors);
      if (Array.isArray(state.bgExcludeSelectors)) parts.push(...state.bgExcludeSelectors);
      parts.push('.svi-capsule-root', '.svi-modal-mask', '#svi-toast');
      const valid = [];
      for (const p of parts) {
        try {
          document.querySelector(p);
          valid.push(p);
        } catch (e) { /* 非法选择器跳过 */ }
      }
      return valid.join(',') || '.svi-capsule-root';
    }

    isExcluded(el) {
      if (this.exclusionSelector) {
        try {
          if (el.closest(this.exclusionSelector)) return true;
        } catch (e) { /* ignore */ }
      }
      return false;
    }

    activate(profile) {
      this.profile = profile || getSiteProfile();
      this.exclusionSelector = this.buildExclusionSelector(this.profile);
      this.shieldRgb = parseShieldColors(this.profile.shieldColors);
      if (!this.activatedOnce) {
        this.activatedOnce = true;
        StatsManager.count('bgReplacePages');
        StatsManager.record('bgreplace-on', '本页激活');
      }
      this.active = true;
      document.documentElement.setAttribute('data-svi-bgr-on', '');
      this.startScan();
    }

    deactivate() {
      this.active = false;
      this.scanGen++;
      try {
        document.documentElement.removeAttribute('data-svi-bgr-on');
        if (this.styleNode && this.styleNode.parentNode) {
          this.styleNode.parentNode.removeChild(this.styleNode);
        }
        this.styleNode = null;
        document.querySelectorAll('[data-svi-bgr-bg],[data-svi-bgr-fg],[data-svi-bgr-bd]').forEach((el) => {
          el.removeAttribute('data-svi-bgr-bg');
          el.removeAttribute('data-svi-bgr-fg');
          el.removeAttribute('data-svi-bgr-bd');
        });
      } catch (e) { /* ignore */ }
      this.bucketsBg.clear();
      this.bucketsFg.clear();
      this.bucketsBd.clear();
    }

    rescan() {
      if (!this.active) return;
      try {
        document.querySelectorAll('[data-svi-bgr-bg],[data-svi-bgr-fg],[data-svi-bgr-bd]').forEach((el) => {
          el.removeAttribute('data-svi-bgr-bg');
          el.removeAttribute('data-svi-bgr-fg');
          el.removeAttribute('data-svi-bgr-bd');
        });
      } catch (e) { /* ignore */ }
      this.bucketsBg.clear();
      this.bucketsFg.clear();
      this.bucketsBd.clear();
      this.startScan();
    }

    // 空闲分片全量扫描: 每片 400 元素, 整页预算 4000, 隐藏时暂停
    startScan() {
      if (!document.body) return;
      const gen = ++this.scanGen;
      let els = [];
      try {
        // 包含 html/body 自身 (body 的浅色背景是页面底色, 必须参与替换)
        els = [document.documentElement, document.body, ...Array.from(document.body.querySelectorAll('*'))];
      } catch (e) {
        return;
      }
      let i = 0;
      let processed = 0;
      const BUDGET = 4000;
      const CHUNK = 400;
      const step = () => {
        if (gen !== this.scanGen || !this.active) return;
        if (document.hidden) {
          requestIdle(step, 1000);
          return;
        }
        let n = 0;
        while (i < els.length && n < CHUNK && processed < BUDGET) {
          const el = els[i++];
          try {
            if (!BGR_SKIP_TAGS_RE.test(el.tagName) && !this.isExcluded(el)) {
              this.tagElement(el);
            }
          } catch (e) { /* ignore */ }
          n++;
          processed++;
        }
        this.applyCss();
        if (i < els.length && processed < BUDGET) {
          requestIdle(step, 1000);
        }
      };
      requestIdle(step, 1000);
    }

    // 增量子树扫描 (MutationObserver 防抖后调用)
    processSubtree(root, budget) {
      let count = 0;
      const tryTag = (el) => {
        if (count >= budget) return;
        if (BGR_SKIP_TAGS_RE.test(el.tagName)) return;
        if (el.hasAttribute('data-svi-bgr-bg') || el.hasAttribute('data-svi-bgr-fg') || el.hasAttribute('data-svi-bgr-bd')) return;
        if (this.isExcluded(el)) return;
        this.tagElement(el);
        count++;
      };
      tryTag(root);
      if (root.querySelectorAll) {
        let children = [];
        try {
          children = Array.from(root.querySelectorAll('*'));
        } catch (e) { /* ignore */ }
        for (const el of children) {
          if (count >= budget) break;
          tryTag(el);
        }
      }
      return count;
    }

    tagElement(el) {
      let cs = null;
      try {
        cs = window.getComputedStyle(el);
      } catch (e) {
        return;
      }
      if (!cs) return;

      const bgC = parseColorString(cs.backgroundColor);
      const fgC = parseColorString(cs.color);

      // 原色屏蔽: 命中则整个元素跳过, 保持原始配色
      if ((bgC && isShieldedColor(bgC, this.shieldRgb)) || (fgC && isShieldedColor(fgC, this.shieldRgb))) {
        return;
      }

      // 浅色背景 → 深色映射桶
      if (bgC && bgC[3] > 0.05 && relLuminance(bgC[0], bgC[1], bgC[2]) >= 160) {
        const key = bucketKey(bgC);
        if (!this.bucketsBg.has(key)) {
          const q = quantizeRgb(bgC);
          this.bucketsBg.set(key, mapLightToDark(q[0], q[1], q[2]));
        }
        el.setAttribute('data-svi-bgr-bg', key);
      }

      // 深色文字 → 浅色映射桶
      if (fgC && fgC[3] > 0.05 && relLuminance(fgC[0], fgC[1], fgC[2]) <= 90) {
        const key = bucketKey(fgC);
        if (!this.bucketsFg.has(key)) {
          const q = quantizeRgb(fgC);
          this.bucketsFg.set(key, mapDarkToLight(q[0], q[1], q[2]));
        }
        el.setAttribute('data-svi-bgr-fg', key);
      }

      // 可见浅色边框 → 中间色调桶
      const bdStyle = cs.borderTopStyle;
      const bdWidth = parseFloat(cs.borderTopWidth) || 0;
      if (bdStyle && bdStyle !== 'none' && bdStyle !== 'hidden' && bdWidth > 0) {
        const bdC = parseColorString(cs.borderTopColor);
        if (bdC && bdC[3] > 0.05 && relLuminance(bdC[0], bdC[1], bdC[2]) >= 160) {
          const key = bucketKey(bdC);
          if (!this.bucketsBd.has(key)) {
            const q = quantizeRgb(bdC);
            this.bucketsBd.set(key, mapBorderToDark(q[0], q[1], q[2]));
          }
          el.setAttribute('data-svi-bgr-bd', key);
        }
      }
    }

    applyCss() {
      try {
        if (!this.styleNode || !this.styleNode.isConnected) {
          this.styleNode = document.getElementById('svi-bgr-style');
          if (!this.styleNode) {
            this.styleNode = document.createElement('style');
            this.styleNode.id = 'svi-bgr-style';
            (document.head || document.documentElement).appendChild(this.styleNode);
          }
        }
        let css = '';
        for (const [key, rgb] of this.bucketsBg) {
          css += `html[data-svi-bgr-on] [data-svi-bgr-bg="${key}"]{background-color:${rgbToHex(rgb)}!important;}`;
        }
        for (const [key, rgb] of this.bucketsFg) {
          css += `html[data-svi-bgr-on] [data-svi-bgr-fg="${key}"]{color:${rgbToHex(rgb)}!important;}`;
        }
        for (const [key, rgb] of this.bucketsBd) {
          css += `html[data-svi-bgr-on] [data-svi-bgr-bd="${key}"]{border-color:${rgbToHex(rgb)}!important;}`;
        }
        this.styleNode.textContent = css;
      } catch (e) { /* ignore */ }
    }
  }

  function applyBackgroundReplace(active) {
    const engine = (window.__svi && window.__svi.engines) ? window.__svi.engines.bgReplace : null;
    if (!engine) return;
    try {
      if (active) {
        engine.activate(getSiteProfile());
      } else {
        engine.deactivate();
      }
    } catch (e) {
      console.warn('[SmartInvert] bgReplace toggle failed:', e);
    }
  }

  // ==========================================
  // 13. 本地数据统计管理器 (StatsManager) —— 仅本地存储, 绝不自动上传
  // ==========================================
  const StatsManager = {
    counters: null,
    log: [],
    dirty: false,

    load() {
      this.counters = {
        imagesAnalyzed: 0,
        imagesInverted: 0,
        bgImagesInverted: 0,
        taintFallbacks: 0,
        videoAutoActivations: 0,
        bgReplacePages: 0,
      };
      this.log = [];
      this.dirty = false;
      try {
        const raw = localStorage.getItem(STATS_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d === 'object') {
            if (d.counters && typeof d.counters === 'object') Object.assign(this.counters, d.counters);
            if (Array.isArray(d.log)) this.log = d.log.slice(-200);
          }
        }
      } catch (e) { /* ignore */ }
    },

    count(key, n = 1) {
      if (!state.statsEnabled || !this.counters) return;
      this.counters[key] = (this.counters[key] || 0) + n;
      this.markDirty();
    },

    record(type, detail) {
      if (!state.statsEnabled) return;
      this.log.push({
        t: Date.now(),
        host: (typeof location !== 'undefined' && location.hostname) || '',
        type: String(type || '').slice(0, 40),
        detail: String(detail || '').slice(0, 120),
      });
      if (this.log.length > 200) {
        this.log.splice(0, this.log.length - 200);
      }
      this.markDirty();
    },

    markDirty() {
      this.dirty = true;
    },

    flush() {
      if (!this.dirty || !state.statsEnabled) return;
      try {
        localStorage.setItem(STATS_KEY, JSON.stringify({ counters: this.counters, log: this.log }));
        this.dirty = false;
      } catch (e) { /* ignore */ }
    },

    clear() {
      this.counters = {
        imagesAnalyzed: 0,
        imagesInverted: 0,
        bgImagesInverted: 0,
        taintFallbacks: 0,
        videoAutoActivations: 0,
        bgReplacePages: 0,
      };
      this.log = [];
      this.dirty = false;
      try {
        localStorage.removeItem(STATS_KEY);
      } catch (e) { /* ignore */ }
    },

    // 开发者导出 (纯本地数据, 手动触发; 含 manualOverrides, 不做任何删改)
    exportJson() {
      this.flush();
      return {
        schema: 1,
        exportedAt: new Date().toISOString(),
        version: SCRIPT_VERSION,
        counters: JSON.parse(JSON.stringify(this.counters || {})),
        log: this.log.slice(),
        prefs: JSON.parse(JSON.stringify(state)),
      };
    },

    summaryText() {
      const c = this.counters || {};
      return `图片分析 ${c.imagesAnalyzed || 0} · 已反色 ${c.imagesInverted || 0} · 背景图 ${c.bgImagesInverted || 0} · 跨域回退 ${c.taintFallbacks || 0} · 视频自动 ${c.videoAutoActivations || 0} · 背景替换页 ${c.bgReplacePages || 0} · 日志 ${this.log.length}/200`;
    },
  };

  // ==========================================
  // 14. 极简悬浮胶囊 UI 控制器与高级设置页
  // ==========================================
  class UIController {
    constructor() {
      this.stateMachine = null;
      this.root = null;
      this.pill = null;
      this.dot = null;
      this.panel = null;
      this.statusBadge = null;
      this.invertBtn = null;
      this.autoBtn = null;
      this.imgBtn = null;
      this.bgBtn = null;
      this.presetBtns = {};
      this.modalMask = null;
      this.modalPerf = null;
      this.modalControls = null;
      this.siteEnabledCb = null;
      this.siteImgCb = null;
      this.siteVideoCb = null;
      this.siteBgrCb = null;
      this.modeSelect = null;
      this.blacklistTa = null;
      this.whitelistTa = null;
      this.ruleSummary = null;
      this.shieldChipsBox = null;
      this.shieldColorInput = null;
      this.statsSummary = null;
    }

    bindStateMachine(sm) {
      this.stateMachine = sm;
      this.buildUI();
      this.buildSettingsModal();
      this.bindShortcuts();
      this.bindFullscreen();
      this.syncVisuals();
    }

    buildUI() {
      this.root = document.createElement('div');
      this.root.className = 'svi-capsule-root';

      // 贴边微型触发小药丸
      this.pill = document.createElement('div');
      this.pill.className = 'svi-trigger-pill';
      this.dot = document.createElement('div');
      this.dot.className = 'svi-status-dot';
      this.pill.appendChild(this.dot);

      // 控制面板卡片
      this.panel = document.createElement('div');
      this.panel.className = 'svi-panel-card';

      // Header
      const header = document.createElement('div');
      header.className = 'svi-card-header';
      const title = document.createElement('span');
      title.textContent = '智能反色控制';
      this.statusBadge = document.createElement('span');
      this.statusBadge.className = 'svi-card-status-badge';
      this.statusBadge.textContent = '初始化中';
      header.append(title, this.statusBadge);

      // 行1: 核心按钮 (视频反色、智能检测、图片反色、背景替换)
      const btnRow = document.createElement('div');
      btnRow.className = 'svi-btn-row svi-btn-row-4';

      this.invertBtn = document.createElement('button');
      this.invertBtn.className = 'svi-action-btn';
      this.invertBtn.textContent = '视频:关';
      this.invertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stateMachine.onUserToggleInvert();
      });

      this.autoBtn = document.createElement('button');
      this.autoBtn.className = 'svi-action-btn';
      this.autoBtn.textContent = '智能:开';
      this.autoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stateMachine.onUserToggleAuto();
      });

      this.imgBtn = document.createElement('button');
      this.imgBtn.className = 'svi-action-btn';
      this.imgBtn.textContent = '图片:开';
      this.imgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.imageInvert = !state.imageInvert;
        updateImageFilterCss();
        this.syncVisuals();
        savePrefs();
      });

      // 背景替换按钮: 切换当前站点的覆盖开关 (站点级)
      this.bgBtn = document.createElement('button');
      this.bgBtn.className = 'svi-action-btn';
      this.bgBtn.textContent = '背景:关';
      this.bgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSiteBgReplace();
      });

      btnRow.append(this.invertBtn, this.autoBtn, this.imgBtn, this.bgBtn);

      // 行2: 配色预设
      const presetRow = document.createElement('div');
      presetRow.className = 'svi-preset-row';
      Object.values(PRESETS).forEach((p) => {
        const btn = document.createElement('button');
        btn.className = 'svi-preset-btn';
        btn.textContent = p.name;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.stateMachine.onUserSelectPreset(p.id);
        });
        this.presetBtns[p.id] = btn;
        presetRow.appendChild(btn);
      });

      // 行3: 打开详细参数设置页面按钮
      const modalBtn = document.createElement('button');
      modalBtn.className = 'svi-open-modal-btn';
      modalBtn.innerHTML = `⚙️ 详细参数细调页面 (滑动条+数值)`;
      modalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSettingsModal();
      });

      // Footer: 快捷键提示
      const footer = document.createElement('div');
      footer.className = 'svi-card-footer';
      footer.innerHTML = `<span>Alt+I 视频</span><span>Alt+A 智能</span><span>Alt+点击 图片</span>`;

      this.panel.append(header, btnRow, presetRow, modalBtn, footer);
      this.root.append(this.pill, this.panel);
      document.body.appendChild(this.root);

      this.pill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePanel();
      });

      document.addEventListener('click', (e) => {
        if (!this.root.contains(e.target)) {
          this.panel.classList.remove('show');
        }
      });

      this.initDraggable();
    }

    toggleSiteBgReplace() {
      const host = location.hostname;
      const profile = getSiteProfile();
      const ov = state.siteOverrides[host] || (state.siteOverrides[host] = {});
      ov.bgReplace = !profile.bgReplace;
      savePrefs();
      applyBackgroundReplace(ov.bgReplace);
      this.syncVisuals();
      showToast(ov.bgReplace ? '本站背景替换已开启' : '本站背景替换已关闭');
    }

    // ==========================================
    // 高级参数精细设置模态窗口 (完整独立设置页)
    // ==========================================
    buildSettingsModal() {
      this.modalMask = document.createElement('div');
      this.modalMask.className = 'svi-modal-mask';

      const win = document.createElement('div');
      win.className = 'svi-modal-window';

      // 模态弹窗 Header
      const header = document.createElement('div');
      header.className = 'svi-modal-header';
      header.innerHTML = `
        <div class="svi-modal-title"><span>⚙️ 智能反色高级参数细调</span></div>
        <button class="svi-modal-close" title="关闭">✕</button>
      `;
      header.querySelector('.svi-modal-close').addEventListener('click', () => {
        this.closeSettingsModal();
      });

      const body = document.createElement('div');
      body.className = 'svi-modal-body';

      const items = [];

      // 辅助函数: 创建拖动滑动条 + 详细数值框双向联动行
      const makeRow = (label, hint, key, min, max, step, unit, onChange) => {
        const row = document.createElement('div');
        row.className = 'svi-modal-row';

        const labelBox = document.createElement('div');
        labelBox.className = 'svi-modal-label-box';
        labelBox.innerHTML = `<div class="svi-modal-label">${label}</div><div class="svi-modal-hint">${hint}</div>`;

        const controls = document.createElement('div');
        controls.className = 'svi-modal-controls';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'svi-modal-slider';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = state[key];

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.className = 'svi-modal-num-input';
        numInput.min = min;
        numInput.max = max;
        numInput.step = step;
        numInput.value = state[key];

        const syncVal = (val, fromSlider = false) => {
          let n = parseFloat(val);
          if (isNaN(n)) return;
          n = Math.max(min, Math.min(max, n));
          if (!fromSlider) slider.value = n;
          numInput.value = n;
          state[key] = n;
          onChange(n);
        };

        slider.addEventListener('input', () => syncVal(slider.value, true));
        numInput.addEventListener('input', () => syncVal(numInput.value, false));

        controls.append(slider, numInput);
        if (unit) {
          const u = document.createElement('span');
          u.className = 'svi-modal-unit';
          u.textContent = unit;
          controls.appendChild(u);
        }

        row.append(labelBox, controls);
        items.push({ slider, numInput, key });
        return row;
      };

      // 模块 1: 基础调色风格 (开箱即用)
      const secPreset = document.createElement('div');
      secPreset.className = 'svi-modal-section';
      secPreset.innerHTML = `<div class="svi-sec-title"><span>🌙 基础调色风格</span><span>开箱即用</span></div>`;

      const presetGrid = document.createElement('div');
      presetGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;';

      const styleBtns = {};
      Object.values(PRESETS).forEach((p) => {
        const btn = document.createElement('div');
        btn.className = 'svi-color-chip';
        btn.innerHTML = `
          <div class="svi-color-chip-swatch" style="background: ${p.id === 'amoled' ? '#000000' : '#1e293b'}; border-color: rgba(255,255,255,0.3);"></div>
          <span>${p.name}</span>
          <span class="svi-color-chip-check">✓</span>
        `;
        if (state.presetId === p.id) btn.classList.add('active');
        btn.addEventListener('click', () => {
          Object.values(styleBtns).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.stateMachine.onUserSelectPreset(p.id);
        });
        styleBtns[p.id] = btn;
        presetGrid.appendChild(btn);
      });
      secPreset.appendChild(presetGrid);

      // 模块 2: 网页图片浅色反色与色图选择 (开箱即用)
      const secImgColor = document.createElement('div');
      secImgColor.className = 'svi-modal-section';
      secImgColor.innerHTML = `<div class="svi-sec-title"><span>🎨 网页图片浅色反色与色图选择</span><span>开箱即用</span></div>`;

      // 全浅色通用自适应开关行
      const genRow = document.createElement('div');
      genRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px;';
      genRow.innerHTML = `
        <div class="svi-modal-label-box" style="width: auto;">
          <div class="svi-modal-label" style="font-weight: 500;">全浅色通用自适应检测</div>
          <div class="svi-modal-hint">任何高明度浅底图表均自动识别反色</div>
        </div>
      `;
      const genCheckbox = document.createElement('input');
      genCheckbox.type = 'checkbox';
      genCheckbox.checked = state.imgGeneralLight !== false;
      genCheckbox.style.cssText = 'width: 16px; height: 16px; accent-color: #38bdf8; cursor: pointer;';
      genCheckbox.addEventListener('change', () => {
        state.imgGeneralLight = genCheckbox.checked;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      });
      genRow.appendChild(genCheckbox);
      secImgColor.appendChild(genRow);

      // 浅色色卡预设矩阵 (4块直观色卡，默认全部点亮激活)
      const chipsLabel = document.createElement('div');
      chipsLabel.style.cssText = 'font-size: 11px; color: #94a3b8; margin: 4px 0 2px 0;';
      chipsLabel.textContent = '预设浅色色卡（点击快速切换启用/禁用对应浅色系）：';
      secImgColor.appendChild(chipsLabel);

      const chipsGrid = document.createElement('div');
      chipsGrid.className = 'svi-color-chips-grid';

      IMG_COLOR_PRESETS.forEach((cp) => {
        const chip = document.createElement('div');
        chip.className = 'svi-color-chip';
        if (state.imgPresets && state.imgPresets[cp.id]) {
          chip.classList.add('active');
        }
        chip.innerHTML = `
          <div class="svi-color-chip-swatch" style="background: ${cp.color};"></div>
          <span>${cp.name}</span>
          <span class="svi-color-chip-check">✓</span>
        `;
        chip.addEventListener('click', () => {
          if (!state.imgPresets) state.imgPresets = {};
          state.imgPresets[cp.id] = !state.imgPresets[cp.id];
          chip.classList.toggle('active', !!state.imgPresets[cp.id]);
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
        chipsGrid.appendChild(chip);
      });
      secImgColor.appendChild(chipsGrid);

      // 自定义色图拾色器 (系统调色板 + HEX 取色)
      const pickerRow = document.createElement('div');
      pickerRow.className = 'svi-color-picker-row';

      const pickerLabel = document.createElement('div');
      pickerLabel.className = 'svi-color-picker-label';
      pickerLabel.innerHTML = `<span>🎯 目标色图拾色器</span><span style="font-size:10px; color:#64748b;">(点击色块唤出调色盘)</span>`;

      const pickerControls = document.createElement('div');
      pickerControls.className = 'svi-color-picker-controls';

      const previewBox = document.createElement('div');
      previewBox.className = 'svi-color-preview-box';

      const previewCircle = document.createElement('div');
      previewCircle.className = 'svi-color-preview-circle';
      previewCircle.style.background = state.imgCustomColor || '#ffffff';

      const previewHex = document.createElement('span');
      previewHex.textContent = (state.imgCustomColor || '#ffffff').toUpperCase();

      previewBox.append(previewCircle, previewHex);

      const inputWrap = document.createElement('div');
      inputWrap.className = 'svi-color-input-wrap';

      const nativeColorInput = document.createElement('input');
      nativeColorInput.type = 'color';
      nativeColorInput.className = 'svi-color-input-native';
      nativeColorInput.value = state.imgCustomColor || '#ffffff';

      nativeColorInput.addEventListener('input', (e) => {
        const hex = e.target.value;
        state.imgCustomColor = hex;
        previewCircle.style.background = hex;
        previewHex.textContent = hex.toUpperCase();
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      });

      inputWrap.append(nativeColorInput, previewBox);
      pickerControls.appendChild(inputWrap);
      pickerRow.append(pickerLabel, pickerControls);
      secImgColor.appendChild(pickerRow);

      // 模块 3: 🌐 站点与规则 (v2.0)
      const secSite = this.buildSiteSection();

      // 模块 4: 🛡️ 原色屏蔽 (v2.0)
      const secShield = this.buildShieldSection();

      // 模块 5: 📊 数据与反馈 (v2.0)
      const secStats = this.buildStatsSection();

      // 模块 6: ⚙️ 高级参数微调 (折叠抽屉 Accordion)
      const accordion = document.createElement('div');
      accordion.className = 'svi-accordion';
      if (state.advancedOpen) accordion.classList.add('open');

      const accHeader = document.createElement('div');
      accHeader.className = 'svi-accordion-header';
      accHeader.innerHTML = `
        <div class="svi-accordion-title"><span>⚙️ 高级参数微调 (滑动条与精确数值)</span></div>
        <span class="svi-accordion-icon">▶</span>
      `;
      accHeader.addEventListener('click', () => {
        state.advancedOpen = !state.advancedOpen;
        accordion.classList.toggle('open', state.advancedOpen);
        savePrefs();
      });

      const accContent = document.createElement('div');
      accContent.className = 'svi-accordion-content';

      // 高级 1: 图片色彩匹配与尺寸规则
      const advImgSec = document.createElement('div');
      advImgSec.className = 'svi-modal-section';
      advImgSec.style.background = 'transparent';
      advImgSec.style.border = 'none';
      advImgSec.style.padding = '0';
      advImgSec.innerHTML = `<div class="svi-sec-title"><span>🖼️ 图片浅色检测阈值精调</span></div>`;

      advImgSec.appendChild(makeRow('目标色彩容差', '色图匹配置信范围', 'imgTolerance', 10, 80, 1, '', () => {
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }));
      advImgSec.appendChild(makeRow('浅色明度线', '判定浅色背景的明度底线', 'imgLumCutoff', 150, 240, 1, '', () => {
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }));
      advImgSec.appendChild(makeRow('浅色面积占比', '触发反色的浅底面积比例', 'imgAreaThreshold', 25, 90, 1, '%', () => {
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }));
      advImgSec.appendChild(makeRow('正文图最小尺寸', '小于此长宽的图标不反色', 'minImgSize', 32, 300, 4, 'px', () => {
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }));
      accContent.appendChild(advImgSec);

      // 高级 2: 画面滤镜与调色微调
      const advFilterSec = document.createElement('div');
      advFilterSec.className = 'svi-modal-section';
      advFilterSec.style.background = 'transparent';
      advFilterSec.style.border = 'none';
      advFilterSec.style.padding = '0';
      advFilterSec.innerHTML = `<div class="svi-sec-title"><span>🎨 画面滤镜微调</span><span>实时生效</span></div>`;

      advFilterSec.appendChild(makeRow('画面亮度', '反色后的暗化微调', 'brightness', 0.50, 1.50, 0.01, '', () => {
        this.stateMachine.onCustomParamChange();
      }));
      advFilterSec.appendChild(makeRow('画面对比度', '文字线条锐利度', 'contrast', 0.50, 1.50, 0.01, '', () => {
        this.stateMachine.onCustomParamChange();
      }));
      advFilterSec.appendChild(makeRow('色彩饱和度', '消除或保留颜色', 'saturate', 0.00, 2.00, 0.01, '', () => {
        this.stateMachine.onCustomParamChange();
      }));
      advFilterSec.appendChild(makeRow('色相旋转', '校正颜色谱系', 'hueRotate', 0, 360, 1, '°', () => {
        this.stateMachine.onCustomParamChange();
      }));
      accContent.appendChild(advFilterSec);

      // 高级 3: 切换速度与过渡动画
      const advSpeedSec = document.createElement('div');
      advSpeedSec.className = 'svi-modal-section';
      advSpeedSec.style.background = 'transparent';
      advSpeedSec.style.border = 'none';
      advSpeedSec.style.padding = '0';
      advSpeedSec.innerHTML = `<div class="svi-sec-title"><span>⚡ 切换速度与过渡渐变</span><span>0ms 为直接切换</span></div>`;

      advSpeedSec.appendChild(makeRow('过渡动画时长', '设为 0ms 即直接瞬切无渐变', 'transitionMs', 0, 1000, 10, 'ms', (v) => {
        this.stateMachine.onUpdateTransition(v);
      }));
      accContent.appendChild(advSpeedSec);

      // 高级 4: 视频智能算法
      const advVideoSec = document.createElement('div');
      advVideoSec.className = 'svi-modal-section';
      advVideoSec.style.background = 'transparent';
      advVideoSec.style.border = 'none';
      advVideoSec.style.padding = '0';
      advVideoSec.innerHTML = `<div class="svi-sec-title"><span>🧠 视频智能算法与防抖</span></div>`;

      advVideoSec.appendChild(makeRow('检测采样周期', '后台探测频次', 'sampleIntervalMs', 50, 2000, 25, 'ms', (v) => {
        this.stateMachine.onUpdateInterval(v);
      }));
      advVideoSec.appendChild(makeRow('白底面积占比', '触发视频反色的面积阈值', 'whiteThreshold', 30, 95, 1, '%', () => {
        savePrefs();
      }));
      advVideoSec.appendChild(makeRow('明度判定线', '判定为白底的亮度下限', 'lumThreshold', 160, 250, 1, '', () => {
        savePrefs();
      }));
      advVideoSec.appendChild(makeRow('退出防抖延迟', '离开课件时的缓冲确认时长', 'exitHysteresisMs', 200, 5000, 100, 'ms', () => {
        savePrefs();
      }));
      accContent.appendChild(advVideoSec);

      // 技巧提示
      const hintBox = document.createElement('div');
      hintBox.style.cssText = 'font-size: 11px; color: #94a3b8; line-height: 1.6; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px dashed rgba(255,255,255,0.08);';
      hintBox.innerHTML = `💡 <b>操作技巧</b>：<br>• <b>Alt + 鼠标左键</b>：在网页任意图片或 SVG 上点击，可单独强制反色或复原（选择会被记住）。<br>• <b>鼠标悬停</b>：鼠标移至已反色的图片上方时自动显现原始原色，移出后恢复。`;
      accContent.appendChild(hintBox);

      accordion.append(accHeader, accContent);

      body.append(secPreset, secImgColor, secSite, secShield, secStats, accordion);

      // 模态弹窗 Footer
      const footer = document.createElement('div');
      footer.className = 'svi-modal-footer';

      this.modalPerf = document.createElement('div');
      this.modalPerf.className = 'svi-modal-perf';
      this.modalPerf.textContent = '⚡ 探测单次耗时: ~0.003ms';

      const actions = document.createElement('div');
      actions.className = 'svi-footer-actions';

      const resetBtn = document.createElement('button');
      resetBtn.className = 'svi-btn-reset';
      resetBtn.textContent = '恢复默认值';
      resetBtn.addEventListener('click', () => {
        if (confirm('确认将所有参数恢复为出厂默认值吗？')) {
          this.stateMachine.resetDefaults();
        }
      });

      const doneBtn = document.createElement('button');
      doneBtn.className = 'svi-btn-done';
      doneBtn.textContent = '完成并关闭';
      doneBtn.addEventListener('click', () => {
        this.closeSettingsModal();
      });

      actions.append(resetBtn, doneBtn);
      footer.append(this.modalPerf, actions);

      win.append(header, body, footer);
      this.modalMask.appendChild(win);
      document.body.appendChild(this.modalMask);

      // 点击遮罩外部关闭
      this.modalMask.addEventListener('click', (e) => {
        if (e.target === this.modalMask) {
          this.closeSettingsModal();
        }
      });

      // 存储同步方法
      this.modalControls = {
        syncAll: () => {
          items.forEach(({ slider, numInput, key }) => {
            slider.value = state[key];
            numInput.value = state[key];
          });
        }
      };
    }

    // ==========================================
    // v2.0 模态区块: 🌐 站点与规则
    // ==========================================
    buildSiteSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-site';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>🌐 站点与规则</span><span id="svi-site-host" style="font-size:10px; color:#64748b;"></span>`;
      sec.appendChild(secTitle);

      const host = location.hostname;
      const getOv = () => (state.siteOverrides[host] || (state.siteOverrides[host] = {}));

      const mkCheck = (label, hint, onChange) => {
        const row = document.createElement('div');
        row.className = 'svi-site-check-row';
        const box = document.createElement('div');
        box.className = 'svi-modal-label-box';
        box.style.width = 'auto';
        box.innerHTML = `<div class="svi-modal-label">${label}</div><div class="svi-modal-hint">${hint}</div>`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'svi-check';
        cb.addEventListener('change', () => {
          onChange(cb.checked);
          savePrefs();
          this.syncVisuals();
        });
        row.append(box, cb);
        sec.appendChild(row);
        return cb;
      };

      this.siteEnabledCb = mkCheck('本站启用脚本', '关闭后本站全部引擎停用 (等价黑名单)', (v) => {
        getOv().enabled = v;
        // 立即生效: 关闭时同步停掉背景替换; 重新开启时按站点档案恢复
        try { applyBackgroundReplace(v && getSiteProfile().bgReplace === true); } catch (e) { /* ignore */ }
      });
      this.siteImgCb = mkCheck('本站图片反色', '覆盖全局图片反色开关', (v) => {
        getOv().imageInvert = v;
        updateImageFilterCss();
      });
      this.siteVideoCb = mkCheck('本站视频反色', '覆盖全局视频反色能力', (v) => {
        getOv().videoInvert = v;
      });
      this.siteBgrCb = mkCheck('本站背景替换', '浅色页面一键深色化, 登录块原样保护', (v) => {
        getOv().bgReplace = v;
        applyBackgroundReplace(v);
      });

      // 站点管理模式
      const modeRow = document.createElement('div');
      modeRow.className = 'svi-modal-row';
      const modeBox = document.createElement('div');
      modeBox.className = 'svi-modal-label-box';
      modeBox.style.width = 'auto';
      modeBox.innerHTML = `<div class="svi-modal-label">站点管理模式</div><div class="svi-modal-hint">全部启用 / 黑名单 / 白名单</div>`;
      this.modeSelect = document.createElement('select');
      this.modeSelect.className = 'svi-modal-select';
      [
        ['all', '全部启用'],
        ['blacklist', '黑名单模式'],
        ['whitelist', '白名单模式'],
      ].forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        this.modeSelect.appendChild(opt);
      });
      this.modeSelect.value = state.siteMode || 'all';
      this.modeSelect.addEventListener('change', () => {
        state.siteMode = this.modeSelect.value;
        savePrefs();
        updateImageFilterCss();
      });
      modeRow.append(modeBox, this.modeSelect);
      sec.appendChild(modeRow);

      // 黑名单 / 白名单域名列表
      const mkArea = (placeholder, getList) => {
        const ta = document.createElement('textarea');
        ta.className = 'svi-modal-textarea';
        ta.placeholder = placeholder;
        ta.addEventListener('change', () => {
          const lines = ta.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
          const list = getList();
          list.splice(0, list.length, ...lines);
          savePrefs();
          updateImageFilterCss();
        });
        sec.appendChild(ta);
        return ta;
      };
      this.blacklistTa = mkArea('黑名单域名模式, 每行一个 (如 *.163.com)', () => state.siteBlacklist);
      this.whitelistTa = mkArea('白名单域名模式, 每行一个', () => state.siteWhitelist);

      // 内置规则摘要
      this.ruleSummary = document.createElement('div');
      this.ruleSummary.className = 'svi-hint-line';
      sec.appendChild(this.ruleSummary);

      // 重扫本页背景按钮
      const rescanBtn = document.createElement('button');
      rescanBtn.className = 'svi-mini-btn';
      rescanBtn.textContent = '🔄 重扫本页背景';
      rescanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const engine = window.__svi && window.__svi.engines ? window.__svi.engines.bgReplace : null;
        if (engine && engine.active) {
          engine.rescan();
          showToast('已重扫本页背景');
        } else {
          showToast('背景替换未开启');
        }
      });
      sec.appendChild(rescanBtn);

      return sec;
    }

    refreshSiteSection() {
      const host = location.hostname;
      const profile = getSiteProfile();
      const hostEl = document.getElementById('svi-site-host');
      if (hostEl) hostEl.textContent = '当前站点: ' + host;
      if (this.siteEnabledCb) this.siteEnabledCb.checked = profile.enabled !== false;
      if (this.siteImgCb) this.siteImgCb.checked = profile.imageInvert !== false;
      if (this.siteVideoCb) this.siteVideoCb.checked = profile.videoInvert !== false;
      if (this.siteBgrCb) this.siteBgrCb.checked = !!profile.bgReplace;
      if (this.modeSelect) this.modeSelect.value = state.siteMode || 'all';
      if (this.blacklistTa) this.blacklistTa.value = (state.siteBlacklist || []).join('\n');
      if (this.whitelistTa) this.whitelistTa.value = (state.siteWhitelist || []).join('\n');
      if (this.ruleSummary) {
        const r = profile.builtin;
        const ovNote = profile.overridePattern ? ' · 已应用本站自定义覆盖' : '';
        this.ruleSummary.innerHTML = r
          ? `内置规则: <b>${r.name}</b> · 保护选择器 ${r.protect.length} · 强制反色 ${r.forceInvert.length} · 背景图选择器 ${r.bgImageSelectors.length}${ovNote}`
          : `内置规则: 无 (通用智能检测)${ovNote}`;
      }
    }

    // ==========================================
    // v2.0 模态区块: 🛡️ 原色屏蔽
    // ==========================================
    buildShieldSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-shield';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>🛡️ 原色屏蔽</span>`;
      sec.appendChild(secTitle);

      const hint = document.createElement('div');
      hint.className = 'svi-hint-line';
      hint.textContent = '加入屏蔽列表的原始颜色永不转换 (背景替换与图片反色都会跳过), 适合保护品牌色/警示色。';
      sec.appendChild(hint);

      this.shieldChipsBox = document.createElement('div');
      this.shieldChipsBox.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px;';
      sec.appendChild(this.shieldChipsBox);

      const addRow = document.createElement('div');
      addRow.className = 'svi-color-picker-row';

      const addLabel = document.createElement('div');
      addLabel.className = 'svi-color-picker-label';
      addLabel.innerHTML = `<span>➕ 添加屏蔽颜色</span>`;

      const addControls = document.createElement('div');
      addControls.className = 'svi-color-picker-controls';

      this.shieldColorInput = document.createElement('input');
      this.shieldColorInput.type = 'color';
      this.shieldColorInput.className = 'svi-color-input-native';
      this.shieldColorInput.value = '#ffffff';
      this.shieldColorInput.style.cssText = 'width: 40px; height: 26px; padding: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: transparent; cursor: pointer;';

      const addBtn = document.createElement('button');
      addBtn.className = 'svi-mini-btn';
      addBtn.textContent = '添加';
      addBtn.addEventListener('click', () => {
        const hex = this.shieldColorInput.value;
        if (!state.shieldColors.includes(hex)) {
          state.shieldColors.push(hex);
          savePrefs();
          this.refreshShieldSection();
          window.__svi_image_engine?.clearCacheAndRescan();
        }
      });

      addControls.append(this.shieldColorInput, addBtn);
      addRow.append(addLabel, addControls);
      sec.appendChild(addRow);

      this.refreshShieldSection();
      return sec;
    }

    refreshShieldSection() {
      if (!this.shieldChipsBox) return;
      this.shieldChipsBox.innerHTML = '';
      if (!state.shieldColors.length) {
        const empty = document.createElement('span');
        empty.className = 'svi-hint-line';
        empty.textContent = '暂无屏蔽颜色';
        this.shieldChipsBox.appendChild(empty);
        return;
      }
      state.shieldColors.forEach((hex, idx) => {
        const chip = document.createElement('span');
        chip.className = 'svi-shield-chip';
        // DOM 构建而非 innerHTML: 屏蔽色值来自存储层, 必须杜绝任何注入面 (XSS 加固)
        const hexText = String(hex);
        const dot = document.createElement('span');
        dot.style.cssText = 'width:12px;height:12px;border-radius:50%;border:1px solid rgba(0,0,0,0.3);display:inline-block;';
        if (/^#[0-9a-fA-F]{6}$/.test(hexText)) {
          dot.style.backgroundColor = hexText;
        }
        const label = document.createElement('span');
        label.textContent = hexText;
        const removeX = document.createElement('span');
        removeX.className = 'svi-shield-x';
        removeX.title = '移除';
        removeX.textContent = '✕';
        removeX.addEventListener('click', () => {
          state.shieldColors.splice(idx, 1);
          savePrefs();
          this.refreshShieldSection();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
        chip.append(dot, label, removeX);
        this.shieldChipsBox.appendChild(chip);
      });
    }

    // ==========================================
    // v2.0 模态区块: 📊 数据与反馈
    // ==========================================
    buildStatsSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-stats';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>📊 数据与反馈</span>`;
      sec.appendChild(secTitle);

      this.statsSummary = document.createElement('div');
      this.statsSummary.className = 'svi-stats-summary';
      sec.appendChild(this.statsSummary);

      const btnRow = document.createElement('div');
      btnRow.className = 'svi-btn-row-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'svi-mini-btn';
      copyBtn.textContent = '复制 JSON';
      copyBtn.addEventListener('click', () => this.copyStatsJson());

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'svi-mini-btn';
      downloadBtn.textContent = '下载 JSON';
      downloadBtn.addEventListener('click', () => this.downloadStatsJson());

      const clearBtn = document.createElement('button');
      clearBtn.className = 'svi-mini-btn danger';
      clearBtn.textContent = '清空统计';
      clearBtn.addEventListener('click', () => {
        if (confirm('确认清空本地统计数据吗？(偏好设置不受影响)')) {
          StatsManager.clear();
          this.refreshStatsSection();
          showToast('本地统计已清空');
        }
      });

      btnRow.append(copyBtn, downloadBtn, clearBtn);
      sec.appendChild(btnRow);

      const privacy = document.createElement('div');
      privacy.className = 'svi-hint-line';
      privacy.textContent = '🔒 数据仅保存在本地浏览器 (' + STATS_KEY + '), 绝不自动上传; 导出完全由你手动触发, 欢迎附在 Issue 中反馈问题。';
      sec.appendChild(privacy);

      this.refreshStatsSection();
      return sec;
    }

    refreshStatsSection() {
      if (this.statsSummary) {
        this.statsSummary.textContent = StatsManager.summaryText();
      }
    }

    async copyStatsJson() {
      const text = JSON.stringify(StatsManager.exportJson(), null, 2);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          showToast('统计 JSON 已复制到剪贴板');
          return;
        }
        throw new Error('clipboard unavailable');
      } catch (e) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast('统计 JSON 已复制到剪贴板');
        } catch (e2) {
          showToast('复制失败, 请使用下载 JSON');
        }
      }
    }

    downloadStatsJson() {
      try {
        const data = JSON.stringify(StatsManager.exportJson(), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `svi-stats-${new Date().toISOString().slice(0, 10)}.json`;
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
        }, 500);
        showToast('统计 JSON 已开始下载');
      } catch (e) {
        showToast('下载失败: ' + e.message);
      }
    }

    openSettingsModal() {
      this.modalMask.classList.add('show');
      this.panel.classList.remove('show');
      if (this.modalControls) this.modalControls.syncAll();
      this.refreshSiteSection();
      this.refreshShieldSection();
      this.refreshStatsSection();
      this.updateStatusBadge();
    }

    closeSettingsModal() {
      this.modalMask.classList.remove('show');
    }

    togglePanel() {
      const show = !this.panel.classList.contains('show');
      this.panel.classList.toggle('show', show);
      if (show) {
        this.updateStatusBadge();
      }
    }

    updateStatusBadge() {
      if (!this.statusBadge || !this.stateMachine) return;
      const sm = this.stateMachine;
      const isCors = sm.detector ? sm.detector.isCorsRestricted : true;

      this.dot.className = 'svi-status-dot';
      this.statusBadge.className = 'svi-card-status-badge';

      if (isCors) {
        this.dot.classList.add('cors-warn');
        this.statusBadge.classList.add('yellow');
        this.statusBadge.textContent = '跨域视频手动';
      } else if (state.autoDetect) {
        if (runtime.invertActive) {
          this.dot.classList.add('active-auto');
          this.statusBadge.classList.add('green');
          this.statusBadge.textContent = runtime.userRejectedScene ? '手动反色中' : '智能白底反色中';
        } else {
          this.statusBadge.textContent = runtime.userRejectedScene ? '人工保持原样' : '正常画面感知中';
        }
      } else {
        if (runtime.invertActive) {
          this.dot.classList.add('active-manual');
          this.statusBadge.classList.add('blue');
          this.statusBadge.textContent = '手动反色开启';
        } else {
          this.statusBadge.textContent = '反色已关闭';
        }
      }

      if (this.modalPerf && sm.detector && sm.detector.lastDurationMs > 0) {
        this.modalPerf.textContent = `⚡ 探测单次耗时: ~${sm.detector.lastDurationMs.toFixed(3)}ms (极致无感)`;
      }
    }

    syncVisuals() {
      if (this.invertBtn) {
        this.invertBtn.textContent = runtime.invertActive ? '视频:开' : '视频:关';
        this.invertBtn.classList.toggle('active', runtime.invertActive);
      }

      if (this.autoBtn) {
        this.autoBtn.textContent = state.autoDetect ? '智能:开' : '智能:关';
        this.autoBtn.classList.toggle('active', state.autoDetect);
      }

      if (this.imgBtn) {
        const imgOn = !!state.imageInvert && getSiteProfile().imageInvert !== false;
        this.imgBtn.textContent = imgOn ? '图片:开' : '图片:关';
        this.imgBtn.classList.toggle('active', imgOn);
      }

      if (this.bgBtn) {
        const bgrOn = !!getSiteProfile().bgReplace;
        this.bgBtn.textContent = bgrOn ? '背景:开' : '背景:关';
        this.bgBtn.classList.toggle('active', bgrOn);
      }

      Object.entries(this.presetBtns).forEach(([id, btn]) => {
        btn.classList.toggle('selected', state.presetId === id);
      });

      this.updateStatusBadge();
    }

    bindShortcuts() {
      window.addEventListener('keydown', (e) => {
        const tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

        if (e.altKey && (e.key === 'i' || e.key === 'I')) {
          e.preventDefault();
          this.stateMachine.onUserToggleInvert();
        } else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
          e.preventDefault();
          this.stateMachine.onUserToggleAuto();
        }
      });
    }

    bindFullscreen() {
      const handleFullscreen = () => {
        const isFullscreen = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement
        );
        this.root.classList.toggle('svi-hidden-fullscreen', isFullscreen);
        if (isFullscreen) {
          this.panel.classList.remove('show');
          this.closeSettingsModal();
        }
      };
      document.addEventListener('fullscreenchange', handleFullscreen);
      document.addEventListener('webkitfullscreenchange', handleFullscreen);
      document.addEventListener('mozfullscreenchange', handleFullscreen);
    }

    initDraggable() {
      const el = this.root;
      const pill = this.pill;

      const setPosition = (x, y, edge) => {
        el.style.top = `${y}px`;
        if (edge === 'left') {
          el.style.left = '0px';
          el.style.right = 'auto';
          el.classList.add('left-edge');
          pill.classList.add('left-edge');
        } else {
          el.style.right = '0px';
          el.style.left = 'auto';
          el.classList.remove('left-edge');
          pill.classList.remove('left-edge');
        }
      };

      const savedY = state.pos.y || Math.round(window.innerHeight * 0.45);
      const savedEdge = state.pos.edge || 'right';
      setPosition(0, savedY, savedEdge);

      let isDragging = false;
      let startY = 0;
      let originY = 0;

      pill.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        originY = el.getBoundingClientRect().top;
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev) => {
          if (!isDragging) return;
          const dy = ev.clientY - startY;
          let newY = originY + dy;
          newY = Math.max(20, Math.min(window.innerHeight - 60, newY));
          el.style.top = `${newY}px`;
        };

        const onMouseUp = (ev) => {
          if (!isDragging) return;
          isDragging = false;
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);

          const finalY = el.getBoundingClientRect().top;
          const finalEdge = ev.clientX < window.innerWidth / 2 ? 'left' : 'right';
          setPosition(0, finalY, finalEdge);
          state.pos = { y: finalY, edge: finalEdge };
          savePrefs();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  }

  // ==========================================
  // 15. 启动引导 (鲁棒启动 + 引擎错误隔离 + 调试句柄)
  // ==========================================
  injectStyles();

  const IS_TOP_FRAME = (() => {
    try {
      return window.self === window.top;
    } catch (e) {
      return false;
    }
  })();

  let siteProfile = null;
  try {
    siteProfile = getSiteProfile();
  } catch (e) {
    console.warn('[SmartInvert] Site profile resolve failed:', e);
    try {
      siteProfile = resolveSiteProfile(location.hostname);
    } catch (e2) {
      siteProfile = resolveSiteProfile('');
    }
  }

  updateImageFilterCss();
  StatsManager.load();

  // 调试与单测句柄 (始终暴露, 纯逻辑可直接在 Node 中通过环境桩单测)
  window.__svi = {
    version: SCRIPT_VERSION,
    runtime,
    prefs: state,
    get profile() { return getSiteProfile(); },
    resolveProfile: getSiteProfile,
    resolveSiteProfile,
    hostMatchesPattern,
    classifySmallElement,
    mapLightToDark,
    mapDarkToLight,
    mapBorderToDark,
    isShieldedColor,
    parseColorString,
    relLuminance,
    rgbToHsl,
    hslToRgb,
    BUILTIN_RULES,
    LOGIN_SELECTORS,
    manualOverrideKey,
    addManualOverride,
    exportStats: () => StatsManager.exportJson(),
    stats: StatsManager,
    engines: {},
  };

  // 站点被禁用 (黑名单/白名单/本站覆盖) 时: 仅暴露调试句柄, 不启动任何引擎与 UI
  if (siteProfile.enabled === false) {
    window.__svi.disabled = true;
    console.info('[SmartInvert] 本站点已被用户设置禁用');
    return;
  }

  const uiController = new UIController();

  whenBodyReady(() => {
    // 每个引擎独立错误隔离: 任何一个初始化失败绝不拖垮其它引擎
    let probeManager = null;
    let detector = null;
    let stateMachine = null;
    let imageEngine = null;
    let bgImageEngine = null;
    let bgrEngine = null;

    try {
      probeManager = new VideoProbeManager();
      window.__svi.engines.video = probeManager;
    } catch (e) {
      console.warn('[SmartInvert] VideoProbeManager init failed:', e);
    }

    try {
      detector = new LuminanceDetector();
      window.__svi.engines.detector = detector;
    } catch (e) {
      console.warn('[SmartInvert] LuminanceDetector init failed:', e);
    }

    try {
      stateMachine = new HILStateMachine(probeManager, detector, uiController);
      window.__svi.engines.hil = stateMachine;
    } catch (e) {
      console.warn('[SmartInvert] HILStateMachine init failed:', e);
    }

    try {
      imageEngine = new ImageInvertEngine();
      window.__svi.engines.image = imageEngine;
    } catch (e) {
      console.warn('[SmartInvert] ImageInvertEngine init failed:', e);
    }

    try {
      bgImageEngine = new BgImageEngine();
      window.__svi.engines.bgImage = bgImageEngine;
    } catch (e) {
      console.warn('[SmartInvert] BgImageEngine init failed:', e);
    }

    try {
      bgrEngine = new BackgroundReplaceEngine();
      window.__svi.engines.bgReplace = bgrEngine;
    } catch (e) {
      console.warn('[SmartInvert] BackgroundReplaceEngine init failed:', e);
    }

    // UI 仅在顶层框架构建; iframe 中引擎静默运行
    if (IS_TOP_FRAME) {
      try {
        uiController.bindStateMachine(stateMachine);
      } catch (e) {
        console.warn('[SmartInvert] UI init failed:', e);
      }
    }

    // 按站点档案激活背景替换
    try {
      if (getSiteProfile().bgReplace && bgrEngine) {
        applyBackgroundReplace(true);
      }
    } catch (e) { /* ignore */ }
  });

  // 统计: 每 30s 落盘一次 + 页面隐藏时落盘 + 导出前强制落盘
  setInterval(() => {
    try { StatsManager.flush(); } catch (e) { /* ignore */ }
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      try {
        StatsManager.flush();
        flushPrefsNow();
      } catch (e) { /* ignore */ }
    }
  });

})();
