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
    // 有界轮询替代固定 120ms 等待。为什么必须改:
    //   分片写入链的每一步都是「在回调里重新排期 1ms」, 而固定等待的到期时间是**从脚本开始**算的。
    //   只要本文件的同步执行时间超过等待窗口 (新增测试块很容易把它推过线), 事件循环一解阻,
    //   调度器按到期时间排序会先跑那个已逾期的断言, 再轮到写入链的下一步 —— 用例必挂。
    //   实测: v6.0 测试块把同步时长推过 120ms 后, 失败率 ~6/10, 且失败信息看起来像产品 bug
    //   (其实是测试自己在和自己抢时间)。轮询到条件成立即通过、超时才失败: 不变慢, 也没有竞态。
    const verify = () => {
      assert.strictEqual(st.backend, 'chrome-local', 'quota failure degrades backend to chrome-local');
      assert.strictEqual(st.useChunking, false, 'local backend skips chunking');
      const saved = localArea.get('svi:big');
      assert.ok(saved && JSON.parse(saved).blob.length === 9000, 'failed value rewritten into chrome.storage.local');
      console.log('✓ v3.0 Store quota-degrade regression passed (sync → local fallback)');
    };
    const deadline = Date.now() + 2000;
    const poll = () => {
      const saved = localArea.get('svi:big');
      const settled = st.backend === 'chrome-local' && !!saved && JSON.parse(saved).blob.length === 9000;
      if (settled) { verify(); return; }
      if (Date.now() > deadline) { verify(); return; } // 超时后走同一组断言 → 真实缺陷仍然会红
      setTimeout(poll, 10);
    };
    setTimeout(poll, 10);
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
    ['manualElement', 'manual', 'elementRule',
      'learned', 'learnedStrong', 'seedProtect', 'faviconSkip', 'seedForceInvert',
      'learnedWeak', 'shapePrior'],
    'SOURCES 结构顺序 (v5.3 加入分级的 strong/weak 与 shapePrior 三条可选来源)'
  );
  assert.deepStrictEqual(
    SOURCES.map((s) => s.stage),
    ['override', 'override', 'override', 'rule', 'rule', 'rule', 'rule', 'rule', 'rule', 'rule'],
    'stage: 前三条属决策快照之前 (override), 后七条属快照之后 (rule)'
  );
  // v5.3 关键零回归断言: 默认设置下「生效集合」必须与 v5-1 逐项一致。
  // 分级与形状先验都靠 enabled() 退场 (而不是从表里删条目), 这样新增来源不会改变默认行为。
  assert.deepStrictEqual(
    svi.effectiveSourceIds('override'),
    ['manualElement', 'manual', 'elementRule'],
    'default: override 段生效集合'
  );
  assert.deepStrictEqual(
    svi.effectiveSourceIds('rule'),
    ['learned', 'seedProtect', 'faviconSkip', 'seedForceInvert'],
    'default: rule 段生效集合必须与 v5-1 逐项一致 (favicon 仍夹在 protect 与 forceInvert 之间)'
  );
  assert.strictEqual(svi.learnGradingOn(), false, 'hits 分级默认关 (开启会改变既有规则行为)');
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

// ============================================================
// v5.2 单测 (撤销栈 / 反事实回退 / 误反哨兵 / 已处理日志)
// 契约来源: .trellis/tasks/09-25-v5-review-undo/design.md §D-1 / §D-2 / §D-6
// ============================================================
(function () {
  const { undoStack, undoLast, undoEntry, pushUndo, isAutoReason,
          corrections, processedLog, REASON_ZH, recordProcessed } = svi;

  function mkEl(opts) {
    const o = opts || {};
    const attrs = Object.assign({}, o.attrs);
    return {
      tagName: o.tagName || 'IMG', id: '', className: o.className || '',
      isConnected: true,
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      matches() { return false; },
      _attrs: attrs,
    };
  }

  const host = svi.profileKey();

  // ---- 1. isAutoReason: 只认自动结论 ----
  assert.strictEqual(isAutoReason('pixel'), true, 'pixel 是自动结论');
  assert.strictEqual(isAutoReason('learned'), true, 'learned 是自动结论');
  assert.strictEqual(isAutoReason('manual'), false, 'manual 是用户意志, 不入撤销栈');
  assert.strictEqual(isAutoReason('element-rule'), false, 'element-rule 是用户显式配置, 不入撤销栈');
  assert.strictEqual(isAutoReason(undefined), true, '缺省按自动处理 (reason 缺省为 pixel 语义)');

  // ---- 2. 撤销栈: 环形回卷 / 只收自动结论 / 开关 ----
  undoStack.items.length = 0;
  const max = Math.max(1, Math.min(100, Number(svi.prefs.undoStackSize) || 30));
  for (let i = 0; i < max + 5; i++) {
    pushUndo({ el: mkEl({}), src: 's' + i, actionId: 'invert', reason: 'pixel', at: i });
  }
  assert.strictEqual(undoStack.items.length, max, '撤销栈必须回卷到容量上限, got ' + undoStack.items.length);
  assert.strictEqual(undoStack.items[0].src, 's5', '回卷必须丢弃最旧的 (FIFO 淘汰)');

  undoStack.items.length = 0;
  pushUndo({ el: mkEl({}), src: 'm', actionId: 'invert', reason: 'manual', at: 1 });
  assert.strictEqual(undoStack.items.length, 0, 'manual 结论不得入栈');
  pushUndo({ el: mkEl({}), src: 'e', actionId: 'invert', reason: 'element-rule', at: 1 });
  assert.strictEqual(undoStack.items.length, 0, 'element-rule 结论不得入栈');

  svi.prefs.undoEnabled = false;
  pushUndo({ el: mkEl({}), src: 'off', actionId: 'invert', reason: 'pixel', at: 1 });
  assert.strictEqual(undoStack.items.length, 0, 'undoEnabled=false 时不得入栈');
  svi.prefs.undoEnabled = true;

  // ---- 3. undoLast: LIFO 逆序 ----
  undoStack.items.length = 0;
  for (let i = 1; i <= 5; i++) pushUndo({ el: mkEl({}), src: 'x' + i, actionId: 'invert', reason: 'pixel', at: i });
  assert.strictEqual(undoStack.items.length, 5, '5 条入栈');
  undoLast(2);
  assert.strictEqual(undoStack.items.length, 3, '撤销 2 条后剩 3 条');
  assert.strictEqual(undoStack.items[2].src, 'x3', '逆序回退: 保留的是最旧的 3 条');
  assert.strictEqual(undoLast(99), 3, '撤销超过存量时返回实际条数');
  assert.strictEqual(undoStack.items.length, 0, '全部撤销后栈空');
  assert.strictEqual(undoLast(1), 0, '空栈撤销返回 0 (不得抛错)');

  // ---- 4. undoEntry: 反事实回退 (摘标记, 而非写成 keep) + 持久化用户否决 ----
  const elU = mkEl({ attrs: { 'data-svi-inverted': 'true', 'data-svi-checked-src': 'https://x/y.png' } });
  const entry = { el: elU, src: 'https://x/y.png', actionId: 'invert', reason: 'pixel', at: 1 };
  assert.strictEqual(undoEntry(entry, false), true, 'undoEntry 返回 true');
  assert.strictEqual(elU.getAttribute('data-svi-inverted'), null, '回退必须摘除反色标记');
  assert.strictEqual(elU.getAttribute('data-svi-checked-src'), null, '回退必须清掉 checked 标记以便重扫');
  assert.strictEqual(elU.getAttribute('data-svi-manual'), null, 'remember=false 时不得写手动结论');

  // remember=true (用户可见路径): 摘标记之外还落"用户否决", 否则下次扫描会得到同一结论、
  // 撤销随即被撤销掉 (等于没撤销)。这一步是与 Alt+点击还原同语义的持久化。
  const elUR = mkEl({ attrs: { 'data-svi-inverted': 'true' } });
  const entryR = { el: elUR, src: 'https://undo/keep.png', actionId: 'invert', reason: 'pixel', at: 2 };
  const ovKey = svi.manualOverrideKey(host, 'https://undo/keep.png');
  delete svi.prefs.manualOverrides[ovKey];
  undoEntry(entryR);
  assert.strictEqual(elUR.getAttribute('data-svi-inverted'), null, 'remember=true 同样摘除反色标记');
  assert.strictEqual(elUR.getAttribute('data-svi-manual'), 'restore', 'remember=true 必须写元素级手动结论');
  assert.strictEqual(svi.prefs.manualOverrides[ovKey], 'restore', 'remember=true 必须写 src 级手动覆盖 (持久)');
  // 手动结论占优: 再走一次 revert 不会把它翻回去
  svi.ACTIONS.invert.apply(elUR, null, 'pixel');
  assert.strictEqual(elUR.getAttribute('data-svi-inverted'), null, '手动 restore 占优: 后续自动结论不得把它翻回反色');

  // 手动结论仍占优: 手动 invert 的元素被撤销时保持反色
  const elM = mkEl({ attrs: { 'data-svi-inverted': 'true', 'data-svi-manual': 'invert' }, noAttr: true });
  elM.getAttribute = (k) => (k === 'data-svi-inverted' ? 'true' : (k === 'data-svi-manual' ? 'invert' : null));
  undoEntry({ el: elM, src: '', actionId: 'invert', reason: 'pixel', at: 1 }, false);
  assert.strictEqual(elM.getAttribute('data-svi-inverted'), 'true', '手动结论占优: 撤销不得推翻用户的手动反色');

  assert.strictEqual(undoEntry(null), false, 'undoEntry(null) 返回 false, 不抛错');
  delete svi.prefs.manualOverrides[ovKey];

  // ---- 5. 误反哨兵: 计数器 / 24h 窗 / src 维度 ----
  corrections.data = null;
  const c1 = corrections.bump(host, 'falseInvert', 'https://a/1.png', 'img.thumb');
  assert.strictEqual(c1.srcHits, 1, '首次还原: srcHits=1');
  assert.strictEqual(c1.stemHits, 1, '首次还原: stemHits=1');
  const c2 = corrections.bump(host, 'falseInvert', 'https://a/1.png', 'img.thumb');
  assert.strictEqual(c2.srcHits, 2, '同 src 第二次还原: srcHits=2 (哨兵降级阈值)');
  assert.strictEqual(c2.stemHits, 2, '同 stem 第二次: stemHits=2');
  corrections.bump(host, 'falseInvert', 'https://a/2.png', 'img.thumb');
  const st = corrections.stats(host);
  assert.strictEqual(st.falseInvert, 3, 'host 维度误反计数累加');
  assert.strictEqual(st.falseKeep, 0, '误保计数独立');
  corrections.bump(host, 'falseKeep', 'https://a/3.png', 'img.other');
  assert.strictEqual(corrections.stats(host).falseKeep, 1, '误保计数单独累加');
  assert.strictEqual(corrections.stats('other.example').falseInvert, 0, 'host 维度互相隔离');

  // 窗口过期: 手工把时间戳推到 24h 之前 → 计数重置为 1
  const hdC = corrections.host(host);
  hdC.perSrc['https://a/1.png'] = { n: 9, at: Date.now() - 25 * 3600 * 1000 };
  const c3 = corrections.bump(host, 'falseInvert', 'https://a/1.png', 'img.thumb');
  assert.strictEqual(c3.srcHits, 1, '超 24h 窗后计数重置 (而不是继续累加到 10)');

  // 关闭哨兵 → 不记录
  svi.prefs.errorSentinel = false;
  assert.strictEqual(corrections.bump(host, 'falseInvert', 'https://a/9.png', 'img.x'), null, '哨兵关闭时不记录');
  svi.prefs.errorSentinel = true;

  // ---- 6. 已处理日志 ----
  processedLog.clear();
  recordProcessed(mkEl({ className: 'thumb' }), 'invert', 'pixel', 'https://a/1.png');
  const e1 = processedLog.items[processedLog.items.length - 1];
  assert.strictEqual(e1.actionId, 'invert', '日志记录 actionId');
  assert.strictEqual(e1.reason, 'pixel', '日志记录 reason');
  assert.strictEqual(e1.stem, 'img.thumb', '日志记录 selectorStem');
  // prune: 脱离文档的元素被剔除
  const gone = mkEl({}); gone.isConnected = false;
  processedLog.items.push({ el: gone, actionId: 'invert', reason: 'pixel', at: 0, stem: '', src: '' });
  const before = processedLog.items.length;
  recordProcessed(mkEl({}), 'invert', 'pixel', '');
  assert.strictEqual(processedLog.items.length, before, 'prune 必须剔除已脱离文档的条目 (push 前先 prune)');

  // ---- 7. 原因码中文映射覆盖关键路径 ----
  for (const k of ['pixel', 'learned', 'protected', 'seed-force', 'element-rule', 'manual', 'masked-dark', 'hidden-rule', 'mask-rule']) {
    assert.ok(REASON_ZH[k], 'REASON_ZH 必须覆盖原因码: ' + k);
  }

  // ---- 清理 ----
  undoStack.items.length = 0;
  processedLog.clear();
  corrections.data = null;
  try { svi.Store.remove('corrections'); } catch (e) { /* ignore */ }

  console.log('✓ v5.2 unit tests passed: 撤销栈回卷与来源过滤 / 反事实回退与手动占优 / 误反哨兵计数与 24h 窗 / 已处理日志 prune');
})();

// ============================================================
// v5.3 单测 (hits 分级 / 负反馈降级 / 判定来源分布 / 形状先验 / 阈值校准 / 规则合并)
// 契约来源: .trellis/tasks/09-25-v5-data-loop/design.md §D-1 / §D-2 / §D-3 / §D-4 / §D-5
// ============================================================
(function () {
  const { effectiveSourceIds, sourceDistribution, shapeSignature, shapeStore,
          calibrate, mergeRulesInto, corrections } = svi;
  const RL = svi.RuleLearner;

  function mkEl(opts) {
    const o = opts || {};
    const attrs = Object.assign({}, o.attrs);
    return {
      tagName: o.tagName || 'IMG', id: o.id || '', className: o.className || '',
      clientWidth: o.clientWidth || 0, clientHeight: o.clientHeight || 0,
      isConnected: true,
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      matches() { return false; },
    };
  }

  const host = svi.profileKey();

  // ---- 1. hits 分级 (design D-1) ----
  assert.strictEqual(RL.ruleStrength({ hits: 1 }), 'disabled', '未达 learnHits 门 → disabled');
  assert.strictEqual(RL.ruleStrength({ hits: 2 }), 'weak', 'hits=2 → weak (learnHits 默认 2)');
  assert.strictEqual(RL.ruleStrength({ hits: 4 }), 'weak', 'hits=4 → weak (强门默认 5)');
  assert.strictEqual(RL.ruleStrength({ hits: 5 }), 'strong', 'hits=5 → strong');
  assert.strictEqual(RL.ruleStrength({ hits: 99 }), 'strong', 'hits=99 → strong');
  assert.strictEqual(RL.ruleStrength({ hits: 9, disabled: true }), 'disabled', 'disabled 标记优先');
  assert.strictEqual(RL.ruleStrength(null), 'disabled', 'null 规则 → disabled');

  // 强门可调
  svi.prefs.learnStrongHits = 3;
  assert.strictEqual(RL.ruleStrength({ hits: 3 }), 'strong', '强门调到 3 后 hits=3 即为强');
  assert.strictEqual(RL.ruleStrength({ hits: 2 }), 'weak', '仍为 weak');
  svi.prefs.learnStrongHits = 5;

  // ---- 2. 负反馈降级 (design D-2) ----
  RL.data = { [host]: { rules: [{ stem: 'img.demo', action: 'invert', hits: 8, lastAt: Date.now() }] } };
  const r0 = RL.data[host].rules[0];
  assert.strictEqual(RL.ruleStrength(r0), 'strong', '初始为强规则');
  RL.demote(host, 'img.demo');
  assert.strictEqual(r0.hits, 1, '第一次降级: hits 归 1');
  assert.strictEqual(r0.demotes, 1, '记一次 demote');
  assert.strictEqual(RL.ruleStrength(r0), 'disabled', 'hits 归 1 后不再生效');
  assert.strictEqual(r0.disabled, undefined, '第一次降级还不算禁用 (需连续 2 次)');
  RL.demote(host, 'img.demo');
  assert.strictEqual(r0.disabled, true, '第二次降级 → 禁用');
  assert.strictEqual(RL.demote(host, 'no-such-stem'), false, '不存在的 stem 返回 false');
  // 恢复
  assert.strictEqual(RL.restore(host, 'img.demo'), true, '恢复返回 true');
  assert.strictEqual(r0.disabled, false, '恢复后不禁用');
  assert.strictEqual(r0.demotes, 0, '恢复后降级计数清零');
  assert.strictEqual(RL.ruleStrength(r0), 'strong', '恢复后还原降级前的命中数 (8 → 仍是强规则), got ' + r0.hits);

  // ---- 3. 生效集合随分级开关变化 (零回归的机制) ----
  svi.prefs.learnGrading = false;
  assert.deepStrictEqual(effectiveSourceIds('rule'),
    ['learned', 'seedProtect', 'faviconSkip', 'seedForceInvert'],
    '分级关: rule 段仍是 v5-1 的四条');
  svi.prefs.learnGrading = true;
  assert.deepStrictEqual(effectiveSourceIds('rule'),
    ['learnedStrong', 'seedProtect', 'faviconSkip', 'seedForceInvert', 'learnedWeak'],
    '分级开: 强规则在种子前, 弱规则在种子后 (即"弱规则只能覆盖像素结论")');
  svi.prefs.learnGrading = false;

  // 形状先验开关
  assert.strictEqual(effectiveSourceIds('rule').indexOf('shapePrior'), -1, '形状先验默认不参与');
  svi.prefs.shapePrior = true;
  assert.strictEqual(effectiveSourceIds('rule').indexOf('shapePrior') >= 0, true, '开启后参与');
  svi.prefs.shapePrior = false;

  // ---- 4. 判定来源分布 (纯函数) ----
  const d0 = sourceDistribution([]);
  assert.strictEqual(d0.total, 0, '空输入 total=0');
  const d1 = sourceDistribution([
    { reason: 'pixel', actionId: 'invert' },
    { reason: 'pixel', actionId: 'invert' },
    { reason: 'learned', actionId: 'invert' },
    { reason: 'manual', actionId: 'hide' },
    null,
  ]);
  assert.strictEqual(d1.total, 4, 'null 条目被跳过');
  assert.strictEqual(d1.byReason.pixel, 2, '按原因聚合');
  assert.strictEqual(d1.byReason.learned, 1, '按原因聚合 (学习规则)');
  assert.strictEqual(d1.byAction.hide, 1, '按动作聚合');
  assert.strictEqual(d1.byAction.invert, 3, '按动作聚合 (反色)');

  // ---- 5. 形状签名稳定性 (design D-4) ----
  const elA = mkEl({ tagName: 'IMG', className: 'beta alpha', clientWidth: 200, clientHeight: 150 });
  const elB = mkEl({ tagName: 'IMG', className: 'alpha beta', clientWidth: 200, clientHeight: 150 });
  assert.strictEqual(shapeSignature(elA), shapeSignature(elA), '同元素多次调用签名一致');
  assert.strictEqual(shapeSignature(elA), shapeSignature(elB), 'class 顺序不影响签名 (先排序)');
  const elC = mkEl({ tagName: 'IMG', className: 'alpha beta', clientWidth: 900, clientHeight: 700 });
  assert.notStrictEqual(shapeSignature(elA), shapeSignature(elC), '不同尺寸桶 → 不同签名');
  assert.ok(shapeSignature(elA).indexOf('img|alpha.beta|') === 0, '签名格式: tag|排序后class|尺寸桶|上下文, got ' + shapeSignature(elA));
  assert.strictEqual(shapeSignature(null), '', 'null → 空签名');
  const noTag = mkEl({});
  noTag.tagName = '';
  assert.strictEqual(shapeSignature(noTag), '', '无 tagName → 空签名');

  // ---- 6. 形状先验门 (design D-4) ----
  shapeStore.data = {};
  const sig = shapeSignature(elA);
  shapeStore.bump(sig, 'invert', 'a.example');
  shapeStore.bump(sig, 'invert', 'b.example');
  const rec = shapeStore.get(sig);
  assert.strictEqual(rec.invert, 2, '形状计数累加');
  assert.strictEqual(Object.keys(rec.hosts).length, 2, 'host 去重计数');
  // 同一 host 重复只算一个 host
  shapeStore.bump(sig, 'invert', 'a.example');
  assert.strictEqual(Object.keys(shapeStore.get(sig).hosts).length, 2, '同 host 重复不增加 host 数');
  // 门未达 (默认 3 host) → null
  assert.strictEqual(svi.shapePriorResolve(elA), null, 'host 数未达先验门 → 不生效');
  shapeStore.bump(sig, 'invert', 'c.example');
  const prior = svi.shapePriorResolve(elA);
  assert.ok(prior && prior.verdict === 'invert', '达门且方向一致 → 给 invert 先验, got ' + JSON.stringify(prior));
  assert.strictEqual(prior.reason, 'shape-prior', '原因码 shape-prior');
  // 方向打平 → null
  shapeStore.bump(sig, 'keep', 'd.example');
  shapeStore.bump(sig, 'keep', 'e.example');
  shapeStore.bump(sig, 'keep', 'f.example');
  shapeStore.bump(sig, 'keep', 'g.example');
  assert.strictEqual(svi.shapePriorResolve(elA), null, '方向打平 → 不给先验 (不猜)');

  // ---- 7. 阈值校准 (design D-3: 只自动收紧) ----
  corrections.data = null;
  const cs0 = calibrate.suggest(host);
  assert.strictEqual(cs0.direction, null, '样本不足 → 不给方向');
  assert.ok(/样本不足/.test(cs0.reason), '原因文案');

  corrections.data = null;
  corrections.host(host).falseInvert = 8;
  corrections.host(host).falseKeep = 1;
  const cs1 = calibrate.suggest(host);
  assert.strictEqual(cs1.direction, 'tighten', '误反占优 → 建议收紧');
  assert.strictEqual(cs1.samples, 9, '样本数 = 误反 + 误保');

  corrections.data = null;
  corrections.host(host).falseInvert = 0;
  corrections.host(host).falseKeep = 8;
  const cs2 = calibrate.suggest(host);
  assert.strictEqual(cs2.direction, 'loosen', '误保占优 → 建议放松 (但不会自动应用)');

  // apply: 写站点覆盖 + 重置样本窗
  corrections.data = null;
  corrections.host(host).falseInvert = 8;
  corrections.host(host).falseKeep = 1;
  const before = Number(svi.prefs.siteOverrides[host] && svi.prefs.siteOverrides[host].imgLumCutoff);
  assert.strictEqual(calibrate.apply(host, 'tighten'), true, 'apply 返回 true');
  const ovr = svi.prefs.siteOverrides[host];
  assert.ok(ovr && typeof ovr.imgLumCutoff === 'number', '写入图片侧阈值 imgLumCutoff (图片浅色判定用的是它)');
  assert.ok(typeof ovr.imgAreaThreshold === 'number', '写入 imgAreaThreshold');
  assert.ok(typeof ovr.whiteThreshold === 'number', '写入视频侧 whiteThreshold');
  assert.ok(typeof ovr.lumThreshold === 'number', '写入视频侧 lumThreshold');
  assert.ok(ovr.imgLumCutoff > (isNaN(before) ? (Number(svi.prefs.imgLumCutoff) || 180) : before) - 0.001, '收紧 = 抬高明度线');
  assert.strictEqual(corrections.stats(host).falseInvert, 0, 'apply 后重置误反样本窗 (防震荡)');
  assert.strictEqual(calibrate.calibrated(host), true, '标记本站已校准');
  assert.strictEqual(calibrate.apply(host, 'bogus'), false, '非法方向返回 false');
  // 上限钳制: 连续收紧不会越界
  for (let i = 0; i < 40; i++) calibrate.apply(host, 'tighten');
  const ovr2 = svi.prefs.siteOverrides[host];
  assert.ok(ovr2.imgLumCutoff <= 215, '收紧不得越过上限 (imgLumCutoff ≤ 215), got ' + ovr2.imgLumCutoff);
  assert.ok(ovr2.lumThreshold <= 230, '收紧不得越过上限 (lumThreshold ≤ 230), got ' + ovr2.lumThreshold);
  assert.strictEqual(calibrate.reset(host), true, '恢复默认返回 true');
  assert.strictEqual(calibrate.calibrated(host), false, '恢复后不再标记已校准');

  // ---- 8. 规则合并 (design D-5: 取大不累加) ----
  const m1 = mergeRulesInto(
    [{ stem: 'img.a', action: 'invert', hits: 5, lastAt: 1 }],
    [{ stem: 'img.a', action: 'invert', hits: 5, lastAt: 2 }]
  );
  assert.strictEqual(m1.rules.length, 1, '同 stem 合并为一条');
  assert.strictEqual(m1.rules[0].hits, 5, '一致时取 max 而**不是累加** (否则规则包会变成权重放大器)');
  assert.strictEqual(m1.conflicts, 0, '无冲突');

  const m2 = mergeRulesInto(
    [{ stem: 'img.b', action: 'invert', hits: 3, lastAt: 1 }],
    [{ stem: 'img.b', action: 'protect', hits: 7, lastAt: 2 }]
  );
  assert.strictEqual(m2.conflicts, 1, '方向不一致记一次冲突');
  assert.strictEqual(m2.rules[0].action, 'protect', '冲突保留 hits 高者');
  assert.strictEqual(m2.rules[0].hits, 7, '连 hits 一起采用');

  const m3 = mergeRulesInto(
    [{ stem: 'img.c', action: 'protect', hits: 9, lastAt: 1 }],
    [{ stem: 'img.c', action: 'invert', hits: 2, lastAt: 2 }]
  );
  assert.strictEqual(m3.rules[0].action, 'protect', '冲突时 hits 低者不覆盖本地');
  const m4 = mergeRulesInto(
    [{ stem: 'img.d', action: 'invert', hits: 4, lastAt: 1 }],
    [{ stem: 'img.d', action: 'protect', hits: 4, lastAt: 2 }]
  );
  assert.strictEqual(m4.rules[0].action, 'invert', '冲突且 hits 相等 → 保留本地');

  const m5 = mergeRulesInto([], [{ stem: 'img.e', action: 'hide', hits: 6 }]);
  assert.strictEqual(m5.added, 1, '新条目计入 added');
  assert.strictEqual(m5.rules[0].action, 'hide', 'hide 动作同样可合并');
  assert.deepStrictEqual(mergeRulesInto([], []).rules, [], '空 + 空 = 空');
  // 幂等性: 同一份文件导入两次, 权重不得变化 (这是"取大不累加"的直接验收)
  const once = mergeRulesInto([{ stem: 'img.f', action: 'invert', hits: 5 }],
    [{ stem: 'img.f', action: 'invert', hits: 5 }]);
  const twice = mergeRulesInto(once.rules, [{ stem: 'img.f', action: 'invert', hits: 5 }]);
  assert.strictEqual(twice.rules[0].hits, once.rules[0].hits, '重复导入同一文件权重不变 (幂等)');

  // ---- 清理 ----
  RL.data = {};
  shapeStore.data = null;
  corrections.data = null;
  try { svi.Store.remove('shapes'); } catch (e) { /* ignore */ }
  try { svi.Store.remove('corrections'); } catch (e) { /* ignore */ }
  delete svi.prefs.siteOverrides[host];

  console.log('✓ v5.3 unit tests passed: hits 分级与降级/恢复 / 生效集合随开关变化 / 来源分布 / 形状签名与先验门 / 阈值校准只收紧与钳制 / 规则合并取大不累加且幂等');
})();

