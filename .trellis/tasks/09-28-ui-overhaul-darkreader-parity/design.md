# 设计：UI 全面重构 —— 三处界面统一信息架构 + 对齐 Dark Reader 视觉

> 任务：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity`
> 日期：2026-09-29 · 状态：待用户评审（评审通过后才 `task.py start`）
> 输入：`research/` 下 4 份研究报告 + 3 份对抗性复核（`01`/`02`/`04` 的 `-VERIFY.md`、`03`）
> 用户裁定：D1 启用子代理 · D2 先计划 · D3 统一 IA + 照搬 DR 视觉 · D4 原生 Agent + sonnet ·
> D5 schema 驱动三处 · D6 换皮不换骨 + 两个标志性件重做

---

## 1. 范围边界

**改**：UI 层 —— `SviControls` 建造器与行工厂、面板 CSS 与 design token、页内模态的渲染方式、
页内胶囊面板、`scripts/extension-src/popup.{html,js}`、构建期注入产物。

**不改**：反色引擎、图片/视频判定流水线、区域分割内核（12.5/20.5 节）、区域遮罩冻结契约、
扩展身份字段（extension ID / `geckoId` / `@name`）、`svi:prefs` 既有子键语义、
**站点覆盖键面**（不扩，见 §6）。

---

## 2. 现状诊断（证据分级）

### 2.1 已实测证实 —— 可作既定事实

**A. 设置项没有单一真源（`research/04`，经 `04-VERIFY` 独立复算）**

| 承载面 | 现状 | 计数 |
|---|---|---|
| C 扩展 options | **唯一**消费 `SVI_SETTINGS_SCHEMA` 的面（`options.js:22`） | 94（schema 1:1） |
| A 页内模态 | **逐区块手写**行定义，**零引用 schema**；一致靠 `test.js:5438` 的**源码扫描**维持 | 94 行 / 16 builder / 92 全局键 |
| B 扩展 popup | **完全在体系外**：6 键手写、选项集手写、**第三份硬编码默认值** | 7 控件 / 6 键 |

- `SVI_SETTINGS_SCHEMA` 全仓引用点仅：定义 `:12527`、消费 `options.js:22`、测试 `test.js:5338`。
- **`test.js` 的守护强度被高估**：它扫的是**整个 `UIController` 类体**里的 `state.<键>` 引用
  （不是行调用点），所以只保证「键面存在」——**删掉一条控件行、只要该键在类体别处仍被引用，
  断言照样绿**。它连「该键真有控件」都不保证，更不谈 min/max/选项集/极性。
- 对重构**有利**的发现（`04-VERIFY` §3.7 补做）：A↔C 在 **45 条 slider 范围、14 条 select 选项集、
  27 条 toggle 极性**三轴上**当前完全对齐、0 差异**。真正漂移的只有 B 一侧。

**B. 六项跨面不一致（D 系列；D7 为复核新发现）**

| # | 键 | 症状 | 位置 |
|---|---|---|---|
| **D7（严重）** | `brightness`/`contrast`/`saturate`/`hueRotate` | **扩展 options 页这 4 条滑杆是死控件**：能拖能存盘、零效果 | `getActiveFilter()` `:1292` 只在 `presetId==='custom'` 时用这 4 值；A 侧 onSet 会经 `:6273` 置 `custom`，C 侧 `options.js` **从不写** `presetId`，且 schema 的 presetId 下拉**无 `custom` 项** |
| D1 | `imageInvert` | popup 勾选态读**合成值**、写入只改**全局** → 本站强制关时"点了没用" | 读 `:17075`（`state.imageInvert !== false && getSiteProfile().imageInvert !== false`）vs 写 `popup.js:94` |
| D2 | `imgFxMode` | popup 仅 **4** 个选项，A/C 有 **8** 个 → 选 key/rect 后 popup 静默回显「完整反色」 | `popup.html:154-159` vs schema `:12554` |
| D3 | `presetId` | `PRESETS['amoled'].name='纯黑'` vs schema/popup 的「夜间纯黑」；`custom` 态三处显示各异 | `:62` / `:13704` / `popup.js:57` |
| D4 | `hoverRestore` | A 模态里**渲染成两个开关**（同键双写） | `:13710` 与 `:14504` |
| D5 | 默认值 | **三份真源**：`DEFAULT_PREFS` / snapshot 响应内再写一份 / popup 字面量回退 | `:17078` / `popup.js:54-58` / A 内联 15 处 |
| D8 | `imageInvert` | A 胶囊与 B popup 对同一状态**显示相反**（一个读全局、一个读合成） | `:13374` vs `:17075` |
| D9 | `scheduleStart/End` | schema `kind:"hour"` 与 A 裸 `selectRow` 形态分叉（行为一致，属登记项） | `:12645` vs `:16358` |

**C. 按钮「没有边框、边界」（`research/03` §2，我独立复算对比度）**

| 选择器 | 现状 | 对底 `#141e24` |
|---|---|---|
| `.svi-btn` 填充 `--svi-ctl-bg` | = 面板底 `--svi-bg` | **1.00:1**（按钮整个融化进面板） |
| `.svi-btn` 边框 `--svi-ctl-hover` | `#193945` | **1.38:1** |
| `.svi-action-btn` / `.svi-pip-btn` | `1px solid rgba(var(--svi-white-rgb), .12)` | ≈1.44:1 |
| `.svi-preset-btn` | `rgba(var(--svi-white-rgb), .08)` | 更低 |
| `.svi4-tab` / `.svi-modal-close` | **`border: none`**（规则缺失） | 0 |
| `--svi-border` `#316e7d` / `--svi-border-w` | **定义了，但全仓 `var()` 消费 0 次** | 2.95:1 |

