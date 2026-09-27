# Design: v6 发版收口（版本号重置 + 文档改写 + 发布物重建）

> 本片不引入新架构、新契约、新数据流。design 记录三件必须一次说清的事：
> ① 版本号的联动图（改哪里、谁派生、谁断言）；② 重置语义——「批次号 = 版本号」合一后
> 以 `0.6.N` 为单一轴，以及改写的范围、例外与代价；③ 验证方法与本片特有的风险（降版本号）。

## 1. 版本号联动图（真源 → 派生 → 断言）

```
universal-smart-invert.user.js:6   // @version  0.6.6        ← 唯一真源（手工改）
universal-smart-invert.user.js:43  const SCRIPT_VERSION      ← 同文件镜像常量（必须同步）
        │
        ├─ scripts/build-extension.js  readHeader() → sanitizeVersion() → manifest.version
        │      └─ extension/manifest.json:4  "version": "0.6.6"   ← 构建产物，禁止手改
        ├─ scripts/pack.js            → dist/universal-smart-invert-extension-v0.6.6.zip
        ├─ scripts/export-rules-pack.js / export-rule-library.js  → 导出的规则包内嵌版本
        └─ 运行时：window.__svi.version、面板版本徽章、快照 payload.version、
                  Store 导出 payload.version（全部读 SCRIPT_VERSION）

断言（改版本号时会被全部触发，正是本片的回归网）：
  test.js:450            svi.version === 头部 @version
  test.js:657            export1.version === svi.version
  test-browser.js:108    manifest.version === userscript @version
  test-browser.js:1616   file:// 页上报的 version === @version
  test-browser.js:2421   面板版本徽章 === 'v' + @version
  test-browser.js:3644/3679  GM 垫片 / document_start 两形态 boot 后的 version === @version
  test-extension.js:424/435  真扩展 getManifest().version 与隔离世界 __svi.version === 构建版本
  ci.yml:49-51 / release.yml:75-77  manifest.version === @version（CI 与发版冒烟）
```

**为什么必须同时改两处而不是一处**：`SCRIPT_VERSION` 是 `@version` 的镜像常量而非运行时读取
（单文件 userscript 无构建期变量替换，头部注释也不可读回）。历史上有注释记载它曾因不同步导致
「与产品无关的假失败」（`test.js:446`），因此该断言是故意保留的，不得放宽。

**改一处即可的地方**：`manifest.json`、zip 名、扩展自验版本、面板徽章——全由构建或运行时派生。

## 2. 重置语义：批次号 = 版本号（单一轴）

**映射**：`1.0 实为 0.01 量级` ⇒ 旧编号整体压缩一位数量级；v6 线 ⇒ 0.6 线；
且**批次号与版本号合一**——第 N 批 = `0.6.N`。本片为该线第 6 批 ⇒ 发布号 **0.6.6**。

由此 `v6.N` 与 `v6-N` 在文档中统一写作 `0.6.N`，不再区分「产品版本」与「迭代批次」两轴。
好处：文档、徽章、`@version` 完全自洽（此前方案里「Reader 看到 0.6.6 而徽章 0.6.0」的矛盾消失）。

**改写范围（用户裁决）**：`README.md` / `README_EN.md` / `PUBLISHING.md` / `AGENTS.md`，共 43 处。
**不改写**：`.trellis/spec/**`（33 处）与代码注释（userscript 132 行、scripts ~21 处）——
它们是**与任务目录名、提交信息一一对应**的可追溯链条，改了会让 `git log --grep=v6.4`
与 spec ⟷ 任务目录的对应关系断掉。

**例外：任务产物引用不得机械改名。** 实测此类 2 处：
- `README.md:152`「按 **v6-3 PRD** 已列明的面板项」
- `README_EN.md:169`「the panel items **v6-3's PRD** had already specified」

它们指向的是任务产物（真实文件名为 `.trellis/tasks/archive/2026-09/09-25-v6-region-correction/prd.md`），
改成「0.6.3 的 PRD」会指向不存在的名字。处置：写作「按 **0.6.3 批次**的 PRD」这类**不冒充文件名**的措辞，
并由 §2.1 的命名别名说明段给出 `0.6.N ↔ v6-N` 的对照。

### 2.1 命名别名说明段（保追溯）

README 中英各一段，要点三条：① 迭代批次 N 的产品版本号是 `0.6.N`；② 本仓任务目录名与提交信息
中仍以 `v6-N` 命名，是同一批次的别名；③ 因此按任一种写法都能检索到对应提交/文档。

### 2.2 代价（如实记录）

- 文档里 `0.6.N` 与仓内 `v6-N` 并存，读者需读一段说明才能完全对齐——这是「保留可追溯性」
  换来「文档自洽」的既定取舍（用户选定）。
- 若日后要求彻底单一名，则须同时重命名任务目录并改写提交引用（不可行：历史提交不可改）。

## 3. 降版本号的后果与处置

