# Implement: v6-4 UI 全量同源重构

> 复选框**随执行实时勾选**（全局规则 §4.5）。
> **切片（用户 2026-09-26 裁决）**：拆两轮 —— 第一轮「机制层」，第二轮「重建层」。
> 为什么这样切：机制层（token 真源 + 构建注入 + 控件库收口）是重建层的地基，且不触碰任何 DOM
> 结构，因而**不会撞** bench 里大量面板断言；重建层要改结构与文案（含 66 处 emoji），
> 值得单独一轮专注做，也避免同一批 UI 文案改两遍。
>
> **配色方向（用户 2026-09-26 裁决）**：**照搬 Dark Reader 的深青调**（PRD R7 表里的值逐值照搬）。

---

# 第一轮：机制层

## 阶段 M0 — 设计 token 单一真源 ✅ 完成

- [x] token 块定义在 `universal-script` 的 `:root` 里，用 `/* v6.4-TOKENS-START/END */` 标记包住，
      作为**全仓唯一真源**（DR 颜色角色逐值照搬 + 少量深底可读性派生量 + 度量 token）
- [x] 面板 CSS（1358 行）里**全部**颜色字面量改为 `var(--svi-*)`：
      108 处 `#hex` + 116 处 `rgba()` 全部收敛到 12 个颜色角色 + 6 个 rgba 三元组
- [x] 内联样式里的颜色同样改走 token（全文件只剩 1 处例外：防闪光功能的 `background:#000`，
      它是安全语义不是主题色，已在单测里作为**唯一允许的例外**白名单化）

## 阶段 M1 — 构建时注入 + 三处一致性 ✅ 完成

- [x] `scripts/build-extension.js` 从用户脚本抽出 token 块，注入 `popup.html` / `options.html`
      的 `/* SVI_TOKEN_INJECT */` 占位；**占位缺失即构建失败**（防止有人手写颜色把同源机制绕过去）
- [x] 新增 `scripts/extension-src/options.html` + `options.js`（第三个消费点）：
      第一轮只交付**外壳**（token 取色 + 版本 + 站点状态探测，验证消息通道），
      区块内容随重建层交付 —— 但「三处同源」这条验收从此**当场可测**
- [x] `manifest.json` 增加 `options_ui`（`open_in_tab`）
- [x] 单测：三处 token **逐字节一致**；面板 CSS 与两个 HTML 在 token 块之外**零颜色字面量**；
      `grep` 核查不存在第二处 token 定义

## 阶段 M2 — 控件库收口 ✅ 完成

- [x] 既有 11 个 `ui` 工厂方法**整体搬进** `SviControls`（DOM 构造只剩这一处实现）
- [x] 按 DR 控件词汇补齐：`group` / `multiSwitch` / `checkRow` / `navButton` / `resetButton` /
      `collapsible` / `messageBar` / `colorPicker` / `shortcutRow`（共 20 项）
- [x] `ui` 退化为**转发垫片**（零节点构造）—— 调用点保持不动，重建层再逐个换成 `SviControls.*`
- [x] 单测：词汇表 20 项齐全；`{row, sync}` 协议正确；**每个工厂在真源里只有一处实现**（收口）；
      `ui` 垫片体内不得出现 `createElement` / `appendChild`

## 阶段 M3 — 沉淀与门禁 ✅ 完成

- [x] spec：`.trellis/spec/frontend/ui-design-tokens.md`（token 表 + 三处消费机制 + 控件词汇）
- [x] `AGENTS.md` 硬规则：token 只能有一处真源、构建注入、控件只有一处实现、禁止手写颜色
- [x] 四绿门禁全绿（`node --check` / `test.js` / `test-browser.js` **31 场景** / build+pack
      —— 扩展产物由 8 entries 变 **10 entries**，扩展 smoke 用例照常通过）

**验证**：四绿全绿。
**回滚点**：整轮 revert 即回到「硬编码颜色 + 单一 ui 对象」，无数据迁移、无行为变化。

---

# 第二轮：重建层（进行中）

