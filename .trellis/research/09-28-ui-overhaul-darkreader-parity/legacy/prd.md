# UI 全面重构：三处界面统一信息架构 + 对齐 Dark Reader 视觉

## Goal

跨 3 个界面（页内悬浮胶囊面板 / 扩展 popup / 扩展 options）的 UI 全面重构：消除设置冗余、
统一信息架构、照搬已 vendor 的 Dark Reader 视觉与控件语言，并修复按钮无边框、悬浮胶囊无关闭入口、
原生取色器阻断面板关闭等点名缺陷。

**这是本项目第 4 次 UI 重建尝试**（前 3 次共 4 个任务已归档，缺陷依旧）。因此本次验收标准
刻意改为「可测、可复现、有证据」，不得回退为「存在某条 CSS 规则即算通过」的自证式验收。

## 用户原话（2026-09-28）

> 没有像 dark reader 一样的 ui，且每个按钮没有边框，边界，以及两个设置面板冗余，
> 以及侧边浮动按钮没有关的地方
> 还有浮动按钮的面板莫名奇妙取色器，导致关不掉面板
> 存在设置冗余
> 以及插件的 ui 全面重构，找方案，skill 等
> 多开子代理，互相检查，每个子代理要到 400k 左右上下文然后弃用

## 已裁定事项（用户 2026-09-28 点选，不可自行更改）

| # | 决策 | 选定值 |
|---|---|---|
| D1 | 子代理策略冲突裁定 | **启用子代理，覆盖 09-25 旧规则**（已落到 `.trellis/spec/guides/subagent-model-policy.md` §一） |
| D2 | 流程 | **新建 Trellis 任务 + 先出计划**（本任务），计划经用户审阅后才动代码 |
| D3 | 重构方向 | **统一信息架构 + 照搬 Dark Reader 视觉**（不是"只修缺陷"，也不是"完全照搬 Dark Reader 重写"） |
| D4 | 子代理通道与模型 | **Claude 原生 Agent 工具 + `model: sonnet` + 后台真并行** |
| D5 | R4 真源方向 | **schema 驱动三处（根治）**：`SVI_SETTINGS_SCHEMA` 升为唯一真源；页内模态改为按 schema 声明式渲染（消掉 90 处手写行调用点）；popup 改为读 schema 的「本站级子集」。一致性由**单测**守护，不再靠 `test.js` 的源码扫描断言 |
| D6 | R6 控件照搬度 | **换皮不换骨 + 两个标志性件重做**：保留原生 `select/range/checkbox`（可键盘可读屏），只套 DR 的直角 + 外 2px/内 1px 描边 + 配色；**开关**改为 DR 的 On/Off 文字半块、**取色器**改为 hex 文本框 + 自绘色板，两者补 `tabindex/role/keydown`。约 15–20 处改造点，**无无障碍回退**。否决"忠实照搬 DR 全部实现"（会把可键盘控件换成 DR 自己不可键盘的 span/div，且 400–600 行 JS） |

## Requirements

### 缺陷类（用户点名，必须逐条修复并可复现验证）

- **R1 · 悬浮胶囊关闭入口**：侧边悬浮胶囊（pill）与其展开面板必须有**显式关闭控件**；
  点击即收起，且**不需要"点击面板外部"**这一唯一途径。收起动作不得依赖焦点状态。
