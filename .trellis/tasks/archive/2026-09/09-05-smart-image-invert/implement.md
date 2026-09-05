# Implementation Plan: Phase 2 Smart Image Invert

## 1. Implementation Checklist

- [x] **Step 1: CSS 规则增强**
  - 添加 `img[data-svi-inverted="true"]` 与 `:hover` 原图还原样式规则；
  - 接入 `body.svi-image-invert-enabled` 作用域类名，支持一键总控开关。

- [x] **Step 2: 编写 ImageInvertEngine 模块**
  - 建立 `IntersectionObserver` 懒加载视口监听；
  - 实现基于尺寸（宽/高 >= 100）及类名正则过滤；
  - 实现基于 32x32 离屏 Canvas 的图片白底特征采样。

- [x] **Step 3: UI 胶囊面板集成**
  - 在控制卡片中增加“图片反色: 开/关”按钮；
  - 绑定状态变更事件并同步持久化到 LocalStorage。

- [x] **Step 4: 测试与回归验证**
  - 单元测试：验证图片过滤与白底判定逻辑；
  - 语法校验：`node --check index.js`；
  - 确保与原有视频反色完全兼容互不干扰。
