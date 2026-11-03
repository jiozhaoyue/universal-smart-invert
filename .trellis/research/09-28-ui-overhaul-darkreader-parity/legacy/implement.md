# 执行计划：UI 全面重构（A→B→C→D 四步）

> 任务：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity`
> 前置：`design.md` **经用户评审通过**、`task.py start` 已执行（status → in_progress）
> 规则：本文件复选框**随执行实时勾选**，不得任务结束后凭记忆批量补勾。
> 派发：实现与复核按 `.trellis/spec/guides/subagent-model-policy.md` §1.1（原生 Agent 工具 + `sonnet`）
> 分工：A/B/C 三步可由子代理并行（互不碰同一批行），**D 步必须串行且由主代理主导**。

---

## 第 0 步 · 基线与环境（前置，不可跳过）

- [x] `git status` 确认工作树干净或已知改动已记录；**记录基线 SHA**
      → 基线 SHA **`3f7b245`**。开工前先把上一任务（09-28-firefox-support）的收尾残留
      按逻辑分两个提交并推送（`2ba6b9c` 子代理策略重启 + `3f7b245` firefox 勾选回填）。
      残留 `scripts/build-crx.js` 为**纯行尾差异**（工作树 LF / 索引 CRLF，内容零差异），
      不纳入任何提交，避免 EOL churn。
- [x] **LF 归一化**：**实测无需归一** —— 工作树全部目标文件 `CR=0`（纯 LF）：
      `universal-smart-invert.user.js` / `extension/content.js` / `test.js` / `test-browser.js` /
      `scripts/extension-src/popup.{html,js}`。**并已实测**：在 LF 工作树上跑
      `node scripts/build-extension.js` 产出的 `extension/` 与已提交版本**逐字节相同**
      （`git diff --stat extension/` 为空）→ LF 自洽，不存在 AGENTS.md 所警示的假红条件。
      纪律：本任务期间**不得**执行 `git checkout/apply/stash`（会把工作树改写回 CRLF）。
- [x] 跑基线五绿，记录**改动前**的通过状态 → **全绿**（SHA `3f7b245`）：
      | 门禁 | 结果 |
      |---|---|
      | `node --check universal-smart-invert.user.js` | ✅ |
      | `node test.js` | ✅ 全通过（LuminanceDetector 的 `getContext is not a function` 为 shim 预期噪声） |
      | `node test-browser.js` | ✅ 34 场景 `ALL BROWSER AUTOMATION TESTS PASSED 100%` |
      | `node test-extension.js` | ✅ 8 场景 `真扩展 E2E 全部通过` |
      | `npx web-ext lint --source-dir=extension` | ✅ **0 errors** / 2 warnings（`UNSAFE_VAR_ASSIGNMENT` innerHTML，既有）|
      | `node scripts/build-extension.js && node scripts/pack.js` | ✅ 12 entries，CRC OK |
      基线环境快照（供实现期对照）：options 渲染 **11 组 / 94 项**，开关 28 · 滑块 45 · 下拉 14 ·
      文本框 2 · 取色器 2 · 色卡 4；存储后端 `chrome-sync`。
      ⚠ **踩坑记录**：命令行若用 `node x.js | tail -n`，退出码是 `tail` 的 → 失败会被掩盖成 0。
      跑门禁必须 `set -o pipefail` 或不用管道。
- [x] 记录当前 `@version`（实测 `0.6.10`）与 `SCRIPT_VERSION` → 两处均为 **`0.6.10`**
      （`universal-smart-invert.user.js:7` 与 `:44`），本任务收尾须 bump。
- [x] 确认 `scripts/panel-shot.js` / `scripts/check-panel-overflow.js` 可跑（Chrome 路径可达）
      → `panel-shot.js` 已实跑成功（产出 4 张：global/site/readability/capsule）；
      `check-panel-overflow.js` 待本步末跑（见下）。
- [x] 产出 `design-assets/` 首版四张表（token 差异表 / 控件形态表 / 对比度基线表 / 三处界面截图基线）
      → 四张表已建：`01-token-diff.md` · `02-control-form.md` · `03-contrast-baseline.md` ·
      `04-screenshot-baseline.md`（含 `shots-baseline/` 的 4 张面板图 + 4 张扩展页图）。
      **Step 0 三个新发现**（design.md 未记，已写入对应表）：
      1. `research/probe-contrast.js` **独立复算** design.md §2C/§3.3 的 6 个可核比值，**6/6 逐条一致**
         → 其对比度结论成立；选定值 `#35798a` = 面板底 3.428:1 ✅。
      2. **popup 的底色是 `--svi-bg-deep` `#0f161b`，不是 `--svi-bg`**（`popup.html:14`）→
         AC3 的对比基准必须按**各自界面**的最近非透明背景祖先取。约束项是面板底（DR 原色
         对面板底 2.947:1 ❌、对 popup 底 3.178:1 ✅），选定值两处都达标（3.428 / 3.696）。
      3. **用户投诉的「没有关的地方」是指悬浮胶囊药丸**（`capsule.png` 实证：药丸半贴视口右缘、
         通体无关闭控件），**不是**设置模态 —— 模态页头有 `×`、底部有「完成并关闭」。
         → Step B 的落点是**药丸/胶囊面板**，别改错对象。
      4. `test-extension.js` 新增**可选** `--shots [dir]` 开关（默认关闭，不改变断言语义）：
         popup 三页签 + options 整页截图，补上 popup/options **只能**在真扩展语境渲染的缺口。


