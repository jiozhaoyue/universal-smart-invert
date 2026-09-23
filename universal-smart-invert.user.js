// ==UserScript==
// @name         全网通用智能视频与图片反色 (Universal Smart Video & Image Invert)
// @name:zh-CN   全网通用智能视频与图片反色
// @name:en      Universal Smart Video & Image Invert
// @namespace    https://github.com/jiozhaoyue/universal-smart-invert
// @version      4.5.0
// @description  全网通用智能视频与图片反色脚本 (v4.5, AGPL-3.0 开源)。新增: Dark Reader 式工具栏弹窗面板, 设置行回显修复 (悬停显示原图开关真实生效), 零白交接防闪光 (深色站点黑→深色绝不闪白), 规则分发 (从链接导入 / 导出学习成果 / 一体化规则包), 窄屏与触控响应式; 保留动态主题/定时模式/字体可读性等全部能力。
// @description:zh-CN 全网通用智能视频与图片反色脚本 (v4.5, AGPL-3.0 开源)。新增: 工具栏弹窗面板、设置回显修复、零白交接防闪光、规则包链接导入与学习成果分享、移动端响应式; 保留全部既有能力。
// @description:en Universal smart video and image invert userscript (v4.5, AGPL-3.0 licensed). New: DarkReader-style toolbar popup, settings-row display-sync fix (hover-restore toggle now truly applies), zero-white flash-guard handoff, rule-pack distribution (URL import / learned-pack export / one-file pack), and mobile-friendly responsive UI. All prior capabilities retained.
// @author       jiozhaoyue
// @license      AGPL-3.0-or-later
// @icon         data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2246%22 fill=%22%231e293b%22 stroke=%22%2338bdf8%22 stroke-width=%228%22/><path d=%22M50 4 A46 46 0 0 1 50 96 Z%22 fill=%22%2338bdf8%22/></svg>
// @homepageURL  https://github.com/jiozhaoyue/universal-smart-invert
// @supportURL   https://github.com/jiozhaoyue/universal-smart-invert/issues
// @updateURL    https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
// @downloadURL  https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
// @match        *://*/*
// @match        file:///*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM.xmlHttpRequest
// @connect      *
// @connect 注释: 唯一保留的联网能力 = (1) 数据与备份面板的规则包链接导入 (仅手动用户动作);
//               (2) 跨域图片像素采样失败时的 blob 回退 (gmFetchBlob, 仅取图片自身数据)。
//               启动/扫描/统计等路径零自动联网 (v4.6 R5: 运行时零自动遥测)。
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
  const SCRIPT_VERSION = '4.5.0';
  const PREFS_KEY = 'universal_smart_invert_v4';   // v2.0 遗留偏好键 (迁移源, 迁移后原样保留以便回滚)
  const LEGACY_KEY = 'universal_smart_invert_v3';  // v1.x 旧键 (仅读取迁移, 保留不删以便回滚)
  const STATS_KEY = 'universal_smart_invert_stats_v1'; // v2.0 遗留统计键 (保留写入以兼容回滚)
  const SVI_PREFIX = 'svi:';                       // v3.0 统一存储命名空间 (全部经 Store 读写)

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

  // v3.3: 图片特效模式清单 (设置页图片区与本站覆盖两处下拉共用; describe 为选中后的动态说明)
  const IMG_FX_MODES = [
    { v: 'full', label: '完整反色', describe: '整图经标准滤镜反色，悬停可查看原图。' },
    { v: 'luma', label: '亮度反色', describe: '仅反色高于明度线且低饱和的浅色像素。' },
    { v: 'key', label: '键色反色', describe: '仅反色接近目标键色的像素。' },
    { v: 'rect', label: '区域反色', describe: '按 Alt+Shift+拖拽框选的区域反色。' },
    { v: 'grayscale', label: '灰度化', describe: '整图去色成为黑白。' },
    { v: 'sepia', label: '怀旧泛黄', describe: '整图呈泛黄暖调。' },
    { v: 'brightness', label: '提亮', describe: '整图提升亮度。' },
    { v: 'custom', label: '自定义', describe: '按画面滤镜参数逐像素处理。' },
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
    siteOverrides: {},         // 本站覆盖: { '<pattern>': { enabled, videoInvert, imageInvert, bgReplace, imgFxMode, excludeSelectors: [], shieldColors: [] } }
    rulesEnabled: true,        // 内置站点规则库总开关 (v3.0 降级为种子/兜底规则)
    shieldColors: [],          // 全局原色屏蔽列表 ('#rrggbb')
    manualOverrides: {},       // Alt+点击手动覆盖记忆: { '<host>|<src>': 'invert' | 'restore' | {rect} } (FIFO 上限 400; 落盘至 svi:overrides)
    statsEnabled: true,        // 本地数据统计开关
    bgReplace: false,          // 背景替换全局默认 (站点覆盖优先)
    bgExcludeSelectors: [],    // 背景替换全局排除选择器 (登录块等)

    // ===== v3.0 新增偏好 (schema 3) =====
    imgFxMode: 'full',         // 图片特效模式: 'full'|'luma'|'key'|'rect'|'grayscale'|'sepia'|'brightness'|'custom'
    imgFxParams: {             // 特效参数 (亮度/键色反色等)
      lumCutoff: 190,          // 亮度反色: 明度阈值 (仅反色 >= 阈值 的像素)
      satCutoff: 0.30,         // 亮度反色: 饱和度上限 (低于该饱和度才参与)
      keyColor: '#ffffff',     // 键色反色: 目标键色 (HEX)
      keyTol: 60,              // 键色反色: 颜色距离容差
    },
    videoFxMode: 'off',        // 视频特效引擎: 'off'(CSS 滤镜) | 'full' | 'luma' | 'key' (GPU 覆盖层)
    timelineMode: 'reference', // 时间线记忆模式: 'off' | 'reference'(参考预布防) | 'takeover'(接管)
    learnHits: 2,              // 自学习规则激活命中次数 (2 ~ 6)
    storeBackend: 'auto',      // 存储后端: 'auto' | 'local' (自动: chrome.sync → GM → localStorage)

    // ===== v3.1 新增偏好 =====
    imagePolicy: 'balanced',   // 图片反色策略 (R4): 'balanced'(默认) | 'conservative' | 'aggressive'(=v3.0 仅尺寸门)
    hoverRestore: true,        // 悬停显示原图 (R5): false 时悬停已反色图片保持反色视图
    eagerScanBudget: 80,       // eager 初始处理预算 (R1): 启动时已加载完成的图片不等待视口交叉, 最多处理 N 张

    // ===== v4.1 新增偏好: 字体覆盖与文字描边 (Dark Reader 吸收项) =====
    fontOverride: false,       // 字体覆盖总开关: 关闭时零开销
    fontFamilyPreset: 'sans',  // 'sans' | 'serif' | 'mono' | 'rounded'
    textStroke: 0,             // 文字描边粗细 px (0 = 关闭, 0 ~ 1)

    // ===== v4.2 新增偏好: 动态深色主题调节 (P1/P2) + 定时模式 (P5) =====
    bgTone: 'pure-black',      // 动态主题色调: 'pure-black' | 'dark-gray' | 'warm-black'
    bgBrightness: 1.0,         // 页面亮度倍率 (0.6 ~ 1.4, 仅动态主题生成路径, 非 filter)
    bgContrast: 1.0,           // 页面对比度倍率 (0.7 ~ 1.5, 仅动态主题生成路径)
    scheduleEnabled: false,    // 定时模式: 仅设定时段自动启用反色
    scheduleStart: 21,         // 起始小时 (0 ~ 23)
    scheduleEnd: 7,            // 结束小时 (0 ~ 23, 支持跨零点)

    // ===== v4.3 新增偏好: 防闪光守卫 =====
    flashGuard: true,          // 防闪光黑底: 深色站点加载前先铺黑底消除白闪 (仅动态主题站生效)

    // ===== v4.6 新增偏好: 暗色遮罩上下文感知 (任务 v4.6-4) =====
    maskAware: true,           // 遮罩感知: 祖先暗色蒙层下合成观感已暗, 不再对媒体自动反色; 关闭即回到旧行为

    // ===== v3.2 新增偏好: 独立视频画面调节 (与反色可组合) =====
    videoTune: {
      enabled: false,          // 总开关: 关闭时不施加任何画面调节 (零开销)
      brightness: 1.0,         // 亮度 (0.30 ~ 1.70, 1 = 原样)
      contrast: 1.0,           // 对比度 (0.30 ~ 1.70)
      saturate: 1.0,           // 饱和度 (0.00 ~ 2.00)
      warmth: 0,               // 暖色 (sepia 0 ~ 1, 夜间护眼)
      grayscale: 0,            // 黑白 (0 ~ 1)
    },

    // ===== v3.3 新增偏好: 设置页布局 + 元素级规则 =====
    settingsLayout: 'center',  // 设置页布局: 'center'(居中窗口) | 'left'(靠左停靠) | 'right'(靠右停靠)
    settingsWidth: 420,        // 停靠形态宽度 px (320 ~ 600)
    elementRules: [],          // 元素级规则: [{ id, pattern, selector, action: 'invert'|'protect', note, createdAt }]

    // ===== v4.6 新增偏好: 本地优先判定 (R1/R2: 判定依据 = 本地已渲染状态, 与网络交付解耦) =====
    localFirstDecide: true,    // 本地优先判定总开关: false 回退 v4.5 旧行为 (未解码等 load, 不做本地保守判定)
  };

  // 运行时状态 (仅存于内存, 每个标签页独立, 绝不写入存储 —— 标签页隔离)
  const runtime = {
    invertActive: false,          // 视频反色当前是否生效
    currentDetectedScene: 'normal',
    userRejectedScene: null,
    normalSceneCount: 0,
    fileAccessBlocked: false,     // file:// 页面且文件访问被拦截 (UI 显示一次性提示)
    fxTransformsInFlight: 0,      // 图片特效当前并发数 (诊断)
  };

  // 智能小元素屏蔽上下文选择器 (p0)
  const CONTENT_CONTEXT_SELECTOR = '.markdown-body, [class*="article"], [class*="content"], .post-content, .rich-text, .comment-content';
  const CHROME_CONTEXT_SELECTOR = 'nav, header, footer, aside, [role="banner"], [class*="logo"], [class*="icon"], [aria-hidden="true"]';
  const META_ICON_RE = /(avatar|user-pic|profile-pic|emoji|emoticon|captcha|\/avatars?\/)/;

  // v4.5: 上下文命中必须排除 html/body —— 子串选择器 ([class*="content"]) 会命中文档根上的
  // 框架类 (实测: Wikipedia 在 <html> 上挂 vector-feature-limited-width-CONTENT-enabled,
  // 全页图片因此全部误判"正文上下文", 策略门/页头保护整体失效)。
  function closestContextHit(el, selector) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      try {
        if (node.matches && node.matches(selector)) return node;
      } catch (e) { /* 非法选择器按未命中处理 */ }
      node = node.parentElement;
    }
    return null;
  }

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
  // 2. 浏览器存储抽象层 (Store - R6: 云同步就绪 + 存储管理)
  //    后端链: chrome.storage.sync → GM_getValue/GM_setValue → localStorage
  //    异步后端 + 同步镜像: 读取零成本, 写入 400ms 防抖批量落盘
  //    命名空间: 全部持久化状态位于 'svi:' 前缀之下; 遗留键迁移后原样保留 (可回滚)
  // ==========================================
  const Store = {
    PREFIX: SVI_PREFIX,
    backend: 'memory',            // 'chrome-sync' | 'chrome-local' | 'gm' | 'local' | 'memory'
    mirror: new Map(),            // 逻辑键 → 已解析值 (内存镜像)
    pending: new Set(),           // 待落盘的逻辑键集合
    flushTimer: null,
    ready: false,
    useChunking: false,           // chrome.storage.sync 单条 8KB 配额 → 大值分片
    CHUNK_SIZE: 7000,             // 每片 JSON 字符数 (预留元数据余量)
    _api: null,                   // 同步后端适配器 {get, set, remove, keys}
    _indexKey: 'svi:index',       // GM 后端无枚举 API → 维护键索引

    // —— 后端探测 (一次性, boot 时; storeBackend 偏好由 applyBackendPref 在状态载入后应用) ——
    detectBackend() {
      try {
        if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.sync) return 'chrome-sync';
        if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) return 'chrome-local';
      } catch (e) { /* ignore */ }
      if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') return 'gm';
      try { if (typeof localStorage !== 'undefined') return 'local'; } catch (e) { /* ignore */ }
      return 'memory';
    },

    // 用户强制本地后端 (storeBackend='local') 时降级重连 (放弃 chrome/GM 云同步)
    applyBackendPref() {
      try {
        if (state && state.storeBackend === 'local' && this.backend !== 'local' && this.backend !== 'memory') {
          this.mirror.clear();
          this.pending.clear();
          this.backend = 'local';
          this.useChunking = false;
          this._api = this._makeLocalApi();
          this.loadFromBackendSync();
        }
      } catch (e) { /* ignore */ }
    },

    // —— 同步后端适配器 (闭包捕获前缀, 避免调用方 this 漂移) ——
    _makeLocalApi() {
      const P = this.PREFIX;
      return {
        get(k) { try { return localStorage.getItem(P + k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(P + k, v); } catch (e) { /* 配额满: 静默降级 */ } },
        remove(k) { try { localStorage.removeItem(P + k); } catch (e) { /* ignore */ } },
        keys() {
          const out = [];
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.indexOf(P) === 0) out.push(k.slice(P.length));
            }
          } catch (e) { /* ignore */ }
          return out;
        },
      };
    },

    _makeGmApi() {
      const P = this.PREFIX;
      const IDX = this._indexKey;
      return {
        get(k) { try { const v = GM_getValue(P + k); return v == null ? null : String(v); } catch (e) { return null; } },
        set(k, v) { try { GM_setValue(P + k, v); } catch (e) { /* ignore */ } },
        remove(k) { try { GM_deleteValue(P + k); } catch (e) { /* ignore */ } },
        keys() {
          const out = [];
          try {
            const idx = GM_getValue(IDX);
            if (typeof idx === 'string' && idx) {
              for (const k of JSON.parse(idx)) out.push(String(k));
            }
          } catch (e) { /* ignore */ }
          return out;
        },
      };
    },

    _makeMemoryApi() {
      const mem = new Map();
      return {
        get(k) { return mem.has(k) ? mem.get(k) : null; },
        set(k, v) { mem.set(k, v); },
        remove(k) { mem.delete(k); },
        keys() { return Array.from(mem.keys()); },
      };
    },

    // chrome.storage 异步适配 (仅插件内容脚本使用; userscript 无 chrome.storage)。
    // 回调内消费 chrome.runtime.lastError (配额满等), 避免控制台告警; set 返回是否成功,
    // 供 flush 的 sync→local 配额降级 (writeLogicalAsync → _degradeToLocal) 判定。
    _makeChromeApi(area) {
      const P = this.PREFIX;
      const lastError = () => {
        try {
          return (typeof chrome !== 'undefined' && chrome && chrome.runtime && chrome.runtime.lastError) || null;
        } catch (e) { return null; }
      };
      return {
        async get(k) {
          const key = P + k;
          return new Promise((resolve) => {
            try {
              area.get(key, (res) => {
                if (lastError()) { resolve(null); return; }
                const v = res && res[key];
                resolve(v == null ? null : String(v));
              });
            } catch (e) { resolve(null); }
          });
        },
        async set(k, v) {
          return new Promise((resolve) => {
            try {
              area.set({ [P + k]: v }, () => resolve(!lastError()));
            } catch (e) { resolve(false); }
          });
        },
        async remove(k) {
          return new Promise((resolve) => {
            try {
              area.remove(P + k, () => resolve(!lastError()));
            } catch (e) { resolve(false); }
          });
        },
        async keys() {
          return new Promise((resolve) => {
            try {
              area.get(null, (res) => {
                if (lastError()) { resolve([]); return; }
                const out = [];
                for (const k of Object.keys(res || {})) {
                  if (k.indexOf(P) === 0) out.push(k.slice(P.length));
                }
                resolve(out);
              });
            } catch (e) { resolve([]); }
          });
        },
      };
    },

    // —— 启动 (同步部分): local/gm/memory 后端立即装载镜像;
    //     chrome 后端保持 ready=false, 由 init() 异步装载 (否则 init 会因 ready 提前返回,
    //     chrome.storage 永远不会读写 —— 插件版持久化将完全失效) ——
    bootSync() {
      this.backend = this.detectBackend();
      this.useChunking = this.backend === 'chrome-sync';
      if (this.backend === 'local') {
        this._api = this._makeLocalApi();
      } else if (this.backend === 'gm') {
        this._api = this._makeGmApi();
      } else if (this.backend === 'memory') {
        this._api = this._makeMemoryApi();
      }
      if (this._api) {
        this.loadFromBackendSync();
        this.ready = true; // 仅同步后端在此完成装载
      }
      return this.backend;
    },

    loadFromBackendSync() {
      try {
        // 记录分片清单键 (svi:K.meta) → 重组
        const keys = this._api.keys();
        const metaKeys = new Set();
        const plain = new Set();
        for (const k of keys) {
          if (k.endsWith('.meta')) metaKeys.add(k.slice(0, -5));
          else plain.add(k);
        }
        for (const logical of new Set([...metaKeys, ...plain])) {
          const raw = this.readRaw(logical);
          if (raw == null) continue;
          try { this.mirror.set(logical, JSON.parse(raw)); } catch (e) { /* 坏值跳过 */ }
        }
        if (this.backend === 'gm') this._syncGmIndex();
      } catch (e) { /* ignore */ }
    },

    readRaw(logical) {
      // 分片读取: 存在 svi:K.meta 时按分片重组, 否则读 svi:K
      try {
        const metaRaw = this._api.get(logical + '.meta');
        if (metaRaw) {
          const meta = JSON.parse(metaRaw);
          let s = '';
          for (let i = 0; i < (meta.chunks || 0); i++) {
            const part = this._api.get(logical + '#' + i);
            if (part == null) return null;
            s += part;
          }
          return s;
        }
      } catch (e) { /* 分片读取失败 → 退回整值 */ }
      return this._api.get(logical);
    },

    _syncGmIndex() {
      // 重建键索引: 已有索引 ∪ 镜像键 (否则 GM_setValue 新写入的键永远不会进入索引,
      // 下次启动 keys() 枚举不到 → 数据丢失)
      try {
        const idx = new Set();
        try {
          const raw = GM_getValue(this._indexKey);
          if (typeof raw === 'string' && raw) {
            for (const k of JSON.parse(raw)) idx.add(String(k));
          }
        } catch (e) { /* 旧索引缺失/损坏: 从镜像重建 */ }
        for (const k of this.mirror.keys()) idx.add(k);
        GM_setValue(this._indexKey, JSON.stringify(Array.from(idx)));
      } catch (e) { /* ignore */ }
    },

    // —— 异步初始化 (chrome.storage 后端; userscript 环境直接完成) ——
    async init() {
      if (this.ready) return this.backend;
      if (!this._api) {
        this.backend = this.detectBackend();
      }
      this.useChunking = this.backend === 'chrome-sync';
      if (this.backend === 'chrome-sync' || this.backend === 'chrome-local') {
        if (!this._api) {
          const area = this.backend === 'chrome-sync' ? chrome.storage.sync : chrome.storage.local;
          this._api = this._makeChromeApi(area);
        }
        try {
          const keys = await this._api.keys();
          const metaKeys = new Set();
          const plain = new Set();
          for (const k of keys) {
            if (k.endsWith('.meta')) metaKeys.add(k.slice(0, -5));
            else plain.add(k);
          }
          for (const logical of new Set([...metaKeys, ...plain])) {
            const raw = await this.readRawAsync(logical);
            if (raw == null) continue;
            try { this.mirror.set(logical, JSON.parse(raw)); } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore */ }
      } else if (!this._api) {
        this.bootSync();
        return this.backend;
      }
      this.ready = true;
      this._remoteLoaded = true;
      // chrome 后端: 远端命名空间装载完成后再做遗留迁移 (此时 mirror 反映云端:
      // 云端已有 svi:prefs → 跳过, 避免本地遗留键每次启动覆盖云端新数据; 云端为空 → 迁移一次)
      try { this.migrateLegacy(); } catch (e) { /* ignore */ }
      if (this.pending.size) this._scheduleFlushSoon(); // init 前排队的写入现在落盘
      if (typeof this.onRemoteLoaded === 'function') {
        try { this.onRemoteLoaded(); } catch (e) { /* ignore */ }
      }
      return this.backend;
    },

    async readRawAsync(logical) {
      try {
        const metaRaw = await this._api.get(logical + '.meta');
        if (metaRaw) {
          const meta = JSON.parse(metaRaw);
          let s = '';
          for (let i = 0; i < (meta.chunks || 0); i++) {
            const part = await this._api.get(logical + '#' + i);
            if (part == null) return null;
            s += part;
          }
          return s;
        }
      } catch (e) { /* ignore */ }
      return this._api.get(logical);
    },

    // —— 分片切分: 按 UTF-8 字节预算 (而非字符数) 切片, 保证含中文等多字节内容的
    //     分片也不超 chrome.storage.sync 单条 8192 字节配额 ——
    chunkRaw(raw) {
      const budget = this.CHUNK_SIZE;
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
        if (acc + bytes > budget) {
          parts.push(raw.slice(start, i));
          start = i;
          acc = 0;
          continue; // 当前字符作为新片首字符重新计入
        }
        acc += bytes;
        i += advance;
      }
      if (start < raw.length) parts.push(raw.slice(start));
      return parts;
    },

    // sync 配额失败 (单条 8KB / 总量 100KB) → 降级 chrome.storage.local 重写,
    // 绝不抛错: 镜像仍是数据源, 失败键与其余镜像键重新排队落盘到 local。
    _degradeToLocal(logical, value) {
      try { this.pending.add(logical); } catch (e) { /* ignore */ }
      if (this.backend === 'chrome-local' || this._degradedToLocal) {
        this._scheduleFlushSoon();
        return;
      }
      try {
        if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.local) return;
        this._degradedToLocal = true;
        this.backend = 'chrome-local';
        this.useChunking = false; // local 无单条 8KB 限制
        this._api = this._makeChromeApi(chrome.storage.local);
        Promise.resolve(this._api.set(logical, JSON.stringify(value))).catch(() => { /* ignore */ });
        for (const k of this.mirror.keys()) this.pending.add(k); // 其余键也迁到 local
        this._scheduleFlushSoon();
        try { console.warn('[SmartInvert] chrome.storage.sync 配额受限, 已降级到 chrome.storage.local (数据不丢失)'); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
    },

    _scheduleFlushSoon() {
      if (this._degradeTimer) return;
      this._degradeTimer = setTimeout(() => {
        this._degradeTimer = null;
        try { this.flush(); } catch (e) { /* ignore */ }
      }, 50);
    },

    // —— 同步 API (镜像读写, 零成本) ——
    get(key, def) {
      if (this.mirror.has(key)) return this.mirror.get(key);
      return def;
    },

    set(key, val) {
      this.mirror.set(key, val);
      this.pending.add(key);
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 400); // 防抖批量落盘
      }
    },

    remove(key) {
      this.mirror.delete(key);
      this.pending.add(key);
      this._removed = this._removed || new Set();
      this._removed.add(key);
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 400);
      }
    },

    keys() {
      return Array.from(this.mirror.keys());
    },

    // —— 落盘: 同步后端直接写; chrome 后端异步写 (含 8KB 分片 + 配额降级) ——
    flush() {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      if (!this.pending.size || !this._api) return;
      const jobs = Array.from(this.pending);
      this.pending.clear();
      const removed = this._removed || new Set();
      this._removed = new Set();

      // 同步后端分片写入/清理 (旧分片/旧清单先清理, 防止缩容后残留脏分片)
      this._writeChunksSync = (logical, raw) => {
        this._clearChunksSync(logical);
        const parts = this.chunkRaw(raw);
        this._api.set(logical + '.meta', JSON.stringify({ chunks: parts.length, bytes: raw.length }));
        for (let i = 0; i < parts.length; i++) this._api.set(logical + '#' + i, parts[i]);
        this._api.remove(logical); // 移除可能存在的旧整值, 避免双写歧义
      };
      this._clearChunksSync = (logical) => {
        try {
          const metaRaw = this._api.get ? this._api.get(logical + '.meta') : null;
          if (metaRaw && typeof metaRaw === 'string') {
            const meta = JSON.parse(metaRaw);
            for (let i = 0; i < (meta.chunks || 0) + 8; i++) this._api.remove(logical + '#' + i);
            this._api.remove(logical + '.meta');
          }
        } catch (e) { /* ignore */ }
      };

      const writeLogical = (logical, value) => {
        const raw = JSON.stringify(value);
        if (this.useChunking && raw.length > this.CHUNK_SIZE) {
          this._writeChunksSync(logical, raw);
        } else {
          // 清理历史分片 (若有)
          this._clearChunksSync(logical);
          this._api.set(logical, raw);
        }
      };

      for (const logical of jobs) {
        try {
          if (removed.has(logical) && !this.mirror.has(logical)) {
            if (this.backend === 'chrome-sync' || this.backend === 'chrome-local') {
              removeLogicalAsync(this, logical); // 分片键: meta + #i + 整值一并清理
            } else {
              this._clearChunksSync(logical);
              this._api.remove(logical);
            }
            continue;
          }
          if (!this.mirror.has(logical)) continue;
          if (this.backend === 'chrome-sync' || this.backend === 'chrome-local') {
            writeLogicalAsync(this, logical, this.mirror.get(logical));
          } else {
            writeLogical(logical, this.mirror.get(logical));
            if (this.backend === 'gm') this._syncGmIndex();
          }
        } catch (e) { /* 单键失败不阻塞其它键 */ }
      }

      // chrome 异步写封装 (独立函数, 避免闭包引用混乱); 配额失败 → 降级 local
      function writeLogicalAsync(store, logical, value) {
        const raw = JSON.stringify(value);
        Promise.resolve().then(async () => {
          if (store.useChunking && raw.length > store.CHUNK_SIZE) {
            const parts = store.chunkRaw(raw);
            // 先清理旧分片 (含缩容残留), 再写新清单与分片
            try {
              const oldMeta = await store._api.get(logical + '.meta');
              if (oldMeta) {
                const m = JSON.parse(oldMeta);
                for (let i = 0; i < (m.chunks || 0) + 8; i++) await store._api.remove(logical + '#' + i);
                await store._api.remove(logical + '.meta');
              }
            } catch (e) { /* ignore */ }
            const okMeta = await store._api.set(logical + '.meta', JSON.stringify({ chunks: parts.length, bytes: raw.length }));
            if (!okMeta) { store._degradeToLocal(logical, value); return; }
            for (let i = 0; i < parts.length; i++) {
              const ok = await store._api.set(logical + '#' + i, parts[i]);
              if (!ok) { store._degradeToLocal(logical, value); return; }
            }
            await store._api.remove(logical);
          } else {
            const ok = await store._api.set(logical, raw);
            if (!ok) { store._degradeToLocal(logical, value); return; }
          }
        }).catch(() => { /* ignore */ });
      }

      // chrome 异步删除封装: 分片值必须连 meta/#i 一起清, 否则下次启动会从残留分片
      // 重组出已被删除的旧值 (删除"复活")
      function removeLogicalAsync(store, logical) {
        Promise.resolve().then(async () => {
          try {
            const metaRaw = await store._api.get(logical + '.meta');
            if (metaRaw) {
              try {
                const meta = JSON.parse(metaRaw);
                for (let i = 0; i < (meta.chunks || 0) + 8; i++) await store._api.remove(logical + '#' + i);
                await store._api.remove(logical + '.meta');
              } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }
          await store._api.remove(logical);
        }).catch(() => { /* ignore */ });
      }
    },

    // —— 存储管理 UI 支持 ——
    describe() {
      const out = [];
      for (const k of this.mirror.keys()) {
        let bytes = 0;
        let preview = '';
        try {
          const raw = JSON.stringify(this.mirror.get(k));
          bytes = raw ? raw.length : 0;
          preview = raw ? raw.slice(0, 60) : '';
        } catch (e) { /* ignore */ }
        out.push({ key: this.PREFIX + k, bytes, preview });
      }
      return out;
    },

    exportAll() {
      const out = {};
      for (const k of this.mirror.keys()) {
        out[this.PREFIX + k] = this.mirror.get(k);
      }
      return out;
    },

    importAll(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
      let n = 0;
      for (const fullKey of Object.keys(obj)) {
        if (typeof fullKey !== 'string' || fullKey.indexOf(this.PREFIX) !== 0) continue;
        const logical = fullKey.slice(this.PREFIX.length);
        if (!logical || logical.endsWith('.meta') || logical.indexOf('#') !== -1) continue;
        try { this.set(logical, obj[fullKey]); n++; } catch (e) { /* ignore */ }
      }
      return n;
    },

    clearNamespace() {
      const keys = this.mirror.keys();
      for (const k of Array.from(keys)) this.remove(k);
      // 兜底: 清理镜像之外可能残留的命名空间键 (分片/meta)
      try {
        for (const k of this._api.keys()) {
          if (k.endsWith('.meta') || k.indexOf('#') !== -1) this._api.remove(k);
        }
      } catch (e) { /* ignore */ }
      this.flush();
    },

    // —— 遗留键迁移 (v2.0 → svi: 命名空间; 遗留键永不删除, 便于回滚) ——
    migrateLegacy() {
      // chrome 异步后端: 远端命名空间未装载完成前绝不迁移
      // (mirror 为空会被误判为"首次运行", 本地遗留键将每次启动覆盖云端数据)
      if ((this.backend === 'chrome-sync' || this.backend === 'chrome-local') && !this._remoteLoaded) return false;
      if (this.mirror.has('prefs')) return false;
      let legacy = null;
      try {
        const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_KEY);
        if (raw) legacy = JSON.parse(raw);
      } catch (e) { legacy = null; }
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        const mo = legacy.manualOverrides;
        const prefsCopy = Object.assign({}, legacy);
        delete prefsCopy.manualOverrides;
        this.set('prefs', prefsCopy);
        if (mo && typeof mo === 'object' && !Array.isArray(mo)) this.set('overrides', mo);
      }
      try {
        const sraw = localStorage.getItem(STATS_KEY);
        if (sraw && !this.mirror.has('stats')) this.set('stats', JSON.parse(sraw));
      } catch (e) { /* ignore */ }
      return true;
    },

    // —— 测试钩子: 替换后端适配器 (Node 单测 chrome.storage 模拟用) ——
    __useBackend(name, api) {
      this.backend = name;
      this.useChunking = name === 'chrome-sync';
      this._api = api;
      this.ready = true;
    },
  };

  // 立即同步启动 (local/gm 后端零异步; chrome 后端由 boot 流程补 init)
  Store.bootSync();


  // ==========================================
  // 3. 状态持久化与偏好读写 (v3 → v4 迁移 + svi: 命名空间迁移)
  // ==========================================
  // v4.1: 字体预设栈 (中文优先; loadState 规范化白名单也依赖此表, 必须先于 loadState 定义)
  const FONT_STACKS = {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    serif: '"Noto Serif SC", "Source Han Serif SC", Georgia, "SimSun", serif',
    mono: 'ui-monospace, "Cascadia Code", Consolas, "JetBrains Mono", "Microsoft YaHei", monospace',
    rounded: '"HarmonyOS Sans SC", "MiSans", "PingFang SC", "YouYuan", "幼圆", "Microsoft YaHei", sans-serif',
  };

  let state = loadState();
  try { Store.migrateLegacy(); } catch (e) { /* ignore */ }
  try { Store.applyBackendPref(); } catch (e) { /* ignore */ }

  function loadState() {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    let stored = null;
    let fromLegacy = false;
    try {
      // 1) svi: 命名空间 (Store 镜像, 由 bootSync/init 装载)
      const nsPrefs = Store.get('prefs', null);
      if (nsPrefs && typeof nsPrefs === 'object') {
        stored = nsPrefs;
      } else {
        // 2) 遗留键链: v4 → v3 (迁移源, 读取后原样保留)
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
      }
    } catch (e) {
      console.warn('[SmartInvert] Failed to load prefs:', e);
      stored = null;
    }

    const safeStored = (stored && typeof stored === 'object') ? stored : {};
    const merged = { ...defaults, ...safeStored };
    // 对象字段深合并, 防止旧数据缺键导致整块丢失
    merged.imgPresets = { ...defaults.imgPresets, ...(safeStored.imgPresets || {}) };
    merged.imgFxParams = { ...defaults.imgFxParams, ...(safeStored.imgFxParams || {}) };
    merged.siteOverrides = { ...(safeStored.siteOverrides || {}) };
    merged.pos = { ...defaults.pos, ...(safeStored.pos || {}) };
    // v2.0 字段规范化: 存储层数据异常 (损坏/手工篡改) 时回退默认, 防止引擎与 UI 崩溃
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
    // v3.0 字段规范化 (schema 3)
    if (['full', 'luma', 'key', 'rect', 'grayscale', 'sepia', 'brightness', 'custom'].indexOf(merged.imgFxMode) === -1) {
      merged.imgFxMode = 'full';
    }
    merged.imgFxParams.lumCutoff = clampNumber(merged.imgFxParams.lumCutoff, 100, 255, 190);
    merged.imgFxParams.satCutoff = clampNumber(merged.imgFxParams.satCutoff, 0, 1, 0.30);
    merged.imgFxParams.keyTol = clampNumber(merged.imgFxParams.keyTol, 10, 160, 60);
    if (typeof merged.imgFxParams.keyColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(merged.imgFxParams.keyColor)) {
      merged.imgFxParams.keyColor = '#ffffff';
    }
    if (['off', 'full', 'luma', 'key'].indexOf(merged.videoFxMode) === -1) merged.videoFxMode = 'off';
    if (['off', 'reference', 'takeover'].indexOf(merged.timelineMode) === -1) merged.timelineMode = 'reference';
    merged.learnHits = Math.round(clampNumber(merged.learnHits, 2, 6, 2));
    if (merged.storeBackend !== 'local' && merged.storeBackend !== 'auto') merged.storeBackend = 'auto';
    // v3.1 字段规范化
    if (['balanced', 'conservative', 'aggressive'].indexOf(merged.imagePolicy) === -1) merged.imagePolicy = 'balanced';
    merged.hoverRestore = merged.hoverRestore !== false;
    merged.eagerScanBudget = Math.round(clampNumber(merged.eagerScanBudget, 10, 500, 80));
    // v4.6 字段规范化: 本地优先判定开关 (布尔; 损坏数据回退默认开)
    merged.localFirstDecide = merged.localFirstDecide !== false;
    // v3.2 字段规范化: 视频画面调节对象逐字段钳制 (损坏数据回退默认)
    merged.videoTune = { ...defaults.videoTune, ...(safeStored.videoTune || {}) };
    merged.videoTune.enabled = merged.videoTune.enabled === true;
    merged.videoTune.brightness = clampNumber(merged.videoTune.brightness, 0.3, 1.7, 1.0);
    merged.videoTune.contrast = clampNumber(merged.videoTune.contrast, 0.3, 1.7, 1.0);
    merged.videoTune.saturate = clampNumber(merged.videoTune.saturate, 0, 2, 1.0);
    merged.videoTune.warmth = clampNumber(merged.videoTune.warmth, 0, 1, 0);
    merged.videoTune.grayscale = clampNumber(merged.videoTune.grayscale, 0, 1, 0);
    // v3.3 字段规范化: 设置页布局 / 停靠宽度 / 元素级规则
    if (['center', 'left', 'right'].indexOf(merged.settingsLayout) === -1) merged.settingsLayout = 'center';
    merged.settingsWidth = Math.round(clampNumber(merged.settingsWidth, 320, 600, 420));
    merged.elementRules = normalizeElementRules(merged.elementRules);
    // v4.1 字段规范化: 字体覆盖与描边 (布尔 / 枚举白名单 / 数值钳制)
    merged.fontOverride = merged.fontOverride === true;
    if (!FONT_STACKS[merged.fontFamilyPreset]) merged.fontFamilyPreset = 'sans';
    {
      const strokeN = Number(merged.textStroke);
      merged.textStroke = (isNaN(strokeN) ? 0 : Math.max(0, Math.min(1, strokeN)));
    }
    // v4.2 字段规范化: 动态主题与定时模式
    if (['pure-black', 'dark-gray', 'warm-black'].indexOf(merged.bgTone) === -1) merged.bgTone = 'pure-black';
    merged.bgBrightness = clampNumber(merged.bgBrightness, 0.6, 1.4, 1.0);
    merged.bgContrast = clampNumber(merged.bgContrast, 0.7, 1.5, 1.0);
    merged.scheduleEnabled = merged.scheduleEnabled === true;
    merged.scheduleStart = Math.round(clampNumber(merged.scheduleStart, 0, 23, 21));
    merged.scheduleEnd = Math.round(clampNumber(merged.scheduleEnd, 0, 23, 7));
    // v4.3 字段规范化: 防闪光守卫 (默认开)
    merged.flashGuard = merged.flashGuard !== false;
    // v4.6 字段规范化: 暗色遮罩上下文感知 (默认开)
    merged.maskAware = merged.maskAware !== false;
    // 标签页隔离: 运行时状态绝不入库
    delete merged.invertActive;

    // 手动覆盖记忆: 落盘位于 svi:overrides 独立键 (容量大, 与偏好分键管理)
    let overrides = Store.get('overrides', null);
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      overrides = (safeStored && safeStored.manualOverrides && typeof safeStored.manualOverrides === 'object')
        ? safeStored.manualOverrides : {};
    }
    merged.manualOverrides = overrides;

    if (fromLegacy) {
      // 迁移落盘 (旧 v3 键原样保留, 便于回滚)
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch (e) { /* ignore */ }
    }
    return merged;
  }

  function clampNumber(v, min, max, def) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  // 元素级规则归一化 (纯函数, 可单测): 过滤坏条目, 补齐 id, FIFO 上限 200 (保留最新)
  function normalizeElementRules(list) {
    const src = Array.isArray(list) ? list.slice(-200) : [];
    const out = [];
    const seen = new Set(); // v4.5: 按 (pattern|selector|action) 去重 —— 合并导入必须幂等
    for (const raw of src) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const pattern = String(raw.pattern || '').trim();
      const selector = String(raw.selector || '').trim();
      const action = raw.action === 'protect' ? 'protect' : (raw.action === 'invert' ? 'invert' : (raw.action === 'recolor' ? 'recolor' : ''));
      if (!pattern || !selector || !action) continue;
      const id = String(raw.id || hash32(pattern + '|' + selector + '|' + action));
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        pattern,
        selector,
        action,
        note: typeof raw.note === 'string' ? raw.note : '',
        createdAt: Number(raw.createdAt) || 0,
      });
    }
    return out;
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
    // 遗留 v4 键双写 (回滚通道; v2.0 语义保持不变)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[SmartInvert] Failed to save prefs:', e);
    }
    // svi: 命名空间: 偏好与手动覆盖分键落盘 (manualOverrides 独立为 svi:overrides)
    try {
      const prefsCopy = Object.assign({}, state);
      delete prefsCopy.manualOverrides;
      Store.set('prefs', prefsCopy);
      Store.set('overrides', state.manualOverrides || {});
    } catch (e) { /* ignore */ }
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
    // v4.2: 站点电源 (含定时档) 挂起时强制熄灭门类 —— 挂起期间 profile 可能仍 enabled
    const imgOn = !!state.imageInvert && runtime.siteActive !== false && profile.enabled !== false && profile.imageInvert !== false;
    if (document.documentElement) {
      document.documentElement.style.setProperty('--svi-img-filter', f);
      document.documentElement.style.setProperty('--svi-img-transition', t);
      document.documentElement.classList.toggle('svi-img-invert-on', imgOn);
      // v3.1 R5: 悬停还原开关门类 (关闭后 :hover 还原规则不再命中, 悬停保持反色视图)
      document.documentElement.classList.toggle('svi-hover-restore', state.hoverRestore !== false);
    }
    if (document.body) {
      document.body.classList.toggle('svi-img-invert-on', imgOn);
    }
  }

  // ===== v3.2: 独立视频画面调节 (R1) =====
  // 纯函数: 由 videoTune 偏好构建 CSS filter 链; 关闭或全中性时返回 '' (零开销)
  function buildVideoTuneFilter(t) {
    if (!t || t.enabled !== true) return '';
    const clamp = (v, lo, hi, def) => {
      const n = Number(v);
      if (isNaN(n)) return def;
      return Math.min(hi, Math.max(lo, n));
    };
    const parts = [];
    const b = clamp(t.brightness, 0.3, 1.7, 1.0);
    const c = clamp(t.contrast, 0.3, 1.7, 1.0);
    const s = clamp(t.saturate, 0, 2, 1.0);
    const w = clamp(t.warmth, 0, 1, 0);
    const g = clamp(t.grayscale, 0, 1, 0);
    if (Math.abs(b - 1) > 0.001) parts.push(`brightness(${b.toFixed(2)})`);
    if (Math.abs(c - 1) > 0.001) parts.push(`contrast(${c.toFixed(2)})`);
    if (Math.abs(s - 1) > 0.001) parts.push(`saturate(${s.toFixed(2)})`);
    if (w > 0.001) parts.push(`sepia(${w.toFixed(2)})`);
    if (g > 0.001) parts.push(`grayscale(${g.toFixed(2)})`);
    return parts.join(' ');
  }

  // 应用器: 同步 CSS 变量 + 门控类, 并让活动视频的内联滤镜重组 (反色链 + 画面调节链)
  function applyVideoTune() {
    const tuneFilter = buildVideoTuneFilter(state.videoTune);
    if (document.documentElement) {
      document.documentElement.style.setProperty('--svi-video-tune', tuneFilter || 'none');
      document.documentElement.classList.toggle('svi-video-tune', !!tuneFilter);
    }
    // 活动视频可能正被反色 (内联滤镜优先级高于样式表规则) → 重组内联链以叠加画面调节
    const probe = (window.__svi && window.__svi.engines) ? window.__svi.engines.video : null;
    if (probe && probe.currentVideo) {
      probe.applyFilterToCurrent();
    }
  }

  // ===== v4.0: 站点电源热生效层 =====
  // runtime 态 (绝不落盘): false 时页面必须呈现"脚本未运行"——引擎入口全闸, 副作用全拆。
  // 挂起清单: html 门类 / data-svi-* 属性族 / 视频内联滤镜与特效覆盖层 / 背景替换 / 胶囊折叠。
  function stripSviSideEffects() {
    try {
      document.querySelectorAll(
        '[data-svi-inverted], [data-svi-bginv], [data-svi-checked-src], [data-svi-fx], [data-svi-fx-off], [data-svi-checked], [data-svi-bgr-bg], [data-svi-bgr-bd], [data-svi-bgr-fg]'
      ).forEach((el) => {
        el.removeAttribute('data-svi-inverted');
        el.removeAttribute('data-svi-bginv');
        el.removeAttribute('data-svi-checked-src');
        el.removeAttribute('data-svi-fx');
        el.removeAttribute('data-svi-fx-off');
        el.removeAttribute('data-svi-checked');
        el.removeAttribute('data-svi-bgr-bg');
        el.removeAttribute('data-svi-bgr-bd');
        el.removeAttribute('data-svi-bgr-fg');
      });
      document.querySelectorAll('.svi-fx-overlay').forEach((el) => { try { el.remove(); } catch (e) { /* ignore */ } });
      document.querySelectorAll('.svi-playing, .svi-fx-hover').forEach((el) => {
        try { el.classList.remove('svi-playing', 'svi-fx-hover'); } catch (e) { /* ignore */ }
      });
      try {
        document.documentElement.classList.remove('svi-font-on', 'svi-stroke-on'); // v4.1 字体/描边一并拆除
        document.documentElement.removeAttribute('data-svi-bgr-partial'); // v4.3 局部改色门一并拆除
      } catch (e) { /* ignore */ }
      document.querySelectorAll('video[data-svi-poster]').forEach((v) => {
        if (v.dataset) delete v.dataset.sviPoster;
      });
    } catch (e) { /* ignore */ }
  }

  function applySitePower(on) {
    const eng = (window.__svi && window.__svi.engines) || {};
    if (!on) {
      if (runtime.siteActive === false) return;
      runtime.siteActive = false;
      // 视频链: 退出反色态, 撤内联滤镜, 释放特效覆盖层 (检测循环经 profile 闸自行休眠)
      const hil = eng.hil || null;
      if (hil && runtime.invertActive) {
        runtime.invertActive = false;
        try {
          const cv = hil.probe && hil.probe.currentVideo;
          if (cv && hil.timeline) hil.timeline.recordEnd(cv);
        } catch (e) { /* ignore */ }
      }
      try {
        const cv = hil && hil.probe && hil.probe.currentVideo;
        if (cv) {
          cv.style.removeProperty('filter');
          cv.style.removeProperty('transition');
        }
      } catch (e) { /* ignore */ }
      try { eng.videoFx && eng.videoFx.teardown(); } catch (e) { /* ignore */ }
      stripSviSideEffects();
      try { updateImageFilterCss(); } catch (e) { /* ignore */ } // profile.enabled=false → 门类移除
      try {
        document.documentElement.classList.remove('svi-video-tune');
        document.documentElement.style.setProperty('--svi-video-tune', 'none');
      } catch (e) { /* ignore */ }
      try { applyBackgroundReplace(false); } catch (e) { /* ignore */ }
      try { window.__svi.ui && window.__svi.ui.setSiteOffState(true); } catch (e) { /* ignore */ }
    } else {
      if (runtime.siteActive === true) return;
      runtime.siteActive = true;
      if (!window.__svi.enginesBooted) {
        bootEngines(); // 开机即禁用的页面: 电源热启用时首启引擎簇
      } else {
        try { window.__svi_image_engine && window.__svi_image_engine.clearCacheAndRescan(); } catch (e) { /* ignore */ }
        try {
          const bg = eng.bgImage;
          if (bg && typeof bg.sweep === 'function') bg.sweep();
        } catch (e) { /* ignore */ }
        try { if (getSiteProfile().bgReplace) applyBackgroundReplace(true); } catch (e) { /* ignore */ }
      }
      try { updateImageFilterCss(); } catch (e) { /* ignore */ } // 恢复门类 (enabled=true → 重新点亮)
      try { applyVideoTune(); } catch (e) { /* ignore */ }      // 恢复视频画面调节
      try { updateFontCss(); } catch (e) { /* ignore */ }       // 恢复字体覆盖与描边
      try { window.__svi.ui && window.__svi.ui.setSiteOffState(false); } catch (e) { /* ignore */ }
      try { window.__svi.ui && window.__svi.ui.syncVisuals(); } catch (e) { /* ignore */ }
    }
  }

  // ===== v4.2 P5: 定时模式 (时段外等同站点停用; 支持跨零点; 起止相同视为全天) =====
  function scheduleActiveNow() {
    if (!state.scheduleEnabled) return true;
    const h = new Date().getHours();
    const s = Math.round(Number(state.scheduleStart) || 0);
    const e = Math.round(Number(state.scheduleEnd) || 0);
    if (s === e) return true;
    return s < e ? (h >= s && h < e) : (h >= s || h < e);
  }

  function evaluateSitePower() {
    let on = true;
    try { on = getSiteProfile().enabled !== false && scheduleActiveNow(); } catch (e) { /* ignore */ }
    applySitePower(on);
  }

  // ===== v4.1: 字体覆盖与文字描边 (Dark Reader 吸收项) =====
  // CSS 变量 + html 门类 (非 filter, 不触碰"禁止 html/body 滤镜"硬规则); 站点挂起即灭。
  function updateFontCss() {
    if (!document.documentElement) return;
    const on = state.fontOverride === true && runtime.siteActive !== false;
    const strokePx = Number(state.textStroke) || 0;
    const strokeOn = strokePx > 0.001 && runtime.siteActive !== false;
    document.documentElement.style.setProperty('--svi-font-family', FONT_STACKS[state.fontFamilyPreset] || FONT_STACKS.sans);
    document.documentElement.style.setProperty('--svi-text-stroke', strokePx.toFixed(2) + 'px');
    document.documentElement.classList.toggle('svi-font-on', on);
    document.documentElement.classList.toggle('svi-stroke-on', strokeOn);
  }

  // ==========================================
  // 4. 通用工具函数 (颜色 / 模式匹配 / 调度 / 手动覆盖)
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

  // ===== v4.2 P1/P2: 动态深色主题调节 (纯函数, 单测契约) =====
  // 默认参数 (pure-black/1/1) 恒等 —— 既有桶配色与 bench 登录块隔离场景不受影响。
  // tone 只染背景/边框 (文字用 'pure-black' 传入以保持可读), brightness/contrast 作用于全部。
  function applyDynamicThemeAdjust(rgb, tone, brightness, contrast) {
    let r = rgb[0], g = rgb[1], b = rgb[2];
    if (tone === 'dark-gray') {
      // 抬底: 深色端不低于 ~#1a1c20 一带, 纯黑改深灰, 长时间阅读更柔和 (微冷偏防脏灰)
      const floor = 26;
      const lum = Math.min(r, Math.min(g, b));
      if (lum < floor) {
        const lift = floor - lum;
        r += lift; g += lift; b += lift + 2;
      }
    } else if (tone === 'warm-black') {
      // 暖色夜档: 压蓝增红, 近似低色温护眼
      b *= 0.82; g *= 0.94; r *= 1.04;
    }
    const bMul = Number(brightness);
    const cMul = Number(contrast);
    if (bMul === 1 && cMul === 1) {
      return [
        Math.max(0, Math.min(255, Math.round(r))),
        Math.max(0, Math.min(255, Math.round(g))),
        Math.max(0, Math.min(255, Math.round(b))),
      ];
    }
    const bm = (isNaN(bMul) ? 1 : Math.max(0.6, Math.min(1.4, bMul))) - 1;
    const cm = isNaN(cMul) ? 1 : Math.max(0.7, Math.min(1.5, cMul));
    const off = bm * 96;
    return [
      Math.max(0, Math.min(255, Math.round((r - 128) * cm + 128 + off))),
      Math.max(0, Math.min(255, Math.round((g - 128) * cm + 128 + off))),
      Math.max(0, Math.min(255, Math.round((b - 128) * cm + 128 + off))),
    ];
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

  // 元素级规则首条命中 (数组顺序即优先级; 规则列表来自站点档案, pattern 已按主机过滤)
  function firstMatchingElementRule(el, rules) {
    if (!el || !Array.isArray(rules) || rules.length === 0) return null;
    for (const rule of rules) {
      if (rule && safeMatches(el, [rule.selector])) return rule;
    }
    return null;
  }

  // ==========================================
  // v4.6 暗色遮罩上下文 (纯函数, 无副作用, 只读) —— 任务 v4.6-4
  // 场景: 祖先容器存在绘制在媒体之上的暗色半透明蒙层 (::after/::before 覆盖层、
  //   兄弟覆盖层节点、低不透明度媒体叠深色实底), 合成观感已暗 —— 此时按媒体自身
  //   像素反色会破坏站点设计的合成效果 (用户: 「视觉还好, 但原图是亮的」)。
  // 注意: 祖先容器"自身背景"绘制在图片之下, 不构成蒙层 (对不透明媒体不可见), 不检测。
  // 预算 (C3): 祖先 ≤ MASK_VEIL_DEPTH 层; 目标 rect 至多读 1 次, 蒙层节点 rect 有界
  //   (兄弟 ≤4); 全程只读不写入, 连续批量读不触发多次强制布局。
  // 保守性 (C2/C4): 仅高置信形态判 masked; 白/浅蒙层绝不触发; 证据不足沿用旧管线;
  //   任何异常按"未检出"返回, 绝不抛错。
  // 返回 { masked, reason, veilLum, coverage } (纯诊断字段, 不含 DOM 引用)。
  // ==========================================
  const MASK_VEIL_DEPTH = 3;       // 祖先检查层数预算
  const MASK_VEIL_COVER_MIN = 0.8; // 蒙层对目标的几何覆盖率下限 (C4: 覆盖不足不触发)
  const MASK_COMPOSITE_MAX = 150;  // 最亮白像素经蒙层合成后的亮度上限 (低于即"观感已暗")

  // 合成观感: 最亮白 (255) 以 alpha 透明度混入亮度 lum 的蒙层后的合成亮度
  function maskCompositeWhite(alpha, lum) {
    return 255 * (1 - alpha) + lum * alpha;
  }

  // 从 backgroundImage 计算值提取渐变色标, 返回"压暗最强"的色标; 无色标返回 null。
  // 兼容 rgba(0,0,0,.62) 与 rgb(0 0 0 / .62) 两种序列化; 计算样式不会输出百分比 alpha。
  function maskStrongestGradientStop(bgImage) {
    if (!bgImage || typeof bgImage !== 'string' || bgImage.indexOf('gradient') === -1) return null;
    let best = null;
    try {
      const stops = bgImage.match(/rgba?\(([^)]+)\)/gi) || [];
      for (const raw of stops) {
        const nums = raw.match(/\d+\.?\d*/g);
        if (!nums || nums.length < 3) continue;
        const r = Number(nums[0]);
        const g = Number(nums[1]);
        const b = Number(nums[2]);
        if (!(r <= 255 && g <= 255 && b <= 255)) continue;
        const a = nums.length >= 4 ? Math.min(1, Math.max(0, Number(nums[3]))) : 1;
        const lum = relLuminance(r, g, b);
        const comp = maskCompositeWhite(a, lum);
        if (!best || comp < best.comp) best = { comp, alpha: a, lum };
      }
    } catch (e) { return null; }
    return best;
  }

  // 单个蒙层节点的填充判定: 计算样式存在足够压暗的填充来源 (暗色纯色/暗渐变色标/
  // backdrop-filter 变暗)。返回 { comp, lum } 或 null。
  function maskVeilFill(cs) {
    try {
      const bgC = parseColorString(cs.backgroundColor);
      if (bgC && bgC[3] > 0) {
        const lum = relLuminance(bgC[0], bgC[1], bgC[2]);
        const comp = maskCompositeWhite(bgC[3], lum);
        if (comp < MASK_COMPOSITE_MAX) return { comp, lum };
      }
      const stop = maskStrongestGradientStop(cs.backgroundImage);
      if (stop && stop.comp < MASK_COMPOSITE_MAX) return stop;
      const bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
      const mb = /brightness\(([\d.]+)\)/i.exec(String(bf));
      if (mb) {
        const factor = parseFloat(mb[1]);
        if (factor > 0 && factor < 0.6) return { comp: 255 * factor, lum: 255 * factor };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // 层叠判定: 蒙层是否绘制在目标之上。目标为 static 时定位蒙层恒在其上;
  // 目标参与定位时按数值 z-index (auto 视作 0) 比较, 相同则绘制顺序在后者胜 (保守)。
  function maskPaintsAbove(targetCs, veilCs, veilPaintsLater) {
    try {
      if (targetCs.position === 'static') return true;
      const zt = parseInt(targetCs.zIndex, 10) || 0;
      const zv = parseInt(veilCs.zIndex, 10) || 0;
      return zv > zt || (zv === zt && !!veilPaintsLater);
    } catch (e) { return false; }
  }

  // 覆盖率: 蒙层矩形与目标矩形的交叠面积 / 目标面积
  function maskCoverage(veilRect, targetRect) {
    const x1 = Math.max(veilRect.left, targetRect.left);
    const y1 = Math.max(veilRect.top, targetRect.top);
    const x2 = Math.min(veilRect.right, targetRect.right);
    const y2 = Math.min(veilRect.bottom, targetRect.bottom);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / (targetRect.width * targetRect.height);
  }

  // 主入口: 检测元素是否处于"暗色蒙层上下文" (形态 1 祖先伪元素覆盖层 / 形态 2 兄弟
  // 覆盖层节点 / 形态 3 低不透明度叠深底)。决策管线仅在拦截"自动反色"时消费本结果。
  function maskedDarkContext(el) {
    const res = { masked: false, reason: '', veilLum: 0, coverage: 0 };
    try {
      if (!el || el.nodeType !== 1 || typeof el.getBoundingClientRect !== 'function') return res;
      const targetRect = el.getBoundingClientRect();
      if (!(targetRect.width > 4 && targetRect.height > 4)) return res;

      // 形态 3: 媒体自身低不透明度叠在直接容器深色实底上 (opacity 合成压暗)
      const parent = el.parentElement;
      if (parent && parent.nodeType === 1) {
        const selfOp = parseFloat(window.getComputedStyle(el).opacity);
        if (selfOp < 0.9) {
          const bgC = parseColorString(window.getComputedStyle(parent).backgroundColor);
          if (bgC && bgC[3] >= 0.9) {
            const lum = relLuminance(bgC[0], bgC[1], bgC[2]);
            if (maskCompositeWhite(selfOp, lum) < MASK_COMPOSITE_MAX) {
              res.masked = true;
              res.reason = 'self-opacity-over-dark';
              res.veilLum = lum;
              res.coverage = 1;
              return res;
            }
          }
        }
      }

      // 形态 1/2: 沿祖先 (≤3 层) 查找绘制在目标之上的暗色覆盖蒙层
      const targetCs = window.getComputedStyle(el);
      let node = el.parentElement;
      for (let depth = 0; node && node.nodeType === 1 && depth < MASK_VEIL_DEPTH; depth++) {
        const hostRect = node.getBoundingClientRect();

        // 形态 1: 祖先的 ::after / ::before 定位覆盖层 (几何以宿主矩形近似, inset:0 铺满)
        for (let pi = 0; pi < 2; pi++) {
          const pseudo = pi === 0 ? '::after' : '::before';
          const cs = window.getComputedStyle(node, pseudo);
          if (!cs || cs.content === 'none' || cs.position === 'static') continue;
          const fill = maskVeilFill(cs);
          if (!fill) continue;
          const cover = maskCoverage(hostRect, targetRect);
          if (cover < MASK_VEIL_COVER_MIN) continue;
          if (!maskPaintsAbove(targetCs, cs, pi === 0)) continue;
          res.masked = true;
          res.reason = 'ancestor-veil';
          res.veilLum = fill.lum;
          res.coverage = cover;
          return res;
        }

        // 形态 2 (仅第一层容器): 兄弟绝对定位覆盖层节点 (rect 读取有界 ≤4)
        if (depth === 0 && node.children) {
          const kids = node.children;
          let rectReads = 0;
          for (let i = 0; i < kids.length && rectReads < 4; i++) {
            const sib = kids[i];
            if (!sib || sib === el || sib.nodeType !== 1) continue;
            let scs = null;
            try { scs = window.getComputedStyle(sib); } catch (e) { continue; }
            if (!scs || (scs.position !== 'absolute' && scs.position !== 'fixed')) continue;
            const fill = maskVeilFill(scs);
            if (!fill) continue;
            rectReads++;
            const cover = maskCoverage(sib.getBoundingClientRect(), targetRect);
            if (cover < MASK_VEIL_COVER_MIN) continue;
            if (!maskPaintsAbove(targetCs, scs, true)) continue;
            res.masked = true;
            res.reason = 'sibling-veil';
            res.veilLum = fill.lum;
            res.coverage = cover;
            return res;
          }
        }

        node = node.parentElement;
      }
    } catch (e) { /* 保守: 任何异常按未检出处理 */ }
    return res;
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
    // 硬兜底: 无头/CDP/重载环境下 rIC 可能被无限推迟 (实测 4s+ 不触发),
    // rIC 与 setTimeout 双通道竞速, 无论哪条先到都保证执行且只执行一次。
    let done = false;
    const run = () => { if (done) return; done = true; fn(); };
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout });
      setTimeout(run, timeout + 100);
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

  // 站点档案键: file:// 页面统一归并为 'file:' (本地文件无有意义主机名)
  function profileKey() {
    try {
      if (location.protocol === 'file:') return 'file:';
    } catch (e) { /* ignore */ }
    return location.hostname || '';
  }

  // 32 位字符串散列 (djb2) → 8 位十六进制; 用于 src 指纹 / fx 样式 id
  function hash32(str) {
    let h = 5381;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // 媒体元素统一取源: img(currentSrc) / SVG image(href) / input[type=image](src) / data-src 兜底
  function getMediaSrc(el) {
    try {
      if (!el) return '';
      if (typeof el.currentSrc === 'string' && el.currentSrc) return el.currentSrc;
      if (el.href && typeof el.href.baseVal === 'string' && el.href.baseVal) return el.href.baseVal;
      if (typeof el.src === 'string' && el.src) return el.src;
      if (typeof el.getAttribute === 'function') {
        return el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('href') || '';
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  // 元素渲染尺寸 (clientWidth 为 0 的 SVG image / input 等回退 getBoundingClientRect)
  function mediaClientSize(el) {
    let w = el.clientWidth || 0;
    let h = el.clientHeight || 0;
    if ((!w || !h) && typeof el.getBoundingClientRect === 'function') {
      try {
        const rect = el.getBoundingClientRect();
        w = w || Math.round(rect.width) || 0;
        h = h || Math.round(rect.height) || 0;
      } catch (e) { /* ignore */ }
    }
    if ((!w || !h) && typeof el.getBoundingClientRect !== 'function') {
      w = w || el.naturalWidth || el.width || 0;
      h = h || el.naturalHeight || el.height || 0;
    }
    return [w || 0, h || 0];
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

  // ===== v4.6 Alt+点击手动结论防覆盖层 =====
  // 元素级手动标记读取 (无 src 的 canvas/背景元素也受保护):
  // data-svi-manual="invert|restore" 由 toggleMediaOverride 点击时同帧写入
  function manualStateFor(el) {
    try {
      // 守卫放宽为能力检测: 测试桩/跨壳元素可能没有 nodeType (只要求可读写属性)
      if (!el || typeof el.getAttribute !== 'function') return null;
      const m = el.getAttribute('data-svi-manual');
      if (m === 'invert') return true;
      if (m === 'restore') return false;
      const src = getMediaSrc(el);
      if (src) {
        const ov = state.manualOverrides[manualOverrideKey(profileKey(), src)];
        if (ov === 'invert') return true;
        if (ov === 'restore') return false;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // 反色状态写点唯一收口 (v4.6 C3): 所有决策来源的 data-svi-inverted 写入/摘除一律经此门。
  // 规则 (v4.6 C2): 非 manual 来源写入前先解析手动结论 —— 手动结论存在则以其为准 (幂等占优),
  // 杜绝 fx 投递回调 / canvas 首扫 / 重扫把用户 Alt+点击结论拉回。
  // 例外: reason='manual' (手动本身) 与 'fx-mutex' (fx 投递与滤镜互斥的机械摘除) 直写。
  // 返回实际生效的原因码 ('manual' = 发生了手动占优改写)。
  function applyInvertState(el, wantInvert, reason) {
    // 守卫放宽为能力检测: 测试桩/跨壳元素可能没有 nodeType (只要求可读写属性)
    if (!el || typeof el.setAttribute !== 'function' || typeof el.getAttribute !== 'function') return reason || '';
    let want = !!wantInvert;
    let why = reason || 'pixel';
    if (why !== 'manual' && why !== 'fx-mutex') {
      const manual = manualStateFor(el);
      if (manual !== null) {
        want = manual;
        why = 'manual';
      }
    }
    try {
      const cur = el.getAttribute('data-svi-inverted') === 'true';
      if (cur !== want) {
        if (want) {
          el.setAttribute('data-svi-inverted', 'true');
          try { StatsManager.count('imagesInverted'); } catch (e2) { /* ignore */ }
        } else {
          el.removeAttribute('data-svi-inverted');
        }
      }
    } catch (e) { /* ignore */ }
    return why;
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

  // JSON 文件落盘 (统一下载通道): 全量备份 / 统计导出 / 规则文件共用
  function downloadJsonFile(filename, obj) {
    try {
      const data = JSON.stringify(obj, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 500);
      return true;
    } catch (e) {
      return false;
    }
  }

  // JSON 文件选取 (统一上传通道): 读入文本解析后回调; 解析/读取失败走 onFail
  function pickJsonFile(onParsed, onFail) {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            onParsed(JSON.parse(String(reader.result)));
          } catch (e) {
            if (typeof onFail === 'function') onFail(e);
          }
        };
        reader.onerror = () => {
          if (typeof onFail === 'function') onFail(reader.error || new Error('file read failed'));
        };
        reader.readAsText(file);
      });
      input.click();
      return true;
    } catch (e) {
      if (typeof onFail === 'function') onFail(e);
      return false;
    }
  }

  // ==========================================
  // 5. 内置站点规则库与站点档案解析 (BUILTIN_RULES & SiteProfile)
  //    v3.0: 内置规则降级为"种子/兜底"层 —— 学习规则 (RuleLearner) 优先于它
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
      imgFxMode: state.imgFxMode || 'full',
      disableVideoAuto: rule ? !!rule.disableVideoAuto : false,
      protect: rule ? (rule.protect || []).slice() : [],
      forceInvert: rule ? (rule.forceInvert || []).slice() : [],
      bgImageSelectors: rule ? (rule.bgImageSelectors || []).slice() : [],
      excludeSelectors: [],
      shieldColors: (state.shieldColors || []).slice(),
      elementRules: [],   // v3.3: 命中本机的用户元素级规则 (数组顺序即优先级)
    };

    // v3.3: 用户元素级规则 ('*' 为全站, 其余与黑/白名单同语义匹配)
    const erAll = Array.isArray(state.elementRules) ? state.elementRules : [];
    for (const er of erAll) {
      if (er && (er.pattern === '*' || hostMatchesPattern(host, er.pattern))) profile.elementRules.push(er);
    }

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
      if (override.imgFxMode !== undefined && override.imgFxMode !== null) profile.imgFxMode = override.imgFxMode;
      if (Array.isArray(override.excludeSelectors)) profile.excludeSelectors.push(...override.excludeSelectors);
      if (Array.isArray(override.shieldColors)) profile.shieldColors.push(...override.shieldColors);
    }

    return profile;
  }

  // 每主机 + 偏好版本号缓存
  const profileCache = new Map();

  function getSiteProfile() {
    const host = profileKey();
    const cached = profileCache.get(host);
    if (cached && cached.rev === prefsRevision) return cached.profile;
    const profile = resolveSiteProfile(host);
    profileCache.set(host, { rev: prefsRevision, profile });
    return profile;
  }

  // ==========================================
  // 6. 样式注入 (极简胶囊、控制卡片、高级设置弹窗)
  // ==========================================
  function injectStyles() {
    const css = `
      :root {
        --svi-img-filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90);
        --svi-img-transition: none;
        --svi-video-tune: none;
      }
      /* v3.2: 独立视频画面调节 (非反色视频经样式表生效; 反色活动视频由内联滤镜组合链覆盖) */
      html.svi-video-tune video {
        filter: var(--svi-video-tune, none) !important;
        transition: filter 0.2s ease;
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

      /* 网页图片与矢量图智能反色规则 (v3.0 扩展: canvas / SVG image / input[type=image];
         v3.1: video[data-svi-inverted] 供当前页媒体面板手动反色使用) */
      html.svi-img-invert-on img[data-svi-inverted="true"],
      html.svi-img-invert-on svg[data-svi-inverted="true"],
      html.svi-img-invert-on canvas[data-svi-inverted="true"],
      html.svi-img-invert-on image[data-svi-inverted="true"],
      html.svi-img-invert-on input[type="image" i][data-svi-inverted="true"],
      html.svi-img-invert-on video[data-svi-inverted="true"],
      body.svi-img-invert-on img[data-svi-inverted="true"],
      body.svi-img-invert-on svg[data-svi-inverted="true"],
      body.svi-img-invert-on canvas[data-svi-inverted="true"],
      body.svi-img-invert-on image[data-svi-inverted="true"],
      body.svi-img-invert-on input[type="image" i][data-svi-inverted="true"],
      body.svi-img-invert-on video[data-svi-inverted="true"] {
        filter: var(--svi-img-filter, invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)) !important;
        transition: var(--svi-img-transition, none) !important;
      }
      /* v3.1 R5: 悬停还原规则统一门控在 html.svi-hover-restore 之下 (默认开启;
         关闭悬停显示原图后规则不命中, 悬停保持反色视图) */
      html.svi-hover-restore img[data-svi-inverted="true"]:hover,
      html.svi-hover-restore svg[data-svi-inverted="true"]:hover,
      html.svi-hover-restore canvas[data-svi-inverted="true"]:hover,
      html.svi-hover-restore image[data-svi-inverted="true"]:hover,
      html.svi-hover-restore input[type="image" i][data-svi-inverted="true"]:hover,
      html.svi-hover-restore video[data-svi-inverted="true"]:hover {
        filter: none !important;
      }

      /* 背景图反色 (B站评论缩略图等 background-image 元素) */
      html.svi-img-invert-on [data-svi-bginv="true"],
      body.svi-img-invert-on [data-svi-bginv="true"] {
        filter: var(--svi-img-filter, invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)) !important;
        transition: var(--svi-img-transition, none) !important;
      }
      html.svi-hover-restore [data-svi-bginv="true"]:hover {
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
        max-width: 100%;
        min-width: 0;
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
      /* 本地统计: 表格化网格, 每项独立成格 (元素隔离, 严禁行内拼接) */
      .svi-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
        gap: 6px;
      }
      .svi-stats-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 8px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        min-width: 0;
      }
      .svi-stats-label {
        font-size: 10px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .svi-stats-value {
        font-size: 13px;
        font-weight: 600;
        color: #38bdf8;
        font-family: monospace;
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
      /* v3.3 停靠形态: 无遮罩不拦截页面交互, 仅侧边抽屉本身可交互 */
      .svi-modal-mask.docked {
        background: transparent;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        pointer-events: none;
        align-items: stretch;
        justify-content: flex-end;
      }
      .svi-modal-mask.docked .svi-modal-window {
        pointer-events: auto;
        background: #161922; /* 停靠形态无遮罩模糊, 用实底防页面内容透底 */
      }
      .svi-modal-window {
        width: min(600px, 94vw);
        max-width: 94vw;
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
      /* v3.3 停靠形态: 全高侧边抽屉, 宽度可拖拽并记忆 */
      .svi-modal-window.layout-left,
      .svi-modal-window.layout-right {
        position: fixed;
        top: 0;
        bottom: 0;
        height: 100vh;
        max-height: 100vh;
        width: var(--svi-settings-w, 420px);
        max-width: 92vw;
        border-radius: 0;
        animation: sviSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .svi-modal-window.layout-left {
        left: 0;
        right: auto;
        --svi-slide-from: -32px;
        border-right: 1px solid rgba(255, 255, 255, 0.14);
      }
      .svi-modal-window.layout-right {
        right: 0;
        left: auto;
        --svi-slide-from: 32px;
        border-left: 1px solid rgba(255, 255, 255, 0.14);
      }
      @keyframes sviSlideIn {
        from { opacity: 0; transform: translateX(var(--svi-slide-from, 24px)); }
        to { opacity: 1; transform: none; }
      }
      /* ===== v4.5 响应式 / 移动端: 窄屏全宽面板 + 触控大目标 + 粗指针禁用拖拽把手 ===== */
      @media (max-width: 520px) {
        .svi-modal-window,
        .svi-modal-window.layout-left,
        .svi-modal-window.layout-right {
          width: 100vw !important;
          max-width: 100vw !important;
          max-height: 100vh;
          max-height: 100dvh;
          border-radius: 0;
          border-left: none;
          border-right: none;
        }
        .svi-modal-body { padding: 12px 12px 20px; gap: 12px; }
        .svi-modal-row, .svi-site-check-row { min-height: 40px; }
        /* iOS: 聚焦字号 <16px 的输入框会触发页面缩放, 16px 起步
           (提升特异性: 基础规则在样式表更后处, 同特异性会被覆盖) */
        .svi-modal-body .svi-modal-select,
        .svi-modal-body .svi-modal-num-input { min-height: 40px; font-size: 16px; }
        .svi-check { width: 20px; height: 20px; }
        .svi4-tab { padding: 11px 12px; }
        .svi-drag-handle { display: none; }
        .svi-panel-card { right: 8px; width: min(250px, 88vw); }
      }
      @media (pointer: coarse) {
        .svi-drag-handle { display: none; }
        .svi-modal-slider { min-height: 32px; }
        .svi-action-btn, .svi-mini-btn { min-height: 40px; }
      }
      @media (max-height: 460px) {
        .svi-modal-window { max-height: 96vh; max-height: 96dvh; }
      }
      .svi-drag-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 7px;
        cursor: col-resize;
        z-index: 3;
        transition: background 0.15s ease;
      }
      .svi-drag-handle.left-edge { left: 0; }
      .svi-drag-handle.right-edge { right: 0; }
      .svi-drag-handle:hover { background: rgba(56, 189, 248, 0.28); }
      .svi-layout-switch {
        display: flex;
        gap: 2px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 2px;
      }
      .svi-layout-btn {
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 11px;
        padding: 3px 9px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .svi-layout-btn:hover { color: #e2e8f0; }
      .svi-layout-btn.active {
        background: #2563eb;
        color: #fff;
        font-weight: 600;
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
        flex-wrap: wrap;
        row-gap: 6px;
        min-width: 0;
      }
      .svi-modal-title {
        font-size: 15px;
        font-weight: 600;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      /* v4.6 版本自检徽标 (R-H4): 面板头显著显示运行版本, 供与发布页比对 */
      .svi-modal-ver {
        font-size: 11px;
        font-weight: 500;
        color: #94a3b8;
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 8px;
        padding: 1px 7px;
        margin-left: 4px;
        letter-spacing: 0.2px;
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
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 16px;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
      }
      .svi-modal-body::-webkit-scrollbar {
        width: 8px;
      }
      .svi-modal-body::-webkit-scrollbar-track {
        background: transparent;
      }
      .svi-modal-body::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.35);
        border-radius: 4px;
      }
      .svi-modal-body::-webkit-scrollbar-thumb:hover {
        background: rgba(148, 163, 184, 0.55);
      }
      .svi-modal-section {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .svi-sec-title {
        font-size: 12px;
        font-weight: 600;
        color: #38bdf8;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      /* v3.3: 行布局纵向堆叠 —— 标题说明在上, 控件在下, 任何窗宽不出界 */
      .svi-modal-row {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        min-width: 0;
      }
      .svi-modal-label-box {
        width: auto;
        flex-shrink: 1;
        min-width: 0;
      }
      .svi-modal-label {
        font-size: 12px;
        color: #e2e8f0;
      }
      .svi-modal-hint {
        font-size: 10px;
        color: #64748b;
        line-height: 1.5;
      }
      .svi-modal-controls {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex-wrap: wrap;
      }
      /* v3.3: 选中项的动态说明行 */
      .svi-row-describe {
        font-size: 10px;
        color: #7dd3fc;
        line-height: 1.5;
        background: rgba(56, 189, 248, 0.07);
        border-left: 2px solid rgba(56, 189, 248, 0.4);
        padding: 3px 8px;
        border-radius: 0 6px 6px 0;
      }
      /* v3.3: 区块内子分组标题 (元素级规则 / 学习规则) */
      .svi-sub-title {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        letter-spacing: 0.4px;
        padding-top: 8px;
        border-top: 1px dashed rgba(255, 255, 255, 0.1);
      }
      /* v3.3: 元素规则添加表单 */
      .svi-er-form {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .svi-er-form .svi-modal-select {
        flex: 0 0 auto;
      }
      .svi-modal-text {
        flex: 1;
        min-width: 140px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #cbd5e1;
        font-size: 11px;
        padding: 5px 8px;
        outline: none;
      }
      .svi-modal-text:focus {
        border-color: #38bdf8;
      }
      /* v3.3: 操作技巧行 */
      .svi-tip-line {
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.7;
        display: flex;
        gap: 8px;
      }
      .svi-tip-line b {
        color: #cbd5e1;
        flex-shrink: 0;
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
        flex-wrap: wrap;
        row-gap: 6px;
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

      /* ==========================================
         v3.0 新增样式: 特效覆盖层 / 部分反色投递 / 画中画 / 新区块
         ========================================== */

      /* 图片部分反色投递: content:url 替换渲染 (不改 src, 不破坏懒加载);
         悬停还原 (:hover + JS 类双通道, v3.1 门控于 html.svi-hover-restore), Alt+点击数据开关 */
      img[data-svi-fx] {
        cursor: crosshair;
      }
      img[data-svi-fx][data-svi-fx-off] {
        content: normal !important;
      }
      html.svi-hover-restore img[data-svi-fx]:hover,
      html.svi-hover-restore img[data-svi-fx].svi-fx-hover {
        content: unset !important;
      }

      /* 视频特效覆盖层 (仅当视频已有 positioned/transformed 祖先时创建) */
      .svi-fx-overlay {
        position: absolute;
        pointer-events: none !important;
        border-radius: inherit;
        overflow: hidden;
      }

      /* 视频海报反色 (播放后由 play 事件移除滤镜) */
      html.svi-img-invert-on video[data-svi-poster="light"]:not(.svi-playing),
      body.svi-img-invert-on video[data-svi-poster="light"]:not(.svi-playing) {
        filter: var(--svi-img-filter, invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)) !important;
      }

      /* 区域反色 (Alt+Shift+拖拽) 选择框 */
      .svi-rect-select {
        position: fixed;
        border: 1px dashed #38bdf8;
        background: rgba(56, 189, 248, 0.15);
        pointer-events: none;
        z-index: 2147483646;
      }

      /* 面板画中画按钮 (与 svi-action-btn 同视觉; 独立类避免破坏既有按钮计数) */
      .svi-pip-btn {
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
      .svi-pip-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.2);
      }

      /* 存储管理键列表 */
      .svi-store-key-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-family: monospace;
        font-size: 10px;
        color: #94a3b8;
      }
      .svi-store-key-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #7dd3fc;
      }
      .svi-store-key-size {
        flex-shrink: 0;
        color: #64748b;
      }

      /* 自学习规则列表 */
      .svi-learned-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 11px;
        color: #cbd5e1;
      }
      .svi-learned-stem {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: monospace;
      }
      .svi-learned-action {
        flex-shrink: 0;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 6px;
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }
      .svi-learned-action.protect {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .svi-learned-hits {
        flex-shrink: 0;
        font-size: 10px;
        color: #64748b;
      }

      /* 后端徽章 */
      .svi-backend-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-family: monospace;
        background: rgba(56, 189, 248, 0.12);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
      }

      /* ==========================================
         v3.1 新增样式: 当前页媒体面板 / 定位高亮闪烁
         ========================================== */
      .svi-media-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 11px;
        color: #cbd5e1;
      }
      .svi-media-type {
        flex-shrink: 0;
        width: 46px;
        color: #7dd3fc;
        font-family: monospace;
        font-size: 10px;
      }
      .svi-media-meta {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: monospace;
        font-size: 10px;
        opacity: 0.85;
      }
      .svi-media-state {
        flex-shrink: 0;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.07);
        color: #94a3b8;
        white-space: nowrap;
      }
      .svi-media-state.inverted {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }
      .svi-media-state.skipped {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
      }
      .svi-media-actions {
        flex-shrink: 0;
        display: flex;
        gap: 4px;
      }
      .svi-media-actions .svi-mini-btn {
        font-size: 10px;
        padding: 2px 7px;
      }
      /* 定位高亮: scrollIntoView 后 1.2s 描边闪烁 (仅 outline/box-shadow, 绝不改布局) */
      .svi-locate-flash {
        outline: 3px solid #38bdf8 !important;
        outline-offset: 1px !important;
        box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.35) !important;
      }

      /* ==========================================
         v4.0 设置页组件: 电源横幅 / 页签 / 能力卡片 / 停用态胶囊
         (视觉语言与 v3.3 零相似; 并列数据一律网格, 禁止行内拼接)
         ========================================== */
      .svi4-power {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 12px 14px;
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.10), rgba(16, 185, 129, 0.06));
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 14px;
      }
      .svi4-power-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1;
      }
      .svi4-host {
        font-size: 14px;
        font-weight: 700;
        color: #f8fafc;
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .svi4-power-status {
        font-size: 11px;
        color: #7dd3fc;
      }
      .svi4-switch {
        position: relative;
        width: 52px;
        height: 28px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(71, 85, 105, 0.9);
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.18s ease, border-color 0.18s ease;
      }
      .svi4-switch::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #e2e8f0;
        transition: transform 0.18s ease, background 0.18s ease;
      }
      .svi4-switch.on {
        background: #059669;
        border-color: #34d399;
      }
      .svi4-switch.on::after {
        transform: translateX(24px);
        background: #ecfdf5;
      }
      .svi4-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 4px;
      }
      .svi4-tab {
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 0;
        border-radius: 9px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .svi4-tab:hover { color: #e2e8f0; }
      .svi4-tab.active {
        background: #0ea5e9;
        color: #fff;
      }
      .svi4-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .svi4-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 6px 10px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        min-width: 0;
      }
      .svi4-card:hover {
        border-color: rgba(56, 189, 248, 0.5);
      }
      .svi4-card-icon {
        font-size: 20px;
        line-height: 1;
      }
      .svi4-card-name {
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .svi4-card-state {
        font-size: 10px;
        color: #64748b;
        text-align: center;
      }
      .svi4-card.st-on {
        border-color: rgba(52, 211, 153, 0.55);
        background: rgba(16, 185, 129, 0.10);
      }
      .svi4-card.st-on .svi4-card-state { color: #34d399; }
      .svi4-card.st-off {
        border-color: rgba(251, 146, 60, 0.55);
        background: rgba(249, 115, 22, 0.08);
      }
      .svi4-card.st-off .svi4-card-state { color: #fb923c; }
      /* 停用态: 胶囊折叠为单枚电源徽标 */
      .svi-off-badge {
        display: none;
        align-items: center;
        gap: 5px;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid rgba(251, 146, 60, 0.55);
        background: rgba(249, 115, 22, 0.15);
        color: #fdba74;
        font-size: 11px;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
      }
      .svi-capsule-root.svi-site-off .svi-trigger-pill,
      .svi-capsule-root.svi-site-off .svi-panel-card {
        display: none !important;
      }
      .svi-capsule-root.svi-site-off .svi-off-badge {
        display: inline-flex;
      }

      /* ==========================================
         v4.1 字体覆盖与文字描边 (CSS 变量由 updateFontCss 注入;
         白名单选择器避开 svg 与代码块, 不使用 filter)
         ========================================== */
      html.svi-font-on :is(body, button, input, select, label, h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, dd, dt, figcaption, blockquote, section, article, header, footer, nav, aside):not(svg):not(svg *):not(code):not(pre):not(kbd):not(samp):not(code *):not(pre *):not(kbd *):not(samp *):not(monospace *):not(tt *) {
        font-family: var(--svi-font-family) !important;
      }
      html.svi-stroke-on :is(h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, dd, dt, figcaption, blockquote, label, button):not(svg):not(svg *):not(code):not(pre):not(kbd):not(samp):not(code *):not(pre *):not(kbd *):not(samp *) {
        -webkit-text-stroke: var(--svi-text-stroke, 0px);
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
  // 7. 共存握手与 Shadow DOM 注册 (R7/R9-core)
  //    首个启动者通过 documentElement.dataset.sviOwner 认领页面 (5s 心跳),
  //    另一方 (userscript/extension) 见到新鲜异类认领 → 休眠启动, 杜绝双重滤镜
  // ==========================================
  const OWNER_KIND = (typeof EXT_MODE !== 'undefined' && EXT_MODE) ? 'ext' : 'us';
  const OWNER_FRESH_MS = 10000;
  const OWNER_HEARTBEAT_MS = 5000;

  function readOwnerClaim() {
    try {
      const de = document.documentElement;
      if (!de || !de.dataset || typeof de.dataset.sviOwner !== 'string') return null;
      const parts = de.dataset.sviOwner.split('|');
      const kind = parts[0];
      const ts = Number(parts[1]);
      if (!kind || !isFinite(ts)) return null;
      return { kind, ts, fresh: (Date.now() - ts) <= OWNER_FRESH_MS };
    } catch (e) {
      return null;
    }
  }

  // 启动裁定: 存在新鲜异类认领 → false (休眠启动); 否则可认领
  function claimOwnership() {
    const existing = readOwnerClaim();
    if (existing && existing.fresh && existing.kind !== OWNER_KIND) return false;
    try {
      const de = document.documentElement;
      if (de && de.dataset) {
        de.dataset.sviOwner = OWNER_KIND + '|' + Date.now();
        setInterval(() => {
          try {
            const cur = readOwnerClaim();
            if (!cur || cur.kind === OWNER_KIND) {
              de.dataset.sviOwner = OWNER_KIND + '|' + Date.now();
            }
          } catch (e) { /* ignore */ }
        }, OWNER_HEARTBEAT_MS);
      }
    } catch (e) { /* ignore */ }
    return true;
  }

  // Shadow DOM 注册表: attachShadow 幂等补丁 + 既有开放根收集 + 有界遍历
  const ShadowDomRegistry = {
    roots: new Set(),
    patched: false,

    install() {
      if (this.patched) return;
      if (typeof Element === 'undefined' || !Element.prototype || !Element.prototype.attachShadow) return;
      this.patched = true;
      const registry = this;
      const original = Element.prototype.attachShadow;
      try {
        Element.prototype.attachShadow = function (...args) {
          const root = original.apply(this, args);
          try {
            if (root) registry.roots.add(root);
          } catch (e) { /* ignore */ }
          return root;
        };
      } catch (e) {
        this.patched = false;
      }
    },

    // 补丁安装前已存在的开放根: 有界一次性收集 (≤1000 元素)
    collectExisting(budget) {
      const cap = budget || 1000;
      try {
        const root = document.body || document.documentElement;
        if (!root || !root.querySelectorAll) return;
        const all = root.querySelectorAll('*');
        const n = Math.min(all.length, cap);
        for (let i = 0; i < n; i++) {
          const sr = all[i].shadowRoot;
          if (sr) this.roots.add(sr);
        }
      } catch (e) { /* ignore */ }
    },

    // 有界遍历: 最多 maxRoots 个根
    forEachRoot(cb, maxRoots) {
      const cap = maxRoots || 20;
      let i = 0;
      for (const root of this.roots) {
        if (i >= cap) break;
        i++;
        try { cb(root); } catch (e) { /* ignore */ }
      }
    },
  };

  // ==========================================
  // 8. 主视频探针 (VideoProbeManager)
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
      // v3.0: GPU 覆盖层接管时抑制 CSS 滤镜 (由 VideoFxEngine 渲染, 防止双重处理)
      const vfx = (window.__svi && window.__svi.engines) ? window.__svi.engines.videoFx : null;
      if (vfx && vfx.available && state.videoFxMode !== 'off') {
        if (runtime.invertActive) {
          vfx.sync(this.currentVideo, true);
          if (vfx.handles(this.currentVideo)) return; // 覆盖层已创建/激活 → CSS 滤镜保持关闭
        } else if (vfx.handles(this.currentVideo)) {
          vfx.sync(this.currentVideo, false); // 隐藏覆盖层; CSS 滤镜同样保持移除 (v2.0 未反色语义)
          return;
        }
      } else if (vfx && vfx.state) {
        vfx.teardown(); // 特效模式关闭: 释放覆盖层
      }
      // v3.2: 内联滤镜 = 反色链 + 画面调节链 组合 (反色时画面调节不丢失)
      const filterString = [getActiveFilter(), buildVideoTuneFilter(state.videoTune)]
        .filter(Boolean).join(' ');
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
  // 9. 离屏极速采样检测器 (LuminanceDetector - < 5ms 无感优化)
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
  // 10. 时间线学习器 (TimelineLearner - R3 预测性视频反色)
  //     反色生效期间记录 [t0,t1] 片段, 按 duration|src指纹 归并持久化 (svi:timeline);
  //     重放时 reference 模式预布防 / takeover 模式直接接管, 手动切换 10s 反抢占
  // ==========================================
  class TimelineLearner {
    constructor() {
      this.data = Store.get('timeline', {});
      if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) this.data = {};
      this.recording = null;        // { key, fp, t0 }
      this.takeoverPauseUntil = 0;  // 手动切换后的反抢占窗口
      this.MAX_VIDEOS = 50;
      this.MAX_SEGS = 40;
      this.MERGE_GAP_MS = 2000;
    }

    // 指纹: duration + '|' + srcCode (src 前 8 位散列; blob/MediaStream 源无稳定 src → 退化为时长指纹)
    fingerprint(video) {
      let dur;
      try {
        const d = Number(video && video.duration);
        dur = isFinite(d) && d > 0 ? String(Math.round(d * 10) / 10) : 'inf';
      } catch (e) {
        dur = 'inf';
      }
      return dur + '|' + this.srcCode(video);
    }

    srcCode(video) {
      try {
        if (!video) return '';
        let src = '';
        if (typeof video.src === 'string') src = video.src;
        const isStream = !!video.srcObject || (typeof src === 'string' && src.indexOf('blob:') === 0);
        if (isStream || !src) {
          // MediaStream/blob 源: src 每次加载都不同 → 仅使用站点提供的稳定 vkey (若有)
          const vkey = video.dataset && video.dataset.sviVkey ? String(video.dataset.sviVkey) : '';
          return hash32(vkey).slice(0, 8);
        }
        return hash32(src).slice(0, 8);
      } catch (e) {
        return '';
      }
    }

    storageKey(video) {
      return profileKey() + '|' + this.fingerprint(video);
    }

    recordStart(video) {
      if (!video || this.recording) return;
      try {
        this.recording = {
          key: this.storageKey(video),
          fp: this.fingerprint(video),
          t0: Number(video.currentTime) || 0,
        };
      } catch (e) {
        this.recording = null;
      }
    }

    recordEnd(video) {
      const rec = this.recording;
      this.recording = null;
      if (!rec || !video) return;
      try {
        const t1 = Number(video.currentTime) || 0;
        if (t1 - rec.t0 < 0.2) return; // 忽略误触 (<0.2s)
        const entry = this.data[rec.key] || { dur: rec.fp.split('|')[0], segs: [], updatedAt: 0 };
        entry.segs.push([rec.t0, t1]);
        entry.segs = mergeSegments(entry.segs, this.MERGE_GAP_MS);
        if (entry.segs.length > this.MAX_SEGS) {
          entry.segs = entry.segs.slice(entry.segs.length - this.MAX_SEGS);
        }
        entry.updatedAt = Date.now();
        this.data[rec.key] = entry;
        this.trim();
        Store.set('timeline', this.data);
      } catch (e) { /* ignore */ }
    }

    trim() {
      const keys = Object.keys(this.data);
      if (keys.length <= this.MAX_VIDEOS) return;
      keys.sort((a, b) => (this.data[a].updatedAt || 0) - (this.data[b].updatedAt || 0));
      const remove = keys.slice(0, keys.length - this.MAX_VIDEOS);
      for (const k of remove) delete this.data[k];
    }

    segmentsFor(video) {
      try {
        const key = this.storageKey(video);
        const entry = this.data[key];
        if (!entry || !Array.isArray(entry.segs) || !entry.segs.length) return null;
        // 时长复核 (容差 1.5s; 'inf' 与 'inf' 亦可)
        const durNow = this.fingerprint(video).split('|')[0];
        if (durNow !== 'inf' && entry.dur !== 'inf' && Math.abs(Number(durNow) - Number(entry.dur)) > 1.5) return null;
        return entry.segs;
      } catch (e) {
        return null;
      }
    }

    // 每帧/每 tick 调用: 依据 timelineMode 预布防或接管
    // 返回 'arm' | 'disarm' | null (null = 无意见, 保持现状)
    evaluate(video, invertActive, userOverrode) {
      if (!video || state.timelineMode === 'off') return null;
      const segs = this.segmentsFor(video);
      if (!segs) return invertActive && this.armedBy === 'timeline' ? 'disarm' : null;
      const inside = !!lookupSegment(segs, Number(video.currentTime) || 0);
      if (state.timelineMode === 'takeover') {
        if (Date.now() < this.takeoverPauseUntil) return null; // 手动切换反抢占 10s
        if (inside && !invertActive) return 'arm';
        if (!inside && invertActive && this.armedBy === 'timeline') return 'disarm';
        return null;
      }
      // reference 模式: 仅在用户本会话未否决时预布防
      if (inside && !invertActive && !userOverrode) return 'arm';
      if (!inside && invertActive && this.armedBy === 'timeline') return 'disarm';
      return null;
    }

    noteManualToggle() {
      this.takeoverPauseUntil = Date.now() + 10000;
    }

    // armedBy 由 HIL 状态机在布防来源变化时回写 ('timeline' | 'auto' | 'manual' | null)
    get armedBy() {
      return this._armedBy || null;
    }
    set armedBy(v) {
      this._armedBy = v;
    }
  }

  // 顶层实例 (供 UI 与启动引导直接使用; Node 单测可经 window.__svi.RuleLearner/Store 访问)
  const timelineLearner = new TimelineLearner();

  // ==========================================
  // 11. 无对抗人机协同状态机 (HILStateMachine) —— 视频状态仅存 runtime (标签页隔离)
  //     v3.0: rVFC 逐帧采样 (检测→滤镜延迟 ≤ ~2 合成帧), 250ms 轮询保留为无 rVFC 时的回退;
  //     时间线记忆预布防 + 媒体主导判定 (视频占屏 ≥55% 时挂起背景扫描)
  // ==========================================
  class HILStateMachine {
    constructor(probe, detector, ui, videoFx) {
      this.probe = probe;
      this.detector = detector;
      this.ui = ui;
      this.videoFx = videoFx || null;
      this.timer = null;
      this.timeline = timelineLearner;
      // 媒体主导判定状态
      this.domCount = 0;
      this.lastDominantAt = 0;
      this.mediaDominant = false;
      this.lastWhiteAt = 0;      // rVFC 路径的时间维迟滞
      this._frameLoopRunning = false;
      this.startLoop();
      this.startFrameLoop();
    }

    // —— 统一反色状态迁移 (所有生效路径经此收口; 时间线在生效期间记录片段) ——
    setInvertState(video, active, source) {
      if (runtime.invertActive === active) {
        if (active && this.timeline && source !== 'timeline-stop') {
          // 保持生效: 确保片段记录已开启 (如自动路径先于手动开启)
          if (!this.timeline.recording) this.timeline.recordStart(video);
        }
        return;
      }
      runtime.invertActive = active;
      if (active) {
        if (this.timeline) this.timeline.recordStart(video);
      } else {
        if (this.timeline) this.timeline.recordEnd(video);
      }
      this.probe && this.probe.applyFilterToCurrent();
      this.ui && this.ui.syncVisuals();
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

    // rVFC 逐帧检测循环 (Chromium); 无 rVFC 的浏览器退回 250ms 轮询 (v2.0 语义)
    startFrameLoop() {
      if (this._frameLoopRunning) return;
      const hasRvfc = (() => {
        try {
          return typeof HTMLVideoElement !== 'undefined' &&
            'requestVideoFrameCallback' in HTMLVideoElement.prototype;
        } catch (e) { return false; }
      })();
      if (!hasRvfc) return;
      this._frameLoopRunning = true;
      const loop = () => {
        let video = null;
        try { video = this.probe && this.probe.currentVideo; } catch (e) { /* ignore */ }
        if (!video) {
          this._rvfcTimer = setTimeout(loop, 500);
          return;
        }
        try {
          video.requestVideoFrameCallback(() => {
            try { this.onFrame(video); } catch (e) { /* ignore */ }
            loop();
          });
        } catch (e) {
          this._rvfcTimer = setTimeout(loop, 500);
        }
      };
      loop();
    }

    // 逐帧采样 (rVFC): 白底检测 + 时间线预布防 + 媒体主导
    onFrame(video) {
      if (!video || document.hidden) return;
      if (runtime.siteActive === false) return; // v4.2: 站点电源/定时档挂起闸
      this._lastFrameAt = Date.now(); // rVFC 链活性标记 (轮询互斥判定 + 死链复活看门狗)
      this.updateMediaDominance(video);
      const profile = getSiteProfile();
      if (profile.enabled === false || profile.videoInvert === false) return;
      this.applyTimeline(video, runtime.userRejectedScene);
      if (!state.autoDetect || profile.disableVideoAuto || (this.detector && this.detector.isCorsRestricted)) return;
      if (!this.detector) return;
      const result = this.detector.detect(video);
      if (!result) return;
      this.applySceneResult(result, true);
    }

    tick() {
      if (!this.probe) return;
      if (runtime.siteActive === false) return; // v4.2: 站点电源/定时档挂起闸
      const profile = getSiteProfile();
      if (profile.enabled === false || profile.videoInvert === false) return;

      // 页面隐藏时暂停视频采样, 节省后台资源
      if (document.hidden) return;

      const video = this.probe.updateActiveVideo();
      if (!video) return;

      this.updateMediaDominance(video);
      this.applyTimeline(video, runtime.userRejectedScene);

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
      // 双路互斥 (R3): rVFC 正在逐帧采样同一播放中的视频时, 轮询不再重复检测。
      // 链失活 (视频切换后旧回调永不触发等, >2s 无新帧) → 轮询自动接管, 语义不变。
      if (this._frameLoopRunning && !video.paused &&
          Date.now() - (this._lastFrameAt || 0) < 2000) {
        this.maybeReviveFrameLoop();
        this.ui && this.ui.updateStatusBadge();
        return;
      }
      // rVFC 存在时, 检测结果统一走时间维退出迟滞 (逐帧计数会膨胀 normalSceneCount,
      // 把 1.5s 防抖压缩到 ~200ms, 造成场景闪烁回退); 无 rVFC 浏览器保持 v2.0 计数语义
      this.applySceneResult(result, this._frameLoopRunning ? true : false);
      this.ui && this.ui.updateStatusBadge();
    }

    // rVFC 死链复活看门狗: 挂起的回调所在视频已停止呈现帧 (被移除/切换) 时,
    // 逐帧循环会永久卡死 → 限频重建 (10s 一次; 播放中且 >3s 无帧才触发)
    maybeReviveFrameLoop() {
      if (!this._frameLoopRunning || document.hidden) return;
      const video = this.probe && this.probe.currentVideo;
      if (!video || video.paused) return;
      const now = Date.now();
      if (now - (this._lastFrameAt || 0) < 3000) return;
      if (now - (this._lastReviveAt || 0) < 10000) return;
      this._lastReviveAt = now;
      this._frameLoopRunning = false;
      this.startFrameLoop();
    }

    // 场景判定结果应用; timeBased=true 时使用时间维退出迟滞 (rVFC 高频路径)
    applySceneResult(result, timeBased) {
      const newScene = result.scene;

      if (newScene !== runtime.currentDetectedScene) {
        runtime.currentDetectedScene = newScene;
        if (runtime.userRejectedScene && runtime.userRejectedScene !== newScene) {
          runtime.userRejectedScene = null;
        }
      }

      if (newScene === 'white_slide') {
        runtime.normalSceneCount = 0;
        this.lastWhiteAt = Date.now();
        if (runtime.userRejectedScene === 'white_slide') {
          this.ui && this.ui.updateStatusBadge();
          return;
        }
        if (!runtime.invertActive) {
          this.setInvertState(this.probe && this.probe.currentVideo, true, 'auto');
          StatsManager.count('videoAutoActivations');
          StatsManager.record('video-auto', 'white_slide 激活');
        }
      } else {
        // 仅轮询路径递增计数: rVFC 逐帧调用 (timeBased=true) 若也计数,
        // 会把基于 250ms tick 的退出防抖压缩到几帧, 造成场景闪烁
        if (!timeBased) runtime.normalSceneCount++;
        if (runtime.userRejectedScene === 'normal') {
          this.ui && this.ui.updateStatusBadge();
          return;
        }
        if (runtime.invertActive) {
          if (timeBased) {
            const hysteresisMs = state.exitHysteresisMs || 1500;
            if (Date.now() - this.lastWhiteAt >= hysteresisMs) {
              this.setInvertState(this.probe && this.probe.currentVideo, false, 'auto');
              StatsManager.record('video-auto', '恢复 normal 画面');
            }
          } else {
            const hysteresisMs = state.exitHysteresisMs || 1500;
            const exitTicks = Math.max(2, Math.round(hysteresisMs / (state.sampleIntervalMs || 250)));
            if (runtime.normalSceneCount >= exitTicks) {
              this.setInvertState(this.probe && this.probe.currentVideo, false, 'auto');
              StatsManager.record('video-auto', '恢复 normal 画面');
            }
          }
        }
      }

      this.ui && this.ui.updateStatusBadge();
    }

    // 时间线: reference 预布防 / takeover 接管 (每帧 + 每 tick 各一次, 延迟极低)
    applyTimeline(video, userOverrode) {
      if (!this.timeline || !video) return;
      try {
        const action = this.timeline.evaluate(video, runtime.invertActive, userOverrode);
        if (action === 'arm') {
          this.timeline.armedBy = 'timeline';
          this.setInvertState(video, true, 'timeline');
        } else if (action === 'disarm') {
          this.timeline.armedBy = null;
          this.setInvertState(video, false, 'timeline-stop');
        }
      } catch (e) { /* ignore */ }
    }

    // 媒体主导判定: 播放中的视频占视口 ≥55% 连续 3 次采样 → 挂起背景扫描, 恢复需持续 10s
    updateMediaDominance(video) {
      try {
        const dominant = !!video && !video.paused && !video.ended &&
          mediaDominantViewport(video) >= 0.55;
        if (dominant) {
          this.domCount++;
          this.lastDominantAt = Date.now();
        } else {
          this.domCount = 0;
        }
        if (this.domCount >= 3) this.mediaDominant = true;
        if (this.mediaDominant && Date.now() - this.lastDominantAt >= 10000) {
          this.mediaDominant = false;
        }
      } catch (e) { /* ignore */ }
    }

    onUserToggleInvert() {
      const profile = getSiteProfile();
      if (profile.videoInvert === false) {
        showToast('本站已禁用视频反色');
        return;
      }
      const video = this.probe && this.probe.currentVideo;
      const next = !runtime.invertActive;
      if (next) {
        this.timeline && (this.timeline.armedBy = 'manual');
      } else {
        this.timeline && (this.timeline.armedBy = null);
      }
      this.timeline && this.timeline.noteManualToggle();
      runtime.userRejectedScene = runtime.currentDetectedScene;
      this.setInvertState(video, next, 'manual');
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
      applyVideoTune();
      this.onUpdateInterval(state.sampleIntervalMs);
      this.probe && this.probe.applyFilterToCurrent();
      this.ui && this.ui.syncVisuals();
      if (this.ui && this.ui.modalControls) this.ui.modalControls.syncAll();
      // 背景替换引擎与重置后的站点档案重新对齐 (防止按钮显示"关"而引擎仍在运行)
      try { applyBackgroundReplace(getSiteProfile().bgReplace === true); } catch (e) { /* ignore */ }
    }
  }

  // ==========================================
  // 12. 图片像素分析与解码链 (star-history/camo 跨域修复核心)
  // ==========================================
  // v4.5: GM 文本拉取 (规则包订阅/分发通道) —— 用户脚本走 GM_xmlhttpRequest 绕开页面 CSP,
  // 插件形态经预置 fetch shim (text 响应), 失败时调用方降级提示。
  function gmFetchText(url) {
    return new Promise((resolve, reject) => {
      const gmXhr = (typeof GM_xmlhttpRequest === 'function')
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest : null);
      if (!gmXhr) {
        fetch(url).then((res) => {
          if (!res.ok) { reject(new Error('HTTP ' + res.status)); return; }
          return res.text().then(resolve);
        }).catch(() => reject(new Error('network error')));
        return;
      }
      gmXhr({
        method: 'GET',
        url,
        responseType: 'text',
        timeout: 20000,
        onload: (r) => {
          if (r && r.status === 200 && typeof r.response === 'string') resolve(r.response);
          else reject(new Error('HTTP ' + (r && r.status)));
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      const gmXhr = (typeof GM_xmlhttpRequest === 'function')
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest : null);

      // file:// 页面: fetch(file:) 被 Chrome 禁止 → GM 专属通道 (需浏览器允许油猴访问文件)
      const isFileUrl = /^file:/i.test(String(url || ''));
      if (isFileUrl && !gmXhr) {
        reject(new Error('file: URL requires GM fetch (grant browser extension file access)'));
        return;
      }

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

  function evaluateImagePixelStats(data, s = state) {
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

    // v4.5: 返回统计 (lightRatio = 亮像素/不透明像素) —— 自动反色的"白底主导"证据
    if (opaqueCount < 8) return { isLight: false, lightRatio: 0 };
    const lightRatio = lightCount / opaqueCount;
    return { isLight: lightRatio >= areaThreshold, lightRatio };
  }

  // 兼容导出契约 (window.__svi.evaluateImagePixels): 只返回布尔判定
  function evaluateImagePixels(data, s = state) {
    return evaluateImagePixelStats(data, s).isLight;
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

  // v4.3: 不透明像素平均亮度 (0~255, -1=无不透明像素) —— 反色决策的证据强度 (sanity 门用)
  function meanLuminance(data) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] <= 128) continue;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
    return n ? sum / n : -1;
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
      const st = evaluateImagePixelStats(sample.data, prefsState);
      return { ok: true, isLight: st.isLight, lightRatio: st.lightRatio, meanLum: meanLuminance(sample.data), opaqueRatio: sample.opaqueCount / 64, viaFallback: false };
    }

    StatsManager.count('taintFallbacks');
    try {
      const blob = await gmFetchBlob(src);
      const s16 = await decodeBlobSample(blob, 16);
      if (s16.opaqueCount < 8) return { ok: false };
      const st = evaluateImagePixelStats(s16.data, prefsState);
      return { ok: true, isLight: st.isLight, lightRatio: st.lightRatio, meanLum: meanLuminance(s16.data), opaqueRatio: s16.opaqueCount / 256, viaFallback: true };
    } catch (e) {
      // file:// 页面且本地文件访问被拦 → 记录一次性 UI 提示 (不崩溃, 优雅降级)
      try {
        if (location.protocol === 'file:') runtime.fileAccessBlocked = true;
      } catch (e2) { /* ignore */ }
      return { ok: false };
    }
  }

  // 特效解码: 以图片自然分辨率解码到离屏 canvas (上限 maxDim 4096; 超限缩放), 供逐像素变换
  // 跨域污染时回退 GM blob 全尺寸解码链; 失败返回 null (调用方回退 CSS 全滤镜)
  async function decodeToCanvas(drawable, src, maxDim) {
    const cap = maxDim || 4096;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    let nw = 0;
    let nh = 0;
    try {
      nw = (drawable && (drawable.naturalWidth || drawable.videoWidth || drawable.width)) || 0;
      nh = (drawable && (drawable.naturalHeight || drawable.videoHeight || drawable.height)) || 0;
    } catch (e) { /* ignore */ }

    if (nw > 0 && nh > 0) {
      const scale = Math.min(1, cap / nw, cap / nh);
      canvas.width = Math.max(1, Math.round(nw * scale));
      canvas.height = Math.max(1, Math.round(nh * scale));
      try {
        ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
        return { canvas, ctx };
      } catch (e) {
        // tainted: 走 blob 解码链
      }
    }

    // blob 全尺寸解码 (跨域 / 自然尺寸未知)
    try {
      const blob = await gmFetchBlob(src);
      const objUrl = URL.createObjectURL(blob);
      try {
        const tempImg = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('decode failed'));
          im.src = objUrl;
        });
        const bw = tempImg.naturalWidth || 0;
        const bh = tempImg.naturalHeight || 0;
        if (!bw || !bh) return null;
        const scale = Math.min(1, cap / bw, cap / bh);
        canvas.width = Math.max(1, Math.round(bw * scale));
        canvas.height = Math.max(1, Math.round(bh * scale));
        ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
        return { canvas, ctx };
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    } catch (e) {
      try {
        if (location.protocol === 'file:') runtime.fileAccessBlocked = true;
      } catch (e2) { /* ignore */ }
      return null;
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

  // 从真实媒体元素构建 classifySmallElement 的输入 (img / SVG image / input[type=image])
  function buildClassifyInfo(img, srcCountMap) {
    const src = getMediaSrc(img);
    let meta = '';
    try {
      const cls = (typeof img.className === 'string')
        ? img.className
        : (img.className && img.className.baseVal !== undefined ? img.className.baseVal : '');
      meta = (cls + ' ' + (img.id || '') + ' ' + (img.alt || '') + ' ' + (img.getAttribute('role') || '')).toLowerCase();
    } catch (e) { /* ignore */ }
    // v4.5: URL 路径段并入元数据 (如 /avatars/xxx) —— 头像目录是比 class 更可靠的特征
    try {
      const u = new URL(src, location.href);
      meta += ' ' + u.pathname.toLowerCase();
    } catch (e) { /* ignore */ }

    const size = mediaClientSize(img);
    const w = size[0];
    const h = size[1];

    let isContent = false;
    let isChrome = false;
    try { isContent = !!closestContextHit(img, CONTENT_CONTEXT_SELECTOR); } catch (e) { /* ignore */ }
    try { isChrome = !!closestContextHit(img, CHROME_CONTEXT_SELECTOR); } catch (e) { /* ignore */ }

    // v3.1 R4: 策略门所需的扩展上下文 (每次决策对当前 DOM 快照计算一次, 与决策一同缓存,
    // 后续 DOM 变化绝不翻转已定决策 —— F3 修复的核心约束)
    const extChrome = detectChromeContext(img);
    const gridSiblings = detectGridSiblings(img);

    return {
      w: w || 0,
      h: h || 0,
      meta,
      srcOccurrences: (src && srcCountMap && srcCountMap.get(src)) || (src ? 1 : 0),
      isContentContext: isContent,
      isChromeContext: isChrome,
      minImgSize: state.minImgSize || 48,
      // v3.1 扩展字段 (passesImagePolicy 输入)
      maxDim: Math.max(w || 0, h || 0),
      contentContext: isContent,
      chromeContext: isChrome || extChrome,
      gridSiblings,
      policy: state.imagePolicy || 'balanced',
    };
  }

  // —— v3.1 R4: 智能图片策略 (纯函数, 导出 window.__svi 供单测) ——
  // 输入 info: { maxDim, contentContext, chromeContext, gridSiblings, policy }
  // - aggressive  : v3.0 行为 (仅 classifySmallElement 尺寸门, 策略恒通过)
  // - conservative: 正文上下文 OR maxDim ≥ 200
  // - balanced    : 正文上下文 OR (maxDim ≥ 96 且非网格重复 且非页面骨架上下文)
  function passesImagePolicy(info) {
    const policy = (info && info.policy) || 'balanced';
    if (policy === 'aggressive') return true;
    if (info.contentContext) return true;
    const maxDim = Math.max((info.maxDim | 0), 0);
    if (policy === 'conservative') return maxDim >= 200;
    // balanced
    if (maxDim < 96) return false;
    if ((info.gridSiblings | 0) >= 4) return false;
    if (info.chromeContext) return false;
    return true;
  }

  // 网格分组计数 (纯函数, 导出单测): 同父容器内同标签且尺寸 ±8px 的元素分组计数 (含自身);
  // siblings: [{ w, h, tag }] —— ownTag 与 w/h 由 DOM 包装层 (detectGridSiblings) 提供
  function countGridGroup(ownW, ownH, ownTag, siblings) {
    if (!ownW || !ownH) return 0;
    let count = 1;
    const list = Array.isArray(siblings) ? siblings : [];
    for (const s of list) {
      if (!s || s.tag !== ownTag) continue;
      const w = s.w | 0;
      const h = s.h | 0;
      if (!w || !h) continue;
      if (Math.abs(w - ownW) <= 8 && Math.abs(h - ownH) <= 8) count++;
    }
    return count;
  }

  // 网格重复检测 (DOM 包装): 同一父容器内同标签同尺寸兄弟 ≥4 → 网格贴图
  // (设计 §4 字面语义: 仅统计同父同级; 卡片结构 (a>img 封面) 由 chrome-context 启发式覆盖)
  function detectGridSiblings(el) {
    try {
      if (!el || !el.parentElement) return 0;
      const size = mediaClientSize(el);
      if (!size[0] || !size[1]) return 0;
      const tag = String(el.tagName || '').toUpperCase();
      let count = 1;
      const kids = el.parentElement.children || [];
      for (const sib of kids) {
        if (!sib || sib === el) continue;
        if (String(sib.tagName || '').toUpperCase() !== tag) continue;
        const s = mediaClientSize(sib);
        if (s[0] && s[1] && Math.abs(s[0] - size[0]) <= 8 && Math.abs(s[1] - size[1]) <= 8) count++;
      }
      return count;
    } catch (e) {
      return 0;
    }
  }

  // chrome-context 扩展检测 (v3.1, 不用 :has): 基础骨架选择器之外,
  // 追加 卡片/封面类名提示 ([class*="card"]/["cover"]) 与 单图链接锚 (a 仅包裹一张媒体图) 模式;
  // 仅作用于策略门 (classifySmallElement 的 chrome-small 判定维持 v3.0 基础选择器语义, 零回归)
  function detectChromeContext(el) {
    try { if (closestContextHit(el, CHROME_CONTEXT_SELECTOR)) return true; } catch (e) { /* ignore */ }
    try {
      let node = el.parentElement;
      let hops = 0;
      while (node && node !== document.body && node !== document.documentElement && hops < 6) {
        hops++;
        const cls = (typeof node.className === 'string')
          ? node.className
          : (node.className && node.className.baseVal !== undefined ? node.className.baseVal : '');
        const hint = String(cls || '') + ' ' + String(node.id || '');
        if (/card|cover/i.test(hint)) return true;
        if (node.tagName && String(node.tagName).toUpperCase() === 'A') {
          let mediaCount = 0;
          let childCount = 0;
          const kids = node.children || [];
          childCount = kids.length;
          for (const k of kids) {
            const t = String((k && k.tagName) || '').toUpperCase();
            if (t === 'IMG' || t === 'SVG' || t === 'IMAGE' || t === 'CANVAS' || t === 'VIDEO' || t === 'PICTURE' || t === 'SOURCE') mediaCount++;
          }
          if (childCount === 1 && mediaCount === 1) return true; // a > img:only-child 封面链接
        }
        node = node.parentElement;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  // 跳过原因中文映射 (当前页媒体面板展示用)
  const SKIP_REASON_ZH = {
    'meta-icon': '头像/图标',
    'repeated-small': '重复小图',
    'chrome-small': '页面骨架小图',
    'tiny': '尺寸过小',
    'below-min': '低于最小尺寸',
    'favicon': 'favicon',
    'policy': '策略跳过',
    'analysis-failed': '分析失败',
  };

  // 合并站点级原色屏蔽后的求值偏好快照
  function getEvalPrefs() {
    const profile = getSiteProfile();
    if (profile.shieldColors && profile.shieldColors.length) {
      return Object.assign({}, state, { shieldColors: profile.shieldColors });
    }
    return state;
  }

  // ==========================================
  // 13. 纯效果变换数学 (R1/R2/R3/R4 —— 全部纯函数, 导出 window.__svi 供单测)
  // ==========================================

  // 单像素变换: 返回 [r,g,b] 或 null (null = 保留原像素)
  // mode: 'invert-full' | 'luma' | 'key' | 'rect' | 'grayscale' | 'sepia' | 'brightness' | 'custom'
  // rect 模式: 坐标边界由循环控制, 命中循环的像素一律全反色
  function transformPixel(r, g, b, mode, params) {
    params = params || {};
    switch (mode) {
      case 'invert-full':
      case 'rect':
        return [255 - r, 255 - g, 255 - b];
      case 'luma': {
        const lum = relLuminance(r, g, b);
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        const lumCutoff = params.lumCutoff != null ? params.lumCutoff : 190;
        const satCutoff = params.satCutoff != null ? params.satCutoff : 0.30;
        if (lum >= lumCutoff && sat <= satCutoff) return [255 - r, 255 - g, 255 - b];
        return null;
      }
      case 'key': {
        let keyRgb = params.keyRgb;
        if (!keyRgb && params.keyColor) keyRgb = hexToRgb(params.keyColor);
        if (!keyRgb) keyRgb = [255, 255, 255];
        const tol = params.keyTol != null ? params.keyTol : 60;
        const tol2 = params.tol2 != null ? params.tol2 : tol * tol;
        const d2 = (r - keyRgb[0]) * (r - keyRgb[0]) + (g - keyRgb[1]) * (g - keyRgb[1]) + (b - keyRgb[2]) * (b - keyRgb[2]);
        if (d2 <= tol2) return [255 - r, 255 - g, 255 - b];
        return null;
      }
      case 'grayscale': {
        const l = relLuminance(r, g, b);
        return [l, l, l];
      }
      case 'sepia': {
        return [
          Math.min(255, Math.round(0.393 * r + 0.769 * g + 0.189 * b)),
          Math.min(255, Math.round(0.349 * r + 0.686 * g + 0.168 * b)),
          Math.min(255, Math.round(0.272 * r + 0.534 * g + 0.131 * b)),
        ];
      }
      case 'brightness': {
        const f = params.brightness != null ? params.brightness : 1.0;
        return [
          Math.max(0, Math.min(255, Math.round(r * f))),
          Math.max(0, Math.min(255, Math.round(g * f))),
          Math.max(0, Math.min(255, Math.round(b * f))),
        ];
      }
      case 'custom': {
        // 复用偏好中的亮度/对比度/饱和度 (与 CSS 滤镜链同序: brightness → contrast → saturate)
        const br = params.brightness != null ? params.brightness : 1.0;
        const co = params.contrast != null ? params.contrast : 1.0;
        const sa = params.saturate != null ? params.saturate : 1.0;
        const lum = relLuminance(r, g, b);
        let rr = r * br;
        let gg = g * br;
        let bb = b * br;
        rr = (rr - 128) * co + 128;
        gg = (gg - 128) * co + 128;
        bb = (bb - 128) * co + 128;
        rr = lum + (rr - lum) * sa;
        gg = lum + (gg - lum) * sa;
        bb = lum + (bb - lum) * sa;
        return [
          Math.max(0, Math.min(255, Math.round(rr))),
          Math.max(0, Math.min(255, Math.round(gg))),
          Math.max(0, Math.min(255, Math.round(bb))),
        ];
      }
      default:
        return null;
    }
  }

  // 时间线片段归并: 排序后相邻 (间隔 ≤ gapMs) 或重叠片段合并; 纯函数不改入参
  function mergeSegments(segs, gapMs) {
    const gap = gapMs == null ? 2000 : gapMs;
    const list = (Array.isArray(segs) ? segs : [])
      .filter((s) => Array.isArray(s) && isFinite(s[0]) && isFinite(s[1]) && s[1] >= s[0])
      .map((s) => [Number(s[0]), Number(s[1])])
      .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const out = [];
    for (const s of list) {
      const last = out[out.length - 1];
      if (last && s[0] - last[1] <= gap) {
        if (s[1] > last[1]) last[1] = s[1];
      } else {
        out.push([s[0], s[1]]);
      }
    }
    return out;
  }

  // 时间线查找: 返回包含 t 的片段 [t0,t1] (闭区间) 或 null
  function lookupSegment(segs, t) {
    if (!Array.isArray(segs)) return null;
    for (const s of segs) {
      if (Array.isArray(s) && t >= s[0] && t <= s[1]) return s;
    }
    return null;
  }

  // 选择器词干: tag + 首个 class (无 class 时回退 #id) —— 自学习规则聚合键
  // (id 仅在无 class 时参与: id 每元素唯一, 恒加入会使同 class 修正永不聚合)
  function selectorStem(el) {
    if (!el) return '';
    let tag = '';
    let id = '';
    let firstClass = '';
    try {
      tag = String(el.tagName || el.tagName === 0 ? el.tagName : '').toLowerCase();
      if (el.className && typeof el.className === 'object' && el.className.baseVal !== undefined) {
        // SVG 元素: className 为 SVGAnimatedString
        const cls = String(el.className.baseVal || '').trim().split(/\s+/).filter(Boolean);
        firstClass = cls[0] || '';
      } else if (typeof el.className === 'string') {
        const cls = el.className.trim().split(/\s+/).filter(Boolean);
        firstClass = cls[0] || '';
      }
      id = typeof el.id === 'string' ? el.id : '';
    } catch (e) { /* ignore */ }
    if (!tag) return '';
    if (firstClass) return tag + '.' + firstClass;
    if (id) return tag + '#' + id;
    return tag;
  }

  // 媒体主导视口占比: 视频面积 / 视口面积 (0..1); vw/vh 可注入 (纯度/单测)
  function mediaDominantViewport(video, vw, vh) {
    let w = vw;
    let h = vh;
    if ((w == null || h == null) && typeof window !== 'undefined') {
      try {
        w = w == null ? window.innerWidth : w;
        h = h == null ? window.innerHeight : h;
      } catch (e) { /* ignore */ }
    }
    if (!w || !h || !video || typeof video.getBoundingClientRect !== 'function') return 0;
    try {
      const rect = video.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return 0;
      const ratio = (rect.width * rect.height) / (w * h);
      return Math.max(0, Math.min(1, ratio));
    } catch (e) {
      return 0;
    }
  }

  // ==========================================
  // 14. 自学习规则引擎 (RuleLearner - R4: 学习手动修正, 告别手写规则)
  //     svi:learned = { [host]: { rules: [{stem, action: 'invert'|'protect', hits, lastAt}] } }
  //     优先级: 用户本站覆盖 > 学习规则 > 内置种子规则
  // ==========================================
  class RuleLearner {
    constructor() {
      this.data = Store.get('learned', {});
      if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) this.data = {};
    }

    _hostData(host) {
      if (!this.data[host] || typeof this.data[host] !== 'object') {
        this.data[host] = { rules: [] };
      }
      if (!Array.isArray(this.data[host].rules)) this.data[host].rules = [];
      return this.data[host];
    }

    // 每次 Alt+点击调用: action = 'invert' (强制反色) | 'protect' (恢复原色)
    record(host, el, action) {
      const stem = selectorStem(el);
      if (!host || !stem || (action !== 'invert' && action !== 'protect')) return null;
      const hd = this._hostData(host);
      let rule = hd.rules.find((r) => r.stem === stem);
      if (rule && rule.action === action) {
        rule.hits = (rule.hits || 0) + 1;
        rule.lastAt = Date.now();
      } else if (rule) {
        // 决策反转: 重置计数并更新动作
        rule.action = action;
        rule.hits = 1;
        rule.lastAt = Date.now();
      } else {
        rule = { stem, action, hits: 1, lastAt: Date.now() };
        hd.rules.push(rule);
      }
      // 每主机规则上限 100 (FIFO)
      if (hd.rules.length > 100) {
        hd.rules.sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
        hd.rules = hd.rules.slice(hd.rules.length - 100);
      }
      this.persist();
      return rule;
    }

    // 命中次数达 learnHits 的规则才生效
    activeRules(host) {
      const hd = this.data[host];
      if (!hd || !Array.isArray(hd.rules)) return [];
      const min = Math.max(2, Number(state.learnHits) || 2);
      return hd.rules.filter((r) => (r.hits || 0) >= min);
    }

    // 消费接口: 返回 'invert' | 'protect' | null
    decideFor(host, el) {
      const stem = selectorStem(el);
      if (!stem) return null;
      const rules = this.activeRules(host);
      for (const r of rules) {
        if (r.stem === stem) return r.action;
      }
      return null;
    }

    rulesFor(host) {
      const hd = this.data[host];
      return hd && Array.isArray(hd.rules) ? hd.rules.slice() : [];
    }

    deleteRule(host, stem) {
      const hd = this.data[host];
      if (!hd || !Array.isArray(hd.rules)) return false;
      const before = hd.rules.length;
      hd.rules = hd.rules.filter((r) => r.stem !== stem);
      if (hd.rules.length !== before) {
        this.persist();
        return true;
      }
      return false;
    }

    clearHost(host) {
      if (this.data[host]) {
        delete this.data[host];
        this.persist();
      }
    }

    persist() {
      try { Store.set('learned', this.data); } catch (e) { /* ignore */ }
    }
  }

  // 顶层实例 (启动引导与 UI 直接引用; 经 window.__svi.RuleLearner 暴露)
  const ruleLearner = new RuleLearner();

  // ==========================================
  // 14.5 v4.6 本地证据分类 (R1/R2: 判定依据 = 本地已渲染状态, 与网络交付解耦)
  // ==========================================
  // 档位 (design.md §2):
  //   A  像素可读 (complete && naturalWidth>0)     → 既有像素管线 (analyzeSrc)
  //   B  像素未解码但有布局盒 (占位图/懒加载)      → 本地保守判定: 只允许 keep 或既有规则结论
  //   C  连布局都没有 (未布局/隐藏/零尺寸)         → 只登记 pending, 由 load/IO/Mutation 唤醒
  // 只读无副作用: 绝不写属性/样式, 盒尺寸一次性读取, 不做强制布局; 祖先上下文仅 ≤3 层。
  function localEvidence(el) {
    const ev = {
      tier: 'C',
      hasDecodedPixels: false,
      box: { w: 0, h: 0 },
      visible: false,
      cssContext: { ancestorBg: null },          // 最近祖先背景 computed 串 (仅审计, 不参与反色决策)
      inlineHint: { width: null, height: null }, // 元素本地声明的尺寸提示 (弱网下先于字节可知)
    };
    if (!el || el.nodeType !== 1) return ev;

    // 已解码像素: img 系列看 complete+naturalWidth;
    // 无 complete 生命周期的媒体 (SVG <image> / input[type=image]) 视作本地可判
    // (与 v4.5 的 ready=true 分支对齐 —— 绝不落入档 C 等一个不会到来的 load)
    try {
      if (typeof el.complete === 'boolean') {
        ev.hasDecodedPixels = el.complete && (el.naturalWidth > 0);
      } else {
        ev.hasDecodedPixels = true;
      }
    } catch (e) { /* ignore */ }

    // 布局盒 + 可见性
    try {
      let w = 0;
      let h = 0;
      if (typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        w = Math.round(rect.width) || 0;
        h = Math.round(rect.height) || 0;
      }
      if (!w || !h) {
        w = w || el.clientWidth || 0;
        h = h || el.clientHeight || 0;
      }
      ev.box.w = w;
      ev.box.h = h;
      ev.visible = w > 0 && h > 0;
    } catch (e) { /* ignore */ }

    // 内联尺寸提示 (HTML width/height 属性声明的本地尺寸)
    try {
      const aw = el.getAttribute ? el.getAttribute('width') : null;
      const ah = el.getAttribute ? el.getAttribute('height') : null;
      const num = (v) => (v != null && v !== '' && !isNaN(parseFloat(v)) ? Math.round(parseFloat(v)) : null);
      ev.inlineHint.width = num(aw);
      ev.inlineHint.height = num(ah);
    } catch (e) { /* ignore */ }

    // 有限层祖先背景上下文 (≤3 层; 只读 computed, 供审计与保守规则扩展)
    try {
      let node = el.parentElement;
      for (let i = 0; node && i < 3; i++, node = node.parentElement) {
        if (typeof window.getComputedStyle !== 'function') break;
        const bg = window.getComputedStyle(node).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          ev.cssContext.ancestorBg = bg;
          break;
        }
      }
    } catch (e) { /* ignore */ }

    ev.tier = ev.hasDecodedPixels ? 'A' : (ev.visible ? 'B' : 'C');
    return ev;
  }

  // 临时决策判定 (v4.6 C4/C5): 档 B 本地保守结论落快照时携带 provisional 标记 ——
  // 元素本地证据升级 (占位图解码完成) 时允许被权威结论 force 刷新; 同档输入绝不翻转。
  function isProvisionalDecision(d) {
    return !!(d && d.provisional === true);
  }

  // ==========================================
  // 15. 网页图片与矢量图智能反色引擎 (ImageInvertEngine)
  //     v3.0: 学习规则优先级注入 + 媒体全覆盖 (SVG image / input[type=image] / Shadow DOM)
  //     v3.1: 统一决策管线 decideImage (R1/R2) —— 所有处理入口 (IO / 变更 flush / eager / 重扫)
  //           一律经同一管线; decide-once 语义: 同一 src 的最终决策只算一次并缓存
  //           (decisionBySrc), 任何入口绝不重算已决 src, 仅 clearCacheAndRescan 显式重置
  //           (修复 F3: 同图在不同处理通道间决策翻转)。失败分析有界重试 (≤3 次 / 60s TTL)。
  //         eager 初始处理 (R1): 启动时已加载完成的图片不等待视口交叉, 预算内立即决策;
  //         变更快路径 (R6): 新增/变更媒体命中决策缓存 → 同步应用 (放大镜类插件覆盖层即时反色)
  // ==========================================
  class ImageInvertEngine {
    constructor() {
      this.observer = null;
      this.cache = new Map();          // src → isLight (像素分析结论, 最终决策)
      this.decisionBySrc = new Map();  // src → { verdict: 'invert'|'keep'|'skip', reason, at } (v3.1 决策快照)
      this.failures = new Map();       // src → { at, count } (分析失败有界重试: ≤3 次 / 60s TTL)
      this.inflightSrcs = new Map();   // src → Promise (in-flight 分析去重: 并发入口共享一次分析)
      this.maxCacheSize = 1000;
      this.maxDecisionSize = 2000;
      this.srcCount = new Map();      // 同 src 重复计数 (小元素重复判定), 上限 500
      // v4.6 本地优先: 档 B/C pending 登记表 (有界 LRU ≤500; load/IO/Mutation 均可唤醒重判)
      this.pendingEls = new Map();
      this.pendingMutNodes = new Set();
      this.mutTimer = null;
      // v3.0: 覆盖 img + svg + 内联 SVG image + input[type=image]
      this.MEDIA_SELECTOR = 'img, svg, image, input[type="image" i]';
      this._eagerTimers = [];
      this.init();
      this.bindManualToggle();
      window.__svi_image_engine = this;
    }

    get fx() {
      return (window.__svi && window.__svi.engines) ? window.__svi.engines.imageFx : null;
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
            const tag = target.tagName ? String(target.tagName).toLowerCase() : '';
            if (tag === 'img' || tag === 'image' || tag === 'input') {
              this.processImage(target);
            } else if (tag === 'svg') {
              this.processSvg(target);
            }
          }
        });
      }, { rootMargin: '300px' });

      this.scanAll();
      // v3.1 R1: eager 初始处理 (预算内立即决策已加载完成的图片, 先于 IO 懒加载尾部);
      // 启动后延迟补扫多轮, 覆盖引擎启动后才完成加载的图片 (GitHub README 慢网场景),
      // decide-once 保证重复执行近零成本
      this.runEagerPass();
      this._eagerTimers.push(setTimeout(() => this.runEagerPass(), 2500));
      this._eagerTimers.push(setTimeout(() => this.runEagerPass(), 6000));
      this._eagerTimers.push(setTimeout(() => this.runEagerPass(), 12000));
      // v4.6: 上述三轮仅作兜底补扫 (覆盖引擎启动后才出现的媒体); 本地优先判定已由
      // 首轮 runEagerPass + IO/Mutation 事件完成, 不再以补扫作为主路径 (R3)。

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
        attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'href']
      });
    }

    // v3.1 R1: eager 初始处理 —— 遍历已加载完成 (complete 且有自然尺寸) 的媒体,
    // 预算 state.eagerScanBudget (默认 80) 内立即进入统一决策管线;
    // 首屏 README 无需滚动即反色 (F2 修复)。已决元素早退, 重复执行近零成本。
    runEagerPass() {
      if (runtime.siteActive === false) return; // v4.0 站点挂起闸
      if (document.hidden) return;
      const root = document.body || document.documentElement;
      if (!root || !root.querySelectorAll) return;
      const budget = Math.max(1, Math.round(Number(state.eagerScanBudget) || 80));
      const scanCap = budget * 6;
      let used = 0;
      let scanned = 0;
      const self = this;
      const visit = (el) => {
        if (used >= budget || scanned >= scanCap) return;
        scanned++;
        const src = getMediaSrc(el);
        if (!src) return;
        try {
          if (el.getAttribute && el.getAttribute('data-svi-checked-src') === src) return; // 已决: 不占预算
        } catch (e) { return; }
        let loaded = true;
        const tag = el.tagName ? String(el.tagName).toLowerCase() : '';
        if (tag === 'img') {
          loaded = !!el.complete && (el.naturalWidth > 0);
        } else if (typeof el.complete === 'boolean') {
          loaded = el.complete;
        }
        // v4.6 本地优先 (R3): 未解码不再跳过 —— 档 B 立即本地保守判定 / 档 C 登记 pending;
        // eager 升级为首屏抢先主路径 (回退开关 localFirstDecide=false 维持 v4.5 旧行为)
        if (!loaded && state.localFirstDecide === false) return;
        used++;
        self.processImage(el);
      };
      try {
        root.querySelectorAll('img, image, input[type="image" i]').forEach(visit);
      } catch (e) { /* ignore */ }
      // Shadow DOM 有界补充 (≤20 根)
      if (used < budget) {
        ShadowDomRegistry.forEachRoot((sr) => {
          if (used >= budget) return;
          try { sr.querySelectorAll('img, image, input[type="image" i]').forEach(visit); } catch (e) { /* ignore */ }
        });
      }
    }

    flushMutations() {
      if (runtime.siteActive === false) { // v4.0 站点挂起闸: 清队不处理
        this.pendingMutNodes.clear();
        return;
      }
      if (document.hidden) {
        // 页面隐藏时挂起, 稍后重试
        this.mutTimer = setTimeout(() => this.flushMutations(), 1000);
        return;
      }
      const nodes = Array.from(this.pendingMutNodes);
      this.pendingMutNodes.clear();
      let fastApplied = 0;
      const self = this;
      // v3.1 R6 变更快路径: 新增/变更媒体命中决策缓存 → 同步应用 (不入队、不重算),
      // 放大镜/看图类插件动态插入的覆盖层媒体即时反色
      const handle = (el) => {
        const src = getMediaSrc(el);
        if (!src) { self.observe(el); return; }
        try {
          if (el.getAttribute && el.getAttribute('data-svi-checked-src') === src) return; // 本元素已决
        } catch (e) { /* ignore */ }
        const known = self.decisionBySrc.get(src);
        // v4.6 C4: 档 B 临时结论不走快路径继承 —— provisional 快照留给 IO/eager 通道做档位升级重判
        if (known && fastApplied < 200 && !isProvisionalDecision(known)) {
          fastApplied++;
          self.applyDecision(el, src, known);
          return;
        }
        self.observe(el);
      };
      for (const node of nodes) {
        const tag = node.tagName ? String(node.tagName).toLowerCase() : '';
        if (tag === 'img' || tag === 'svg' || tag === 'image' || tag === 'input') {
          handle(node);
          this.collectShadowMediaUnder(node, handle);
        } else if (node.querySelectorAll) {
          try {
            node.querySelectorAll(this.MEDIA_SELECTOR).forEach(handle);
            this.collectShadowMediaUnder(node, handle);
          } catch (e) { /* ignore */ }
        }
      }
      this.refreshSrcCounts();
    }

    // v3.1 R6: 追加节点的宿主若携带已注册 Shadow Root (含闭合根), 其内部媒体一并纳入处理
    collectShadowMediaUnder(node, cb) {
      ShadowDomRegistry.forEachRoot((sr) => {
        try {
          const host = sr.host;
          if (host && (host === node || (node.contains && node.contains(host)))) {
            sr.querySelectorAll(this.MEDIA_SELECTOR).forEach(cb);
          }
        } catch (e) { /* ignore */ }
      });
    }

    // 同 src 重复计数: 每次全量重算 (不可累加, 否则动态页面多次刷新后计数虚高,
    // 会把正常小图误判为"重复贴图"而跳过反色); 上限 500 条防止超大页面无界增长
    refreshSrcCounts() {
      const root = document.body || document.documentElement;
      if (!root || !root.querySelectorAll) return;
      const next = new Map();
      try {
        root.querySelectorAll('img, image, input[type="image" i]').forEach((img) => {
          const s = getMediaSrc(img);
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
        root.querySelectorAll(this.MEDIA_SELECTOR).forEach((el) => this.observe(el));
      } catch (e) { /* ignore */ }
      // Shadow DOM 有界扫描 (≤20 根)
      ShadowDomRegistry.forEachRoot((sr) => {
        try {
          sr.querySelectorAll(this.MEDIA_SELECTOR).forEach((el) => this.observe(el));
        } catch (e) { /* ignore */ }
      });
    }

    clearCacheAndRescan() {
      this.cache.clear();
      this.decisionBySrc.clear();
      this.failures.clear();
      if (this.pendingEls) this.pendingEls.clear(); // v4.6: pending 登记随全量重扫一并清空
      const bg = window.__svi && window.__svi.engines ? window.__svi.engines.bgImage : null;
      if (bg && bg.cache) bg.cache.clear();
      const root = document.body || document.documentElement;
      if (!root) return;
      try {
        root.querySelectorAll(this.MEDIA_SELECTOR).forEach((el) => {
          el.removeAttribute('data-svi-checked-src');
          el.removeAttribute('data-svi-checked');
          this.observe(el);
        });
      } catch (e) { /* ignore */ }
      this.scanAll();
      this.runEagerPass();
    }

    observe(el) {
      if (!this.observer || !el) return;
      const tag = el.tagName ? String(el.tagName).toLowerCase() : '';
      if (tag === 'img' || tag === 'image' || tag === 'input') {
        const src = getMediaSrc(el);
        if (src && el.getAttribute('data-svi-checked-src') === src) return;
      }
      this.observer.observe(el);
    }

    // v3.1 R6: Alt+点击目标解析 —— composedPath 优先 (穿透 Shadow DOM, 含开/闭合根:
    // 文档级监听的 composedPath 对开/闭合根一律重定向到 host, 内部节点不可见,
    // 故统一经 ShadowDomRegistry 注册表按 host 解析根内媒体), 兜底回退 closest
    resolveMediaFromEvent(e) {
      let target = null;
      let path = null;
      try { path = (typeof e.composedPath === 'function') ? e.composedPath() : null; } catch (err) { path = null; }
      if (path && path.length) {
        for (const n of path) {
          if (!n || n.nodeType !== 1) continue;
          const tag = n.tagName ? String(n.tagName).toLowerCase() : '';
          const isMedia = tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'video'
            || tag === 'image'
            || (tag === 'input' && String(n.getAttribute('type') || '').toLowerCase() === 'image')
            || (n.hasAttribute && n.hasAttribute('data-svi-bginv'));
          if (isMedia) { target = n; break; }
        }
      }
      // Shadow Root (开/闭合): composedPath 在文档级监听下重定向到 host → 经注册表解析根内媒体
      if (!target && path && path.length) {
        for (const n of path) {
          if (!n || n.nodeType !== 1) continue;
          ShadowDomRegistry.forEachRoot((sr) => {
            if (target || !sr || sr.host !== n) return;
            try {
              const media = sr.querySelectorAll('img, svg, canvas, video, image, input[type="image" i], [data-svi-bginv]');
              for (const m of media) { target = m; break; }
            } catch (err) { /* ignore */ }
          });
          if (target) break;
        }
      }
      if (!target) {
        try { target = e.target && e.target.closest ? e.target.closest(this.MEDIA_SELECTOR) : null; } catch (err) { target = null; }
      }
      return target;
    }

    // v3.1: Alt+点击核心抽取 (当前页媒体面板"反色/复原"复用同一覆盖路径);
    // 覆盖即决策: 同步刷新决策快照, 后续新增元素经快路径立即继承手动决策。
    // v4.6 防覆盖重写: 全分支同帧写齐「属性 + data-svi-manual 标记 + manualOverrides +
    // force 决策快照」四元组, 异步投递回调 / canvas 首扫 / 重扫一律不得拉回 (C2/C4);
    // fx 杀停同帧摘投递挂点 (clearFor), 视觉还原不依赖 CSS 级联顺序 (根因 B)。
    toggleMediaOverride(target) {
      if (!target) return false;
      try {
        const src = getMediaSrc(target);
        // —— 分支 1: 特效投递态 (data-svi-fx) —— 杀停 ⇄ 恢复特效, 结论一律落 manual
        if (target.getAttribute('data-svi-fx')) {
          const off = target.getAttribute('data-svi-fx-off') === 'true';
          if (off) {
            target.removeAttribute('data-svi-fx-off');
            showToast('已恢复特效 (Alt+点击)');
          } else {
            // v4.6 杀停: fx-off 属性保留 (视觉还原由投递规则 :not 选择器同帧完成 —— 根因 H4 变体
            // 已修: 规则不再命中杀停态); 在途投递回调经 applyTo 的占优门放弃, 不会回写
            target.setAttribute('data-svi-fx-off', 'true');
            showToast('已还原原图 (Alt+点击)');
          }
          this.markManual(target, src, off ? 'invert' : 'restore', off ? 'invert' : 'keep');
          return true;
        }
        // —— 分支 2: 背景图元素 (通用标签): 反色标记是 data-svi-bginv (元素级 CSS 门) ——
        const tag = target.tagName ? String(target.tagName).toLowerCase() : '';
        const isMediaTag = tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'video' || tag === 'image'
          || (tag === 'input' && String(target.getAttribute('type') || '').toLowerCase() === 'image');
        const isBginv = target.getAttribute('data-svi-bginv') === 'true';
        const isCurrentlyInverted = isBginv || target.getAttribute('data-svi-inverted') === 'true';
        const want = !isCurrentlyInverted;
        if (!isMediaTag) {
          if (want) target.setAttribute('data-svi-bginv', 'true');
          else target.removeAttribute('data-svi-bginv');
          target.removeAttribute('data-svi-inverted'); // 双标记互斥, 防双重滤镜
        } else {
          applyInvertState(target, want, 'manual');
        }
        showToast(want ? '已手动反色 (Alt+点击)' : '已恢复原色 (Alt+点击)');
        this.markManual(target, src, want ? 'invert' : 'restore', want ? 'invert' : 'keep');
        // v4.6 H4 防线: 手动写属性后立即重算 CSS 门类 (属性可见性必须同帧成立)
        try { updateImageFilterCss(); } catch (e) { /* ignore */ }
        // —— 同 src 兄弟元素同帧联动 (H3): 手动结论是 src 级, 渲染态保持一致 ——
        if (src) this.propagateManualToSiblings(target, src, want);
        return true;
      } catch (e) { /* ignore */ }
      return false;
    }

    // v4.6: 手动结论四元组落位 (元素标记 + host|src 记忆 + force 决策快照 + 学习累积)
    markManual(el, src, overrideValue, verdict) {
      try {
        // 元素级标记: 无 src 的媒体 (canvas/背景元素) 也受防覆盖保护 (C2)
        el.setAttribute('data-svi-manual', overrideValue);
      } catch (e) { /* ignore */ }
      if (src) {
        addManualOverride(state.manualOverrides, manualOverrideKey(profileKey(), src), overrideValue, 400);
        savePrefs();
        // v3.1: 决策快照强制刷新 (手动覆盖最高优先; 后续新增同 src 元素经快路径立即继承手动决策)
        this.recordDecision(src, verdict, 'manual', true);
      }
      try {
        ruleLearner.record(profileKey(), el, overrideValue === 'invert' ? 'invert' : 'protect');
      } catch (err) { /* ignore */ }
    }

    // v4.6: 同 src 兄弟元素同帧继承手动结论 (有界 24 个; fx 兄弟只切 fx-off, 不写滤镜标记)
    propagateManualToSiblings(origin, src, want) {
      let n = 0;
      const visit = (el) => {
        if (n >= 24 || !el || el === origin) return;
        try { if (getMediaSrc(el) !== src) return; } catch (e) { return; }
        try {
          if (el.getAttribute('data-svi-fx')) {
            if (want) el.removeAttribute('data-svi-fx-off');
            else el.setAttribute('data-svi-fx-off', 'true');
            el.setAttribute('data-svi-manual', want ? 'invert' : 'restore');
          } else {
            applyInvertState(el, want, 'manual');
            el.setAttribute('data-svi-manual', want ? 'invert' : 'restore');
          }
          n++;
        } catch (e) { /* ignore */ }
      };
      try {
        const root = document.body || document.documentElement;
        if (root && root.querySelectorAll) root.querySelectorAll('img, image, input[type="image" i], canvas, video').forEach(visit);
      } catch (e) { /* ignore */ }
      ShadowDomRegistry.forEachRoot((sr) => {
        try { sr.querySelectorAll('img, image, input[type="image" i], canvas, video').forEach(visit); } catch (e) { /* ignore */ }
      });
      if (n > 0) {
        try { StatsManager.count('manualSiblingSyncs'); } catch (e) { /* ignore */ }
      }
    }

    bindManualToggle() {
      document.addEventListener('click', (e) => {
        if (e.altKey && runtime.siteActive !== false) { // v4.0 站点挂起闸
          const target = this.resolveMediaFromEvent(e);
          if (target) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleMediaOverride(target);
          }
        }
      }, true);
    }

    processSvg(svg) {
      if (runtime.siteActive === false) return; // v4.0 站点挂起闸
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
          applyInvertState(svg, true, 'pixel'); // v4.6: 写点收口
          return;
        }
      }

      if (window.getComputedStyle) {
        const styleBg = window.getComputedStyle(svg).backgroundColor;
        if (styleBg === 'rgb(255, 255, 255)' || styleBg === '#fff' || styleBg === '#ffffff') {
          applyInvertState(svg, true, 'pixel'); // v4.6: 写点收口
        }
      }
    }

    // 最终反色决策落点: 特效引擎接管 (content:url 部分反色) 或 CSS 滤镜属性
    // v4.6: 属性写点全部收口 applyInvertState (手动结论幂等占优, C2/C3)
    finalizeInvert(el, src, wantInvert) {
      // kill switch 生效中的图片: 保持原图 (既不走特效也不走 CSS 滤镜, 防双重处理)
      try {
        if (el.getAttribute && el.getAttribute('data-svi-fx') && el.getAttribute('data-svi-fx-off') === 'true') {
          applyInvertState(el, false, 'fx-mutex');
          return;
        }
      } catch (e) { /* ignore */ }
      const fx = this.fx;
      if (fx && fx.wantsFx(el, src)) {
        applyInvertState(el, false, 'fx-mutex');
        if (wantInvert || fx.modeAppliesToAll(el)) {
          fx.enqueue(el, src, wantInvert);
        } else {
          fx.clearFor(el);
        }
        return;
      }
      if (fx) fx.clearFor(el);
      applyInvertState(el, wantInvert, 'pixel');
    }

    // —— v3.1 决策快照与落点 ——

    // 记录最终决策 (decide-once): 同一 src 只允许记录一次;
    // 后续任何入口命中快照即同步应用, 绝不重算 (F3 根因修复)。
    // 例外1: force=true (手动覆盖是最高优先级决策源, 必须刷新既有快照,
    // 否则变更快路径会用旧决策覆盖用户显式选择)
    // 例外2 (v4.6 C4): provisional=true 标记档 B 临时结论 —— 元素本地证据升级
    // (占位图解码完成) 时允许权威结论 force 刷新; 同档输入绝不翻转。
    recordDecision(src, verdict, reason, force, provisional) {
      if (!force && this.decisionBySrc.has(src)) return this.decisionBySrc.get(src);
      if (this.decisionBySrc.size >= this.maxDecisionSize) {
        this.decisionBySrc.delete(this.decisionBySrc.keys().next().value);
      }
      const d = { verdict, reason: reason || '', at: Date.now() };
      if (provisional) d.provisional = true;
      this.decisionBySrc.set(src, d);
      return d;
    }

    // 决策落点: 唯一允许写 data-svi-checked-src 的位置 (决策达成之后), 同时清除失败标记
    applyDecision(el, src, d) {
      try {
        el.setAttribute('data-svi-checked-src', src);
        el.removeAttribute('data-svi-failed');
      } catch (e) { /* ignore */ }
      this.finalizeInvert(el, src, d.verdict === 'invert');
    }

    // 分析失败登记: 60s TTL 内不重试; 累计 3 次后由 decideImage 落为永久跳过决策
    markFailure(img, src) {
      const prev = this.failures.get(src) || { at: 0, count: 0 };
      prev.count += 1;
      prev.at = Date.now();
      this.failures.set(src, prev);
      try { img.setAttribute('data-svi-failed', String(prev.at)); } catch (e) { /* ignore */ }
    }

    // ==========================================
    // v3.1 统一决策管线 (R1/R2/R4) —— 唯一决策函数, 全部处理入口共用。
    // 优先级: 手动覆盖 > 元素规则(v3.3) > 学习规则 > 种子保护/强制反色 > 小元素门 + 策略门 > 像素分析。
    // decide-once: 决策一经达成即冻结 (decisionBySrc), 仅 clearCacheAndRescan 显式重置。
    // ==========================================
    async decideImage(img, src, opts) {
      if (!src) return;
      const profile = getSiteProfile();
      if (state.imageInvert === false || profile.enabled === false || profile.imageInvert === false) return;
      // v4.6 本地优先 (档 B 通道): localOnly=true 只走规则前缀, 到像素门前止步 (R1/R3)
      const localOnly = !!(opts && opts.localOnly);

      // —— decide-once: 本元素该 src 已决 → 直接返回 ——
      try {
        if (img.getAttribute && img.getAttribute('data-svi-checked-src') === src) return;
      } catch (e) { /* ignore */ }

      // 1. 手动覆盖记忆最高优先 (Alt+点击 的持久化决策) —— 刻意先于决策快照:
      //    上一会话/他元素写入的覆盖必须压过本会话已落的快照决策 (设计管线第 1 步)
      const ov = state.manualOverrides[manualOverrideKey(profileKey(), src)];
      if (ov === 'invert') {
        this.applyDecision(img, src, this.recordDecision(src, 'invert', 'manual', true));
        return;
      }
      if (ov === 'restore') {
        this.applyDecision(img, src, this.recordDecision(src, 'keep', 'manual', true));
        return;
      }

      // 1.5 用户元素规则 (v3.3 显式配置, 优先于快照/学习/种子): 命中即强制决策并刷新快照
      const erule = firstMatchingElementRule(img, profile.elementRules);
      if (erule) {
        this.applyDecision(img, src, this.recordDecision(src, erule.action === 'invert' ? 'invert' : 'keep', 'element-rule', true));
        return;
      }

      // 1.6 v4.6 暗色遮罩上下文 (优先级: 元素规则之下、快照/学习/种子/像素之上):
      // 祖先暗色蒙层使合成观感已暗 —— 对本管线后续一切"自动反色"结论 (学习/种子强制/像素)
      // 施行否决, 改判 keep 并记原因 masked-dark (C1)。手动覆盖与元素规则不受影响 (用户
      // 显式意图最高)。仅对尚无快照的 src 计算一次 (C5 decide-once: 首轮吸收本元素几何
      // 证据入快照, 同 src 后续元素复用快照, 绝不重算不翻转)。
      let maskCtx = null;
      if (!this.decisionBySrc.has(src) && state.maskAware !== false) {
        maskCtx = maskedDarkContext(img);
      }
      const maskedVeto = () => {
        if (!(maskCtx && maskCtx.masked)) return false;
        StatsManager.count('maskedDarkKeeps');
        this.applyDecision(img, src, this.recordDecision(src, 'keep', 'masked-dark'));
        return true;
      };

      // —— 全局决策快照命中 ——
      // v4.6 C4 档位升级: 档 B 临时结论 (provisional, 占位期间的本地保守判定) 不早退 ——
      // 元素本地证据升级 (占位图解码完成) 属于新证据, 删除临时快照后按全管线重判;
      // 同档输入之间仍绝不翻转 (decide-once 语义不变)。
      const known = this.decisionBySrc.get(src);
      if (known) {
        if (isProvisionalDecision(known)) {
          this.decisionBySrc.delete(src);
        } else {
          this.applyDecision(img, src, known);
          return;
        }
      }

      // 2. 自学习规则 (tag+#id+首类 词干聚合, 命中 ≥ learnHits 生效; 优先于内置种子规则)
      const learned = ruleLearner.decideFor(profileKey(), img);
      if (learned === 'invert') {
        if (maskedVeto()) return; // v4.6: 遮罩否决 (合成观感已暗, 自动反色让位)
        this.applyDecision(img, src, this.recordDecision(src, 'invert', 'learned'));
        return;
      }
      if (learned === 'protect') {
        this.applyDecision(img, src, this.recordDecision(src, 'keep', 'learned'));
        return;
      }

      // 3. 种子规则: 保护选择器 (头像/图标/播放器内部等永不反色)
      if (safeMatches(img, profile.protect)) {
        this.applyDecision(img, src, this.recordDecision(src, 'keep', 'protected'));
        return;
      }

      // favicon 类直接跳过 (v3.1 修复: 旧正则含转义反斜杠, 恒不匹配)
      if (/\.(ico|cur)(\?.*)?$/i.test(src)) {
        this.applyDecision(img, src, this.recordDecision(src, 'skip', 'favicon'));
        return;
      }

      // 4. 种子强制反色选择器 (GitHub markdown/camo 等) —— v3.1 顺序修复 (F3):
      //    强制反色先于小元素/策略门, 首个处理通道 (含 eager 首扫) 即生效,
      //    同一图片在任何通道得到同一决策, 不再随处理轮次翻转
      if (safeMatches(img, profile.forceInvert)) {
        if (maskedVeto()) return; // v4.6: 遮罩否决优先于种子强制反色 (蒙层下强制反色同样破坏合成)
        if (this.cache.size >= this.maxCacheSize) {
          this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(src, true);
        this.applyDecision(img, src, this.recordDecision(src, 'invert', 'seed-force'));
        return;
      }

      // 5. 智能小元素门 (p0: 图标/徽章/重复贴图永不自动反色)
      const info = buildClassifyInfo(img, this.srcCount);
      const verdict = classifySmallElement(info);
      if (verdict.skip) {
        this.applyDecision(img, src, this.recordDecision(src, 'skip', verdict.reason));
        return;
      }

      // 6. 图片策略门 (R4: balanced 默认 —— 正文/大图反色, 封面网格与页面骨架跳过)
      if (!passesImagePolicy(info)) {
        this.applyDecision(img, src, this.recordDecision(src, 'skip', 'policy'));
        return;
      }

      // v4.6 本地优先 (档 B 止步门): 规则前缀全部未命中 → 绝不做像素分析 (R1: 不以网络为门);
      // 返回信号由档 B 调用方落本地保守结论 (keep; 绝不凭 cssContext 反色 —— design §5 约束)
      if (localOnly) return { localOnly: true };

      // 7. 分析失败有界重试 (R2): 60s TTL 内静默 (未决); 累计 ≥3 次 → 永久跳过决策。
      //    位置刻意晚于全部确定性门 (覆盖/学习/种子/小元素/策略), 绝不阻塞更优先的决策来源
      const fail = this.failures.get(src);
      if (fail) {
        if (Date.now() - fail.at < 60000) return;
        if (fail.count >= 3) {
          StatsManager.count('imageAnalysisFailures');
          this.applyDecision(img, src, this.recordDecision(src, 'skip', 'analysis-failed'));
          return;
        }
      }

      // 8. 像素分析 (结论缓存命中 → 直接落决策, 不再重算; in-flight 去重: 同 src
      //    并发入口共享一次分析 —— eager/IO/补扫同时触达同一图片时绝不重复解码)
      if (this.cache.has(src)) {
        const isLight = this.cache.get(src);
        if (isLight && maskedVeto()) return; // v4.6: 遮罩否决 (缓存像素判定为亮时仍需过蒙层上下文)
        this.applyDecision(img, src, this.recordDecision(src, isLight ? 'invert' : 'keep', 'pixel'));
        return;
      }

      let r;
      const inflightJob = this.inflightSrcs.get(src);
      if (inflightJob) {
        r = await inflightJob;
      } else {
        const job = analyzeSrc(src, img, getEvalPrefs());
        this.inflightSrcs.set(src, job);
        try {
          r = await job;
        } finally {
          this.inflightSrcs.delete(src);
        }
      }
      // 解码期间元素被移除/换源: 本次结果作废 (下次入口按新 src 重新进入管线)
      try {
        if (getMediaSrc(img) !== src) return;
      } catch (e) { /* ignore */ }
      if (!r || !r.ok) {
        // 网络或格式异常: 不落决策 (未决), 记录失败 TTL 防抖 (≤3 次, 之后永久跳过)
        this.markFailure(img, src);
        return;
      }

      // v4.6 竞态复核: await 期间落盘的更高优先级决策 (手动覆盖等) 不可被像素结论覆盖;
      // 档 B 临时结论 (provisional) 让位于像素权威结论 —— 档位升级的最终落点 (C4)
      const raced = this.decisionBySrc.get(src);
      if (raced) {
        if (!isProvisionalDecision(raced)) {
          this.applyDecision(img, src, raced);
          return;
        }
        this.decisionBySrc.delete(src);
      }

      if (this.cache.size >= this.maxCacheSize) {
        this.cache.delete(this.cache.keys().next().value);
      }
      this.cache.set(src, r.isLight);
      StatsManager.count('imagesAnalyzed');

      // v4.3 智能纠错 (sanity 门): 分类为"浅色"但整体平均亮度证据不足 —— 典型如大面积深色
      // 主体混白色底被白占比阈值误判 —— 绝不自动反色, 从源头消灭"反成错误白"
      if (r.isLight && typeof r.meanLum === 'number' && r.meanLum >= 0 && r.meanLum < 96) {
        this.cache.set(src, false);
        this.applyDecision(img, src, this.recordDecision(src, 'keep', 'sanity-dark'));
        return;
      }

      // v4.5 透明底守护: 大量透明像素的"浅色"判定 —— 透明底图形 (站点 logo/徽标/图标) 是为
      // 其所在背景设计的, 反色后必然破坏 (黑字变白字隐身 / 品牌色相翻转)。真实白底文档图是
      // 不透明的。透明占比 ≥60% 一律保持原样 (Alt+点击仍可手动反色)。
      if (r.isLight && typeof r.opaqueRatio === 'number' && r.opaqueRatio < 0.4) {
        this.cache.set(src, false);
        this.applyDecision(img, src, this.recordDecision(src, 'keep', 'transparent-light'));
        return;
      }

      if (r.isLight && maskedVeto()) return; // v4.6: 遮罩否决 (合成观感已暗, 不反色; 不入复检网避免翻转)

      this.applyDecision(img, src, this.recordDecision(src, r.isLight ? 'invert' : 'keep', 'pixel'));

      // v4.3 智能纠错 (复检网): 像素反色决策限时复检 —— 分类翻转则改写缓存/作废旧快照并重扫,
      // "反错的白色"不再永远错下去 (有界: 每源至多一次, 队列上限 12)
      if (r.isLight) this.queueRecheck(src);
    }

    // v4.3: 像素反色决策的限时复检 (有界自愈; 每源至多一次)
    queueRecheck(src) {
      if (!this._recheckQueue) {
        this._recheckQueue = [];
        this._rechecked = new Set();
      }
      if (this._rechecked.has(src) || this._recheckQueue.length >= 12) return;
      this._rechecked.add(src);
      this._recheckQueue.push(src);
      if (this._recheckTimer) return;
      this._recheckTimer = setTimeout(() => {
        this._recheckTimer = null;
        const batch = this._recheckQueue.splice(0, this._recheckQueue.length);
        requestIdle(() => { this.runRecheck(batch); }, 2000);
      }, 6000);
    }

    async runRecheck(srcs) {
      for (const src of srcs) {
        if (runtime.siteActive === false) return;
        const old = this.decisionBySrc.get(src);
        if (!old || old.reason !== 'pixel' || old.verdict !== 'invert') continue; // 只复检仍为像素反色的
        let r = null;
        try { r = await analyzeSrc(src, null, getEvalPrefs()); } catch (e) { continue; }
        if (!r || !r.ok) continue;
        // 证据可信门: 透明占比过高的样本 (典型: SVG 透明底只剩深色线条) 亮度均值不可信, 不改判
        if (!(typeof r.opaqueRatio === 'number' && r.opaqueRatio >= 0.5)) continue;
        const stillLight = r.isLight && !(typeof r.meanLum === 'number' && r.meanLum >= 0 && r.meanLum < 96);
        if (stillLight) continue;
        // 判定翻转: 改写缓存, 作废旧快照 (下次进入管线重判), 摘标记让引擎重扫该元素
        this.cache.set(src, false);
        this.decisionBySrc.delete(src);
        let n = 0;
        try {
          document.querySelectorAll('[data-svi-checked-src]').forEach((el) => {
            if (getMediaSrc(el) !== src) return;
            el.removeAttribute('data-svi-checked-src');
            el.removeAttribute('data-svi-inverted');
            el.removeAttribute('data-svi-fx');
            if (n < 20) {
              this.observe(el);
              n++;
            }
          });
        } catch (e) { /* ignore */ }
        StatsManager.count('verdictRechecks');
      }
    }

    // 处理入口 (IO / eager / 变更 flush 共用): 就绪判定 + 晚加载 load 事件驱动 (有界, 无悬挂状态)
    async processImage(img) {
      if (runtime.siteActive === false) return; // v4.0 站点挂起闸
      const src = getMediaSrc(img);
      if (!src) return;

      try {
        if (img.getAttribute && img.getAttribute('data-svi-checked-src') === src) return;
      } catch (e) { /* ignore */ }

      const profile = getSiteProfile();
      if (state.imageInvert === false || profile.enabled === false || profile.imageInvert === false) return;

      // v4.6 回退开关: localFirstDecide=false → v4.5 旧行为 (未解码挂 load 等网络, 无本地保守判定)
      if (state.localFirstDecide === false) {
        const ready = (img.complete !== undefined)
          ? (img.complete && (img.naturalWidth > 0 || !img.getAttribute('src')))
          : true;
        if (ready || typeof img.addEventListener !== 'function') {
          await this.decideImage(img, src);
        } else {
          img.addEventListener('load', () => {
            this.decideImage(img, getMediaSrc(img));
          }, { once: true });
          img.addEventListener('error', () => {
            this.markFailure(img, src);
          }, { once: true });
        }
        return;
      }

      // —— v4.6 本地优先三档分派 (R1/R2/R3): 网络语义的 load 仅作档位升级增强通道 ——
      const ev = localEvidence(img);
      if (ev.tier === 'A' || typeof img.addEventListener !== 'function') {
        // 档 A (像素可读) → 既有统一决策管线
        await this.decideImage(img, src);
        return;
      }

      if (ev.tier === 'B') {
        // 档 B (布局盒已知 / 像素未解码, 典型: 占位图、懒加载未达):
        // 立即用本地证据出保守结论, 绝不等网络 (弱网抢先主路径)
        const known = this.decisionBySrc.get(src);
        if (known && !isProvisionalDecision(known)) {
          this.applyDecision(img, src, known); // 已有权威结论 → 直接继承
          this.registerPending(img, src);
          return;
        }
        // 规则结论 (手动/元素/学习/种子) 不依赖像素, 可在字节交付前落地 (decide-once 同序)
        await this.decideImage(img, src, { localOnly: true });
        const decided = this.decisionBySrc.get(src);
        if (!decided) {
          // 无规则可依 → 本地上下文保守结论: keep (绝不凭 cssContext 反色, design §5)
          const reason = (ev.inlineHint.width != null || ev.inlineHint.height != null)
            ? 'local-inline-hint' : 'local-context';
          this.applyDecision(img, src, this.recordDecision(src, 'keep', reason, false, true));
        }
        this.registerPending(img, src);   // 等 load 升级档 A (一次性监听, 无悬挂状态)
        this.attachPendingWake(img, src);
        return;
      }

      // 档 C (连布局都没有): 只登记不判定 (C3: 不写 checked-src / 不落快照),
      // 由 load / IO 交叉 / Mutation 事件自然唤醒重判
      this.registerPending(img, src);
      this.attachPendingWake(img, src);
    }

    // —— v4.6 档 B/C pending 登记表 (有界 LRU ≤500; 可被 load / IO / Mutation 唤醒重判) ——
    registerPending(el, src) {
      if (!this.pendingEls) this.pendingEls = new Map();
      if (this.pendingEls.has(el)) this.pendingEls.delete(el);
      else if (this.pendingEls.size >= 500) {
        this.pendingEls.delete(this.pendingEls.keys().next().value);
      }
      this.pendingEls.set(el, { src, at: Date.now() });
    }

    wakePending(el) {
      if (!this.pendingEls) return null;
      const rec = this.pendingEls.get(el) || null;
      if (rec) this.pendingEls.delete(el);
      return rec;
    }

    // 档位升级唤醒 (v4.6): load = 新证据到达 → 清 B 档标记后按全管线重判;
    // error = 失败登记 (有界重试)。均为一次性监听, 无长期悬挂。
    attachPendingWake(img, src) {
      if (typeof img.addEventListener !== 'function') return;
      img.addEventListener('load', () => {
        this.wakePending(img);
        try {
          if (img.getAttribute && img.getAttribute('data-svi-checked-src') === src) {
            img.removeAttribute('data-svi-checked-src');
          }
        } catch (e) { /* ignore */ }
        this.processImage(img);
      }, { once: true });
      img.addEventListener('error', () => {
        this.wakePending(img);
        this.markFailure(img, src);
      }, { once: true });
    }
  }

  // ==========================================
  // 16. 图片特效引擎 (ImageFxEngine - R1 部分反色/指定色反色/特效)
  //     投递: content:url(blob) 替换渲染 (不改 src, 不破坏懒加载);
  //     悬停还原 (:hover + JS 类双通道), Alt+点击 kill switch, Alt+Shift+拖拽区域选取;
  //     队列 ≤2 并发 FIFO, 缓存 LRU 200 (evict 撤销 blob URL), 解码上限 4096px
  // ==========================================
  class ImageFxEngine {
    constructor() {
      this.queue = [];            // 待处理任务 FIFO
      this.queuedKeys = new Set();
      this.inflight = 0;
      this.maxInflight = 2;       // ≤2 并发图片变换
      this.lru = new Map();       // cacheKey → { blobUrl, at, usedAt }
      this.lruMax = 200;
      this.pendingRevoke = [];    // 延迟撤销 (仍被引用的 blob URL)
      this.styleNode = null;
      this.hoverBound = false;
      this.rectBound = false;
      this.pageHideBound = false;
      this.bindHover();
      this.bindRectCapture();
      this.bindPageHide();
      window.__svi_image_fx = this;
    }

    // 生效模式: 本站覆盖 imgFxMode > 全局 pref
    effectiveMode(el) {
      const profile = getSiteProfile();
      return profile.imgFxMode || state.imgFxMode || 'full';
    }

    // 是否对该图片启用特效投递 (Alt+点击 kill switch 尊重)
    wantsFx(el, src) {
      const mode = this.effectiveMode(el);
      if (mode === 'full') return false;
      try {
        if (el.getAttribute && el.getAttribute('data-svi-fx-off') === 'true') return false;
      } catch (e) { /* ignore */ }
      return true;
    }

    // 特效类模式 (key/grayscale/sepia/brightness/custom) 作用于全部过闸图片;
    // luma/rect 仅作用于"本应反色"的图片 (深色照片无白区可反, 跳过省算力)
    modeAppliesToAll(el) {
      const mode = this.effectiveMode(el);
      return mode === 'key' || mode === 'grayscale' || mode === 'sepia' || mode === 'brightness' || mode === 'custom';
    }

    fxParams(el) {
      const p = state.imgFxParams || {};
      const params = {
        lumCutoff: p.lumCutoff != null ? p.lumCutoff : 190,
        satCutoff: p.satCutoff != null ? p.satCutoff : 0.30,
        keyColor: p.keyColor || '#ffffff',
        keyTol: p.keyTol != null ? p.keyTol : 60,
        brightness: state.presetId === 'custom' ? state.brightness : 1.0,
        contrast: state.presetId === 'custom' ? state.contrast : 1.0,
        saturate: state.presetId === 'custom' ? state.saturate : 1.0,
      };
      // rect 模式: 读取该 src 的相对区域 (Alt+Shift+拖拽持久化)
      const mode = this.effectiveMode(el);
      if (mode === 'rect' && el) {
        const src = getMediaSrc(el);
        const ov = state.manualOverrides[manualOverrideKey(profileKey(), src)];
        if (ov && typeof ov === 'object' && ov.rect) params.rect = ov.rect;
      }
      return params;
    }

    cacheKey(src, mode, params) {
      const p = params || {};
      return [src, mode, p.lumCutoff, p.satCutoff, p.keyColor, p.keyTol,
        p.rect ? [p.rect.x, p.rect.y, p.rect.w, p.rect.h].join(',') : '', p.brightness, p.contrast, p.saturate].join('|');
    }

    enqueue(el, src, wantInvert) {
      const mode = this.effectiveMode(el);
      const params = this.fxParams(el);
      if (mode === 'rect' && !params.rect) {
        // 区域反色但未框选区域 → 还原原图, 无操作
        this.clearFor(el);
        return;
      }
      const key = this.cacheKey(src, mode, params);
      const cached = this.lru.get(key);
      if (cached && cached.blobUrl) {
        cached.usedAt = Date.now();
        this.applyTo(el, cached.fxId, cached.blobUrl, key);
        return;
      }
      if (this.queuedKeys.has(key)) {
        // 同 key 已排队: 挂到任务, 完成后统一回填
        for (const job of this.queue) {
          if (job.key === key) job.targets.push(el);
        }
        return;
      }
      this.queue.push({ key, el, src, mode, params, wantInvert, targets: [el] });
      this.queuedKeys.add(key);
      this.pump();
    }

    pump() {
      while (this.inflight < this.maxInflight && this.queue.length) {
        const job = this.queue.shift();
        this.queuedKeys.delete(job.key);
        this.inflight++;
        runtime.fxTransformsInFlight = this.inflight;
        this.process(job).catch(() => { /* ignore */ }).finally(() => {
          this.inflight--;
          runtime.fxTransformsInFlight = this.inflight;
          this.pump();
        });
      }
    }

    async process(job) {
      const { key, src, mode, params } = job;
      const drawable = job.targets.find((el) => el.isConnected) || job.el;
      const decoded = await decodeToCanvas(drawable, src, 4096);
      if (!decoded || !job.targets.some((el) => el.isConnected)) return;
      const { canvas, ctx } = decoded;
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.transformImageData(imageData, mode, params);
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        return; // 读取失败 (污染等) → 保持原状
      }
      const blob = await new Promise((resolve) => {
        try { canvas.toBlob(resolve, 'image/png'); } catch (e) { resolve(null); }
      });
      if (!blob) return;

      // LRU 容量管理: 超额时撤销最旧 blob URL (60s 内仍在使用的延迟撤销);
      // 立即撤销的键同步清理其 content:url 样式规则, 防止规则表无界膨胀
      while (this.lru.size >= this.lruMax) {
        const oldestKey = this.lru.keys().next().value;
        const oldest = this.lru.get(oldestKey);
        this.lru.delete(oldestKey);
        if (oldest && oldest.blobUrl) {
          if (Date.now() - (oldest.usedAt || 0) > 60000) {
            try { URL.revokeObjectURL(oldest.blobUrl); } catch (e) { /* ignore */ }
            if (this._rules && this._rules.delete(oldestKey) && this.styleNode) {
              this.styleNode.textContent = Array.from(this._rules.values()).join('\n');
            }
          } else {
            this.pendingRevoke.push(oldest.blobUrl);
          }
        }
      }
      // 延迟撤销队列兜底上限: 防极端会话下 URL 列表无界增长 ( pagehide 也会全量回收)
      if (this.pendingRevoke.length > 400) {
        for (const url of this.pendingRevoke.splice(0, this.pendingRevoke.length - 200)) {
          try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const fxId = 'fx' + hash32(key);
      const entry = { blobUrl, fxId, at: Date.now(), usedAt: Date.now() };
      this.lru.set(key, entry);
      for (const el of job.targets) {
        if (el && el.isConnected) this.applyTo(el, fxId, blobUrl, key);
      }
      StatsManager.count('imgFxTransforms');
    }

    // 逐像素变换 (rect 模式仅处理相对区域内部)
    transformImageData(imageData, mode, params) {
      const d = imageData.data;
      const w = imageData.width;
      const h = imageData.height;
      let x0 = 0;
      let y0 = 0;
      let x1 = w;
      let y1 = h;
      if (mode === 'rect' && params.rect) {
        const r = params.rect;
        x0 = Math.max(0, Math.min(w, Math.round((r.x || 0) * w)));
        y0 = Math.max(0, Math.min(h, Math.round((r.y || 0) * h)));
        x1 = Math.max(x0, Math.min(w, Math.round(((r.x || 0) + (r.w || 0)) * w)));
        y1 = Math.max(y0, Math.min(h, Math.round(((r.y || 0) + (r.h || 0)) * h)));
      }
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] < 8) continue; // 全透明像素跳过
          const out = transformPixel(d[i], d[i + 1], d[i + 2], mode, params);
          if (out) {
            d[i] = out[0];
            d[i + 1] = out[1];
            d[i + 2] = out[2];
          }
        }
      }
    }

    applyTo(el, fxId, blobUrl, key) {
      try {
        // v4.6 手动结论占优门 (根因 H1): 杀停态或手动"还原"结论下, 在途投递回调一律放弃。
        // 杀停态只放弃投递、不摘属性 —— data-svi-fx-off 保留 (媒体面板状态文案与二次点击
        // 恢复特效的状态机依赖它), 视觉还原由投递规则的 :not 选择器同帧完成 (根因 H4 变体)
        if (el.getAttribute('data-svi-fx-off') === 'true') { return; }
        if (manualStateFor(el) === false) { this.clearFor(el); return; }
        el.removeAttribute('data-svi-inverted'); // content 投递与 CSS 滤镜互斥 (防双重处理)
        el.setAttribute('data-svi-fx', fxId);
        el.removeAttribute('data-svi-fx-off');
        this.ensureStyleNode();
        const ruleSel = 'img[data-svi-fx="' + fxId + '"]:not([data-svi-fx-off="true"])'; // v4.6: 排除杀停态 (级联双保险)
        const rule = ruleSel + ' { content: url(' + blobUrl + ') !important; }';
        if (!this._rules) this._rules = new Map();
        if (this._rules.get(key) !== rule) {
          this._rules.set(key, rule);
          this.styleNode.textContent = Array.from(this._rules.values()).join('\n');
        }
        if (!el._sviFxKey) el._sviFxKey = key;
      } catch (e) { /* ignore */ }
    }

    clearFor(el) {
      try {
        if (el.getAttribute && el.getAttribute('data-svi-fx')) {
          el.removeAttribute('data-svi-fx');
          el.removeAttribute('data-svi-fx-off');
        }
      } catch (e) { /* ignore */ }
    }

    ensureStyleNode() {
      if (this.styleNode && this.styleNode.isConnected) return;
      this.styleNode = document.getElementById('svi-fx-style');
      if (!this.styleNode) {
        this.styleNode = document.createElement('style');
        this.styleNode.id = 'svi-fx-style';
        (document.head || document.documentElement).appendChild(this.styleNode);
        if (this._rules) this._rules.clear();
      }
    }

    // 悬停还原: 委托 mouseover/mouseout (真实输入事件触发, 兼容动态节点)
    // v3.1 R5: 悬停显示原图可关闭 —— hoverRestore=false 时不再添加 .svi-fx-hover (CSS 规则同样门控),
    // mouseout 恒定移除, 杜绝悬停/特效状态卡死
    bindHover() {
      if (this.hoverBound) return;
      this.hoverBound = true;
      document.addEventListener('mouseover', (e) => {
        try {
          if (state.hoverRestore === false) return;
          const t = e.target && e.target.closest ? e.target.closest('img[data-svi-fx]') : null;
          if (t) t.classList.add('svi-fx-hover');
        } catch (err) { /* ignore */ }
      }, true);
      document.addEventListener('mouseout', (e) => {
        try {
          const t = e.target && e.target.closest ? e.target.closest('img[data-svi-fx]') : null;
          if (t) t.classList.remove('svi-fx-hover');
        } catch (err) { /* ignore */ }
      }, true);
    }

    // Alt+Shift+拖拽 区域选取 (rect 模式): 相对区域持久化至 manualOverrides
    bindRectCapture() {
      if (this.rectBound) return;
      this.rectBound = true;
      let dragging = null;
      let selDiv = null;

      const cleanup = () => {
        if (selDiv && selDiv.parentNode) selDiv.parentNode.removeChild(selDiv);
        selDiv = null;
        dragging = null;
      };

      document.addEventListener('mousedown', (e) => {
        try {
          if (!e.altKey || !e.shiftKey || e.button !== 0) return;
          if (this.effectiveMode(e.target) !== 'rect') return;
          const img = e.target.closest ? e.target.closest('img, image, input[type="image" i]') : null;
          if (!img) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = img.getBoundingClientRect();
          dragging = { img, rect, startX: e.clientX, startY: e.clientY };
          selDiv = document.createElement('div');
          selDiv.className = 'svi-rect-select';
          document.body.appendChild(selDiv);
          selDiv.style.left = e.clientX + 'px';
          selDiv.style.top = e.clientY + 'px';
          selDiv.style.width = '0px';
          selDiv.style.height = '0px';
        } catch (err) {
          cleanup();
        }
      }, true);

      document.addEventListener('mousemove', (e) => {
        if (!dragging || !selDiv) return;
        try {
          const x = Math.min(dragging.startX, e.clientX);
          const y = Math.min(dragging.startY, e.clientY);
          const w = Math.abs(e.clientX - dragging.startX);
          const h = Math.abs(e.clientY - dragging.startY);
          selDiv.style.left = x + 'px';
          selDiv.style.top = y + 'px';
          selDiv.style.width = w + 'px';
          selDiv.style.height = h + 'px';
        } catch (err) { /* ignore */ }
      }, true);

      document.addEventListener('mouseup', (e) => {
        if (!dragging || !selDiv) return;
        try {
          e.preventDefault();
          const r = dragging.rect;
          const x0 = Math.max(r.left, Math.min(dragging.startX, e.clientX));
          const y0 = Math.max(r.top, Math.min(dragging.startY, e.clientY));
          const x1 = Math.min(r.right, Math.max(dragging.startX, e.clientX));
          const y1 = Math.min(r.bottom, Math.max(dragging.startY, e.clientY));
          const w = x1 - x0;
          const h = y1 - y0;
          if (r.width > 0 && r.height > 0 && w >= 8 && h >= 8) {
            const rel = {
              x: (x0 - r.left) / r.width,
              y: (y0 - r.top) / r.height,
              w: w / r.width,
              h: h / r.height,
            };
            const src = getMediaSrc(dragging.img);
            if (src) {
              addManualOverride(state.manualOverrides, manualOverrideKey(profileKey(), src), { rect: rel }, 400);
              savePrefs();
              this.clearFor(dragging.img);
              dragging.img.removeAttribute('data-svi-checked-src');
              showToast('已记录区域反色 (Alt+Shift+拖拽)');
            }
          }
        } catch (err) { /* ignore */ }
        cleanup();
      }, true);
    }

    // pagehide 撤销全部 blob URL + 延迟撤销队列
    bindPageHide() {
      if (this.pageHideBound) return;
      this.pageHideBound = true;
      const sweep = () => {
        for (const entry of this.lru.values()) {
          if (entry && entry.blobUrl) {
            try { URL.revokeObjectURL(entry.blobUrl); } catch (e) { /* ignore */ }
          }
        }
        this.lru.clear();
        for (const url of this.pendingRevoke.splice(0)) {
          try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        }
      };
      window.addEventListener('pagehide', sweep, { once: false });
    }
  }

  // ==========================================
  // 17. 视频特效引擎 (VideoFxEngine - R2 GPU 覆盖层 + PiP)
  //     仅当视频已有 positioned/transformed 祖先时创建覆盖层 (绝不改动站点布局);
  //     rVFC 逐帧渲染, 内部尺寸 ≤1080p, 暂停/隐藏时挂起; WebGL 不可用 → 静默回退 CSS 路径
  // ==========================================
  class VideoFxEngine {
    constructor(probe) {
      this.probe = probe || null;
      this.available = true;
      this.unavailableReason = '';
      this.state = null;          // 当前覆盖层状态 { video, canvas, gl, program, uniforms, mode }
      this.ro = null;             // 共享 ResizeObserver (唯一)
      this.rectTimer = null;
      this.detectSupport();
      window.__svi_video_fx = this;
    }

    detectSupport() {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
        this.available = !!gl;
        if (!gl) this.unavailableReason = 'webgl-unavailable';
      } catch (e) {
        this.available = false;
        this.unavailableReason = 'webgl-error';
      }
    }

    // 模式映射: videoFxMode + 反色状态 → u_mode; overlay 接管时返回 true
    handles(video) {
      if (!this.state || !this.state.active) return false;
      if (!video || this.state.video !== video) return false;
      return state.videoFxMode !== 'off' && this.available;
    }

    // 与 HIL 状态机同步: invertActive → 覆盖层显示/隐藏
    sync(video, invertActive) {
      if (!this.available || state.videoFxMode === 'off') {
        this.teardown();
        return;
      }
      if (!video) {
        this.teardown();
        return;
      }
      if (!this.state || this.state.video !== video) {
        this.teardown();
        if (!this.createOverlay(video)) {
          return; // 无 positioned 祖先 → CSS 滤镜回退 (调用方 handles() 返回 false)
        }
      }
      const st = this.state;
      st.desired = invertActive;
      if (!invertActive) {
        st.canvas.style.display = 'none';
        return;
      }
      st.canvas.style.display = 'block';
      st.mode = state.videoFxMode === 'luma' ? 1 : (state.videoFxMode === 'key' ? 2 : 0);
      this.ensureLoop();
    }

    // 定位宿主: 最近 positioned/transformed 祖先; 视频自身 fixed → body 托管
    findOverlayHost(video) {
      try {
        const vcs = window.getComputedStyle(video);
        let n = video.parentElement;
        while (n && n !== document.documentElement) {
          const cs = window.getComputedStyle(n);
          if (cs.position !== 'static' || (cs.transform && cs.transform !== 'none') || (cs.filter && cs.filter !== 'none')) {
            return { host: n, fixed: false };
          }
          n = n.parentElement;
        }
        if (vcs && vcs.position === 'fixed') {
          return { host: document.body || document.documentElement, fixed: true };
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    createOverlay(video) {
      const loc = this.findOverlayHost(video);
      if (!loc) return false;
      try {
        const canvas = document.createElement('canvas');
        canvas.className = 'svi-fx-overlay';
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
        if (!gl) {
          this.available = false;
          this.unavailableReason = 'webgl-unavailable';
          return false;
        }
        // WebGL 上下文丢失 (GPU 重置/驱动恢复等): 立即回退 CSS 滤镜路径。
        // available=false 保证 applyFilterToCurrent 不再重建覆盖层 (杜绝重建循环)。
        canvas.addEventListener('webglcontextlost', (e) => {
          try { e.preventDefault(); } catch (err) { /* ignore */ }
          this.available = false;
          this.unavailableReason = 'webgl-context-lost';
          this.teardown();
          try {
            if (this.probe && this.probe.currentVideo) this.probe.applyFilterToCurrent();
          } catch (err) { /* ignore */ }
        });
        const program = this.buildProgram(gl);
        if (!program) {
          this.available = false;
          this.unavailableReason = 'shader-compile-failed';
          return false;
        }
        canvas.style.display = 'none';
        loc.host.appendChild(canvas);

        const st = {
          video,
          canvas,
          gl,
          program,
          active: true,
          desired: false,
          mode: 0,
          fixed: !!loc.fixed,
          frameCb: null,
          frameTimer: null,
        };
        this.state = st;
        this.positionOverlay();

        // 共享 ResizeObserver (整个引擎唯一): 视频尺寸变化 → 重定位 + 重设内部分辨率
        if (!this.ro && typeof ResizeObserver !== 'undefined') {
          this.ro = new ResizeObserver(() => {
            clearTimeout(this.rectTimer);
            this.rectTimer = setTimeout(() => {
              try { this.positionOverlay(); } catch (e) { /* ignore */ }
            }, 100);
          });
        }
        if (this.ro) {
          try { this.ro.observe(video); } catch (e) { /* ignore */ }
        }
        if (!this._onWin) {
          this._onWin = () => {
            clearTimeout(this.rectTimer);
            this.rectTimer = setTimeout(() => this.positionOverlay(), 150);
          };
          window.addEventListener('resize', this._onWin);
        }
        return true;
      } catch (e) {
        this.available = false;
        this.unavailableReason = 'overlay-create-failed';
        return false;
      }
    }

    // 计算视频相对宿主的偏移, 绝对定位覆盖 (不动站点布局)
    positionOverlay() {
      const st = this.state;
      if (!st || !st.video || !st.canvas) return;
      try {
        const vRect = st.video.getBoundingClientRect();
        const cs = window.getComputedStyle(st.video);
        const radius = cs.borderRadius && cs.borderRadius !== '0px' ? cs.borderRadius : '';
        if (st.fixed) {
          st.canvas.style.position = 'fixed';
          st.canvas.style.left = vRect.left + 'px';
          st.canvas.style.top = vRect.top + 'px';
        } else {
          const hostRect = st.canvas.parentElement.getBoundingClientRect();
          const hcs = window.getComputedStyle(st.canvas.parentElement);
          const bl = parseFloat(hcs.borderLeftWidth) || 0;
          const bt = parseFloat(hcs.borderTopWidth) || 0;
          st.canvas.style.position = 'absolute';
          st.canvas.style.left = (vRect.left - hostRect.left - bl) + 'px';
          st.canvas.style.top = (vRect.top - hostRect.top - bt) + 'px';
        }
        st.canvas.style.width = vRect.width + 'px';
        st.canvas.style.height = vRect.height + 'px';
        if (radius) st.canvas.style.borderRadius = radius;
        // 视频 z 序之上
        const vz = parseInt(cs.zIndex, 10);
        st.canvas.style.zIndex = String(isFinite(vz) ? vz + 1 : 1);
        // 内部分辨率 ≤1080p
        const vw = st.video.videoWidth || Math.round(vRect.width) || 640;
        const vh = st.video.videoHeight || Math.round(vRect.height) || 360;
        const scale = Math.min(1, 1920 / vw, 1080 / vh);
        const iw = Math.max(2, Math.round(vw * scale));
        const ih = Math.max(2, Math.round(vh * scale));
        if (st.canvas.width !== iw || st.canvas.height !== ih) {
          st.canvas.width = iw;
          st.canvas.height = ih;
        }
      } catch (e) { /* ignore */ }
    }

    buildProgram(gl) {
      const VSH = `
        attribute vec2 a_pos;
        varying vec2 v_uv;
        void main() {
          v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
          gl_Position = vec4(a_pos, 0.0, 1.0);
        }`;
      const FSH = `
        precision mediump float;
        varying vec2 v_uv;
        uniform sampler2D u_tex;
        uniform float u_mode;
        uniform float u_lumCutoff;
        uniform float u_satCutoff;
        uniform vec3 u_key;
        uniform float u_tol2;
        uniform vec4 u_rect;
        uniform float u_brightness;
        uniform float u_contrast;
        uniform float u_saturate;
        uniform float u_sepia;
        uniform float u_gray;
        void main() {
          vec3 c = texture2D(u_tex, v_uv).rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float mx = max(c.r, max(c.g, c.b));
          float mn = min(c.r, min(c.g, c.b));
          float sat = mx <= 0.0 ? 0.0 : (mx - mn) / mx;
          float mask = 1.0;
          if (u_mode > 0.5 && u_mode < 1.5) {
            mask = step(u_lumCutoff, lum * 255.0) * (1.0 - step(u_satCutoff, sat));
          } else if (u_mode > 1.5 && u_mode < 2.5) {
            vec3 dpx = c * 255.0 - u_key * 255.0;
            mask = 1.0 - step(u_tol2, dot(dpx, dpx));
          }
          if (u_rect.x >= 0.0) {
            float inside = step(u_rect.x, v_uv.x) * step(v_uv.x, u_rect.z) *
                           step(u_rect.y, v_uv.y) * step(v_uv.y, u_rect.w);
            mask *= inside;
          }
          vec3 inv = vec3(1.0) - c;
          mat3 hr = mat3(-0.574, 0.426, 0.426, 1.430, 0.430, 1.430, 0.144, 0.144, -0.856);
          vec3 outc = mix(c, clamp(hr * inv, 0.0, 1.0), mask);
          if (u_mode > 2.5 && u_mode < 3.5) outc = vec3(lum);
          if (u_mode > 3.5 && u_mode < 4.5) {
            outc = vec3(
              0.393 * c.r + 0.769 * c.g + 0.189 * c.b,
              0.349 * c.r + 0.686 * c.g + 0.168 * c.b,
              0.272 * c.r + 0.534 * c.g + 0.131 * c.b);
          }
          outc = outc * u_brightness;
          outc = (outc - 0.5) * u_contrast + 0.5;
          outc = mix(vec3(lum), outc, u_saturate);
          // v3.2: 画面调节合成 (暖色/黑白) —— 与 CSS 路径语义一致
          if (u_sepia > 0.0) {
            vec3 sep = vec3(
              0.393 * outc.r + 0.769 * outc.g + 0.189 * outc.b,
              0.349 * outc.r + 0.686 * outc.g + 0.168 * outc.b,
              0.272 * outc.r + 0.534 * outc.g + 0.131 * outc.b);
            outc = mix(outc, sep, u_sepia);
          }
          if (u_gray > 0.0) outc = mix(outc, vec3(dot(outc, vec3(0.299, 0.587, 0.114))), u_gray);
          gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
        }`;
      const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      try {
        const vs = compile(gl.VERTEX_SHADER, VSH);
        const fs = compile(gl.FRAGMENT_SHADER, FSH);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.useProgram(prog);
        const uni = {};
        for (const name of ['u_mode', 'u_lumCutoff', 'u_satCutoff', 'u_key', 'u_tol2', 'u_rect', 'u_brightness', 'u_contrast', 'u_saturate', 'u_sepia', 'u_gray']) {
          uni[name] = gl.getUniformLocation(prog, name);
        }
        return { prog, uni };
      } catch (e) {
        return null;
      }
    }

    ensureLoop() {
      const st = this.state;
      if (!st || st.loopRunning) return;
      st.loopRunning = true;
      const render = () => {
        if (!this.state || this.state !== st || !st.active) {
          st.loopRunning = false;
          return;
        }
        try {
          if (st.desired && !document.hidden && st.video.videoWidth > 0) {
            this.renderFrame(st);
          }
        } catch (e) { /* 单帧失败不中断循环 */ }
        // rVFC 优先 (每呈现帧一次); 回退 rAF
        if (typeof st.video.requestVideoFrameCallback === 'function') {
          st.video.requestVideoFrameCallback(() => render());
        } else {
          st.frameTimer = requestAnimationFrame(render);
        }
      };
      render();
    }

    renderFrame(st) {
      const gl = st.gl;
      const uni = st.program.uni;
      // 上下文已丢失: 停止绘制 (webglcontextlost 监听负责回退)
      try { if (gl.isContextLost && gl.isContextLost()) return; } catch (e) { /* ignore */ }
      // 纹理上传 (视频帧)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, st.video);
      } catch (e) {
        // 跨域视频污染 (SecurityError) 等: 覆盖层若继续显示会变成纯黑挡板,
        // 必须永久回退 CSS 滤镜路径 (available=false 防止 sync 重建 → 死循环)
        if (e && (e.name === 'SecurityError' || /security|tainted|cross-origin/i.test(String(e.message || '')))) {
          this.available = false;
          this.unavailableReason = 'video-tainted';
          this.teardown();
          try {
            if (this.probe && this.probe.currentVideo) this.probe.applyFilterToCurrent();
          } catch (err) { /* ignore */ }
        }
        return;
      }
      gl.viewport(0, 0, st.canvas.width, st.canvas.height);
      const p = state.imgFxParams || {};
      gl.uniform1f(uni.u_mode, st.mode);
      gl.uniform1f(uni.u_lumCutoff, p.lumCutoff != null ? p.lumCutoff : 190);
      gl.uniform1f(uni.u_satCutoff, p.satCutoff != null ? p.satCutoff : 0.30);
      const keyRgb = hexToRgb(p.keyColor || '#ffffff');
      gl.uniform3f(uni.u_key, keyRgb[0] / 255, keyRgb[1] / 255, keyRgb[2] / 255);
      const tol = p.keyTol != null ? p.keyTol : 60;
      gl.uniform1f(uni.u_tol2, tol * tol);
      gl.uniform4f(uni.u_rect, -1, -1, -1, -1);
      // 预设亮度/对比度/饱和度 (与 CSS 滤镜对齐)
      let b = 1.0;
      let c = 1.0;
      let s = 1.0;
      if (state.presetId === 'custom') {
        b = state.brightness;
        c = state.contrast;
        s = state.saturate;
      } else if (PRESETS[state.presetId]) {
        b = PRESETS[state.presetId].brightness;
        c = PRESETS[state.presetId].contrast;
        s = PRESETS[state.presetId].saturate;
      }
      gl.uniform1f(uni.u_brightness, b);
      gl.uniform1f(uni.u_contrast, c);
      gl.uniform1f(uni.u_saturate, s);
      // v3.2: 覆盖层接管时 CSS 滤镜被抑制 → 画面调节在着色器中合成
      const tune = (state.videoTune && state.videoTune.enabled === true) ? state.videoTune : null;
      const clampN = (v, lo, hi, def) => {
        const n = Number(v);
        return isNaN(n) ? def : Math.min(hi, Math.max(lo, n));
      };
      gl.uniform1f(uni.u_brightness, b * (tune ? clampN(tune.brightness, 0.3, 1.7, 1) : 1));
      gl.uniform1f(uni.u_contrast, c * (tune ? clampN(tune.contrast, 0.3, 1.7, 1) : 1));
      gl.uniform1f(uni.u_saturate, s * (tune ? clampN(tune.saturate, 0, 2, 1) : 1));
      if (uni.u_sepia) gl.uniform1f(uni.u_sepia, tune ? clampN(tune.warmth, 0, 1, 0) : 0);
      if (uni.u_gray) gl.uniform1f(uni.u_gray, tune ? clampN(tune.grayscale, 0, 1, 0) : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    teardown() {
      const st = this.state;
      if (!st) return;
      st.active = false;
      try {
        if (st.canvas && st.canvas.parentNode) st.canvas.parentNode.removeChild(st.canvas);
      } catch (e) { /* ignore */ }
      if (st.frameTimer != null) {
        try { cancelAnimationFrame(st.frameTimer); } catch (e) { /* ignore */ }
      }
      this.state = null;
      try {
        if (this.ro) this.ro.disconnect(); // 覆盖层释放时一并停止观察 (下次创建重新观察)
      } catch (e) { /* ignore */ }
    }

    // 画中画: 处理后的 overlay canvas (或视频本体) captureStream → 隐藏 video → PiP
    async openPiP() {
      let stream = null;
      let pipVideo = null;
      const cleanup = () => {
        try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
        try { if (pipVideo) pipVideo.remove(); } catch (e) { /* ignore */ }
      };
      try {
        if (!document.pictureInPictureEnabled) {
          showToast('当前浏览器不支持画中画');
          return false;
        }
        const video = this.probe && this.probe.currentVideo;
        if (!video) {
          showToast('未找到活动视频');
          return false;
        }
        const source = (this.state && this.state.active && this.state.desired) ? this.state.canvas : video;
        stream = source.captureStream(30);
        pipVideo = document.createElement('video');
        pipVideo.muted = true;
        pipVideo.playsInline = true;
        pipVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
        pipVideo.srcObject = stream;
        (document.body || document.documentElement).appendChild(pipVideo);
        await pipVideo.play();
        // 正常退出 PiP (含用户关闭窗口) → 回收流与隐藏 video
        pipVideo.addEventListener('leavepictureinpicture', cleanup, { once: true });
        await pipVideo.requestPictureInPicture();
        StatsManager.count('pipActivations');
        return true;
      } catch (e) {
        cleanup(); // 启动中途失败 (拒绝授权/已有 PiP 窗口等) → 杜绝流与元素泄漏
        showToast('画中画启动失败: ' + (e && e.message ? e.message : '未知错误'));
        return false;
      }
    }

    // 供基准测试: 处理流 (overlay 优先, 回退视频本体)
    captureProcessedStream(video) {
      const source = (this.state && this.state.active && this.state.video === video) ? this.state.canvas : video;
      return source.captureStream(30);
    }
  }

  // 媒体主导判定消费口: 播放中的大视频占屏时挂起背景类扫描 (通用启发, 无需站点规则)
  function mediaDominanceActive() {
    try {
      const hil = window.__svi && window.__svi.engines ? window.__svi.engines.hil : null;
      return !!(hil && hil.mediaDominant);
    } catch (e) {
      return false;
    }
  }

  // ==========================================
  // 18. 背景图反色引擎 (BgImageEngine - B站评论缩略图等 background-image 元素)
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
      // 媒体主导 (全屏/大尺寸播放视频) 时挂起背景图扫描, 恢复需持续 10s 非主导
      if (!document.hidden && !mediaDominanceActive()) this.sweep();
      this.sweepTimer = setTimeout(() => this.tick(), 5000); // 每 5s 至多一次
    }

    sweep() {
      const now = Date.now();
      if (now - this.lastSweep < 4500) return;
      this.lastSweep = now;
      try {
        const bgr = window.__svi && window.__svi.engines ? window.__svi.engines.bgReplace : null;
        if (bgr && typeof bgr.applyPartialRules === 'function') bgr.applyPartialRules(); // v4.3 局部改色随扫同步
      } catch (e) { /* ignore */ }
      let sel = '';
      try { sel = this.candidateSelector(); } catch (e) { return; }
      if (!sel) return;
      let els = [];
      try { els = document.body.querySelectorAll(sel); } catch (e) { return; }
      const cap = Math.min(els.length, 1500); // 全量扫描元素预算
      for (let i = 0; i < cap; i++) {
        this.processEl(els[i]);
      }
      // Shadow DOM 有界扫描 (≤20 根, ≤1000 元素)
      let processed = 0;
      ShadowDomRegistry.forEachRoot((sr) => {
        if (processed >= 1000) return;
        try {
          const inner = sr.querySelectorAll(sel);
          const n = Math.min(inner.length, 1000 - processed);
          for (let i = 0; i < n; i++) {
            this.processEl(inner[i]);
            processed++;
          }
        } catch (e) { /* ignore */ }
      });
    }

    processEl(el) {
      if (!el || el.nodeType !== 1) return;
      const profile = getSiteProfile();
      if (state.imageInvert === false || profile.enabled === false || profile.imageInvert === false) return;

      let bg = '';
      try {
        bg = window.getComputedStyle(el).backgroundImage || '';
      } catch (e) {
        return;
      }
      if (!bg || bg.indexOf('url(') === -1) return;

      // v4.6: Alt+点击手动结论占优门 (C2) —— 元素带手动标记时 bg 扫描不做任何自动改写,
      // 杜绝背景图首扫/重扫把用户手动结论拉回 (与 canvas 首扫同源的覆盖路径)
      const manual = manualStateFor(el);
      if (manual !== null) {
        if (manual) el.setAttribute('data-svi-bginv', 'true');
        else el.removeAttribute('data-svi-bginv');
        return;
      }

      // v3.3 用户元素规则: 显式保护/强制反色优先于尺寸门槛与亮度判定
      // v4.3: 'recolor' 局部改色 —— 不走滤镜, 交给背景替换桶引擎只改该元素的浅色部分
      const erule = firstMatchingElementRule(el, profile.elementRules);
      if (erule) {
        if (erule.action === 'protect') {
          el.removeAttribute('data-svi-bginv');
        } else if (erule.action === 'recolor') {
          try {
            const bgr = window.__svi && window.__svi.engines ? window.__svi.engines.bgReplace : null;
            if (bgr && typeof bgr.partialTag === 'function') bgr.partialTag(el);
          } catch (e) { /* ignore */ }
        } else {
          el.setAttribute('data-svi-bginv', 'true');
        }
        return;
      }

      // 元素门槛: 渲染尺寸 ≥ 32×32
      const w = el.clientWidth || 0;
      const h = el.clientHeight || 0;
      if (w > 0 && h > 0 && (w < 32 || h < 32)) return;

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
          // v4.6 暗色遮罩上下文否决 (元素级事实, 在 URL 判定之后、打标之前生效):
          // 祖先暗色蒙层下合成观感已暗, 不再对背景图施加反色滤镜。
          // 仅对"将反色"的元素调用 (暗图/跳过路径零额外开销); elLastUrl 已先行登记,
          // 本元素此 URL 不会重复评估 (decide-once 与主判定路径一致)。
          if (state.maskAware !== false) {
            let mctx = null;
            try { mctx = maskedDarkContext(el); } catch (e) { /* 保守放行 */ }
            if (mctx && mctx.masked) {
              StatsManager.count('maskedDarkKeeps');
              el.removeAttribute('data-svi-bginv');
              return;
            }
          }
          el.setAttribute('data-svi-bginv', 'true');
        } else {
          el.removeAttribute('data-svi-bginv');
        }
        return; // 只采用第一个可判定的 url
      }
    }

    decideUrl(url) {
      // 手动覆盖记忆优先 (host|url)
      const ov = state.manualOverrides[manualOverrideKey(profileKey(), url)];
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
  // 19. 背景替换引擎 (BackgroundReplaceEngine - 163 等浅色站点, 登录块原样保护)
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
      this.partialEls = new Set(); // v4.3: 局部改色元素集 (元素规则 action='recolor')
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
      // 媒体主导 (大视频播放) 时挂起增量扫描, 稍后重试
      if (mediaDominanceActive()) {
        this.rescanTimer = setTimeout(() => this.flushPendingRoots(), 2000);
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

    // v4.3: 局部改色 —— 元素规则命中元素的浅色部分进桶重着色 (黑白同存只动白部, 非 filter)
    partialTag(el) {
      if (!el || el.nodeType !== 1) return;
      if (this.partialEls.has(el)) return;
      try {
        if (this.isExcluded(el)) return;
      } catch (e) { /* ignore */ }
      this.partialEls.add(el);
      this.tagElement(el); // 仅浅色背景/浅色边框/深色文字命中 —— 深色部分天然不动
      try {
        document.documentElement.setAttribute('data-svi-bgr-partial', '');
      } catch (e) { /* ignore */ }
      this.applyCss();
    }

    // v4.3: 按当前元素规则同步局部改色集 (规则删除 → 自动摘除对应元素的桶标记)
    applyPartialRules() {
      let rules = [];
      try { rules = (getSiteProfile().elementRules || []).filter((r) => r && r.action === 'recolor'); } catch (e) { /* ignore */ }
      // 新命中 → 入集
      if (rules.length) {
        for (const rule of rules.slice(0, 25)) {
          let els = [];
          try { els = Array.from(document.querySelectorAll(rule.selector)).slice(0, 25); } catch (e) { continue; }
          for (const el of els) this.partialTag(el);
        }
      }
      // 失配 → 摘除
      for (const el of Array.from(this.partialEls)) {
        let still = false;
        try { still = rules.some((r) => { try { return el.matches(r.selector); } catch (e) { return false; } }); } catch (e) { still = false; }
        if (!still || !el.isConnected) {
          el.removeAttribute('data-svi-bgr-bg');
          el.removeAttribute('data-svi-bgr-fg');
          el.removeAttribute('data-svi-bgr-bd');
          this.partialEls.delete(el);
        }
      }
      if (!this.partialEls.size) {
        try { document.documentElement.removeAttribute('data-svi-bgr-partial'); } catch (e) { /* ignore */ }
      }
      this.applyCss();
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
        document.documentElement.removeAttribute('data-svi-bgr-partial'); // v4.3
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
      // v4.5: 防闪光守卫 (html/body 黑底 !important) 尚在时采样会误判 body 为深色,
      // 推迟到守卫交接后再扫, 否则页面底色桶永久缺失 (白底泄漏)
      if (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.sviFlashguard) {
        setTimeout(() => { if (this.active) this.startScan(); }, 300);
        return;
      }
      if (mediaDominanceActive()) {
        // 媒体主导时推迟整页扫描
        setTimeout(() => { if (this.active) this.startScan(); }, 3000);
        return;
      }
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
          this.bucketsBg.set(key, applyDynamicThemeAdjust(mapLightToDark(q[0], q[1], q[2]), state.bgTone, state.bgBrightness, state.bgContrast));
        }
        el.setAttribute('data-svi-bgr-bg', key);
      }

      // 深色文字 → 浅色映射桶
      if (fgC && fgC[3] > 0.05 && relLuminance(fgC[0], fgC[1], fgC[2]) <= 90) {
        const key = bucketKey(fgC);
        if (!this.bucketsFg.has(key)) {
          const q = quantizeRgb(fgC);
          // 色调不染文字 (传 'pure-black'), 亮度/对比度照常生效
          this.bucketsFg.set(key, applyDynamicThemeAdjust(mapDarkToLight(q[0], q[1], q[2]), 'pure-black', state.bgBrightness, state.bgContrast));
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
            this.bucketsBd.set(key, applyDynamicThemeAdjust(mapBorderToDark(q[0], q[1], q[2]), state.bgTone, state.bgBrightness, state.bgContrast));
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
        // v4.3: 门控行同时接受整页激活 (bgr-on) 与局部改色 (bgr-partial)
        const gate = 'html:is([data-svi-bgr-on],[data-svi-bgr-partial])';
        for (const [key, rgb] of this.bucketsBg) {
          css += `${gate} [data-svi-bgr-bg="${key}"]{background-color:${rgbToHex(rgb)}!important;}`;
        }
        for (const [key, rgb] of this.bucketsFg) {
          css += `${gate} [data-svi-bgr-fg="${key}"]{color:${rgbToHex(rgb)}!important;}`;
        }
        for (const [key, rgb] of this.bucketsBd) {
          css += `${gate} [data-svi-bgr-bd="${key}"]{border-color:${rgbToHex(rgb)}!important;}`;
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
  // 20. 媒体覆盖引擎 (MediaCoverageEngine - R8: canvas / 视频海报)
  //     canvas: 变更驱动 + 空闲扫描 (预算 100/轮), 渲染 ≥120×80 且未污染才评估;
  //     海报: 复用图片解码链评估, 浅色 → data-svi-poster (播放即由 play 事件摘除滤镜);
  //     绝不触碰 .svi-fx-overlay 画布 (特效引擎自有的 GPU 画布)
  // ==========================================
  class MediaCoverageEngine {
    constructor() {
      this.checked = new WeakSet();     // 已判定 canvas (DOM 引用级, 无泄漏)
      this.posterCache = new Map();     // poster url → isLight (LRU 100)
      this.pendingNodes = new Set();
      this.flushTimer = null;
      this.sweepTimer = null;
      this.lastSweep = 0;
      this.init();
      this.bindPlaybackListeners();
    }

    init() {
      try {
        this.mo = new MutationObserver((records) => this.onMutations(records));
        this.mo.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
        });
      } catch (e) { /* ignore */ }
      requestIdle(() => this.tick(), 1500);
    }

    onMutations(records) {
      for (const m of records) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) this.pendingNodes.add(node);
          }
        }
      }
      if (this.pendingNodes.size) {
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => this.flushPending(), 200);
      }
    }

    flushPending() {
      if (document.hidden) {
        this.flushTimer = setTimeout(() => this.flushPending(), 1500);
        return;
      }
      const nodes = Array.from(this.pendingNodes);
      this.pendingNodes.clear();
      let budget = 100;
      for (const node of nodes) {
        if (budget <= 0) break;
        try {
          if (node.tagName === 'CANVAS') { this.processCanvas(node); budget--; }
          if (node.querySelectorAll) {
            node.querySelectorAll('canvas').forEach((c) => {
              if (budget <= 0) return;
              this.processCanvas(c);
              budget--;
            });
            node.querySelectorAll('video[poster]').forEach((v) => this.processPoster(v));
          }
          if (node.tagName === 'VIDEO' && node.getAttribute('poster')) this.processPoster(node);
        } catch (e) { /* ignore */ }
      }
    }

    tick() {
      if (!document.body) return;
      if (!document.hidden && !mediaDominanceActive()) this.sweep();
      this.sweepTimer = setTimeout(() => this.tick(), 5000);
    }

    sweep() {
      const now = Date.now();
      if (now - this.lastSweep < 4500) return;
      this.lastSweep = now;
      let budget = 100;
      try {
        document.querySelectorAll('canvas').forEach((c) => {
          if (budget <= 0) return;
          this.processCanvas(c);
          budget--;
        });
        let posters = 0;
        document.querySelectorAll('video[poster]').forEach((v) => {
          if (posters >= 10) return;
          this.processPoster(v);
          posters++;
        });
      } catch (e) { /* ignore */ }
      // Shadow DOM 有界扫描
      let shadowBudget = 50;
      ShadowDomRegistry.forEachRoot((sr) => {
        if (shadowBudget <= 0) return;
        try {
          sr.querySelectorAll('canvas').forEach((c) => {
            if (shadowBudget <= 0) return;
            this.processCanvas(c);
            shadowBudget--;
          });
        } catch (e) { /* ignore */ }
      });
    }

    processCanvas(canvas) {
      if (!canvas || canvas.tagName !== 'CANVAS') return;
      if (canvas.classList && canvas.classList.contains('svi-fx-overlay')) return; // 特效画布绝不触碰
      if (this.checked.has(canvas)) return;
      const w = canvas.clientWidth || canvas.width || 0;
      const h = canvas.clientHeight || canvas.height || 0;
      if (w < 120 || h < 80) return; // 渲染尺寸门槛
      this.checked.add(canvas);
      // 8×8 探针: drawImage + getImageData (污染即抛 SecurityError → 跳过)
      let data = null;
      try {
        const probe = document.createElement('canvas');
        probe.width = 8;
        probe.height = 8;
        const pctx = probe.getContext('2d', { willReadFrequently: true });
        pctx.drawImage(canvas, 0, 0, 8, 8);
        const sample = pctx.getImageData(0, 0, 8, 8);
        let opaque = 0;
        for (let i = 3; i < sample.data.length; i += 4) {
          if (sample.data[i] >= 64) opaque++;
        }
        if (opaque < 8) return;
        data = sample.data;
      } catch (e) {
        return; // tainted canvas → 优雅跳过
      }
      const isLight = evaluateImagePixels(data, getEvalPrefs());
      StatsManager.count('canvasesAnalyzed');
      // v4.6: 首扫写点收口 —— 手动结论 (data-svi-manual / host|src) 幂等占优,
      // 像素分析不得把用户 Alt+点击的反色拉回 (根因 H8, 固定两连点)
      applyInvertState(canvas, isLight, 'pixel');
    }

    processPoster(video) {
      if (!video || video.tagName !== 'VIDEO') return;
      let url = '';
      try { url = video.getAttribute('poster') || ''; } catch (e) { /* ignore */ }
      if (!url || /^data:/i.test(url)) return;
      let abs = url;
      try { abs = new URL(url, location.href).href; } catch (e) { return; }
      const key = profileKey() + '|' + abs;
      if (video.dataset.sviPosterChecked === abs) return;
      video.dataset.sviPosterChecked = abs;
      let decision = this.posterCache.has(key) ? this.posterCache.get(key) : null;
      if (decision === null) {
        if (this._posterInflight && this._posterInflight.has(abs)) return;
        this._posterInflight = this._posterInflight || new Set();
        this._posterInflight.add(abs);
        analyzeSrc(abs, null, getEvalPrefs())
          .then((r) => {
            this._posterInflight.delete(abs);
            if (!r.ok) return;
            if (this.posterCache.size >= 100) this.posterCache.delete(this.posterCache.keys().next().value);
            this.posterCache.set(key, r.isLight);
            this.applyPoster(video, abs, r.isLight);
          })
          .catch(() => { this._posterInflight.delete(abs); });
        return;
      }
      this.applyPoster(video, abs, decision);
    }

    applyPoster(video, abs, isLight) {
      try {
        if (isLight) {
          video.dataset.sviPoster = 'light';
          StatsManager.count('postersInverted');
        } else {
          delete video.dataset.sviPoster;
        }
      } catch (e) { /* ignore */ }
    }

    // 播放状态捕获监听: data-svi-poster 滤镜仅在非播放时生效
    bindPlaybackListeners() {
      document.addEventListener('play', (e) => {
        try {
          if (e.target && e.target.tagName === 'VIDEO') e.target.classList.add('svi-playing');
        } catch (err) { /* ignore */ }
      }, true);
      document.addEventListener('pause', (e) => {
        try {
          if (e.target && e.target.tagName === 'VIDEO') e.target.classList.remove('svi-playing');
        } catch (err) { /* ignore */ }
      }, true);
      document.addEventListener('ended', (e) => {
        try {
          if (e.target && e.target.tagName === 'VIDEO') e.target.classList.remove('svi-playing');
        } catch (err) { /* ignore */ }
      }, true);
    }
  }

  // ==========================================
  // 21. 本地数据统计管理器 (StatsManager) —— 仅本地存储, 绝不自动上传
  // ==========================================
  const StatsManager = {
    counters: null,
    log: [],
    dirty: false,

    load() {
      this.counters = this.freshCounters();
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
        } else {
          // 遗留键缺失时回退 svi:stats (Store 迁移镜像)
          const ns = Store.get('stats', null);
          if (ns && typeof ns === 'object') {
            if (ns.counters && typeof ns.counters === 'object') Object.assign(this.counters, ns.counters);
            if (Array.isArray(ns.log)) this.log = ns.log.slice(-200);
          }
        }
      } catch (e) { /* ignore */ }
    },

    // 全量计数器键集 (v3.0): clear/load 共用, 防止清空后遗漏新键
    freshCounters() {
      return {
        imagesAnalyzed: 0,
        imagesInverted: 0,
        bgImagesInverted: 0,
        taintFallbacks: 0,
        videoAutoActivations: 0,
        bgReplacePages: 0,
        imgFxTransforms: 0,
        canvasesAnalyzed: 0,
        postersInverted: 0,
        pipActivations: 0,
      };
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
        // svi: 命名空间同步镜像 (设计 §1: stats 属于 svi:*; 遗留键继续双写以兼容回滚)
        try { Store.set('stats', { counters: this.counters, log: this.log }); } catch (e) { /* ignore */ }
        this.dirty = false;
      } catch (e) { /* ignore */ }
    },

    clear() {
      this.counters = this.freshCounters();
      this.log = [];
      this.dirty = false;
      try {
        localStorage.removeItem(STATS_KEY);
      } catch (e) { /* ignore */ }
      try { Store.remove('stats'); } catch (e) { /* ignore */ }
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

    // 结构化统计条目 (UI 以表格网格逐项呈现, 禁止行内符号拼接)
    statEntries() {
      const c = this.counters || {};
      return [
        { label: '图片分析', value: String(c.imagesAnalyzed || 0) },
        { label: '已反色', value: String(c.imagesInverted || 0) },
        { label: '背景图', value: String(c.bgImagesInverted || 0) },
        { label: '跨域回退', value: String(c.taintFallbacks || 0) },
        { label: '视频自动', value: String(c.videoAutoActivations || 0) },
        { label: '背景替换页', value: String(c.bgReplacePages || 0) },
        { label: '图片特效', value: String(c.imgFxTransforms || 0) },
        { label: '画布分析', value: String(c.canvasesAnalyzed || 0) },
        { label: '海报', value: String(c.postersInverted || 0) },
        { label: '画中画', value: String(c.pipActivations || 0) },
        { label: '日志', value: this.log.length + '/200' },
      ];
    },
  };

  // ==========================================
  // 22. UI 组件库 (R5: 去重全部模态/面板构建; 行返回 {row, sync()}, 区块聚合 syncAll)
  //     XSS 加固: 动态数据一律 textContent/DOM API, 绝不 innerHTML 插值
  // ==========================================
  const ui = {
    // 基础元素构造器: attrs 支持 class/style/on*/常用属性; children 支持 字符串/节点/数组/null
    h(tag, attrs, ...children) {
      const el = document.createElement(tag);
      if (attrs) {
        for (const key of Object.keys(attrs)) {
          const v = attrs[key];
          if (v == null || v === false) continue;
          if (key === 'class') {
            el.className = String(v);
          } else if (key === 'style' && typeof v === 'string') {
            el.style.cssText = v;
          } else if (key.length > 2 && key.indexOf('on') === 0 && typeof v === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), v);
          } else if (key === 'text') {
            el.textContent = String(v);
          } else if (key === 'checked' || key === 'value' || key === 'selected' || key === 'disabled') {
            try { el[key] = v; } catch (e) { el.setAttribute(key, String(v)); }
          } else if (key === 'min' || key === 'max' || key === 'step' || key === 'placeholder' || key === 'rows' || key === 'title' || key === 'id' || key === 'type' || key === 'colspan') {
            el.setAttribute(key, String(v));
          } else {
            el.setAttribute(key, String(v));
          }
        }
      }
      const appendAll = (kids) => {
        for (const c of kids) {
          if (c == null || c === false) continue;
          if (Array.isArray(c)) { appendAll(c); continue; }
          if (typeof c === 'string' || typeof c === 'number') {
            el.appendChild(document.createTextNode(String(c)));
          } else if (c.nodeType === 1) {
            el.appendChild(c);
          }
        }
      };
      appendAll(children);
      return el;
    },

    labelBox(label, hint) {
      return this.h('div', { class: 'svi-modal-label-box', style: 'width:auto;' },
        this.h('div', { class: 'svi-modal-label', text: label }),
        hint ? this.h('div', { class: 'svi-modal-hint', text: hint }) : null);
    },

    // 区块: 标题行 + 行集合 (sync 收集)
    section(title, hint, id) {
      const el = this.h('div', { class: 'svi-modal-section', id: id || '' });
      const secTitle = this.h('div', { class: 'svi-sec-title' }, this.h('span', { text: title }));
      if (hint) secTitle.appendChild(this.h('span', { text: hint, style: 'font-size:10px; color:#64748b;' }));
      el.appendChild(secTitle);
      const syncs = [];
      return {
        el,
        add(row) {
          if (row && row.row) {
            el.appendChild(row.row);
            if (typeof row.sync === 'function') syncs.push(row.sync);
          } else if (row && row.nodeType === 1) {
            el.appendChild(row);
          }
          return row;
        },
        syncAll() {
          for (const s of syncs) {
            try { s(); } catch (e) { /* ignore */ }
          }
        },
      };
    },

    // 开关行
    toggleRow(label, hint, getVal, onSet) {
      const row = this.h('div', { class: 'svi-site-check-row' });
      const cb = this.h('input', { type: 'checkbox', class: 'svi-check' });
      cb.addEventListener('change', () => onSet(cb.checked));
      row.append(this.labelBox(label, hint), cb);
      return {
        row,
        sync() { cb.checked = !!getVal(); },
      };
    },

    // 滑动条 + 数值双向联动行 (v2.0 makeRow 的组件化)
    sliderRow(label, hint, getVal, onSet, min, max, step, unit) {
      const row = this.h('div', { class: 'svi-modal-row' });
      const slider = this.h('input', { type: 'range', class: 'svi-modal-slider', min: String(min), max: String(max), step: String(step) });
      const numInput = this.h('input', { type: 'number', class: 'svi-modal-num-input', min: String(min), max: String(max), step: String(step) });
      const syncVal = (val, fromSlider) => {
        let n = parseFloat(val);
        if (isNaN(n)) return;
        n = Math.max(min, Math.min(max, n));
        if (!fromSlider) slider.value = String(n);
        numInput.value = String(n);
        onSet(n);
      };
      slider.addEventListener('input', () => syncVal(slider.value, true));
      numInput.addEventListener('input', () => syncVal(numInput.value, false));
      const controls = this.h('div', { class: 'svi-modal-controls' }, slider, numInput);
      if (unit) controls.appendChild(this.h('span', { class: 'svi-modal-unit', text: unit }));
      row.append(this.labelBox(label, hint), controls);
      return {
        row,
        sync() {
          const v = getVal();
          slider.value = String(v);
          numInput.value = String(v);
        },
      };
    },

    // 下拉选择行 (v3.3: 选项只留短名, 说明经 describe 字段在选项下方动态呈现)
    selectRow(label, hint, options, getVal, onSet) {
      const row = this.h('div', { class: 'svi-modal-row' });
      const select = this.h('select', { class: 'svi-modal-select' });
      for (const opt of options) {
        const o = this.h('option', { value: opt.v });
        o.textContent = opt.label;
        select.appendChild(o);
      }
      const describe = this.h('div', { class: 'svi-row-describe' });
      const syncDescribe = () => {
        const cur = options.find((o) => String(o.v) === String(select.value));
        const text = (cur && cur.describe) ? cur.describe : '';
        describe.textContent = text;
        describe.style.display = text ? '' : 'none';
      };
      select.addEventListener('change', () => onSet(select.value));
      select.addEventListener('change', syncDescribe);
      row.append(this.labelBox(label, hint), select, describe);
      return {
        row,
        select,
        sync() {
          select.value = String(getVal());
          syncDescribe();
        },
      };
    },

    // 色卡网格 (含同步); items: [{id, label, color, dark?}]
    chipRow(items, isActive, onToggle) {
      const grid = this.h('div', { class: 'svi-color-chips-grid' });
      const chips = {};
      for (const item of items) {
        const chip = this.h('div', { class: 'svi-color-chip' });
        const swatch = this.h('div', {
          class: 'svi-color-chip-swatch',
          style: 'background: ' + (item.color || '#ffffff') + (item.dark ? '; border-color: rgba(255,255,255,0.3);' : '') + ';',
        });
        const label = this.h('span', { text: item.label });
        const check = this.h('span', { class: 'svi-color-chip-check', text: '✓' });
        chip.append(swatch, label, check);
        chip.addEventListener('click', () => onToggle(item.id));
        chips[item.id] = chip;
        grid.appendChild(chip);
      }
      return {
        row: grid,
        chips,
        sync() {
          for (const item of items) {
            if (chips[item.id]) chips[item.id].classList.toggle('active', !!isActive(item.id));
          }
        },
      };
    },

    // 按钮行 buttons: [{label, onClick, primary, danger, block}]
    btnRow(buttons) {
      const row = this.h('div', { class: 'svi-btn-row-actions' });
      for (const b of buttons) {
        const btn = this.h('button', {
          class: 'svi-mini-btn' + (b.primary ? '' : '') + (b.danger ? ' danger' : ''),
          text: b.label,
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          b.onClick(e);
        });
        row.appendChild(btn);
      }
      return { row, sync() {} };
    },

    // 多行文本输入 (label + hint + textarea)
    textRow(label, hint, value, rows, onInput, placeholder) {
      const row = this.h('div', {});
      if (label) row.appendChild(this.labelBox(label, hint));
      const ta = this.h('textarea', { class: 'svi-modal-textarea', rows: String(rows || 3) });
      if (placeholder) ta.placeholder = placeholder;
      ta.addEventListener('change', () => onInput(ta.value));
      row.appendChild(ta);
      return {
        row,
        ta,
        sync() { ta.value = value(); },
      };
    },

    // 提示行 (动态文本走 textContent)
    infoLine(text, cls) {
      const el = this.h('div', { class: cls || 'svi-hint-line' });
      el.textContent = String(text == null ? '' : text);
      return {
        row: el,
        el,
        setText(t) { el.textContent = String(t == null ? '' : t); },
        sync() {},
      };
    },

    // 拾色器行 (label + native color input; v3.3: 色值仅悬浮提示, 界面不显示十六进制)
    pickerRow(label, hint, getVal, onSet) {
      const row = this.h('div', { class: 'svi-color-picker-row' });
      const labelBox = this.h('div', { class: 'svi-color-picker-label' },
        this.h('span', { text: label }),
        hint ? this.h('span', { text: hint, style: 'font-size:10px; color:#64748b;' }) : null);
      const previewCircle = this.h('div', { class: 'svi-color-preview-circle' });
      const previewBox = this.h('div', { class: 'svi-color-preview-box' }, previewCircle);
      const native = this.h('input', { type: 'color', class: 'svi-color-input-native' });
      native.addEventListener('input', () => onSet(native.value));
      const wrap = this.h('div', { class: 'svi-color-input-wrap' }, native, previewBox);
      row.append(labelBox, wrap);
      return {
        row,
        native,
        sync() {
          const v = getVal() || '#ffffff';
          native.value = v;
          previewCircle.style.background = v;
          previewBox.title = v.toUpperCase();
        },
      };
    },
  };

  // ==========================================
  // 23. 极简悬浮胶囊 UI 控制器与高级设置页 (全部区块经 ui 组件库构建)
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
      this.pipBtn = null;
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
      this.statsGrid = null;
      this.rowSyncs = [];           // 全部组件行的 sync 函数 (syncAll 统一刷新)
      // v4.0: 站点电源 / 页签 / 能力卡片
      this.bound = false;
      this.siteOff = false;
      this.activeTab = 'site';
      this.tabBtns = {};
      this.capCards = {};
      this.powerSwitch = null;
      this.powerStatus = null;
      this.offBadge = null;
      this.sitePanelEl = null;
      this.globalPanelEl = null;
    }

    bindStateMachine(sm) {
      this.stateMachine = sm;
      if (!this.bound) {
        this.bound = true;
        this.buildUI();
        this.buildSettingsModal();
        this.bindShortcuts();
        this.bindFullscreen();
      }
      this.setSiteOffState(this.siteOff);
      this.syncVisuals();
    }

    buildUI() {
      if (this.root) return; // v4.0 幂等: 停用态预构建后, 电源热启用不重建

      this.root = document.createElement('div');
      this.root.className = 'svi-capsule-root';

      // v4.0: 停用态徽标 (站点电源关闭时胶囊折叠为此, 点击即热恢复)
      this.offBadge = document.createElement('button');
      this.offBadge.className = 'svi-off-badge';
      this.offBadge.textContent = '⏻ 已停用 · 点击恢复';
      this.offBadge.title = '本站反色已停用，点击立即恢复';
      this.offBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSitePower(true);
      });

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

      // 行1: 核心按钮 (视频 / 智能 / 图片 / 背景 / 画中画 —— 5 紧凑按钮)
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

      // 画中画按钮 (仅当浏览器支持时创建; 独立类 svi-pip-btn, 同一行内视觉一致)
      if (typeof document !== 'undefined' && document.pictureInPictureEnabled) {
        this.pipBtn = document.createElement('button');
        this.pipBtn.className = 'svi-pip-btn';
        this.pipBtn.textContent = '画中画';
        this.pipBtn.title = '处理后的画面在画中画窗口播放';
        this.pipBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const vfx = (window.__svi && window.__svi.engines) ? window.__svi.engines.videoFx : null;
          if (vfx) vfx.openPiP();
        });
        btnRow.appendChild(this.pipBtn);
      }

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
      modalBtn.textContent = '⚙️ 打开设置面板';
      modalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSettingsModal();
      });

      // Footer: 快捷键提示
      const footer = document.createElement('div');
      footer.className = 'svi-card-footer';
      footer.innerHTML = `<span>Alt+I 视频</span><span>Alt+A 智能</span><span>Alt+点击 图片</span>`;

      this.panel.append(header, btnRow, presetRow, modalBtn, footer);
      this.root.append(this.pill, this.panel, this.offBadge);
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
    // 高级设置模态窗口 (全部区块经 ui 组件库构建; v3.3 信息架构重排)
    // 顺序: 🎨外观与画面 → 🖼️图片反色 → 🎬视频 → 🌐站点与规则 → 🛡️颜色保护 → 🖥️当前页媒体 → 💾数据与备份 → 💡操作技巧
    // ==========================================
    buildSettingsModal() {
      this.modalMask = document.createElement('div');
      this.modalMask.className = 'svi-modal-mask';

      const win = document.createElement('div');
      win.className = 'svi-modal-window';
      this.modalWindow = win;

      // 模态弹窗 Header
      const header = document.createElement('div');
      header.className = 'svi-modal-header';
      header.innerHTML = `
        <div class="svi-modal-title"><span>⚡ 智能反色</span></div>
        <button class="svi-modal-close" title="关闭">✕</button>
      `;
      // v4.6 版本自检 (R-H4): 面板显著显示运行中脚本的版本号, 供用户与发布页比对排查旧版问题。
      // 不做远程版本检查 (禁止自动网络遥测), 仅本地展示。
      try {
        const titleEl = header.querySelector('.svi-modal-title');
        const verEl = document.createElement('span');
        verEl.className = 'svi-modal-ver';
        verEl.textContent = 'v' + SCRIPT_VERSION;
        verEl.title = '当前运行脚本版本 (与 GreasyFork/GitHub 发布页比对可判断是否旧版)';
        titleEl.appendChild(verEl);
      } catch (e) { /* ignore */ }
      header.querySelector('.svi-modal-close').addEventListener('click', () => {
        this.closeSettingsModal();
      });

      // v3.3: 布局形态切换 (居中窗口 / 靠左停靠 / 靠右停靠), 选择持久化
      this.layoutBtns = {};
      const layoutSwitch = document.createElement('div');
      layoutSwitch.className = 'svi-layout-switch';
      for (const [key, label] of [['center', '居中'], ['left', '靠左'], ['right', '靠右']]) {
        const b = document.createElement('button');
        b.className = 'svi-layout-btn';
        b.textContent = label;
        b.addEventListener('click', () => {
          state.settingsLayout = key;
          savePrefs();
          this.applySettingsLayout();
        });
        this.layoutBtns[key] = b;
        layoutSwitch.appendChild(b);
      }
      header.insertBefore(layoutSwitch, header.querySelector('.svi-modal-close'));

      const body = document.createElement('div');
      body.className = 'svi-modal-body';

      // v4.0 IA: 电源横幅 (热生效) + 本站/全局双页签 —— 取代 v3.3 八区块单列长滚动
      body.appendChild(this.buildPowerBanner());

      const tabsBar = document.createElement('div');
      tabsBar.className = 'svi4-tabs';
      const sitePanel = document.createElement('div');
      sitePanel.className = 'svi4-panel';
      const globalPanel = document.createElement('div');
      globalPanel.className = 'svi4-panel';
      const mkTab = (key, label) => {
        const b = document.createElement('button');
        b.className = 'svi4-tab';
        b.textContent = label;
        b.addEventListener('click', () => this.switchTab(key));
        this.tabBtns[key] = b;
        tabsBar.appendChild(b);
      };
      mkTab('site', '本站');
      mkTab('global', '全局');

      // 本站页签: 能力卡片(三态热生效) + 本站特效 + 元素级规则 + 学习规则 + 当前页媒体
      sitePanel.appendChild(this.buildSiteSection());
      sitePanel.appendChild(this.buildMediaSection());

      // 全局页签: 外观 / 图片 / 视频 / 站点名单 / 颜色保护 / 数据与备份 / 技巧
      globalPanel.appendChild(this.buildAppearanceSection());
      globalPanel.appendChild(this.buildImageSection());
      globalPanel.appendChild(this.buildVideoSection());
      globalPanel.appendChild(this.buildReadabilitySection());
      globalPanel.appendChild(this.buildDynamicThemeSection());
      globalPanel.appendChild(this.buildSiteListsSection());
      globalPanel.appendChild(this.buildSchedulerSection());
      globalPanel.appendChild(this.buildShieldSection());
      globalPanel.appendChild(this.buildDataSection());
      globalPanel.appendChild(this.buildTipsBlock());

      body.append(tabsBar, sitePanel, globalPanel);
      this.sitePanelEl = sitePanel;
      this.globalPanelEl = globalPanel;
      this.switchTab(this.activeTab);

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

      // 点击遮罩外部关闭 (仅居中形态; 停靠形态遮罩透明, 由下方 document 监听处理)
      this.modalMask.addEventListener('click', (e) => {
        if (e.target === this.modalMask) {
          this.closeSettingsModal();
        }
      });

      // v3.3 停靠形态: 点击面板外部即关闭 (遮罩不拦截页面交互)
      document.addEventListener('click', (e) => {
        if (!this.modalMask.classList.contains('show')) return;
        if (!this.modalMask.classList.contains('docked')) return;
        if (this.modalWindow.contains(e.target)) return;
        if (this.root && this.root.contains(e.target)) return;
        this.closeSettingsModal();
      }, true);

      // Esc 关闭
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modalMask.classList.contains('show')) {
          this.closeSettingsModal();
        }
      });

      // 存储同步方法 (区块行 sync 聚合 → 一次全量刷新)
      this.modalControls = {
        syncAll: () => {
          for (const s of this.rowSyncs) {
            try { s(); } catch (e) { /* ignore */ }
          }
        },
      };

      // v3.3: 停靠宽度拖拽把手 (320 ~ 600px, 松手记忆)
      this.dragHandle = document.createElement('div');
      this.dragHandle.className = 'svi-drag-handle';
      win.appendChild(this.dragHandle);
      this.dragHandle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const layout = state.settingsLayout === 'left' ? 'left' : 'right';
        const startX = e.clientX;
        const startW = this.modalWindow.getBoundingClientRect().width;
        const onMove = (ev) => {
          const delta = layout === 'left' ? (ev.clientX - startX) : (startX - ev.clientX);
          const w = Math.max(320, Math.min(600, Math.round(startW + delta)));
          state.settingsWidth = w;
          this.modalWindow.style.setProperty('--svi-settings-w', w + 'px');
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          savePrefs();
          showToast('面板宽度已记忆');
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });

      this.applySettingsLayout();
    }

    // v3.3: 应用设置页布局形态 (居中 / 靠左停靠 / 靠右停靠)
    applySettingsLayout() {
      if (!this.modalMask || !this.modalWindow) return;
      const layout = ['left', 'right'].indexOf(state.settingsLayout) !== -1 ? state.settingsLayout : 'center';
      this.modalWindow.classList.toggle('layout-left', layout === 'left');
      this.modalWindow.classList.toggle('layout-right', layout === 'right');
      this.modalMask.classList.toggle('docked', layout !== 'center');
      this.modalWindow.style.setProperty('--svi-settings-w', (state.settingsWidth || 420) + 'px');
      if (this.dragHandle) {
        this.dragHandle.className = 'svi-drag-handle ' + (layout === 'left' ? 'right-edge' : 'left-edge');
        this.dragHandle.style.display = layout === 'center' ? 'none' : '';
      }
      for (const key of Object.keys(this.layoutBtns || {})) {
        this.layoutBtns[key].classList.toggle('active', key === layout);
      }
    }

    // ==========================================
    // v3.3 模态区块: 🎨 外观与画面 (预设 + 悬停还原 + 画面滤镜 + 过渡)
    // ==========================================
    buildAppearanceSection() {
      const sec = ui.section('🎨 外观与画面', '整体反色风格与观感微调', 'svi-sec-appearance');

      const presetChipRow = ui.chipRow(
        Object.values(PRESETS).map((p) => ({
          id: p.id,
          label: p.name,
          color: p.id === 'amoled' ? '#000000' : '#1e293b',
          dark: true,
        })),
        (id) => state.presetId === id,
        (id) => this.stateMachine.onUserSelectPreset(id)
      );
      sec.add(presetChipRow);
      this.rowSyncs.push(() => presetChipRow.sync());

      const hoverRow = ui.toggleRow('悬停显示原图', '悬停已反色图片时临时显示原图，移出后恢复反色视图',
        () => state.hoverRestore !== false,
        (v) => {
          state.hoverRestore = v;
          savePrefs();
          updateImageFilterCss();
        });
      sec.add(hoverRow);
      this.rowSyncs.push(() => hoverRow.sync());

      // 画面滤镜微调 (原折叠抽屉并入, 反色预设选「自定义」时逐项生效)
      const bRow = ui.sliderRow('画面亮度', '反色后的暗化微调', () => state.brightness, (n) => {
        state.brightness = n;
        this.stateMachine.onCustomParamChange();
      }, 0.50, 1.50, 0.01, '');
      const cRow = ui.sliderRow('画面对比度', '文字线条锐利度', () => state.contrast, (n) => {
        state.contrast = n;
        this.stateMachine.onCustomParamChange();
      }, 0.50, 1.50, 0.01, '');
      const sRow = ui.sliderRow('色彩饱和度', '消除或保留颜色', () => state.saturate, (n) => {
        state.saturate = n;
        this.stateMachine.onCustomParamChange();
      }, 0.00, 2.00, 0.01, '');
      const hRow = ui.sliderRow('色相旋转', '校正颜色谱系', () => state.hueRotate, (n) => {
        state.hueRotate = n;
        this.stateMachine.onCustomParamChange();
      }, 0, 360, 1, '°');
      const transRow = ui.sliderRow('过渡动画时长', '设为 0 毫秒即直接切换无渐变', () => state.transitionMs, (n) => {
        state.transitionMs = n;
        this.stateMachine.onUpdateTransition(n);
      }, 0, 1000, 10, '毫秒');
      [bRow, cRow, sRow, hRow, transRow].forEach((r) => {
        sec.add(r);
        this.rowSyncs.push(() => r.sync());
      });
      return sec.el;
    }

    // ==========================================
    // v3.3 模态区块: 🖼️ 图片反色 (策略 + 浅色检测 + 色图 + 特效参数)
    // ==========================================
    buildImageSection() {
      const sec = ui.section('🖼️ 图片反色', '决定哪些图片反色以及反色方式', 'svi-sec-image');

      // 智能图片策略 (v3.3 选项净化: 短名 + 动态说明)
      const policyRow = ui.selectRow('智能图片策略', '手动 Alt+点击 与学习规则始终优先',
        [
          { v: 'balanced', label: '平衡', describe: '默认。正文与大图反色，封面网格与页面骨架跳过。' },
          { v: 'conservative', label: '保守', describe: '仅正文上下文与不小于 200 像素的大图参与。' },
          { v: 'aggressive', label: '激进', describe: '仅按尺寸判断，最接近早期版本的行为。' },
        ],
        () => state.imagePolicy || 'balanced',
        (v) => {
          state.imagePolicy = v;
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
      sec.add(policyRow);
      this.rowSyncs.push(() => policyRow.sync());

      const generalLightRow = ui.toggleRow('全浅色通用自适应检测', '任何高明度浅底图表均自动识别反色',
        () => state.imgGeneralLight !== false,
        (v) => {
          state.imgGeneralLight = v;
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
      sec.add(generalLightRow);
      this.rowSyncs.push(() => generalLightRow.sync());

      // v4.6: 暗色遮罩上下文感知 (任务 v4.6-4)。变更即全量重扫 (对齐元素规则编辑契约:
      // savePrefs → clearCacheAndRescan + 背景图 sweep), 关闭即完全回到旧行为 (回滚点 R2)
      const maskAwareRow = ui.toggleRow('暗色遮罩感知', '祖先有暗色蒙层且合成后已足够暗时不再反色图片，避免破坏原有合成观感；关闭立即回到旧行为并重扫',
        () => state.maskAware !== false,
        (v) => {
          state.maskAware = v;
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
          try {
            const bgEng = window.__svi && window.__svi.engines ? window.__svi.engines.bgImage : null;
            if (bgEng && typeof bgEng.sweep === 'function') bgEng.sweep();
          } catch (e) { /* ignore */ }
        });
      sec.add(maskAwareRow);
      this.rowSyncs.push(() => maskAwareRow.sync());

      sec.add(ui.infoLine('预设浅色色卡，点击启用或禁用对应浅色系：'));
      const colorChipRow = ui.chipRow(
        IMG_COLOR_PRESETS.map((cp) => ({ id: cp.id, label: cp.name, color: cp.color })),
        (id) => !!(state.imgPresets && state.imgPresets[id]),
        (id) => {
          if (!state.imgPresets) state.imgPresets = {};
          state.imgPresets[id] = !state.imgPresets[id];
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        }
      );
      sec.add(colorChipRow);
      this.rowSyncs.push(() => colorChipRow.sync());

      const customPicker = ui.pickerRow('🎯 目标色图拾色器', '点击色块唤出调色盘',
        () => state.imgCustomColor || '#ffffff',
        (hex) => {
          state.imgCustomColor = hex;
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
      sec.add(customPicker);
      this.rowSyncs.push(() => customPicker.sync());

      // 浅色检测阈值精调 (原折叠抽屉并入)
      const imgTolRow = ui.sliderRow('目标色容差', '色图匹配置信范围', () => state.imgTolerance, (n) => {
        state.imgTolerance = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 10, 80, 1, '');
      const imgLumRow = ui.sliderRow('浅色明度线', '判定浅色背景的明度底线', () => state.imgLumCutoff, (n) => {
        state.imgLumCutoff = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 150, 240, 1, '');
      const imgAreaRow = ui.sliderRow('浅色面积占比', '触发反色的浅底面积比例', () => state.imgAreaThreshold, (n) => {
        state.imgAreaThreshold = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 25, 90, 1, '%');
      const minSizeRow = ui.sliderRow('正文图最小尺寸', '小于此长宽的图标不反色', () => state.minImgSize, (n) => {
        state.minImgSize = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 32, 300, 4, '像素');
      [imgTolRow, imgLumRow, imgAreaRow, minSizeRow].forEach((r) => {
        sec.add(r);
        this.rowSyncs.push(() => r.sync());
      });

      // 图片特效模式与参数 (v3.3 选项净化: 短名 + 动态说明)
      const imgFxModeRow = ui.selectRow('图片特效模式', '部分反色与特效的呈现方式',
        IMG_FX_MODES,
        () => state.imgFxMode,
        (v) => {
          state.imgFxMode = v;
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
      sec.add(imgFxModeRow);
      this.rowSyncs.push(() => imgFxModeRow.sync());

      const lumRow = ui.sliderRow('亮度反色 · 明度线', '仅反色高于该明度的像素', () => state.imgFxParams.lumCutoff, (n) => {
        state.imgFxParams.lumCutoff = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 100, 255, 1, '');
      sec.add(lumRow);
      this.rowSyncs.push(() => lumRow.sync());

      const satRow = ui.sliderRow('亮度反色 · 饱和上限', '低于该饱和度的像素才参与', () => state.imgFxParams.satCutoff, (n) => {
        state.imgFxParams.satCutoff = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 0, 1, 0.01, '');
      sec.add(satRow);
      this.rowSyncs.push(() => satRow.sync());

      const keyPicker = ui.pickerRow('键色反色 · 目标色', '仅反色接近该颜色的像素',
        () => state.imgFxParams.keyColor || '#ffffff',
        (hex) => {
          state.imgFxParams.keyColor = hex;
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
      sec.add(keyPicker);
      this.rowSyncs.push(() => keyPicker.sync());

      const tolRow = ui.sliderRow('键色反色 · 容差', '与键色的颜色距离容差', () => state.imgFxParams.keyTol, (n) => {
        state.imgFxParams.keyTol = n;
        savePrefs();
        window.__svi_image_engine?.clearCacheAndRescan();
      }, 10, 160, 1, '');
      sec.add(tolRow);
      this.rowSyncs.push(() => tolRow.sync());

      sec.add(ui.infoLine('特效以替换图方式呈现：悬停查看原图，Alt+点击临时还原，Alt+Shift+拖拽框选区域。'));
      return sec.el;
    }

    // ==========================================
    // v3.3 模态区块: 🎬 视频 (特效引擎 + 智能算法 + 画面调节 + 时间线记忆)
    // ==========================================
    buildVideoSection() {
      const sec = ui.section('🎬 视频', '视频反色引擎与画面调节', 'svi-sec-video');

      // 视频特效引擎 (显卡加速不可用时隐藏选项, 自动走标准滤镜路径)
      const vfx = (window.__svi && window.__svi.engines) ? window.__svi.engines.videoFx : null;
      const gpuOk = !vfx || vfx.available;
      if (gpuOk) {
        const vfxModeRow = ui.selectRow('视频特效引擎', '决定视频反色的呈现路径',
          [
            { v: 'off', label: '关闭', describe: '走标准滤镜路径，兼容性最好。' },
            { v: 'full', label: '完整反色', describe: '显卡加速逐帧呈现完整反色。' },
            { v: 'luma', label: '亮度反色', describe: '显卡加速逐帧仅反色浅色像素。' },
            { v: 'key', label: '键色反色', describe: '显卡加速逐帧反色接近键色的像素。' },
          ],
          () => state.videoFxMode,
          (v) => {
            state.videoFxMode = v;
            savePrefs();
            try {
              const hil = window.__svi && window.__svi.engines ? window.__svi.engines.hil : null;
              if (hil) hil.probe && hil.probe.applyFilterToCurrent();
            } catch (e) { /* ignore */ }
          });
        sec.add(vfxModeRow);
        this.rowSyncs.push(() => vfxModeRow.sync());
      } else {
        sec.add(ui.infoLine('当前环境不支持显卡加速，视频特效引擎已停用，将走标准滤镜路径。'));
      }

      // 视频智能算法与防抖 (原折叠抽屉并入)
      const intervalRow = ui.sliderRow('检测采样周期', '后台探测频次，支持逐帧检测时自动逐帧', () => state.sampleIntervalMs, (n) => {
        state.sampleIntervalMs = n;
        this.stateMachine.onUpdateInterval(n);
      }, 50, 2000, 25, '毫秒');
      const whiteRow = ui.sliderRow('白底面积占比', '触发视频反色的面积阈值', () => state.whiteThreshold, (n) => {
        state.whiteThreshold = n;
        savePrefs();
      }, 30, 95, 1, '%');
      const lumRow = ui.sliderRow('明度判定线', '判定为白底的亮度下限', () => state.lumThreshold, (n) => {
        state.lumThreshold = n;
        savePrefs();
      }, 160, 250, 1, '');
      const hystRow = ui.sliderRow('退出防抖延迟', '离开白底画面时的缓冲确认时长', () => state.exitHysteresisMs, (n) => {
        state.exitHysteresisMs = n;
        savePrefs();
      }, 200, 5000, 100, '毫秒');
      [intervalRow, whiteRow, lumRow, hystRow].forEach((r) => {
        sec.add(r);
        this.rowSyncs.push(() => r.sync());
      });

      // v3.2 视频画面调节 (独立于反色, 可组合)
      const tuneChanged = () => { savePrefs(); applyVideoTune(); };
      const tuneRows = [
        ui.toggleRow('启用画面调节', '对所有视频生效：调亮度对比度饱和度暖色黑白，关闭时零开销',
          () => state.videoTune && state.videoTune.enabled === true,
          (v) => { state.videoTune.enabled = v; tuneChanged(); }),
        ui.sliderRow('画面调节 · 亮度', '降低亮度护眼，1 为原样',
          () => state.videoTune.brightness, (v) => { state.videoTune.brightness = v; tuneChanged(); },
          0.3, 1.7, 0.01, ''),
        ui.sliderRow('画面调节 · 对比度', '画面明暗反差',
          () => state.videoTune.contrast, (v) => { state.videoTune.contrast = v; tuneChanged(); },
          0.3, 1.7, 0.01, ''),
        ui.sliderRow('画面调节 · 饱和度', '色彩浓淡，0 为黑白感',
          () => state.videoTune.saturate, (v) => { state.videoTune.saturate = v; tuneChanged(); },
          0, 2, 0.01, ''),
        ui.sliderRow('画面调节 · 暖色', '暖黄夜读色调',
          () => state.videoTune.warmth, (v) => { state.videoTune.warmth = v; tuneChanged(); },
          0, 1, 0.05, ''),
        ui.sliderRow('画面调节 · 黑白', '去色程度',
          () => state.videoTune.grayscale, (v) => { state.videoTune.grayscale = v; tuneChanged(); },
          0, 1, 0.05, ''),
      ];
      for (const r of tuneRows) sec.add(r);
      sec.add(ui.btnRow([
        { label: '护眼', onClick: () => { Object.assign(state.videoTune, { enabled: true, brightness: 0.85, contrast: 1, saturate: 1, warmth: 0.15, grayscale: 0 }); tuneChanged(); this.modalControls && this.modalControls.syncAll(); } },
        { label: '夜间', onClick: () => { Object.assign(state.videoTune, { enabled: true, brightness: 0.7, contrast: 1, saturate: 0.9, warmth: 0.25, grayscale: 0 }); tuneChanged(); this.modalControls && this.modalControls.syncAll(); } },
        { label: '鲜艳', onClick: () => { Object.assign(state.videoTune, { enabled: true, brightness: 1, contrast: 1.05, saturate: 1.35, warmth: 0, grayscale: 0 }); tuneChanged(); this.modalControls && this.modalControls.syncAll(); } },
        { label: '还原', onClick: () => { Object.assign(state.videoTune, { enabled: false, brightness: 1, contrast: 1, saturate: 1, warmth: 0, grayscale: 0 }); tuneChanged(); this.modalControls && this.modalControls.syncAll(); } },
      ]));
      for (const r of tuneRows) this.rowSyncs.push(() => r.sync());

      // 时间线记忆 (v3.3 选项净化: 短名 + 动态说明)
      const timelineRow = ui.selectRow('时间线记忆', '反色片段按视频指纹记忆，重放时提前布防',
        [
          { v: 'off', label: '关闭', describe: '不做时间线记忆。' },
          { v: 'reference', label: '参考', describe: '自动提前布防，手动操作始终优先。' },
          { v: 'takeover', label: '接管', describe: '时间线记忆直接控制反色。' },
        ],
        () => state.timelineMode,
        (v) => {
          state.timelineMode = v;
          savePrefs();
        });
      sec.add(timelineRow);
      this.rowSyncs.push(() => timelineRow.sync());
      return sec.el;
    }

    // ==========================================
    // v3.3 模态区块: 💡 操作技巧
    // ==========================================
    buildTipsBlock() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-tips';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>💡 操作技巧</span>`;
      sec.appendChild(secTitle);

      const tips = [
        ['Alt + 鼠标左键', '在网页任意图片或矢量图上点击，可单独强制反色或复原，选择会被记住。'],
        ['Alt + Shift + 拖拽', '区域反色模式下在图片上框选局部反色区域。'],
        ['鼠标悬停', '移至已反色的图片上方时自动显示原始颜色，移出后恢复。'],
      ];
      for (const [key, desc] of tips) {
        const line = document.createElement('div');
        line.className = 'svi-tip-line';
        const k = document.createElement('b');
        k.textContent = key;
        const d = document.createElement('span');
        d.textContent = desc;
        line.append(k, d);
        sec.appendChild(line);
      }
      return sec;
    }

    // ==========================================
    // v3.0 学习规则列表刷新 (区块并入站点与规则; v3.3 保留刷新逻辑)
    // ==========================================
    refreshSmartSection() {
      if (!this.smartRulesBox) return;
      this.smartRulesBox.textContent = '';
      const host = profileKey();
      const rules = ruleLearner.rulesFor(host);
      const active = new Set(ruleLearner.activeRules(host).map((r) => r.stem));
      if (!rules.length) {
        const empty = document.createElement('div');
        empty.className = 'svi-hint-line';
        empty.textContent = '暂无学习规则 —— 在图片上 Alt+点击即可教它。';
        this.smartRulesBox.appendChild(empty);
      }
      for (const rule of rules) {
        const row = document.createElement('div');
        row.className = 'svi-learned-row';
        const stem = document.createElement('span');
        stem.className = 'svi-learned-stem';
        stem.textContent = rule.stem; // 存储层字符串 → textContent (XSS 加固)
        const action = document.createElement('span');
        action.className = 'svi-learned-action' + (rule.action === 'protect' ? ' protect' : '');
        action.textContent = rule.action === 'protect' ? '保护' : '反色';
        const hits = document.createElement('span');
        hits.className = 'svi-learned-hits';
        hits.textContent = rule.hits + ' 次' + (active.has(rule.stem) ? ' · 已生效' : ' · 未达阈值');
        const del = document.createElement('button');
        del.className = 'svi-mini-btn danger';
        del.textContent = '删除';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          ruleLearner.deleteRule(host, rule.stem);
          this.refreshSmartSection();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
        row.append(stem, action, hits, del);
        this.smartRulesBox.appendChild(row);
      }
      // 时间线记忆概览
      if (this.smartHint) {
        const tl = timelineLearner;
        const keys = Object.keys(tl.data).filter((k) => k.indexOf(host + '|') === 0);
        const segs = keys.reduce((acc, k) => acc + ((tl.data[k] && tl.data[k].segs && tl.data[k].segs.length) || 0), 0);
        this.smartHint.setText(keys.length
          ? `时间线记忆: 本站已记忆 ${keys.length} 个视频 / ${segs} 个反色片段 (模式: ${state.timelineMode})。`
          : `时间线记忆: 本站暂无记忆片段 (模式: ${state.timelineMode})。`);
      }
    }

    // ==========================================
    // v3.3 模态区块: 💾 数据与备份 (规则文件 / 全量备份 / 本地统计, 合并原「存储」+「数据与反馈」)
    // ==========================================
    buildDataSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-stats';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>💾 数据与备份</span>`;
      sec.appendChild(secTitle);

      // 存储后端徽章行
      this.storageBadgeLine = document.createElement('div');
      this.storageBadgeLine.className = 'svi-modal-row';
      sec.appendChild(this.storageBadgeLine);

      // —— 规则文件 ——
      sec.appendChild(ui.infoLine('规则文件：站点名单、本站设置、元素规则、学习规则与屏蔽色，可在任意页面之间传递。').row);
      sec.appendChild(ui.btnRow([
        { label: '导出规则文件', onClick: () => this.exportRulesFile() },
        { label: '导入并合并', onClick: () => this.importRulesFile(false) },
        { label: '导入并替换', onClick: () => this.importRulesFile(true) },
      ]).row);
      // v4.5: 分发通道 —— 链接拉取合并 (内联输入行; 内容脚本环境的 prompt/confirm 对话框
      // 不可依赖, 且合并本身幂等去重, 直接执行) + 仅学习成果的可分享小包
      sec.appendChild(ui.infoLine('规则分发：填入 svi-rules 规则包链接拉取合并（重复条目自动去重，可重复导入）；学习成果包只含修正特征与命中数，可安全分享。').row);
      const packRow = document.createElement('div');
      // v4.6 R5: 手动导入通道明示 (需联网; 脚本自身绝不在启动/扫描路径自动联网)
      sec.appendChild(ui.infoLine('以下为手动导入通道：需联网拉取，仅在你点击按钮时执行；脚本不会在启动或扫描时自动联网。').row);
      packRow.className = 'svi-er-form';
      const packInput = document.createElement('input');
      packInput.type = 'text';
      packInput.className = 'svi-modal-text';
      packInput.placeholder = '规则包链接，如 https://example.com/svi-pack.import.json';
      const packBtn = document.createElement('button');
      packBtn.type = 'button';
      packBtn.className = 'svi-mini-btn';
      packBtn.textContent = '从链接导入';
      packBtn.addEventListener('click', () => {
        const url = packInput.value.trim();
        if (!url) { showToast('请先填入规则包链接'); return; }
        this.importRulesFromUrl(url);
      });
      packRow.appendChild(packInput);
      packRow.appendChild(packBtn);
      sec.appendChild(packRow);
      sec.appendChild(ui.btnRow([
        { label: '导出学习成果', onClick: () => this.exportLearnedPack() },
      ]).row);

      // —— 全量备份 ——
      sec.appendChild(ui.infoLine('全量备份：全部偏好与本地数据的完整存档。').row);
      sec.appendChild(ui.btnRow([
        { label: '导出备份', onClick: () => this.exportStorageJson() },
        { label: '导入备份', onClick: () => this.importStorageJson() },
        {
          label: '清空本地数据',
          danger: true,
          onClick: () => {
            if (confirm('确认清空全部本地数据吗？\n(学习规则、时间线记忆与偏好将重置, 早期版本遗留键保留)')) {
              Store.clearNamespace();
              ruleLearner.data = {};
              timelineLearner.data = {};
              this.refreshDataSection();
              showToast('本地数据已清空 (学习数据与时间线已重置)');
            }
          },
        },
      ]).row);

      // 键管理列表
      this.storageKeysBox = document.createElement('div');
      sec.appendChild(this.storageKeysBox);

      // —— 本地统计 (表格化网格) ——
      const statsSubTitle = document.createElement('div');
      statsSubTitle.className = 'svi-sub-title';
      statsSubTitle.textContent = '本地统计';
      sec.appendChild(statsSubTitle);
      this.statsGrid = document.createElement('div');
      this.statsGrid.className = 'svi-stats-grid';
      sec.appendChild(this.statsGrid);

      sec.appendChild(ui.btnRow([
        { label: '复制统计', onClick: () => this.copyStatsJson() },
        { label: '下载统计', onClick: () => this.downloadStatsJson() },
        {
          label: '清空统计',
          danger: true,
          onClick: () => {
            if (confirm('确认清空本地统计数据吗？(偏好设置不受影响)')) {
              StatsManager.clear();
              this.refreshDataSection();
              showToast('本地统计已清空');
            }
          },
        },
      ]).row);

      // file:// 访问提示 (一次性, 按需显示)
      this.fileHintLine = ui.infoLine('');
      sec.appendChild(this.fileHintLine.row);

      sec.appendChild(ui.infoLine('数据仅保存在浏览器本地并支持云同步通道，绝不自动上传；导出完全由你手动触发。').row);

      this.refreshDataSection();
      return sec;
    }

    refreshDataSection() {
      // 后端徽章 (v3.3: 后端名中文呈现)
      if (this.storageBadgeLine) {
        this.storageBadgeLine.textContent = '';
        const label = document.createElement('span');
        label.className = 'svi-modal-label';
        label.textContent = '存储位置';
        const badge = document.createElement('span');
        badge.className = 'svi-backend-badge';
        const names = {
          'chrome-sync': '浏览器云同步',
          'chrome-local': '浏览器本地',
          'gm': '油猴脚本存储',
          'local': '页面本地存储',
          'memory': '临时内存',
        };
        badge.textContent = names[Store.backend] || '浏览器本地';
        this.storageBadgeLine.append(label, badge);
      }
      // 键管理列表 (v3.3: 逻辑名中文呈现, 原键名进悬浮提示)
      if (this.storageKeysBox) {
        this.storageKeysBox.textContent = '';
        const entries = Store.describe();
        if (!entries.length) {
          const empty = document.createElement('div');
          empty.className = 'svi-hint-line';
          empty.textContent = '暂无本地数据';
          this.storageKeysBox.appendChild(empty);
        }
        const KEY_ZH = {
          'svi:prefs': '偏好设置',
          'svi:overrides': '手动覆盖记忆',
          'svi:learned': '学习规则',
          'svi:timeline': '时间线记忆',
          'svi:stats': '本地统计',
        };
        for (const item of entries) {
          const row = document.createElement('div');
          row.className = 'svi-store-key-row';
          const name = document.createElement('span');
          name.className = 'svi-store-key-name';
          name.textContent = KEY_ZH[item.key] || item.key;
          name.title = item.key;
          const size = document.createElement('span');
          size.className = 'svi-store-key-size';
          size.textContent = item.bytes + 'B';
          const del = document.createElement('button');
          del.className = 'svi-mini-btn danger';
          del.textContent = '删除';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            const logical = item.key.replace(/^svi:/, '');
            Store.remove(logical);
            Store.flush();
            this.refreshDataSection();
            showToast('已删除 ' + (KEY_ZH[item.key] || item.key));
          });
          row.append(name, size, del);
          this.storageKeysBox.appendChild(row);
        }
      }
      // 本地统计 (网格逐项渲染)
      if (this.statsGrid) {
        this.statsGrid.textContent = '';
        for (const entry of StatsManager.statEntries()) {
          const cell = document.createElement('div');
          cell.className = 'svi-stats-cell';
          const label = document.createElement('span');
          label.className = 'svi-stats-label';
          label.textContent = entry.label;
          const value = document.createElement('span');
          value.className = 'svi-stats-value';
          value.textContent = entry.value;
          cell.append(label, value);
          this.statsGrid.appendChild(cell);
        }
      }
      // file:// 提示
      if (this.fileHintLine) {
        let onFile = false;
        try { onFile = location.protocol === 'file:'; } catch (e) { /* ignore */ }
        if (onFile && runtime.fileAccessBlocked) {
          this.fileHintLine.setText('本地文件页面：浏览器需允许油猴访问文件网址，否则文件图片无法分析。');
        } else if (onFile) {
          this.fileHintLine.setText('当前为本地文件页面：已启用兼容模式分析本地图片。');
        } else {
          this.fileHintLine.setText('');
        }
      }
    }

    // ==========================================
    // v3.3 规则文件导出与导入 (文件友好: 站点名单 / 本站设置 / 元素规则 / 学习规则 / 屏蔽色)
    // ==========================================
    exportRulesFile() {
      try {
        const payload = {
          kind: 'svi-rules',
          schema: 1,
          version: SCRIPT_VERSION,
          exportedAt: new Date().toISOString(),
          rules: {
            siteMode: state.siteMode || 'all',
            siteBlacklist: (state.siteBlacklist || []).slice(),
            siteWhitelist: (state.siteWhitelist || []).slice(),
            siteOverrides: JSON.parse(JSON.stringify(state.siteOverrides || {})),
            elementRules: normalizeElementRules(state.elementRules),
            shieldColors: (state.shieldColors || []).slice(),
            bgExcludeSelectors: (state.bgExcludeSelectors || []).slice(),
            learned: JSON.parse(JSON.stringify(ruleLearner.data || {})),
          },
        };
        if (downloadJsonFile('svi-rules-' + new Date().toISOString().slice(0, 10) + '.json', payload)) {
          showToast('规则文件已开始下载');
        } else {
          showToast('导出失败');
        }
      } catch (e) {
        showToast('导出失败: ' + e.message);
      }
    }

    // v4.5: 从链接拉取 svi-rules 规则包并合并 (分发订阅通道; GM 通道绕开页面 CSP)。
    // 合并幂等去重 → 直接执行, 不经 confirm (内容脚本对话框不可依赖)。
    // 允许 https 或环回 http (本地 http-server 网关工作流)。
    async importRulesFromUrl(url) {
      const target = String(url || '').trim();
      const okUrl = /^(https:\/\/\S+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/\S+)/i.test(target);
      if (!okUrl) { showToast('请填入 https:// 规则包链接（本地调试允许 127.0.0.1/localhost）'); return; }
      showToast('正在拉取规则包…');
      try {
        const text = await gmFetchText(target);
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { showToast('导入失败: 不是有效 JSON'); return; }
        const rules = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? (parsed.rules || parsed) : null;
        if (!rules || typeof rules !== 'object' || Array.isArray(rules)) { showToast('导入失败: 不是有效的规则包'); return; }
        this.applyRulesPayload(rules, false);
        showToast('规则包已合并导入');
      } catch (e) {
        showToast('导入失败: ' + e.message);
      }
    }

    // v4.5: 仅导出学习成果 (Alt+点击修正积累) —— 隐私安全小包, 只含 host/特征/动作/命中数
    exportLearnedPack() {
      try {
        const learned = JSON.parse(JSON.stringify(ruleLearner.data || {}));
        if (!Object.keys(learned).length) { showToast('暂无学习成果 (Alt+点击修正积累后可导出)'); return; }
        const payload = {
          kind: 'svi-rules',
          schema: 1,
          version: SCRIPT_VERSION,
          exportedAt: new Date().toISOString(),
          rules: { learned },
        };
        if (downloadJsonFile('svi-learned-pack-' + new Date().toISOString().slice(0, 10) + '.json', payload)) {
          showToast('学习成果包已开始下载');
        } else {
          showToast('导出失败');
        }
      } catch (e) {
        showToast('导出失败: ' + e.message);
      }
    }

    importRulesFile(replace) {
      pickJsonFile((parsed) => {
        try {
          const rules = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? (parsed.rules || parsed) : null;
          if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
            showToast('导入失败: 不是有效的规则文件');
            return;
          }
          const msg = replace
            ? '确认用文件中的规则整体替换当前规则吗？\n(文件中包含的各类规则将被覆盖, 文件中未包含的保持不变)'
            : '确认将文件中的规则合并进当前规则吗？\n(重复条目自动去重, 站点设置以文件为准, 学习规则保留命中更高者)';
          if (!confirm(msg)) return;
          this.applyRulesPayload(rules, replace === true);
          showToast(replace ? '规则已替换导入' : '规则已合并导入');
        } catch (e) {
          showToast('导入失败: ' + e.message);
        }
      }, () => showToast('导入失败: 文件读取或解析错误'));
    }

    // 规则载荷应用 (replace=true: 逐组覆盖文件中包含的组; false: 合并去重)
    applyRulesPayload(rules, replace) {
      const has = (k) => rules[k] !== undefined;
      const strList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()) : null);
      const uniq = (list) => {
        const seen = new Set();
        const out = [];
        for (const item of list) {
          const k = JSON.stringify(item);
          if (!seen.has(k)) { seen.add(k); out.push(item); }
        }
        return out;
      };
      const sanitizeLearned = (src) => {
        const out = {};
        if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
        for (const host of Object.keys(src)) {
          const hd = src[host];
          const list = hd && Array.isArray(hd.rules) ? hd.rules : [];
          const clean = [];
          for (const r of list) {
            if (!r || typeof r.stem !== 'string' || !r.stem) continue;
            clean.push({
              stem: r.stem,
              action: r.action === 'protect' ? 'protect' : 'invert',
              hits: Math.max(0, Math.round(Number(r.hits) || 0)),
              lastAt: Number(r.lastAt) || 0,
            });
          }
          if (clean.length) out[host] = { rules: clean.slice(-100) };
        }
        return out;
      };
      const mergeLearned = (inc) => {
        for (const host of Object.keys(inc)) {
          const hd = ruleLearner._hostData(host);
          for (const r of inc[host].rules) {
            const found = hd.rules.find((x) => x.stem === r.stem);
            if (!found) {
              hd.rules.push({ stem: r.stem, action: r.action, hits: r.hits, lastAt: r.lastAt || Date.now() });
            } else if (r.hits > (found.hits || 0)) {
              found.action = r.action;
              found.hits = r.hits;
              found.lastAt = r.lastAt || found.lastAt;
            }
          }
          if (hd.rules.length > 100) {
            hd.rules.sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
            hd.rules = hd.rules.slice(-100);
          }
        }
        ruleLearner.persist();
      };

      if (replace) {
        if (has('siteMode') && ['all', 'blacklist', 'whitelist'].indexOf(rules.siteMode) !== -1) state.siteMode = rules.siteMode;
        const bl = strList(rules.siteBlacklist);
        if (bl) state.siteBlacklist = uniq(bl);
        const wl = strList(rules.siteWhitelist);
        if (wl) state.siteWhitelist = uniq(wl);
        if (has('siteOverrides') && rules.siteOverrides && typeof rules.siteOverrides === 'object' && !Array.isArray(rules.siteOverrides)) {
          state.siteOverrides = {};
          for (const p of Object.keys(rules.siteOverrides)) {
            const inc = rules.siteOverrides[p];
            if (inc && typeof inc === 'object' && !Array.isArray(inc)) state.siteOverrides[p] = Object.assign({}, inc);
          }
        }
        if (has('elementRules')) state.elementRules = normalizeElementRules(rules.elementRules);
        const sc = strList(rules.shieldColors);
        if (sc) state.shieldColors = uniq(sc.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)));
        const be = strList(rules.bgExcludeSelectors);
        if (be) state.bgExcludeSelectors = uniq(be);
        if (has('learned')) ruleLearner.data = sanitizeLearned(rules.learned);
      } else {
        state.siteBlacklist = uniq((state.siteBlacklist || []).concat(strList(rules.siteBlacklist) || []));
        state.siteWhitelist = uniq((state.siteWhitelist || []).concat(strList(rules.siteWhitelist) || []));
        if (rules.siteOverrides && typeof rules.siteOverrides === 'object' && !Array.isArray(rules.siteOverrides)) {
          for (const p of Object.keys(rules.siteOverrides)) {
            const inc = rules.siteOverrides[p];
            if (!inc || typeof inc !== 'object' || Array.isArray(inc)) continue;
            state.siteOverrides[p] = Object.assign({}, state.siteOverrides[p] || {}, inc);
          }
        }
        state.elementRules = normalizeElementRules((state.elementRules || []).concat(Array.isArray(rules.elementRules) ? rules.elementRules : []));
        state.shieldColors = uniq((state.shieldColors || []).concat((strList(rules.shieldColors) || []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))));
        state.bgExcludeSelectors = uniq((state.bgExcludeSelectors || []).concat(strList(rules.bgExcludeSelectors) || []));
        mergeLearned(sanitizeLearned(rules.learned));
      }

      savePrefs();
      // 全链生效: 决策缓存重扫 + 滤镜样式 + 背景替换重评 + 区块刷新
      window.__svi_image_engine?.clearCacheAndRescan();
      updateImageFilterCss();
      try {
        if (getSiteProfile().bgReplace === true) applyBackgroundReplace(true);
      } catch (e) { /* ignore */ }
      this.refreshSiteSection();
      this.refreshElementRules();
      this.refreshSmartSection();
      this.refreshDataSection();
      this.refreshShieldSection();
      this.syncVisuals();
    }

    exportStorageJson() {
      const payload = { schema: 1, exportedAt: new Date().toISOString(), version: SCRIPT_VERSION, store: Store.exportAll() };
      if (downloadJsonFile('svi-storage-' + new Date().toISOString().slice(0, 10) + '.json', payload)) {
        showToast('备份文件已开始下载');
      } else {
        showToast('导出失败');
      }
    }

    importStorageJson() {
      pickJsonFile((parsed) => {
        try {
          const payload = parsed && parsed.store ? parsed.store : parsed;
          const n = Store.importAll(payload);
          Store.flush();
          this.refreshDataSection();
          showToast('已导入 ' + n + ' 个数据项 (部分需刷新页面后生效)');
        } catch (e) {
          showToast('导入失败: 文件内容不是有效的备份数据');
        }
      }, () => showToast('导入失败: 文件读取或解析错误'));
    }

    // ==========================================
    // v2.0 模态区块: 🌐 站点与规则 (v3.3: 并入元素级规则与学习规则子块)
    // ==========================================
    buildSiteSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-site';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>🌐 本站能力</span><span id="svi-site-host" style="font-size:10px; color:#64748b;"></span>`;
      sec.appendChild(secTitle);

      const host = profileKey();
      const getOv = () => (state.siteOverrides[host] || (state.siteOverrides[host] = {}));
      this.siteRowSyncs = [];

      // v4.0: 能力卡片取代旧四个本站开关 —— 三态循环 (跟随全局→强制开→强制关), 点击热生效
      sec.appendChild(this.buildCapabilityCards());

      // 本站图片特效模式 (跟随全局或单独指定; 「跟随全局」删除覆盖键)
      const siteFxRow = ui.selectRow('本站图片特效', '仅作用于当前站点的图片特效模式',
        [{ v: '', label: '跟随全局', describe: '使用图片反色区块中设置的全局特效模式。' }].concat(
          IMG_FX_MODES.map((m) => ({ v: m.v, label: m.label, describe: m.describe + '仅本站生效。' }))
        ),
        () => (getOv().imgFxMode || ''),
        (v) => {
          if (v) {
            getOv().imgFxMode = v;
          } else {
            delete getOv().imgFxMode;
          }
          savePrefs();
          window.__svi_image_engine?.clearCacheAndRescan();
        });
      sec.appendChild(siteFxRow.row);
      this.siteRowSyncs.push(siteFxRow.sync);

      // —— 元素级规则 (v3.3: 站点黑白名单之外的精细控制) ——
      const erTitle = document.createElement('div');
      erTitle.className = 'svi-sub-title';
      erTitle.textContent = '元素级规则';
      sec.appendChild(erTitle);
      sec.appendChild(ui.infoLine('按元素特征强制反色或保持原色，优先于自动判断与学习规则。').row);

      this.elementRulesBox = document.createElement('div');
      sec.appendChild(this.elementRulesBox);

      const erForm = document.createElement('div');
      erForm.className = 'svi-er-form';
      const mkOpt = (v, label) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = label;
        return o;
      };
      const erScopeSel = document.createElement('select');
      erScopeSel.className = 'svi-modal-select';
      erScopeSel.appendChild(mkOpt('site', '本站'));
      erScopeSel.appendChild(mkOpt('all', '全部站点'));
      const erActionSel = document.createElement('select');
      erActionSel.className = 'svi-modal-select';
      erActionSel.appendChild(mkOpt('invert', '强制反色'));
      erActionSel.appendChild(mkOpt('protect', '保持原色'));
      erActionSel.appendChild(mkOpt('recolor', '局部改色'));
      const erInput = document.createElement('input');
      erInput.type = 'text';
      erInput.className = 'svi-modal-text';
      erInput.placeholder = '元素特征，如 .ad-banner';
      const erAdd = document.createElement('button');
      erAdd.className = 'svi-mini-btn';
      erAdd.textContent = '添加规则';
      erAdd.addEventListener('click', () => {
        const selector = erInput.value.trim();
        if (!selector) {
          showToast('请先填写元素特征');
          return;
        }
        const pattern = erScopeSel.value === 'all' ? '*' : host;
        const action = erActionSel.value === 'protect' ? 'protect' : (erActionSel.value === 'recolor' ? 'recolor' : 'invert');
        const list = Array.isArray(state.elementRules) ? state.elementRules : (state.elementRules = []);
        if (list.some((r) => r && r.pattern === pattern && r.selector === selector && r.action === action)) {
          showToast('该元素规则已存在');
          return;
        }
        list.push({ id: hash32(pattern + '|' + selector + '|' + action + '|' + Date.now()), pattern, selector, action, note: '', createdAt: Date.now() });
        if (list.length > 200) state.elementRules = list.slice(-200);
        savePrefs();
        erInput.value = '';
        this.refreshElementRules();
        window.__svi_image_engine?.clearCacheAndRescan();
        try {
          const bgEng = window.__svi && window.__svi.engines ? window.__svi.engines.bgImage : null;
          if (bgEng && typeof bgEng.sweep === 'function') bgEng.sweep();
        } catch (e) { /* ignore */ }
        showToast('元素规则已添加');
      });
      erForm.append(erScopeSel, erActionSel, erInput, erAdd);
      sec.appendChild(erForm);
      this.refreshElementRules();

      // —— 学习规则 (v3.3 由独立「智能」区块并入; v4.0 站点名单移入全局页签) ——
      const learnTitle = document.createElement('div');
      learnTitle.className = 'svi-sub-title';
      learnTitle.textContent = '学习规则';
      sec.appendChild(learnTitle);

      const seedRow = ui.toggleRow('内置种子规则', '内置站点规则库作为兜底层，学习规则优先于它',
        () => state.rulesEnabled !== false,
        (v) => {
          state.rulesEnabled = v;
          savePrefs();
        });
      sec.appendChild(seedRow.row);
      this.siteRowSyncs.push(seedRow.sync);

      const learnRow = ui.sliderRow('学习命中阈值', '同一特征手动修正达此次数后自动生效', () => state.learnHits, (n) => {
        state.learnHits = Math.round(n);
        savePrefs();
      }, 2, 6, 1, '次');
      sec.appendChild(learnRow.row);
      this.siteRowSyncs.push(learnRow.sync);

      sec.appendChild(ui.infoLine('本站已学习规则（Alt+点击修正积累）：').row);

      this.smartRulesBox = document.createElement('div');
      sec.appendChild(this.smartRulesBox);

      this.smartHint = ui.infoLine('');
      sec.appendChild(this.smartHint.row);
      this.refreshSmartSection();

      // 内置规则摘要
      this.ruleSummary = document.createElement('div');
      this.ruleSummary.className = 'svi-hint-line';
      sec.appendChild(this.ruleSummary);

      // 重扫本页背景按钮
      const rescanBtns = ui.btnRow([{
        label: '🔄 重扫本页背景',
        onClick: () => {
          const engine = window.__svi && window.__svi.engines ? window.__svi.engines.bgReplace : null;
          if (engine && engine.active) {
            engine.rescan();
            showToast('已重扫本页背景');
          } else {
            showToast('背景替换未开启');
          }
        },
      }]);
      sec.appendChild(rescanBtns.row);

      return sec;
    }

    // v3.3: 元素级规则列表刷新 (选择器来自存储层 → 一律 textContent, XSS 加固)
    refreshElementRules() {
      if (!this.elementRulesBox) return;
      this.elementRulesBox.textContent = '';
      const rules = Array.isArray(state.elementRules) ? state.elementRules : [];
      if (!rules.length) {
        const empty = document.createElement('div');
        empty.className = 'svi-hint-line';
        empty.textContent = '暂无元素规则 —— 添加后对匹配元素强制生效。';
        this.elementRulesBox.appendChild(empty);
        return;
      }
      rules.forEach((rule, idx) => {
        const row = document.createElement('div');
        row.className = 'svi-learned-row';
        const scope = document.createElement('span');
        scope.className = 'svi-learned-action';
        scope.textContent = rule.pattern === '*' ? '全部站点' : rule.pattern;
        const stem = document.createElement('span');
        stem.className = 'svi-learned-stem';
        stem.textContent = rule.selector; // 存储层字符串 → textContent (XSS 加固)
        stem.title = rule.selector;
        const action = document.createElement('span');
        action.className = 'svi-learned-action' + (rule.action === 'protect' ? ' protect' : (rule.action === 'recolor' ? ' recolor' : ''));
        action.textContent = rule.action === 'protect' ? '保护' : (rule.action === 'recolor' ? '改色' : '反色');
        const del = document.createElement('button');
        del.className = 'svi-mini-btn danger';
        del.textContent = '删除';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          state.elementRules.splice(idx, 1);
          savePrefs();
          this.refreshElementRules();
          window.__svi_image_engine?.clearCacheAndRescan();
          try {
            const bgEng = window.__svi && window.__svi.engines ? window.__svi.engines.bgImage : null;
            if (bgEng && typeof bgEng.sweep === 'function') bgEng.sweep();
          } catch (err) { /* ignore */ }
        });
        row.append(scope, stem, action, del);
        this.elementRulesBox.appendChild(row);
      });
    }

    refreshSiteSection() {
      const host = profileKey();
      const profile = getSiteProfile();
      const hostEl = document.getElementById('svi-site-host');
      if (hostEl) hostEl.textContent = '当前站点: ' + host;
      for (const s of this.siteRowSyncs || []) {
        try { s(); } catch (e) { /* ignore */ }
      }
      if (this.ruleSummary) {
        const r = profile.builtin;
        const ovNote = profile.overridePattern ? ' · 已应用本站自定义覆盖' : '';
        if (r) {
          this.ruleSummary.textContent = '';
          const b = document.createElement('b');
          b.textContent = r.name;
          this.ruleSummary.append(
            document.createTextNode('内置规则: '),
            b,
            document.createTextNode(` · 保护选择器 ${r.protect.length} · 强制反色 ${r.forceInvert.length} · 背景图选择器 ${r.bgImageSelectors.length}${ovNote}`)
          );
        } else {
          this.ruleSummary.textContent = `内置规则: 无 (通用智能检测)${ovNote}`;
        }
      }
    }

    // ==========================================
    // v2.0 模态区块: 🛡️ 原色屏蔽 (经 ui 组件库重建)
    // ==========================================
    buildShieldSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-shield';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>🛡️ 原色屏蔽</span>`;
      sec.appendChild(secTitle);

      const hint = ui.infoLine('加入屏蔽列表的原始颜色永不转换，背景替换与图片反色都会跳过，适合保护品牌色与警示色。');
      sec.appendChild(hint.row);

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
      this.shieldChipsBox.textContent = '';
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
    // v3.1 R3 模态区块: 🖥️ 当前页媒体 (列出/反色/定位被遮挡无法点击的媒体)
    // 列表按需采集 (点击按钮触发, 启动零开销); 行内数据一律 textContent (XSS 加固)
    // ==========================================
    buildMediaSection() {
      const sec = ui.section('🖼️ 当前页媒体', '排查被遮挡/无法 Alt+点击 的媒体', 'svi-sec-media');
      this.mediaShownCount = 200;

      sec.add(ui.btnRow([
        {
          label: '🔄 采集/刷新列表',
          onClick: () => {
            this.mediaShownCount = 200;
            this.refreshMediaSection();
            showToast('已采集当前页媒体');
          },
        },
      ]));

      this.mediaListBox = document.createElement('div');
      sec.el.appendChild(this.mediaListBox);

      this.mediaSummary = ui.infoLine('');
      sec.add(this.mediaSummary);

      // 首次构建只渲染空态 (惰性采集, 避免启动时全页样式扫描)
      const empty = document.createElement('div');
      empty.className = 'svi-hint-line';
      empty.textContent = '尚未采集 —— 点击上方按钮列出当前页全部媒体 (图片/画布/视频/背景图)。';
      this.mediaListBox.appendChild(empty);
      return sec.el;
    }

    // 媒体状态文本: 已反色 / 原样 / 跳过:原因 (决策快照驱动)
    mediaStateText(el) {
      try {
        if (el.getAttribute('data-svi-fx') && el.getAttribute('data-svi-fx-off') !== 'true') return '已反色 (特效)';
        if (el.getAttribute('data-svi-fx-off') === 'true') return '已还原 (杀停)';
        if (el.getAttribute('data-svi-inverted') === 'true') return '已反色';
        if (el.getAttribute('data-svi-bginv') === 'true') return '已反色';
        if (el.dataset && el.dataset.sviPoster === 'light' && !el.classList.contains('svi-playing')) return '已反色 (海报)';
        const src = getMediaSrc(el);
        const engine = window.__svi_image_engine;
        const d = (src && engine) ? engine.decisionBySrc.get(src) : null;
        if (d && d.verdict === 'skip') return '跳过:' + (SKIP_REASON_ZH[d.reason] || d.reason);
        if (d && d.verdict === 'keep' && d.reason === 'masked-dark') return '原样 (遮罩已暗)'; // v4.6: 遮罩上下文否决可审计
        if (d && d.verdict === 'keep') return '原样';
        if (el.hasAttribute && el.hasAttribute('data-svi-failed')) return '分析失败 (待重试)';
        return '未处理';
      } catch (e) {
        return '未知';
      }
    }

    // 采集当前页媒体 (预算 400): img/video/canvas/svg/image/input-image + 背景图元素 + Shadow DOM
    collectPageMedia(budget) {
      const cap = budget || 400;
      const seen = new Set();
      const out = [];
      const push = (el, type) => {
        try {
          if (!el || el.nodeType !== 1 || seen.has(el) || out.length >= cap) return;
          seen.add(el);
          out.push({ el, type });
        } catch (e) { /* ignore */ }
      };
      try {
        const root = document.body || document.documentElement;
        if (!root || !root.querySelectorAll) return out;
        root.querySelectorAll('img, video, canvas, svg, image, input[type="image" i]').forEach((el) => {
          push(el, String(el.tagName).toLowerCase());
        });
        root.querySelectorAll('[data-svi-bginv]').forEach((el) => push(el, 'bg'));
        // 背景图候选: 复用 BgImageEngine 的候选选择器 + 计算样式确认
        // (样式扫描有界: 最多检 1500 个候选, 对齐 BgImageEngine 的 sweep 预算)
        const bgEng = window.__svi && window.__svi.engines ? window.__svi.engines.bgImage : null;
        if (bgEng && typeof bgEng.candidateSelector === 'function') {
          try {
            const styleScanCap = 1500;
            let styleScanned = 0;
            root.querySelectorAll(bgEng.candidateSelector()).forEach((el) => {
              if (el.nodeType !== 1) return;
              if (styleScanned >= styleScanCap || out.length >= cap) return;
              styleScanned++;
              let bg = '';
              try { bg = window.getComputedStyle(el).backgroundImage || ''; } catch (e) { return; }
              if (bg && bg.indexOf('url(') !== -1) push(el, 'bg');
            });
          } catch (e) { /* ignore */ }
        }
        ShadowDomRegistry.forEachRoot((sr) => {
          try {
            sr.querySelectorAll('img, video, canvas, svg, image, input[type="image" i]').forEach((el) => {
              push(el, String(el.tagName).toLowerCase());
            });
          } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
      return out;
    }

    buildMediaRow(item) {
      const el = item.el;
      const row = document.createElement('div');
      row.className = 'svi-media-row';

      const type = document.createElement('span');
      type.className = 'svi-media-type';
      const TYPE_ZH = { img: '图片', video: '视频', canvas: '画布', svg: '矢量图', image: '矢量图', input: '输入图', bg: '背景图' };
      type.textContent = TYPE_ZH[item.type] || item.type;

      const size = mediaClientSize(el);
      let src = '';
      try { src = getMediaSrc(el) || ''; } catch (e) { src = ''; }
      if (!src && el.getAttribute) {
        try { src = (el.getAttribute('style') || '').slice(0, 60); } catch (e) { src = ''; }
      }
      src = String(src).replace(/^data:[^,]*/, 'data:…');
      if (src.length > 36) src = src.slice(0, 36) + '…';

      const meta = document.createElement('span');
      meta.className = 'svi-media-meta';
      meta.textContent = size[0] + '×' + size[1] + ' · ' + src; // URL/样式来自页面 → textContent (XSS 加固)

      const stateText = this.mediaStateText(el);
      const state = document.createElement('span');
      state.className = 'svi-media-state'
        + (stateText.indexOf('已反色') === 0 ? ' inverted' : '')
        + (stateText.indexOf('跳过') === 0 ? ' skipped' : '');
      state.textContent = stateText;

      const actions = document.createElement('span');
      actions.className = 'svi-media-actions';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'svi-mini-btn';
      toggleBtn.textContent = stateText.indexOf('已反色') === 0 ? '复原' : '反色';
      toggleBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const engine = window.__svi_image_engine;
        if (engine && engine.toggleMediaOverride(el)) {
          this.refreshMediaSection();
        } else {
          showToast('该媒体暂不支持切换 (可尝试 定位 后 Alt+点击)');
        }
      });
      const locateBtn = document.createElement('button');
      locateBtn.className = 'svi-mini-btn';
      locateBtn.textContent = '定位';
      locateBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.locateMedia(el);
      });
      actions.append(toggleBtn, locateBtn);

      row.append(type, meta, state, actions);
      row._sviTarget = el; // 调试/测试句柄 (JS 属性, 非 DOM 特性, 不入序列化)
      return row;
    }

    refreshMediaSection() {
      if (!this.mediaListBox) return;
      this.mediaListBox.textContent = '';
      const items = this.collectPageMedia(400);
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'svi-hint-line';
        empty.textContent = '本页未检测到媒体元素。';
        this.mediaListBox.appendChild(empty);
        if (this.mediaSummary) this.mediaSummary.setText('共 0 个媒体');
        return;
      }
      const shown = items.slice(0, Math.max(1, this.mediaShownCount || 200));
      for (const item of shown) {
        this.mediaListBox.appendChild(this.buildMediaRow(item));
      }
      if (items.length > shown.length) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'svi-mini-btn';
        moreBtn.textContent = '加载更多 (剩余 ' + (items.length - shown.length) + ' 个)';
        moreBtn.addEventListener('click', () => {
          this.mediaShownCount += 200;
          this.refreshMediaSection();
        });
        this.mediaListBox.appendChild(moreBtn);
      }
      if (this.mediaSummary) {
        this.mediaSummary.setText('共 ' + items.length + ' 个媒体' + (items.length > shown.length ? ' (已显示前 ' + shown.length + ' 个)' : '') + ' · 状态随决策实时变化');
      }
    }

    // 定位: scrollIntoView 居中 + 1.2s 描边闪烁 (仅 outline, 绝不改布局)
    locateMedia(el) {
      try {
        if (!el || el.nodeType !== 1) return;
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        el.classList.add('svi-locate-flash');
        setTimeout(() => {
          try { el.classList.remove('svi-locate-flash'); } catch (e) { /* ignore */ }
        }, 1200);
      } catch (e) { /* ignore */ }
    }

    async copyStatsJson() {
      const text = JSON.stringify(StatsManager.exportJson(), null, 2);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          showToast('统计已复制到剪贴板');
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
          showToast('统计已复制到剪贴板');
        } catch (e2) {
          showToast('复制失败, 请使用下载统计');
        }
      }
    }

    downloadStatsJson() {
      if (downloadJsonFile('svi-stats-' + new Date().toISOString().slice(0, 10) + '.json', StatsManager.exportJson())) {
        showToast('统计文件已开始下载');
      } else {
        showToast('下载失败');
      }
    }

    openSettingsModal() {
      this.modalMask.classList.add('show');
      this.panel.classList.remove('show');
      if (this.modalControls) this.modalControls.syncAll();
      this.refreshSiteSection();
      this.refreshElementRules();
      this.refreshShieldSection();
      this.refreshDataSection();
      this.refreshSmartSection();
      // 当前页媒体列表保持惰性 (设计: 点击「采集/刷新列表」按钮才全页扫描, 打开面板零开销)
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

    // ===== v4.0: 站点电源 / 页签 / 能力卡片 (全部热生效) =====
    setSitePower(v) {
      const host = profileKey();
      const ov = state.siteOverrides[host] || (state.siteOverrides[host] = {});
      ov.enabled = v;
      savePrefs();
      evaluateSitePower(); // 引擎层热切换 (含胶囊折叠/恢复与重启)
      this.refreshPowerUi();
      this.refreshCapCards();
      this.syncVisuals();
      showToast(v ? '本站反色已开启 (热生效)' : '本站反色已停用 (热生效)');
    }

    setSiteOffState(off) {
      this.siteOff = off;
      if (this.root) this.root.classList.toggle('svi-site-off', off);
    }

    refreshPowerUi() {
      let on = true;
      try { on = getSiteProfile().enabled !== false && scheduleActiveNow(); } catch (e) { /* ignore */ }
      if (this.powerSwitch) {
        this.powerSwitch.classList.toggle('on', on);
        this.powerSwitch.setAttribute('aria-checked', on ? 'true' : 'false');
      }
      if (this.powerStatus) {
        let text = on ? '反色运行中 · 关闭立即热生效' : '本站已停用 · 开启立即热生效';
        try {
          if (getSiteProfile().enabled !== false && !scheduleActiveNow()) {
            text = '定时模式: 当前时段已停用 · 可在全局页签调整';
          }
        } catch (e) { /* ignore */ }
        this.powerStatus.textContent = text;
      }
    }

    buildPowerBanner() {
      const banner = document.createElement('div');
      banner.className = 'svi4-power';
      const info = document.createElement('div');
      info.className = 'svi4-power-info';
      const hostEl = document.createElement('div');
      hostEl.className = 'svi4-host';
      let hostStr = '当前站点';
      try { hostStr = profileKey() || '本地文件'; } catch (e) { /* ignore */ }
      hostEl.textContent = hostStr;
      const statusEl = document.createElement('div');
      statusEl.className = 'svi4-power-status';
      this.powerStatus = statusEl;
      info.append(hostEl, statusEl);
      const sw = document.createElement('button');
      sw.className = 'svi4-switch';
      sw.setAttribute('role', 'switch');
      sw.title = '本站电源: 热生效';
      sw.addEventListener('click', () => {
        this.setSitePower(getSiteProfile().enabled === false);
      });
      this.powerSwitch = sw;
      banner.append(info, sw);
      this.refreshPowerUi();
      return banner;
    }

    switchTab(key) {
      this.activeTab = key === 'global' ? 'global' : 'site';
      if (this.sitePanelEl && this.globalPanelEl) {
        this.sitePanelEl.style.display = this.activeTab === 'site' ? '' : 'none';
        this.globalPanelEl.style.display = this.activeTab === 'global' ? '' : 'none';
      }
      for (const k of Object.keys(this.tabBtns)) {
        this.tabBtns[k].classList.toggle('active', k === this.activeTab);
      }
    }

    triStateOf(key) {
      let v;
      try { v = (state.siteOverrides[profileKey()] || {})[key]; } catch (e) { /* ignore */ }
      if (v === true) return 'on';
      if (v === false) return 'off';
      return 'inherit';
    }

    buildCapabilityCards() {
      const defs = [
        { key: 'imageInvert', icon: '🖼️', name: '图片反色' },
        { key: 'videoInvert', icon: '🎬', name: '视频反色' },
        { key: 'bgReplace', icon: '🌙', name: '背景替换' },
      ];
      const grid = document.createElement('div');
      grid.className = 'svi4-cards';
      this.capCards = {};
      for (const d of defs) {
        const card = document.createElement('button');
        card.className = 'svi4-card';
        card.title = '点击切换: 跟随全局 → 本站强制开 → 本站强制关 (热生效)';
        const icon = document.createElement('span');
        icon.className = 'svi4-card-icon';
        icon.textContent = d.icon;
        const name = document.createElement('span');
        name.className = 'svi4-card-name';
        name.textContent = d.name;
        const stateEl = document.createElement('span');
        stateEl.className = 'svi4-card-state';
        card.append(icon, name, stateEl);
        card.addEventListener('click', () => this.cycleTriState(d.key));
        this.capCards[d.key] = stateEl;
        grid.appendChild(card);
      }
      this.refreshCapCards();
      return grid;
    }

    cycleTriState(key) {
      const host = profileKey();
      const ov = state.siteOverrides[host] || (state.siteOverrides[host] = {});
      const cur = this.triStateOf(key);
      if (cur === 'inherit') ov[key] = true;
      else if (cur === 'on') ov[key] = false;
      else delete ov[key];
      if (!Object.keys(ov).length) delete state.siteOverrides[host];
      savePrefs();
      // 热应用对应引擎 (profile 已随 prefsRevision 重解析)
      try {
        if (key === 'imageInvert') {
          updateImageFilterCss();
          window.__svi_image_engine && window.__svi_image_engine.clearCacheAndRescan();
        } else if (key === 'bgReplace') {
          applyBackgroundReplace(getSiteProfile().bgReplace === true);
        } else if (key === 'videoInvert' && getSiteProfile().videoInvert === false && runtime.invertActive) {
          const hil = window.__svi && window.__svi.engines ? window.__svi.engines.hil : null;
          if (hil) {
            runtime.invertActive = false;
            try {
              const cv = hil.probe && hil.probe.currentVideo;
              if (cv && hil.timeline) hil.timeline.recordEnd(cv);
            } catch (e) { /* ignore */ }
            try {
              const cv2 = hil.probe && hil.probe.currentVideo;
              if (cv2) {
                cv2.style.removeProperty('filter');
                cv2.style.removeProperty('transition');
              }
            } catch (e) { /* ignore */ }
            this.syncVisuals();
          }
        }
      } catch (e) { /* ignore */ }
      this.refreshCapCards();
    }

    refreshCapCards() {
      for (const [key, stateEl] of Object.entries(this.capCards)) {
        const st = this.triStateOf(key);
        const card = stateEl.parentElement;
        card.classList.remove('st-on', 'st-off');
        let eff = false;
        try {
          const p = getSiteProfile();
          if (key === 'imageInvert') eff = p.imageInvert !== false;
          else if (key === 'videoInvert') eff = p.videoInvert !== false;
          else eff = p.bgReplace === true;
        } catch (e) { /* ignore */ }
        if (st === 'on') {
          card.classList.add('st-on');
          stateEl.textContent = '本站强制开';
        } else if (st === 'off') {
          card.classList.add('st-off');
          stateEl.textContent = '本站强制关';
        } else {
          stateEl.textContent = eff ? '跟随全局 · 开' : '跟随全局 · 关';
        }
      }
    }

    // v4.1: 全局页签的字体与可读性 (Dark Reader 吸收项; 全部热生效)
    buildReadabilitySection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-readability';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>🔤 字体与可读性</span>`;
      sec.appendChild(secTitle);

      const fontRow = ui.toggleRow('字体覆盖', '全站强制使用所选字体，代码块与图标不受影响',
        () => state.fontOverride === true,
        (v) => {
          state.fontOverride = v;
          savePrefs();
          updateFontCss();
        });
      sec.appendChild(fontRow.row);
      this.rowSyncs.push(fontRow.sync);

      const famRow = ui.selectRow('字体风格', '字体覆盖开启时使用的字体族',
        [
          { v: 'sans', label: '无衬线', describe: '系统默认无衬线，界面最清晰。' },
          { v: 'serif', label: '衬线', describe: '宋体质感，适合长文阅读。' },
          { v: 'mono', label: '等宽', describe: '等宽字体，代码风格。' },
          { v: 'rounded', label: '圆体', describe: '圆滑字形，柔和护眼。' },
        ],
        () => state.fontFamilyPreset || 'sans',
        (v) => {
          state.fontFamilyPreset = v;
          savePrefs();
          updateFontCss();
        });
      sec.appendChild(famRow.row);
      this.rowSyncs.push(famRow.sync);

      const strokeRow = ui.sliderRow('文字描边', '给正文文字加细描边提升对比，0 为关闭',
        () => state.textStroke,
        (n) => {
          state.textStroke = n;
          savePrefs();
          updateFontCss();
        }, 0, 1, 0.05, 'px');
      sec.appendChild(strokeRow.row);
      this.rowSyncs.push(strokeRow.sync);

      return sec;
    }

    // v4.2 P1/P2: 全局页签的动态主题调节 (桶配色生成参数; 变更立即重扫热生效)
    buildDynamicThemeSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-dynamic';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>🌙 动态主题调节</span>`;
      sec.appendChild(secTitle);

      sec.appendChild(ui.infoLine('作用于背景替换引擎的生成配色 (非滤镜路径)；仅当本站卡片开启「背景替换」时可见效果，变更立即重扫生效。').row);

      const fgRow = ui.toggleRow('防闪光黑底', '深色站点加载前先铺黑底消除白闪 (仅本站开启动态主题时生效)；关闭立即拆除，重新开启自下次页面加载生效',
        () => state.flashGuard !== false,
        (v) => {
          state.flashGuard = v;
          savePrefs();
          if (!v) {
            try { window.__svi && window.__svi.flashGuardOff && window.__svi.flashGuardOff(); } catch (e) { /* ignore */ }
          }
        });
      sec.appendChild(fgRow.row);
      this.rowSyncs.push(fgRow.sync);

      const rescanBgr = () => {
        try {
          const bgr = window.__svi && window.__svi.engines ? window.__svi.engines.bgReplace : null;
          if (bgr && typeof bgr.rescan === 'function') bgr.rescan();
        } catch (e) { /* ignore */ }
      };

      const toneRow = ui.selectRow('色调', '背景与边框的主题基调',
        [
          { v: 'pure-black', label: '纯黑', describe: '默认基调，纯黑背景，对比最强。' },
          { v: 'dark-gray', label: '深灰', describe: '纯黑抬升为深灰底，长时间阅读更柔和。' },
          { v: 'warm-black', label: '暖黑', describe: '低色温暖底，夜间护眼。' },
        ],
        () => state.bgTone || 'pure-black',
        (v) => {
          state.bgTone = v;
          savePrefs();
          rescanBgr();
        });
      sec.appendChild(toneRow.row);
      this.rowSyncs.push(toneRow.sync);

      const brightRow = ui.sliderRow('页面亮度', '动态主题生成配色的整体亮度倍率',
        () => state.bgBrightness,
        (n) => {
          state.bgBrightness = n;
          savePrefs();
          rescanBgr();
        }, 0.6, 1.4, 0.05, '倍');
      sec.appendChild(brightRow.row);
      this.rowSyncs.push(brightRow.sync);

      const contrastRow = ui.sliderRow('页面对比度', '动态主题生成配色的整体对比度倍率',
        () => state.bgContrast,
        (n) => {
          state.bgContrast = n;
          savePrefs();
          rescanBgr();
        }, 0.7, 1.5, 0.05, '倍');
      sec.appendChild(contrastRow.row);
      this.rowSyncs.push(contrastRow.sync);

      return sec;
    }

    // v4.2 P5: 全局页签的定时模式 (接入站点电源主闸, 跨零点热切换)
    buildSchedulerSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-scheduler';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>⏰ 定时模式</span>`;
      sec.appendChild(secTitle);

      const hours = [];
      for (let h = 0; h < 24; h++) hours.push({ v: String(h), label: h + ' 时', describe: '' });

      const schedRow = ui.toggleRow('定时启停', '仅在设定时段自动启用反色，时段外自动停用 (每分钟热切换)',
        () => state.scheduleEnabled === true,
        (v) => {
          state.scheduleEnabled = v;
          savePrefs();
          evaluateSitePower();
          this.refreshPowerUi();
        });
      sec.appendChild(schedRow.row);
      this.rowSyncs.push(schedRow.sync);

      const startRow = ui.selectRow('开始时刻', '进入启用时段的小时',
        hours, () => String(Math.round(Number(state.scheduleStart) || 0)),
        (v) => {
          state.scheduleStart = Math.round(Number(v)) || 0;
          savePrefs();
          evaluateSitePower();
          this.refreshPowerUi();
        });
      sec.appendChild(startRow.row);
      this.rowSyncs.push(startRow.sync);

      const endRow = ui.selectRow('结束时刻', '退出启用时段的小时 (可跨零点)',
        hours, () => String(Math.round(Number(state.scheduleEnd) || 0)),
        (v) => {
          state.scheduleEnd = Math.round(Number(v)) || 0;
          savePrefs();
          evaluateSitePower();
          this.refreshPowerUi();
        });
      sec.appendChild(endRow.row);
      this.rowSyncs.push(endRow.sync);

      return sec;
    }

    // v4.0: 全局页签的站点名单 (自旧站点区块迁入; 变更热生效)
    buildSiteListsSection() {
      const sec = document.createElement('div');
      sec.className = 'svi-modal-section';
      sec.id = 'svi-sec-lists';

      const secTitle = document.createElement('div');
      secTitle.className = 'svi-sec-title';
      secTitle.innerHTML = `<span>📜 站点名单</span>`;
      sec.appendChild(secTitle);

      const modeRow = ui.selectRow('站点管理模式', '控制脚本在哪些站点生效',
        [
          { v: 'all', label: '全部启用', describe: '所有站点默认启用。' },
          { v: 'blacklist', label: '黑名单', describe: '名单内站点停用，其余站点启用。' },
          { v: 'whitelist', label: '白名单', describe: '仅名单内站点启用，其余停用。' },
        ],
        () => state.siteMode || 'all',
        (v) => {
          state.siteMode = v;
          savePrefs();
          updateImageFilterCss();
          evaluateSitePower();
        });
      sec.appendChild(modeRow.row);
      this.modeSelect = modeRow.select;
      this.siteRowSyncs.push(modeRow.sync);

      const blackRow = ui.textRow(null, null, () => (state.siteBlacklist || []).join('\n'), 3, (val) => {
        const lines = val.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        state.siteBlacklist = lines;
        savePrefs();
        updateImageFilterCss();
        evaluateSitePower();
      }, '黑名单域名，每行一个，如 *.163.com');
      sec.appendChild(blackRow.row);
      this.blacklistTa = blackRow.ta;
      this.siteRowSyncs.push(blackRow.sync);

      const whiteRow = ui.textRow(null, null, () => (state.siteWhitelist || []).join('\n'), 3, (val) => {
        const lines = val.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        state.siteWhitelist = lines;
        savePrefs();
        updateImageFilterCss();
        evaluateSitePower();
      }, '白名单域名，每行一个');
      sec.appendChild(whiteRow.row);
      this.whitelistTa = whiteRow.ta;
      this.siteRowSyncs.push(whiteRow.sync);

      return sec;
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
  // 24. 启动引导 (共存握手 + 鲁棒启动 + 引擎错误隔离 + 调试句柄)
  // ==========================================

  // 共存握手 (R9-core): 存在新鲜异类认领 (插件/userscript) → 休眠启动, 杜绝双重滤镜
  if (!claimOwnership()) {
    window.__svi = {
      dormant: true,
      version: SCRIPT_VERSION,
    };
    console.info('[SmartInvert] 检测到另一实例 (userscript/插件) 已接管本页, 本实例休眠启动');
    return;
  }

  injectStyles();
  ShadowDomRegistry.install();

  // ===== v4.3 防闪光 (flash-black): 文档起步即黑, 仅限本站将走"动态深色主题"路径时 =====
  // 极简实现: 一个数据门 + 一条样式; bgReplace 激活即撤, load/5s 双兜底, 绝不黑屏卡死。
  // 浅色站点不触发 (否则黑→白反而是闪光); 图片反色路径页面本就保持原色, 无需介入。
  function setupFlashGuard() {
    try {
      if (state.flashGuard === false) return; // v4.3: 设置项可关
      const de = document.documentElement;
      if (!de || de.dataset.sviFlashguard) return;
      const prof = getSiteProfile();
      if (prof.enabled === false || prof.bgReplace !== true) return;
      de.dataset.sviFlashguard = '1';
      const st = document.createElement('style');
      st.id = 'svi-flashguard';
      st.textContent = 'html[data-svi-flashguard],html[data-svi-flashguard] body{background:#000!important}';
      (document.head || de).appendChild(st);
      let done = false;
      const t0 = Date.now();
      const iv = setInterval(() => {
        // v4.5: 零白交接 —— bgr-on 且 body 底色桶已就绪才撤黑 (2.5s 兜底防卡黑);
        // 过早撤黑会在延迟扫描打标前露出原始白底
        if (!de.hasAttribute('data-svi-bgr-on')) return;
        if ((document.body && document.body.hasAttribute('data-svi-bgr-bg')) || Date.now() - t0 > 2500) off();
      }, 100);
      const off = () => {
        if (done) return;
        done = true;
        clearInterval(iv);
        try { st.remove(); } catch (e) { /* ignore */ }
        delete de.dataset.sviFlashguard;
        // v4.5: 守卫若在扫描进行中撤除, html/body 可能已被黑底误采样 → 补打两个关键桶
        try {
          const bgr = window.__svi && window.__svi.engines ? window.__svi.engines.bgReplace : null;
          if (bgr && bgr.active && document.body) {
            bgr.processSubtree(document.documentElement, 8);
            bgr.applyCss();
          }
        } catch (e) { /* ignore */ }
      };
      // load 兜底: 本站不会走深色 (bgr-on 缺席) → 立即撤; 走深色 → 仍等底色桶就绪
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('load', () => {
          if (!de.hasAttribute('data-svi-bgr-on') || (document.body && document.body.hasAttribute('data-svi-bgr-bg')) || Date.now() - t0 > 2500) off();
        }, { once: true });
      }
      setTimeout(off, 5000);
    } catch (e) { /* ignore */ }
  }
  setupFlashGuard();

  // v4.3: 设置项即时拆除句柄 (关闭开关立即移除守卫样式; 重新开启自下次页面加载生效)。
  // 注意: 此处 __svi 字面量尚未创建, 先存句柄, 字面量之后再挂载。
  const sviFlashGuardOff = function () {
    try {
      const st = document.getElementById('svi-flashguard');
      if (st && st.parentNode) st.parentNode.removeChild(st);
      if (document.documentElement) delete document.documentElement.dataset.sviFlashguard;
    } catch (e) { /* ignore */ }
  };

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
  updateFontCss();
  StatsManager.load();

  // 调试与单测句柄 (始终暴露, 纯逻辑可直接在 Node 中通过环境桩单测)
  window.__svi = {
    version: SCRIPT_VERSION,
    runtime,
    // v4.6: prefs 改为动态 getter —— Store.onRemoteLoaded 重指派 state 后,
    // 调试/单测句柄始终引用活状态, 消除句柄脱钩
    get prefs() { return state; },
    get profile() { return getSiteProfile(); },
    resolveProfile: getSiteProfile,
    resolveSiteProfile,
    hostMatchesPattern,
    classifySmallElement,
    // v4.6 本地优先判定 (单测契约): 证据分档与临时结论判定
    localEvidence,
    isProvisionalDecision,
    mapLightToDark,
    mapDarkToLight,
    mapBorderToDark,
    isShieldedColor,
    parseColorString,
    relLuminance,
    rgbToHsl,
    hslToRgb,
    // v3.0 纯函数与存储导出 (单测契约)
    transformPixel,
    mergeSegments,
    lookupSegment,
    selectorStem,
    mediaDominantViewport,
    // v3.1 纯函数与引擎导出 (单测契约): 图片策略门 / 网格分组计数 / 统一决策管线引擎
    passesImagePolicy,
    countGridGroup,
    // v4.5 纯函数导出 (单测契约): 上下文命中忽略文档根
    closestContextHit,
    // v4.6 纯函数导出 (单测契约): 暗色遮罩上下文检测 (任务 v4.6-4)
    maskedDarkContext,
    ImageInvertEngine,
    // v3.2 纯函数导出 (单测契约): 视频画面调节滤镜链构建
    buildVideoTuneFilter,
    // v4.2 纯函数导出 (单测契约): 动态深色主题调节 / 定时档位判定
    applyDynamicThemeAdjust,
    scheduleActiveNow,
    // 调试句柄: 站点档案按 (host, 偏好版本) 缓存 —— 运行时注入/变更内置规则后需显式失效
    invalidateProfileCache: () => { try { profileCache.clear(); } catch (e) { /* ignore */ } },
    // v3.3 调试句柄: 偏好写入入口 (基准/调试注入规则后同步偏好版本号)
    savePrefs,
    Store,
    RuleLearner: ruleLearner,
    TimelineLearner: timelineLearner,
    ShadowDomRegistry,
    uiBuilders: ui,
    profileKey,
    hash32,
    getMediaSrc,
    evaluateImagePixels,
    BUILTIN_RULES,
    LOGIN_SELECTORS,
    manualOverrideKey,
    addManualOverride,
    // v4.6 收口导出 (单测契约): 状态写点唯一门 + 手动结论解析 + fx/canvas 引擎类
    applyInvertState,
    manualStateFor,
    ImageFxEngine,
    MediaCoverageEngine,
    // v3.3 纯函数导出 (单测契约): 元素级规则归一化 / 首条命中
    normalizeElementRules,
    firstMatchingElementRule,
    exportStats: () => StatsManager.exportJson(),
    stats: StatsManager,
    engines: {},
  };
  window.__svi.flashGuardOff = sviFlashGuardOff; // v4.3: 防闪光即时拆除句柄 (UI 开关用)

  // chrome.storage 后端 (插件形态): 异步装载远端命名空间后重载偏好
  try {
    Store.onRemoteLoaded = () => {
      try {
        state = loadState();
        // v4.6: prefs 已是 getter, 永远引用活 state, 不再需要显式回写
        updateImageFilterCss();
        applyVideoTune();
        updateFontCss();
      } catch (e) { /* ignore */ }
    };
    Store.init();
  } catch (e) { /* ignore */ }

  // v4.0: 站点电源架构 —— 开机禁用时引擎不启动, 胶囊以"停用态"出现, 电源可热启用
  const siteEnabledAtBoot = siteProfile.enabled !== false;
  runtime.siteActive = siteEnabledAtBoot;

  const uiController = new UIController();
  window.__svi.ui = uiController; // 调试句柄: UI 控制器实例

  // ===== v4.5: 工具栏弹出面板消息通道 (仅插件形态; 用户脚本环境无 chrome.runtime.onMessage) =====
  // 快照给弹窗渲染当前站状态; 命令复用设置面板同一批入口 (setSitePower / 行处理器), 语义零分歧。
  if (IS_TOP_FRAME && typeof chrome !== 'undefined' && chrome && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        try {
          if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('svi-') !== 0) return undefined;
          if (msg.type === 'svi-get-snapshot') {
            const profile = getSiteProfile();
            sendResponse({
              ok: true,
              dormant: !!window.__svi.dormant,
              version: SCRIPT_VERSION,
              host: profileKey(),
              siteActive: runtime.siteActive !== false && getSiteProfile().enabled !== false,
              imageOn: state.imageInvert !== false && getSiteProfile().imageInvert !== false,
              videoOn: getSiteProfile().videoInvert !== false,
              bgReplace: getSiteProfile().bgReplace === true,
              imagePolicy: state.imagePolicy || 'balanced',
              imgFxMode: state.imgFxMode || 'full',
              presetId: state.presetId || 'soft-gray',
              hoverRestore: state.hoverRestore !== false,
              counts: {
                img: document.images ? document.images.length : 0,
                inverted: document.querySelectorAll('[data-svi-inverted="true"]').length,
                fx: document.querySelectorAll('[data-svi-fx]').length,
                bginv: document.querySelectorAll('[data-svi-bginv="true"]').length,
                video: document.querySelectorAll('video').length,
              },
            });
          } else if (msg.type === 'svi-site-power') {
            uiController.setSitePower(msg.on !== false);
            sendResponse({ ok: true, siteActive: runtime.siteActive !== false });
          } else if (msg.type === 'svi-set-pref') {
            const key = String(msg.key || '');
            const v = msg.value;
            if (key === 'imagePolicy' && ['balanced', 'conservative', 'aggressive'].indexOf(v) !== -1) {
              state.imagePolicy = v;
              savePrefs();
              try { window.__svi_image_engine && window.__svi_image_engine.clearCacheAndRescan(); } catch (e) { /* ignore */ }
            } else if (key === 'imgFxMode' && ['full', 'luma', 'key', 'rect', 'grayscale', 'sepia', 'brightness', 'custom'].indexOf(v) !== -1) {
              state.imgFxMode = v;
              savePrefs();
              try { window.__svi_image_engine && window.__svi_image_engine.clearCacheAndRescan(); } catch (e) { /* ignore */ }
            } else if (key === 'presetId' && (v === 'soft-gray' || v === 'amoled')) {
              try {
                uiController.stateMachine && uiController.stateMachine.onUserSelectPreset(v);
              } catch (e) { state.presetId = v; savePrefs(); updateImageFilterCss(); }
            } else if (key === 'hoverRestore') {
              state.hoverRestore = v !== false;
              savePrefs();
              updateImageFilterCss();
            } else if (key === 'imageInvert') {
              state.imageInvert = v !== false;
              savePrefs();
              updateImageFilterCss();
              try { window.__svi_image_engine && window.__svi_image_engine.clearCacheAndRescan(); } catch (e) { /* ignore */ }
            } else {
              sendResponse({ ok: false, error: 'unknown key: ' + key });
              return undefined;
            }
            sendResponse({ ok: true });
          } else if (msg.type === 'svi-open-settings') {
            uiController.openSettingsModal();
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'unknown type' });
          }
        } catch (e) {
          try { sendResponse({ ok: false, error: String(e) }); } catch (e2) { /* ignore */ }
        }
        return undefined;
      });
    } catch (e) { /* ignore: 弹窗不可用时页面功能不受影响 */ }
  }

  // v4.0: 引擎启动块 (开机启用 → 立即执行; 开机禁用 → 电源热启用时首启; 幂等)
  function bootEngines() {
    if (window.__svi.enginesBooted) return;
    window.__svi.enginesBooted = true;
    whenBodyReady(() => {
    // 补丁安装前已存在的开放 Shadow Root: 有界一次性收集 (先于引擎首扫)
    try { ShadowDomRegistry.collectExisting(1000); } catch (e) { /* ignore */ }

    // 每个引擎独立错误隔离: 任何一个初始化失败绝不拖垮其它引擎
    let probeManager = null;
    let detector = null;
    let stateMachine = null;
    let videoFxEngine = null;
    let imageEngine = null;
    let imageFxEngine = null;
    let bgImageEngine = null;
    let bgrEngine = null;
    let mediaCoverage = null;

    try {
      probeManager = new VideoProbeManager();
      window.__svi.engines.video = probeManager;
      // v3.2: 引擎就绪后应用视频画面调节 (此时才有活动视频可重组内联链)
      applyVideoTune();
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
      videoFxEngine = new VideoFxEngine(probeManager);
      window.__svi.engines.videoFx = videoFxEngine;
    } catch (e) {
      console.warn('[SmartInvert] VideoFxEngine init failed:', e);
    }

    try {
      stateMachine = new HILStateMachine(probeManager, detector, uiController, videoFxEngine);
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
      imageFxEngine = new ImageFxEngine();
      window.__svi.engines.imageFx = imageFxEngine;
    } catch (e) {
      console.warn('[SmartInvert] ImageFxEngine init failed:', e);
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

    try {
      mediaCoverage = new MediaCoverageEngine();
      window.__svi.engines.mediaCoverage = mediaCoverage;
    } catch (e) {
      console.warn('[SmartInvert] MediaCoverageEngine init failed:', e);
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
  }

  if (siteEnabledAtBoot) {
    bootEngines();
  } else if (IS_TOP_FRAME) {
    // 开机即禁用: 引擎不启动, 胶囊折叠为电源态, 可随时热启用
    window.__svi.disabled = true;
    console.info('[SmartInvert] 本站点已被用户设置禁用 (胶囊为电源态, 可热启用)');
    whenBodyReady(() => {
      try { uiController.buildUI(); } catch (e) { /* ignore */ }
      try { uiController.setSiteOffState(true); } catch (e) { /* ignore */ }
    });
  }

  // 统计: 每 30s 落盘一次 + 页面隐藏时落盘 + 导出前强制落盘
  setInterval(() => {
    try { StatsManager.flush(); } catch (e) { /* ignore */ }
  }, 30000);

  // v4.2 P5: 定时模式跨档热切换 (60s 轮询; evaluateSitePower 幂等, 状态不变时零动作)
  setInterval(() => {
    try { evaluateSitePower(); } catch (e) { /* ignore */ }
    try { window.__svi.ui && window.__svi.ui.refreshPowerUi(); } catch (e) { /* ignore */ }
  }, 60000);

  // 全量落盘 (统计 + 偏好 + Store 命名空间)
  function flushEverything() {
    try { StatsManager.flush(); } catch (e) { /* ignore */ }
    try { flushPrefsNow(); } catch (e) { /* ignore */ }
    try { Store.flush(); } catch (e) { /* ignore */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushEverything();
    }
  });

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => {
      flushEverything();
    });
  }

})();
