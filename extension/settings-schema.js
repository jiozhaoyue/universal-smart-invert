// 构建产物：由 scripts/build-extension.js 从用户脚本的 v6.4-SETTINGS-SCHEMA 块抽出，勿手改。
'use strict';
// v6.4 R1: 设置项的**单一真源**（分组 / 控件 / 标签 / 范围）。
  // 真源在用户脚本内，构建时由 scripts/build-extension.js 抽给扩展设置页（options）。
  // 断言的键面：每条 item 的 key 必须存在于 DEFAULT_PREFS；`kind` 决定用哪个控件渲染。
  // 注意：这里的标签文案**照搬面板自身的行定义**（构建期机械抽取，非另写一份），R2 面板重建后两处同源。
  const SVI_SETTINGS_SCHEMA = [
    { id: "appearance", title: "外观与画面", items: [
      { key: "presetId", kind: "select", label: "反色预设", hint: "整体配色取向", options: [["soft-gray", "柔和灰"], ["amoled", "夜间纯黑"]] },
      { key: "hoverRestore", kind: "toggle", label: "悬停显示原图", hint: "悬停已反色图片时临时显示原图，移出后恢复反色视图" },
      { key: "brightness", kind: "slider", label: "画面亮度", hint: "反色后的暗化微调", min: 0.5, max: 1.5, step: 0.01, unit: "" },
      { key: "contrast", kind: "slider", label: "画面对比度", hint: "文字线条锐利度", min: 0.5, max: 1.5, step: 0.01, unit: "" },
      { key: "saturate", kind: "slider", label: "色彩饱和度", hint: "消除或保留颜色", min: 0, max: 2, step: 0.01, unit: "" },
      { key: "hueRotate", kind: "slider", label: "色相旋转", hint: "校正颜色谱系", min: 0, max: 360, step: 1, unit: "°" },
      { key: "transitionMs", kind: "slider", label: "过渡动画时长", hint: "设为 0 毫秒即直接切换无渐变", min: 0, max: 1000, step: 10, unit: "毫秒" },
    ] },
    { id: "image", title: "图片反色", items: [
      // 面板**没有**给这个总开关建行：它由面板头部的胶囊快捷按钮「图片:开/关」承载（同一处 state 写点）。
      // 这里补上设置项 —— 标签取自 DEFAULT_PREFS 对该字段的注释，没有自造语义。
      { key: "imageInvert", kind: "toggle", label: "图片反色（总开关）", hint: "与面板头部「图片:开/关」胶囊按钮是同一个开关；本站覆盖（三态）仍可单独否决它" },
      { key: "imagePolicy", kind: "select", label: "智能图片策略", hint: "手动 Alt+点击 与学习规则始终优先", options: [["balanced", "平衡", "默认。正文与大图反色，封面网格与页面骨架跳过。"], ["conservative", "保守", "仅正文上下文与不小于 200 像素的大图参与。"], ["aggressive", "激进", "仅按尺寸判断，最接近早期版本的行为。"]] },
      { key: "imgGeneralLight", kind: "toggle", label: "全浅色通用自适应检测", hint: "任何高明度浅底图表均自动识别反色" },
      { key: "maskAware", kind: "toggle", label: "暗色遮罩感知", hint: "祖先有暗色蒙层且合成后已足够暗时不再反色图片，避免破坏原有合成观感；关闭立即回到旧行为并重扫" },
      { key: "imgPresets", kind: "chipsOf", label: "预设浅色色卡", hint: "点击启用或禁用对应浅色系" },
      { key: "imgCustomColor", kind: "color", label: "🎯 目标色图拾色器", hint: "点击色块唤出调色盘" },
      { key: "imgTolerance", kind: "slider", label: "目标色容差", hint: "色图匹配置信范围", min: 10, max: 80, step: 1, unit: "" },
      { key: "imgLumCutoff", kind: "slider", label: "浅色明度线", hint: "判定浅色背景的明度底线", min: 150, max: 240, step: 1, unit: "" },
      { key: "imgAreaThreshold", kind: "slider", label: "浅色面积占比", hint: "触发反色的浅底面积比例", min: 25, max: 90, step: 1, unit: "%" },
      { key: "minImgSize", kind: "slider", label: "正文图最小尺寸", hint: "小于此长宽的图标不反色", min: 32, max: 300, step: 4, unit: "像素" },
      { key: "imgFxMode", kind: "select", label: "图片特效模式", hint: "部分反色与特效的呈现方式", options: [["full", "完整反色", "整图经标准滤镜反色，悬停可查看原图。"], ["luma", "亮度反色", "仅反色高于明度线且低饱和的浅色像素。"], ["key", "键色反色", "仅反色接近目标键色的像素。"], ["rect", "区域反色", "按 Alt+Shift+拖拽框选的区域反色。"], ["grayscale", "灰度化", "整图去色成为黑白。"], ["sepia", "怀旧泛黄", "整图呈泛黄暖调。"], ["brightness", "提亮", "整图提升亮度。"], ["custom", "自定义", "按画面滤镜参数逐像素处理。"]] },
      { key: "imgFxParams.lumCutoff", kind: "slider", label: "亮度反色 · 明度线", hint: "仅反色高于该明度的像素", min: 100, max: 255, step: 1, unit: "" },
      { key: "imgFxParams.satCutoff", kind: "slider", label: "亮度反色 · 饱和上限", hint: "低于该饱和度的像素才参与", min: 0, max: 1, step: 0.01, unit: "" },
      { key: "imgFxParams.keyColor", kind: "color", label: "键色反色 · 目标色", hint: "仅反色接近该颜色的像素" },
      { key: "imgFxParams.keyTol", kind: "slider", label: "键色反色 · 容差", hint: "与键色的颜色距离容差", min: 10, max: 160, step: 1, unit: "" },
      { key: "animatedDetect", kind: "toggle", label: "动图全帧谱分析", hint: "" },
      { key: "animMixedPolicy", kind: "select", label: "混合型动图", hint: "整段动画里深浅场景都有的情况。⚠ CSS 滤镜**无法按时序切换**，所以默认保持原样；「按多数帧」只是一种近似，不是逐帧反色", options: [["keep", "保持原样", "推荐：不做半吊子的近似。"], ["majority", "按多数帧近似", "白帧占多数才反色 —— 整段会一起反，不会跟着动图切。"]] },
      { key: "animAllLightRatio", kind: "slider", label: "全浅判定门", hint: "白帧占比达到此值才算\"整段都是浅色动画\"", min: 0.6, max: 1, step: 0.05, unit: "" },
      { key: "frameSampleCap", kind: "slider", label: "谱分析帧上限", hint: "最多解多少帧（超出按等间隔抽帧，不是只解开头几帧）", min: 4, max: 200, step: 4, unit: "帧" },
    ] },
    { id: "region", title: "区域反色", items: [
      { key: "regionSegment", kind: "toggle", label: "区域分割（内核）", hint: "按连通区域自动判定，而不是整图一刀切；关闭时零分割调用、零属性写入" },
      { key: "regionGridN", kind: "slider", label: "分割网格", hint: "降采样网格 N×N：越大越细，耗时越高", min: 8, max: 32, step: 1, unit: "格" },
      { key: "regionMinAreaRatio", kind: "slider", label: "最小连通域面积", hint: "小于该占比的碎块不单独处理（保守大块策略）", min: 0.5, max: 20, step: 0.5, unit: "%", scale: 100 },
      { key: "regionKRects", kind: "slider", label: "矢量矩形上限", hint: "矢量快路径的矩形数上限；0 表示只保留退化的零矩形表达", min: 0, max: 8, step: 1, unit: "个" },
      { key: "regionRender", kind: "toggle", label: "部分反色渲染层", hint: "用覆盖层呈现「部分反色」；关闭时零覆盖层、零新增节点" },
      { key: "regionStaticOnly", kind: "toggle", label: "仅静态图", hint: "视频 / GIF 不挂覆盖层，规避场景渐变时的掩码滞后" },
      { key: "regionHeartbeatMs", kind: "slider", label: "掩码心跳", hint: "视频 / GIF 的掩码重算间隔", min: 200, max: 5000, step: 100, unit: "ms" },
      { key: "regionOverlayMax", kind: "slider", label: "覆盖层上限", hint: "同时存在的覆盖层数量上限", min: 1, max: 50, step: 1, unit: "个" },
      { key: "regionCorrect", kind: "toggle", label: "区域纠正模式", hint: "在已挂上区域层的图上点一下，翻转那一块的判定（Esc 退出）" },
      { key: "regionCalibrate", kind: "toggle", label: "用纠正数据自校准", hint: "累积到足够的纠正样本后，只自动微调「最小连通域面积」这一个参数" },
      { key: "regionCalibrateMinSamples", kind: "slider", label: "累积门（样本数）", hint: "纠正样本达到该数量才评估一次校准", min: 1, max: 50, step: 1, unit: "个" },
      { key: "regionCalibrateStep", kind: "slider", label: "单次调整幅度上限", hint: "每次校准允许的最大步长（面积门占比）", min: 0.1, max: 5, step: 0.1, unit: "%", scale: 100 },
    ] },
    { id: "video", title: "视频反色", items: [
      // 同上：这个总开关在面板里是头部胶囊按钮「智能:开/关」（stateMachine.onUserToggleAuto），没有行定义
      { key: "autoDetect", kind: "toggle", label: "视频智能自动反色检测", hint: "与面板头部「智能:开/关」胶囊按钮是同一个开关；关闭后不再自动判定视频是否白底，只保留手动「视频:开/关」" },
      { key: "videoFxMode", kind: "select", label: "视频特效引擎", hint: "决定视频反色的呈现路径", options: [["off", "关闭", "走标准滤镜路径，兼容性最好。"], ["full", "完整反色", "显卡加速逐帧呈现完整反色。"], ["luma", "亮度反色", "显卡加速逐帧仅反色浅色像素。"], ["key", "键色反色", "显卡加速逐帧反色接近键色的像素。"]] },
      { key: "sampleIntervalMs", kind: "slider", label: "检测采样周期", hint: "后台探测频次，支持逐帧检测时自动逐帧", min: 50, max: 2000, step: 25, unit: "毫秒" },
      { key: "whiteThreshold", kind: "slider", label: "白底面积占比", hint: "触发视频反色的面积阈值", min: 30, max: 95, step: 1, unit: "%" },
      { key: "lumThreshold", kind: "slider", label: "明度判定线", hint: "判定为白底的亮度下限", min: 160, max: 250, step: 1, unit: "" },
      { key: "exitHysteresisMs", kind: "slider", label: "退出防抖延迟", hint: "离开白底画面时的缓冲确认时长", min: 200, max: 5000, step: 100, unit: "毫秒" },
      { key: "videoTune.enabled", kind: "toggle", label: "启用画面调节", hint: "对所有视频生效：调亮度对比度饱和度暖色黑白，关闭时零开销" },
      { key: "videoTune.brightness", kind: "slider", label: "画面调节 · 亮度", hint: "降低亮度护眼，1 为原样", min: 0.3, max: 1.7, step: 0.01, unit: "" },
      { key: "videoTune.contrast", kind: "slider", label: "画面调节 · 对比度", hint: "画面明暗反差", min: 0.3, max: 1.7, step: 0.01, unit: "" },
      { key: "videoTune.saturate", kind: "slider", label: "画面调节 · 饱和度", hint: "色彩浓淡，0 为黑白感", min: 0, max: 2, step: 0.01, unit: "" },
      { key: "videoTune.warmth", kind: "slider", label: "画面调节 · 暖色", hint: "暖黄夜读色调", min: 0, max: 1, step: 0.05, unit: "" },
      { key: "videoTune.grayscale", kind: "slider", label: "画面调节 · 黑白", hint: "去色程度", min: 0, max: 1, step: 0.05, unit: "" },
      { key: "timelineMode", kind: "select", label: "时间线记忆", hint: "反色片段按视频指纹记忆，重放时提前布防", options: [["off", "关闭", "不做时间线记忆。"], ["reference", "参考", "自动提前布防，手动操作始终优先。"], ["takeover", "接管", "时间线记忆直接控制反色。"]] },
      { key: "frameSequence", kind: "toggle", label: "帧序列判定", hint: "用最近几帧的滑动窗做判定：① 转场白闪不再误触发反色；② 明确在涨的跨阈帧提前一帧切换（感知上\"场景一变颜色就对了\"）。关闭则回到单帧判定" },
      { key: "frameWindow", kind: "slider", label: "序列窗帧数", hint: "窗口越大越稳、反应越慢（至少 3 帧才启用两个门）", min: 2, max: 8, step: 1, unit: "帧" },
      { key: "sceneDelta", kind: "slider", label: "场景跃变门", hint: "相邻帧白占比变化超过此值才算\"场景变了\"（提前切换的依据）", min: 0.1, max: 0.9, step: 0.05, unit: "" },
      { key: "flashWhiteSkip", kind: "toggle", label: "转场白闪不切换", hint: "转场常有一两帧接近纯白：窗口内白帧占比不足时判为闪光，不触发反色（避免一闪一闪）" },
    ] },
    // 原色屏蔽: （本区块无可直接承载的偏好项）
    { id: "site", title: "本站设置", items: [
      { key: "rulesEnabled", kind: "toggle", label: "内置种子规则", hint: "内置站点规则库作为兜底层，学习规则优先于它" },
      { key: "learnHits", kind: "slider", label: "学习命中阈值", hint: "同一特征手动修正达此次数后自动生效", min: 2, max: 6, step: 1, unit: "次" },
    ] },
    { id: "lists", title: "站点名单", items: [
      { key: "siteMode", kind: "select", label: "站点管理模式", hint: "控制脚本在哪些站点生效", options: [["all", "全部启用", "所有站点默认启用。"], ["blacklist", "黑名单", "名单内站点停用，其余站点启用。"], ["whitelist", "白名单", "仅名单内站点启用，其余停用。"]] },
      { key: "siteBlacklist", kind: "text", label: "黑名单域名", hint: "每行一个，如 *.163.com", rows: 3 },
      { key: "siteWhitelist", kind: "text", label: "白名单域名", hint: "每行一个", rows: 3 },
    ] },
    { id: "theme", title: "动态主题调节", items: [
      { key: "flashGuardLevel", kind: "select", label: "加载前保护（防白闪）", hint: "深色站点加载前先铺黑底消除白闪；「元素遮罩」档另加元素级 pending 遮罩（见下）。⚠ 元素级遮罩**只有扩展形态**能做到真正的\"首帧前\"—— 用户脚本在 document-end 启动，首屏元素已渲染，因此只覆盖后续动态插入的元素，首屏由黑底兜底", options: [["off", "关闭", "不做任何加载前介入。"], ["document", "文档黑底", "仅文档级黑底（与 v4.6 行为一致，默认）。"], ["media", "文档黑底 + 元素遮罩", "另对\"本站已知会反色\"时的元素做 pending 遮罩。"]] },
      { key: "maskPending", kind: "toggle", label: "元素遮罩（pending 遮罩）", hint: "media 档下对\"本站已知会反色\"的新插入媒体先遮住（visibility:hidden），判定完成即放行。三层预算兜底：总时长 / 元素数 / 单元素超时；判定失败**立即放行原图**。按 Esc（有东西被遮住时）或点下方按钮可一次性显示全部并暂停本会话" },
      { key: "maskBudgetMs", kind: "slider", label: "遮罩总时长预算", hint: "超过即全部摘罩放行（防\"页面一直白/一直黑\"）", min: 200, max: 5000, step: 100, unit: "ms" },
      { key: "maskMaxElements", kind: "slider", label: "遮罩元素数上限", hint: "同时最多遮住多少个元素（超出部分不打标）", min: 1, max: 500, step: 1, unit: "个" },
      { key: "siteInvertRate", kind: "slider", label: "本站启用门 · 历史反色率", hint: "上次在本站的反色率超过此值才启用元素遮罩（首访站点一律不遮）", min: 0.05, max: 0.95, step: 0.05, unit: "" },
      { key: "bgTone", kind: "select", label: "色调", hint: "背景与边框的主题基调", options: [["pure-black", "纯黑", "默认基调，纯黑背景，对比最强。"], ["dark-gray", "深灰", "纯黑抬升为深灰底，长时间阅读更柔和。"], ["warm-black", "暖黑", "低色温暖底，夜间护眼。"]] },
      { key: "bgBrightness", kind: "slider", label: "页面亮度", hint: "动态主题生成配色的整体亮度倍率", min: 0.6, max: 1.4, step: 0.05, unit: "倍" },
      { key: "bgContrast", kind: "slider", label: "页面对比度", hint: "动态主题生成配色的整体对比度倍率", min: 0.7, max: 1.5, step: 0.05, unit: "倍" },
    ] },
    { id: "readability", title: "字体与可读性", items: [
      { key: "fontOverride", kind: "toggle", label: "字体覆盖", hint: "全站强制使用所选字体，代码块与图标不受影响" },
      { key: "fontFamilyPreset", kind: "select", label: "字体风格", hint: "字体覆盖开启时使用的字体族", options: [["sans", "无衬线", "系统默认无衬线，界面最清晰。"], ["serif", "衬线", "宋体质感，适合长文阅读。"], ["mono", "等宽", "等宽字体，代码风格。"], ["rounded", "圆体", "圆滑字形，柔和护眼。"]] },
      { key: "textStroke", kind: "slider", label: "文字描边", hint: "给正文文字加细描边提升对比，0 为关闭", min: 0, max: 1, step: 0.05, unit: "px" },
    ] },
    { id: "schedule", title: "定时模式", items: [
      { key: "scheduleEnabled", kind: "toggle", label: "定时启停", hint: "仅在设定时段自动启用反色，时段外自动停用 (每分钟热切换)" },
      { key: "scheduleStart", kind: "hour", label: "开始时刻", hint: "进入启用时段的小时" },
      { key: "scheduleEnd", kind: "hour", label: "结束时刻", hint: "退出启用时段的小时 (可跨零点)" },
    ] },
    { id: "actions", title: "元素动作与撤销", items: [
      { key: "actions.hide.enabled", kind: "toggle", label: "元素屏蔽 (hide)", hint: "Alt+Shift+点击 屏蔽该元素：首次=临时（仅本会话），再点=恢复，第三次=永久（写规则）。Alt+Shift+Z 一键恢复本页临时屏蔽。作用域：元素 · 生效时机：立即" },
      { key: "actions.mask.enabled", kind: "toggle", label: "遮罩 (mask)", hint: "Alt+M 给鼠标所在元素加/取消遮罩；鼠标移入自动揭开，Shift+移入永久解除。作用域：元素 · 生效时机：立即" },
      { key: "maskStyle", kind: "select", label: "遮罩风格", hint: "新加的遮罩使用的预设（已加的遮罩不受影响）", options: [["dim", "暗色半透明", "压暗但保留轮廓 —— 「暂时不想看」。"], ["solid", "全遮挡", "完全盖住 —— 屏蔽干扰区。"], ["frost", "毛玻璃", "模糊化 —— 保留色块与布局感。"]] },
      { key: "maskHoverOpacity", kind: "slider", label: "悬停揭开程度", hint: "鼠标移到遮罩上时剩下的不透明度：越小揭开越彻底（0 = 完全揭开）", min: 0, max: 1, step: 0.05, unit: "" },
      { key: "maskBlur", kind: "slider", label: "毛玻璃模糊半径", hint: "仅「毛玻璃」风格生效", min: 0, max: 24, step: 1, unit: "px" },
      { key: "actions.dim.enabled", kind: "toggle", label: "全页压暗 (dim)", hint: "整页盖一层压暗蒙层（比反色温和，不改内容颜色，不拦点击）。作用域：全页 · 生效时机：立即" },
      { key: "pageDimOpacity", kind: "slider", label: "压暗不透明度", hint: "0 = 不压暗，0.9 = 接近全黑（移入鼠标可临时揭开）", min: 0, max: 0.9, step: 0.05, unit: "" },
      { key: "undoEnabled", kind: "toggle", label: "撤销 (Alt+Z)", hint: "把脚本自动做出的结论入「撤销栈」，Alt+Z 逐个回退；批量处理时给一个带「撤销」按钮的提示。仅内存、只记自动结论（手动点击与元素规则不入栈）。作用域：全页 · 生效时机：立即" },
      { key: "undoStackSize", kind: "slider", label: "撤销栈容量", hint: "可回退的最大步数（仅内存，不落盘）", min: 1, max: 100, step: 1, unit: "步" },
      { key: "actionToast", kind: "toggle", label: "操作提示条", hint: "批量处理 ≥3 个元素时弹一条带「撤销」按钮的提示（单张不弹，避免噪音）。作用域：全页 · 生效时机：立即" },
      { key: "errorSentinel", kind: "toggle", label: "误反哨兵", hint: "记录你的手动修正：同一张图 24 小时内被还原 2 次给出说明，同一类元素被还原 3 次提示可一键固化。只记录与提示，不自动写规则。作用域：本站 · 生效时机：立即" },
      { key: "learnGrading", kind: "toggle", label: "hits 分级（强 / 弱规则）", hint: "**默认关**。开启后：命中 ≥ 强规则门 的学习规则保持现有优先级；已生效但未达强门的规则降为「弱规则」，只能覆盖像素判定、不再压过内置种子规则。开启会改变既有学习规则的行为，故默认关" },
      { key: "learnStrongHits", kind: "slider", label: "强规则门", hint: "命中多少次算「强规则」（仅分级开启时有效）", min: 2, max: 20, step: 1, unit: "次" },
      { key: "learnDemote", kind: "toggle", label: "负反馈降级", hint: "规则命中后若你手动覆盖该元素：该规则命中数归 1；连续 2 次被覆盖则自动禁用（可在 本站规则 列表里点「恢复」）。只减少错误自动化" },
      { key: "shapePrior", kind: "toggle", label: "形状跨站先验", hint: "最弱兜底来源（**默认关**）：某「元素长相」在 ≥N 个不同站点上结论一致时，对新站同形元素直接给出结论。位置在所有种子规则之后、像素判定之前 —— 不是「像素缺失时才生效」，此处如实标注" },
      { key: "shapeMinHosts", kind: "slider", label: "形状先验门", hint: "至少几个不同站点结论一致才采用", min: 2, max: 20, step: 1, unit: "站" },
      { key: "calibrateAuto", kind: "toggle", label: "阈值自校准（自动收紧）", hint: "按你的手动修正自动收紧本站判定阈值 —— **只会收紧**（减少误反）；放松只在面板给建议、需你点按钮。可用上方「恢复本站默认阈值」撤销" },
    ] },
    // 数据与备份: （本区块无可直接承载的偏好项）
    // 当前页媒体: （本区块无可直接承载的偏好项）
  ];
