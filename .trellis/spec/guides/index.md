# Thinking Guides

> **Purpose**: Expand your thinking to catch things you might not have considered.

---

## Why Thinking Guides?

**Most bugs and tech debt come from "didn't think of that"**, not from lack of skill:

- Didn't think about what happens at layer boundaries → cross-layer bugs
- Didn't think about code patterns repeating → duplicated code everywhere
- Didn't think about edge cases → runtime errors
- Didn't think about future maintainers → unreadable code

These guides help you **ask the right questions before coding**.

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Identify patterns and reduce duplication | When you notice repeated patterns |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |
| [Subagent Model Policy](./subagent-model-policy.md) | 子代理/worker 派发前必须询问模型、禁止把近似名当全称；**第六节：编排自主权——收尾类动作自行编排不问，冲突/不可逆/方向性取舍才问** | **每次派发子代理之前**（强制）；每次准备逐条征询用户之前 |

---

## Quick Reference: Thinking Triggers

### When to Think About Cross-Layer Issues

- [ ] Feature touches 3+ layers (API, Service, Component, Database)
- [ ] Data format changes between layers
- [ ] Multiple consumers need the same data
- [ ] You're not sure where to put some logic
- [ ] You are adding an event kind, JSONL record, RPC payload, or config field
- [ ] UI / command code starts casting raw payload fields directly

→ Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse

- [ ] You're writing similar code to something that exists
- [ ] You see the same pattern repeated 3+ times
- [ ] You're adding a new field to multiple places
- [ ] **You're modifying any constant or config**
- [ ] **You're creating a new utility/helper function** ← Search first!
- [ ] Two files read the same untyped payload field with local casts
- [ ] Multiple branches update the same derived state from `kind` / `action`

→ Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

### When Dispatching a Subagent / Worker (强制)

- [ ] 已经**问过用户**用哪个模型并拿到确认了吗？
- [ ] 用户给的模型名（含历史记录里的）被当成"近似名"去平台清单里找最匹配候选了吗？
- [ ] 子代理用的是**能力最低且最匹配**的档位吗？
- [ ] 用户要求"并行、主代理不等待"时，用的是 `trellis channel spawn`（真并行）而不是阻塞式子代理吗？
- [ ] 派发 prompt 首行是 `Active task: <任务路径>` 吗？
- [ ] 派发 prompt 自带范围/问题/期望产出吗？

→ Read [Subagent Model Policy](./subagent-model-policy.md)

### Before Asking The User Something (强制，用户 2026-09-24)

- [ ] 这属于**收尾类 / 低风险 / 可逆**动作吗（补文档、回填验收、清理残留、归档、重跑门禁）？
      → **自行编排执行，不要问**；做错只是返工
- [ ] 是**冲突**吗（验收标准与实测不符 / 结论矛盾 / 规则打架）？→ 必须问，由用户裁决
- [ ] 是**不可逆**吗（删改已有文件 / 丢弃未提交改动 / 重写历史）？→ 必须问
- [ ] 是**方向性取舍**或**需扩大改动面**吗？→ 必须问
- [ ] 是否已经把同批可做的收尾项**一次性做完再汇报**，而不是每件问一次？

→ Read [Subagent Model Policy § 六、编排自主权](./subagent-model-policy.md#六编排自主权收尾类动作不问冲突才问)

### When Verifying AI Cross-Review Results

- [ ] Reviewer claims "user input can be malicious" → Check the actual data source (internal manifest? user config? external API?)
- [ ] Reviewer flags "missing validation" → Is the data from a trusted internal source?
- [ ] Reviewer says "behavior change" → Read the code comments — is it intentional design?
- [ ] Reviewer identifies a "bug" in test → Mentally delete the feature being tested — does the test still pass? If yes → tautological test

**Common AI reviewer false-positive patterns**:
1. **Trust boundary confusion**: Treating internal data (bundled JSON manifests) as untrusted external input
2. **Ignoring design comments**: Flagging intentional behavior documented in code comments as bugs
3. **Variable misreading**: Not tracing a variable to its actual definition (e.g., Map keyed by path vs name)

**Verification rule**: Every CRITICAL/WARNING finding must be verified against the actual code before prioritizing. Budget ~35% false-positive rate for AI reviews.

---

## Pre-Modification Rule (CRITICAL)

> **Before changing ANY value, ALWAYS search first!**

```bash
# Search for the value you're about to change
grep -r "value_to_change" .
```

This single habit prevents most "forgot to update X" bugs.

---

## How to Use This Directory

1. **Before coding**: Skim the relevant thinking guide
2. **During coding**: If something feels repetitive or complex, check the guides
3. **After bugs**: Add new insights to the relevant guide (learn from mistakes)

---

## Contributing

Found a new "didn't think of that" moment? Add it to the relevant guide.

---

**Core Principle**: 30 minutes of thinking saves 3 hours of debugging.