根因是**取值过低 + 规则缺失 + token 死代码**三者叠加，**不是层叠覆盖**（computed style 与规则一致）。

**D. 页内胶囊面板零关闭入口（`research/03` §4）**

- `.svi-card-header`（`:13340-13347`）只有 `title` + `statusBadge`，**无任何关闭控件**
  （按 title/aria/文本扫 `关闭|close|×` 全无命中）。
- 唯一关闭路径是 `document` 上的 click-outside（`:13445-13449`），外加再点一次药丸。
- **药丸是 `div` 不是 `button`**（`:13329`）→ 不可键盘聚焦、无 aria。
- Esc 处理**只针对模态**，与胶囊面板无关。

**E. 「莫名取色器」的确切机制（`research/03` §5；我已独立重跑探针复现）**

同一份原生取色器有**两个构建器，一个有 wrap 一个没有**：

| 构建器 | 结构 | 后果 |
|---|---|---|
| `pickerRow` `:12918-12919` | `h('div',{class:'svi-color-input-wrap'}, native, preview)` | ✅ wrap 有 `position:relative`，input 收缩成 34×24 |
| `colorList` `:13081` | `h('div',{class:'svi-color-picker-controls'}, native, addBtn)` | ❌ 该容器**无 `position`**（`:4989`） |

于是 `.svi-color-input-native`（`opacity:0; position:absolute; inset:0`，`:5000`）的定位祖先一路上溯到
**`.svi-modal-mask`**（`position:fixed; inset:0`，z-index 拉满，`:4532`），**被拉伸成满屏并被绘制在
全部模态内容之上**。实测（`probe-ui-defects-2.json`）：三个 `input[type=color]` 中两个是 `34×24`，
「原色屏蔽」那个是 **`[0,0,1100,900]`，`fullViewport: true`**，`containingBlock: svi-modal-mask show`。
命中测试：视口五处采样点**全部**返回该 input。滚动出视野也无效（定位祖先是 fixed 遮罩）。

真鼠标实测（CDP `Input.dispatchMouseEvent`，`probe-ui-defects-3.json`，**我重跑结果一致**）：

| 场景 | 操作 | `activeElement` | 模态 |
|---|---|---|---|
| 对照：本站页签 | 点遮罩空白 (125,450) | `BODY` | ✅ 关闭 |
| 全局页签 | 点遮罩空白 | `INPUT.svi-color-input-native` | ❌ 不关 |
| 全局页签 | **精确点关闭按钮 (821,91)** | `INPUT.svi-color-input-native` | ❌ 不关 |

