// ==UserScript==
// @name         全网通用智能视频与图片反色 (Universal Smart Video & Image Invert)
// @name:zh-CN   全网通用智能视频与图片反色
// @name:en      Universal Smart Video & Image Invert
// @namespace    https://github.com/jiozhaoyue/universal-smart-invert
// @version      1.3.1
// @description  全网通用智能HTML5视频与图片反色脚本。内置专属参数精细设置页（支持滑动条拖动与精确数值输入双向细调）；秒级/直接无渐变切换（全部可设置），极致性能优化识别在5ms内无感执行；精准识别主视频与小窗，不污染控制栏、弹幕与字幕；独创无对抗人机协同状态机；白底技术图自适应反色与悬停显原图；极简胶囊与快捷键。
// @description:zh-CN 全网通用智能HTML5视频与图片反色脚本。内置专属参数精细设置页（支持滑动条拖动与精确数值输入双向细调）；秒级/直接无渐变切换（全部可设置），极致性能优化识别在5ms内无感执行；精准识别主视频与小窗，不污染控制栏、弹幕与字幕；独创无对抗人机协同状态机；白底技术图自适应反色与悬停显原图；极简胶囊与快捷键。
// @description:en Universal HTML5 smart video and image invert userscript. Features dedicated fine-tuning settings modal with draggable sliders and numeric inputs; instant direct switch without transition; sub-5ms imperceptible recognition; accurately targets video & PiP without polluting controls/danmaku/subtitles; non-conflicting HIL state machine; auto-inverts web diagrams with hover-to-restore; minimalist capsule & shortcuts.
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
  const STORAGE_KEY = 'universal_smart_invert_v3';

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

  const DEFAULT_STATE = {
    enabled: true,           // 脚本总使能
    autoDetect: true,        // 视频智能自动反色检测
    invertActive: false,     // 视频当前是否生效反色
    imageInvert: true,       // 网页白底图片智能反色 (Phase 2)
    presetId: 'soft-gray',   // 当前预设 ('soft-gray' | 'amoled' | 'custom')

    // 滤镜微调参数 (双向滑动条 + 数值填空)
    brightness: 0.92,        // 亮度 (0.50 ~ 1.50)
    contrast: 0.90,          // 对比度 (0.50 ~ 1.50)
    saturate: 1.00,          // 饱和度 (0.00 ~ 2.00)
    hueRotate: 180,          // 色相旋转 (0 ~ 360°)

    // 切换速度与过渡动画
    transitionMs: 0,         // 过渡时间毫秒数: 0 为直接切换/无渐变 (默认), 0 ~ 1000ms

    // 智能检测参数
    sampleIntervalMs: 250,   // 采样周期: 50 ~ 2000ms
    whiteThreshold: 60,      // 白底面积占比阈值: 30% ~ 95%
    lumThreshold: 210,       // 感知明度线: 160 ~ 250
    exitHysteresisMs: 1500,  // 退出迟滞时间: 200 ~ 5000ms

    // 图片反色参数
    minImgSize: 100,         // 正文图片最小检测尺寸: 40 ~ 400px

    settingsOpen: false,     // 快捷设置折叠
    pos: { x: null, y: null, edge: 'right' }, // 悬浮胶囊位置
  };

  // ==========================================
  // 2. 状态持久化管理
  // ==========================================
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (e) {
      console.warn('[SmartInvert] Failed to load state:', e);
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[SmartInvert] Failed to save state:', e);
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
    if (document.documentElement) {
      document.documentElement.style.setProperty('--svi-img-filter', f);
      document.documentElement.style.setProperty('--svi-img-transition', t);
      document.documentElement.classList.toggle('svi-img-invert-on', !!state.imageInvert);
    }
    if (document.body) {
      document.body.classList.toggle('svi-img-invert-on', !!state.imageInvert);
    }
  }

  // ==========================================
  // 3. 样式注入 (极简胶囊、控制卡片、高级设置弹窗)
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
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const el = document.createElement('style');
      el.textContent = css;
      document.head.appendChild(el);
    }
  }

  // ==========================================
  // 4. 主视频探针 (VideoProbeManager)
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
        if (this.currentVideo && state.invertActive) {
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
      if (state.invertActive) {
        this.currentVideo.style.setProperty('filter', filterString, 'important');
      } else {
        this.currentVideo.style.removeProperty('filter');
      }
    }
  }

  // ==========================================
  // 5. 离屏极速采样检测器 (LuminanceDetector - < 5ms 无感优化)
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
  // 6. 无对抗人机协同状态机 (HILStateMachine)
  // ==========================================
  class HILStateMachine {
    constructor(probe, detector, ui) {
      this.probe = probe;
      this.detector = detector;
      this.ui = ui;

      this.currentDetectedScene = 'normal';
      this.userRejectedScene = null;
      this.normalSceneCount = 0;
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
      const video = this.probe.updateActiveVideo();
      if (!video) return;

      if (!state.autoDetect || this.detector.isCorsRestricted) {
        this.ui.updateStatusBadge();
        return;
      }

      const result = this.detector.detect(video);
      if (!result) {
        this.ui.updateStatusBadge();
        return;
      }

      const newScene = result.scene;

      if (newScene !== this.currentDetectedScene) {
        this.currentDetectedScene = newScene;
        if (this.userRejectedScene && this.userRejectedScene !== newScene) {
          this.userRejectedScene = null;
        }
      }

      if (newScene === 'white_slide') {
        this.normalSceneCount = 0;
        if (this.userRejectedScene === 'white_slide') {
          this.ui.updateStatusBadge();
          return;
        }
        if (!state.invertActive) {
          state.invertActive = true;
          this.probe.applyFilterToCurrent();
          this.ui.syncVisuals();
          saveState();
        }
      } else {
        this.normalSceneCount++;
        if (this.userRejectedScene === 'normal') {
          this.ui.updateStatusBadge();
          return;
        }
        const hysteresisMs = state.exitHysteresisMs || 1500;
        const exitTicks = Math.max(2, Math.round(hysteresisMs / (state.sampleIntervalMs || 250)));
        if (state.invertActive && this.normalSceneCount >= exitTicks) {
          state.invertActive = false;
          this.probe.applyFilterToCurrent();
          this.ui.syncVisuals();
          saveState();
        }
      }

      this.ui.updateStatusBadge();
    }

    onUserToggleInvert() {
      state.invertActive = !state.invertActive;
      this.userRejectedScene = this.currentDetectedScene;
      this.probe.applyFilterToCurrent();
      this.ui.syncVisuals();
      saveState();
    }

    onUserToggleAuto() {
      state.autoDetect = !state.autoDetect;
      this.userRejectedScene = null;
      this.normalSceneCount = 0;
      this.ui.syncVisuals();
      saveState();
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
      if (state.invertActive) {
        this.probe.applyFilterToCurrent();
      }
      this.ui.syncVisuals();
      if (this.ui.modalControls) this.ui.modalControls.syncAll();
      saveState();
    }

    onCustomParamChange() {
      state.presetId = 'custom';
      updateImageFilterCss();
      if (state.invertActive) {
        this.probe.applyFilterToCurrent();
      }
      this.ui.syncVisuals();
      saveState();
    }

    onUpdateTransition(ms) {
      state.transitionMs = ms;
      updateImageFilterCss();
      this.probe.applyFilterToCurrent();
      saveState();
    }

    onUpdateInterval(ms) {
      state.sampleIntervalMs = ms;
      this.startLoop();
      saveState();
    }

    resetDefaults() {
      Object.assign(state, DEFAULT_STATE);
      saveState();
      updateImageFilterCss();
      this.onUpdateInterval(state.sampleIntervalMs);
      this.probe.applyFilterToCurrent();
      this.ui.syncVisuals();
      if (this.ui.modalControls) this.ui.modalControls.syncAll();
    }
  }

  // ==========================================
  // 7. 网页图片与矢量图智能反色引擎 (ImageInvertEngine)
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

  function evaluateCanvas(ctx, width = 16, height = 16, lumCutoff = 210, thresholdRatio = 0.6) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    let whitePixelCount = 0;
    let opaquePixels = 0;
    let totalSaturation = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 64) continue; // 忽略透明背景像素
      opaquePixels++;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      if (lum >= lumCutoff) {
        whitePixelCount++;
      }

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      totalSaturation += max === 0 ? 0 : (max - min) / max;
    }

    if (opaquePixels < 16) return false;

    const whiteRatio = whitePixelCount / opaquePixels;
    const avgSaturation = totalSaturation / opaquePixels;

    return whiteRatio >= thresholdRatio && avgSaturation <= 0.25;
  }

  class ImageInvertEngine {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 16;
      this.canvas.height = 16;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.observer = null;
      this.cache = new Map();
      this.maxCacheSize = 500;
      this.init();
      this.bindManualToggle();
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
        for (const m of mutations) {
          if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                const tag = node.tagName ? node.tagName.toLowerCase() : '';
                if (tag === 'img' || tag === 'svg') {
                  this.observe(node);
                } else if (node.querySelectorAll) {
                  node.querySelectorAll('img, svg').forEach((el) => this.observe(el));
                }
              }
            }
          } else if (m.type === 'attributes') {
            const node = m.target;
            if (node && node.tagName === 'IMG') {
              const currentSrc = node.currentSrc || node.src;
              if (currentSrc && node.getAttribute('data-svi-checked-src') !== currentSrc) {
                this.observe(node);
              }
            }
          }
        }
      });

      mo.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'data-src', 'data-original']
      });
    }

    scanAll() {
      const root = document.body || document.documentElement;
      if (!root) return;
      root.querySelectorAll('img, svg').forEach((el) => this.observe(el));
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
              this.showToast('已恢复原色 (Alt+点击)');
            } else {
              target.setAttribute('data-svi-inverted', 'true');
              this.showToast('已手动反色 (Alt+点击)');
            }
          }
        }
      }, true);
    }

    showToast(msg) {
      let toast = document.getElementById('svi-toast');
      if (!toast) {
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
      }
      toast.textContent = msg;
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
      }, 1600);
    }

    processSvg(svg) {
      if (svg.hasAttribute('data-svi-checked')) return;
      svg.setAttribute('data-svi-checked', 'true');

      const w = svg.clientWidth || svg.width?.baseVal?.value || 0;
      const h = svg.clientHeight || svg.height?.baseVal?.value || 0;
      if (w < 40 || h < 40) return;

      const meta = ((svg.className?.baseVal || '') + ' ' + (svg.id || '')).toLowerCase();
      if (/(avatar|logo|emoji|icon|badge|btn|button|spin)/.test(meta)) return;

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

      const meta = ((img.className || '') + ' ' + (img.id || '') + ' ' + (img.alt || '') + ' ' + src).toLowerCase();
      if (/(avatar|logo|emoji|icon|badge|nav|header|thumb|btn|button|user-pic|face|qrcode|captcha)/.test(meta)) {
        img.setAttribute('data-svi-checked-src', src);
        return;
      }

      const runCheck = async () => {
        const minSize = state.minImgSize || 100;
        const w = img.naturalWidth || img.clientWidth || img.width || 0;
        const h = img.naturalHeight || img.clientHeight || img.height || 0;

        if (w < 32 || h < 32 || (w < minSize && h < minSize)) {
          return;
        }

        img.setAttribute('data-svi-checked-src', src);

        if (this.cache.has(src)) {
          if (this.cache.get(src)) {
            img.setAttribute('data-svi-inverted', 'true');
          } else {
            img.removeAttribute('data-svi-inverted');
          }
          return;
        }

        const lumCutoff = state.lumThreshold || 210;
        const thresholdRatio = (state.whiteThreshold || 60) / 100;

        let analyzed = false;
        let isWhite = false;

        // 1. 尝试本地 Canvas 快速采样
        try {
          this.ctx.clearRect(0, 0, 16, 16);
          this.ctx.drawImage(img, 0, 0, 16, 16);
          isWhite = evaluateCanvas(this.ctx, 16, 16, lumCutoff, thresholdRatio);
          analyzed = true;
        } catch (e) {
          // 产生跨域污染 (SecurityError / Tainted canvas)
          analyzed = false;
        }

        // 2. 若跨域污染，启用 GM_xmlhttpRequest 提取 Blob 绕过同源限制
        if (!analyzed) {
          try {
            const blob = await gmFetchBlob(src);
            if (typeof createImageBitmap === 'function') {
              const bitmap = await createImageBitmap(blob);
              this.ctx.clearRect(0, 0, 16, 16);
              this.ctx.drawImage(bitmap, 0, 0, 16, 16);
              bitmap.close();
              isWhite = evaluateCanvas(this.ctx, 16, 16, lumCutoff, thresholdRatio);
              analyzed = true;
            } else {
              const objUrl = URL.createObjectURL(blob);
              await new Promise((resolve, reject) => {
                const tempImg = new Image();
                tempImg.onload = () => {
                  try {
                    this.ctx.clearRect(0, 0, 16, 16);
                    this.ctx.drawImage(tempImg, 0, 0, 16, 16);
                    isWhite = evaluateCanvas(this.ctx, 16, 16, lumCutoff, thresholdRatio);
                    analyzed = true;
                    resolve();
                  } catch (err) {
                    reject(err);
                  } finally {
                    URL.revokeObjectURL(objUrl);
                  }
                };
                tempImg.onerror = () => {
                  URL.revokeObjectURL(objUrl);
                  reject(new Error('Temp img load error'));
                };
                tempImg.src = objUrl;
              });
            }
          } catch (e) {
            // 网络或格式异常，跳过
          }
        }

        if (analyzed) {
          if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
          }
          this.cache.set(src, isWhite);

          if (isWhite) {
            img.setAttribute('data-svi-inverted', 'true');
          } else {
            img.removeAttribute('data-svi-inverted');
          }
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
  // 8. 极简悬浮胶囊 UI 控制器与高级设置页
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
      this.presetBtns = {};
      this.modalMask = null;
      this.modalPerf = null;
      this.modalControls = null;
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

      // 行1: 核心按钮 (视频反色、智能检测、图片反色)
      const btnRow = document.createElement('div');
      btnRow.className = 'svi-btn-row';

      this.invertBtn = document.createElement('button');
      this.invertBtn.className = 'svi-action-btn';
      this.invertBtn.textContent = '视频反色';
      this.invertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stateMachine.onUserToggleInvert();
      });

      this.autoBtn = document.createElement('button');
      this.autoBtn.className = 'svi-action-btn';
      this.autoBtn.textContent = '智能检测';
      this.autoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stateMachine.onUserToggleAuto();
      });

      this.imgBtn = document.createElement('button');
      this.imgBtn.className = 'svi-action-btn';
      this.imgBtn.textContent = '图片反色';
      this.imgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.imageInvert = !state.imageInvert;
        updateImageFilterCss();
        this.syncVisuals();
        saveState();
      });

      btnRow.append(this.invertBtn, this.autoBtn, this.imgBtn);

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

      // 分区 1: 画面色彩与滤镜微调
      const sec1 = document.createElement('div');
      sec1.className = 'svi-modal-section';
      sec1.innerHTML = `<div class="svi-sec-title"><span>🎨 画面滤镜与调色微调</span><span>实时生效</span></div>`;

      sec1.appendChild(makeRow('画面亮度', '反色后的暗化微调', 'brightness', 0.50, 1.50, 0.01, '', () => {
        this.stateMachine.onCustomParamChange();
      }));
      sec1.appendChild(makeRow('画面对比度', '文字线条锐利度', 'contrast', 0.50, 1.50, 0.01, '', () => {
        this.stateMachine.onCustomParamChange();
      }));
      sec1.appendChild(makeRow('色彩饱和度', '消除或保留颜色', 'saturate', 0.00, 2.00, 0.01, '', () => {
        this.stateMachine.onCustomParamChange();
      }));
      sec1.appendChild(makeRow('色相旋转', '校正颜色谱系', 'hueRotate', 0, 360, 1, '°', () => {
        this.stateMachine.onCustomParamChange();
      }));

      // 分区 2: 切换速度与动画时长 (可设置无渐变)
      const sec2 = document.createElement('div');
      sec2.className = 'svi-modal-section';
      sec2.innerHTML = `<div class="svi-sec-title"><span>⚡ 切换速度与过渡渐变</span><span>0ms 为直接切换</span></div>`;

      sec2.appendChild(makeRow('过渡动画时长', '设为 0ms 即直接瞬切无渐变', 'transitionMs', 0, 1000, 10, 'ms', (v) => {
        this.stateMachine.onUpdateTransition(v);
      }));

      // 分区 3: 智能白底算法参数
      const sec3 = document.createElement('div');
      sec3.className = 'svi-modal-section';
      sec3.innerHTML = `<div class="svi-sec-title"><span>🧠 智能白底算法与防抖</span><span>无感毫秒采样</span></div>`;

      sec3.appendChild(makeRow('检测采样周期', '后台探测频次', 'sampleIntervalMs', 50, 2000, 25, 'ms', (v) => {
        this.stateMachine.onUpdateInterval(v);
      }));
      sec3.appendChild(makeRow('白底面积占比', '触发反色的白底面积阈值', 'whiteThreshold', 30, 95, 1, '%', () => {
        saveState();
      }));
      sec3.appendChild(makeRow('明度判定线', '判定为白底的亮度下限', 'lumThreshold', 160, 250, 1, '', () => {
        saveState();
      }));
      sec3.appendChild(makeRow('退出防抖延迟', '离开课件时的缓冲确认时长', 'exitHysteresisMs', 200, 5000, 100, 'ms', () => {
        saveState();
      }));

      // 分区 4: 网页图片与矢量图反色规则
      const sec4 = document.createElement('div');
      sec4.className = 'svi-modal-section';
      sec4.innerHTML = `<div class="svi-sec-title"><span>🖼️ 网页白底图片与矢量图反色</span><span>自动排除小图标与头像</span></div>`;

      sec4.appendChild(makeRow('正文图最小尺寸', '小于此长宽的图标不反色', 'minImgSize', 40, 400, 10, 'px', () => {
        saveState();
      }));

      const hintBox = document.createElement('div');
      hintBox.style.cssText = 'font-size: 11px; color: #94a3b8; line-height: 1.6; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px dashed rgba(255,255,255,0.08);';
      hintBox.innerHTML = `💡 <b>操作技巧</b>：<br>• <b>Alt + 鼠标左键</b>：在网页任意图片或 SVG 上点击，可单独强制反色或复原。<br>• <b>鼠标悬停</b>：鼠标移至已反色的图片上方时自动显现原始原色，移出后恢复。`;
      sec4.appendChild(hintBox);

      body.append(sec1, sec2, sec3, sec4);

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

    openSettingsModal() {
      this.modalMask.classList.add('show');
      this.panel.classList.remove('show');
      if (this.modalControls) this.modalControls.syncAll();
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
      if (!this.statusBadge) return;
      const sm = this.stateMachine;
      const isCors = sm.detector.isCorsRestricted;

      this.dot.className = 'svi-status-dot';
      this.statusBadge.className = 'svi-card-status-badge';

      if (isCors) {
        this.dot.classList.add('cors-warn');
        this.statusBadge.classList.add('yellow');
        this.statusBadge.textContent = '跨域视频手动';
      } else if (state.autoDetect) {
        if (state.invertActive) {
          this.dot.classList.add('active-auto');
          this.statusBadge.classList.add('green');
          this.statusBadge.textContent = sm.userRejectedScene ? '手动反色中' : '智能白底反色中';
        } else {
          this.statusBadge.textContent = sm.userRejectedScene ? '人工保持原样' : '正常画面感知中';
        }
      } else {
        if (state.invertActive) {
          this.dot.classList.add('active-manual');
          this.statusBadge.classList.add('blue');
          this.statusBadge.textContent = '手动反色开启';
        } else {
          this.statusBadge.textContent = '反色已关闭';
        }
      }

      if (this.modalPerf && sm.detector.lastDurationMs > 0) {
        this.modalPerf.textContent = `⚡ 探测单次耗时: ~${sm.detector.lastDurationMs.toFixed(3)}ms (极致无感)`;
      }
    }

    syncVisuals() {
      this.invertBtn.textContent = state.invertActive ? '视频: 开' : '视频: 关';
      this.invertBtn.classList.toggle('active', state.invertActive);

      this.autoBtn.textContent = state.autoDetect ? '智能: 开' : '智能: 关';
      this.autoBtn.classList.toggle('active', state.autoDetect);

      this.imgBtn.textContent = state.imageInvert ? '图片: 开' : '图片: 关';
      this.imgBtn.classList.toggle('active', state.imageInvert);

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
          saveState();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  }

  // ==========================================
  // 9. 启动引导
  // ==========================================
  injectStyles();
  updateImageFilterCss();

  const probeManager = new VideoProbeManager();
  const luminanceDetector = new LuminanceDetector();
  const uiController = new UIController();
  const stateMachine = new HILStateMachine(probeManager, luminanceDetector, uiController);
  const imageEngine = new ImageInvertEngine();

  uiController.bindStateMachine(stateMachine);

})();
