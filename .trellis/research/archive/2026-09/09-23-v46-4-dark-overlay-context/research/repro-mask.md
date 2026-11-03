# repro-mask: 暗色遮罩上下文误反色复现报告 (v4.6-4 第 0 步)

> 环境: worktree `v46/impl-4`（基线 b1219f2, 脚本版本 4.5.0, 未改任何生产代码）。
> 探针: `dev/probe-veil-fixture.js`（独立临时 profile + 端口 9331, 与并行 worktree 的
> test-browser 固定 profile/9222 端口互不争用; `Runtime.evaluate` 导航后注入, 遵循 spec
> v3.3 「document-start 注入丢样式」教训）。
> fixture: `dev/fixtures/dark-veil.html`（离线单文件, 全部图片为内联 canvas 生成的同源
> data URI, 零网络依赖）。

## 一、复现结论

**A 案误反色成立**：亮图叠加 62% 黑色 `::after` 蒙层后，合成观感已明显偏暗（见截图 A 格），
但引擎仅按图片自身像素判定 → `verdict=invert / reason=pixel / data-svi-inverted=true`。
反色滤镜叠加在已有暗蒙层上，破坏站点作者设计的合成观感 —— 与用户描述完全一致。

**场景解释的必要修正（回写 prd Notes）**：design.md §1 示例把蒙层写成容器自身
`background: rgba(0,0,0,.6)`。经实测与绘制顺序分析：**祖先容器自身背景绘制在图片之下**，
不透明图片完全遮住它，不会压暗图片。真正形成「暗色蒙层」的是**绘制在媒体之上的层**：
`::before/::after` 绝对定位覆盖层、同容器兄弟覆盖层节点、低不透明度媒体叠深色实底
（opacity 合成）。fixture 与检测器均按此修正后的形态建模。

## 二、四案例矩阵实测（改动前基线, repro-before.json）

| 案例 | 构造 | inv (data-svi-inverted) | verdict | reason | 基线评价 |
|---|---|---|---|---|---|
| A | 亮图 + 黑 62% `::after` 蒙层 | **true** | invert | pixel | **误反色（bug 复现）** |
| B | 亮图 + 无蒙层 | true | invert | pixel | 正常（应保持） |
| C | 亮图 + 白 62% 蒙层 | true | invert | pixel | 正常（浅蒙层不豁免） |
| D | 暗图 + 黑 62% 蒙层 | false | keep | pixel | 正常（应保持） |
| E | 亮图 + 兄弟覆盖层蒙层（形态 2） | **true** | invert | pixel | **误反色（补充形态）** |
| F | 亮图 opacity 0.55 + 深色实底（形态 3） | **true** | invert | pixel | **误反色（补充形态）** |
| ctl-1..12 | 普通亮图，无蒙层 | 全部 true | invert | pixel | 防误伤基线（修复后必须不变） |

- `totalChecked: 18/18`，`pageExceptions: []`（无脚本异常）。
- 原始证据:
  - `research/repro-before.json`（探针完整输出）
  - `research/repro-before.png`（页面截图: A 格合成已暗但仍被反色）
  - `research/probe-before-run.log`（探针运行日志, EXIT=0）

## 三、对设计/检测策略的影响

1. 检测器（`maskedDarkContext`）按「绘制在媒体之上的层」实现三种高置信形态：
   - 形态 1: 祖先 `::before`/`::after` 绝对定位暗色覆盖层（A 案）；
   - 形态 2: 同容器内兄弟绝对定位覆盖层节点（E 案）；
   - 形态 3: 媒体自身低不透明度（<0.9）叠祖先深色实底（F 案）。
2. 判定准则（合成观感）: 以「最亮白像素经蒙层合成后的亮度」`255*(1-α)+veilLum*α < 150`
   为阈值 —— 黑 62% → 97 ✓；白 62% → 255 ✗（C 案天然不触发）；黑 20% → 204 ✗（弱蒙层不触发，
   保守）。design.md §4 矩阵中 D 案 `masked=false` 按「否决未生效」理解: 检测器对 D 案几何上
   返回 true，但暗图走像素 keep 路径，遮罩否决只拦截「自动反色」结论，故 D 案最终
   `keep/pixel` 不变（已与 design 意图对齐）。
3. `Page.addScriptToEvaluateOnNewDocument` 未使用（避免 v3.3 已知丢样式坑）。

## 四、真站复现状态

- 未完成（诚实声明）：本环境对 github.com 的直连/代理连通性未在本轮验证，
  且并行 worktree 共享 CDP 出口，未在本步强行消耗网络预算。
- 补偿证据：A/E/F 三种形态均为真实站点的高频本地形态（个人主页头图渐变压暗、
  弹窗遮罩、低不透明度头图），fixture 的离线复现已覆盖 AC 的机制验证；
  真站验证留待探针网络可达时用 `node dev/probe-veil-fixture.js` 思路外推
  （探针已支持任意 URL 传入的改造点）。
