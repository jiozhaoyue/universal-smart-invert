# Implement: v5-1 Action Registry

> 规则：复选框**随执行实时勾选**，不得事后批量补勾（CLAUDE.md 4.5 铁律）。
> 每步结束跑「本步验证」；标 `GATE` 的步骤必须全绿才继续下一步。

## 前置

- [x] **P0** 确认工作区干净、`git rev-parse HEAD` 记录为回滚锚点
      → `git -C . rev-parse HEAD` = `3dcbb1a6beada0d9e29fc60abbfe406fc9c882ba`
- [x] **P0** 基线四绿，确认起点可复现
      → `node --check` 0 / `node test.js` 0 / `node test-browser.js` 24 场景 100% / build+pack 0
      基线留档：`research/baseline-test-js.txt`、`research/baseline-test-browser.txt`
      GATE
- [x] **P0** 读 spec：`.trellis/spec/frontend/quality-guidelines.md`（Forbidden/Required Patterns）
      + `.trellis/spec/guides/code-reuse-thinking-guide.md`
- [x] **P0** 定位待收口的四处实现并记下行号基线（`applyInvertState`、`manualStateFor`、
      `elementRules` 匹配处、`RuleLearner.decideFor`、`BUILTIN_RULES` 匹配处）
      → 真实链核对见 `research/stage-a-baseline-evidence.md`；**设计文档已按真实链修正**
      （快照卡在 override 与 rule 段之间、favicon 夹在 protect 与 forceInvert 之间）

---

## 阶段 A — Registry 骨架（零行为变化）

- [x] **A1** 新增 `ACTIONS` 定义与执行器骨架：只有 `invert` / `keep` 两个执行器，
      `invert.apply` 内部**原样调用**现有 `applyInvertState`（不复制逻辑）
- [x] **A2** 新增 `SOURCES` 有序来源表（`id + stage + resolve`），**先只填 `manual` 一条**，
      其余一律返回 `null`（保证与现状等价）；新增 `resolveStage(el, ctx, stage)`
      → 本步实际只落骨架（`SOURCES = []`），`manual` 来源随 A5/A6 一并接（避免中间态双实现）
- [x] **A3** 新增 `registry.arbitrate(el, candidate)`：把 `applyInvertState` 里的手动占优门
      **整体搬入**，`applyInvertState` 改为调用 `arbitrate`
      - 保留原实现为块注释，标注 `// v4.6 baseline, keep for diff`
        → **改为引用 git 历史**：`/* ignore */` 会提前闭合外层块注释（见 evidence 文件）
      - **本步是风险最高的一步**：`applyInvertState` 是反色主路径唯一写点
- [x] **A4** 本步验证：`node --check` + `node test.js` + `node test-browser.js`（24 场景）
      → 必须与 P0 基线**结果完全一致**。任何差异先定性再继续。
      GATE
      **回滚点 R1**：A1–A4 可整体 revert，无外部影响
      → **实测通过**：断言行 100% 一致，非确定性差异已逐条归类
      （证据：`research/stage-a-baseline-evidence.md`）

- [x] **A5** 填 `elementRule` 来源（`firstMatchingElementRule(img, profile.elementRules)`，
      `stage:'override'`）。注意它与 `manual` 同属 override 段，顺序在 manual 之后
- [x] **A6** 在 `decideImage` 的**现 1 / 1.5 位置**接入 `resolveStage(el, ctx, 'override')`，
      替换掉原地的手动覆盖与元素规则代码；确认快照检查仍在**其后**（位置不得移动）
      → A5+A6 合并为一次编辑（只填源不接线会留下悬空代码；只接线不填源会破坏功能），
      完成后即刻跑 check + test.js + test-browser.js，场景断言 100% 一致