| 面 | 影响 | 处置 |
| :--- | :--- | :--- |
| 油猴类管理器自动更新 | `0.6.6 < 5.0.0`，数值下降不被视作「有新版本」，已装 5.0.0 的浏览器不会自动升级 | README 安装/自检章节加一句「需手动覆盖安装一次」（R7） |
| GitHub raw `@updateURL` | 同上（由管理器侧比较决定，与文件内容无关） | 同上 |
| Chrome Web Store | 商店要求版本**严格递增**；本仓 CWS 未接线（`release.yml` 靠 secrets 门控，缺失即跳过）。若日后接入，须注意商店侧已发布版本号高于 `0.6.6` 时会被拒绝 | 本片无动作，仅记录限制 |
| 本仓 git tag / release 流水线 | `git tag` 仅 v1.3.1/v1.4.0，v5.0.0 从未打过 tag；本片不打 tag | 无动作（用户裁决） |
| Greasy Fork | 仓内只有「如何发布」的说明文档，无实际发布条目/ID | 无动作 |
| 扩展 ID | 由公钥决定，与版本号无关 | 无动作，AC11 断言不变 |

结论：影响面为「本地/手动安装 + 未来接入商店时的版本策略」，无数据或契约风险。

## 4. 「该改哪一句」的判定口径

改文档最容易越界（把历史记录当错误改掉）。本片把四份文档中的所有版本类提及分为**五类**，
逐条判定并留 grep 证据：

| 分类 | 判据 | 处置 | 本片实例（规模） |
| :--- | :--- | :--- | :--- |
| **当前版本声明** | 句子在陈述「现在的版本是什么」 | **改** | 徽章 ×2；「当前 5.0.0」×2；PUBLISHING 表格 3.0.0；脚本头 `@version`/`SCRIPT_VERSION`/`@description` |
| **状态声明** | 句子在陈述「做完了没有」 | **改** | `🧪 v6.0 开发中` ×3 / `v6.0 in progress` ×3 → 如实表述（默认可关、已交付） |
| **批次引用（v6 线）** | 句子在标记「哪一批交付了什么」 | **改** | 43 处中的绝大多数（`v6.6 补充`、`v6-2 渲染`、`v6.4 界面重建`…） |
| **任务产物引用** | 句子在指向某个文件/产物 | **改措辞不改名** | 2 处（`v6-3 PRD`）→「0.6.3 批次的 PRD」+ 别名说明段兜底 |
| **历史发布记录 / 历史对比** | 句子在陈述「当年发布了什么」「与旧版行为是否一致」 | **留** | `## 🆕 v5.0 重大升级` 等 changelog 段 + 「与 v4.6 行为一致」类共 **65 处**（R6b） |

**「当前版本」与「历史记录」在同一文件内并存不矛盾**：前者回答「现在是什么版本」，
后者回答「当年发布了什么」。changelog 是事实记录，重写即篡改。

判定动作必须留下改前/改后两份 grep 清单（43 条分类表 + 65 条保留清单），不得凭印象声称「已清理」。

## 5. 验证方法

1. **真源核对**：`sed`/`grep` 读出 `@version` 与 `SCRIPT_VERSION`，与 `0.6.6` 逐字符比对。
2. **派生核对**：跑构建读 `extension/manifest.json`，跑 pack 读 `dist/` 文件名与自检输出。
3. **断言核对**：六绿逐条实跑；重点看 `test.js` 的轮询台账（v6.5 加装的闸门）无「未走完」告警——
   否则「绿」可能只是断言块被静默跳过。
4. **负向对照（证明断言咬得住）**：
   - NC-A：把 `SCRIPT_VERSION` 临时改成 `9.9.9`，预期 `test.js` **变红**并指名该断言
     —— 实测 ✅ `script version must track the @version header`、exit 1；
   - NC-B：把 `@version` 临时改成非法值，预期 `build-extension.js` **报错退出**。
     **实测更正**：`0.6.beta` **不会**失败 —— `sanitizeVersion` 是**宽容归一**（剔除非数字、去首尾点）
     而非严格校验，`0.6.beta` → `0.6` 且构建成功；真正触发失败的是**无数字**的输入
     （`@version beta` → `ERROR: cannot derive an MV3 version`）。
     故 `@version` 与 `manifest.version` 的不一致**不由构建拦**，由 CI / 发版冒烟的等值断言兜住
     （`ci.yml:49-51`、`release.yml:75-77`）。
   两组对照后**必须还原**，并以 `git diff` 证明工作区只余应有改动。
5. **审计核对**：AC7/AC8 的三份清单（43 改写 / 65 保留 / spec 33 与脚本 21 不变）并入任务 notes。

## 6. 回滚形态

全部改动落在**一个提交**内（脚本头 2 行 + 头部描述 + 四份文档 + `extension/` 重建产物；
`dist/` 已 gitignore 不提交）。回滚 = `git revert <commit>`，或 `git reset --hard` 到前一提交后
`node scripts/build-extension.js` 重建 `extension/`。无数据迁移、无外部副作用、无 tag 需清理。
