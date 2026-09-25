# 设计 token 与控件库（v6-4 第一轮交付，2026-09-26）

> **本文件是 UI 外观的唯一权威。** 配色方向由用户 2026-09-26 裁决：**照搬 Dark Reader 的深青调**
> （PRD v6-4 R7 的 `theme.less` 实读表，逐值照搬，未自行调色）。
> 语言说明：本仓 `.trellis/spec/` 其余文档为英文；本文件按用户级规则「文档/注释全中文」以中文书写。

---

## 1. 单一真源与三处消费（**机制**）

token 定义在 `universal-smart-invert.user.js` 的 `:root` 里，用注释标记包住：

```
/* v6.4-TOKENS-START */ … /* v6.4-TOKENS-END */
```

**受「单文件真源 + 零外部依赖」约束，三处无法共享 JS 模块**，因此同源机制是：

```
真源 (userscript 的 TOKENS 块) --构建时抽取--> 注入 popup.html / options.html 的
                                              /* SVI_TOKEN_INJECT */ 占位
```

- `scripts/build-extension.js` 负责抽取与注入；**占位缺失即构建失败**（防止有人手写颜色绕开机制）。
- 三处一致性由 `test.js` 的「v6.4 token 单测」**逐字节**把关。
- 面板 CSS 与两个 HTML 产物里，**token 块之外不得出现任何颜色字面量**（同一条单测把关）。

## 2. token 表

### 2.1 颜色角色（DR 逐值照搬）

| token | 值 | 用途 |
| :-- | :-- | :--- |
| `--svi-bg` | `#141e24` | 底色 |
| `--svi-fg` | `#53a1b3` | 前景 / 主强调 |
| `--svi-ctl-bg` | `#141e24` | 控件底 |
| `--svi-ctl-hover` | `#193945` | 控件悬停 |
| `--svi-ctl-active` | `#316e7d` | 控件激活 |
| `--svi-input-fg` | `#53a1b3` | 输入前景 |
| `--svi-input-active` | `#ffffff` | 输入激活前景 |
| `--svi-input-ph` | `#316e7d` | 输入占位 |
| `--svi-border` | `#316e7d` | 描边 |
| `--svi-title` | `#e96c4c` | 标题 / 警告 |
| `--svi-error` | `#db4245` | 错误 |
| `--svi-success` | `#317c4e` | 成功 |

### 2.2 深底可读性派生量（DR 未提供，本项目补）

| token | 值 | 用途 |
| :-- | :-- | :--- |
| `--svi-bg-deep` | `#0f161b` | 更深一层底（模态 / 卡片下半） |
| `--svi-text-strong` | `#e8f4f6` | 高对比正文与标题 |
| `--svi-text-dim` | `#6f9aa6` | 次要文字 |
| `--svi-success-bright` | `#5fbf8a` | 深底上可读的成功色 |
| `--svi-error-bright` | `#e8756f` | 深底上可读的错误色 |
| `--svi-scrim` | `rgba(10,15,18,.72)` | 模态蒙层 |
| `--svi-outline` | `rgba(83,161,179,.35)` | 焦点 / 悬停描边 |

供 `rgba()` 消费的三元组：`--svi-bg-rgb` / `--svi-fg-rgb` / `--svi-success-rgb` /
`--svi-error-rgb` / `--svi-warn-rgb` / `--svi-dim-rgb` / `--svi-white-rgb` / `--svi-black-rgb`
（与上面的角色同源，改角色色值时必须同步改三元组）。

### 2.3 度量

`--svi-fs-sm:.625rem` · `--svi-fs:.75rem` · `--svi-fs-lg:.875rem` ·
`--svi-lh-sm:.875rem` · `--svi-lh:1rem` · `--svi-border-w:.125rem` · `--svi-ctl-h:1.5rem` ·
`--svi-r-sm:.25rem` · `--svi-r:.375rem` · `--svi-r-lg:.75rem` ·
`--svi-gap-sm:.5rem` · `--svi-gap:.75rem` · `--svi-tr-fast:125ms` · `--svi-tr-slow:250ms`

**唯一允许的颜色字面量例外**：防闪光功能注入的 `background:#000`（安全语义，不是主题色）。
它在单测里被显式白名单化 —— 加第二条例外必须回来改这一行并说明理由。

## 3. 控件库

`window.__svi.SviControls` 是**唯一的 DOM 构造点**（20 项）：

| 形状 | 建造器 | 备注 |
| :-- | :-- | :--- |
| 基础节点 | `h(tag, attrs, …children)` | 全库唯一的地基 |
| 标签盒 | `labelBox(label, hint)` | |
| 区块 | `section(title, hint, id)` → `{el, add, syncAll}` | 行集合 + 同步收集 |
| 分组卡 | `group(title, desc, id)` | = 区块 + 描述行 |
| 开关 | `toggleRow(label, hint, getVal, onSet)` | |
| 多态开关 | `multiSwitch(label, hint, options, getVal, onSet)` | chip 形态 |
| 复选 | `checkRow(label, hint, getVal, onSet)` | 与开关语义不同（可多选） |
| 下拉 | `selectRow(label, hint, options, getVal, onSet)` | |
| 滑块 | `sliderRow(label, hint, getVal, onSet, min, max, step, unit)` | |
| chip 组 | `chipRow(items, isActive, onToggle)` | |
| 按钮行 | `btnRow(buttons)` | |
| 导航按钮 | `navButton(label, hint, onClick)` | |
| 重置按钮 | `resetButton(label, hint, onReset)` | |
| 颜色选择 | `colorPicker(label, hint, getVal, onSet)` | 与 `pickerRow` 同源 |
| 快捷键录入 | `shortcutRow(label, hint, getVal, onSet)` | 聚焦后按组合键录入 |
| 折叠面板 | `collapsible(title, hint, collapsed)` → `{el, add, syncAll, setOpen}` | |
| 消息条 | `messageBar(text, kind)` | `info` / `warn` / `ok` / `error` |
| 文本行 | `textRow(…)` · 说明行 `infoLine(…)` · 取色行 `pickerRow(…)` | 既有形状 |

**收口规则**：每个建造器在真源里**只允许出现一次定义**（单测把关）；
旧 `ui` 名字保留为**零节点构造的转发垫片**，重建层把调用点直接改成 `SviControls.*` 后再删垫片。

**交互纪律**：本项目的 UI 不引入任何绘制型手势（无套索 / 无拖拽画框 / 无笔刷）；
快捷键录入靠键盘事件，区域纠正靠单击（见 `region-mask-contract.md` §7）。
