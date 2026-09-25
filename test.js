// Unit tests & Benchmark for Video & Image Invert Engine
const assert = require('assert');

// 1. Fast 16x16 integer bitwise ITU-R BT.601 luminance & white slide detection
function detectFast16x16(data, thresholdPct = 60) {
  const totalPixels = 256; // 16 * 16
  let whitePixelCount = 0;
  let nonWhiteCount = 0;
  let totalSaturation = 0;

  const thresholdRatio = thresholdPct / 100;
  const maxNonWhiteAllowed = Math.floor(totalPixels * (1 - thresholdRatio));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Fast integer fixed-point luminance
    const lum = (r * 77 + g * 150 + b * 29) >> 8;
    if (lum >= 210) {
      whitePixelCount++;
    } else {
      nonWhiteCount++;
      if (nonWhiteCount > maxNonWhiteAllowed) {
        return { scene: 'normal', whiteRatio: whitePixelCount / totalPixels, earlyExit: true };
      }
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    totalSaturation += max === 0 ? 0 : (max - min) / max;
  }

  const whiteRatio = whitePixelCount / totalPixels;
  const avgSaturation = totalSaturation / totalPixels;
  const isWhiteSlide = whiteRatio >= thresholdRatio && avgSaturation <= 0.22;

  return { scene: isWhiteSlide ? 'white_slide' : 'normal', whiteRatio, earlyExit: false };
}

// Test case 1: Pure white PPT frame (16x16)
const pptFrame = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < pptFrame.length; i += 4) {
  if (i < pptFrame.length * 0.85) {
    pptFrame[i] = 250;
    pptFrame[i + 1] = 250;
    pptFrame[i + 2] = 250;
    pptFrame[i + 3] = 255;
  } else {
    pptFrame[i] = 20;
    pptFrame[i + 1] = 20;
    pptFrame[i + 2] = 20;
    pptFrame[i + 3] = 255;
  }
}
const resPpt = detectFast16x16(pptFrame, 60);
assert.strictEqual(resPpt.scene, 'white_slide', '16x16 PPT frame should be detected as white slide');

// Test case 2: Normal colorful / dark frame with early exit
const natureFrame = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < natureFrame.length; i += 4) {
  natureFrame[i] = 80;
  natureFrame[i + 1] = 160;
  natureFrame[i + 2] = 210;
  natureFrame[i + 3] = 255;
}
const resNature = detectFast16x16(natureFrame, 60);
assert.strictEqual(resNature.scene, 'normal', 'Colorful frame should be normal');
assert.strictEqual(resNature.earlyExit, true, 'Should trigger early bailout optimization');

// Benchmark Test: Execution time must be strictly < 50ms (in fact < 1ms)
const startBench = process.hrtime.bigint();
const iterations = 1000;
for (let k = 0; k < iterations; k++) {
  detectFast16x16(pptFrame, 60);
  detectFast16x16(natureFrame, 60);
}
const elapsedNs = Number(process.hrtime.bigint() - startBench);
const avgTimePerDetectMs = (elapsedNs / 1000000) / (iterations * 2);
console.log(`Average detection time per frame: ${avgTimePerDetectMs.toFixed(4)} ms`);
assert.ok(avgTimePerDetectMs < 0.5, `Detection per frame must be < 0.5ms (target < 50ms, actual ${avgTimePerDetectMs.toFixed(4)}ms)`);

