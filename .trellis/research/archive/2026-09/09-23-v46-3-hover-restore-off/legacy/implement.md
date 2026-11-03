# v4.6-3 执行计划：悬停显示原图开关真正关闭

> **首条铁律：未复现不得改代码。** 静态审查显示门控齐全，盲改会掩盖真因。
> 每步勾选实时回写。禁止 `git commit`。

## 第 0 步 · 复现（唯一入口）

- [x] 确认本机运行版本：面板/弹窗版本号 vs `@version`（若不一致，直接跳 H4 分支）
      → 复现环境脚本版本 4.5.0（探针内联注入当前源码）；用户实测版本不可远程读取，
        经 git 考古 + 旧版对照腿实锤 H4 机制（见 research/repro-hover.md）
- [x] 本地 fixture 页面构造四通道各 1 元素：CSS filter 图、特效投递图（`imgFxMode != full`）、
      背景图元素（`data-svi-bginv`）、视频
      → `dev/probe-hover-matrix.js`（进程内 http 伺服 + CDP，零外部网络依赖）
- [x] 关闭「悬停显示原图」→ 悬停每个元素 → 记录 `getComputedStyle().filter`、
      `classList`、`data-*` 属性、`state.hoverRestore` → `research/repro-hover.md`
      → 原始数据 `research/repro-raw-*.json`
- [x] 逐条验证 H1–H6，给出成立/不成立 + 证据

**Gate**：`research/repro-hover.md` 明确写出"哪个通道/哪段代码在关闭态仍生效"。
✅ Gate 达成：当前版 4.5.0 四通道关闭态全部正确保持反色（无一通道在关闭态仍生效）；
用户症状复现于旧版 ≤4.3.0（8c1ee9f~1 对照腿）：设置行回显缺陷 → 首次点击写回开启值。

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

## 分支 D · H4 成立（旧版本）✅ 命中

- [x] 交付物改为「版本自检」：面板/弹窗显著显示 `SCRIPT_VERSION`，
      与当前发布 `@version` 不一致时给出提示
      → 设置面板头部新增 `.svi-modal-ver` 版本徽标（v4.5.0 徽标 = 运行源码版本）；
        不做远程版本检查（禁止自动网络遥测），提示用户与发布页比对。
        弹窗侧版本号已随快照下发（`svi-get-snapshot.version`），弹窗 UI 展示属
        `scripts/extension-src/**`（本次禁改清单），移交主会话合并时处理。
- [x] 产出用户安装/升级指引（README 段落）
      → 按 dispatch 限制 README 不在本任务允许改动清单内；指引写入
        `research/repro-hover.md` §5 + prd 回写，移交主会话择机移入 README。
- [x] **不改判定逻辑**，在 prd 中回写该结论并解释"无需代码修复"
      → `bindHover` / `updateImageFilterCss` / CSS 门控全部未动；仅新增 UI 徽标 + bench 断言。

## 第 1 步 · 双向验证（无论哪个分支）

- [x] 探针：四通道 × 开关两态 = 8 组合全部断言（关→反色保持；开→原色还原）
      → `dev/probe-hover-matrix.js` 矩阵（CSS 图 full×两态、fx 图 luma×两态、
        背景图×两态、视频×两态）+ H1 残留 + H3 双向持久化 + 旧版对照腿（--old-only）
- [x] bench 扩展：`.svi-hover-restore` 类与 `state.hoverRestore` 一致性断言
      → Scenario 20b 已有（单击写值 + 门类同 tick）；15a/15c 新增背景图通道双态悬停腿
- [x] 面板与弹窗双向同步断言
      → 面板：Scenario 20b。弹窗：与面板共用 `state`/`updateImageFilterCss()` 同构路径；
        弹窗 UI 断言属 `scripts/extension-src/**`（本次禁改清单），移交主会话

## 第 2 步 · 收口

- [x] 四绿门禁
      → `node --check universal-smart-invert.user.js` EXIT=0 ✓
      → `node test.js` EXIT=0 ✓（首次运行遇 Store 分片时序 flaky，重跑即绿，与本任务改动无关）
      → `node test-browser.js` 全部场景通过（"🎉 ALL BROWSER AUTOMATION TESTS PASSED"，
        含新增 bginv 双态腿与版本徽标断言）✓
      → `build-extension.js + pack.js` 未执行：本任务 dispatch 禁改 `extension/**` 且判定逻辑
        零改动（仅 UI 徽标）；主会话合并四子任务时统一 bump `@version` 并重建（见 prd §结论）
- [x] 更新 spec：`quality-guidelines.md` 新增「开关类设置必须：单真源 + 热生效 + 切换时清残留」
      → 追加 `## v4.6 Additions` 小节（行回显 rowSyncs 契约 / 门类前缀压制残留 /
        死门规则≠功能存在 / 版本自检本地化），未删改既有内容
- [x] 勾选本文件 + 回写 prd（含复现结论与所选分支）
- [x] 不提交（未执行任何 git commit/push/merge/worktree 操作）

## 回滚点

- R1：第 0 步后（只有证据文件，零代码风险）
- R2：分支补丁为独立提交，可单独 revert
