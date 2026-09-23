# v4.6-4 执行计划：暗色遮罩容器场景

> 每步勾选实时回写。禁止 `git commit`。本任务风险最高（新增判定能力），必须保守推进。

## 第 0 步 · 场景确认与 fixture

- [x] 与用户确认场景解释（`design.md §1`）：与用户原话一致（「视觉还好」= 合成观感已暗）；
      形态修正已回写 prd Notes —— 蒙层必须绘制在媒体**之上**（::after 覆盖层 / 兄弟覆盖层 /
      低不透明度媒体叠深底），容器自身背景在不透明图片之下、不构成蒙层
- [x] 建立本地 fixture 页面（四案例 A/B/C/D + 补充形态 E/F + 12 张防误伤控件）→
      `dev/fixtures/dark-veil.html`（离线单文件, data URI 同源图, 零网络依赖）
- [x] 在**旧版脚本**（基线 b1219f2, v4.5.0）上跑 fixture，A 案误反色已复现
      （`inv=true / reason=pixel`，18/18 已决，无脚本异常）→ `research/repro-mask.md`
      + `repro-before.json` + `repro-before.png`；探针 `dev/probe-veil-fixture.js`
      （独立临时 profile + 端口 9331，不与并行 worktree 争用）
- [ ] 至少 1 个真站复现（GitHub 用户主页 / B站空间 / 掘金个人主页 择一）
      —— **未完成（诚实声明）**：本轮未消耗网络预算验证真站连通性；离线 fixture 已覆盖
      A/E/F 三种真实高频形态的机制验证，真站验证留待网络可达时补做

**Gate**：A 案误反色被复现且有截图/决策报告 ✅ → 进入第 1 步。

## 第 1 步 · 纯函数 `maskedDarkContext(el)`

- [ ] 实现祖先覆盖层检测（覆盖率 + 暗色 alpha + 层叠在上，≤3 层）
- [ ] 实现合成采样次路径（可选，跨域 taint 则跳过）
- [ ] 单测：四案例矩阵断言
- [ ] 单测：性能预算——`getBoundingClientRect` 调用次数上限、无强制布局循环

## 第 2 步 · 接入决策管线

- [ ] 优先级插在"元素规则"之下、"快照"之上（见 `design.md §6`），并写入快照
- [ ] 原因码 `masked-dark` 落决策报告/统计
- [ ] 图片引擎与 bgr 引擎都接入（两处都要；bgr 有独立判定路径）
- [ ] 特性开关 `state.maskAware`（默认 true）+ 面板可见（设置项文案中文）

## 第 3 步 · 防误伤

- [ ] 反向用例集：10 张正常亮图（无蒙层）必须仍反色
- [ ] 浅色蒙层（白/亮渐变）必须仍反色
- [ ] 站点级回归：GitHub / Wikipedia / BBC 三站视觉探针对比修复前后决策集合，
      差异**只允许**出现在遮罩类元素上

## 第 4 步 · 稳定性

- [ ] 5 次重载稳态一致（decide-once 未破坏）
- [ ] 动态插拔蒙层（MutationObserver 场景）行为符合预期：蒙层移除后是否重判？→ 结论写入 spec
- [ ] 移动端（375px）无回归

## 第 5 步 · 收口

- [ ] 四绿门禁
- [ ] 更新 `.trellis/spec/frontend/quality-guidelines.md`：新增「合成观感优先于原图像素」条目
- [ ] 勾选本文件 + 回写 prd Acceptance Criteria
- [ ] 不提交

## 回滚点

- R1：第 1 步纯函数独立可 revert
- R2：第 2 步接线后，`state.maskAware=false` 即完全回到旧行为（默认 true，可在面板关闭）
- R3：若真站回归出现非遮罩类差异 → 立即回退到"只处理覆盖率 ≥80% 的明确暗蒙层"
