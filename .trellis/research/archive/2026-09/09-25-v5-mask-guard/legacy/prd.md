# PRD: v5-5 加载前遮罩 — 先遮住，判定完再放

## 背景（现状核查 + 硬约束）

现状 `setupFlashGuard()`（v4.3）只做一件事：当**本站将走动态主题路径**
（`getSiteProfile().bgReplace === true`）时，`document_start`/`document-end` 起步即给
`html` 与 `body` 铺 `background:#000!important`，等 `data-svi-bgr-on` + `data-svi-bgr-bg`
就绪后撤黑（2.5s 兜底）。

**不覆盖的场景**：图片反色路径。用户在原话里点出的正是这个 ——
「先看到刺眼的纯白 PPT 截图，过几十毫秒才被反色成深色」，这一下白闪没法被文档级黑底消掉，
因为问题在**元素**上，不在文档背景上。

### 必须说清的硬约束（父 PRD 约束 2）

| 形态 | `@run-at` | 能否做到「首帧前遮罩」 |
| :--- | :--- | :--- |
| 用户脚本 | `document-end` | **不能**。脚本运行时首屏元素已解析并多半已渲染 |
| Chrome 扩展 | `document_start` | **能**。content script 在文档创建前注入 |

结论：**真·加载前元素遮罩只有扩展形态能做到**。用户脚本形态只能覆盖「脚本启动之后
动态插入的元素」，首屏走文档级黑底兜底。面板必须显式标注这个差异（v4.6 版本自检徽标是
同类问题的先例 —— 不能让用户以为开关坏了）。

## Requirements

### R1 — flashGuard 三档
用户可见设置为 `flashGuardLevel: 'off' | 'document' | 'media'`（默认 `'document'`，
**等价于 v4.3/v4.6.1 现状行为**；旧布尔偏好 `flashGuard` 迁移为 `'off' => 'off'`，
`true => 'document'`）：

| 档 | 行为 |
| :--- | :--- |
| `off` | 零介入 |
| `document` | 文档级黑底（现状语义与触发条件完全不变） |
| `media` | `document` 档 + **元素级 pending 遮罩**（本任务新增主体） |

- **AC**: 旧偏好迁移单测（`true`/`false`/缺失三种输入）；`document` 档行为与 v4.6.1 逐字节一致。

### R2 — 触发条件：本站「已知会反色」才启用（保守门）
不得无条件遮罩（白藏图片比白闪更烦人）。只有满足以下任一条件才进 `media` 档实际生效：
- 本站命中 `BUILTIN_RULES` 的 `forceInvert` 或站点档案 `imageInvert` 开启且有过反色记录；
- 本站存在学习规则（`RuleLearner.rulesFor(host)` 非空且含 `invert`）；
- **本站历史反色率**：新增持久化 `svi:siteMedia{ host: { seen, inverted, at } }`，
  上次会话 `inverted / seen >= siteInvertRate`（默认 0.35）且 `seen >= siteMinSeen`
  （默认 5）→ 判为「已知会反色站」。
- 首访站点无从预知 → **不遮**（保守，宁可白闪一次也不白藏）。
- 面板显示本站为何启用/未启用（一行原因），并提供「本站强制启用 / 本站禁用」覆盖。
- **AC**: 单测四类触发条件（命中/未命中/边界/首访）；bench 断言未命中站不产生
  `data-svi-pending` 属性。

### R3 — 元素 pending 遮罩（扩展形态）
- **样式注入**：`document_start` 处（早于首帧）经 `GM_addStyle` 注入属性门：
  ```
  [data-svi-pending]:not([data-svi-settled]) { <遮罩风格> }
  ```
  风格复用 **v5-1 的遮罩风格预设**（R3）—— pending 期默认取 `dim`（暗色半透明），
  可切 `solid` / `frost`；不提供除预设外的自定义，避免两处风格定义漂移。
- **同步打标**：`MutationObserver` 在 **`document_start` 即安装**，观察
  **`document`（不是 `documentElement`）** —— v4.6.1 已踩过此坑：`document_start` 时刻
  `documentElement` 仍为 `null`，`observe(null)` 抛错被 catch 吞掉后**静默退回轮询**。
  回调内（微任务检查点，通常早于 paint）给新增 `img` / `video[poster]` / 背景图元素打
  `data-svi-pending`。
