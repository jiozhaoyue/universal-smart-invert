# 02-VERIFY · 对《02 · Dark Reader UI 逆向解剖》的对抗性复核（红队）

> 任务：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity`
> 角色：对抗性复核员（只读；唯一产出为本文件）
> 日期：2026-09-28
> 被审对象：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity/research/02-darkreader-ui-anatomy.md`（下称「原报告」）
> 复核手段：**独立重取上游** `darkreader/darkreader` tag `v4.9.133`（tarball 解包 + GitHub raw），逐行读源码；**独立重扫本仓**用户脚本 / popup.html / options.html / test.js。
> 说明：本复核**不采信原报告的任何转述**，只采信我自己拉到的一手源码。凡原报告的 file:line 与我的读出一致者，标 ✅；不一致或过头者，标 ❌/⚠️。

---

## ① 复核结论（可信度评级）

**评级：需修正后采用（方向可信、事实层有 3 处必须修正的过头结论，分类层有 3 处会引发 AC 互相打架的错误归类）。**

- **可用部分（无需返工）**：第 1、2 条（上游定源、版本、vendor 边界、「只搬颜色没搬控件形态」的大方向）；第 3 条的**方向**（DR 核心控件直角 + 2px 描边 vs 本仓圆角）；第 4、5、6 条的**主体事实**（开关是两半带文字、下拉/滑块/数值/复选自绘、取色避开 `<input type="color">`）。这些我逐条复现成功，可直接作为 `design.md` 的基准。
- **必须修正（事实层）**：
  - 第 3 条「**全** 2px 描边」→ 上游有 `@size-border-inner: 0.0625rem`（1px），且**多处使用**（复核员已先行指出）；我另找到 §3.2「**唯一**圆角是圆形」的 **7 处反例**（见 ③）。
  - 第 5 条「DR **无任何**原生表单控件」→ **不成立**：DR 的 `src/ui/` 里原生 `<input type="text|time|checkbox|file">`、`<button>`、`<textarea>` 全都在（见 ③-3）。
  - 第 6 条「DR **根本不打开 OS 级对话框**」→ **不成立**：`ui/utils.ts:23` 的 `<input type="file">` 打开 OS 文件对话框；`TimeRangePicker` 用 `<input type="time">`（原生时间选择器），且**就用在 popup 内部**（`more-toggle-settings.tsx:98`）（见 ③-4）。
- **必须修正（分类层，会引发 AC 打架）**：
  - 原报告把 **A2**（照搬 DR 2px `#316e7d` 描边）放进「可直接照搬」。但 PRD **AC3/P1** 明确要求按钮边框对相邻底色 **≥ 3:1**，而 DR 的 `#316e7d` 实测 **2.95:1**（我复算 2.948，与 PRD 自报一致）。叠上 **AC5**（「research/02 中列为可直接照搬的…全部落地」），**AC5 会强制落地一个 AC3 判死的东西** → 两条 AC 直接打架。
  - 原报告把 **A12**（`body{border:2px solid white}`）放进「可直接照搬」。但 R7/AC6 禁止产物里手写颜色，且 **`test.js` 的字面量正则只抓 `#hex`/`rgba()`，抓不到命名色 `white`**（见 ③-8）→ 落地即违规，且现guard抓不住。
  - 原报告把 **A11**（给胶囊补 `×`）放进「可直接照搬」，**却又在 §5.3 自述「不能直接抄」** → 自相矛盾。这是 **R1/AC1** 的核心缺陷项，DR **没有对应物**可搬，必须归入「需改造/不可照搬」。
- **必须补充（缺失项）**：原报告的两栏清单**没有任何一条 W 覆盖「关闭模型」**——即「DR popup 靠浏览器原生关闭」对**页内注入浮层**不可照搬。这是本项目最关键的不可照搬项，却缺席（见 ④）。

一句话：**原报告作为「DR 长什么样的说明书」是合格的；作为「哪些能照搬」的施工清单是不合格的**——它把 3 个会撞本仓硬规则的项错列进了「可直接照搬」。

---

## ② 逐条判定（成立 / 部分成立 / 不成立 + 上游源码证据）

### 条 1 · 上游 = v4.9.133（MIT）；vendor 里只有引擎、无 UI → **成立**

