# Design: v5-3 数据闭环

## 1. 边界

**做**：让已采集的四份数据（`learned` / `corrections` / `timeline` / `stats`）真正回读进决策与面板。

**不做**：任何自动联网 / 云端聚合（R7 底线）；不改 v5-1 Registry 契约的形状；不引入重依赖。

## 2. 现状（已核查）

| 键 | 内容 | 当前消费方 |
| :--- | :--- | :--- |
| `svi:learned` | `{host:{rules:[{stem,action,hits,lastAt}]}}` | `RuleLearner.activeRules` —— **布尔门 `hits>=learnHits`** |
| `svi:corrections` | v5-2 新落地：`falseInvert/falseKeep + perSrc/perStem` | **仅哨兵提示** |
| `svi:timeline` | 视频反色段落 | `TimelineLearner`（已闭环） |
| `svi:stats` | 计数器 + 200 条 log | **只展示** |

症结：`hits` 只做"够不够 2 次"的布尔门，第 2 次与第 50 次**完全等价**。

## 3. 关键决策

### D-1 hits 分级：**PRD 的「(现状语义)」注释是错的**，故默认关

PRD R1 写「弱 `hits ∈ [learnHits,5)`：只能覆盖像素结论（**现状语义**）」。
**核查后该注释不成立**：现状是 `learned` 排在种子规则**之前**，即学习规则**能**压过种子
（`SOURCES` 顺序 `learned → seedProtect → faviconSkip → seedForceInvert`）。

因此"分级"必然是一次**行为变更**（把弱规则从种子前挪到种子后）。处理：

- 新增开关 `learnGrading`（**默认关** = 现状语义不变）；开启后来源表变为
  `learnedStrong → seedProtect → faviconSkip → seedForceInvert → learnedWeak`，
  弱规则仍在**所有种子之后、像素门之前**，恰好实现"只能覆盖像素结论"。
- **零回归**由"默认关 + 来源表按开关过滤"保证：关时表内容与 v5-1 完全一致。

### D-2 负反馈降级（默认开）

规则命中元素后若被用户手动覆盖 → `hits` 归 1 并记 `demotedAt`；连续 2 次 → 标记
`disabled`（保留在列表可见，可手动恢复）。这是**只减少错误自动化**的方向，故默认开。

判定"规则命中后被覆盖"需要在手动覆盖时知道是哪条规则命中的：
在 `SOURCES.learned` 命中时把 `rule.stem` 记到元素的 `data-svi-rule-stem`（**唯一新增属性**，
仅在学习规则命中时写入，且仅当 `learnDemote` 开）。手动覆盖时读它 → 降级该规则。

### D-3 阈值自校准：**只自动收紧，放松需手动**

PRD R3 说"阈值自校准 → 自动收紧/放松"。实现改为：

- **收紧**（减少误反，用户的核心痛点）→ **自动**应用为**站点覆盖**（`siteOverrides[host]`），
  可见、可一键恢复默认；
- **放松**（增加反色，会在用户没要求时多反色）→ **只计算并展示**，需点一下才应用。

理由：这两侧的风险不对称。收紧错了只是少反几张（用户能再 Alt+点击），放松错了会在
用户没要求时把东西反过来 —— 正是本项目一贯避免的"自动化绑架用户"。

另：`resolveSiteProfile` 目前**不读**站点级阈值覆盖，需要新增三个字段的透传
（`whiteThreshold` / `lumThreshold` / `imgTolerance`）。

### D-4 形状泛化：档位在**规则段末尾**，默认关

PRD R4 要求"仅在像素证据缺失时生效"。**按现有管线这是做不到的** —— `rule` 段在像素分析
之前，凡是在该段出结论就必然抢在像素前。诚实处理：

- 形状先验作为来源表**最后一条**（`stage:'rule'` 末尾），只被 `state.shapePrior`（默认关）启用；
- 开启时的语义是"**在种子之后、像素之前**做一个保守的兜底判断"，**不是** PRD 写的
  "像素缺失时才生效"。这句差异写进 README 与面板提示，不假装等价。
- 形状**记录、面板展示、导出**始终可用（不需要开启先验）。

### D-5 导入合并：取大不累加

同 `host+stem`：`action` 一致 → `hits = max(a,b)`；不一致 → 保留 hits 高者（等则留本地）。
形状先验计数取 `max`，host 集合并集。

理由：累加会让一份分享的规则包变成**权重放大器** —— 反复导入同一文件即可把某条规则刷成强规则。

### D-6 反哺 CI

`scripts/export-fixtures.js` → `dev/fixtures/verdicts.jsonl`（`{host,stem,srcHash,expected,origin}`）。
`test.js` 在 fixture 存在时多跑一组断言 `resolveStage` 对这些签名的结论；缺失时打印提示并跳过。

## 4. 契约

| 契约 | 形状 | 消费方 |
| :--- | :--- | :--- |
| `RuleLearner.ruleStrength(rule)` | `'weak' \| 'strong' \| 'disabled'` | 面板 / 来源表过滤 |
| `RuleLearner.demote(host, stem)` | 记一次负反馈 | 手动覆盖路径 |
| `calibrate.suggest(host)` | `{direction:'tighten'\|'loosen', step, samples, reason}` | 面板 / 自动收紧 |
| `shapeSignature(el)` | 稳定字符串签名 | `svi:shapes` / 面板 / 导出 |
| `mergeRulePack(local, incoming)` | 合并后对象（纯函数） | 导入 |
| 新存储键 | `svi:shapes` | — |

## 5. 回滚

1. 功能级：`learnGrading=false`（默认）、`shapePrior=false`（默认）、`calibrateAuto=false`
   → 回到 v5-2 行为。
2. 代码级：单提交 revert。
3. 数据级：`svi:shapes` / `svi:calibrations` 可直接删。
