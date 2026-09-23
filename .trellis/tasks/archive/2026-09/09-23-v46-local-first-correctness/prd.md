# v4.6: 本地优先判定(网络无关)+交互缺陷修复+遮罩场景+子代理规则固化

## Goal

父任务: 编排并集成 v4.6 全部交付物。把反色判定从依赖网络完成度改为本地渲染即可判(弱网抢先); 修复 Alt+点击需多次生效与悬停显示原图开关失效; 处理暗色遮罩容器导致的错误反色; 把子代理模型选择规则写入 Trellis 与 agent 规则。子任务: 1 决策时序 2 Alt+点击 3 悬停开关 4 遮罩场景 5 规则固化。

## Requirements

### 需求来源（用户 2026-09-23 反馈要点，逐条可追溯）

1. 「在某个版本后错误率奇高，受网络影响极大。必须完全脱离网络的限制，必须所见即所得，本地看到了
   就得去判断和反色与否，在网差的情况就抢先。」
2. 「每次必须 Alt+左键点好几下才能更改反色情况。」
3. 「设置里关掉『鼠标放在图片元素上显示原色』这个功能，仍然会显示，一点用都没有。」
4. 「复杂场景：如个人主页显示的地方，可能会加上暗色遮罩，会使视觉还好，但是原图是亮的，
   导致新的一种错误反色。」
5. 编排规划任务 → 派发代理并行执行（主代理不等待）；派发前必须询问子代理模型；模型名不得被
   当成正确全称；把该规则写入 Trellis 与 agent 规则。

### 本次会话已与用户确认的决策（不得擅自更改）