| 复核点 | 我的独立证据 | 判定 |
| :-- | :-- | :-- |
| 上游仓库/版本 | `vendor/darkreader/PROVENANCE.md`：上游 `github.com/darkreader/darkreader`（MIT，© Dark Reader Ltd.）、版本 **4.9.133**、SHA-256 `82619e…166`、355381 字节 | ✅ |
| vendor 只有引擎 | `grep -c 'type="color"' vendor/darkreader/darkreader.js` → **0**；`grep -c '<select' …` → **0**；PROVENANCE 原文「本目录只放**引擎**，不含 Dark Reader 的扩展外壳（popup / options / 图标 / 站点修复表）」 | ✅ |
| UI 取自 tag v4.9.133 的 `src/ui/` | 我从 `codeload.github.com/darkreader/darkreader/tar.gz/refs/tags/v4.9.133` 解包，`src/ui/` 下 **200 个文件**、`src/ui/controls/` **22 个目录**，全部复现成功 | ✅ |
| 「页内无 DR UI」 | `find src/inject`：cache/color-scheme-watcher/detector/dynamic-theme/(19 files)/fallback/index/style/svg-filter/utils；全树无交互式 UI 节点。唯一被创建的可见节点是 `inject/dynamic-theme/index.ts:634` 的 `overlay` div，但它 `pointerEvents='none'` 且是 `backdrop-filter:invert(100%)` 的**视觉滤镜层**，不可交互 | ✅（严格说「零 UI 节点」应写成「零**可交互**节点」，见 ③-9） |

> 复核员注：原报告 §1.3 把「20 个控件」写在标题却列了 **22** 个目录（`virtual-scroll`、`control-group` 严格说不算控件），并 §6.2 W4 又说「20 个独立控件文件」。三处数字（20/22）不自洽，属**轻微**瑕疵，不影响结论。

### 条 2 · 「只搬了颜色，没搬控件形态」→ **部分成立（大方向对，措辞过头）**

- **「没搬控件形态」：成立。** 我核对本仓侧：`SviControls.toggleRow`(`:12762`) 用原生 `type:'checkbox'`；`sliderRow`(`:12774`) 用原生 `type:'range'`+`type:'number'`；`selectRow`(`:12802`) 用原生 `<select>`(`:12804`)；`pickerRow`(`:12910`)/`colorList`(`:13069`) 用原生 `type:'color'`(`:12917`/`:13078`)；`checkRow`(`:13016`) 用原生 checkbox。两处开关（`.svi4-switch` `:5379`=52×28 `border-radius:999px`；popup `.switch` `:60`=40×22 + 16px 圆点）确为 iOS 药丸。→ **控件形态全面未搬，成立。**
- **「只搬了颜色」：过头（❌）。** 本仓 token 块（`:3909-3964`）不只搬了 12 个颜色，也**逐值搬了 DR 的全部度量**：`--svi-border-w:.125rem`=`@size-border`、`--svi-ctl-h:1.5rem`=`@size-control-inner`、`--svi-gap-sm/.75rem`=`@indent-small/large`、`--svi-tr-fast/slow:125/250ms`=`@time-fast/slow`、`--svi-fs-sm/.-lg`=`@size-text-small/normal/large`。原报告 §4.3 自己也逐条确认了这些一致 → **标题句「只搬了颜色」与原报告自己的 §4.3 冲突**。准确说法应是「**搬了颜色 + 度量 token，没搬控件形态**」（token 块与 `theme.less` 逐值对齐这一点原报告说对了）。
- **「token 块与 theme.less 逐值对齐」：成立。** 我实读 `src/ui/theme.less` 全文 44 行：20 个颜色值与本仓 12 个共享 token **逐值一致**（`#141e24/#53a1b3/#193945/#316e7d/#e96c4c/#db4245/#317c4e/#ffffff` 等），且**无任何 radius 变量**（`grep -iE '@radius|border-radius:' theme.less shared.less` → 空）✅。

### 条 3 · DR 控件全直角、全 2px 描边；本仓 8~12px 圆角，方向相反 → **方向成立，两个「全/唯一」过头**

- **方向成立**：DR 的 `controls/button|toggle|checkbox|select|dropdown|slider|updown|multi-switch|tab-panel|control-group` 的 `.less` 我逐个读过，**均无 `border-radius`**，且描边一律 `border: @size-border solid @color-border`（=2px `#316e7d`）。本仓 `--svi-r-sm/.375/.75rem`=`.25/.375/.75rem`（4/6/12px），popup 里 `select{border-radius:8px}`、`.tabs{12px}`、`.power-row{12px}`、`.chip{10px}`（`popup.html:55,80,90`）→ **圆角 vs 直角方向确为相反，成立。**
- **「全 2px」过头**：上游 `theme.less:28` 有 `@size-border-inner: 0.0625rem`（1px），且**确有多处使用**（复核员已先指出）。→ 建议改写为「**主描边 2px；另有 1px 内描边用于内部分隔**」。
- **「唯一圆角是圆形(50%)」不成立（❌）**：全 `src/ui/**/*.less` 里非 50% 的圆角至少 **7 处**，其中 3 处就在「方形控件/容器」上（见 ③-2）。原报告 §3.2 的同一句话里自己列了 `mobile-link__icon 0.4375rem`——那**既不是 50% 也不是圆**，**自相矛盾**。