- [x] **A7** 填 `learned` 来源（`RuleLearner.decideFor`，`stage:'rule'`）
- [x] **A8** 填 `seedProtect` / `faviconSkip` / `seedForceInvert` 三条来源（`stage:'rule'`），
      **顺序严格为 protect → favicon → forceInvert**（现行代码中 favicon 夹在两者之间，
      不可合并或重排）
- [x] **A9** 在**现 2 / 3 / 3.5 / 4 位置**接入 `resolveStage(el, ctx, 'rule')`，替换原地代码；
      `masked-dark` 否决过滤器继续留在 `decideImage` 内原样
      → A7–A9 同样合并为一次编辑（同上理由），完成后跑全部门禁
- [x] **A10** 删除旧实现（或改为委托 `resolveStage`），确认**没有第二处独立优先级链**
      → 审计结果：`decideFor` / `profile.protect` / `profile.forceInvert` / favicon 正则
      均收为唯一一处 ✓；**发现并登记** `BgImageEngine` 的第二套较窄链（见 A13）
      证据：`research/stage-a-baseline-evidence.md` §A10
- [x] **A11** 新增单测：来源顺序矩阵（override 段短路顺序、rule 段短路顺序、跨快照不翻转）
      → 追加于 `test.js` 末尾，20 条断言（表结构 / stage 分段 / 两段短路 / arbitrate 两例外 /
      keep 无属性门 / 写点经仲裁）；`✓` 行 17 → 18，基线 17 条断言全在
- [x] **A12** 本步验证：`node test.js` 全绿 + `node test-browser.js` 24 场景全绿，
      并与 P0 基线逐项比对
      GATE
      **回滚点 R2**
      → **实测通过**：四绿全绿，场景 + 断言行 diff 为空

### 阶段 A 后续项（审计新发现，独立成步、单独提交）

- [ ] **A13** 合并 `BgImageEngine` 的第二套优先级链（消除 AC-1 的最后一处违例）
      - 新增 `bgInvert` 执行器（`attr: 'data-svi-bginv'`）或决定 `invert` 是否双属性门
      - `SOURCES` 新增独立来源 `manualElement`（元素属性手动结论），位置在 `manual` 之后、
        `elementRule` 之前 —— 与 `BgImageEngine` 现行顺序一致
      - `BgImageEngine` 元素级路径改经 `resolveStage(el, ctx, 'override')`
      - **已知影响**：部分元素的 `reason` 由 `'pixel'` 变为 `'manual'`，`force` 由 false 变 true
        → 属**有意的行为变更**，不是回归；必须在证据文件里逐项列出差异并与用户确认
      - 依据与三条不能夹带的理由见 `design.md §7.1`
      GATE（因含行为变更，需单独四绿 + 差异清单）

---

## 阶段 B — 新动作执行器（逐个落地，每个都默认关）

- [ ] **B1** `hide` 执行器：`attr = data-svi-hidden`，值 `'session' | 'rule'`；
      `apply` 只写属性，`revert` 摘属性；CSS 加 `[data-svi-hidden]{display:none!important}`
- [ ] **B2** `hide` 触发：`Alt+Shift+点击` → 首次临时（`session`），同元素再次 → 永久
      （写 `learned` 规则 `action:'hide'`，自带 `hits` 起始值 = `learnHits`）
- [ ] **B3** `hide` 单测 + bench：点击后 `display` 为 `none`；再次点击后规则落库；
      「全部恢复」清空 session 级
- [ ] **B4** `peek` 动作：`attr = data-svi-peek`；推广现有 hover-restore 样式规则到通用属性门；
      `hoverRestore` 旧偏好映射为图片作用域别名（键名不变）
- [ ] **B5** `peek` 单测（属性门 + 旧偏好映射）+ bench（invert 路径 hover 复原仍生效）
- [ ] **B6** `mask` 执行器 + 三档预设 CSS（design §D-5 原样落地，变量挂 `:root`）；
      `registry.maskPresets` 导出（**v5-5 依赖此契约**）
