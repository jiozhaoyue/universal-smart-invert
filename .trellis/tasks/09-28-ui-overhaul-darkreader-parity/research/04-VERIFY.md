# 对抗性复核报告：04-settings-redundancy-matrix.md

> 角色：对抗性复核员（红队，只读）
> 被审对象：`.trellis/tasks/09-28-ui-overhaul-darkreader-parity/research/04-settings-redundancy-matrix.md`
> 日期：2026-09-28
> 方法：一切结论自行复算（grep / node 求值 / 双向 diff），不采信原文的计数与断言。
> 本文件是唯一产出；未改动 research/ 之外的任何文件。

---

## ① 复核结论

**可信度评级：需修正后采用。**

**成立的骨架**（我独立复算，逐项对上）：
- 「不是单一真源」这一主结论成立；C 消费 `SVI_SETTINGS_SCHEMA`、A 手写、B 独立，三处渲染路径确实不共用清单。
- 核心计数 **A=94 / B=7 / C=94 / 16 个 builder / A 承载 92 个全局键** 全部复算通过（见 §③）。
- D1（`imageInvert` 读合成值写全局）、D2（`imgFxMode` 选项集 4 vs 8）、D5（第三份硬编码默认值）全部复现。
- 关键约束「用户脚本形态无 options 页 → A 全局层不可整体删除」成立（`options.*` 只落在 `extension/`）。

**必须修正的四处**（这是评级从「可直接采用」降档的原因）：
1. **§7 的两个计数不成立**（叶路径 117 / 未覆盖叶子 27）。用 test.js 自身的 `leaves()` 口径复算是 **122 / 25**；报告的 117 只在「把数组排除在叶子之外」这一 test.js **并不采用**的口径下才凑得出，而 27 两种口径都凑不出（24 或 25）。
2. **漏掉一个比 D1/D2 更危险的不一致项**：`brightness`/`contrast`/`saturate`/`hueRotate` 在 A 里会顺带把 `presetId` 置为 `custom`（故生效），在 C 里只写数值、**从不置 `custom`**，而 C 的 `presetId` 下拉根本没有 `custom` 选项 → **C 的这 4 条滑杆是死控件**。详见 §④ D7。
3. **§5.4 的重构建议对 `#policy` / `#hover` 不可行**，且与 §5.2 的分层定位自相矛盾。详见 §⑤。
4. **对 R1b 断言强度的描述偏乐观**：它扫的是**整个 `UIController` 类体**里的 `state.<键>` 引用（不止行调用点），因此只保证「键面存在」，连「该键是否真有一条控件」都不保证。原文称之为「静态近似」是对的，但没点破它比「行清单同源」还要弱一层。详见 §② 对主张 1 的判定。

---

## ② 逐条判定

### 主张 1：不是单一真源 —— **成立**（附一处需要补充的强度说明）

| 子结论 | 判定 | 我的证据 |
| :-- | :-- | :-- |
| `SVI_SETTINGS_SCHEMA` 全仓只有 C 消费 | 成立 | `grep -n SVI_SETTINGS_SCHEMA` → 定义 `user.js:12527`；常量引用仅 `scripts/extension-src/options.js:22`（+ `extension/options.js:22` 构建副本）；另有 `test.js:5338`、`test-extension.js:821` 的**测试**引用（非消费）。 |
| A 逐区块手写、零引用 schema | 成立 | `UIController`（`user.js:13251`）内 16 个 builder 共 94 处 `SviControls.*Row/colorList/listEditor` 调用，无一处读 schema。 |
| A↔schema 靠 test.js 源码扫描维持 | **成立，但强度被高估** | `test.js:5434` 抽出 `class UIController {...}` 类体，`test.js:5438` 用 `/\bstate\.([\w$.]+)/g` 扫**整段类体**（不是行调用点），归一到 DEFAULT_PREFS 最深前缀得到 `panelKeys`。所以它恰名「键面存在」——**删掉一条控件行、只要该键在类体别处仍被引用，断言照样绿**。原文说「构建产物无关的静态近似」准确，但应再补一句：它连「有控件」都不保证，更别提 min/max/选项集/极性。 |
| B 完全在体系外 | 成立 | 见下。 |