**F. Esc 从来没生效过（第二条独立病因，`research/03` §5.5）**

- `:13628` 在 `UIController` 里调 `this.cancelRegionMask()`，但该方法只定义在
  `ImageInvertEngine`（`:8684`）。实测抛出 `TypeError: this.cancelRegionMask is not a function`
  → 其后的「关闭设置模态」分支**永远执行不到**。
- `:14474` 的 `this.armRegionMask()` 是同类死调用（「区域遮罩（拖拽）」按钮点击即抛）。
- 已核验：13251–14600 之间只有 `class UIController` 一个类声明；全仓这两个名字各有且仅有
  「定义 + 调用」两处、**无任何动态赋值**。

### 2.2 证据不足 —— **不得**作为既定事实写进实现

以下条目经 `01-VERIFY` §③ 判定为证据不足或过度断言（编号沿用该报告）：

- **A1**「前 4 轮的 AC **全部**落在机制层」→ 归档里存在**行为类 AC**（如 v4 的「power OFF 同 tick 清类」
  、v6-4 的「三处双向同步」）。正确表述：**与视觉/信息架构相关的 AC 落在机制层**。
- **A2**「v4 `zero redundancy` 与 v6-4 全量复制两条 AC 互相打架」→ **对 v4 原文的误读**。
  v4 那句话的作用域是「同一设置页内**本站级控件 vs 全局开关**」的重复（靠三态继承消除），
  与「跨承载面」是**两个轴**，逻辑上不相冲突。**不得**用"历史上 AC 打架"来解释今天的跨面冗余。
- **A3**「多承载面是第 3 次重建的产物」→ 实为**父任务用户裁决**
  （`09-25-v6-partial-and-ui/prd.md:51` D6「全量同源：三处」）。冗余的杠杆是**重新裁决分层边界**（本任务 R4），
  不是"少写一条 AC"。
- **A4**「取色器 → 弹原生对话框抢焦点 → 导致关不掉」的**因果链**→ 不可见 input 是**实测事实**，
  但「原生对话框吞掉点击」这一环**未经直接观测**（headless 下系统弹窗不渲染）。
  `research/03` 给出的是**几何 + 点击路由**的强证据，已足够定性，
  但实现与验收都锚在「点击路由被吃」与「关不掉」上，**不锚在"对话框"上**。
- **A5**「截图发现的缺陷没有变成任何断言」→ 实际只有「偏离 18」未留断言，19/20 都补了。
- **A6**「`imageInvert` 在 4 处、引 `@13751`」→ **不成立**，`@13751`（`buildImageSection`）函数体内
  零 `imageInvert`（我已 grep 复核）。真实四处为：A 胶囊 `:13369`（写全局）、A 本站三态卡（写站点域）、
  B `popup.js:93`、schema `:12544`。**注意其中一处写的是站点域**，不是「4 个等价重复」。
- **A7**「冗余被连续两轮宣称解决」→ 只有 v4 一轮有此 pledge。
- **A8/A9/A10**：PRD 一度 TBD（不可核）、`implement.md:5256` 引用标签错（应为 `test.js:5256`）、
  v3.3 AC 属摘录而非逐字。

### 2.3 对研究结论的两处更正

1. `research/03` §2(b) 把 `.svi-action-btn` 的边框写作 `rgba(255,255,255,0.12)` —— 原文实际是
   `rgba(var(--svi-white-rgb), 0.12)`（`:4104`），**是走 token 的**。对比度过低的问题成立，
   「未走 token」的判断不成立。
2. popup 的 `.tab` 未选中态 `border: 1px solid transparent` **是设计**（`:44-47` 的
   `[aria-selected="true"]` 会补 `border-color: var(--svi-fg)`），属「选中/未选中对比」，
   **不列入按钮缺陷**。页签另有「选中态可辨」的独立断言（见 §10）。

---

## 3. 目标架构

### 3.1 设置项单一真源：schema 驱动三处（解 D5）

**核心动作**：`SVI_SETTINGS_SCHEMA` 升为唯一真源，三处**消费**它而非各自手写。

**(a) 键注册表 —— 这一步正面解掉 `01-VERIFY` P7 的阻塞**