> **勘察结论（本轮开工前实测）**：面板区块构建代码约 2500 行（`buildSettingsModal` @12550 起，
> 共 13 个 `buildXxxSection()`）；行工厂**已全部走 `SviControls`**（第一轮收口完成），
> 但 `ui` 垫片只转发 **11 项**，`navButton` / `resetButton` / `collapsible` / `messageBar` /
> `checkRow` / `colorPicker` / `shortcutRow` / `multiSwitch` / `group` **不在转发表内** ——
> 重建层要用的控件必须直接调 `SviControls.*`（本轮已定此风格）。
> 据 `DEFAULT_PREFS`（105 键）逐区块抽取「区块 → 偏好键」映射后实测：**12 个 `region*` 键
> 在面板区间内零引用**，即 v6 全套开关此前无 UI（详见偏离 4）。

## 阶段 R-0 — 区域反色设置区块（勘察新增，v6 全套开关此前无 UI）✅ 完成

- [x] 新增 `buildRegionSection()`（`svi-sec-region`，紧邻「图片反色」之后进全局页签）
- [x] 12 个 `region*` 键全部落 UI：5 个开关（`regionSegment` / `regionRender` /
      `regionStaticOnly` / `regionCorrect` / `regionCalibrate`）+ 7 个滑块
      （`regionGridN` / `regionMinAreaRatio` / `regionKRects` / `regionHeartbeatMs` /
      `regionOverlayMax` / `regionCalibrateMinSamples` / `regionCalibrateStep`）
- [x] 补齐 v6-3 PRD 明确要求的面板项：只读诊断（累积样本数 / 最近一次参数变化）+
      「清空纠正数据」入口 + 「回滚面积门到默认值」入口 + 「进入区域纠正模式」入口
- [x] 面积类参数以**百分比呈现**（0.5%~20% / 0.1%~5%），存储仍是原量纲小数 —— **键名与语义不动**
- [x] 纠正入口自动挑「已挂上区域层且可见」的最大一张图（v6-3 D1：部分反色全自动，无划选入口）

**验证**（定向实测，脚本在系统临时目录，不入库）：区块渲染出 5 开关 + 7 滑块 + 3 按钮 +
诊断行；开关联动写入 `prefs.regionSegment` 且**落盘**到 `svi:prefs`；
`regionCorrect` 关时点入口按钮正确提示「先打开「区域纠正模式」开关」；
回滚按钮把 0.123 复位到 0.03；**零页面异常**。

## 阶段 R0 — popup 三 tab ✅ 完成

- [x] `Filter` / `Site list` / `More` 三 tab；复用 token（直调 `SviControls.*` 的**扩展页替代物**：
      扩展页拿不到用户脚本里的控件库实例，故本页签用与控件库同名的 class/结构 + token 变量手写，
      同源由 token 与结构语义保证 —— 见偏离 6）
- [x] 保持既有三条消息协议（`svi-get-snapshot` / `svi-site-power` / `svi-set-pref`）不破：
      快照只**新增**只读字段（`siteMode` / `blacklistCount` / `whitelistCount` / `overriddenSites` /
      `listPreview`），既有字段逐字段不动；`test-extension.js` 的三条协议往返断言原样全绿
- [x] 三页签内容：反色（预设 / 图片策略 / 特效模式 / 图片反色 / 悬停复原）·
      本站（本站开关 + 站点名单摘要 + 本站计数）· 更多（页面内设置面板入口 / 扩展设置页入口 /
      清除本站覆盖 / 版本）
- [x] 新增第四条协议 `svi-site-reset`（清除本站覆盖）+ 用户脚本侧具名方法
      `uiController.resetSiteOverrides()`；语义与面板「三态循环回继承」时是**同一处状态操作**（偏离 6）

**验证**：`node test-extension.js` → 7 场景全绿；新增断言实测：
页签 `{buttons:[true,true,true], before:['filter'], afterSites:['sites'], sitesSel:'true', afterMore:['more'], afterFilter:['filter']}`；
站点名单 `{mode:'全部启用', counts:'黑名单 0 · 白名单 0', overridden:'0 个站点'}`；
`svi-site-reset` 前造覆盖 → 快照 `overriddenSites:1` → 清除后 `1 → 0` 且 `prefs.siteOverrides` 为空。

> **跨阶段待闭环**：PRD R3 的 AC 还包含「popup 内每一项在 options 页有对应项且双向同步」——
> 这一条依赖 R1（options 承载全量设置项），在**评审门 G2** 一并判。本轮只闭环 popup 侧。

## 阶段 R1 — 独立 options 页内容 ✅ 完成

