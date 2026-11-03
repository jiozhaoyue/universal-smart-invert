# design-assets ④ · 三处界面截图基线（SHA `3f7b245` + Step A-0）

> ⚠ **重要口径修正（2026-09-29 Step A-0）**：本目录的 popup / options 截图是
> **修完 token 注入缺陷之后**拍的。修复前这两个界面**完全没有主题**（浅色、`.logo` 与 chip
> 边框都没画出来）—— 原因见 `01-token-diff.md` 末节与 PRD R16。
> 因此：
> - **页面内面板**的 4 张图 = 未做任何改动前的真实形态（panel 的 token 一直正常），
>   可直接作为 Step A 的 before。
> - **popup / options** 的图 = 「token 已生效、但尚未做 Step A 视觉改造」的形态，
>   这才是这两个界面在 Step A 的**有效 before**（此前的浅色形态是缺陷态，不是设计基线）。
> - 缺陷态的**证据**不靠这张图：由 `research/probe-token-application.js` 的 CSSOM 输出
>   （`--svi-bg` 空串 / `body` 背景 `rgba(0,0,0,0)` / `color-scheme` normal）承担，比截图更硬。

> 用途：AC5「对齐 Dark Reader」的**人工评审物**，也是「前 4 次重建只做机制层验收」的补丁
> ——（`01-VERIFY` §⑤.6：历史 design 的测试计划里从未出现视觉可交付物）。
> 产出于 Step 0（改动前），Step A/C/D 落地后须**就地更新**为 after 图并保留 before 作对照。

## 一、页内面板（用户脚本形态）

命令：

```bash
node scripts/panel-shot.js --width 480 --height 940
```

产物归档于 `shots-baseline/`（`scripts/panel-shot.js` 原始输出在 `dev/shots/panel-<ts>/`）：

| 文件 | 内容 |
|---|---|
| `shots-baseline/panel-global.png` | 设置模态「全局」页签（480×940 @dsf2） |
| `shots-baseline/panel-site.png` | 设置模态「本站」页签 |
| `shots-baseline/panel-readability.png` | 可读性区块（滚动后） |
| `shots-baseline/capsule.png` | **悬浮胶囊药丸**（收起态，贴在视口右缘） |

### 基线肉眼观察（Step 0 实测，作为改造前状态记录）

1. **设置模态**：页头有 `×`（`.svi-modal-close`）与「居中 / 靠左 / 靠右」布局钮；
   底部「恢复默认值」（红描边）+「完成并关闭」（青色填充）。
   —— 模态**有**关闭入口，**用户投诉的「没有关的地方」不是指模态**。
2. **胶囊药丸**（`capsule.png`）：半贴在视口右缘的圆角小块，**通体无任何关闭/收起控件**，
   唯一收起途径是「点页外」或再点一次药丸 → **R1 复现**（`research/03` §4）。
3. **圆角**：模态里几乎每个容器都带圆角（页签、能力卡、下拉、数值框、按钮）→ R6 要改为直角。
4. **页签**：「本站」选中＝青色填充；「全局」未选中＝**无任何边框**（`.svi4-tab { border:none }`）→ R2。
5. **能力卡/按钮描边**：可见但极低对比（`--svi-ctl-hover` 1.38:1）→ 与 ③ 表一致。

## 二、扩展 popup（三页签）

命令（Step 0 新增的 `--shots` 开关，见下）：

```bash
node test-extension.js --shots <dir>
```

| 文件 | 内容 |
|---|---|
| `shots-baseline/ext/popup-filter.png` | popup「反色」页签 |
| `shots-baseline/ext/popup-sites.png` | popup「本站」页签（含本站开关 + 名单摘要） |
| `shots-baseline/ext/popup-more.png` | popup「更多」页签（三个入口按钮） |

## 三、扩展 options 页

| 文件 | 内容 |
|---|---|
| `shots-baseline/ext/options-full.png` | options 整页（`captureBeyondViewport`，11 组 / 94 项） |

## 四、复现通道（Step 0 新增能力）

`test-extension.js` 新增**可选** `--shots [dir]` 开关（默认关闭，不改变任何断言语义）：
- 在场景 6 的三页签处各截一张；
- 在场景 7 的 options 渲染完成后整页截一张。

选择理由：popup / options 是 `chrome-extension://` 页面，**只能**在真扩展语境下渲染
（`file://` 打开会因缺 `chrome.*` 落到 `body.unavailable`，`nav.tabs` 与 `.panel` 被 CSS 隐藏 →
截图什么都看不到）。`test-extension.js` 已是唯一能驱动真扩展的夹具（CDP `Extensions.loadUnpacked`），
在其中加截图是最小改动，且**复用它的打桩与等待逻辑**，不另起一套。

## 五、after 图更新点

| 步骤 | 更新哪些图 |
|---|---|
| Step A（视觉） | 全部：panel-*/capsule/popup-*/options-full |
| Step B（关闭模型） | `capsule.png`（应出现显式关闭控件） |
| Step C（取色器） | panel-global、options-full（取色器形态变更） |
| Step D（单一真源） | popup-*（作用域徽标）、options-full |
