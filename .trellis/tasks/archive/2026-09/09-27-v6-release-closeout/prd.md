# v6 发版收口：版本号重置 + 文档改写 + 发布物重建

## Goal

v6 全线（v6-1..v6-6 + v6-4/v6-5 收口）已交付归档，但产品版本号自 v5-1（提交 `48c16e5`）起
一直停在 **5.0.0**，散落在四处：脚本头 `@version`、同文件 `SCRIPT_VERSION`、
`extension/manifest.json`（构建派生）、README/README_EN 徽章与正文。

用户 2026-09-27 裁决：**版本号做一次重置**——「这些属于快速迭代，本来 1.0 出来就是个 0.01 级别的，
现在才配称 0.6」。据此本片把版本号重置为 **0.6.6**：1.0 实为 0.01 量级 ⇒ 5.0 → 0.5、
v6 线 → 0.6，且**批次号与版本号合一**（第 N 批 = `0.6.N`，本批即第 6 批 ⇒ `0.6.6`）。

随后统一真源、重建扩展与打包产物、把用户文档与 `AGENTS.md` 里的 `v6.x` 记号改写为 `0.6.x`、
重跑六绿门禁并提交推送。

**本片不发版、不打 tag、不触发 release 流水线**（用户裁决）；也不改任何产品行为。

## Requirements

### R1 版本号单一真源重置为 0.6.6

- `universal-smart-invert.user.js` 头部 `@version`（第 6 行）→ `0.6.6`。
- 同文件 `SCRIPT_VERSION`（第 43 行）→ `'0.6.6'`（`test.js:450` 硬断言二者一致，必须同改）。
- **只改这两处**；`extension/` 一律由构建产生，禁止手改。

### R2 头部元信息如实化

`@version` 之外的头部叙述仍停在 v5.0 语境（`@description` / `:zh-CN` / `:en` 三行均以
「(v5.0, AGPL-3.0 开源)」开头，正文只讲 v5 的页面治理层），需：
- 版本标识更新为 0.6.6；
- 内容如实反映 v6 线已交付能力（区域反色内核/渲染/纠正回路，默认关；UI 全量同源重构；
  扩展工程与分发），且不得宣称未交付的能力。
- 头部描述属「用户可见元信息」，故 `v5.0` 的版本标识按同一重置换算（5.0 → 0.5），
  与文档改写口径一致。

### R3 扩展产物与打包物重建

- `node scripts/gen-icons.js` → `node scripts/build-extension.js`：`extension/manifest.json`
  的 `version` 由 `@version` 派生为 `0.6.6`（`sanitizeVersion` 校验通过）。
- `node scripts/pack.js` → `dist/universal-smart-invert-extension-v0.6.6.zip`。
- 描述文本经 `clip(..., 132)` 裁剪后仍为合法 manifest（Chrome 长度限制）。

### R4 过期版本声明同步

- README.md:4 / README_EN.md:4 徽章 `version-5.0.0` → `version-0.6.6`。
- README.md:600 / README_EN.md:664「当前 **5.0.0**」→「当前 **0.6.6**」。
- PUBLISHING.md:16「当前版本 | 3.0.0」→ `0.6.6`（该项已落后三个大版本）。

### R5 文档 v6.x → 0.6.x 改写（用户裁决：全仓文档改写，范围限用户文档 + AGENTS）

**范围**：`README.md`（15 处）、`README_EN.md`（14 处）、`PUBLISHING.md`（5 处）、
`AGENTS.md`（6 处）——共 **43 处**（含 3 处裸 `v6`：README.md:111、README_EN.md:112、README_EN.md:135）。

**映射**（批次号 = 版本号）：
- `v6.N` → `0.6.N`（README.md:65/73/91/94/121/147/151/152/156/183/617 等 30 处）
- `v6-N`（批次引用）→ `0.6.N`（AGENTS.md:143、README.md:130/151/152、README_EN.md:137/167/169）
- 裸 `v6` → `0.6`
- 状态声明同时改写：`🧪 v6.0 开发中` ×3（README）/ `v6.0 in progress` ×3（README_EN）
  → 如实表述（能力已交付、默认关闭），删除「开发中/进行中」这类与已交付矛盾的措辞。

**例外（不得机械改名）**：指向**任务产物/目录**的引用。已核查此类仅 2 处
（README.md:152「v6-3 PRD」、README_EN.md:169「v6-3's PRD」），处理方式为保留可追溯的措辞
（如「按 0.6.3 批次 PRD」）+ 由 R6 的命名别名说明段兜底，而不是改成不存在的文件名。

**不改动的层**（用户裁决）：`.trellis/spec/**`（33 处）与代码注释（userscript 132 行、
scripts ~21 处）中的 `v6.x` 记号保留——它们是与任务目录名、提交信息一一对应的可追溯链条。

### R6 命名别名说明段（保追溯）