| 决策点 | 结论 |
|---|---|
| 子代理模型 | `GLM-5.3 Flash`（平台清单中最匹配项，用户点选确认） |
| 「脱离网络」含义 | **两者都要**：既改判定时序（本地优先），也剥离/显式禁用运行时联网路径 |
| 并行派发机制 | Trellis channel 后台 worker（真并行；`runSubagent` 阻塞，不满足「主代理不等待」） |
| 任务结构 | 父任务 + 5 个子任务 |
| 复现策略 | 先真机复现 + 二分定位回归版本，再修 |
| 规则落地 | 四件套全写（spec/guides + AGENTS.md + copilot-instructions + .trellis/agents/*.md） |

### 交付物（子任务映射）

| 子任务 | 交付 |
|---|---|
| `09-23-v46-1-local-first-decisions` | 决策本地优先 + 弱网抢先 + 回归版本二分证据 |
| `09-23-v46-2-alt-click-override` | Alt+点击一次生效 |
| `09-23-v46-3-hover-restore-off` | 悬停显示原图开关真正关闭 |
| `09-23-v46-4-dark-overlay-context` | 暗色遮罩容器不误反色 |
| `09-23-v46-5-subagent-model-rules` | 子代理模型/派发规则四件套（先行，约束本次派发本身） |

### 约束

- `universal-smart-invert.user.js` 是唯一真源；`extension/` 是生成物，禁止手改，改头即重建。
- 运行时状态（反色标记等）仅存内存、绝不落盘；仍只允许 `svi:*` 键经 `Store` 持久化。
- **decide-once 不变量不得破坏**：相同输入不得在两个 pass 间翻转。
- 单一 `@version` bump + README/README_EN 同步 + 四绿门禁。

## Acceptance Criteria

- [ ] 5 个子任务全部验收通过并归档（父任务集成验收后才可归档）
- [ ] 三态一致性：正常网 / 弱网（限速）/ 断网 下，同一页面稳态决策集合一致（除确实未加载资源）
- [ ] 弱网首屏：可见媒体在 **≤500ms** 内完成判定与落点（探针给出时间戳证据）
- [ ] 无「仅因资源未 complete 就跳过」的主路径（代码审查 + 单测断言）
- [ ] Alt+点击：一次点击即切换，且重载后保持（真机探针闭环）
- [ ] 悬停开关：关闭后三条通道（CSS filter 图 / 特效图 / 背景图）均不还原
- [ ] 暗色遮罩场景有本地 fixture + 真站证据，且不误伤正常反色场景
- [ ] 子任务 5 的四件套规则已落盘且在本文档 Notes 中引用
- [ ] 四绿门禁全绿：`node --check` / `node test.js` / `node test-browser.js` / `build-extension.js && pack.js`
- [ ] `@version` bump + README/README_EN 同步 + 统一 commit **并 push**

### 集成记录（主代理，2026-09-23）

**派发方式**：4 个 Trellis channel worker（claude CLI + 本地代理）因模型 ID 不匹配失败
（`GLM-5.3 Flash` 被判 `unrecognized_model` / 502），用户改为**只用 Copilot 子代理**并确认
精确串 `GLM-5.3 Flash (unify-chat-provider)`；随后 4 个子代理并发执行（impl-4 首轮无响应，重试成功）。

**隔离**：每个子代理一个 git worktree（`.worktrees/v46-impl-N`，分支 `v46/impl-N`）——
单文件代码库并行改的必需品（否则互相覆盖 + 测试结果不可信）。合并顺序 impl-3 → impl-1 → impl-4 → impl-2。

**子任务结论**：

| 子任务 | 结论 |
|---|---|
| -1 本地优先判定 | 回归引入点 = v3.1.0 (`b865ad6`)；三档 `localEvidence`(A/B/C) + pending 唤醒；限速 300kbps/400ms 下首屏判定 956ms~18s+ → **560ms** |
| -2 Alt+点击 | 3 个真因：fx 在途回调清掉杀停、fx 投递规则未排除 `[data-svi-fx-off]`、canvas 首扫改写属性 → 单一 `applyInvertState` 收口 + T1–T5 护栏 |
| -3 悬停开关 | **分支 D**：4.5.0 上四通道×两态全正确；用户症状在 ≤4.3.0 旧版可复现（设置行回显缺陷导致首次点击写反值）→ 交付版本自检徽标 + 旧版对照腿，判定逻辑零改动 |
| -4 暗色遮罩 | `maskedDarkContext` 三级检测（祖先蒙层 / 兄弟覆盖层 / 低透明度叠深底）+ `masked-dark` 原因码 + `state.maskAware` 开关；四案例矩阵 + 防误伤断言 |
| -5 子代理规则 | 四件套已落盘（见下）；执行中发现**两个通道模型 ID 空间不同**，已回写规则正文 |

**集成期发现并修复的真实缺陷（非纸面冲突）**：

1. `loadState` 错过遗留键回退：`svi:prefs` 按设计删除了 `manualOverrides`，而“现代键存在但为空”会
   短路回退 → **用户全部 Alt+点击记忆在“命名空间已写、svi:overrides 缺失”时静默丢失**。
   已改为“现代键非空优先，否则与遗留键合并”。
2. `updateImageFilterCss` 只判真值就访问 `.classList` → 宿主文档/桩环境缺 `classList/style` 时
   抛错并中断整个 boot。已改为能力检测。
3. 套件内“种外部存储再 boot”的 T5a 时序脆弱 → 改为真实 `Store.onRemoteLoaded()` 路径。

**规范沉淀**：`.trellis/spec/frontend/quality-guidelines.md` 新增「v4.6 Integration Notes」
（并行 worktree、存储回退、能力检测、测试桩还原、PowerShell 退出码陷阱、合并后必须重跑四绿）。

## Notes

- 依赖关系：子任务 2/3/4 需真机复现，彼此独立可并行；子任务 1 的二分结论可能改变 3/4 的根因判断，
  但**不阻塞**（各子任务各自保留"结论若被推翻则回写 prd"的出口）。
- 子任务 5 先行完成，因为其规则约束包括本次派发在内的所有后续派发。
- 派发上下文铁律：每次派发 prompt 首行必须是 `Active task: <task.py current 输出的任务路径>`。
- 教训沉淀：本任务产出的"本地优先判定"与"遮罩上下文"结论必须写回
  `.trellis/spec/frontend/quality-guidelines.md`（子任务 1/4 负责）。