`01-VERIFY` 判定 P7（「每键单一可写点」）**当前不可实现**，依据是 v6-4 偏离 5 已登记：
`SviControls` 的行工厂**签名不接收偏好键**（键被闭包捕获），运行时无法建立 key→控件 的注册表。
本设计**先做该加固**，P7 随之可测：

```
SVI_KEY_REGISTRY: { [prefKey]: { read(), write(v), effects: [fn] } }
行工厂签名扩展：toggleRow(label, hint, getVal, onSet, key?)   // key 可选，向后兼容
```

`effects` 显式承载 A 侧那些**带副作用的 onSet**（`savePrefs()`、
`window.__svi_image_engine.clearCacheAndRescan()`、`applyVideoTune()`、
`RegionRenderEngine.unmountAll()`、`stateMachine.onCustomParamChange()` 等）
—— 这正是 A 无法直接套用 C 的薄 `KINDS` 的原因（`04-VERIFY` §⑥ 指出报告 04 完全没给 A 的迁移估计）。

**(b) A 模态改为声明式渲染**

```
for (const group of SCHEMA) for (const item of group.items) renderByKind(item)
```

`item.kind` → builder 的映射表代替 94 处手写调用。**A 独有项**（不在 schema 里）—— 本站三态卡、
胶囊双钮、`peek` 行、布局按钮、动作按钮组 —— 用文件内 `PANEL_ONLY_ROWS` **显式登记**，
使「92 schema 键 ↔ 92 A 全局键 + 2 独有（`imageInvert`/`autoDetect`，由胶囊与三态卡承载）」这条等式
**可被单测断言**（`04-VERIFY` §3.3 已复算该等式成立）。

**(c) 一致性由单测守护**，替换掉 `test.js:5438` 那段「扫整个类体」的弱守护：
新断言 = 「三处渲染的键集合 ⊆ schema 键集合」+「同一界面内无重复键」+「同名项的
min/max/step、选项集、极性、默认值四处一致」。

### 3.2 三处分层边界（解 R4/R5）

**关键修正**：`04-VERIFY` §⑤ 判定原报告建议的「本站级 → popup / 全局 → options」**二元分层不可行**
且与其自身建议矛盾 —— 因为 **popup 现有 6 个键里 4 个是全局键**
（`presetId`/`imagePolicy`/`imgFxMode`/`hoverRestore`），且站点覆盖键面是**闭合的**。

**站点覆盖键面（`resolveSiteProfile` `:3714-3733`）只认**：
`enabled · videoInvert · imageInvert · bgReplace · imgFxMode · excludeSelectors · shieldColors`
+ v5.3 自校准写入的 5 个阈值键。**没有** `imagePolicy` / `hoverRestore` / `presetId`。

**因此采取的做法：按控件标注作用域，不按界面切分作用域。**

| 界面 | 定位 | 内容 |
|---|---|---|
| **B popup** | 「本站快捷 + 少量全局高频」**混合层** | 保留现有 6 键 + 站点电源；**每个控件显示作用域徽标**（本站 / 全局），全局键在扩展形态下给出"打开设置页"跳转 |
| **C options** | 全量**全局**深度设置 | 继续 schema 1:1 渲染全部 94 项 + **修 D7** |
| **A 页内模态** | 油猴形态的**唯一全局入口** + 本站层 | schema 驱动；扩展形态下可按 `OWNER_KIND` 精简全局页签（**本任务不做**，见 §6） |

- **不扩站点覆盖键面**：要「本站化」`#policy`/`#hover`/`presetId` 必须新造
  `siteOverrides[host].<键>` 并改 `resolveSiteProfile` 合并逻辑 —— 这是**数据模型变更**，
  属"需扩大改动面"，**回报用户后再议**（`04-VERIFY` §⑤ 已否决原报告的该建议）。

### 3.3 控件形态（D6：换皮不换骨 + 两个标志性件重做）