### 条 4 · 开关：DR 是两个带文字半块（On/Off），不是药丸旋钮 → **成立**

- 组件：`src/ui/controls/toggle/index.tsx` —— 两个 `<span class="toggle__btn/toggle__on|toggle__off">`，各 `width:50%`，`onclick` 直接换值；`labelOn/labelOff` 为子节点。**没有 knob，没有 `input`。** ✅
- 样式：`controls/toggle/style.less` —— `border:@size-border solid @color-border`（2px）、`content-box`、`height:@size-control-inner`（24px）；`&::before{ background:@color-control-active(#316e7d); width:50%; left:50%; transition:left @time-fast(125ms) }`，`&--checked::before{ left:0 }`；`&__btn:hover:not(&--active){ background:@color-control-hover(#193945) }`。✅ 原报告 §3.3 Toggle 行**逐值准确**。
- 用在 popup 总开关：`popup/components/header/index.tsx` → `<Toggle checked={data.isEnabled} labelOn={getLocalMessage('on')} labelOff={getLocalMessage('off')} />` → **确为 On/Off 两个半块**。✅
- 本仓对照：`.svi4-switch`(52×28 `border-radius:999px` + 22px 圆点) / popup `.switch`(40×22 + 16px 圆点) → **药丸旋钮，成立**。✅

### 条 5 · 「DR 无任何原生表单控件（下拉/滑块/数值/复选全自绘）」→ **部分成立（"下拉/滑块/数值"对；"无任何"过头）**

我把 **200 个 `src/ui/` 文件全量 grep** 过后：

| 控件 | DR 实现 | 是否原生元素 | 判定 |
| :-- | :-- | :-- | :-- |
| 下拉 | `controls/select/index.tsx:116-161`：`TextBox`+`Button`+`VirtualScroll` 的 `<span>` 列表 | **无 `<select>`** | ✅ 原报告对 |
| 滑块 | `controls/slider/index.tsx`：纯 `<span>`+`onmousedown`/`touchstart`/`wheel`（`onPointerDown`/`onWheel`），**无 `<input type=range>`** | 无原生 range | ✅ 原报告对 |
| 数值 | `controls/updown/index.tsx`：`Button(−)`+`Track(div)`+`Button(＋)`，**无 `<input type=number>`** | 无原生 number | ✅ 原报告对 |
| 取色 | `controls/color-picker/index.tsx:88-146`：`TextBox(type=text)`+预览块+重置+`HSBPicker`；**无 `<input type=color>`** | 无原生 color | ✅ 原报告对 |
| **复选** | `controls/checkbox/index.tsx:12-18`：**`<input class="checkbox__input" type="checkbox">`**，靠 `style.less:20-22` 的 `display:none` 隐藏，视觉由 `::before/::after` `skewY(±45deg)` 画 | **有原生 checkbox** | ⚠️ 「全自绘」仅视觉成立；元素是原生 |
| **文本输入** | `controls/textbox/index.tsx:14`：**`<input class={cls} type={type}>`**，`type∈{'text','time'}` | **有原生 input（可见）** | ❌ 原报告 §3.3 称 TextBox 是「**唯一**用原生 input 的控件」→ 不成立 |
| **时间选择** | `controls/time-range-picker/index.tsx:46,61`：**`<input type="time">`** | **有原生 input（可见）** | ❌「无任何原生」反例 |
| **文件** | `ui/utils.ts:23`：`input.type='file'` | 有原生 input（隐藏） | ❌ 反例 |
| **文本域** | `stylesheet-editor/components/body.tsx`、`devtools/components/config-editor.tsx`：`<textarea>` | 有原生 textarea（前者用户可见） | ❌ 反例 |
| 按钮 | `controls/button/index.tsx:13`：**`<button>`** | 原生 | （利好：按钮本就原生） |

**结论**：准确表述是——「DR 避开了**天生带 OS 级 UI 的四类控件**（`select`/`range`/`number`/`color`），但**保留了语义/无障碍友好的原生 `input[text|time|checkbox|file]`、`<button>`、`<textarea>`，只自绘其外观**」。原报告的「无任何原生表单控件」是**过头结论**，而且这个过头恰好掩盖了 DR 真正值得学的方法论：**保留原生元素、只换皮**（见 ⑤ 的可访问性论证）。

### 条 6 · 取色：DR 用「hex 文本框 + 色块 + 自绘 HSB」，绝不弹 OS 对话框 → **（取色部分）成立；「绝不弹 OS 对话框」不成立**

