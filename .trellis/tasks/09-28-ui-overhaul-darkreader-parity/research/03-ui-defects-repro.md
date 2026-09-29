# UI 缺陷复现与根因定位报告（03）

> 角色：UI 缺陷复现与根因定位工程师（只读 + 只在 `research/` 写）。
> 目标文件：`universal-smart-invert.user.js`（17293 行，运行版本 **v0.6.10**）+
> `scripts/extension-src/{options,popup}.*`。
> 环境：Windows 11 + `C:\Program Files\Google\Chrome\Application\chrome.exe`，
> 经 CDP（headless=new）实测。**未修改任何产品代码**。
>
> 复现探针（都在本目录，可重跑）：`probe-ui-defects{,-2,-3,-4,-5,-6,-7,-8}.js`
> 机器可读证据：`probe-ui-defects.json` / `-2.json` / `-3.json`
> 截图：`shots/*.png`

## 结论速览

| # | 用户描述 | 状态 | 根因定位（file:line） | 修复类型 |
|---|---|---|---|---|
| 1 | 没有像 Dark Reader 一样的 UI | 已实测（截图留证） | 观感层面，见 §1 | CSS/DOM（另有人做 DR 对比） |
| 2 | 每个按钮没有边框、边界 | **已实测** | 边框 token 取值过低 + 部分规则缺失 + token 死代码（§2） | CSS |
| 3 | 两个设置面板冗余 | **已交叉确认** | 同一批 prefs 键三处渲染（§3） | DOM/交互（信息架构） |
| 4 | 侧边浮动按钮没有关的地方 | **已实测** | 面板卡无关闭控件；仅 click-outside 一条路径（§4） | DOM 结构 + 交互逻辑 |
| 5 | 面板莫名取色器、导致关不掉 | **已实测（机制坐实）** | 透明全屏 `<input type=color>` 覆盖视口 + Escape 抛 TypeError（§5） | CSS + 交互逻辑 |
| 6 | 存在设置冗余 | **已交叉确认** | 同 §3（§6） | 信息架构 |

---

## §1 缺陷 1：没有像 Dark Reader 一样的 UI（观感层）

**性质：** 观感评价，非缺陷机理。按要求只留证不深挖（DR 对比另有其人）。

**证据截图：**
- `shots/defect5-b-global-tab.png` —— 设置模态「全局」页签整体观感
- `shots/defect1-2-modal-site-tab.png` —— 设置模态「本站」页签
- `shots/defect4-capsule-panel-open.png` —— 页内胶囊「智能反色控制」小卡

**客观补充（供 DR 对比者引用）：** 设计 token 块在
`universal-smart-invert.user.js:3910-3964`（`v6.4-TOKENS-START/END`），注释自述
「照搬 Dark Reader 深青调」；但控件的圆角/描边**并没有全部消费 token**（见 §2）。

---

## §2 缺陷 2：每个按钮没有边框、边界

### 复现（实测）
`node .trellis/tasks/09-28-ui-overhaul-darkreader-parity/research/probe-ui-defects.js`
→ `probe-ui-defects.json.results.buttonBorders`：对每个按钮取 `getComputedStyle().border*`。

### 实测结论：**不是被更高优先级规则覆盖**，computed style 与规则完全一致；问题是**取值 + 缺失 + token 死代码**三者叠加。

**(a) token 取值过低（主因，量化后可解释"看起来没边框"）：**

| 选择器 | 边框声明 | file:line | 与底色对比度 |
|---|---|---|---|
| `.svi-btn` | `1px solid var(--svi-ctl-hover)` | `4404-4414`（border 在 `4407`） | **≈ 1.38:1** |
| `.svi-chip` | `1px solid var(--svi-ctl-hover)` | `4431-4441`（border 在 `4434`） | **≈ 1.38:1** |

