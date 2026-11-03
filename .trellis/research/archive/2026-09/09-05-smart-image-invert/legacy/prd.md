# Smart Image and Visual Media Invert (Phase 2: 网页全可视媒体智能反色)

## Goal (目标)

在已稳定运行的视频反色引擎基础上，将智能反色能力延伸至网页中的静态可视媒体（尤其是技术文档、论文、知乎/掘金/GitHub 中的白底架构图、流程图、公式图与线稿插图）。基于轻量视口懒检测（IntersectionObserver）与白底特征分析自适应反色，并提供纯 CSS 高性能悬停显原图与独立的胶囊控制开关。

---

## Confirmed Facts & Technical Decisions (已确认事实与决策)

1. **白底技术图判定标准**：
   - 复用经单元测试验证的白底课件算法：像素明度 $>210$ 的像素占比 $\ge 60\%$ 且 平均色彩饱和度 $\le 22\%$；
   - 过滤准则：宽度 $< 100\text{px}$ 或 高度 $< 100\text{px}$ 自动豁免；正则屏蔽类名/属性中包含 `avatar`、`icon`、`emoji`、`logo`、`badge` 的小图。

2. **零开销悬停显原图 (Pure CSS Hover)**：
   - 命中反色的图片打上 `data-svi-inverted="true"` 属性；
   - 声明 CSS 规则：
     ```css
     img[data-svi-inverted="true"] {
       filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.90) !important;
       transition: filter 0.25s ease !important;
     }
     img[data-svi-inverted="true"]:hover {
       filter: none !important;
     }
     ```
   - 鼠标悬停时完全由浏览器原生 CSS 硬件加速渲染原图，无需复杂的 JS 监听，极致平滑。

3. **解耦控制与持久化**：
   - 悬浮胶囊面板新增独立按钮“图片反色: 开 / 关”，与视频反色各自独立管理与记忆。

---

## Acceptance Criteria (验收标准)

- [x] 网页正文中的白底架构图、流程图、表格图自动被反色为深色背景。
- [x] 头像、表情包、Logo 与小图标（<100px）坚决不被误反色。
- [x] 鼠标悬停在已反色图片上时，平滑还原为原图，移开后恢复反色。
- [x] 悬浮胶囊面板包含独立的“图片反色”开关与状态记忆。
- [x] 遇到跨域严格限制的图片时静默安全降级，不阻塞页面或抛出异常。