> 本阶段切成两半：**R1a 机制**（真源 / 构建 / 产物）与 **R1b 页面**（渲染 / 单测 / E2E），两半均已交付。

### R1a — 设置项单一真源 + 控件库抽块（✅ 已完成）

- [x] **schema 单一真源**落在用户脚本 `/* v6.4-SETTINGS-SCHEMA-START/END */` 块内：
      `SVI_SETTINGS_SCHEMA` = 10 组 / **91 项**，每项 `{key, kind, label, hint, min/max/step/unit | options | rows}`
      （R1a 交付时为 89 项；R1b 修完抽取缺陷并补上两个「面板有开关但没行定义」的总开关后为 91，见偏离 11）
- [x] 标签文案**不是另写一份**：由生成器从面板自身的行工厂调用里**机械抽取**（label/hint/range/options 全取原值），
      见偏离 8；R2 面板重建后两处同源
- [x] **控件库抽块**：给 `SviControls` 加 `/* v6.4-CONTROLS-START/END */` 标记（355 行、**块内零外部依赖**、
      20 个词汇），构建期原样抽给扩展页 —— 这是 options 能真复用控件库（而非像 popup 那样手写）的关键
- [x] `scripts/build-extension.js` 新增两条抽块：产出 `extension/ui-controls.js`（IIFE + `window.SviControls`）
      与 `extension/settings-schema.js`（schema + `SVI_DEFAULTS` + `window.*` 导出）；
      **缺标记即构建失败**（与 token 块同纪律）
- [x] `SVI_DEFAULTS` 由 `DEFAULT_PREFS` 字面量在构建期求值注入（105 键）——
      构建期先核对块内无外部标识符，求值失败即构建失败（它必须保持纯字面量）

**验证**：构建日志 `已抽出 ui-controls.js (355 行控件库) + settings-schema.js (118 行 schema, 105 个默认值)`；
`node --check universal-smart-invert.user.js` 通过；`node test.js` 全绿；
用最小沙箱（只给 window/document 桩）求值 `extension/ui-controls.js` → `window.SviControls` 导出 **20 个词汇**，
证明产物**自包含可用**；bench 33 场景零回归（本轮改动为纯数据常量 + 构建产物）。

### R1b — options 页渲染（✅ 已完成）

- [x] `scripts/extension-src/options.html`：在既有 token 占位之外，按顺序引入
      `settings-schema.js` → `ui-controls.js` → `options.js`（三者都是扩展页自有脚本，无需进 manifest）
- [x] **整份面板 CSS** 也在构建期注入（新占位 `/* SVI_PANEL_CSS_INJECT */`）——
      控件样式只能有一个实现点；**缺占位即构建失败**（见偏离 10）
- [x] `options.js`：按 schema 渲染 **10 组**（`SviControls.collapsible` 折叠卡，默认展开），每项用对应工厂：
      `toggle`→`toggleRow` · `slider`→`sliderRow` · `select`→`selectRow` · `text`→`textRow`
      · `color`→`pickerRow` · `chipsOf`→`chipRow`（候选项来自构建期抽出的 `SVI_IMG_COLOR_PRESETS`）
      · `hour`→ 运行时构造 0~23 的 `selectRow`；**未知 kind 显式渲染错误条**（不静默跳过）
- [x] 读写：从 `chrome.storage` 读（`svi:prefs`，**同一份协议**：整值 / `.meta`+`#i` 分片 / sync→local 回退——
      与内容脚本 Store 后端链一致），写入走**去抖 300ms**；**键路径支持点号**
      （如 `videoTune.brightness`、`actions.hide.enabled`），缺失值用 `SVI_DEFAULTS` 兜底
- [x] **清单单测**（本阶段的 AC）：`test.js` 新增「v6.4 R1b」块 —— ① 每个 schema 键必须能在 `DEFAULT_PREFS`
      里按点号路径取到值；② `DEFAULT_PREFS` 的每个**叶子键**要么被 schema 覆盖（自身或祖先）、
      要么在**例外表**里逐条写明理由（27 条，且表本身受断言约束：已上页面 / 已不存在的键留在表里即变红）；
      ③ schema 键面 ⟷ 面板键面（`UIController` 类体内的 `state.<路径>`，归一到 DEFAULT_PREFS 里存在的最深前缀）
      双向核对；另加 ④ schema 的每个 `kind` 必须在 options.js 的 `KINDS` 里有实现且指向真实工厂；
      ⑤ **存储协议同构**：前缀 / 逻辑键 / 分片预算 / 防抖时长逐值等于内容脚本，`chunkRaw` 与
      `Store.chunkRaw` 在 8 组刁钻样本（含中文、代理对、边界长度）上**逐片一致**
