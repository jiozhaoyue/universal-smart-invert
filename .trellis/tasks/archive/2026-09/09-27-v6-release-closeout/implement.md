# implement.md — v6 发版收口执行计划

> 复选框**随执行实时勾选**，不允许事后凭记忆批量补勾（AGENTS.md 计划先行铁律）。
> 每阶段末尾有验证命令与回滚点；阶段退出条件不满足不得进入下一阶段。

## 阶段 P0 — 前置（检索门禁 + 基线取证）

- [x] P0.1 **满足检索先行硬规则**（全局 §1）：本会话尚未发起任何检索，而后续全部为改文件操作，
      会被 search-gate hook 拦截。发起一次真实检索并记录命中（通道二即 GitHub API：
      `gh search repos "userscript version reset"` 或 `curl api.github.com/search/repositories?q=...`），
      目的：确认「版本号重置（降版本号）」在实践中是否有既有惯例/注意事项可借鉴。
      → 已做：WebSearch 通道被本地代理拒绝（thinking 模式不支持该 tool_choice）、WebFetch 域名校验受阻；
      GitHub API 通道 193 命中；Violentmonkey 文档原文佐证 `@version` 按数字段比较、是更新判据。
      详见 `notes.md` §P0.1。
- [x] P0.2 基线取证（改前快照，全部落任务 notes）：
      - `git rev-parse HEAD`、`git status --short`（应为干净）
      - `git grep -n "5\.0\.0"`（版本声明处清单）
      - `git grep -n "v6[-.]" -- README.md README_EN.md PUBLISHING.md AGENTS.md`（**应为 40 条**）
        + `git grep -n "v6[^-._0-9]" -- <同上>`（裸 v6，**应为 3 条**）⇒ 合计 43 条待改写
      - `git grep -oh "v[1-5]\.[0-9.]*" -- <同上> | wc -l`（历史引用，**应约 65 条**，R6b 保留对象）
      - `git grep -c "v6[-.]" -- .trellis/spec`（**应 33**）、`scripts/*.js`（**应 ~21**）、
        `universal-smart-invert.user.js`（**应 132**）——三处**改后必须不变**
      - `git grep -n "开发中\|in progress" -- README.md README_EN.md`（状态声明，**应 6 条**）
      → 实测：HEAD=3cb23b4、status 仅任务目录未跟踪；43=30+10+3 ✓；历史 65 ✓；spec 33 ✓；
      scripts **29 处/21 行**（比预估多，按 29 计）；userscript 132 行 ✓；状态声明 6 ✓。详见 `notes.md` §P0.2。
- [x] P0.3 复核门禁当前为绿（改动前基线绿），避免把既有红色算到本片头上：
      `node --check universal-smart-invert.user.js` → `node test.js`
      → 均通过，`test.js` 收尾为 `✓ All unit, benchmark, multi-light-color, and v2.0 site-engine tests passed successfully!`

**阶段退出**：检索已发起（有输出即为满足）+ 六份快照落 notes + 基线绿。

## 阶段 P1 — 版本号真源重置（R1/R2）

- [x] P1.1 `universal-smart-invert.user.js:6` `@version 5.0.0` → `0.6.6`
- [x] P1.2 同文件 `:43` `SCRIPT_VERSION = '5.0.0'` → `'0.6.6'`（**必须与 P1.1 同提交**）
- [x] P1.3 头部 `@description` / `@description:zh-CN` / `@description:en` 三行如实化：
      版本标识 → `0.6.6`（属「当前版本声明」）；能力叙述补入 v6 线已交付项
      （区域反色默认关 / UI 全量同源 / 扩展工程与分发）；**不得宣称未交付能力**；
      描述内的历史叙述（如「v5.0 把插件扩为…」）按 R6b 保留旧编号
      → 已改：三行均以 `(0.6.6, AGPL-3.0 开源)`/`(0.6.6, AGPL-3.0 licensed)` 起，
      能力段改写为「视频/图片/背景图/Canvas 智能反色，判定以连通区域为单位；0.6 线新增区域反色、
      界面全量同源重构与扩展形态」，历史段保留 v5.0/v4.6 编号（R6b）。该文件共动 5 行。
- [x] P1.4 注意 `build-extension.js` 的 `MAX_DESCRIPTION = 132` 裁剪：改写后跑构建，
      确认 `manifest.description` 仍为完整可读句（裁剪点落在词边界、不截半句）
      → 首次构建裁到 `…、界面全量同源重构`（半句），遂调整主 `@description` 的空白分布，
      现裁剪为 **116 字符、结尾「。」**（`git grep` 证据见 `notes.md` §P1）。