| 项 | 现状 | 目标 | 依据 |
|---|---|---|---|
| 圆角 | `--svi-r-sm/-r/-r-lg` = 4/6/12px | **直角**（值改 0） | DR 全 UI **无任何 radius 变量**（`theme.less` 实测；`grep @radius` 为空） |
| 外描边 | `1px` + 低对比色，或缺失 | **`2px`** + `--svi-border` | DR `@size-border: 0.125rem` |
| 内描边 | 无 | 新增 `--svi-border-w-inner: .0625rem`（1px） | DR `@size-border-inner` |
| **描边色** | `--svi-border` `#316e7d`（**死 token**，且 2.95:1） | **`#35798a`（3.428:1）** | 见下方「取值论证」 |
| 按钮填充 | `--svi-ctl-bg` = 面板底（1.00:1） | **保持不变** | **忠于 DR**：DR 的 `@color-control-back` 也等于 `@color-back`，靠描边分离 |
| 开关 | iOS 药丸（`.svi4-switch` 52×28 / popup `.switch` 40×22） | DR 的 **On/Off 文字半块**，但**底层保留原生 checkbox**（`display:none`）+ CSS 画两半 | DR 的**开关是自绘 span 且无 `tabindex/role/keydown`**（不可键盘）；DR 自己的 **CheckBox 恰恰是「隐藏原生 input + CSS 画形」** → 采用后者套路，观感达成且键盘可用 |
| 取色器 | 原生 `<input type=color>` 叠加隐形层 | **hex 文本框 + 预览块 + 重置 + 离散色板**（点选，非拖拽） | DR `controls/color-picker` 无 `<input type=color>` |
| 页签 | 圆角 chip | **方形 + 上下边框**（`tab-panel`） | DR `tab-panel/style.less` |
| 分组容器 | 圆角卡片 + 阴影 | **分区标题 + 分隔线，无卡片** | **DR 没有卡片词汇**（`02-VERIFY` N9）；本 PRD 早先写的"卡片式"是错的，已更正 |
| 下拉 / 滑块 / 数值 | 原生 `<select>`/`<range>`/`<number>` | **保持原生**，只换皮 | DR 自绘的这三类是 `<span>`+pointer 事件，**不可键盘**；照搬 = 无障碍回退 |
| 字体 | 系统栈（`system-ui, Segoe UI, Microsoft YaHei`） | 不变 | DR 用 Open Sans，但外链 TTF 撞 nocdn；系统栈是既有选择 |

**描边色取值论证**（我独立复算，与实现共用同一算法）：

| 候选 | 对底 `#141e24` | 判定 |
|---|---|---|
| `#316e7d`（DR 原值） | 2.947:1 | ✗ 差一点点 |
| **`#35798a`** | **3.428:1** | ✓ **选它**：同色系里偏离 DR 最小的达标值 |
| `#3a8091` | 3.769:1 | 达标但偏离更大 |

WCAG 1.4.11 要求非文本 UI 组件 ≥3:1。**与 DR 的偏离必须记录在案**：这是本设计**唯一**一处
明知 DR 取值而故意偏离的颜色（其余颜色逐值照搬）。

**为何不采纳 `01-VERIFY` ⑤.2 的替代建议**（"同时给按钮一个与面板底不同的填充"）：
DR 自身的 `@color-control-back: #141e24` 就**等于**页面底 `@color-back: #141e24` ——
改填充反而**偏离** DR，与 D3/D6 的"照搬视觉"冲突。把描边加到 2px 且达标即可分离。

### 3.4 关闭模型（解 R1/R15）

**先定契约**（`01-VERIFY` P3 明确要求：探针不得把尚不存在的实现细节写成契约）：

> **关闭控件契约**：任何声明式关闭入口必须带 `data-svi-close`，语义为
> 「`click` 使最近的容器移除 `show` 类（或等效地关闭）」。探针断言锚在该属性上。

| 缺陷 | 修法 |
|---|---|
| 胶囊面板无关闭入口 | `.svi-card-header` 加 `SviControls.icon('close')` 按钮（带 `data-svi-close`）→ `togglePanel(false)` |
| 药丸不可键盘 | `this.pill` 由 `div` 改 `button`（`type=button` + `aria-label`） |
| Esc 死调用 | `:13628` / `:14474` 改为**显式委托** `window.__svi_image_engine?.cancelRegionMask?.()`，并给 Esc 处理加 `try/catch` 兜底 —— **一处异常不得废掉整条关闭路径** |
| 胶囊面板无 Esc | 胶囊面板也纳入 Esc 关闭 |