- [x] E2E（`test-extension.js` 场景 7）：把 `options.html` 当真标签页打开 → 与**真源 schema 逐键比对**
      渲染结果（10 组 / 91 项、每类控件数量、无「未实现 kind」告警）→ 断言页面值来自已存偏好 →
      用真实控件事件改一项 → 等防抖 → 断言**落到 `svi:prefs`** → 内容脚本重装后读到新值 →
      **反向**（内容脚本写 → options 重载后读到）→ 收尾还原两项
- [x] 评审门 **G2**：options 页设置项清单逐项无缺失 —— **通过（带例外，见下）**

**验证（五绿 + 负向对照）**：
- `node --check universal-smart-invert.user.js` ✓
- `node test.js` ✓（4/4 连续绿；新增块输出 `10 组 / 91 项 三向核对无缺失 + 例外表 27 条 + 存储协议同构`）
- `node test-browser.js` ✓ 33 场景（面板 CSS 新增 6 组词汇的样式，bench 面板断言零回归）
- `node test-extension.js` ✓ 8 场景（0~7）；场景 7 实测输出：
  `渲染: 10 组 / 91 项 | 开关 28 滑块 45 下拉 13 文本框 2 取色器 2 色卡 4 | 存储后端 sync` ·
  `改 maskBlur=13 → svi:prefs 已更新 (状态行: 已保存)` · `内容脚本重载后 prefs.maskBlur = 13` ·
  `内容脚本写入 maskHoverOpacity=0.35 → options 重载后已读到` · `收尾还原 ✓`
- `node scripts/build-extension.js && node scripts/pack.js` ✓（zip 12 entries，含两个新产物）
- **负向对照**（证明断言咬得住）：把副本的 `settings-schema.js` 删掉一项 → 场景 7 立刻变红退出 1
  （`options 页声明的项数必须等于真源项数: 90 !== 91`）

**G2 判据说明（逐项对账）**：schema 91 项 ⟷ DEFAULT_PREFS 121 个叶子键 —— 88 项直接覆盖 + `imgPresets`
一项覆盖 4 个叶子；余下 **27 个叶子键在例外表里逐条写明理由**（分类：死键 1 · 面板自身形态与开合态 6 ·
数据容器 3 · 引擎阈值/预算 9 · 派生值 1 · **面板有 UI 但为自建 DOM 需新控件 3** · 存储后端 1 · 统计开关 1 ·
背景替换全局默认 1 ……合计 27）。
**未达成项如实标注**：面板的**原色屏蔽色卡列表** / **元素规则列表编辑器** / **背景排除选择器** 三项
面板有 UI 而 options 尚无（前者需要新的控件类型：色卡增删与结构化列表增删），登记为 R2 同一批工作。

> **R1 之后**：R2（内嵌面板 12 区块重建，撞 bench 面板断言，**不得放宽**）、R3（emoji 清零，当前实测
> 27 种字符 / 317 实例；R1 新增文案里出现的 ⚠ 也计入）、R4（README/README_EN + 四绿）。见评审门 G3。

## 阶段 R2 — 内嵌面板 12 区块重建 ⬜
- [ ] 用 `SviControls` 重建 12 区块；胶囊 / toast / 模态 / 区域框选层一并纳入 token
- [ ] 设置项清单与重建前逐项比对无缺失（清单单测）
- [ ] **不得为通过而放宽 bench 断言**：撞到旧 DOM 结构的断言按新结构改写并在偏离记录里说明

## 阶段 R3 — emoji 清零 ⬜
- [ ] 三处路径（用户脚本 / `extension/` / `scripts/extension-src/`）emoji 码位计数为 0
- [ ] 图标一律内联 SVG + `fill: currentColor`
- [ ] 单测扫描 emoji 码位区间（第一轮实测: 27 种字符、317 个实例，含注释里的箭头；
      白名单与码位区间在实现时按 PRD R6 明确写下）

## 阶段 R4 — 文档与门禁 ⬜
- [ ] README / README_EN 更新为新 UI 结构说明（含新增的「区域反色」区块）；四绿

