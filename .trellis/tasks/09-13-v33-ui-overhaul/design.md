# design.md — v3.3 设置面板全面改版

## 1. 现状坐标（全部已核实）

| 关注点 | 位置 |
|---|---|
| 弹窗外壳 CSS（遮罩/480px 窗口/行布局） | `injectStyles` L1949–2132, `.svi-modal-row` L2035, `.svi-modal-controls` L2053 |
| `ui` 组件库 | L6193–6419（`h/labelBox/section/toggleRow/sliderRow/selectRow/chipRow/btnRow/textRow/infoLine/pickerRow`） |
| `buildSettingsModal` 区块装配顺序 | L6607–6921（body.append 于 L6900） |
| 各区块构建器 | 站点 L7283、效果 L6926、智能 L7028、存储 L7121、屏蔽 L7427、统计 L7521、媒体 L7569 |
| 决策管线 `decideImage` | L4384（顺序注释 L4381） |
| 背景图引擎逐元素判定 `processEl` | L5491（`decideUrl` L5531） |
| 站点档案 `resolveSiteProfile` | L1528（黑/白名单门 L1557） |
| `RuleLearner`（stem/hits/action） | L3842 |
| `Store.exportAll/importAll` | L692/L700 |
| 存储整仓导出/导入 UI | L7231/L7251（`downloadJsonFile` 模式内联两处） |
| test-browser UI 断言 | L753–762（`hasAccordion`、区块 id、chips 计数） |

## 2. 状态与数据模型

### 2.1 新增偏好（`DEFAULT_PREFS` + `loadState` 归一化）

```js
settingsLayout: 'center',        // 'center' | 'left' | 'right'
settingsWidth: 420,              // 抽屉宽度 px，clamp 320~600
elementRules: [],                // [{ id, pattern, selector, action: 'invert'|'protect', note, createdAt }]
```

- `loadState` 归一化：`settingsLayout` 非法值回退 `'center'`；`settingsWidth` 取整并 clamp；`elementRules` 过滤非对象项，`pattern/selector` 转字符串、`action` 枚举校验、`id` 缺失时补 `hash32(pattern|selector|action)`；总数超 200 截断保留最新（FIFO 对齐 `addManualOverride` 惯例）。
- 写入全部走既有 `savePrefs()`；属偏好而非运行态，不触碰"运行状态绝不落盘"红线。

### 2.2 元素规则存储

直接驻留偏好对象（与本站覆盖 `siteOverrides` 同层），不新建 `svi:` 键 —— 整仓备份/恢复自动覆盖它。

## 3. 元素规则决策语义

### 3.1 解析（`resolveSiteProfile` 扩展）

```js
profile.elementRules = (state.elementRules || []).filter(r => hostMatchesPattern(host, r.pattern));
```

- `pattern === '*'` 表示全部站点；其余复用 `hostMatchesPattern`（与黑/白名单同语义）。
- 纯函数、可单测；命中顺序 = 数组顺序，**首条命中生效**（UI 列表顺序即优先级，不引入特异性排序）。

### 3.2 图片管线接入点（`decideImage`）

新优先级链：**手动覆盖 > 元素规则 > 决策快照 > 学习规则 > 种子保护/强制 > 小元素门 > 策略门 > 像素**。

- 位置：手动覆盖判定之后、`decisionBySrc` 快照查找之前（显式配置必须压过缓存猜测，对齐 v3.1 "手动覆盖强制刷新快照" 教训）。
- 命中 `invert` → `recordDecision(src,'invert','element-rule', true)`（`force=true`，刷新快照）；`protect` → `('keep','element-rule', true)`。
- 快照原因码 `element-rule` 加入 `SKIP_REASON_ZH` / 状态徽章中文映射（"元素规则"）。
- 编辑元素规则后：`savePrefs()` → `prefsRevision++`（经既有 `savePrefs` 路径）+ `window.__svi_image_engine?.clearCacheAndRescan()`，维持 decide-once 不翻脸。

### 3.3 背景图引擎接入点（`BgImageEngine.processEl`）

- 在尺寸门槛后、URL 解析前：首条命中的元素规则
  - `protect` → `removeAttribute('data-svi-bginv')` + `elLastUrl` 记账后返回（永不反色）；
  - `invert` → 确认背景含 `url(` 后直接 `setAttribute('data-svi-bginv','true')` 并返回（用户显式指令，不等亮度判定）。
- 编辑规则后触发一次 `rescan()`（引擎已有该方法）。

### 3.4 上限与校验

- 单条 selector 为普通 CSS 选择器字符串；匹配一律经 `safeMatches`（try/catch，非法选择器静默不命中）。
- 总量 FIFO 200；`Store` 字节分块机制自动适用，无需新键。

## 4. 面板外壳与布局

### 4.1 三形态

