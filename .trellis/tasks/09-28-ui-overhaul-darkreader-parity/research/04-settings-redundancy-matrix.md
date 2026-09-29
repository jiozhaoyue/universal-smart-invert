# 设置项冗余矩阵（三处界面真源测绘）

> 任务：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity`
> 角色：设置项真源测绘员（只读；本报告为唯一产出）
> 日期：2026-09-28
> 结论一句话：**不是单一真源。** `SVI_SETTINGS_SCHEMA` 只是 **C（options 全页）** 的真源；
> **A（页内模态）自己手写了一份行清单**，A↔schema 的一致性只靠 **test.js 的一次源码扫描**维持；
> **B（popup）与两者都不共用任何清单**，且其消息通道只白名单放行 5 个键。

---

## 0. 三处界面的真实源文件（先排除构建产物）

| 界面 | 真源（可改） | 构建产物（勿手改） |
| :-- | :-- | :-- |
| A 页内高级设置模态 | `universal-smart-invert.user.js` → `UIController` 类（约 13290–16431） | `extension/content.js`（整份用户脚本） |
| B 扩展 popup | `scripts/extension-src/popup.html` + `scripts/extension-src/popup.js` | `extension/popup.html` / `extension/popup.js` |
| C 扩展 options 全页 | `scripts/extension-src/options.html` + `scripts/extension-src/options.js` | `extension/options.html` / `extension/options.js` |
| 设置清单 / 控件库 / 默认值 / 色卡 | **全部在用户脚本内**（下述 4 个抽块） | `extension/settings-schema.js` / `extension/ui-controls.js` |

**`settings-schema.js` 与 `ui-controls.js` 没有独立源文件** —— 它们由 `scripts/build-extension.js`
在构建期从用户脚本抽块生成：

- `scripts/build-extension.js:342-349` — `extractBlock()` 抽出
  `/* v6.4-CONTROLS-START/END */`（`SviControls`）与 `/* v6.4-SETTINGS-SCHEMA-START/END */`（设置清单）；
- `scripts/build-extension.js:352-373` — 另抽 `DEFAULT_PREFS`（求值）与 `IMG_COLOR_PRESETS`（求值）；
- `scripts/build-extension.js:377-390` — 落盘 `extension/ui-controls.js` / `extension/settings-schema.js`；
- `scripts/build-extension.js:294-336` — 设计 token 块 + 面板 CSS 抽块并注入 `popup.html` / `options.html`
  的 `/* SVI_TOKEN_INJECT */` 与 `/* SVI_PANEL_CSS_INJECT */` 占位（占位缺失即构建失败）。

**所以「真源」在物理上只有一个文件**：`universal-smart-invert.user.js`。但设置项的**清单**在三处
渲染路径里并不共用（见 §1）。

---

## 1. 真源结论与证据（本任务最关键的判断）

### 1.1 结论

| 问题 | 结论 |
| :-- | :-- |
| `settings-schema.js` 是不是三处共用的单一清单？ | **不是。只有 C 消费它。** |
| 页内模态 A 是否自己手写了一份独立项列表？ | **是。** 完全手写，逐区块硬编码行，零引用 schema。 |
| schema 与 A 靠什么保持同步？ | **只靠 test.js 的源码扫描断言**（软同源，非运行期同源）。 |
| B 靠什么保持同步？ | **什么都不靠。** 清单手写、选项集手写、默认值字面量手写。 |

### 1.2 证据

**（a）schema 的定义点与唯一消费者**

- 定义：`universal-smart-invert.user.js:12522-12670`，`SVI_SETTINGS_SCHEMA`（11 组 / 94 项）。
- 消费：`scripts/extension-src/options.js:22` `const SCHEMA = window.SVI_SETTINGS_SCHEMA || [];`
  → `:227-319` `KINDS` 映射（kind → 控件工厂）→ `:335-350` `build()` 逐组渲染 → `:341`
  `C.collapsible(group.title, group.items.length + ' 项', false)`。
- **全仓引用 `SVI_SETTINGS_SCHEMA` 的位置只有 schema 自身的定义行**（`grep -n SVI_SETTINGS_SCHEMA`
  在用户脚本内仅命中 12527）。也就是说 **A 的构建代码一次都没读过它**。

**（b）A 是逐区块手写**

`UIController.buildSettingsModal()`（`:13469`）本身只是一副骨架；真正的项由 16 个 builder 方法手写：

| builder | 行 | 作用域 |
| :-- | :-- | :-- |
| `buildPowerBanner` | 15994 | 本站 |
| `buildCapabilityCards` | 16040 | 本站（3 张三态卡） |
| `buildSiteSection` | 15262 | 本站 |
| `buildMediaSection` | 15477 | 本站 |
| `buildAppearanceSection` | 13691 | 全局 |
| `buildImageSection` | 13751 | 全局 |
| `buildRegionSection` | 13945 | 全局 |
| `buildVideoSection` | 14161 | 全局 |
| `buildActionsSection` | 14391 | 全局 |
| `buildReadabilitySection` | 16132 | 全局 |
| `buildDynamicThemeSection` | 16179 | 全局 |
| `buildSiteListsSection` | 16384 | 全局 |
| `buildSchedulerSection` | 16337 | 全局 |
| `buildShieldSection` | 15449 | 全局 |
| `buildDataSection` | 14803 | 全局（0 个偏好项，纯动作按钮） |
| `buildTipsBlock` | 14291 | 全局（静态文案） |

每个方法内直接 `SviControls.toggleRow(...)` / `sliderRow(...)` / `selectRow(...)` 手写 label、
hint、范围、**以及硬编码默认回退**（如 `:13761` `state.imagePolicy || 'balanced'`，
`:16198` `state.flashGuardLevel || 'document'`，`:16288` `state.bgTone || 'pure-black'`）。

**（c）A↔schema 的「同源」是测试期源码扫描，不是运行期共用**

`test.js:5432-5456` 的 R1b AC③：

```js
const clsM = /class UIController \{([\s\S]*?)\n  \}\n/.exec(src);   // 5434
for (const hit of clsM[1].matchAll(/\bstate\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)) { ... }  // 5438
assert.ok(panelKeys.size >= 90, ...);                                 // 5449
const notOnPanel = schemaKeys.filter((k) => ![...panelKeys].some((p) => related(k, p)));  // 5450
assert.deepStrictEqual(notOnPanel, [], 'R1b: schema 的键必须在面板里也有落点…');  // 5451-5452
const notOnOptions = [...panelKeys].filter((k) => !onOptions(k) && !inTable(k));  // 5453
assert.deepStrictEqual(notOnOptions, [], '…防面板新增项而 options 漏项…');       // 5454-5455
```

即：**用正则从 `UIController` 类体里刮出 `state.<键>` 引用，再与 schema 的键面双向比对**。
这能挡住「面板有而 options 没有」和「options 有而面板没有」，但它是**构建产物无关的静态近似**，
不改变「A 与 C 各有一份可独立漂移的行定义」这一事实。schema 里 `:12536-12539` / `:12542-12543`
的注释也自认：「bgReplace 全局默认**刻意仍未上设置页**」「面板**没有**给这个总开关建行」。

**（d）B 完全在体系之外**

`scripts/extension-src/popup.js` 的 6 个键全部手写，且经消息通道写回：

- 通道白名单：`universal-smart-invert.user.js:17100-17127`（`svi-set-pref` 只认
  `imagePolicy` / `imgFxMode` / `presetId` / `hoverRestore` / `imageInvert` 五个键，其余 `sendResponse({ok:false, error:'unknown key'})`）；
- 另有 `svi-site-power`（`:17097`）、`svi-site-reset`（`:17129`）、`svi-open-settings`（`:17133`）。
- `test.js` 对 popup 的覆盖只有三类：消息通道单测（`:1437-1484`）、token 逐字节一致（`:5068-5123`）、
  零 emoji 码位扫描（`:5693-5697`）。**没有任何断言把 popup 的控件集与 schema 对齐。**

> **一句话**：三处界面 = 三条独立渲染路径；C 读 schema，A 手写（被一次源码扫描兜着），B 手写且无外部约束。

---

## 2. 全项矩阵（94 个 schema 项 + A 独有项）

图例：`●` = 渲染为可编辑控件；`○` = 仅只读展示；`—` = 不出现。
「控件类型」列 A 与 C 的差异即为漂移点。「默认值来源」：A/C 均来自 `DEFAULT_PREFS`
（`loadState` 深合并，`:1011-1044`）；**B 不读 `DEFAULT_PREFS`**，用 `popup.js` 内字面量回退。

### 2.1 组「外观与画面」(7)

| 项名 (schema label) | 偏好键 | A | B | C | A 控件 | C 控件 | 默认值 |
| :-- | :-- | :--: | :--: | :--: | :-- | :-- | :-- |
| 反色预设 | `presetId` | ● | ● | ● | chipRow (PRESETS 名) | select (2 项) | `soft-gray` |
| 悬停显示原图 | `hoverRestore` | ● ×2 | ● | ● | toggleRow ×2（`:13710` + `:14504` peek） | toggle | `true` |
| 画面亮度 | `brightness` | ● | — | ● | sliderRow | slider | 0.92 |
| 画面对比度 | `contrast` | ● | — | ● | sliderRow | slider | 0.9 |
| 色彩饱和度 | `saturate` | ● | — | ● | sliderRow | slider | 1 |
| 色相旋转 | `hueRotate` | ● | — | ● | sliderRow | slider | 180 |
| 过渡动画时长 | `transitionMs` | ● | — | ● | sliderRow | slider | 0 |

### 2.2 组「图片反色」(19)

| 项名 | 偏好键 | A | B | C | A 控件 | C 控件 | 备注 |
| :-- | :-- | :--: | :--: | :--: | :-- | :-- | :-- |
| 图片反色（总开关） | `imageInvert` | ●★ | ● | ● | **本站三态卡** + 胶囊「图片:开/关」(全局) | toggle (全局) | ★语义分歧，见 §4-D1 |
| 智能图片策略 | `imagePolicy` | ● | ● | ● | selectRow | select | 三处一致 |
| 全浅色通用自适应检测 | `imgGeneralLight` | ● | — | ● | toggleRow | toggle | |
| 暗色遮罩感知 | `maskAware` | ● | — | ● | toggleRow | toggle | |
| 预设浅色色卡 | `imgPresets` | ● | — | ● | chipRow (IMG_COLOR_PRESETS) | chipsOf | 同源色卡 |
| 目标色图拾色器 | `imgCustomColor` | ● | — | ● | pickerRow | color | |
| 目标色容差 | `imgTolerance` | ● | — | ● | sliderRow | slider | |
| 浅色明度线 | `imgLumCutoff` | ● | — | ● | sliderRow | slider | |
| 浅色面积占比 | `imgAreaThreshold` | ● | — | ● | sliderRow | slider | |
| 正文图最小尺寸 | `minImgSize` | ● | — | ● | sliderRow | slider | |
| **图片特效模式** | `imgFxMode` | ●(+本站) | ● | ● | selectRow (8 项) | select (8 项) | **B 只有 4 项**，见 §4-D2 |
| 亮度反色·明度线 | `imgFxParams.lumCutoff` | ● | — | ● | sliderRow | slider | |
| 亮度反色·饱和上限 | `imgFxParams.satCutoff` | ● | — | ● | sliderRow | slider | |
| 键色反色·目标色 | `imgFxParams.keyColor` | ● | — | ● | pickerRow | color | |
| 键色反色·容差 | `imgFxParams.keyTol` | ● | — | ● | sliderRow | slider | |
| 动图全帧谱分析 | `animatedDetect` | ● | — | ● | toggleRow | toggle | |
| 混合型动图 | `animMixedPolicy` | ● | — | ● | selectRow | select | |
| 全浅判定门 | `animAllLightRatio` | ● | — | ● | sliderRow | slider | |
| 谱分析帧上限 | `frameSampleCap` | ● | — | ● | sliderRow | slider | |

### 2.3 组「区域反色」(12) —— A+C，B 完全没有

| 项名 | 偏好键 | A | B | C |
| :-- | :-- | :--: | :--: | :--: |
| 区域分割（内核） | `regionSegment` | ● | — | ● |
| 分割网格 | `regionGridN` | ● | — | ● |
| 最小连通域面积 | `regionMinAreaRatio` | ● | — | ● |
| 矢量矩形上限 | `regionKRects` | ● | — | ● |
| 部分反色渲染层 | `regionRender` | ● | — | ● |
| 仅静态图 | `regionStaticOnly` | ● | — | ● |
| 掩码心跳 | `regionHeartbeatMs` | ● | — | ● |
| 覆盖层上限 | `regionOverlayMax` | ● | — | ● |
| 区域纠正模式 | `regionCorrect` | ● | — | ● |
| 用纠正数据自校准 | `regionCalibrate` | ● | — | ● |
| 累积门（样本数） | `regionCalibrateMinSamples` | ● | — | ● |
| 单次调整幅度上限 | `regionCalibrateStep` | ● | — | ● |

（A 该区块另含 1 个 `navButton` + 2 个 `resetButton` + 只读诊断行，均非偏好项。）

### 2.4 组「视频反色」(17)

| 项名 | 偏好键 | A | B | C | 备注 |
| :-- | :-- | :--: | :--: | :--: | :-- |
| 视频智能自动反色检测 | `autoDetect` | ●☆ | — | ● | ☆A 只是胶囊「智能:开/关」，**C 才有正式行** |
| 视频特效引擎 | `videoFxMode` | ● | — | ● | |
| 检测采样周期 | `sampleIntervalMs` | ● | — | ● | |
| 白底面积占比 | `whiteThreshold` | ● | — | ● | |
| 明度判定线 | `lumThreshold` | ● | — | ● | |
| 退出防抖延迟 | `exitHysteresisMs` | ● | — | ● | |
| 启用画面调节 | `videoTune.enabled` | ● | — | ● | |
| 画面调节 · 亮度/对比度/饱和度/暖色/黑白 | `videoTune.*` (5) | ● | — | ● | |
| 时间线记忆 | `timelineMode` | ● | — | ● | 默认 `reference` |
| 帧序列判定 | `frameSequence` | ● | — | ● | |
| 序列窗帧数 | `frameWindow` | ● | — | ● | |
| 场景跃变门 | `sceneDelta` | ● | — | ● | |
| 转场白闪不切换 | `flashWhiteSkip` | ● | — | ● | |

### 2.5 组「原色屏蔽」(1) / 「本站设置」(3) / 「站点名单」(3)

| 项名 | 偏好键 | A | B | C | 备注 |
| :-- | :-- | :--: | :--: | :--: | :-- |
| 屏蔽列表 | `shieldColors` | ● | — | ● | colorList，v6.4 R2b 已收口同源 |
| 内置种子规则 | `rulesEnabled` | ● | — | ● | A 放在「本站」页签 |
| 学习命中阈值 | `learnHits` | ● | — | ● | A 放在「本站」页签 |
| 元素级规则 | `elementRules` | ● | — | ● | **作用域不同**：A 有「本站/全部」，C 只有「全部」（`:12612` vs `:15311`） |
| 站点管理模式 | `siteMode` | ● | ○ | ● | B 只读 |
| 黑名单域名 | `siteBlacklist` | ● | ○ | ● | B 只读（计数 + 前 4 条预览） |
| 白名单域名 | `siteWhitelist` | ● | ○ | ● | B 只读 |

### 2.6 组「动态主题调节」(9) / 「字体与可读性」(3) / 「定时模式」(3)

| 项名 | 偏好键 | A | B | C |
| :-- | :-- | :--: | :--: | :--: |
| 加载前保护（防白闪） | `flashGuardLevel` | ● | — | ● |
| 元素遮罩（pending） | `maskPending` | ● | — | ● |
| 遮罩总时长预算 | `maskBudgetMs` | ● | — | ● |
| 遮罩元素数上限 | `maskMaxElements` | ● | — | ● |
| 本站启用门 · 历史反色率 | `siteInvertRate` | ● | — | ● |
| 色调 | `bgTone` | ● | — | ● |
| 页面亮度 | `bgBrightness` | ● | — | ● |
| 页面对比度 | `bgContrast` | ● | — | ● |
| 页级暗化引擎 | `pageDarkEngine` | ● | — | ● |
| 字体覆盖 | `fontOverride` | ● | — | ● |
| 字体风格 | `fontFamilyPreset` | ● | — | ● |
| 文字描边 | `textStroke` | ● | — | ● |
| 定时启停 | `scheduleEnabled` | ● | — | ● |
| 开始时刻 | `scheduleStart` | ● | — | ● |
| 结束时刻 | `scheduleEnd` | ● | — | ● |

### 2.7 组「元素动作与撤销」(17) —— A+C

`actions.hide.enabled` · `actions.mask.enabled` · `maskStyle` · `maskHoverOpacity` · `maskBlur` ·
`actions.dim.enabled` · `pageDimOpacity` · `undoEnabled` · `undoStackSize` · `actionToast` ·
`errorSentinel` · `learnGrading` · `learnStrongHits` · `learnDemote` · `shapePrior` ·
`shapeMinHosts` · `calibrateAuto` —— **17 项全部 A ● / C ● / B —**。

### 2.8 A 独有项（不在 schema、不在 B/C）

| 项名 | 写哪里 | A 位置 | 说明 |
| :-- | :-- | :-- | :-- |
| 本站电源（本站反色总闸） | 站点 `enabled` / `runtime.siteActive` | `buildPowerBanner` `:16008-16013` | B 也有（`#power`），故为 **A+B**；C 无 |
| 图片反色（本站三态卡） | `siteOverrides[host].imageInvert` | `buildCapabilityCards` `:16042` | 与 `imageInvert` 全局键同名不同域 |
| 视频反色（本站三态卡） | `siteOverrides[host].videoInvert` | `:16043` | **仅 A** |
| 背景替换（本站三态卡/胶囊） | `siteOverrides[host].bgReplace` | `:16044` / 胶囊 `:13381` | **仅 A**；schema 刻意排除全局 `bgReplace`（`test.js:5400`） |
| 本站图片特效（跟随全局） | `siteOverrides[host].imgFxMode` | `:15282` | **仅 A** |
| 悬停复原 (peek) | 同 `hoverRestore` | `buildActionsSection` `:14504` | 键与「悬停显示原图」**同键重复渲染** |
| 布局形态（居中/靠左/靠右） | `settingsLayout` / `settingsWidth` | `:13510-13524` | 纯面板 UI 态（例外表已登记） |