---

## 评审门（review gates）

| 门 | 时机 | 判据 |
| :--- | :--- | :--- |
| **G1（第一轮）** | M3 后 | token 三处逐字节一致 + 零字面量残留 + 控件单一定义点 —— **已通过** |
| G2（第二轮） | R1 后 | options 页设置项清单逐项无缺失 —— **已通过（带例外）**：91 项全部落页面并与真源逐键核对；27 个未上页面的默认值键在例外表里逐条写明理由；其中 3 项（色卡列表 / 元素规则列表 / 背景排除选择器）**面板有 UI 而 options 尚无**，如实登记为 R2 工作 |
| G3（第二轮） | R4 | 四绿 + emoji 计数为 0 + 面板断言全部按新结构通过（无放宽） |

## 与计划的偏离记录

> 格式：`偏离 N — 原计划 / 实际 / 原因`（执行中实时追加）

**偏离 1（第一轮）— 切片：从「一轮做完」改为「机制层 / 重建层」两轮。**

PRD 把 R1~R7 写成一片交付。实际拆成两轮（用户 2026-09-26 裁决），理由：
1. 重建层要动 12 个区块的 DOM 与全部 UI 文案（含 66 处 emoji），而 bench 里有大量面板断言
   —— PRD 明确**不许放宽断言**，这一堆必须在同一轮里同时改结构、改文案、逐条核对断言，
   与「机制层」混在一起会让两者都难以验证；
2. emoji 清零与文案重写高度重叠，放在重建层做可以避免同一批字符串改两遍。

**偏离 2（第一轮）— 第三个消费点先用「外壳」占位。**
PRD 要求 token 有三处消费点（内嵌面板 / popup / options），而 options 页本身是 R4 的内容，
属重建层。若不先建外壳，R1 的「三处一致」验收在本轮**无法成立**。
实际：本轮交付 options **外壳**（token 取色 + 版本 + 站点状态探测），内容留待重建层；
这让同源机制当场可测，且外壳本身没有任何"半成品感"（它已经是一个能打开、能工作的页面）。

**偏离 3（第一轮）— 控件库先收口形状、不换外观。**
把既有 11 个工厂整体搬进 `SviControls` 时**刻意不改其产出的 DOM**（只搬家 + 收口），
新控件的视觉细化也留到重建层。理由：本轮的验收是"单一定义点 + 三处同源"，
一旦顺手改结构，就会把 bench 的面板断言一起拖进这一轮，违背切片初衷。

**偏离 4（第二轮）— 计划外新增「区域反色」区块：v6 全套开关此前根本没有 UI。**

原计划：第二轮只重建既有 12 个区块（PRD R5 的清单）＋ popup ＋ options ＋ emoji。

实际：开工前的勘察（按 `DEFAULT_PREFS` 逐区块静态抽取「区块 → 偏好键」映射）实测发现
**12 个 `region*` 键在整个面板构建区间内零引用**，即 v6-1/2/3 三片交付的内核、渲染层、
纠正与自校准**在 UI 上完全不可达**（用户只能改控制台偏好）。而 v6-3 的 PRD 第 71~72 行
明确要求过：「『区域纠正模式』开关 / 『用纠正数据自校准』开关 / 『清空纠正数据』入口」
与「面板只读诊断：累积样本数 / 最近一次校准时间与参数变化 / 回滚按钮」—— **均未交付**。

判定：这不是"新增功能"，而是**补齐已验收任务的欠项**，且属于 PRD R4「承载**全部**设置项」
的直接前提（否则 options 页无从承载）。故本轮先补该区块（阶段 R-0，已交付并定向验证）。
父 PRD 的 Notes 也早已预告这一点：「本片依赖批1 的最终设置项形状（部分反色会新增一批设置项，
UI 重建必须在它们定型之后做）」—— 只是没料到那批设置项连面板入口都还没有。

**偏离 5（第二轮）— 清单单测改走「静态抽取 + 显式例外表」，不做运行时注册。**

原计划（PRD R4/R5）：用「清单单测」逐项核对设置项无缺失。

实际：`SviControls` 的行工厂签名是 `(label, hint, getVal, onSet, …)` —— **不接收偏好键**
（键被 getter/setter 闭包捕获）。因此运行时无法据此建立「控件 → 偏好键」注册表，
除非改动全部调用点。改为：

