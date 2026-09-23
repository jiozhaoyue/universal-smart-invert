# v4.6-5 执行计划：子代理模型/派发规则固化（四件套）

> 本任务**先行完成**：规则约束本次及后续所有派发。纯文档变更。
> 每步勾选实时回写。禁止 `git commit`。

## 第 0 步 · 勘察现状（避免覆盖 Trellis 生成内容）

- [ ] 读 `.github/copilot-instructions.md`，确认 `TRELLIS:COPILOT-GUIDANCE:START/END` 标记块边界
- [ ] 读 `AGENTS.md`，确认 `TRELLIS:START/END` 标记块边界
- [ ] 读 `.trellis/agents/implement.md` / `check.md` frontmatter（`provider` 字段现状）
- [ ] 读 `.trellis/spec/guides/index.md`，确认登记格式

**Gate**：明确"哪些行属生成物、不得改"，才开始写。

## 第 1 步 · 规则正文 spec

- [ ] 新建 `.trellis/spec/guides/subagent-model-policy.md`，逐条写 prd `§规则内容` 的 8 条
- [ ] 必含「模型名确认流程」示例（本次 `glm5.3flash` → 候选 `GLM-5.3 Flash` → 用户点选确认）
- [ ] 必含「真并行 vs 阻塞」对照表（`trellis channel spawn` vs `runSubagent`）
- [ ] 必含「派发 prompt 首行 `Active task: <path>`」要求
- [ ] 必含反例清单（禁止：静默用主代理模型派发、把近似名当全称、用 `runSubagent` 冒充并行、用 Kimi K3）

## 第 2 步 · AGENTS.md

- [ ] 在 `TRELLIS:START/END` 标记块**之外**新增「子代理与派发（强制）」小节
- [ ] 内容摘要 + 指向 `.trellis/spec/guides/subagent-model-policy.md`

## 第 3 步 · .github/copilot-instructions.md

- [ ] 在 `TRELLIS:COPILOT-GUIDANCE` 标记块**之外**新增同名小节
- [ ] 验证标记块内部字节未变（`git diff` 核对）

## 第 4 步 · agent 卡片

- [ ] `.trellis/agents/implement.md` frontmatter 增 `model: GLM-5.3 Flash`
- [ ] `.trellis/agents/check.md` frontmatter 增 `model: GLM-5.3 Flash`
- [ ] 两份正文各加一行："派发前必须由用户确认模型；本字段为**已确认默认值**，非允许静默使用的借口"
- [ ] 注意：`trellis update` 会重新生成这些卡片 → 在规则 spec 中记录"该字段需在每次 update 后复核"

## 第 5 步 · 索引与验证

- [ ] `.trellis/spec/guides/index.md` 登记新文档
- [ ] `node --check universal-smart-invert.user.js` + `node test.js` 仍绿（纯文档也应跑）
- [ ] 自查：把 8 条规则逐条回读一遍，确认无遗漏、无自相矛盾
- [ ] 勾选本文件 + 回写 prd Acceptance Criteria
- [ ] 不提交

## 回滚点

- 纯文档，单提交可整体 revert；`git checkout` 任一文件即可

---

## 执行记录（主代理，2026-09-23）

本任务由主代理**先行同步完成**（它是本次派发的前置条件：规则必须先于派发存在）。
逐条对应上文步骤：

- 第 0 步 勘察：确认 `.github/copilot-instructions.md`（`TRELLIS:COPILOT-GUIDANCE` 块）与
  `AGENTS.md`（`TRELLIS:START/END` 块）的边界 → 新增内容全部写在标记块**之外**。
- 第 1 步 规则正文：新建 `.trellis/spec/guides/subagent-model-policy.md`（8 条铁律 + 确认流程
  示例 + 真并行/阻塞对照表 + 反例清单 + 维护提示）。
- 第 2 步 `AGENTS.md`：新增「子代理与派发（强制，用户 2026-09-23 明令）」小节。
- 第 3 步 `.github/copilot-instructions.md`：`TRELLIS:COPILOT-GUIDANCE:END` 之后新增同名小节
  （标记块内部零改动）。**注意该文件在本仓被 `.gitignore` 的 `.github/*` 规则排除（仅工作区本地生效）。**
- 第 4 步 agent 卡片：`.trellis/agents/implement.md` / `check.md` frontmatter 各加
  `model: GLM-5.3 Flash` + 正文说明（默认值≠免询问），并注明 `trellis update` 后须复核。
- 第 5 步 索引与验证：`.trellis/spec/guides/index.md` 登记 + 新增「When Dispatching a Subagent」
  自检清单；`node --check` / `node test.js` 保持绿。

### 执行期间发现的模型名事实（已回写规则正文）

1. 用户口述 `glm5.3flash` 是**近似名**。VS Code（Copilot）侧真实显示名是 `GLM-5.3 Flash`，
   完整 `model` 串为 `GLM-5.3 Flash (unify-chat-provider)`（厂商后缀不可省略，填 `(copilot)` 会被平台拒绝）。
2. claude CLI / 本地代理（127.0.0.1:15721）侧认的是另一套 ID：`glm-5.3-flash`（实测 200，
   49.7s）或别名 `claude-sonnet-5[1M]`（实测 200，21.4s）；`GLM-5.3 Flash` 会被 CLI 判
   `unrecognized_model` 并由代理回 502。
3. → **“模型名不是全称”在两个通道上表现不同**：派发前必须分别到对应通道的清单里取精确串
   （Copilot = 选择器显示名 + 厂商；claude CLI/代理 = slug 或 settings 别名）。这条已写进规则正文。

### 验证证据

- `node --check universal-smart-invert.user.js` → exit 0
- `node test.js` → exit 0
- 派发可审计：channel 事件中的 `--model` 均为用户点选确认过的串（首轮误用 `(copilot)` 被平台拒绝，未产生副作用）