### 主张 2：控件数 A=94 / B=7 / C=94 —— **成立**（逐项复算见 §③）

### 主张 3：三处最危险不一致 D1/D2/D5 —— **成立**（但 D 系列不穷尽，见 §④）

- **D1 成立**：读 `user.js:17075` `imageOn: state.imageInvert !== false && getSiteProfile().imageInvert !== false`；B 写 `popup.js:93-95` → `svi-set-pref key:imageInvert` → `user.js:17119-17123` 只改 `state.imageInvert`。本站覆盖强制关时，勾选无效——成立。
- **D2 成立**：`popup.html:154-159` 仅 4 项（full/luma/grayscale/sepia）；`schema`（`user.js:12554`）8 项（+key/rect/brightness/custom）；A 用 `IMG_FX_MODES`（`user.js:79-88`）同样 8 项、**且与 schema 同序**。B 的 `select.value='key'` 赋不上 → 回落第一项。成立。
- **D3/D4/D6 成立**：`PRESETS['amoled'].name='纯黑'`（`user.js:62`）vs schema/`popup.html` 的「夜间纯黑」；A 的 `presetId` 用 `state.presetId === id`（`user.js:13704`），B 用 `snap.presetId !== 'amoled'`（`popup.js:57`），`custom` 态三处显示各异；`hoverRestore` 在 `user.js:13710` 与 `:14504` 各一行（同键）；`elementRules.scope` 选项 A=`[[site,本站],[all,全部站点]]`（`user.js:15311`）vs schema=`[all]`（`user.js:12612`）。全部成立。
- **D5 成立**：`user.js:17078-17080` 在 snapshot 里再写一份 `'balanced'`/`'full'`/`'soft-gray'`；`popup.js:54-58` 又一份字面量回退；A 亦内联 15 处回退（我逐条比对，**当前全部与 DEFAULT_PREFS 相等**，属结构性隐患而非现存漂移）。成立。

> 小修正：D5 说「消息处理器 `user.js:17078-17081` 再硬编码一份」——位置准确，但那几行属 **`svi-get-snapshot` 的读路径**（`user.js:17067` 起），严格说应描述为「snapshot 响应里再写一份默认值」，与 `svi-set-pref`（`user.js:17100` 起）是同一 `onMessage` 块的不同分支。

### 主张 4：用户脚本无 options 页，A 全局层不可整体删除 —— **成立**

`build-extension.js:316-336` 只把 `popup.html/js`、`options.html/js` 写进 `OUT_DIR`（= `extension/`）。用户脚本形态（Tampermonkey）无从加载 options 页，故 A 的全局页签是其唯一全局设置入口。`OWNER_KIND` 仲裁点亦属实（`user.js:5529`，`EXT_MODE` 于 `build-extension.js:109`）。

---

## ③ 我复核出的计数（命令 + 输出）

### 3.1 schema：11 组 / 94 项 —— **与报告一致**

```
node -e "抽 /* v6.4-SETTINGS-SCHEMA-START..END */ 块求值 -> SVI_SETTINGS_SCHEMA"
→ groups = 11 ; items = 94
```
分组明细：appearance 7 · image 19 · region 12 · video 17 · shield 1 · site 3 · lists 3 · theme 9 · readability 3 · schedule 3 · actions 17 = 94。

### 3.2 A 的行调用点：94 —— **与报告一致（含分型与 builder 拆分）**

```
对 [13469,16431] 区间计 SviControls.(toggle|slider|select|text|picker|chip|hour)Row|colorList|listEditor
→ 94
by type: toggleRow 27 · sliderRow 45 · selectRow 14 · chipRow 2 · textRow 2 · pickerRow 2 · colorList 1 · listEditor 1  (=94)
```