// ============================================================
// v5.3 fixture 回归 (用户教过的结论 → CI 保护网)
// 产出: node scripts/export-fixtures.js <导出的备份.json>
// 文件缺失时跳过并打印提示 (CI 上通常没有 —— 它含用户个人的图片 URL, 已 gitignore)
// ============================================================
(function () {
  const FIXTURE = path.join(__dirname, 'dev', 'fixtures', 'verdicts.jsonl');
  if (!fs.existsSync(FIXTURE)) {
    console.log('· v5.3 fixture 回归: 跳过 (未找到 dev/fixtures/verdicts.jsonl)');
    console.log('  生成方式: 设置 → 💾 数据与备份 → 导出全量备份, 然后');
    console.log('            node scripts/export-fixtures.js <那个.json>');
    return;
  }

  const raw = fs.readFileSync(FIXTURE, 'utf8').trim();
  if (!raw) {
    console.log('· v5.3 fixture 回归: 跳过 (fixture 文件为空)');
    return;
  }

  const ACTION_OF = { invert: 'invert', keep: 'protect', hide: 'hide', mask: 'mask' };
  // stem 形如 img.foo / img#bar / img —— 与 selectorStem 的产出一一对应
  function elFromStem(stem) {
    const el = { tagName: 'IMG', id: '', className: '', isConnected: true };
    const m = /^([a-z0-9-]+)(?:([.#])(.*))?$/.exec(String(stem || '').toLowerCase());
    if (!m) return null;
    el.tagName = m[1].toUpperCase();
    if (m[2] === '.') el.className = m[3];
    else if (m[2] === '#') el.id = m[3];
    return el;
  }

  let checked = 0;
  let skipped = 0;
  const lines = raw.split('\n').filter(Boolean);
  for (const line of lines) {
    let f = null;
    try { f = JSON.parse(line); } catch (e) { continue; }
    if (!f || !f.expected) continue;
    const want = ACTION_OF[f.expected];
    if (!want) { skipped++; continue; }

    if (f.origin === 'learned' && f.stem) {
      const el = elFromStem(f.stem);
      if (!el) { skipped++; continue; }
      // 直接注入该 host 的规则并断言 RuleLearner 复现出同一个动作
      svi.RuleLearner.data = { [f.host]: { rules: [{ stem: f.stem, action: want, hits: 99, lastAt: Date.now() }] } };
      const got = svi.RuleLearner.decideFor(f.host, el);
      assert.strictEqual(got, want, 'fixture(' + f.origin + '): ' + f.host + ' ' + f.stem + ' 期望 ' + want + ', 实得 ' + got);
      checked++;
    } else if (f.origin === 'manual' && f.src) {
      // 元素级手动结论经 resolveStage 的 manual 源读取 —— 但该源用的是**当前页 host**,
      // 因此只有与 shim host 相同的条目可在此复现; 其余跳过 (如实计数, 不假装覆盖)。
      if (f.host !== svi.profileKey()) { skipped++; continue; }
      const key = svi.manualOverrideKey(f.host, f.src);
      svi.prefs.manualOverrides[key] = (f.expected === 'invert') ? 'invert' : 'restore';
      const got = svi.resolveStage({ tagName: 'IMG', className: '', id: '', getAttribute: () => null, setAttribute() {}, removeAttribute() {}, matches: () => false },
        { src: f.src }, 'override');
      assert.ok(got, 'fixture(manual): ' + f.src + ' 必须能被 override 段解析出来');
      assert.strictEqual(got.verdict, (f.expected === 'invert' ? 'invert' : 'keep'),
        'fixture(manual): ' + f.src + ' 期望 ' + f.expected + ', 实得 ' + got.verdict);
      delete svi.prefs.manualOverrides[key];
      checked++;
    } else {
      skipped++;
    }
  }

  svi.RuleLearner.data = {};
  console.log('✓ v5.3 fixture 回归通过: ' + checked + ' 条用户教过的结论被当前代码复现 (跳过 ' + skipped + ' 条, 其中跨 host 的手动条目无法在 Node 桩中复现)');
})();

// ============================================================
// v5.4 单测 (帧序列两个门 / 动图闸门 / 全帧谱三分类 / 分帧步长)
// 契约来源: .trellis/tasks/09-25-v5-preload-decide/design.md §D-1 / §D-3 / §D-4
// ============================================================
(function () {
  const { frameSequenceDecision, animatedProbe, animatedSpectrum, animatedStride } = svi;
  const TH = 0.6; // threshold
  const OPT = { threshold: TH, sceneDelta: 0.35, flashRatio: 0.5 };

  // ---- 1. 帧序列: 窗口未满一律"什么都不改" ----
  for (const w of [[], [0.9], [0.9, 0.9]]) {
    const d = frameSequenceDecision(w, OPT);
    assert.strictEqual(d.ready, false, '窗口 <3 帧必须 not ready: ' + JSON.stringify(w));
    assert.strictEqual(d.whiteFlash, false, 'not ready 时不得报白闪');
    assert.strictEqual(d.earlySwitch, false, 'not ready 时不得报提前切换');
  }
  assert.strictEqual(frameSequenceDecision(null, OPT).ready, false, 'null 窗口安全');
  assert.strictEqual(frameSequenceDecision('nope', OPT).ready, false, '非数组窗口安全');

  // ---- 2. 稳定态: 两个门都不得触发 (这是"默认路径不改"的核心保证) ----
  for (const w of [[0.1, 0.1, 0.1], [0.9, 0.9, 0.9], [0.5, 0.5, 0.5], [0.95, 0.9, 0.92]]) {
    const d = frameSequenceDecision(w, OPT);
    assert.strictEqual(d.ready, true, 'ready');
    assert.strictEqual(d.whiteFlash, false, '稳定态不得报白闪: ' + JSON.stringify(w));
    assert.strictEqual(d.earlySwitch, false, '稳定态不得报提前切换: ' + JSON.stringify(w));
  }

  // ---- 3. 明确跃变 (暗→白) → 提前切换, 且**不得**被白闪门压掉 ----
  const jump = frameSequenceDecision([0.1, 0.1, 0.9], OPT);
  assert.strictEqual(jump.earlySwitch, true, '大跃变必须提前切换');
  assert.strictEqual(jump.whiteFlash, false, '大跃变是真场景切换, 不得被误判为转场白闪 (两者形态相同, 靠跃变幅度区分)');
  assert.strictEqual(jump.delta, 0.8, 'delta 计算正确');
  const jump2 = frameSequenceDecision([0.2, 0.3, 0.95], OPT);
  assert.strictEqual(jump2.earlySwitch, true, '逐帧爬升到白也算明确跃变');

  // 容忍带: 明确在涨但还没到满阈值 → 提前判白 (这是"提前一帧"的来源)
  const earlyBand = frameSequenceDecision([0.1, 0.1, 0.55], OPT);
  assert.strictEqual(earlyBand.earlySwitch, true, '跃变达门且越过容忍带下沿 → 提前切换 (0.55 ≥ 0.6×0.9)');
  const notYet = frameSequenceDecision([0.1, 0.1, 0.5], OPT);
  assert.strictEqual(notYet.earlySwitch, false, '未越过容忍带下沿 (0.5 < 0.54) → 不提前');

  // ---- 4. 转场白闪: 证据薄弱的白帧被压掉 ----
  // 关键: 要构造"没有明确跃变"的孤立白帧 —— 跃变 ≥ sceneDelta 时 earlySwitch 会接管 (那是真切换)
  const flash = frameSequenceDecision([0.3, 0.45, 0.62], OPT);
  assert.strictEqual(flash.earlySwitch, false, '跃变 0.17 < sceneDelta 0.35 → 不构成提前切换');
  assert.strictEqual(flash.whiteFlash, true, '刚过阈值 + 孤立白帧 + 无明确跃变 → 判为转场白闪');
  // 窗口里不止一帧白 → 不是闪光
  const twoWhite = frameSequenceDecision([0.9, 0.45, 0.62], OPT);
  assert.strictEqual(twoWhite.whiteFlash, false, '窗口内已有别的白帧 → 不是孤立白闪');
  // 白但已在窗口里稳定 → 不压
  const stableWhite = frameSequenceDecision([0.62, 0.62, 0.62], OPT);
  assert.strictEqual(stableWhite.whiteFlash, false, '持续的白不是闪光');

  // ---- 5. 动图闸门 (纯函数: 采样由调用方给) ----
  assert.strictEqual(animatedProbe(null).animated, false, 'null 元素');
  assert.strictEqual(animatedProbe({}, { src: '' }).animated, false, '无 src');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.gif' }).animated, true, '扩展名门: gif');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.webp?v=2' }).animated, true, '扩展名门: webp 带查询串');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.apng' }).animated, true, '扩展名门: apng');
  assert.strictEqual(animatedProbe({}, { src: 'data:image/gif;base64,AAAA' }).animated, true, 'data URI 门');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.png' }).animated, false, '静态 png 不进重路径');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.png', sampleA: 0.1, sampleB: 0.9 }).animated, true,
    '像素门: 两时刻采样差异超阈 → 疑似动图 (后缀不可靠时兜底)');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.png', sampleA: 0.5, sampleB: 0.52 }).animated, false,
    '像素门: 差异不足 → 静态');
  assert.strictEqual(animatedProbe({}, { src: 'https://x.test/a.gif' }).reason, 'extension', '闸门给出原因');

  // ---- 6. 全帧谱三分类 ----
  const spAllLight = animatedSpectrum([0.9, 0.95, 0.92, 0.88], { threshold: TH, allLightRatio: 0.9 });
  assert.strictEqual(spAllLight.verdict, 'invert', '全浅 → 反色');
  assert.strictEqual(spAllLight.reason, 'animated-light', 'reason=animated-light');
  assert.strictEqual(spAllLight.frames, 4, '帧数');
  assert.strictEqual(spAllLight.whiteFrames, 4, '白帧数');
  assert.strictEqual(spAllLight.ratio, 1, '白帧占比');

  const spAllDark = animatedSpectrum([0.1, 0.2, 0.05, 0.3], { threshold: TH, allLightRatio: 0.9 });
  assert.strictEqual(spAllDark.verdict, 'keep', '全深 → 保持原样');
  assert.strictEqual(spAllDark.reason, 'animated-dark', 'reason=animated-dark');

  const spMixed = animatedSpectrum([0.9, 0.9, 0.1, 0.1, 0.1], { threshold: TH, allLightRatio: 0.9 });
  assert.strictEqual(spMixed.ratio, 0.4, '混合型白帧占比 0.4');
  assert.strictEqual(spMixed.verdict, 'keep', '混合型**默认不反** (CSS 滤镜无法按时序切换, 不做半吊子近似)');
  assert.strictEqual(spMixed.reason, 'animated-mixed', 'reason=animated-mixed');
  // majority 策略: 按多数帧近似 (且面板如实标注这不是逐帧切换)
  const spMajority = animatedSpectrum([0.9, 0.9, 0.9, 0.1, 0.2], { threshold: TH, allLightRatio: 0.9, policy: 'majority' });
  assert.strictEqual(spMajority.verdict, 'invert', 'majority 且白帧占多数 → 反色');
  assert.strictEqual(spMajority.reason, 'animated-mixed', '仍是 mixed (策略不改变"这是混合型"的事实)');
  const spMajorityMinor = animatedSpectrum([0.9, 0.1, 0.1, 0.2], { threshold: TH, allLightRatio: 0.9, policy: 'majority' });
  assert.strictEqual(spMajorityMinor.verdict, 'keep', 'majority 但白帧占少数 → 保持原样');

  // 边界: 恰好等于 allLightRatio
  const spEdge = animatedSpectrum([0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], { threshold: TH, allLightRatio: 0.9 });
  assert.strictEqual(spEdge.ratio, 0.3, '边界用例占比 0.3');
  const spEdge2 = animatedSpectrum(Array(9).fill(0.9).concat([0.1]), { threshold: TH, allLightRatio: 0.9 });
  assert.strictEqual(spEdge2.ratio, 0.9, '恰好 0.9');
  assert.strictEqual(spEdge2.verdict, 'invert', '恰好等于门 → 全浅 (闭区间)');

  assert.strictEqual(animatedSpectrum([], {}).reason, 'animated-empty', '空帧 → animated-empty');
  assert.strictEqual(animatedSpectrum([], {}).verdict, 'keep', '空帧不给反色');

  // ---- 7. 分帧步长 (不是"只解前 N 帧") ----
  assert.strictEqual(animatedStride(30, 60), 1, '帧数未超上限 → 步长 1');
  assert.strictEqual(animatedStride(120, 60), 2, '120 帧抽 60 → 步长 2');
  assert.strictEqual(animatedStride(1000, 60), 17, '1000 帧抽 60 → 步长 17');
  assert.strictEqual(animatedStride(0, 60), 1, '0 帧安全');
  assert.strictEqual(animatedStride(5, 0), 5, 'cap=0 时按 1 处理 (不除零)');
  // 抽帧覆盖全段而不是只取开头
  const stride = animatedStride(120, 60);
  const picked = [];
  for (let i = 0; i < 120; i += stride) picked.push(i);
  assert.ok(picked.length <= 60, '抽帧数不超过上限');
  assert.ok(picked[picked.length - 1] > 100, '抽帧必须覆盖到动画后段 (而不是只解开头), got ' + picked[picked.length - 1]);

  console.log('✓ v5.4 unit tests passed: 帧序列两个门(含跃变优先于白闪)/动图闸门/全帧谱三分类(混合型默认不反)/分帧步长覆盖全段');
})();

// ============================================================
// v5.5 单测 (三档迁移 / 本站启用门 / pending 遮罩与预算 / 逃生)
// 契约来源: .trellis/tasks/09-25-v5-mask-guard/design.md §D-1 / §D-2 / §D-4 / §D-5
// ============================================================
(function () {
  const { maskShouldArm, pendingMask, siteMediaStore, loadState } = svi;

  function mkEl(opts) {
    const o = opts || {};
    const attrs = Object.assign({}, o.attrs);
    const el = {
      tagName: o.tagName || 'IMG', id: '', className: '', isConnected: true,
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      matches() { return false; },
      querySelectorAll() { return []; },
      _attrs: attrs,
    };
    return el;
  }

  // ---- 1. 三档 + 旧布尔无损迁移 (design D-1) ----
  // 注意: loadState 优先读 svi: 命名空间 (Store.get('prefs')), 而不是 localStorage 遗留键。
  // 初版写到遗留键上 → 读到的仍是旧值, 断言假失败 (已改为直接写 Store)。
  const origStorePrefs = svi.Store.get('prefs', null);
  function withPrefs(obj) {
    svi.Store.set('prefs', obj || {});
    return loadState();
  }
  assert.strictEqual(withPrefs({ flashGuard: true }).flashGuardLevel, 'document',
    '旧 true → document (= v4.6.1 行为, 零回归)');
  assert.strictEqual(withPrefs({ flashGuard: false }).flashGuardLevel, 'off',
    '旧 false → off');
  assert.strictEqual(withPrefs({}).flashGuardLevel, 'document',
    '字段缺失 → document (默认即 v4.6.1 行为)');
  assert.strictEqual(withPrefs({ flashGuardLevel: 'media' }).flashGuardLevel, 'media', '新值原样保留');
  assert.strictEqual(withPrefs({ flashGuardLevel: 'bogus' }).flashGuardLevel, 'document',
    '非法档位回退 document');
  // flashGuard 是派生值 (旧版本仍能读到正确的布尔)
  assert.strictEqual(withPrefs({ flashGuardLevel: 'media' }).flashGuard, true, 'media → flashGuard=true (派生)');
  assert.strictEqual(withPrefs({ flashGuardLevel: 'off' }).flashGuard, false, 'off → flashGuard=false (派生)');
  // 预算钳制
  const clamped = withPrefs({ maskBudgetMs: 99999, maskMaxElements: 0, siteInvertRate: 5 });
  assert.strictEqual(clamped.maskBudgetMs, 5000, '总时长预算钳到上限');
  assert.strictEqual(clamped.maskMaxElements, 1, '元素数钳到下限');
  assert.strictEqual(clamped.siteInvertRate, 0.95, '反色率门钳到上限');
  if (origStorePrefs) svi.Store.set('prefs', origStorePrefs); else svi.Store.remove('prefs');

  // ---- 2. 本站启用门 (四类条件 + 首访不遮) ----
  assert.strictEqual(maskShouldArm('x', {}).armed, false, '首访 (无任何证据) 一律不遮');
  assert.ok(/首访/.test(maskShouldArm('x', {}).reason), '首访原因要写明');
  assert.strictEqual(maskShouldArm('x', { override: 'off', hasForceInvert: true }).armed, false,
    '面板禁用优先于一切自动门');
  assert.strictEqual(maskShouldArm('x', { override: 'on' }).armed, true, '面板强制启用');
  assert.strictEqual(maskShouldArm('x', { hasForceInvert: true }).armed, true, '内置强制反色 → 启用');
  assert.strictEqual(maskShouldArm('x', { hasLearnedInvert: true }).armed, true, '学习到的反色规则 → 启用');
  // 历史反色率门
  assert.strictEqual(maskShouldArm('x', { seen: 4, inverted: 4, minSeen: 5 }).armed, false,
    '样本数未达门 → 不遮 (即使反色率 100%)');
  assert.strictEqual(maskShouldArm('x', { seen: 5, inverted: 1, max: 1, minSeen: 5, rateThreshold: 0.35 }).armed, false,
    '反色率 20% < 35% → 不遮');
  assert.strictEqual(maskShouldArm('x', { seen: 5, inverted: 2, minSeen: 5, rateThreshold: 0.35 }).armed, true,
    '反色率 40% ≥ 35% 且样本达门 → 启用');
  assert.strictEqual(maskShouldArm('x', { seen: 10, inverted: 3, minSeen: 5, rateThreshold: 0.3 }).armed, true,
    '恰好等于阈值的边界 (0.30 ≥ 0.30) → 启用 (闭区间)');
  assert.strictEqual(maskShouldArm('x', { seen: 10, inverted: 2, minSeen: 5, rateThreshold: 0.3 }).armed, false,
    '恰好在阈值下方 (0.20 < 0.30) → 不遮');

  // ---- 3. siteMediaStore: 记录与比率 ----
  siteMediaStore.data = null;
  try { svi.Store.remove('siteMedia'); } catch (e) { /* ignore */ }
  siteMediaStore.record('a.test', true);
  siteMediaStore.record('a.test', true);
  siteMediaStore.record('a.test', false);
  const st1 = siteMediaStore.stats('a.test');
  assert.strictEqual(st1.seen, 3, 'seen 累加');
  assert.strictEqual(st1.inverted, 2, 'inverted 累加');
  assert.ok(Math.abs(siteMediaStore.rate('a.test') - 2 / 3) < 1e-9, '反色率 = 2/3');
  assert.strictEqual(siteMediaStore.rate('never.test'), 0, '无记录站点反色率 0');
  assert.strictEqual(siteMediaStore.stats('never.test').seen, 0, '无记录站点 seen 0');

  // ---- 4. pending 遮罩: 打标 / 摘罩 / 白名单 / 暂停 / 预算 ----
  const savedMaskMax = svi.prefs.maskMaxElements;
  const savedPaused = svi.runtime.maskPaused;
  pendingMask.armed = true;
  pendingMask.count = 0;
  pendingMask.settled = 0;
  svi.runtime.maskPaused = false;

  const e1 = mkEl({});
  assert.strictEqual(pendingMask.tag(e1), true, '正常情况下打标成功');
  assert.strictEqual(e1.getAttribute('data-svi-pending'), '', '写 pending 属性 (纯 CSS 门的载体)');
  assert.strictEqual(pendingMask.count, 1, '计数 +1');
  // 幂等: 已打标不重复
  assert.strictEqual(pendingMask.tag(e1), false, '已打标不重复');
  // 摘罩
  assert.strictEqual(pendingMask.settle(e1, 'pixel'), true, '摘罩返回 true');
  assert.strictEqual(e1.getAttribute('data-svi-pending'), null, 'pending 属性被摘');
  assert.strictEqual(e1.getAttribute('data-svi-settled'), 'pixel', '写 settled 并记原因');
  assert.strictEqual(pendingMask.count, 0, '计数归零');
  assert.strictEqual(pendingMask.settle(e1, 'again'), false, '重复摘罩返回 false (幂等)');

  // 白名单: 用户已表态的元素不打标
  const e2 = mkEl({ attrs: { 'data-svi-manual': 'restore' } });
  assert.strictEqual(pendingMask.tag(e2), false, '用户已手动表态的元素不得被遮');
  assert.strictEqual(e2.getAttribute('data-svi-pending'), null, '且不写 pending');

  // 暂停态 (Esc 逃生后) 不打标
  svi.runtime.maskPaused = true;
  assert.strictEqual(pendingMask.tag(mkEl({})), false, '暂停态不打标');
  svi.runtime.maskPaused = false;

  // 元素数预算: 超出部分不打标 + 记一次预算超限
  svi.prefs.maskMaxElements = 2;
  const c0 = (svi.stats.counters || {}).maskBudgetExceeded || 0;
  pendingMask.count = 0;
  const b1 = mkEl({}); const b2 = mkEl({}); const b3 = mkEl({});
  assert.strictEqual(pendingMask.tag(b1), true, '第 1 个在预算内');
  assert.strictEqual(pendingMask.tag(b2), true, '第 2 个在预算内');
  assert.strictEqual(pendingMask.tag(b3), false, '第 3 个超出预算 → 不打标 (宁可白闪也不白藏)');
  assert.strictEqual(b3.getAttribute('data-svi-pending'), null, '超预算元素不得被遮');
  assert.ok(((svi.stats.counters || {}).maskBudgetExceeded || 0) > c0, '超预算必须可观测');

  // settleAll: 一次性摘除 + 原因可追溯
  assert.strictEqual(pendingMask.settleAll('escape') >= 1, true, 'settleAll 摘除至少 1 个');
  assert.strictEqual(b1.getAttribute('data-svi-pending'), null, 'settleAll 后无残留 pending');
  assert.strictEqual(pendingMask.count, 0, 'settleAll 后计数归零');

  // 平均遮罩时长: 有摘罩记录时可算
  pendingMask.settled = 2;
  pendingMask.totalMs = 300;
  assert.strictEqual(pendingMask.avgMs(), 150, '平均遮罩时长');
  pendingMask.settled = 0;
  assert.strictEqual(pendingMask.avgMs(), 0, '无记录时返回 0 (不除零)');

  // ---- 清理 ----
  svi.prefs.maskMaxElements = savedMaskMax;
  svi.runtime.maskPaused = savedPaused;
  pendingMask.armed = false;
  pendingMask.count = 0;
  siteMediaStore.data = null;
  try { svi.Store.remove('siteMedia'); } catch (e) { /* ignore */ }

  console.log('✓ v5.5 unit tests passed: 三档与旧布尔无损迁移 / 本站启用门四类条件(含首访不遮与边界) / pending 打标与白名单与预算 / settleAll 幂等 / 逃生暂停');
})();