- `controls/color-picker/index.tsx`：`TextBox`（`type=text`，回车 → `isValidColor` → `onChange`，不合法回落原值 `props.color`）+ `__preview` 块（`style.backgroundColor` 直写）+ `__reset`（`@icon-reset`）+ 聚焦时展开 `HSBPicker`。**全程无 `<input type="color">`。** ✅
- 点外部关闭：`index.tsx:82-86` `onOuterClick` 用 `e.composedPath().some(el => el === context.node)` 判定，聚焦时 `window.addEventListener('mousedown', onOuterClick)`，失焦移除。✅
- ① 我独立确认 `HSBPicker` 是**拖拽取色**：`hsb-picker.tsx` 用 `createSwipeHandler` + `onmousedown/onPointerMove`，色相轨道与 SB 二维区都是拖拽 → **原报告 W5 的技术事实成立**（但 W5 的**规范依据**有问题，见 ④-2 与 ⑥）。
- ② **「DR 根本不打开 OS 级对话框」不成立（❌）**：
  - `ui/utils.ts:23` `openFile()` → `<input type="file">` → **OS 文件选择对话框**（用于设置导入，见 `options` 的 import/export）。
  - `controls/time-range-picker/index.tsx:46,61` → `<input type="time">` → 原生时间选择器；且它**就用在 popup 内部**：`popup/components/header/more-toggle-settings.tsx:98`。
  - **对本项目有直接意义**：原报告把「关不掉的根因」归因为「DR 不打开 OS 对话框」——这是**因果过度外推**。DR 关不关得掉 popup 根本不在它的设计考虑里（popup 由浏览器负责关闭，见条 7）。真正成立的是**窄命题**：「DR 的**取色**不用原生对话框」；不成立的是**宽命题**：「DR 从不打开原生 UI」。

### 条 7 · DR 页内无 UI；popup **页头无 ×**（靠浏览器原生关闭），`×` 只在下滑面板与预设删除钮 → **事实成立，但对本项目是陷阱（原报告未列为不可照搬项）**

- **页头无 ×：成立（✅）。** 我实读 `popup/components/header/index.tsx` 全文：Header 只由 `logo(<a>)` + `header__site-toggle`（`SiteToggle` + more-settings 按钮）+ `header__app-toggle`（`Toggle` + more-settings 按钮 + 时间徽标）组成，**无任何关闭钮**。
- **`×` 的位置：基本成立（⚠️ 略有遗漏）。** 全 `src/ui/` 里 `✕`(`U+2715`) / `\2715` / `@icon-close` 出现在：`header/more-site-settings.tsx:33`、`header/more-toggle-settings.tsx:90`（下滑面板 `__top__close` ✅）；`theme/preset-picker/style.less:37`（预设删除 `content:"\2715"` ✅）；**另有原报告未列的**：`news/index.tsx:22`、`news/mobile-links.tsx:32`、`news-section/index.tsx:94`（新闻面板的 ×）与 `icons.less:3-4` 的 `@icon-close`（站点列表项移除）。属**同类（面板关闭/条目移除）**，不改变结论，但清单不完整。
- **陷阱（必须点明）**：DR 的关闭模型是「**浏览器弹窗原生关闭 + 面板内 ×**」双轨。本项目的面板是 **页内注入浮层**，没有「浏览器原生关闭」这一轨，**若照搬「页头无 ×」= 直接制造死锁**。原报告 §5.3 用散文提了一句「DR 无对应物可照搬…不能直接抄」，但：
  1. 它**没有把这条列进 §6.2 的 W（不可照搬）清单**——一条 W 都没有；
  2. 它反而把「给胶囊补 ×」写进 **§6.1「可直接照搬」的 A11**，并自述「借…范式（**范式，非直接复制**）」——**「借范式」本身就是改造，不是照搬**。
  → **结论：原报告把本项目最关键的一条不可照搬项，错放进了「可直接照搬」，且两栏表述自相矛盾。**

---

## ③ 「方向对但细节过头」条目清单（含我新发现的）