`SviControls.*` 全仓共 98 处，除这 94 处外仅 4 处且**全在注释里**（`4369`/`4383` 是面板 CSS 注释，`12599`/`12606` 是 schema 注释）——不影响计数。

**16 个 builder 成立**。逐 builder 行数（用方法起点切区间复算）：

| builder | 行 | 控件数 | 说明 |
| :-- | --: | --: | :-- |
| buildAppearanceSection | 13691 | 7 | |
| buildImageSection | 13751 | 18 | 不含 `imageInvert`（它在胶囊/三态卡） |
| buildRegionSection | 13945 | 12 | |
| buildVideoSection | 14161 | 16 | 不含 `autoDetect`（胶囊） |
| buildActionsSection | 14391 | 18 | = 17 项 actions + 1 行 peek(`hoverRestore`) |
| buildSiteSection | 15262 | 4 | = 3 项 schema + 1 行站点覆盖 `siteFxMode` |
| buildShieldSection | 15449 | 1 | |
| buildReadabilitySection | 16132 | 3 | |
| buildDynamicThemeSection | 16179 | 9 | |
| buildSchedulerSection | 16337 | 3 | |
| buildSiteListsSection | 16384 | 3 | |
| buildPowerBanner/CapabilityCards/MediaSection/DataSection/TipsBlock | — | 0 | 纯动作/只读/文案 |

`buildUI`/`buildSettingsModal`（骨架）、`buildMediaRow`/`buildProcessedRow`（行工厂）不计入 16。

### 3.3 「92 个全局键」—— **成立（推导链复算通过）**

```
A 区间行调用 94
 · 去重键面：仅 hoverRestore 出现 2 次（13710 + 14504）→ 93 个不同键
 · 扣掉 1 个站点覆盖行（15282 siteFxMode，写 siteOverrides[host].imgFxMode）→ 92 个全局键
 · schema 94 键中「无 A 行」的恰为 {imageInvert, autoDetect}（二者由胶囊/三态卡承载）→ 92
→ 两侧均为 92，且集合一致（非「巧合相等」）
```
> 报告的原话是「编号相同是巧合，不是同源」。我复算的结论比它更强一点：**当前 A 行键面与 schema 键面在同一集合上（92↔92），只是靠 test.js 兜着而非同一份数据**。报告说「巧合」在因果上对（来源确实是两处手写），但「集合并不完全相同」这句与我的复算不符——我算出的两侧集合**完全相同**。

### 3.4 B：7 控件 / 6 键 —— **与报告一致**

```
popup.html → <select>2 · type=checkbox 3 · class="chip"2 · <button>6
imgfx 的 <option> = 4（全部 option 7 个 - policy 3 个）
```
键面：`#policy→imagePolicy`、`#imgfx→imgFxMode`、`#imginv→imageInvert`、`#hover→hoverRestore`、两枚 chip→`presetId`，加 `#power→站点电源`（非 schema 键）= 6 键 / 7 控件。消息通道白名单确为 5 键（`user.js:17100-17126`：imagePolicy/imgFxMode/presetId/hoverRestore/imageInvert），另有 `svi-site-power:17097`、`svi-site-reset:17129`、`svi-open-settings:17133`（行号与报告**逐行吻合**）。

### 3.5 C：94 = schema 1:1 —— **成立**

`options.js:340-349` 的 `build()` 双循环遍历 `SCHEMA` 的全部 group/items 逐个 `buildItem`，无过滤、无跳过（未知 kind 显式 `infoLine` 报错，不静默丢）。

### 3.6 报告的 §7 附录：**两个数字不成立** ✗

我用 test.js 的 `leaves()`（`test.js:5352-5361`，**数组按叶子算**）复算：

