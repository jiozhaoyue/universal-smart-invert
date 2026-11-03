# Implement: v6-2 部分反色渲染层

> 复选框**随执行实时勾选**（全局规则 §4.5）。每阶段末尾给「验证」与「回滚点」。
> 四绿门禁在阶段 9 统一跑，但每阶段收尾至少跑 `node --check` 与 `node test.js`。
> 上游契约：`.trellis/spec/frontend/region-mask-contract.md`（冻结，只消费）。

## 前置

- [ ] 依赖确认：v6-1 掩码契约已冻结并归档（`09-25-v6-auto-region`，spec 已沉淀）
- [ ] 契约确认：本片**只**通过 `window.__svi` 的 `makeRegionMask` / `validateRegionMask` /
      `regionMaskTake` 消费掩码，**不得**出现第二处分割实现（`check.jsonl` 里有 grep 核查项）
- [ ] 开关确认：`regionRender` 默认 `false`（本片全程保持默认关，浏览器基线零回归）

---

## 阶段 0 — 骨架、开关、诊断 ✅ 完成

- [x] `RegionRenderEngine`（section **20.5**，插在媒体覆盖引擎之后、StatsManager 之前）：
      `mount` / `unmount` / `unmountAll` / `recalc` / `diagnostics` / `rootVerdict` / `positionedAncestor`
- [x] 偏好注册 + 钳制：`regionRender`（false）/ `regionHeartbeatMs`（1000，200~5000）/
      `regionOverlayMax`（8，1~50）/ `regionStaticOnly`（false）
- [x] `StatsManager` 计数键（已进 `freshCounters()` 闭合键集）：`regionOverlaysMounted` /
      `regionOverlaysUnmounted` / `regionRecalcs` / `regionRenderDegrade*`（10 条原因码）
- [x] 导出到 `window.__svi`（含纯函数与引擎句柄，供单测与 v6-3 挂载点）
- [x] 单测：开关钳制；关闭时 `mount`/`tryMount`/`unmount` **全是纯短路**（零节点、零属性、零计数）；
      诊断形状与降级原因可观测

**验证**：`node --check`；`node test.js`（「v6.2 单测」块）。
**回滚点**：只新增骨架与偏好，`git revert` 即净。

---

## 阶段 1 — 几何映射（纯函数，R3 / D2）✅ 完成

- [x] `regionContentRect(natW, natH, boxW, boxH, fit, posX, posY)`：按 CSS 语义算内容盒矩形
      （`fill`/`contain`/`cover`/`none`/`scale-down` + `object-position` 百分比偏移）
- [x] `regionBoxGrid(mask, rect, elemW, elemH, n)`：掩码重采样成**元素盒坐标网格**，
      内容盒之外一律 0（保持原色）
- [x] 矢量表达走 `regionRenderExpr` → **复用 v6-1 的 `deriveRegionExpr`**（不做第二套矩形分解）
- [x] 单测：五种 object-fit + object-position 贴角；letterbox 边距保持 0；洞随变换搬位；
      cover 裁切；退化（固有尺寸未知 → fill；空盒 → 全 0）

**验证**：`node test.js`。
**回滚点**：纯函数，独立 revert。

---

## 阶段 2 — 覆盖层挂载与卸载（R1 / D1 / D5 / R8）✅ 代码与单测完成，DOM 行为待阶段 9 bench

- [x] 覆盖层节点：`div.svi-region-overlay`（CSS 已并入 `injectStyles`：
      `position:absolute; pointer-events:none; z-index:1; backdrop-filter: var(--svi-img-filter)`
      —— 滤镜串**只引用变量**，与整图路径逐字符一致的由构造保证）
- [x] D5 定位：`positionedAncestor()`（优先 `offsetParent`，否则上溯查 `position`），
      取不到 → `no-positioned-ancestor` 降级；**绝不改站点 position**
- [x] 挂载时撤销元素级反色（`applyInvertState(el, false, 'region-render')`）并打 `data-svi-region`；
      元素移动换祖先时覆盖层跟着搬
- [x] 卸载：移除覆盖层（clipPath 容器在其内部，随层回收）+ 摘属性 + 计数
- [x] 全站拆除接入：`stripSviSideEffects()` 的查询表与拆除列表都加了 region 一族
- [x] 参数变更失效接入：`clearCacheAndRescan()` 递增 `epoch`、清祖先链缓存、`unmountAll`
- [x] 单测：降级路径与关闭态短路（DOM 级断言：本体 filter 为 none、滤镜串逐字符一致、
      零残留、不挡点击 → **阶段 9 的浏览器 bench 覆盖**）

