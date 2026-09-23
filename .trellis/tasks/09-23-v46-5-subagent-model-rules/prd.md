# v4.6-5 子代理模型选择规则固化到 Trellis 与 agent 规则

## Goal

把子代理/worker 模型选择铁律(必须询问、禁止假设模型全称、最匹配候选确认后才派发、默认 GLM-5.3 Flash)写入 .trellis/spec/guides/ + AGENTS.md + .github/copilot-instructions.md + .trellis/agents/*.md。

## Requirements

### 用户原话

> 「需要你来编排规划任务，然后派发代理并行做（主代理不等待），必须询问子代理使用什么模型，
> 然后才能继续。使用 glm5.3flash（注意，所有的模型名都不是全称，必须选择最匹配，询问，
> 禁止当成正确名字）。这些要写入 trelli 和 agent 规则。」

### 规则内容（必须逐条落盘，不得省略）

1. **派发前必问模型**：任何子代理 / channel worker 派发之前，**必须先向用户询问模型**并
   得到确认，确认后才允许派发。禁止用「主代理的默认模型」静默派发。
2. **模型名不得当全称**：用户或历史记录给出的模型名一律视为**不完整/近似**；必须
   在平台实际可用清单中挑选**最匹配**候选，把候选（含推荐）呈给用户确认；
   **禁止**把近似名当作正确名直接写进命令。
3. **默认值**：经用户确认，本项目子代理默认模型为 `GLM-5.3 Flash`。
4. **能力档位**：子代理承担"读多写少"的检索/提炼/核验工作 → 选**能力最低且最匹配**的档位；
   旗舰模型留给主脑判断。
5. **禁用项**：禁止使用 `Kimi K3` 做子代理（用户 2026-09-21 明令，沿用）。
6. **真并行机制**：用户要求「主代理不等待」时，必须用 Trellis channel 后台 worker
   （`trellis channel spawn --model <已确认模型>`）；`runSubagent` 是阻塞式，不满足此要求，
   不得用它冒充并行。
7. **派发上下文**：每次派发 prompt 首行必须是 `Active task: <任务路径>`（Trellis 铁律）。
8. **自包含**：派发 prompt 必须自带检索范围、具体问题、期望产出，子代理无共享记忆。

### 落地位置（四件套，缺一不可）

| # | 文件 | 落点 |
|---|---|---|
| 1 | `.trellis/spec/guides/subagent-model-policy.md` | 新建，规则全文（本 prd 的 Rules 部分即为正文） |
| 2 | `AGENTS.md` | 新增「子代理与派发」小节，指向 ① |
| 3 | `.github/copilot-instructions.md` | 新增同名小节（Copilot 侧生效需在 Trellis 标记块**之外**或经评审确认） |
| 4 | `.trellis/agents/implement.md`、`.trellis/agents/check.md` | frontmatter 增加 `model: GLM-5.3 Flash`，正文注明"派发前须用户确认" |

### 约束

- Copilot guidance 块由 Trellis 生成（`.github/copilot-instructions.md` 内的
  `TRELLIS:COPILOT-GUIDANCE` 标记块）→ **不得**改标记块内部，新增内容放在标记块**之外**，
  否则会被下一次 `trellis update` 覆盖。
- 中文表述、ASCII 标识符、与既有 spec 文档风格一致。

## Acceptance Criteria

- [ ] `.trellis/spec/guides/subagent-model-policy.md` 存在且 8 条规则逐条在册
- [ ] `AGENTS.md` 有「子代理与派发」小节并指向该 spec
- [ ] `.github/copilot-instructions.md` 有对应小节，且**未**修改 `TRELLIS:COPILOT-GUIDANCE` 标记块内部
- [ ] `.trellis/agents/implement.md` / `check.md` frontmatter 含已确认模型名
- [ ] `.trellis/spec/guides/index.md` 登记新文档（若索引存在则必须登记）
- [ ] 本次会话后续所有派发均遵守本规则（可审计：channel 事件中的 `--model`）
- [ ] 四绿门禁不受影响（纯文档变更也须跑 `node --check` + `node test.js`）

## Notes

- 本子任务**先行完成**：其规则约束本次派发本身。
- 模型名确认记录：用户于 2026-09-23 在交互问答中点选 `GLM-5.3 Flash`（候选项来自平台清单，
  非用户原始输入的 `glm5.3flash`）。该确认过程本身也要作为规则示例写入 spec。