### 3.5 取色器（解 R3）

- **主修（CSS，首选）**：给 `.svi-color-picker-controls`（`:4989`）补 `position: relative`，
  或统一走 `.svi-color-input-wrap`（`colorList` 改为与 `pickerRow` 同构）。
- 随 §3.3 的取色器重做，原生 `<input type=color>` 从 `colorList` 路径移出。
- **必须同批处理**：`test-browser.js:999`（`hasPicker` 采集）与 `:1140`
  （`assert.strictEqual(report.ui.hasPicker, true, 'Native color picker must exist')`）
  —— 这是**现任绿灯断言**，删取色器必然让它变红。见 §7。

---

## 4. 契约（新增 / 变更）

| 契约 | 形式 | 说明 |
|---|---|---|
| `SVI_KEY_REGISTRY` | 新增（面板侧） | `{ [prefKey]: { read(), write(v), effects[] } }`；三处共用同一份 |
| 行工厂 `key` 参数 | 签名扩展（可选参） | `toggleRow(label, hint, getVal, onSet, key?)` 等 6 个建造器；解 P7 阻塞 |
| `data-svi-close` | DOM 契约 | 声明式关闭入口；探针断言锚点 |
| `--svi-border` 值 | 变更 | `#316e7d` → `#35798a`（3.428:1） |
| `--svi-r*` 值 | 变更 | 全部置 0（保留 token 名，避免调用点改动） |
| `--svi-border-w-inner` | 新增 | `.0625rem`（1px），对齐 DR `@size-border-inner` |
| `PANEL_ONLY_ROWS` | 新增（面板侧） | 显式登记 A 独有、不在 schema 的行；使 92↔92+2 等式可断言 |
| 作用域徽标 | 新增（popup + 面板） | 每个控件标注 本站 / 全局 |

**不改**：`Store` 的键协议与 `svi:prefs.rev` 版本仲裁、`svi-set-pref` 消息协议
（`user.js:17100-17126` 的 5 键白名单与 `svi-site-power`/`svi-site-reset`/`svi-open-settings`）。

---

## 5. 数据流

```
读:  UI 控件 ← registry[key].read()  ←  state（全局） / getSiteProfile()（合成）
写:  UI 控件 → registry[key].write(v) → state + savePrefs() + effects[]（按序执行副作用）
默认值: 唯一 DEFAULT_PREFS —— snapshot 响应与 popup 不再各写一份（解 D5）
跨面:  popup 经 svi-set-pref / svi-get-snapshot 复用同一 registry（不再各自硬编码）
```

`registry[key].write` 是**唯一的可写点** —— 这是 D1/D2/D8 的结构性解法
（B 不再自写全局键、也不再自算合成值；合成语义只在 `read()` 里表达一次）。

---

## 6. 取舍与被否决的替代方案

| 方案 | 判定 | 理由 |
|---|---|---|
| 忠实照搬 DR 全部 6 个建造器的自绘实现 | **否决** | 会把本仓**可键盘可读屏**的原生 `select/range/checkbox` 换成 DR 自己**无 `tabindex/role/keydown`** 的 `span/div` → 无障碍回退；且 ≈400–600 行 JS + 200–300 行 CSS。DR 自己的正确做法恰是"保留原生元素只换皮" |
| 按界面切分作用域（本站→popup / 全局→options） | **否决** | 与 popup 现状（6 键里 4 个全局键）及**闭合的**站点覆盖键面不相容。改为**按控件标注作用域** |
| 把 `#policy`/`#hover`/`presetId` 做成本站三态 | **否决（需回报用户）** | 站点覆盖键面不存在这三个键，须改数据模型 → 属"扩大改动面" |
| 取消 A 的全局页签（扩展形态下由 options 取代） | **本任务不做** | 油猴形态**没有 options 页**，A 是其唯一全局入口；扩展形态下的精简留待后续任务 |
| 把 `hoverRestore` 双行强行合并 | **改为加互指说明** | `:14505-14508` 注释自陈是**有意为 peek 动作保留的同键开关**；真正的缺陷是 **label 不一致**让人误判为两个功能 |
| 取消卡片、改平铺 section | **采纳** | DR 无卡片词汇（N9）；本 PRD 早先的"卡片式"表述是错的 |
| 用自绘 HSB 拖拽取色 | **不采纳（理由改写）** | `02-VERIFY` N5 指出：spec 禁的是**套索/拖拽画框/笔刷**，拖滑块/拖色相**不属**"绘制型手势"，故"spec 禁止"这个理由**不成立**。正确理由 = 点选板更省代码、更稳、无需 pointer 事件 |
| 照搬 DR 的 `body{border:2px solid white}` | **否决** | 颜色字面量撞 R7，且**现守卫只抓 `#hex` 与 `rgba()`，抓不到命名色 `white`** → 落地即违规且不被拦截 |
| 照搬 DR 的 Open Sans TTF 外链 | **否决** | 撞 nocdn 单文件约束；继续用系统字体栈 |
| `01-VERIFY` P5 / P10 | **降级为流程约束** | 两者无探针可读（"凡截图发现的缺陷必须落成断言"、"diff 必须对得上矩阵"是人工判断），移出可执行守卫栏 |

