# 脚本发布与分发指南 (Greasy Fork & ScriptCat 发布手册)

本文档整理了发布到 **Greasy Fork (油叉)** 与 **ScriptCat (脚本猫)** 所需的全部元数据、推荐描述模板及自动化同步方案。

---

## 📑 一键复制元数据清单

### 1. 基本信息

| 字段 | 推荐内容 |
| :--- | :--- |
| **脚本名称 (中文)** | 全网通用智能视频与图片反色 |
| **脚本名称 (英文)** | Universal Smart Video & Image Invert |
| **开源协议** | MIT License |
| **当前版本** | 1.3.1 |
| **主页 / 源码仓库** | `https://github.com/jiozhaoyue/universal-smart-invert` |
| **Issue 反馈地址** | `https://github.com/jiozhaoyue/universal-smart-invert/issues` |
| **主代码文件** | `universal-smart-invert.user.js` |

### 2. 简短摘要 (Description)

- **中文简介** (适合复制到表单简介框)：
  > 全网通用智能HTML5视频与图片反色脚本。内置专属参数精细设置页（支持滑动条拖动与精确数值输入双向细调）；秒级/直接无渐变切换（全部可设置），极致性能优化识别在5ms内无感执行；精准识别主视频与小窗，不污染控制栏、弹幕与字幕；独创无对抗人机协同状态机；白底技术图自适应反色与悬停显原图；极简胶囊与快捷键。

- **英文简介** (English Description)：
  > Universal HTML5 smart video and image invert userscript. Features dedicated fine-tuning settings modal with draggable sliders and numeric inputs; instant direct switch without transition; sub-5ms imperceptible recognition; accurately targets video & PiP without polluting controls/danmaku/subtitles; non-conflicting HIL state machine; auto-inverts web diagrams with hover-to-restore; minimalist capsule & shortcuts.

---

## 🚀 平台发布操作步骤

### 方案 A：发布至 Greasy Fork (油叉)

1. **登录账号**：访问 [Greasy Fork](https://greasyfork.org/) 并登录；
2. **新建脚本**：点击用户菜单中的 **「发布新脚本」** (Post a script)；
3. **录入代码**：
   - 将项目中的 [`universal-smart-invert.user.js`](./universal-smart-invert.user.js) **完整内容** 复制粘贴到代码输入框；
   - Greasy Fork 会自动解析头部元信息（名称、版本、许可、图标等）；
4. **填充描述详情**：
   - 切换到描述（Description）编辑器，切换为 **Markdown** 模式；
   - 复制项目根目录的 [`README.md`](./README.md) 全文粘贴进去；
5. **设置自动同步 (强烈推荐 GitHub Webhook)**：
   - 脚本创建成功后，进入脚本管理页 ->「脚本设置」->「通过 Webhook 自动从外部仓库同步」；
   - 按照页面提示，在 GitHub 仓库设置 `Settings` -> `Webhooks` 中添加 Greasy Fork 提供的 Webhook URL；
   - 之后只要你在 GitHub 仓库更新并打 Tag 或推送 `main` 分支，Greasy Fork 会**自动同步发布新版本**！

---

### 方案 B：发布至 ScriptCat (脚本猫)

1. **登录账号**：访问 [ScriptCat 脚本猫官网](https://scriptcat.org/) 并登录；
2. **发布脚本**：
   - 点击右上角进入「控制台」；
   - 点击「发布脚本」；
   - 选择「源码发布」；
3. **录入代码**：
   - 粘贴 [`universal-smart-invert.user.js`](./universal-smart-invert.user.js) 源码；
   - 平台会自动识别 `@connect *` 和 `@grant` 权限；
4. **关联仓库同步 (GitHub Sync)**：
   - 在脚本设置中开启「GitHub 同步」；
   - 仓库地址填写：`https://github.com/jiozhaoyue/universal-smart-invert`；
   - 同步路径填写：`universal-smart-invert.user.js`；
   - 以后直接在 GitHub 维护代码，脚本猫会自动定时拉取更新。

---

## 🔒 平台合规与审核要点

1. **无外部危险依赖**：本脚本采用 100% 原生纯 JavaScript 编写，不引用任何未经审核的第三方外部 CDN 库（无需担心 Greasy Fork 针对外链脚本的拦截限制）；
2. **无混淆压缩**：代码结构清晰、包含详尽的模块注释与函数说明，完全符合 Greasy Fork「禁止代码混淆」规定；
3. **关于 `@connect *` 声明**：
   - 脚本中声明 `@connect *` 仅用于通过 `GM_xmlhttpRequest` 加载跨域图片二进制 Blob 以进行白底检测（绕过第三方图床 Canvas 污染）；
   - 若审核员询问，可直接告知：用于知乎、B站、GitHub 等多域名图片跨域 CORS 白底像素提取，无任何用户数据回传。