// ============================================================
// v6.0 单测 (区域分割内核: 掩码契约不变量 + 双性能门 + 偏好规范化)
// 契约来源: .trellis/tasks/09-25-v6-auto-region/design.md §3.1 (I0~I7) / §5 (双门) / §10 (降级)
// ============================================================
(function () {
  const {
    REGION_MASK_VERSION, REGION_DEFAULTS, makeRegionMask, validateRegionMask,
    buildRegionMask, regionCoverage, prefs, loadState, Store,
  } = svi;

  // ---- 1. 契约版本 + 网格尺寸 (I1) ----
  assert.strictEqual(REGION_MASK_VERSION, 1, '契约版本必须是 1');
  {
    const m = makeRegionMask({ gw: 4, gh: 3, source: 'region', data: [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0] });
    assert.ok(m.data instanceof Uint8Array, 'I1: data 必须是 Uint8Array');
    assert.strictEqual(m.data.length, 12, 'I1: data 长度 === gw*gh');
    assert.ok(validateRegionMask(m).ok, 'I1: 自洽掩码应通过校验');
  }
  {
    // data 长度与 gw*gh 不符 → 回退为全 0 (而不是产出一份长度错的数据)
    const m = makeRegionMask({ gw: 4, gh: 4, source: 'none', data: [1, 1] });
    assert.strictEqual(m.data.length, 16, 'I1: 长度不符时回退为按网格新建');
    assert.ok(validateRegionMask(m).ok, 'I1: 回退后仍自洽');
  }

  // ---- 2. source 语义 (I2 / I3) ----
  {
    const w = makeRegionMask({ gw: 4, gh: 4, source: 'whole' });
    assert.strictEqual(w.coverage, 1, 'I2: whole → data 全 1');
    assert.deepStrictEqual(w.expr, { kind: 'holes', holes: [] }, 'I2: 整图反色 = 零个洞的矢量表达');
    assert.ok(validateRegionMask(w).ok, 'I2 自洽');

    const n = makeRegionMask({ gw: 4, gh: 4, source: 'none' });
    assert.strictEqual(n.coverage, 0, 'I3: none → data 全 0');
    assert.deepStrictEqual(n.expr, { kind: 'islands', polys: [] }, 'I3: 不反色 = 零个孤岛的矢量表达');
    assert.ok(validateRegionMask(n).ok, 'I3 自洽');
  }

  // ---- 3. 降级 (I4) ----
  {
    const d = makeRegionMask({ gw: 4, gh: 4, source: 'degraded', degrade: { reason: 'taint' } });
    assert.strictEqual(d.degrade.reason, 'taint', 'I4: degrade 原因透传');
    assert.ok(validateRegionMask(d).ok, 'I4 自洽');
    // 带 degraded 但漏传原因 → 补显式 unknown, 不静默放行
    const d2 = makeRegionMask({ gw: 4, gh: 4, source: 'degraded' });
    assert.strictEqual(d2.degrade.reason, 'unknown', 'I4: 缺失原因补 unknown');
  }

  // ---- 4. region 的边界 (I5) ----
  {
    const half = new Uint8Array(16);
    half[0] = 1;
    half[1] = 1;
    const r = makeRegionMask({ gw: 4, gh: 4, source: 'region', data: half });
    assert.strictEqual(r.coverage, 0.125, 'I5: coverage 落在 (0,1)');
    assert.strictEqual(r.degrade, null, 'I5: region 不带 degrade');
    assert.ok(validateRegionMask(r).ok, 'I5 自洽');

    // 全 1 的 data 标成 region → 违反 I5 (该走 whole)
    const bad = validateRegionMask({ ...r, data: new Uint8Array(16).fill(1), coverage: 1 });
    assert.ok(!bad.ok && bad.errors.join('|').indexOf('I5') >= 0, 'I5: 全 1 不许标成 region');
    // 带 degrade 又标 region → 违反 I5
    const bad2 = validateRegionMask({ ...r, degrade: { reason: 'x' } });
    assert.ok(!bad2.ok && bad2.errors.join('|').indexOf('I5') >= 0, 'I5: region 不许带 degrade');
  }

  // ---- 5. coverage 与 data 算术一致 (I6) ----
  {
    const m = makeRegionMask({ gw: 4, gh: 4, source: 'region', data: new Uint8Array(16).fill(0).map((_, i) => (i < 4 ? 1 : 0)) });
    assert.strictEqual(m.coverage, 0.25, 'I6: coverage 由 data 派生');
    assert.strictEqual(regionCoverage(m.data), m.coverage, 'I6: regionCoverage 与字段一致');
    // 篡改 coverage → 校验必须抓到
    const tampered = validateRegionMask({ ...m, coverage: 0.9 });
    assert.ok(!tampered.ok && tampered.errors.join('|').indexOf('I6') >= 0, 'I6: 篡改 coverage 会被抓到');
    // data 不是 Uint8Array → I1
    const badType = validateRegionMask({ ...m, data: [1, 0] });
    assert.ok(!badType.ok && badType.errors.join('|').indexOf('I1') >= 0, 'I1: 非 Uint8Array 被拒');
    // 版本不符 → I0
    const badVer = validateRegionMask({ ...m, v: 2 });
    assert.ok(!badVer.ok && badVer.errors.join('|').indexOf('I0') >= 0, 'I0: 版本不符被拒');
    // 非对象 → 直接拒
    assert.strictEqual(validateRegionMask(null).ok, false, 'null 被拒');
  }

  // ---- 6. expr (I7/I8): 可矩形化 → 矢量; 不可矩形化 → 位图, 灰度取 0/255 ----
  {
    // 4×4 棋盘: 8 个孤立格, 用 ≤3 个矩形精确表达不了 → 位图
    const cb = new Uint8Array(16);
    for (let i = 0; i < 16; i++) cb[i] = ((i + ((i / 4) | 0)) % 2 === 1) ? 1 : 0;
    const m = makeRegionMask({ gw: 4, gh: 4, source: 'region', data: cb });
    assert.strictEqual(m.expr.kind, 'bitmap', 'I8: 棋盘掩码无法用 ≤K 矩形表达 → 位图');
    assert.strictEqual(m.expr.bytes.length, 16, 'I7: 位图长度 === gw*gh');
    assert.deepStrictEqual(Array.from(m.expr.bytes), Array.from(cb).map(v => (v ? 255 : 0)), 'I7: 位图取 0/255 灰度');

    // 一个矩形块 → 矢量快路径 (阶段 4 起): 主流是 1, 抠掉的那块是 0 → 洞式
    const block = new Uint8Array(16).fill(1);
    for (let y = 1; y < 3; y++) for (let x = 1; x < 3; x++) block[y * 4 + x] = 0;
    const mb = makeRegionMask({ gw: 4, gh: 4, source: 'region', data: block });
    assert.strictEqual(mb.expr.kind, 'holes', 'I8: 矩形块可精确表达 → 洞式矢量');
    assert.deepStrictEqual(mb.expr.holes, [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }], 'I8: 洞 = 归一化矩形');
    assert.ok(validateRegionMask(mb).ok, 'I8: 矢量表达必须与 data 互译');
  }

  // ---- 7. 双性能门 (门 1) 的边界与降级 ----
  {
    const grid = (ratio) => ({ gw: 16, gh: 16, cellLight: new Uint8Array(256), ratio: ratio });
    const HI = REGION_DEFAULTS.wholeRatioHigh;   // 0.97 = 1 - minAreaRatio
    const LO = REGION_DEFAULTS.wholeRatioLow;    // 0.03 = minAreaRatio

    assert.strictEqual(HI, 1 - REGION_DEFAULTS.minAreaRatio, '门 1 上界由面积门派生 (1 - minAreaRatio)');
    assert.strictEqual(buildRegionMask(grid(0.99)).source, 'whole', '门 1 上侧: 0.99 → 整图反色');
    assert.strictEqual(buildRegionMask(grid(HI)).source, 'whole', '门 1 上界闭区间: 0.97 → 整图反色');

    assert.strictEqual(buildRegionMask(grid(0.01)).source, 'none', '门 1 下侧: 0.01 → 不反色');
    assert.strictEqual(buildRegionMask(grid(LO)).source, 'none', '门 1 下界闭区间: 0.03 → 不反色');

    // 边界外侧 (0.96 / 0.04): 不再短路, 而是**进分割** —— 这才是「含 3% 嵌入内容」的图。
    //   本例的 cellLight 全 0 (整图非浅色), 故走 carve-light: 浅色集为空 → 抠不到东西 →
    //   门 2 下界判 none。断言「进过分割」这条路径本身: 计数在 regionMaskTake 里, 这里只断言自洽 + 结论。
    for (const r of [LO + 0.01, 0.5, HI - 0.01]) {
      const m = buildRegionMask(grid(r));
      assert.ok(validateRegionMask(m).ok, '中间带 ratio=' + r + ' 的掩码必须自洽');
      assert.strictEqual(m.source, 'none', '中间带 ratio=' + r + ' (整图非浅色) → 抠不到东西 → none');
    }

    // 读不到像素 → degraded + no-pixels (设计 §10: 失败必放行)
    for (const g of [null, { gw: 16, gh: 16, cellLight: new Uint8Array(0) }, {}]) {
      const m = buildRegionMask(g);
      assert.strictEqual(m.source, 'degraded', '读不到像素 → degraded');
      assert.strictEqual(m.degrade.reason, 'no-pixels', '降级原因必须是 no-pixels');
      assert.ok(validateRegionMask(m).ok, '降级掩码自洽 (I4)');
    }

    // ratio 缺失时由 cellLight 聚合 (纯函数, 不依赖调用方传 ratio)
    const agg = buildRegionMask({ gw: 4, gh: 4, cellLight: new Uint8Array(16).fill(1) });
    assert.strictEqual(agg.source, 'whole', 'ratio 缺失 → 由 cellLight 聚合为 1.0 → whole');
  }

  // ---- 8. 纯函数性: 同输入同输出, 且不共享 data 引用 ----
  {
    const g = { gw: 8, gh: 8, cellLight: new Uint8Array(64).fill(0), ratio: 0.5 };
    const a = buildRegionMask(g);
    const b = buildRegionMask(g);
    assert.deepStrictEqual(Array.from(a.data), Array.from(b.data), '纯函数: 同输入同输出');
    assert.notStrictEqual(a.data, b.data, '纯函数: 不共享同一 data 引用');
    g.cellLight[0] = 1;               // 改输入不应影响已产出的掩码
    assert.strictEqual(b.data[0], 0, '已产出掩码不被后续输入变更影响');
  }

  // ---- 9. 偏好规范化 + 三处默认值一致 ----
  {
    const origStorePrefs = Store.get('prefs', null);
    const withPrefs = (obj) => { Store.set('prefs', obj || {}); return loadState(); };

    assert.strictEqual(withPrefs({}).regionSegment, false, '默认关 (父 PRD AC-6 零回归)');
    assert.strictEqual(withPrefs({ regionSegment: 'yes' }).regionSegment, false, '非 true 一律视为关');
    assert.strictEqual(withPrefs({ regionSegment: true }).regionSegment, true, '显式 true 才开');
    assert.strictEqual(withPrefs({ regionGridN: 999 }).regionGridN, 32, '网格 N 钳到上限');
    assert.strictEqual(withPrefs({ regionGridN: 1 }).regionGridN, 8, '网格 N 钳到下限');
    assert.strictEqual(withPrefs({ regionMinAreaRatio: 9 }).regionMinAreaRatio, 0.25, '面积门钳到上限');

    // 三处默认值必须一致: DEFAULT_PREFS / loadState 钳制默认 / REGION_DEFAULTS (单一真源)
    const d = withPrefs({});
    assert.strictEqual(d.regionGridN, REGION_DEFAULTS.gridN, '网格 N: 默认值三处一致');
    assert.strictEqual(d.regionMinAreaRatio, REGION_DEFAULTS.minAreaRatio, '面积门: 默认值三处一致');

    if (origStorePrefs) Store.set('prefs', origStorePrefs); else Store.remove('prefs');
  }

  console.log('✓ v6.0 unit tests passed: 掩码契约不变量 I0~I7 / source 语义(whole·none·region·degraded) / 双门边界(0.90 与 0.10 闭区间) / 读不到像素必降级 / 纯函数性与引用隔离 / 偏好钳制与三处默认值一致');
})();

// ============================================================
// v6.0 阶段 1 单测 (分区判定管线: 谓词抽取等价性 + 逐格判定 + 分母口径)
// 契约来源: design.md §4 (管线) / .trellis/spec/frontend/quality-guidelines.md v5.4 §2 (同源)
// ============================================================
(function () {
  const {
    evaluateImagePixelStats, buildLightTestCtx, classifyLightPixel,
    regionCellGrid, regionGridRatio,
  } = svi;

  // 显式偏好, 避免依赖 svi.prefs 的现场状态 (色卡开关会影响判定, 不显式给就不可复现)
  const P = { imgPresets: {}, imgGeneralLight: true, imgLumCutoff: 180, imgTolerance: 35, shieldColors: [] };
  // 无屏蔽版本的 ctx
  const CTX = buildLightTestCtx(P);

  // 像素构造器: px(r,g,b,a) → RGBA 数组; grid(rows) → 扁平 RGBA
  const px = (r, g, b, a) => [r, g, b, a === undefined ? 255 : a];
  function flatten(list) {
    const out = new Uint8Array(list.length * 4);
    list.forEach((p, i) => { out[i * 4] = p[0]; out[i * 4 + 1] = p[1]; out[i * 4 + 2] = p[2]; out[i * 4 + 3] = p[3]; });
    return out;
  }
  const WHITE = px(255, 255, 255);
  const DARK = px(17, 24, 39);        // 深灰 (lum 远低于 180)
  const BLUE = px(0, 0, 255);         // 高饱和彩色

  // ---- 1. 谓词本体: 三态语义 (-1 透明 / 0 非浅色 / 1 浅色) ----
  assert.strictEqual(classifyLightPixel(255, 255, 255, 255, CTX), 1, '纯白 → 浅色');
  assert.strictEqual(classifyLightPixel(17, 24, 39, 255, CTX), 0, '深灰 → 非浅色');
  assert.strictEqual(classifyLightPixel(0, 0, 255, 255, CTX), 0, '高饱和蓝 → 非浅色 (饱和度门)');
  assert.strictEqual(classifyLightPixel(255, 255, 255, 10, CTX), -1, '低 alpha → 完全不参与 (不是 0)');
  assert.strictEqual(classifyLightPixel(255, 255, 255, 64, CTX), 1, 'alpha 恰为 64 → 参与 (闭区间下界)');

  // 原色屏蔽: 命中屏蔽的像素**计入不透明但永不判为浅色** (返回 0 而非 -1)
  {
    const shielded = buildLightTestCtx({ imgPresets: {}, imgGeneralLight: true, imgLumCutoff: 180, imgTolerance: 35, shieldColors: ['#ffffff'] });
    assert.strictEqual(classifyLightPixel(255, 255, 255, 255, shielded), 0,
      '命中屏蔽色的白像素 → 0 (仍计入不透明)');
  }

  // ---- 2. 谓词抽取的等价性证明 (这是本次重构不改变行为的证据) ----
  // 逐像素手算 → 与 evaluateImagePixelStats 的聚合结论必须一致
  {
    // 全浅 4×4: 聚合 lightRatio 必为 1
    const allLight = flatten(new Array(16).fill(WHITE));
    assert.deepStrictEqual(evaluateImagePixelStats(allLight, P), { isLight: true, lightRatio: 1 },
      '等价性: 全浅样本聚合结论 = 逐像素谓词');

    // 全深
    const allDark = flatten(new Array(16).fill(DARK));
    assert.deepStrictEqual(evaluateImagePixelStats(allDark, P), { isLight: false, lightRatio: 0 },
      '等价性: 全深样本');

    // 半浅半彩: lightRatio = 8/16 = 0.5, 默认 imgAreaThreshold 48% → isLight = true
    const mixed = flatten([].concat(new Array(8).fill(WHITE), new Array(8).fill(BLUE)));
    assert.deepStrictEqual(evaluateImagePixelStats(mixed, P), { isLight: true, lightRatio: 0.5 },
      '等价性: 半浅半彩 → 0.5 ≥ 0.48 判为浅色');

    // 逐像素独立复核: 手工按谓词数一遍, 必须与聚合函数逐位一致
    for (const sample of [allLight, allDark, mixed]) {
      let manualOpaque = 0;
      let manualLight = 0;
      for (let i = 0; i < sample.length; i += 4) {
        const c = classifyLightPixel(sample[i], sample[i + 1], sample[i + 2], sample[i + 3], CTX);
        if (c === -1) continue;
        manualOpaque++;
        if (c === 1) manualLight++;
      }
      const agg = evaluateImagePixelStats(sample, P);
      assert.strictEqual(manualOpaque && manualLight / manualOpaque, agg.lightRatio,
        '等价性: 手工逐像素计数 === 聚合 lightRatio');
    }

    // 透明像素不进分母: 12 白 + 4 全透明 → lightRatio 仍是 1 (不是 0.75)
    const withHoles = flatten([].concat(new Array(12).fill(WHITE), new Array(4).fill(px(0, 0, 0, 0))));
    assert.strictEqual(evaluateImagePixelStats(withHoles, P).lightRatio, 1,
      '等价性: 透明像素不进分母');

    // 屏蔽像素**进**分母: 8 白 + 8 被屏蔽的白 → lightRatio 0.5 (不是 1)
    const Pshield = { imgPresets: {}, imgGeneralLight: true, imgLumCutoff: 180, imgTolerance: 35, shieldColors: ['#ffffff'] };
    const allShielded = flatten(new Array(16).fill(WHITE));
    assert.strictEqual(evaluateImagePixelStats(allShielded, Pshield).lightRatio, 0,
      '等价性: 全部命中屏蔽色 → lightRatio 0 (但 opaqueCount 仍为 16, 故 isLight 判定有效)');
  }

  // ---- 3. 逐格判定 (N×N 网格) ----
  const N = 4;
  {
    // 全浅 → 全 1
    const g1 = regionCellGrid(flatten(new Array(N * N).fill(WHITE)), N, P);
    assert.deepStrictEqual(Array.from(g1.cells), new Array(N * N).fill(1), '全浅图 → 逐格全 1');
    assert.strictEqual(g1.opaque, N * N, '全浅图 → 不透明格数 = 总格数');
    assert.strictEqual(regionGridRatio(g1.cells, g1.opaque), 1, '全浅图 → 占比 1');

    // 全深 → 全 0
    const g2 = regionCellGrid(flatten(new Array(N * N).fill(DARK)), N, P);
    assert.deepStrictEqual(Array.from(g2.cells), new Array(N * N).fill(0), '全深图 → 逐格全 0');
    assert.strictEqual(regionGridRatio(g2.cells, g2.opaque), 0, '全深图 → 占比 0');

    // 左浅右彩: 每行左 2 格白, 右 2 格蓝
    const rowPattern = [].concat(new Array(N / 2).fill(WHITE), new Array(N / 2).fill(BLUE));
    const leftRight = flatten([].concat(...new Array(N).fill(rowPattern)));
    const g3 = regionCellGrid(leftRight, N, P);
    const expected3 = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) expected3.push(x < N / 2 ? 1 : 0);
    assert.deepStrictEqual(Array.from(g3.cells), expected3, '左浅右彩 → 逐格按列切分正确');
    assert.strictEqual(regionGridRatio(g3.cells, g3.opaque), 0.5, '左浅右彩 → 占比 0.5');

    // 棋盘: 逐格交错, 占比仍 0.5 (验证不是按行/按列塌缩)
    const chess = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) chess.push((x + y) % 2 === 0 ? WHITE : BLUE);
    const g4 = regionCellGrid(flatten(chess), N, P);
    const expected4 = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) expected4.push((x + y) % 2 === 0 ? 1 : 0);
    assert.deepStrictEqual(Array.from(g4.cells), expected4, '棋盘 → 逐格交错正确');
    assert.strictEqual(regionGridRatio(g4.cells, g4.opaque), 0.5, '棋盘 → 占比 0.5');

    // 含透明格: 透明格 cells=0 且**不进分母**
    const holes = [];
    for (let i = 0; i < N * N; i++) holes.push(i < 3 ? WHITE : (i < 6 ? px(0, 0, 0, 0) : DARK));
    const g5 = regionCellGrid(flatten(holes), N, P);
    assert.strictEqual(g5.opaque, 13, '透明格不进不透明计数 (16 - 3)');
    assert.strictEqual(regionGridRatio(g5.cells, g5.opaque), 3 / 13,
      '占比分母是不透明格数, 不是总格数');
    assert.strictEqual(regionGridRatio(g5.cells, 0), 0, '无有效格 → 占比 0 (不产生 NaN)');
  }

  // ---- 4. 逐格判定与整图判定同源 (同一份数据, 两种粒度必须自洽) ----
  {
    const sample = flatten([].concat(new Array(8).fill(WHITE), new Array(8).fill(BLUE)));
    const agg = evaluateImagePixelStats(sample, P);
    const g = regionCellGrid(sample, 4, P);
    assert.strictEqual(regionGridRatio(g.cells, g.opaque), agg.lightRatio,
      '同源: 逐格占比 === 整图 lightRatio (同一谓词, 同一分母口径)');
  }

  console.log('✓ v6.0 阶段 1 单测 passed: 单像素谓词三态(含 alpha=64 边界与屏蔽色) / 谓词抽取等价性(手工计数 === 聚合) / 逐格判定矩阵(全浅·全深·左浅右彩·棋盘) / 分母口径(透明不进、屏蔽进) / 逐格与整图同源');
})();