1. 从 `DEFAULT_PREFS` 抽出全部键（当前 105 个）；
2. 按面板区块静态抽取 `state.<key>` 引用，得到「区块 → 键」映射；
3. 断言：**每个键要么被某个区块引用、要么在显式例外表里**（例外表逐条写清为什么不该有 UI，
   例如 `settingsOpen` / `advancedOpen` / `pos` / `settingsLayout` / `storeBackend` 等纯 UI 态
   与运行时态）。

代价如实说明：静态抽取只能证明「被引用」，不能严格证明「有一个控件绑着它」。
它的价值在于**任何新增偏好键若忘了上 UI，测试立刻变红** —— 那正是本条验收要防的事。
更严的口径（真·绑定性断言）需要先给行工厂加键参数，属后续可做的加固，不在本轮范围。

**偏离 6（第二轮 · 阶段 R0）— popup 的三处「复用」在扩展页里有硬边界，如实说明。**

PRD R3 要求 popup「复用 `SviControls` 与 token」。实际有两处做不到按字面执行，理由如下：

1. **控件库实例跨不过进程边界**：`SviControls` 活在用户脚本（内容脚本 / 隔离世界）里，扩展 popup 是
   独立扩展页，拿不到那个实例；而「单文件真源」约束又禁止再写一份 JS 模块。故 popup 页的部分采用
   与控件库**同名的 class 与结构** + token 变量手写，同源由「同一套 token + 同一套结构语义」保证
   （token 逐字节一致性仍由 `test.js` 把关）。真正的控件库复用发生在**页面内面板**（R2）里。
2. **面板里没有现成的「清除本站覆盖」handler**：面板只在三态项循环回「继承」时顺带
   `delete state.siteOverrides[host]`（`cycleTriState` 内联）。为使 popup 的「更多」页签有这项能力、
   又不让语义分叉，把它抽成具名方法 `uiController.resetSiteOverrides()`，内部就是**同一处状态操作**
   （delete + `savePrefs` + `evaluateSitePower` + 重扫 + 刷新），并在消息通道新增第四条协议
   `svi-site-reset` 调用它。既有三条协议**只做加法**：快照响应新增 5 个只读字段，老字段逐字段不动，
   套件里三条协议的往返断言原样全绿。

**偏离 7（第二轮 · 阶段 R0）— 自动化上的两个坑（对后续所有 E2E 都适用）。**

1. **断言写在 `Target.closeTarget` 之后 = 永久挂住**：目标一关，CDP 响应永不到来，而我的客户端当时
   没有超时 —— 整轮跑了十分钟才被人为掐掉，日志停在最后一条成功打印上，看起来像「某步很慢」。
   已给 CDP 客户端加 20s 超时并带上「目标可能已关闭或已导航」的提示。
2. **残留进程占端口**：上一轮被掐断时，node 子进程与它启的临时配置 Chrome 仍活着，占住 http 端口
   8791，下一轮直接 `EADDRINUSE` 起不来。清理时**只按 PID 精确杀自己启的那两个**（node + 它的
   `--user-data-dir=<临时目录>` Chrome），不碰用户自己的浏览器。

**偏离 8（第二轮 · 阶段 R1a）— schema 不手抄，改为「从面板行定义机械抽取」（含判定规则与已知噪声）。**

原计划（隐含）：为 options 页另写一份设置项清单（键 + 标签 + 范围）。
实际：另写一份必然与面板**漂移**（面板改标签/改范围，options 不知道），而 PRD 的 AC 恰恰要求「逐项无缺失」。
故改为：写一个一次性生成器，从面板的行工厂调用里机械抽取，把结果**固化**为 `SVI_SETTINGS_SCHEMA` 块
（真源在用户脚本内）。抽取规则与实测结果：

| 项 | 规则 / 结果 |
| :--- | :--- |
| 键 | 取该行回调里引用的 `state.<k>`；复合键保留点号路径（如 `videoTune.brightness`），取**最深**的一条 |
| 合法性 | 根段必须在 `DEFAULT_PREFS` 内，否则丢弃并报告 —— 实测**丢弃 0 项** |
| 去重 | 同一键只留一条（同一键在面板里可能有多行，如 `hoverRestore` 在两个区块各出现一次） |
| 标签/提示 | 取行工厂的第 1/2 个字符串实参（原值，不重写） |
| 滑块范围 | 取第 5/6/7/8 实参（min/max/step/unit）—— 实测 **0 项缺范围** |
| 下拉选项 | 取第 3 实参；若那是常量标识符（如 `IMG_FX_MODES`）则回源码解析该常量 —— 实测修正后 **0 项缺选项** |
| 抽样结果 | 89 项 / 13 组（外观 7 · 图片 18 · 区域 12 · 视频 16 · 本站 2 · 站点名单 3 · 动态主题 8 · 可读性 3 · 定时 3 · 元素动作 18） |

