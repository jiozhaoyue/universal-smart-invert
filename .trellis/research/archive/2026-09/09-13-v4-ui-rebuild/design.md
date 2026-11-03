# Design: v4 设置页重构 + 站点电源热生效

## 1. 站点电源热生效层

### 副作用面清单（suspend 必须全部撤除）
- html 类：`svi-img-invert-on`、`svi-hover-restore`、`svi-video-tune`、背景替换类。
- 元素属性族：`data-svi-inverted` / `data-svi-bginv` / `data-svi-checked-src` /
  `data-svi-fx` / `data-svi-fx-off` / `data-svi-bgr-bg|bd|fg` / `data-svi-poster`。
- 元素类：`svi-playing`、`svi-fx-hover`；特效 blob 覆盖层 `canvas.svi-fx-overlay` 移除；
  `content: url(blob)` 恢复为引擎管理的清除态（引擎 suspend 内处理）。
- style 元素：图片引擎 `styleNode`（5028）、背景图引擎样式（6111）停用/清空规则。
- 引擎活动：图片 MutationObserver 断开、bgImage 周期扫描停、视频 rVFC/轮询与 HIL
  状态机挂起、视频特效引擎 `teardown()`。
- UI：`.svi-capsule-root` 隐藏；设置模态保持（电源开关就在里面）。

### 闸门
- 全局 `runtime.siteSuspended`（内存态，绝不落盘）。所有引擎入口
  （observer 回调、周期扫描、视频发现、HIL 迁移、Alt+click）入口处 early-return。
- 与既有 `getSiteProfile().enabled === false` 判定并存：挂起态是"已解析禁用"的执行层。

### API 形状
- `evaluateSitePower()`：解析当前站点的 enabled → `applySitePower(on)`；状态变化才动作。
- `applySitePower(false)` = suspendAll（幂等）；`applySitePower(true)` = resumeAll（幂等）。
- 挂接点：本站电源开关、站点名单三态/编辑、规则文件导入后、siteMode 切换后。
- 各引擎新增最小挂起接口：image `suspend()/resume()`、video 状态机 `suspendAll()/resumeAll()`、
  bgImage 扫描闸门、fx `teardown()`（已有）。

## 2. 设置页 v4 信息架构

```
┌ ⚡ 智能反色 · github.com        [居中|靠左|靠右] ✕ ┐
│ ┌────────────── 大号电源开关（热生效）──────────┐ │
│ [本站] [全局]                                  │
│ 本站: 模式卡片行(反色|背景替换|关闭)             │
│       三态继承行: 图片反色 / 视频反色 / 背景替换  │
│       本站图片特效(继承+覆盖) / 元素级规则        │
│       当前页媒体                                │
│ 全局: 默认引擎与策略 / 外观 / 站点名单 /          │
│       颜色保护 / 数据与备份(统计网格保留) / 技巧  │
└───────────────────────────────────────────────┘
```

- 三态继承模型：每行 `跟随全局 | 强制开 | 强制关`（segmented），值写入
  `siteOverrides[host]`；删除键 = 跟随全局。全局行仍是普通开关。
- 大号电源开关 = 原"本站启用脚本"，前置为头部主控件，关=全站热挂起。
- 视觉零相似：新增 `.svi4-switch / .svi4-tabs / .svi4-card / .svi4-tri` 组件样式，
  配色/圆角/密度全面更换；模态壳（mask/window/停靠/拖拽）基础设施保留（非 UI 范畴）。
- 旧 8 区块解散重排进两页签；`#svi-sec-media`、`#svi-sec-stats` 等锚点 id 保留给测试。

## 3. 兼容与风险
- decide-once 管线不动：挂起只是入口闸门，恢复后从快照续跑。
- bench：场景 17（当前页媒体）选择器保留；新增场景 19（热关闭/恢复断言）。
- 溢出探针扩展：对页签行/模式卡片/三态行在 320~1366px 全宽断言零溢出。

## 4. 回滚
单任务单提交序列（功能层 + UI 层可分两次提交）；回滚 = revert 对应提交，
存储 schema 无变化（siteOverrides 语义不变），无数据迁移。