---

## 7. 兼容性与不变量

**必须保持的不变量**（每条都有现任守卫测试）：

- **R7** token 唯一真源（`v6.4-TOKENS-START/END`，构建注入）；面板 CSS 与两个 HTML 产物
  token 块之外零颜色字面量。**唯一允许字面量**：闪屏守卫 `background:#000`。
- **R8** `SviControls` 是唯一 DOM 构造点；v5 的 `ui.*` 别名**已删除**，单测要求调用点为 0。
- **R9** 图标唯一来源 `SviControls.ICONS`；禁 emoji、禁调用点手写 `<svg>`。
- **R10** 样式挂载唯一入口 `mountStyleNode` + 根延迟唯一 `whenRootReady`。
- **R11/R12** `extension/` 是构建产物；改头须 bump `@version` 并 `build-extension.js` 重建。
- **R13** nocdn；文案中文、标识符 ASCII；面板 UI 一律经 `SviControls` 构建。
- **R14** 运行时状态不持久化；**不改 `svi:prefs` 既有子键语义**。

**三处必须特别处理的兼容点**：

1. **`test-browser.js:999` / `:1140` 的 `hasPicker` 断言必须同批修改** —— 这是本设计**唯一**
   一处「改动既有断言」。删原生取色器会让它变红。**不得静默放宽**；
   implement 中单列一步，改动前回报用户。若用户不接受，退路是保留原生 input
   但只做 §3.5 的定位修复（不改控件形态）。
2. **`:16405 this.modeSelect = modeRow.select`** —— 该调用点依赖**行工厂返回句柄**；
   行工厂加 `key` 参数与下拉换皮后，`select` 句柄语义变化，须改为取值接口。
   （`02-VERIFY` §5.1 实测发现；全仓仅此 1 处。）
3. **CRLF/LF 与构建同步（P9）** —— 本仓 blob 是 CRLF、机器 `core.autocrlf=true`，
   `git checkout/apply/stash` 会改写工作树为 CRLF，导致 `test.js` 的**源码扫描正则**与
   **token 逐字节断言**假红。配方：`git` 动作后归一 LF → `node scripts/build-extension.js`
   重建 → 再跑门禁。**改 `extension-src/` 后必须先重建再跑门禁。**

---

## 8. 视觉验收物（新增 —— 回应 `01-VERIFY` ⑤.6）

`01-VERIFY` 指出：4 份历史 design.md 的"测试计划"一节**从未出现**「截图 / 对比度 / 控件形态」
这类视觉验证物，v6-4 甚至没有独立 design.md。结论是**问题不只在 AC，更在设计阶段没有定义视觉可交付物**。
故本设计**强制**产出四张表（存于本任务 `design-assets/`，实现后就地更新）：

