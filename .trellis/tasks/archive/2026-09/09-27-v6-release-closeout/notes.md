# notes.md — 执行留证（v6 发版收口）

> 本文件承载 `implement.md` 各阶段要求的证据：基线快照、改写分类表、门禁输出、负向对照、审计清单。

## P0.1 检索先行证据（全局 §1 双通道）

| 通道 | 动作 | 结果 |
| :--- | :--- | :--- |
| 一 · WebSearch | `WebSearch "userscript library version number reset downgrade tampermonkey auto-update comparison semver"` | **失败**——本地代理路由（deepseek-v4.1-flash）报 `Thinking mode does not support this tool_choice`，该通道在本会话不可用 |
| 一′ · WebFetch | 尝试取 Tampermonkey 文档页 | 失败：`Unable to verify if domain is safe to fetch`（网络限制） |
| 二 · GitHub API | `curl api.github.com/search/repositories?q=tampermonkey+userscript+version+compare` | 0 命中（查询过窄） |
| 二 · GitHub API（放宽） | `curl api.github.com/search/repositories?q=userscript+manager&sort=stars` | **193 命中**；头部：`Tampermonkey/tampermonkey` 5759★、`quoid/userscripts` 4802★、`shenruisi/Stay` 1311★ |
| 二′ · 权威文档直取 | `curl https://violentmonkey.github.io/api/metadata-block/` | **命中关键原文**：`@version` — "can be used to check if a script has new versions. It is composed of several parts, joined by `.`… (although these aren't used for version comparison). Note: If no `@version` is specified, the script will not be updated automatically." |

**结论**：版本比较按**数字段**进行、`@version` 是更新判据——佐证 R7「数值下降（0.6.6 < 5.0.0）
不被视作有新版本，需手动覆盖安装一次」。本片无需引入任何第三方工具（纯仓内同步工作）。

## P0.2 基线快照（`HEAD = 3cb23b4`，`git status` 仅任务目录未跟踪）

| 快照 | 命令 | 基线值 | 目标值（改后） |
| :--- | :--- | :--- | :--- |
| 版本声明 `5.0.0` | `git grep -n "5\.0\.0" -- . ':!extension' ':!.trellis'` | **13 行**（6 声明 + 7 历史对比/注释） | 声明处全改，历史对比处保留 |
| 四份文档 `v6` 记号 | 见下分类表 | **43**（dotted 30 + dashed 10 + bare 3） | **0** |
| 其中 README.md | | dotted 11 / dashed 4 / bare 1 = 16 | 0 |
| 其中 README_EN.md | | dotted 10 / dashed 4 / bare 2 = 16 | 0 |
| 其中 PUBLISHING.md | | dotted 5 / dashed 0 / bare 0 = 5 | 0 |
| 其中 AGENTS.md | | dotted 4 / dashed 2 / bare 0 = 6 | 0 |
| 历史发布记录 `v1.x~v5.x` | `git grep -oh "v[1-5]\.[0-9.]*" -- <四份>` | **65** | **65（不变，R6b）** |
| `.trellis/spec/**` `v6[-.]` | `git grep -o` | **33** | **33（不变）** |
| `scripts/*.js` `v6[-.]` | `git grep -o` | **29 处 / 21 行** | **不变** |
| userscript 含 `v6[-.]` 的行 | `grep -c` | **132 行** | **不变**（注释区零改动） |
| 状态声明 | `git grep -n "开发中\|in progress" -- README.md README_EN.md` | **6** | **0** |

## P0.3 基线绿

```
node --check universal-smart-invert.user.js   → OK
node test.js                                  → ✓ All unit, benchmark, multi-light-color,
                                                  and v2.0 site-engine tests passed successfully!
```

## P3 改写分类表

**改前清单命令**（可复现）：`git grep -n "v6[-.]"` + `git grep -nE "v6[^-._0-9]"`（四份文档），
合计 **43 条**。**改后**剩余 4 条（见「例外」），裸 `v6` 归零。

### 分类统计

| 分类 | 条数 | 处置 | 说明 |
| :--- | ---: | :--- | :--- |
| 批次引用（含 0.6.x 伞标） | 30 | 改 `v6.N`/`v6-N` → `0.6.N`，伞标 `v6.0` → `0.6` | 例：`（v6.6 补充）`→`（0.6.6 补充）`；`v6-2 渲染`→`0.6.2 渲染` |
| 状态声明 | 6 | 改写为如实表述 | README:121/156/183、README_EN:125/173/206 的 `开发中`/`in progress` |
| 裸 `v6` | 3 | → `0.6` | README:111、README_EN:112、README_EN:135 |
| 例外（不改名） | 4 | 保留原文 + 加括注 | 见下 |
| **合计** | **43** | | |