`--svi-ctl-hover: #193945`（`:3923`）作为**描边色**，压在 `--svi-ctl-bg: #141e24`（`:3922`）上，
相对亮度 L ≈ 0.036 vs 0.012 → 对比度 **≈ 1.38:1**。WCAG 对非文字 UI 组件的最低要求是 3:1，
1.38:1 在视觉上等同于"没有边框"。

**(b) 胶囊面板类按钮：边框存在但硬编码为低透明度白，且未走 token：**

| 选择器 | 边框声明 | file:line | 对比度 |
|---|---|---|---|
| `.svi-action-btn` | `1px solid rgba(255,255,255,0.12)` | `4101-4126`（border 在 `4104`） | ≈ 1.44:1 |
| `.svi-pip-btn` | `1px solid rgba(255,255,255,0.12)` | `5187-5202`（border 在 `5190`） | ≈ 1.44:1 |
| `.svi-preset-btn` | `1px solid rgba(255,255,255,0.08)` | `4136-4153`（border 在 `4139`） | 更低 |
| `.svi-open-modal-btn` | `1px solid rgba(83,161,179,0.3)` | `4155-4171`（border 在 `4158`） | 中 |

**(c) 规则真缺失（完全没有 border 声明）：**

| 选择器 | file:line | 实测 computed |
|---|---|---|
| `.svi4-tab`（本站/全局页签） | `5418-5430`（`border: none` 在 `5419`） | `0px none` |
| `.svi-modal-close`（右上角 ×） | `4706-4715`（`border: none` 在 `4708`） | `0px none` |

**(d) 设计 token 是死代码：**
```
grep -n "var(--svi-border-w)" universal-smart-invert.user.js   → 0 处
grep -n "var(--svi-border)"   universal-smart-invert.user.js   → 0 处
```
`--svi-border: #316e7d`（`:3928`，本项目**本该用的描边色**，对比度高得多）与
`--svi-border-w: .125rem`（`:3955`，规定 2px）**在全仓从未被引用过一次**；所有按钮都各自
硬编码 `1px` + 低成本色。这正是"token 取值问题 + 规则缺失"，不是层叠覆盖。

### 修复所需改动类型：**CSS only**
把 `.svi-btn`/`.svi-chip` 的 `border-color` 换成 `var(--svi-border)`、宽度统一走
`var(--svi-border-w)`（或按需保留 1px 但换色），并给 `.svi4-tab` / `.svi-modal-close` 补可辨边界。

---

## §3 + §6 缺陷 3/6：设置面板冗余（交叉确认）

### 已确认：三处界面**同源于同一批 prefs 键**

- **单一真源**：`SVI_SETTINGS_SCHEMA`，`universal-smart-invert.user.js:12522-12673`
  （`v6.4-SETTINGS-SCHEMA-START/END` 块，**100 条 item**）。注释明确：标签文案
  「照搬面板自身的行定义（构建期机械抽取，非另写一份）」。每条 item 的 key 必须存在于
  `DEFAULT_PREFS`（`:110`）。
- **扩展 options 全页**：`scripts/extension-src/options.js:1-22,335-350` —— **按 schema 渲染全部 100 项**
  （`for (const group of SCHEMA)`）。它的注释（`options.js:3-6`）自述三份东西全来自构建期抽块：
  `settings-schema.js` / `ui-controls.js` / `options.html` 注入的面板 CSS。
- **页内模态（本站/全局页签）**：`buildSettingsModal` `:13469-13669`，全局页签下
  `buildAppearanceSection` / `buildImageSection` / `buildRegionSection` / `buildVideoSection` /
  `buildActionsSection` / `buildReadabilitySection` / `buildDynamicThemeSection` /
  `buildSiteListsSection` / `buildSchedulerSection` / `buildShieldSection` / `buildDataSection`
  （`:13554-13565`）—— 逐条写的就是 schema 里那批同名键（如 `shieldColors` 在
  `buildShieldSection:15449-15467` 与 schema `:12601` 同键同形）。