// ============================================================
// v6.0 阶段 2 单测 (形态学 / 连通域 / 面积门 / 默认方向)
// 契约来源: design.md §4 步骤 ④⑤⑥ / §5 门 2
// ============================================================
(function () {
  const {
    REGION_DEFAULTS, regionDilate, regionErode, regionClose, regionOpen,
    regionComponents, regionCarve, regionCoverage, buildRegionMask, validateRegionMask,
  } = svi;

  // 用字符网格构造函数可读的测试输入: '1' = 浅色, '0' = 非浅色
  function mkGrid(rows) {
    const gh = rows.length;
    const gw = rows[0].length;
    const cells = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) cells[y * gw + x] = rows[y][x] === '1' ? 1 : 0;
    }
    return { cells: cells, gw: gw, gh: gh };
  }
  const show = (cells, gw, gh) => {
    const out = [];
    for (let y = 0; y < gh; y++) out.push(Array.from(cells.slice(y * gw, y * gw + gw)).join(''));
    return out.join('/');
  };

  // ---- 1. 形态学四算子 (7×7, 对象居中避开边界) ----
  {
    const Z7 = '0000000';
    const ALL7 = '1111111';

    // 孤立点
    const dot = mkGrid([Z7, Z7, Z7, '0001000', Z7, Z7, Z7]);
    assert.strictEqual(show(regionDilate(dot.cells, 7, 7), 7, 7),
      [Z7, Z7, '0011100', '0011100', '0011100', Z7, Z7].join('/'), '膨胀: 孤立点 → 3×3 (8 邻域)');
    assert.strictEqual(show(regionErode(dot.cells, 7, 7), 7, 7),
      [Z7, Z7, Z7, Z7, Z7, Z7, Z7].join('/'), '腐蚀: 孤立点被消掉');
    assert.strictEqual(show(regionOpen(dot.cells, 7, 7), 7, 7),
      [Z7, Z7, Z7, Z7, Z7, Z7, Z7].join('/'), '开运算: 去掉孤立小块');

    // 居中 3×3 实心块
    const BLOB = [Z7, Z7, '0011100', '0011100', '0011100', Z7, Z7];
    const blob = mkGrid(BLOB);
    assert.strictEqual(show(regionDilate(blob.cells, 7, 7), 7, 7),
      [Z7, '0111110', '0111110', '0111110', '0111110', '0111110', Z7].join('/'), '膨胀: 3×3 → 5×5');
    assert.strictEqual(show(regionClose(blob.cells, 7, 7), 7, 7), BLOB.join('/'),
      '闭运算: 实心块不变 (无洞可填)');
    assert.strictEqual(show(regionOpen(blob.cells, 7, 7), 7, 7), BLOB.join('/'),
      '开运算: 实心块不变');
    assert.strictEqual(show(regionClose(blob.cells, 7, 7), 7, 7),
      show(regionClose(regionClose(blob.cells, 7, 7), 7, 7), 7, 7), '闭运算是幂等的');

    // 闭运算填 1 格洞: 3×3 环 → 实心
    const ring = mkGrid([Z7, Z7, '0011100', '0010100', '0011100', Z7, Z7]);
    assert.strictEqual(show(regionClose(ring.cells, 7, 7), 7, 7), BLOB.join('/'),
      '闭运算: 填掉中心 1 格洞');
    assert.strictEqual(show(regionOpen(ring.cells, 7, 7), 7, 7), [Z7, Z7, Z7, Z7, Z7, Z7, Z7].join('/'),
      '开运算: 3×3 环被消掉 (每个环格的 3×3 邻域都含洞或图外, 腐蚀后全空)');

    // **边界复制契约 (回归断言)**: 越界取最近的边缘格, 不按背景。
    //   越界按背景时 close 会在图外造出一圈 0, 那一环面积够大 (16×16 下 60 格) 会被面积门
    //   当成"特征大块"抠掉 → 图片最外一圈永远不被反色 → 白底幻灯片出现一圈白框。
    const allOn = mkGrid([ALL7, ALL7, ALL7, ALL7, ALL7, ALL7, ALL7]);
    assert.strictEqual(show(regionErode(allOn.cells, 7, 7), 7, 7),
      [ALL7, ALL7, ALL7, ALL7, ALL7, ALL7, ALL7].join('/'),
      '边界复制: 全浅图腐蚀后仍是全浅 (不得收缩成一圈 0)');
    assert.strictEqual(show(regionClose(allOn.cells, 7, 7), 7, 7),
      [ALL7, ALL7, ALL7, ALL7, ALL7, ALL7, ALL7].join('/'),
      '边界复制: 全浅图 close 后不变 (不得造出 0 边界环)');
  }

  // ---- 2. 连通域 (8 邻域) ----
  {
    // 两个块: 一个 3×3 实心, 一个孤立点
    const g = mkGrid(['11000', '11000', '00000', '00001', '00001']);
    const comps = regionComponents(g.cells, 1, 5, 5);
    comps.sort((a, b) => b.area - a.area);
    assert.strictEqual(comps.length, 2, '两个 1 值连通域');
    assert.deepStrictEqual(comps.map((c) => c.area), [4, 2], '面积分别是 4 与 2');

    // 对角相邻算**同一个** 8 邻域连通域 (与形态学保持同一邻接度)
    const diag = mkGrid(['10000', '01000', '00100', '00000', '00000']);
    assert.strictEqual(regionComponents(diag.cells, 1, 5, 5).length, 1, '对角相邻 → 8 邻域下是一个连通域');

    // 4 邻域下的同一个例子会断成 3 个 —— 这条断言把"邻接度选择"钉死, 防止以后被改回 4 邻域
    const fourNeighbor = regionComponents(diag.cells, 1, 5, 5).length;
    assert.strictEqual(fourNeighbor, 1, '邻接度契约: 必须是 8 邻域');

    // target=0 也能标 (carve-color 要的是非浅色连通域)
    const g2 = mkGrid(['11111', '11001', '11001', '11111', '11111']);
    const zeroComps = regionComponents(g2.cells, 0, 5, 5);
    assert.strictEqual(zeroComps.length, 1, 'target=0 的连通域可标 (2×2 的洞, 一个连通域)');
    assert.strictEqual(zeroComps[0].area, 4, 'target=0 连通域面积正确');
  }

  // ---- 3. 面积门边界 (在 N=32 上测, 因为 N=16 时面积门被厚度门盖住, 不具约束力) ----
  {
    assert.strictEqual(REGION_DEFAULTS.minAreaRatio, 0.03, '面积门默认 3%');
    const N32 = 32;
    const minArea32 = Math.round(REGION_DEFAULTS.minAreaRatio * N32 * N32);
    assert.strictEqual(minArea32, 31, '32×32 下面积门 = 31 格');

    // 说明: N=16 时 minArea = 8, 而 3×3 结构元的开运算已经保证存活特征 ≥3×3=9 格,
    //   即面积门在 N=16 下**不具约束力** (厚度门更强)。面积门要到 N=32 才真正生效。
    //   这不是 bug, 但意味着 N=16 的实际最小特征尺寸 ≈ 3/16 = 19% 图宽 —— 偏粗, 见阶段 2 结论。
    const blockGrid = (size, bs) => {
      const rows = [];
      for (let y = 0; y < size; y++) {
        let r = '';
        for (let x = 0; x < size; x++) {
          r += (y >= 10 && y < 10 + bs && x >= 10 && x < 10 + bs) ? '0' : '1';
        }
        rows.push(r);
      }
      return mkGrid(rows);
    };
    const small = regionCarve(blockGrid(N32, 5).cells, N32, N32, REGION_DEFAULTS); // 5×5 = 25
    const large = regionCarve(blockGrid(N32, 6).cells, N32, N32, REGION_DEFAULTS); // 6×6 = 36
    assert.strictEqual(small.data[12 * N32 + 12], 1, '面积门: 25 格 < 31 → 不抠 (跟随多数)');
    assert.strictEqual(large.data[12 * N32 + 12], 0, '面积门: 36 格 ≥ 31 → 抠掉 (保持原色)');
  }

  // ---- 4. 默认方向 (design §4 ④) ----
  {
    // (a) 对偶极性: 深底 + 大块浅色 → carve-light, 只有浅色大块被反色
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let r = '';
      for (let x = 0; x < 16; x++) r += (y >= 4 && y < 12 && x >= 4 && x < 12) ? '1' : '0';
      rows.push(r);
    }
    const darkWithLightBlock = mkGrid(rows);
    assert.strictEqual(regionCoverage(darkWithLightBlock.cells), 64 / 256, '深底浅块: 浅色占比 0.25');
    const c1 = regionCarve(darkWithLightBlock.cells, 16, 16, REGION_DEFAULTS);
    assert.strictEqual(c1.polarity, 'carve-light', '浅色占少数 → carve-light 极性');
    assert.strictEqual(regionCoverage(c1.data), 0.25,
      '深底浅块: 覆盖率 = 被反色的格占比 = 仅浅色大块那 64 格');
    assert.strictEqual(c1.data[8 * 16 + 8], 1, '块内 → 反色');
    assert.strictEqual(c1.data[0], 0, '块外 → 保持原色');

    // (b) 主场景: 浅底 + 大块非浅色 → carve-color, 只有大块被保留
    const rows2 = [];
    for (let y = 0; y < 16; y++) {
      let r = '';
      for (let x = 0; x < 16; x++) r += (y >= 5 && y < 11 && x >= 5 && x < 11) ? '0' : '1';
      rows2.push(r);
    }
    const lightWithDarkBlock = mkGrid(rows2);
    const c2 = regionCarve(lightWithDarkBlock.cells, 16, 16, REGION_DEFAULTS);
    assert.strictEqual(c2.polarity, 'carve-color', '浅色占多数 → carve-color 极性');
    assert.strictEqual(c2.data[8 * 16 + 8], 0, '浅底: 大块被抠掉 (保持原色)');
    assert.strictEqual(c2.data[0], 1, '浅底: 大块之外被反色');
    assert.strictEqual(regionCoverage(c2.data), 220 / 256, '抠掉 36 格 → 覆盖率 0.859');
  }

  // ---- 5. 两个实测 (design 要求的验证点; 两处曾暴露冲突, 2026-09-25 裁决后定型) ----
  {
    // (a) 白底黑字密集图: 5 条 1 格厚文字带。design 要求验证「不产生碎裂掩码」。
    const rows = [];
    for (let y = 0; y < 16; y++) {
      const isTextRow = (y === 2 || y === 5 || y === 8 || y === 11 || y === 14);
      let r = '';
      for (let x = 0; x < 16; x++) r += (isTextRow && x >= 2 && x < 14) ? '0' : '1';
      rows.push(r);
    }
    const textSlide = mkGrid(rows);
    const carved = regionCarve(textSlide.cells, 16, 16, REGION_DEFAULTS);
    let carvedAway = 0;
    for (let y = 0; y < 16; y++) {
      const isTextRow = (y === 2 || y === 5 || y === 8 || y === 11 || y === 14);
      for (let x = 2; x < 14; x++) { if (isTextRow && carved.data[y * 16 + x] === 0) carvedAway++; }
    }
    const maskText = buildRegionMask({ gw: 16, gh: 16, cellLight: textSlide.cells, ratio: regionCoverage(textSlide.cells) });
    console.log('[v6.0 阶段2 实测 A] 白底黑字图: 浅色占比=' + regionCoverage(textSlide.cells).toFixed(3)
      + ' 极性=' + carved.polarity
      + ' 文字带被抠格数=' + carvedAway + '/60'
      + ' 反色覆盖率=' + regionCoverage(carved.data).toFixed(3)
      + ' → source=' + maskText.source);
    assert.strictEqual(carved.polarity, 'carve-color', '白底黑字 → carve-color 极性');
    // 裁决后 (implement.md 偏离 5「先开后闭」): 厚度门在**开运算**上先执行, 1 格厚文字带被整条抹除,
    //   于是「非浅色特征集」为空 → 抠不掉任何东西 → 覆盖率 1.0 → 门 2 判为整图反色。
    //   这正是纯文字幻灯片想要的结局: 整图反色 (白底→深底, 黑字→白字), 文字仍可读。
    //   反例留档: 先闭后开时实测 60/60 全被抠 (close 的 dilate 把行距 ≤2 的相邻文字带合并成实心带)。
    assert.strictEqual(carvedAway, 0, '先开后闭: 1 格厚文字带被厚度门抹除 → 一格都不抠');
    assert.strictEqual(regionCoverage(carved.data), 1, '抠除量为零 → 覆盖率 1.0');
    assert.strictEqual(maskText.source, 'whole', '纯文字图走整图反色 (不产生碎裂掩码, 也不抠掉文字)');
    assert.ok(validateRegionMask(maskText).ok, '整图结论的掩码自洽');

    // 证伪留档: 同一张图若按「先闭后开」(原设计), 文字带会被整片抠掉 → 文字在反色后消失。
    //   这条断言是**回归护栏**: 谁把形态学顺序改回去, 它会立刻炸。
    const textFeature = new Uint8Array(256);
    for (let i = 0; i < 256; i++) textFeature[i] = textSlide.cells[i] ? 0 : 1;
    const merged = svi.regionClose(textFeature, 16, 16);
    let mergedRows = 0;
    for (let y = 0; y < 16; y++) { if (merged[y * 16 + 8]) mergedRows++; }
    assert.ok(mergedRows > 5, '反例留档: 先闭后开会把 5 条文字带膨胀合并成 ' + mergedRows + ' 行实心带 (>5)');

    // (b) 主场景: 浅底 + 5×5 嵌入块 (占 9.8%)。裁决后门 2 上界为 0.97 → 该抠的照样抠。
    const rows2 = [];
    for (let y = 0; y < 16; y++) {
      let r = '';
      for (let x = 0; x < 16; x++) r += (y >= 6 && y < 11 && x >= 6 && x < 11) ? '0' : '1';
      rows2.push(r);
    }
    const g5 = mkGrid(rows2);
    const carve5 = regionCarve(g5.cells, 16, 16, REGION_DEFAULTS);
    const mask5 = buildRegionMask({ gw: 16, gh: 16, cellLight: g5.cells, ratio: regionCoverage(g5.cells) });
    console.log('[v6.0 阶段2 实测 B] 5×5 嵌入块: 浅色占比=' + regionCoverage(g5.cells).toFixed(3)
      + ' 抠后覆盖率=' + regionCoverage(carve5.data).toFixed(3) + ' → source=' + mask5.source);
    assert.strictEqual(regionCoverage(carve5.data), 231 / 256, '前置: 抠掉 25 格 → 覆盖率 231/256');
    // 2026-09-25 裁决+更正: 门 1 上界由 0.90 放宽到 0.97 (= 1 - 面积门) 后, 本例 (浅色占比 0.902)
    //   不再被短路, 正常进入分割 → 抠掉嵌入块 → 覆盖率 0.902 < 0.97 → 产出区域掩码。
    //   改动前的实测: 门 1 命中 → 整图反色, 嵌入块被一起反色 (即 PRD 背景点名要防的事)。
    assert.strictEqual(mask5.source, 'region', '主场景: 嵌入块保持原色 (门 1 不再吞掉 9.8% 的嵌入内容)');
    assert.strictEqual(mask5.polarity, 'carve-color', '主场景极性');
    assert.ok(validateRegionMask(mask5).ok, '掩码自洽');
    // 嵌入块那一格的语义: data = 0 → 不反色 (保持原色)
    assert.strictEqual(mask5.data[8 * 16 + 8], 0, '嵌入块中心格不反色');
    assert.strictEqual(mask5.data[0], 1, '块外浅底反色');
  }

  // ---- 6. 门 2 (分割后复核) 的两侧边界 ----
  {
    const grid = (g) => ({ gw: g.gw, gh: g.gh, cellLight: g.cells, ratio: regionCoverage(g.cells) });
    // 浅底 + 6×6 非浅色块
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let r = '';
      for (let x = 0; x < 16; x++) r += (y >= 5 && y < 11 && x >= 5 && x < 11) ? '0' : '1';
      rows.push(r);
    }
    const m = buildRegionMask(grid(mkGrid(rows)));
    assert.strictEqual(m.source, 'region', '两道门之间 → 产出真正的区域掩码');
    assert.strictEqual(m.polarity, 'carve-color', '极性透传');
    assert.ok(validateRegionMask(m).ok, 'region 掩码必须满足全部不变量 (含 I5)');
    assert.ok(m.coverage > REGION_DEFAULTS.segmentRatioLow && m.coverage < REGION_DEFAULTS.segmentRatioHigh,
      '门 2 保证 coverage 落在 (segmentRatioLow, segmentRatioHigh) 开区间');

    // 门 1/门 2 共用同一对阈值, 且都由面积门派生 (1 - minAreaRatio / minAreaRatio)
    assert.strictEqual(REGION_DEFAULTS.segmentRatioHigh, 1 - REGION_DEFAULTS.minAreaRatio, '门 2 上界 = 1 - 面积门');
    assert.strictEqual(REGION_DEFAULTS.segmentRatioLow, REGION_DEFAULTS.minAreaRatio, '门 2 下界 = 面积门');
    assert.strictEqual(REGION_DEFAULTS.wholeRatioHigh, 1 - REGION_DEFAULTS.minAreaRatio, '门 1 上界 = 门 2 上界 (同源)');
    assert.strictEqual(REGION_DEFAULTS.wholeRatioLow, REGION_DEFAULTS.minAreaRatio, '门 1 下界 = 门 2 下界 (同源)');

    // 0.97 不是随手取的数: 1 - 0.97 ≈ 面积门 0.03 —— 两者是**同一口径的两个说法**
    //   (「抠掉的量不足最小特征块」⟺「抠掉的占比 < 面积门」)。改动其一时必须一起想清楚。
    //   (用容差比: 1 - 0.97 在 IEEE754 下是 0.030000000000000027, 不等于字面量 0.03)
    assert.ok(Math.abs((1 - REGION_DEFAULTS.segmentRatioHigh) - REGION_DEFAULTS.minAreaRatio) < 1e-9,
      '门 2 上界与面积门同源: 1 - segmentRatioHigh ≈ minAreaRatio');

    // 上界可达性 (实测结论): 16×16 下最小的可抠块是 3×3 = 9 格 (厚度门下限),
    //   抠完覆盖率 = 247/256 = 0.9648 < 0.97 → **仍产出区域掩码**。
    //   即: 上界分支只可能被「一格都没抠掉」(覆盖率 1.0) 触发 —— 那本就该走整图。
    //   这条断言把「不能因为块小而误判回整图」钉死 (正是偏离 7 的教训)。
    {
      const rows3 = [];
      for (let y = 0; y < 16; y++) {
        let r = '';
        for (let x = 0; x < 16; x++) r += (y >= 6 && y < 9 && x >= 6 && x < 9) ? '0' : '1';
        rows3.push(r);
      }
      const g3 = mkGrid(rows3);
      const m3 = buildRegionMask(grid(g3));
      assert.strictEqual(regionCoverage(regionCarve(g3.cells, 16, 16, REGION_DEFAULTS).data), 247 / 256,
        '最小可抠块 (3×3) 抠完后覆盖率 0.9648');
      // 3×3 是最小可抠块 → 浅色占比 0.9648 < 门 1 的 0.97 → 进分割 → 覆盖率 0.9648 < 0.97 → 区域掩码。
      //   这条把「不能因为块小而误判回整图」钉死 (偏离 7 的教训)。
      assert.strictEqual(m3.source, 'region', '最小可抠块 (3×3) 也必须产出区域掩码');
    }

    // 下界可达性 (实测): 深底 + 1 格厚浅色文字 → 浅色特征全被厚度门抹掉 → 抠除量为零 → none (不反色)。
    //   这是「深底页面上的细白字」的真实形态: 反色它会把字也黑掉, 正确行为是整页不反。
    {
      const rows4 = [];
      for (let y = 0; y < 16; y++) {
        const isTextRow = (y === 3 || y === 6 || y === 9 || y === 12);
        let r = '';
        for (let x = 0; x < 16; x++) r += (isTextRow && x >= 2 && x < 14) ? '1' : '0';
        rows4.push(r);
      }
      const g4 = mkGrid(rows4);
      assert.ok(regionCoverage(g4.cells) > REGION_DEFAULTS.wholeRatioLow
        && regionCoverage(g4.cells) < REGION_DEFAULTS.wholeRatioHigh, '前置: 该图落在门 1 的中间带');
      const m4 = buildRegionMask(grid(g4));
      assert.strictEqual(m4.source, 'none', '细浅色特征被厚度门抹除 → 抠不到东西 → none (不反色)');
      assert.ok(validateRegionMask(m4).ok, 'none 掩码自洽');
    }

    // 读不到像素 → 降级 (与门 2 无关, 但同属入口契约)
    assert.strictEqual(buildRegionMask(null).source, 'degraded', 'null 网格 → degraded');
  }

  console.log('✓ v6.0 阶段 2 单测 passed: 形态学四算子(含边界复制回归) / 8 邻域连通域 / 面积门(N=32) / 默认方向双向 / 先开后闭的厚度门(白底黑字零抠除 + 先闭后开反例留档) / 门 2 两侧边界与可达性');
})();

// ============================================================
// v6.0 阶段 3 单测 + bench (双性能门: 零分割调用 / 计数器 / 实测预算)
// 契约来源: design.md §5 双性能门 · PRD R5
// ============================================================
(function () {
  const { regionMaskTake, regionCacheClear, regionDiagnostics, regionCoverage, prefs } = svi;

  const mkGrid = (n, kind) => {
    const cells = new Uint8Array(n * n);
    if (kind === 'light') cells.fill(1);
    else if (kind === 'dark') cells.fill(0);
    else if (kind === 'blocks') {
      // 浅底 + 两个 4×4 非浅色块 (落中间带, 会被真正分割)
      cells.fill(1);
      for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) cells[y * n + x] = 0;
      for (let y = n - 6; y < n - 2; y++) for (let x = n - 6; x < n - 2; x++) cells[y * n + x] = 0;
    } else {
      // 伪随机 (确定性 LCG): 逼出连通域/矩形分解的最坏路径
      let s = 12345;
      for (let i = 0; i < cells.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; cells[i] = (s >> 16) & 1; }
    }
    return { gw: n, gh: n, cellLight: cells, ratio: regionCoverage(cells) };
  };

  // ---- 1. bench: 纯浅色 / 纯深色图**零分割调用** (R5 第一道门的核心承诺) ----
  {
    const wasStats = prefs.statsEnabled;
    prefs.statsEnabled = true;
    try {
      regionCacheClear();
      const before = regionDiagnostics();
      const c0 = Object.assign({}, svi.stats.counters);
      for (const kind of ['light', 'dark']) {
        const m = regionMaskTake(mkGrid(32, kind), { key: 'bench|' + kind });
        assert.strictEqual(m.source, kind === 'light' ? 'whole' : 'none', kind + ' 图 → 直接整图结论');
      }
      assert.strictEqual(regionDiagnostics().segmented - before.segmented, 0,
        'bench: 纯浅色与纯深色图的分割函数调用次数为 0');
      assert.strictEqual(svi.stats.counters.regionSegmented - c0.regionSegmented, 0,
        'bench: regionSegmented 计数为 0 (零分割开销)');
      assert.strictEqual(svi.stats.counters.regionWhole - c0.regionWhole, 1, '纯浅色 → regionWhole');
      assert.strictEqual(svi.stats.counters.regionNone - c0.regionNone, 1, '纯深色 → regionNone');
    } finally {
      prefs.statsEnabled = wasStats;
      regionCacheClear();
    }
  }

  // ---- 2. bench: 单图掩码构建耗时 (门 1 放宽后会有更多图走到这里, 代价必须实测) ----
  {
    // 轮数刻意小: 本文件的同步执行时间会挤到别的"固定等待 120ms"的异步用例 (见 v3.0 quota 用例),
    //   所以 bench 只取足够稳定的样本量, 不追求统计精度。
    const runs = 25;
    const measure = (n, kind) => {
      const g = mkGrid(n, kind);
      regionCacheClear();
      const t0 = Date.now();
      for (let i = 0; i < runs; i++) {
        regionMaskTake(g, { key: 'bench|' + n + '|' + kind + '|' + i }); // 每轮换键 → 强制重算
      }
      return (Date.now() - t0) / runs;
    };
    const light = measure(16, 'light');     // 门 1 短路 (最廉价路径)
    const blocks16 = measure(16, 'blocks'); // 真正走完分割 (典型路径)
    const rnd16 = measure(16, 'random');    // 最坏路径 (连通域/矩形分解压力)
    const blocks32 = measure(32, 'blocks');
    regionCacheClear();

    console.log('[v6.0 阶段3 bench] 单图掩码构建平均耗时 (ms, ' + runs + ' 轮): '
      + 'N16 短路=' + light.toFixed(4) + ' 典型=' + blocks16.toFixed(4) + ' 随机=' + rnd16.toFixed(4)
      + ' | N32 典型=' + blocks32.toFixed(4));

    // 内部预算 16ms: 这里断言一个远宽于实测值的上界 (实测在 0.01~0.5ms 量级),
    //   既能把「性能预算 <1ms 量级」这条约束钉住, 又不会因为 CI 机器抖动而假红。
    assert.ok(rnd16 < 5, 'N=16 最坏路径平均耗时 < 5ms (实测 ' + rnd16.toFixed(4) + 'ms)');
    assert.ok(blocks16 < 1, 'N=16 典型路径平均耗时 < 1ms (实测 ' + blocks16.toFixed(4) + 'ms)');
  }

  // ---- 3. 门 2 只对「真正抠掉了东西」的图有意义: 覆盖率落在开区间才产出 region ----
  {
    regionCacheClear();
    const m = regionMaskTake(mkGrid(16, 'blocks'), { key: 'bench|gate2' });
    assert.strictEqual(m.source, 'region', '中间带 + 有可抠块 → region');
    assert.ok(m.coverage > 0 && m.coverage < 1, 'coverage 落在 (0,1) (I5)');
    assert.ok(regionDiagnostics().segmented >= 1, '确实执行了分区判定');
  }

  console.log('✓ v6.0 阶段 3 单测 + bench passed: 纯浅/纯深图零分割调用(实测计数) / 单图构建耗时实测(N16·N32, 典型与最坏路径) / 门 2 区间语义');
})();