- [ ] **B7** `mask` 伪元素占用检测（`::after` 冲突 → 回退独立层）+ `data-svi-mask-style` 属性
- [ ] **B8** `mask` 触发：元素上 `Alt+M` → 元素遮罩；`Alt+拖拽` → 区域遮罩（复用 rect 框选 UI，
      **不得破坏现有 rect 反色**）
- [ ] **B9** `mask` hover 揭开（`--svi-mask-hover-opacity`）+ `Shift+hover` 永久解除（落规则）
- [ ] **B10** `mask` 单测（三档 CSS 值 + 伪元素冲突回退）+ bench（hover 前后 opacity / 永久解除）
- [ ] **B11** `dim` 执行器（全页层，`pointer-events:none`，z-index 低于胶囊）+ 参数
- [ ] **B12** `dim` 单测（透明度边界 0~0.9）+ bench（层存在、点击穿透、与 bgReplace 互斥提示）
- [ ] **B13** 本步验证：四绿全绿 + 全动作关闭时页面属性写入与 v4.6.1 一致
      （对比手段：bench 场景里 dump 一次 `[data-svi-*]` 属性计数）
      GATE
      **回滚点 R3**

---

## 阶段 C — 开关矩阵与 UI

- [ ] **C1** `state.actions` 偏好结构 + `loadState()` normalize（枚举/布尔/范围）
- [ ] **C2** 新增「🧩 元素动作」区块：每个动作一行（总开关 + 作用域 + 生效时机 + 参数入口），
      复用现有 `ui.toggleRow` / 设置行处理器与回显契约（v4.5 修过的回显缺陷不得复发）
- [ ] **C3** 遮罩风格选择器（三档预设 + 颜色/透明度/模糊滑块）+ 实时预览
- [ ] **C4** 「安全模式」一键开关：关闭所有会改动 DOM 观感的新动作
- [ ] **C5** 开关单测：关闭后 `resolveAction` 不返回该动作 + 无对应属性写入
- [ ] **C6** 面板溢出检查 → `node scripts/check-panel-overflow.js`
- [ ] **C7** 本步验证：四绿 + 面板截图人工确认布局
      GATE
      **回滚点 R4**

---

## 阶段 D — 规格与文档

- [ ] **D1** `.trellis/spec/frontend/quality-guidelines.md` 新增一节：
      「Action Registry 契约」（resolveAction 两相、arbitrate 门、执行器幂等要求、
      禁用时不参与解析、新属性门命名）
- [ ] **D2** `AGENTS.md` 引擎清单补 Registry 条目
- [ ] **D3** `README.md` / `README_EN.md`：新增动作表 + 快捷键表（`Alt+Shift+点击`、`Alt+M`、
      `Alt+拖拽`）+ 开关说明 + 已知限制（frost 与 invert 共存、区域遮罩滚动跟随）
- [ ] **D4** `.trellis/spec/guides/index.md` 触发清单：如产生新教训则补条
- [ ] **D5** 更新 `extension/`（`node scripts/build-extension.js`）+ `node scripts/pack.js`
      → 产出版本号提升到 `5.0.0`（重大功能版）
      GATE

---

## 最终验证（四绿门禁，缺一不可）

- [ ] `node --check universal-smart-invert.user.js`
- [ ] `node test.js`
- [ ] `node test-browser.js`（24 场景 100%）
- [ ] `node scripts/build-extension.js && node scripts/pack.js`

## 结案前自检

- [ ] PRD 所有 AC 逐条勾选，未达标项**如实标注原因**，不勾空
- [ ] `resolveAction` 唯一性：代码级核查通过（无第二处优先级链）
- [ ] 全动作关闭 → 与 v4.6.1 行为一致（AC-3 证据留档）
- [ ] 契约清单（design §4）六项全部导出且被下游任务可引用
- [ ] `.trellis/spec/` 与 `AGENTS.md` 已更新
- [ ] 提交信息按项目规范，附 `Co-Authored-By` 尾行
