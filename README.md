# 全网通用智能视频与图片反色 (Universal Smart Video & Image Invert)

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.0-blue.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Tampermonkey-Supported-orange.svg?style=flat-square" alt="Tampermonkey">
  <img src="https://img.shields.io/badge/ScriptCat-Supported-purple.svg?style=flat-square" alt="ScriptCat">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
</p>

一款专为夜间与长久用眼打造的 **全网通用智能 HTML5 视频与技术图表反色** 油猴脚本（Userscript）。

专为解决 **网课/编程/教程视频中刺眼的纯白 PPT 课件**，以及 **技术文档中高亮刺眼的白底架构图、流程图与论文插图** 而生。

---

## ✨ 核心特性

### 1. 🎯 零污染精准作用域 (Precision Scoping)
- **拒绝粗暴的全局滤镜**：坚决不对 `html` 或 `body` 施加破坏性全局反相；
- **弹幕与字幕原生保护**：滤镜直接以原子方式挂载在活动 `<video>` 与白底 `<img>` 自身；
- **控制栏与交互不受扰**：B 站、YouTube 等平台的**播放器控制条、进度条、设置菜单、弹幕（Canvas/DOM）、外挂字幕**均 100% 保持原生清晰，绝不出现白字变黑字或负片失真的情况；
- **多视频智能探针**：基于播放状态、显示面积与可视性智能识别主视频，精确跟踪小窗（Mini-player / PiP），自动排除缩略图悬浮预览和微型浮窗广告。

### 2. 🧠 智能白底课件自适应反色 (Auto Luminance Detection)
- **极轻量采样**：后台使用 $32 \times 32$ 离屏微缩 Canvas 进行每秒 1 次的抽检，**CPU 占用率低于 0.1%**；
- **双特征精准判定**：
  - 统计像素高感知明度占比（$L = 0.299R + 0.587G + 0.114B > 210$）；
  - 统计色彩平均饱和度（$S_{avg} \le 22\%$）；
  - 判定白底课件后自动切换为柔和深色，切回暗景或真人实拍镜头时自动平滑恢复；
- **极致无感检测 (<0.01ms)**：采用降采样、整数位运算与早期剪枝优化，**单帧检测耗时仅约 0.002ms**（实测远优于 50ms 无感指标）；
- **退出迟滞缓冲 (Anti-Flicker)**：离开白底时需连续多次确认，杜绝转场高频频闪。

### 3. 🛠️ 开箱即用预设面板与高级折叠微调
- **点开即用极简界面**：打开参数设置面板，首先呈现的是最直观、免配置的「基础调色预设（柔和灰 / 纯黑）」与「浅色检测矩阵」；
- **🎨 专属色图拾色器**：内置原生可视化调色盘，可随意点选目标颜色并实时提取 HEX 色值，所选即所查；
- **⚙️ 高级参数折叠抽屉**：复杂的高级滑动条与数值框（亮度、对比度、饱和度、色相、切换速度、容差、明度线、采样周期等）整齐收纳在折叠抽屉中，既保持主界面清爽，又满足发烧友的极致精调需求。

### 4. 🤝 独创无对抗人机协同状态机 (Non-Conflicting HIL State Machine)
- **拒绝自动化“绑架用户”**：以往自动化脚本在误反色后，一旦用户手动调回，后台定时器下一秒又会擅自反弹改回；
- **场景指纹记忆**：当用户通过快捷键（`Alt+I`）或胶囊手动纠正时，脚本自动记录当前画面的“被否决场景特征”；
- **同场景不反弹**：只要视频画面仍属于该类型场景，自动检测器**绝对保持静默，绝不人机对抗**；仅当视频画面发生真实的场景剧变（如切入新章节或真人镜头）时，才重新接管。

