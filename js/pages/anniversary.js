/* 纪念日 · 自己的日子 + TA 想加的日子
   记录存在 anniversaries 表；TA 提的先是 pending，要点「同意」才会变成 approved。 */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';
import { maybeProposeAnniversary, occurrence, ymd, parseYMD } from '../annivdata.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];

let view = null;
let rows = [];

export default async function pageAnniversary(v) {
  view = v;
  fullPage({
    back: true, title: '纪念日', sub: '记下值得反复想起的日子',
    actions: [{ label: '添加', onclick: () => openEditor(null) }]
  });
  await maybeProposeAnniversary();
  await load();
}

async function load() {
  rows = await all('anniversaries');
  paint();
}

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page anniv' });

  const approved = rows.filter((r) => r.status === 'approved');
  const pending = rows.filter((r) => r.status === 'pending');
  const sorted = approved
    .map((r) => ({ r, occ: occurrence(r.date) }))
    .filter((x) => x.occ)
    .sort((a, b) => a.occ.days - b.occ.days);

  page.appendChild(hero(sorted[0]));

  if (pending.length) {
    page.appendChild(el('div', { class: 'an-sec-h' }, [
      el('div', { class: 'an-sec-t', text: '他想加的日子' }),
      el('div', { class: 'an-sec-n', text: String(pending.length) })
    ]));
    pending.forEach((r) => page.appendChild(pendingCard(r)));
  }

  if (!sorted.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-017'),
      el('div', { class: 'e-h', text: '还没有纪念日' }),
      el('div', { class: 'e-p', text: '点右上角「添加」，把重要的日子记下来' })
    ]));
  } else {
    page.appendChild(el('div', { class: 'an-sec-h' }, [
      el('div', { class: 'an-sec-t', text: '我们的日子' })
    ]));
    sorted.forEach(({ r, occ }) => page.appendChild(itemCard(r, occ)));
  }

  view.appendChild(page);
}

function hero(top) {
  if (!top) {
    return el('div', { class: 'card an-hero' }, [
      el('div', { class: 'an-hero-ic' }, [iconImg('IC-MIO-017')]),
      el('div', { class: 'an-hero-main' }, [
        el('div', { class: 'an-hero-t', text: '把重要的日子留在这里' }),
        el('div', { class: 'an-hero-s', text: '它会帮你算着下一次还有多久' })
      ])
    ]);
  }
  const { r, occ } = top;
  const d = parseYMD(r.date);
  return el('div', { class: 'card an-hero' }, [
    el('div', { class: 'an-hero-num' }, [
      occ.days === 0
        ? el('div', { class: 'an-hero-day', text: '今天' })
        : el('div', { class: 'an-hero-day', text: String(occ.days) }),
      occ.days === 0 ? null : el('div', { class: 'an-hero-unit', text: '天' })
    ]),
    el('div', { class: 'an-hero-main' }, [
      el('div', { class: 'an-hero-t', text: occ.days === 0 ? `今天 · ${r.title}` : `还有 ${occ.days} 天 · ${r.title}` }),
      el('div', { class: 'an-hero-s', text: `${d.getMonth() + 1} 月 ${d.getDate()} 日${occ.years > 0 ? ` · ${occ.years} 周年` : ''}` })
    ])
  ]);
}

function pendingCard(r) {
  return el('div', { class: 'card an-pending' }, [
    el('div', { class: 'an-pd-top' }, [
      el('span', { class: 'an-pd-badge', text: 'TA 想加' }),
      el('span', { class: 'an-pd-date', text: fmtDate(r.date) })
    ]),
    el('div', { class: 'an-pd-title', text: r.title || '纪念日' }),
    r.note ? el('div', { class: 'an-pd-note', text: r.note }) : null,
    el('div', { class: 'an-pd-btns' }, [
      el('button', {
        class: 'btn sm primary', type: 'button',
        onclick: () => decide(r, true)
      }, ['同意']),
      el('button', {
        class: 'btn sm', type: 'button',
        onclick: () => decide(r, false)
      }, ['不同意'])
    ])
  ]);
}

async function decide(r, ok) {
  if (!ok) {
    const yes = await confirmBox({
      title: '不同意这个纪念日',
      text: `不把「${r.title || '纪念日'}」加进来？`,
      okText: '不同意', cancelText: '再想想'
    });
    if (!yes) return;
    await del('anniversaries', r.id);
    await load();
    toast('已忽略');
    return;
  }
  r.status = 'approved';
  r.decidedAt = Date.now();
  await put('anniversaries', r);
  await load();
  toast('纪念日已添加');
}

function itemCard(r, occ) {
  const d = parseYMD(r.date);
  return el('div', { class: 'card an-item', onclick: () => openMenu(r) }, [
    el('div', { class: 'an-date' }, [
      el('div', { class: 'an-m', text: `${d.getMonth() + 1}月` }),
      el('div', { class: 'an-d', text: String(d.getDate()).padStart(2, '0') })
    ]),
    el('div', { class: 'an-main' }, [
      el('div', { class: 'an-title-row' }, [
        el('div', { class: 'an-title', text: r.title || '纪念日' }),
        r.owner === 'ta' ? el('span', { class: 'an-owner', text: 'TA 添加' }) : null
      ]),
      r.note ? el('div', { class: 'an-note', text: r.note }) : null,
      el('div', { class: 'an-meta', text: metaText(occ) })
    ])
  ]);
}

function metaText(occ) {
  const when = occ.days === 0 ? '就是今天' : `还有 ${occ.days} 天`;
  const years = occ.years > 0 ? ` · ${occ.years} 周年` : '';
  return when + years;
}

function fmtDate(s) {
  const d = parseYMD(s);
  if (!d) return '日期未填';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WD[d.getDay()]}`;
}

function openMenu(r) {
  actionSheet(r.title || '纪念日', [
    { label: '编辑', icon: 'IC-CRD-006', onSelect: () => openEditor(r) },
    { label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({
        title: '删除纪念日',
        text: `删除「${r.title || '纪念日'}」？`,
        okText: '删除', danger: true
      });
      if (!yes) return;
      await del('anniversaries', r.id);
      await load();
      toast('已删除');
    } }
  ]);
}

function openEditor(rec) {
  const title = el('input', {
    class: 'input', placeholder: '纪念日的名字',
    value: rec ? (rec.title || '') : ''
  });
  const date = el('input', {
    class: 'input', type: 'date',
    value: rec ? rec.date : ymd()
  });
  const note = el('textarea', { class: 'input', rows: 3, placeholder: '想写点什么（可选）' });
  note.value = rec ? (rec.note || '') : '';

  const s = sheet({
    title: rec ? '编辑纪念日' : '添加纪念日',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '名字' }), title]),
      el('div', { class: 'field' }, [el('label', { text: '日期' }), date]),
      el('div', { class: 'field' }, [el('label', { text: '备注' }), note]),
      el('div', { class: 'row', style: { marginTop: '14px' } }, [
        el('button', { class: 'btn primary', type: 'button', style: { width: '100%' }, onclick: save }, ['保存'])
      ])
    ])
  });

  async function save() {
    const t = title.value.trim() || '纪念日';
    if (!date.value) { toast('请选择日期'); return; }
    const data = {
      title: t,
      date: date.value,
      note: note.value.trim()
    };
    if (rec) {
      Object.assign(rec, data);
      await put('anniversaries', rec);
    } else {
      await put('anniversaries', {
        id: uid(), ts: Date.now(), owner: 'me', status: 'approved', ...data
      });
    }
    s.close();
    await load();
    toast('已保存');
  }

  setTimeout(() => title.focus(), 260);
}