- **扩展 popup**：`scripts/extension-src/popup.js:50-106` —— 复刻其中 **6 个键**
  （`presetId` / `hoverRestore` / `imagePolicy` / `imgFxMode` / `imageInvert` + 站点电源），
  且**同一份写协议**（`{type:'svi-set-pref', key, value}`，注释自述
  "Every command reuses the settings panel's own handlers, so semantics cannot diverge"）。

**冗余的确切形态**：同一份 `svi:prefs`（Store，`svi:prefs.rev` 版本仲裁）被 **3 个 UI 面**渲染；
popup 额外提供**两个入口**分别打开模态与 options 页（`popup.js:108-119`：
`svi-open-settings` → 模态；`openOptionsPage` → options）。即"一个存储、三扇门、键集互相包含"。

> 全量测绘按分工由他人负责；本节仅做交叉确认。

### 修复所需改动类型：**DOM 结构 / 交互逻辑（信息架构）**，非逐条改 CSS。

---

## §4 缺陷 4：侧边浮动按钮没有关的地方

### 复现（实测）
`probe-ui-defects.js` → `probe-ui-defects.json.results.capsule`：
```json
{ "rootExists": true, "pillTag": "DIV", "pillIsButton": false, "cardShown": true,
  "cardButtons": ["svi-action-btn :: 视频:关", "svi-action-btn active :: 智能:开",
                  "svi-action-btn active :: 图片:开", "svi-action-btn :: 背景:关",
                  "svi-pip-btn :: 画中画", "svi-preset-btn selected :: 柔和灰",
                  "svi-preset-btn :: 纯黑", "svi-open-modal-btn :: 打开设置面板"],
  "closeCandidates": [] }
```

### 已确认事实
1. **面板卡里没有任何关闭控件**：`buildUI` `:13311-13452`，卡片内容 =
   header + btnRow + presetRow + 「打开设置面板」+ footer（`:13436`），**无 × / 无关闭按钮**。
   `closeCandidates` 为空数组（按 title/aria/文本扫描 `关闭|close|×` 全无命中）。
2. **触发药丸是个 `div` 不是 `button`**（`:13329-13333`，`this.pill = document.createElement('div')`）
   → 不可键盘聚焦、无 aria、无原生 button 语义。
3. **唯一的关闭路径是 click-outside**：
   ```js
   // :13445-13449
   document.addEventListener('click', (e) => {
     if (!this.root.contains(e.target)) { this.panel.classList.remove('show'); }
   });
   ```
   外加"再点一次药丸"的 toggle（`:15889-15895 togglePanel`）。
4. **没有 Esc 关闭药丸面板**：`grep keydown` 全仓只有 4 处，唯一挂在 `document` 上的
   Escape 处理（`:13624`）**只针对模态**（`this.modalMask`），与胶囊面板无关。

### 风险判定（回答"移动端/无外部可点击区域是否等于关不掉"）
- 药丸是**贴边 14px 竖条**（`.svi-trigger-pill` `:3993-4009`），面板卡定位
  `top:-60px; right:22px`（`:4041-4059`）。面板展开后，若卡片遮住药丸或视口边缘无空白，
  用户只能"再点药丸"或"点面板外空白"——**没有任何显式的、语义化的关闭入口**。
- 触屏上 click-outside 依旧成立（tap 会冒泡到 document），所以**不是绝对关不掉**，
  但**缺少可发现的关闭控件**是确凿缺陷（对照 DR：面板自带关闭 affordance）。

### 修复所需改动类型：**DOM 结构 + 交互逻辑**
在 `.svi-card-header` 加关闭按钮（走 `SviControls` 图标，`:13440-13447` 处接
`togglePanel(false)`），并给胶囊面板补 Esc 处理。

---

## §5 缺陷 5（重点）：面板莫名取色器，导致关不掉

### 5.1 结论先行

**取色器不在"浮动按钮的面板卡"里**（`svi-panel-card` 内无任何 color input）。
它在**设置模态**（`.svi-modal-window`）里。确切机制是：

