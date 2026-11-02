/* 小组件框架 · 可移动 / 删除 / 添加 / 自定义样式（背景图、透明度、模糊）
   用法：createWidgetHost(container, { widgets, render, catalog, onChange })
   交互：长按任意组件即进入编辑态并可直接拖动排序（像手机挪图标），点击空白处退出。 */

import { el, compressImage, openFile } from './util.js';
import { iconImg } from './icons.js';
import { sheet, actionSheet, confirmBox, toast } from './ui.js';
import { mediaURL, saveMedia } from './media.js';

const COLUMNS = 4;            // 宫格列数
const LONG_PRESS = 480;       // 长按判定毫秒
const SCROLL_SLOP = 10;       // 超过此位移视为滚动，取消长按
const DRAG_SLOP = 5;          // 编辑态下超过此位移才真正开始拖拽

/* 组件默认投影：几乎居中、轻微偏向右下，带一点透明 */
const DEFAULT_SHADOW = { on: true, color: '#000000', alpha: 0.18, x: 2, y: 4, size: 12, spread: 0 };
const shadowOf = (cfg) => Object.assign({}, DEFAULT_SHADOW, (cfg && cfg.shadow) || {});

/** 把投影配置转成 box-shadow 值 */
function shadowCss(sh) {
  if (!sh.on) return 'none';
  const hex = /^#[0-9a-fA-F]{6}$/.test(sh.color || '') ? sh.color : '#000000';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.max(0, Math.min(1, Number(sh.alpha) || 0));
  return `${Number(sh.x) || 0}px ${Number(sh.y) || 0}px ${Number(sh.size) || 0}px ${Number(sh.spread) || 0}px rgba(${r},${g},${b},${a})`;
}

/**
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {Array} opts.widgets            小组件数组引用（会被就地修改）
 * @param {Function} opts.render          (w) => HTMLElement，返回该组件的内容节点
 * @param {Array} opts.catalog            [{type,label,icon,create}]
 * @param {Function} [opts.onChange]      持久化回调
 */
