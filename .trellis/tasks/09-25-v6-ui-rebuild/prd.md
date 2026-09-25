# PRD: v6-4 UI 全量同源重构

## 背景（现状核查）

| 项 | 现状 | 位置 |
| :--- | :--- | :--- |
| 页面内设置面板 | 12 个区块，约 3000 行；`ui` 组件库 11 个工厂方法 | `universal-smart-invert.user.js` `ui` @9703、`buildSettingsModal` @10158 |
| 面板 CSS | **一个约 1345 行的模板串**（@3603–4948），经 `GM_addStyle` 注入 @4950 | 同上 |
| 扩展 popup | 320px 单栏简版；源码在 `scripts/extension-src/`，构建时逐字拷贝 | `scripts/extension-src/popup.html` / `popup.js` |
| emoji | **24 个不同字符、66 个实例**，散落在区块标题、按钮、toast 文案 | 全文件 |
| 页面 UI 组件 | 胶囊、toast、模态面板、区域框选层各自一套样式 | 同上 |

参照物 **Dark Reader**（上游源码直读，非二手描述）：

- **控件库**（`src/ui/controls/`）：`button` / `check-button` / `checkbox` / `color-dropdown` /
  `color-picker`（含 hsb-picker）/ `control-group` / `dropdown` / `message-box` / `multi-switch` /
  `nav-button` / `overlay` / `reset-button` / `select` / `shortcut` / `slider`。
- **popup 信息架构**：三 tab —— `Filter` / `Site list` / `More`；高级设置折叠，同一时刻
  只开一个 sheet。
- **设计 token**（`src/ui/theme.less`，逐行实读）：

  | 类别 | 值 |
  | :--- | :--- |
  | 底色 / 前景 | `#141e24` / `#53a1b3` |
  | 控件底 / 悬停 / 激活 | `#141e24` / `#193945` / `#316e7d` |
  | 输入前景 / 激活 / 占位 | `#53a1b3` / `#ffffff` / `#316e7d` |
  | 描边 / 标题 / 错误 / 成功 | `#316e7d` / `#e96c4c` / `#db4245` / `#317c4e` |
  | 字号 | 正文 `.75rem`、小 `.625rem`、大 `.875rem`；行高 `1rem` / `.875rem` |
  | 描边宽 / 控件内高 | `.125rem` / `1.5rem` |
  | 缩进 | 大 `.75rem`、小 `.5rem` |
  | 过渡 | 快 `125ms`、慢 `250ms` |

## Requirements

### R1 — 设计 token 单一真源（本任务的核心机制）
- 全部视觉 token（颜色 / 字号 / 行高 / 描边 / 圆角 / 缩进 / 过渡时长）收敛为**一处定义**。
- **三处消费点**：扩展 popup、扩展 options 页、用户脚本内嵌面板。
- 受**单文件真源约束**，三处无法共享 JS 模块，因此同源机制必须是：
  **token 定义在唯一真源文件中 → 构建时注入到 HTML 产物 → 单测逐字节校验三处一致**
  （`scripts/build-extension.js` 已有「从 userscript 生成扩展产物」的先例，扩展它即可）。
- **AC**: 三处 token 的逐字节一致性单测；`grep` 核查不存在第二份独立 token 定义
  （现有 @3603 的 1345 行 CSS 里的硬编码颜色值必须全部改为引用 token）。

### R2 — 同源控件库
- 以 DR 的控件词汇为参照，建立本项目自己的控件库，至少覆盖：
  **分组卡（标题 + 描述 + 控件槽）/ 开关 / 多态开关 / 下拉 / 滑块 / 复选 /
  按钮 / 导航按钮 / 重置按钮 / 颜色选择 / 快捷键录入 / 折叠面板 / 消息条**。
- 现有 `ui` 的 11 个工厂方法（`h` / `labelBox` / `section` / `toggleRow` / `sliderRow` /
  `selectRow` / `chipRow` / `btnRow` / `textRow` / `infoLine` / `pickerRow`）必须**收口**到
  新控件库，不得两套并存。
- 每个控件必须能被 popup / options / 内嵌面板三处复用（同一 DOM 结构与同一 class 语义）。
- **AC**: 控件库导出的控件清单有单测；`grep` 核查不存在第二套行渲染实现。

### R3 — 扩展 popup 重做（三 tab）
- 信息架构对齐 DR：`Filter`（反色预设 / 图片策略 / 特效模式等高频项）/
  `Site list`（本站开关 + 站点名单）/ `More`（进入 options 页的入口 + 重置 + 版本）。