**验证**：`node --check`；`node test.js`；`node test-browser.js`（阶段 9 新增 v6 场景）。
**回滚点**：`regionRender=false` 时不进入该路径。

---

## 阶段 3 — 掩码表达（R2 / D2 后半）✅ 完成（含评审门 G1）

- [x] `bitmap` → 元素盒网格编码为 PNG **data URL**（同步；见偏离 1：不用异步 blob，
      省掉一整类生命周期管理）+ `mask-image` + `mask-size: 100% 100%` + `mask-repeat: no-repeat`
- [x] `vector` → `<svg><clipPath clipPathUnits="objectBoundingBox">` + `clip-path: url(#…)`；
      `holes` 用「铺满 rect + 洞 rect + `clip-rule: evenodd`」组合，`islands` 只放孤岛 rect
- [x] `<clipPath>` 容器**挂在覆盖层内部** → 移除覆盖层即同时回收定义（不需要额外登记表）
- [x] **评审门 G1 通过**：`grep` 核查分割实现仍只有 section 12.5 一处；本层只读
      `mask.data / expr / polarity / source`，未重建分割、未改掩码结构
- [x] 单测：**矢量表达反推的区域集合 === 元素盒网格**（构造性等价，I7 在渲染层的前提）；
      位图字节长度与灰度映射；空内容盒不产出「整块反色」

**验证**：`node test.js`。
**回滚点**：表达选择在引擎内部，关开关即净。

---

## 阶段 4 — 祖先链探测与降级（R4 / D3，**最高风险**）✅ 完成

- [x] `regionRootVerdict(styles)`（纯函数，单测契约）：命中 `filter` / `opacity<1` /
      `mix-blend-mode` / 自身 `backdrop-filter` 即判失败并给出原因码；
      `RegionRenderEngine.rootVerdict(el)` 负责沿 `parentElement` 收集样式快照
- [x] 结果缓存（`WeakMap` + `epoch`），**不进热路径**：只在挂载/重算时调用，
      帧内同步路径零新增 `getComputedStyle`
- [x] 命中 → 不挂覆盖层、退回整图判定、分原因计数（`ancestor-filter` / `-opacity` /
      `-blend` / `-backdrop`）
- [x] 单测：四类祖先各自触发；原因取链上**最近**的那个；字段缺失/空串视为正常（不误判）

**验证**：`node test.js`。
**回滚点**：同上。

---

## 阶段 5 — 与元素级滤镜互斥（R7 / D4）✅ 完成

- [x] `regionMutexVerdict(el, st)`（纯函数）：图片特效属性门生效 → `mutex-fx`；
      视频画面调节（属性门 `data-svi-vtune` 或运行期 `state.videoTune.enabled`）→ `mutex-tune`
- [x] 优先级：**用户显式滤镜 > 部分反色**（不挂覆盖层、降级 + 分原因计数）
- [x] 单测：互斥矩阵（特效 / 特效被 kill switch 关掉 / 视频调节属性门 / 运行期 / 图片不受视频调节影响）；
      降级时元素上零 region 痕迹

**验证**：`node test.js`。
**回滚点**：同上。

---

## 阶段 6 — 全屏 / PiP（R5）✅ 完成

- [x] `fullscreenchange`（含 `webkit-` / `moz-` 前缀）：全屏元素（或其内部元素）的覆盖层
      **暂停**（卸载但记住 src/key），退出后恢复；`restore` 时掩码已不在缓存 → 显式 `no-mask` 降级
- [x] `enterpictureinpicture` / `leavepictureinpicture`：同一套暂停/恢复账本
- [x] 同屏可见地可解释：进出各给一次 toast（`全屏中已暂停部分反色…` / `已恢复部分反色`）
- [x] 监听只在**有覆盖层时**存在（第一层挂上才装、最后一层拆掉就撤 + 清掉清扫定时器）
- [x] 单测：暂停-恢复账本、无全屏元素时 no-op、未挂载元素进 PiP 时 no-op
- [x] bench：桩 `fullscreenElement` + 合成 `fullscreenchange` → 断言暂停/恢复与账本（30i）

**验证**：`node test.js`；`node test-browser.js`（30i）。
**回滚点**：同上。

---

## 阶段 7 — 视频/GIF 重算调度（R6 / D6）✅ 完成（浏览器侧受 fixture 限制，见下方边界）

- [x] `recalc(el, why)`：重采样（`analyzeSrc(wantGrid)`）→ 显式失效同键缓存 → 重新分割 →
      **判定指纹没变就只更几何、不重挂**（省一次重挂与闪烁）
