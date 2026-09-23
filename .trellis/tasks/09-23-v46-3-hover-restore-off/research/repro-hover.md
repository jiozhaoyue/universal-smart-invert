# v4.6-3 复现报告：关闭「悬停显示原图」后仍显示原图

> 任务：`.trellis/tasks/09-23-v46-3-hover-restore-off`
> 复现环境：Windows 11 · headless Chrome (CDP) · 探针 `dev/probe-hover-matrix.js`（本地进程内伺服 fixture，零外部网络依赖）
> 用户原话：「设置关掉『鼠标放在图片元素上显示原色』这个功能，仍然会显示，一点用都没有」

---

## 1. 结论（先答 Gate 问题）

**当前版 4.5.0 无法复现用户症状：四通道在关闭态全部正确保持反色。**

用户症状在**旧版（≤4.3.0，即 8c1ee9f 之前）**完整复现，根因是**设置行回显缺陷**，
不是悬停门控逻辑缺陷：

| # | 旧版实测证据（8c1ee9f~1 = v4.3.0，同一 fixture） | 结论 |
|---|---|---|
| 1 | 打开设置面板，`hoverRestore` 实际为 `true`（开），复选框却显示**未勾选**（`shownBefore: false`） | 回显缺失：`ui.toggleRow(...)` 返回的行对象被**内联直接传入 `sec.add()`**，其 `sync()` 从未注册进 `rowSyncs`，复选框构建后永远停在未勾选默认态 |
| 2 | 用户点击未勾选框（意图=关闭）→ `checked: true` → `state.hoverRestore = true` → `savePrefs()` 落盘 | **首次点击写回开启值**——用户"关"的动作实际把功能打开 |
| 3 | 点击后悬停已反色图 → `filter: none`（悬停仍还原原色） | 用户所见："关掉了还显示原色"，与原话逐字吻合 |
| 4 | 第二次点击才真正写 `false`（门类熄灭），此后悬停保持反色 | 旧版的**判定逻辑（v3.1 门控）本身是好的**，坏的只是面板回显/首点交互 |

修复已在 **v4.5.0（8c1ee9f）落地**：`const hoverRow = ui.toggleRow(...); sec.add(hoverRow); this.rowSyncs.push(() => hoverRow.sync());`（现 L7747-7755），Scenario 20b 已断言。

**判定：H4 成立（用户安装的是旧版脚本/旧版扩展）。按任务规则走分支 D：
不改判定逻辑，交付「版本自检 + 升级指引」。**

---

## 2. 复现方法与矩阵

### 2.1 复现基建（可复用既有件，未造轮子）

- 探针：`dev/probe-hover-matrix.js`（本任务新增）
  - 复用 `test-browser.js` 的 `SEED_SNIPPET`（双写 `svi:prefs` + legacy 键）、内联注入
    `executableScript`、`CANVAS_VIDEO_SNIPPET`（headless 视频生成）
  - 复用 `dev/probe-hover-real.js` 的 CDP 启动骨架（独立端口 9343 + tmp profile）
  - 旧版对照腿经 `git show 8c1ee9f~1:universal-smart-invert.user.js` 内存提取（只读 git）
- fixture（`/hover-matrix.html`）四通道：
  1. CSS filter 图 `<img id="m-css">`（白底 SVG，像素判定反色）
  2. 特效投递图 `<img id="m-fx">`（种子 `imgFxMode:'luma'` 时走 `data-svi-fx` content:url 投递）
  3. 背景图元素 `<div id="m-bg">`（inline background-image ≥32px，BgImageEngine 扫描打标 `data-svi-bginv`）
  4. 视频 `<video id="m-video">`（canvas captureStream，胶囊「视频反色」手动开启）
- 原始数据：`research/repro-raw-1790182219168.json`（当前版全矩阵）、`repro-raw-1790182387502.json`（旧版对照腿）

### 2.2 当前版 4.5.0 四通道 × 开关两态矩阵（真机 CDP `Input.dispatchMouseEvent` 真实悬停）

| restore | fxMode | 门类 | CSS 图悬停 | fx 图悬停 | 背景图悬停 | 视频 |
|---|---|---|---|---|---|---|
| 0 (关) | full | off | **保持** `invert(1) hue-rotate(180deg)…` ✓ | content=normal（full 模式该图走 CSS 通道，无投递）✓ | **保持** `invert(1)…` ✓ | 悬停前后 inline `invert(1)…` 不变（见 §2.3） |
| 0 (关) | luma | off | （luma 下无 CSS 通道图） | **保持** `url("blob:…")` 投递 ✓ | **保持** `invert(1)…` ✓ | 同上 |
| 1 (开) | full | on | **还原** `none` ✓ | — | **还原** `none` ✓ | 不变（视频无悬停还原，见 §2.3） |
| 1 (开) | luma | on | — | **还原** `normal`（`svi-fx-hover` 类已加）✓ | **还原** `none` ✓ | 不变 |

→ 关闭态（前两行）：**没有任何通道在悬停时还原原色**。开启态（后两行）：全部正常还原，
**无过度修复**。双向均正确。

### 2.3 视频通道专项发现（H2 副产品）

- 视频从不携带 `data-svi-inverted`（`MEDIA_SELECTOR = 'img, svg, image, input[type="image" i]'`
  不含 `video`），CSS 规则 `html.svi-hover-restore video[data-svi-inverted="true"]:hover`
  （L2156）是**死代码**。