export function createWidgetHost(container, opts) {
  let editing = false;
  const host = el('div', { class: 'widget-host' });
  container.appendChild(host);

  const sorted = () => opts.widgets.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const widgetOf = (id) => opts.widgets.find((w) => w.id === id);

  /* 样式作用在组件本体上：图标组件落在小图标方块（.app-ic），其余落在内容卡片上，
     而不是整个宫格占位上。 */
  function decorTarget(w, contentBox) {
    if (w.type === 'app') return contentBox.querySelector('.app-ic') || contentBox.firstElementChild;
    return contentBox.firstElementChild;
  }

  function decorate(w, target) {
    if (!target) return;
    const c = w.config || {};
    if (c.opacity != null) target.style.opacity = c.opacity;
    target.style.boxShadow = shadowCss(shadowOf(c));

    const blur = Number(c.blur) || 0;
    const frost = Number(c.frost) || 0;
    if (c.bgImageId || blur || frost) {
      target.classList.add('decor-host');
      target.style.setProperty('--d-blur', blur + 'px');
      target.style.setProperty('--d-frost', frost + 'px');
      if (c.bgImageId) {
        mediaURL(c.bgImageId).then((u) => { if (u) target.style.setProperty('--d-bg', `url("${u}")`); });
      } else {
        target.style.setProperty('--d-bg', 'none');
      }
    } else {
      target.classList.remove('decor-host');
      target.style.removeProperty('--d-bg');
      target.style.removeProperty('--d-blur');
      target.style.removeProperty('--d-frost');
    }
  }

  function render() {
    host.innerHTML = '';
    host.classList.toggle('edit', editing);
    sorted().forEach((w) => host.appendChild(renderWidget(w)));
  }

  function renderWidget(w) {
    const wrap = el('div', { class: 'widget w-' + w.type, dataset: { id: w.id } });
    wrap.style.gridColumn = 'span ' + Math.min(w.span || COLUMNS, COLUMNS);

    const inner = opts.render(w);
    const contentBox = el('div', { class: 'w-content' }, inner ? [inner] : []);
    wrap.appendChild(contentBox);
    decorate(w, decorTarget(w, contentBox));

    bindInteract(wrap, w);
    if (editing) appendBar(wrap, w);
    return wrap;
  }

  /* ---------------- 编辑态工具条：拖动 / 样式 / 删除 ----------------
     应用图标较窄，只保留「样式 / 删除」；拖动靠长按整块图标完成。 */
  function appendBar(wrap, w) {
    if (wrap.querySelector('.w-bar')) return;
    const cfg = el('span', { class: 'w-cfg', title: '样式', onclick: (e) => { e.stopPropagation(); editConfig(w); } }, [iconImg('IC-MIO-013')]);
    const del = el('span', { class: 'w-del', title: '删除', onclick: async (e) => {
      e.stopPropagation();
      const yes = await confirmBox({ title: '删除组件', text: '从主页移除这个组件？之后可在「添加」里重新加回。', okText: '删除', danger: true });
      if (yes) removeWidget(w.id);
    } }, [iconImg('IC-CRD-007')]);
    const dragHandle = el('span', { class: 'w-drag', title: '拖动排序' }, [iconImg('IC-MIO-010')]);
    const bar = el('div', { class: 'w-bar' }, w.type === 'app' ? [cfg, del] : [dragHandle, cfg, del]);
    wrap.appendChild(bar);
    dragHandle.addEventListener('pointerdown', (e) => { e.preventDefault(); startDrag(e, wrap, w); });
  }

  /* ---------------- 长按 → 编辑 + 拖拽（手机挪图标式） ---------------- */
  let drag = null;    // 正在拖拽
  let press = null;   // 长按等待中

  function bindInteract(wrap, w) {
    wrap.addEventListener('pointerdown', (e) => onDown(e, wrap, w));
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    wrap.addEventListener('dragstart', (e) => e.preventDefault());
  }

  function onDown(e, wrap, w) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.w-bar')) return;          // 工具条按钮自行处理
    if (drag || press) return;
    press = {
      x: e.clientX, y: e.clientY, wrap, w,
      isDragging: editing,                            // 编辑态：按下即视为拖拽候选
      timer: editing ? null : setTimeout(enterDragMode, LONG_PRESS)
    };
    document.addEventListener('pointermove', onPressMove);
    document.addEventListener('pointerup', onPressUp);
    document.addEventListener('pointercancel', onPressUp);
  }

  function onPressMove(e) {
    if (!press) return;
    const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.isDragging) {
      if (drag) onDragMove(e);
      else if (dist > DRAG_SLOP) startDrag(e, press.wrap, press.w);
      return;
    }
    if (dist > SCROLL_SLOP) endPress();               // 视为滚动，放弃长按
  }

  function onPressUp() { endPress(); }

  function endPress() {
    if (!press) return;
    if (press.timer) clearTimeout(press.timer);
    document.removeEventListener('pointermove', onPressMove);
    document.removeEventListener('pointerup', onPressUp);
    document.removeEventListener('pointercancel', onPressUp);
    press = null;
  }

  function enterDragMode() {
    if (!press) return;
    const { x, y, wrap, w } = press;
    endPress();
    setEditing(true);
    startDrag({ clientX: x, clientY: y }, wrap, w);
  }

  function startDrag(e, wrap, w) {
    if (drag || !wrap.isConnected) return;
    const rect = wrap.getBoundingClientRect();
    const clone = wrap.cloneNode(true);
    clone.classList.add('w-clone');
    clone.style.width = rect.width + 'px';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    document.body.appendChild(clone);
    wrap.classList.add('w-ghost');
    drag = { w, wrap, clone, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragUp, { once: true });
    document.addEventListener('pointercancel', onDragUp, { once: true });
  }

  function onDragMove(e) {
    if (!drag) return;
    drag.clone.style.left = (e.clientX - drag.offsetX) + 'px';
    drag.clone.style.top = (e.clientY - drag.offsetY) + 'px';
    host.querySelectorAll('.widget').forEach((n) => n.classList.remove('w-over'));
    const t = dropTarget(e.clientX, e.clientY, drag.wrap);
    if (t) t.classList.add('w-over');
  }

  function onDragUp(e) {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragUp);
    document.removeEventListener('pointercancel', onDragUp);
    if (!drag) return;
    const { wrap, clone } = drag;
    const t = dropTarget(e.clientX, e.clientY, wrap);
    wrap.classList.remove('w-ghost');
    host.querySelectorAll('.widget').forEach((n) => n.classList.remove('w-over'));
    clone.remove();
    drag = null;
    if (t) reorder(wrap.dataset.id, t.dataset.id);
  }

  /* 触屏时阻止页面滚动，保证拖拽稳定 */
  host.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

  /* 敲击组件以外的区域退出编辑（编辑按钮 / 底部导航除外） */
  function onDocDown(e) {
    if (e.target.closest('.widget, .hm-edit, #tabbar')) return;
    exitEdit();
  }

  function dropTarget(x, y, except) {
    return [...host.querySelectorAll('.widget')].find((n) => n !== except && inRect(x, y, n.getBoundingClientRect()));
  }
  function inRect(x, y, r) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

  function reorder(fromId, toId) {
    const list = sorted();
    const fi = list.findIndex((w) => w.id === fromId);
    const ti = list.findIndex((w) => w.id === toId);
    if (fi < 0 || ti < 0 || fi === ti) return;
    const [moved] = list.splice(fi, 1);
    list.splice(ti, 0, moved);
    list.forEach((w, i) => { w.order = i + 1; });
    opts.onChange?.();
    render();
  }

  function removeWidget(id) {
    const i = opts.widgets.findIndex((w) => w.id === id);
    if (i < 0) return;
    opts.widgets.splice(i, 1);
    opts.onChange?.();
    render();
  }

  function addWidget() {
    const items = (opts.catalog || []).map((c) => ({
      label: c.label,
      icon: c.icon,
      onSelect: () => {
        const w = c.create();
        w.order = (opts.widgets.reduce((m, x) => Math.max(m, x.order || 0), 0)) + 1;
        opts.widgets.push(w);
        opts.onChange?.();
        render();
        toast('已添加：' + c.label);
      }
    }));
    actionSheet('添加到主页', items);
  }

  /* ---------------- 样式表单（单组件 / 批量共用） ---------------- */
  function styleFields(init = {}) {
    const c = init || {};
    const op = el('input', { type: 'range', min: 0.2, max: 1, step: 0.05, value: c.opacity ?? 1, class: 'input' });
    const opVal = el('span', { text: Math.round((c.opacity ?? 1) * 100) + '%' });
    op.addEventListener('input', () => { opVal.textContent = Math.round(op.value * 100) + '%'; });

    const bl = el('input', { type: 'range', min: 0, max: 20, step: 1, value: c.blur ?? 0, class: 'input' });
    const blVal = el('span', { text: (c.blur ?? 0) + 'px' });
    bl.addEventListener('input', () => { blVal.textContent = bl.value + 'px'; });

    const fr = el('input', { type: 'range', min: 0, max: 30, step: 1, value: c.frost ?? 0, class: 'input' });
    const frVal = el('span', { text: (c.frost ?? 0) + 'px' });
    fr.addEventListener('input', () => { frVal.textContent = fr.value + 'px'; });

    /* ---- 投影 ---- */
    const sh = shadowOf(c);
    const preview = el('div', { class: 'sh-prev' });
    const shOn = el('button', { class: 'sw' + (sh.on ? ' on' : ''), onclick: () => { shOn.classList.toggle('on'); paintPrev(); } });
    const shColor = el('input', { type: 'color', value: sh.color || '#000000', class: 'input', oninput: () => paintPrev() });

    const mkRange = (min, max, val, unit = 'px') => {
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(val) });
      const out = el('span', { class: 'pval', text: val + unit });
      r.addEventListener('input', () => { out.textContent = r.value + unit; paintPrev(); });
      return { r, out };
    };
    const alpha = mkRange(0, 100, Math.round((sh.alpha ?? 0.18) * 100), '%');
    const dX = mkRange(-10, 30, sh.x ?? 2);
    const dY = mkRange(-10, 30, sh.y ?? 4);
    const dSize = mkRange(0, 50, sh.size ?? 12);
    const dSpread = mkRange(-20, 30, sh.spread ?? 0);

    function paintPrev() {
      preview.style.boxShadow = shadowCss({
        on: shOn.classList.contains('on'),
        color: shColor.value,
        alpha: Number(alpha.r.value) / 100,
        x: Number(dX.r.value), y: Number(dY.r.value),
        size: Number(dSize.r.value), spread: Number(dSpread.r.value)
      });
    }

    const rangeRow = (label, o) => el('div', { class: 'param' }, [
      el('div', { class: 'pname' }, [el('span', { text: label })]),
      o.out,
      el('div', { class: 'row', style: { flex: '1 1 100%' } }, [o.r])
    ]);

    const node = el('div', {}, [
      el('div', { class: 'field', style: { marginTop: '12px' } }, [
        el('label', { text: '透明度' }),
        el('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, [op, opVal])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '背景模糊' }),
        el('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, [bl, blVal])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '磨砂度' }),
        el('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, [fr, frVal]),
        el('div', { class: 'hint', text: '把组件后面的内容磨砂化，数值越大越朦胧。' })
      ]),

      el('div', { class: 'field' }, [
        el('div', { class: 'row between' }, [
          el('label', { text: '投影' }),
          shOn
        ]),
        el('div', { class: 'sh-wrap' }, [
          preview,
          el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [
            el('span', { class: 'small muted', text: '颜色' }),
            shColor
          ])
        ]),
        rangeRow('不透明度', alpha),
        rangeRow('水平距离（0 = 居中）', dX),
        rangeRow('垂直距离（0 = 居中）', dY),
        rangeRow('大小（模糊）', dSize),
        rangeRow('扩展（扩散）', dSpread),
        el('div', { class: 'hint', text: '默认投影略微偏向右下；水平 / 垂直距离为正时向右下偏移。' })
      ])
    ]);

    paintPrev();

    return {
      node,
      read: () => ({
        opacity: parseFloat(op.value),
        blur: parseFloat(bl.value),
        frost: parseFloat(fr.value),
        shadow: {
          on: shOn.classList.contains('on'),
          color: shColor.value,
          alpha: Number(alpha.r.value) / 100,
          x: Number(dX.r.value), y: Number(dY.r.value),
          size: Number(dSize.r.value), spread: Number(dSpread.r.value)
        }
      })
    };
  }

  /* ---------------- 单组件样式：背景图 / 透明度 / 模糊 / 磨砂 / 投影 ---------------- */
  async function editConfig(w) {
    const c = Object.assign({}, w.config || {});
    const bgBtn = el('button', { class: 'btn block', onclick: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob } = await compressImage(f, 1080);
      c.bgImageId = await saveMedia(blob, { type: 'image', source: 'widget' });
      w.config = { ...c };
      opts.onChange?.();
      render();
    } }, ['更换背景图片']);
    const bgClear = c.bgImageId ? el('button', { class: 'btn block', style: { marginTop: '8px' }, onclick: () => {
      delete c.bgImageId; w.config = { ...c }; opts.onChange?.(); render();
    } }, ['清除背景图片']) : null;

    const f = styleFields(c);
    const node = el('div', {}, [bgBtn, bgClear, f.node]);

    sheet({
      title: '组件样式',
      node,
      actions: [{ label: '完成', icon: 'IC-MIO-003', onSelect: () => {
        Object.assign(c, f.read());
        w.config = { ...c };
        opts.onChange?.();
        render();
      } }]
    });
  }

  /* ---------------- 批量样式：一次改全部组件 ---------------- */
  function batchConfig() {
    const list = opts.widgets || [];
    if (!list.length) { toast('还没有组件'); return; }
    const f = styleFields(list[0].config || {});
    const node = el('div', {}, [
      el('div', { class: 'hint', text: `将应用到全部 ${list.length} 个组件，各组件自己的背景图片会保留。` }),
      f.node
    ]);

    /* 把表单里的值写到全部组件并重绘，收起 / 完成都走这一步 */
    const applyStyles = () => {
      const v = f.read();
      list.forEach((w) => { w.config = Object.assign({}, w.config || {}, v); });
      opts.onChange?.();
      render();
    };

    let pill = null;
    const s = sheet({
      title: '批量样式',
      node,
      actions: [{ label: `应用到全部（${list.length}）`, icon: 'IC-MIO-003', onSelect: () => {
        applyStyles();
        toast(`已应用到 ${list.length} 个组件`);
      } }],
      onClose: () => { pill?.remove(); pill = null; }
    });

    const mask = s.box.parentNode;

    /* 收起：先套用当前值，再把弹层藏起来，主页上直接看到效果 */
    function collapse() {
      if (mask.classList.contains('collapsed')) return;
      applyStyles();
      mask.classList.add('collapsed');
      pill = el('button', { class: 'sheet-pill', onclick: () => expand() }, ['展开样式，继续调整']);
      document.getElementById('layer-root').appendChild(pill);
    }
    /* 展开：弹层和表单都还在，滑杆值不丢，可以接着调 */
    function expand() {
      if (!mask.classList.contains('collapsed')) return;
      mask.classList.remove('collapsed');
      if (pill) { pill.remove(); pill = null; }
    }

    const minBtn = el('button', { class: 'sh-min', onclick: () => collapse() }, ['收起']);
    const head = s.box.querySelector('.sheet-h');
    head.insertBefore(minBtn, head.querySelector('.tb-btn'));
  }

  /* ---------------- 编辑态开关（就地切换，不重建 DOM，便于长按后继续拖拽） ---------------- */
  function setEditing(v) {
    if (editing === v) return;
    editing = v;
    host.classList.toggle('edit', v);
    host.querySelectorAll('.widget').forEach((wrap) => {
      if (v) { const w = widgetOf(wrap.dataset.id); if (w) appendBar(wrap, w); }
      else wrap.querySelector('.w-bar')?.remove();
    });
    if (v) document.addEventListener('pointerdown', onDocDown, true);
    else document.removeEventListener('pointerdown', onDocDown, true);
    opts.onEditing?.(v);
  }
  function exitEdit() { setEditing(false); }

  render();
  return { host, render, setEditing, addWidget, batchConfig, isEditing: () => editing, exitEdit };
}