> 反向缺口：**`imageInvert` 全局行**与 **`autoDetect` 全局行**只有 C 有正式行；
> A 用胶囊/卡片承载，B 有 `imageInvert` 但无 `autoDetect`。

---

## 3. 冗余矩阵（按交并差分类）

### 3.1 三处都渲染的（真冗余候选）

| 项 | 键 | A 写法 | B 写法 | C 写法 | 是否一致 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 反色预设 | `presetId` | chip (PRESETS) | chip ×2 (硬编码) | select (2 项) | **否** |
| 悬停显示原图 | `hoverRestore` | toggle ×2 | checkbox | toggle | 键一致，**A 重复渲染** |
| 智能图片策略 | `imagePolicy` | select | select | select | 是（唯一完全一致项） |
| 图片特效模式 | `imgFxMode` | select (8) | select (4) | select (8) | **否（选项集）** |
| 图片反色 | `imageInvert` | 站点三态卡 + 胶囊 | checkbox（写全局） | toggle（全局） | **否（语义/域）** |

**只有 5 项出现在三处；其中 4 项存在不一致。** 这是「两个设置面板冗余」抱怨的核心：
用户在三处看到同名同义的开关，但**存储的域与可选项并不相同**。

### 3.2 仅 A 有（页内独有）

- 站点级：`siteOverrides[host].videoInvert`、`.bgReplace`、`.imgFxMode`（本站图片特效）、`.imageInvert`（三态卡）。
- 渲染行独有：悬停复原 (peek) 行（键与 `hoverRestore` 共有）。
- 面板形态：布局形态 3 按钮、面板宽度。

