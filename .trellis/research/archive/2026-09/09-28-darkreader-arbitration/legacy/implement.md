# implement.md — 固化产物 + 页级暗化仲裁（执行计划）

> 复选框随执行**实时勾选**（本片边做边勾，落盘时间晚于执行，如实记录）。

## 阶段 R0 — 取证与选型（先证明可行，再动仓库）

- [x] R0.1 取 npm 官方包 `darkreader@4.9.133`（MIT / UMD / 355381 字节），检查公开 API 面
- [x] R0.2 **冒烟**：headless Chrome 里加载 bundle → `enable(theme)` 生效（body 变 `rgb(20,30,36)`）、
      `exportGeneratedCSS()` 出 3056 字节、`disable()` 复原、零异常 —— 确认"可直接喂进页面"
- [x] R0.3 确认面板 UI 那条线已在 v6.4 完成（token 逐值照搬 Dark Reader theme.less），本片只做引擎侧

## 阶段 R1 — 固化产物 + 溯源 + 门禁

- [x] R1.1 `vendor/darkreader/{darkreader.js, LICENSE}` 逐字节拷贝
- [x] R1.2 `vendor/darkreader/PROVENANCE.md`（版本 / tarball URL 与 SHA-256 / 文件 SHA-256 与字节数 / 冻结日期 / 升级步骤 / 已知边界）
- [x] R1.3 `scripts/vendor-darkreader.js`：`--verify` / `--update <ver> [--yes]`，
      零依赖 tar 解析 + **HTTPS_PROXY CONNECT 隧道**（直接 https.get 在本机 TLS 超时，实测）
- [x] R1.4 双形态（CLI 退出码 / `require` 抛错），接入 `test.js` 门禁
- [x] R1.5 实测：`--verify` 绿；篡改文件后**变红并给出记录哈希与实测哈希**；
      `--update 4.9.133` 预演拉到的字节与原文件**哈希一致**（独立复核溯源）
- [x] R1.6 `vendor/darkreader/README.md`：角色 / 协作表 / 三条注入路径与代价

## 阶段 R2 — 仲裁层

- [x] R2.1 纯函数 `pickPageDarkPlan`（三态决策表）+ `mapPrefsToDarkReaderTheme` + `darkReaderGlobal`
- [x] R2.2 `applyPageDarkForSite(want)` 作为**唯一入口**，7 个 `applyBackgroundReplace` 调用点全部收敛
- [x] R2.3 `pageDarkState.owned` 记账（定义在 boot 早期调用点之前，避免 TDZ）
- [x] R2.4 失败回退：`enable()` 抛错 → 回退自有路径 + `pageDarkDelegateFailures`
- [x] R2.5 偏好 `pageDarkEngine: 'auto'|'native'|'darkreader'`（默认 auto）+ loadState 校验 + 默认值
- [x] R2.6 可观测：三个计数 + 面板「页级暗化引擎」设置行（in-page 模态与 schema 两处）
- [x] R2.7 单测：决策矩阵（缺席/在场/已跑/owned 四象限）+ theme 映射（恒等 / 色调流入 / 字体 / 描边钳制）

## 阶段 R3 — bench 真引擎验证（不用桩）

- [x] R3.1 新夹具页 `/pagedark-page`（浅色静态页，两种形态都可观测）
- [x] R3.2 场景 34：把 **vendor 里的真 bundle** 经 CDP 注入页面（= 用户装了 Dark Reader）
- [x] R3.3 三态断言：34a 缺席走自有（`bgReplace.active === true`）/ 34b 委托并让位
      （`isEnabled` 真、`bgReplace.active` 假、计数 +1、body 真的变暗）/ 34c 已跑的引擎不得被我们关
- [x] R3.4 踩坑修正：夹具必须先等 boot 再建立基线（否则 boot 期已按残留偏好委托过一次）；
      并显式 `statsEnabled = true`（别的场景会把它关掉，`StatsManager.count` 直接 no-op，
      计数断言会以 "0 → 0" 变红，看上去像产品没计数）

## 阶段 R4 — 门禁与提交

- [x] R4.1 版本 0.6.7 → 0.6.8（`@version` / `SCRIPT_VERSION` / README 当前版本表述）+ 重建 `extension/`
- [x] R4.2 六道门禁全绿（bench 34 场景）
- [x] R4.3 提交 + `git push origin main`

## 不做什么（防越界）

- 不改扩展权限面（`scripting` / `host_permissions`）—— 权限扩张留用户拍板
- 不跟随上游版本、不引入 npm 依赖、不改构建为打包器
- 不改媒体判定管线
- 不手改 `vendor/darkreader/` 里任何文件