- **R2 · 按钮边界**：三处界面（页内面板 / popup / options）的**所有按钮**在深色底色上必须
  有可见的边界或等价的视觉分离（边框 / 描边 / 对比填充，任一即可），且「开启 / 关闭」两种状态
  都可辨。当前 `.svi-action-btn` / `.svi-preset-btn` / `.svi-open-modal-btn` / `.svi-pip-btn`
  等被反馈为"没有边框、边界"。
  - **已实测根因（2026-09-28，非层叠覆盖）**：① token 取值 —— 按钮拿 `--svi-ctl-hover`(#193945)
    当描边，对面板底 `#141e24` 仅 **1.38:1**；② **规则缺失** —— `.svi4-tab` / `.svi-modal-close`
    根本没有边框；③ **死 token** —— `--svi-border` 与 `--svi-border-w` 全仓
    **`var()` 消费 0 次**（定义了却没人用），而 DR 本用的正是 `--svi-border`。
    修法是**启用既有死 token 并使其达标**，不是发明新色。
- **R3 · 取色器抢点击 + 面板关不掉**（两条独立病因，均已实测复现）：
  - **R3a 隐形满屏取色器**：同一份原生取色器有**两个构建器，一个有 wrap 一个没有** ——
    `pickerRow` 把 input 包进 `.svi-color-input-wrap`（有 `position:relative`，正确）；
    `colorList`（`:13081`）却把 input 直接塞进 `.svi-color-picker-controls`，而该容器
    **没有 `position`**（`:4989`）。于是 `.svi-color-input-native` 的
    `position:absolute; inset:0` 一路上溯到最近的定位祖先 `.svi-modal-mask`
    （`position:fixed; inset:0`，z-index 拉满，`:4532`），被**拉伸成满屏并绘制在全部模态内容之上**。
    「全局」页签激活时整个视口即一颗隐形取色按钮 —— 实测点遮罩空白、甚至**精确点关闭按钮**，
    `activeElement` 都变成该 input，模态不关（「本站」页签对照正常）。
  - **R3b Esc 键崩溃**：`:13628` 在 `UIController` 里调 `this.cancelRegionMask()`，但该方法
    只定义在 `ImageInvertEngine`（`:8684`）；`:14474` 的 `this.armRegionMask()` 同理。
    已核验 13251–14600 之间只有 `class UIController` 一个类声明，且全仓这两个名字各有且仅有
    「定义 + 调用」两处、无任何动态赋值 → **每次按 Esc 抛 TypeError**，其后的
    「关闭设置模态」分支永远执行不到。
  - **验收含义**：R3a 的最小修法是「补上定位上下文」（加 `position: relative` 或补 wrap），
    而不是重写取色器；R3b 是必修的死调用。**「是否改用自绘 HSB 取色器（对齐 DR）」属可选的设计
    取舍**，由 `design.md` 单列，不混进缺陷修复。
- **R15 · Esc 与快捷操作不得静默失效**：任何按键路径上的 `this.X()` 调用都必须在
  `UIController` 上真实存在（或显式委托给引擎）；死调用必须归零。
  此类缺陷单测与源码扫描都看不见（前 4 次重建全部漏过），须由 `test-browser.js`
  的**真实按键断言**守住。
- **R16 · design token 必须「实际生效」，不得只是「存在」**（2026-09-29 Step 0 实测新增，根因级）：
  构建期注入到 `popup.html` / `options.html` 的 token 块是**裸声明列表**，而源码里
  `:root {` 开在 `v6.4-TOKENS-START` **标记之外**（`build-extension.js:295` 只抽取
  标记**之间**的内容），注入后落在 `<style>` **顶层**——按 CSS 解析规则，样式表顶层的
  无选择器声明不成立，**整块被丢弃**，且会连带吞掉紧随其后的一条规则
  （popup 的 `:root{color-scheme:dark}` 一并失效）。
  - **实测证据（三重）**：① 真扩展语境截图（`test-extension.js --shots`）popup 渲染成浅色，
    页头 `.logo`（`conic-gradient` 走 `var(--svi-fg)`）与 `.chip` 边框**全都没画出来**；
    ② 真 Chrome 读 CSSOM：两页 `--svi-bg` = **空串**、`body` 背景 = `rgba(0,0,0,0)`、
    popup `color-scheme` = **normal**；③ 静态根因如上。
  - **后果**：扩展的两个界面（popup / options）**长期完全没有主题**（页面内面板正常，
    它的 token 在 `:root{}` 内）。这正是用户投诉第 1 条「没有像 dark reader 一样的 ui」
    的直接成因之一。
  - **为何 4 次重建全漏**：`test.js:5077` 的守卫是 `text.indexOf(block) >= 0` ——
    只验「文本出现」，对「出现但惰性」**零覆盖**，属典型自证式验收。
  - **要求**：① 修复注入（让 token 落在规则块内）；② **新增真浏览器守卫**断言
    `--svi-bg` 解析出真值 + `body` 计算背景为深色 + `color-scheme: dark`；
    ③ 该守卫必须**可负向对照**（拿回未包裹的产物跑，断言必须变红）。

- **R4 · 设置项单一真源 + 分层**（方向已由 D5 裁定为 **schema 驱动三处**）：
  `SVI_SETTINGS_SCHEMA` 升为**唯一真源**，页内模态与 popup 均改为**消费**它而非各自手写。
  - 现状实测（2026-09-28 已二次核验）：schema 只被扩展 options 消费；页内模态手写 **90 处**
    `SviControls.*Row` 调用点、零引用 schema，一致性仅靠 `test.js:5438` 的**源码扫描断言**维持；
    popup 完全在体系外（6 键手写、选项集手写、默认值第三份硬编码）。
  - 收敛后按层呈现：**本站级设置 → popup**；**全局深度设置 → options**；页内模态保留轻量层
    （用户脚本形态无 options 页，故模态的全局层不可整体删除；扩展形态下可按 `OWNER_KIND`
    精简模态的全局页签 —— 具体取舍进 `design.md`）。
  - **不得破坏 R8**：schema 驱动指的是「schema 决定渲染什么」，**DOM 仍必须由 `SviControls`
    唯一构造**（schema 的 `kind` → 对应 builder 的映射，不是新写一套渲染器）。
  - schema 需评估扩展表达能力以覆盖模态现有的非偏好行（如「当前页媒体」统计行、
    「数据与备份」动作按钮），方案进 `design.md`。
- **R5 · 消除设置冗余**：同一偏好键不得在同一界面重复渲染；同名项在任意两处的
  **语义、默认值、选项集、slider 的 min/max/step 必须一致**。
  **已实测确认的三处不一致（必须归零）**：
  - **D1 `imageInvert`**：popup 勾选态读「全局 ∧ 本站」合成值
    （`state.imageInvert !== false && getSiteProfile().imageInvert !== false`），
    写入却只改全局键 → 本站强制关时"点了没用"。
  - **D2 `imgFxMode`**：popup 只有 4 个选项（完整/亮度/灰度/泛黄），面板与 options 有 8 个
    → 在面板选了「键色反色」等，popup 静默回显「完整反色」。
  - **D5 默认值三份真源**：popup 不读 `DEFAULT_PREFS`（第三份硬编码），模态亦内联回退 →
    改默认值会静默漂移。
  - 另：`hoverRestore` 在模态里被渲染成**两个开关**（同时写同一份 `state.hoverRestore`）。
  - **D7（严重，经复核独立复现）· 扩展设置页 4 个滑杆是死控件**：
    `getActiveFilter()`（`:1292`）只有两条分支 —— `presetId === 'custom'` 时才用
    brightness/contrast/saturate/hueRotate 组装滤镜，否则**直接返回 `PRESETS[presetId].filter`**，
    四个数值完全不参与。而 `state.presetId` 全仓只有**一处**（`:6273`，页内面板路径）会置 `'custom'`，
    `options.js` **从不写 `presetId`**，且 schema 的 presetId 下拉只有 `soft-gray`/`amoled`
    **两项、无 `custom`**。→ 在扩展设置页拖「画面亮度/画面对比度/色彩饱和度/色相旋转」：
    **能拖能存盘、零效果**。特效路径（`:9374`）同样以 `presetId === 'custom'` 为门。
  - **D8**：页内胶囊的「图片:开/关」只读全局值，popup 读合成值
    （`state.imageInvert !== false && getSiteProfile().imageInvert !== false`）
    → 本站被强制关时，**两处显示相反**。
  - **D9**：`scheduleStart` / `scheduleEnd` 的 `kind` 在页内模态（裸 `selectRow`）与 schema
    （`hour`）之间分叉 —— 当前无害，但属未登记的分叉，改造时必须一并收敛。
  - **分层可行性约束（复核否决的提案）**：报告 04 曾建议「popup 的 `#policy` / `#hover`
    做成本站三态」，但 `resolveSiteProfile`（`:3675`）的键面只有
    `enabled / videoInvert / imageInvert / bgReplace / imgFxMode / disableVideoAuto / protect / forceInvert`
    —— **没有 `imagePolicy` / `hoverRestore` / `presetId`**，故该建议**按现结构不可行**。
    `design.md` 不得照抄它；若要实现，须先扩站点覆盖键面（属扩大改动面，须回报用户）。

### 对齐类

- **R6 · Dark Reader 对齐**（基准以经复核修正的 `research/02-VERIFY.md` 为准）：
  - popup 采用**三页签信息架构**；控件语言对齐 DR：**直角**（DR 无任何 radius 变量）、
    外描边 **2px** / 内描边 1px、DR 配色（已对齐）。
  - **更正（原写法有误）**：本 PRD 早先写的「卡片式设置分组」是**错的** ——
    **DR 没有圆角卡片**（复核 N9），它是「分区标题 + 分隔线」。不得为凑"像 DR"而引入
    DR 并不存在的卡片结构。
  - **N1 不可照搬**：DR popup 页头**无 ×**（靠浏览器原生关闭）。本项目的面板是
    **页内注入浮层**，照搬即死锁 —— 这正是用户投诉第 4 条。第一轮报告曾把这条错放进
    「可直接照搬」栏，已由复核纠正。
  - **不得照搬 DR 的无障碍缺陷**：DR 的 Toggle / DropDown / Select / Slider 源码
    无 `tabindex` / `role` / `keydown`，**不可键盘操作**；本仓现用的原生
    `select/range/checkbox` 是可键盘、可读屏的。忠实照搬 = 无障碍回退。
  - **N3/N4 与既有硬规则冲突**：照搬 DR 边框色 `#316e7d` = **2.95:1**，撞 AC3 的 3:1 下限；
    DR 里的 `border:2px solid white` 属颜色字面量，撞 R7（且既有守卫抓不到命名色）。
    两者都必须改用本仓 token 表达。
  - 「照搬」范围以 `02-VERIFY.md` 的**「不可照搬项 N1–N9」**与修正后的两栏清单为准；
    早先「可直接照搬 16 项」中被剔除的条目不得再进 `design.md`。

### 不可破坏的既有硬约束（每一条都有守卫测试，违反即门禁红）

- **R7** · design token 唯一来源（`v6.4-TOKENS-START/END` 块，构建时注入 popup/options）；
  绝不在面板 CSS 或两个 HTML 产物里手写颜色（唯一允许的字面量是闪屏守卫 `background:#000`）。
- **R8** · 控件唯一实现 —— 单一 `SviControls` 库；v5 时代的 `ui.*` 别名**已删除**，
  单测要求调用点为 0。
- **R9** · 图标唯一来源 —— `SviControls.ICONS`，一律 `<svg fill="currentColor">`；
  **禁止** emoji 字符、禁止在调用点手写 `<svg>` 字面量。
- **R10** · 样式挂载唯一入口 `mountStyleNode` + 根依赖唯一延迟点 `whenRootReady`；
  禁止裸写 `(document.head || document.documentElement).appendChild(...)`。
- **R11** · `extension/` 是**构建产物**，禁止手改；改完源必须 `node scripts/build-extension.js` 重建。
- **R12** · 用户脚本与扩展靠 `dataset.sviOwner` 握手共存；改头须 bump `@version` 并同步重建。
- **R13** · 不引入外部 CDN / 外部依赖（nocdn）；UI 文案中文、标识符 ASCII；
  面板 UI 一律经 `SviControls` 组件构建器。
- **R14** · 运行时状态（视频反色标志等）per-tab 内存，**绝不持久化**；
  只经 `Store` 读写 `svi:*` 键。**不得**改动既有 `svi:prefs` 子键语义（避免用户升级丢设置）；
  若确需迁移，必须写出迁移路径并在 `design.md` 论证。

## Non-Goals

- 不改动反色引擎 / 判定流水线 / 区域分割内核（本次只动 UI 层）。
- 不做技术栈替换（不引入 React / Vue / 构建期框架）。
- 不改变扩展 ID、`@name`、`geckoId` 等身份字段。
- 不做主题系统之外的视觉改版以外的事（不顺手重构引擎）。

## Acceptance Criteria

> 每条都必须**可复现、有证据**（探针输出 / 截图 / 单测断言）。
> 禁止出现「存在某条 CSS 规则」这类自证式验收 —— 这正是前 4 次重建失效的机制（见 `research/01`）。

- [ ] **AC1（R1）** 探针断言：存在一个显式关闭控件，点击后 `.svi-panel-card` 不再含 `show` 类，
      且全程**未点击面板外部**。证据：CDP 探针输出 + 前后截图。
- [ ] **AC2（R3a）** **CDP 真鼠标**断言，在「全局」页签激活状态下：
      ① 点击模态关闭按钮后模态确实关闭；② 隐形取色器的
      `getBoundingClientRect()` 不超出其色块容器（**不得等于视口尺寸**）；
      ③ 点击遮罩空白区后 `document.activeElement` 不是 `input[type="color"]`。
      证据：探针 JSON + 前后截图，并以「本站」页签作对照组。
      （注意：不再要求把原生取色器删光 —— 经实测，缺陷是**定位上下文缺失**而非控件本身。）
- [ ] **AC3（R2）** 探针读取三处界面每个按钮的计算样式，断言其与**相邻底色**的对比度
      **≥ 3:1**（WCAG 1.4.11 非文本对比度下限），且 on/off 两态都可辨。
      实测基准（2026-09-28，底色 `#141e24`）：按钮填充 `--svi-ctl-bg` 与面板底**同色** → **1.00:1**
      （完全不可见）；现用边框 `--svi-ctl-hover` `#193945` → **1.38:1**；
      Dark Reader 原用描边 `--svi-border` `#316e7d` → **2.95:1**（**仍低于 3:1**，
      故"照搬 DR 边框色"不足以达标，`design.md` 须给出达标的取值并说明与 DR 的偏离）。
      证据：逐按钮的属性表 + 对比度计算输出。
- [ ] **AC4（R4/R5）** 单测断言：三处界面渲染的设置项集合均 ⊆ schema 清单，
      **同界面内无重复键**；`research/04` 列出的「同名语义/默认值不一致」项全部归零。
- [ ] **AC5（R6）** `research/02` 中列为「可直接照搬」的 token 与控件规格全部落地；
      popup 三页签结构与 Dark Reader 一致。证据：token 差异表前后对照。
- [ ] **AC6（R7–R10）** 既有守卫测试全绿：`ui.*` 调用点为 0、零 emoji 码点、
      token 三处逐字节一致、样式挂载走 `mountStyleNode`。
- [ ] **AC7** 五绿门禁全绿：
      `node --check universal-smart-invert.user.js` · `node test.js` · `node test-browser.js` ·
      `node test-extension.js` · `npx web-ext lint --source-dir=extension`（0 errors），
      外加 `node scripts/build-extension.js && node scripts/pack.js`。
- [ ] **AC8（R11/R12）** 改动后已重建 `extension/`，且 `@version` 已 bump；
      `git status` 中 `extension/` 的变更全部来自构建而非手改。
- [ ] **AC9** `scripts/check-panel-overflow.js` 在多视口宽度下仍断言无横向溢出。
- [ ] **AC10** `research/01` 产出的「必须规避的坑」清单，**以其经对抗性复核修正后的版本为准**
      （见 `research/01-VERIFY.md`：P3/P4/P7 已判定不可直接实施、P5/P10 被判为口号需改写），
      逐条在本任务里有对应处置（已规避 / 已加守卫 / 明确不适用并说明理由）。
      **注意 P4 的雷**：`test-browser.js:1140` 现有绿灯断言 `hasPicker must exist=true`
      （`:999` 断言 `.svi-color-input-native` 必须在场）—— 若采纳「删掉原生取色器」的路线，
      这条现有断言会先变红，必须先与用户确认再改断言，不得静默放宽。
- [ ] **AC11（R3b/R15）** **真实按键**断言：模态打开状态下按 `Esc` 后模态关闭，且 console
      无 `TypeError`。另加静态守卫：`this.cancelRegionMask` / `this.armRegionMask` 的调用点
      所属类上确实存在同名方法（或已改为显式委托给引擎）—— **死调用归零**。
      （此类缺陷 `test.js` 的源码扫描与既有单测都看不见，必须由 `test-browser.js` 的真实按键路径守住。）
- [ ] **AC12（D7）** 死控件归零：在**扩展 options 页**调整「画面亮度 / 画面对比度 / 色彩饱和度 /
      色相旋转」后，实际生效的滤镜字符串必须随之变化。探针断言：改动前后
      `getComputedStyle(<媒体元素>).filter`（或 `getActiveFilter()` 的返回值）不同。
      不得出现"能拖能存盘但零效果"。同一条也适用于 `presetId` 能否达 `custom` 的一致性。
- [ ] **AC13（D8）** 页内胶囊与 popup 对「图片」开关的**显示一致**：构造本站被强制关的场景，
      断言两处显示同一状态（不得相反）。

## Notes

- 研究产出入库位置：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity/research/`
  - `01-prior-ui-overhaul-postmortem.md` — 前 4 次重建归因 + 必须规避的坑
  - `02-darkreader-ui-anatomy.md` — Dark Reader UI 解剖（照搬基准）
  - `03-ui-defects-repro.md` — 6 条缺陷复现与根因（file:line）
  - `04-settings-redundancy-matrix.md` — 三处界面设置项冗余矩阵 + 重构映射建议
- `design.md` 必须等上述研究回来后再写；不得在无证据情况下定技术方案。
- 本轮为链式交叉检查：研究（第一轮）→ 交叉复核（第二轮）→ 实现 → 独立 check 子代理。
