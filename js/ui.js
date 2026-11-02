/* 字卡传信 · 通用 UI：toast / 底部弹层 / 确认框 / 选项菜单 */

import { el } from './util.js';
import { iconImg } from './icons.js';

const layer = () => document.getElementById('layer-root');
const toastRoot = () => document.getElementById('toast-root');

/* ---------- toast ---------- */
export function toast(msg, ms = 1900) {
  const t = el('div', { class: 'toast', text: msg });
  toastRoot().appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, ms);
}

/* ---------- 顶部横幅通知（邀请 / 接受 / 拒绝等状态提示） ---------- */
export function topBanner({ icon = '', tone = 'ok', title = '', sub = '', ms = 0 }) {
  const box = el('div', { class: 'banner tone-' + tone }, [
    el('div', { class: 'banner-ic' }, [icon ? iconImg(icon) : null]),
    el('div', { class: 'banner-main' }, [
      el('div', { class: 'banner-t', text: title }),
      sub ? el('div', { class: 'banner-s', text: sub }) : null
    ])
  ]);
  toastRoot().appendChild(box);
  requestAnimationFrame(() => box.classList.add('on'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    box.classList.remove('on');
    setTimeout(() => box.remove(), 240);
  };
  if (ms) setTimeout(close, ms);

  return {
    close,
    update({ icon: ic, tone: tn, title: t, sub: s }) {
      if (closed) return;
      if (ic !== undefined) {
        const icBox = box.querySelector('.banner-ic');
        icBox.innerHTML = '';
        icBox.appendChild(iconImg(ic));
        box.classList.remove('tone-ok', 'tone-invite', 'tone-no');
        box.classList.add('tone-' + (tn || 'ok'));
      }
      if (t !== undefined) box.querySelector('.banner-t').textContent = t;
      if (s !== undefined) {
        const subNode = box.querySelector('.banner-s');
        if (subNode) subNode.textContent = s;
        else box.querySelector('.banner-main').appendChild(el('div', { class: 'banner-s', text: s }));
      }
    }
  };
}

/* ---------- 底部弹层 ---------- */
export function sheet({ title = '', node = null, actions = [], center = false, onClose = null, foot = null }) {
  const mask = el('div', { class: 'sheet-mask' + (center ? ' center' : '') });
  const box = el('div', { class: 'sheet' });

  const head = el('div', { class: 'sheet-h' }, [
    el('div', { class: 'sh-t', text: title }),
    el('button', { class: 'tb-btn', onclick: () => close() }, [iconImg('IC-MIO-002')])
  ]);
  box.appendChild(head);

  const body = el('div', { class: 'sheet-b' });
  if (node) body.appendChild(node);
  if (actions.length) {
    const list = el('div');
    actions.forEach((a) => {
      list.appendChild(el('div', {
        class: 'list-item',
        onclick: () => { close(); a.onSelect && a.onSelect(); }
      }, [
        a.icon ? iconImg(a.icon) : null,
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title', text: a.label, style: a.danger ? { color: 'var(--danger)' } : {} }),
          a.sub ? el('div', { class: 'li-sub', text: a.sub }) : null
        ]),
        iconImg('IC-MIO-004', 'chev')
      ]));
    });
    body.appendChild(list);
  }
  box.appendChild(body);

  if (foot) {
    const fw = el('div', { class: 'sheet-f' });
    fw.appendChild(foot);
    box.appendChild(fw);
  }

  mask.appendChild(box);
  layer().appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('on'));

  function close() {
    mask.classList.remove('on');
    setTimeout(() => { mask.remove(); onClose && onClose(); }, 220);
  }
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  return { close, box, body };
}

/* ---------- 确认框 ---------- */
export function confirmBox({ title = '确认', text = '', okText = '确定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const c = sheet({
      title,
      center: true,
      node: el('div', { style: { padding: '4px 0 14px', color: 'var(--txt-dim)', fontSize: '14px', lineHeight: '1.7' }, text }),
      actions: [
        { label: okText, danger, onSelect: () => { done = true; resolve(true); } },
        { label: cancelText, onSelect: () => { done = true; resolve(false); } }
      ],
      onClose: () => { if (!done) resolve(false); }
    });
    void c;
  });
}

/* ---------- 提示框 ---------- */
export function alertBox({ title = '提示', text = '' }) {
  return new Promise((resolve) => {
    const c = sheet({
      title, center: true,
      node: el('div', { style: { padding: '4px 0 14px', color: 'var(--txt-dim)', fontSize: '14px', lineHeight: '1.7' }, text }),
      actions: [{ label: '知道了', onSelect: () => resolve(true) }],
      onClose: () => resolve(true)
    });
    void c;
  });
}

/* ---------- 选项菜单 ---------- */
export function actionSheet(title, items) {
  return sheet({
    title,
    actions: items.filter(Boolean).map((i) => ({
      label: i.label,
      sub: i.sub,
      icon: i.icon,
      danger: i.danger,
      onSelect: i.onSelect
    }))
  });
}