- **摘罩**：判定完成即写 `data-svi-settled`（invert 与 keep 都算完成），属性门立即失效；
  加 120ms `opacity` 淡入（`prefers-reduced-motion` 时跳过过渡）。
- **绝不遮的元素**（白名单，命中直接 `settled` 不打标）：已在 `protect` 列表中、
  尺寸低于最小判定门（反正不会反）、`data-svi-manual` 已存在（用户已表态）。
- **AC**: bench（扩展形态）断言：首屏图片在被反色前**从未以原色出现过**
  （用逐帧截图或属性门存在性时序断言）；判定完成后 `data-svi-pending` 全部摘除。

### R4 — 用户脚本形态的诚实降级
- 用户脚本形态下：`media` 档**只对脚本启动之后动态插入的元素**生效；
- 面板在该档下显示一行说明：「用户脚本形态在 `document-end` 启动，首屏元素已渲染，
  遮罩仅覆盖后续动态插入的媒体；如需首屏零白闪请使用扩展形态」；
- 首屏仍由 `document` 档黑底兜底（若本站适用）。
- **AC**: bench（用户脚本形态）断言面板显示说明文案；首屏元素**不**被打 pending 标记。

### R5 — 三层预算兜底（遮罩绝不伤人）
| 预算 | 默认 | 超限行为 |
| :--- | :--- | :--- |
| `maskBudgetMs` 总时长 | 1200ms | 全部摘罩放行 + `maskBudgetExceeded` 计数 |
| `maskMaxElements` 元素数 | 80 | 超出部分不打标（最早打标的保留） |
| `maskSettleTimeoutMs` 单元素 | 800ms | 该元素单独摘罩放行 |

- **判定失败必放行**：`markFailure` / 分析失败 / 跨域失败 / `analyzeSrc` 返回
  `{ok:false}` → **立即**摘罩放行原图。绝不允许「拿不到像素就把图藏起来」。
- **全局逃生**：`Esc` 或胶囊上的「立即显示全部」按钮 → 一次性摘除全部 pending 并暂停
  本会话后续遮罩（记入 `runtime`，仅本次会话）。
- **AC**: 单测三个预算各自触发路径；bench（模拟分析全失败页）断言 1.2s 内元素全部可见；
  `Esc` 逃生路径断言。

### R6 — 开关与可观测
- `flashGuardLevel`（默认 `document`）、`maskStyle`（默认 `dim`）、三个预算值、
  `siteInvertRate` / `siteMinSeen` 阈值全部可调。
- 面板新增只读诊断行：本会话遮罩次数 / 平均遮罩时长 / 预算超限次数 / 失败放行次数。
- **AC**: 各开关单测；诊断计数在 bench 中可断言。

## Constraints

- 遮罩样式**只从 v5-1 预设取**，不在此处新增风格定义。
- pending 属性门必须**纯 CSS**（不用 JS 逐元素设 inline style），否则会与 v4.6「属性写点
  唯一收口」纪律冲突。
- 不得在首帧路径上引入 `getBoundingClientRect`（会造成强制同步布局）；尺寸门在判定阶段
  已有，遮罩打标阶段一律不查布局。
- 与 `dim` 动作（v5-1 R4）职责区分：`dim` 是用户主动的全页压暗；本任务是**自动的临时待判遮罩**。

## Acceptance Criteria（汇总）

- [ ] 三档设置 + 旧布尔偏好迁移正确；`document` 档与 v4.6.1 行为一致
- [ ] 触发门四类条件单测全绿；未命中站零属性写入
- [ ] 扩展形态 bench：首屏图片零白闪（属性门时序断言）
- [ ] 用户脚本形态：面板显式说明差异，首屏不打标，动态元素生效
- [ ] 三层预算 + 失败必放行 + `Esc` 逃生全部验收
- [ ] 平均遮罩时长与预算超限计数可观测
- [ ] 全关时 `node test.js` / `node test-browser.js` 与 v4.6.1 一致
- [ ] 四绿门禁全绿
- [ ] 文档：README / README_EN 明确区分两形态能力边界（不得含糊）

## Notes

- 依赖 v5-1 的遮罩风格预设与 `resolveAction`；依赖 v5-4 的判定时序（遮罩摘除挂在
  判定完成事件上，v5-4 的提前切换会让遮罩期更短，二者天然同批）。
- 本片与 v4.3「防闪光守卫」是同一思路的两个层级（文档背景 vs 元素），`flashGuardLevel`
  一次性统一两者开关，避免面板出现两个含义相近的开关。