### 3.3 仅 B 或 C 有

- **仅 C 有正式行**：`imageInvert`（全局总开关行）、`autoDetect`（视频智能自动检测行）。
- **仅 B 有**：无任何偏好控件（B 的 6 个键全部在 A 也有）。B 独有的是**只读摘要**（当前站点、
  计数、站点名单摘要）与 3 个导航/动作按钮（打开页内面板、打开设置页、清除本站覆盖）。
- **仅 C 有（相对 A/B）**：无 —— C 的 94 项中 92 项 A 也有。

### 3.4 同名但语义/默认值不一致（最危险）

见 §4。

### 3.5 规模统计（grep ground truth）

| 界面 | 偏好承载控件 | 明细 | 其他交互 | 只读行 |
| :-- | :--: | :-- | :-- | :-- |
| **A 页内模态** | **94** | toggle 27 · slider 45 · select 14 · text 2 · picker 2 · chip 2 · colorList 1 · listEditor 1 | 模态区内：infoLine 21、btnRow 12（含 28 个按钮）、navButton 1、resetButton 2；另有能力卡 3、电源开关 1、布局按钮 3、胶囊快捷按钮 4 | 学习规则列表、形状先验表、存储键列表、统计网格、区域诊断 |
| **B popup** | **7**（6 个键） | checkbox 3（`#power` `#imginv` `#hover`）· select 2（`#policy` `#imgfx`）· chip 2（`#chip-soft-gray` `#chip-amoled`） | 6 个 `<button>`（3 个功能 + 3 个页签） | 7 行（host/counts/site-mode/site-counts/overridden/list-preview/ver-more） |
| **C options** | **94** | 与 schema 1:1（select 12 · toggle 28 · slider 45 · chipsOf 1 · color 2 · colorList 1 · listEditor 1 · text 2 · hour 2） | 折叠面板 11 个（`C.collapsible`） | — |

