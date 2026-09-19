# rules/ — 机器生成规则库 (勿手改)

本目录全部文件由脚本**整文件再生**，任何手改都会被下次生成覆盖——这是"一键合并零冲突"的
基础：产物永远干净，git 合并/PR 永不冲突。

## 文件

| 文件 | 生成命令 | 用途 |
| --- | --- | --- |
| `svi-rule-library.json` | `node scripts/export-rule-library.js` | 内置种子规则参考库 (BUILTIN_RULES 全量快照) |
| `darkreader-compat.json` | `node scripts/sync-darkreader.js` | Dark Reader 上游兼容数据 (含来源与 AGPL 声明) |
| `darkreader-compat.import.json` | 同上 | **一键合并**: 设置 → 数据与备份 → 导入并合并 |
| `svi-pack.import.json` | `node scripts/export-rules-pack.js` | **一体化分发包**: Dark Reader 暗色名单 + 内置适配的可翻译子集 (元素级规则 / 本站覆盖) |

## 一键合并 Dark Reader 兼容名单

`darkreader-compat.import.json` 是 `svi-rules` 信封 (dark-sites → `siteBlacklist` 种子)：

1. 打开 设置 → 💾 数据与备份 → **导入并合并**；
2. 选择本文件——数组按契约去重，重复导入幂等，绝不产生重复项或冲突；
3. 导入后自动 `savePrefs → 清缓存重扫`，站点电源随即热生效。

## 一体化分发包 (v4.5)

`svi-pack.import.json` 把**一大堆规则**合成一个文件，三种导入方式任选：

1. 设置 → 💾 数据与备份 → **导入并合并** (选择文件)；
2. 设置 → 💾 数据与备份 → **从链接导入** (填指向该文件的 URL，GM 通道绕开页面 CSP)；
3. 维护者把文件挂到任意静态托管/Gist，用户订阅链接即可。

包内含：`siteBlacklist` (上游暗色名单) + `siteOverrides` (内置站点的 bgReplace/excludeSelectors)
+ `elementRules` (内置 forceInvert/protect 选择器的元素级翻译)。`bgImageSelectors` 为
BgImageEngine 专属字段、元素级规则无法等价表达，不进包——内置规则随脚本本体分发。

## 学习成果分享 (v4.5)

设置 → 💾 数据与备份 → **导出学习成果**：只含 `learned` (host → 特征/动作/命中数)，
不含浏览历史与 URL，可安全分享；接收方经 **导入并合并** 合入 (同特征保留命中更高者)。
这是"收集数据 → 改进插件"的分发末端：个人修正积累 → 小包分享 → 维护者择优转正为内置规则。

## 上游同步

CI 每日定时运行 `scripts/sync-darkreader.js`（见 `.github/workflows/upstream-sync.yml`），
上游有变更时自动开 PR——文件全量再生，**直接点合并即可，永不冲突**。

## 许可证

Dark Reader 上游数据为 AGPL-3.0；本项目自 v4.1.0 起为 AGPL-3.0-or-later，兼容。
来源声明内嵌于每个生成文件的 `source` 字段。