| 数字 | 报告值 | 我复算 | 判定 |
| :-- | --: | --: | :-- |
| DEFAULT_PREFS 顶层键 | 106 | **106** | ✓ |
| DEFAULT_PREFS 叶路径 | 117 | **122**（test.js 口径） | ✗ 除非把数组排除（那是另一种口径，test.js 不用） |
| 未被 schema 覆盖的叶子 | 27 | **25**（related 祖先口径）/ **24**（非数组口径） | ✗ 两种口径都凑不出 27 |

> 报告 §7 把 117/27 当作「测量事实」列出，但它们依赖一个未声明、且与 test.js 真源不一致的计数口径。建议删除或改用 test.js 口径（122/25）并注明口径。

### 3.7 我额外做的三项三向核对（报告未做，结果为**通过**）

| 轴 | 方法 | 结果 |
| :-- | :-- | :-- |
| **slider min/max/step（A vs schema）** | 抽取 A 的 45 条 `sliderRow` 尾参，按 `state.<键>` 配到 schema 项求值比对 | **45/45 全等，0 差异**（含 `scale:100` 的两条：A 用 `×1000/10` 取整、C 用 `round(v/100,4)`，数值等价） |
| **select 选项集（A vs schema）** | 抽取 A 的 14 条 `selectRow` 第 3 参求值 | 全部字面量选项与 schema **同序同集**；`imgFxMode` 走 `IMG_FX_MODES`，与 schema 同序 8 项 |
| **toggle 极性** | 扫 A 的 27 条 `toggleRow` 的 `!== false` / `=== true` 与 DEFAULT_PREFS 默认值对表 | **23 处带比较、无一处反向**；`!== false`(默认真) 与 `=== true`(默认假) 均与默认值一致 |

> 结论：**A 与 C 在「控件配置」三轴上当前高度对齐**（真正漂移的只有 B，即 D2/D3/D5）。这是报告没有给出的、对重构有利的信息。

---

## ④ 报告遗漏的不一致项（我扫到的新项）

### D7（新增，严重）：`brightness`/`contrast`/`saturate`/`hueRotate` —— C 侧滑杆是死控件

**证据链**（`diff` 语义，逐行引用）：

- 过滤器真源只看 `presetId`：
  `user.js:1292-1302 getActiveFilter()` —— `if (state.presetId === 'custom') { 用 state.brightness/contrast/saturate/hueRotate } else { return PRESETS[presetId].filter }`。
  即：**只要 `presetId` 不是 `'custom'`，存下来的 brightness 等数值被完全忽略**。
- A 侧：拖动这 4 条滑杆 → `user.js:13721-13737` 的 onSet 调 `this.stateMachine.onCustomParamChange()` → `user.js:6272-6280` **`state.presetId = 'custom'; savePrefs();`** → 过滤器改用新数值。**A 生效。**
- C 侧：`options.js:231-238 KINDS.slider` 的 onSet = `(v) => writeVal(item, ...)` → `options.js:216-219 writeVal` 只 `setPath(prefs, item.key, v); scheduleSave();`，**不碰 `presetId`**。
- 而 C 的 `presetId` 控件是 `select`，选项只有 `[soft-gray, amoled]`（`user.js:12529`），**没有 `custom`**。
- ⇒ 在 options 页里，用户拖动「画面亮度 / 对比度 / 饱和度 / 色相旋转」只改了存值，`presetId` 永远到不了 `custom`，**过滤器永远读 `PRESETS[presetId]`，四条滑杆看起来毫无效果**。

**为何比 D1/D2 更该进「最危险」**：D1 是「点了没用但值确实写了」，D7 是「**整组控件在 C 页永久失效**」，且用户会当成扩展坏了。报告把它整个漏了（报告只提了这些键的默认值/回退，未提「A 置 custom、C 不置」这一行为分叉）。

> 反驳口径预设：若答辩称「这是既有 IA、不在本任务范围」——即便如此，它仍属「三处同名同键但语义不同」，理应进 §4.1 的表或 §6 的硬约束，而不是完全缺席。