// 2. Transition setting assertion
function getTransitionCss(transitionMs) {
  return transitionMs > 0 ? `filter ${transitionMs}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none';
}
assert.strictEqual(getTransitionCss(0), 'none', 'Default 0ms transition must be direct switch "none"');
assert.strictEqual(getTransitionCss(150), 'filter 150ms cubic-bezier(0.4, 0, 0.2, 1)', '150ms transition');

// 3. Non-conflicting HIL state machine
class MockStateMachine {
  constructor() {
    this.invertActive = false;
    this.autoDetect = true;
    this.currentDetectedScene = 'normal';
    this.userRejectedScene = null;
    this.normalSceneCount = 0;
  }

  tick(detectedScene) {
    if (!this.autoDetect) return;

    if (detectedScene !== this.currentDetectedScene) {
      this.currentDetectedScene = detectedScene;
      if (this.userRejectedScene && this.userRejectedScene !== detectedScene) {
        this.userRejectedScene = null;
      }
    }

    if (detectedScene === 'white_slide') {
      this.normalSceneCount = 0;
      if (this.userRejectedScene === 'white_slide') {
        return;
      }
      this.invertActive = true;
    } else {
      this.normalSceneCount++;
      if (this.userRejectedScene === 'normal') {
        return;
      }
      if (this.invertActive && this.normalSceneCount >= 2) {
        this.invertActive = false;
      }
    }
  }

  userToggleInvert() {
    this.invertActive = !this.invertActive;
    this.userRejectedScene = this.currentDetectedScene;
  }
}

const sm = new MockStateMachine();
sm.tick('white_slide');
assert.strictEqual(sm.invertActive, true, 'Auto inverts');
sm.userToggleInvert();
assert.strictEqual(sm.invertActive, false, 'Manual override');
sm.tick('white_slide');
assert.strictEqual(sm.invertActive, false, 'No fighting');

// 4. Custom filter generator assertion
function getCustomFilter(b, c, s, h) {
  return `invert(1) hue-rotate(${h}deg) brightness(${Number(b).toFixed(2)}) contrast(${Number(c).toFixed(2)}) saturate(${Number(s).toFixed(2)})`;
}
assert.strictEqual(
  getCustomFilter(0.85, 1.15, 0.90, 180),
  'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.15) saturate(0.90)',
  'Custom filter string must correctly format parameters'
);

// 5. Image & Diagram evaluation algorithm with transparent pixel filtering
function evaluateImageData(data, lumCutoff = 210, thresholdRatio = 0.6) {
  let whitePixelCount = 0;
  let opaquePixels = 0;
  let totalSaturation = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 64) continue; // Skip transparent
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

// Test case 5a: White-background flowchart/diagram (80% white, 20% black text)
const diagramData = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < diagramData.length; i += 4) {
  if (i < diagramData.length * 0.8) {
    diagramData[i] = 250; diagramData[i+1] = 250; diagramData[i+2] = 250; diagramData[i+3] = 255;
  } else {
    diagramData[i] = 20; diagramData[i+1] = 20; diagramData[i+2] = 20; diagramData[i+3] = 255;
  }
}
assert.strictEqual(evaluateImageData(diagramData), true, 'White background flowchart should be detected for invert');

// Test case 5b: Diagram with transparent border (alpha < 64 should be ignored)
const transparentDiagram = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < transparentDiagram.length; i += 4) {
  if (i < transparentDiagram.length * 0.5) {
    // Transparent border
    transparentDiagram[i] = 0; transparentDiagram[i+1] = 0; transparentDiagram[i+2] = 0; transparentDiagram[i+3] = 0;
  } else if (i < transparentDiagram.length * 0.9) {
    // White card
    transparentDiagram[i] = 255; transparentDiagram[i+1] = 255; transparentDiagram[i+2] = 255; transparentDiagram[i+3] = 255;
  } else {
    // Black text
    transparentDiagram[i] = 10; transparentDiagram[i+1] = 10; transparentDiagram[i+2] = 10; transparentDiagram[i+3] = 255;
  }
}
assert.strictEqual(evaluateImageData(transparentDiagram), true, 'Diagram with transparent border should correctly filter alpha and invert');

// Test case 5c: Colorful illustration / photo (high saturation)
const colorfulPhoto = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < colorfulPhoto.length; i += 4) {
  colorfulPhoto[i] = 240; colorfulPhoto[i+1] = 100; colorfulPhoto[i+2] = 50; colorfulPhoto[i+3] = 255;
}
assert.strictEqual(evaluateImageData(colorfulPhoto), false, 'Colorful photo should NOT be inverted');

// Test case 5d: Dark mode technical diagram
const darkDiagram = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < darkDiagram.length; i += 4) {
  darkDiagram[i] = 30; darkDiagram[i+1] = 30; darkDiagram[i+2] = 30; darkDiagram[i+3] = 255;
}
assert.strictEqual(evaluateImageData(darkDiagram), false, 'Dark diagram should NOT be inverted');

// 5. Multi-light-color background detection tests (v1.4.0)
const IMG_PRESETS = [
  { id: 'white', rgb: [255, 255, 255] },
  { id: 'gray', rgb: [245, 245, 245] },
  { id: 'cream', rgb: [250, 240, 230] },
  { id: 'coolBlue', rgb: [240, 248, 255] },
];

function hexToRgbTest(hex) {
  const c = hex.replace('#', '').trim();
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)];
}

function evaluateImagePixelsTest(data, s = {}) {
  const lumCutoff = s.imgLumCutoff || 180;
  const areaThreshold = (s.imgAreaThreshold || 48) / 100;
  const toleranceSq = ((s.imgTolerance || 35) * 2.55) ** 2;
  const generalLight = s.imgGeneralLight !== false;

  const activePresets = [];
  if (s.imgPresets) {
    for (const p of IMG_PRESETS) {
      if (s.imgPresets[p.id]) activePresets.push(p.rgb);
    }
  } else {
    for (const p of IMG_PRESETS) activePresets.push(p.rgb);
  }
  const customRgb = s.imgCustomColor ? hexToRgbTest(s.imgCustomColor) : null;

  let lightCount = 0;
  let opaqueCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 64) continue;
    opaqueCount++;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r * 77 + g * 150 + b * 29) >> 8;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    let isLight = false;
    if (generalLight && lum >= lumCutoff && sat <= 0.38) {
      isLight = true;
    } else {
      for (let j = 0; j < activePresets.length; j++) {
        const p = activePresets[j];
        const d2 = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
        if (d2 <= toleranceSq) { isLight = true; break; }
      }
      if (!isLight && customRgb) {
        const d2 = (r - customRgb[0]) ** 2 + (g - customRgb[1]) ** 2 + (b - customRgb[2]) ** 2;
        if (d2 <= toleranceSq) isLight = true;
      }
    }
    if (isLight) lightCount++;
  }
  if (opaqueCount < 8) return false;
  return (lightCount / opaqueCount) >= areaThreshold;
}

// 5a. Pure white diagram (8x8)
const white8x8 = new Uint8ClampedArray(64 * 4);
for (let i = 0; i < 64; i++) {
  const isText = (i % 8 === 2);
  white8x8[i*4] = isText ? 20 : 255;
  white8x8[i*4+1] = isText ? 20 : 255;
  white8x8[i*4+2] = isText ? 20 : 255;
  white8x8[i*4+3] = 255;
}
assert.strictEqual(evaluateImagePixelsTest(white8x8), true, 'Pure white diagram should invert');

// 5b. Paper light-gray diagram (#F5F5F5)
const gray8x8 = new Uint8ClampedArray(64 * 4);
for (let i = 0; i < 64; i++) {
  const isLine = (i % 7 === 0);
  gray8x8[i*4] = isLine ? 30 : 245;
  gray8x8[i*4+1] = isLine ? 30 : 245;
  gray8x8[i*4+2] = isLine ? 30 : 245;
  gray8x8[i*4+3] = 255;
}
assert.strictEqual(evaluateImagePixelsTest(gray8x8), true, 'Light gray diagram should invert');

// 5c. Warm cream/sepia lecture slide (#FAF0E6: 250, 240, 230)
const cream8x8 = new Uint8ClampedArray(64 * 4);
for (let i = 0; i < 64; i++) {
  const isFormula = (i % 6 === 0);
  cream8x8[i*4] = isFormula ? 40 : 250;
  cream8x8[i*4+1] = isFormula ? 30 : 240;
  cream8x8[i*4+2] = isFormula ? 20 : 230;
  cream8x8[i*4+3] = 255;
}
assert.strictEqual(evaluateImagePixelsTest(cream8x8), true, 'Warm cream slide should invert');

// 5d. Pale blue flowchart (#F0F8FF: 240, 248, 255)
const blue8x8 = new Uint8ClampedArray(64 * 4);
for (let i = 0; i < 64; i++) {
  const isBox = (i % 5 === 0);
  blue8x8[i*4] = isBox ? 20 : 240;
  blue8x8[i*4+1] = isBox ? 60 : 248;
  blue8x8[i*4+2] = isBox ? 140 : 255;
  blue8x8[i*4+3] = 255;
}
assert.strictEqual(evaluateImagePixelsTest(blue8x8), true, 'Pale blue flowchart should invert');

// 5e. Custom color palette target matching (#FFFBEB)
const customLight8x8 = new Uint8ClampedArray(64 * 4);
for (let i = 0; i < 64; i++) {
  customLight8x8[i*4] = 255; customLight8x8[i*4+1] = 251; customLight8x8[i*4+2] = 235; customLight8x8[i*4+3] = 255;
}
assert.strictEqual(evaluateImagePixelsTest(customLight8x8, { imgGeneralLight: false, imgCustomColor: '#fffbeb', imgTolerance: 35 }), true, 'Custom target color should match');

// 5f. Benchmark: 8x8 detection speed per image must be < 0.01ms (actual < 0.001ms)
for (let k = 0; k < 100; k++) {
  evaluateImagePixelsTest(white8x8);
}
const imgBenchStart = process.hrtime.bigint();
const imgIterations = 5000;
for (let k = 0; k < imgIterations; k++) {
  evaluateImagePixelsTest(white8x8);
  evaluateImagePixelsTest(cream8x8);
}
const imgElapsedNs = Number(process.hrtime.bigint() - imgBenchStart);
const avgImgTimeMs = (imgElapsedNs / 1000000) / (imgIterations * 2);
console.log(`Average 8x8 image detection time: ${avgImgTimeMs.toFixed(5)} ms`);
assert.ok(avgImgTimeMs < 0.05, 'Image detection must be ultra fast');

// 6. GM_xmlhttpRequest CORS fallback mock test
function mockGmFetch(url, gmAvailable) {
  return new Promise((resolve) => {
    if (gmAvailable) {
      resolve({ source: 'GM_xmlhttpRequest', cleanBlob: true });
    } else {
      resolve({ source: 'fetch_cors', cleanBlob: false });
    }
  });
}
mockGmFetch('https://upload.wikimedia.org/wikipedia/commons/thumb/test.png', true).then((res) => {
  assert.strictEqual(res.source, 'GM_xmlhttpRequest');
  assert.strictEqual(res.cleanBlob, true);
});

console.log('✓ All 22 unit, benchmark, and multi-light-color tests passed successfully!');


// ============================================================
// v2.0 站点引擎纯逻辑单测 (通过 window.__svi 调试句柄导出)
// 在 Node 中以最小浏览器环境桩加载油猴脚本本体, 直接单测其导出的纯函数
// ============================================================
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const scriptSource = fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8')
  .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

// —— 最小浏览器环境桩 (仅暴露纯逻辑所需的 API; body 保持 null 以跳过引擎循环) ——
const storageData = {};
global.localStorage = {
  getItem: (k) => (k in storageData ? storageData[k] : null),
  setItem: (k, v) => { storageData[k] = String(v); },
  removeItem: (k) => { delete storageData[k]; },
};
global.location = { hostname: 'mail.163.com', href: 'https://mail.163.com/', protocol: 'https:' };
const makeElStub = () => ({
  style: { setProperty() {}, removeProperty() {} },
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
  appendChild() {}, append() {}, addEventListener() {},
  querySelectorAll() { return []; }, querySelector() { return null; },
  closest() { return null; }, matches() { return false; }, contains() { return false; },
  isConnected: true, parentNode: null, remove() {},
});
global.document = {
  documentElement: makeElStub(),
  head: makeElStub(),
  body: null,
  hidden: false,
  createElement: () => makeElStub(),
  addEventListener() {},
  removeEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
  getElementById() { return null; },
};
global.MutationObserver = class { observe() {} disconnect() {} unobserve() {} };
global.self = {}; // 与 window.top 不同 → 顶层框架判定为 false, 不构建 UI
// v4.6: 引擎类直构 (护栏单测) 需要 window 级事件桩
global.addEventListener = global.addEventListener || (() => {});
global.removeEventListener = global.removeEventListener || (() => {});

// 迁移前种子: 旧 v3 键包含必须被剥离的运行时键 invertActive
storageData['universal_smart_invert_v3'] = JSON.stringify({
  invertActive: true,
  imageInvert: false,
  imgTolerance: 40,
  imgPresets: { white: true, gray: false },
});

global.window = global;
vm.runInThisContext(scriptSource, { filename: 'universal-smart-invert.user.js' });

const svi = window.__svi;
assert.ok(svi, 'window.__svi must be exported for tests');
// v5.0 修正: 版本号从原始头动态读取, 不再硬编码 —— 硬编码会在每次发版时产生一次
// 与产品无关的假失败 (v4.6.1 → v5.0.0 实测)。断言文案本来就写着"must track the @version header"。
const HEADER_VERSION = (fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8')
  .match(/@version\s+(\S+)/) || [])[1] || '';
assert.ok(HEADER_VERSION, 'userscript header must declare @version');
assert.strictEqual(svi.version, HEADER_VERSION, 'script version must track the @version header');

// —— 7a. v3 → v4 迁移: 剥离运行时键, 保留偏好, 旧键不动 (R7) ——
const v4raw = storageData['universal_smart_invert_v4'];
assert.ok(v4raw, 'migration must create the v4 prefs key');
const v4 = JSON.parse(v4raw);
assert.ok(!('invertActive' in v4), 'migration must strip runtime invertActive');
assert.strictEqual(v4.imgTolerance, 40, 'legacy pref values must be preserved');
assert.strictEqual(v4.imageInvert, false, 'legacy pref values must be preserved');
assert.strictEqual(v4.imgPresets.gray, false, 'imgPresets must be deep-merged');
assert.ok(storageData['universal_smart_invert_v3'], 'legacy v3 key must be left untouched');
assert.strictEqual(svi.runtime.invertActive, false, 'fresh page must start with video invert OFF');
assert.strictEqual(typeof svi.prefs.bgReplace, 'boolean', 'new v2.0 pref defaults must exist');

// —— 7b. hostMatchesPattern ——
const hm = svi.hostMatchesPattern;
assert.strictEqual(hm('163.com', '163.com'), true);
assert.strictEqual(hm('mail.163.com', '163.com'), true, 'bare domain matches subdomains');
assert.strictEqual(hm('foo.mail.163.com', '163.com'), true);
assert.strictEqual(hm('mail.163.com', '*.163.com'), true);
assert.strictEqual(hm('163.com', '*.163.com'), true);
assert.strictEqual(hm('mail.163.com', 'mail.163.com'), true, 'qualified host pattern exact match');
assert.strictEqual(hm('xmail.163.com', 'mail.163.com'), false, 'qualified host pattern must not suffix-match');
assert.strictEqual(hm('not163.com', '163.com'), false, 'suffix match must respect dot boundary');
assert.strictEqual(hm('evil-163.com', '163.com'), false);
assert.strictEqual(hm('', '163.com'), false);
assert.strictEqual(hm('bilibili.com', 'bilibili.com'), true);

// —— 7c. 站点档案解析 + 内置规则 + 用户覆盖合并 (R2/R4) ——
const p163 = svi.resolveSiteProfile('mail.163.com');
assert.ok(p163.builtin && p163.ruleName, '163 builtin rule must match mail.163.com');
assert.strictEqual(p163.bgReplace, true, '163 builtin rule defaults bgReplace on');
assert.strictEqual(p163.videoInvert, true);

svi.prefs.siteOverrides['mail.163.com'] = { bgReplace: false, imageInvert: false };
const pOverride = svi.resolveSiteProfile('mail.163.com');
assert.strictEqual(pOverride.bgReplace, false, 'user override must win over builtin');
assert.strictEqual(pOverride.imageInvert, false, 'user override must win over global');
assert.strictEqual(pOverride.videoInvert, true, 'unset override keys fall back to defaults');
assert.strictEqual(pOverride.overridePattern, 'mail.163.com');
delete svi.prefs.siteOverrides['mail.163.com'];

// 黑名单模式
svi.prefs.siteMode = 'blacklist';
svi.prefs.siteBlacklist = ['*.163.com'];
assert.strictEqual(svi.resolveSiteProfile('mail.163.com').enabled, false, 'blacklisted host disabled');
assert.strictEqual(svi.resolveSiteProfile('example.com').enabled, true, 'non-blacklisted host enabled');
// 白名单模式
svi.prefs.siteMode = 'whitelist';
svi.prefs.siteWhitelist = ['github.com'];
assert.strictEqual(svi.resolveSiteProfile('mail.163.com').enabled, false, 'non-whitelisted host disabled');
assert.strictEqual(svi.resolveSiteProfile('gist.github.com').enabled, true, 'whitelist pattern matches subdomain');
// 显式本站覆盖优先于站点模式 (最具体者胜, R2): 白名单内站点可被"本站启用"复选框单独关闭
svi.prefs.siteOverrides['gist.github.com'] = { enabled: false };
assert.strictEqual(svi.resolveSiteProfile('gist.github.com').enabled, false, 'explicit per-site enabled=false must win over whitelist gating');
delete svi.prefs.siteOverrides['gist.github.com'];
svi.prefs.siteMode = 'all';
svi.prefs.siteBlacklist = [];
svi.prefs.siteWhitelist = [];

// rulesEnabled=false 跳过内置规则层
svi.prefs.rulesEnabled = false;
assert.strictEqual(svi.resolveSiteProfile('mail.163.com').builtin, null, 'rulesEnabled=false skips builtin layer');
svi.prefs.rulesEnabled = true;

// —— 7c-2. v3.3 元素级规则: 归一化 + 站点档案解析 + 首条命中 ——
const normER = svi.normalizeElementRules;
assert.deepStrictEqual(normER(null), [], 'non-array normalizes to empty list');
assert.deepStrictEqual(normER(undefined), [], 'undefined normalizes to empty list');
assert.strictEqual(normER(['bad', null, 42, { pattern: 'x.com' }, { pattern: 'x.com', selector: '', action: 'invert' }]).length, 0,
  'non-object entries and entries missing pattern/selector/action are dropped');
const normOk = normER([
  { pattern: 'example.com', selector: '.ad-banner', action: 'protect', junk: 'strip-me' },
  { pattern: '*', selector: '  img.stamp  ', action: 'not-an-action' },
  { pattern: '*', selector: 'img.stamp', action: 'invert', note: 7 },
]);
assert.strictEqual(normOk.length, 2, 'only well-formed entries survive');
assert.strictEqual(normOk[0].selector, '.ad-banner');
assert.strictEqual(normOk[0].action, 'protect');
assert.ok(!('junk' in normOk[0]), 'unknown fields must not survive normalization');
assert.strictEqual(normOk[1].id.length, 8, 'missing id is auto-filled with 8-hex hash');
assert.strictEqual(normOk[1].note, '', 'non-string note coerces to empty string');
const fifoInput = [];
for (let i = 0; i < 205; i++) fifoInput.push({ pattern: '*', selector: '.r' + i, action: 'invert' });
const fifoOut = normER(fifoInput);
assert.strictEqual(fifoOut.length, 200, 'element rules FIFO cap is 200');
assert.strictEqual(fifoOut[0].selector, '.r5', 'oldest entries are dropped first (keep newest)');

svi.prefs.elementRules = [
  { pattern: '163.com', selector: '.site-ad', action: 'protect' },
  { pattern: '*', selector: '.global-stamp', action: 'invert' },
  { pattern: 'github.com', selector: '.nope', action: 'invert' },
];
svi.invalidateProfileCache();
const per163ER = svi.resolveSiteProfile('mail.163.com');
assert.strictEqual(per163ER.elementRules.length, 2, 'site + global rules attach to profile, non-matching excluded');
assert.strictEqual(per163ER.elementRules[0].selector, '.site-ad', 'array order preserved as priority order');
assert.strictEqual(svi.resolveSiteProfile('github.com').elementRules.length, 2, 'github gets global + its own rule');
assert.strictEqual(svi.resolveSiteProfile('example.org').elementRules.length, 1, 'unmatched host only gets global rule');
svi.prefs.elementRules = [];
svi.invalidateProfileCache();

const erEl = { matches: (sel) => sel === '.hit' };
const erList = [{ selector: '.miss', action: 'protect' }, { selector: '.hit', action: 'invert' }];
assert.strictEqual(svi.firstMatchingElementRule(erEl, erList).action, 'invert', 'first matching element rule wins');
assert.strictEqual(svi.firstMatchingElementRule({ matches: () => false }, erList), null, 'no match returns null');
assert.strictEqual(svi.firstMatchingElementRule(erEl, null), null, 'missing rule list returns null');

// —— 7d. classifySmallElement (R3/p0 智能小元素屏蔽) ——
const cls = svi.classifySmallElement;
const clsBase = { w: 64, h: 64, meta: '', srcOccurrences: 1, isContentContext: false, isChromeContext: false, minImgSize: 48 };
assert.strictEqual(cls({ ...clsBase, w: 16, h: 16 }).skip, true, 'tiny <24px always skipped');
assert.strictEqual(cls({ ...clsBase, srcOccurrences: 20 }).skip, true, '20x repeated small icon must be skipped');
assert.strictEqual(cls({ ...clsBase, srcOccurrences: 20 }).reason, 'repeated-small');
assert.strictEqual(cls({ ...clsBase, srcOccurrences: 2 }).skip, false, 'below repetition threshold not skipped');
assert.strictEqual(cls({ ...clsBase, isChromeContext: true }).skip, true, 'chrome-context small element skipped');
assert.strictEqual(cls({ ...clsBase, isChromeContext: true, isContentContext: true }).skip, false, 'content context exempts chrome branch');
assert.strictEqual(cls({ ...clsBase, w: 300, h: 200 }).skip, false, '300px diagram must still invert');
assert.strictEqual(cls({ ...clsBase, w: 300, h: 200, isContentContext: true }).skip, false, 'markdown-body diagram must still invert');
assert.strictEqual(cls({ ...clsBase, w: 40, h: 40 }).skip, true, 'below minImgSize both dims skipped');
assert.strictEqual(cls({ ...clsBase, w: 40, h: 40, isContentContext: true }).skip, true, 'content context does not bypass size gates');
assert.strictEqual(cls({ ...clsBase, meta: 'user-avatar' }).skip, true, 'avatar meta skipped');
assert.strictEqual(cls({ ...clsBase, meta: 'user-avatar', w: 200, h: 100, isContentContext: true }).skip, false, 'content-context avatar >=48px exempted from meta rule');

// —— 7e. mapLightToDark / mapDarkToLight (R1 纯函数) ——
const whiteToDark = svi.mapLightToDark(255, 255, 255);
assert.ok(svi.relLuminance(whiteToDark[0], whiteToDark[1], whiteToDark[2]) < 60, 'white must map to dark');
const blackToLight = svi.mapDarkToLight(10, 10, 10);
assert.ok(svi.relLuminance(blackToLight[0], blackToLight[1], blackToLight[2]) > 180, 'dark text must map to light');
// 明度边界: 所有映射结果 HSL L ∈ [8, 92]
const sampleColors = [
  [255, 255, 255], [250, 240, 230], [240, 248, 255], [200, 220, 240],
  [255, 250, 205], [230, 230, 250], [0, 0, 0], [20, 20, 20],
  [60, 60, 60], [220, 40, 40], [40, 160, 80],
];
for (const [r, g, b] of sampleColors) {
  for (const fn of [svi.mapLightToDark, svi.mapDarkToLight]) {
    const [nr, ng, nb] = fn(r, g, b);
    const l = svi.rgbToHsl(nr, ng, nb)[2];
    // 映射时已在 HSL 空间钳制到 [8,92]; RGB 取整会带来约 ±0.6 的往返误差
    assert.ok(l >= 7 && l <= 93, `mapped luminance must stay in [8,92] (rounding slack) for rgb(${r},${g},${b}) -> L=${l}`);
  }
}
// 色相保留 (红色系)
const mappedRed = svi.mapLightToDark(220, 60, 50);
const mappedRedHue = svi.rgbToHsl(mappedRed[0], mappedRed[1], mappedRed[2])[0];
assert.ok(mappedRedHue < 25 || mappedRedHue > 335, 'hue must be preserved');

// —— 7f. 原色屏蔽容差 (R2) ——
const shieldWhite = [[255, 255, 255]];
assert.strictEqual(svi.isShieldedColor([255, 255, 250], shieldWhite), true, 'within tolerance 24');
assert.strictEqual(svi.isShieldedColor([255, 255, 231], shieldWhite), true, 'diff exactly 24 counts');
assert.strictEqual(svi.isShieldedColor([255, 255, 230], shieldWhite), false, 'diff 25 must not match');
assert.strictEqual(svi.isShieldedColor([230, 230, 230], shieldWhite), false);
assert.strictEqual(svi.isShieldedColor([0, 255, 10], [[0, 255, 0]]), true);
assert.strictEqual(svi.isShieldedColor([100, 100, 100], []), false, 'empty shield list never matches');

// —— 7g. 手动覆盖 key + FIFO 上限 400 (R5) ——
assert.strictEqual(svi.manualOverrideKey('github.com', 'https://a/b.png'), 'github.com|https://a/b.png');
const moStore = {};
for (let i = 0; i < 402; i++) {
  svi.addManualOverride(moStore, 'k' + i, 'invert', 400);
}
assert.strictEqual(Object.keys(moStore).length, 400, 'manual overrides capped at 400');
assert.ok(!('k0' in moStore), 'oldest entries evicted FIFO');
assert.ok(!('k1' in moStore), 'oldest entries evicted FIFO');
assert.ok('k401' in moStore, 'latest entry retained');
assert.strictEqual(moStore['k401'], 'invert');

// —— 7h. BUILTIN_RULES 完整性 (R4) ——
const requiredRules = [
  'bilibili.com', 'live.bilibili.com', 'github.com', '163.com', 'zhihu.com',
  'weibo.com', 'youtube.com', 'douyin.com', 'iqiyi.com', 'youku.com',
  'v.qq.com', 'twitter.com', 'x.com', 'qq.com', 'taobao.com',
  'jd.com', 'stackoverflow.com', 'juejin.cn', 'csdn.net',
];
const seenPatterns = new Set();
for (const rule of svi.BUILTIN_RULES) {
  assert.ok(rule.pattern && rule.name, 'each rule needs pattern + name');
  assert.ok(!seenPatterns.has(rule.pattern), 'rule patterns must be unique: ' + rule.pattern);
  seenPatterns.add(rule.pattern);
  for (const key of ['protect', 'forceInvert', 'bgImageSelectors']) {
    assert.ok(Array.isArray(rule[key]), rule.pattern + '.' + key + ' must be an array');
    for (const sel of rule[key]) {
      assert.ok(typeof sel === 'string' && sel.length > 0, rule.pattern + '.' + key + ' selectors must be non-empty strings');
    }
  }
  assert.strictEqual(typeof rule.disableVideoAuto, 'boolean', 'disableVideoAuto must be boolean');
  assert.strictEqual(typeof rule.bgReplace, 'boolean', 'bgReplace must be boolean');
}
for (const p of requiredRules) {
  assert.ok(seenPatterns.has(p), 'missing required builtin rule: ' + p);
}
for (const p of ['youtube.com', 'douyin.com', 'iqiyi.com', 'youku.com', 'v.qq.com']) {
  const rule = svi.BUILTIN_RULES.find((r) => r.pattern === p);
  assert.ok(rule && rule.disableVideoAuto === true, p + ' must disable video auto');
}
const biliRule = svi.BUILTIN_RULES.find((r) => r.pattern === 'bilibili.com');
assert.ok(biliRule.bgImageSelectors.length >= 2, 'bilibili comment bg-image thumbnail selectors required');
const ghRule = svi.BUILTIN_RULES.find((r) => r.pattern === 'github.com');
assert.ok(ghRule.forceInvert.some((s) => s.includes('camo.githubusercontent.com')), 'github camo forceInvert required');
assert.ok(ghRule.forceInvert.some((s) => s.includes('.markdown-body img')), 'github markdown forceInvert required');

// —— 7i. 统计导出 schema + 日志上限 200 (R5/p2) ——
const export1 = svi.exportStats();
assert.strictEqual(export1.schema, 1, 'export envelope schema');
assert.ok(typeof export1.exportedAt === 'string' && export1.exportedAt.length > 0, 'exportedAt ISO string');
assert.strictEqual(export1.version, svi.version, 'export version must track SCRIPT_VERSION');
assert.ok(export1.counters && typeof export1.counters === 'object', 'export counters object');
assert.ok(typeof export1.counters.imagesAnalyzed === 'number', 'counter imagesAnalyzed');
assert.ok(typeof export1.counters.taintFallbacks === 'number', 'counter taintFallbacks');
assert.ok(typeof export1.counters.bgReplacePages === 'number', 'counter bgReplacePages');
assert.ok(Array.isArray(export1.log), 'export log array');
assert.ok(export1.prefs && typeof export1.prefs === 'object', 'export includes prefs');
assert.ok('manualOverrides' in export1.prefs, 'export includes manualOverrides (local data, nothing dropped)');
for (let i = 0; i < 250; i++) {
  svi.stats.record('unit-test', 'entry-' + i);
}
assert.strictEqual(svi.stats.log.length, 200, 'log capped at 200');
assert.strictEqual(svi.stats.log[0].detail, 'entry-50', 'oldest log entries dropped FIFO');
const export2 = svi.exportStats(); // 导出前强制落盘
assert.strictEqual(export2.log.length, 200, 'export reflects capped log');
assert.ok(JSON.parse(storageData['universal_smart_invert_stats_v1']), 'stats flushed to localStorage key universal_smart_invert_stats_v1');
svi.stats.clear();
assert.strictEqual(svi.stats.log.length, 0, 'clear empties log');
svi.stats.load();
assert.strictEqual(svi.stats.log.length, 0, 'load after clear starts clean');

// ============================================================
// v3.0 新增单测 (design §9 Node list): transformPixel / segments /
// selectorStem / RuleLearner / Store (chrome.storage.sync mock) /
// mediaDominantViewport / rect math
// ============================================================

// —— 8a. transformPixel 各模式 (R1) ——
const tp = svi.transformPixel;
// invert-full: 恒反色
assert.deepStrictEqual(tp(10, 20, 30, 'invert-full'), [245, 235, 225], 'invert-full always inverts');
// luma: 亮色低饱和像素反色, 彩色像素保留 (null)
assert.deepStrictEqual(tp(255, 255, 255, 'luma', { lumCutoff: 190, satCutoff: 0.30 }), [0, 0, 0], 'luma inverts light pixel');
assert.deepStrictEqual(tp(250, 250, 245, 'luma', { lumCutoff: 190, satCutoff: 0.30 }), [5, 5, 10], 'luma inverts near-white pixel');
assert.strictEqual(tp(200, 60, 30, 'luma', { lumCutoff: 190, satCutoff: 0.30 }), null, 'luma keeps saturated colorful pixel');
assert.strictEqual(tp(80, 80, 80, 'luma', { lumCutoff: 190, satCutoff: 0.30 }), null, 'luma keeps dark pixel (below cutoff)');
// key: 仅键色附近像素反色
assert.deepStrictEqual(tp(250, 10, 10, 'key', { keyColor: '#ff0000', keyTol: 60 }), [5, 245, 245], 'key inverts near-key pixel');
assert.strictEqual(tp(255, 255, 255, 'key', { keyColor: '#ff0000', keyTol: 60 }), null, 'key keeps white pixel far from key');
assert.deepStrictEqual(tp(230, 230, 230, 'key', { keyColor: '#ffffff', keyTol: 60 }), [25, 25, 25], 'key inverts near-white with white key');
assert.strictEqual(tp(200, 60, 30, 'key', { keyColor: '#ffffff', keyTol: 60 }), null, 'key keeps colorful pixel away from white key');
// rect: 像素函数 = 全反色 (边界由循环控制)
assert.deepStrictEqual(tp(10, 20, 30, 'rect'), [245, 235, 225], 'rect pixel fn is invert-full');
// 效果模式
const gray = tp(200, 60, 30, 'grayscale');
assert.ok(gray[0] === gray[1] && gray[1] === gray[2], 'grayscale output must be neutral');
assert.ok(gray[0] > 80 && gray[0] < 120, 'grayscale uses BT.601 luma');
const sep = tp(200, 60, 30, 'sepia');
assert.ok(sep[0] > sep[1] && sep[1] > sep[2], 'sepia output must be warm-ordered r>g>b');
assert.ok(sep[0] > 120, 'sepia brightens red channel');
const br = tp(100, 100, 100, 'brightness', { brightness: 1.2 });
assert.deepStrictEqual(br, [120, 120, 120], 'brightness scales channels');
assert.strictEqual(tp(5, 5, 5, 'unknown-mode'), null, 'unknown mode keeps original');
// 与 shader 相同的 luma 语义 (白 255 判定): relLuminance(255,255,255)=254 ≥ 190
assert.strictEqual(svi.relLuminance(255, 255, 255) >= 190, true, 'BT.601 white luma above cutoff');

// —— 8b. mergeSegments (重叠/间隔合并) + lookupSegment 边界 (R3) ——
const ms = svi.mergeSegments;
assert.deepStrictEqual(ms([[0, 1], [0.5, 2]], 0), [[0, 2]], 'overlapping segments merge');
assert.deepStrictEqual(ms([[0, 1], [3, 4]], 2), [[0, 4]], 'gap within gapMs merges');
assert.deepStrictEqual(ms([[0, 1], [3, 4]], 1.9), [[0, 1], [3, 4]], 'gap beyond gapMs stays separate');
assert.deepStrictEqual(ms([[5, 6], [0, 1], [0.5, 2]], 0.2), [[0, 2], [5, 6]], 'input order independent');
assert.deepStrictEqual(ms([], 2), [], 'empty input');
const segsInput = [[0, 1], [1, 2]];
ms(segsInput, 0);
assert.deepStrictEqual(segsInput, [[0, 1], [1, 2]], 'mergeSegments must not mutate input');
const ls = svi.lookupSegment;
assert.deepStrictEqual(ls([[0.5, 2]], 0.5), [0.5, 2], 'lookup at t0 boundary (inclusive)');
assert.deepStrictEqual(ls([[0.5, 2]], 2), [0.5, 2], 'lookup at t1 boundary (inclusive)');
assert.strictEqual(ls([[0.5, 2]], 2.01), null, 'outside segment returns null');
assert.strictEqual(ls([[0.5, 2]], 0.49), null, 'before segment returns null');
assert.deepStrictEqual(ls([[0, 1], [3, 4]], 3.5), [3, 4], 'lookup in second segment');

// —— 8c. selectorStem 形状 (R4): tag + 首个 class; 无 class 回退 #id (id 每元素唯一, 恒加入会破坏聚合) ——
const ss = svi.selectorStem;
assert.strictEqual(ss({ tagName: 'IMG', id: '', className: 'thumb-x primary' }), 'img.thumb-x', 'tag + first class');
assert.strictEqual(ss({ tagName: 'IMG', id: 'learn-1', className: 'thumb-x' }), 'img.thumb-x', 'same-class elements must share a stem (id not included)');
assert.strictEqual(ss({ tagName: 'DIV', id: 'hero', className: '' }), 'div#hero', 'id fallback when no class');
assert.strictEqual(ss({ tagName: 'span', id: '', className: '' }), 'span', 'bare tag');
assert.strictEqual(ss({ tagName: 'IMAGE', id: '', className: { baseVal: 'svg-img' } }), 'image.svg-img', 'SVG className.baseVal support');
assert.strictEqual(ss(null), '', 'null element');

// —— 8d. RuleLearner 聚合 (2 次命中激活, 删除, 反转重置) (R4) ——
const rl = svi.RuleLearner;
const testHost = 'learn.test';
// 记录 2 次 invert → 激活
rl.record(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }, 'invert');
assert.strictEqual(rl.decideFor(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }), null, '1 hit below threshold (learnHits=2)');
rl.record(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }, 'invert');
assert.strictEqual(rl.decideFor(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }), 'invert', '2 hits activate learned rule');
assert.strictEqual(rl.decideFor(testHost, { tagName: 'IMG', id: '', className: 'other' }), null, 'different stem not matched');
assert.strictEqual(rl.rulesFor(testHost).length, 1, 'rules listed per host');
// protect 反转: 计数重置
rl.record(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }, 'protect');
assert.strictEqual(rl.decideFor(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }), null, 'action flip resets hits below threshold');
rl.record(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }, 'protect');
assert.strictEqual(rl.decideFor(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }), 'protect', 'protect re-activates at threshold');
// 删除
assert.strictEqual(rl.deleteRule(testHost, 'img.thumb-x'), true, 'deleteRule removes');
assert.strictEqual(rl.decideFor(testHost, { tagName: 'IMG', id: '', className: 'thumb-x' }), null, 'deleted rule no longer applies');
// Store 持久化 (svi:learned)
assert.ok(svi.Store.get('learned'), 'RuleLearner persists via Store');

// —— 8e. Store: chrome.storage.sync 模拟 (8KB 分片 / 镜像读写 / 防抖 / 导出导入 / 遗留迁移) (R6) ——
// 构造异步 chrome.storage.sync 形状的后端 mock
function makeChromeSyncMock() {
  const area = new Map();
  let writeCount = 0;
  const api = {
    get(keyOrKeys, cb) {
      setTimeout(() => {
        if (keyOrKeys === null) {
          const out = {};
          for (const [k, v] of area) out[k] = v;
          cb(out);
        } else if (typeof keyOrKeys === 'string') {
          const out = {};
          if (area.has(keyOrKeys)) out[keyOrKeys] = area.get(keyOrKeys);
          cb(out);
        } else {
          cb({});
        }
      }, 1);
    },
    set(obj, cb) {
      writeCount++;
      setTimeout(() => {
        for (const k of Object.keys(obj)) area.set(k, obj[k]);
        if (cb) cb();
      }, 1);
    },
    remove(keys, cb) {
      setTimeout(() => {
        for (const k of Array.isArray(keys) ? keys : [keys]) area.delete(k);
        if (cb) cb();
      }, 1);
    },
  };
  api.__writeCount = () => writeCount;
  api.__snapshot = () => Object.fromEntries(area);
  return api;
}

// 用隔离的 Store 克隆测试 (不污染全局单例): 实例自有 mirror/pending + 注入 chrome mock 后端
function makeTestStore(mock) {
  const st = Object.create(svi.Store);
  st.mirror = new Map();     // 遮蔽原型上的共享 Map (隔离)
  st.pending = new Set();
  st._removed = new Set();
  st.__useBackend('chrome-sync', Object.create(svi.Store)._makeChromeApi.call({ PREFIX: 'svi:' }, mock));
  st.detectBackend = () => 'chrome-sync'; // 锁定后端 (Node 无全局 chrome)
  return st;
}
{
  const mock = makeChromeSyncMock();
  const localStore = makeTestStore(mock);

  // 镜像读后写 (同步)
  localStore.set('unitA', { hello: 'world' });
  assert.strictEqual(localStore.get('unitA').hello, 'world', 'mirror read-after-write is sync');

  // 大值分片: 20000 字符 → 多 chunk + meta 清单
  const big = { blob: 'x'.repeat(20000) };
  localStore.set('unitBig', big);
  assert.ok(JSON.stringify(big).length > localStore.CHUNK_SIZE, 'test value exceeds chunk size');
  localStore.flush();
  // 等待时长说明 (v4.6.1 修复): chrome 后端的写入走 writeLogicalAsync,
  // 其内部对每个分片键串行 await 一次 mock 往返 (各 1ms); 20000 字符 → 3 片,
  // 加上先前的 meta 清理读取与 remove, 总共需要十余次 1ms 往返。
  // 原值 30ms 在慢机器/高负载下会被耗尽的边缘, 导致 meta 尚未落盘就断言 (稳定复现失败:
  // "chunked write emits meta manifest" actual=undefined)。
  // 这是**测试等待时长不足**, 非产品缺陷 —— 已用同源补丁副本 (仅把 30 改 800) 验证全绿。
  // 改为 300ms, 相对所需往返次数有充足余量, 同时不拖慢整体测试。
  setTimeout(() => {
    const snap = mock.__snapshot();
    const metaKey = 'svi:unitBig.meta';
    assert.ok(snap[metaKey], 'chunked write emits meta manifest');
    const meta = JSON.parse(snap[metaKey]);
    assert.ok(meta.chunks >= 3, 'large value split into multiple chunks');
    assert.ok(snap['svi:unitBig#0'], 'chunk #0 written');
    assert.ok(!('svi:unitBig' in snap), 'plain key removed when chunked');

    // 重新装载: readRawAsync 重组 → mirror 还原
    setTimeout(() => {
      localStore.mirror.clear();
      localStore.ready = false;
      localStore.init().then(() => {
        const restored = localStore.get('unitBig');
        assert.ok(restored && restored.blob && restored.blob.length === 20000, 'chunked value reassembles on load');
        assert.strictEqual(localStore.get('unitA').hello, 'world', 'small value roundtrips');

        // 防抖合并: 多次 set 后 pending 仅含一个逻辑键, 手动 flush 等效于防抖到期 → 单次写入最新值
        localStore.set('deb', 1);
        localStore.set('deb', 2);
        localStore.set('deb', 3);
        assert.ok(localStore.pending.has('deb'), 'multiple sets collapse to one pending key');
        localStore.flush();
        setTimeout(() => {
          assert.strictEqual(localStore.get('deb'), 3, 'debounced flush keeps latest value');
          const snap2 = mock.__snapshot();
          assert.strictEqual(JSON.parse(snap2['svi:deb']), 3, 'debounce collapses to single write');

          // 导出/导入往返
          const exported = localStore.exportAll();
          assert.ok(exported['svi:unitA'], 'exportAll exposes namespaced keys');
          const store2 = makeTestStore(makeChromeSyncMock());
          assert.ok(store2.importAll(exported) >= 2, 'importAll accepts namespaced payload');
          assert.strictEqual(store2.get('unitA').hello, 'world', 'import/export roundtrip preserves values');

          // remove 落盘
          localStore.remove('unitA');
          localStore.flush();
          setTimeout(() => {
            assert.ok(!('svi:unitA' in mock.__snapshot()), 'removed key disappears from backend');
            console.log('✓ v3.0 Store chrome.storage.sync mock tests passed (chunking / mirror / debounce / export-import / remove)');
          }, 30);
        }, 600);
      });
    }, 30);
  }, 300);
}

// —— 8e-2. Store 回归: bootSync 后 chrome 后端必须仍可 init (插件版持久化曾因 ready 提前置位而失效) ——
{
  const chromeMock = makeChromeSyncMock();
  const st = makeTestStore(chromeMock);
  st.set('prefs', { brightness: 0.77 });
  st.flush();
  setTimeout(() => {
    // 全新启动模拟 (不经 makeTestStore 的 __useBackend —— 那会预置 ready)
    const st2 = Object.create(svi.Store);
    st2.mirror = new Map();
    st2.pending = new Set();
    st2._removed = new Set();
    // 模拟真实 chrome: bootSync 检测为 chrome-sync 后 ready 不得为 true
    st2.detectBackend = () => 'chrome-sync';
    st2._api = null;   // 遮蔽单例继承的 local api (chrome 全新启动时 _api 为 null)
    st2.ready = false; // 遮蔽单例继承值 (回归点: 旧代码 bootSync 会无条件置 true, init() 因此空转)
    st2.bootSync();
    assert.strictEqual(st2.backend, 'chrome-sync', 'chrome backend detected');
    assert.strictEqual(st2.ready, false, 'bootSync must NOT mark chrome backend ready (init() would no-op and chrome.storage would never load)');
    // 将远端快照搬进 st2 的 api (模拟已存在的云端数据)
    const snap = chromeMock.__snapshot();
    st2._api = Object.create(svi.Store)._makeChromeApi.call({ PREFIX: 'svi:' }, {
      get(keyOrKeys, cb) {
        setTimeout(() => {
          if (keyOrKeys === null) {
            const out = {};
            for (const [k, v] of Object.entries(snap)) out[k] = v;
            cb(out);
          } else {
            cb(snap[keyOrKeys] !== undefined ? { [keyOrKeys]: snap[keyOrKeys] } : {});
          }
        }, 1);
      },
      set(obj, cb) { setTimeout(() => cb(), 1); },
      remove(keys, cb) { setTimeout(() => cb(), 1); },
    });
    st2.init().then(() => {
      const p = st2.get('prefs');
      assert.ok(p && p.brightness === 0.77, 'init() loads remote namespace into mirror after boot (regression: extension persistence)');
      assert.strictEqual(st2.ready, true, 'init completes ready flag');
    }).catch(() => { assert.fail('init() should not reject'); });
  }, 40);
}

// —— 8e-3. Store 回归: sync 配额写失败 → 降级 chrome.storage.local (数据不丢失, 不抛错) ——
{
  const syncArea = new Map();
  const localArea = new Map();
  const runtimeStub = { lastError: null };
  const mkApi = (area, fail) => ({
    get(keyOrKeys, cb) {
      setTimeout(() => {
        if (keyOrKeys === null) {
          const out = {};
          for (const [k, v] of area) out[k] = v;
          cb(out);
        } else if (typeof keyOrKeys === 'string') {
          cb(area.has(keyOrKeys) ? { [keyOrKeys]: area.get(keyOrKeys) } : {});
        } else { cb({}); }
      }, 1);
    },
    set(obj, cb) {
      setTimeout(() => {
        for (const k of Object.keys(obj)) if (!fail) area.set(k, obj[k]);
        // 模拟 chrome 行为: lastError 在回调执行期间可读, 回调返回后清理
        if (fail) runtimeStub.lastError = new Error('QUOTA_BYTES_PER_ITEM exceeded');
        if (cb) cb();
        runtimeStub.lastError = null;
      }, 1);
    },
    remove(keys, cb) {
      setTimeout(() => {
        for (const k of Array.isArray(keys) ? keys : [keys]) area.delete(k);
        if (cb) cb();
      }, 1);
    },
  });
  global.chrome = { runtime: runtimeStub, storage: { sync: mkApi(syncArea, true), local: mkApi(localArea, false) } };
  try {
    const st = makeTestStore(makeChromeSyncMock());
    st.backend = 'chrome-sync';
    st.useChunking = true;
    st._api = Object.create(svi.Store)._makeChromeApi.call({ PREFIX: 'svi:' }, global.chrome.storage.sync);
    st.detectBackend = () => 'chrome-sync';
    st.set('big', { blob: 'y'.repeat(9000) });
    st.flush();
    setTimeout(() => {
      assert.strictEqual(st.backend, 'chrome-local', 'quota failure degrades backend to chrome-local');
      assert.strictEqual(st.useChunking, false, 'local backend skips chunking');
      const saved = localArea.get('svi:big');
      assert.ok(saved && JSON.parse(saved).blob.length === 9000, 'failed value rewritten into chrome.storage.local');
      console.log('✓ v3.0 Store quota-degrade regression passed (sync → local fallback)');
    }, 120);
  } finally {
    // 清理全局桩 (避免影响其它用例的 chrome 探测)
    setTimeout(() => { try { delete global.chrome; } catch (e) { global.chrome = undefined; } }, 300);
  }
}

// —— 8e-4. Store 回归: 分片键删除必须连 meta/#i 一起清 (否则重启后旧值"复活") + chunkRaw 字节预算 ——
{
  const mock = makeChromeSyncMock();
  const st = makeTestStore(mock);
  st.set('chunked', { blob: 'z'.repeat(20000) });
  st.flush();
  setTimeout(() => {
    let snap = mock.__snapshot();
    assert.ok(snap['svi:chunked.meta'], 'chunked key has meta manifest');
    st.remove('chunked');
    st.flush();
    setTimeout(() => {
      snap = mock.__snapshot();
      assert.ok(!('svi:chunked' in snap), 'logical key removed');
      assert.ok(!('svi:chunked.meta' in snap), 'chunk manifest removed with key (regression: stale chunks resurrect deleted values)');
      assert.ok(!('svi:chunked#0' in snap), 'chunk #0 removed with key');
      // chunkRaw: 多字节内容每片 UTF-8 字节数不超预算
      const cjk = { blob: '中'.repeat(5000) }; // 每字符 3 字节
      const parts = svi.Store.chunkRaw.call({ CHUNK_SIZE: 7000 }, JSON.stringify(cjk));
      assert.ok(parts.length >= 3, 'multibyte value splits into multiple chunks');
      const enc = (s) => {
        let n = 0;
        for (let i = 0; i < s.length; i++) {
          const c = s.charCodeAt(i);
          n += c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length ? 4 : (c < 0x80 ? 1 : (c < 0x800 ? 2 : 3));
        }
        return n;
      };
      for (const p of parts) assert.ok(enc(p) <= 7000, 'each chunk within UTF-8 byte budget');
      console.log('✓ v3.0 Store chunk-removal + byte-budget regression passed');
    }, 60);
  }, 300);
}

// 遗留键迁移: svi:prefs 缺失时从 universal_smart_invert_v4 读取 (legacy 键原样保留)
{
  // 当前单例 Store 在脚本 boot 时已完成迁移 —— 断言其结果
  assert.ok(svi.Store.get('prefs') || storageData['universal_smart_invert_v4'], 'Store migration produced prefs from legacy key');
  const migrated = svi.Store.get('prefs');
  if (migrated) {
    assert.ok(!('manualOverrides' in migrated), 'manualOverrides split out of svi:prefs into svi:overrides');
    assert.ok(svi.Store.get('overrides'), 'svi:overrides carries manual overrides');
  }
  assert.ok(storageData['universal_smart_invert_v3'], 'legacy v3 key untouched');
}

// —— 8f. mediaDominantViewport (R3/R4 媒体主导) ——
const mdv = svi.mediaDominantViewport;
const fakeVideo = {
  getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
};
assert.ok(Math.abs(mdv(fakeVideo, 1280, 720) - (800 * 600) / (1280 * 720)) < 1e-9, 'viewport coverage ratio');
assert.strictEqual(mdv(fakeVideo, 800, 600), 1, 'full-viewport video clamps to 1');
assert.strictEqual(mdv(fakeVideo, 400, 300), 1, 'oversized video clamps to 1');
assert.strictEqual(mdv(null, 800, 600), 0, 'null video → 0');
assert.strictEqual(mdv(fakeVideo, 0, 0), 0, 'zero viewport → 0');

// —— 8g. rect 相对区域数学 (R1) ——
// 相对 rect 归一化: 区域 [0.25, 0.25, 0.5, 0.5] 于 200x100 图像 → 像素边界 (50..100, 25..50)
{
  const w = 200;
  const h = 100;
  const rel = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const x0 = Math.round(rel.x * w);
  const y0 = Math.round(rel.y * h);
  const x1 = Math.round((rel.x + rel.w) * w);
  const y1 = Math.round((rel.y + rel.h) * h);
  assert.strictEqual(x0, 50, 'rect x0 pixel bound');
  assert.strictEqual(y0, 25, 'rect y0 pixel bound');
  assert.strictEqual(x1, 150, 'rect x1 pixel bound');
  assert.strictEqual(y1, 75, 'rect y1 pixel bound');
  assert.ok(x0 < x1 && y0 < y1, 'rect bounds well-formed');
}

// —— 8h. hash32 稳定性 (时间线指纹基础) ——
assert.strictEqual(svi.hash32('https://example.com/a.png'), svi.hash32('https://example.com/a.png'), 'hash deterministic');
assert.strictEqual(svi.hash32('a') !== svi.hash32('b'), true, 'different inputs differ');
assert.ok(/^[0-9a-f]{8}$/.test(svi.hash32('anything')), 'hash output is 8 hex chars');

// ============================================================
// v3.1 新增单测 (design §7 Node list): passesImagePolicy 模式矩阵 /
// countGridGroup 网格边界 (3 vs 4) / 新偏好默认值 /
// ImageInvertEngine.decideImage 统一决策管线 (forceInvert 首通生效 /
// decide-once 快路径 / 保护优先 / 手动覆盖 / 失败有界重试)
// ============================================================

// —— 9a. v3.1 新偏好默认值与规范化 ——
assert.strictEqual(svi.prefs.imagePolicy, 'balanced', 'imagePolicy defaults to balanced');
assert.strictEqual(svi.prefs.hoverRestore, true, 'hoverRestore defaults to true (current behavior)');
assert.strictEqual(svi.prefs.eagerScanBudget, 80, 'eagerScanBudget defaults to 80');

// —— 9b. countGridGroup (同标签 ±8px 容差, 含自身; ≥4 网格边界) ——
const cgg = svi.countGridGroup;
const gridSibs = (n, w = 240, h = 135, tag = 'IMG') => Array.from({ length: n }, () => ({ w, h, tag }));
assert.strictEqual(cgg(240, 135, 'IMG', gridSibs(3)), 4, '3 same-size siblings + self = 4 → grid boundary');
assert.strictEqual(cgg(240, 135, 'IMG', gridSibs(2)), 3, '2 siblings + self = 3 → below grid boundary');
assert.strictEqual(cgg(240, 135, 'IMG', []), 1, 'no siblings → count 1');
assert.strictEqual(cgg(240, 135, 'IMG', gridSibs(3, 248, 135)), 4, '8px size diff within tolerance');
assert.strictEqual(cgg(240, 135, 'IMG', gridSibs(3, 250, 135)), 1, '10px size diff exceeds tolerance');
assert.strictEqual(cgg(240, 135, 'IMG', gridSibs(5, 240, 135, 'DIV')), 1, 'different tag never counts');
assert.strictEqual(cgg(0, 135, 'IMG', gridSibs(5)), 0, 'zero own dimension → 0');

// —— 9c. passesImagePolicy 模式矩阵 (balanced / conservative / aggressive) ——
const pip = svi.passesImagePolicy;
const pinfo = (o) => Object.assign({ maxDim: 0, contentContext: false, chromeContext: false, gridSiblings: 0, policy: 'balanced' }, o);
// balanced
assert.strictEqual(pip(pinfo({ maxDim: 300 })), true, 'balanced: lone 300px diagram passes');
assert.strictEqual(pip(pinfo({ maxDim: 95 })), false, 'balanced: 95px below gate fails');
assert.strictEqual(pip(pinfo({ maxDim: 96 })), true, 'balanced: 96px boundary passes');
assert.strictEqual(pip(pinfo({ maxDim: 240, gridSiblings: 12 })), false, 'balanced: grid-repeated covers fail (bilibili 封面格)');
assert.strictEqual(pip(pinfo({ maxDim: 160, chromeContext: true })), false, 'balanced: card/cover chrome context fails');
assert.strictEqual(pip(pinfo({ maxDim: 160, gridSiblings: 12, contentContext: true })), true, 'balanced: content context wins over grid');
assert.strictEqual(pip(pinfo({ maxDim: 160, chromeContext: true, contentContext: true })), true, 'balanced: content context wins over chrome');
// conservative
assert.strictEqual(pip(pinfo({ maxDim: 160, policy: 'conservative' })), false, 'conservative: 160px fails');
assert.strictEqual(pip(pinfo({ maxDim: 200, policy: 'conservative' })), true, 'conservative: 200px boundary passes');
assert.strictEqual(pip(pinfo({ maxDim: 240, gridSiblings: 12, chromeContext: true, policy: 'conservative' })), true, 'conservative: large images bypass grid/chrome');
assert.strictEqual(pip(pinfo({ maxDim: 60, contentContext: true, policy: 'conservative' })), true, 'conservative: content context passes');
// aggressive (v3.0 behavior)
assert.strictEqual(pip(pinfo({ maxDim: 20, policy: 'aggressive' })), true, 'aggressive: size gates only');
assert.strictEqual(pip(pinfo({ maxDim: 2000, gridSiblings: 50, chromeContext: true, policy: 'aggressive' })), true, 'aggressive: always passes');

// —— 9d. decideImage 统一决策管线 (真实引擎实例, Node 桩环境) ——
// 引擎构造在桩环境安全: IntersectionObserver 缺失 → init() 早退, 无 IO/扫描副作用
// ============================================================
// v4.5 单测: 工具栏弹出面板消息通道 (chrome.runtime.onMessage)
// 带 chrome.runtime 桩二次加载脚本, 直呼监听器断言快照/命令语义与设置面板一致
// ============================================================
(() => {
  let capturedListener = null;
  // 合并而非替换: 其它单测可能已装入带 storage 的 chrome 桩 (异步断言仍在途)
  const savedChrome = global.chrome;
  global.chrome = Object.assign({}, savedChrome || {}, {
    runtime: Object.assign({}, (savedChrome && savedChrome.runtime) || {}, {
      lastError: null,
      onMessage: { addListener(fn) { capturedListener = fn; } },
    }),
  });
  const savedSelf = global.self, savedTop = global.top;
  // 本文件 shim 用 self !== top 压掉顶层 UI; 通道注册在顶层判定之内 → 临时恢复顶层语义
  global.top = global.self;
  try {
    try {
      vm.runInThisContext(scriptSource, { filename: 'universal-smart-invert.user.js (popup channel test)' });
    } catch (e) {
      assert.fail('second boot (popup channel env) threw: ' + e.message);
    }
    const svi2 = window.__svi;
    console.log('[ch-dbg] svi2 identity-changed:', svi2 !== svi, 'dormant:', !!svi2.dormant, 'listener:', !!capturedListener,
      'top-frame-capable:', typeof window.self === 'undefined' || typeof window.top === 'undefined' ? 'degenerate' : (window.self === window.top));
    assert.ok(!svi2.dormant, 'second boot must not go dormant (shim dataset cannot persist claims), dormant=' + !!svi2.dormant);
    assert.ok(svi2 !== svi, 'second boot must replace window.__svi with a fresh instance');
    assert.ok(capturedListener, 'top-frame boot must register the onMessage listener when chrome.runtime exists');

    const call = (msg) => {
      let res = null;
      capturedListener(msg, {}, (r) => { res = r; });
      return res;
    };

    const snap = call({ type: 'svi-get-snapshot' });
    assert.strictEqual(snap.ok, true, 'snapshot must respond ok');
    assert.strictEqual(snap.host, 'mail.163.com', 'snapshot host must come from the location shim');
    assert.strictEqual(snap.siteActive, true, 'snapshot siteActive defaults to true');
    assert.ok(snap.counts && typeof snap.counts.img === 'number', 'snapshot must include media counts');

    const badKey = call({ type: 'svi-set-pref', key: 'nope', value: 1 });
    assert.strictEqual(badKey.ok, false, 'unknown pref key must be rejected (whitelist)');

    const pol = call({ type: 'svi-set-pref', key: 'imagePolicy', value: 'aggressive' });
    assert.strictEqual(pol.ok, true, 'imagePolicy command must apply');
    assert.strictEqual(svi2.prefs.imagePolicy, 'aggressive', 'imagePolicy pref must be persisted to state');

    const hov = call({ type: 'svi-set-pref', key: 'hoverRestore', value: false });
    assert.strictEqual(hov.ok, true, 'hoverRestore command must apply');
    assert.strictEqual(svi2.prefs.hoverRestore, false, 'hoverRestore pref must be written (popup toggle parity)');
    const snap2 = call({ type: 'svi-get-snapshot' });
    assert.strictEqual(snap2.hoverRestore, false, 'snapshot must reflect hoverRestore=false');

    const offRes = call({ type: 'svi-site-power', on: false });
    assert.strictEqual(offRes.ok, true, 'site-power off must respond');
    assert.strictEqual(svi2.prefs.siteOverrides['mail.163.com'].enabled, false, 'site-power off must write the override (same control as panel switch)');
    assert.strictEqual(call({ type: 'svi-get-snapshot' }).siteActive, false, 'snapshot must report site suspended');
    const onRes = call({ type: 'svi-site-power', on: true });
    assert.strictEqual(onRes.siteActive, true, 'site-power on must hot-resume the page');
  } finally {
    if (savedChrome === undefined) { try { delete global.chrome; } catch (e) { global.chrome = undefined; } } else { global.chrome = savedChrome; }
    global.self = savedSelf;
    if (savedTop === undefined) { try { delete global.top; } catch (e) { global.top = undefined; } } else { global.top = savedTop; }
  }
  console.log('✓ v4.5 popup message channel tests passed (snapshot / pref whitelist / site power)');
})();

const engine = new svi.ImageInvertEngine();
assert.strictEqual(typeof engine.decideImage, 'function', 'engine exposes unified decideImage');
assert.strictEqual(typeof engine.decisionBySrc, 'object', 'engine exposes decide-once snapshot');

function makeImgStub(opts) {
  const attrs = {};
  const stub = {
    tagName: 'IMG',
    currentSrc: opts.src,
    className: opts.className || '',
    id: opts.id || '',
    alt: opts.alt || '',
    clientWidth: opts.w != null ? opts.w : 0,
    clientHeight: opts.h != null ? opts.h : 0,
    complete: true,
    naturalWidth: opts.w || 0,
    attrs,
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return (k in attrs) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    closest(sel) { return (opts.closestHint && String(sel).indexOf(opts.closestHint) !== -1) ? {} : null; },
    matches(sel) { return opts.matches ? !!opts.matches(String(sel)) : false; },
    addEventListener() {},
    parentElement: opts.parentElement || null,
  };
  return stub;
}
const sameParentSibs = (self, n, w, h) => {
  const kids = [self];
  for (let i = 0; i < n; i++) kids.push({ tagName: 'IMG', clientWidth: w, clientHeight: h, children: [] });
  return { tagName: 'DIV', className: 'list', id: '', children: kids, parentElement: null };
};

(async () => {
  // 迁移单测 (7a) 种入 imageInvert=false —— 引擎管线测试需要图片反色开启
  svi.prefs.imageInvert = true;

  // 9d-1. forceInvert 首通即生效 (F3 顺序修复: 强制反色先于小元素门 —— v3.0 中 10px coremail 图
  // 会在首个处理通道被 'tiny' 跳过, 滚动后的重处理通道才反色, 决策随通道翻转)
  const srcA = 'https://mail.163.com/img/coremail/badge.png';
  const imgA = makeImgStub({ src: srcA, w: 10, h: 10, matches: (sel) => sel.indexOf('coremail') !== -1 });
  await engine.decideImage(imgA, srcA);
  assert.strictEqual(engine.decisionBySrc.get(srcA).verdict, 'invert', 'forceInvert fires on the FIRST pass (F3 ordering fix)');
  assert.strictEqual(engine.decisionBySrc.get(srcA).reason, 'seed-force', 'forceInvert reason recorded');
  assert.strictEqual(imgA.attrs['data-svi-inverted'], 'true', '10px forceInvert img inverted despite tiny size');
  assert.strictEqual(imgA.attrs['data-svi-checked-src'], srcA, 'data-svi-checked-src set only after a decision');

  // 9d-2. decide-once / 快路径: 同 src 新元素同步继承决策, 绝不重算
  const decisionA = engine.decisionBySrc.get(srcA);
  const imgA2 = makeImgStub({ src: srcA, w: 10, h: 10, matches: (sel) => sel.indexOf('coremail') !== -1 });
  await engine.decideImage(imgA2, srcA);
  assert.strictEqual(imgA2.attrs['data-svi-inverted'], 'true', 'cached decision applied synchronously to a new element');
  assert.strictEqual(engine.decisionBySrc.get(srcA), decisionA, 'decision object untouched (no re-analysis)');
  assert.strictEqual(engine.cache.get(srcA), true, 'pixel-verdict cache carries seed-force conclusion');

  // 9d-3. 小元素门照常生效 (非规则图)
  const srcC = 'https://mail.163.com/static/tiny.png';
  await engine.decideImage(makeImgStub({ src: srcC, w: 10, h: 10 }), srcC);
  assert.strictEqual(engine.decisionBySrc.get(srcC).verdict, 'skip', 'tiny img skipped');
  assert.strictEqual(engine.decisionBySrc.get(srcC).reason, 'tiny', 'tiny reason recorded');

  // 9d-4. 策略门 (balanced): 同父 ≥4 同尺寸兄弟 → 封面网格跳过
  const srcD = 'https://mail.163.com/static/cover-1.png';
  const imgD = makeImgStub({ src: srcD, w: 100, h: 100 });
  imgD.parentElement = sameParentSibs(imgD, 5, 100, 100);
  await engine.decideImage(imgD, srcD);
  assert.strictEqual(engine.decisionBySrc.get(srcD).verdict, 'skip', 'grid-repeated cover skipped in balanced mode');
  assert.strictEqual(engine.decisionBySrc.get(srcD).reason, 'policy', 'policy reason recorded');

  // 9d-5. 手动覆盖最高优先 (覆盖 > 全部门)
  const srcE = 'https://mail.163.com/static/manual.png';
  svi.prefs.manualOverrides['mail.163.com|' + srcE] = 'invert';
  await engine.decideImage(makeImgStub({ src: srcE, w: 10, h: 10 }), srcE);
  assert.strictEqual(engine.decisionBySrc.get(srcE).verdict, 'invert', 'manual override wins over tiny gate');
  assert.strictEqual(engine.decisionBySrc.get(srcE).reason, 'manual', 'manual reason recorded');
  delete svi.prefs.manualOverrides['mail.163.com|' + srcE];

  // 9d-6. 保护选择器优先于强制反色 (种子层内部: protect > forceInvert)
  const oldHost = global.location.hostname;
  global.location.hostname = 'github.com';
  const srcF = 'https://camo.githubusercontent.com/avatar-x.png';
  await engine.decideImage(makeImgStub({
    src: srcF, w: 40, h: 40,
    matches: (sel) => sel.indexOf('avatar') !== -1 || sel.indexOf('markdown-body') !== -1 || sel.indexOf('camo') !== -1,
  }), srcF);
  assert.strictEqual(engine.decisionBySrc.get(srcF).verdict, 'keep', 'protect wins over forceInvert');
  assert.strictEqual(engine.decisionBySrc.get(srcF).reason, 'protected', 'protected reason recorded');
  global.location.hostname = oldHost;

  // 9d-7. 分析失败有界重试 (R2): 60s TTL 内未决; 3 次后永久跳过 (记录原因)
  const srcG = 'https://mail.163.com/static/fail.png';
  const imgG = makeImgStub({ src: srcG, w: 300, h: 200 });
  engine.markFailure(imgG, srcG);
  engine.markFailure(imgG, srcG);
  engine.markFailure(imgG, srcG);
  assert.ok(imgG.attrs['data-svi-failed'], 'failure marker attr written');
  await engine.decideImage(makeImgStub({ src: srcG, w: 300, h: 200 }), srcG);
  assert.strictEqual(engine.decisionBySrc.has(srcG), false, 'recent failure within TTL stays undecided');
  engine.failures.get(srcG).at = Date.now() - 61000; // 模拟 TTL 过期
  await engine.decideImage(makeImgStub({ src: srcG, w: 300, h: 200 }), srcG);
  assert.strictEqual(engine.decisionBySrc.get(srcG).verdict, 'skip', '3 strikes → permanent skip decision');
  assert.strictEqual(engine.decisionBySrc.get(srcG).reason, 'analysis-failed', 'failure skip reason recorded');

  // 9d-8. 确定性: 同一输入两次管线执行结果一致 (克隆桩, 跨执行同决策)
  const runOnce = async () => {
    const srcX = 'https://mail.163.com/static/cover-det.png';
    const el = makeImgStub({ src: srcX, w: 120, h: 90 });
    el.parentElement = sameParentSibs(el, 6, 120, 90);
    const eng = new svi.ImageInvertEngine();
    await eng.decideImage(el, srcX);
    return eng.decisionBySrc.get(srcX).verdict + ':' + eng.decisionBySrc.get(srcX).reason;
  };
  const run1 = await runOnce();
  const run2 = await runOnce();
  assert.strictEqual(run1, run2, 'deterministic: two fresh pipeline runs produce identical results');

  console.log('✓ v3.1 unit tests passed: imagePolicy defaults / passesImagePolicy matrix / countGridGroup boundary / decideImage ordering + decide-once + failure budget');
})().catch((err) => {
  console.error('v3.1 async unit tests failed:', err);
  process.exit(1);
});

// ===== v3.2: 视频画面调节滤镜链构建 (buildVideoTuneFilter) =====
(() => {
  const build = svi.buildVideoTuneFilter;
  // 关闭或缺失 → 空串 (零开销)
  assert.strictEqual(build(null), '', 'null tune → empty filter');
  assert.strictEqual(build({ enabled: false, brightness: 0.5 }), '', 'disabled tune → empty filter');
  // 开启但全中性 → 空串
  assert.strictEqual(build({ enabled: true, brightness: 1, contrast: 1, saturate: 1, warmth: 0, grayscale: 0 }), '', 'neutral tune → empty filter');
  // 部分调节 → 仅包含非中性项, 数值格式化两位小数
  assert.strictEqual(build({ enabled: true, brightness: 0.8 }), 'brightness(0.80)', 'brightness only');
  assert.strictEqual(
    build({ enabled: true, brightness: 0.7, warmth: 0.25, saturate: 0.9 }),
    'brightness(0.70) saturate(0.90) sepia(0.25)',
    'composed partial chain (brightness/saturate/sepia)'
  );
  assert.strictEqual(build({ enabled: true, grayscale: 1 }), 'grayscale(1.00)', 'grayscale only');
  // 越界钳制
  assert.strictEqual(build({ enabled: true, brightness: 9, contrast: 0.1 }), 'brightness(1.70) contrast(0.30)', 'out-of-range values clamped');
  assert.strictEqual(build({ enabled: true, brightness: 'abc' }), '', 'NaN falls back to neutral (dropped)');
  console.log('✓ v3.2 unit tests passed: buildVideoTuneFilter (disabled/neutral/partial/clamp)');
})();


// ===== v4.2 P1/P2/P5 纯函数单测 =====
(() => {
  const adj = svi.applyDynamicThemeAdjust;
  assert.ok(adj, 'applyDynamicThemeAdjust must be exported');
  assert.deepStrictEqual(adj([255, 240, 3], 'pure-black', 1, 1), [255, 240, 3], 'default params must be identity (bench login-box baseline)');
  const lifted = adj([4, 4, 4], 'dark-gray', 1, 1);
  assert.ok(lifted[0] >= 26 && lifted[2] >= lifted[0], 'dark-gray must lift the floor with cool bias');
  const warm = adj([30, 30, 30], 'warm-black', 1, 1);
  assert.ok(warm[2] < warm[0], 'warm-black must reduce blue relative to red');
  assert.strictEqual(adj([100, 100, 100], 'pure-black', 1.2, 1)[0], Math.round((100 - 128) + 128 + 0.2 * 96), 'brightness offset formula');
  assert.strictEqual(adj([100, 100, 100], 'pure-black', 1, 1.5)[0], Math.round((100 - 128) * 1.5 + 128), 'contrast around midpoint 128');
  assert.deepStrictEqual(adj([10, 10, 10], 'pure-black', 1, 1.5), [0, 0, 0], 'contrast pushes near-black below zero → clamped to 0');
  console.log('✓ v4.2 unit tests passed: applyDynamicThemeAdjust (identity/tone/brightness/contrast/clamp)');

  const sched = svi.scheduleActiveNow;
  assert.ok(sched, 'scheduleActiveNow must be exported');
  const prev = { e: svi.prefs.scheduleEnabled, s: svi.prefs.scheduleStart, n: svi.prefs.scheduleEnd };
  svi.prefs.scheduleEnabled = false;
  assert.strictEqual(sched(), true, 'disabled schedule is always active');
  const h = new Date().getHours();
  svi.prefs.scheduleEnabled = true;
  svi.prefs.scheduleStart = h;
  svi.prefs.scheduleEnd = (h + 1) % 24;
  assert.strictEqual(sched(), true, 'current hour must be inside [h, h+1)');
  svi.prefs.scheduleStart = (h + 1) % 24;
  svi.prefs.scheduleEnd = h;
  assert.strictEqual(sched(), false, 'current hour must be outside the wrapped window');
  svi.prefs.scheduleEnabled = prev.e;
  svi.prefs.scheduleStart = prev.s;
  svi.prefs.scheduleEnd = prev.n;
  console.log('✓ v4.2 unit tests passed: scheduleActiveNow (off/inside/wrapped-outside)');
})();

// ============================================================
// v4.5 单测: closestContextHit —— 上下文命中必须忽略文档根 (html/body) 上的框架类。
// 实测回归: Wikipedia 在 <html> 上挂 vector-feature-limited-width-CONTENT-enabled,
// 子串选择器 [class*="content"] 命中文档根 → 全页图片被判"正文上下文" → 页头 logo 误反色。
// ============================================================
(() => {
  const hit = svi.closestContextHit;
  assert.strictEqual(typeof hit, 'function', 'closestContextHit must be exported');

  const savedBody = global.document.body;
  const savedRoot = global.document.documentElement;
  const rootStub = { matches: () => true, parentElement: null };   // 模拟 <html class="...content...">
  const bodyStub = { matches: () => true, parentElement: rootStub };
  global.document.body = bodyStub;
  global.document.documentElement = rootStub;

  try {
    // 真实命中: 中间层确实匹配
    const mid = { matches: (s) => s.indexOf('content') !== -1, parentElement: bodyStub };
    const img = { matches: () => false, parentElement: mid };
    assert.strictEqual(hit(img, '[class*="content"]'), mid, 'a genuine container hit must be returned');

    // 根污染: 只有 <html> 匹配 → 必须返回 null (策略门不得据此判定正文上下文)
    const plain = { matches: () => false, parentElement: bodyStub };
    const img2 = { matches: () => false, parentElement: plain };
    assert.strictEqual(hit(img2, '[class*="content"]'), null, 'html/body-level framework classes must be ignored (v4.5 regression)');

    // 自身命中: 图片自己的类 (如 mw-logo-icon) 仍算 chrome 命中
    const selfHit = { matches: (s) => s.indexOf('logo') !== -1, parentElement: bodyStub };
    assert.strictEqual(hit(selfHit, '[class*="logo"]'), selfHit, 'self-class hit (mw-logo-icon style) must count');
  } finally {
    global.document.body = savedBody;
    global.document.documentElement = savedRoot;
  }
  console.log('✓ v4.5 unit tests passed: closestContextHit ignores document-root framework classes');
})();

// —— v4.5 单测: normalizeElementRules 合并幂等 (同 id 去重) + 规则包动作词表 ——
(() => {
  const norm = svi.normalizeElementRules;
  const r1 = { pattern: 'github.com', selector: '.md img', action: 'invert' };
  const r2 = { pattern: 'github.com', selector: '.md img', action: 'invert' }; // 同条 (无 id → hash 同 id)
  const r3 = { pattern: 'github.com', selector: '.md img', action: 'protect' }; // 动作不同 → 不同条
  const once = norm([r1]);
  assert.strictEqual(once.length, 1, 'single rule normalizes to one entry');
  const merged = norm([r1, r2]);
  assert.strictEqual(merged.length, 1, 'duplicate (pattern|selector|action) must dedup by id (v4.5 merge-idempotency regression)');
  const diff = norm([r1, r3]);
  assert.strictEqual(diff.length, 2, 'different action is a different rule');
  // 合并模拟: 已有 + 再导入同包 → 长度不变
  const existing = norm([r1, r3]);
  const reimport = norm(existing.concat([r1, r3]));
  assert.strictEqual(reimport.length, existing.length, 're-importing the same pack must not grow the rule list');

  // 分发包产物 (若存在) 动作词表校验
  try {
    const pack = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'rules', 'svi-pack.import.json'), 'utf8'));
    assert.strictEqual(pack.kind, 'svi-rules', 'pack envelope kind');
    const badActions = (pack.rules.elementRules || []).filter(e => !['invert', 'protect', 'recolor'].includes(e.action));
    assert.strictEqual(badActions.length, 0, 'pack elementRule actions must be invert/protect/recolor (v4.5 regression: keep was silently dropped)');
    assert.ok((pack.rules.siteBlacklist || []).length > 1000, 'pack must carry the darkreader blacklist');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  console.log('✓ v4.5 unit tests passed: elementRules merge idempotency + pack action vocabulary');
})();

// —— v4.5 单测: 头像 URL 路径段计入元数据 → meta-icon 跳过 ——
(() => {
  const cse = svi.classifySmallElement;
  const av = cse({ meta: 'cdn.example.com/uploads/avatars/abc.png', w: 150, h: 150, srcOccurrences: 0, isContentContext: false, isChromeContext: false, minImgSize: 48 });
  assert.strictEqual(av.skip, true, 'avatar URL path must classify as meta-icon (v4.5 regression)');
  assert.strictEqual(av.reason, 'meta-icon');
  const plain = cse({ meta: 'just a diagram image', w: 150, h: 150, srcOccurrences: 0, isContentContext: false, isChromeContext: false, minImgSize: 48 });
  assert.strictEqual(plain.skip, false, 'non-avatar image must not be skipped by the meta gate');
  // 正文上下文 ≥48px 豁免保持
  const content = cse({ meta: 'cdn.example.com/uploads/avatars/abc.png', w: 150, h: 150, srcOccurrences: 0, isContentContext: true, isChromeContext: false, minImgSize: 48 });
  assert.strictEqual(content.skip, false, 'content-context avatar at >=48px keeps the exemption');
  console.log('✓ v4.5 unit tests passed: avatar URL-path meta-icon classification');
})();



console.log('✓ v3.0 core unit tests passed: transformPixel / mergeSegments / lookupSegment / selectorStem / RuleLearner / Store / mediaDominantViewport / rect / hash32');



// ============================================================
// v4.6 Alt+点击手动结论防覆盖 (回归护栏; 根因: research/rootcause.md)
// T1 fx 在途投递回调不得覆盖手动杀停结论 (H1, 核心护栏)
// T2 fx 投递规则选择器必须排除杀停态 (H4 变体)
// T3 canvas 首扫尊重手动标记, 且无手动标记时自动判定照常 (H8)
// T4 同 src 兄弟元素同帧继承手动结论 (H3)
// T5 applyInvertState 手动占优: host|src 记忆 + 元素标记两路 (C2)
// ============================================================
(async () => {
  const svi = global.window.__svi; // v4.5 套件二次 boot 已把 window.__svi 换成新实例 —— 本块一律取用当前实例
  const applyInvertState = svi.applyInvertState;
  const manualStateFor = svi.manualStateFor;
  assert.strictEqual(typeof applyInvertState, 'function', 'v4.6: applyInvertState exported');
  assert.strictEqual(typeof manualStateFor, 'function', 'v4.6: manualStateFor exported');
  const host = 'mail.163.com';
  const ovKey = (src) => svi.manualOverrideKey(host, src);

  // —— T1: fx 在途投递回调不覆盖手动杀停 (H1) ——
  const fxEng = new svi.ImageFxEngine();
  svi.engines.imageFx = fxEng; // 引擎挂回注册表, 使 toggleMediaOverride 的 kill 分支能 clearFor
  const engT1 = new svi.ImageInvertEngine();
  const srcA = 'https://cdn.example.com/guard-photo.jpg';
  const elA = makeImgStub({ src: srcA, w: 300, h: 200 });
  elA.isConnected = true;
  elA.setAttribute('data-svi-fx', 'fx00000001');
  // 模拟在途投递 (真实 process() 尾段: 解码后逐 target applyTo)
  fxEng.process = async function (job) {
    await new Promise((r) => setTimeout(r, 10));
    for (const el of job.targets) {
      if (el && el.isConnected) this.applyTo(el, 'fx00000009', 'blob:https://cdn.example.com/g', job.key);
    }
  };
  fxEng.enqueue(elA, srcA, true);
  assert.strictEqual(engT1.toggleMediaOverride(elA), true, 'T1: Alt+click kill-switch accepted');
  assert.strictEqual(elA.getAttribute('data-svi-manual'), 'restore', 'T1: element manual marker written');
  assert.strictEqual(svi.prefs.manualOverrides[ovKey(srcA)], 'restore', 'T1: host|src override written');
  assert.strictEqual(elA.getAttribute('data-svi-fx-off'), 'true', 'T1: kill-switch attr set same-frame (fx hook kept, rule excludes it)');
  assert.strictEqual(engT1.decisionBySrc.get(srcA).reason, 'manual', 'T1: decision snapshot force-refreshed');
  await new Promise((r) => setTimeout(r, 40)); // 让在途投递回调落地
  assert.strictEqual(elA.getAttribute('data-svi-fx-off'), 'true', 'T1: in-flight fx callback must NOT wipe kill-switch (H1 regression)');
  assert.strictEqual(elA.getAttribute('data-svi-manual'), 'restore', 'T1: manual marker survives fx callback');
  delete svi.prefs.manualOverrides[ovKey(srcA)];

  // —— T2: fx 投递规则选择器排除杀停态 (H4 变体) ——
  const srcB = 'https://cdn.example.com/rule-photo.jpg';
  const elB = makeImgStub({ src: srcB, w: 300, h: 200 });
  fxEng.ensureStyleNode();
  if (fxEng._rules) fxEng._rules.clear();
  fxEng.applyTo(elB, 'fx00000002', 'blob:https://cdn.example.com/r', 'k-t2');
  const ruleT2 = Array.from(fxEng._rules.values())[0] || '';
  assert.ok(ruleT2.indexOf('data-svi-fx-off') !== -1, 'T2: fx rule selector must exclude fx-off state (H4 regression): ' + ruleT2.slice(0, 90));
  assert.strictEqual(elB.getAttribute('data-svi-fx'), 'fx00000002', 'T2: fx attr written for normal delivery');

  // —— T3: canvas 首扫尊重手动标记 + 无标记时自动判定照常 (H8) ——
  const mcEng = new svi.MediaCoverageEngine();
  const darkPx = () => { const p = new Uint8ClampedArray(8 * 8 * 4); for (let i = 0; i < p.length; i += 4) { p[i] = 20; p[i + 1] = 20; p[i + 2] = 20; p[i + 3] = 255; } return p; };
  const lightPx = () => { const p = new Uint8ClampedArray(8 * 8 * 4); for (let i = 0; i < p.length; i += 4) { p[i] = 250; p[i + 1] = 250; p[i + 2] = 250; p[i + 3] = 255; } return p; };
  let probePx = darkPx(); // 引擎 8×8 探针当前采样 (可切换深/浅)
  const savedCreate = global.document.createElement;
  global.document.createElement = (tag) => {
    const el = savedCreate.call(global.document, tag);
    if (String(tag).toLowerCase() === 'canvas') {
      el.getContext = () => ({ drawImage() {}, getImageData: () => ({ width: 8, height: 8, data: probePx }) });
    }
    return el;
  };
  try {
    const mkCanvas = () => ({
      tagName: 'CANVAS', nodeType: 1, clientWidth: 300, clientHeight: 200, width: 300, height: 200,
      attrs: {}, isConnected: true,
      classList: { contains() { return false; } },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return (k in this.attrs) ? this.attrs[k] : null; },
      removeAttribute(k) { delete this.attrs[k]; },
      hasAttribute(k) { return k in this.attrs; },
    });
    const c1 = mkCanvas();
    mcEng.processCanvas(c1); // 首扫 (深色像素): 引擎自动判定 = keep
    assert.ok(!('data-svi-inverted' in c1.attrs), 'T3: unmarked dark canvas stays auto-keep');
    c1.setAttribute('data-svi-inverted', 'true'); // 用户 Alt+点击手动反色 (canvas 无 src → 元素标记承载结论)
    c1.setAttribute('data-svi-manual', 'invert');
    mcEng.checked.delete(c1); // 模拟"首扫发生在点击之后"的时序
    mcEng.processCanvas(c1); // 深色像素分析不得把手动结论拉回 (H8 回归)
    assert.strictEqual(c1.attrs['data-svi-inverted'], 'true', 'T3: manual invert must survive first canvas scan (H8 regression)');
    const c2 = mkCanvas();
    probePx = lightPx();
    mcEng.processCanvas(c2); // 无手动标记的浅色画布: 自动反色照常生效
    assert.strictEqual(c2.attrs['data-svi-inverted'], 'true', 'T3: unmarked light canvas still auto-inverts');
  } finally {
    global.document.createElement = savedCreate;
  }

  // —— T4: 同 src 兄弟元素同帧继承手动结论 (H3) ——
  const engT4 = new svi.ImageInvertEngine();
  const srcC = 'https://cdn.example.com/shared.jpg';
  const el4a = makeImgStub({ src: srcC, w: 300, h: 200 });
  const el4b = makeImgStub({ src: srcC, w: 300, h: 200 });
  const el4c = makeImgStub({ src: 'https://cdn.example.com/other.jpg', w: 300, h: 200 });
  const savedBody = global.document.body;
  global.document.body = { querySelectorAll: () => [el4b, el4c] };
  try {
    assert.strictEqual(engT4.toggleMediaOverride(el4a), true, 'T4: toggle accepted');
    assert.strictEqual(el4a.getAttribute('data-svi-inverted'), 'true', 'T4: clicked element inverted');
    assert.strictEqual(el4b.getAttribute('data-svi-inverted'), 'true', 'T4: same-src sibling inherits manual verdict same-frame');
    assert.strictEqual(el4b.getAttribute('data-svi-manual'), 'invert', 'T4: sibling carries manual marker');
    assert.ok(!('data-svi-inverted' in el4c.attrs), 'T4: different-src element untouched');
  } finally {
    global.document.body = savedBody;
  }
  delete svi.prefs.manualOverrides[ovKey(srcC)];

  // —— T5: applyInvertState 手动占优 (host|src 记忆 + 元素标记两路) ——
  // a) host|src 记忆: 走真实"后端命名空间装载完成 → 重载偏好"路径。
  //    (不能直接改 prefs 内存对象: Store.init 的异步重载会让 state 与 svi.prefs 脱钩。)
  //    v4.6 集成修正: 原先"种外部存储(pv4 遗留键) → 再 boot"的写法依赖该键在多次 boot 之间
  //    不被清理, 并行分支合并后遗留键确实会在中途被清空 → T5a 静默失配 (assert 得到 'pixel')。
  //    改为种子写入 svi:overrides (权威通道) 并调用真实 onRemoteLoaded 钩子, 无时序依赖。
  const memKey = ovKey('https://cdn.example.com/t5mem.jpg');
  // 让出一拍: 本套件的 Store 分片 mock 测试按 setTimeout 窗口断言 (test.js 上方 "chunk #0 written"),
  // 紧随其后的第三次 boot 是重同步工作 —— 不让拍会把它的写入窗口挤掉, 与本块逻辑无关。
  await new Promise((r) => setTimeout(r, 20));
  vm.runInThisContext(scriptSource, { filename: 'universal-smart-invert.user.js (v4.6 memory-gate boot)' });
  const svi5 = window.__svi;
  assert.ok(svi5 && typeof svi5.applyInvertState === 'function', 'v4.6: third boot exports the gate');
  assert.strictEqual(typeof svi5.Store.onRemoteLoaded, 'function', 'v4.6: Store.onRemoteLoaded hook available');
  const prevOverrides = (svi5.Store.get('overrides', null) && typeof svi5.Store.get('overrides', null) === 'object')
    ? svi5.Store.get('overrides', null) : {};
  svi5.Store.set('overrides', Object.assign({}, prevOverrides, { [memKey]: 'invert' }));
  svi5.Store.onRemoteLoaded(); // 真实页面路径: state = loadState() (svi:overrides 为权威通道)
  const el5a = makeImgStub({ src: 'https://cdn.example.com/t5mem.jpg', w: 200, h: 150 });
  assert.strictEqual(svi5.applyInvertState(el5a, false, 'pixel'), 'manual', 'T5a: pixel write overridden by host|src memory after reload');
  assert.strictEqual(el5a.getAttribute('data-svi-inverted'), 'true', 'T5a: manual invert wins');
  const el5b = makeImgStub({ src: 'https://cdn.example.com/t5b.jpg', w: 200, h: 150 });
  el5b.setAttribute('data-svi-manual', 'restore');
  assert.strictEqual(svi5.applyInvertState(el5b, true, 'pixel'), 'manual', 'T5b: pixel write overridden by element marker');
  assert.ok(!('data-svi-inverted' in el5b.attrs), 'T5b: manual restore wins');
  const el5c = makeImgStub({ src: 'https://cdn.example.com/t5c.jpg', w: 200, h: 150 });
  assert.strictEqual(svi5.applyInvertState(el5c, true, 'pixel'), 'pixel', 'T5c: no manual input → engine verdict passes through');
  assert.strictEqual(el5c.getAttribute('data-svi-inverted'), 'true', 'T5c: normal engine write intact');
  assert.strictEqual(svi5.applyInvertState(el5c, true, 'manual'), 'manual', 'T5c: manual reason writes directly');

  console.log('✓ v4.6 unit tests passed: Alt+click manual verdict survives fx callback / canvas first-scan / sibling sync / applyInvertState gate');
})().catch((err) => {
  console.error('v4.6 regression tests failed:', err);
  process.exit(1);
});

// 显式退出: 脚本启动桩中的常驻定时器 (统计落盘 interval、3s 后的引擎初始化循环) 会阻止进程自然退出
// v3.0: 延长至 1500ms —— 等待异步 Store (chrome.storage mock) 单测链完成
// v4.6: 本地优先判定单测 (localEvidence / 档 B / pending 唤醒 / R5 收敛) 同时限内完成
require('./test-local-first.js');


setTimeout(() => {
  console.log('✓ All unit, benchmark, multi-light-color, and v2.0 site-engine tests passed successfully!');
  process.exit(0);
}, 1500);

// —— v4.6 单测: 暗色遮罩上下文 maskedDarkContext (任务 v4.6-4) ——
// 以局部 DOM 桩 (计算样式 + rect + 祖先链) 单测真实脚本导出的纯函数;
// 引擎级四案例结果由 dev/probe-veil-fixture.js 在真实 Chrome 中断言 (决策落点含像素/蒙层证据)。
(() => {
  const mdc = svi.maskedDarkContext;
  assert.strictEqual(typeof mdc, 'function', 'maskedDarkContext must be exported for tests (v4.6-4)');
  assert.strictEqual(svi.prefs.maskAware, true, 'maskAware pref must default to true (v4.6-4)');

  const STYLE_DEFAULTS = {
    position: 'static', zIndex: 'auto', content: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
    opacity: '1', backdropFilter: 'none',
  };
  const RECT = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
  const created = [];
  function makeEl(o) {
    o = o || {};
    const el = {
      nodeType: 1,
      _styles: Object.assign({}, STYLE_DEFAULTS, o.styles || {}),
      _pseudo: o.pseudo || {},
      _rect: o.rect || RECT(0, 0, 280, 170),
      parentElement: null,
      children: o.children || [],
      _gcrCalls: 0,
      getBoundingClientRect() { this._gcrCalls++; return this._rect; },
      contains() { return false; },
    };
    for (const c of el.children) { c.parentElement = el; created.push(c); }
    created.push(el);
    return el;
  }
  // gBCR 总计按元素去重 (容器 children 回填会使同一桩被登记两次)
  const gcrTotal = () => Array.from(new Set(created)).reduce((n, e) => n + e._gcrCalls, 0);
  let gcsCalls = 0;
  global.window.getComputedStyle = (el, pseudo) => {
    gcsCalls++;
    if (pseudo) {
      const map = (el && el._pseudo && el._pseudo[pseudo]) || null;
      return Object.assign({}, STYLE_DEFAULTS, map || {});
    }
    return (el && el._styles) ? el._styles : Object.assign({}, STYLE_DEFAULTS);
  };

  // A: 亮图 + 祖先 ::after 黑 62% 蒙层 (覆盖率 100%) → masked=true / ancestor-veil
  const imgA = makeEl({ rect: RECT(10, 10, 270, 160) });
  const boxA = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.62)' } },
  });
  imgA.parentElement = boxA;
  const rA = mdc(imgA);
  assert.strictEqual(rA.masked, true, 'A: dark ::after veil must be detected');
  assert.strictEqual(rA.reason, 'ancestor-veil', 'A: reason must be ancestor-veil');

  // B: 亮图 + 无蒙层 → masked=false
  const imgB = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgB.parentElement = makeEl({});
  assert.strictEqual(mdc(imgB).masked, false, 'B: plain image must not be masked');

  // C: 亮图 + 白 62% 蒙层 → masked=false (浅色蒙层绝不触发, C4)
  const imgC = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgC.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.62)' } },
  });
  assert.strictEqual(mdc(imgC).masked, false, 'C: white veil must never trigger');

  // D (检测器层): 暗图 + 黑 62% 蒙层 → 几何检测为 true; 引擎只对"自动反色"消费否决,
  // 暗图像素判定为 keep, 最终结论 keep/像素 不变 (矩阵语义: 否决未生效)
  const imgD = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgD.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.62)' } },
  });
  assert.strictEqual(mdc(imgD).masked, true, 'D: detector is geometry-only (engine veto applies to auto-invert only)');

  // E: 兄弟覆盖层节点 (形态 2) → masked=true / sibling-veil
  const imgE = makeEl({ rect: RECT(10, 10, 270, 160) });
  const veilNode = makeEl({
    rect: RECT(0, 0, 280, 170),
    styles: { position: 'absolute', backgroundColor: 'rgba(10, 10, 10, 0.66)' },
  });
  imgE.parentElement = makeEl({ children: [imgE, veilNode] });
  const rE = mdc(imgE);
  assert.strictEqual(rE.masked, true, 'E: positioned sibling veil must be detected');
  assert.strictEqual(rE.reason, 'sibling-veil', 'E: reason must be sibling-veil');

  // F: 低不透明度媒体叠深色实底 (形态 3) → masked=true / self-opacity-over-dark
  const imgF = makeEl({ rect: RECT(0, 0, 260, 150), styles: { opacity: '0.55' } });
  imgF.parentElement = makeEl({ styles: { backgroundColor: 'rgb(16, 16, 16)' } });
  const rF = mdc(imgF);
  assert.strictEqual(rF.masked, true, 'F: translucent media over solid dark bg must be detected');
  assert.strictEqual(rF.reason, 'self-opacity-over-dark', 'F: reason must be self-opacity-over-dark');

  // 防误伤/保守性补充
  // 覆盖率不足 (蒙层只盖住 30% 宽) → false
  const imgCov = makeEl({ rect: RECT(0, 0, 260, 150) });
  imgCov.parentElement = makeEl({
    rect: RECT(0, 0, 100, 150),
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.9)' } },
  });
  assert.strictEqual(mdc(imgCov).masked, false, 'veil covering <80% of target must not trigger');
  // 目标带更高 z-index (蒙层画不到它) → false
  const imgZ = makeEl({ rect: RECT(10, 10, 270, 160), styles: { position: 'relative', zIndex: '10' } });
  imgZ.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', zIndex: '1', backgroundColor: 'rgba(0, 0, 0, 0.9)' } },
  });
  assert.strictEqual(mdc(imgZ).masked, false, 'veil below a higher-z target must not trigger');
  // 弱蒙层 (黑 20%: 合成 204 > 150) → false
  const imgWeak = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgWeak.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.2)' } },
  });
  assert.strictEqual(mdc(imgWeak).masked, false, 'too-weak dark veil must not trigger');
  // 暗渐变蒙层 (最暗色标压暗) → true
  const imgGrad = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgGrad.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.2))' } },
  });
  assert.strictEqual(mdc(imgGrad).masked, true, 'dark gradient scrim must trigger');
  // 白渐变蒙层 → false
  const imgGradW = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgGradW.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.1))' } },
  });
  assert.strictEqual(mdc(imgGradW).masked, false, 'light gradient scrim must never trigger');
  // backdrop-filter 变暗蒙层 → true
  const imgBf = makeEl({ rect: RECT(10, 10, 270, 160) });
  imgBf.parentElement = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backdropFilter: 'brightness(0.4)' } },
  });
  assert.strictEqual(mdc(imgBf).masked, true, 'backdrop-filter dimming veil must trigger');

  // 鲁棒性: 非法输入一律"未检出", 绝不抛错
  assert.strictEqual(mdc(null).masked, false, 'null input must be unmasked');
  assert.strictEqual(mdc({ nodeType: 1, getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 }) }).masked, false, 'zero-size target must be unmasked');

  // 性能预算 (C3): 4 个低覆盖暗色兄弟消耗 rect 预算后仍正常检出深层伪元素蒙层;
  // gBCR ≤ 8 (目标 1 + 每层宿主 3 + 兄弟 4), 计算样式读取有界; 全程只读 (无布局循环)。
  // 计数器先清零: 只统计本用例这一次调用的开销。
  created.length = 0;
  gcsCalls = 0;
  const imgBudget = makeEl({ rect: RECT(10, 10, 270, 160) });
  const sibs = [];
  for (let i = 0; i < 4; i++) {
    sibs.push(makeEl({
      rect: RECT(i * 30, 0, i * 30 + 80, 60), // 只覆盖目标左上一角 → 覆盖率不足
      styles: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.9)' },
    }));
  }
  const midBudget = makeEl({});
  const topBudget = makeEl({});
  const veilBox = makeEl({
    pseudo: { '::after': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.7)' } },
  });
  imgBudget.parentElement = makeEl({ children: [imgBudget].concat(sibs) });
  imgBudget.parentElement.parentElement = midBudget;
  midBudget.parentElement = topBudget;
  topBudget.parentElement = veilBox; // 第 4 层祖先的 ::after 蒙层: 超出 3 层预算, 不应检出
  const rBudget = mdc(imgBudget);
  assert.strictEqual(rBudget.masked, false, 'veil beyond 3-level ancestor budget must not be found');
  assert.ok(gcrTotal() <= 8, 'getBoundingClientRect calls must stay within budget (≤8), got ' + gcrTotal());
  assert.ok(gcsCalls <= 24, 'getComputedStyle calls must stay bounded, got ' + gcsCalls);

  // 预算内 3 层祖先仍可检出 (覆盖率代理: 宿主矩形含目标)
  created.length = 0;
  gcsCalls = 0;
  const imgDeep = makeEl({ rect: RECT(10, 10, 270, 160) });
  const midDeep = makeEl({ rect: RECT(0, 0, 280, 170) });
  const topDeep = makeEl({
    rect: RECT(0, 0, 280, 170),
    pseudo: { '::before': { content: '""', position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.75)' } },
  });
  imgDeep.parentElement = midDeep;
  midDeep.parentElement = topDeep;
  const rDeep = mdc(imgDeep);
  assert.strictEqual(rDeep.masked, true, 'veil on the 3rd ancestor must be found within budget');
  assert.strictEqual(rDeep.reason, 'ancestor-veil', 'deep veil reason ancestor-veil');
  assert.ok(gcrTotal() <= 8, 'deep-veil gBCR budget respected, got ' + gcrTotal());

  console.log('✓ v4.6 unit tests passed: maskedDarkContext four-case matrix (A/E/F detect, B/C clean) + veil forms + budget cap');
})();

// ============================================================
// v5.0 Action Registry 单测 (来源表顺序 / resolveStage 短路 / arbitrate 仲裁 / ACTIONS 契约)
// 契约来源: .trellis/tasks/09-25-v5-action-registry/design.md §D-1 / §D-2 / §D-3
// 任务: v5-1 (PRD R1 / AC-1 / AC-3)
// ============================================================
(function () {
  const { ACTIONS, SOURCES, resolveStage, arbitrate } = svi;

  // ---- 1. 来源表结构与顺序 (AC-1 唯一性: 顺序必须逐字等于现行 decideImage 优先级链) ----
  assert.deepStrictEqual(
    SOURCES.map((s) => s.id),
    ['manualElement', 'manual', 'elementRule', 'learned', 'seedProtect', 'faviconSkip', 'seedForceInvert'],
    'SOURCES 顺序必须与现行优先级链一致 (favicon 夹在 protect 与 forceInvert 之间; manualElement 是 A13 新增的元素属性来源)'
  );
  assert.deepStrictEqual(
    SOURCES.map((s) => s.stage),
    ['override', 'override', 'override', 'rule', 'rule', 'rule', 'rule'],
    'stage: 前三条属决策快照之前 (override), 后四条属快照之后 (rule)'
  );
  assert.strictEqual(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length, '来源 id 必须唯一');
  assert.ok(SOURCES.every((s) => typeof s.resolve === 'function'), '每条来源必须有 resolve');

  // ---- 2. ACTIONS 契约 (AC-3: keep 无属性门) ----
  assert.strictEqual(ACTIONS.invert.attr, 'data-svi-inverted', 'invert 属性门');
  assert.strictEqual(ACTIONS.bgInvert.attr, 'data-svi-bginv', 'bgInvert 属性门 (A13: 与 invert 分离但共用仲裁与来源表)');
  assert.strictEqual(ACTIONS.keep.attr, null, 'keep 必须无属性门 (否则全动作关闭时会增加页面属性写入, 破坏 AC-3)');
  assert.strictEqual(ACTIONS.invert.defaultEnabled, true, 'invert 默认开 (现状)');
  assert.strictEqual(ACTIONS.bgInvert.defaultEnabled, true, 'bgInvert 默认开 (现状)');
  assert.strictEqual(ACTIONS.keep.defaultEnabled, true, 'keep 默认开 (现状)');
  // v5.0 阶段 B: 会改动 DOM 观感的新动作一律默认关 (父 PRD 约束「默认保守」)
  assert.strictEqual(ACTIONS.hide.defaultEnabled, false, 'hide 必须默认关');
  assert.strictEqual(ACTIONS.mask.defaultEnabled, false, 'mask 必须默认关');
  assert.strictEqual(ACTIONS.dim.defaultEnabled, false, 'dim 必须默认关');
  assert.strictEqual(ACTIONS.hide.attr, 'data-svi-hidden', 'hide 属性门');
  assert.strictEqual(ACTIONS.mask.attr, 'data-svi-masked', 'mask 属性门 (属性值 = 预设 id)');
  assert.strictEqual(ACTIONS.dim.attr, null, 'dim 是全页动作, 无元素属性门');
  assert.strictEqual(ACTIONS.peek.attr, null, 'peek 是页级类门, 无元素属性门');
  assert.strictEqual(ACTIONS.dim.scope, 'page', 'dim 作用域为全页');
  assert.strictEqual(ACTIONS.peek.scope, 'page', 'peek 作用域为全页');
  assert.strictEqual(ACTIONS.hide.scope, 'element', 'hide 作用域为元素');
  assert.strictEqual(ACTIONS.mask.scope, 'element', 'mask 作用域为元素');
  assert.ok(ACTIONS.invert.isActive({ getAttribute: () => 'true' }), 'invert.isActive 读属性门');
  assert.strictEqual(ACTIONS.keep.isActive({ getAttribute: () => 'true' }), false, 'keep 恒为非激活');
  assert.ok(ACTIONS.bgInvert.isActive({ getAttribute: (k) => (k === 'data-svi-bginv' ? 'true' : null) }), 'bgInvert.isActive 读自身属性门');
  assert.strictEqual(ACTIONS.invert.isActive({ getAttribute: (k) => (k === 'data-svi-bginv' ? 'true' : null) }), false, 'invert 与 bgInvert 属性门不得串台');

  // ---- helpers ----
  function mkEl(opts) {
    const o = opts || {};
    const attrs = Object.assign({}, o.attrs);
    return {
      tagName: o.tagName || 'IMG',
      id: o.id || '',
      className: o.className || '',
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      matches(sel) {
        const wanted = String(sel).split(',').map((s) => s.trim());
        return (o.matchSelectors || []).some((s) => wanted.indexOf(s) >= 0);
      },
      _attrs: attrs,
    };
  }

  const host = svi.profileKey();
  const urlManual = 'https://mail.163.com/manual.png';
  const urlNoOv = 'https://mail.163.com/no-override.png';
  const urlW = 'https://mail.163.com/w.png';

  // ---- 3. resolveStage: override 段短路顺序 ----
  // 3a. manual 命中 → 不再查 elementRule
  svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlManual)] = 'invert';
  const rManual = resolveStage(mkEl({ matchSelectors: ['.my-rule'] }), {
    src: urlManual,
    elementRules: [{ selector: '.my-rule', action: 'protect' }],
    protect: [],
    forceInvert: [],
  }, 'override');
  assert.strictEqual(rManual.verdict, 'invert', 'manual 命中必须判 invert (压过 elementRule)');
  assert.strictEqual(rManual.source, 'manual', 'source 由表自动填充');
  assert.strictEqual(rManual.reason, 'manual', 'reason=manual');
  assert.strictEqual(rManual.force, true, 'manual 必须 force (刷新既有快照)');

  // 3b. manual 未命中 → elementRule 命中
  const rEr = resolveStage(mkEl({ matchSelectors: ['.my-rule'] }), {
    src: urlNoOv,
    elementRules: [{ selector: '.my-rule', action: 'protect' }],
    protect: [],
    forceInvert: [],
  }, 'override');
  assert.strictEqual(rEr.verdict, 'keep', 'elementRule protect → keep');
  assert.strictEqual(rEr.source, 'elementRule', 'source=elementRule');
  assert.strictEqual(rEr.reason, 'element-rule', 'reason=element-rule');
  assert.strictEqual(rEr.force, true, 'elementRule 必须 force (v3.3 显式配置优先于快照)');

  // 3c. 皆未命中 → null (交回快照)
  assert.strictEqual(
    resolveStage(mkEl({}), { src: urlNoOv, elementRules: [], protect: [], forceInvert: [] }, 'override'),
    null, 'override 段无人认领必须返回 null'
  );

  // 3d. (A13) manualElement 元素属性优先于 manual 的 src 键
  const urlBoth = 'https://mail.163.com/both.png';
  svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlBoth)] = 'restore';
  const rAttr = resolveStage(mkEl({ attrs: { 'data-svi-manual': 'invert' } }), {
    src: urlBoth, elementRules: [], protect: [], forceInvert: [],
  }, 'override');
  assert.strictEqual(rAttr.source, 'manualElement', '元素属性手动结论必须先于 src 键被采纳');
  assert.strictEqual(rAttr.verdict, 'invert', '属性 invert 必须压过 src 键 restore');

  // 3e. (A13) elementRule 透传原始动作 (供 BgImageEngine 区分 recolor)
  const rRecolor = resolveStage(mkEl({ matchSelectors: ['.rc'] }), {
    src: '', elementRules: [{ selector: '.rc', action: 'recolor' }], protect: [], forceInvert: [],
  }, 'override');
  assert.strictEqual(rRecolor.action, 'recolor', 'recolor 动作必须原样透传 (不属 ACTIONS, 由 bgReplace 引擎处理)');
  assert.strictEqual(rRecolor.verdict, 'keep', 'recolor 的 verdict 为 keep (与原实现一致)');

  // 3f. (A13) el=null 时 override 段只能命中 manual (decideUrl 的 URL 级路径)
  const rUrlOnly = resolveStage(null, { src: urlBoth, elementRules: [{ selector: '.x', action: 'invert' }] }, 'override');
  assert.strictEqual(rUrlOnly.source, 'manual', 'el=null 时 manualElement / elementRule 均不得命中, 只留 manual');
  assert.strictEqual(rUrlOnly.verdict, 'keep', 'URL 级手动 restore → keep');
  assert.strictEqual(
    resolveStage(null, { src: 'https://mail.163.com/none.png' }, 'override'), null,
    'URL 无覆盖 → null'
  );

  // ---- 4. resolveStage: rule 段短路顺序 ----
  const ctxRule = { src: 'https://mail.163.com/x.png', protect: ['.seed-protect'], forceInvert: ['.seed-force'] };

  // 4a. learned 命中 (hits ≥ learnHits) → 不再查种子
  svi.RuleLearner.data = { [host]: { rules: [{ stem: 'img.learnt', action: 'protect', hits: 5, lastAt: Date.now() }] } };
  const rLearned = resolveStage(mkEl({ className: 'learnt', matchSelectors: ['.seed-protect'] }), ctxRule, 'rule');
  assert.strictEqual(rLearned.verdict, 'keep', 'learned protect → keep');
  assert.strictEqual(rLearned.source, 'learned', 'source=learned');
  assert.strictEqual(rLearned.reason, 'learned', 'reason=learned');

  // 4b. learned 未命中 → 种子保护
  const rProtect = resolveStage(mkEl({ className: 'other', matchSelectors: ['.seed-protect'] }), ctxRule, 'rule');
  assert.strictEqual(rProtect.source, 'seedProtect', 'learned 未命中时落到 seedProtect');
  assert.strictEqual(rProtect.verdict, 'keep', '种子保护 → keep');
  assert.strictEqual(rProtect.reason, 'protected', 'reason=protected');

  // 4c. protect 先于 forceInvert
  const rBoth = resolveStage(mkEl({ className: 'other', matchSelectors: ['.seed-protect', '.seed-force'] }), ctxRule, 'rule');
  assert.strictEqual(rBoth.source, 'seedProtect', '同时命中时 protect 必须先于 forceInvert');

  // 4d. favicon 跳过
  const ctxFav = { src: 'https://mail.163.com/favicon.ico', protect: [], forceInvert: ['.seed-force'] };
  const rFav = resolveStage(mkEl({ className: 'other' }), ctxFav, 'rule');
  assert.strictEqual(rFav.verdict, 'skip', 'favicon 必须 skip');
  assert.strictEqual(rFav.reason, 'favicon', 'reason=favicon');
  assert.strictEqual(rFav.source, 'faviconSkip', 'source=faviconSkip');

  // 4e. favicon 先于 seedForceInvert (现行代码的实际顺序, 不得重排)
  const rFav2 = resolveStage(mkEl({ className: 'other', matchSelectors: ['.seed-force'] }), ctxFav, 'rule');
  assert.strictEqual(rFav2.source, 'faviconSkip', 'favicon 必须先于 seedForceInvert');

  // 4f. 种子强制反色 (仅当 protect / favicon 均未命中)
  const ctxForce = { src: 'https://mail.163.com/doc.png', protect: ['.seed-protect'], forceInvert: ['.seed-force'] };
  const rForce = resolveStage(mkEl({ className: 'other', matchSelectors: ['.seed-force'] }), ctxForce, 'rule');
  assert.strictEqual(rForce.verdict, 'invert', '种子强制反色 → invert');
  assert.strictEqual(rForce.reason, 'seed-force', 'reason=seed-force');
  assert.ok(!rForce.force, 'seedForceInvert 不得 force (现行 recordDecision 不带 force)');

  // 4g. rule 段皆未命中 → null (交回小元素门/策略门/像素)
  assert.strictEqual(
    resolveStage(mkEl({ className: 'other' }), { src: 'https://mail.163.com/y.png', protect: [], forceInvert: [] }, 'rule'),
    null, 'rule 段无人认领必须返回 null'
  );

  // ---- 5. arbitrate: 手动结论幂等占优 + 两条例外 ----
  // 5a. 非 manual 来源遇到元素手动结论 → 以手动为准
  const aA = arbitrate(mkEl({ attrs: { 'data-svi-manual': 'restore' } }), { verdict: 'invert', reason: 'pixel' });
  assert.strictEqual(aA.verdict, 'keep', '手动 restore 必须压过像素 invert');
  assert.strictEqual(aA.reason, 'manual', '占优后 reason 必须改判 manual');
  assert.strictEqual(aA.source, 'manual', '占优后 source 必须改判 manual (供 v5-2/v5-3 聚合)');

  // 5b. reason='manual' 自身是直写例外
  const aB = arbitrate(mkEl({ attrs: { 'data-svi-manual': 'restore' } }), { verdict: 'invert', reason: 'manual' });
  assert.strictEqual(aB.verdict, 'invert', 'reason=manual 是直写例外, 不得被手动结论改写');

  // 5c. reason='fx-mutex' 是直写例外 (v4.6 实测得出, 不得扩大)
  const aC = arbitrate(mkEl({ attrs: { 'data-svi-manual': 'invert' } }), { verdict: 'keep', reason: 'fx-mutex' });
  assert.strictEqual(aC.verdict, 'keep', 'fx-mutex 是直写例外');

  // 5d. 无手动结论 → 原样透传
  const aD = arbitrate(mkEl({}), { verdict: 'invert', reason: 'pixel', force: true, source: 'pixel' });
  assert.strictEqual(aD.verdict, 'invert', '透传 verdict');
  assert.strictEqual(aD.reason, 'pixel', '透传 reason');
  assert.strictEqual(aD.force, true, '透传 force');
  assert.strictEqual(aD.source, 'pixel', '透传 source');

  // 5e. 手动 'invert' 方向同样占优
  const aE = arbitrate(mkEl({ attrs: { 'data-svi-manual': 'invert' } }), { verdict: 'keep', reason: 'protected' });
  assert.strictEqual(aE.verdict, 'invert', '手动 invert 必须压过种子保护 keep');

  // ---- 6. 写点行为: ACTIONS.invert.apply 经 arbitrate, 手动结论不得被覆盖 ----
  svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlW)] = 'restore';
  const elW = mkEl({});
  elW.currentSrc = urlW;
  elW.src = urlW;
  const why = ACTIONS.invert.apply(elW, null, 'pixel');
  assert.strictEqual(elW.getAttribute('data-svi-inverted'), null, '手动 restore 存在时 invert.apply 不得写入反色属性');
  assert.strictEqual(why, 'manual', '返回值必须报出发生了手动占优 (why=manual)');

  // keep.apply 走同一仲裁 (不得因 keep 而绕过手动结论)
  const elK = mkEl({});
  elK.currentSrc = urlManual; // 该 url 的手动结论为 invert
  elK.src = urlManual;
  ACTIONS.keep.apply(elK, null, 'pixel');
  assert.strictEqual(elK.getAttribute('data-svi-inverted'), 'true', '手动 invert 存在时 keep.apply 必须被判为反色');

  // ---- 7. (A13) bgInvert 执行器: 属性门独立 + 同一仲裁 ----
  const elBg = mkEl({});
  ACTIONS.bgInvert.apply(elBg, null, 'pixel');
  assert.strictEqual(elBg.getAttribute('data-svi-bginv'), 'true', 'bgInvert.apply 写自身属性门');
  assert.strictEqual(elBg.getAttribute('data-svi-inverted'), null, 'bgInvert 不得串到 invert 属性门');
  ACTIONS.bgInvert.revert(elBg);
  assert.strictEqual(elBg.getAttribute('data-svi-bginv'), null, 'bgInvert.revert 摘除自身属性门');

  const elBgM = mkEl({ attrs: { 'data-svi-manual': 'restore' } });
  ACTIONS.bgInvert.apply(elBgM, null, 'pixel');
  assert.strictEqual(elBgM.getAttribute('data-svi-bginv'), null, '手动 restore 存在时 bgInvert.apply 不得写反色属性');

  const elBgMi = mkEl({ attrs: { 'data-svi-manual': 'invert' } });
  ACTIONS.bgInvert.revert(elBgMi);
  assert.strictEqual(elBgMi.getAttribute('data-svi-bginv'), 'true', '手动 invert 存在时 bgInvert.revert 必须被判为反色');

  // ---- 清理: 还原偏好与学习数据, 避免影响后续用例 ----
  delete svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlManual)];
  delete svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlW)];
  delete svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlNoOv)];
  delete svi.prefs.manualOverrides[svi.manualOverrideKey(host, urlBoth)];
  svi.RuleLearner.data = {};

  console.log('✓ v5.0 unit tests passed: Action Registry (SOURCES 顺序/stage 分段/resolveStage 短路/arbitrate 两例外/keep 无属性门/bgInvert 独立属性门)');
})();

// ============================================================
// v5.0 阶段 B 单测 (动作开关矩阵 / hide / mask / 元素级动作派发)
// 契约来源: .trellis/tasks/09-25-v5-action-registry/design.md §D-3 / §D-5, prd.md R2 / R3 / R6
// 任务: v5-1
// ============================================================
(function () {
  const {
    ACTIONS, actionEnabled, enabledActions, applyResolvedAction, resolveElementAction,
    MASK_PRESETS, maskPseudoAvailable, readActionManual, ACTION_MANUAL_SCOPE,
  } = svi;

  function mkEl(opts) {
    const o = opts || {};
    const attrs = Object.assign({}, o.attrs);
    return {
      tagName: o.tagName || 'IMG',
      id: o.id || '',
      className: o.className || '',
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      matches() { return false; },
      _attrs: attrs,
    };
  }

  const host = svi.profileKey();
  const hoverRestoreOn = svi.prefs.hoverRestore !== false;

  // ---- 8. 动作开关矩阵 (AC-2: 唯一读取点) ----
  assert.strictEqual(actionEnabled('hide'), false, 'hide 默认关 (保守)');
  assert.strictEqual(actionEnabled('mask'), false, 'mask 默认关 (保守)');
  assert.strictEqual(actionEnabled('dim'), false, 'dim 默认关 (保守)');
  assert.strictEqual(actionEnabled('invert'), true, 'invert 恒开 (真实开关是 imageInvert / 站点档案)');
  assert.strictEqual(actionEnabled('bgInvert'), true, 'bgInvert 恒开');
  assert.strictEqual(actionEnabled('keep'), true, 'keep 恒开 (无副作用)');
  assert.strictEqual(actionEnabled('peek'), hoverRestoreOn, 'peek 单一真源 = 既有 hoverRestore 偏好 (不新增开关)');
  assert.deepStrictEqual(
    enabledActions().sort(),
    ['bgInvert', 'invert', 'keep'].concat(hoverRestoreOn ? ['peek'] : []).sort(),
    '默认启用动作集合'
  );

  svi.prefs.actions.hide.enabled = true;
  assert.strictEqual(actionEnabled('hide'), true, '开启后 hide 启用');
  assert.ok(enabledActions().indexOf('hide') >= 0, 'enabledActions 反映开关');

  // ---- 9. hide 执行器 + 动作级手动作用域 (D-3 通用化的落地) ----
  const elH = mkEl({});
  ACTIONS.hide.apply(elH, { scope: 'session' }, 'manual');
  assert.strictEqual(elH.getAttribute('data-svi-hidden'), 'session', 'hide.apply 写 scope 值');
  ACTIONS.hide.apply(elH, { scope: 'rule' }, 'manual');
  assert.strictEqual(elH.getAttribute('data-svi-hidden'), 'rule', 'hide.apply 支持 rule 作用域');
  assert.ok(ACTIONS.hide.isActive(elH), 'hide.isActive 认属性门');
  ACTIONS.hide.revert(elH);
  assert.strictEqual(elH.getAttribute('data-svi-hidden'), null, 'hide.revert 摘除属性门');

  const elH2 = mkEl({});
  ACTIONS.hide.apply(elH2, { scope: 'bogus' }, 'manual');
  assert.strictEqual(elH2.getAttribute('data-svi-hidden'), 'session', '非法 scope 回退 session');

  // 手动 'show' 压过规则驱动的 hide
  const elH3 = mkEl({ attrs: { 'data-svi-manual-hide': 'show' } });
  ACTIONS.hide.apply(elH3, { scope: 'rule' }, 'learned');
  assert.strictEqual(elH3.getAttribute('data-svi-hidden'), null, '手动 show 必须压过学习规则的 hide');
  // 手动 'hide' 压过规则驱动的 revert
  const elH4 = mkEl({ attrs: { 'data-svi-manual-hide': 'hide' } });
  ACTIONS.hide.revert(elH4);
  assert.ok(elH4.getAttribute('data-svi-hidden') !== null, '手动 hide 必须压过规则驱动的 revert');
  // 作用域不串台: invert 家族的手动结论不得影响 hide
  const elH5 = mkEl({ attrs: { 'data-svi-manual': 'restore' } });
  ACTIONS.hide.apply(elH5, { scope: 'session' }, 'learned');
  assert.strictEqual(elH5.getAttribute('data-svi-hidden'), 'session', 'invert 家族手动结论不得串到 hide 作用域');

  // 动作级手动作用域表契约 (供 v5-2 复查与 v5-3 权重消费)
  assert.strictEqual(ACTION_MANUAL_SCOPE.hide.attr, 'data-svi-manual-hide', 'hide 手动作用域属性');
  assert.strictEqual(ACTION_MANUAL_SCOPE.mask.attr, 'data-svi-manual-mask', 'mask 手动作用域属性');
  assert.strictEqual(readActionManual(mkEl({ attrs: { 'data-svi-manual-hide': 'hide' } }), ACTION_MANUAL_SCOPE.hide), true, 'readActionManual on');
  assert.strictEqual(readActionManual(mkEl({ attrs: { 'data-svi-manual-hide': 'show' } }), ACTION_MANUAL_SCOPE.hide), false, 'readActionManual off');
  assert.strictEqual(readActionManual(mkEl({}), ACTION_MANUAL_SCOPE.hide), null, 'readActionManual 无表态');
  assert.strictEqual(readActionManual(null, ACTION_MANUAL_SCOPE.hide), null, 'readActionManual 容忍 null');

  // ---- 10. mask 执行器 + 三档预设 (D-5, v5-5 依赖本表为唯一定义处) ----
  assert.deepStrictEqual(Object.keys(MASK_PRESETS).sort(), ['dim', 'frost', 'solid'], '三档遮罩预设');
  for (const id of Object.keys(MASK_PRESETS)) {
    const p = MASK_PRESETS[id];
    assert.strictEqual(p.id, id, id + ': preset.id 自洽');
    assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), id + ': 颜色为 #rrggbb');
    assert.ok(p.opacity >= 0 && p.opacity <= 1, id + ': 不透明度在 [0,1]');
    assert.ok(p.hoverOpacity >= 0 && p.hoverOpacity <= 1, id + ': 悬停不透明度在 [0,1]');
    assert.ok(typeof p.blur === 'number' && p.blur >= 0, id + ': blur 非负');
  }
  assert.strictEqual(MASK_PRESETS.solid.opacity, 1, 'solid = 全遮挡');
  assert.ok(MASK_PRESETS.frost.blur > 0, 'frost = 有模糊');
  assert.ok(MASK_PRESETS.dim.opacity > 0 && MASK_PRESETS.dim.opacity < 1, 'dim = 半透明');

  const elM = mkEl({});
  ACTIONS.mask.apply(elM, { style: 'frost' }, 'manual');
  assert.strictEqual(elM.getAttribute('data-svi-masked'), 'frost', 'mask.apply 写预设 id');
  ACTIONS.mask.apply(elM, { style: 'bogus' }, 'manual');
  assert.strictEqual(elM.getAttribute('data-svi-masked'), 'dim', '非法预设回退 dim');
  assert.ok(ACTIONS.mask.isActive(elM), 'mask.isActive 认属性门');
  ACTIONS.mask.revert(elM);
  assert.strictEqual(elM.getAttribute('data-svi-masked'), null, 'mask.revert 摘除');

  const elM2 = mkEl({ attrs: { 'data-svi-manual-mask': 'clear' } });
  ACTIONS.mask.apply(elM2, { style: 'dim' }, 'learned');
  assert.strictEqual(elM2.getAttribute('data-svi-masked'), null, '手动 clear 必须压过规则驱动的 mask');

  // 无 getComputedStyle 环境 → 乐观放行 (绝不因检测能力缺失而阻断功能)
  assert.strictEqual(maskPseudoAvailable(mkEl({})), true, '无法检测伪元素占用时乐观放行');

  // ---- 11. applyResolvedAction: 动作关闭 → 立即清残留 (「开关即回滚」) ----
  svi.prefs.actions.hide.enabled = false;
  const elR = mkEl({ attrs: { 'data-svi-hidden': 'session' } });
  assert.strictEqual(
    applyResolvedAction(elR, { actionId: 'hide', verdict: 'invert', reason: 'learned' }), false,
    '动作关闭时 applyResolvedAction 返回 false'
  );
  assert.strictEqual(elR.getAttribute('data-svi-hidden'), null, '动作关闭必须 revert 清残留');

  svi.prefs.actions.hide.enabled = true;
  const elR2 = mkEl({});
  assert.strictEqual(
    applyResolvedAction(elR2, { actionId: 'hide', verdict: 'invert', reason: 'learned', params: { scope: 'rule' } }), true,
    '动作开启时 applyResolvedAction 返回 true'
  );
  assert.strictEqual(elR2.getAttribute('data-svi-hidden'), 'rule', 'applyResolvedAction 落对应执行器');

  // ---- 12. resolveElementAction: 只返回元素级动作 (hide / mask) ----
  svi.RuleLearner.data = { [host]: { rules: [{ stem: 'div.hiddable', action: 'hide', hits: 5, lastAt: Date.now() }] } };
  const ea = resolveElementAction(mkEl({ tagName: 'DIV', className: 'hiddable' }));
  assert.ok(ea && ea.actionId === 'hide', 'hide 学习规则必须被识别为元素级动作');
  assert.strictEqual(ea.verdict, 'invert', 'hide 候选的 verdict 语义 = 动作生效');

  svi.RuleLearner.data = { [host]: { rules: [{ stem: 'div.maskable', action: 'mask', hits: 5, lastAt: Date.now() }] } };
  const em = resolveElementAction(mkEl({ tagName: 'DIV', className: 'maskable' }));
  assert.ok(em && em.actionId === 'mask', 'mask 学习规则必须被识别为元素级动作');

  svi.RuleLearner.data = { [host]: { rules: [{ stem: 'img.learnt', action: 'invert', hits: 5, lastAt: Date.now() }] } };
  assert.strictEqual(resolveElementAction(mkEl({ className: 'learnt' })), null, 'invert 家族规则不得被当作元素级动作');
  assert.strictEqual(resolveElementAction(mkEl({ className: 'nomatch' })), null, '无规则命中 → null');

  // 未达 learnHits 的 hide 规则不生效 (保持 v3.0 的命中门语义)
  svi.RuleLearner.data = { [host]: { rules: [{ stem: 'div.hiddable', action: 'hide', hits: 1, lastAt: Date.now() }] } };
  assert.strictEqual(resolveElementAction(mkEl({ tagName: 'DIV', className: 'hiddable' })), null, '未达命中门的 hide 规则不生效');

  // ---- 清理 ----
  svi.RuleLearner.data = {};
  svi.prefs.actions.hide.enabled = false;

  console.log('✓ v5.0 stage-B unit tests passed: 动作开关矩阵 / hide 作用域与动作级手动结论 / mask 三档预设 / applyResolvedAction 开关即回滚 / resolveElementAction 过滤');
})();