A 的 94 行里：**1 行是站点覆盖（本站图片特效）、1 行是重复项（peek）**，故 A 实际承载的
**全局偏好键 92 个**；schema 94 键减去 A 未建行的 `imageInvert` / `autoDetect` = 92 —— 数字吻合，
但**集合并不完全相同**（编号相同是巧合，不是同源）。

> 计数命令（可复现）：
> `node -e "…"` 抽 `v6.4-SETTINGS-SCHEMA` 块求值 → 11 组 / 94 项；
> 对 `13469–16431` 区间计 `SviControls.(toggle|slider|select|text|picker|chip)Row|colorList|listEditor`
> → 94；`grep -c '<select'|<checkbox'|class="chip"'|'<button'` 于 `popup.html` → 2/3/2/6。

---

## 4. 冗余模式归纳

### 模式一：同一项在多处重复渲染（同键、异形）

| # | 项 | 重复位置 | 危害 |
| :-- | :-- | :-- | :-- |
| P1 | `hoverRestore` | A `:13710`（外观）与 A `:14504`（元素动作 peek）**同一面板内两次** | 同一键两行，改一处两处同步（都走 `sync()`），纯冗余；label 不同（悬停显示原图 / 悬停复原）易被当成两个功能 |
| P2 | `presetId` / `imagePolicy` / `imgFxMode` / `imageInvert` | A、B、C 各一处（`imageInvert` 在 A 内还有卡片 + 胶囊两处） | 三份 UI 各自维护选项集与回退默认值 |
| P3 | `siteMode` / `siteBlacklist` / `siteWhitelist` | A 可编辑、C 可编辑、B 只读展示 | 展示层三份，B 的 `listPreview` 只取前 4 条语气与 A/C 不同 |