### D8（新增，次要）：`imageInvert` 在 A 是**第 4 个读点**，且读法与 B 相反

- A 胶囊「图片:开/关」（`user.js:13374`）写 `state.imageInvert = !state.imageInvert`（**全局**），其选中态只反映**全局**。
- B 的 `#imginv` 读 **合成值**（`user.js:17075`）。
- ⇒ 同一页面、同一扩展形态下，本站「强制关」时：**A 胶囊显示「开」，B 勾选框显示未勾**。这是 D1 的「读侧」对偶，报告只写了 B 的读写不一致，没写 A 胶囊与 B 对同一状态给出**相反的可视结论**。

### D9（新增，待裁决是否算缺陷）：`scheduleStart/End` 的控件 kind 分叉

- schema 声明 `kind: "hour"`（`user.js:12645-12646`），C 走 `options.js:246-252 hour()` → `selectRow(0..23 时)`。
- A 是**裸 `selectRow(label,hint,hours,...)`**（`user.js:16358/16369`，`hours` 于 `:16344` 运行时构造）。
- 两侧最终都是「0~23 下拉」，**行为一致**，故通常无害；但 schema 的 `kind` 词表里 `hour` 与 A 的调用形态不是一个词汇，属登记项。报告把它当普通 `●` 记，未点出 kind 分叉。

### 复核未发现的问题（澄清项）

- **`href`/极性反向布尔**：任务提示怀疑 `hoverRestore !== false` 这类反向布尔。我逐条扫了 27 条 toggle，**没有一处极性反向**（见 §3.7）。
- **slider 范围漂移**：45 条全等（见 §3.7）——不存在报告担心的「三处 min/max/step 不一致」。

---

## ⑤ 重构映射建议的可行性与矛盾点

**结论：§5.2 的分层表与 §5.4 的「本站三态化」自相矛盾；且 §5.4 对 `#policy`/`#hover`（及 `presetId` 胶囊）在现有数据模型下不可行。**

**硬证据**：站点级覆盖的**键面是闭合的**，由 `user.js:3714-3733 resolveSiteProfile()` 定义：

```
站点覆盖只认: enabled · videoInvert · imageInvert · bgReplace · imgFxMode
              · excludeSelectors · shieldColors
              · imgLumCutoff/imgAreaThreshold/imgTolerance/whiteThreshold/lumThreshold (v5.3 自校准写)
```
（`DEFAULT_PREFS.siteOverrides` 注释 `user.js:153` 亦同。）

于是：

1. `#imginv → imageInvert`：站点级存在 ✓，可改三态。
2. `#imgfx → imgFxMode`：站点级存在 ✓，可改三态。
3. **`#policy → imagePolicy`：站点级不存在 ✗**。要「本站化」必须新造 `siteOverrides[host].imagePolicy` 键，并改 `resolveSiteProfile` 的合并逻辑 —— 这是**数据模型变更**，不是 UI 重构。
4. **`#hover → hoverRestore`：站点级不存在 ✗**，同上；而且 `hoverRestore` 的展示语义是全局 CSS 门类（`user.js:1321` 挂 `svi-hover-restore` 于 `documentElement`），天然全局。
5. `presetId` 胶囊：站点级不存在 ✗，同上。

⇒ §5.4 第 1 条「把 popup 的 `#imginv` / `#imgfx` / `#policy` / `#hover` 明确改成本站三态，或明确标注『全局』」——**前半句对 2/4 个控件不可行**，后半句（标注全局）才可行。而 §5.2 的分层表又要求 popup 专做「本站快捷层」并把 `imagePolicy`/`imgFxMode` 的全局写入口「删或只读」。两处打架：

- 若按 §5.2 把全局写入口从 popup 删掉，则 popup 只剩 `#power`（本站）——与它「高频 6 项」的定位不符；
- 若按 §5.4 承认 `#policy`/`#hover`/`presetId` 是**全局**控件，那就等于承认 popup **本来就混着全局与本站两层**，§5.2「本站快捷层」的定位从一开始就不成立。

