# Technical Design: Phase 2 Smart Image Invert

## 1. Architecture & Component Interaction

在 `index.js` 中新增 `ImageInvertEngine` 模块，与 `VideoProbeManager` 并列运行：

```
+-------------------------------------------------------------+
|                     UIController (Capsule)                  |
|     [视频反色: 开/关]   [智能感知: 开/关]   [图片反色: 开/关]  |
+-------------------------------------------------------------+
               |                               |
               v                               v
+-----------------------------+ +-----------------------------+
|     HILStateMachine (Video) | |     ImageInvertEngine       |
|  - Active Video Invert      | |  - IntersectionObserver     |
|  - 32x32 Offscreen Canvas   | |  - NaturalSize & Class Excl |
|  - Non-Conflicting HIL      | |  - Canvas White-Slide Detect|
|                             | |  - data-svi-inverted Attr   |
+-----------------------------+ +-----------------------------+
```

## 2. Image Filtering & Processing Pipeline

1. **DOM 监听与懒检测**：
   - 使用单个全局 `IntersectionObserver` 监听进入当前屏幕视口的 `<img>` 元素。
   - 当图片 `isIntersecting` 为 true 且 `img.complete && img.naturalWidth > 0` 时触发分析。
2. **过滤排除规则**：
   - 尺寸排除：`img.naturalWidth < 100 || img.naturalHeight < 100`；
   - 类名与路径排除：匹配正则 `/(avatar|logo|emoji|icon|badge|nav|header|thumb)/i`；
3. **特征分析与应用**：
   - 绘制入共享的 32x32 离屏 Canvas，若白底比例 $\ge 60\%$ 且平均饱和度 $\le 22\%$：
     - 设置属性 `img.setAttribute('data-svi-inverted', 'true')`；
   - 若用户在胶囊中关闭“图片反色”，统一移除或通过 CSS 规则控制生效状态。
4. **悬停显原图**：
   - 纯 CSS 选择器支持：`img[data-svi-inverted="true"]:hover { filter: none !important; }`。