**基线命令**（全部必须绿，否则先停下来查清）：

```bash
node --check universal-smart-invert.user.js && node test.js
npx web-ext lint --source-dir=extension
node scripts/build-extension.js && node scripts/pack.js
```

**回滚点**：无改动，`git checkout .` 即回到基线。

---

## Step A-0 · 修复 token「存在但惰性」（**Step A 的前置，2026-09-29 Step 0 实测新增**）

> 依据：PRD **R16**；`research/probe-token-application.js`；`design-assets/01` 末节。
> 不做这一步，Step A 的任何配色/描边改动在 popup / options 上**都不会有视觉结果**。

- [x] 修 `scripts/extension-src/popup.html` / `options.html`：把 `/* SVI_TOKEN_INJECT */`
      包进 `:root { ... }`（注入的是裸声明，顶层无选择器 → 整块被 CSS 解析器丢弃，
      并连带吞掉紧随其后的规则）
- [x] `node scripts/build-extension.js` 重建；实测两页
      `--svi-bg=#141e24` / `body背景=rgb(15,22,27)` / `color-scheme=dark`
- [x] `test-extension.js` 新增**真浏览器守卫**（场景 6a-2 popup + 场景 7-0b options）：
      断言 `--svi-bg` 解析出真值 + `body` 计算背景为 `rgb(15, 22, 27)` + `color-scheme=dark`
- [x] **负向对照**：造一份「未包裹」的被测副本（`SVI_EXT_DIR`）跑同一套件 →
      `❌ popup 的 --svi-bg 必须解析出真值…实测 ""`，**exit 1**，断言确实咬得住
- [x] `node test.js` 仍绿（三处逐字节一致断言不受影响：注入文本仍是 `trim` 后的原块）
- [x] 重拍 popup / options 基线截图（修复前是浅色无主题，修复后为深色）
- [x] Step A 落地后更新 `design-assets/01` 的「本仓目标值」列 → 01 / 03 已更新（Step A 落地值）

**回滚点**：两个源 HTML 的 `:root` 包裹 + `test-extension.js` 的守卫段 → 独立 revert。

---

## Step A · 纯 CSS 视觉（风险最低，先落地）

> 目标：直角化 + 达标描边 + 死 token 复活 + 页签方形 + 去卡片。
> 依据：`design.md` §3.3、`research/03` §2。

- [ ] token 块（`v6.4-TOKENS-START/END`，`universal-smart-invert.user.js:3910-3964`）：
      - [x] `--svi-border`：`#316e7d` → **`#35798a`**（3.428:1；同色系偏离 DR 最小的达标值）
            —— 已落地，块内注释写明偏离理由与实测比值
      - [x] 新增 `--svi-border-w-inner: .0625rem`（对齐 DR `@size-border-inner`）—— 已落地
      - [x] `--svi-r-sm` / `--svi-r` / `--svi-r-lg` 值置 **0**（保留 token 名，避免调用点改动）—— 已落地
      - [x] 同步更新供 `rgba()` 消费的三元组（若描边色有色三元组）
            —— **无 `--svi-border-rgb` 三元组**（已 grep 确认），无需同步
