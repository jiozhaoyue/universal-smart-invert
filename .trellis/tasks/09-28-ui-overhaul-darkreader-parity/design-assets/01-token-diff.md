# design-assets ① · token 差异表

> 任务：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity` · 基线 SHA：见 `04-screenshot-baseline.md`
> 真源：`universal-smart-invert.user.js` 的 `v6.4-TOKENS-START/END` 块（三处消费点：用户脚本面板 / popup / options）
> DR 侧依据：`research/02-darkreader-ui-anatomy.md` + `research/02-VERIFY.md`（上游 tag `v4.9.133`，MIT）
> 状态：**Step A 已落地**（2026-09-29）。下表「本仓目标值」= 已落地值。

| 角色 | DR 原值（`src/ui/theme.less`） | 本仓现值 | 本仓目标值 | 偏离理由 |
|---|---|---|---|---|
| 底色 `--svi-bg` | `#141e24` | `#141e24` | 不变 | 逐值照搬（v6.4 已做） |
| 控件底 `--svi-ctl-bg` | `#141e24`（= 页面底） | `#141e24`（= `--svi-bg`） | **不变** | 忠于 DR：其 `@color-control-back` 亦等于 `@color-back`，靠**描边**分离；改填充反而偏离 DR |
| 控件悬停 `--svi-ctl-hover` | `#193945` | `#193945` | 不变（但**不再当描边用**） | 对底 1.380:1，作描边不达标（见 ③） |
| 控件激活 `--svi-ctl-active` | `#316e7d` | `#316e7d` | 不变 | 逐值照搬 |
| 描边色 `--svi-border` | `#316e7d` | `#35798a` | **已落地 `#35798a`** | **本表唯一故意偏离 DR 的颜色**：DR 值对面板底 `#141e24` = **2.947:1 < 3:1**（WCAG 1.4.11）。`#35798a` = 面板底 **3.428:1** / popup 底 **3.696:1**，是同色系里偏离 DR 最小的达标值。**浏览器 computed 实测见 ③（Scenario 1c）** |
| 前景 / 强调 `--svi-fg` | `#53a1b3` | `#53a1b3` | 不变 | 逐值照搬 |
| 描边宽（外）`--svi-border-w` | `2px`（`@size-border: .125rem`） | `.125rem`（**曾为死 token**） | **已落地并启用**：落到按钮 / 页签 / 关闭钮 / 输入（真实生效） | DR 值已对，缺的是消费点 |
| 描边宽（内） | `1px`（`@size-border-inner: .0625rem`） | **无此 token** | **已落地 `--svi-border-w-inner: .0625rem`** | 对齐 DR 的双层描边词汇（分隔线用） |
| 圆角 `--svi-r-sm/-r/-r-lg` | **无 radius 变量** | **已落地全部 `0`**（token 名保留） | **全部 `0`** | DR 全 UI 直角。**实现期发现**：面板 `var(--svi-r*)` 消费数为 0 → 仅改 token 无效果，逐控件字面量一并置 0（见 implement.md 「实现期发现」#1） |
| 其余 12 个颜色角色（title/error/success/派生量） | 逐值 | 逐值照搬（v6.4） | 不变 | 无偏离 |
| 字体 | Open Sans（外链 TTF） | `system-ui, "Segoe UI", "Microsoft YaHei"` | **不变** | N6：外链 TTF 撞 nocdn/单文件约束 |
| 图标 | `background-image:url(assets/images/*.svg)` | `SviControls.ICONS` 内联 `<svg fill="currentColor">` | 不变 | N7：图标唯一来源 + 禁 emoji |

## 与 DR 的偏离总账（只有两处）

1. **`--svi-border: #316e7d → #35798a`** —— 为了达标 AC3（≥3:1）；DR 原值 2.947:1 差一点点。
2. **字体不照搬** —— nocdn 约束（N6），非视觉取舍。

其余颜色与度量 token 均逐值照搬，不做「自行调色」。

## 补充发现（Step 0 实测，design.md 未记）

- **popup 的底色是 `--svi-bg-deep` `#0f161b`，不是 `--svi-bg`**（`popup.html:14`）。
  AC3 的对比基准必须按**各自界面最近的非透明背景祖先**取，不能全用 `#141e24`。
- 因此 DR 原描边 `#316e7d` 的表现在两处不同：对面板底 **2.947:1（❌）**、对 popup 底 **3.178:1（✅）**。
  **约束项是面板底 `#141e24`**，选定值 `#35798a` 两处都达标（3.428 / 3.696）→ 仍可用**单一**描边色覆盖三处。
- `--svi-border` / `--svi-border-w` 在用户脚本内 `var()` 消费数 = **0**；全仓仅
  `scripts/extension-src/options.html:25` 有一处消费（`border-bottom: var(--svi-border-w) solid var(--svi-border)`）。

## 【根因级】token「存在但惰性」——popup / options 长期无主题（2026-09-29 Step 0 实测）

> 这一条决定了本表的性质：**本表上半部分的「本仓现值」列，在 popup / options 上其实从未生效过。**
> 上半部分描述的是**源码里的取值**；而这两个界面的**渲染结果**是「无主题」（浅色）。

**机制**：`build-extension.js:295` 抽取 `v6.4-TOKENS-START/END` **标记之间**的内容，而源码里
`:root {` 开在标记**之外** → 注入的是**裸声明列表**，落在 `<style>` 顶层；
按 CSS 解析规则，样式表顶层的无选择器声明不成立，**整块被丢弃**，且连带吞掉紧随其后的一条规则
（popup 的 `:root{color-scheme:dark}` 一并失效）。页面内面板**正常**（它的 token 在 `:root{}` 内）。

**三重实测证据**：

| # | 手段 | 结果 |
|---|---|---|
| 1 | 真扩展语境截图（`test-extension.js --shots`） | popup 渲染成**浅色**；页头 `.logo`（`conic-gradient` 走 `var(--svi-fg)`）与 `.chip` 边框**完全没画出来** |
| 2 | 真 Chrome 读 CSSOM（`research/probe-token-application.js`） | 两页 `--svi-bg` = **空串**、`body` 计算背景 = `rgba(0,0,0,0)`、popup `color-scheme` = **normal** |
| 3 | 静态根因 | 注入产物里 token 前面没有任何 `{`（`sed -n '5,14p' extension/popup.html` 可见） |

**为何 4 次 UI 重建全漏**：`test.js:5077` 的守卫是 `text.indexOf(mine) >= 0` ——
只验「文本出现」，对「出现但惰性」**零覆盖**（自证式验收的标准样本）。

**修复（2026-09-29，Step A-0）**：两个源 HTML 把占位符包进 `:root { ... }`；
`test-extension.js` 新增真浏览器守卫（popup 场景 6a-2 + options 场景 7-0b），
并已用**负向对照**（未包裹的被测副本 + `SVI_EXT_DIR`）验证断言确实变红（exit 1）。

**修复后实测**：两页 `--svi-bg=#141e24` / `body背景=rgb(15, 22, 27)` / `color-scheme=dark`；
popup 截图从「浅色无主题」变为**深色主题**（logo 圆点、chip 描边、select/checkbox 全部正常）。

**对本表的修正**：上半部分「本仓现值」= 源码取值（此前在 popup/options 上**未生效**）；
「本仓目标值」= Step A 要在**已生效**的前提下落地的新取值。

