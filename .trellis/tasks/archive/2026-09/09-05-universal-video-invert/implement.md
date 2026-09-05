# Implementation Plan: Universal Smart Video Invert

## 1. Ordered Implementation Checklist (实施任务清单)

- [x] **Step 1: 脚本元信息与基础样式重构**
  - 将 `@match` 升级为 `*://*/*`，适配所有视频网站；
  - 移除对 `html` / `body` 施加的破坏性 CSS 变量与全局滤镜；
  - 定义专属精准 CSS 动画与滤镜过渡类，确保仅在 `<video>` 上起效。

- [x] **Step 2: 主视频探针与动态跟踪器 (VideoProbeManager)**
  - 实现基于尺寸、播放状态、可见度权重的主视频选择算法；
  - 过滤小预览卡片（宽 < 240 或 高 < 160）；
  - 接入 `MutationObserver` 监听 DOM 树变化与 SPA 路由切换；
  - 准确监听并跟随小窗/画中画视频元素。

- [x] **Step 3: 离屏轻量亮度/白底采样检测器 (LuminanceDetector)**
  - 实现单例离屏 Canvas（32x32 像素）采样；
  - 计算感知明度分布与高亮白底比例（>215 像素占比）及平均饱和度；
  - 包含完整的 `try-catch` CORS 容错与优雅降级逻辑。

- [x] **Step 4: 无对抗人机协同状态机 (HILStateMachine)**
  - 实现场景分类枚举：`SCENE_NORMAL` 与 `SCENE_WHITE_SLIDE`；
  - 实现防频闪迟滞逻辑（进入阈值与退出缓冲时间 1.5s）；
  - 实现 `userRejectedScene` 场景指纹记忆，彻底解决人机拉锯打架问题；
  - 状态持久化（LocalStorage）与配置迁移。

- [x] **Step 5: 极简边缘吸附悬浮胶囊与全局快捷键 (UIController)**
  - 实现边缘极简小圆点折叠与拖拽吸附；
  - 实现点击展开微型卡片：状态显示、反色开关、自适应开关、预设选择（柔和灰 / 纯黑）；
  - 接入全屏状态监听（全屏时自动隐藏悬浮条）；
  - 注册 `Alt+I` 与 `Alt+A` 全局快捷键监听。

- [x] **Step 6: 多平台端到端验证与边界测试**
  - 语法与静态检查：`node --check index.js` 通过；
  - 算法与状态机单元测试：`node test.js` 6 项断言全部通过；
  - 验证滤镜仅作用于 `<video>` 节点，弹幕、控制条与字幕完全不受干扰。

---

## 2. Validation Plan (验证方案)

1. **语法与静态分析**：
   - 使用 Node.js 运行基本语法解析检查：`node --check index.js`
2. **功能与区域防护验证**：
   - 检查是否有任何 `html` 或 `body` 滤镜残留；
   - 验证视频滤镜是否以原子方式直接挂载在 `video.style.filter` 上；
   - 检查控制条、弹幕、字幕元素是否位于不同层叠上下文，保证 100% 不受影响。
3. **状态机逻辑单元验证**：
   - 编写轻量状态机单测（针对 `userRejectedScene` 场景切换与防对抗逻辑）。
