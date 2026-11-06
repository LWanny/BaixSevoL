/* 书架 · 想读 / 在读 / 已读
   记录存在 books 表：{ id, title, author, status, progress, rating, note, ts, updatedAt } */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';

const STATUS = [
  { key: 'want', label: '想读' },
  { key: 'reading', label: '在读' },
  { key: 'done', label: '已读' }
];

let view = null;
let rows = [];
let filter = 'all';

const statusLabel = (k) => (STATUS.find((s) => s.key === k) || STATUS[0]).label;
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const stamp = (r) => r.updatedAt || r.ts || 0;
const clampPct = (n) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));

export default async function pageBooks(v) {
  view = v;
  fullPage({
    back: true, title: '书架', sub: '读到哪里，都记下来',
    actions: [{ label: '添加', onclick: () => openEditor(null) }]
  });
  await load();
}

async function load() {
  rows = (await all('books')).sort((a, b) => stamp(b) - stamp(a));
  paint();
}

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page books' });

  const reading = rows.filter((r) => r.status === 'reading').length;
  const done = rows.filter((r) => r.status === 'done').length;
  page.appendChild(el('div', { class: 'card bk-hero' }, [
    stat(reading, '在读'),
    stat(done, '已读'),
    stat(rows.length, '藏书')
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
      iconImg('IC-MIO-037'),
      el('div', { class: 'e-h', text: rows.length ? '这一栏还是空的' : '书架还是空的' }),
      el('div', { class: 'e-p', text: '点右上角「添加」，把想读的书放进来' })
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
  const pct = r.status === 'done' ? 100 : clampPct(r.progress);
  return el('div', { class: 'card bk-card', onclick: () => openMenu(r) }, [
    el('div', { class: 'bk-title-row' }, [
      el('div', { class: 'bk-title', text: r.title || '未命名' }),
      el('span', { class: 'bk-badge ' + (r.status || 'want'), text: statusLabel(r.status) })
    ]),
    el('div', { class: 'bk-author' }, [
      el('span', { text: r.author || '佚名' }),
      Number(r.rating) > 0 ? el('span', { class: 'bk-stars', text: starText(Number(r.rating)) }) : null
    ]),
    el('div', { class: 'bk-prog-row' }, [
      el('div', { class: 'bk-prog' }, [el('i', { style: { width: pct + '%' } })]),
      el('span', { class: 'bk-prog-v', text: pct + '%' })
    ]),
    r.note ? el('div', { class: 'bk-note', text: r.note }) : null
  ]);
}

/* ---------------- 操作 ---------------- */
function openMenu(r) {
  const acts = [
    { label: '编辑', icon: 'IC-CRD-006', onSelect: () => openEditor(r) },
    { label: '更新进度', icon: 'IC-MIO-035', onSelect: () => quickProgress(r) }
  ];
  STATUS.filter((s) => s.key !== r.status).forEach((s) => {
    acts.push({
      label: `标记为${s.label}`, icon: 'IC-MIO-003',
      onSelect: async () => {
        r.status = s.key;
        if (s.key === 'done') r.progress = 100;
        if (s.key === 'reading' && !r.progress) r.progress = 5;
        r.updatedAt = Date.now();
        await put('books', r);
        await load();
        toast('已更新');
      }
    });
  });
  acts.push({ label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
    const yes = await confirmBox({ title: '删除书籍', text: `删除《${r.title}》？`, okText: '删除', danger: true });
    if (!yes) return;
    await del('books', r.id);
    await load();
    toast('已删除');
  } });
  actionSheet(r.title || '书架', acts);
}

function quickProgress(rec) {
  let progress = rec.status === 'done' ? 100 : clampPct(rec.progress);
  const range = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(progress) });
  const val = el('div', { class: 'pm-prog-v', text: progress + '%' });
  range.oninput = () => { progress = clampPct(range.value); val.textContent = progress + '%'; };

  sheet({
    title: '更新进度',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: rec.title || '' }), val, range])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      rec.progress = progress;
      if (progress >= 100) rec.status = 'done';
      else if (rec.status === 'done') rec.status = 'reading';
      else if (progress > 0 && rec.status === 'want') rec.status = 'reading';
      rec.updatedAt = Date.now();
      await put('books', rec);
      await load();
      toast('已更新');
    } }]
  });
}

function openEditor(rec) {
  let status = rec ? (rec.status || 'want') : 'want';
  let rating = rec ? Number(rec.rating) || 0 : 0;
  let progress = rec ? clampPct(rec.progress) : 0;
  if (rec && rec.status === 'done') progress = 100;

  const title = el('input', { class: 'input', placeholder: '书名', value: rec ? (rec.title || '') : '' });
  const author = el('input', { class: 'input', placeholder: '作者（可选）', value: rec ? (rec.author || '') : '' });
  const note = el('textarea', { class: 'input', rows: 3, placeholder: '笔记或短评（可选）' });
  note.value = rec ? (rec.note || '') : '';

  const statusSeg = el('div', { class: 'seg-row' });
  const starRow = el('div', { class: 'star-row' });
  const range = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(progress) });
  const rangeVal = el('span', { class: 'tiny muted', text: progress + '%' });

  function setProgress(v) {
    progress = clampPct(v);
    range.value = String(progress);
    rangeVal.textContent = progress + '%';
  }

  function paintStatus() {
    statusSeg.innerHTML = '';
    STATUS.forEach((s) => {
      statusSeg.appendChild(el('button', {
        class: 'chip' + (status === s.key ? ' on' : ''), type: 'button',
        onclick: () => {
          status = s.key;
          if (status === 'done') setProgress(100);
          else if (status === 'reading' && progress === 0) setProgress(5);
          paintStatus();
        }
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

  range.oninput = () => {
    progress = clampPct(range.value);
    rangeVal.textContent = progress + '%';
    if (progress === 100) status = 'done';
    else if (status === 'done') status = 'reading';
    else if (progress > 0 && status === 'want') status = 'reading';
    paintStatus();
  };

  paintStatus();
  paintStars();

  async function save() {
    const t = title.value.trim();
    if (!t) { toast('请填写书名'); return; }
    const data = {
      title: t,
      author: author.value.trim(),
      status,
      progress: status === 'done' ? 100 : progress,
      rating,
      note: note.value.trim(),
      updatedAt: Date.now()
    };
    if (rec) {
      Object.assign(rec, data);
      await put('books', rec);
    } else {
      await put('books', { id: uid(), ts: Date.now(), ...data });
    }
    await load();
    toast('已保存');
  }

  sheet({
    title: rec ? '编辑书籍' : '添加书籍',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '书名' }), title]),
      el('div', { class: 'field' }, [el('label', { text: '作者' }), author]),
      el('div', { class: 'field' }, [el('label', { text: '状态' }), statusSeg]),
      el('div', { class: 'field' }, [el('label', { text: '阅读进度' }), el('div', { class: 'row between' }, [rangeVal]), range]),
      el('div', { class: 'field' }, [el('label', { text: '评分' }), starRow]),
      el('div', { class: 'field' }, [el('label', { text: '笔记' }), note])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => { void save(); } }]
  });
  setTimeout(() => title.focus(), 260);
}
