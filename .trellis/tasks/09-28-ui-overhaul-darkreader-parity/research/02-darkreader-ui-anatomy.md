# 02 · Dark Reader UI 逆向解剖（可照搬基准）

> 任务：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity`
> 角色：Dark Reader UI 逆向解剖员（只读；本报告为唯一产出）
> 日期：2026-09-28　　**上游版本：`darkreader/darkreader` v4.9.133（MIT）；UI 源码取自 GitHub tag `v4.9.133` 的 `src/ui/`**
> 结论先行：本仓照搬的只有**颜色**（token 块逐值对齐了 DR 的 `theme.less`），**控件形态一律没搬** ——
> DR 的开关是两个带文字的半块、复选框是斜线对勾方块、下拉/滑块/数值/取色**全部自绘、全部直角、全部 2px 描边**；
> 本仓这些位置用的仍是**原生表单控件**（`<input type=checkbox/range/number/color>`、`<select>`）+ iOS 风格药丸开关 + 8~12px 圆角。
> 这就是「token 对齐了、观感仍不像」的根因。

---

## ① 上游来源与版本（含取源方式与本地缓存）

### 1.1 定源结论

| 项 | 值 | 证据 |
| :-- | :-- | :-- |
| 上游仓库 | `https://github.com/darkreader/darkreader` | `scripts/sync-darkreader.js:17` `const REPO = 'darkreader/darkreader'`；`vendor/darkreader/PROVENANCE.md:17` |
| 许可 | MIT（`© Dark Reader Ltd.`） | `vendor/darkreader/PROVENANCE.md:17`；`vendor/darkreader/LICENSE` |
| **引擎** 版本 | **4.9.133**，冻结日期 2026-09-27 | `vendor/darkreader/PROVENANCE.md:19,24` |
| 引擎 取源 | npm 官方发布包 `registry.npmjs.org/darkreader/-/darkreader-4.9.133.tgz` → 解包取 `package/darkreader.js` | `scripts/vendor-darkreader.js:25,176-196` |
| 引擎 校验 | SHA-256 + 字节数对照 `PROVENANCE.md` 表；不符即拒绝 | `scripts/vendor-darkreader.js:53-70`，已接入 `test.js` 门禁 |
| **UI 源码**（本次解剖对象） | GitHub raw，tag `v4.9.133`，路径前缀 `src/ui/` | 本次实测 `https://raw.githubusercontent.com/darkreader/darkreader/v4.9.133/src/ui/...` |
| 站点规则种子 取源 | `raw.githubusercontent.com/darkreader/darkreader/main/src/config/{dark-sites,inversion-fixes}.config` | `scripts/sync-darkreader.js:19-22,72` |
| 另一个上游概念 | `branch main`（跟随式，仅用于规则种子） | 同上 |

### 1.2 **本地缓存副本的边界（重要）**

- `vendor/darkreader/darkreader.js`（355 381 字节，UMD）**只含引擎，不含扩展外壳** ——
  原文明确：「本目录只放**引擎**，不含 Dark Reader 的扩展外壳（popup / options / 图标 / 站点修复表）」
  （`vendor/darkreader/PROVENANCE.md:11`）。
- 实测 `grep -c 'type="color"' vendor/darkreader/darkreader.js` → **0**（引擎里确无 UI）。
- 因此**本机没有任何 DR 的 UI 源码缓存**；本节全部 UI 结论均来自 GitHub tag `v4.9.133` 的 `src/ui/` 原始文件。
- 复现命令（本报告用过的两种通道，任一可用；GitHub 偶发 schannel 瞬断，重试即可）：
  ```bash
  gh api "repos/darkreader/darkreader/contents/src/ui/popup/components/body.tsx?ref=v4.9.133" \
        -H "Accept: application/vnd.github.raw"
  curl -sSLf -A dr-anatomy \
        "https://raw.githubusercontent.com/darkreader/darkreader/v4.9.133/src/ui/theme.less"
  ```

### 1.3 上游 `src/ui/` 顶层结构（照搬时的地图）

```
src/ui/
├── theme.less          ← 全部颜色 + 度量变量的唯一定义（本仓 token 块的原始对照物）
├── shared.less         ← html/body 基样式、选择色、滚动条、@font-face(Open Sans TTF)
├── controls/           ← 20 个控件，每个一目录（xxx/index.tsx + xxx/style.less）
│   ├── style.less      ← 汇总 import 全部控件样式
│   ├── button/ checkbox/ check-button/ color-picker/ color-dropdown/
│   ├── control-group/ dropdown/ message-box/ multi-switch/ nav-button/
│   ├── overlay/ reset-button/ select/ shortcut/ slider/ tab-panel/
│   ├── text-list/ textbox/ time-range-picker/ toggle/ updown/ virtual-scroll/
├── popup/              ← 浏览器工具栏弹窗（本报告主体）
│   ├── index.tsx       ← 入口（渲染 Body）
│   ├── style.less      ← popup 尺寸(15rem×30rem) + body 2px 白框 + footer
│   ├── body/ (index.tsx, style.less)   ← “新版”设计（previewNewDesign / mobile）
│   ├── main-page/      ← 新版首页：AppSwitch/SiteToggleGroup/ThemeGroup/HelpGroup
│   ├── theme/          ← 主题控件：preset-picker / controls(Brightness|Contrast|Scheme|Mode) / page
│   ├── components/     ← header / filter-settings / site-list-settings / more-settings /
│   │                      custom-settings-toggle / engine-switch / font-settings / loader / news
│   ├── news-section/ page-viewer/
├── options/            ← 扩展设置全页（7 页签：General/Site List/Automation/Hotkeys/Activation/Advanced/About）
│   └── body/body.tsx   ← 页签清单真源
├── icons/              ← 图标：SVG，以 background-image:url(...) 引用
├── assets/             ← images/ 与 fonts/OpenSans-{Regular,SemiBold,Light}.ttf
├── devtools/           ← DevTools 面板（与 popup 无关，此处列全以备查）
└── stylesheet-editor/
```

> **页面内没有 DR 的 UI。** `src/inject/` 实测仅 `cache.ts / color-scheme-watcher.ts / detector.ts /
> dynamic-theme/ / fallback.ts / index.ts / style.ts / svg-filter.ts / utils/` —— 全是引擎，**零 UI 节点**。
> DR 与页面交互只有 4 条通道：popup、右键菜单、快捷键、DevTools 面板。**没有页内悬浮按钮/胶囊。**

---

## ② popup 信息架构表（页签 / 控件 / 默认值）

### 2.1 骨架（`popup/components/body.tsx`）