// ============================================================
// v6.0 阶段 4 单测 (表达选择: 精确矩形分解 / 三种 kind / 集合等价 / 不变量 I8)
// 契约来源: design.md §3.1 I7·I8 / §6 表达选择
// ============================================================
(function () {
  const {
    REGION_DEFAULTS, regionRectsExact, deriveRegionExpr,
    makeRegionMask, validateRegionMask,
  } = svi;

  // 字符网格 → 集合 ('1' = 在集合内)
  function mkSet(rows) {
    const gh = rows.length;
    const gw = rows[0].length;
    const set = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) set[y * gw + x] = rows[y][x] === '1' ? 1 : 0;
    }
    return { set: set, gw: gw, gh: gh };
  }
  const rectUnion = (rects, gw, gh) => {
    const out = new Uint8Array(gw * gh);
    for (let i = 0; i < rects.length; i++) {
      const q = rects[i];
      for (let y = q.y; y < q.y + q.h; y++) {
        for (let x = q.x; x < q.x + q.w; x++) out[y * gw + x] = 1;
      }
    }
    return out;
  };
  const disjoint = (rects) => {
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const p = rects[a];
        const q = rects[b];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) return false;
      }
    }
    return true;
  };
  const sameSet = (a, b) => {
    for (let i = 0; i < a.length; i++) { if (!!a[i] !== !!b[i]) return false; }
    return true;
  };
  // 从 expr 反推「反色格集合」—— 三种 kind 必须描述同一个集合 (像素级等价的前提)
  function exprSet(expr, gw, gh) {
    const out = new Uint8Array(gw * gh);
    if (expr.kind === 'bitmap') {
      for (let i = 0; i < out.length; i++) out[i] = expr.bytes[i] ? 1 : 0;
      return out;
    }
    const rects = expr.kind === 'holes' ? expr.holes : expr.polys;
    const cover = new Uint8Array(gw * gh);
    for (let i = 0; i < rects.length; i++) {
      const q = rects[i];
      const x0 = Math.round(q.x * gw);
      const y0 = Math.round(q.y * gh);
      const x1 = x0 + Math.round(q.w * gw);
      const y1 = y0 + Math.round(q.h * gh);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cover[y * gw + x] = 1;
    }
    for (let i = 0; i < out.length; i++) out[i] = (expr.kind === 'holes') ? (cover[i] ? 0 : 1) : (cover[i] ? 1 : 0);
    return out;
  }
  // I8 的可判定形式: 任一侧能否用 ≤K 个互不相交矩形精确铺满
  const canVector = (data, gw, gh, k) => {
    const comp = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) comp[i] = data[i] ? 0 : 1;
    return regionRectsExact(comp, gw, gh, k) !== null || regionRectsExact(Uint8Array.from(data), gw, gh, k) !== null;
  };

  // ---- 1. 精确矩形分解 (regionRectsExact) ----
  {
    assert.strictEqual(REGION_DEFAULTS.kRects, 3, 'K 默认 3');
    assert.deepStrictEqual(regionRectsExact(new Uint8Array(16), 4, 4, 3), [], '空集 → 零矩形');

    const R = mkSet(['1111', '1111', '0000', '0000']);
    const r1 = regionRectsExact(R.set, 4, 4, 3);
    assert.strictEqual(r1.length, 1, '整块 → 1 个矩形');
    assert.deepStrictEqual(r1[0], { x: 0, y: 0, w: 4, h: 2 }, '矩形坐标正确');

    // L 形: 左上 2×2 + 下方 4×2 → 2 个矩形
    const L = mkSet(['1100', '1100', '1111', '1111']);
    const rL = regionRectsExact(L.set, 4, 4, 3);
    assert.strictEqual(rL.length, 2, 'L 形 → 2 个矩形');
    assert.ok(sameSet(rectUnion(rL, 4, 4), L.set), '并集 === 目标集 (精确)');
    assert.ok(disjoint(rL), '矩形互不相交');
    assert.strictEqual(regionRectsExact(L.set, 4, 4, 1), null, 'K 不足 → null');

    // 十字 (5×5): 上柱 2 + 中行 1 + 下柱 2 → 恰好 3 个矩形; K=2 铺不出来
    const P = mkSet(['00100', '00100', '11111', '00100', '00100']);
    const rP = regionRectsExact(P.set, 5, 5, 3);
    assert.strictEqual(rP.length, 3, '十字 → 3 个矩形 (K=3 恰好)');
    assert.ok(sameSet(rectUnion(rP, 5, 5), P.set), '十字并集 === 目标集');
    assert.ok(disjoint(rP), '十字矩形互不相交');
    assert.strictEqual(regionRectsExact(P.set, 5, 5, 2), null, '十字在 K=2 下铺不出来 (互不相交的约束)');

    // 8 个孤立格 (棋盘): 每个都得单占一个矩形 → 超过 K
    const cb = mkSet(['1010', '0101', '1010', '0101']);
    assert.strictEqual(regionRectsExact(cb.set, 4, 4, 3), null, '棋盘 → 超过 K → null');

    // 满格 → 1 个矩形
    const full = mkSet(['1111', '1111', '1111', '1111']);
    assert.deepStrictEqual(regionRectsExact(full.set, 4, 4, 3), [{ x: 0, y: 0, w: 4, h: 4 }], '满格 → 1 个矩形');

    // 全 1 网格上「铺满」不因边界复制而缩边 (与形态学同一约定)
    const N32 = mkSet(Array.from({ length: 32 }, () => '1'.repeat(32)));
    assert.deepStrictEqual(regionRectsExact(N32.set, 32, 32, 3), [{ x: 0, y: 0, w: 32, h: 32 }], '32×32 满格 → 1 个矩形');
  }

  // ---- 2. 三种 kind 的构造 ----
  {
    const mk = (rows) => mkSet(rows);

    // 退化: 全反 / 全不反 → 零个矩形
    const cov1 = new Uint8Array(16).fill(1);
    assert.deepStrictEqual(deriveRegionExpr(cov1, 4, 4), { kind: 'holes', holes: [] }, 'cov=1 → 零洞');
    assert.deepStrictEqual(deriveRegionExpr(new Uint8Array(16), 4, 4), { kind: 'islands', polys: [] }, 'cov=0 → 零孤岛');

    // 主场景: 浅底挖一个矩形彩色块 → 洞式 (少数侧优先)
    const holesData = mk(['1111', '1001', '1001', '1111']).set; // 1 多, 中间 2×2 是 0
    const eh = deriveRegionExpr(holesData, 4, 4);
    assert.strictEqual(eh.kind, 'holes', '主场景 → 洞式');
    assert.deepStrictEqual(eh.holes, [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }], '洞 = 归一化 0~1 矩形');
    assert.ok(sameSet(exprSet(eh, 4, 4), holesData), '洞式反推的集合 === data');

    // 对偶场景: 深底圈一个矩形浅色块 → 孤岛式
    const islData = mk(['0000', '0110', '0110', '0000']).set;
    const ei = deriveRegionExpr(islData, 4, 4);
    assert.strictEqual(ei.kind, 'islands', '对偶场景 → 孤岛式');
    assert.deepStrictEqual(ei.polys, [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }], '孤岛 = 归一化 0~1 矩形');
    assert.ok(sameSet(exprSet(ei, 4, 4), islData), '孤岛式反推的集合 === data');

    // 不可矩形化 → 位图, 灰度 0/255
    const cbData = mk(['1010', '0101', '1010', '0101']).set;
    const eb = deriveRegionExpr(cbData, 4, 4);
    assert.strictEqual(eb.kind, 'bitmap', '棋盘 → 位图');
    assert.strictEqual(eb.bytes.length, 16, '位图长度 === gw*gh');
    assert.deepStrictEqual(Array.from(eb.bytes), Array.from(cbData).map(v => (v ? 255 : 0)), '位图灰度 0/255');
    assert.ok(sameSet(exprSet(eb, 4, 4), cbData), '位图反推的集合 === data');

    // K=0: 只有退化情形能走矢量
    assert.strictEqual(deriveRegionExpr(holesData, 4, 4, { kRects: 0 }).kind, 'bitmap', 'K=0 → 非退化一律位图');
    assert.strictEqual(deriveRegionExpr(cov1, 4, 4, { kRects: 0 }).kind, 'holes', 'K=0 仍保留退化的零矩形表达');
  }

  // ---- 3. 集合等价: 同一 data 下三种表达描述同一区域 (像素级等价的前提) ----
  {
    const cases = [
      { name: '浅底挖矩形块', rows: ['11111', '10001', '10001', '11111', '11111'] },
      { name: '深底圈矩形块', rows: ['00000', '01110', '01110', '00000', '00000'] },
      { name: 'L 形抠除', rows: ['11000', '11000', '11110', '11110', '11110'] },
      { name: '棋盘(位图)', rows: ['1010', '0101', '1010', '0101'] },
      { name: '十字抠除', rows: ['11011', '11011', '00000', '11011', '11011'] },
    ];
    for (let c = 0; c < cases.length; c++) {
      const g = mkSet(cases[c].rows);
      const auto = makeRegionMask({ gw: g.gw, gh: g.gh, source: 'region', data: g.set });
      assert.ok(validateRegionMask(auto).ok, cases[c].name + ': 自动表达必须自洽');
      assert.ok(sameSet(exprSet(auto.expr, g.gw, g.gh), g.set), cases[c].name + ': 自动表达描述的区域 === data');

      // 强制位图表达 → 必须描述同一个集合
      const bytes = new Uint8Array(g.set.length);
      for (let i = 0; i < bytes.length; i++) bytes[i] = g.set[i] ? 255 : 0;
      const forced = makeRegionMask({
        gw: g.gw, gh: g.gh, source: 'region', data: g.set,
        expr: { kind: 'bitmap', bytes: bytes },
      });
      assert.ok(validateRegionMask(forced).ok, cases[c].name + ': 位图表达自洽');
      assert.ok(sameSet(exprSet(forced.expr, g.gw, g.gh), g.set), cases[c].name + ': 位图描述的区域 === data');

      // I8: kind === 'bitmap' ⟺ 两侧都铺不出来
      const k = REGION_DEFAULTS.kRects;
      assert.strictEqual(auto.expr.kind === 'bitmap', !canVector(g.set, g.gw, g.gh, k),
        cases[c].name + ': I8 双向成立 (bitmap ⟺ 无法用 ≤K 矩形精确表达)');
    }
  }

  // ---- 4. 校验器把住新不变量 (I7 互译 / I8 一致) ----
  {
    const g = mkSet(['1111', '1001', '1001', '1111']);
    const good = makeRegionMask({ gw: 4, gh: 4, source: 'region', data: g.set });
    assert.strictEqual(good.expr.kind, 'holes', '基准: 洞式');

    const offset = { ...good, expr: { kind: 'holes', holes: [{ x: 0.5, y: 0.25, w: 0.5, h: 0.5 }] } };
    assert.ok(!validateRegionMask(offset).ok
      && validateRegionMask(offset).errors.join('|').indexOf('I8') >= 0, 'I8: 矩形与 data 不一致被抓');

    const overlap = { ...good, expr: { kind: 'holes', holes: [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, { x: 0.25, y: 0.25, w: 0.25, h: 0.25 }] } };
    assert.ok(!validateRegionMask(overlap).ok
      && validateRegionMask(overlap).errors.join('|').indexOf('重叠') >= 0, 'I7: 矩形重叠被抓');

    const out = { ...good, expr: { kind: 'holes', holes: [{ x: 0.25, y: 0.25, w: 2, h: 0.5 }] } };
    assert.ok(!validateRegionMask(out).ok
      && validateRegionMask(out).errors.join('|').indexOf('越界') >= 0, 'I7: 矩形越界被抓');

    const badBytes = { ...good, expr: { kind: 'bitmap', bytes: new Uint8Array(3) } };
    assert.ok(!validateRegionMask(badBytes).ok
      && validateRegionMask(badBytes).errors.join('|').indexOf('I7') >= 0, 'I7: 位图长度错被抓');

    const badKind = { ...good, expr: { kind: 'wat' } };
    assert.ok(!validateRegionMask(badKind).ok
      && validateRegionMask(badKind).errors.join('|').indexOf('I7') >= 0, 'I7: 未知 kind 被抓');

    const noRects = { ...good, expr: { kind: 'holes' } };
    assert.ok(!validateRegionMask(noRects).ok
      && validateRegionMask(noRects).errors.join('|').indexOf('I7') >= 0, 'I7: 缺矩形数组被抓');
  }

  console.log('✓ v6.0 阶段 4 单测 passed: 精确矩形分解(并集===集合·互不相交·K 边界) / 三种 kind 构造 / 三角色集合等价 / I8 双向 / 校验器把住互译一致');
})();

// ============================================================
// v6.0 阶段 5 单测 (掩码缓存: 键稳定性 / 命中 / LRU 淘汰 / 无重复分割)
// 契约来源: design.md §8 缓存 · PRD R8
// ============================================================
(function () {
  const {
    REGION_CACHE_MAX, regionMaskKey, regionMaskTake, regionCacheClear,
    regionDiagnostics, regionCoverage, validateRegionMask,
  } = svi;

  // 16×16 网格: 浅底 + 一个 6×6 非浅色块 (抠后覆盖率 0.859, 稳落门 1 与门 2 之间)
  function blockGrid(size, bs, off) {
    const cells = new Uint8Array(size * size).fill(1);
    for (let y = off; y < off + bs; y++) for (let x = off; x < off + bs; x++) cells[y * size + x] = 0;
    return { gw: size, gh: size, cellLight: cells, ratio: regionCoverage(cells) };
  }
  const grid1 = blockGrid(16, 6, 5);

  assert.strictEqual(REGION_CACHE_MAX, 200, 'LRU 上限 200 (对齐 ImageFxEngine.lruMax)');

  // ---- 1. 键稳定性 ----
  {
    assert.strictEqual(regionMaskKey('h', 'img.a', 640, 480), regionMaskKey('h', 'img.a', 640, 480), '同输入同键');
    assert.notStrictEqual(regionMaskKey('h1', 'img.a', 640, 480), regionMaskKey('h2', 'img.a', 640, 480), 'host 参与键');
    assert.notStrictEqual(regionMaskKey('h', 'img.a', 640, 480), regionMaskKey('h', 'img.b', 640, 480), '元素词干参与键');
    assert.notStrictEqual(regionMaskKey('h', 'img.a', 640, 480), regionMaskKey('h', 'img.a', 320, 240), '固有尺寸参与键');
    assert.strictEqual(regionMaskKey('h', 'img.a', 640.4, 480.2), regionMaskKey('h', 'img.a', 640, 480), '尺寸取整: 子像素抖动不击穿缓存');
    assert.strictEqual(regionMaskKey('h', 'img.a', 0, 0), 'h|img.a|0x0', '缺尺寸也能成型 (key 形状稳定)');
  }

  // ---- 2. 命中: 同一张图重复取用 → 同一个对象, 不产生第二次分割 ----
  {
    regionCacheClear();
    const key = regionMaskKey('host', 'img.photo', 1024, 768);
    const before = regionDiagnostics();
    const m1 = regionMaskTake(grid1, { key: key });
    const mid = regionDiagnostics();
    assert.ok(validateRegionMask(m1).ok, '取到的掩码自洽');
    assert.strictEqual(mid.segmented - before.segmented, 1, '首次取用执行了一次分区判定');

    let last = m1;
    for (let i = 0; i < 10; i++) last = regionMaskTake(grid1, { key: key });
    const after = regionDiagnostics();
    assert.strictEqual(last, m1, '命中返回同一个对象 (不是重建)');
    assert.strictEqual(after.segmented - mid.segmented, 0, 'bench: 同图重复出现零分割调用');
    assert.strictEqual(after.hits - mid.hits, 10, '命中计数逐次累加');
    // 命中率按**增量**算: 会话计数是全局累积的 (前面的 bench 块灌了上千次未命中),
    //   拿绝对值断言会被无关的测试顺序影响。
    const hitDelta = (after.hits - mid.hits);
    const missDelta = (after.misses - mid.misses);
    assert.strictEqual(hitDelta / (hitDelta + missDelta), 1, '本段 10 次重复取用全部命中 (命中率 100%)');
    assert.ok(after.cacheHitRate >= 0 && after.cacheHitRate <= 1, '会话命中率仍在 0~1');

    // 不同键 → 各算一次 (缓存不串台)
    const other = regionMaskTake(grid1, { key: regionMaskKey('host', 'img.other', 1024, 768) });
    assert.notStrictEqual(other, m1, '不同键给不同对象');
    assert.strictEqual(regionDiagnostics().segmented - mid.segmented, 1, '换键才重新分割一次');
  }

  // ---- 3. LRU 淘汰 ----
  {
    regionCacheClear();
    const before = regionDiagnostics();
    for (let i = 0; i < REGION_CACHE_MAX; i++) {
      regionMaskTake(grid1, { key: regionMaskKey('host', 'img.k' + i, 100, 100) });
    }
    assert.strictEqual(regionDiagnostics().cacheSize, REGION_CACHE_MAX, '装到上限不淘汰');
    assert.strictEqual(regionDiagnostics().evictions - before.evictions, 0, '未超限 → 零淘汰');

    regionMaskTake(grid1, { key: regionMaskKey('host', 'img.overflow', 100, 100) });
    const d = regionDiagnostics();
    assert.strictEqual(d.cacheSize, REGION_CACHE_MAX, '超限后容量仍被钳在上限');
    assert.strictEqual(d.evictions - before.evictions, 1, '淘汰一次');
    // 最旧的 img.k0 已被淘汰 → 再取用必然重算
    const beforeK0 = regionDiagnostics();
    regionMaskTake(grid1, { key: regionMaskKey('host', 'img.k0', 100, 100) });
    assert.strictEqual(regionDiagnostics().segmented - beforeK0.segmented, 1, 'LRU: 最旧的被挤出 → 重算');
    // 刚插入的 overflow 仍在 → 命中
    const beforeOf = regionDiagnostics();
    regionMaskTake(grid1, { key: regionMaskKey('host', 'img.overflow', 100, 100) });
    assert.strictEqual(regionDiagnostics().segmented - beforeOf.segmented, 0, 'LRU: 最新的仍在缓存');
  }

  // ---- 4. 无键取用: 不进缓存, 但仍产出可用掩码 (长页面堆不堆积) ----
  {
    regionCacheClear();
    const m = regionMaskTake(grid1, {});
    assert.ok(validateRegionMask(m).ok, '无键也产出自洽掩码');
    assert.strictEqual(regionDiagnostics().cacheSize, 0, '无键不写缓存');
    const m2 = regionMaskTake(grid1, {});
    assert.notStrictEqual(m2, m, '无键不共享对象');
  }

  // ---- 5. 清空 (参数变更的失效路径) ----
  {
    regionCacheClear();
    regionMaskTake(grid1, { key: regionMaskKey('host', 'img.x', 10, 10) });
    assert.strictEqual(regionDiagnostics().cacheSize, 1, '先装入一条');
    regionCacheClear();
    assert.strictEqual(regionDiagnostics().cacheSize, 0, 'clearCacheAndRescan 的失效路径: 清空');
    const before = regionDiagnostics();
    regionMaskTake(grid1, { key: regionMaskKey('host', 'img.x', 10, 10) });
    assert.strictEqual(regionDiagnostics().segmented - before.segmented, 1, '清空后重算');
  }

  console.log('✓ v6.0 阶段 5 单测 passed: 键稳定性(host/词干/固有尺寸/取整) / 命中同对象 / bench 重复零分割 / LRU 淘汰与钳位 / 无键不缓存 / 参数变更失效路径');
})();

// ============================================================
// v6.0 阶段 6 单测 (与 Action Registry 的接缝: reason 'region' 的落库 / 仲裁 / 撤销栈 / 开关门)
// 契约来源: design.md §9 与 Action Registry 的接缝 · PRD R9
// ============================================================
(function () {
  const {
    isAutoReason, pushUndo, undoStack, arbitrate, regionReasonFor, regionMaskKeyFor,
    regionMaskTake, regionCacheClear, regionCoverage, prefs,
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
      matches(sel) {
        const wanted = String(sel).split(',').map((s) => s.trim());
        return (o.matchSelectors || []).some((s) => wanted.indexOf(s) >= 0);
      },
      _attrs: attrs,
    };
  }

  // ---- 1. 'region' 是**自动来源** (进撤销栈), 与 manual / element-rule 区分 ----
  {
    assert.strictEqual(isAutoReason('region'), true, "'region' 必须被判为自动来源 (否则自动反色不进撤销栈)");
    assert.strictEqual(isAutoReason('manual'), false, 'manual 仍不是自动来源');
    assert.strictEqual(isAutoReason('element-rule'), false, 'element-rule 仍不是自动来源');
  }

  // ---- 2. reason 'region' 的反色结论进撤销栈, 来源标签原样保留 ----
  {
    undoStack.items.length = 0;
    pushUndo({ el: mkEl({}), src: 'r1', actionId: 'invert', reason: 'region', at: 1 });
    assert.strictEqual(undoStack.items.length, 1, "reason 'region' 的反色结论必须入栈");
    assert.strictEqual(undoStack.items[0].reason, 'region', '来源标签原样保留 (撤销列表可显示「区域分割判定」)');
    undoStack.items.length = 0;
  }

  // ---- 3. 仲裁: 手动结论幂等占优, 区域结论不享有特权 ----
  {
    const aA = arbitrate(mkEl({ attrs: { 'data-svi-manual': 'restore' } }), { verdict: 'invert', reason: 'region' });
    assert.strictEqual(aA.verdict, 'keep', '手动 restore 压过 region 的反色结论');
    assert.strictEqual(aA.reason, 'manual', '被压过后 reason 改写为 manual');

    const aB = arbitrate(mkEl({}), { verdict: 'invert', reason: 'region', source: 'pixel' });
    assert.strictEqual(aB.verdict, 'invert', '无手动结论时 region 结论原样通过');
    assert.strictEqual(aB.reason, 'region', 'reason 不被改写');
    assert.strictEqual(aB.source, 'pixel', "source 仍是 'pixel' (SOURCES 表形状不变)");
  }

  // ---- 4. 开关门 + 查表不构建 ----
  {
    const el = mkEl({ className: 'photo' });
    el.naturalWidth = 800;
    el.naturalHeight = 600;
    const key = regionMaskKeyFor(el);
    assert.ok(key.indexOf('img.photo|800x600') >= 0, '键 = host|词干|固有尺寸');

    // 16×16: 浅底 + 6×6 非浅色块 → 稳落双门之间
    const cells = new Uint8Array(256).fill(1);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) cells[y * 16 + x] = 0;
    const grid = { gw: 16, gh: 16, cellLight: cells, ratio: regionCoverage(cells) };

    regionCacheClear();
    const wasRegion = prefs.regionSegment;
    try {
      // (a) 关闭: 无论缓存里有没有掩码都不进入区域分支
      prefs.regionSegment = false;
      assert.strictEqual(regionReasonFor(el, null), 'pixel', '关闭时恒为 pixel (零区域分支)');
      assert.strictEqual(regionReasonFor(el, grid), 'pixel', '关闭时连构建都不做');
      assert.strictEqual(svi.regionDiagnostics().cacheSize, 0, '关闭时零缓存写入 → 零分割调用');
      // 关闭时连元素都不碰: 传 null 也不得抛 (证明这一支是**纯短路**, 不走任何元素/布局查询)
      assert.strictEqual(regionReasonFor(null, null), 'pixel', '关闭时传 null 元素也不抛 (零副作用短路)');
      assert.strictEqual(regionReasonFor(undefined, undefined), 'pixel', '关闭时传 undefined 同样安全');

      // (b) 开启但表里没有 → 只查表不构建 (缓存路径不许为了来源标签重算分割)
      prefs.regionSegment = true;
      assert.strictEqual(regionReasonFor(el, null), 'pixel', '表里没有 → pixel, 不构建');
      assert.strictEqual(svi.regionDiagnostics().cacheSize, 0, '查表不写缓存');

      // (c) 开启且表里有有效区域掩码 → 'region'
      const mask = regionMaskTake(grid, { key: key });
      assert.strictEqual(mask.source, 'region', '前置: 该图确实产出区域掩码');
      assert.strictEqual(regionReasonFor(el, null), 'region', '缓存命中 → 来源标签为 region');
      assert.strictEqual(regionReasonFor(el, grid), 'region', '带网格入口 → 同样 region');

      // (d) 表里是退化掩码 (双门退回整图) → 仍是 pixel
      regionCacheClear();   // 同键已有条目会被当成命中, 先清掉才能把同键覆写为 whole
      const wholeCells = new Uint8Array(256).fill(1);
      const wholeGrid = { gw: 16, gh: 16, cellLight: wholeCells, ratio: 1 };
      assert.strictEqual(regionMaskTake(wholeGrid, { key: key }).source, 'whole', '前置: 同键覆写为整图结论');
      assert.strictEqual(regionReasonFor(el, null), 'pixel', '双门退回整图时不冒充 region 来源');
    } finally {
      prefs.regionSegment = wasRegion;   // 还原开关, 不把状态泄漏给后续测试块
      regionCacheClear();
    }
  }

  console.log("✓ v6.0 阶段 6 单测 passed: 'region' 判为自动来源 / 入撤销栈且标签保留 / 仲裁无特权(手动压过 / 原样通过) / 开关门零分支 / 缓存路径只查不构建 / 退化掩码不冒充来源");
})();