**验证**：`sed -n 's|^// @version *||p' universal-smart-invert.user.js` 输出 `0.6.6`；
`node --check universal-smart-invert.user.js` 通过；该文件 `git diff` 只含版本 2 行 + 头部描述。
**回滚点**：`git checkout -- universal-smart-invert.user.js`。

## 阶段 P2 — 构建产物重建（R3）

- [x] P2.1 `node scripts/gen-icons.js`
- [x] P2.2 `node scripts/build-extension.js` → 日志应打印派生版本 `0.6.6` 与 description 裁剪信息
      → 实测输出 `[build-extension] version : 0.6.6`；description 裁剪至 116 字符
- [x] P2.3 `node scripts/pack.js` → `dist/universal-smart-invert-extension-v0.6.6.zip`
      → 实测 `[pack] verified: central directory parses, 12 entries, stored-mode, CRC OK`
- [x] P2.4 核对 `extension/manifest.json` 的 `version` = `0.6.6`，且 `extension/` 的改动**只来自构建**
      （`content.js` 中只应有版本相关行的变化，无手工编辑痕迹）
      → 实测 `git diff --stat extension/`：仅 `content.js` 与 `manifest.json` 各 **2 行**
      （`Source version` / `SCRIPT_VERSION` / `version` / `description`）；其余构建产物零 diff

**验证**：`node -p 'require("./extension/manifest.json").version'` = `0.6.6`；zip 在场。
**回滚点**：`git checkout -- extension/` + 重跑 P2.2。

## 阶段 P3 — 文档同步与改写（R4/R5/R6/R6b/R7）

- [x] P3.1 徽章：`README.md:4`、`README_EN.md:4` `version-5.0.0` → `version-0.6.6`
- [x] P3.2 当前版本声明：`README.md:600`、`README_EN.md:664` → `0.6.6`
- [x] P3.3 `PUBLISHING.md:16`「当前版本 | 3.0.0」→ `0.6.6`
- [x] P3.4 状态声明 6 处 → 如实表述（保留「默认关闭」的事实陈述，删除「开发中/进行中」）：
      `README.md:121` / `:156` / `:183`；`README_EN.md:125` / `:173` / `:206`
      → 改为「0.6 系列 · 自动部分反色 —— 判定内核／渲染层／纠正与自校准（0.6.N 已交付）」，
      `in progress` 英文版同步；`开发中|in progress` 实测归零
- [x] P3.5 **批次引用改写 41 处**（43 减去下面 2 处例外）：`v6.N` → `0.6.N`、`v6-N` → `0.6.N`、
      裸 `v6` → `0.6`。逐条落在 notes 的分类表中（版本声明 / 状态声明 / 批次引用）
      → 实测 38 处点/横 + 3 处裸 v6 = 41，与预期一致
- [x] P3.6 **例外 2 处按「改措辞不改名」处理**：`README.md:152`、`README_EN.md:169` 的
      `v6-3 PRD` / `v6-3's PRD` → 「0.6.3 批次的 PRD」/「the 0.6.3 batch's PRD」，
      不得写成看似真实文件名的形式 → 已改
- [x] P3.7 **命名别名说明段**（R6 / design §2.1）：README 中英各加一段，位置选在版本声明附近
      → 新增「### 6. 🔢 版本号说明（0.6.6 起编号重置）」（原 FAQ 顺延为 §7），
      含「两种写法指同一件事 / 重置只作用于当前版本号 / 降级不会自动更新」三条
- [x] P3.8 **降版本号提示**（R7）：FAQ 第 2 条补「编号重置前装的老版本（如 `5.0.0`）不会被自动升级，
      需手动覆盖安装一次」
- [x] P3.9 **不改历史**（R6b）：四份文档中 `v1.x~v5.x`（基线 65 处）**一处未动**；
      实测改后 69 = 65 + 别名说明新增 4，差额已在 notes 说明

**验证（实测）**：
- `git grep -n "v6[-.]" -- <四份>` → **4 处**，全部为登记例外（2 处既有引用 + 2 处别名示例）
- `git grep -nE "v6" | grep -v "v6[-.]"` → **0**（裸 v6 归零）
- `v[1-5].[0-9.]*` → **69**（历史未被误伤）
- `开发中|in progress` → **0**
- 机械替换脚本对每处 `old` 断言「恰好命中 1 次」，任一不符即整脚本失败退出（本次全过）
**回滚点**：`git checkout -- README.md README_EN.md PUBLISHING.md AGENTS.md`。

## 阶段 P4 — 门禁与负向对照（R8）