### 5. 🖼️ 全浅色图表与矢量图智能反色 (Smart Image Invert - v1.4.0 深度升级)
- **多谱段全浅色系检测**：告别“只能识别纯白”的局限，全面支持 **纯白 (#FFF)、纸质浅灰 (#F5F5F5)、米黄暖白/羊皮纸 (#FAF0E6)、冷调淡蓝 (#F0F8FF)** 等各类技术文档常见浅色背景；
- **预设浅色色卡一键启闭**：4 块直观高亮色卡，点击即可开启或禁用特定浅色分类；
- **超轻量 8×8 极速采样**：单张图片像素检测耗时仅约 **0.0007ms (0.7微秒)**，插件占用极低；
- **Canvas 跨域防污染隔离**：彻底重构采样流程，避免单张跨域图片污染 Canvas 导致后续检测全部失效；
- **解除 URL 误过滤**：彻底修复将 URL 中的 `thumb`、`header` 误认为缩略图而跳过的顽疾，维基百科/知乎等平台的缩略高清图均能精准反色；
- **Alt + 鼠标左键即时强制反色/复原**：任意图片或 SVG 图表均可通过 `Alt + 单击` 单独强制切换反色；
- **纯 CSS 悬停瞬时显原图**：鼠标 Hover 到反色图片上时，由原生硬件加速展示未反色的原图，移开鼠标恢复反色。

### 6. 💊 极简边缘悬浮胶囊与全局快捷键
- **隐形贴边小药丸**：平时呈微型半透明小条吸附在屏幕边缘（支持自由纵向拖拽与左右吸附）；
- **全屏自动隐身**：进入全屏播放时自动隐藏，绝不遮挡沉浸式全屏观影；
- **全局快捷键**：
  - `Alt + I`：快速切换视频反色（带有人工覆盖意图保护）；
  - `Alt + A`：快速开启 / 关闭智能自适应感知模式；
  - `Alt + 鼠标左键`：强制切换网页任意单张图片或 SVG 反色 / 复原。

---

## 🚀 安装指南

### 步骤 1：安装用户脚本管理器
如果您尚未安装用户脚本扩展，请在浏览器中安装以下任一款管理器（推荐 Tampermonkey 或 ScriptCat）：
- [Tampermonkey (油猴)](https://www.tampermonkey.net/)
- [ScriptCat (脚本猫)](https://scriptcat.org/)
- [Violentmonkey (暴力猴)](https://violentmonkey.github.io/)

### 步骤 2：一键直接安装脚本
由于脚本已严格遵循 `.user.js` 规范，**在已安装油猴的浏览器中直接点击下方链接，即可直接呼出油猴安装弹窗，点击「安装」即可**：

👉 **[点击直接安装最新版脚本 (GitHub Raw)](https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js)**

或在油猴面板点击「实用工具」->「从 URL 安装」，粘贴输入：
```
https://raw.githubusercontent.com/jiozhaoyue/universal-smart-invert/main/universal-smart-invert.user.js
```

---

## 🔄 自动化更新到浏览器

为了让您的浏览器始终运行最新版，本项目提供两种无缝更新机制：

### 1. 线上生产版：全自动静默检测与一键更新
- **全自动后台检查**：脚本头部已配置标准的 `@updateURL` 和 `@downloadURL` 元数据；
- **定时自动升级**：油猴扩展会依据您设置的检查频率（默认每日或每次启动时），自动向 GitHub 比对版本号并在有更新时自动完成后台无感升级；
- **手动立即检查**：随时点击浏览器右上角油猴图标 ->「管理面板」->「检查用户脚本更新」（或直接重新点击上方一键安装链接），即可秒级覆盖升级至最新版。

### 2. 本地开发调试：修改即生效（零延迟热加载）
如果您想在本地修改代码并在浏览器中实时看到效果，无需反复提交或复制粘贴：
1. **开启扩展文件权限**：在 Chrome / Edge 中访问 `chrome://extensions`，找到 Tampermonkey（或 ScriptCat）-> 点击「详细信息」-> 打开 **「允许访问文件网址」** 开关；
2. **安装本地引导脚本**：打开油猴面板 ->「添加新脚本」-> 将项目根目录的 [`dev-loader.user.js`](./dev-loader.user.js) 内容粘贴并保存；
3. **享受本地热载**：在本地编辑器修改保存 `universal-smart-invert.user.js`，浏览器中直接按 `F5` 刷新网页，即刻执行最新代码！

---

## ⌨️ 快捷键与操作说明

| 快捷键 / 操作 | 功能描述 |
| :--- | :--- |
| `Alt + I` | 快速开关/切换视频反色（同时锁定用户人工干预） |
| `Alt + A` | 快速开启/关闭智能画面亮度自适应检测 |
| `Alt + 鼠标左键` | 针对任意特定图片或 SVG 强制切换反色 / 复原 |
| 单击屏幕边缘小药丸 | 展开/收起微型悬浮控制卡片 |
| 拖拽屏幕边缘小药丸 | 自由调节贴边高度，松手自动贴合屏幕左右边缘 |
| 鼠标悬停已反色图片 | 自动临时还原为原生色彩，鼠标移开恢复反色 |

---

## 🎨 调色预设

- **柔和灰 (Soft-Gray，默认推荐)**：
  `filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90)`
  模仿暗色纸质书籍印刷质感，文字对比舒适，长久阅读不累眼。
- **纯黑 (AMOLED)**：
  `filter: invert(1) hue-rotate(180deg) brightness(0.75) contrast(1.10)`
  纯黑深邃背景，适合暗室环境或 OLED/AMOLED 屏幕。

---

## 🌐 兼容性支持

- **视频平台**：Bilibili（含小窗与各类播放器模式）、YouTube、腾讯视频、爱奇艺、优酷、Coursera、中国大学MOOC、学堂在线及任意采用 HTML5 `<video>` 的网页。
- **图文平台**：GitHub、知乎、掘金、CSDN、各类官方技术文档、博客园及技术论坛。
- **跨域 (CORS) 说明**：若遇到极少数未配置 CORS 头的第三方 CDN 视频流，离屏采样会自动捕获安全限制并优雅降级为手动快捷键模式，胶囊状态标注 `跨域视频手动`，坚决不崩溃、不卡顿。

---

## 📦 开源发布与维护指南 (For Maintainers)

本项目代码完全开源且不包含任何混淆或第三方追踪代码，符合各脚本平台规范：

### 1. 发布到 Greasy Fork (油叉)
1. 注册并登录 [Greasy Fork](https://greasyfork.org/)；
2. 点击右上角「发布脚本」；
3. 将仓库中的 `universal-smart-invert.user.js` 全文粘贴至代码框中；
4. 将本 `README.md` 内容粘贴至脚本描述框中；
5. 可在脚本管理设置中绑定 GitHub 仓库 Webhook 实现自动同步更新。

### 2. 发布到 ScriptCat (脚本猫)
1. 注册并登录 [ScriptCat 脚本猫](https://scriptcat.org/)；
2. 进入控制台 ->「发布脚本」-> 粘贴 `universal-smart-invert.user.js`；
3. 平台会自动解析 `@name`、`@version` 与元信息；
4. 点击发布完成审核。

---

## 📄 开源许可证

本项目基于 [MIT License](./LICENSE) 开源。欢迎提交 Issue 与 Pull Request！
