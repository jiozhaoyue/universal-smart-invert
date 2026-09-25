# PRD: v5-3 数据闭环 — 从「采集了」到「真的用上」

## 背景（现状核查结论）

已在采集但**零消费回路**的四份数据：

| 存储键 | 内容 | 当前消费方 |
| :--- | :--- | :--- |
| `svi:learned` | `{ host: { rules: [{stem, action, hits, lastAt}] } }` | `RuleLearner.activeRules` —— 硬门 `hits >= learnHits(默认2)` |
| `svi:timeline` | 视频反色时间段 | `TimelineLearner` 预布防（已消费，唯一闭环） |
| `svi:manualOverrides` | `host\|src → invert/restore` | `manualStateFor`（已消费） |
| `svi:stats` | 12 个计数器 + 200 条 log | **只展示，无任何回读** |

问题：`hits` 只做「够不够 2 次」的布尔门，第 2 次和第 50 次的结论**完全等价**；
`stats.log` 里的 `reason` 从未被聚合；误反的教训只停留在单元素，无法泛化到新站。

## Requirements

### R1 — hits 分级权重 + 负反馈
- `activeRules` 由布尔门改为**分级**：
  | 级别 | 条件 | 权限 |
  | :--- | :--- | :--- |
  | 弱 | `hits ∈ [learnHits, 5)` | 只能覆盖像素结论（现状语义） |
  | 强 | `hits >= 5` | 可覆盖内置种子规则（`BUILTIN_RULES`） |
- **负反馈降级**：若某条已生效规则命中的元素随后被用户手动覆盖 → 该规则 `hits` 归 1 并标记
  `demotedAt`；连续 2 次降级 → 移出 active（保留在列表里可见，可手动恢复）。
- 面板规则列表显示每条规则的「级别 / 命中 / 最近生效 / 是否被降级」。
- **AC**: 单测分级边界（4 不生效强规则、5 生效）、降级链路、恢复链路。

### R2 — 决策原因分布（让采集可见）
- 新面板区块「📊 本页判定来源」：把本次会话决策按 `source`（v5-1）与 `reason` 聚合，
  显示如「本页 12 张：像素判定 9 / 学习规则 2 / 站点规则 1；其中遮罩否决 1、透明底 1」。
- 全站维度：`stats` 计数器 + `log` 原因码的累积分布（只读聚合，不改采集）。
- 导出：并入现有 `StatsManager.exportJson()`，新增 `reasonDistribution` 字段（**向后兼容**，
  旧文件仍可导入）。
- **AC**: 单测聚合纯函数；bench 断言分布数字与页面实际决策一致。

### R3 — 阈值自校准
- 每 host 记 `falseInvert`（被反色后被用户还原的次数）/ `falseKeep`（被判不反后被用户强制
  反色的次数），24h 滑窗。
- 当 `falseInvert / (falseInvert + falseKeep) > falseInvertRate`（默认 0.3）且样本数
  ≥ `calibrateMinSamples`（默认 5）→ 自动**收紧**该站判定：
  `whiteThreshold += step`、`lumThreshold += step`（步长 3，上限 +15，不越界），
  写入站点覆盖偏好；面板显示「本站判定已按你的历史修正自动调紧（+N）」+「恢复默认」。
- 反向（`falseKeep` 占优）→ 放松，同样有上限。
- 校准是一次性触发（每次触发后重置样本窗），避免震荡。
- **AC**: 单测触发边界与上限钳制；bench 断言收紧后原本误反的页不再反色。

### R4 — 跨站形状泛化（冷启动加速）
- 把 host 维度的规则聚合到**元素形状**维度：
  `shape = { tag, classTokens(排序后 top3), sizeBucket, ctxToken(正文/骨架/未知) }`，
  由 `selectorStem` 已有的词元解析扩展（不新增 DOM 查询）。
- 形状命中计数跨 host 累计（`svi:shapes`），达到 `shapeMinHosts`（默认 3 个不同 host）
  且方向一致 → 作为**最弱先验**参与判定：仅在像素结论缺失（分析失败 / 档 B 无像素）时
  才生效，且优先级**低于**本站学习规则、高于种子规则。
- 面板可查看形状先验表并逐个禁用。
- **AC**: 单测形状签名稳定性（同元素多次解析同签名）与 `shapeMinHosts` 门；
  bench 断言新 host 上无像素证据时按已有形状先验出结论。

### R5 — 导出 / 导入闭环
- 导出的学习成果：按 `hits` 降序、过滤 `hits < learnHits`、带 host 白名单脱敏、含 `shape`
  先验。**不含浏览记录**（保持现状承诺）。
- 导入**分级合并契约**（本任务定契约并实现）：
  - 同 `host + stem`：`action` 一致 → `hits = max(a,b)`（**取大，不累加**；累加会因反复
    导入同一文件而无限放大权重，是可被利用的权重污染）；`action` 不一致 → 保留 `hits` 高者，
    等则保留本地。
  - 形状先验：计数取 `max`，host 集合并集。
  - 规则包版本号提升，旧格式仍可导入（迁移）。
  - 导入前弹出「将合并 N 条规则，其中 M 条与本机冲突」预览。
- **AC**: 单测合并矩阵（一致/冲突/相等/空）；bench 断言重复导入同一文件后权重不变。

### R6 — 反哺 CI（用户修正 → 回归网）
- 新增脚本 `scripts/export-fixtures.js`：把 `manualOverrides` + 降级记录导出为
  `dev/fixtures/verdicts.jsonl`（`{ host, stem, srcHash, expected: 'invert'|'keep', origin }`）。
- `test.js` 新增一组测试读取该 fixture（**存在才跑**，缺失时跳过并打印提示），断言
  `resolveAction` 对这些签名给出期望结论。
- **AC**: `node scripts/export-fixtures.js` 幂等产出；`node test.js` 在 fixture 存在时
  多跑一组且全绿；fixture 缺失时优雅跳过。

### R7 — 隐私底线（不可协商）
- 全部处理在本地完成；不得新增任何自动联网；导出仍是显式用户动作。
- **AC**: `grep -nE "fetch\(|XMLHttpRequest|navigator\.sendBeacon"` 出口与 v4.6.1 一致；
  代码级核查无新增网络调用。

## Constraints

- 校准与形状先验都必须**不进入逐元素热路径**（在决策时 O(1) 查表，聚合在空闲期做）。
- `svi:shapes` 需有容量上限（默认 500 条，LRU）与存储体积上限，防止无界增长。
- 所有新偏好默认值必须让**首日行为等价于 v4.6.1**（校准关闭阈值触发前不改判、形状先验
  只在原本就无结论时生效）。

## Acceptance Criteria（汇总）

- [ ] hits 分级 + 负反馈降级落地，单测覆盖
- [ ] 判定来源分布可见且可导出（向后兼容旧统计文件）
- [ ] 阈值自校准按阈值触发、有上限、可恢复默认
- [ ] 跨站形状先验有门（≥3 host）、只补空白、可禁用
- [ ] 导入合并契约实现 + 幂等性验证（重复导入不改权重）
- [ ] `export-fixtures.js` + `test.js` fixture 接线
- [ ] 零新增联网（代码级核查）
- [ ] 四绿门禁全绿
- [ ] 文档：README / README_EN 补数据闭环与隐私说明

## Notes

- 依赖 v5-1（规则动作扩展至 hide/mask 后，分级权重需覆盖新动作）。
- R5 的「取大不累加」是安全决策：累加会让分享的规则包变成权重放大器，需在 design.md 里
  留决策记录。
