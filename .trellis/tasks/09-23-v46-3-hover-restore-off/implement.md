# v4.6-3 执行计划：悬停显示原图开关真正关闭

> **首条铁律：未复现不得改代码。** 静态审查显示门控齐全，盲改会掩盖真因。
> 每步勾选实时回写。禁止 `git commit`。

## 第 0 步 · 复现（唯一入口）

- [ ] 确认本机运行版本：面板/弹窗版本号 vs `@version`（若不一致，直接跳 H4 分支）
- [ ] 本地 fixture 页面构造四通道各 1 元素：CSS filter 图、特效投递图（`imgFxMode != full`）、
      背景图元素（`data-svi-bginv`）、视频
- [ ] 关闭「悬停显示原图」→ 悬停每个元素 → 记录 `getComputedStyle().filter`、
      `classList`、`data-*` 属性、`state.hoverRestore` → `research/repro-hover.md`
- [ ] 逐条验证 H1–H6，给出成立/不成立 + 证据

**Gate**：`research/repro-hover.md` 明确写出"哪个通道/哪段代码在关闭态仍生效"。

## 分支 A · H1 成立（悬停类残留）

- [ ] 切换开关时：遍历清除所有 `[class*="svi-fx-hover"]` 残留类
- [ ] 断言类添加严格受 `state.hoverRestore !== false` 门控（含 `mouseover` 与其它入口）
- [ ] 补单测：门控矩阵纯函数 `shouldRestoreOnHover(state, channel)`

## 分支 B · H2 成立（其它引擎通道）

- [ ] 列出全部悬停写点（`grep -n "mouseover\|mouseenter\|:hover\|svi-fx-hover"`）
- [ ] 每个写点接同一门控；视频/bgr/PiP 各补断言

## 分支 C · H3 成立（写值被复位）

- [ ] 定位复位点（`Store` 回读 / L887 merge / 站点 profile 合并），修正为"用户设置优先"
- [ ] 刷新后仍为关闭态的单测 + 探针断言

## 分支 D · H4 成立（旧版本）

- [ ] 交付物改为「版本自检」：面板/弹窗显著显示 `SCRIPT_VERSION`，
      与当前发布 `@version` 不一致时给出提示
- [ ] 产出用户安装/升级指引（README 段落）
- [ ] **不改判定逻辑**，在 prd 中回写该结论并解释"无需代码修复"

## 第 1 步 · 双向验证（无论哪个分支）

- [ ] 探针：四通道 × 开关两态 = 8 组合全部断言（关→反色保持；开→原色还原）
- [ ] bench 扩展：`.svi-hover-restore` 类与 `state.hoverRestore` 一致性断言
- [ ] 面板与弹窗双向同步断言

## 第 2 步 · 收口

- [ ] 四绿门禁
- [ ] 更新 spec：`quality-guidelines.md` 新增「开关类设置必须：单真源 + 热生效 + 切换时清残留」
- [ ] 勾选本文件 + 回写 prd（含复现结论与所选分支）
- [ ] 不提交

## 回滚点

- R1：第 0 步后（只有证据文件，零代码风险）
- R2：分支补丁为独立提交，可单独 revert
