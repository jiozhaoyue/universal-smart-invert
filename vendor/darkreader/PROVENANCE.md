# 固化第三方产物：Dark Reader 引擎

本目录是**冻结的**第三方产物。它由脚本同步，**不得手改**；升级走 `scripts/vendor-darkreader.js`。

## 是什么

Dark Reader 的**页面级深色主题引擎**（dynamic theme：读站点计算样式 → 生成深色 CSS → 注入样式表）。
我们把它作为「页级暗化」的可选引擎引入，让本插件专心做它更擅长的部分（媒体反色、Dark Reader
做不到的效果），并在用户已装 Dark Reader 时**让位而不是叠加**（避免双重滤镜把页面压得发灰）。

本目录只放**引擎**，不含 Dark Reader 的扩展外壳（popup / options / 图标 / 站点修复表）。

## 溯源

| 项 | 值 |
| :--- | :--- |
| 上游 | https://github.com/darkreader/darkreader （MIT，© Dark Reader Ltd.） |
| 发布渠道 | npm `darkreader`（官方发布包，UMD 形态） |
| 版本 | **4.9.133** |
| tarball | `https://registry.npmjs.org/darkreader/-/darkreader-4.9.133.tgz` |
| tarball SHA-256 | `7ce63a583d0961ff719aa97e28554767bd509d7f17508ffcda34570b98b67805` |
| 本目录 `darkreader.js` SHA-256 | `82619e7a0bcabbea15a91488bc74fd0f9ba8f8f2a1cc67527f78166037cce166` |
| 本目录 `darkreader.js` 字节数 | 355381 |
| 冻结日期 | 2026-09-27 |

`darkreader.js` 与 `LICENSE` 是**逐字节拷贝**（未做任何修改）。校验入口：

```bash
node scripts/vendor-darkreader.js --verify
```

## 为什么冻结而不是持续跟随

- 上游是**扩展**形态的活跃项目（每周多次提交）。跟随意味着我们要一直处理它的内部重构，
  而我们对它的用法只落在**一个稳定的公开 API**上（`enable / disable / isEnabled / setFetchMethod`），
  这个 API 多年未变 —— 冻结的成本远低于跟随。
- 冻结使「我们自己的」变更可评审：本仓的 diff 里不会混入上游噪音。
- 升级是**显式动作**：改 `PINNED` 版本号 → `--update` → 跑冒烟 → 单独一个提交。

## 升级步骤

```bash
node scripts/vendor-darkreader.js --update 4.9.134   # 拉取 + 逐字节替换 + 重算溯源表 + 跑冒烟
node test.js && node test-browser.js                # 门禁
```

`--update` 会在覆盖前打印新旧哈希与体积差，并要求 `--yes` 才真正写入。

## 已知边界（诚实记录）

- 该文件是 **UMD**：若页面上下文里已存在 `exports` / `module`（某些打包站），它会走 CommonJS 分支
  而**不挂 `window.DarkReader`**。扩展形态（隔离世界）不受影响；用户脚本形态在打包站上可能遇到。
  适配层对此的处理是「探测不到就当没有」并记一次可观测提示，绝不静默半死。