| # | 原报告的原话 | 过头处 | 一手证据 |
| :-- | :-- | :-- | :-- |
| 1 | 「**全** UI…**全** 2px 描边」（条 3） | 上游另有 1px 内描边且**多处使用** | `theme.less:28 @size-border-inner:0.0625rem`（复核员已先指出） |
| 2 | 「**唯一**的圆角是**圆形**语义：`border-radius:50%`」（§3.2） | **至少 7 处非 50% 圆角，其中 3 处就在方形控件/容器上**；且同句自己就列了 `mobile-link__icon 0.4375rem`（非 50%、非圆）→ 自相矛盾 | ① `options/site-list/site-list.less:7` `border-radius:@size-border`(2px)，落在 `.site-list` **容器**上；② `popup/theme/controls/mode.less:5` `@size-text-small-height/2`(0.4375rem)，落在 `.static-edit-button`**方按钮**上；③ `popup/components/engine-switch/style.less:18` 同值，落在 `__css-edit-button`**方按钮**上；④ `popup/components/news/style.less:221` `5%`；⑤ 同文件 `:246` `0.4375rem`；⑥ `popup/style.less:161` `0.4375rem`；⑦ `popup/style.less:144-145` `.mobile-link` `border-{bottom,top}-left-radius:@size-text-normal-height`(1rem) |
| 3 | 「DR **无任何**原生表单控件」（条 5） | 原生控件（可见）确实存在 | `<input type="text">` `textbox/index.tsx:14`；`<input type="time">` `time-range-picker/index.tsx:46,61`；`<input type="checkbox">` `checkbox/index.tsx:12-18`；`<input type="file">` `ui/utils.ts:23`；`<textarea>` `stylesheet-editor/components/body.tsx`；`<button>` `button/index.tsx:13` |
| 4 | 「DR **根本不打开** OS 级对话框」（§5.4 结论） | 文件/time 输入都会打开原生 UI；time 输入**就在 popup 里** | `ui/utils.ts:23`；`time-range-picker/index.tsx:46,61` 用于 `popup/.../more-toggle-settings.tsx:98` |
| 5 | 「TextBox…（**唯一**用原生 input 的控件）」（§3.3） | 至少还有 checkbox/time/file 三类 | 同 #3 |
| 6 | 「只搬了**颜色**」（条 2 标题） | 度量 token 也逐值搬了 | 本仓 `:3950-3963` vs `theme.less:27-44`；原报告 §4.3 自证 |
| 7 | 「`--svi-r*`| ❌ **DR 全 UI 无圆角**」（§4.2） | 同 #2 | 同 #2 |
| 8 | 「A12：popup 补 `body{border:2px solid white}`」（§6.1） | 这是**手写颜色**，撞 R7；且**现守卫抓不住** | `test.js:5099-5106` 只匹配 `/#[0-9a-fA-F]{3,8}\b/` 与 `/rgba?\(...\)/`，**不匹配命名色 `white`**（我在 `popup/style.less:397-399` 实见 `body{border:2px solid white}`） |
| 9 | 「DR 页内…**零 UI 节点**」（§1.3 尾注） | 有 1 个注入节点（视觉滤镜层，不可交互） | `inject/dynamic-theme/index.ts:634-643` `overlay`（`pointerEvents='none'`）；应写「零**可交互**节点」 |
| 10 | 「`.ext-disabled` **整体**降透明」（A13） | DR 只对 **header site-toggle + tab-panel** 两个区域降透明 | `popup/style.less:124-138`：`.ext-disabled{ .header__site-toggle,.tab-panel{opacity:.5;pointer-events:none} }`（未覆盖 app-toggle、footer） |
| 11 | 「20 个控件」/「20 个独立控件文件」 | 实为 **22 个目录** | 我 `ls src/ui/controls` → 22 dirs（+`index.ts`/`style.less`/`utils.ts`） |
| 12 | 「`×` 只在**下滑面板与预设删除钮**上」（条 7） | 另有新闻面板 ×3 与 `@icon-close` | 见条 7 证据 |

---

## ④ 「不可照搬项」清单（**尤其「页头无 ×」这类会让页内面板死锁的**）

> 判定口径：DR 有、但**照搬会撞本仓硬规则或直接制造缺陷** → 必须改造。