> `.svi-color-input-native` 是 `position:absolute; inset:0; width:100%; height:100%; opacity:0`
> （`:5000-5007`）。在 `SviControls.pickerRow` 里它被放进**有** `position:relative` 的
> `.svi-color-input-wrap`（`:4994-4999`），因此正常收缩成小色块按钮。
> 但在 `SviControls.colorList` 里它被放进**没有** `position` 的
> `.svi-color-picker-controls`（`:4989-4993`）——于是"定位祖先"一路上溯到
> **`.svi-modal-mask`**（`position:fixed; inset:0`，`:4532-4543`），
> **这个不可见的取色 input 被拉伸成整屏大小，并绘制在所有静态模态内容之上**。
> 只要「全局」页签处于激活态（`.svi4-panel` 不是 `display:none`），
> **整个视口就变成了一个巨大的隐形取色按钮**。

### 5.2 元素出处（file:line）

- 唯一制造者是「原色屏蔽」区块的 `colorList` 控件：
  `buildShieldSection` `:15449-15467` → `SviControls.colorList` `:13069`；
  原生 input 建于 `:13078`，挂进 `.svi-color-picker-controls` 于 `:13082`。
- 另两处色块（`pickerRow`：`:12910-12931`，用于「目标色图拾色器」`:13810` 与
  「键色反色·目标色」`:13874`）**定位正确**，实测 rect 为 `34×24`（见下）。

### 5.3 实测证据（`probe-ui-defects-2.js` → `probe-ui-defects-2.json`）

「全局」页签激活后，三个 `input[type=color]` 的几何：

```json
{ "rect": [774, 1144, 34, 24],  "fullViewport": false, "containingBlock": "svi-color-input-wrap",   "section": "图片反色…" },
{ "rect": [774, 1728, 34, 24],  "fullViewport": false, "containingBlock": "svi-color-input-wrap",   "section": "图片反色…" },
{ "rect": [0, 0, 1100, 900],    "fullViewport": true,  "containingBlock": "svi-modal-mask show",    "section": "原色屏蔽…" }
```

**命中测试**（`document.elementFromPoint`）——「全局」页签下，视口左上/右上/左下/左侧中部/正中
**全部**返回 `INPUT.svi-color-input-native[type=color]`：

```json
"hit": { "topLeft": "INPUT.svi-color-input-native[type=color]",
         "topRight": "INPUT.svi-color-input-native[type=color]",
         "bottomLeft": "INPUT.svi-color-input-native[type=color]",
         "outsideLeftMid": "INPUT.svi-color-input-native[type=color]",
         "center": "INPUT.svi-color-input-native[type=color]" }
```

对照：「本站」页签下同一批采样点返回 `DIV.svi-modal-mask` / `SELECT.svi-modal-select`
（因为 `globalPanel` 此时 `display:none`，input 尺寸塌成 0）。**这就是"为什么是"全局"页签才发作"**。

> 补充：把「原色屏蔽」滚动出视野也没用——input 的定位祖先是 fixed 遮罩，
> 实测滚动后 rect 仍是 `[0,0,1100,900]`、`fullViewport: true`（见 `shieldScrolled`）。

### 5.4 真实输入实测（`probe-ui-defects-3.js` → `probe-ui-defects-3.json`）

用 CDP `Input.dispatchMouseEvent` 发**真鼠标事件**（非 `dispatchEvent` 合成），
以 `document.activeElement` 判定浏览器把点击路由给了谁：

| 场景 | 操作 | activeElement | 模态是否关闭 |
|---|---|---|---|
| 对照：本站页签 | 点遮罩空白 (125,450) | `BODY` | ✅ **关闭** |
| 全局页签 | 点遮罩空白 (125,450) | `INPUT.svi-color-input-native[type=color]` | ❌ **不关** |
| 全局页签 | **点模态右上角关闭按钮** (821,91) | `INPUT.svi-color-input-native[type=color]` | ❌ **不关** |