```
body.ext-disabled?  +  body.ext-tall?
├── Header                       ← 常驻，不在页签内
│   ├── logo（链接到官网）
│   ├── header__site-toggle
│   │   ├── SiteToggle  <Button>  =  ✓勾选标 + 主机名（www. 去掉；PDF 显示 “PDF”）
│   │   └── header__more-settings-button（齿轮图标 + 文案，点开“本站更多设置”下滑面板）
│   ├── header__app-toggle
│   │   ├── Toggle  标签 = On / Off  ← 总开关
│   │   ├── header__more-settings-button（齿轮图标 + 自动化文案，点开“总开关更多设置”下滑面板）
│   │   └── header__app-toggle__time  圆形小徽标（时/分/系统图标，自动化激活时才显示）
├── TabPanel   tabs = { Filter, Site list, More }   ← Thunderbird 构建只有 { Filter, More }
│   （tabLabels 来自 getLocalMessage: filter / site_list / more）
├── div.mobile-link-container（移动版入口，桌面 CSS 里 display:none）
├── footer → footer-buttons: [Help 链接] [News 按钮] [Mobile links 按钮]
├── NewsGroup（新闻抽屉，750ms 后自动滑入）
└── MoreSiteSettings / MoreToggleSettings（两个下滑覆盖面板，见 §5.2）
```

### 2.2 三个页签的控件清单与默认值

#### 页签 A = **Filter**（`popup/components/filter-settings/index.tsx`）

| 顺序 | 控件 | 形态 | 取值 / 默认 |
| :-- | :-- | :-- | :-- |
| 1 | **Mode** | `Button`(月亮图标) + `Toggle`(Dark/Light) + `Button`(太阳图标) + 下方 label「Mode」 | `mode` 1=dark **默认 1(dark)** / 0=light |
| 2 | **Brightness** | `UpDown`（− 按钮 + 带填充 track + ＋ 按钮） | 50–150 step 5 **默认 100** |
| 3 | **Contrast** | `UpDown` | 50–150 step 5 **默认 100** |
| 4 | **Sepia** | `UpDown` | 0–100 step 5 **默认 0** |
| 5 | **Grayscale** | `UpDown` | 0–100 step 5 **默认 0** |
| 6 | **CustomSettingsToggle** | 开关（“仅本站使用自定义设置”一类） | — |
| 7 | `filter-settings__content` | 子插槽（Plus 版会塞升级横幅 “See all options” 等） | — |

#### 页签 B = **Site list**（`popup/components/site-list-settings/index.tsx`）

| 顺序 | 控件 | 形态 | 默认 |
| :-- | :-- | :-- | :-- |
| 1 | 名单模式开关 | `Toggle` 标签 = 「Invert listed only」/「Not invert listed」 | 绑 `enabledByDefault`（取反） |
| 2 | 站点名单 | `TextList`（多行文本列表，带虚拟滚动） | placeholder `google.com/maps`；写 `disabledFor` 或 `enabledFor` |
| 3 | 加入快捷键 | `Shortcut`（`commandName="addSite"`） | 未设时提示“设置加入站点快捷键” |

#### 页签 C = **More**（`popup/components/more-settings/index.tsx`）

分区（`more-settings__section`，**不是卡片，是竖排 section**，section 间距 = `@indent-large` .75rem）：

| 顺序 | 内容 | 形态 |
| :-- | :-- | :-- |
| 1 | **FontSettings**（字体 / 字体列表） | 下拉 + 开关组合 |
| 2 | **EngineSwitch**（dynamic / static / off） | 分段开关 |
| 3 | **CustomSettingsToggle** + 说明行 | 开关 + 居中 `.more-settings__description`（受保护页/暗名单时该行转为 `--warning` 橙字） |
| 4 | `ChangeBrowserTheme`（**仅 Firefox**） | Toggle + 说明 |
| 5 | **All settings** 大按钮 | `Button` + 齿轮图标，`openExtensionPage('options')` 打开全页设置 |

### 2.3 新版（`previewNewDesign` / mobile）信息架构 —— 与本仓最相关的对照

`popup/main-page/index.tsx` + `theme-group.tsx`：

```
MainPage
├── section.m-section → SwitchGroup = AppSwitch（总开关+描述）+ SiteToggleGroup（本站开关+描述）
├── section.m-section → ThemeGroup
│   ├── theme-group__presets-wrapper → ThemePresetPicker（下拉）
│   ├── theme-group__controls-wrapper → ThemeControls{Brightness, Contrast, Scheme(dark/light), Mode(engine)}
│   │                                  + Button「See all options」
│   └── label.theme-group__description「Configure theme」
└── section.m-section → SettingsNavButton（齿轮 + “Settings”）+ HelpGroup
```

### 2.4 主题与预设选择器（`popup/theme/preset-picker/index.tsx`）

一个 **`DropDown`**，选项固定顺序：

| 选项 id | 文案 | 说明 |
| :-- | :-- | :-- |
| `default` | `Theme for all websites` | 全局主题 |
| 各 preset.id | `preset.name`（选中项只显示名字） | 未选中的项渲染成 `PresetItem` = 名字 + **右侧 `×` 删除钮**（`::after content:"\2715"`），点 `×` 弹 `MessageBox`「Are you sure you want to remove …?」 |
| `add-preset` | `＋ Create new theme` | 仅当 `presets.length < 3`（`MAX_ALLOWED_PRESETS = 3`）时出现 |
| `custom` | `★ Theme for <host>` / `☆ Theme for <host>` | 本站自定义主题；★=当前选中 |

**语义**：preset = `{id, name, urls[], theme}`，把一套主题**按 URL 绑定**；`custom` = 单站主题覆盖。
（本仓的“预设”是**配色预设**，语义不同，见 §6「需改造」。）

### 2.5 options 全页页签（`options/body/body.tsx`）

左侧竖排按钮 + 右侧内容面板（`options/tab-panel/tab-panel.less`，`__buttons min-width:10rem`；
窄屏 <30rem 自动转横向）。**7 个页签**（每个带图标）：

`general(General)` · `site-list(Site List)` · `automation(Automation)` · `hotkeys(Hotkeys)` ·
`activation(Activation)` · `advanced(Advanced)` · `about(About)`

`GeneralTab` 内容 = `EnabledByDefault` + `DetectDarkTheme` + (`EnableForPDF` | Firefox 时 `ChangeBrowserTheme`)。

### 2.6 设置分组方式（直接回答「卡片/折叠/分区标题」）