### 例外逐条（4 处，全部保留原名并加括注）

| # | 位置 | 原文 | 性质 | 处置 |
| :--- | :--- | :--- | :--- | :--- |
| E1 | `README.md:152` | `按 v6-3 PRD 已列明的面板项` | 指向**任务产物**（真实文件在 `.trellis/tasks/archive/2026-09/09-25-v6-region-correction/prd.md`） | 改措辞不改名 → `按 **0.6.3 批次**的 PRD 已列明的面板项` |
| E2 | `README_EN.md:169` | `the panel items v6-3's PRD had already specified` | 同上 | → `the panel items the 0.6.3 batch's PRD had already specified` |
| E3 | `AGENTS.md:148` | `` `v6.4-TOKENS-START/END` `` | **代码契约标记名**（`universal-smart-invert.user.js:3898/3953` 实标记，`build-extension.js:260` 依赖它抽块） | 保留原名，加括注「a build-time marker name, not renamed by the version reset」 |
| E4 | `AGENTS.md:89` | `§"v6.5 Additions"` | **spec 小节名**（`.trellis/spec/frontend/quality-guidelines.md:779` 实标题；spec 按用户裁决不改名） | 保留原名，加括注「a spec section title — not renamed by the version reset」 |

> E3/E4 是**执行中才发现的**（PRD 原只登记了 E1/E2 两条任务产物引用）。二者都不是版本声明，
> 机械改名会打断代码/文档的真引用，故按 R5 的「例外必须逐条登记理由」处理并回填 PRD AC7。

### 语义改写（机械替换之外，13 处）

| 文件 | 处数 | 内容 |
| :--- | ---: | :--- |
| README.md | 8 | 3 处章节标题（`0.6 系列 · …（0.6.N 已交付）`）、伞标句 `0.6.0 的第一片`→`0.6 的第一片（0.6.1）`、状态 blockquote 去「本阶段」、E1、FAQ 第 2 条加降级提示、新增 §6 版本号说明段 |
| README_EN.md | 7 | 同上英文版 + E2 |
| AGENTS.md | 3 | 伞标 `0.6.0`→`0.6`、E4、E3 |

### 保留清单（R6b：不随重置改写）

命令：`git grep -oh "v[1-5]\.[0-9.]*" -- <四份> | wc -l`

| 项 | 基线 | 改后 | 说明 |
| :--- | ---: | ---: | :--- |
| 历史发布记录 / 历史对比 | 65 | **69** | 差额 +4 = 新增 §6 版本号说明段里的 `v1.x`/`v5.x`（中英各 2 处）；既有 65 处**一处未动**（含 `## 🆕 v5.0 重大升级`、`## 🆕 v4.6 …`、`## 🆕 v2.0 …` 等 changelog 段标题） |
| `5.0.0` 残留（四份文档） | 2 | **2** | `README.md:145` / `README_EN.md:159`「与 v5.0.0 行为完全一致」——历史对比句，按 R6b 保留 |

### 新增内容（R6 / R7）

- README.md 新增 §6「🔢 版本号说明（0.6.6 起编号重置）」（原 FAQ 顺延为 §7），含三条：
  两种写法指同一件事（`0.6.N` ↔ `v6-N` 别名）、重置只作用于当前版本号（历史记录保留）、
  降级不会自动更新。
- README_EN.md 新增对应 §6 / §7。
- FAQ 第 2 条（自动更新静默失败）补一句：编号重置前装的老版本（如 `5.0.0`）不会被自动升级，
  需手动覆盖安装一次。


## P4 门禁与负向对照

### 六道门禁实测（最终态）

| # | 命令 | 结果 | 备注 |
| --- | :--- | :--- | :--- |
| 1 | `node --check universal-smart-invert.user.js` | ✅ | |
| 2 | `node test.js` | ✅ 2/2 绿（exit 0） | 见下「行尾陷阱」：修复前曾连红 3 次 |
| 3 | `node test-browser.js` | ✅ 2/2 绿（33 场景全过） | 最终态首跑曾红 1 次（未捕获断言名），随后 2 次全绿 → 偶发；疑似紧接重建/打包与多轮 Chrome 启动的资源竞争 |
| 4 | `node test-extension.js` | ⚠️ **既有偶发，非本片引入**（见下） | 零白闪断言时红时绿 |
| 5 | `node scripts/build-extension.js` | ✅ 派生 `version: 0.6.6` | |
| 6 | `node scripts/pack.js` | ✅ `dist/universal-smart-invert-extension-v0.6.6.zip`，CRC OK | |