**我的判定**：popup 的正确定位是「**本站快捷 + 少量全局高频**」的混合层，而不是纯本站层。§5.2 的二元分层（本站→popup / 全局→options）与 popup 既有的全局键（`presetId`/`imagePolicy`/`imgFxMode`/`hoverRestore`/`imageInvert` 五个里有四个是全局）不兼容。**在 popup 保持独立渲染的前提下，唯一自洽的做法是：popup 控件逐一标注作用域（本站三态 or 全局），而非按界面切分作用域。**

**另一处与 §5.1 相关的补充**：报告说扩展形态下「精简 A 的全局页签」。但既然扩展形态已经有了 options 全页（C），**扩展形态里真正冗余的其实是 popup 的全局控件**，而非 A 的全局页签（A 在扩展形态下可被 options 取代，两者**不该都给全局项**）。报告把 A 当精简对象，方向可议。

---

## ⑥ 工作量被低估 / 高估的地方

**被低估（主要）**：报告**没有给出把 schema 变成唯一真源的工作量估计**，而这恰好是任务问的核心。

- 「让 schema 成为唯一真源」= 让 **A 也消费 schema**。当前 A 是 **94 处手写行调用 + 各自的 getVal/onSet 闭包 + 约 30 个 section/helper 方法**（`buildSettingsModal` 骨架 + 16 builder），其中大量 onSet 带**副作用**：`savePrefs()`、`window.__svi_image_engine.clearCacheAndRescan()`、`applyVideoTune()`、`RegionRenderEngine.unmountAll()`、`stateMachine.onCustomParamChange()`、`evaluateSitePower()` 等（我在 A 区间扫到 `clearCacheAndRescan` 高频出现）。C 的 `KINDS`（`options.js:227-319`）只是「值→存储」的最薄形态，**不携带任何这些副作用**。
- 要把 A 迁到 schema 驱动，必须先建一张**「键 → (读路径, 写路径, 副作用集)」注册表**，再区分 A 独有项（本站三态卡、胶囊、peek 行、布局按钮 —— 这些**不在 schema 里**）与 schema 项。其规模与 `KINDS` 不在一个量级。报告 §5.5 只提「短期加断言、中期让 popup 消费 schema」，**完全没提 A 的迁移**，因此对总工作量的刻画是「结构性缺失」，而非「偏乐观」。
- 报告建议的「短期」加一条 popup 键面断言（§5.5）确实是很小的工作量（对，这部分没高估）。

**被高估**：无。相反，我复算显示 **A↔C 的控件配置三轴已完全对齐**（§3.7），意味着「A 与 schema 会漂移」的**当前风险低于报告的暗示**——真正的漂移只在 B 一侧（D2/D3/D5）与 A 的单键副作用（D7）。报告对 A↔C 漂移风险的渲染略偏悲观。

**计数工作量口径**：§7 用非 test.js 口径报 117/27，会让「例外表维护成本」看起来比实际（122 叶 / 25 例外条目）略小，属轻微低估。

---

## 附录：复现命令速查

```bash
# schema 项数 / A 行数 / 分型
node -e '<抽块求值 SVI_SETTINGS_SCHEMA；对 [13469,16431] 计 SviControls.*Row 调用>'
# A 行键面 vs schema 键面（双向）
node -e '<抽 A 区间行调用的 state.<键>，与 schema 键面做 related 比对>'
# slider 三向核对 / select 选项集核对
node -e '<抽 sliderRow 尾参 + 第3参 selectRow 求值，按 state.<键> 配 schema 比对>'
# DEFAULT_PREFS 叶数（test.js 口径）
node -e '<复刻 test.js:5352 leaves()，得 122 叶；related 覆盖剩余 25>'
# popup 控件数
node -e '<数 popup.html 的 select/checkbox/chip/button/option>'
```