- [x] 面板 CSS：`.svi-btn`（`:4404`）与 `.svi-chip`（`:4431`）的
      `border: 1px solid var(--svi-ctl-hover)` → **`var(--svi-border-w) solid var(--svi-border)`**
      —— 同时 `border-radius` 置 0（`.svi-chip` 原 `999px` 药丸 → 直角）
- [x] `.svi-action-btn`（`:4104`）/ `.svi-pip-btn`（`:5190`）/ `.svi-preset-btn`（`:4139`）/
      `.svi-open-modal-btn`（`:4158`）的边框改用 token（**注意**：现值是
      `rgba(var(--svi-white-rgb), .12/.08)`，已走 token，但对比度不足）
      —— 已改 `var(--svi-border-w) solid var(--svi-border)`，`border-radius` 置 0；
      hover 态描边由 `rgba(white,.2)` 改为 `var(--svi-fg)`
- [x] **补规则缺失**：`.svi4-tab`（`:5419` `border:none`）与 `.svi-modal-close`（`:4708` `border:none`）
      补可辨边界（后者是关闭按钮，务必可辨）
      —— 两者均补 `var(--svi-border-w) solid var(--svi-border)`，直角化
- [x] popup.html：`.tab` / `.power-row` / `.chip` 的 `border-radius` 置 0；
      `.panel` 的圆角卡片改「分区标题 + 分隔线」
      —— `.power-row` 去卡（去底/描边 → 1px 分隔线 `var(--svi-border)`）；描边色 `--svi-ctl-hover` → `var(--svi-border)`；
      `select`/`button`/`.chip`/`.ver`/`nav.tabs`/`#list-preview`/`#unavailable` 同批换 token + 直角
- [x] 页签方形化 + 上下边框（DR `tab-panel` 形态）—— `.svi4-tabs`/`.svi4-tab` 直角化；
      未选中 `border: 2px var(--svi-border)`、选中 `border-color: var(--svi-fg)`（两态均 ≥3:1）
- [x] **不动按钮填充**（忠于 DR：其 `@color-control-back` 也等于页面底，靠描边分离）
- [x] 更新 `design-assets/` 的 token 差异表与对比度基线表 —— 01/03 已更新（Step A 落地值）；
      **主代理核验**：两份文件均在 `git diff` 改动列表内（`01-token-diff.md` +10/-…、`03-contrast-baseline.md` +32）

**验证命令**：

```bash
node test.js                                   # token 逐字节 + 零字面量 + 零 emoji
node scripts/check-panel-overflow.js           # 多视口不横向溢出
node scripts/panel-shot.js                     # 产出截图基线，人工看边界是否可辨
node scripts/build-extension.js && node test-extension.js
```

- [x] **对比度断言（AC3）**：逐按钮读 computed `border-*`，对"最近非透明背景祖先"算比值，**全部 ≥3:1**。
      基准与算法见 `design.md` §3.3（本轮试算写在任务探针里，需固化为断言）
      —— 已固化在 `test-browser.js` **Scenario 1c**（读浏览器计算样式 + WCAG relative luminance + alpha 合成），
      实测 12 类可见按钮全部 ≥3:1（最低 3.432，最高 5.763），并输出逐按钮四边属性表
- [x] 页签**选中态可辨**单独断言（未选中态无边框是设计，不列入按钮缺陷）
      —— Scenario 1c 表内 `.svi4-tab:not(.active)`（3.432）与 `.svi4-tab.active`（5.742）两行各成一条