```
.svi-modal-mask            —— 仅 'center' 形态显示遮罩（现状保留）
.svi-modal-window.layout-center  width: min(600px, 94vw); max-height: 86vh
.svi-modal-window.layout-left    position:fixed; top:0; bottom:0; left:0; height:100vh;
                                 width: var(--svi-settings-w); max-width: 92vw; border-radius: 0;
.svi-modal-window.layout-right   同上，right:0
```

- 遮罩监听：`center` 形态点遮罩关窗（现状）；`left/right` 形态不渲染遮罩背景色（`background: transparent; pointer-events: none;`，窗口本身 `pointer-events: auto`），document 级 click 监听"点在窗口外即关闭"。
- Esc 关闭：document keydown（模态开着时）。
- 头部右侧新增三态切换（分段按钮：居中/靠左/靠右），写 `state.settingsLayout` + `savePrefs()`，切换仅改类名与遮罩显示。
- 抽屉宽度拖拽：内侧边缘 6px 把手，pointer 事件拖动更新 `--svi-settings-w` 与 `state.settingsWidth`，钳制 320–600。
- `.svi-modal-body` 增 `overflow-x: hidden`。

### 4.2 行布局重构（消灭出界/横向滚动的根因）

- `.svi-modal-row` 改纵向堆叠：`flex-direction: column; align-items: stretch;`；删除 `.svi-modal-label-box` 的 140px 定宽（`labelBox` 中的 `width:auto` 内联同步移除）。
- `.svi-modal-controls { min-width: 0; flex-wrap: wrap; }`；`.svi-modal-select { max-width: 100%; }`；`.svi-modal-textarea` 已有 `width:100%` 保留。
- 滑杆行：标题/说明在上，滑杆 + 数值框 + 单位同一控件行（可换行）。
- `ui.selectRow` 增强（向后兼容）：options 支持 `describe` 字段，渲染后追加动态说明行 `svi-row-describe`，`sync()/change` 时按当前值更新 `textContent` —— 全部下拉的解释文字改走此通道。

## 5. 信息架构（最终装配顺序）

`buildSettingsModal` 重排为独立构建器，装配顺序：

1. **🎨 外观与画面**：预设色卡；悬停显示原图；画面亮度/对比度/饱和度/色相（原折叠抽屉"画面滤镜微调"）；过渡动画时长。
2. **🖼️ 图片反色**：智能图片策略（选项净化）；全浅色通用检测；预设色卡；目标色拾色器；浅色明度线/面积占比/目标色容差/正文图最小尺寸（原折叠抽屉"图片阈值"）；图片特效模式（选项净化）+ 亮度反色明度线/饱和上限 + 键色目标色/容差；本站特效模式跟随（站点覆盖入口移至站点区，此处不放）。
3. **🎬 视频**：视频特效引擎（选项净化，动态说明含"显卡加速"表述）；视频智能算法 4 滑杆（原折叠抽屉）；视频画面调节整块（开关/5 滑杆/4 预设钮）；时间线记忆。
4. **🌐 站点与规则**：本站开关组（启用/图片/视频/背景替换 + 新增本站特效模式跟随下拉）；站点管理模式 + 黑/白名单文本域；**元素规则编辑器**（R6）；学习规则（种子开关、命中阈值、本站列表）；内置规则摘要；重扫本页背景。
5. **🛡️ 颜色保护**：原色屏蔽（不变，标题下说明精简）。
6. **🖥️ 当前页媒体**：不变（保留惰性采集与 `#svi-sec-media` id）。
7. **💾 数据与备份**（合并原"存储"+"数据与反馈"，保留 id `svi-sec-stats` 供基准）：三组按钮行 —— 规则文件（导出/合并导入/替换导入）、全量备份（导出/导入/清空存储）、本地统计（复制/下载/清空）；存储后端徽章（中文）；键列表（中文名映射）；隐私说明（去 `STATS_KEY`/`svi:stats`）。
8. **💡 操作技巧**：原 hintBox 内容（去括号排版，改用列表）。

- 折叠抽屉删除；`advancedOpen` 偏好保留但不再消费（`loadState` 容错保留，避免旧数据报错）。
- 区块 id 保留：`svi-sec-site`、`svi-sec-shield`、`svi-sec-stats`（数据与备份沿用）、`svi-sec-media`、`svi-sec-fx`（改挂图片反色区）、`svi-sec-smart`（挂学习规则子块容器）。test-browser 的 `hasAccordion` 断言改为 `false`/移除，`chipsCount` 语义不变（预设 2 + 色卡 4 = 6 不变）。

## 6. 规则文件格式与导入导出

