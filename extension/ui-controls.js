// 构建产物：由 scripts/build-extension.js 从用户脚本的 v6.4-CONTROLS 块抽出，勿手改。
// 供扩展设置页（options）复用同一套控件库 —— 单文件真源约束下的同源机制。
(function () {
  'use strict';
const SviControls = {
    // 基础元素构造器: attrs 支持 class/style/on*/常用属性; children 支持 字符串/节点/数组/null
    h(tag, attrs, ...children) {
      const el = document.createElement(tag);
      if (attrs) {
        for (const key of Object.keys(attrs)) {
          const v = attrs[key];
          if (v == null || v === false) continue;
          if (key === 'class') {
            el.className = String(v);
          } else if (key === 'style' && typeof v === 'string') {
            el.style.cssText = v;
          } else if (key.length > 2 && key.indexOf('on') === 0 && typeof v === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), v);
          } else if (key === 'text') {
            el.textContent = String(v);
          } else if (key === 'checked' || key === 'value' || key === 'selected' || key === 'disabled') {
            try { el[key] = v; } catch (e) { el.setAttribute(key, String(v)); }
          } else if (key === 'min' || key === 'max' || key === 'step' || key === 'placeholder' || key === 'rows' || key === 'title' || key === 'id' || key === 'type' || key === 'colspan') {
            el.setAttribute(key, String(v));
          } else {
            el.setAttribute(key, String(v));
          }
        }
      }
      const appendAll = (kids) => {
        for (const c of kids) {
          if (c == null || c === false) continue;
          if (Array.isArray(c)) { appendAll(c); continue; }
          if (typeof c === 'string' || typeof c === 'number') {
            el.appendChild(document.createTextNode(String(c)));
          } else if (c.nodeType === 1) {
            el.appendChild(c);
          }
        }
      };
      appendAll(children);
      return el;
    },

    labelBox(label, hint) {
      return this.h('div', { class: 'svi-modal-label-box', style: 'width:auto;' },
        this.h('div', { class: 'svi-modal-label', text: label }),
        hint ? this.h('div', { class: 'svi-modal-hint', text: hint }) : null);
    },

    // 区块: 标题行 + 行集合 (sync 收集)
    //   v6.4 R2d: 第 4 个参数是**图标名**(ICONS 的键) —— 区块标题此前带 emoji, 现改为内联 SVG。
    //   图标挂在标题 span **内部的最前**, 故 `.svi-sec-title span` 的 textContent 仍是纯标题文字
    //   (扩展设置页与 E2E 都按这个选择器读标题, SVG 不含文本节点, 不受影响)。
    // 区块标题行 (`.svi-sec-title` 的**唯一构造点**): 标题前可带内联 SVG 图标。
    //   v6.4 R2d: 图标挂在标题 span **内部最前**, 故 `.svi-sec-title span` 的 textContent 仍是纯标题文字
    //   (扩展设置页与 E2E 都按这个选择器读标题; SVG 不含文本节点, 不受影响)。
    sectionTitle(text, iconName) {
      const title = this.h('div', { class: 'svi-sec-title' });
      const span = this.h('span', { text: String(text) });
      const ic = iconName ? this.icon(iconName, '', 'svi-sec-icon') : null;
      if (ic) span.insertBefore(ic, span.firstChild || null); // 图标放最前
      title.appendChild(span);
      return title;
    },

    // 区块: 标题行 + 行集合 (sync 收集); 第 4 个参数是图标名 (见 sectionTitle)
    section(title, hint, id, iconName) {
      const el = this.h('div', { class: 'svi-modal-section', id: id || '' });
      const secTitle = this.sectionTitle(title, iconName);
      if (hint) secTitle.appendChild(this.h('span', { text: hint, style: 'font-size:10px; color:var(--svi-text-dim);' }));
      el.appendChild(secTitle);
      const syncs = [];
      return {
        el,
        add(row) {
          if (row && row.row) {
            el.appendChild(row.row);
            if (typeof row.sync === 'function') syncs.push(row.sync);
          } else if (row && row.nodeType === 1) {
            el.appendChild(row);
          }
          return row;
        },
        syncAll() {
          for (const s of syncs) {
            try { s(); } catch (e) { /* ignore */ }
          }
        },
      };
    },

    // 开关行
    toggleRow(label, hint, getVal, onSet) {
      const row = this.h('div', { class: 'svi-site-check-row' });
      const cb = this.h('input', { type: 'checkbox', class: 'svi-check' });
      cb.addEventListener('change', () => onSet(cb.checked));
      row.append(this.labelBox(label, hint), cb);
      return {
        row,
        sync() { cb.checked = !!getVal(); },
      };
    },

    // 滑动条 + 数值双向联动行 (v2.0 makeRow 的组件化)
    sliderRow(label, hint, getVal, onSet, min, max, step, unit) {
      const row = this.h('div', { class: 'svi-modal-row' });
      const slider = this.h('input', { type: 'range', class: 'svi-modal-slider', min: String(min), max: String(max), step: String(step) });
      const numInput = this.h('input', { type: 'number', class: 'svi-modal-num-input', min: String(min), max: String(max), step: String(step) });
      const syncVal = (val, fromSlider) => {
        let n = parseFloat(val);
        if (isNaN(n)) return;
        n = Math.max(min, Math.min(max, n));
        if (!fromSlider) slider.value = String(n);
        numInput.value = String(n);
        onSet(n);
      };
      slider.addEventListener('input', () => syncVal(slider.value, true));
      numInput.addEventListener('input', () => syncVal(numInput.value, false));
      const controls = this.h('div', { class: 'svi-modal-controls' }, slider, numInput);
      if (unit) controls.appendChild(this.h('span', { class: 'svi-modal-unit', text: unit }));
      row.append(this.labelBox(label, hint), controls);
      return {
        row,
        sync() {
          const v = getVal();
          slider.value = String(v);
          numInput.value = String(v);
        },
      };
    },

    // 下拉选择行 (v3.3: 选项只留短名, 说明经 describe 字段在选项下方动态呈现)
    selectRow(label, hint, options, getVal, onSet) {
      const row = this.h('div', { class: 'svi-modal-row' });
      const select = this.h('select', { class: 'svi-modal-select' });
      for (const opt of options) {
        const o = this.h('option', { value: opt.v });
        o.textContent = opt.label;
        select.appendChild(o);
      }
      const describe = this.h('div', { class: 'svi-row-describe' });
      const syncDescribe = () => {
        const cur = options.find((o) => String(o.v) === String(select.value));
        const text = (cur && cur.describe) ? cur.describe : '';
        describe.textContent = text;
        describe.style.display = text ? '' : 'none';
      };
      select.addEventListener('change', () => onSet(select.value));
      select.addEventListener('change', syncDescribe);
      row.append(this.labelBox(label, hint), select, describe);
      return {
        row,
        select,
        sync() {
          select.value = String(getVal());
          syncDescribe();
        },
      };
    },

    // 色卡网格 (含同步); items: [{id, label, color, dark?}]
    chipRow(items, isActive, onToggle) {
      const grid = this.h('div', { class: 'svi-color-chips-grid' });
      const chips = {};
      for (const item of items) {
        const chip = this.h('div', { class: 'svi-color-chip' });
        const swatch = this.h('div', {
          class: 'svi-color-chip-swatch',
          // 色卡描边走 token (item.color 本身是数据: 它描述被处理的画面, 见 R2c 的判定)
          style: 'background: ' + (item.color || '#ffffff') + (item.dark ? '; border-color: rgba(var(--svi-white-rgb), 0.3);' : '') + ';',
        });
        const label = this.h('span', { text: item.label });
        // v6.4 R2d: 勾选标记改用内联 SVG (与其它图标同一处实现; 图标缺失时退化为空 span, 不炸)
        const check = this.icon('check', '', 'svi-color-chip-check')
          || this.h('span', { class: 'svi-color-chip-check' });
        chip.append(swatch, label, check);
        chip.addEventListener('click', () => onToggle(item.id));
        chips[item.id] = chip;
        grid.appendChild(chip);
      }
      return {
        row: grid,
        chips,
        sync() {
          for (const item of items) {
            if (chips[item.id]) chips[item.id].classList.toggle('active', !!isActive(item.id));
          }
        },
      };
    },

    // 按钮行 buttons: [{label, onClick, primary, danger, block}]
    btnRow(buttons) {
      const row = this.h('div', { class: 'svi-btn-row-actions' });
      for (const b of buttons) {
        const btn = this.h('button', {
          class: 'svi-mini-btn' + (b.primary ? '' : '') + (b.danger ? ' danger' : ''),
        });
        // v6.4 R2d: 按钮可带图标 (b.icon = ICONS 的键)。图标是 SVG 节点, 不含文本,
        //   故 textContent 仍等于 b.label —— 既有按 textContent 找按钮的 bench 断言不受影响。
        const ic = b.icon ? this.icon(b.icon, '', 'svi-btn-icon') : null;
        if (ic) btn.appendChild(ic);
        btn.appendChild(this.h('span', { text: String(b.label == null ? '' : b.label) }));
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          b.onClick(e);
        });
        row.appendChild(btn);
      }
      return { row, sync() {} };
    },

    // 多行文本输入 (label + hint + textarea)
    textRow(label, hint, value, rows, onInput, placeholder) {
      const row = this.h('div', {});
      if (label) row.appendChild(this.labelBox(label, hint));
      const ta = this.h('textarea', { class: 'svi-modal-textarea', rows: String(rows || 3) });
      if (placeholder) ta.placeholder = placeholder;
      ta.addEventListener('change', () => onInput(ta.value));
      row.appendChild(ta);
      return {
        row,
        ta,
        sync() { ta.value = value(); },
      };
    },

    // 提示行 (动态文本走 textContent)
    infoLine(text, cls) {
      const el = this.h('div', { class: cls || 'svi-hint-line' });
      el.textContent = String(text == null ? '' : text);
      return {
        row: el,
        el,
        setText(t) { el.textContent = String(t == null ? '' : t); },
        sync() {},
      };
    },

    // 拾色器行 (label + native color input; v3.3: 色值仅悬浮提示, 界面不显示十六进制)
    pickerRow(label, hint, getVal, onSet) {
      const row = this.h('div', { class: 'svi-color-picker-row' });
      const labelBox = this.h('div', { class: 'svi-color-picker-label' },
        this.h('span', { text: label }),
        hint ? this.h('span', { text: hint, style: 'font-size:10px; color:var(--svi-text-dim);' }) : null);
      const previewCircle = this.h('div', { class: 'svi-color-preview-circle' });
      const previewBox = this.h('div', { class: 'svi-color-preview-box' }, previewCircle);
      const native = this.h('input', { type: 'color', class: 'svi-color-input-native' });
      native.addEventListener('input', () => onSet(native.value));
      const wrap = this.h('div', { class: 'svi-color-input-wrap' }, native, previewBox);
      row.append(labelBox, wrap);
      return {
        row,
        native,
        sync() {
          const v = getVal() || '#ffffff';
          native.value = v;
          previewCircle.style.background = v;
          previewBox.title = v.toUpperCase();
        },
      };
    },
  
    // ---- v6.4 新增控件 (DR 词汇表的其余部分; 三处消费点共用同一 DOM 语义) ----
    //   全部走既有 class 词汇与 token 变量 —— 不在 JS 里写颜色字面量 (那种漂移 test.js 会抓)。

    // 分组卡: 标题 + 描述 + 控件槽 (popup / options 的主要骨架)
    group(title, desc, id) {
      const g = this.section(title, '', id);
      if (desc) g.el.appendChild(this.h('div', { class: 'svi-modal-hint', text: desc }));
      return g;
    },

    // 多态开关: 多个互斥档位 (chip 形态)
    multiSwitch(label, hint, options, getVal, onSet) {
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint));
      const wrap = this.h('div', { class: 'svi-chip-wrap' });
      const chips = [];
      for (const opt of options) {
        const chip = this.h('button', { type: 'button', class: 'svi-chip', text: opt.label });
        chip.addEventListener('click', () => { onSet(opt.value); sync(); });
        chips.push({ chip: chip, value: opt.value });
        wrap.appendChild(chip);
      }
      const sync = () => {
        const cur = getVal();
        for (const c of chips) c.chip.classList.toggle('active', c.value === cur);
      };
      row.appendChild(wrap);
      sync();
      return { row: row, sync: sync };
    },

    // 导航按钮 (进入子页 / 打开设置页)
    navButton(label, hint, onClick) {
      const btn = this.h('button', { type: 'button', class: 'svi-btn svi-btn-nav', text: label });
      btn.addEventListener('click', onClick);
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint), btn);
      return { row: row, sync: () => {} };
    },

    // 重置按钮
    resetButton(label, hint, onReset) {
      const btn = this.h('button', { type: 'button', class: 'svi-btn svi-btn-reset', text: label });
      btn.addEventListener('click', onReset);
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint), btn);
      return { row: row, sync: () => {} };
    },

    // 折叠面板: 标题行可点, 内容默认收起
    collapsible(title, hint, collapsed) {
      const el = this.h('div', { class: 'svi-modal-section svi-collapsible' });
      const head = this.h('div', { class: 'svi-sec-title svi-collapsible-head' },
        this.h('span', { text: title }),
        hint ? this.h('span', { class: 'svi-collapsible-hint', text: hint }) : null);
      const body = this.h('div', { class: 'svi-collapsible-body' });
      let open = collapsed !== true;
      const apply = () => { body.style.display = open ? '' : 'none'; head.classList.toggle('open', open); };
      head.addEventListener('click', () => { open = !open; apply(); });
      apply();
      el.appendChild(head);
      el.appendChild(body);
      const syncs = [];
      return {
        el: el,
        add(row) {
          if (row && row.row) {
            body.appendChild(row.row);
            if (typeof row.sync === 'function') syncs.push(row.sync);
          } else if (row && row.nodeType === 1) {
            body.appendChild(row);
          }
          return row;
        },
        syncAll() { for (const f of syncs) { try { f(); } catch (e) { /* ignore */ } } },
        setOpen(v) { open = !!v; apply(); },
      };
    },

    // 消息条 (诊断 / 提示; 三种语义色由 token 提供)
    messageBar(text, kind) {
      const k = kind === 'error' ? 'error' : (kind === 'warn' ? 'warn' : (kind === 'ok' ? 'ok' : 'info'));
      return this.h('div', { class: 'svi-msg svi-msg-' + k, text: text });
    },

    // 复选行 (checkbox; 与开关语义不同: 可多选、无即时副作用)
    checkRow(label, hint, getVal, onSet) {
      const box = this.h('input', { type: 'checkbox', class: 'svi-check' });
      const setVal = () => { box.checked = getVal() === true; };
      box.addEventListener('change', () => onSet(box.checked));
      setVal();
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint), box);
      return { row: row, sync: setVal };
    },

    // 颜色选择: 原生取色器 + 十六进制输入 (与既有 pickerRow 同源, 供 popup/options 复用)
    colorPicker(label, hint, getVal, onSet) { return this.pickerRow(label, hint, getVal, onSet); },

    // 快捷键录入: 聚焦后按组合键即录 (不引入任何绘制手势)
    shortcutRow(label, hint, getVal, onSet) {
      const input = this.h('input', { type: 'text', class: 'svi-input svi-shortcut', readonly: 'readonly' });
      const setVal = () => { input.value = String(getVal() || ''); };
      input.addEventListener('keydown', (ev) => {
        try {
          ev.preventDefault();
          const parts = [];
          if (ev.ctrlKey) parts.push('Ctrl');
          if (ev.altKey) parts.push('Alt');
          if (ev.shiftKey) parts.push('Shift');
          const k = ev.key && ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
          if (k && ['Control', 'Alt', 'Shift', 'Meta'].indexOf(k) < 0) parts.push(k);
          if (!parts.length) return;
          onSet(parts.join('+'));
          setVal();
        } catch (e) { /* ignore */ }
      });
      setVal();
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint), input);
      return { row: row, sync: setVal };
    },

    // ---- v6.4 R2b 新增控件 (面板「自建 DOM」区收口所需的两类 + 图标) ----

    // 内联图标: 一律 SVG + fill:currentColor (颜色随 token / 继承色走, 不用 emoji 字形)。
    //   模板是**冻结的静态常量** (无插值 → 不构成注入面); 图标名不认识时返回 null,
    //   由调用点决定降级 (绝不抛异常 —— 一个缺失的图标不该让整块面板构建失败)。
    icon(name, title, cls) {
      const svg = this.ICONS ? this.ICONS[name] : null;
      if (!svg) return null;
      const span = this.h('span', { class: cls ? 'svi-icon ' + cls : 'svi-icon', title: title || '' });
      // innerHTML 只吃**冻结的静态常量**(无插值) —— 有插值的 DOM 构建一律走 DOM API (XSS 纪律)
      span.innerHTML = svg;
      return span;
    },

    // 颜色列表 (色卡增删): getList → ['#rrggbb', ...]; onChange(nextArray) 收**整份新列表**。
    //   为什么收整份而不是「增一项 / 删一项」: 两个动作都落在同一个存储键上, 且都要触发一次重扫,
    //   让调用点自己决定怎么持久化 (面板 = savePrefs + 重扫; 设置页 = 写 prefs)。
    //   控件只负责「把列表画出来 + 把用户的新列表交回去」(与其余行工厂同一种 {row, sync} 契约)。
    colorList(label, hint, getList, onChange, opts) {
      const o = opts || {};
      const addLabel = o.addLabel || '添加';
      const emptyText = o.emptyText || '暂无颜色';
      const read = () => {
        const v = getList();
        return Array.isArray(v) ? v.slice() : [];
      };
      const box = this.h('div', { class: 'svi-color-list' });
      const native = this.h('input', { type: 'color', class: 'svi-color-input-native', value: o.value || '#ffffff' });
      const addBtn = this.h('button', { class: 'svi-mini-btn', text: addLabel });
      const form = this.h('div', { class: 'svi-color-picker-row' },
        this.h('div', { class: 'svi-color-picker-label' }, this.h('span', { text: addLabel })),
        this.h('div', { class: 'svi-color-picker-controls' }, native, addBtn));
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint), box, form);

      const render = () => {
        box.textContent = '';
        const cur = read();
        if (!cur.length) {
          box.appendChild(this.h('div', { class: 'svi-hint-line', text: emptyText }));
          return;
        }
        cur.forEach((hex, idx) => {
          // 色值来自存储层 → 走 DOM 属性赋值而非 innerHTML (XSS 加固, 与面板原实现同一条纪律)
          const hexText = String(hex);
          const dot = this.h('span', { class: 'svi-color-dot' });
          if (/^#[0-9a-fA-F]{6}$/.test(hexText)) dot.style.backgroundColor = hexText;
          const x = this.icon('close', '移除', 'svi-shield-x') || this.h('span', { class: 'svi-shield-x', text: '移除' });
          x.addEventListener('click', () => {
            const next = read();
            next.splice(idx, 1);
            onChange(next);
            render();
          });
          box.appendChild(this.h('span', { class: 'svi-shield-chip' }, dot, this.h('span', { text: hexText }), x));
        });
      };

      addBtn.addEventListener('click', () => {
        const hex = String(native.value || '');
        const cur = read();
        // 原生取色器只会给出 #rrggbb; 这里仍校验一次, 因为它同时是「存储里那份」的形状门
        if (!/^#[0-9a-fA-F]{6}$/.test(hex) || cur.indexOf(hex) >= 0) return;
        onChange(cur.concat(hex));
        render();
      });

      render();
      return { row: row, sync: render };
    },

    // 结构化列表编辑器 (增 / 删): 面板「元素级规则」与设置页共用同一 DOM 语义。
    //   spec = {
    //     getList: () => [...],
    //     fields:  [{ key, kind: 'text'|'select', placeholder, options: [[值, 文案]], value }],
    //              —— 数组顺序**就是** DOM 顺序 (添加表单里第一个下拉在最左)
    //     display: [{ key, cls, alias: { 值: 文案 }, aliasCls: { 值: 类名 }, titleKey }],
    //              —— 只读行的分段 (按顺序左边到右边)
    //     addLabel / removeLabel / emptyText / formCls,
    //     onAdd: (values) => boolean,   // 返回 false = 拒绝 (调用点自己给用户反馈, 控件不猜文案)
    //     onRemove: (index) => void,
    //   }
    //   行内容一律 textContent (选择器/键来自存储层, XSS 加固)。
    listEditor(label, hint, spec) {
      const s = spec || {};
      const fields = Array.isArray(s.fields) ? s.fields : [];
      const display = Array.isArray(s.display) ? s.display : [];
      const read = () => {
        const v = s.getList ? s.getList() : [];
        return Array.isArray(v) ? v : [];
      };
      const box = this.h('div', { class: 'svi-list-box' });
      const inputs = {};
      const inputOrder = [];
      const form = this.h('div', { class: s.formCls || 'svi-er-form' });
      for (const f of fields) {
        if (f.kind === 'select') {
          const sel = this.h('select', { class: 'svi-modal-select' });
          const opts = Array.isArray(f.options) ? f.options : [];
          for (const opt of opts) sel.appendChild(this.h('option', { value: opt[0], text: opt[1] }));
          sel.value = f.value != null ? String(f.value) : String((opts[0] || [''])[0]);
          inputs[f.key] = sel;
          inputOrder.push(f.key);
          form.appendChild(sel);
        } else {
          const inp = this.h('input', { type: 'text', class: 'svi-modal-text', placeholder: f.placeholder || '' });
          inputs[f.key] = inp;
          inputOrder.push(f.key);
          form.appendChild(inp);
        }
      }
      const addBtn = this.h('button', { class: 'svi-mini-btn', text: s.addLabel || '添加' });
      form.appendChild(addBtn);
      const row = this.h('div', { class: 'svi-modal-row' }, this.labelBox(label, hint), box, form);

      const render = () => {
        box.textContent = '';
        const cur = read();
        if (!cur.length) {
          box.appendChild(this.h('div', { class: 'svi-hint-line', text: s.emptyText || '暂无条目' }));
          return;
        }
        cur.forEach((item, idx) => {
          const line = this.h('div', { class: 'svi-learned-row' });
          for (const seg of display) {
            const raw = String((item && item[seg.key] != null) ? item[seg.key] : '');
            const aliasMap = seg.alias || {};
            const clsMap = seg.aliasCls || {};
            const text = Object.prototype.hasOwnProperty.call(aliasMap, raw) ? aliasMap[raw] : raw;
            const el = this.h('span', { class: (seg.cls || '') + (clsMap[raw] ? ' ' + clsMap[raw] : ''), text: text });
            if (seg.titleKey) el.title = String((item && item[seg.titleKey]) || '');
            line.appendChild(el);
          }
          const del = this.h('button', { class: 'svi-mini-btn danger', text: s.removeLabel || '删除' });
          del.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (s.onRemove) s.onRemove(idx);
            render();
          });
          line.appendChild(del);
          box.appendChild(line);
        });
      };

      addBtn.addEventListener('click', () => {
        const values = {};
        for (const key of inputOrder) values[key] = String(inputs[key].value == null ? '' : inputs[key].value);
        if (s.onAdd && s.onAdd(values) === false) return; // 被调用点拒绝: 保留输入, 让它自己解释原因
        // 只清空文本输入 (下拉保留上次选择 —— 连续添加多条同类规则时不用重选)
        for (const key of inputOrder) {
          if (String(inputs[key].tagName || '').toLowerCase() === 'input') inputs[key].value = '';
        }
        render();
      });

      render();
      return { row: row, sync: render };
    },
  };

  // 图标路径表 (静态常量; 与 icon() 同源, 是「不留 emoji 字形」的唯一图标实现点)。
  //   fill:currentColor —— 颜色随所在元素的 color 走, 故按钮态/危险态自动跟随 token。
  //   词汇表按「面板里实际用过的 emoji」逐一对应 (v6.4 R2d), 全部 16×16 网格、与文字同高。
  //   线画图标用 stroke + fill:none, 实心图标用 fill —— 两类都吃 currentColor。
  SviControls.ICONS = Object.freeze({
    close: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    trash: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 4.5 H13 M6.5 4.5 V3 H9.5 V4.5 M4.5 4.5 L5.2 13 H10.8 L11.5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    bolt: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9 1.5 L3.8 9.2 H7.4 L6.9 14.5 L12.2 6.8 H8.6 Z" fill="currentColor"/></svg>',
    // 设置/参数: 三条带旋钮的滑杆 —— 12px 下比齿轮轮廓更易辨认 (接触表实测: 齿轮读作太阳)
    gear: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 4.6 H14 M2 8 H14 M2 11.4 H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="6" cy="4.6" r="1.9" fill="currentColor"/><circle cx="10.4" cy="8" r="1.9" fill="currentColor"/><circle cx="5" cy="11.4" r="1.9" fill="currentColor"/></svg>',
    // 外观与画面: 调色盘 —— 挖两个偏心色孔 + 一个拇指缺口 (接触表实测: 三个对称点会读作笑脸)
    palette: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 2.1 a5.9 5.9 0 1 0 0 11.8 c1.5 0 2-1.1 1.3-1.9 -1-1.1-.2-2.6 1.1-2.6 h1.2 a2.3 2.3 0 0 0 2.3-2.3 A6 6 0 0 0 8 2.1 Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><circle cx="5.9" cy="6.4" r=".95" fill="currentColor"/><circle cx="9.3" cy="5.4" r=".95" fill="currentColor"/><circle cx="5.3" cy="9.6" r=".95" fill="currentColor"/></svg>',
    image: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M3.4 11 L6.6 7.6 L9 10 L10.8 8.2 L12.8 10.4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/></svg>',
    video: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1.6" y="4" width="12.8" height="8" rx="1.4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6.8 6.3 L9.8 8 L6.8 9.7 Z" fill="currentColor"/></svg>',
    globe: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M2.1 8 H13.9 M8 2.1 C5.4 4.7 5.4 11.3 8 13.9 M8 2.1 C10.6 4.7 10.6 11.3 8 13.9" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
    shield: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.7 L13.3 3.9 V8 C13.3 11.1 11 13.2 8 14.3 C5 13.2 2.7 11.1 2.7 8 V3.9 Z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>',
    monitor: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1.8" y="3" width="12.4" height="8.3" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6.2 13.4 H9.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>',
    save: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 3.6 A1.1 1.1 0 0 1 3.6 2.5 H10.3 L13.5 5.7 V12.4 A1.1 1.1 0 0 1 12.4 13.5 H3.6 A1.1 1.1 0 0 1 2.5 12.4 Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M5.2 2.5 V6.1 H10.4 V2.5 M4.9 13.5 V9.6 H11.1 V13.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>',
    bulb: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.8 a4.1 4.1 0 0 1 2.5 7.3 c-.5.4-.7.9-.7 1.4 H6.2 c0-.5-.2-1-.7-1.4 A4.1 4.1 0 0 1 8 1.8 Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M6.3 12.7 H9.7 M7 14.3 H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>',
    pointer: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 1.8 V12.4 L6.9 9.7 L8.9 14.2 L10.9 13.2 L9 8.9 L12.9 8.7 Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>',
    target: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 2.2 L14.6 13.4 H1.4 Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M8 6 V9.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="8" cy="11.7" r=".9" fill="currentColor"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M13.2 8 A5.2 5.2 0 1 1 11.5 4.1" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M13.7 2.4 V5.5 H10.6" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5.8 4.2 H13.6 M5.8 8 H13.6 M5.8 11.8 H13.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="3" cy="4.2" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="3" cy="11.8" r="1" fill="currentColor"/></svg>',
    layers: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 2.2 L14 5.6 L8 9 L2 5.6 Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M2.8 8.5 L8 11.5 L13.2 8.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5.8 4.2 L2.4 7.6 L5.8 11" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.4 7.6 H9.6 a3.4 3.4 0 0 1 0 6.8 H7.6" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>',
    block: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4.2 4.2 L11.8 11.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10.6 1.9 a6.3 6.3 0 1 0 3.5 11.3 A7.1 7.1 0 0 1 10.6 1.9 Z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3.2 8.4 L6.4 11.6 L12.8 4.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    power: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 2.2 V7.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M4.5 4.5 a4.7 4.7 0 1 0 7 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg>',
    font: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.2 13 L7.2 3.2 L11.2 13 M4.9 9.7 H9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    clock: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 4.3 V8.2 L10.7 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  });
  window.SviControls = SviControls;
})();