### 模式二：同一功能有多个入口（异域、耦合）

| # | 功能 | 入口 | 实际写入 | 危害 |
| :-- | :-- | :-- | :-- | :-- |
| E1 | 「图片反色」开/关 | A 胶囊「图片:开/关」(`:13374`) / A 本站三态卡 (`:16061`→`cycleTriState` `:16069`) / B `#imginv` (`popup.js:93`) / C schema toggle | 胶囊与 B、C 写**全局** `state.imageInvert`；A 卡片写**本站** `siteOverrides[host].imageInvert` | 同屏三个入口，其中一个是站点域、两个是全局域 |
| E2 | 「背景替换」 | A 胶囊「背景:开/关」(`:13386`→`toggleSiteBgReplace` `:13454`) / A 本站卡 / （C 无，schema 刻意排除） | 站点覆盖 | 全局默认无 UI，只能靠规则包/备份导入 |
| E3 | 「视频反色」 | A 本站卡 / A 胶囊「视频:开/关」(`:13358`) / （B、C 无） | 站点覆盖 | 全局无此开关（`autoDetect` 是另一个键） |
| E4 | 站点电源 | A 电源横幅 (`:16008`) / B `#power` (`popup.js:79`) | `setSitePower` 同一处 | 双入口但同一实现，风险低 |
| E5 | 清除本站覆盖 | A 三态循环回「跟随全局」 / B `#reset-site` (`:17129`→`resetSiteOverrides`) | 同一处状态操作 | 低 |
| E6 | 打开设置 | B `#open-settings`（开 A）/ B `#open-options`（开 C） | 导航 | 无 |