| 机制 | DR 的做法 | 出处 |
| :-- | :-- | :-- |
| 分组容器 | **`more-settings__section`**（竖排、无边框、无卡片背景；`&:not(:first-child){margin-top:@indent-large}`） | `popup/components/more-settings/style.less:27-35` |
| 控件 + 描述 | **`control-group`** = 控件（高 `2*@size-border+@size-control-inner`）+ 居中 `.small` 描述 | `controls/control-group/control-group.less` |
| 分区标题 | popup 里**没有分区标题**，只有**居中小字描述**（`.more-settings__description`，`.625rem`） | 同上 |
| 折叠 | 不用 `<details>`；「More」是**从 header 下滑的覆盖面板**（不是折叠区），带 `×` 关闭 | `header/style.less:103-212` |
| 卡片 | **无卡片**。DR 全 UI 无“圆角卡片 + 阴影”词汇；层次靠 **2px 描边**与 `@indent-*` 间距 | 全局 |
| 选项页 | `TabPanel.Tab` + 每 tab 内一串 `control-group` | `options/body/body.tsx` |

> 对照：本仓 `SviControls.group(title, desc, id)` 造的是「带标题+描述的圆角卡片」；
> popup.html 用 `.power-row`（12px 圆角卡片）、`.chip`（10px 圆角）—— **形态与 DR 相反**。

---

## ③ 视觉规格与 token 清单（逐值）

### 3.1 DR 变量表（`src/ui/theme.less` 全文，44 行，逐值照录）

```less
// —— 颜色 ——
@color-back: #141e24;                    // 底色
@color-fore: #53a1b3;                    // 前景/主强调
@color-control-back: #141e24;            // 控件底
@color-control-hover: #193945;           // 控件悬停
@color-control-active: #316e7d;          // 控件激活
@color-control-fore: #ffffff;            // 控件前景（★ 纯白）
@color-control-fore-inactive: #316e7d;   // 控件前景-未激活
@color-input-back: #141e24;
@color-input-hover: #193945;
@color-input-active: #193945;
@color-input-fore: #53a1b3;
@color-input-fore-active: #ffffff;
@color-input-fore-placeholder: #316e7d;
@color-border: #316e7d;
@color-heading: #e96c4c;                 // 标题/警告（橙）
@color-error: #db4245;
@color-ok: #317c4e;
@color-ok-fore: #3bc077;                 // ★ 亮绿（本仓无对应 token）
@color-selection-back: #e96c4c;          // ★ 选区底（本仓无对应 token）
@color-selection-fore: #ffffff;          // ★ 选区字（本仓无对应 token）

// —— 字体 ——
@font-family: Open Sans, Segoe UI, Helvetica Neue, Ubuntu, sans-serif;   // ★ 自带 Open Sans TTF

// —— 度量 ——
@size-border: 0.125rem;            // 2px  ← 全 UI 的描边粗细
@size-border-inner: 0.0625rem;     // 1px  ← 内部分隔线
@size-control-inner: 1.5rem;       // 24px ← 控件标准高度
@size-control-description: 0.75rem;
@size-scrollbar-padding: 0.25rem;
@size-scrollbar-thickness: 0.75rem;
@size-text-normal: 0.75rem;        // 12px
@size-text-normal-height: 1rem;    // 16px
@size-text-small: 0.625rem;        // 10px
@size-text-small-height: 0.875rem; // 14px
@size-text-large: 0.875rem;        // 14px
@size-text-large-height: 1rem;
@indent-large: 0.75rem;            // 12px
@indent-small: 0.5rem;             // 8px
@time-fast: 125ms;
@time-slow: 250ms;
```

### 3.2 **无圆角**是 DR 的硬特征

全 `src/ui/**/*.less` 里 **没有一条 `border-radius` 用于方形控件**；唯一的圆角是**圆形**语义：
`border-radius: 50%` —— 圆形自查标（`popup/theme/preset-picker__remove-button` 是方形）、
`header__app-toggle__time` 圆形徽标、`footer-help-link::before` 圆形 “?”、`mobile-link__icon` 0.4375rem。
**按钮 / 输入框 / 下拉 / 滑块 / 复选 / 开关 / 面板 全部直角。**

### 3.3 控件视觉规格（逐个）

