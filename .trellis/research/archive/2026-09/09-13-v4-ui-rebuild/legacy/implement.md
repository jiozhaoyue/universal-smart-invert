# Implement: v4 设置页重构 + 站点电源热生效

## 顺序清单
1. [ ] 引擎挂起接口：image `suspend()/resume()`；video 状态机 `suspendAll()/resumeAll()`；
       bgImage 扫描闸门；全局 `runtime.siteSuspended` 入口 early-return。
2. [ ] `evaluateSitePower()/applySitePower()` + 挂接点（电源开关、名单、siteMode、规则导入）。
3. [ ] bench 新场景：热关闭同帧断言（类/属性清零）→ 重开不刷新恢复。
4. [ ] v4 CSS 组件（.svi4-switch/.svi4-tabs/.svi4-card/.svi4-tri）+ 头部电源开关。
5. [ ] 页签化主体：buildSiteTab()/buildGlobalTab() 重排全部设置项，三态继承行组件
       `ui.triRow()`；解散旧 8 区块；锚点 id 保留。
6. [ ] 更新 test-browser UI 断言；溢出探针覆盖新组件。
7. [ ] README/README_EN、@version 4.0.0、@description 同步。
8. [ ] 门禁：node --check / test.js / test-browser.js / build+pack / check-panel-overflow。
9. [ ] 提交并推送 origin main。

## 验证命令
```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js
node scripts/check-panel-overflow.js
node scripts/build-extension.js && node scripts/pack.js
```

## 回滚点
步骤 3 后（纯功能层）与步骤 6 后（UI 层）各为可回滚提交点。