### 4.1 最危险的不一致（同名/同键但语义或选项集不同）

| # | 项 | 不一致内容 | 证据（file:line） | 后果 |
| :-- | :-- | :-- | :-- | :-- |
| **D1** | `imageInvert` | **B 的勾选态 = 全局 ∧ 本站的合成值，但 B 的写入只改全局**。本站覆盖为「强制关」时，B 勾选框显示未勾；用户勾上 → 写全局 `true` → 实际仍关 → 重新打开 popup 又变未勾。 | 读：`user.js:17075` `imageOn: state.imageInvert !== false && getSiteProfile().imageInvert !== false`；写：`popup.js:93-95` + `user.js:17119-17123` | **看起来「点了没用」**；用户误判为 bug |
| **D2** | `imgFxMode` | **B 的选项集只有 4 项**（full/luma/grayscale/sepia），A/C 有 8 项（多 `key`/`rect`/`brightness`/`custom`）。 | B：`popup.html:153-160`；A：`user.js:79-88`（`IMG_FX_MODES`）；C：`:12554` | `snap.imgFxMode='key'` 时 B 的 `select` 赋不上值，**回落显示第一项「完整反色」**，用户看到的值是错的（写入不受影响，但会被误导） |
| **D3** | `presetId` | 标签与集合三处不同：A 用 `PRESETS.name` → **「纯黑」**（`user.js:62`）；B/C 用「夜间纯黑」（`popup.html:144` / `user.js:12529`）。且 `DEFAULT_PREFS` 注释允许 `'custom'`（`:114`），而 C 的 select 只有 2 项、B 的 chip 逻辑 `snap.presetId !== 'amoled'` 会把 `custom` 误显示为「柔和灰」选中。 | `user.js:50-69`、`:114`、`:12529`；`popup.js:57-58` | 预设名对不上；`custom` 态在三处显示互不相同 |
| **D4** | `hoverRestore` | A 同面板内两行（`悬停显示原图` / `悬停复原 (peek)`），键相同。 | `user.js:13710`、`:14504` | 冗余 + 命名不一致，易被当成两个开关 |
| **D5** | 默认值来源 | B **不读 `DEFAULT_PREFS`**：`popup.js` 用 `|| 'balanced'` / `|| 'full'` / `!== false` 字面量回退，消息处理器 `user.js:17078-17081` 再硬编码一份 `'balanced'` / `'full'` / `'soft-gray'`；A 也内联了 `\|\| 'balanced'` 等回退。 | `popup.js:54-58`、`user.js:17078-17081`、`:13761`、`:16198`、`:16288`、`:16324`、`:16397` | `DEFAULT_PREFS` 改值时，A/B 的内联回退**不会跟着变** → 静默漂移 |
| **D6** | `elementRules` | 作用域选项不同：A 提供「本站/全部站点」（`:15311`），C 只有「全部站点」（`:12612`，并在文案里让用户去页内面板加本站规则）。 | `user.js:15311` vs `:12612` | 非缺陷（有意），但同一控件形状不同，用户会疑惑 C 为何没有「本站」 |