- [x] 五绿全绿 —— **已补跑，六条门禁全绿**（2026-09-29 收尾窗口）
      | 门禁 | 结果 |
      |---|---|
      | `node --check universal-smart-invert.user.js` | ✅ |
      | `node test.js` | ✅ 全通过（`LuminanceDetector … getContext is not a function` 为 shim 预期噪声）|
      | `node test-browser.js` | ✅ 34 场景 `ALL BROWSER AUTOMATION TESTS PASSED 100%` |
      | `node test-extension.js` | ✅ 8 场景 `真扩展 E2E 全部通过`（含 token 注入生效断言）|
      | `npx web-ext lint --source-dir=extension` | ✅ **0 errors** / 2 warnings（`UNSAFE_VAR_ASSIGNMENT` innerHTML，既有）|
      | `node scripts/build-extension.js && node scripts/pack.js` | ✅ 12 entries，CRC OK（`dist/…-v0.6.10.zip`）|
      ⚠ **仍未绿的一项（不属六门禁）**：`scripts/check-panel-overflow.js` —— 见「实现期发现」§5，
      预存在断言漂移（脚本写死 11、真源已 12），**本步不修**，列为下一步第一件事。
      本条原标注「部分未跑」指的是 §6 记录的 `test-extension.js` / `web-ext lint` / `pack.js` /
      `panel-shot.js` —— 前三条**现已补跑且绿**；`panel-shot.js` 见 §7。

**回滚点**：仅 token 块 + CSS 模板 + popup.html → `git checkout` 这三个文件即回到基线。

---

## Step B · 关闭模型（解 R1 / R15）

> 依据：`design.md` §3.4、`research/03` §4/§5.5。

- [ ] **先落契约**：关闭控件带 `data-svi-close`（`design.md` §4）
- [ ] `.svi-card-header`（`:13340-13347`）加关闭按钮（`SviControls.icon('close')`，带 `data-svi-close`）
      → 调 `togglePanel(false)`
- [ ] `this.pill`（`:13329`）由 `div` 改 `button`（`type=button` + `aria-label`）→ 可键盘聚焦
- [ ] **修死调用**：`:13628` `this.cancelRegionMask()` → 显式委托
      （如 `window.__svi_image_engine?.cancelRegionMask?.()`）；`:14474` 的 `this.armRegionMask()` 同理
- [ ] Esc 处理加 `try/catch` 兜底 —— **一处异常不得废掉整条关闭路径**
- [ ] 胶囊面板纳入 Esc 关闭
- [ ] `test-browser.js` 新增**真实按键**断言：Esc 关模态；**加静态守卫**断言
      `this.cancelRegionMask` / `this.armRegionMask` 的调用点所属类上确实存在同名方法（或已显式委托）

**验证命令**：

```bash
node test.js && node test-browser.js            # 新增 Esc 与关闭按钮断言
node scripts/panel-shot.js                      # 截图留证
```

- [ ] AC1 达成：探针点 `[data-svi-close]` 后 `.svi-panel-card` 无 `show`，**全程未点击面板外部**
- [ ] AC11 达成：Esc 关闭模态 + console 无 `TypeError`
- [ ] 五绿全绿

**回滚点**：`buildUI` / 键处理 / `:14474` 三处 → 独立 revert。

---

## Step C · 取色器（解 R3）

> 依据：`design.md` §3.5、`research/03` §5。

- [ ] **主修（最小且首选）**：`.svi-color-picker-controls`（`:4989`）补 `position: relative`，
      或让 `colorList`（`:13081`）改用 `.svi-color-input-wrap` 包裹（与 `pickerRow` 同构）
- [ ] 取色器控件按 `design.md` §3.3 重做：**hex 文本框 + 预览块 + 重置 + 离散色板**
      （点选，非拖拽；键盘可用）
- [ ] 移除 `colorList` 路径的原生 `<input type=color>`
- [ ] **⚠ 必须回报用户的门**：同批修改 `test-browser.js:999`（`hasPicker` 采集）与
      `:1140`（`assert.strictEqual(report.ui.hasPicker, true, …)`）——
      这是**现任绿灯断言**，删取色器必然让它变红。
      **不得静默放宽**：改动前向用户说明并取得同意；
      若用户不接受，退路 = 只做定位修复、不改控件形态（原生 input 保留）

**验证命令**：

```bash
node test-browser.js
# 真鼠标探针（复用 research/probe-ui-defects-3.js 的形态，重跑于新实现）
```

- [ ] AC2 达成：「全局」页签下 ① 点关闭按钮能关；② 取色器
      `getBoundingClientRect()` **不等于视口尺寸**；③ 点遮罩后 `activeElement` 不是 color input
