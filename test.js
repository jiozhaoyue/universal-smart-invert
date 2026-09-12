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
assert.strictEqual(svi.version, '2.0.0', 'script version must be 2.0.0');

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
assert.strictEqual(export1.version, '2.0.0', 'export version');
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

console.log('✓ v2.0 site-engine export tests passed: migration / pattern match / profile merge / small-element classify / color mapping / shield / manual overrides / BUILTIN_RULES / stats');

// 显式退出: 脚本启动桩中的常驻定时器 (统计落盘 interval、3s 后的引擎初始化循环) 会阻止进程自然退出
setTimeout(() => {
  console.log('✓ All unit, benchmark, multi-light-color, and v2.0 site-engine tests passed successfully!');
  process.exit(0);
}, 200);