// ============================================================
// v6.0 阶段 7 单测 (开关齐全 / 五条降级路径 / 诊断可观测)
// 契约来源: design.md §10 降级与失败放行 · PRD R9 · implement.md 阶段 7
// ============================================================
(function () {
  const {
    REGION_DEFAULTS, regionMaskTake, regionCacheClear, regionDiagnostics,
    validateRegionMask, regionCoverage, loadState, Store, prefs, stats,
  } = svi;

  // 16×16: 浅底 + 6×6 非浅色块 → 稳落双门之间
  const cells = new Uint8Array(256).fill(1);
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) cells[y * 16 + x] = 0;
  const grid = { gw: 16, gh: 16, cellLight: cells, ratio: regionCoverage(cells) };

  // ---- 1. regionKRects 可读写, 且真的作用到内核 ----
  {
    const origStorePrefs = Store.get('prefs', null);
    const withPrefs = (obj) => { Store.set('prefs', obj || {}); return loadState(); };
    assert.strictEqual(withPrefs({}).regionKRects, REGION_DEFAULTS.kRects, 'K 默认值三处一致 (DEFAULT_PREFS/loadState/REGION_DEFAULTS)');
    assert.strictEqual(withPrefs({ regionKRects: 99 }).regionKRects, 8, 'K 钳到上限 8');
    assert.strictEqual(withPrefs({ regionKRects: -3 }).regionKRects, 0, 'K 钳到下限 0');
    if (origStorePrefs) Store.set('prefs', origStorePrefs); else Store.remove('prefs');
    loadState(); // 还原 (不把测试用的偏好留给后续块)

    // 生效验证: 同一个掩码在 K=3 下走矢量, 在 K=1 下退位图
    //   12×12, 两个 3×3 洞 (相距 3 列) → 抠出来是**两个互不相连的块** → 需要恰好 2 个矩形。
    //   细节约束 (都踩过):
    //   ① 洞必须 ≥3×3 —— 3×3 结构元的开运算会抹掉任何厚度 < 3 格的特征 (厚度门, 见阶段 2 结论),
    //      拿 1~2 格厚的东西做例会得到「抠不掉任何东西」, 那是形态学在起作用, 测不到 K;
    //   ② 两洞的**膨胀后**外接框必须不邻接 (间距 ≥3 列), 否则闭运算会把它们连成一块 → 只剩 1 个矩形;
    //   ③ 离左边界留 1 列以上, 避开腐蚀的边界复制把块撑大 (那会把洞撑到贴边, 结论仍然对但不好读)。
    const N = 12;
    const L = new Uint8Array(N * N).fill(1);
    for (let y = 3; y <= 5; y++) {
      for (let x = 1; x <= 3; x++) L[y * N + x] = 0;
      for (let x = 7; x <= 9; x++) L[y * N + x] = 0;
    }
    const grid8 = { gw: N, gh: N, cellLight: L, ratio: regionCoverage(L) };
    const key = 'k-effect';
    const wasK = prefs.regionKRects;
    try {
      prefs.regionKRects = 3;
      regionCacheClear();
      const m3 = regionMaskTake(grid8, { key: key });
      assert.strictEqual(m3.source, 'region', '前置: 该图产出区域掩码');
      assert.strictEqual(m3.expr.kind, 'holes', 'K=3: 两个 3×3 洞可精确矩形化 → 矢量');
      assert.strictEqual(m3.expr.holes.length, 2, 'K=3: 用了 2 个矩形');

      prefs.regionKRects = 1;
      regionCacheClear();
      const m1 = regionMaskTake(grid8, { key: key });
      assert.strictEqual(m1.expr.kind, 'bitmap', 'K=1: 同一掩码退位图 → 证明 K 真的作用到内核');
      assert.strictEqual(m1.coverage, m3.coverage, 'K 只影响表达, 不影响区域本身 (data 不变)');
    } finally {
      prefs.regionKRects = wasK;
      regionCacheClear();
    }
  }

  // ---- 2. 五条降级路径: 每条都退化为整图判定 + 原因非空 + 不写缓存 ----
  {
    const reasons = ['taint', 'decode', 'cross-origin', 'no-pixels', 'budget'];
    for (let i = 0; i < reasons.length; i++) {
      const why = reasons[i];
      regionCacheClear();
      const m = regionMaskTake(null, { key: 'dp|' + why, degradeReason: why });
      assert.strictEqual(m.source, 'degraded', why + ': 读不到像素 → degraded (退化为整图判定)');
      assert.strictEqual(m.degrade && m.degrade.reason, why, why + ': 原因原样透传');
      assert.ok(validateRegionMask(m).ok, why + ': I4 自洽 (degraded 必带 degrade)');
      assert.strictEqual(m.coverage, 0, why + ': 零掩码覆盖 —— 拿不到像素就放行, 绝不乱挂掩码');
      assert.strictEqual(regionDiagnostics().cacheSize, 0, why + ': degraded 不写缓存 (失败是暂时的)');
    }
    // 缺省原因 → no-pixels (与阶段 0 的既有行为一致)
    assert.strictEqual(regionMaskTake(null, {}).degrade.reason, 'no-pixels', '缺省原因 = no-pixels');

    const dg = regionDiagnostics().degrade;
    for (let i = 0; i < reasons.length; i++) {
      assert.ok(dg[reasons[i]] >= 1, '诊断按原因分别计数: ' + reasons[i]);
    }
  }

  // ---- 3. 预算门 (内部安全阀): 超时 → 退化为整图判定; 预算充足 → 正常区域掩码 ----
  {
    regionCacheClear();
    // 负预算确定性地复现「超时」(比等真实耗时更可靠: performance.now 的分辨率不可依赖)
    const over = regionMaskTake(grid, { key: 'bg-over', buildBudgetMs: -1 });
    assert.strictEqual(over.source, 'degraded', '超预算 → 退化为整图判定');
    assert.strictEqual(over.degrade.reason, 'budget', '原因 = budget');
    assert.ok(validateRegionMask(over).ok, '超预算掩码自洽 (I4)');

    const within = regionMaskTake(grid, { key: 'bg-within', buildBudgetMs: 1e9 });
    assert.strictEqual(within.source, 'region', '预算充足 → 正常区域掩码');
    assert.ok(regionDiagnostics().avgMs >= 0, '平均耗时可观测');
  }

  // ---- 4. StatsManager 计数 (R9 的面板诊断行数据源) ----
  {
    const wasStats = prefs.statsEnabled;
    prefs.statsEnabled = true;
    try {
      const c0 = Object.assign({}, stats.counters);
      regionCacheClear();
      regionMaskTake(grid, { key: 's1' });                                      // 过门 1 → 分割
      regionMaskTake({ gw: 16, gh: 16, cellLight: new Uint8Array(256).fill(1), ratio: 1 }, { key: 's2' });  // 门 1 → whole
      regionMaskTake({ gw: 16, gh: 16, cellLight: new Uint8Array(256), ratio: 0 }, { key: 's3' });          // 门 1 → none
      const c1 = Object.assign({}, stats.counters);
      assert.strictEqual(c1.regionSegmented - c0.regionSegmented, 1, 'regionSegmented: 分割次数');
      assert.strictEqual(c1.regionWhole - c0.regionWhole, 1, 'regionWhole: 退回整图反色');
      assert.strictEqual(c1.regionNone - c0.regionNone, 1, 'regionNone: 退回不反色');
      assert.ok(c1.regionCacheMisses - c0.regionCacheMisses >= 3, 'regionCacheMisses: 未命中');

      regionMaskTake(grid, { key: 's1' });
      assert.strictEqual(stats.counters.regionCacheHits - c1.regionCacheHits, 1, 'regionCacheHits: 命中');

      // freshCounters 的闭合键集: 五条降级链 + 淘汰都必须有键位 (防止 clear 后新键丢失)
      const need = ['regionDegradeTaint', 'regionDegradeDecode', 'regionDegradeCrossOrigin',
        'regionDegradeNoPixels', 'regionDegradeBudget', 'regionDegradeUnknown',
        'regionCacheEvictions'];
      for (let i = 0; i < need.length; i++) {
        assert.strictEqual(typeof stats.counters[need[i]], 'number', '计数器键存在: ' + need[i]);
      }
    } finally {
      prefs.statsEnabled = wasStats;
    }
  }

  // ---- 5. 诊断快照形状 (面板只读诊断行会直接渲染这些字段) ----
  {
    const d = regionDiagnostics();
    assert.strictEqual(typeof d.segmented, 'number', '诊断: segmented');
    assert.strictEqual(typeof d.avgMs, 'number', '诊断: avgMs');
    assert.strictEqual(typeof d.cacheHitRate, 'number', '诊断: cacheHitRate');
    assert.ok(d.cacheHitRate >= 0 && d.cacheHitRate <= 1, '诊断: 命中率落在 0~1');
    assert.strictEqual(typeof d.cacheSize, 'number', '诊断: cacheSize');
    assert.ok(d.degrade && typeof d.degrade === 'object', '诊断: 降级分原因');
    assert.ok(Object.keys(d).indexOf('evictions') >= 0, '诊断: 淘汰数');
  }

  console.log('✓ v6.0 阶段 7 单测 passed: regionKRects 可读写且作用到内核 / 五条降级路径(taint·decode·cross-origin·no-pixels·budget)各退化为整图且原因非空 / 预算安全阀 / StatsManager 计数健全 / 诊断快照字段齐全');
})();

