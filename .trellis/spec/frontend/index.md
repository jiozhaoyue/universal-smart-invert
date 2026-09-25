# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | To fill |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | To fill |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | To fill |
| [State Management](./state-management.md) | Local state, global state, server state | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Filled |
| [Type Safety](./type-safety.md) | Type patterns, validation | To fill |
| [设计 token 与控件库](./ui-design-tokens.md) | v6-4：设计 token 唯一真源 + 构建注入到 popup/options + `SviControls` 单一构造点（20 项）+ 零手写颜色 | Filled（中文） |
| [区域掩码契约 RegionMask](./region-mask-contract.md) | **冻结**（2026-09-25）：区域掩码的唯一权威契约 + 不变量 I0~I8 + 消费纪律。v6-2/v6-3 只消费不修改 | Filled（中文，见文件内说明） |
| [样式挂载契约 StyleMount](./style-mount-contract.md) | **冻结**（2026-09-26）：样式节点唯一挂载入口 `mountStyleNode` + 根就绪重放 `whenRootReady` + 不变量 I1~I5。修的是「根为 null 时整张样式表被静默丢弃」 | Filled（中文） |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
