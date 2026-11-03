# design-assets ③ · 对比度基线表（AC3 证据）

> 判据：**WCAG 1.4.11 非文本对比度 ≥ 3:1**（PRD AC3）。
> 基准：控件的**最近非透明背景祖先**（`01-VERIFY` P1 要求消歧的口径）。
> 复算工具：`research/probe-contrast.js`（静态形，读 token 真源取值，**非照抄** `design.md` 数字）。
> Step A 将把本表固化为**浏览器 computed style** 形式的形式断言（AC3 要求「读计算样式」）。

## A. 面板（页内）—— 基准底 `--svi-bg` `#141e24`

| 组合 | 计算值 | design.md 参考值 | ≥3:1 |
|---|---|---:|---|
| 按钮填充 `--svi-ctl-bg` vs 面板底 | **1.000:1** | 1.00 ✓一致 | ❌ |
| 按钮现用描边 `--svi-ctl-hover` | **1.380:1** | 1.38 ✓一致 | ❌ |
| DR 原描边 `--svi-border` `#316e7d` | **2.947:1** | 2.95 ✓一致 | ❌（差 0.05） |
| `.svi-action-btn` 描边 `rgba(255,255,255,.12)` 合成后 | **1.435:1** | 1.44 ✓一致 | ❌ |
| `.svi-preset-btn` 描边 `rgba(255,255,255,.08)` 合成后 | **1.259:1** | — | ❌ |
| `.svi4-tab` / `.svi-modal-close` | **`border: none`**（规则缺失） | 0 | ❌ |
| **候选描边 `#35798a`** | **3.428:1** | 3.43 ✓一致 | ✅ **选定** |
| 候选描边 `#3a8091` | 3.769:1 | 3.77 ✓一致 | ✅（偏离 DR 更大，不选） |

## B. 扩展 popup —— 基准底 `--svi-bg-deep` `#0f161b`（**design.md 未记的补充**）

| 组合 | 计算值 | ≥3:1 |
|---|---:|---|
| popup 控件描边 `--svi-ctl-hover`（`.tab`/`button`/`.chip`/`select`/`.power-row` 公用） | **1.488:1** | ❌ |
| popup `.tab` 未选中态 `transparent` | 1.000:1 | ❌（**设计如此**，不列入缺陷；`[aria-selected=true]` 才补色） |
| popup `.tab` 选中态描边 `--svi-fg` | 6.184:1 | ✅ |
| 候选描边 `#35798a` | **3.696:1** | ✅ |
| （对照）DR 原描边 `#316e7d` | 3.178:1 | ✅（**在 popup 上反而达标**） |

**结论（约束项是面板底）**：`#316e7d` 在 popup 上 3.178:1 达标、在面板上 2.947:1 不达标 →
**约束由更亮的底 `#141e24` 决定**。选定 `#35798a` 在两处都达标（3.428 / 3.696），
故**单一描边色即可覆盖三处**，无需按界面分色。

## C. 探针原始输出（Step 0，SHA `3f7b245`）

```
token 源: universal-smart-invert.user.js
面板底 --svi-bg = #141e24 | popup 底 --svi-bg-deep = #0f161b

| 组合 | 计算值 | 期望(ref) | ≥3:1 |
| 按钮填充 --svi-ctl-bg vs 面板底 --svi-bg | 1.000:1 | 1.00 ✓一致 | ❌ |
| 按钮现用描边 --svi-ctl-hover vs --svi-bg | 1.380:1 | 1.38 ✓一致 | ❌ |
| DR 原描边 --svi-border vs --svi-bg | 2.947:1 | 2.95 ✓一致 | ❌ |
| .svi-action-btn 描边 rgba(white,.12) 合成后 vs --svi-bg | 1.435:1 | 1.44 ✓一致 | ❌ |
| .svi-preset-btn 描边 rgba(white,.08) 合成后 vs --svi-bg | 1.259:1 | — | ❌ |
| 候选描边 #35798a vs --svi-bg | 3.428:1 | 3.43 ✓一致 | ✅ |
| 候选描边 #3a8091 vs --svi-bg | 3.769:1 | 3.77 ✓一致 | ✅ |
| popup .tab 选中描边 --svi-fg vs --svi-bg-deep | 6.184:1 | — | ✅ |
| popup 控件描边 --svi-ctl-hover vs --svi-bg-deep | 1.488:1 | — | ❌ |
| popup .tab 未选中描边 transparent(裸底) | 1.000:1 | 1.00 ✓一致 | ❌ |

不达 3:1 的组合: 7 / 10
```

**design.md §2C / §3.3 的 6 个可核比值逐条一致（6/6）** —— 其对比度结论经独立复算成立。

## D. 达标实测（Step A 落地后，2026-09-29）—— 浏览器 computed 断言

已固化为 `test-browser.js` **Scenario 1c**（读计算样式 + WCAG relative luminance + alpha 合成；
基准 = 最近非透明背景祖先）。实测（`node test-browser.js`，SHA 见 04）：

| 选择器 | 实测数 | 基准底 | 四边 | 比值 | ≥3:1 |
|---|---:|---|---|---:|---|
| `.svi-btn` | 3 | rgb(20,30,35) | 2px | 5.763 | ✅ |
| `.svi-btn-nav` | 1 | rgb(20,30,35) | 2px | 5.763 | ✅ |
| `.svi-btn-reset` | 3 | rgb(20,30,35) | 2px | 3.444 | ✅ |
| `.svi-btn-done` | 1 | rgb(20,30,36) | 2px | 5.752 | ✅ |
| `.svi-action-btn` | 4 | rgb(20,29,35) | 2px | 3.448 | ✅ |
| `.svi-preset-btn` | 2 | rgb(20,29,35) | 2px | 5.769 | ✅ |
| `.svi-open-modal-btn` | 1 | rgb(20,29,35) | 2px | 3.448 | ✅ |
| `.svi-pip-btn` | 1 | rgb(20,29,35) | 2px | 3.448 | ✅ |
| `.svi-mini-btn` | 25 | rgb(20,30,35) | 2px | 3.444 | ✅ |
| `.svi-modal-close` | 1 | rgb(20,30,35) | 2px | 3.444 | ✅ |
| `.svi-layout-btn` | 3 | rgb(20,30,36) | 1px | 5.735 | ✅ |
| `.svi4-tab:not(.active)` | 1 | rgb(20,30,36) | 2px | 3.432 | ✅ |
| `.svi4-tab.active` | 1 | rgb(20,30,36) | 2px | 5.742 | ✅ |

（`.svi-chip` 在本次场景状态下无可布局实例，断言**跳过**并在表中标注 `absent/hidden`。）

**结论**：Step A 后**全部 12 类可见按钮**的四条边界均 ≥1px 且对比度 **≥3:1**（最低 3.432）。
修前对照（同一算法）：`.svi-action-btn` 1.435:1、`.svi-btn` 1.380:1、`.svi4-tab`/`.svi-modal-close` = 0
（`border:none`）—— 全部必红，证明断言的负向对照成立。

- 面板：所有按钮/页签/输入控件描边 vs 面板底 **≥3:1** —— 已达标。
- popup：描边换 `var(--svi-border)` 后 vs `--svi-bg-deep` = **3.696:1** —— 已达标
  （本次未在 popup 语境跑对比断言；其 token 生效由 `test-extension.js` 场景 6a-2 守卫，**本窗口未跑**）。
- 「按钮填充」列**保持 1.00:1 不改** —— 忠于 DR（其 `@color-control-back` 亦等于页面底，靠描边分离）。