| 控件 | 尺寸 | 底 / 边 | 状态色 | 关键实现 | 出处 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **Button** | 高 `1.5rem`，`min-width:1.5rem`，`content-box` | 底 `#141e24`，边 `2px #316e7d`，**直角** | hover 底 `#193945`（125ms）；active 底 `#316e7d` | 文字 `#ffffff`；过渡 `@time-slow`→hover 提速 `@time-fast` | `controls/button/style.less` |
| **Toggle**（开关） | 高 `1.5rem`，两半各 `width:50%` | 底 `#141e24`，边 `2px #316e7d`，`content-box` | `::before` 滑块 底 `#316e7d`、宽 50%、`left:50%` → checked 时 `left:0`，过渡 `left 125ms`；半块 hover（非激活）底 `#193945` | **是带文字的两个半块**（`labelOn/labelOff` 常为 On/Off 或 Dark/Light），**不是药丸旋钮** | `controls/toggle/{index.tsx,style.less}` |
| **CheckBox** | `1.5rem × 1.5rem` 方框 | 底 `#141e24`，边 `2px #316e7d`，`content-box` | 对勾 `::before/::after` 两条：`skewY(±45deg)`、高 `1.5*0.125=.1875rem`、宽 `.75*1.5=1.125rem`、色 `#316e7d`(未选)→`#ffffff`(选中)；选中时两段长度/位置改写 | **原生 `<input>` 被 `display:none` 隐藏**，视觉全自绘；hover 底 `#193945` | `controls/checkbox/{index.tsx,style.less}` |
| **Select**（下拉） | 行高 `1.5rem` | `TextBox` + `Button`(chevron) 两段拼成，中间无边框（`border-right:none` / `border-left:none`） | 列表底 `#141e24`、左右下 `2px #316e7d`（**无上边框**）、`max-height:0`→`12rem`、过渡 `@time-fast`/展开 `@time-slow*2` | **自绘**（`TextBox` + `Button` + 绝对定位列表 + 虚拟滚动）；选项高 `1.5rem`，hover `#193945`；**没有原生 `<select>`** | `controls/select/{index.tsx,style.less}` |
| **DropDown** | 高 `1.5rem`；选中项高 `1.25rem`（展开时 `1.5rem`） | 选中项底 `#316e7d`、右侧 chevron 图标 `background-size:1rem`、`right .25rem`；列表底 `#141e24`、边 `2px #316e7d`（无上边框）、`box-shadow:0 0 .25rem black` | 选项 `min-height:1.25rem`→展开 `1.5rem`，hover `#193945` | 自绘，无原生 | `controls/dropdown/style.less` |
| **Slider**（滑块） | 容器高 `1.5rem`；轨道 `.625rem`（激活 `.75rem`）；游标宽 `.5rem`、高 `1.25rem`（激活 `1.5rem`） | 轨道底 `#193945`(`@color-control-hover`)，填充底 `#316e7d`；游标底 `#ffffff` | 激活时游标 `box-shadow:0 0 .25rem black` | **纯 div + 指针事件 + 滚轮**（`onPointerDown`/`wheel`）；数值标签贴游标、`>75%` 时翻到左侧 | `controls/slider/{index.tsx,style.less}` |
| **UpDown**（数值） | 一行 = `Button(−)` + `track` + `Button(＋)`，间距 `@indent-small` | `track` 底 `#141e24`、边 `2px #316e7d`、高 `1.5rem` | 填充 `track__value` 底 `#316e7d`、`transition:width 125ms`；track hover `#193945`；禁用时按钮图标 `::before/::after` 变 `#316e7d` | **没有原生 number 框**；上下箭头由两条 `skewX(±45°)` 细条拼出 | `controls/updown/{index.tsx,style.less}` |
| **TextBox**（输入） | 高 `1.5rem`，`content-box`，`text-indent:(1.5-.75)/2=.375rem` | 底 `#141e24`，边 `2px #316e7d` | hover/focus 底 `#193945`(125ms)；focus 字 `#ffffff`；placeholder `#316e7d` | 真 `<input type=text>`（唯一用原生 input 的控件） | `controls/textbox/style.less` |
| **ColorPicker** | 容器高 `1.5rem`；输入高 `1.25rem`；预览/重置图标 `1rem` | wrapper 底 `#141e24`；**hex 输入框底 `#316e7d`、白字、居中**；聚焦时 wrapper 加 `2px #316e7d` 边 | 预览块 `1rem` 方形（`style.backgroundColor` 直写）；重置图标 = `@icon-reset` | **= `TextBox`(hex 文本) + 预览块 + 重置钮 + 自绘 HSB 面板**（`.color-picker__hsb-line` 默认 `display:none`，聚焦才 `display:block`）。**全程无 `<input type="color">`、无 OS 取色对话框** | `controls/color-picker/{index.tsx,style.less}` + `controls/color-picker/hsb-picker/` |
| **ColorDropDown** | 同 DropDown + ColorPicker | — | — | 选项 = `Default / Auto / Custom`；选 `custom` 时把 `colorSuggestion` 写入并**自动聚焦** `ColorPicker`（`ColorPicker.focus(node)`） | `controls/color-dropdown/index.tsx` |
| **MultiSwitch** | 高 `1.5rem`，选项各 `width:50%` | 底 `#141e24`，边 `2px #316e7d` | `__highlight` 底 `#316e7d`、`transition:left/width 125ms`；选项 hover（未选）`#193945` | 与 Toggle 同族（滑动高亮块） | `controls/multi-switch/style.less` |
| **TabPanel**（popup 页签） | 按钮高 `1.5rem + 2px`，字号 `.875rem` 粗体 | 未选：**只有下边框** `2px #316e7d`，字色 `#316e7d`；选中：**四边 2px #316e7d、去掉下边框**，字色 `#e96c4c`(橙) | `:active` 底 `#193945` | 方形按钮；两侧 `::before/::after` 用下边框补齐成横线（打字机凸起感）；tab 内容宽度/透明度过渡 `250ms` | `controls/tab-panel/style.less` |
| **Overlay** | 铺满 | 底 `rgba(20,30,36,.5)`（`fade(@color-back,50%)`） | — | `position:fixed`，`:empty` 时隐藏 | `controls/overlay/style.less` |
| **MessageBox** | padding `.75rem` | 底 `#141e24`，上/下 `2px #316e7d` | 按钮 `min-width:4rem`，间距 `@indent-small`，OK 钮边框 gray | 标题居中 | `controls/message-box/style.less` |
| **ControlGroup** | 控件高 `2*2px + 1.5rem` | — | — | 控件 + 居中 `.625rem` 描述（**DR 的主要“分组”词汇**） | `controls/control-group/control-group.less` |
| **Shortcut** | `.625rem` 小字 | 色 `#53a1b3`；编辑态 `#ffffff` | hover 下划线 | `::before content:"✎"`（铅笔字形，非 emoji） | `controls/shortcut/style.less` |
| **NavButton** | 同 Button，全宽(-2*2px) | 右侧 chevron 图标 `1rem` | — | 「Settings」按钮即此控件 | `controls/nav-button/style.less` |
| **CheckButton / ResetButton / TextList / TimeRangePicker** | — | — | — | 其余 4 个控件（本报告未展开） | `controls/*` |

### 3.4 全局基样式（`shared.less` + `popup/style.less`）

| 项 | 值 |
| :-- | :-- |
| `html` | `background-color:#141e24; color:#53a1b3; color-scheme:dark; font-family:@font-family; font-size:16px` |
| `body` | `font-size:.75rem`（12px） |
| `input, button` | `font-family:@font-family; font-size:.75rem` |
| 选区 | 底 `#e96c4c`，字 `#ffffff` |
| 滚动条 | 宽 `.75rem`，thumb `#193945` → hover `mix(hover,active,50%)` → active `#316e7d`；`scrollbar-color:@color-control-hover @color-back` |
| **字体** | `@font-face 'Open Sans'` × 3（Regular / SemiBold / Light，`src/assets/fonts/*.ttf`）+ 回退 `Segoe UI, Helvetica Neue, Ubuntu, sans-serif` |
| **popup 尺寸** | 内容 `15rem × 30rem`（240×480）+ `padding:1rem`；`.ext-tall` 与 Plus 版 +4rem（30rem→34rem） |
| **popup 外框** | `body { border: 2px solid white; }`（为跨平台统一边框，`preview` 模式下边色改为 `mix(@color-back,@color-control-fore)`） |
| **html 宽度** | `calc(15rem + 2*1rem + 4px)`（含外框） |

---

## ④ 与本仓 token 块的差异表

本仓真源：`universal-smart-invert.user.js:3909–3964`（`/* v6.4-TOKENS-START */` … `/* v6.4-TOKENS-END */`）。
规范：`.trellis/spec/frontend/ui-design-tokens.md`（本仓 UI 唯一权威）。
**测试把关**：`test.js` 逐字节比对三处 token 块 + 「token 块之外不得出现颜色字面量」。

### 4.1 颜色角色（已有 / 缺失 / 取值不同）