```json
{
  "kind": "svi-rules",
  "schema": 1,
  "version": "3.3.0",
  "exportedAt": "ISO-8601",
  "rules": {
    "siteMode": "all|blacklist|whitelist",
    "siteBlacklist": [], "siteWhitelist": [],
    "siteOverrides": {}, "elementRules": [],
    "shieldColors": [], "bgExcludeSelectors": [],
    "learned": { "<host>": { "rules": [ {stem, action, hits, lastAt} ] } }
  }
}
```

- 导出：组装上述对象 → `downloadJsonFile(name, data)`。
- 合并导入：数组类字段 `concat` 后按内容去重（`siteOverrides` 逐 pattern 浅合并、`learned` 按 host+stem 取 `hits` 高者）；`siteMode` 询问后沿用文件值（confirm 提示中说明）。
- 替换导入：上述七组字段整组覆盖，其余偏好不动。
- 导入校验：非对象/缺 `rules` → toast 报错；逐字段类型过滤（复用归一化思路，宁可丢弃坏条目）。
- 导入后统一：`savePrefs()`、`prefsRevision++`、`clearCacheAndRescan()`、`applyBackgroundReplace` 重评、刷新站点/存储/统计区块。

### 复用助手（解耦）

```js
function downloadJsonFile(filename, obj) { … }   // 现两处内联下载逻辑合并（存储备份/统计下载/规则导出共用）
function pickJsonFile(onParsed) { … }            // 现两处内联 file-input 逻辑合并（备份导入/规则导入共用）
```

UIController 内新增 `exportRulesFile() / importRulesFile(replace)`；存储与统计区块改为调用共享助手。

## 7. 文案净化清单（英文/代码 → 中文）

| 现文案 | 处理 |
|---|---|
| `完整反色 (CSS 滤镜)` / `关闭 (CSS 滤镜路径)` | 选项 `完整反色` / `关闭`；说明行写"经标准滤镜呈现" |
| `(GPU)` / `GPU 覆盖层逐帧渲染` | 说明行写"经显卡加速逐帧呈现" |
| `content:url 投递` 提示行 | "以替换图方式呈现，悬停可查看原图；Alt+点击临时还原；Alt+Shift+拖拽框选区域" |
| `#FFFFFF` 拾色预览 | 预览框只留色块，HEX 进 `title` 悬浮提示（`pickerRow` 调整） |
| 存储后端徽章 `chrome.storage.sync (云同步)` 等 | `浏览器云同步` / `浏览器本地` / `油猴脚本存储` / `页面本地存储` / `临时内存` |
| 键列表 `svi:prefs` 等 | 中文名映射：偏好设置/学习规则/时间线记忆/本地统计/手动覆盖记忆/其他数据（原名进 `title`） |
| 统计隐私行 `STATS_KEY / svi:stats` | "数据仅保存在浏览器本地，绝不自动上传；导出完全由你手动触发" |
| 媒体列表类型 `SVG` | `矢量图` |
| `⚙️ 详细参数细调页面 (滑动条+数值)` | `⚙️ 打开设置面板` |
| 折叠标题/按钮括号副标 | 全部去除（折叠抽屉已删除） |
| 下拉选项全部括号 | 选项只留短名 + `describe` 动态说明（智能图片策略/图片特效模式/视频特效引擎/时间线记忆/站点管理模式/作用范围/动作） |

单位（ms/%/px/°/次）、`Alt` 快捷键名、站点域名示例保留。

## 8. 测试计划

### test.js（Node，加载真实脚本）

- 新增：`resolveSiteProfile` 元素规则解析（`*` 全站、pattern 命中、不命中）——`elementRules` 注入 state 后断言 `profile.elementRules`。
- 新增：`loadState` 对 `elementRules/settingsLayout/settingsWidth` 的归一化（坏类型回退、FIFO 200）。
- 既有用例全部保持通过（管线插入层不改动既有优先级断言）。

### test-browser.js（CDP 基准）

- 更新：`hasAccordion` 断言移除；区块 id 断言不变。
- 新增场景：经 `__svi` 调试句柄注入一条 `elementRules`（`protect`）→ 重扫 → 断言原判定反色的测试图变 `keep`；删除规则恢复。注意固定 profile 目录运行前必被清空，不违反持久化红线。

### 全量门禁

`node --check` → `node test.js` → `node test-browser.js`（Chrome, 端口 9222, `--enable-unsafe-swiftshader`）→ `build-extension` → `pack`。

## 9. 风险与回滚

- **风险**：管线插入层改变快照原因码分布 → 基准对 `跳过:策略` 等中文断言按新映射核对；`processEl` 早退影响 `elLastUrl` 记账 → protect 分支同样记账，避免反复进入。
- **风险**： stacked 行布局使面板更高 → 居中形态 86vh 内滚动不变；停靠形态全高滚动；无横向滚动兜底 `overflow-x: hidden`。
- **回滚**：单文件单任务提交，revert 即回 v3.2 行为；`elementRules` 字段旧代码自动忽略（`loadState` 宽松），向前向后兼容。