- [x] 视频：场景跃变（接 v5-4 的唯一状态收口 `setInvertState`，节流 300ms）+ `seeked` 事件 +
      心跳；GIF：仅心跳（`regionHeartbeatMs`，200~5000）
- [x] 帧间沿用：掩码不逐帧重算（反色本身由合成器逐帧重采样，探针已验证）
- [x] 预算：单元素 1 层（结构决定）；全局 `regionOverlayMax` 超限 → 不挂载 + `overlay-budget` 计数
- [x] `regionStaticOnly`：视频/GIF 直接不挂层（规避掩码滞后，这是 D6 的已知代价，面板需如实标注）
- [x] **评审门 G2 通过**：帧间不重算（指纹比对）、预算生效、静态开关生效
- [x] 单测：静态图零调度 / 动图识别（v5-4 判定原因优先、扩展名兜底）/ 静态开关 / 暂停账本

**边界（如实记录）**：浏览器 bench 里的 `<video>` fixture **没有 src**（既有场景只用它们验海报与
class 断言），因此无法在 bench 里驱动真实视频帧。R6 的端到端验证以**单测**覆盖调度决策，
另加 bench 侧"同一元素重算后判定未变则不动 DOM"的间接覆盖；真实视频的场景跃变实测留给
v6-3 之后的真机验证（已写入 spec 的已知限制）。

**验证**：`node test.js`。
**回滚点**：同上。

---

## 阶段 8 — 开关、诊断与提示（R9）✅ 完成（面板 UI 区块属 v6-4）

- [x] 四个开关全部可读写并生效（`regionRender` / `regionHeartbeatMs` / `regionOverlayMax` /
      `regionStaticOnly`）
- [x] `RegionRenderEngine.diagnostics()`：覆盖层数 / 暂停数 / 监听态 / 降级次数（分原因）/
      最近一次降级·重算·卸载原因 / 上限
- [x] 降级提示：**每个原因每会话只提示一次**的中文 toast（`REGION_RENDER_DEGRADE_TEXT` 单一真源），
      避免一页几十张图命中同一原因时 toast 风暴
- [x] 单测：开关生效、关闭后零覆盖层、降级原因可观测
- [x] bench：降级 toast 文案可见（30f）

**验证**：`node test.js`；`node test-browser.js`。
**回滚点**：同上。

---

## 阶段 9 — 浏览器 bench、四绿、文档、沉淀 ✅ 完成

- [x] `test-browser.js` 新增 **Scenario 30**（真 Chrome + 合成器出图 + 像素采样）：
      - [x] 默认关闭 → 零覆盖层 / 零属性（基线零回归）
      - [x] 真实判定管线驱动挂载；元素本体 `filter: none`；`data-svi-inverted` 已撤销
      - [x] 覆盖层滤镜串与元素级路径 **computed 值逐字符一致**（且只引用 `--svi-img-filter` 变量）
      - [x] 覆盖层几何与元素盒逐像素对齐；`pointer-events: none` + `elementFromPoint` 穿透
      - [x] 掩码语义：浅底被反色 / 色块保持原色
      - [x] **位图 vs 矢量像素级等价**（同掩码两种表达，采样点逐通道 ≤4 容差）
      - [x] `object-fit: contain` letterbox：边距保持原色、内容盒对齐
      - [x] 祖先带 `filter` → 零覆盖层 + 降级原因可观测 + toast 可解释
      - [x] 全屏进出：暂停/恢复 + 账本
      - [x] 元素移除 → 零残留 + 账本一致
      - [x] 关闭开关 → 全清
- [x] **评审门 G3 通过**：四绿全绿 + 上述像素级断言全过
- [x] `AGENTS.md` / `README.md` / `README_EN.md`：部分反色渲染层章节（含掩码滞后的已知代价）
- [x] spec 沉淀：`region-mask-contract.md` 补「渲染层实现要点」一节（覆盖层载体、几何映射、
      mask 的两条硬约束、降级原因码、清理纪律）
- [x] 提交（中文 message + `Co-Authored-By`）

**验证**：四绿全绿（`node --check` / `test.js` / `test-browser.js` 30 场景 / build+pack）。
**回滚点**：整片 revert 无数据迁移；或 `regionRender` 留关闭态。

---

## 评审门（review gates）

| 门 | 时机 | 判据 |
| :--- | :--- | :--- |
| **G1** | 阶段 3 后 | 契约消费方向正确：只读 `RegionMask`，零第二处分割实现 |
| G2 | 阶段 7 后 | 调度与预算：帧间不重算、预算生效、静态开关生效 |
| G3 | 阶段 9 | 四绿 + 像素级断言（等价 / 对齐 / 不挡点击 / 零残留 / 降级可观测） |

## 与计划的偏离记录

