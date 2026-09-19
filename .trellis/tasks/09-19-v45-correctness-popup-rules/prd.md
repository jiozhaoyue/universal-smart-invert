# v4.5: 反色正确性修复+悬停预览开关+高优接管+规则分发+弹窗面板+数据进化+响应式

## Goal

Fix wrong inversions and broken hover-preview-off toggle; add document-start takeover, distributable site-rule packs, DarkReader-style toolbar popup, data-driven improvement loop, responsive/mobile UI; run 5h+ visual browser test cycles

## Requirements

### 缺陷（用户报告）

1. **错误反色**：脚本出现极多误判（错误反色/漏反色/白块）。
2. **悬停显示原图开关失效**：关闭后鼠标放图片上仍然必然显示原图。

### 已查明根因（本轮修复）

- **悬停开关失效** = 设置行回显系统性缺失：内联 `sec.add(ui.xxxRow(...))` 的行只登记进
  `ui.section()` 的区块本地 `syncs`，而模态全量刷新 `modalControls.syncAll` 只遍历全局
  `rowSyncs` —— 复选框/下拉永远不回显真实状态（悬停开关显示"未勾选"而功能实际开启），
  用户第一次点击反而写入相反值。修复：6 个静态内联行逐一 `this.rowSyncs.push(...)`。
- **错误反色/白底泄漏**：
  - flash guard（`html[data-svi-flashguard] body{background:#000!important}`）在 bgr 初始
    扫描采样窗口内把 body 判为纯黑 → 底色桶永久缺失 → 页面底色保持白色。
    修复：startScan 在守卫存续期延迟 300ms 重试；守卫撤除（off）时对 html/body 补打标 + applyCss。
  - `requestIdle` 在无头/CDP/重载环境可被无限推迟（实测 4s+ 不触发）→ 扫描无界延迟、
    基准 Scenario 21 不稳定。修复：rIC + `setTimeout(timeout+100)` 双通道竞速、单次执行。
  - 基准自身：Scenario 21 实败但管道 `| tail` 掩盖退出码（CI 假绿）——直接跑时看退出码。

### 增强需求（验收标准）

1. **高优先级接管**：任何情况下脚本先于页面渲染介入，防止加载出任何白色（flash guard 强化，
   不再依赖"幸运的 mutation 补打"）。✅ 零白交接：守卫等 body 底色桶就绪才撤黑（2.5s 兜底）
2. **站点规则导入/分发**：✅ 从链接导入 + 导出学习成果 + `rules/svi-pack.import.json` 一体化包
3. **扩展工具栏弹出面板**：✅ Dark Reader 式 popup（电源/预设/策略/特效/悬停/统计），
   onMessage 通道复用设置面板处理器，单测 + 冒烟断言覆盖
4. **数据驱动改进**：✅ 学习成果包导出/合并链路（隐私安全只含特征/命中数）+ rules/README 记录
   维护者转正流程
5. **响应式/移动端**：✅ 窄屏全宽面板 + 16px 输入（防 iOS 缩放）+ 粗指针触控目标
6. **5h+ 循环**：进行中——真实站点视觉测试已覆盖 GitHub/Wikipedia/BBC（截图判定），
   Stack Overflow/MDN/B站/知乎 排队中

### 视觉测试发现并修复的额外缺陷

- **文档根上下文污染（重大）**：`[class*="content"]` 命中 Wikipedia `<html>` 上的
  `vector-feature-limited-width-content-enabled` → 全页图片被判"正文上下文" → 站标被反色。
  修复：`closestContextHit` 忽略 html/body（含单测 + 探针验证 logo 不再反色）
- **透明底守护**：透明占比 ≥60% 的"浅色"判定改 keep（`transparent-light`）——透明底图形
  为其背景设计，反色必坏

## Acceptance Criteria

- [x] 悬停开关回显 + 写值修复（6 行登记）+ 探针验证（回显 true、双向切换、类同 tick 跟随）
- [x] flash guard 扫描污染修复（startScan 延迟 + off 补打）——probe-bgr 实测 t=1s body=rgb(20,20,20)
- [x] requestIdle 硬兜底
- [x] 回归：bench Scenario 20b（设置行回显审计 + 单击写值 + 类同 tick）
- [x] 回归：Scenario 21 baseline 加固（fresh load body 必须带桶、guard 必须交接）
- [x] 视觉探针 `scripts/visual-probe.js`（真实站点 前后截图 + 决策报告）
- [x] 四绿门禁（node --check / node test.js / node test-browser.js 100% / build+pack）
- [x] 扩展 popup 可用且 bench 冒烟覆盖（manifest.action + 协议断言 + 语法检查）
- [x] 真实站点视觉测试：GitHub(camo 反色正确) / Wikipedia(修复后 logo 保持) / BBC(照片保持)
- [x] @version bump + README/README_EN v4.5 段 + @description 同步
- [ ] commit + push

## Notes

- extension/content.js 为生成物，每次 user.js 变更后必须 `node scripts/build-extension.js`。
- UI 字符串中文、标识符 ASCII、`// ===== N. =====` 区块横幅。
- 收集数据绝不自动上传（stats 导出仅手动）。