文档改写后，`0.6.N` 与仓内 `v6-N`（任务目录名、提交信息、spec 引用）成为同一批次的两种写法。
README 中英各加一段说明：**迭代批次 N 的产品版本号为 0.6.N；本仓任务目录与提交信息中仍以
`v6-N` 命名，属同一批次的别名**。这样读者既能按 0.6.x 理解版本，又能按 v6-N 检索到对应提交与文档。

### R6b 历史发布记录保留旧编号（不随重置改写）

**规模实测**：四份文档中指向**过往发布**的 `v1.x~v5.x` 引用共 **65 处**，
主体是 README / README_EN 的历史发布记录段（`## 🆕 v5.0 重大升级`、`v4.6`、`v4.5`、`v3.3`/`v3.2`/`v3.1`、
`v3.0`、`v2.0`、`v1.4.0` 等）与历史对比句（「与 v4.6 行为完全一致」「网络出口代码与 v4.6.1 逐条一致」）。

**处置**：**保留**这些历史编号，不随本次重置改写。理由：
1. 版本号重置作用于**「当前版本」这一轴**（现在的版本是 0.6.6），历史发布记录是对「当时确实以
   该编号发布过什么」的事实记载，重写即篡改记录；
2. 与通行工程实践一致（不重写既有 changelog）；
3. 追溯性由 R6 的命名别名说明段兜底。

**边界明确**：`@description` 与 README「当前 **5.0.0**」属**当前版本声明**，按 R2/R4 改为 0.6.6；
changelog 段内的 `v5.0` / `v4.6` 等属历史记录，不动。二者在同一文件内出现并不矛盾——
前者回答「现在是什么版本」，后者回答「当年发布了什么」。

> 该项为主代理在执行范围内的判断（用户裁决只覆盖 `v6.x` 的处置），已在实施前显式登记，
> 若用户否决则改为「全量重编号」，代价是重写整份 changelog（约 65 处历史叙述）。


### R7 降版本号的后果如实告知

数值上 `0.6.6 < 5.0.0`，油猴类管理器不把「新版本号更小」视作升级，已装 5.0.0 的浏览器
需**手动覆盖安装一次**。README 安装/自检章节（README.md:596-606 / README_EN.md:657-668）
需就此加一句说明。

### R8 六绿门禁（沿用既有口径，逐条实跑）

`node --check universal-smart-invert.user.js` · `node test.js` · `node test-browser.js` ·
`node test-extension.js` · `node scripts/build-extension.js` · `node scripts/pack.js`。
**不得为让门禁变绿而放宽任何断言**（AGENTS.md 硬规则）。

### R9 提交并推送

提交前六绿；提交信息说明版本号重置及其副作用；**推送到 `origin main`**（AGENTS.md：不得只提交）。

## Acceptance Criteria

- [ ] **AC1** `@version` 与 `SCRIPT_VERSION` 均为 `0.6.6`：
      `sed -n 's|^// @version *||p' universal-smart-invert.user.js` = `0.6.6`，
      `grep "const SCRIPT_VERSION"` = `'0.6.6'`，且 `git diff` 显示该文件仅动版本与描述性文本。
- [ ] **AC2** `extension/manifest.json` 的 `version` = `0.6.6`，且为 `build-extension.js` 产出
      （`git diff` 无手改痕迹；构建日志打印派生版本）。
- [ ] **AC3** `node test.js` 绿，含 `svi.version === HEADER_VERSION`（:450）与
      `export1.version === svi.version`（:657）两条断言实际执行（对照 v6.5 的轮询台账，无「闸门未走完」）。
- [ ] **AC4** `node test-browser.js` 绿，含 `manifest.version === USERSRC_VERSION`（:108）、
      file:// 页 `@version`（:1616）、版本徽章（:2421）、GM/document_start 两形态（:3644/:3679）。
- [ ] **AC5** `node test-extension.js` 绿：真扩展自验的 `getManifest().version` 与
      隔离世界 `window.__svi.version` 均等于 `0.6.6`（:424/:435）。
      **修订（依实测）**：该套件的「复访零白闪」断言为**既有偶发**（基线 HEAD 同样失败；
      受控 A/B 交替实验证明与版本号无关；`maskArmed: false` 在含基线的每次跑动都出现），
      故 AC5 降级为「**版本相关断言必须绿**（已实测），零白闪断言按既有偶发记录，不算本片回归」。
      取证见 `notes.md` §P4。
      **实测证据**：一次全通过跑动的输出中，版本断言实证在场 ——
      popup `ver="v0.6.6"`、快照 `"version":"0.6.6"`、options `verMore:"v0.6.6"`、
      站点名单 `ver="v0.6.6"`；即「版本相关断言」已绿。