1. **token 差异表**：DR 原值 / 本仓现值 / 本仓目标值 / 偏离理由（本设计已含首版，见 §3.3）。
2. **控件形态表**：DR 形态 / 本仓现形态 / 本仓目标形态 / **键盘可用性**（三列对照，a11y 回归一眼可查）。
3. **对比度基线表**：各状态色对底色的比值 + 3:1 判据 + 达标与否。
4. **三处界面截图基线**：由 `scripts/panel-shot.js` 产出（脚本已存在，`--width/--height/--dsf/--scale` 可调），
   作为人工评审物，附在实现 PR 的说明里。

---

## 9. 实施分步与回滚（每步独立可 revert）

| 步 | 内容 | 可 revert 的边界 | 门禁 |
|---|---|---|---|
| **A** | 纯 CSS 视觉：直角化、2px 描边、`--svi-border` 换值、内描边 token、页签方形、去卡片 | token 块 + 面板 CSS 模板 | 五绿 |
| **B** | 关闭模型：胶囊关闭按钮 + pill 改 button + Esc 死调用修复 + 胶囊 Esc | `buildUI` / 键处理 / `:14474` | 五绿 + 新按键断言 |
| **C** | 取色器：定位上下文修复 + 控件重做 + **同批改 `test-browser.js` 的 `hasPicker`** | CSS + `colorList` + bench 两行 | 五绿 |
| **D** | 单一真源：键注册表 + 行工厂 `key` 参数 + A 声明式渲染 + popup 消费 registry + D 系列不一致归零 | `SviControls` 建造器 + `buildSettingsModal` 16 builder + `popup.js` | 五绿 + 新一致性断言 |

**顺序理由**：A/B/C 是**局部可逆**的低风险步，先落地拿回视觉与关闭能力；
D 是最大改动面，放最后，且它的前置（行工厂 `key` 参数）在 A/B/C 期间不动。
每步结束后 `git status` 确认 `extension/` 变更可归因于构建。

---

## 10. 与 AC 的映射

| AC | 由哪步交付 | 验证物 |
|---|---|---|
| AC1 关闭入口（R1） | B | CDP 探针：点 `[data-svi-close]` 后 `.svi-panel-card` 无 `show`，全程未点面板外 |
| AC2 取色器（R3a） | C | 真鼠标：`getBoundingClientRect()` 不等于视口；点关闭按钮能关；`activeElement` 不是 color input |
| AC3 按钮边界（R2） | A | 逐按钮 computed + 对比度表，**≥3:1**；对比基准 = 最近非透明背景祖先 |
| AC4 单一真源（R4/R5） | D | 单测：三处键集合 ⊆ schema；同界面无重复键；四轴一致 |
| AC5 DR 对齐（R6） | A | token 差异表 + §8 四张表；popup 三页签结构 |
| AC6 守卫（R7–R10） | 全部 | 既有单测全绿（`ui.*`=0、零 emoji、token 字节一致、`mountStyleNode`） |
| AC7 五绿门禁 | 全部 | 五个命令 + build + pack |
| AC8 重建与 bump（R11/R12） | 全部 | `git status` 的 `extension/` 变更可归因构建 |
| AC9 不横向溢出 | A/D | `scripts/check-panel-overflow.js` |
| AC10 坑清单处置 | 全部 | 以 `01-VERIFY` §④ 修正后的清单为准；**P3/P4/P7 已按本设计改写为可执行** |
| AC11 Esc / 死调用（R15） | B | 真按键断言 + 静态守卫（调用点所属类存在同名方法或已显式委托） |
| AC12 D7 死控件归零 | D | 探针：options 页改滑杆后生效滤镜字符串确实变化 |
| AC13 D8 显示一致 | D | 构造本站强制关场景，断言两处显示同一状态 |

**`01-VERIFY` 坑清单的落地情况**：P1（需消歧：定义"相邻非透明背景祖先"为基准）、
P2（可验证）、P3（**已按本设计先定 `data-svi-close` 契约**）、
P4（**已明确须同批改 `test-browser.js:999/1140`**，且计数模式排除 schema 的 `kind:"color"` 值域）、
P6（可验证，需矩阵给出机器可读列）、P7（**前置加固已纳入 §3.1(a)**）、
P8（直接采用 spec 写法）、P9（保留，补"先重建再跑门禁"）、
P5/P10（**降级为流程约束**，不作守卫）。