**已知噪声（写进交接，别被误读）**：
1. 静态抽取 `state.<k>` 时会把 `xxx.state.className` / `xxx.state.textContent` 误当偏好键 —— 实测命中
   `className` / `textContent` 两条，已被「根段必须在 DEFAULT_PREFS」这条挡掉；
2. 面板确未引用的 15 个键（`enabled` / `settingsOpen` / `advancedOpen` / `manualOverrides` / `statsEnabled` /
   `bgReplace` / `storeBackend` / `eagerScanBudget` / `localFirstDecide` / `calibrateMinSamples` /
   `falseInvertRate` / `flashWindowRatio` / `animDecodeBudgetMs` / `animRecheckMs` / `maskSettleTimeoutMs`）——
   其中既有**数据/运行时态**（前 5 个与 `manualOverrides` / `storeBackend`），也有**经辅助函数而非区块内联**
   承载的用户项（其余）。R1b 的例外表要**逐条**给出归类，不许笼统写「纯 UI 态」；
3. 四个特殊项走了人工修正表：`presetId`（chip → 二选下拉）、`imgPresets`（动态色卡 → `chipsOf`）、
   `scheduleStart` / `scheduleEnd`（面板用运行时构造的 0~23 小时数组 → `hour` 类型）。

**偏离 9（第二轮 · 阶段 R1a）— 插块位置踩坑：token 块在 CSS 模板字符串内部。**

`v6.4-TOKENS-START/END` 位于面板 CSS 的模板字符串里（token 真源就是那段 CSS 变量）。
第一版我把 schema 块顺手插在 token 块之后 → 等于把 JS 塞进 CSS 字符串，`node --check` 立刻报
`Unexpected identifier 'kind'`。改为插在 `v6.4-CONTROLS-START` 之前的真实 JS 作用域。
**教训**：往用户脚本里插新块前，先确认锚点**在字符串里还是在代码里**。

**偏离 10（第二轮 · 阶段 R1b）— 控件样式改为「整份面板 CSS 构建期注入」，而不是在扩展页手写第二套。**

原计划（隐含）：options.html 自带一段页面 CSS（第一轮的壳就是这么写的），控件样式同理。
实际：options 页整页都由 `SviControls` 搭出来（`.svi-modal-*` / `.svi-chip` / `.svi-msg` …），
若在扩展页手写这些 class 的样式，就等于**第二套控件样式**——正是本项目硬规则禁止的漂移源。
改为：构建期抽出用户脚本里的**整份面板 CSS**，注入 options.html 的新占位 `/* SVI_PANEL_CSS_INJECT */`
（token 块本身仍走原占位，避免同页定义两次）。安全性是核对过的：

| 检查 | 结果 |
| :--- | :--- |
| 面板 CSS 里 token 块之外的颜色字面量 | 0 个 `#hex` / 0 个 `rgba(…)`（全部走 `var(--svi-*)`）—— 满足 test.js 对 HTML 的零字面量断言 |
| 会不会污染设置页 | 全部规则以 `.svi-*` 开头，其余要么 `:root`（就是要的变量），要么 `html.svi-*` / `[data-svi-*]` 门控（设置页不可能命中） |

代价如实说明：options.html 因此多了约 1.5k 行 CSS（含站点页专用的滤镜/遮罩规则，在设置页恒不命中）。
换来的是**控件样式只有一个实现点**，R2 重建面板时两处自动同源。

**偏离 11（第二轮 · 阶段 R1b）— schema 的 4 处实测缺陷（R1a 抽取的后果），以及两个漏项。**

R1b 一上手就发现 schema 里有几处**用户可见的错误**，全部修正（机械抽取的一次性产物，现在由单测守）：