- 保留现有消息协议不破坏：`svi-get-snapshot` / `svi-site-power` / `svi-set-pref`
  （`scripts/extension-src/popup.js` 既有契约），新设置的读写必须**复用面板自己的
  handler**，避免语义分叉（现有注释已确立此纪律）。
- **AC**: popup 三 tab 可切换；既有三条消息协议的消息往返单测全绿；
  popup 内每一项在 options 页有对应项且双向同步。

### R4 — 独立 options 页（新增）
- 承载**全部**设置（面板现有 12 个区块的全部项），按 DR 的分组与折叠组织。
- 与页面内面板共用同一套控件库与 token；同一偏好键在两处的读写必须一致。
- **AC**: options 页可独立打开；12 个区块的设置项**无一缺失**（用清单单测逐项核对）；
  任一处修改后另一处刷新即见。

### R5 — 用户脚本内嵌面板重建
- 用同源控件库重建现有 12 个区块（外观与画面 / 图片反色 / 视频 / 站点与规则 /
  颜色保护 / 当前页媒体 / 数据与备份 / 操作技巧 / 元素动作 / 本站能力 / 原色屏蔽 /
  字体与可读性 等，**顺序与项不得缺失**）。
- 胶囊、toast、模态、区域框选层一并纳入新 token。
- **AC**: 重建后设置项清单与重建前**逐项比对无缺失**（清单单测）；面板开关与
  options 页双向同步。

### R6 — 清零 emoji
- `universal-smart-invert.user.js`、`extension/`、`scripts/extension-src/` 中
  **emoji 字符计数为 0**（不含代码标识符与文档文件）。
- 图标一律用**内联 SVG + `fill: currentColor`**，颜色随 token 走。
- **AC**: 单测扫描上述路径的 emoji 码位区间，计数为 0；新增图标均为内联 SVG。

### R7 — 视觉方向（需在规划评审时确认）
- 参照的是 DR 的**信息架构与控件词汇**，**不是**照搬其配色。
- 建议：保留本项目现有青蓝色调作为 token 基色（现用 `#38bdf8` / `#0b1220` / `#101a2c` /
  `#1e293b` 一族），按 R1 收敛为命名 token；结构、间距、折叠、控件形态学 DR。
- **不内联字体**：DR 打包 OpenSans TTF，本项目受「零外部依赖 + 单文件真源」约束不引字体
  （base64 内联会显著膨胀单文件），一律用系统字体栈。
- **AC**: 评审时确认最终 token 值；确认后写入 spec。

## Constraints

- **单文件真源**：`universal-smart-invert.user.js` 是唯一权威源，`extension/` 是生成物；
  popup / options 的源码只放在 `scripts/extension-src/`，**绝不手改 `extension/`**。
- **零外部依赖 / nocdn**：不得引 CDN、不得引 web font、不得引图标字体。
- **不得改变设置项的语义与偏好键名**（会破坏已有用户配置）；只改呈现。
- **不得改变 popup 既有消息协议**（`popup.js` 的三条消息是外部契约）。
- 面板重建后**功能零回归**：全关时 `node test.js` / `test-browser.js` 与 v5.0.0 一致
  （注意 bench 里有大量面板操作断言，重建会打到它们，需同步核对而非放宽）。
- 注释与文档全中文。

## Acceptance Criteria（汇总）

- [ ] token 单一真源 + 构建注入 + 三处逐字节一致单测
- [ ] 同源控件库落地，旧 `ui` 11 个工厂方法全部收口，无第二套实现
- [ ] popup 三 tab 可用，既有三条消息协议不破
- [ ] options 页承载全部设置项，清单逐项核对无缺失
- [ ] 内嵌面板 12 区块重建，设置项清单与重建前逐项一致
- [ ] emoji 计数为 0（三处路径）
- [ ] 视觉方向在评审确认，token 值写入 spec
- [ ] 功能零回归：四绿门禁全绿，bench 面板相关断言全部通过
- [ ] 文档：README / README_EN 更新为新 UI 结构说明

## Notes

- 本片是批2 ④，依赖批1 的**最终设置项形状**（部分反色会新增一批设置项，UI 重建必须
  在它们定型之后做，否则要返工两次）。
- 现有 bench 有大量面板操作断言；重建时**不得**通过放宽断言来「通过」——断言失败要么是
  真的回归，要么是断言依赖了旧 DOM 结构，后者需按新结构改写并说明。
- R7 的配色方向是需要用户拍板的一项，评审时一并确认。