| DR 变量 | DR 值 | 本仓 token | 本仓值 | 判定 |
| :-- | :-- | :-- | :-- | :-- |
| `@color-back` | `#141e24` | `--svi-bg` | `#141e24` | ✅ 一致 |
| `@color-fore` | `#53a1b3` | `--svi-fg` | `#53a1b3` | ✅ 一致 |
| `@color-control-back` | `#141e24` | `--svi-ctl-bg` | `#141e24` | ✅ 一致 |
| `@color-control-hover` | `#193945` | `--svi-ctl-hover` | `#193945` | ✅ 一致 |
| `@color-control-active` | `#316e7d` | `--svi-ctl-active` | `#316e7d` | ✅ 一致 |
| `@color-border` | `#316e7d` | `--svi-border` | `#316e7d` | ✅ 一致 |
| `@color-input-back` | `#141e24` | （复用 `--svi-bg`） | — | ⚠️ 取值等价但**无独立 token** |
| `@color-input-hover` | `#193945` | （复用 `--svi-ctl-hover`） | — | ⚠️ 无独立 token（DR 与 control-hover 同值，可接受） |
| `@color-input-active` | `#193945` | （复用 `--svi-ctl-hover`） | — | ⚠️ 无独立 token |
| `@color-input-fore` | `#53a1b3` | `--svi-input-fg` | `#53a1b3` | ✅ 一致 |
| `@color-input-fore-active` | `#ffffff` | `--svi-input-active` | `#ffffff` | ✅ 一致 |
| `@color-input-fore-placeholder` | `#316e7d` | `--svi-input-ph` | `#316e7d` | ✅ 一致 |
| `@color-heading` | `#e96c4c` | `--svi-title` | `#e96c4c` | ✅ 一致（**但用途不同**：DR 用它做页签激活色/警示文字，本仓只当“标题/警告”） |
| `@color-error` | `#db4245` | `--svi-error` | `#db4245` | ✅ 一致 |
| `@color-ok` | `#317c4e` | `--svi-success` | `#317c4e` | ✅ 一致 |
| **`@color-control-fore`** | **`#ffffff`** | ❌ **缺失**（本仓用 `--svi-text-strong #e8f4f6` 当控件字色） | — | ❌ **缺失 + 取值不同**：DR 控件文字是纯白 `#ffffff`，本仓是 `#e8f4f6` → **按钮/开关/下拉的字色偏差可见** |
| **`@color-control-fore-inactive`** | **`#316e7d`** | （借用 `--svi-ctl-active #316e7d`） | — | ⚠️ 值相同但**语义 token 缺失**（未选态字色） |
| **`@color-ok-fore`** | **`#3bc077`** | ❌ 缺失；本仓自造 `--svi-success-bright #5fbf8a` | — | ❌ **取值不同**（DR 的“开”态描述字色是亮绿 `#3bc077`） |
| **`@color-selection-back`** | **`#e96c4c`** | ❌ **缺失** | — | ❌ 缺失（本仓未定义选区色） |
| **`@color-selection-fore`** | **`#ffffff`** | ❌ **缺失** | — | ❌ 缺失 |

### 4.2 本仓**多出**（DR 无）的 token —— 这些是「照搬不彻底」的痕迹

| 本仓 token | 值 | 说明 |
| :-- | :-- | :-- |
| `--svi-bg-deep` | `#0f161b` | DR 没有“更深一层底”；DR 用 `fadeout(@color-back,10%)` 表达浮层 |
| `--svi-text-strong` | `#e8f4f6` | **DR 无此色**（对应位置 DR 用 `#ffffff`） |
| `--svi-text-dim` | `#6f9aa6` | DR 无（同上，DR 用 `#316e7d` 或 `#53a1b3`） |
| `--svi-success-bright` | `#5fbf8a` | 对应 DR `@color-ok-fore #3bc077` —— **值不同** |
| `--svi-error-bright` | `#e8756f` | DR 无（DR 只有 `#db4245`） |
| `--svi-scrim` | `rgba(10,15,18,.72)` | DR 的 Overlay 是 `rgba(20,30,36,.5)` —— **值不同** |
| `--svi-outline` | `rgba(83,161,179,.35)` | DR 无 focus ring 变量（用 `:focus` 底变 `#193945` + 字变白） |
| `--svi-*-rgb` × 8 | 三元组 | DR 不需要（LESS 里 `fade()/mix()` 直接算） |
| **`--svi-r-sm/.375/.75rem`** | `.25/.375/.75rem` | ❌ **DR 全 UI 无圆角** —— 本仓把圆角做成了 token，方向与 DR 相反 |
| `--svi-fs-lg` | `.875rem` | 对应 DR `@size-text-large`（同值，命名不同） |

### 4.3 度量 token 对照

| DR 变量 | DR 值 | 本仓 token | 本仓值 | 判定 |
| :-- | :-- | :-- | :-- | :-- |
| `@size-border` | `.125rem` | `--svi-border-w` | `.125rem` | ✅ |
| `@size-border-inner` | `.0625rem` | ❌ 无 | — | ❌ 缺失（DR 内部分隔线用 1px，本仓无处可用） |
| `@size-control-inner` | `1.5rem` | `--svi-ctl-h` | `1.5rem` | ✅ |
| `@size-control-description` | `.75rem` | ❌ 无 | — | ❌ 缺失 |
| `@size-scrollbar-thickness` | `.75rem` | ❌ 无（本仓 `::-webkit-scrollbar` 手写 `8px`） | — | ❌ 缺失 |
| `@size-scrollbar-padding` | `.25rem` | ❌ 无 | — | ❌ 缺失 |
| `@size-text-small(-height)` | `.625rem` / `.875rem` | `--svi-fs-sm` / `--svi-lh-sm` | `.625rem` / `.875rem` | ✅ |
| `@size-text-normal(-height)` | `.75rem` / `1rem` | `--svi-fs` / `--svi-lh` | `.75rem` / `1rem` | ✅ |
| `@size-text-large(-height)` | `.875rem` / `1rem` | `--svi-fs-lg` / ❌ `--svi-lh-lg` 无 | `.875rem` / — | ⚠️ 行高缺失 |
| `@indent-large` | `.75rem` | `--svi-gap` | `.75rem` | ✅（命名不同） |
| `@indent-small` | `.5rem` | `--svi-gap-sm` | `.5rem` | ✅（命名不同） |
| `@time-fast` | `125ms` | `--svi-tr-fast` | `125ms` | ✅ |
| `@time-slow` | `250ms` | `--svi-tr-slow` | `250ms` | ✅ |
| **`@font-family`** | **`Open Sans, Segoe UI, …`** | ❌ **无 token**；面板手写 `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif` | — | ❌ **缺失 + 取值不同**（DR 自带 Open Sans TTF；本仓用系统栈，字形不同） |

### 4.4 差异小结（给实现者的“最小对齐集”）

1. **补 4 个 DR 颜色 token**：`--svi-ctl-fg:#ffffff`、`--svi-ctl-fg-off:#316e7d`、`--svi-ok-fg:#3bc077`、`--svi-selection-bg:#e96c4c`（+ `--svi-selection-fg:#ffffff`）。
2. **补 1 个度量**：`--svi-border-w-inner:.0625rem`。
3. **圆角要“反向”改**：控件类保留直角；`--svi-r*` 只留给模态外框/滚动条，不要在按钮/输入框/下拉/开关上使用。
4. **控件字色从 `--svi-text-strong` 改回 DR 的 `#ffffff`**（或明确：本仓更高对比是刻意偏离，需用户在 PRD 里拍板）。
5. **字体**：是否要 Open Sans 需用户决策（见 §6 需改造 #1）。