---

## 5. 重构映射建议（供 design.md）

### 5.1 前置硬约束（必须写进 design）

**用户脚本形态（非扩展）没有 options 页** —— C 只存在于扩展形态。因此
**A 的全局设置层不能被整体删除**，否则用户脚本用户将彻底失去全局设置入口。
三处冗余只在**扩展形态**下成立。建议的仲裁点：`OWNER_KIND === 'ext'`（`user.js` 启动时由
`EXT_MODE` 解析，见 `build-extension.js:109`）—— 扩展形态下把 A 的全局层降级。

### 5.2 分层定位与映射

| 层 | 界面 | 定位 | 该承载什么 | 该砍掉什么 |
| :-- | :-- | :-- | :-- | :-- |
| 本站快捷层 | **B popup** | 「这一页」的高频开关 | 本站电源、图片/视频/背景三态、预设、悬停复原、（可选）本站图片特效、「清除本站覆盖」、进入 A 与 C 的入口 | `imagePolicy` / `imgFxMode` 的**全局写入口**（改为只读展示或删；它们的域是全局，混在「反色」页签里最容易与本站三态打架 → D1/D2 的根因） |
| 全局权威层 | **C options** | 全局深度设置的**唯一权威**（schema 94 项原样保留） | 全部 94 项 | 无（保持） |
| 页面上下文层 | **A 页内模态** | 「本站 + 当前页」的上下文操作 | **保留「本站」页签**（能力卡三态、本站特效、元素规则、学习规则、当前页媒体/已处理）—— 这些必须依赖当前站点上下文，C 做不了 | **扩展形态下砍掉「全局」页签的深度设置**（region 12 / video 17 / actions 17 / lists 3 / theme 9 / readability 3 / schedule 3 等），改为「常用 5–7 项 + 打开完整设置页」；**用户脚本形态保留全局页签全文**（否则无入口） |

### 5.3 建议保留在 A 全局页签的「常用项」（扩展形态精简后）

`presetId` · `brightness`/`contrast`（可选）· `hoverRestore` · `imagePolicy` · `imgFxMode` ·
`bgTone` · `pageDarkEngine` · `scheduleEnabled` · 以及「站点名单」三行的入口。
理由：这些是「看到页面就想立刻调」的项，与页面观感强相关，留在页内交互成本最低。

### 5.4 必须一并消除的三类不一致（design 的验收点）

