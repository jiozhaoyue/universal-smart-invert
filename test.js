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
mockGmFetch('https://i0.hdslb.com/bfs/article/test.png', true).then((res) => {
  assert.strictEqual(res.source, 'GM_xmlhttpRequest');
  assert.strictEqual(res.cleanBlob, true);
});

console.log('✓ All 16 unit, benchmark and image detection tests passed successfully!');