---

## ⑤ 关键交互差异（含关闭机制与取色器）

### 5.1 **popup 如何关闭**

| 问题 | DR 的答案 | 证据 |
| :-- | :-- | :-- |
| 有显式 `×` 吗？ | **页头没有 ×。** popup 是浏览器工具栏弹窗，靠浏览器原生“点外部/Esc/切页签即关” | `popup/components/header/index.tsx`（Header 里只有 logo + site-toggle + app-toggle，无关闭钮） |
| 有点外部关闭吗？ | **有，但是浏览器行为，不是 DR 自己写的**（DR 只对 Firefox 打了一个补丁 `fixNotClosingPopupOnNavigation()`） | `popup/index.tsx:71-73` + `popup/utils/issues.ts` |
| 哪里有 ×？ | ① **下滑更多设置面板**的标题行右侧（`.header__more-settings__top__close`，内容是 **`×` 字形 `content` 或文本**，hover 底 `rgba(49,110,125,.25)`）② 预设项右侧删除钮（`::after content:"\2715"`） | `popup/components/header/style.less:137-151`；`popup/theme/preset-picker/style.less:27-47` |
| 下滑面板如何收起？ | 点它的 `×`，或点 header 上同名按钮切换（`state.moreSiteSettingsOpen / moreToggleSettingsOpen` 互斥） | `popup/components/body.tsx:127-139` |
| 遮罩层？ | popup 的 `Overlay`（`rgba(20,30,36,.5)`）用于**内容未就绪/加载**，不是“点击外部关闭”的遮罩 | `controls/overlay/style.less` |

**DR 的关闭模型 = 「浏览器弹窗原生关闭 + 面板内 ×」双轨。**

### 5.2 DR 的“更多设置”下滑面板（本仓可借的关闭入口范式）

```
header
└── .header__more-settings（absolute; top 计算值; width:100%; z-index:999）
    ├── &__top        高度 @size-control-inner；标题(橙 @color-heading)
    │   ├── &__text
    │   └── &__close  ← 显式关闭钮（.svi-* 可照搬此结构）
    ├── &__content    padding @indent-large @popup-content-padding
    └── &::after      底部渐隐（linear-gradient to bottom, fadeout(back,10%)→透明）
    收起态： height:0; opacity:0; pointer-events:none;  transition: all @time-slow
    两种高度： __more-site-settings 14.5rem / __more-toggle-settings 18rem
```
出处：`popup/components/header/style.less:103-212`。

### 5.3 **有没有页内悬浮按钮/胶囊？**

**没有。** DR 在页面里不注入任何 UI（`src/inject/` 全是引擎，见 §1.3 尾注）。
本仓的页内胶囊（`.svi-trigger-pill` + `.svi-panel-card`）是**本仓独有**能力，DR 无对应物可照搬 ——
所以「胶囊的关闭入口」只能**借 DR 的面板范式**（§5.2 的 `__top__close` + 点外部关闭），不能直接抄。

**本仓现状（对照）**：
- 胶囊 = `buildUI()`（`universal-smart-invert.user.js:13311–13452`）：`this.pill`（贴边小药丸，14×38px，圆角 8px）+ `this.panel`（`.svi-panel-card`）+ `this.offBadge`。
- 展开/收起 = 点药丸 `togglePanel()`（`:15889`，切 `.show` 类）。
- 点外部关闭 = `document.addEventListener('click', …)` 判断 `!this.root.contains(e.target)` 时移除 `.show`（`:13445–13449`）。
- **卡片 header（`:13340–13347`）只有标题 + 状态徽标，没有 `×`** ← 正是用户点名的「悬浮胶囊无关闭入口」。
- 模态（设置面板）**有** `×`（`.svi-modal-close`，`:13484`；CSS `:4706–4720`）且点遮罩关闭（`:13608–13610`）。

### 5.4 **颜色选择：是否用原生 `<input type="color">`？**

| 问题 | DR 答案 | 证据 |
| :-- | :-- | :-- |
| 用原生取色器吗？ | **完全不用。** `grep -c 'type="color"'` 于引擎产物 = 0；UI 源码 `ColorPicker` 只用 `TextBox`（`type=text`，hex）+ 预览块 + 自绘 HSB 面板 | `controls/color-picker/index.tsx:88-146`；`controls/color-picker/style.less` |
| 自绘色板？ | **是。** `HSBPicker`（`color-picker/hsb-picker/`）：聚焦时 `.color-picker__hsb-line` 由 `display:none` → `block` 展开 | `controls/color-picker/style.less:83-91` |
| 怎么处理“点外部关闭”？ | 手动实现：聚焦时 `window.addEventListener('mousedown', onOuterClick)`，用 `e.composedPath().some(el => el === context.node)` 判断是否点在自身之外 → `blur()`；失焦时移除监听 | `controls/color-picker/index.tsx:56-86` |
| 颜色怎么落地？ | 输入框回车 → 校验（`parseColorWithCache`）→ 合法才 `props.onChange(value)`；**不合法回落原值**；另有“重置”钮（`@icon-reset`） | `controls/color-picker/index.tsx:47-54,119-128` |
| 颜色下拉的增强 | `ColorDropDown` 给 `Default / Auto / Custom` 三选，选 Custom 时把建议色写入并**自动聚焦** picker | `controls/color-dropdown/index.tsx:47-70` |

**结论（直接命中本仓已知缺陷）**：DR 之所以不会出现“原生对话框阻断面板关闭”，
是因为它**根本不打开 OS 级对话框** —— 取色是“文本框输入 + 页内自绘 HSB 面板”，
面板的开关完全由页内 DOM 事件驱动，不与浏览器的原生模态对话框竞争事件序列。

**本仓现状（缺陷源）**：
- `SviControls.pickerRow`（`:12910–12931`）直接造 `this.h('input', {type:'color', class:'svi-color-input-native'})`（`:12917`）。
- `SviControls.colorList`（`:13069+`）同样用 `type:'color'` 的原生 input（`:13078`）。
- 两者把原生 input 用 `opacity:0` 覆盖在预览块上（CSS `:5000+`），点击即弹 OS 取色对话框。
- ⇒ 修法明确：**改为 DR 式「hex 文本框 + 色块预览 + 页内自绘色板」**，删除原生 `type=color`。

### 5.5 其他交互差异清单

