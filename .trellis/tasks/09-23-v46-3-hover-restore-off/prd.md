# v4.6-3 修复关闭悬停显示原图后仍还原原色

## Goal

关闭悬停显示原图开关后, 鼠标移到已反色图片/背景上仍显示原色; 需真机复现并定位未被门控的还原通道。

## Requirements

### 用户原话

> 「以及设置关掉『鼠标放在图片元素上显示原色』这个功能，仍然会显示，一点用都没有，他妈的」

### 现状证据（本次会话静态勘查，供实施者复核而非直接采信）

静态看**三条通道都已门控**，因此本任务必须真机复现后才允许改代码：

| 通道 | 位置 | 门 |
|---|---|---|
| CSS filter 图/背景图 | L2151-L2166 | `html.svi-hover-restore` |
| 特效图（`data-svi-fx`） | L2791-L2792 | `html.svi-hover-restore` |
| JS 悬停类 | `ImageFxEngine.bindHover()` L5586-L5605 | `state.hoverRestore === false` 早退 |
| 门类写入 | `updateImageFilterCss()` L1019-L1020 | `state.hoverRestore !== false` |
| 面板写值 | L7748-L7755 | 调 `updateImageFilterCss()` |
| 弹窗写值 | L9886-L9889 | 调 `updateImageFilterCss()` |

### 待验证根因候选（按可能性排序）

1. **`.svi-fx-hover` 类残留**：关闭开关时若鼠标正悬停，已加的类不会移除（`mouseout` 才移除），
   之后该类独立于 `html.svi-hover-restore` 生效（L2792 有 `.svi-fx-hover` 选择器）→ 观察上
   "关掉也还原"。需确认 L2792 是否真的被 `html.svi-hover-restore` 前缀门控。
2. **其他引擎的独立悬停通道**：视频引擎 / 背景替换引擎 / PiP 是否有各自 hover 还原实现。
3. **写值未落**：`savePrefs()` 后 `Store` 回读把 `state.hoverRestore` 复位；
   或 `merged.hoverRestore = merged.hoverRestore !== false`（L887）在某路径把 `false` 吞成 `true`。
4. **用户实际使用旧版本脚本**（v4.5 之前的回显缺陷版本）→ 需确认用户安装版本与 `@version`。
5. **门类被其他地方整体重置**：如 `bootEngines()` / `stripAll()` / 站点挂起恢复时调用了
   不带门类的 CSS 重建。

### 需求

- **R1 关闭即真关**：`hoverRestore = false` 后，CSS 通道、特效通道、背景图通道、视频通道
  **全部**不得因悬停显示原色。
- **R2 运行时可切**：开启/关闭必须热生效（无需刷新），且已悬停中的元素立刻按新值呈现。
- **R3 无卡死**：切换开关不得导致 `.svi-fx-hover` 等悬停类残留、状态机卡在悬停态。
- **R4 回显一致**：面板与弹窗两处开关状态与实际行为一致（两侧读同一真源）。
- **R5 可测**：新增真机探针，同时验证「关」与「开」两个方向，防单向修复。

## Acceptance Criteria

- [ ] 复现报告：明确写出复现路径、观察到的还原通道（哪个选择器/哪段 JS 生效）
- [ ] 修复后真机探针：关闭态下悬停 CSS 反色图 / 特效图 / 背景图，`getComputedStyle().filter` 保持反色
- [ ] 开启态下同探针确认还原仍工作（防过度修复把功能删掉）
- [ ] 悬停中切换开关：不残留悬停类，立即按新值呈现
- [ ] 面板与弹窗双向同步断言（沿用 bench 场景 20b 思路）
- [ ] 四绿门禁全绿

## Notes

- **禁止在未复现前改代码**——静态审查显示门控齐全，盲改会掩盖真因。
- 若复现结论是"用户装的是旧版"，本任务的交付物为「复现脚本 + 版本自检（UI 显示版本号 +
  与 `@version` 比对提示）」，而不是代码修复；需在 prd 中回写该结论。
- 复现优先使用 `dev/probe-hover-real.js`、`dev/probe-hil-real.js` 既有基建。
