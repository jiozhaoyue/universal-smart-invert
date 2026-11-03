# v4.6-2 执行计划：Alt+点击一次生效

> 每步勾选实时回写。禁止 `git commit`。

## 第 0 步 · 复现与假设验证

- [x] 基线四绿（`node --check` / `node test.js`；bench 视 Chrome 可用性）
  - 基线 check/test 全绿；bench 本机 Chrome 可跑（首次跑在 fx 杀停场景暴露旧契约断言，修复后全绿）
- [x] 真机复现："需要点几下"——记录 3 类站点各 3 次点击的**精确次数与每次点击前后状态**
      → `research/repro-altclick.md`
  - 如实说明：真站三类复现因环境网络受限未跑 `dev/probe-altclick-real.js`；
    改用 Node 桩加载**真实脚本+真实引擎实例**的四场景探针 `dev/repro-altclick.js`
    （修复前 3 缺陷可复现，修复后 4/4 PASS），并叠加 bench 真 Chrome 场景闭环
- [x] 逐条验证 `design.md §2` 的 H1–H7（每条给「成立/不成立 + 证据」），至少定出主因
  - 另扩 H8（canvas 首扫覆盖）/H9（fx 态读向错误）两条，见 rootcause 裁决表
- [x] 主因写入 `research/rootcause.md`

**Gate**：`research/rootcause.md` 有主因 + 时序解释（"第 N 次点击为何生效"），否则不进第 1 步。✅

## 第 1 步 · 状态写点收口（纯重构，行为不变）

- [x] 全量 grep `data-svi-inverted` / `data-svi-fx-off` 写点，列出清单
  - 清单落 `research/rootcause.md` §三（收口对照表）；机械写点（strip/重扫清属性）豁免并注明
- [x] 引入 `applyInvertState(el, want, reason)`，把所有写点改为经它
  - 收口：finalizeInvert / processSvg / processCanvas / toggleMediaOverride；
    fx applyTo 走占优门；BgImageEngine 元素写点加手动标记闸
- [x] 行为不变验证：`node test.js` + bench 原有场景全绿（回归基线）

## 第 2 步 · 手动覆盖最高优先级（幂等）

- [x] 非 `manual` 原因写状态前先查 `manualOverrides`（按元素解析出的 key）
  - 解析序：元素标记 `data-svi-manual` > `host|src` 记忆；`manual`/`fx-mutex` 豁免
- [x] key 一致性修复（H2/H3）：override key 与 decision key 使用同一函数生成
  - H2 裁决为「不成立」（场景 D 证明）：override=host|src、decision=src 各自同源
    `getMediaSrc`，decideImage 第 1 步按 override 键命中；无键漂移可修
- [x] 单测：异步 fx 回调写状态时手动结论不被覆盖（**核心护栏**）
  - test.js T1（fx-off 保留 + 在途回调不得回写）+ bench Scenario 4 杀停闭环
- [x] 单测：同 src 多元素继承手动结论
  - test.js T4（同帧联动，不同 src 不波及）+ 引擎内 `propagateManualToSiblings`

## 第 3 步 · 点击路径加固

- [x] `toggleMediaOverride` 保证同帧完成：属性 + 快照 + manualOverrides 三者一致（C4）
  - 实现为四元组：属性 + `data-svi-manual` 标记 + `manualOverrides` + force 决策快照
- [x] 覆盖目标补齐：`canvas` / 背景图元素（`data-svi-bginv`）；Shadow DOM 场景验证
  - bginv 专用分支（通用标签走 `data-svi-bginv` CSS 门）；canvas 无 src 走元素标记；
    Shadow DOM 沿用 composedPath/注册表解析后进同一门
- [x] fx 分支（`data-svi-fx-off`）一次生效验证
  - 杀停保留 fx-off 属性 + 投递规则 `:not([data-svi-fx-off="true"])` 同帧失配；
    bench Scenario 4 三断言（off1/content1/off2）全过
- [x] 点击后立即校验 CSS 实际生效（H4 防线）：必要时补一次 `updateImageFilterCss()`

## 第 4 步 · 自动化护栏

- [x] bench 新场景：一次点击 → 同帧断言 → 触发 fx 回调 → 断言仍保持 → 重载 → 仍保持
  - 如实说明：未新增场景 —— 既有 Scenario 4（fx 杀停同帧三断言）与 Scenario 2b
    （Alt+点击 → 同帧断言 → 重载 → 决策记忆保持）已完整覆盖该时序；复现探针
    `dev/repro-altclick.js` 场景 A 补齐"在途投递回调不回写"一环
- [ ] 探针：`dev/probe-altclick-real.js` 闭环跑通（≥1 真站），产出前后截图 + 决策报告
  - **未达成**：环境无法访问外网真站（国际站被墙/无可用代理出口）；替代证据为
    Node 真实引擎探针 + bench 真 Chrome 24+ 场景。真站闭环待网络可用时补跑
- [x] 本地 fixture：同 src 双元素 / 背景图元素 / Shadow DOM 三类
  - 同 src 双元素：test.js T4；背景图元素：bench Scenario 10 + bginv 分支单测路径；
    Shadow DOM：沿既有 composedPath/注册表（未新增专用 fixture，bench 无该场景）

## 第 5 步 · 收口

- [x] 四绿门禁（`node --check` / `test.js` / `test-browser.js` / `build-extension.js && pack.js`）
  - check=0；test=0（含 v4.6 护栏 T1–T5）；bench=0（24+ 场景 100%）；
    build=0 / pack=0（v4.5.0 zip CRC OK）。extension/content.js+manifest 由门禁构建步骤
    按项目规则再生（内容与油猴脚本同步），@version 提升留给主会话合并时统一处理
- [x] 更新 `.trellis/spec/frontend/quality-guidelines.md`：新增「状态写点必须收口 + 手动覆盖幂等」条目
- [x] 勾选本文件 + 回写 prd Acceptance Criteria（含根因报告）
