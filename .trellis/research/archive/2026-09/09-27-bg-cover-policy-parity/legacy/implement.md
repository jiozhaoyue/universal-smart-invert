# implement.md — 背景图封面/骨架豁免（执行计划）

> 复选框随执行**实时勾选**。阶段退出条件不满足不得进入下一阶段。
> （本片执行时按项目流程边做边勾；落盘时间晚于执行，如实记录。）

## 阶段 B0 — 夹具与负向对照（先红后绿）

- [x] B0.1 bench 主夹具页加 `#cover-bg`（卡片封面内的浅色背景图）与 `#plain-bg`（同 URL 独立背景图），
      同 URL / 同尺寸 / 同像素，唯一变量是结构；媒体页加 `#poster-video-card` 与既有 `#poster-video` 构成同款 A/B
- [x] B0.2 加断言：`cover-bg` **不反色**（AC1）、`plain-bg` **反色**（守卫不越界）、
      `#bg-thumb` 仍反色（AC4 既有能力）、`posterCardLight === false` + `posterCoverGuarded ≥ 1`
- [x] B0.3 **负向对照**：临时短路守卫（`if (false && …)`）后单跑 bench，新断言**变红并指名 `cover-bg`**
      （`data-svi-bginv=true`、计数 0），证明断言咬得住

## 阶段 B1 — 产品修（AC2/AC3/AC6）

- [x] B1.1 新增纯函数 `passesCoverGuard(info)`，紧邻 `passesImagePolicy`
- [x] B1.2 `passesImagePolicy` 的 balanced 分支改为委托 `passesCoverGuard`（`conservative`/`aggressive` 逐字不动）
- [x] B1.3 新增 `buildBgGuardInfo(el, url)`（meta 并入背景 URL 路径段；复用 `detectChromeContext` /
      `detectGridSiblings` / `closestContextHit`）
- [x] B1.4 `BgImageEngine.processEl` 尺寸门之后加守卫；`matchesDeclaredSelector` 只对
      `bgImageSelectors` 单独求 matches（声明式优先，AC3）；补 decide-once 短路避免重复计数
- [x] B1.5 统计计数 `bgCoverGuarded` / `posterCoverGuarded` + `SKIP_REASON_ZH['bg-cover']` 文案 + 面板「封面豁免」行
- [x] B1.6 `window.__svi` 导出 `passesCoverGuard` / `buildBgGuardInfo`（单测契约）
- [x] B1.7 `node --check` + `node test.js` 绿（含新增纯函数单测：contentContext 优先 / grid 阈值 4 / chrome /
      缺 info 放行 / 与 `passesImagePolicy` 的一致性矩阵）
- [x] B1.8 `MediaCoverageEngine.processPoster` 同源豁免（列表页里 `<video poster>` 即封面）

## 阶段 B2 — 类同病扫描（用户要求「查这类通病，有没有别的」）

- [x] B2.1 枚举全部"按像素亮暗直接落反色"的入口，逐条标注有无结构性豁免（见 `notes.md` 表）
- [x] B2.2 处置：背景图 / 海报**本片修**；canvas **刻意不豁免**（程序化图表，非摄影封面），
      视频画面与 fx 路径**不适用**（非"封面"语义）
- [x] B2.3 结论写进 spec（质量指南新增「判定管线的结构性豁免」一节）

## 阶段 B3 — 门禁与提交

- [x] B3.1 版本号 0.6.6 → 0.6.7（`@version` + `SCRIPT_VERSION` + README/README_EN 当前版本表述），
      `node scripts/build-extension.js`
- [x] B3.2 六道门禁全绿
- [x] B3.3 `test-browser.js` 全 33 场景通过（含新断言），修复前后各复跑确认
- [x] B3.4 提交 + `git push origin main`

## 不做什么（防越界）

- 不改 `<img>` 路径的既有结论（只把它的一段抽成函数供复用）
- 不给背景图加"最小尺寸 / 重复贴图"门（会动到评论缩略图既有能力）
- 不改站点档案选择器表、掩码契约、`svi:*` 键面
- 不动 `test-extension.js`（并发会话正在改它）
