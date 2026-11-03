# Design: AGPL 迁移 + 字体与可读性 (DR 吸收#1)

## 1. AGPL 迁移面

| 触点 | 变更 |
| --- | --- |
| `LICENSE` | AGPL-3.0 官方全文 (gnu.org agpl-3.0.txt, 661 行) |
| userscript `@license` | `AGPL-3.0-or-later` (SPDX), `@version 4.1.0`, `@description` 更新 |
| `dev/svi-dev-loader.user.js` | `@license AGPL-3.0-or-later` |
| `README.md` / `README_EN.md` | 徽章 `license-AGPL--3.0-green` + 脚注行 |
| `PUBLISHING.md` | 协议表行 MIT → AGPL-3.0 |
| AGENTS.md | 不动 (描述第三方 http-server 的 MIT, 非本项目) |

油猴标 market (GreasyFork) 显示 license 字符串即可; 插件商店条目不受影响 (manifest 无协议字段)。

## 2. 字体覆盖与文字描边

- **数据**: `DEFAULT_PREFS` 新增 `fontOverride:false` / `fontFamilyPreset:'sans'` /
  `textStroke:0`; `loadState` 规范化 (布尔 === true、枚举白名单、数值 0~1 钳制)。
- **栈**: `FONT_STACKS = { sans, serif, mono, rounded }` 中文字体优先的 system stack;
  const 必须先于 `loadState()` 调用点 (782 行前)。
- **CSS** (并入 v4 样式块): 变量 `--svi-font-family` / `--svi-text-stroke` 由 JS 注入
  documentElement; 门类 `html.svi-font-on` / `html.svi-stroke-on`; 命中选择器
  `:is(body,h1..h6,p,span,a,li,td,th,dd,dt,figcaption,blockquote,label,button,input,select)`
  `:not(svg):not(svg *)` 且 `:not(code/pre/kbd/samp)` 及其后代。
- **应用器** `updateFontCss()`: 设两变量 + 双门类; 与 `runtime.siteActive` 联动
  (挂起即灭)。挂接: boot、Store.onRemoteLoaded、`stripSviSideEffects()` (拆类)、
  `applySitePower(true)` (重放)。
- **UI**: 全局页签新增 `buildReadabilitySection()` (`#svi-sec-readability`): 开关 +
  四预设 select + 0~1px/0.05 描边 sliderRow; 变更即 savePrefs + updateFontCss。

## 3. 风险

- 字体覆盖用选择器白名单 + !important, 避开 svg/代码; 站点自带 !important 字体的对抗
  属预期行为 (DR 同样靠优先级, 用户可关闭)。
- AGPL 对分发 zip 的影响: 仅协议文本, 无需改打包逻辑; dist 产物随仓库分发时 LICENSE 已在根。