| # | 维度 | DR | 本仓现状 | 影响 |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 开关形态 | Toggle = 两个带文字半块（On/Off、Dark/Light） | `.svi4-switch`（52×28 药丸+22px 圆点）/ popup `.switch`（40×22+16px 圆点）；`toggleRow` 用**原生 checkbox** | 最显眼的“不像” |
| 2 | 复选框 | 24×24 方框 + 斜线对勾（原生 input 隐藏） | 原生 `<input type=checkbox class=svi-check>` + `accent-color` | 观感 + 深色渲染不稳 |
| 3 | 下拉 | 自绘（TextBox+chevron+列表面板） | 原生 `<select class=svi-modal-select>`（`selectRow:12802`） | 观感 |
| 4 | 滑块 | 自绘 div（竖条 thumb + 数值跟随） | 原生 `<input type=range>` + 原生 `<input type=number>`（`sliderRow:12774`） | 观感 + 双控件冗余 |
| 5 | 数值 | UpDown（±按钮 + 填充 track），无数字框 | 原生 number 框 | 观感 |
| 6 | 取色 | hex 文本 + 自绘 HSB，无原生 | **原生 `<input type=color>`** | **功能缺陷**（阻断关闭） |
| 7 | 圆角 | 全直角 | `--svi-r-sm/.375/.75rem` → 按钮 8~12px、卡片 10~12px | 整体气质不同 |
| 8 | 描边 | 统一 2px `#316e7d` | 多为一像素 `rgba(white,.12/.15)` 或 `--svi-ctl-hover` | 轮廓强度不同 |
| 9 | 页签 | 方形 + 上下边框切换，激活**橙** `#e96c4c` | 圆角 9px + `--svi-fg` 青描边 + 青字（popup.html `.tab`） | 页签观感不同 |
| 10 | 字体 | 自带 Open Sans TTF | 系统字体栈，无 token | 字形不同 |
| 11 | 分区 | `section` + 居中描述，「无卡片无标题」 | `SviControls.group` 圆角卡片 + 标题 | 层次语言不同 |
| 12 | popup 外框 | `body { border: 2px solid white }` | 无 | 少一条 DR 标志性细节 |
| 13 | 页内 UI | **无** | 有胶囊 + 模态（本仓独有） | 需自行设计关闭入口 |
| 14 | 分组控件 | `ControlGroup`（控件 + 居中 `.625rem` 描述） | `labelBox(label,hint)`（左标签 + 右侧 hint，同一行） | 信息层级排布不同 |

---

## ⑥ 「可直接照搬」与「需改造」两栏清单

### 6.1 可直接照搬（低风险；纯 CSS/DOM 结构，与既有约束不冲突）

