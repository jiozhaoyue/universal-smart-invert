# v4.6-1 技术设计：本地优先判定（网络无关）

## 1. 问题模型

当前决策门是「资源就绪（网络完成）后才判」：

```
IO 交叉 / eager pass → 过滤 (complete && naturalWidth>0) → processImage
   ├─ ready  → decideImage
   └─ !ready → 挂 load 一次性监听（等网络）→ 之后才 decide
```

弱网下 `!ready` 是**常态**：占位图、`loading=lazy`、`data-src` 延迟替换、图片 CDN 慢，
都让元素长时间停留在"不判定"状态。视觉结果 = 保持原样（亮），观感即"该反的没反"。

## 2. 目标模型

把「判定依据」从**网络语义**改为**本地渲染语义**：

```
localEvidence(el) = {
  hasDecodedPixels: 同源可读 / 已解码 / 缓存可读,
  box:              已布局且有非零尺寸,
  visible:          非 display:none / visibility:hidden,
  cssContext:       元素及其祖先的已知 computed 样式（背景色/遮罩/角色）,
  role:             META_ICON / avatar / logo / content 等既有分类结果,
  inlineHint:       内联 width/height/背景色等本地声明
}

三档判定：
  档 A（像素可读） → 沿用既有像素管线（analyzeSrc）
  档 B（像素不可读但 cssContext + box 可得） → 上下文判定（本地保守规则）
  档 C（连布局都没有） → 不判定，登记为 pending（只登记、不挂网络等待）
```

关键点：**档 B 是本次新增的主路径**，用于把弱网下的"不判定"变成"本地保守判定"。
档 C 只登记，由既有 IO/Mutation 后续事件自然唤醒（不再新增长期 `load` 挂起）。

## 3. 契约

| 契约 | 说明 |
|---|---|
| C1 | `decideImage` 的输入（快照键）不变，仅**扩展证据来源**，优先级序列不变 |
| C2 | 新增判定原因码：`local-context` / `local-inline-hint` / `pending-no-evidence`（可审计） |
| C3 | `pending` 元素必须**可被后续事件重新唤醒**：保留 `data-svi-checked-src` 未写状态 |
| C4 | 幂等：同一元素的档 A→档 B 升级不得造成判定翻转（档 B 结论须与档 A 一致或更保守） |
| C5 | 性能：档 B 判定只读 computed style + 有限层祖先（≤N 层，N 建议 3），结果入快照缓存 |
| C6 | 无网络：`gmFetchText` 不出现在任何自动路径；`@connect` 收敛 |

## 4. 联网路径收敛方案

- `@connect *` → 收敛为**空**（若手动导入不再需要），或保留但明确"仅手动"。
  手动导入是用户显式动作，属"用户要求的联网能力"；用户本次要求「彻底剥离运行时联网能力」，
  建议：**保留手动导入 UI，但移除 `@connect *` 改为按需 `@connect` 白名单 + UI 明示**，
  并在 prd 记录该选择。
- 无论如何：`gmFetchText` 调用点必须唯一且被用户动作触发（可 grep + 单测断言）。

## 5. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 档 B 误判率高 → 新的错误反色 | 档 B 只允许输出 `keep`（保守）或"沿用角色规则"，不允许仅凭 cssContext 输出 `invert`，除非命中既有种子规则 |
| 性能回退（大量 getComputedStyle） | 预算化 + 结果缓存 + 只在档 A 不可用时才走 |
| decide-once 被破坏 | 单测断言：同一输入两轮结论相同；soak 探针 5 次重载一致 |
| 回滚 | 单提交粒度：`localEvidence` 引入 + 档 B 可独立 revert（保留 feature flag：`state.localFirstDecide`，默认 true，可关） |

## 6. 验证策略

1. 单测：`localEvidence` 分类矩阵、档位选择、pending 唤醒、幂等。
2. bench：新增场景「未 complete 的 img 在限速下必须给出档 B 结论」。
3. 真机：`scripts/probe-github.js <url>` + CDP 限速；断网对照。
4. soak：`dev/probe-soak.js` 5 次重载稳态一致。
