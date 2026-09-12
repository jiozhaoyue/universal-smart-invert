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
| **当前版本** | 3.0.0 |
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

---

## 🌐 浏览器插件发布 (Extension)

v3.0 起项目同时维护 **油猴脚本（源头, canonical）** 与 **浏览器插件版（构建产物, derived）**。
插件版完全由脚本自动派生，全程 **零 npm 依赖**（纯 Node 内置模块）：

```bash
node scripts/gen-icons.js        # 纯 Node zlib + 手写 CRC32 的 PNG 写入器 → extension/icons/icon{16,32,48,128}.png
node scripts/build-extension.js  # 剥离 ==UserScript== 元数据 → extension/content.js (EXT_MODE 前奏 + GM 垫片 + 核心源码) + extension/manifest.json (MV3)
node scripts/pack.js             # 自研 stored-mode ZIP 打包器 → dist/universal-smart-invert-extension-v<版本>.zip (dist/ 已 gitignore, 绝不提交)
```

- 构建是 **确定且幂等** 的：相同源码产出逐字节相同的 content.js / manifest.json / zip；
- `manifest.json` 的 `name` / `version` / `description` 自动同步自脚本头部元数据（描述超 132 字符时按 Chrome 限制裁剪）；
- `manifest.json` 形态：MV3，`content_scripts` 匹配 `<all_urls>` + `file://*/*`、`document_end`、`all_frames`，权限仅 `["storage"]`，含 4 尺寸图标；
- 前奏垫片：`EXT_MODE`（wrapper 作用域，核心据此认领 owner kind `ext`）、`GM_xmlhttpRequest`（fetch 实现，blob/onload/onerror/ontimeout 契约与核心 gmFetchBlob 对齐）、`GM.xmlHttpRequest` 别名、`GM_addStyle`（style 元素）。存储无需垫片 —— 核心 Store 原生探测 `chrome.storage.sync`（含 sync 单条 8KB 配额分片、配额满自动降级 `chrome.storage.local`）。注意: MV3 内容脚本中的 `fetch` 不能绕过页面 CORS —— 跨域图片走脚本自带的优雅降级链, 与油猴 `GM_xmlhttpRequest` 可跨域的行为不同。

### 1. 本地安装与调试 (Load Unpacked)

1. 运行上面三条构建命令；
2. Chrome / Edge 打开 `chrome://extensions`，右上角开启 **开发者模式**；
3. 点击 **「加载已解压的扩展程序」**，选择仓库的 `extension/` 目录；
4. 需要 `file://` 反色时，在扩展详情页打开 **「允许访问文件网址」**（对应 manifest 的 `file://*/*` 匹配，与油猴的文件访问开关互不影响）；
5. 修改 `universal-smart-invert.user.js` 后重新运行 `node scripts/build-extension.js`，再刷新页面即可生效。

### 2. 油猴脚本与插件版如何共存 (休眠握手)

两者可同时安装，**先启动者认领页面**：

- 认领标记写入 `document.documentElement.dataset.sviOwner = '<us|ext>|<时间戳>'`，每 5 秒心跳续期；
- 后到者发现 **10 秒内的新鲜异类认领** → 自动休眠启动（`window.__svi = { dormant: true, version }`），不注入滤镜、不渲染 UI，杜绝双重反色；
- 认领方标签页关闭（心跳停止 >10s）后，另一方即可正常接管；
- 浏览器基准（`test-browser.js` 场景 12）使用真实构建产物以两种注入顺序验证了该握手（单所有者 + 恰好一个 UI 实例）。

### 3. 自动化发布 (GitHub Actions, tag 驱动)

- **CI（`.github/workflows/ci.yml`）**：push / PR → `node --check` → `node test.js` → 插件构建冒烟（manifest 合法、版本与 `@version` 一致、content.js 语法、zip 中央目录解析）→ 独立的 headless Chrome 基准 job（`test-browser.js`，**必需但独立成 job**，runner 问题不会污染单测结果，基准失败同样算失败）；
- **Release（`.github/workflows/release.yml`）**：推送 `v*` 标签 → 同样的测试与构建 → 打包 zip → 创建 GitHub Release 并上传 `dist/` 产物（zip + CRX（若配置了签名密钥））→ Chrome Web Store 上传 + 发布（仅当 CWS secrets 齐全）；
- **所有发布类 secret 均为可选**：缺失时对应步骤自动干净地跳过，Release 仍会正常发布 zip，**不会失败**。

### 4. 一次性配置: CRX 签名私钥 (可选)

```bash
openssl genrsa -out crx-private-key.pem 2048
```

1. 将 PEM 文件 **全文**（含 `BEGIN/END` 行）粘贴到仓库 `Settings → Secrets and variables → Actions → New repository secret`，命名 `CRX_PRIVATE_KEY`；
2. 该私钥决定 CRX3 签名与稳定的扩展 ID，**务必离线备份**，绝不提交进仓库；
3. CI 内步骤会把它写入 runner 临时 PEM 文件，用 `npx crx3 -p <临时PEM> -o dist/extension.crx extension/` 签名打包后立即删除。

### 5. 一次性配置: Chrome Web Store OAuth 凭据 (可选)

1. 打开 [Google Cloud 凭据页](https://console.developers.google.com/apis/credentials)，创建项目（如 `chrome-webstore-upload`）；
2. 按向导完成 OAuth consent screen（应用名 + 支持邮箱）；
3. **凭据 → 创建凭据 → OAuth 客户端 ID**，类型选 **桌面应用 (Desktop app)**，命名如 `Chrome Webstore Upload`，保存 `CLIENT_ID` 与 `CLIENT_SECRET`；
4. 在 [API 库](https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com) 启用 **Chrome Web Store API**；
5. 运行 `npx chrome-webstore-upload-keys`（本地起服务器处理 Google OAuth 回跳），用**发布该插件的 Google 账号**授权，获得 refresh token；
6. 先在 [Chrome Web Store 开发者后台](https://chrome.google.com/webstore/devconsole) 手动上传一次扩展（可直接上传 `dist/` 下的 zip），获得 **条目 ID**（32 位小写字母）；
7. 配置五个仓库 Secrets：`CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` / `CWS_PUBLISHER_ID` / `CWS_EXTENSION_ID`。
   - `CWS_PUBLISHER_ID`（发布者 ID）可在开发者后台 URL 中看到（`https://chrome.google.com/webstore/devconsole/<发布者ID>/...`），chrome-webstore-upload-cli 的文档将其列为必需环境变量；

### 6. 发布新版本

```bash
# 1) 更新 universal-smart-invert.user.js 头部 @version（如 3.0.1）—— manifest 版本由构建自动同步
# 2) 提交后打 tag 并推送:
git tag v3.0.1 && git push origin v3.0.1
# 3) Actions「Release」自动执行: 测试 → 构建 → zip → GitHub Release → (可选) CRX → (可选) CWS 上传 + 发布
```
