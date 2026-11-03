# Implement: AGPL 迁移 + 字体与可读性

1. [ ] LICENSE 替换 AGPL 全文; 头注释/README/PUBLISHING/dev-loader 全部切换; @version 4.1.0。
2. [ ] DEFAULT_PREFS + loadState 规范化 + FONT_STACKS + updateFontCss + CSS 门类规则。
3. [ ] 挂接: boot / onRemoteLoaded / stripSviSideEffects / applySitePower(resume)。
4. [ ] buildReadabilitySection 并入全局页签组合。
5. [ ] bench Scenario 20 (真实点击: 全局页签 → 字体覆盖 → 断言; 描边滑杆 → 断言)。
6. [ ] 门禁全绿 + build+pack + README 徽章 + spec/journal + 提交推送 + 归档。

验证命令: node --check / node test.js / node test-browser.js / scripts/check-panel-overflow.js / build-extension+pack
回滚点: 步骤 1 后 (纯许可) 与步骤 5 后 (功能齐)。