// ============================================================
// v6.2 单测 (区域渲染层: 几何映射 / 祖先链判定 / 互斥 / 表达构造 / 关闭态短路)
// 契约来源: .trellis/tasks/09-25-v6-partial-render/design.md D1~D5 · PRD R1~R7
// ============================================================
(function () {
  const {
    regionContentRect, regionBoxGrid, regionRenderExpr, regionRootVerdict, regionMutexVerdict,
    RegionRenderEngine, regionRenderTryMount, regionRenderUnmount, regionMaskTake, regionCacheClear,
    REGION_DEFAULTS, regionCoverage, makeRegionMask, validateRegionMask, prefs,
  } = svi;

  function mkEl(opts) {
    const o = opts || {};
    const attrs = Object.assign({}, o.attrs);
    return {
      tagName: o.tagName || 'IMG',
      id: o.id || '',
      className: o.className || '',
      naturalWidth: o.naturalWidth || 0,
      naturalHeight: o.naturalHeight || 0,
      clientWidth: o.clientWidth || 0,
      clientHeight: o.clientHeight || 0,
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      _attrs: attrs,
    };
  }

  // ---- 1. 内容盒几何 (R3 / design D2): object-fit 五种 + object-position ----
  {
    // fill: 铺满, 无 letterbox
    assert.deepStrictEqual(regionContentRect(100, 100, 200, 100, 'fill', 0.5, 0.5),
      { x: 0, y: 0, w: 200, h: 100 }, 'fill → 内容盒 = 元素盒');

    // contain 宽受限: 200×100 盒装 100×100 图 → 上下留边 (这里左右留边)
    assert.deepStrictEqual(regionContentRect(100, 100, 200, 100, 'contain', 0.5, 0.5),
      { x: 50, y: 0, w: 100, h: 100 }, 'contain 宽受限 → 左右 letterbox 居中');

    // contain 高受限: 100×200 盒装 100×100 图 → 上下留边
    assert.deepStrictEqual(regionContentRect(100, 100, 100, 200, 'contain', 0.5, 0.5),
      { x: 0, y: 50, w: 100, h: 100 }, 'contain 高受限 → 上下 letterbox 居中');

    // object-position 左上 → 偏移归零
    assert.deepStrictEqual(regionContentRect(100, 100, 200, 100, 'contain', 0, 0),
      { x: 0, y: 0, w: 100, h: 100 }, 'object-position: 0 0 → 贴左上');

    // cover: 盖满并溢出 → 负偏移 (裁切起点)
    assert.deepStrictEqual(regionContentRect(100, 100, 200, 100, 'cover', 0.5, 0.5),
      { x: 0, y: -50, w: 200, h: 200 }, 'cover → 内容大于盒, 偏移为负 (等量裁切)');

    // none: 原始尺寸居中
    assert.deepStrictEqual(regionContentRect(50, 50, 200, 100, 'none', 0.5, 0.5),
      { x: 75, y: 25, w: 50, h: 50 }, 'none → 原始尺寸居中');

    // scale-down: 取 none 与 contain 中更小的那个 (大图等比缩小, 不拉伸变形 / 小图不放大)
    assert.deepStrictEqual(regionContentRect(400, 400, 200, 100, 'scale-down', 0.5, 0.5),
      { x: 50, y: 0, w: 100, h: 100 }, 'scale-down: 大图按 contain 缩 (不拉伸变形 → 左右留边)');
    const sd = regionContentRect(100, 100, 200, 100, 'scale-down', 0.5, 0.5);
    assert.strictEqual(sd.w, 100, 'scale-down: 小图绝不放大');

    // 退化: 固有尺寸未知 → 按 fill; 盒尺寸为 0 → 空矩形
    assert.deepStrictEqual(regionContentRect(0, 0, 200, 100, 'contain', 0.5, 0.5),
      { x: 0, y: 0, w: 200, h: 100 }, '固有尺寸未知 → 退化为 fill');
    assert.deepStrictEqual(regionContentRect(100, 100, 0, 0, 'contain', 0.5, 0.5),
      { x: 0, y: 0, w: 0, h: 0 }, '盒尺寸为 0 → 空矩形');
  }

  // ---- 2. 掩码 → 元素盒坐标网格 (design D2 的核心映射) ----
  {
    const full = makeRegionMask({ gw: 2, gh: 2, source: 'region', data: new Uint8Array([1, 1, 1, 1]) });
    const g1 = regionBoxGrid(full, { x: 0, y: 0, w: 100, h: 100 }, 100, 100, 4);
    assert.strictEqual(g1.n, 4, '输出网格尺寸可指定');
    assert.strictEqual(regionCoverage(g1.cells), 1, '内容盒铺满盒 → 全 1');

    // letterbox: 内容盒只占盒的中间一半 → 边距区必须保持 0 (不反色)
    const half = regionBoxGrid(full, { x: 25, y: 0, w: 50, h: 100 }, 100, 100, 4);
    assert.strictEqual(regionCoverage(half.cells), 0.5, '左右 letterbox: 只有中间两列被标记');
    assert.strictEqual(half.cells[0], 0, '左边距 → 0');
    assert.strictEqual(half.cells[3], 0, '右边距 → 0');
    assert.strictEqual(half.cells[1], 1, '内容区左列 → 1');
    assert.strictEqual(half.cells[2], 1, '内容区右列 → 1');

    // 掩码里的洞按同一变换搬到元素盒坐标
    const holed = makeRegionMask({ gw: 4, gh: 4, source: 'region', data: new Uint8Array(16).fill(1).map((_, i) => (i === 5 || i === 6 ? 0 : 1)) });
    const g2 = regionBoxGrid(holed, { x: 0, y: 0, w: 100, h: 100 }, 100, 100, 4);
    assert.strictEqual(g2.cells[5], 0, '洞 (格 5) 映射后仍是 0');
    assert.strictEqual(g2.cells[6], 0, '洞 (格 6) 映射后仍是 0');
    assert.strictEqual(regionCoverage(g2.cells), 14 / 16, '其余保持 1');

    // cover 裁切: 内容比盒大 → 落在盒外的部分不参与 (那些像素根本看不见)
    const crop = regionBoxGrid(full, { x: 0, y: -50, w: 100, h: 200 }, 100, 100, 4);
    assert.strictEqual(regionCoverage(crop.cells), 1, '盖满型裁切: 可见区仍全 1');

    // 退化: 空矩形 → 全 0 (绝不产出"整块反色"的意外)
    const deg = regionBoxGrid(full, { x: 0, y: 0, w: 0, h: 0 }, 100, 100, 4);
    assert.strictEqual(regionCoverage(deg.cells), 0, '空内容盒 → 零标记');
  }

  // ---- 3. 表达构造: 矢量表达与元素盒网格**构造性等价** (I7 在渲染层的前提) ----
  {
    const mk = (rows) => {
      const gh = rows.length;
      const gw = rows[0].length;
      const data = new Uint8Array(gw * gh);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) data[y * gw + x] = rows[y][x] === '1' ? 1 : 0;
      return makeRegionMask({ gw: gw, gh: gh, source: 'region', data: data });
    };
    // 浅底挖一个矩形 (矢量命中) 与一个棋盘 (退位图)
    const rectMask = mk(['1111', '1001', '1001', '1111']);
    const r1 = regionRenderExpr(rectMask, { x: 0, y: 0, w: 100, h: 100 }, 100, 100, { n: 4, kRects: 3 });
    assert.strictEqual(r1.expr.kind, 'holes', '矩形洞 → 矢量快路径');
    assert.strictEqual(r1.expr.holes.length, 1, '一个矩形');

    const cbMask = mk(['1010', '0101', '1010', '0101']);
    const r2 = regionRenderExpr(cbMask, { x: 0, y: 0, w: 100, h: 100 }, 100, 100, { n: 4, kRects: 3 });
    assert.strictEqual(r2.expr.kind, 'bitmap', '棋盘 → 位图');
    assert.strictEqual(r2.expr.bytes.length, 16, '位图长度 = 元素盒网格');

    // 关键断言: **从 expr 反推的区域集合 === 元素盒网格** (两表达同一掩码的构造性等价)
    const exprCells = (expr, n) => {
      const out = new Uint8Array(n * n);
      if (expr.kind === 'bitmap') {
        for (let i = 0; i < out.length; i++) out[i] = expr.bytes[i] ? 1 : 0;
        return out;
      }
      const rects = expr.kind === 'holes' ? expr.holes : expr.polys;
      const cover = new Uint8Array(n * n);
      for (let k = 0; k < rects.length; k++) {
        const q = rects[k];
        const x0 = Math.round(q.x * n);
        const y0 = Math.round(q.y * n);
        const x1 = x0 + Math.round(q.w * n);
        const y1 = y0 + Math.round(q.h * n);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cover[y * n + x] = 1;
      }
      for (let i = 0; i < out.length; i++) out[i] = expr.kind === 'holes' ? (cover[i] ? 0 : 1) : (cover[i] ? 1 : 0);
      return out;
    };
    const same = (a, b) => { for (let i = 0; i < a.length; i++) if (!!a[i] !== !!b[i]) return false; return true; };
    assert.ok(same(exprCells(r1.expr, r1.n), r1.cells), '矢量反推 === 元素盒网格 (holes)');
    assert.ok(same(exprCells(r2.expr, r2.n), r2.cells), '位图反推 === 元素盒网格 (bitmap)');

    // 两种表达都必须是契约合法的 (经 v6-1 的校验器)
    assert.ok(validateRegionMask({ ...rectMask, data: r1.cells, coverage: regionCoverage(r1.cells), gw: r1.n, gh: r1.n, expr: r1.expr }).ok,
      '矢量表达满足契约不变量');
  }

  // ---- 4. 祖先链判定 (R4 / design D3): 四类截断各自可辨 ----
  {
    const none = { filter: 'none', opacity: '1', mixBlendMode: 'normal', backdropFilter: 'none' };
    assert.strictEqual(regionRootVerdict([]).ok, true, '空链 → 可用');
    assert.strictEqual(regionRootVerdict([none, none]).ok, true, '纯静态祖先链 → 可用');
    assert.strictEqual(regionRootVerdict([none, { ...none, filter: 'blur(2px)' }]).reason, 'ancestor-filter', '祖先带 filter → ancestor-filter');
    assert.strictEqual(regionRootVerdict([none, { ...none, opacity: '0.5' }]).reason, 'ancestor-opacity', '祖先 opacity<1 → ancestor-opacity');
    assert.strictEqual(regionRootVerdict([none, { ...none, mixBlendMode: 'multiply' }]).reason, 'ancestor-blend', '祖先 mix-blend-mode → ancestor-blend');
    assert.strictEqual(regionRootVerdict([none, { ...none, backdropFilter: 'blur(4px)' }]).reason, 'ancestor-backdrop', '祖先 backdrop-filter → ancestor-backdrop');
    // 多个命中时按链上最先遇到的那个报原因 (最近的祖先先判)
    assert.strictEqual(regionRootVerdict([{ ...none, opacity: '0.8' }, { ...none, filter: 'blur(1px)' }]).reason,
      'ancestor-opacity', '原因取链上最近的那个');
    // opacity 缺省/空串 → 视为 1 (不能因为字段缺失就误判截断)
    assert.strictEqual(regionRootVerdict([{ filter: 'none', opacity: '', mixBlendMode: '', backdropFilter: '' }]).ok, true,
      '字段缺失/空串 → 视为正常');
  }

  // ---- 5. 元素级滤镜互斥 (R7 / design D4): 用户显式滤镜优先 ----
  {
    assert.strictEqual(regionMutexVerdict(mkEl({})).ok, true, '无冲突');
    assert.strictEqual(regionMutexVerdict(mkEl({ attrs: { 'data-svi-fx': '#fff' } })).reason, 'mutex-fx',
      '图片特效生效中 → 让位 (mutex-fx)');
    assert.strictEqual(regionMutexVerdict(mkEl({ attrs: { 'data-svi-fx': '#fff', 'data-svi-fx-off': 'true' } })).ok, true,
      '特效被 kill switch 关掉 → 不冲突');
    assert.strictEqual(regionMutexVerdict(mkEl({ tagName: 'VIDEO' }), { videoTune: { enabled: true } }).reason,
      'mutex-tune', '视频画面调节生效中 → 让位 (mutex-tune)');
    assert.strictEqual(regionMutexVerdict(mkEl({ tagName: 'VIDEO' }), { videoTune: { enabled: false } }).ok, true,
      '视频画面调节关闭 → 不冲突');
    assert.strictEqual(regionMutexVerdict(mkEl({}), { videoTune: { enabled: true } }).ok, true,
      'videoTune 只作用于视频 → 图片不冲突');
  }

  // ---- 6. 关闭态短路 (R9 / AC-9): 关着时零动作 ----
  {
    const el = mkEl({ className: 'photo', naturalWidth: 800, naturalHeight: 600, clientWidth: 400, clientHeight: 300 });
    const wasRender = prefs.regionRender;
    try {
      prefs.regionRender = false;
      const d0 = RegionRenderEngine.diagnostics();
      assert.strictEqual(regionRenderTryMount(el, 'x'), false, '关闭时 tryMount 恒 false (走整图路径)');
      assert.strictEqual(RegionRenderEngine.mount(el, makeRegionMask({ gw: 2, gh: 2, source: 'region', data: [1, 0, 0, 1] }), 'x'), false,
        '关闭时 mount 恒 false');
      const d1 = RegionRenderEngine.diagnostics();
      assert.strictEqual(d1.overlays, 0, '关闭时零覆盖层');
      assert.deepStrictEqual(d1.degradeByReason, d0.degradeByReason, '关闭时连降级计数都不动 (纯短路)');
      assert.strictEqual(el.getAttribute('data-svi-region'), null, '关闭时零属性写入');
      assert.strictEqual(regionRenderUnmount(el), false, '关闭时 unmount 也是 no-op');

      // 打开后: 无缓存掩码 → 不挂载 (渲染层绝不主导判定, 不为了渲染去现算分割)
      prefs.regionRender = true;
      regionCacheClear();
      assert.strictEqual(regionRenderTryMount(el, 'x'), false, '有开关但没掩码 → 不挂载');
      assert.strictEqual(RegionRenderEngine.diagnostics().overlays, 0, '仍然零覆盖层');

      // 掩码来源不合法 (整图/不反色/降级) 一律不挂载, 且原因可观测
      const whole = makeRegionMask({ gw: 2, gh: 2, source: 'whole' });
      assert.strictEqual(RegionRenderEngine.mount(el, whole, 'x'), false, 'source=whole → 不挂载 (那本就走整图路径)');
      assert.strictEqual(RegionRenderEngine.diagnostics().lastDegradeReason, 'no-mask', '原因 = no-mask');
      const bad = makeRegionMask({ gw: 2, gh: 2, source: 'region', data: new Uint8Array([1, 0, 0, 1]) });
      bad.v = 99; // 伪造版本漂移
      assert.strictEqual(RegionRenderEngine.mount(el, bad, 'x'), false, '契约校验不过 → 不挂载');
      assert.strictEqual(RegionRenderEngine.diagnostics().lastDegradeReason, 'no-mask', '原因 = no-mask (契约校验失败)');
      // 互斥命中 → 挂在挂载前失败, 且元素级滤镜不被改写
      const fxEl = mkEl({ attrs: { 'data-svi-fx': '#fff' }, naturalWidth: 10, naturalHeight: 10, clientWidth: 10, clientHeight: 10 });
      assert.strictEqual(RegionRenderEngine.mount(fxEl, makeRegionMask({ gw: 2, gh: 2, source: 'region', data: [1, 0, 0, 1] }), 'x'), false,
        '互斥命中 → 不挂载');
      assert.strictEqual(RegionRenderEngine.diagnostics().lastDegradeReason, 'mutex-fx', '原因 = mutex-fx');
      assert.strictEqual(fxEl.getAttribute('data-svi-region'), null, '降级时元素上没有任何 region 痕迹');
    } finally {
      prefs.regionRender = wasRender;
      regionCacheClear();
    }
  }

  // ---- 7. 调度与生命周期 (R6 / R8 / design D6): 暂停-恢复账本、静态降级、场景跃变门 ----
  {
    const fakeNode = { parentNode: { removeChild() { this.removed = true; } }, isConnected: true };
    const vid = mkEl({ tagName: 'VIDEO', naturalWidth: 320, naturalHeight: 180, clientWidth: 320, clientHeight: 180 });
    const wasRender = prefs.regionRender;
    const wasStatic = prefs.regionStaticOnly;
    try {
      prefs.regionRender = true;
      prefs.regionStaticOnly = false;
      regionCacheClear();
      // 造一份"已挂载"的账本记录 (不真的建 DOM: Node 环境没有可用的 DOM 桩)
      RegionRenderEngine.mounts.set(vid, { el: vid, node: fakeNode, clip: null, src: 'v.mp4', key: 'k|v', epoch: RegionRenderEngine.epoch });

      // (a) 静态图调度门: 视频/GIF 才调度; 静态图零调度
      const img = mkEl({ tagName: 'IMG', naturalWidth: 100, naturalHeight: 100, clientWidth: 100, clientHeight: 100 });
      RegionRenderEngine.mounts.set(img, { el: img, node: fakeNode, clip: null, src: 'a.png', key: 'k|a', epoch: RegionRenderEngine.epoch });
      assert.strictEqual(RegionRenderEngine.scheduleFor(img, 'a.png'), false, '静态图不调度 (零定时器)');
      assert.strictEqual(RegionRenderEngine.isAnimated(img, 'a.gif'), true, 'GIF 按扩展名判为动图');
      assert.strictEqual(RegionRenderEngine.isAnimated(img, 'a.png'), false, 'PNG 不判动图');
      assert.strictEqual(RegionRenderEngine.isVideo(vid), true, 'VIDEO 识别');

      // (b) 「仅静态图」降级开关: 视频不挂层 (规避掩码滞后, 这是设计里写明的已知代价)
      prefs.regionStaticOnly = true;
      assert.strictEqual(RegionRenderEngine.scheduleFor(vid, 'v.mp4'), false, '仅静态图开启时视频不调度');
      prefs.regionStaticOnly = false;

      // (c) 暂停-恢复账本: suspend 卸层但记住; 掩码不在缓存时 restore 显式降级 (不静默长层)
      assert.strictEqual(RegionRenderEngine.suspend(vid, 'fullscreen'), true, '暂停成功');
      assert.strictEqual(RegionRenderEngine.mounts.has(vid), false, '暂停后不在挂载表里');
      assert.strictEqual(RegionRenderEngine.diagnostics().suspended, 1, '暂停账本 +1');
      assert.strictEqual(RegionRenderEngine.restore(vid), false, '掩码已不在缓存 → 不恢复');
      assert.strictEqual(RegionRenderEngine.diagnostics().lastDegradeReason, 'no-mask', '原因 = no-mask');
      assert.strictEqual(RegionRenderEngine.diagnostics().suspended, 0, '恢复尝试后账本清空 (不会挂着一个永不恢复的项)');

      // (d) 全屏/PiP 事件在没有对应元素时必须是 no-op (不能凭空拆/挂)
      assert.strictEqual(RegionRenderEngine.fullscreenElement(), null, 'Node 环境无全屏元素');
      assert.strictEqual(RegionRenderEngine.handleFullscreen(), false, '无全屏 + 无暂停项 → no-op');
      assert.strictEqual(RegionRenderEngine.handlePip({ type: 'enterpictureinpicture', target: vid }), false,
        '未挂载的元素进 PiP → no-op');

      // (e) 场景跃变: 未挂载的元素不触发; 关闭开关时零动作
      const never = mkEl({ tagName: 'VIDEO' });
      assert.strictEqual(RegionRenderEngine.onSceneChange(never), false, '未挂载 → 不触发重算');
      prefs.regionRender = false;
      assert.strictEqual(svi.regionRenderOnSceneChange(vid), false, '关闭时场景跃变入口纯短路');
    } finally {
      prefs.regionRender = wasRender;
      prefs.regionStaticOnly = wasStatic;
      RegionRenderEngine.mounts.clear();
      regionCacheClear();
    }
  }

  console.log('✓ v6.2 单测 passed: 内容盒几何(fill/contain/cover/none/scale-down + object-position) / 元素盒映射(letterbox 边距保持原色·洞搬位·裁切·退化) / 表达构造性等价(矢量反推 === 网格) / 祖先链四类截断可辨 / 互斥矩阵 / 关闭态纯短路与四条降级原因 / 调度门与暂停恢复账本');

// ============================================================
// v6.3 单测 (区域纠正: 点击语义 / 差分构造 / 持久化键 / 自校准四护栏 / 关闭态短路)
// 契约来源: .trellis/tasks/09-25-v6-region-correction/design.md D1~D4 · PRD R1~R7
// ============================================================
(function () {
  const {
    regionCellFromPoint, regionDiffFromFlip, regionDiffStats, regionCalibrationAdvice,
    regionCalibrationState, regionCalibrateNow, regionCalibrateRollback,
    RegionCorrection, regionCorrectionStore, REGION_DEFAULTS, prefs, Store,
  } = svi;

  const bits = (arr) => Array.prototype.map.call(arr, (v) => (v ? '1' : '0')).join('');
  const mkGrid = (rows) => {
    const gh = rows.length;
    const gw = rows[0].length;
    const a = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) a[y * gw + x] = rows[y][x] === '1' ? 1 : 0;
    return { a: a, n: gw };
  };

  // ---- 1. 点坐标 → 格号 (纯函数) ----
  {
    assert.strictEqual(regionCellFromPoint(0, 0, 4, 100, 100), 0, '左上角 → 格 0');
    assert.strictEqual(regionCellFromPoint(99, 99, 4, 100, 100), 15, '右下角 → 末格');
    assert.strictEqual(regionCellFromPoint(50, 0, 4, 100, 100), 2, '中列 → 格 2');
    assert.strictEqual(regionCellFromPoint(-1, 5, 4, 100, 100), -1, '左越界 → -1 (不允许点到边外随便翻一块)');
    assert.strictEqual(regionCellFromPoint(5, 100, 4, 100, 100), -1, '下越界 → -1');
    assert.strictEqual(regionCellFromPoint(5, 5, 4, 0, 0), -1, '盒尺寸为 0 → -1');
  }

  // ---- 2. 一次点击 = 整个连通域取反 (不是单格) ----
  {
    // 4×4: 主流是 1, 中间一个 2×2 的 0 块 (一个连通域)
    const g = mkGrid(['1111', '1001', '1001', '1111']);
    const flip = regionDiffFromFlip(g.a, 4, 5); // 点在 0 块里 (格 5)
    assert.strictEqual(flip.changed, true, '翻转生效');
    assert.strictEqual(bits(flip.corrected), '1111111111111111', '整块 0 连通域被翻成 1 (连通域整体, 不是单格)');
    // 被翻转的 4 格在 4×4 网格里的下标是 5/6/9/10 (第 1、2 行的第 1、2 列)
    assert.strictEqual(bits(flip.diff), '0000011001100000', '差分 = 那 4 格');
    assert.strictEqual(flip.diff.length, 16, '差分长度 = 网格格数');

    // 再点一次同一区域 → 翻转集归零 → changed=false (不产样本, 也不改渲染)。
    //   连通域始终在**自动结果**上取 (而不是在"当前纠正后的网格"上) —— 否则第一次翻转后
    //   区域与背景合并, 再点会翻转整张图 (实测踩到, 见 implement.md 偏离 1)。
    const back = regionDiffFromFlip(g.a, 4, 5, flip.flips);
    assert.strictEqual(back.changed, false, '翻回原位 = 无差分');
    assert.strictEqual(bits(back.corrected), bits(g.a), '回到自动结果');
    assert.strictEqual(back.flips.some((v) => v), false, '翻转集归零');

    // 单格连通域 (孤立点) → 只翻那一格
    const iso = mkGrid(['1101', '1111', '1111', '1111']);
    const f2 = regionDiffFromFlip(iso.a, 4, 2);
    assert.strictEqual(bits(f2.corrected), '1111111111111111', '孤立 0 格 → 翻成 1');
    assert.strictEqual(bits(f2.diff), '0010000000000000', '只动那一格');

    // 越界 / 空输入 → 安全返回 (绝不产坏样本)
    assert.strictEqual(regionDiffFromFlip(g.a, 4, 999).changed, false, '越界格号 → 无差分');
    assert.strictEqual(regionDiffFromFlip(null, 4, 0).corrected, null, '空网格 → 安全返回');
  }

  // ---- 3. 差分统计与样本形状 ----
  {
    const ours = new Uint8Array([1, 1, 0, 0]);
    const corrected = new Uint8Array([1, 0, 1, 0]);
    const st = regionDiffStats(ours, corrected);
    assert.strictEqual(st.toKeep, 1, 'toKeep: 我们反了、用户要保原色');
    assert.strictEqual(st.toInvert, 1, 'toInvert: 我们没反、用户要反');
    assert.strictEqual(st.unchanged, 2, 'unchanged');
    const s = svi.regionCorrectionStore && true;
    assert.ok(s, 'store 导出存在');
  }

  // ---- 4. 持久化: 形状 / 上限 / 清空 / 命中键 / 坏数据降级 ----
  {
    const orig = Store.get('regionCorrections', null);
    try {
      regionCorrectionStore.data = null;
      regionCorrectionStore.clear();
      assert.strictEqual(regionCorrectionStore.list().length, 0, '清空后零样本');

      const sample = {
        host: 'h1', stem: 'img.photo', dims: '800x600', n: 4,
        ours: '1111001110011111', corrected: '1111111111111111', diff: '0000110000110000', at: 1,
      };
      regionCorrectionStore.add(sample);
      assert.strictEqual(regionCorrectionStore.list().length, 1, '写入一条');
      const hit = regionCorrectionStore.find('h1', 'img.photo', '800x600');
      assert.ok(hit && hit.corrected === sample.corrected, '命中键 = 站点 + 词干 + 尺寸指纹');
      assert.strictEqual(regionCorrectionStore.find('h1', 'img.other', '800x600'), null, '词干不同 → 不命中');
      assert.strictEqual(regionCorrectionStore.find('h2', 'img.photo', '800x600'), null, '站点不同 → 不命中');
      assert.strictEqual(regionCorrectionStore.find('h1', 'img.photo', '400x300'), null, '尺寸指纹不同 → 不命中');

      // 上限 FIFO
      regionCorrectionStore.clear();
      for (let i = 0; i < 205; i++) {
        regionCorrectionStore.add({ host: 'h', stem: 's' + i, dims: '1x1', n: 2, ours: '10', corrected: '01', diff: '11', at: i });
      }
      const list = regionCorrectionStore.list();
      assert.strictEqual(list.length, 200, '样本上限 200 (FIFO)');
      assert.strictEqual(list[0].stem, 's5', '最旧的先被淘汰');

      // 按键删除 (翻回原位时撤销该纠正)
      regionCorrectionStore.clear();
      regionCorrectionStore.add({ host: 'h', stem: 'a', dims: '1x1', n: 2, ours: '10', corrected: '01', diff: '11', at: 1 });
      regionCorrectionStore.add({ host: 'h', stem: 'b', dims: '1x1', n: 2, ours: '10', corrected: '01', diff: '11', at: 2 });
      assert.strictEqual(regionCorrectionStore.remove('h', 'a', '1x1'), 1, '按键删除命中 1 条');
      assert.strictEqual(regionCorrectionStore.list().length, 1, '只剩另一条');
      assert.strictEqual(regionCorrectionStore.remove('h', 'nope', '1x1'), 0, '未命中 → 0 (幂等)');

      // 坏数据 → 空集, 绝不崩
      Store.set('regionCorrections', { samples: 'not-an-array', calibration: 42 });
      regionCorrectionStore.data = null;
      const bad = regionCorrectionStore.load();
      assert.strictEqual(bad.samples.length, 0, '坏 samples 字段 → 空集');
      assert.deepStrictEqual(bad.calibration, {}, '坏 calibration 字段 → 空对象');
    } finally {
      regionCorrectionStore.clear();
      if (orig) Store.set('regionCorrections', orig); else Store.remove('regionCorrections');
      regionCorrectionStore.data = null;
    }
  }

  // ---- 5. 自校准四护栏 (纯函数) ----
  {
    const mk = (up, down) => {
      // 每条样本 8 位: 前 up 位是 0→1 (用户要反), 接着 down 位是 1→0 (用户要保)
      let ours = '';
      let corrected = '';
      for (let i = 0; i < up; i++) { ours += '0'; corrected += '1'; }
      for (let i = 0; i < down; i++) { ours += '1'; corrected += '0'; }
      while (ours.length < 8) { ours += '1'; corrected += '1'; }
      return { host: 'h', stem: 's', dims: 'd', n: 2, ours: ours, corrected: corrected, diff: '', at: 0 };
    };

    // (a) 累积门: 4 条不够
    const few = [mk(0, 3), mk(0, 3), mk(0, 3), mk(0, 3)];
    const a1 = regionCalibrationAdvice(few, 0.03, { minSamples: 5, step: 0.005 });
    assert.strictEqual(a1.apply, false, '样本不足 → 不动');
    assert.strictEqual(a1.reason, 'insufficient-samples', '原因 = insufficient-samples');

    // (b) 方向一致 (全部"我们抠多了") → 面积门变大, 幅度 ≤ step
    const up = [mk(0, 3), mk(0, 3), mk(0, 3), mk(0, 3), mk(0, 3)];
    const a2 = regionCalibrationAdvice(up, 0.03, { minSamples: 5, step: 0.005 });
    assert.strictEqual(a2.apply, true, '够样本 + 方向一致 → 应用');
    assert.strictEqual(a2.direction, 'up', '方向 = up (我们抠多了 → 更保守)');
    assert.ok(Math.abs(a2.to - 0.035) < 1e-9, '幅度 = step (0.005), got ' + a2.to);
    assert.ok(Math.abs(a2.to - a2.from) <= 0.005 + 1e-12, '单次幅度不超过上限');

    // (c) 反方向
    const dn = [mk(3, 0), mk(3, 0), mk(3, 0), mk(3, 0), mk(3, 0)];
    const a3 = regionCalibrationAdvice(dn, 0.03, { minSamples: 5, step: 0.005 });
    assert.strictEqual(a3.direction, 'down', '方向 = down (我们抠少了 → 更激进)');
    assert.ok(Math.abs(a3.to - 0.025) < 1e-9, '向下调整同样不超过 step, got ' + a3.to);

    // (d) 方向不一致 (50%) → 不动
    const mixed = [mk(0, 3), mk(0, 3), mk(3, 0), mk(3, 0), mk(1, 1)];
    const a4 = regionCalibrationAdvice(mixed, 0.03, { minSamples: 5, step: 0.005 });
    assert.strictEqual(a4.apply, false, '两类持平 → 视为噪声, 不动');
    assert.strictEqual(a4.reason, 'ambiguous', '原因 = ambiguous');

    // (e) 2/3 恰好达标 → 应用 (边界)
    const two3 = [mk(0, 3), mk(0, 3), mk(3, 0)];
    assert.strictEqual(regionCalibrationAdvice(two3, 0.03, { minSamples: 3, step: 0.005 }).direction, 'up',
      '2/3 恰好在门槛上 → 应用');

    // (f) 无差分 / 钳制
    const noDiff = [mk(0, 0), mk(0, 0), mk(0, 0), mk(0, 0), mk(0, 0)];
    assert.strictEqual(regionCalibrationAdvice(noDiff, 0.03, { minSamples: 5 }).reason, 'no-diff', '零差分 → 不动');
    assert.strictEqual(regionCalibrationAdvice(up, 0.25, { minSamples: 5, step: 0.005 }).reason, 'clamped',
      '已在上限 → 不动 (钳制)');
  }

  // ---- 6. 自校准的应用 / 回滚 / 只动一个参数 (R3) ----
  {
    const origArea = prefs.regionMinAreaRatio;
    const origCal = prefs.regionCalibrate;
    const origSamples = prefs.regionCalibrateMinSamples;
    const origStep = prefs.regionCalibrateStep;
    const origGrid = prefs.regionGridN;
    const origCut = prefs.imgLumCutoff;
    try {
      regionCorrectionStore.clear();
      regionCorrectionStore.data = null;
      prefs.regionCalibrateMinSamples = 3;
      prefs.regionCalibrateStep = 0.005;
      for (let i = 0; i < 3; i++) {
        regionCorrectionStore.add({ host: 'h', stem: 's', dims: 'd', n: 2, ours: '0000', corrected: '1100', diff: '1100', at: i });
      }

      // 开关关闭 → 只算不动
      prefs.regionCalibrate = false;
      prefs.regionMinAreaRatio = 0.03;
      const off = regionCalibrateNow();
      assert.strictEqual(off.apply, false, '自校准关闭时不应用');
      assert.strictEqual(off.reason, 'switch-off', '原因 = switch-off');
      assert.strictEqual(prefs.regionMinAreaRatio, 0.03, '关闭时参数分毫不动');

      // 开关打开 → 应用; 只动面积门
      //   样本 '0000'→'1100' 的语义: 我们没反、用户要反 = 我们**抠少了** → 面积门向下 (更激进)
      prefs.regionCalibrate = true;
      const on = regionCalibrateNow();
      assert.strictEqual(on.apply, true, '打开后应用建议');
      assert.strictEqual(on.direction, 'down', '方向 down (我们抠少了 → 更激进)');
      assert.ok(Math.abs(prefs.regionMinAreaRatio - 0.025) < 1e-9, '面积门更新到 0.025, got ' + prefs.regionMinAreaRatio);
      assert.strictEqual(prefs.regionGridN, origGrid, '网格 N 未被触碰 (R3: 只动分割参数里的面积门)');
      assert.strictEqual(prefs.imgLumCutoff, origCut, '整图判定阈值未被触碰 (那是 v5-3 的回路)');
      const st = regionCalibrationState();
      assert.strictEqual(st.samples, 3, '诊断: 样本数');
      assert.ok(st.last && Math.abs(st.last.from - 0.03) < 1e-9 && Math.abs(st.last.to - 0.025) < 1e-9,
        '诊断: 最近一次校准 from→to, got ' + JSON.stringify(st.last));
      assert.strictEqual(st.defaultValue, REGION_DEFAULTS.minAreaRatio, '诊断: 默认值来自单一真源');

      // 一键回滚
      const rb = regionCalibrateRollback();
      assert.strictEqual(rb.to, REGION_DEFAULTS.minAreaRatio, '回滚到默认参数');
      assert.strictEqual(prefs.regionMinAreaRatio, REGION_DEFAULTS.minAreaRatio, '参数已回默认');
      assert.strictEqual(regionCalibrationState().last.direction, 'rollback', '诊断记录回滚动作');
    } finally {
      prefs.regionMinAreaRatio = origArea;
      prefs.regionCalibrate = origCal;
      prefs.regionCalibrateMinSamples = origSamples;
      prefs.regionCalibrateStep = origStep;
      regionCorrectionStore.clear();
      regionCorrectionStore.data = null;
    }
  }

  // ---- 7. 关闭态短路 (R5/R7): 默认关闭时零节点零动作 ----
  {
    const wasCorrect = prefs.regionCorrect;
    try {
      prefs.regionCorrect = false;
      assert.strictEqual(RegionCorrection.enabled(), false, '默认关');
      assert.strictEqual(RegionCorrection.active, false, '未进入模式');
      assert.strictEqual(RegionCorrection.enter(null), false, '关闭时 enter 恒 false');
      assert.strictEqual(RegionCorrection.exit(), false, '未进入时 exit 是 no-op');
      assert.strictEqual(RegionCorrection.flipsFor(null, '', 4), null, '关闭/无效元素 → 无翻转集');
      const d = RegionCorrection.diagnostics();
      assert.strictEqual(d.active, false, '诊断: 未激活');
      assert.strictEqual(typeof d.samples, 'number', '诊断: 样本数可读');
      // 零施压: 诊断里不得出现任何"催用户纠正"的字段
      assert.strictEqual(Object.keys(d).indexOf('suggest'), -1, '诊断里没有"建议纠正"类字段');
      assert.strictEqual(Object.keys(d).indexOf('shouldCorrect'), -1, '诊断里没有施压字段');
    } finally {
      prefs.regionCorrect = wasCorrect;
    }
  }

  console.log('✓ v6.3 单测 passed: 点击→格号(含越界) / 连通域整体翻转与翻回原位 / 差分统计 / 持久化(键命中·上限·清空·坏数据降级) / 自校准四护栏(累积门·方向不一致·幅度上限·钳制) / 应用与回滚且只动一个参数 / 关闭态零动作零施压');

// ============================================================
// v6.4 单测 (设计 token 单一真源: 三处逐字节一致 + 零字面量残留)
// 契约来源: .trellis/tasks/09-25-v6-ui-rebuild/prd.md R1 / R7 (配色取 DR theme.less 实读表)
// ============================================================
(function () {
  const fs = require('fs');
  const path = require('path');
  const ROOT = __dirname;

  const TOKEN_RE = /\/\* v6\.4-TOKENS-START \*\/([\s\S]*?)\/\* v6\.4-TOKENS-END \*\//;
  const userscript = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8');

  // ---- 1. token 块存在且是唯一真源 ----
  {
    const m = TOKEN_RE.exec(userscript);
    assert.ok(m, 'R1: 用户脚本里必须有 v6.4-TOKENS-START/END 块');
    const block = m[1];
    // 关键角色必须在 (数量按 PRD R7 的 DR 表 + 本项目需求声明)
    const need = ['--svi-bg', '--svi-fg', '--svi-ctl-bg', '--svi-ctl-hover', '--svi-ctl-active',
      '--svi-input-fg', '--svi-input-active', '--svi-input-ph', '--svi-border', '--svi-title',
      '--svi-error', '--svi-success', '--svi-fs-sm', '--svi-fs', '--svi-fs-lg', '--svi-lh-sm',
      '--svi-lh', '--svi-border-w', '--svi-ctl-h', '--svi-r-sm', '--svi-r', '--svi-r-lg',
      '--svi-gap-sm', '--svi-gap', '--svi-tr-fast', '--svi-tr-slow'];
    for (let i = 0; i < need.length; i++) {
      assert.ok(block.indexOf(need[i] + ':') >= 0, 'R1: token 缺失 ' + need[i]);
    }
    // 逐值照搬 DR (抽查 PRD R7 表里的几个值, 防止被"顺手调色")
    assert.ok(/--svi-bg:\s*#141e24/.test(block), 'R1: 底色 = DR #141e24');
    assert.ok(/--svi-fg:\s*#53a1b3/.test(block), 'R1: 前景 = DR #53a1b3');
    assert.ok(/--svi-ctl-hover:\s*#193945/.test(block), 'R1: 悬停 = DR #193945');
    assert.ok(/--svi-ctl-active:\s*#316e7d/.test(block), 'R1: 激活 = DR #316e7d');
    assert.ok(/--svi-title:\s*#e96c4c/.test(block), 'R1: 标题 = DR #e96c4c');
    assert.ok(/--svi-error:\s*#db4245/.test(block), 'R1: 错误 = DR #db4245');
    assert.ok(/--svi-success:\s*#317c4e/.test(block), 'R1: 成功 = DR #317c4e');
    assert.ok(/--svi-fs:\s*\.75rem/.test(block), 'R1: 正文字号 = DR .75rem');
  }

  // ---- 2. 三处消费点逐字节一致 (用户脚本 / popup / options) ----
  {
    const mine = TOKEN_RE.exec(userscript)[1].trim();
    const consumers = ['extension/popup.html', 'extension/options.html'];
    for (let i = 0; i < consumers.length; i++) {
      const f = consumers[i];
      const p = path.join(ROOT, f);
      assert.ok(fs.existsSync(p), 'R1: 消费点产物必须存在: ' + f + ' (先跑 build-extension.js)');
      const text = fs.readFileSync(p, 'utf8');
      assert.ok(text.indexOf(mine) >= 0,
        'R1: ' + f + ' 里的 token 块必须与用户脚本**逐字节一致** (构建时注入, 不得手写)');
    }
    // 选项页是被 manifest 引用的第三个消费点
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8'));
    assert.ok(manifest.options_ui && manifest.options_ui.page === 'options.html',
      'R1: manifest 必须把 options.html 注册为设置页');
  }

  // ---- 3. 零字面量残留: 面板 CSS 与两个 HTML 里, token 块之外不得再有颜色字面量 ----
  {
    // 面板 CSS 块 (injectStyles 里的模板串)。
    //   注意: 真源文件是 CRLF 行尾, 用 indexOf('\n...') 定位会找不到 —— 用正则抓模板体更稳。
    const cssMatch = /const css = `([\s\S]*?)`;/.exec(userscript);
    assert.ok(cssMatch, 'R1: 必须能定位 injectStyles 里的 CSS 模板串');
    const block = cssMatch[1];
    const afterTokens = block.slice(block.indexOf('--svi-tr-slow: 250ms;'));
    assert.deepStrictEqual(afterTokens.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [],
      'R1: 面板 CSS 里 token 块之外不得再有 #hex 字面量');
    const strayRgba = (afterTokens.match(/rgba?\([^)]*\)/g) || []).filter((x) => x.indexOf('var(') < 0 && /[0-9]/.test(x));
    assert.deepStrictEqual(strayRgba, [], 'R1: 面板 CSS 里 token 块之外不得再有 rgba() 字面量');

    // 两个 HTML 产物: 同样只允许 token 块内有颜色字面量
    //   注入时做的是 trim 过的块 (去掉真源里的缩进), 所以这里也必须拿 trim 版本去剔除
    const mine = TOKEN_RE.exec(userscript)[1].trim();
    for (const f of ['extension/popup.html', 'extension/options.html']) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const outside = text.replace(mine, '');
      const hex = outside.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      assert.deepStrictEqual(hex, [], f + ' 里 token 块之外不得再有 #hex 字面量, got ' + JSON.stringify(hex));
      const rgba = (outside.match(/rgba?\([^)]*\)/g) || []).filter((x) => x.indexOf('var(') < 0);
      assert.deepStrictEqual(rgba, [], f + ' 里 token 块之外不得再有 rgba() 字面量, got ' + JSON.stringify(rgba));
    }
  }

  // ---- 4. 无第二份 token 定义: 除真源与两个注入产物外, 不得有第三处 --svi-bg: 定义 ----
  {
    const files = ['test.js', 'test-browser.js', 'scripts/build-extension.js',
      'scripts/extension-src/popup.html', 'scripts/extension-src/options.html'];
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.strictEqual(/--svi-bg:\s*#/.test(text), false,
        'R1: ' + f + ' 里不得再定义 --svi-bg (token 只有一处真源)');
    }
  }

  console.log('✓ v6.4 token 单测 passed: 唯一真源(DR 逐值照搬抽查) / 三处逐字节一致(用户脚本·popup·options) / 面板 CSS 与 HTML 零颜色字面量残留 / 无第二份定义');
})();

// ============================================================
// v6.4 控件库单测 (收口: 单一实现点 + 词汇表完整 + 无第二套行渲染 + 内联色策略)
// 契约来源: .trellis/tasks/09-25-v6-ui-rebuild/prd.md R2
// ============================================================
(function () {
  const fs = require('fs');
  const path = require('path');
  const { SviControls } = svi;
  const src = fs.readFileSync(path.join(__dirname, 'universal-smart-invert.user.js'), 'utf8');

  // ---- 1. 词汇表完整 (DR 控件词汇 + 本项目既有的行形状) ----
  {
    const need = ['h', 'labelBox', 'section', 'group',
      'toggleRow', 'multiSwitch', 'sliderRow', 'selectRow', 'checkRow',
      'chipRow', 'btnRow', 'navButton', 'resetButton',
      'colorPicker', 'shortcutRow', 'collapsible', 'messageBar',
      'textRow', 'infoLine', 'pickerRow'];
    for (let i = 0; i < need.length; i++) {
      assert.strictEqual(typeof SviControls[need[i]], 'function', 'R2: 控件缺失 ' + need[i]);
    }
    assert.ok(need.length >= 14, 'R2: 控件数量不低于 DR 词汇表规模');
  }

  // ---- 2. 构造不抛 + 返回形状正确 (Node 桩只有极简 DOM, 这里只验形状与同步协议) ----
  {
    const g = SviControls.group('标题', '描述', 'grp-1');
    assert.ok(g.el, 'R2: group 返回 {el}');
    assert.strictEqual(typeof g.add, 'function', 'R2: group.add 可加行');
    assert.strictEqual(typeof g.syncAll, 'function', 'R2: group.syncAll 可同步');

    const c = SviControls.collapsible('折叠', '提示', true);
    assert.ok(c.el, 'R2: collapsible 返回 {el}');
    assert.strictEqual(typeof c.setOpen, 'function', 'R2: collapsible.setOpen 可编程展开');

    assert.ok(SviControls.messageBar('文案', 'warn'), 'R2: messageBar 构造成功');
    assert.ok(SviControls.messageBar('文案', '不认识的 kind'), 'R2: messageBar 对未知 kind 降级为 info');

    const r = SviControls.checkRow('复选', '提示', () => false, () => {});
    assert.ok(r.row && typeof r.sync === 'function', 'R2: checkRow 返回 {row, sync}');

    const ms = SviControls.multiSwitch('档位', '提示', [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
      () => 'a', () => {});
    assert.ok(ms.row && typeof ms.sync === 'function', 'R2: multiSwitch 返回 {row, sync}');

    const nb = SviControls.navButton('打开设置', '', () => {});
    assert.ok(nb.row, 'R2: navButton 返回 {row, sync}');
    assert.ok(SviControls.resetButton('重置', '', () => {}).row, 'R2: resetButton 返回 {row}');
    assert.ok(SviControls.shortcutRow('快捷键', '', () => 'Alt+I', () => {}).row, 'R2: shortcutRow 返回 {row}');
    assert.ok(SviControls.colorPicker('颜色', '', () => '#fff', () => {}).row, 'R2: colorPicker 返回 {row}');
  }

  // ---- 3. 单一实现点: 每个行工厂在整份真源里只允许出现一次定义 ----
  {
    const factories = ['toggleRow', 'sliderRow', 'selectRow', 'chipRow', 'btnRow', 'textRow',
      'infoLine', 'pickerRow', 'checkRow', 'multiSwitch', 'collapsible', 'messageBar',
      'labelBox', 'section', 'group', 'navButton', 'resetButton', 'colorPicker', 'shortcutRow'];
    for (let i = 0; i < factories.length; i++) {
      const re = new RegExp('^\\s{4}' + factories[i] + '\\(', 'gm');
      const defs = (src.match(re) || []).length;
      assert.strictEqual(defs, 1, 'R2: ' + factories[i] + ' 必须只有一处实现 (收口), 实际 ' + defs);
    }
  }

  // ---- 4. 旧 `ui` 转发垫片必须已删除, 且调用点一律直连 SviControls (R2a) ----
  //   垫片的存在意义只是「搬家时不改 118 处调用点」；重建层切换完成后它必须消失，
  //   否则「控件 DOM 构造只有一个实现点」这条纪律就只剩一句话，随时可能长出第二套。
  {
    assert.strictEqual(/const ui = \{/.test(src), false,
      'R2a: ui 转发垫片必须已删除 (它会让第二套行渲染有处可藏)');
    const calls = src.match(/(?<![\w.$])ui\.[a-zA-Z]+\(/g) || [];
    assert.deepStrictEqual(calls, [],
      'R2a: 面板调用点必须直连 SviControls.*, 残留 ' + JSON.stringify(calls));
  }

  // ---- 5. 内联样式里的颜色必须走 token (唯一例外: 防闪光黑底) ----
  {
    const inline = src.match(/color: ?#[0-9a-fA-F]{3,8}|background: ?#[0-9a-fA-F]{3,8}/g) || [];
    assert.deepStrictEqual(inline, ['background:#000'],
      'R1: 内联样式里的颜色必须走 token (唯一例外是防闪光黑底), got ' + JSON.stringify(inline));
  }

  console.log('✓ v6.4 控件库单测 passed: 词汇表 20 项齐全 / 构造与 {row,sync} 协议正确 / 每个工厂只有一处实现(收口) / ui 垫片已删除且零残留调用点 / 内联色策略(仅防闪光黑底例外)');
})();

// ============================================================
// v6.4 R1b 单测 (设置项清单三向无缺失 + options 页与内容脚本的存储协议同构)
// 契约来源: .trellis/tasks/09-25-v6-ui-rebuild/prd.md R4 / implement.md 阶段 R1b 的 AC ①②③
// ============================================================
(function () {
  const fs = require('fs');
  const path = require('path');
  const ROOT = __dirname;
  const src = fs.readFileSync(path.join(ROOT, 'universal-smart-invert.user.js'), 'utf8');
  const optSrc = fs.readFileSync(path.join(ROOT, 'scripts/extension-src/options.js'), 'utf8');

  // ---- 0. 真源抽取（与 scripts/build-extension.js 用同一条抽块规则）----
  const blockM = /\/\* v6\.4-SETTINGS-SCHEMA-START \*\/([\s\S]*?)\/\* v6\.4-SETTINGS-SCHEMA-END \*\//.exec(src);
  assert.ok(blockM, 'R1b: 用户脚本里必须有 v6.4-SETTINGS-SCHEMA-START/END 块');
  const SCHEMA = new Function(blockM[1] + '\nreturn SVI_SETTINGS_SCHEMA;')();
  const dpM = /const DEFAULT_PREFS = (\{[\s\S]*?\n  \});/.exec(src);
  assert.ok(dpM, 'R1b: 必须能定位 DEFAULT_PREFS');
  const DEFAULTS = new Function('return (' + dpM[1] + ')')();

  const schemaKeys = [];
  for (const g of SCHEMA) for (const it of g.items) schemaKeys.push(it.key);

  const getPath = (obj, p) => {
    let c = obj;
    for (const k of String(p).split('.')) { if (c == null || typeof c !== 'object') return undefined; c = c[k]; }
    return c;
  };
  // 默认值的**叶子路径**（对象继续展开；数组与空对象按叶子算 —— 空对象如 siteOverrides 本身就是一个键）
  const leaves = (o, p, out) => {
    const ks = Object.keys(o);
    if (!ks.length) { if (p) out.push(p); return out; }
    for (const k of ks) {
      const v = o[k];
      const np = p ? p + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, np, out); else out.push(np);
    }
    return out;
  };

  // ---- 例外表: DEFAULT_PREFS 里**刻意不上**设置页的键 ----
  //   每个键都必须写清**为什么不该有 options 项**（不许笼统写「纯 UI 态」）；
  //   表本身也受断言约束: 已上 options 的、或已不存在的键留在表里会让测试变红（防表腐化）。
  const EXCEPTIONS = {
    // (a) 面板自身的形态与开合态 —— 设置页是全页标签, 没有「面板停靠 / 窗口位置」这回事
    enabled: 'DEFAULT_PREFS 里的死键: 全仓无任何读取点（站点电源实际由 siteProfile.enabled / runtime.siteActive 承载）, 保留只为不改既有存储形状',
    settingsOpen: '设置面板的开合态（UI 态, 非用户偏好）',
    advancedOpen: '设置面板高级区的展开态（UI 态）',
    'pos.x': '设置面板窗口位置（拖拽写入的 UI 态）',
    'pos.y': '设置面板窗口位置（拖拽写入的 UI 态）',
    'pos.edge': '设置面板停靠边（拖拽写入的 UI 态）',
    settingsLayout: '设置面板布局: 居中 / 靠左 / 靠右 —— 面板自身的形态, 设置页是全页标签无此概念',
    settingsWidth: '设置面板停靠态宽度 —— 同上, 面板自身形态',
    // (b) 数据容器 —— 由交互（Alt+点击 / 站点三态）或导出导入写, 不是「一个控件对应一个值」
    siteOverrides: '站点级覆盖表: 由站点三态循环 / 弹窗「清除本站覆盖」读写, 不是标量设置项',
    manualOverrides: '手动结论表: 由 Alt+点击 一次生效写入（数据, 非设置项）',
    'actions.hide.scope': 'hide 动作的作用域（session / rule）: 由 Alt+Shift+点击 的三态循环写入, 没有独立控件',
    // (c) 引擎内部阈值 / 预算 —— 刻意不上 UI（改坏会让判定失准, 且面板从 v4 起就没给过入口）
    statsEnabled: '引擎侧本地统计开关（无 UI; 面板的数据区块只做导出/导入）',
    bgExcludeSelectors: '背景替换排除选择器（无 UI; 由规则包 / 备份导入写入的载体字段）',
    storeBackend: '存储后端（无 UI; 由 Store.detectBackend 自动探测 sync → local 链）',
    eagerScanBudget: '启动扫描预算（引擎常量, 无 UI）',
    localFirstDecide: '本地优先判定总开关（v4.6 引擎行为开关, 无 UI）',
    calibrateMinSamples: '整图判定自校准的最小样本数（引擎阈值, 无 UI）',
    falseInvertRate: '误反占比阈值（引擎阈值, 无 UI）',
    flashWindowRatio: '转场白闪门阈值（引擎阈值, 无 UI）',
    animDecodeBudgetMs: '动图谱分析毫秒预算（引擎预算, 无 UI）',
    animRecheckMs: '动图结论复议间隔（引擎预算, 无 UI）',
    maskSettleTimeoutMs: '单元素摘罩超时兜底（引擎预算, 无 UI）',
    siteMinSeen: '本站「已知会反色」门的最少样本数（引擎阈值, 无 UI）',
    // (d) 派生值 —— 真源在别的键上, 自身只是兼容旧版本的镜像
    flashGuard: '由 flashGuardLevel 派生出的兼容旧值（面板注释写明「派生值（旧版本可读）」）',
    // (e) 面板**有** UI, 但那是自建 DOM 而非控件库工厂 —— 抽出器抽不到, 本轮也不硬凑
    //     （色卡列表 / 规则列表编辑器需要新控件; 属 R2「面板 12 区块重建」的同一批工作,
    //      届时与面板一起换成 SviControls 工厂并同时进 schema）
    shieldColors: '面板有 UI（buildShieldSection 自建色卡列表 + 取色器添加）, 需新控件类型; R2 重建时一并进 schema',
    elementRules: '面板有 UI（元素规则列表编辑器）, 需新控件类型（结构化列表增删）; R2 重建时一并进 schema',
    bgReplace: '面板的 UI 是**站点级三态**按钮「背景:开/关」（写 siteOverrides）; 此键是全局默认, 面板无独立行',
  };

  // 「相关」判定: 等价、或互为祖先/后代（默认值是叶子、面板引用可能落在内部节点上, 如 pos / shieldColors）
  const related = (a, b) => a === b || a.indexOf(b + '.') === 0 || b.indexOf(a + '.') === 0;
  const onOptions = (k) => schemaKeys.some((s) => related(k, s));
  const inTable = (k) => Object.keys(EXCEPTIONS).some((e) => related(k, e));

  // ---- 1. AC① 每个 schema 键都必须在 DEFAULT_PREFS 里取得到值（含点号路径）----
  {
    const missing = schemaKeys.filter((k) => getPath(DEFAULTS, k) === undefined);
    assert.deepStrictEqual(missing, [],
      'R1b: schema 的键必须在 DEFAULT_PREFS 里存在（点号路径逐段走）, 缺失 ' + JSON.stringify(missing));
    // 键不得重复（重复 = 同一项渲染两次）
    assert.strictEqual(new Set(schemaKeys).size, schemaKeys.length, 'R1b: schema 里不得有重复键');
  }

  // ---- 2. AC② 默认值每个叶子: 要么被 schema 覆盖（自身或祖先）, 要么在例外表里逐条写明理由 ----
  {
    const defaultLeaves = leaves(DEFAULTS, '', []);
    const uncovered = defaultLeaves.filter((k) => !onOptions(k));
    const unlisted = uncovered.filter((k) => !inTable(k));
    assert.deepStrictEqual(unlisted, [],
      'R1b: 未被 schema 覆盖的默认值键必须在例外表里写明理由, 未登记 ' + JSON.stringify(unlisted));
    const stale = Object.keys(EXCEPTIONS).filter((k) => getPath(DEFAULTS, k) === undefined || onOptions(k));
    assert.deepStrictEqual(stale, [],
      'R1b: 例外表里有键已上 options（应删）或已不存在于 DEFAULT_PREFS, 实测 ' + JSON.stringify(stale));
    for (const k of Object.keys(EXCEPTIONS)) {
      assert.ok(String(EXCEPTIONS[k]).length >= 12, 'R1b: 例外 ' + k + ' 的理由过于笼统, 必须写清为什么不该有界面');
    }
  }

  // ---- 3. AC③ schema 键面 ⟷ 面板键面 双向核对（防「面板有、options 没有」与「options 有、面板没有」）----
  {
    const clsM = /class UIController \{([\s\S]*?)\n  \}\n/.exec(src);
    assert.ok(clsM, 'R1b: 必须能定位 UIController 类体');
    const roots = new Set(Object.keys(DEFAULTS));
    const panelKeys = new Set();
    for (const hit of clsM[1].matchAll(/\bstate\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)) {
      if (!roots.has(hit[1].split('.')[0])) continue;   // 剔除 state.className / state.textContent 类噪声
      // 归一到「在 DEFAULT_PREFS 里存在的最深前缀」: state.shieldColors.push → shieldColors
      const segs = hit[1].split('.');
      let p = segs[0];
      for (let i = 1; i < segs.length; i++) {
        if (getPath(DEFAULTS, p + '.' + segs[i]) === undefined) break;
        p = p + '.' + segs[i];
      }
      panelKeys.add(p);
    }
    assert.ok(panelKeys.size >= 90, 'R1b: 面板键面抽取结果过少（' + panelKeys.size + '）, 抽取规则可能已失效');
    const notOnPanel = schemaKeys.filter((k) => ![...panelKeys].some((p) => related(k, p)));
    assert.deepStrictEqual(notOnPanel, [],
      'R1b: schema 的键必须在面板里也有落点（否则 options 会造出面板没有的设置项）, 实测 ' + JSON.stringify(notOnPanel));
    const notOnOptions = [...panelKeys].filter((k) => !onOptions(k) && !inTable(k));
    assert.deepStrictEqual(notOnOptions, [],
      'R1b: 面板引用的键必须在 schema 或例外表里（防面板新增项而 options 漏项）, 实测 ' + JSON.stringify(notOnOptions));
  }

  // ---- 4. kind → 控件工厂 的映射必须完整（schema 新增一种 kind, options 必须跟得上）----
  {
    const kindM = /const KINDS = \{([\s\S]*?)\n  \};/.exec(optSrc);
    assert.ok(kindM, 'R1b: options.js 里必须有 KINDS 映射表');
    const kinds = new Set([...kindM[1].matchAll(/^\s{4}([a-zA-Z]+)\(item\)/gm)].map((m) => m[1]));
    const used = [...new Set(SCHEMA.flatMap((g) => g.items.map((it) => it.kind)))];
    const unimplemented = used.filter((k) => !kinds.has(k));
    assert.deepStrictEqual(unimplemented, [],
      'R1b: schema 用到的 kind 必须在 options.js 的 KINDS 里有实现, 缺失 ' + JSON.stringify(unimplemented));
    // 控件工厂必须真的存在（避免 kind 映射到一个拼错的工厂名, 运行期才炸）
    const { SviControls } = svi;
    for (const kind of used) {
      const body = new RegExp('^\\s{4}' + kind + '\\(item\\) \\{([\\s\\S]*?)\\n    \\},', 'm').exec(kindM[1]);
      assert.ok(body, 'R1b: 取不到 kind ' + kind + ' 的实现体');
      const callM = /C\.([a-zA-Z]+)\(/.exec(body[1]);
      assert.ok(callM, 'R1b: kind ' + kind + ' 必须通过 C.<工厂> 构造');
      assert.strictEqual(typeof SviControls[callM[1]], 'function',
        'R1b: kind ' + kind + ' 指向的控件工厂不存在: SviControls.' + callM[1]);
    }
  }

  // ---- 5. options 页与内容脚本的**存储协议同构**（两处各写一份协议, 靠这组断言防漂移）----
  {
    const grab = (re, what) => { const m = re.exec(optSrc); assert.ok(m, 'R1b: options.js 里必须能取到 ' + what); return m[1]; };
    assert.strictEqual(grab(/const PREFIX = '([^']+)';/, 'PREFIX'),
      /const SVI_PREFIX = '([^']+)';/.exec(src)[1],
      'R1b: options 页的存储前缀必须与内容脚本 SVI_PREFIX 一致');
    assert.strictEqual(Number(grab(/const CHUNK_SIZE = (\d+);/, 'CHUNK_SIZE')), svi.Store.CHUNK_SIZE,
      'R1b: options 页的分片预算必须与 Store.CHUNK_SIZE 一致（不一致会让大值读取拼不出来）');
    assert.strictEqual(grab(/const LOGICAL = '([^']+)';/, 'LOGICAL'), 'prefs',
      'R1b: options 页写的逻辑键必须就是内容脚本写的那个（Store.set(\'prefs\', …)）');
    assert.ok(/Store\.set\('prefs'/.test(src), 'R1b: 内容脚本必须仍然把偏好写在逻辑键 prefs 上');
    const savePrefsDebounce = Number(/function savePrefs\(\) \{[\s\S]*?setTimeout\(flushPrefsNow, (\d+)\)/.exec(src)[1]);
    assert.strictEqual(Number(grab(/const DEBOUNCE_MS = (\d+);/, 'DEBOUNCE_MS')), savePrefsDebounce,
      'R1b: options 页的写入防抖应与内容脚本 savePrefs 同值');

    // 分片规则**行为**同构: 抽出 options.js 的 chunkRaw, 与 Store.chunkRaw 逐片比对
    const chunkBody = grab(/function chunkRaw\(raw\) \{([\s\S]*?)\n  \}/, 'chunkRaw');
    const optChunkRaw = new Function('CHUNK_SIZE', 'return function chunkRaw(raw) {' + chunkBody + '\n  };')(svi.Store.CHUNK_SIZE);
    const samples = [
      'a'.repeat(10),
      'x'.repeat(6999),                        // 恰好不到一片
      'x'.repeat(7000),                        // 恰好一片
      'x'.repeat(7001),                        // 跨片
      '中'.repeat(3000),                       // 3 字节字符: 按字节预算切片
      '😀'.repeat(2000),                       // 4 字节 / 代理对: 不许把一对拆开
      'ab😀中'.repeat(1500),                    // 混合
      JSON.stringify({ siteBlacklist: ['中'.repeat(500)], note: '😀' }),
    ];
    for (const s of samples) {
      assert.deepStrictEqual(optChunkRaw(s), svi.Store.chunkRaw(s),
        'R1b: 分片规则必须与 Store.chunkRaw 逐片一致（样本长度 ' + s.length + '）');
    }
    // 拼回去必须还是原串（切片本身不得丢字符）
    for (const s of samples) assert.strictEqual(svi.Store.chunkRaw(s).join(''), s, 'R1b: 分片拼接必须无损');
  }

  console.log('✓ v6.4 R1b 单测 passed: ' + SCHEMA.length + ' 组 / ' + schemaKeys.length + ' 项 三向核对无缺失'
    + ' + 例外表 ' + Object.keys(EXCEPTIONS).length + ' 条逐条写明理由'
    + ' + kind→控件工厂映射完整 + 存储协议(前缀/逻辑键/分片预算/防抖/切片规则)与内容脚本同构');
})();

// ============================================================
// v6.5 单测 (CRX3 结构校验 + 密钥纪律)
// 契约来源: .trellis/tasks/09-25-v6-ext-engineering/prd.md R7 / R8
// ============================================================
(function () {
  const fs = require('fs');
  const path = require('path');
  const { verifyCrx3 } = require('./scripts/build-crx.js');
  const { buildZip } = require('./scripts/lib/zip.js');

  // 手工构造一个最小 CRX3 (只含结构, 不含真实签名) —— 校验函数只做结构自洽这一层
  const mkCrx = (opts) => {
    const o = opts || {};
    const zip = buildZip(o.files || [{ name: 'manifest.json', data: Buffer.from('{}') }]);
    const header = Buffer.from(o.header || 'SVI-TEST-HEADER');
    const magic = Buffer.from(o.magic || 'Cr24', 'latin1');
    const buf = Buffer.alloc(12 + header.length + zip.length);
    magic.copy(buf, 0);
    buf.writeUInt32LE(o.version == null ? 3 : o.version, 4);
    buf.writeUInt32LE(o.headerSize == null ? header.length : o.headerSize, 8);
    header.copy(buf, 12);
    zip.copy(buf, 12 + header.length);
    return buf;
  };

  // ---- 1. 正例: Cr24 / CRX3 / 内嵌 ZIP 中央目录可解析 ----
  {
    const ok = verifyCrx3(mkCrx());
    assert.strictEqual(ok.ok, true, 'R7: 结构正确的 CRX3 必须通过校验, got ' + JSON.stringify(ok.errors));
    assert.strictEqual(ok.version, 3, 'R7: 版本识别为 3');
    assert.deepStrictEqual(ok.entries, ['manifest.json'], 'R7: 内嵌 ZIP 条目可枚举');
    const two = verifyCrx3(mkCrx({ files: [{ name: 'manifest.json', data: Buffer.from('{}') }, { name: 'content.js', data: Buffer.from('//x') }] }));
    assert.strictEqual(two.count, 2, 'R7: 多条目也能解析');
  }

  // ---- 2. 反例: 魔数 / 版本 / 头长 / 截断 各自报错且 ok=false ----
  {
    assert.strictEqual(verifyCrx3(mkCrx({ magic: 'XX24' })).ok, false, 'R7: 魔数错 → 拒绝');
    assert.ok(/Cr24/.test(verifyCrx3(mkCrx({ magic: 'XX24' })).errors.join(';')), 'R7: 魔数错的报错可读');
    assert.strictEqual(verifyCrx3(mkCrx({ version: 2 })).ok, false, 'R7: 版本不是 3 → 拒绝');
    assert.strictEqual(verifyCrx3(mkCrx({ headerSize: 1e9 })).ok, false, 'R7: 头长越界 → 拒绝');
    assert.strictEqual(verifyCrx3(mkCrx().slice(0, 10)).ok, false, 'R7: 截断 → 拒绝');
    assert.strictEqual(verifyCrx3(null).ok, false, 'R7: 空输入 → 拒绝');
    // 内嵌不是 ZIP (头长指向的位置不是 PK)
    const notZip = mkCrx();
    notZip.write('ZZ', 12 + 'SVI-TEST-HEADER'.length, 'latin1');
    const res = verifyCrx3(notZip);
    assert.strictEqual(res.ok, false, 'R7: 内嵌不是 ZIP → 拒绝');
  }

  // ---- 3. 密钥纪律 (R8): 仓库内不得有 PEM, .gitignore 必须覆盖 ----
  {
    const gi = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
    for (const pat of ['*.pem', 'crx-private-key.pem', '*.crx']) {
      assert.ok(gi.indexOf(pat) >= 0, 'R8: .gitignore 必须覆盖 ' + pat);
    }
    // 扫描仓库根目录下的文本类文件, 确认没有 PEM 内容 (私钥绝不入库)
    const roots = ['AGENTS.md', 'PUBLISHING.md', 'README.md', 'README_EN.md',
      'universal-smart-invert.user.js', 'test.js', 'test-browser.js', 'scripts/build-crx.js'];
    const pemRe = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
    for (const f of roots) {
      const text = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert.strictEqual(pemRe.test(text), false, 'R8: ' + f + ' 里不得出现 PEM 私钥');
    }
    assert.strictEqual(fs.existsSync(path.join(__dirname, 'crx-private-key.pem')), false,
      'R8: 仓库根目录不得存在签名私钥 (它应只存在于本地并离线备份)');
  }

  console.log('✓ v6.5 单测 passed: CRX3 结构校验(正例 + 魔数/版本/头长/截断/非ZIP 五个反例) / 密钥纪律(gitignore 三重覆盖 + 无 PEM 入库 + 无私钥文件)');
})();



})();

})();