const SVI_DEFAULTS = {
  "enabled": true,
  "autoDetect": true,
  "imageInvert": true,
  "presetId": "soft-gray",
  "imgGeneralLight": true,
  "imgPresets": {
    "white": true,
    "gray": true,
    "cream": true,
    "coolBlue": true
  },
  "imgCustomColor": "#ffffff",
  "imgTolerance": 35,
  "imgLumCutoff": 180,
  "imgAreaThreshold": 48,
  "minImgSize": 48,
  "brightness": 0.92,
  "contrast": 0.9,
  "saturate": 1,
  "hueRotate": 180,
  "transitionMs": 0,
  "sampleIntervalMs": 250,
  "whiteThreshold": 60,
  "lumThreshold": 210,
  "exitHysteresisMs": 1500,
  "settingsOpen": false,
  "advancedOpen": false,
  "pos": {
    "x": null,
    "y": null,
    "edge": "right"
  },
  "siteMode": "all",
  "siteBlacklist": [],
  "siteWhitelist": [],
  "siteOverrides": {},
  "rulesEnabled": true,
  "shieldColors": [],
  "manualOverrides": {},
  "statsEnabled": true,
  "bgReplace": false,
  "bgExcludeSelectors": [],
  "imgFxMode": "full",
  "imgFxParams": {
    "lumCutoff": 190,
    "satCutoff": 0.3,
    "keyColor": "#ffffff",
    "keyTol": 60
  },
  "videoFxMode": "off",
  "timelineMode": "reference",
  "learnHits": 2,
  "storeBackend": "auto",
  "imagePolicy": "balanced",
  "hoverRestore": true,
  "eagerScanBudget": 80,
  "fontOverride": false,
  "fontFamilyPreset": "sans",
  "textStroke": 0,
  "bgTone": "pure-black",
  "bgBrightness": 1,
  "bgContrast": 1,
  "scheduleEnabled": false,
  "scheduleStart": 21,
  "scheduleEnd": 7,
  "flashGuard": true,
  "maskAware": true,
  "videoTune": {
    "enabled": false,
    "brightness": 1,
    "contrast": 1,
    "saturate": 1,
    "warmth": 0,
    "grayscale": 0
  },
  "settingsLayout": "center",
  "settingsWidth": 420,
  "elementRules": [],
  "localFirstDecide": true,
  "actions": {
    "hide": {
      "enabled": false,
      "scope": "session"
    },
    "mask": {
      "enabled": false
    },
    "dim": {
      "enabled": false
    }
  },
  "maskStyle": "dim",
  "maskHoverOpacity": 0.15,
  "maskBlur": 8,
  "pageDimOpacity": 0.35,
  "undoEnabled": true,
  "undoStackSize": 30,
  "actionToast": true,
  "errorSentinel": true,
  "learnGrading": false,
  "learnStrongHits": 5,
  "learnDemote": true,
  "shapePrior": false,
  "shapeMinHosts": 3,
  "calibrateAuto": true,
  "calibrateMinSamples": 5,
  "falseInvertRate": 0.3,
  "frameSequence": true,
  "frameWindow": 3,
  "sceneDelta": 0.35,
  "flashWindowRatio": 0.5,
  "flashWhiteSkip": true,
  "animatedDetect": true,
  "animMixedPolicy": "keep",
  "animAllLightRatio": 0.9,
  "frameSampleCap": 60,
  "animDecodeBudgetMs": 40,
  "animRecheckMs": 30,
  "flashGuardLevel": "document",
  "maskPending": true,
  "maskBudgetMs": 1200,
  "maskMaxElements": 80,
  "maskSettleTimeoutMs": 800,
  "siteInvertRate": 0.35,
  "siteMinSeen": 5,
  "regionSegment": false,
  "regionGridN": 16,
  "regionMinAreaRatio": 0.03,
  "regionKRects": 3,
  "regionRender": false,
  "regionHeartbeatMs": 1000,
  "regionOverlayMax": 8,
  "regionStaticOnly": false,
  "regionCorrect": false,
  "regionCalibrate": false,
  "regionCalibrateMinSamples": 5,
  "regionCalibrateStep": 0.005
};
const SVI_IMG_COLOR_PRESETS = [
  {
    "id": "white",
    "name": "标准纯白",
    "color": "#FFFFFF"
  },
  {
    "id": "gray",
    "name": "纸质浅灰",
    "color": "#F5F5F5"
  },
  {
    "id": "cream",
    "name": "米黄暖白",
    "color": "#FAF0E6"
  },
  {
    "id": "coolBlue",
    "name": "冷调淡蓝",
    "color": "#F0F8FF"
  }
];
window.SVI_SETTINGS_SCHEMA = SVI_SETTINGS_SCHEMA;
window.SVI_DEFAULTS = SVI_DEFAULTS;
window.SVI_IMG_COLOR_PRESETS = SVI_IMG_COLOR_PRESETS;