- [ ] 五绿全绿

**回滚点**：CSS + `colorList` + bench 两行 → 独立 revert。

---

## Step D · 单一真源（最大改动面，**串行，主代理主导**）

> 依据：`design.md` §3.1/§3.2/§5。

### D-1 前置加固（解 `01-VERIFY` P7 的阻塞）

- [ ] `SviControls` 6 个行工厂签名加**可选** `key` 参数
      （`toggleRow` / `sliderRow` / `selectRow` / `checkRow` / `pickerRow` / `colorList`）
- [ ] 新增 `SVI_KEY_REGISTRY`：`{ [key]: { read, write, effects } }`
      —— **`effects` 必须显式承载 A 侧带副作用的 onSet**（`savePrefs()`、
      `clearCacheAndRescan()`、`applyVideoTune()`、`RegionRenderEngine.unmountAll()`、
      `stateMachine.onCustomParamChange()` 等）
- [ ] 全仓 6 个建造器的调用点补 `key` 实参（94 处）

### D-2 A 模态声明式渲染

- [ ] 建 `item.kind → builder` 映射表（schema 的 kind 词表：toggle/slider/select/check/color/
      multiSwitch/hour/action/readonly …，以 `options.js:227-319` 的 `KINDS` 为底）
- [ ] `buildSettingsModal` 的 16 个 builder 内容改为 `for (const group of SCHEMA) for (const item of group.items)`
- [ ] A 独有项登记进 `PANEL_ONLY_ROWS`（本站三态卡、胶囊双钮、`peek` 行、布局按钮、动作按钮组）
- [ ] 单测断言等式：**92 schema 全局键 ↔ 92 A 全局键 + 2 独有（`imageInvert` / `autoDetect`）**

### D-3 归零 D 系列不一致

- [ ] **D7（严重）**：扩展 options 页 4 条滑杆死控件 —— 二选一并论证：
      ① options 侧拖这 4 值也置 `presetId='custom'`（与 A 同构）；
      ② schema 的 presetId 下拉补 `custom` 项并让 A/C 取值路径一致。
      **必须选一条并写进 spec**，不得留作两种行为。
- [ ] **D1**：popup 不再自算合成值、不再只写全局键 —— 统一走 `registry[key].write`
- [ ] **D2**：popup 的 `imgFxMode` 选项集改为**读 schema**（4 → 8）
- [ ] **D3**：`presetId` 名称三处统一（`纯黑` vs `夜间纯黑` 二选一，以 `DEFAULT_PREFS`/schema 为准）
- [ ] **D4**：`hoverRestore` 双行 —— **加互指说明**（`:14505-14508` 注释自陈是有意为 peek 保留的同键开关），
      统一 label，**不强行合并**
- [ ] **D5**：默认值收敛为唯一 `DEFAULT_PREFS`；snapshot 响应与 popup 不再各写一份
- [ ] **D8**：A 胶囊与 B popup 对 `imageInvert` 显示一致（同为全局读，或同为合成读 + 作用域徽标）
- [ ] **D9**：`scheduleStart/End` 的 `kind` 分叉登记并统一
- [ ] 站点覆盖键面**不扩**（`#policy`/`#hover`/`presetId` 标注为全局；要本站化须先回报用户）

### D-4 新守卫（替换弱守护）

- [ ] 新增单测：三处键集合 ⊆ schema；**同界面内无重复键**；同名项
      min/max/step、选项集、极性、默认值**四轴一致**
- [ ] 保留并**不削弱**既有 `test.js:5438` 的源码扫描（作为双保险）
- [ ] `:16405 this.modeSelect = modeRow.select` 改为取值接口（行工厂加 `key` 后句柄语义已变）

**验证命令**：

```bash
node test.js && node test-browser.js && node test-extension.js
node scripts/check-panel-overflow.js
npx web-ext lint --source-dir=extension
node scripts/build-extension.js && node scripts/pack.js
```

- [ ] AC4 / AC12 / AC13 达成
- [ ] 五绿全绿

**回滚点**：`SviControls` 建造器 + `buildSettingsModal` 16 builder + `popup.js` → 整批 revert。
**注意**：D 步是本任务唯一"改一处会影响三面"的步骤，回滚必须整批，不可只回一面。

