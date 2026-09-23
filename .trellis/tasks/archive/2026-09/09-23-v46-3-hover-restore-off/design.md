# v4.6-3 技术设计：悬停显示原图开关真正关闭

## 1. 现状：三条通道 + 两处写值（静态看已门控）

| 通道 | 位置 | 门 |
|---|---|---|
| CSS filter 图 / 背景图 | L2151-L2166 | `html.svi-hover-restore` 前缀 |
| 特效图（`data-svi-fx`） | L2791-L2792（`:hover` 与 `.svi-fx-hover` 两选择器） | 同上前缀 |
| JS 悬停类添加 | `ImageFxEngine.bindHover()` L5586-L5605 | `state.hoverRestore === false` 早退 |
| 门类写入 | `updateImageFilterCss()` L1019-L1020 | `state.hoverRestore !== false` |
| 面板写值 | L7748-L7755 | 调 `updateImageFilterCss()` |
| 弹窗写值 | L9886-L9889 | 调 `updateImageFilterCss()` |

**结论：静态审查无法定位 → 本任务第一交付物是"可复现证据"，不是代码改动。**

## 2. 根因候选与判别

| # | 候选 | 判别实验 |
|---|---|---|
| H1 | `.svi-fx-hover` 类残留：关闭开关时鼠标正悬停，类不会被移除（只有 mouseout 移除），且该类的选择器前缀虽同为 `html.svi-hover-restore` 但**类仍在 DOM 上** | 悬停中关闭开关 → 读 `el.classList` 与 `getComputedStyle().filter`。若 filter 变回原色 ⇒ H1 成立（但同时说明前缀门控失效，需复核 CSS 是否真的带前缀） |
| H2 | 存在其它引擎的独立悬停通道（视频引擎 / bgr / PiP） | 全量 grep 悬停相关写点：`mouseover` / `mouseenter` / `:hover` / `svi-fx-hover` / `hoverRestore` |
| H3 | 写值未真正落盘：`savePrefs()` 后被 `Store` 回读复位；或 L887 `merged.hoverRestore = merged.hoverRestore !== false` 把 `false` 吞成 `true` | 关闭后打印 `state.hoverRestore` 与 `Store` 持久值；刷新后对比 |
| H4 | 用户安装的是旧版脚本（v4.5 之前的回显缺陷版） | 面板/弹窗显示 `SCRIPT_VERSION` 与 `@version` 比对；让用户核对 |
| H5 | 门类被重置：`bootEngines()` / `stripAll()` / 站点挂起恢复重建 CSS 时未带门类 | 断点/日志统计 `updateImageFilterCss` 调用次数与调用栈；搜索所有 `classList.toggle('svi-hover-restore'` 与样式节点重建点 |
| H6 | 用户关的是**别的**开关（如游戏/视频"悬停"、或站点级覆盖） | 对照 UI 文案与设置键名，产出"用户操作路径"确认 |

## 3. 目标契约

- **C1 单真源**：悬停还原只有一个真源 `state.hoverRestore`，一处门控函数，任何路径都不得绕过。
- **C2 热生效且不残留**：切换开关时立即清除所有悬停残留类（遍历 `[class*="svi-fx-hover"]` 清除）。
- **C3 四通道一致**：CSS 图 / 特效图 / 背景图 / 视频，行为一致（写单测矩阵）。
- **C4 双向可测**：探针同时验证「关」与「开」，避免"修成永久不还原"。
- **C5 版本可自查**：面板/弹窗显示脚本版本；若与预期不符给出提示（H4 的长期解药）。

## 4. 不做什么

- **不删功能**：开启态必须仍然还原原色（这是既有功能，不得为了"关得住"而破坏）。
- **不猜测性加门控**：若 H1 成立，修复是"切换时清理残留 + 保证类添加严格受门控"，
  而不是把所有相关规则再包一层前缀（会造成门控重复难维护）。

## 5. 验证策略

1. 真机探针：`dev/probe-hover-real.js` 扩展为四通道 × 开关两态矩阵（输出 JSON + 截图）。
2. bench：场景 20b（设置行回显）扩展断言 `.svi-hover-restore` 类与 `state.hoverRestore` 一致。
3. 单测：门控矩阵纯函数化（`shouldRestoreOnHover(state, channel)`）。