| # | 不可照搬项 | 为什么不可照搬 | 正确处置 |
| :-- | :-- | :-- | :-- |
| **N1（原报告完全缺失）** | **「popup 页头无 ×，靠浏览器原生关闭」** | 本仓面板是**页内注入浮层**，没有「浏览器原生关闭」这一轨；照搬 = 用户**只能点面板外**才能关 → 正是 R1/AC1 点名的死锁（原报告 §5.3 已实测本仓 `.svi-card-header` `:13340-13347` 只有标题+徽标、零关闭控件） | **必须新增显式关闭控件**（页内面板自建 `×`/收起钮），DR 只提供「下滑面板 `__top__close`」的**结构参考**，不是可照搬物 |
| **N2（原报告完全缺失）** | **「DR 页内无 UI」⇒ 胶囊 / 页内模态整套视觉无对应物** | DR 无页内面板形态，胶囊/模态的**视觉与关闭/交互**都得自设计 | 只能借 DR 的**组件词汇**（Toggle/CheckBox/…）+ 面板范式，视觉自建 |
| **N3（原报告缺失，且被错列为 A2）** | **照搬 DR 的按钮描边色 `#316e7d`** | 对底色 `#141e24` = **2.95:1 < 3:1**，撞 AC3/P1（P1 原文点名要 `≥3.0`） | 取一个**达标且贴近 DR 气质**的描边色（如提亮后的 `#3f7f8e`~`#4a8fa0` 一档），并在 `design.md` 写明「与 DR 的偏离」 |
| **N4（原报告缺失，且被错列为 A12）** | **`body{border:2px solid white}` 字面量** | 撞 R7/AC6（产物零颜色字面量）；且现守卫抓不到命名色 | 走 token（如 `rgb(var(--svi-white-rgb))` 或新增 `--svi-frame`），并**顺手补 guard 覆盖命名色** |
| **N5（原报告 W5，依据不足）** | **DR 的 HSB **拖拽**取色（拖轨道/拖色域）** | 事实成立（`createSwipeHandler`），但原报告引用的规范依据（spec「无绘制型手势」）原文禁的是**套索/拖拽画框/笔刷**——拖滑块/拖色相轨道**不属「绘制型手势」**（本仓本就已发 `<input type=range>`） | 采纳 W5 的**产出**（离散色板点选）可以，但**别把理由写成「spec 禁止拖拽」**——该理由不成立；应写成「点选板更省代码、更稳、无需 pointer 事件」 |
| N6（原报告 W1） | Open Sans TTF 外链 | nocdn/单文件约束 | 系统字体栈 / base64 子集内联（用户拍板） |
| N7（原报告 W2） | 图标 `background-image:url(assets/images/*.svg)` | 图标唯一来源 `SviControls.ICONS`，禁 emoji/禁调用点手写 `<svg>` | 只借造型语义，在 ICONS 表重建 |
| N8（原报告 W6/W7/W8/W11/W12/W9/W10） | popup 尺寸 240×480、per-URL preset 数据模型、DR 的四滑块信息架构、BEM 类名、硬编码 top 公式、Overlay 语义、控件字色 | 分别是「尺寸不同/语义不同/内容不同/命名纪律/结构不同/语义不同/用户需拍板」 | 见原报告 §6.2（这些 W 基本站得住，我未发现反例） |
| **N9（原报告缺失，新增）** | **R6「卡片式设置分组」 vs DR「无卡片」** | PRD R6 明写「popup 采用…**卡片式设置分组**」，而原报告 §2.6 已证明 DR **全 UI 无「圆角卡片+阴影」词汇**（DR 用 `section`+`居中小字描述`） | 二选一必须**用户拍板**：① 严格照搬 DR ⇒ **取消卡片**、改平铺 section（与 R6 字面冲突）；② 保留卡片 ⇒ **明确这不是 DR 视觉**（与"对齐 DR"目标部分冲突）。原报告两处都写了，却**没把矛盾标出来** |

---

## ⑤ 全面照搬 vs 部分照搬的代价对比（文件 / 改造点数量 / 可访问性损失）

### 5.1 命中面（我实测的调用点计数）

| 建造器 | 调用点 | 现实现 |
| :-- | --: | :-- |
| `sliderRow` | **45** | 原生 `range` + 原生 `number`（`@12774-12799`） |
| `toggleRow` | **27** | 原生 `checkbox`（`@12762-12771`） |
| `selectRow` | **14** | 原生 `<select>`（`@12802-12828`） |
| `pickerRow` | **3** | 原生 `type=color`（`@12910-12931`） |
| `colorList` | **1** | 原生 `type=color`（`@13069+`，`:13078`） |
| `SviControls.*` 合计 | **136** | — |
| popup.html | 1 `.switch` + **2 原生 `<select>`**（`#policy`/`#imgfx`） | — |

**好消息**：调用点集中在 **6 个建造器**内（改建造器不动 90~136 个调用点）。**坏消息**：有 1 处调用点依赖返回句柄——`@16405 this.modeSelect = modeRow.select`，自绘下拉后该句柄语义变化，须改为取值接口。

### 5.2 全面照搬（照 DR 控件形态重写全部表单控件）

- **触及文件（5~6 个）**：
  1. `universal-smart-invert.user.js`：**6 个建造器重写** + `injectStyles` CSS 模板**约 30 条新类规则**。参照 DR 等价 TSX 体量：slider 240 + select 164 + updown 84 + toggle 49 + checkbox 23 + color-picker 158 + hsb-picker 220 ≈ **940 行** TSX → 手写 vanilla 约 **400~600 行 JS + 200~300 行 CSS**；若再补 DR 自己都没做的键盘支持，**+150 行以上**。
  2. `scripts/extension-src/popup.html`：`.switch`→两半带文字 Toggle；**2 个原生 `<select>`→自绘**；`.power-row`/`.tabs`/`.chip` 视觉。
  3. `scripts/extension-src/popup.js`：`#power`/`#policy`/`#imgfx` 的 DOM 绑定改写。
  4. `extension/`（重建）+ `extension/ui-controls.js`（构建时从用户脚本抽取，见 `build-extension.js:10`）。
  5. `test.js`：R2 建造器清单、可能新增自绘 DOM 断言（**注意 CRLF/LF 假红**，见 AGENTS.md）。
  6. `scripts/check-panel-overflow.js`（P8 已要求去硬编码）。