- 视频反色走内联 `style.filter`（`applyFilterToCurrent`，`!important`），悬停前后计算样式均
  `invert(1) hue-rotate(180deg)…`（restore=0/1 两态实测一致）。
- **结论：视频通道与 hoverRestore 开关无关（两态行为一致，无还原逻辑可关）**——不是用户
  抱怨来源（用户说"图片元素"），但记录在案：L2156 建议后续清理（本任务不动，避免越权改动）。

---

## 3. H1–H6 逐条判定

| # | 候选 | 判定 | 证据 |
|---|---|---|---|
| H1 | `.svi-fx-hover` 类残留 | **不成立**（当前版） | 合成残留类 + 真实面板行关闭：`elClass:["svi-fx-hover"]` 仍在，但门类已熄灭（`gateClass:false`），`content` 保持 `url("blob:…")` —— CSS L2792 的 `html.svi-hover-restore` 前缀压制了残留类，不产生还原 |
| H2 | 其它引擎独立悬停通道 | **不成立** | 全量 grep `mouseover/mouseenter/:hover/svi-fx-hover`：JS 侧唯一 mouseover 监听即 `bindHover`（L5587，`state.hoverRestore===false` 早退）；CSS 侧全部还原规则带 `html.svi-hover-restore` 前缀（L2151-2156/L2166/L2791-2792）。视频无悬停还原（§2.3）；bgr/PiP 无悬停还原实现 |
| H3 | 写值被复位/吞掉 | **不成立** | L887 `merged.hoverRestore = merged.hoverRestore !== false` 对存值 `false` 规范化后仍为 `false`（合并逻辑正确）；面板行（L7750-7752）与弹窗消息（L9886-9889）写值后都调 `updateImageFilterCss()`；探针 H3 腿：真实行关闭 → 刷新（seed=0 读持久值）→ `gateClass:false, pref:false`；反向开启同样持久（`gateClass:true, pref:true`）。双向持久化正确 |
| H4 | 用户装的是旧版 | **成立** | §1 旧版对照腿：回显缺失 + 首点写反值 + 悬停仍还原 = 用户原话完整复现；门控类自 v3.1.0（b865ad6）即有，行回显修复 v4.5.0（8c1ee9f）才有 → **v3.1.0–4.3.0 全部受影响** |
| H5 | 门类被整体重置 | **不成立** | `updateImageFilterCss`（L1020）是门类唯一写点，始终从 `state.hoverRestore` 重算；`stripSviSideEffects`/`bootEngines` 不写门类；探针 boot 后 `html` 类集合快照正常（`repro-raw-*.json` `extras.htmlClasses`） |
| H6 | 用户关的是别的开关 | **不成立**（作为主因） | 设置键名唯一（`hoverRestore`），面板/弹窗两处写值同源；无相似文案开关。H6 的"操作错位"实为 H4 回显缺陷的表现 |

**命中分支：D（H4）。**

---

## 4. 已做修改（分支 D：不改判定逻辑）

1. **版本自检**（`universal-smart-invert.user.js`）：
   - 设置面板头部新增版本徽标 `.svi-modal-ver`（`textContent = 'v' + SCRIPT_VERSION`，
     DOM API 构建，无动态数据插值；`title` 提示与发布页比对）。
   - **不做远程版本检查**（硬规则：禁止自动网络遥测）。
   - 纯 UI 展示，不触碰悬停/反色判定路径。
2. **bench 补断言**（`test-browser.js`，防回归）：
   - Scenario 15a/15c：背景图通道悬停双态断言（关=保持反色 / 开=还原 none），补齐
     四通道矩阵中 bench 此前缺失的 bginv 腿。
   - Scenario 20b：版本徽标存在 + 与 `@version` 一致断言。
3. **探针**（`dev/probe-hover-matrix.js`）：四通道 × 两态矩阵 + H1 残留判别 + H3 双向持久化 +
   旧版对照腿（`--old-only` 可单跑）。

**未做（按分支 D 规则）**：不改 `bindHover` / `updateImageFilterCss` / CSS 门控判定逻辑。

## 5. 升级指引（回写要点，主会话可择机移入 README）

- **自查版本**：打开任意网页 → 点胶囊 → 设置面板 → 左上角标题旁徽标显示当前版本。
  - 低于 `4.5.0`：面板回显缺陷（显示与实际相反、首点写反值）在影响范围内 → **请更新**。
- **更新方式**：
  - 油猴脚本：GreasyFork / GitHub 页面重新安装最新版（管理器开启自动更新亦可）。
  - 扩展：Chrome 商店更新，或本地以 `extension/` 重新加载（版本与脚本 `@version` 同步）。
- **临时规避（无法立即升级时）**：在设置面板把「悬停显示原图」复选框**点两次**
  （第一次会写反，第二次才落到想要的值）；或控制台执行
  `__svi.prefs.hoverRestore = false; localStorage`（推荐走面板双击路径，避免手改存储）。

## 6. 遗留与移交

- `@version` 未 bump、`extension/` 未重建：分支 D 未改判定逻辑，且本 worktree 禁改
  `extension/**`；**主会话合并四个子任务时统一 bump `@version` + `node scripts/build-extension.js`**。
- L2156 死代码（视频悬停还原规则）建议后续任务清理或实现真正的视频悬停还原（超出本任务范围）。
- bench 全量跑受终端沙箱同步时长限制（~120s 被回收）：用异步终端/分段方式运行（见任务报告门禁输出）。