1. **D1/D2 优先**：popup 的写入域与展示域必须一致 —— 建议把 popup 的 `#imginv` / `#imgfx` / `#policy` / `#hover` 明确改成**本站三态**（走 `svi-site-*` 系列），或明确标注「全局」并补齐 8 个 `imgFxMode` 选项。二者必居其一，不允许「读合成值、写全局值」。
2. **D5**：把 B 的默认值字面量与消息处理器的回退**改为经 schema/DEFAULT_PREFS 派生**（或至少由单测断言键面与默认值一致），消灭第三份默认值。
3. **D4/D3**：A 内 `hoverRestore` 两行合一（保留「悬停显示原图」）；`presetId` 的名称与集合统一到一处
   （`PRESETS` 是唯一真源，schema/popup 的文案应由它派生）。

### 5.5 同源机制建议（与既有纪律一致）

- 短期（不改架构）：把 **B 的控件集也纳入 R1b 式断言** —— 现在 `popup.html` 的手写控件完全无断言兜底。最小做法：在 `test.js` 里断言「`popup.js` 引用的每个 `svi-set-pref` 键都在 schema 键面内」。
- 中期：若要让 popup 也消费 schema，注意 popup 是 320px 紧凑自绘页、**不注入面板 CSS**
  （`build-extension.js:328-334`），需要用 `SviControls` + token 重建 popup 的控件（会改变 popup 观感，
  属方向性取舍，需用户裁决）。
- 任何改动都必须：`node scripts/build-extension.js` 重建 `extension/`，且 `test.js` 的 R1b/token/emoji
  三组断言全绿（见约束 §6）。

---

## 6. 硬约束确认（本次测绘已核对）

| 约束 | 现状 | 证据 |
| :-- | :-- | :-- |
| design token 唯一来源 | ✓ `v6.4-TOKENS-START/END` 块（`user.js:3909-3964`），构建期注入 `popup.html`/`options.html` 的 `/* SVI_TOKEN_INJECT */` | `build-extension.js:294-327`；`ui-design-tokens.md §1` |
| 控件唯一实现 | ✓ `SviControls`（`user.js:12672-13243`，20 项）；v5 `ui.*` 别名已删除，单测要求调用点为 0 | `ui-design-tokens.md §3`；A 全部经 `SviControls.*` |
| 图标唯一来源 | ✓ `SviControls.ICONS` + `SviControls.icon()`；禁 emoji、禁手写 `<svg>` | `ui-design-tokens.md §3`；`test.js:5693-5697` |
| 面板样式唯一实现点 | ✓ 面板 CSS 抽块注入 `options.html`；`popup.html` 是自绘紧凑页、不消费面板 CSS | `build-extension.js:300-334` |
| 改动必须 rebuild | ✓ 任何 header/真源改动后跑 `node scripts/build-extension.js` | `AGENTS.md` Commands |

> **注意本次测绘发现的一处与「唯一实现」纪律相邻的风险**：`popup.html` 的控件（`.chip` / `.switch` /
  `select` / `.mini`）是**手写的第二套控件样式**（`popup.html:60-91`），并未走 `SviControls`。
> 它是 320px 紧凑自绘页、构建脚本明确「不消费面板 CSS」（`build-extension.js:328-329`），
> 所以目前**不违反**现有纪律 —— 但若要在 popup 也复用 `SviControls`，须先解决 token/面板 CSS 的注入方式。

---

## 7. 附：A 与 C 的数字为何「看起来很吻合」

| 数字 | 值 | 说明 |
| :-- | :-- | :-- |
| schema 项数 | 94 | 11 组 |
| A 偏好承载行 | 94 | 含 1 站点覆盖行 + 1 重复行 |
| A 实际全局偏好键 | 92 | = 94 − `imageInvert` − `autoDetect`（A 未建行） |
| C 渲染控件 | 94 | = schema 1:1 |
| B 偏好控件 | 7 | 6 个键 |
| `DEFAULT_PREFS` 顶层键 | 106 | 叶路径 117 |
| 未被 schema 覆盖的叶子 | 27（其中 `imgPresets.*` 4 条由 `imgPresets` 项覆盖、`actions.*` 由 17 项覆盖） | 由 `test.js:5366-5401` 的例外表逐条登记 |

**结论重申**：A 与 C 的项数相等是巧合（A 少 2 项、多 2 项非 schema 项），并非同源所致；
真正保证二者不漂移的是 `test.js` 的源码扫描断言，而 **B 连这层都没有**。