---

## 第 5 步 · 收尾（收尾类动作，按 spec §2.1 自主执行）

- [ ] 独立 `trellis-check` 复核（**不是**写代码的那个子代理）
- [ ] spec 沉淀：把本轮学到的写进
      `.trellis/spec/frontend/ui-design-tokens.md`（token 增补与偏离记录）
      与 `quality-guidelines.md`（视觉验收物四张表成为常规交付物）
- [ ] **`design-assets/` 四张表终版**（token 差异 / 控件形态 / 对比度基线 / 三处截图基线）
- [ ] bump `@version` + `node scripts/build-extension.js` 重建
- [ ] 五绿门禁 + `build` + `pack` 全跑
- [ ] **清除 temp 探针**：`research/probe-ui-defects*.js|json` 若已固化为正式断言则删除；
      有复用价值的迁到 `scripts/`（勿留在 research/ 当死代码）
- [ ] `git status` 确认 `extension/` 变更全部可归因于构建（无手改）
- [ ] 提交（commit message 说明本轮是第 4 次 UI 重建的收官，并附 `01-VERIFY` 的归因结论）
- [ ] **推送 `origin main`**（本仓硬规则：只提交不推送视为未完成）

---

## 风险登记（实现期间须主动盯的）

| 风险 | 触发信号 | 处置 |
|---|---|---|
| **假红**：CRLF/LF 或未重建 `extension/` | `test.js` 报「必须能定位 UIController 类体」「必须逐字节一致」 | 先归一 LF + 重建，再判断是否真缺陷（AGENTS.md 已记录该类误报） |
| **改既有断言** | `test-browser.js` 的 `hasPicker` 变红 | 这是**预期内**的；但必须先回报用户取得同意（Step C 的门） |
| **D 步中途卡住** | 行工厂加 `key` 后某调用点取不到句柄 | 整批 revert 到 D 前，改走「保留手写 + 只加一致性断言」的退路（范围缩小，须回报用户） |
| **a11y 回退** | 控件形态表里出现「原生 → span/div」 | 立即停手；D6 已裁定不得回退（`design.md` §6） |
| **范围蔓延** | 有人提出"顺便扩站点覆盖键面"或"顺便精简 A 全局页签" | 两者都属"扩大改动面"，**回报用户**后再议（`design.md` §6） |

---

## 实现期发现（Step A，2026-09-29）

> 按派发要求：`design.md`/`implement.md` 与代码实际不符处**不擅自改设计**，就地登记。

1. **[规格矛盾] 「保留 token 名避免大量调用点改动」的前提不成立。**
   `--svi-r-sm/-r/-r-lg` 在用户脚本内 `var()` 消费数为 **0**（已 grep 确认）——面板 CSS 的
   `border-radius` 全部是**字面量**（全仓 55 处）。因此「把 token 值置 0」只改声明、**不产生任何直角效果**。
   处置：token 值按 brief置 0（保留名），**并**对 brief 点名的控件（按钮/chip/页签/关闭钮/分区容器）
   把 `border-radius` 字面量一并置 0 —— 否则「直角化」是空的。圆形语义（`50%` 的圆点/旋钮/色块）
   与药丸开关（`.svi4-switch` / `.svi-trigger-pill`，属 Step B 对象）**有意保留**，未误改。

2. **[设计未记] 面板「卡片」实际含两处：`.svi-modal-section`（分组容器）与 `.svi4-card`（本站能力卡）。**
   去卡片只对**分组容器**执行（`.svi-modal-section` → 底/边/圆角归零 + 1px 分隔线）；
   `.svi4-card` 是**控件**不是分组容器，仅直角化 + 描边换 token，未去卡。

3. **[brief 未列、实现判定「同批应改」的改动面]** 除 brief 点名的选择器外，为实现 R2「所有按钮」
   与 R6「直角 + 2px 描边」的一致落地，同批改了：`.svi-btn-reset` / `.svi-btn-done` / `.svi-mini-btn`
   / `.svi-layout-btn`（后者原 `border:none`，与 `.svi-modal-close` 同类「规则缺失」）/ `.svi-layout-switch`
   / `.svi4-tabs` / `.svi-modal-select` / `.svi-modal-text` / `.svi-modal-textarea` / `.svi-modal-num-input`
   / `.svi-input` / `.svi-color-chip` / `.svi-modal-window`（16px → 0）。**改动面大于 brief 的显式清单**。