1. **两处 hint 是源码片段**：`flashGuardLevel` 与 `maskPending` 的 hint 取自「跨行字符串拼接」的第 1 段，
   直接把 `'` + 换行 + `+ '` 抄了进来（页面上会显示成 `。'\n        + '⚠ …`）。改为按拼接后的**真值**写入。
2. **站点名单两项没有标签**：面板用的是 `textRow(null, null, …)`（只有 placeholder），抽取器回落到键名
   （label 显示成 `siteBlacklist`）。改为取面板自己的 placeholder 原文作标签/提示。
3. **三个动作开关的键面错了**：`actions.hide` / `actions.mask` / `actions.dim` 的默认值是**对象**
   （`{enabled, scope}`），面板读写的是 `.enabled`。键面改成真实叶子路径 `actions.hide.enabled` 等 ——
   这样 options 侧的读写**不需要任何特例**，且与面板键面**逐条精确对应**（单测③因此能做到精确匹配）。
4. **两个面积滑块缺 `scale`**：面板把 `regionMinAreaRatio` / `regionCalibrateStep` 以百分数呈现
   （`Math.round(v*1000)/10`），存储仍是小数原量纲。schema 记的是**呈现量纲**，故补 `scale: 100`，
   由 options 侧换算 —— 否则滑块会在 0.03 上被 min=0.5 钳到 0.5（静默把用户设置改错）。
5. **发现两个漏项并补录**：`imageInvert`（图片反色总开关）与 `autoDetect`（视频智能自动反色检测）
   在面板里由**头部胶囊快捷按钮**承载（`图片:开/关` / `智能:开/关`），没有行定义，故 R1a 的抽取器看不到。
   两项都是全局布尔，补为 `toggle`（标签取自 `DEFAULT_PREFS` 对该字段的注释，未自造语义）→ 89 项变 **91 项**。
6. 顺带回填了 10 个 `select` 的 `describe`（面板选中后显示的说明文字），schema 的 options 元组支持
   `[值, 短名, 说明]`。

**教训（给 R2）**：静态抽取只能覆盖「走行工厂」的设置项。面板里任何**自建 DOM** 的区块
（原色屏蔽色卡、元素规则列表、背景排除选择器）都会静默漏掉 —— R2 重建时必须把这些一并换成
`SviControls` 工厂，否则「清单无缺失」永远只能靠人工对账。

**偏离 12（第二轮 · 阶段 R1b）— 跨界面同步的真实机制，与 E2E 踩到的两个坑（都是实测）。**

1. **`Store.onRemoteLoaded` 不是 storage 变更监听**（R1b 计划里写的「storage 变更即重指派 state」不准确）：
   它只在内容脚本自己 `Store.init()` 装载完远端命名空间时触发**一次**。内容脚本没有
   `chrome.storage.onChanged` 订阅。因此口径只能是：**options 侧写入后，页面刷新 / 新开标签页即见**。
2. **已打开的页面会把外部写入按回去**（E2E 实测，非推测）：内容脚本在 `pagehide` 与
   `visibilitychange → hidden` 时会 `flushEverything()`——把自己**内存里那份**偏好整份回写。
   实测序列：options 写 `maskBlur=13`（落盘已确认）→ 导航 fixture 页 → 旧页 `pagehide` 整份回写 8
   → 新页读到 8。故 E2E 的正确顺序是**先让旧页卸载并等回写落盘，再写**（场景 7 里已按此排序并写明原因）。
   这是产品行为（不是测试假象）：真实使用中「开着 A 页 → 在设置页改 → 回 A 页刷新」是安全的
   （刷新时旧实例的回写在写入之前），但「改完之后另一个开着的老页面被隐藏/关闭」会把它按回去。
   已登记为 v6-4 的待办观察（要做真正的即时同步，需要给内容脚本加 `storage.onChanged` 订阅 +
   版本/时间戳仲裁，属机制层改动，不在 R1b 范围）。
3. **CDP 上「挑隔离世界」的坑**：导航后 `Runtime.executionContextCreated` 可能混入已销毁的上下文，
   对已销毁的 contextId 求值**不一定报错而是永不到达**（整轮拖到 20s 超时）。加固：倒序试（新的在后）+
   每次探测 2.5s 有界 + 丢弃的探测挂 `catch`（否则未处理的 rejection 会把 Node 进程打掉）。
   同一场景里对**刚 reload 的页面**求值也要兜住「默认上下文尚未就绪」的抛错，下一轮再试。
