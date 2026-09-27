# PRD — 页级暗化引擎仲裁：固化 Dark Reader 引擎并与之协作而非叠加

## 用户原话与拆解

> 「要让插件的 ui 完全是 dark reader，但是要我们的维护性高，我们把 dark reader 包含进去，
> 但又不太想一直像他们维护，一直拉他们代码，我们主要是对媒体的 dark，以及 dark reader 做不到的地方」

拆成两件**彼此独立**的事，本片只做能确定的那部分：

| 子句 | 解读 | 状态 |
| :--- | :--- | :--- |
| 「ui 完全是 dark reader」 | **面板 UI 的视觉**：v6.4 已按用户 2026-09-26 裁决把 Dark Reader `theme.less` 的配色**逐值照搬**进设计 token（`--svi-bg: #141e24` 等），三处消费点同源 | **已完成（上一个任务）** |
| 「把 dark reader 包含进去 / 不想一直拉他们代码 / 我们主要是媒体」 | **页级暗化引擎**：用它的引擎做整页变暗，我们专注媒体；且**不跟随上游** | **本片** |

## 目标

1. **冻结**：把 Dark Reader 的引擎作为可验证的固化产物纳入本仓，升级是显式动作。
2. **协作而非叠加**：页面上已有 Dark Reader 时，本插件让位（不叠加两套滤镜把页面压灰）；
   缺席时走自有的页级暗化路径，**逐字节等价于旧行为**。
3. **绝不劫持**：用户自己开的 Dark Reader，我们只读不动（收尾也不得关掉它）。
4. **可观测**：委托 / 让位 / 委托失败回退都要有计数与中文提示，不静默。

## 非目标

- **不改扩展的权限面**。扩展形态下按需注入引擎需要新增 `scripting` + `host_permissions` ——
  这是用户可见的权限扩张（Chrome 会提示"需要新权限"），**留待用户拍板**，不由 AI 单方面做。
- 不跟随上游版本、不引入 npm 依赖、不改构建为打包器。
- 不把 Dark Reader 的扩展外壳（popup / options / 站点修复表）搬进来。
- 不改媒体判定管线（那是本插件的主场）。

## 验收标准

- **AC1 冻结可验证**：`vendor/darkreader/darkreader.js` 与 `PROVENANCE.md` 记录的 SHA-256/字节数一致；
  `LICENSE` 为 MIT 全文；篡改文件后门禁**变红并给出实测哈希**（已实测）。
- **AC2 缺席等价**：页面上没有 Dark Reader 时，`applyPageDarkForSite` 的行为与旧
  `applyBackgroundReplace` 逐字节一致（纯函数矩阵 + bench 实测）。
- **AC3 委托并让位**：引擎在场且未在跑、且本站需要页级暗化时 → 由引擎接管（`isEnabled` 为真、
  页面真的变暗），且本插件自有页级改色**关闭**（`bgReplace.active === false`）。
- **AC4 不劫持**：引擎已在跑时，`applyPageDarkForSite(false)` **不得**把它关掉。
- **AC5 记账**：只有"本插件请它开的"那一次，才由本插件关（`owned` 记账；`release` 后引擎关闭）。
- **AC6 可观测**：`pageDarkDelegated` / `pageDarkAdopted` / `pageDarkDelegateFailures` 计数 +
  面板「页级暗化引擎」设置行。
- **AC7 六道门禁全绿**；bench 用**真实 bundle** 而非桩验证三态。

## 约束

- 版本号同变更内提升（0.6.7 → 0.6.8）并重建 `extension/`。
- 固化产物**不得手改**；一切改动走 `scripts/vendor-darkreader.js`。