- **改造点数量**：建造器 **6**、CSS 规则 **~30**、popup.html 控件 **3**、popup.js 绑定 **3**、返回句柄调用点 **1**。
- **可访问性损失（关键，原报告未量化）**：DR 自身源码里——
  - `Toggle`：两个 `<span onclick>`，**无 `tabindex`/`role`/`keydown`** → **不可键盘操作**（`grep tabindex|role=|onkeydown` 于 `controls/` 仅命中 color-picker/select/time-range-picker）。
  - `DropDown`：`<span onclick>` → **不可键盘操作**。
  - `Select`：有原生 `TextBox`（可打字过滤），但选项是 `<span onclick>` → **无方向键选择**。
  - `Slider`：仅 `mousedown/touchstart/wheel`，键盘只处理 `Escape` → **不可键盘改值**。
  - 反过来，`Button`(原生 `<button>`)、`CheckBox`(原生 input，仅隐藏)、`TextBox`(原生 input)、`UpDown`(`<button>`×2) **保留原生元素 → 可键盘操作**。
  → **「忠实照搬」= 把本仓现有的 `原生 select / range / checkbox`（全都可键盘、可读屏）换成 DR 的 `span/div`（不可键盘）**，即**无障碍回退**。伏笔：DR 的**正确做法是"保留原生元素、只换皮"**（CheckBox/TextBox/Button/UpDown 皆如此），而原报告把「自绘」当成了目标本身。

### 5.3 部分照搬（推荐：只搬「不触碰无障碍」的形态）

- 直角化 + 2px 描边（颜色换达标值）→ **纯 CSS，0 新组件**。
- 页签方形 + 上下边框（`tab-panel`）→ **纯 CSS**。
- 取色器改「hex 文本框 + 预览块 + 重置」+ 离散色板 → **1 个建造器**，**可键盘**，直接治 R3。
- 开关：**保留原生 checkbox（隐藏）+ CSS 画两半**（正是 DR 的 CheckBox 套路）→ 观感达成且**键盘仍可用**。
- 胶囊 `×` / 收起入口 → **1 处 DOM + CSS**。
- **预估**：`universal-smart-invert.user.js`（1 文件）+ `popup.html`(+`popup.js`)，改造点 **约 12~15 处**，**无 a11y 回退、无 940 行移植债**。

---

## ⑥ 被错误归类或遗漏的条目

### 6.1 A 栏（「可直接照搬」）中的错误归类

| 原编号 | 原报告归类 | 我的判定 | 理由 |
| :-- | :-- | :-- | :-- |
| **A2** | 可直接照搬 | ❌ **归入需改造** | 照搬 `#316e7d` = 2.95:1，撞 AC3/P1；叠 AC5 会让两条 AC 打架（见 ①） |
| **A11** | 可直接照搬 | ❌ **归入不可照搬/需改造** | DR 无页内面板；原报告 §5.3 自述「不能直接抄」，却列进 A 栏（自相矛盾） |
| **A12** | 可直接照搬 | ❌ **归入需改造** | `white` 是手写颜色，撞 R7；且 guard 抓不到命名色 |
| **A3 / A5 / A6 / A7** | 「低风险；纯 CSS/DOM 结构」 | ⚠️ **风险被低估（应注明 a11y 代价）** | 这 4 项是**组件级重写**（非纯 CSS/DOM），且忠实照搬会**丢掉原生控件的键盘/读屏语义**（见 ⑤.2）。原报告 §6.2 W4 自己也要求「各实现一份」——即与 A 栏的「低风险」定位打架 |
| A4 | 可直接照搬 | ✅ 成立 | DR 的 CheckBox 正是「隐藏原生 input + CSS 画勾」，与本仓改造方向一致且不损 a11y |
| A8 / A9 / A10 / A13 / A14 / A15 / A16 | 可直接照搬 | ✅ 基本成立（A13 措辞需改「整体」为「两区域」，见 ③-10） | 逐条复核未见硬冲突 |

### 6.2 原报告**遗漏**的条目（应补进清单）