- [x] P4.1 六绿逐条实跑并留输出：`node --check universal-smart-invert.user.js` · `node test.js` ·
      `node test-browser.js` · `node test-extension.js` · `build-extension.js` · `pack.js`
      → 1 ✅ / 2 ✅2-2 / 3 ✅2-2（33 场景） / 4 ⚠️**既有偶发** / 5 ✅ / 6 ✅；详见 `notes.md` §P4
- [x] P4.2 检查 `node test.js` 输出无「轮询未走完」告警（v6.5 闸门），确认绿是真绿
      → exit 0 即台账自检通过（未走完会 exit 1 并点名）；连跑 2 次均 exit 0
- [x] P4.3 **负向对照 NC-A**：临时把 `SCRIPT_VERSION` 改成 `9.9.9`（与 `@version` 不一致），
      预期 `node test.js` **变红**并指名该断言；随后还原
      → ✅ `AssertionError: script version must track the @version header`，exit 1；已还原
- [x] P4.4 **负向对照 NC-B**：临时把 `@version` 改为 `0.6.beta`，预期 `build-extension.js`
      **报错退出**（`sanitizeVersion` 校验）；随后还原
      → **预期不成立（已更正）**：`0.6.beta` 被 `sanitizeVersion` 归一为 `0.6`、构建**成功**；
      改用 `@version beta`（无数字）后如预期报 `ERROR: cannot derive an MV3 version`。
      结论：该函数是**宽容归一**而非严格校验，`@version` 与 `manifest.version` 的不一致由
      CI/发版冒烟的等值断言兜住（非构建）。已回填 design §5
- [x] P4.5 对照还原后 `git diff` 证明工作区只余本片**应有**的改动（无残留探针）
      → 用户脚本 5/5 行；四份文档内容级；`extension/` 仅 content.js + manifest.json 各 2 行

**阶段退出**：六绿全过 + 两个负向对照均如期失败 + 还原干净 + 三份「不变」计数（spec 33 / 脚本 29 /
userscript 132）核对一致。任一不成立即视为未完成，回到对应阶段定位（**不得放宽断言换绿**）。
**实测偏差**：门禁 4 未达成「全过」——经基线对照 + 受控 A/B 证明为**既有偶发**（非本片引入），
且两个负向对照其中一个的**预期本身有误**（已更正并回填）。两者均已在 notes 留证，
提交与否按 P5.1 评审门由用户裁决。

> **行尾陷阱（本机特有，已沉淀到 notes §P4）**：`git stash pop` / `git checkout` 会按本机
> `core.autocrlf=true` 把工作区文本重写成 CRLF，导致 `test.js` 的源码扫描正则失配
> （`R1b: 必须能定位 UIController 类体`）与 token 块逐字节断言失配（`R1: … token 块必须与
> 用户脚本逐字节一致`）。修复配方：文本文件归一为 LF → **重新**构建 `extension/` → 再跑门禁。

## 阶段 P5 — 评审门与提交（R9）

- [ ] P5.1 **评审门 G**：把最终产物呈用户过目：`git diff --stat`、四份文档的改写摘要、
      43 条分类表、65 条保留清单；**特别请用户确认 R6b**（历史发布记录保留旧编号）——
      该项为主代理判断，若否决则须改为全量重编号（大 diff）
- [ ] P5.2 提交：信息格式 `release(0.6.6): 版本号重置 5.0.0 → 0.6.6 + 文档 v6.x → 0.6.x 改写 + 产物重建`，
      正文说明：重置依据（用户裁决）、降版本号副作用、六绿证据、未打 tag
      （按会话 attribution 要求附 `Co-Authored-By` 行）
- [ ] P5.3 `git push origin main`（AGENTS.md：不得只提交）
- [ ] P5.4 记录 journal（`/trellis:finish-work`）
- [ ] P5.5 任务归档 `python ./.trellis/scripts/task.py archive 09-27-v6-release-closeout`；
      若「版本号重置 + 别名说明」这一做法具普适性，考虑沉淀到 spec（§3.3 spec update）

**阶段退出**：远端与本地同步（`git status` 干净且与 `origin/main` 一致）+ journal 已记录 + 任务已归档。

## 不做什么（防越界）

- 不打 tag、不触发 `release.yml`、不做 CRX/CWS 发布动作
- 不改 `REGION_MASK_VERSION`、`scripts/extension-key.json`、`svi:*` 协议、legacy 键
- 不改写 `.trellis/spec/**` 与代码注释中的 `v6.x`（可追溯链条）
- 不改写四份文档中的历史发布记录（`v1.x~v5.x`，约 65 处）
- 不放宽任何既有断言
- 不重命名既有任务目录（`09-25-v6-*` 保持原名）
- 不处理 `pendingMask.armed` 复访观察（另立任务）
