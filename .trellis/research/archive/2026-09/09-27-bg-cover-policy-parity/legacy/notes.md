# notes.md — 背景图/海报的封面豁免（执行留证）

## 症状与根因

用户报告：**B 站收藏夹（播放列表）封面被整张错误反色。**

根因不是 B 站特有，而是**两条判定路径的策略不对等**：

| 路径 | 位置 | 改动前 |
| :--- | :--- | :--- |
| `<img>` / SVG image / input[type=image] | `ImageInvertEngine.decideImage` | `classifySmallElement` + `passesImagePolicy`（balanced：`gridSiblings ≥ 4` 或 `chromeContext` → 跳过） |
| `background-image` | `BgImageEngine.processEl` | **只有 `≥32×32` 尺寸门**，随即直落像素判定 |
| `<video poster>` | `MediaCoverageEngine.processPoster` | **同样没有结构性豁免** |

⇒ 同一张浅色图，用 `<img>` 渲染会被判"封面→跳过"，换个渲染方式（背景图 / 海报）就按像素亮暗整张反色。
中文站点（B站、知乎、微博、豆瓣）的卡片封面大量使用 `background-image`，因此整片封面被无差别反色。

## 修法（单一实现点）

- `passesCoverGuard(info)`：`passesImagePolicy` 的**结构性子集**（内容上下文 / 网格 ≥ 4 / 页面骨架），
  `passesImagePolicy` 的 balanced 分支改为委托它 —— 结构性判据**只有一份实现**。
  单测里加了一致性矩阵（`pip(info) === pcg(info)` 在 4×2×2 组合下成立），把"两处各写一份必然漂移"钉死。
- `buildBgGuardInfo(el, url)`：背景图/海报侧的守卫输入（复用 `detectChromeContext` /
  `detectGridSiblings` / `closestContextHit`；URL 路径段并入 `META_ICON_RE` 以覆盖头像目录）。
- `BgImageEngine.matchesDeclaredSelector(el)`：**声明式优先** —— 命中站点档案 `bgImageSelectors`
  的元素（如 B站评论缩略图 `.b-img__inner`）不受启发式豁免约束。刻意只测该清单，不把
  `[style*="background"]` 泛化发现混进去（否则守卫永不生效）。
- 可观测：`bgCoverGuarded` / `posterCoverGuarded` 计数 + `SKIP_REASON_ZH['bg-cover']`
  文案 + 面板统计新增「封面豁免」一行。

## 取证

### 夹具设计（同 URL、同像素、同尺寸，唯一变量是结构）

bench 主夹具页新增 `#cover-bg`（`a.video-card > div.cover` 内的背景图）与 `#plain-bg`（同 URL 独立背景图），
两者都用 `/img/white-diagram.svg`、220×130。**同 URL 保证像素结论相同**（背景图引擎按 URL 缓存），
因此结论差异只可能来自结构守卫。媒体页新增 `#poster-video-card`（卡片内海报），与既有 `#poster-video`
（独立海报）构成同款 A/B。

### 负向对照（证明断言咬得住）

临时把 `processEl` 的守卫调用短路（`if (false && …)`）后单跑 bench：

```
11. Card cover (bg):  data-svi-bginv = true  (Expected: false — 与 <img> 路径同源豁免)
    bgCoverGuarded counter:  0 (Expected: >= 1)
Test failed with error: AssertionError: 卡片封面内的背景图必须不反色 (与 <img> 路径同源豁免; 修前必红)
```

断言**变红并指名元素**，不是空真。恢复守卫后连跑均绿。

### 修复后实测

| 检查 | 结果 |
| :--- | :--- |
| `#cover-bg`（卡片封面） | `data-svi-bginv = false` ✓ |
| `#plain-bg`（独立背景图） | `data-svi-bginv = true` ✓（守卫未越界） |
| `#bg-thumb`（既有夹具） | `true` ✓（既有能力零回归） |
| `#poster-video-card` | 无 `data-svi-poster` ✓ |
| `#poster-video`（独立海报） | `data-svi-poster = light` ✓ |
| `posterCoverGuarded` | 1 ✓ |
| 六道门禁 | 全绿（bench 33/33 场景） |

## 同轮修掉的两处**测试脚手架**假红（非本片产品范围，但阻塞门禁）

### S1 `test-browser.js` 场景 1 的固定 4s 等待 → 有界轮询

原写法 `await new Promise(r => setTimeout(r, 4000))` 在机器繁忙时会让跨域 SVG 的
`fetch → blob → <img>` 兜底解码链来不及跑完，断言以「CORS SVG 没反色」变红 —— **红因貌似指向产品，实为等待不足**。

改为**等待权威结论**（有界 25s）：

- 每个 `<img>` 夹具必须拿到**非临时**（非 `provisional`）结论，或已登记失败；
- 背景图引擎必须已出该 URL 的结论（`engines.bgImage.cache`）。

**踩坑记录（重要）**：第一版条件写成"有 `data-svi-checked-src` 标记即算落定"——
而档 B 的 `keep/local-context` 是等待解码期间的**临时结论**，它也写这个标记。
于是把"升级窗口"误判成"产品没反色"，连续复现了三次不同形态的假红。
最终靠把引擎内部态（`decisionBySrc` 的理由码 / `provisional` 标记 / `pendingEls` /
`complete`+`naturalWidth`）打进报告才定位清楚 —— 这几项留作永久诊断能力。

### S2 场景 25 的 `dim 预设不透明度取自 MASK_PRESETS` 偶发

源码注释里已登记过这条偶发（读到上一档 `solid` 的 opacity）。原修法是"属性到位后固定睡 400ms"，
仍是拿概率赌过渡结束。改为**有界等待计算值等于 `MASK_PRESETS[档].opacity`**（3s）。
超时后照旧读真实值交给断言，诊断力不降（断言文案里带 `实测 / 期望`）。

## 类同病扫描（用户要求「查这类通病，有没有别的」）

| 入口 | 结构性豁免 | 处置 |
| :--- | :--- | :--- |
| `ImageInvertEngine.decideImage`（img / SVG image / input[type=image]） | 有 | 本片把结构性三条抽为 `passesCoverGuard` |
| `BgImageEngine.processEl`（background-image） | **原无** | **本片修** |
| `MediaCoverageEngine.processPoster`（`<video poster>`） | **原无** | **本片修**（列表页里海报即封面） |
| `MediaCoverageEngine.processCanvas`（`<canvas>`） | 无 | **刻意不豁免**：canvas 内容是程序化图表/示意图，不是摄影封面；且 8×8 探针本就要求不透明像素 ≥ 8。已写进 spec |
| 视频画面（HIL 状态机） | 不适用 | 视频内容反色是产品核心，不属"封面"语义 |
| `ImageFxEngine`（特效/区域变换） | 不适用 | 由用户/区域掩码驱动，不做亮暗判定 |

## 未做（如实记录）

- 未给背景图路径引入「最小尺寸 / 重复贴图」门：会动到 B站评论缩略图这一既有能力，属另一件事。
  该不对称已写进 spec 并注明理由。
- 未改站点档案选择器表、掩码契约、`svi:*` 键面、`REGION_MASK_VERSION`。
- 未动 `test-extension.js`（并发会话正在改它）。
