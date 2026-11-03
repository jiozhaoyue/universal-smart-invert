# design.md — 背景图路径的封面/骨架豁免（单一实现点）

## 1. 问题定位（现状链）

`BgImageEngine.processEl`（`universal-smart-invert.user.js`，§18）现有闸门，按序：

1. `resolveStage(el, ctx, 'override')` —— 手动结论 / 用户元素规则（用户显式意图，最高）
2. `resolveElementAction(el)` —— 元素级 hide/mask 动作规则
3. **尺寸门**：`w > 0 && h > 0 && (w < 32 || h < 32)` → return
4. `extractCssUrls(bg)` → `decideUrl(url)` → `analyzeSrc` → 亮则 `data-svi-bginv=true`

而 `<img>` 路径（`decideImage`）在第 4 步之前还有两道结构性闸门：

- `classifySmallElement(buildClassifyInfo(img))` —— `META_ICON_RE`（头像/表情/目录特征）+ 小尺寸×重复/骨架
- `passesImagePolicy(info)` —— balanced 档：`contentContext` 放行；`maxDim < 96`、`gridSiblings ≥ 4`、
  `chromeContext` 三者任一 → 跳过

**两条路径的第 3/4 步之间少了一整段。** 这就是"同一张图换个渲染方式结论就翻"的原因。

## 2. 修法：抽出唯一实现点，两条路径共用

### 2.1 新增纯函数（唯一定义处，紧邻 `passesImagePolicy`）

```js
// 封面/骨架豁免 (纯函数, 单测契约): passesImagePolicy 的**结构性**子集 ——
// 不含量尺寸与策略档位, 因为背景图路径的尺寸语义与 <img> 不同 (评论缩略图刻意要反)。
// 两条判定路径共用这一份实现, 避免策略漂移 (同一张图换渲染方式即翻结论)。
function passesCoverGuard(info) {
  if (!info) return true;
  if (info.contentContext) return true;        // 正文上下文放行 (与 passesImagePolicy 同序)
  if ((info.gridSiblings | 0) >= 4) return false;  // 网格贴图
  if (info.chromeContext) return false;            // 页面骨架 / 卡片 / 封面容器
  return true;
}
```

`passesImagePolicy` 的 balanced 分支改为委托它：

```js
    // balanced
    if (maxDim < 96) return false;
    return passesCoverGuard(info);
```

（`conservative` / `aggressive` 分支**逐字不动** —— 它们的语义由既有单测钉着，本任务不碰。）

### 2.2 背景图侧的输入构造（新增小函数，`buildClassifyInfo` 的兄弟）

`buildClassifyInfo` 依赖 `getMediaSrc` / `srcCountMap`（img 专用）。背景图另写一个**最小**构造器，
只喂守卫真正读的三个字段 + 一次元数据命中判定：

```js
function buildBgGuardInfo(el, url) {
  // meta 并入背景 URL 路径段: 头像目录 (/face/, /avatar/) 是比 class 更可靠的特征
  // gridSiblings / chromeContext / contentContext 与 <img> 路径同源复用既有检测器
}
```

刻意**不**复用 `classifySmallElement` 的全部门（`below-min` / `tiny` / `repeat` 都会改变背景图既有行为，
属另一件事），本任务只对齐"封面/骨架"这一段。

### 2.3 挂载点：`processEl` 的尺寸门之后

```js
      // 尺寸门 (既有, 不动)
      if (w > 0 && h > 0 && (w < 32 || h < 32)) return;

      // v6.x: 与 <img> 路径同源的封面/骨架豁免。声明式优先 —— 命中站点档案 bgImageSelectors
      // 说明站点档案**显式声明**了"这些背景图就是要反的" (B站评论缩略图 .b-img__inner 等),
      // 显式声明的意图压过启发式豁免。
      if (!this.matchesDeclaredSelector(el)) {
        const g = buildBgGuardInfo(el, firstUrl);
        if (!passesCoverGuard(g)) { StatsManager.count('bgCoverGuarded'); return; }
      }
```

**为什么"声明式优先"是必要的**：`candidateSelector()` = `[style*="background"]` ∪ `bgImageSelectors`。
前者是泛化发现（不可信），后者是站点档案里的显式清单（可信）。若不区分，B 站评论缩略图（内联背景 +
在 `.reply-image` 下）可能被 `chromeContext` 误伤，正是 README 明文记录的能力回归。

**实现要点**：`matchesDeclaredSelector(el)` 只对 `bgImageSelectors` 单独求 `matches`，
不得把 `[style*="background"]` 混进去（否则守卫永不生效）。

### 2.4 可观测（AC6）

- `StatsManager.count('bgCoverGuarded')`：跳过计数（面板统计区可见）。
- 复用既有跳过原因中文映射新增一条：`'bg-cover' → '封面/骨架（保持原样）'`，
  写进 `SKIP_REASON_ZH`（该表是用户可见文案的单一来源）。

## 3. 风险与取舍

| 风险 | 说明 | 取舍 |
| :--- | :--- | :--- |
| 误伤有意的背景图反色 | 某些站点把正文配图放 `[class*="cover"]` 容器里 | 站点档案可显式声明 `bgImageSelectors` 豁免（2.3），且用户可 Alt+点击改判为反色（override 段在守卫之前，不受影响） |
| `chromeContext` 过宽（`[class*="icon"]` 等） | 会连带跳过一些本该反的背景图 | 这是**与 `<img>` 路径取齐**的已知取舍；不对齐本身就是缺陷。若要收紧，应作为独立任务同时收紧两条路径 |
| 尺寸语义不一致 | 背景图仍无"最小尺寸/重复"门 | 刻意保留（评论缩略图能力）；在 spec 里明确写下这条不对称及理由 |

## 4. 验证设计（AC1/AC5 的落地）

在 bench 主夹具页加两个元素，**同 URL、同像素、同尺寸（220×130）、同浅色图**
（复用 `/img/white-diagram.svg`）——唯一变量是**结构**：

| id | 结构 | 期望 |
| :--- | :--- | :--- |
| `cover-bg` | `<a class="video-card"><div class="cover" style="background-image:…">` | **不反色**（AC1） |
| `plain-bg` | 同 URL 的独立 `<div style="background-image:…">` | **反色**（守卫不得越界） |

同 URL 保证像素判定结论相同（`decideUrl` 按 URL 缓存）⇒ 差异**只能**来自结构守卫。

**AC5 负向对照**：在未修复的代码上跑，`cover-bg` 必为 `data-svi-bginv=true` ⇒ 断言变红并指名元素。

## 5. 兼容与回滚

- 回滚点：`git checkout -- universal-smart-invert.user.js test-browser.js`。
- 版本：0.6.6 → 0.6.7（`@version` / `SCRIPT_VERSION` / 重建 `extension/`）。
- 不改 `svi:*` 键面、`REGION_MASK_VERSION`、掩码契约、站点档案表。
