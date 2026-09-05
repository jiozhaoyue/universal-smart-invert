# Technical Design: Universal Smart Video Invert

## 1. Architecture & Boundaries (架构与边界)

系统采用模块化分层设计，将“DOM 探针”、“色彩分析器”、“人机协同状态机”与“交互视图”彻底解耦，同时预留 `MediaInvertEngine` 抽象基类以支持第二阶段的图片全媒体扩展。

```
+-------------------------------------------------------------------------+
|                              Userscript Entry                           |
|                         (GM_addStyle, Host Match)                       |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                        MediaInvertEngine (Base)                         |
|   +-----------------------+   +--------------------+   +-------------+  |
|   |  VideoProbeManager    |   |  LuminanceDetector |   | HILState-   |  |
|   |  - Active Video Track |   |  - 32x32 Canvas    |   | Machine     |  |
|   |  - Mini-player Track  |   |  - White & Sat Calc|   | - Override  |  |
|   |  - Filter Applicator  |   |  - CORS Fallback   |   | - Non-Fight |  |
|   +-----------------------+   +--------------------+   +-------------+  |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                             UI Controller                               |
|   - Edge Snap Floating Capsule (Mini / Expand)                          |
|   - Fullscreen Auto-Hide Watcher                                        |
|   - Global Keyboard Handler (Alt+I / Alt+A)                             |
|   - LocalStorage State Persistence                                      |
+-------------------------------------------------------------------------+
```

---

## 2. Core Modules & Data Contracts (核心模块与数据协议)

### 2.1 VideoProbeManager (主视频探针与样式施加)
- **职责**：
  1. 负责页面 `<video>` 节点的扫描与主视频筛选；
  2. 监听 DOM 树变动（MutationObserver）与全屏事件；
  3. 通过直接设置 `videoElement.style.filter` 施加滤镜，杜绝向 `html`/`body` 添加全局滤镜。
- **主视频判定权重评分**：
  $$Score = (Playing ? 1000 : 0) + (Visible ? 500 : 0) + \frac{Width \times Height}{10000}$$
  过滤条件：宽 $< 240$ 或 高 $< 160$ 的微型元素直接排除（过滤悬浮预览与广告）。
- **滤镜注入格式**：
  - 柔和灰：`invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)`
  - 纯黑高对比：`invert(1) hue-rotate(180deg) brightness(0.75) contrast(1.10)`
  - 过渡动效：`transition: filter 0.3s cubic-bezier(0.4, 0, 0.2, 1)`

### 2.2 LuminanceDetector (轻量离屏采样分析器)
- **职责**：
  1. 维护单个共享的离屏 `HTMLCanvasElement`（$32 \times 32$）；
  2. 定时（默认 1000ms）执行探测：
     ```javascript
     ctx.drawImage(video, 0, 0, 32, 32);
     const { data } = ctx.getImageData(0, 0, 32, 32);
     ```
  3. 统计两项指标：
     - $R_{white}$：像素明度 $L = 0.299R + 0.587G + 0.114B > 215$ 的占比；
     - $S_{avg}$：HSV/HSL 空间平均饱和度；
  4. 判定：若 $R_{white} \ge 0.65$ 且 $S_{avg} \le 0.20$，标记该帧特征分类为 `SCENE_WHITE_SLIDE`，否则为 `SCENE_NORMAL`。
- **CORS 保护**：
  若 `getImageData` 抛出 `SecurityError`，探测器置位 `isCorsRestricted = true` 并通知状态机降级，停止后续探测采样。

### 2.3 HILStateMachine (无对抗人机协同状态机)
- **状态集合**：
  - `autoEnabled`: 自动感知总开关（true/false）；
  - `activeFilter`: 当前实际生效的滤镜（'none' | 'soft-gray' | 'amoled'）；
  - `detectedScene`: 当前原生画面分类（`SCENE_NORMAL` | `SCENE_WHITE_SLIDE`）；
  - `userRejectedScene`: 用户手动干预时记录的场景（如在 `SCENE_WHITE_SLIDE` 时手动关掉反色，则记录该场景）。
- **人机无对抗规则 (Non-Conflicting Algorithm)**：
  1. 用户手动按 `Alt+I` 或点击胶囊调色时：
     `userRejectedScene = detectedScene;`
  2. 自动检测器每秒判定时：
     - 若 `detectedScene === userRejectedScene`：**保持沉默，严禁自动翻转**（充分尊重用户决策）；
     - 若 `detectedScene !== userRejectedScene`（画面发生了真正的章节或镜头巨变，如从 PPT 切换到真人出镜）：
       `userRejectedScene = null;` // 释放抑制，恢复自动根据新画面推荐决策！

---

## 3. UI/UX: 极简悬浮胶囊设计 (Minimalist Capsule)

- **常态**：屏幕边缘的微型半透明小圆点（$14\text{px} \times 28\text{px}$），不遮挡视线。
- **悬停/点击展开**：展开微型弹窗（宽度约 180px）：
  - 顶部状态标签：🟢 智能自适应（白底反色中 / 正常画面） / 🔒 人工锁定 / ⚠️ 跨域手动模式
  - 核心切换钮：反色开关键、自动感知开关键、预设切换（柔和灰 / 纯黑）
  - 快捷键提示：`Alt+I` 切换反色，`Alt+A` 切换自动
- **全屏自适应**：
  监听 `document.fullscreenElement`，进入全屏时添加隐藏类（`display: none` 或淡出），退出全屏恢复。

---

## 4. Operational & Rollback Considerations (回退与容灾)

- 单个文件交付：重构保持为单一标准的 Userscript 文件，便于油猴直接一键更新或回退。
- `LocalStorage` 键名版本化迁移：从原有 `bili_invert_dark_state_v2` 平滑升级到 `universal_video_invert_v3`，加载旧数据时自动迁移。