- [ ] **AC6** `dist/universal-smart-invert-extension-v0.6.6.zip` 存在，`pack.js` 自检通过。
- [ ] **AC7** 四份文档（README.md / README_EN.md / PUBLISHING.md / AGENTS.md）改写完成：
      `git grep -n "v6[-.]" -- <四份>` 剩余 **恰好 4 处，且全部为登记在案的合法保留**——
      2 处既有引用（`AGENTS.md:89` spec 小节名 `§"v6.5 Additions"`；`AGENTS.md:148` 构建期标记名
      `` `v6.4-TOKENS-START/END` ``）+ 2 处 R6 别名说明里的**示例**（`README.md:602` / `README_EN.md:667`
      的 `v6-N` / `feat(v6.4-r2)`）；裸 `v6` 为 **0**。改写清单 41 处机械 + 13 处语义
      （8+7+3 减重叠）逐条落在 notes 的分类表里。
- [ ] **AC8** 未越界（实测值口径）：
      (a) `.trellis/spec/**` 的 `v6[-.]` 命中数不变（**33**）；
      (b) `scripts/*.js` 的 `v6[-.]` 命中数不变（**29 处 / 21 行**）；
      (c) 四份文档中 `v1.x~v5.x` 命中数为 **69 = 基线 65 + 别名说明新增 4**（`v1.x`/`v5.x` 各中英一份），
          `git diff` 未触碰 `## 🆕 vX.Y 重大升级` changelog 段的标题与其正文编号；
      (d) `universal-smart-invert.user.js` 只动 5 行（`@version`、`SCRIPT_VERSION`、三行
          `@description`），注释区零改动。
- [ ] **AC9** README 中英各含：命名别名说明段（R6）+ 「需手动覆盖安装一次」提示（R7）；
      且不再有「开发中 / in progress」这类与已交付矛盾的表述（附 grep 前后证据）。
- [ ] **AC10** 六绿命令逐条实跑留档；`git push` 成功（`git status` 显示与 `origin/main` 同步）。
- [ ] **AC11** 冻结契约零改动：区域掩码契约（`REGION_MASK_VERSION` = 1）、扩展 ID 公钥真源
      （`scripts/extension-key.json`）、`svi:*` 数据协议与 legacy 键均未变（diff 证明）。

## Constraints

- **只改一处真源**：`@version`；`SCRIPT_VERSION` 是同一文件的镜像常量（既有断言要求同步），
  `manifest.version` 由构建派生。任何地方手写版本号都是缺陷。
- 版本号重置与批次号合一是**用户裁决**（2026-09-27），本片不重新论证其合理性；
  但副作用（R7）必须如实落到文档。
- 文档改写的**例外必须逐条登记理由**，不得为了让 grep 归零而把任务产物引用改成不存在的名字。
- 不加 tag、不触发 release.yml、不做 CWS/CRX 发布动作。
- 不改产品代码行为；不改任何测试断言的口径（只允许因版本号变化而产生的期望值同步）。
- 不新增依赖、不引入 CDN。

## Non-goals

- 不在本片处理 `pendingMask.armed` 复访观察（另立任务）。
- 不改写 `.trellis/spec/**` 与代码注释中的 `v6.x` 记号（用户裁决保留）。
- 不补齐 CRX 本地签名产物（本轮无发布动作）。
- 不重命名既有任务目录（`09-25-v6-*` 等保持原名）。

## 裁决记录

| 日期 | 裁决点 | 结论 | 提出者 |
| :--- | :--- | :--- | :--- |
| 2026-09-27 | 本轮方向 | v6 发版收口 | 用户 |
| 2026-09-27 | 是否建 Trellis 任务 | 建任务并先做计划 | 用户 |
| 2026-09-27 | 版本号是否重置 | **重置**（「1.0 出来就是个 0.01 级别的，现在才配称 0.6」） | 用户 |
| 2026-09-27 | 本轮边界 | 只做收口，**不打 tag 不发版** | 用户 |
| 2026-09-27 | 规划评审门 | 通过，允许执行 | 用户 |
| 2026-09-27 | 既有 `v6.x` 记号如何处置 | **文档改写为 0.6.x**（原「保留 + 说明段」方案被否决） | 用户 |
| 2026-09-27 | 发布号与批次号对齐 | **发布号 0.6.6**，批次号 = 版本号（第 N 批 = 0.6.N），两轴合一 | 用户 |
| 2026-09-27 | 改写范围 | 用户文档（README 中英 + PUBLISHING）+ AGENTS.md；spec 与代码注释保留 | 用户 |
| 2026-09-27 | 历史发布记录（v1.x~v5.x 共 65 处）是否随重置重编号 | **保留旧编号**，只改「当前版本」轴与 v6 线记号（R6b） | 主代理判断，实施前登记待用户确认 |
| 2026-09-27 | 门禁 4（`test-extension.js`）既有偶发如何处置 | **待裁决**（本片未引入；取证：基线同样失败 + 受控 A/B 交替实验证明与版本号无关） | 待用户 |
| 2026-09-27 | 门禁 4 的零白闪机制缺陷是否单开任务 | **建议单开**（journal 已连续三轮登记，`maskArmed: false` 每次复现） | 待用户 |

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- 本片为**多文件同步 + 文档改写**类任务：无新架构、无新契约，故 `design.md` 只记录联动图、
  重置语义（含「批次号 = 版本号」的后果）与验证方法，`implement.md` 承载有序清单与回滚点。