4. **[对比度口径]** AC3 断言的基准按 brief/`design-assets/03` 的口径取「**最近非透明背景祖先**」
   （不含元素自身底色）。对自带白/彩底 tint 的按钮（`.svi-action-btn` 等），若把元素自身 tint 也算进基准，
   个别会落到 ~2.9:1；按既定口径（祖先）则 ≥3:1。此点已在 `test-browser.js` Scenario 1c 注释里写明口径。

5. **[预存在红，与 Step A 无关] `scripts/check-panel-overflow.js` FAIL。**
   唯一失败项是 `statsCells` 实测 **12**、脚本硬编码期望 **11**（`statEntries()` 现返回 12 条），
   该计数由 JS 生成、**CSS 改不动**；且 Step 0 **从未记录过 overflow 基线**（implement.md Step 0 只记录了
   「可跑」未记录结果）。属**预存在的断言漂移**，本步未修（超出 Step A 范围）。其余条件
   （`modal` / `hScroll` / `overflows` / `storePreviews`）全部 PASS。

   > **主代理独立核验（2026-09-29 收尾）**：① `git diff universal-smart-invert.user.js | grep -c statEntries|statsCell`
   > = **0**（Step A 未碰该 JS）；② `scripts/check-panel-overflow.js` **未在工作树改动列表里**（脚本本身没碰）；
   > ③ 失败判据 `:123` 是 `layout === 'center' && r.statsCells !== 11`，而 `statsCells` =
   > `querySelectorAll('.svi-stats-grid .svi-stats-cell').length`（`:94`），这些节点由 `:14994` 的循环创建
   > —— **纯 JS 计数，与 CSS 无关**。三条合起来：该红必为预存在，Step A 不可能造成。
   >
   > **归属与处置**：属 **AC9** 的阻断项，也是 `01-VERIFY` P8「去硬编码」点名的同类问题
   > （脚本把期望值 `11` 写死，真源漂到 12 后无人察觉）。**本次收尾不修**（避免在收尾窗口引入未复核的改动）；
   > 列为**下一步第一件事**：让脚本从用户脚本的 `statEntries()` 真源**派生**期望条数，而不是写死 —— 这是
   > **加强**而非放宽断言，改完必须重跑该脚本自证。
   >
   > 注：`scripts/check-panel-overflow.js` **不在** AGENTS.md「all green required before commit」
   > 的六条门禁清单内（它在 PRD 里对应 AC9），故不阻断 Step A 的提交。

6. **[未验证]** `test-extension.js` / `web-ext lint` / `pack.js` / `panel-shot.js` 在本次 13:50 收尾窗口内
   **未跑**（不是通过）。`node test.js` / `node --check` / `build-extension.js` / `test-browser.js` 已跑且绿。

7. **[收尾补跑，2026-09-29 第二窗口]** §6 遗留的三条**已全部补跑且绿**：
   `node test-extension.js`（8 场景全过）、`npx web-ext lint --source-dir=extension`（0 errors）、
   `node scripts/build-extension.js && node scripts/pack.js`（12 entries，CRC OK）。
   **Step A 至此作为一个自洽单元提交**（B/C/D 与第 5 步仍在计划内未开始，任务保持 `in_progress`）。

   本次提交范围（**刻意排除**两项）：
   - **排除 `scripts/build-crx.js`** —— Step 0 已判定为纯行尾差异（工作树 LF / 索引 CRLF，内容零差异），
     纳入只会产生 EOL churn。
   - **排除 version bump** —— 本任务第 5 步收尾才 bump；中途提交不 bump 与前置提交 `065264a`
     的做法一致（该次同样未 bump）。故 `@version` 仍为 `0.6.10`。
   - 提交前核验：`git diff universal-smart-invert.user.js` 的全部 hunk 落在 CSS 区段
     （`:3900–5300` 面板 CSS 模板），**JS 逻辑区段零改动** —— 与「Step A 纯 CSS」的声明相符。
