# rules/ — 机器生成规则库 (勿手改)

本目录全部文件由脚本**整文件再生**，任何手改都会被下次生成覆盖——这是"一键合并零冲突"的
基础：产物永远干净，git 合并/PR 永不冲突。

## 文件

| 文件 | 生成命令 | 用途 |
| --- | --- | --- |
| `svi-rule-library.json` | `node scripts/export-rule-library.js` | 内置种子规则参考库 (BUILTIN_RULES 全量快照) |
| `darkreader-compat.json` | `node scripts/sync-darkreader.js` | Dark Reader 上游兼容数据 (含来源与 AGPL 声明) |
| `darkreader-compat.import.json` | 同上 | **一键合并**: 设置 → 数据与备份 → 导入并合并 |

## 一键合并 Dark Reader 兼容名单

`darkreader-compat.import.json` 是 `svi-rules` 信封 (dark-sites → `siteBlacklist` 种子)：

1. 打开 设置 → 💾 数据与备份 → **导入并合并**；
2. 选择本文件——数组按契约去重，重复导入幂等，绝不产生重复项或冲突；
3. 导入后自动 `savePrefs → 清缓存重扫`，站点电源随即热生效。

## 上游同步

CI 每日定时运行 `scripts/sync-darkreader.js`（见 `.github/workflows/upstream-sync.yml`），
上游有变更时自动开 PR——文件全量再生，**直接点合并即可，永不冲突**。

## 许可证

Dark Reader 上游数据为 AGPL-3.0；本项目自 v4.1.0 起为 AGPL-3.0-or-later，兼容。
来源声明内嵌于每个生成文件的 `source` 字段。