### 门禁 4（`test-extension.js`）的归因取证

**现象**：复访「零白闪」断言间歇失败，失败时逐图打印 `firstAt` 与 `frames`；
站点门输出恒为 `"armed": true, …, "maskArmed": false`。

**归因三步**：

1. **基线对照**（`git stash` 回到原始 HEAD `3cb23b4`、零改动）：**同样失败**
   （`light4 firstAt=93.5ms`），另一次跑动通过 → 基线本身 1 红 1 绿。
2. **受控 A/B 交替实验**（唯一变量 = 版本号字符串，其余代码逐字节相同；交错跑动以抵消负载漂移）：

   | 样本 | 结果 |
   | :--- | :--- |
   | B = `5.0.0` #1 | 复访零白闪 ✓ |
   | A = `0.6.6` #1 | ❌（light1-4 各 10 帧裸奔） |
   | B = `5.0.0` #2 | ❌ 另一类：`TypeError: Cannot read properties of null (reading 'classList')`（harness 级） |
   | A = `0.6.6` #2 | 复访零白闪 ✓ |

   **A/B 各有红有绿** ⇒ 版本号不是成因；且红的形式不止一种（含 harness 级错误）。
3. **机制耦合排除**：`SCRIPT_VERSION` 只喂标签/快照/导出载荷，不进首屏反色路径；
   `Store` 的「版本旁路键」是 `svi:<逻辑键>.rev` = **写入时刻毫秒时间戳**
   （`universal-smart-invert.user.js:352`），与版本字符串无关。

**结论**：`test-extension.js` 的零白闪断言是**既有偶发缺陷**，正是 journal 连续三轮登记的
「复访时门判可武装但 `pendingMask.armed` 实测 false —— 零白闪靠引导快而非遮罩生效」。
`maskArmed: false` 在**每一次**跑动（含基线）都出现 ⇒ 机制层的前置条件从未满足，
该断言只是「引导足够快时侥幸为真」。**与本次版本号重置无因果关系。**

### 负向对照 NC-A / NC-B

| 对照 | 注入 | 预期 | 实测 |
| :--- | :--- | :--- | :--- |
| NC-A | `SCRIPT_VERSION = '9.9.9'`（与 `@version` 不一致） | `test.js` 变红并指名 | ✅ `AssertionError: script version must track the @version header`，exit 1 |
| NC-B1 | `@version beta`（无数字） | 构建失败 | ✅ `ERROR: cannot derive an MV3 version from @version "beta"` |
| NC-B2 | `@version 0.6.beta` | PRD 原预期「构建失败」 | ❌ **预期不成立**：`sanitizeVersion` 剔除非数字并去首尾点 → 归一为 `0.6`，构建**成功** |

**NC-B2 的更正**：`sanitizeVersion` 是**宽容归一**而非严格校验，因此 `@version 0.6.beta` 会产出
`manifest.version = "0.6"` 而头部写着 `0.6.beta` —— 二者不一致**由 CI/发版冒烟的
`manifest.version === @version` 断言兜住**（`.github/workflows/ci.yml:49-51`、`release.yml:75-77`），
不是由构建拦。此结论已回填 design §5。

### 本机行尾陷阱（花了真实调试时间，必须沉淀）

**现象**：`test.js` 一度连红 3 次，报 `R1b: 必须能定位 UIController 类体`，随后又报
`R1: extension/popup.html 里的 token 块必须与用户脚本逐字节一致`。

**根因**：
- 本仓 blob 实为 **CRLF**（`git cat-file -p HEAD:universal-smart-invert.user.js` 逐行含 `\r`），
  而本机 `core.autocrlf=true`、且无 `.gitattributes` 文本规则；
- **任何让 git 触碰工作区文件的操作（`git stash pop` / `git checkout`）都会把文件重写成 CRLF**；
- `test.js:5278` 的源码扫描正则 `/class UIController \{([\s\S]*?)\n  \}\n/` 要求 `}` 后**紧跟** `\n`
  —— CRLF 下多出的 `\r` 使其失配；
- 归一化为 LF 后若不重建 `extension/`，`popup.html` 里构建期注入的 token 块仍是 CRLF 版，
  与 LF 源逐字节比对再次失配。

**正确配方**：工作区文本文件归一到 **LF** → **重新** `gen-icons` + `build-extension` + `pack`
→ 再跑门禁。（`git diff` 在两种行尾下都归一化为**内容级**差异，故提交本身不含行尾噪音。）


## P5 评审门证据

（执行后填写）