| # | 项 | 落点（本仓） | 依据 |
| :-- | :-- | :-- | :-- |
| A1 | **控件直角化**（撤销按钮/输入/下拉/开关/复选上的圆角；`--svi-r*` 只留模态外框与滚动条） | 面板 CSS token 块外的控件规则 | DR 全 UI 无方形圆角（§3.2） |
| A2 | **统一 2px 实心描边** `var(--svi-border)` 替代 `1px rgba(white,.12)` | `.svi-btn/.svi-action-btn/.svi-input/.svi-chip/…` | `controls/button/style.less` 等 |
| A3 | **Toggle 两半带文字形态**（两 span 各 50% + `::before` 滑动块，125ms `left`），替换 `.svi4-switch` 与 popup `.switch` | `SviControls.toggleRow` + `popup.html .switch` | `controls/toggle/*` |
| A4 | **CheckBox 方框 + 斜线对勾**（隐藏原生 input），替换 `toggleRow` 的原生 checkbox | `SviControls.checkRow` | `controls/checkbox/*` |
| A5 | **自绘下拉**（TextBox + chevron + 绝对定位列表面板，`max-height:0→12rem`），替换原生 `<select>` | `SviControls.selectRow` | `controls/select/*` |
| A6 | **自绘滑块**（track/fill/竖条 thumb + 数值标签跟随、`>75%` 翻面），替换原生 range+number | `SviControls.sliderRow` | `controls/slider/*` |
| A7 | **UpDown**（−/＋ 按钮 + 带填充 track）替代原生 number | `SviControls.sliderRow` 的数值部分 | `controls/updown/*` |
| A8 | **取色器改「hex 文本框 + 预览块 + 重置」并彻底删除原生 `type=color`**（自绘色板可先做「离散色点板」，见 6.2 W7） | `SviControls.pickerRow`(`:12910`) / `colorList`(`:13069`) | `controls/color-picker/*` |
| A9 | **色板/取色面板的「点外部关闭」实现**（`mousedown` + `composedPath()` 判定，125ms 无动画也能即时关） | 取色器聚焦态 | `controls/color-picker/index.tsx:56-86` |
| A10 | **页签改方形 + 上下 2px 边框切换**，激活用 `--svi-title`(#e96c4c) | `popup.html nav.tabs / .tab` | `controls/tab-panel/style.less` |
| A11 | **胶囊卡补显式 `×` 关闭入口**，并借 DR 的「下滑面板 `__top__close` + 底部渐隐 `::after`」范式 | `.svi-card-header`(`:13340`) | `header/style.less:103-212`（范式，非直接复制） |
| A12 | **popup 补 `body{border:2px solid white}` 外框** | `popup.html body` | `popup/style.less:397-399` |
| A13 | **`.ext-disabled` 整体降透明 + 禁点**（`opacity:.5; pointer-events:none`）的禁用态范式 | 本仓“本站停用”观感 | `popup/style.less:124-138` |
| A14 | **滚动条规格**（宽 `.75rem`，thumb `#193945`→hover mix→active `#316e7d`） | 面板/模态滚动容器 | `shared.less:55-78` |
| A15 | **dot 间距节奏**：分区间距 `--svi-gap`(.75rem)、行内间距 `--svi-gap-sm`(.5rem)（本仓已有，与 DR 同值，确认沿用即可） | 全部布局 | `theme.less` |
| A16 | **避让字号/行高**：DR 用 10/12/14px + 14/16/16px 行高，本仓 `--svi-fs-*` 已同值 → 无需改动 | — | §4.3 |

### 6.2 需改造（受本仓不可违反约束 / 语义不同，**不能**直接照搬）

| # | 项 | 冲突点 | 改造方向 |
| :-- | :-- | :-- | :-- |
| W1 | **字体 Open Sans** | DR 以 `url(assets/fonts/OpenSans-*.ttf)` 外链三个 TTF；本仓「零外部依赖/nocdn + 单文件用户脚本」 | 三选一：① 继续用系统字体栈（保持现状，但正视“字形不像”）；② 把 TTF **base64 内联**进用户脚本（体积 +数百 KB，且需新 token `--svi-font`）；③ 子集化后内联。**需用户在 PRD 拍板** |
| W2 | **全部图标** | DR 的 SVG 是 `background-image:url(assets/images/*.svg)` 外链；本仓**唯一图标来源**是 `SviControls.ICONS`（24 字形，内联 `<svg fill="currentColor">`），且三处路径**禁止 emoji**（`test.js` R3 两档码位扫描） | 只借 DR 图标的**造型语义**，在 `ICONS` 表里重建（可扩表）；**禁止**照抄 `url(...)` |
| W3 | **颜色/度量唯一真源** | 本仓只允许 `/* v6.4-TOKENS-START/END */` 一处定义颜色，且 token 块**逐字节**注入 popup/options、由 `test.js` 把关；token 块外出现任何 `#hex/rgba()` 视为契约漂移 | 把 §4.1/§4.3 的**缺失项补进 token 块**（`ctl-fg:#ffffff`、`ok-fg:#3bc077`、`selection-bg/#fore`、`border-w-inner` 等），并同步 `--svi-*-rgb` 三元组；**不得**在控件 CSS 里写 DR 的字面量 |
| W4 | **控件唯一实现 `SviControls`** | DR 有 20 个独立控件文件 + malevic 框架；本仓要求每个建造器**只出现一次定义**（单测把关），旧 `ui` 别名已删且不许回归 | 把 A3–A7 各实现 **一份**并收进 `SviControls`（不照搬 DR 的文件结构/框架） |
| W5 | **交互纪律：禁止绘制型手势** | DR 的 HSB picker 是**拖拽取色**（拖轨道/拖色域）；本仓 spec 明文「UI 不引入任何绘制型手势（无套索/无拖拽画框/无笔刷）」 | 取色面板改为**点选离散色板**（或 hex 文本输入 + 色点列表）；**不得**引入拖拽色域 |
| W6 | **popup 尺寸与外框** | DR 是 `15rem×30rem`(240×480) + 2px 白框；本仓 popup 现为 `width:320px` + 无框，且 `popup.js` 逻辑与 test 断言依赖现尺寸 | 若要 1:1，需同步改 `popup.html` + `popup.js` + 相关 test 断言（本任务已涉 popup 重构，可在范围内一并改） |
| W7 | **预设/主题选择器语义** | DR 的 preset = `{name, urls[], theme}`（最多 3 个 + per-URL 绑定 + `★ Theme for <host>`）；本仓「预设」是**配色预设**（`PRESETS`：柔和灰/夜间纯黑…），语义完全不同 | 只借其**交互外形**：`DropDown` + 「选中项只显名字 / 未选显名字+右侧 × 」+ 删除时 `MessageBox` 确认；**不搬** per-URL preset 数据模型 |
| W8 | **信息架构内容** | DR 页签内容 = Filter(亮度/对比/棕褐/灰度) + Site list + More；本仓功能集是**视频反色/图片反色/背景替换/区域/时间线**等 | 三页签**框架**可对齐（本仓已有 反色/本站/更多，命名已对齐），但每个页签的**控件内容必须按本仓功能重排**，不能照抄 DR 的四个滑块 |
| W9 | **Overlay / 遮罩语义** | DR 的 Overlay 是「内容未就绪」占位（`rgba(20,30,36,.5)`）；本仓 `.svi-modal-mask` 是模态遮罩（`rgba(10,15,18,.72)`） | 不合并两种语义；若要 DR 的半透明值，改 `--svi-scrim` 需在 PRD 说明（当前 .72 更深是刻意） |
| W10 | **控件字色** | DR 控件字 = 纯白 `#ffffff`；本仓用 `--svi-text-strong #e8f4f6`（spec 记为“本项目文字对比需求略高”） | 需用户确认：**跟随 DR 纯白**（更像）还是**保留 #e8f4f6**（更可读）。属“取值不同”需拍板项 |
| W11 | **`.svi-*` 命名与 `data-svi-*` 属性** | DR 用 `BEM + .toggle/.checkbox/…` 全站类名；本仓有 `data-svi-*` 属性契约与 `svi-` 前缀纪律（`test.js` 有相关扫描） | 类名沿用本仓前缀（`svi-`），只借 DR 的**结构与视觉**，不搬类名 |
| W12 | **popup 的 `.header__more-settings` 定位公式** | DR 用硬编码 `top: padding + 2*control + …` 计算；本仓 header 结构不同 | 照搬**结构（top 标题行 + × + content + `::after` 渐隐）**，定位改为本仓的 flex/绝对定位实现 |

---

## 附录：本次实测的上游文件清单（可复查）

| 上游路径（tag v4.9.133） | 用途 |
| :-- | :-- |
| `src/ui/theme.less` | 全部变量（§3.1 逐值） |
| `src/ui/shared.less` | 基样式/选区/滚动条/@font-face |
| `src/ui/popup/style.less` | popup 尺寸、2px 白框、footer、`.ext-disabled` |
| `src/ui/popup/components/body.tsx` | 三页签 IA 真源 |
| `src/ui/popup/components/header/index.tsx` + `style.less` | header 三块 + 下滑设置面板 + `__close` |
| `src/ui/popup/components/filter-settings/index.tsx` + `style.less` | Filter 页签控件与默认值 |
| `src/ui/popup/components/more-settings/index.tsx` + `style.less` | More 页签分区 |
| `src/ui/popup/components/site-list-settings/index.tsx` | Site list 页签 |
| `src/ui/popup/main-page/index.tsx` + `theme-group.tsx` + `style.less` | 新版信息架构 + theme-group |
| `src/ui/popup/theme/preset-picker/index.tsx` + `style.less` | 预设选择器（max 3 / × / MessageBox） |
| `src/ui/popup/theme/controls/index.tsx` | 主题控件清单（含 BackgroundColor/TextColor/SelectionColorEditor） |
| `src/ui/options/body/body.tsx` + `options/tab-panel/tab-panel.less` | options 7 页签 |
| `src/ui/controls/style.less` + `{button,toggle,checkbox,select,dropdown,slider,updown,textbox,color-picker,multi-switch,tab-panel,control-group,overlay,message-box,shortcut,nav-button}/style.less` | 控件视觉规格（§3.3） |
| `src/ui/controls/{toggle,select,slider,color-picker,color-dropdown}/index.tsx` | 控件实现（确认“是否原生”/“是否自绘”） |
| `src/ui/inject/*`（目录列举） | 证明页内无 UI |
| 本仓：`universal-smart-invert.user.js:3903–3964` | 本仓 token 块（§4 对照） |
| 本仓：`universal-smart-invert.user.js:12762,12774,12802,12910,13069` | `SviControls` 的原生控件调用点（§5.5/§6.1 落点） |
| 本仓：`universal-smart-invert.user.js:13311–13452,15889` | 胶囊卡构建与 `togglePanel`（§5.3） |
| 本仓：`scripts/extension-src/popup.html` | popup 现状（三页签已命名对齐，视觉未对齐） |
| 本仓：`.trellis/spec/frontend/ui-design-tokens.md` | 不可违反的 token/控件/图标约束（§6.2 W2–W5） |
