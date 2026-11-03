# implement.md — 元素遮罩重新武装（执行计划）

> 复选框**随执行实时勾选**。阶段退出条件不满足不得进入下一阶段。

## 阶段 D0 — 基线取证（改前）

- [ ] D0.1 连跑 `test-extension.js` 3 次，记录：红/绿比、失败断言名、场景 2 打印的
      `门类@Xms / pending@Yms / 反色@Zms` 与 `maskArmed` 值
- [ ] D0.2 记录既有单测里 `siteMediaStore` 相关用例（`grep -n siteMediaStore test.js`），
      作为 §3 修法不得扰动的契约清单
- [ ] D0.3 确认当前树 = 基线 `5.0.0`（发版收口改动已 stash）

**阶段退出**：三份基线数据落 `notes.md`。

## 阶段 D1 — 产品修（R1/R2）

- [ ] D1.1 在 `reapplyPrefsFromStore()`（`universal-smart-invert.user.js:16690`）末尾补
      `setupPendingMask()` 重放，并写清根因注释（一次性启动动作 vs 异步引导 + 就绪后必须重放），
      引用既有先例（`whenRootReady` 之于根）
- [ ] D1.2 复核幂等：读 `setupPendingMask`（`:16374`）确认 `data-svi-masking` / `maskPaused` /
      配置门三重守卫足以挡住重复调用；**不新增状态字段**
- [ ] D1.3 `siteMediaStore.load()`（`:2941`）就绪前不记忆（design §3 首选方案）；
      若扰动既有单测契约则改用最小方案（重放点前强制重读一次），并在 notes 记录选了哪个与为什么
- [ ] D1.4 `node --check` + `node test.js` 绿（改后即时回归）

**验证**：`test.js` 绿；用户脚本形态（GM 同步后端）行为不变 —— 由 `test-browser.js` 场景 29
（遮罩档）与 `test.js` 相关用例覆盖。
**回滚点**：`git checkout -- universal-smart-invert.user.js`。

## 阶段 D2 — 夹具配档（R3）

- [ ] D2.1 `test-extension.js` 夹具显式把 `flashGuardLevel` 设为 `'media'`
      （经真实 `svi:prefs` 协议写入，**不得**绕过被测对象手写分片：
      参见测试既有注释 `:1019` 的要求）
- [ ] D2.2 场景 2 增加**确定性机制断言**（不依赖帧时序）：远端装载完成后直读
      `window.__svi.pendingMask.armed` 与 `documentElement.hasAttribute('data-svi-masking')`
      → 即 AC1；并在样本不足的分支保持 AC2（首访不遮）
- [ ] D2.3 保留既有非空真守卫（`invCount >= 1`）

**验证**：单跑一次，确认新断言能**咬住**修复前的行为 —— 即先在不含 D1 的代码上验证新断言变红
（负向对照），再在含 D1 的代码上验证变绿。
**回滚点**：`git checkout -- test-extension.js`。

## 阶段 D3 — 实测与断言口径决策（R4）

- [ ] D3.1 含 D1+D2 的代码连跑 `test-extension.js` **≥5 次**，统计红/绿与失败断言名
- [ ] D3.2 按 design §4 判据看场景 2 的 `pending@` 是否有值、是否早于图片 `firstAt`
- [ ] D3.3 **分支决策**：
      - 5/5 绿 → 保留强断言（R4 不触发），进入 D4
      - 有红且红因是「首屏插入早于武装」→ 按 R4 把断言收敛到文档化契约
        （README §13：首访一律不遮；遮罩覆盖武装后新插入的媒体），**保留非空真守卫**，
        并补一条「武装后新插入媒体零白闪」的确定性断言以免语义被削弱
      - 有红且红因是 harness 级 `classList` TypeError → 记录次数，交 `09-27-ext-e2e-harness-flake`，
        不计入本片
- [ ] D3.4 收敛断言后的代码再连跑 ≥5 次，确认稳定

**阶段退出**：≥5 次连跑稳定（绿），且每一次红/绿都能归属到具体断言。

## 阶段 D4 — 门禁与提交（R6）

- [ ] D4.1 六道门禁：`node --check` · `node test.js` · `node test-browser.js` · `node test-extension.js` ·
      `node scripts/build-extension.js` · `node scripts/pack.js`
- [ ] D4.2 提交：`fix(mask): 扩展形态元素遮罩永不武装 —— 远端 prefs 就绪后重放 setupPendingMask`
      正文含：根因、与版本号无关的取证结论、连跑证据、附 attribution 行
- [ ] D4.3 `git push origin main`
- [ ] D4.4 journal 记录

**阶段退出**：六绿 + 推送成功。

## 阶段 D5 — 回填发版收口（跨任务）

- [ ] D5.1 `git stash pop` 回填 `09-27-v6-release-closeout` 的改动
      → **立即**按已知配方处理行尾（归一到 LF）并**重建** `extension/`（否则 `test.js` 的
      `R1b` 源码扫描正则与 token 块逐字节断言会失配 —— 见该任务 notes §P4 行尾陷阱）
- [ ] D5.2 在收口任务上跑六道门禁（此时应全绿）→ 提交 → 推送 → 归档

## 不做什么（防越界）

- 不修 harness 级偶发（另任务）
- 不引入同步信号 / localStorage 门判定镜像（已裁决排除）
- 不改 `svi:*` 键面、`REGION_MASK_VERSION`、掩码契约
- 不放宽任何既有断言换绿；R4 的收敛只按文档化契约收窄，且必须留非空真守卫
- 不动版本号与文档（在 stash 里，由收口任务回填）

---

## 完成状态（**回填**，如实说明）

> 执行期间未逐条勾选复选框（本片是用户授权的插入式修复，节奏被打断）。
> 这里按阶段回填结果与证据，不假称"实时勾选"。

| 阶段 | 状态 | 证据 |
| :--- | :--- | :--- |
| D0 基线取证 | ✅ | 3 跑：`maskArmed` 全 false、`pending@-`（遮罩从未武装）；run3 绿是因判定快（反色@54ms） |
| D1 产品修 | ✅ | 提交 `58bd960`：`reapplyPrefsFromStore` 末尾重放 `setupPendingMask()` + 开头清 `siteMediaStore` 空记忆 |
| D2 夹具配档 | ✅ | 同提交：复访前经产品协议配 `media` 档、场景末还原；新增机制断言与契约断言（含非空真守卫） |
| D3 实测与决策 | ✅ | R4 触发（首屏插入早于武装）→ 按裁决收敛到 README §13 文档化契约；含修复后武装断言 4/4 绿 |
| D4 门禁与提交 | ✅ | `58bd960` + 诊断改进 `f3a8fe0`；`--check`/`test.js`/`test-browser`/`build`/`pack` 绿；`test-extension` 含武装断言多次绿 |
| D5 回填收口 | ✅ | 收口改动已 pop 回填、归一 LF、重建，提交 `6dbebec` 并推送 |

**负向对照**（三条，全部如实变红）：见 `notes.md`。
**残留**：`test-extension.js` 的既有抖动（CDP 超时 / rAF 60 帧停滞 / 场景 8 与站点重置竞态）与
一次未复现的武装轮询超时（现已带现场值可诊断）—— 归 `09-27-ext-e2e-harness-flake` 继续收敛。