→ 就算精确点在"关闭"按钮上，点击也被那层隐形取色 input 吃掉。
（真实浏览器里这就是"唤起系统取色器"，本机 headless 下系统弹窗不渲染，
但**点击路由结论与浏览器一致**——这属于"取色器弹出"的实测代理证据。）

### 5.5 Escape 也关不掉：另一处独立缺陷（TypeError）

实测（`probe-ui-defects-4/-5/-7.js`）：**Escape 在任何页签、任何焦点下都关不掉模态**。
`probe-ui-defects-7.js` 捕获到真实异常：

```
TypeError: this.cancelRegionMask is not a function
    at HTMLDocument.<anonymous> (<anonymous>:13628:18)
```

- 调用点：`document.addEventListener('keydown', …)` 的 Esc 处理
  **`:13624-13632`**，第 `13628` 行 `if (this.cancelRegionMask()) return;`
- 定义点：`cancelRegionMask()` 只存在于 **`class ImageInvertEngine`**（类起 `:8119`，方法 `:8684`）；
  **`class UIController`（起 `:13251`）根本没有这个方法**。
- 运行时验证（`probe-ui-defects-8.js`）：
  ```json
  { "uiCtor": "UIController", "uiHasCancelRegionMask": "undefined",
    "uiHasArmRegionMask": "undefined", "uiHasAddRegionMask": "undefined",
    "uiRegionMethods": ["buildRegionSection", "regionCorrectionEntry"],
    "engineCtor": "ImageInvertEngine",
    "engineRegionMethods": ["armRegionMask","cancelRegionMask","addRegionMask","bindRegionMask"] }
  ```
- 后果：Esc 处理**每次都在这行抛异常中断**，永远走不到
  `if (this.modalMask.classList.contains('show')) this.closeSettingsModal();`。
  实测 `closeSettingsModal` 计数：合成 Esc → 0 次，真 Esc → 0 次，直接调用 → 1 次
  （`probe-ui-defects-5.js`）。
- **附带同类缺陷**：`this.armRegionMask()` 在 `:14474`（元素动作区块的「区域遮罩（拖拽）」按钮）
  同样是 UIController 上的死调用 → 该按钮点击即抛 TypeError。

### 5.6 完整可复现操作序列

1. 任意页面点右侧胶囊 → 弹「智能反色控制」小卡 → 点「打开设置面板」。
2. 模态出现（默认停在「本站」页签，此时一切正常）。
3. **点「全局」页签**。
4. 从此：点模态内**任何位置**（含右上角 ×、「完成并关闭」、「恢复默认值」、空白遮罩区、
   甚至「本站」页签本身）→ 都只唤起系统取色器，模态**无任何鼠标关闭路径**。
5. 按 Esc 也无效（§5.5 的 TypeError，实际全页签皆然）。
6. **只能刷新页面**。

### 5.7 修复所需改动类型

- **CSS（最小且首选）**：给 `.svi-color-picker-controls`（`:4989`）补 `position: relative`，
  或把 `.svi-color-input-native` 的绝对定位限定在专用包裹层内。
- **交互逻辑**：修 `:13628` → 改为对 UI 侧持有者调用
  （如 `window.__svi_image_engine?.cancelRegionMask()`），并顺带修 `:14474` 同类死调用；
  建议模态的 Esc 处理加 try/catch 兜底，避免一处异常废掉整条关闭路径。

---

## 附：未实测 / 待确认

- 系统/浏览器原生取色器弹窗本身在 headless 下不渲染，§5.4 的"取色器弹出"是
  由**点击路由实测 + 元素几何**推出的（结论可靠，但非"看见弹窗"级证据）。
- 扩展 `options.html` / `popup.html` 的**渲染外观**未单独截图（CSS 与面板同源；
  如需可另跑扩展形态探针）。
- 用户口径"面板"同时可能指胶囊小卡与设置模态；本报告对两者都做了定位（§4 / §5）。
