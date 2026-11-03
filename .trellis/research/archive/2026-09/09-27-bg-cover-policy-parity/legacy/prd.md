# PRD — 背景图路径缺封面/骨架豁免（B站收藏夹封面误反色的通病根因）

## 背景与症状

用户报告：**B 站收藏夹（播放列表）的封面被错误反色，且是整张全反色。**

排查中发现这不是 B 站独有，而是**两条判定路径的策略不对等**：

| 路径 | 入口 | 已有的"封面/骨架"豁免 |
| :--- | :--- | :--- |
| `<img>` / SVG image / input[type=image] | `ImageInvertEngine.decideImage` | ✅ `classifySmallElement` + `passesImagePolicy`（balanced 档：`gridSiblings ≥ 4` 或 `chromeContext` → 跳过） |
| `background-image` | `BgImageEngine.processEl` | ❌ **只有一道 `≥32×32` 尺寸门**，随即直接进像素判定 |

后果：**同一张浅色图，用 `<img>` 渲染会被判"封面→跳过"，用 `background-image` 渲染则一律按像素亮暗直接反色。**
B 站收藏夹/播放列表的封面、以及大量中文站点（知乎、微博、豆瓣、腾讯视频）的卡片封面正是用
`background-image`（含内联 style 与站点 `bgImageSelectors`）渲染的，因此整片封面被无差别反色。

第二条不等价处：背景图路径也没有 `META_ICON_RE`（头像/表情目录）这道元数据门。

## 目标

1. 让**封面/网格/页面骨架**这类结构性上下文在两条路径上得到**同一结论**（单一实现点）。
2. 不误伤既有的、有意的背景图反色能力：站点档案里**显式声明**的 `bgImageSelectors` 属"声明式意图"，
   优先于启发式豁免；独立（非卡片/非网格/非骨架）的浅色背景图仍应照旧反色。
3. 失败可归属：新增的门必须能被面板/统计观测（跳过原因可读），不得静默。

## 非目标

- 不改 `<img>` 路径既有行为（`passesImagePolicy` 的档位语义逐字不变）。
- 不改区域分割内核、掩码契约、`svi:*` 键面。
- 不引入"封面识别"的新启发式来源（如 URL 关键词黑名单）；本任务只做**两条路径的对齐**。
- 不动站点档案的选择器表（那是另一件事：声明式表是用户可编辑面）。

## 验收标准（可测）

- **AC1 结构对等**：同一 URL、同一像素内容、同一渲染尺寸下，"卡片/封面容器内" 的背景图与 `<img>`
  得到**相同**结论（都不反色）；独立的背景图仍反色。
- **AC2 单源**：豁免判据只有**一份实现**（一个纯函数），`passesImagePolicy` 与背景图路径都调用它；
  单测直接对纯函数断言（含边界：contentContext 优先、gridSiblings 阈值 4、chromeContext）。
- **AC3 声明式优先**：命中站点档案 `bgImageSelectors` 的元素**不受**启发式豁免约束（B 站评论缩略图
  `.b-img__inner` 等既有能力不回归）。
- **AC4 既有能力零回归**：`node test.js`、`node test-browser.js`、`node test-extension.js` 全绿；
  尤其 bench 的 `#bg-thumb`（独立浅色背景图）仍 `data-svi-bginv=true`。
- **AC5 负向对照**：在**未修复**的代码上，新加的夹具断言必须**变红**并指名元素（证明断言咬得住，不是空真）。
- **AC6 可归属**：跳过时统计计数递增，面板"本页已处理/跳过原因"能看到该元素属于哪一类（不是无声跳过）。

## 约束

- 版本号同变更内提升（`@version` + `SCRIPT_VERSION` + `extension/manifest.json` 重建）。
- 门禁六绿后才提交；提交即推送（项目铁律）。
- 不手改 `extension/`（构建产物）。
