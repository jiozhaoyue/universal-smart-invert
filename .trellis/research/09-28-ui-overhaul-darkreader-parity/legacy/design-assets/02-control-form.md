# design-assets ② · 控件形态表（含键盘可用性对照）

> 用途：**无障碍回归一眼可查**。本表的第 4 列是硬门禁 —— 任何一行从「保留原生」变成
> 「自绘 span/div」即为 a11y 回退，**必须停手**（`design.md` §6、`02-VERIFY` §5.2）。
> DR 侧依据：`research/02-VERIFY.md` §5.2（逐控件读源码判定）+ §③/④。

| 控件 | DR 形态（上游实测） | 本仓现形态 | 本仓目标形态（D6：换皮不换骨） | 键盘可用性 |
|---|---|---|---|---|
| 开关 Toggle | 两个 `<span onclick>` 半块（On/Off 文字），**无 `tabindex`/`role`/`keydown`** | 原生 `checkbox`（隐藏）+ CSS 画药丸旋钮：`.svi4-switch` 52×28 / popup `.switch` 40×22 | **保留原生 checkbox（隐藏）+ CSS 画 On/Off 两半** | **保留**（原生 checkbox 可 Tab/空格） |
| 复选框 CheckBox | **原生 `input` 隐藏 + CSS 画勾**（`skewY(±45deg)`）→ 本身即可键盘 | 原生 `checkbox`（`.mini input`，`accent-color` 换皮） | 维持原生换皮（与 DR 同套路） | **保留** |
| 下拉 Select | 自绘：`TextBox` + 选项 `<span onclick>`，**无方向键选择** | 原生 `<select>`（`selectRow` **14** 调用点 + popup `#policy`/`#imgfx` **2** 个） | **保留原生 `<select>`，只换皮**（直角 + 2px 描边） | **保留**（方向键 + 首字母跳转） |
| 滑块 Slider | 纯 `div` + `mousedown/touchstart/wheel`，键盘仅 `Escape` | 原生 `range` + 原生 `number`（`sliderRow` **45** 调用点） | **保留原生，只换皮** | **保留**（方向键改值） |
| 数值 UpDown | `Button`×2 + `Track`（无原生 `number`） | 原生 `number`（含在 `sliderRow` 内） | **保留原生** | **保留** |
| 取色器 ColorPicker | `hex` 文本框 + 色块 + **自绘 HSB 拖拽**（`createSwipeHandler`），无 `<input type=color>` | 原生 `input[type=color]` 隐形叠加层（`pickerRow` **3** + `colorList` **1**） | **hex 文本框 + 预览块 + 重置 + 离散色板（点选）** | **提升**：现原生 picker 打开即抢焦点（R3）；改后不弹系统面板 |
| 按钮 Button | 原生 `<button>` | 原生 `<button>`（`.svi-btn`/`.svi-action-btn`/`.svi-pip-btn`/`.svi-preset-btn`/`.svi-open-modal-btn`） | 保留原生，补**达标描边**（AC3） | **保留** |
| 页签 Tabs | `tab-panel`：**方形 + 上下边框**，选中态靠边框/底色 | 圆角 chip（`--svi-r*`）/ popup `.tab` `9px` | **方形 + 上下边框**（DR 形态） | **保留** |
| 分组容器 | `section` + 分区标题 + **分隔线**，**全 UI 无圆角卡片 + 阴影词汇** | 圆角卡片 + 阴影（`.svi-card` 类）+ popup `.power-row` 12px 圆角 | **去卡片** → 分区标题 + 分隔线 | 不适用（纯视觉） |
| 图标 | `background-image:url(assets/images/*.svg)` | `SviControls.ICONS` 内联 `<svg fill="currentColor">` | **不变**（N7） | 不适用 |

## 调用点计数（改造面基线，取自 `02-VERIFY` §5.1 实测）

| 建造器 | 调用点 | 现实现 |
|---|---:|---|
| `sliderRow` | 45 | 原生 `range` + 原生 `number` |
| `toggleRow` | 27 | 原生 `checkbox` |
| `selectRow` | 14 | 原生 `<select>` |
| `pickerRow` | 3 | 原生 `type=color` |
| `colorList` | 1 | 原生 `type=color`（`:13081` 路径**缺 wrap** → R3a 根因） |
| `SviControls.*` 合计 | 136 | — |
| popup.html 自有控件 | 1 `.switch` + **2 原生 `<select>`**（`#policy`/`#imgfx`） | 与面板体系**平行**，改造时勿漏 |
| 返回值句柄依赖 | **1**（`this.modeSelect = modeRow.select`） | 行工厂加 `key` 后须改取值接口 |

## a11y 回退判定口径

- ✅ 允许：保留原生元素只换皮（DR 自己的 `CheckBox`/`TextBox`/`Button`/`UpDown` 就是这套做法）。
- ❌ 禁止：把原生 `select`/`range`/`checkbox` 换成 `span`/`div` + pointer 事件（DR 的 `Toggle`/`Dropdown`/`Slider` 是反面样本，**不可照搬**）。