1. **关闭模型（N1）** —— 最重要的不可照搬项，两栏均无。必须单列。
2. **`R6「卡片式」 vs DR「无卡片」的直接矛盾（N9）** —— 原报告把两个事实都写了，却**没标出它们互斥**，`design.md` 会在这一步踩雷。
3. **AC3/P1 与「照搬 DR 边框色」的冲突（N3）** —— 原报告通篇未提 AC3 的 3:1 门槛与 DR 边框色的 2.95:1。
4. **无障碍代价（⑤.2）** —— 原报告零处提及「键盘 / 读屏 / IME」；而它推荐的自绘方向会**回退**这些语义。
5. **`popup.html` 的 2 个原生 `<select>`** —— 原报告 §5.5 只列了面板的 `selectRow`，A5 落点也只写 `SviControls.selectRow`，漏了 popup 自己的 `#policy`/`#imgfx`（而 §2.1 却称 popup「完全在体系外」——两者其实相关）。
6. **`sliderRow` 的 45 个调用点与 R5 的一致性义务** —— 重写滑块会让 45 处的 `min/max/step` 与 DR 的 UpDown/Slider 语义对表，R5 的「三处同名项 min/max/step 一致」需同步审视；原报告未提。
7. **`@16405` 的返回句柄依赖** —— 自绘后 `modeRow.select` 语义变化，属实测发现的改造点，原报告未提。
8. **`test.js` 字面量 guard 的命名色漏洞（③-8）** —— 顺带可加一条 guard，原报告未提。
9. **`TimeRangePicker` 在 popup 内的存在** —— 恰好是本项目「原生 picker 阻断关闭」缺陷的**同类先例**；若本项目将来加时间自动化，需提前避让。原报告未提。

### 6.3 原报告**成立、无需返工**的条目（供 `design.md` 直接引用）

条 1（定源/版本/vendor 边界）、条 2 的主干（控件形态未搬）、条 3 的**方向**、条 4（开关形态全值）、条 5 的「下拉/滑块/数值/取色自绘」四项、条 6 的取色实现与点外部关闭、条 7 的「页头无 ×」事实与 `×` 位置、§2.x 的信息架构表、§3.1/§3.3 的多数逐值读数、§3.4 基样式、§6.2 的 W1/W2/W3/W4/W6/W7/W8/W9/W10/W11/W12。

---

## 附：本次复核的上游一手文件（可复查）

| 上游路径（tag `v4.9.133`） | 用途 |
| :-- | :-- |
| `src/ui/theme.less` | 44 行逐值（20 色 + 无 radius 变量 + `@size-border-inner`） |
| `src/ui/controls/toggle/index.tsx` + `style.less` | 条 4 两半带文字、无 knob |
| `src/ui/controls/checkbox/index.tsx` + `style.less` | 原生 input 隐藏 + `skewY(±45deg)` |
| `src/ui/controls/select/index.tsx` + `style.less` | 自绘下拉（TextBox+Button+VirtualScroll），无 `<select>` |
| `src/ui/controls/dropdown/index.tsx` + `style.less` | 自绘，`<span onclick>` |
| `src/ui/controls/slider/index.tsx` + `style.less` | 纯 div + pointer/touch/wheel，无 range |
| `src/ui/controls/updown/index.tsx` + `style.less` | Button+Track+Button，无 number |
| `src/ui/controls/color-picker/index.tsx` + `style.less` + `hsb-picker.tsx` | 条 6；`createSwipeHandler` 证明拖拽 |
| `src/ui/controls/button/index.tsx` | 原生 `<button>` |
| `src/ui/controls/textbox/index.tsx` | 原生 `<input type∈{text,time}>` |
| `src/ui/controls/time-range-picker/index.tsx` | 原生 `<input type="time">` ×2 |
| `src/ui/controls/multi-switch/*`、`tab-panel/style.less`、`control-group/*` | §3.3 逐值 |
| `src/ui/shared.less`、`src/ui/popup/style.less`、`src/ui/popup/body/style.less` | §3.4；`body{border:2px solid white}`@397-399、`.ext-disabled`@124-138、`.preview` mix@243-245 |
| `src/ui/popup/components/header/index.tsx` + `more-site-settings.tsx` + `more-toggle-settings.tsx` | 条 7；时间选择器在 popup 内 |
| `src/ui/popup/components/filter-settings/index.tsx` + `theme/controls/*` | UpDown（旧设计）vs Slider（新设计）并存 |
| `src/ui/utils.ts` | `openFile()` → `<input type="file">`（原生对话框） |
| `src/ui/options/site-list/site-list.less`、`popup/components/news/style.less` | §3.2「唯一圆角」的 7 处反例 |
| `src/inject/**`（全树） | 页内无**可交互** UI |
| 本仓：`universal-smart-invert.user.js` token 块 `:3909-3964`、`SviControls` `:12675-13100`、`buildUI` `:13311-13452`、`togglePanel:15889`、`@16405` | 本仓实测落点 |
| 本仓：`scripts/extension-src/popup.html`（`:55,60-71,78-90,131-135,147,154,169`）、`options.html`、`test.js:5032-5130` | 本仓消费面与守卫 |

（复核方式备忘：上游 tarball→`tar -xzf --wildcards '*/src/ui/*' '*/src/inject/*'`；对比一律以源码原文为准，未依赖任何转述。）