> 格式：`偏离 N — 原计划 / 实际 / 原因`。前四条都是**实测逼出来的**（浏览器 bench 抓到，
> 单测抓不到 —— 它们全在"真实合成器如何解释 CSS"这一层）。

**偏离 1 — 位图表达用同步 data URL，不用异步 blob URL。**
原计划（design D2 / 阶段 3）写 `canvas.toBlob` → `blob:` URL + 淘汰时 revoke。
实际：`canvas.toDataURL('image/png')` 同步产出，直接喂给 `mask-image`。
原因：① 同步 —— `toBlob` 是异步的，挂载会变成"先挂空层再补掩码"，中间会闪一帧全反色；
② 16×16 的 PNG 只有几百字节，blob 的对象 URL 生命周期（延迟 revoke）在这里纯属自找麻烦。
代价：data URL 字符串常驻 DOM（可忽略）。若将来网格放大到 64×64，再评估回到 blob。

**偏离 2 — `mask-image` 走的是 **alpha** 通道，不是亮度。**
原计划（阶段 3）只写"编码为 PNG 灰度图"，我最初按 0/255 灰度写 RGB 且 alpha 全 255。
实测：**整块元素盒都被反色** —— 因为 CSS mask 的默认 `mask-mode: match-source` 对栅格图用
**alpha**；alpha 全 255 等于整块遮罩。
实际：RGB 一律白，**"不反色"的格写 alpha=0**（透明）。
这条已写入 spec 的「渲染层实现要点」，是本层最容易踩且单测抓不到的坑。

**偏离 3 — `<clipPath>` 的多个子元素之间是**并集**，不是 evenodd 组合。**
原计划（阶段 3）写"外框 rect + 洞 rect + `clip-rule: evenodd`"。
实测：整盒照样被反色 —— 因为 clipPath 内多个子元素按**并集**计算，「整盒 ∪ 洞」= 整盒。
实际：**单条 `<path>` 内含全部子路径 + `clip-rule: evenodd`**（洞在外框内部 → 交叉数为偶 → 挖掉），
与探针 `dev/probe-partial-backdrop.js` 的 `sviDonut` 用例同构。
另：clipPath 容器**不能放在被裁剪元素内部**（放同级兄弟），且容器位置随覆盖层搬。

**偏离 3b（同一条实测的两个伴生坑）— 掩码查找必须支持「元素直连」与「src 直连」。**
原计划：渲染层按 `regionMaskKeyFor(el)` 查字符串键取掩码。
实测踩到两次静默不挂（决策明明记为 `region` 却没有覆盖层）：
① **键漂移** —— 键含固有尺寸，判定时机可能早于图片加载完成（此时 `naturalWidth = 0`），
   挂载时再算键就变成另一个值 → 查不到；
② **同 src 决策复用** —— `decideImage` 按 src 复用结论，同一张图的第二个元素直接重放决策、
   不会再算网格，于是按元素/键都查不到那份掩码。
实际：判定时同时落三份直连（元素 `WeakMap` → src `Map`（上限 200，随缓存一并清空）→ 字符串键兜底），
`regionRenderTryMount` 依次尝试。**掩码只由图像内容决定、与元素无关**，所以按 src 直连在语义上是成立的。

**偏离 4 — 覆盖层几何用显式 `left/top/width/height`，不用 `inset: 0`。**
原计划（design D2/R1）写 `inset: 0`。实际：覆盖层的 containing block 是**定位祖先**（不是媒体元素），
`inset:0` 会把祖先整块盖住。实际用元素相对定位祖先的 `offsetLeft/offsetTop/Width/Height` 精确对齐
（这些读只在挂载/重算时发生，不进帧内同步路径）。

**偏离 5 — 与视频画面调节的互斥以 `state.videoTune.enabled` 为唯一真源。**
原计划（阶段 5）想加一个 `data-svi-vtune` 属性门。实际：项目里根本没有这个属性 ——
视频调节是"内联 filter 链 = 反色链 + 调节链"的一段，真源就是 `state.videoTune.enabled`。
实际实现不另立属性门（避免两处开关漂移）。

**偏离 6 — 降级提示是「每原因每会话一次」的限流 toast，而不是只留面板数据。**
原计划（阶段 8）写"面板提示属 v6-4，本片只给数据"。
但 PRD R4 同时要求"绝不静默失效"、R7 要求"冲突时提示可见"。实际：除诊断数据外，
每个降级原因**每会话只弹一次**中文 toast（`REGION_RENDER_DEGRADE_TEXT` 单一真源）；
否则一页几十张图命中同一原因会 toast 风暴。bench 里断言了该文案可见。

