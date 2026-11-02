/* 观影 · 想看 / 在看 / 看过
   记录存在 watches 表：{ id, title, type, status, rating, year, note, ts, updatedAt } */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';

const STATUS = [
  { key: 'want', label: '想看' },
  { key: 'doing', label: '在看' },
  { key: 'done', label: '看过' }
];
const TYPES = ['电影', '剧集', '动画', '综艺'];

let view = null;
let rows = [];
let filter = 'all';

const statusLabel = (k) => (STATUS.find((s) => s.key === k) || STATUS[0]).label;
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const stamp = (r) => r.updatedAt || r.ts || 0;

export default async function pageWatch(v) {
  view = v;
  fullPage({
    back: true, title: '观影', sub: '看过的、想看的都记在这里',
    actions: [{ label: '添加', onclick: () => openEditor(null) }]
  });
  await load();
}

async function load() {
  rows = (await all('watches')).sort((a, b) => stamp(b) - stamp(a));
  paint();
}

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page watch' });

  const done = rows.filter((r) => r.status === 'done').length;
  const doing = rows.filter((r) => r.status === 'doing').length;
  const want = rows.filter((r) => r.status === 'want').length;

  page.appendChild(el('div', { class: 'card wt-hero' }, [
    stat(done, '看过'),
    stat(doing, '在看'),
    stat(want, '想看')
  ]));

  const chips = el('div', { class: 'wt-chips' });
  [{ key: 'all', label: '全部', n: rows.length }]
    .concat(STATUS.map((s) => ({ key: s.key, label: s.label, n: rows.filter((r) => r.status === s.key).length })))
    .forEach((c) => {
      chips.appendChild(el('button', {
        class: 'chip' + (filter === c.key ? ' on' : ''), type: 'button',
        onclick: () => { filter = c.key; paint(); }
      }, [`${c.label} ${c.n}`]));
    });
  page.appendChild(chips);

  const list = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  if (!list.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-036'),
      el('div', { class: 'e-h', text: rows.length ? '这一栏还是空的' : '还没有观影记录' }),
      el('div', { class: 'e-p', text: '点右上角「＋」，把想看的片子收进来' })
    ]));
  } else {
    list.forEach((r) => page.appendChild(card(r)));
  }

  view.appendChild(page);
}

function stat(n, label) {
  return el('div', { class: 'wt-stat' }, [
    el('div', { class: 'wt-stat-v', text: String(n) }),
    el('div', { class: 'wt-stat-l', text: label })
  ]);
}

function card(r) {
  return el('div', { class: 'card wt-card', onclick: () => openMenu(r) }, [
    el('div', { class: 'wt-poster', text: (r.title || '?').slice(0, 1) }),
    el('div', { class: 'wt-main' }, [
      el('div', { class: 'wt-title-row' }, [
        el('div', { class: 'wt-title', text: r.title || '未命名' }),
        el('span', { class: 'wt-badge ' + (r.status || 'want'), text: statusLabel(r.status) })
      ]),
      el('div', { class: 'wt-sub', text: [r.type, r.year].filter(Boolean).join(' · ') || '未填写类型' }),
      Number(r.rating) > 0 ? el('div', { class: 'wt-stars', text: starText(Number(r.rating)) }) : null,
      r.note ? el('div', { class: 'wt-note', text: r.note }) : null
    ])
  ]);
}

/* ---------------- 操作 ---------------- */
function openMenu(r) {
  const acts = [{ label: '编辑', icon: 'IC-CRD-006', onSelect: () => openEditor(r) }];
  STATUS.filter((s) => s.key !== r.status).forEach((s) => {
    acts.push({
      label: `标记为${s.label}`, icon: 'IC-MIO-003',
      onSelect: async () => {
        r.status = s.key;
        r.updatedAt = Date.now();
        await put('watches', r);
        await load();
        toast('已更新');
      }
    });
  });
  acts.push({ label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
    const yes = await confirmBox({ title: '删除记录', text: `删除《${r.title}》？`, okText: '删除', danger: true });
    if (!yes) return;
    await del('watches', r.id);
    await load();
    toast('已删除');
  } });
  actionSheet(r.title || '观影', acts);
}

function openEditor(rec) {
  let type = rec ? (rec.type || TYPES[0]) : TYPES[0];
  let status = rec ? (rec.status || 'want') : 'want';
  let rating = rec ? Number(rec.rating) || 0 : 0;

  const title = el('input', { class: 'input', placeholder: '片名', value: rec ? (rec.title || '') : '' });
  const year = el('input', {
    class: 'input', type: 'number', inputmode: 'numeric', placeholder: '年份（可选）',
    value: rec && rec.year ? String(rec.year) : ''
  });
  const note = el('textarea', { class: 'input', rows: 3, placeholder: '短评（可选）' });
  note.value = rec ? (rec.note || '') : '';

  const typeSeg = el('div', { class: 'seg-row' });
  const statusSeg = el('div', { class: 'seg-row' });
  const starRow = el('div', { class: 'star-row' });

  function paintType() {
    typeSeg.innerHTML = '';
    TYPES.forEach((t) => {
      typeSeg.appendChild(el('button', {
        class: 'chip' + (type === t ? ' on' : ''), type: 'button',
        onclick: () => { type = t; paintType(); }
      }, [t]));
    });
  }

  function paintStatus() {
    statusSeg.innerHTML = '';
    STATUS.forEach((s) => {
      statusSeg.appendChild(el('button', {
        class: 'chip' + (status === s.key ? ' on' : ''), type: 'button',
        onclick: () => { status = s.key; paintStatus(); }
      }, [s.label]));
    });
  }

  function paintStars() {
    starRow.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      starRow.appendChild(el('button', {
        class: 'star' + (rating >= i ? ' on' : ''), type: 'button',
        onclick: () => { rating = rating === i ? 0 : i; paintStars(); }
      }, ['★']));
    }
    starRow.appendChild(el('span', { class: 'tiny muted', style: { marginLeft: '6px' }, text: rating ? `${rating} 星` : '未评分' }));
  }

  paintType();
  paintStatus();
  paintStars();

  async function save() {
    const t = title.value.trim();
    if (!t) { toast('请填写片名'); return; }
    const data = {
      title: t, type, status, rating,
      year: year.value.trim(),
      note: note.value.trim(),
      updatedAt: Date.now()
    };
    if (rec) {
      Object.assign(rec, data);
      await put('watches', rec);
    } else {
      await put('watches', { id: uid(), ts: Date.now(), ...data });
    }
    await load();
    toast('已保存');
  }

  sheet({
    title: rec ? '编辑影片' : '添加影片',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '片名' }), title]),
      el('div', { class: 'field' }, [el('label', { text: '类型' }), typeSeg]),
      el('div', { class: 'field' }, [el('label', { text: '状态' }), statusSeg]),
      el('div', { class: 'field' }, [el('label', { text: '年份' }), year]),
      el('div', { class: 'field' }, [el('label', { text: '评分' }), starRow]),
      el('div', { class: 'field' }, [el('label', { text: '短评' }), note])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => { void save(); } }]
  });
  setTimeout(() => title.focus(), 260);
}
