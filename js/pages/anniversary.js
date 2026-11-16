/* 纪念日 · 自己的日子 + TA 想加的日子
   记录存在 anniversaries 表；TA 提的先是 pending，要点「同意」才会变成 approved。
   每个纪念日可以设置「在某些日子里按概率在聊天中提起」，以及置顶。 */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del, kvSet } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';
import {
  maybeProposeAnniversary, occurrence, daysPassed, ymd, parseYMD,
  taProposePct, proposalTitles, DEFAULT_PROPOSAL_TITLES,
  remindLines, DEFAULT_TODAY_LINES, DEFAULT_UPCOMING_LINES
} from '../annivdata.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];

let view = null;
let rows = [];

export default async function pageAnniversary(v) {
  view = v;
  fullPage({
    back: true, title: '纪念日', sub: '记下值得反复想起的日子',
    actions: [
      { label: '设置', onclick: () => openSettings() },
      { label: '添加', onclick: () => openEditor(null) }
    ]
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
    .sort((a, b) => Number(!!b.r.pinned) - Number(!!a.r.pinned) || a.occ.days - b.occ.days);
  const nearest = sorted.slice().sort((a, b) => a.occ.days - b.occ.days);

  page.appendChild(hero(nearest[0]));

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
  const passed = daysPassed(r.date);
  return el('div', { class: 'card an-hero' }, [
    el('div', { class: 'an-hero-num' }, [
      occ.days === 0
        ? el('div', { class: 'an-hero-day', text: '今天' })
        : el('div', { class: 'an-hero-day', text: String(occ.days) }),
      occ.days === 0 ? null : el('div', { class: 'an-hero-unit', text: '天' })
    ]),
    el('div', { class: 'an-hero-main' }, [
      el('div', { class: 'an-hero-t', text: occ.days === 0 ? `今天 · ${r.title}` : `倒数 ${occ.days} 天 · ${r.title}` }),
      el('div', { class: 'an-hero-s', text: `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 距今 ${passed} 天${occ.years > 0 ? ` · ${occ.years} 周年` : ''}` })
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
  const passed = daysPassed(r.date);
  const tags = [];
  if (r.pinned) tags.push({ t: '置顶', cls: 'pin' });
  if (r.remindEnabled && Number(r.remindPct) > 0) {
    const win = r.remindFrom ? `${r.remindFrom}~${r.remindTo || r.remindFrom}` : '当天';
    tags.push({ t: `提醒 ${r.remindPct}% · ${win} · ${Number(r.remindedCount || 0)}/${Number(r.remindMax || 0)}`, cls: '' });
  }
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
      el('div', { class: 'an-meta', text: metaText(occ, passed) }),
      tags.length ? el('div', { class: 'an-tags' }, tags.map((x) =>
        el('span', { class: 'an-tag' + (x.cls ? ' ' + x.cls : ''), text: x.t }))) : null
    ])
  ]);
}

function metaText(occ, passed) {
  const when = occ.days === 0 ? '就是今天' : `倒数 ${occ.days} 天`;
  const years = occ.years > 0 ? ` · ${occ.years} 周年` : '';
  return `${when} · 距今 ${passed} 天${years}`;
}

function fmtDate(s) {
  const d = parseYMD(s);
  if (!d) return '日期未填';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WD[d.getDay()]}`;
}

function openMenu(r) {
  actionSheet(r.title || '纪念日', [
    { label: r.pinned ? '取消置顶' : '置顶', onSelect: async () => {
      r.pinned = !r.pinned;
      await put('anniversaries', r);
      await load();
      toast(r.pinned ? '已置顶' : '已取消置顶');
    } },
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

/* ---------------- 编辑 / 添加 ---------------- */
/** MM-DD ↔ <input type="date"> 的值 */
const toDateVal = (mmdd) => (mmdd ? `${new Date().getFullYear()}-${mmdd}` : '');
const mdOf = (v) => (v ? String(v).slice(5, 10) : '');

function openEditor(rec) {
  const title = el('input', {
    class: 'input', placeholder: '纪念日的名字',
    value: rec ? (rec.title || '') : ''
  });
  const date = el('input', {
    class: 'input', type: 'date',
    value: rec ? rec.date : ymd()
  });
  const note = el('textarea', { class: 'input', rows: 2, placeholder: '想写点什么（可选）' });
  note.value = rec ? (rec.note || '') : '';

  const pin = el('input', { type: 'checkbox' });
  pin.checked = !!(rec && rec.pinned);

  /* 提醒：默认关闭；概率 0~100；区间用 MM-DD（跨年如 12-20 ~ 01-01）；最多提起几次 */
  const remindOn = el('input', { type: 'checkbox' });
  remindOn.checked = !!(rec && rec.remindEnabled);
  const pct = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, max: 100, value: rec ? Number(rec.remindPct || 0) : 50 });
  const from = el('input', { class: 'input', type: 'date', value: toDateVal(rec && rec.remindFrom) });
  const to = el('input', { class: 'input', type: 'date', value: toDateVal(rec && rec.remindTo) });
  const maxN = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: 99, value: rec ? Number(rec.remindMax || 3) : 3 });

  const s = sheet({
    title: rec ? '编辑纪念日' : '添加纪念日',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '名字' }), title]),
      el('div', { class: 'field' }, [el('label', { text: '日期' }), date]),
      el('div', { class: 'field' }, [el('label', { text: '备注' }), note]),
      el('label', { class: 'an-check' }, [pin, el('span', { text: '置顶（排在列表最前面）' })]),
      el('div', { class: 'an-sub-h', text: '聊天中提起' }),
      el('label', { class: 'an-check' }, [remindOn, el('span', { text: '在这些日子按概率提起这件事' })]),
      el('div', { class: 'an-grid2' }, [
        el('div', { class: 'field' }, [el('label', { text: '概率 %' }), pct]),
        el('div', { class: 'field' }, [el('label', { text: '最多提起几次' }), maxN])
      ]),
      el('div', { class: 'an-grid2' }, [
        el('div', { class: 'field' }, [el('label', { text: '从' }), from]),
        el('div', { class: 'field' }, [el('label', { text: '到' }), to])
      ]),
      el('div', { class: 'an-hint', text: '起止只算月-日，可以跨年（如 12-20 到 01-01）。不填起止就只在纪念日当天提醒。' }),
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
      note: note.value.trim(),
      pinned: pin.checked,
      remindEnabled: remindOn.checked,
      remindPct: Math.max(0, Math.min(100, Number(pct.value) || 0)),
      remindFrom: mdOf(from.value),
      remindTo: mdOf(to.value) || mdOf(from.value),
      remindMax: Math.max(1, Math.min(99, Number(maxN.value) || 3))
    };
    if (rec) {
      Object.assign(rec, data);
      await put('anniversaries', rec);
    } else {
      await put('anniversaries', {
        id: uid(), ts: Date.now(), owner: 'me', status: 'approved',
        remindedCount: 0, ...data
      });
    }
    s.close();
    await load();
    toast('已保存');
  }

  setTimeout(() => title.focus(), 260);
}

/* ---------------- 设置：TA 提议概率 + 可选名字 ---------------- */
async function openSettings() {
  const pctVal = await taProposePct();
  let titles = await proposalTitles();
  const lines = await remindLines();

  const pct = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, max: 100, value: pctVal });
  const chips = el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '8px' } });
  const addInput = el('input', { class: 'input', placeholder: '再加一个名字（如：第一次旅行）' });

  /* 提醒语录编辑器：每条一个输入框，可改可删可加 */
  const lineEditor = (list) => {
    const box = el('div');
    const addRow = (val) => {
      const input = el('input', { class: 'input', placeholder: '写一句 TA 会说的话…', value: val || '' });
      const row = el('div', { class: 'row', style: { gap: '8px', marginBottom: '8px', alignItems: 'center' } }, [
        input,
        el('button', { class: 'btn sm', type: 'button', title: '删除这条', onclick: () => row.remove() }, ['×'])
      ]);
      box.appendChild(row);
    };
    list.forEach(addRow);
    return {
      node: el('div', {}, [
        box,
        el('button', { class: 'btn sm', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => addRow('') }, ['＋ 添加一条'])
      ]),
      values: () => Array.from(box.querySelectorAll('input')).map((i) => i.value.trim()).filter(Boolean)
    };
  };
  const todayEd = lineEditor(lines.today);
  const upEd = lineEditor(lines.upcoming);

  function renderChips() {
    chips.innerHTML = '';
    titles.forEach((t, i) => {
      chips.appendChild(el('span', { class: 'an-name-chip' }, [
        el('span', { text: t }),
        el('button', {
          class: 'an-name-x', type: 'button',
          onclick: () => { titles.splice(i, 1); renderChips(); }
        }, ['×'])
      ]));
    });
    if (!titles.length) chips.appendChild(el('div', { class: 'an-hint', text: '至少留一个名字' }));
  }
  renderChips();

  const addBtn = el('button', {
    class: 'btn sm', type: 'button',
    onclick: () => {
      const v = addInput.value.trim();
      if (!v) return;
      titles.push(v);
      addInput.value = '';
      renderChips();
    }
  }, ['加入']);

  const s = sheet({
    title: '纪念日设置',
    node: el('div', {}, [
      el('div', { class: 'field' }, [
        el('label', { text: 'TA 主动提议纪念日的概率 %（0~100，默认 5）' }),
        pct,
        el('div', { class: 'an-hint', text: '每天最多掷一次；已有待同意的提议时不再提。' })
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'TA 可以选的纪念日名字' }),
        chips,
        el('div', { class: 'row', style: { gap: '8px' } }, [addInput, addBtn]),
        el('div', { class: 'an-hint', text: 'TA 提议时会从这些名字里挑一个；你不同意就不会加进来。' })
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'TA 在纪念日当天说的话' }),
        todayEd.node,
        el('div', { class: 'an-hint', text: '可用占位符：{name} 名字、{days} 倒数天数、{passed} 已经过的天数。全部删空会恢复默认。' })
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'TA 提前提醒时说的话' }),
        upEd.node
      ]),
      el('div', { class: 'row', style: { marginTop: '14px' } }, [
        el('button', {
          class: 'btn primary', type: 'button', style: { width: '100%' },
          onclick: async () => {
            const v = Math.max(0, Math.min(100, Number(pct.value) || 0));
            await kvSet('annivTaPct', v);
            await kvSet('annivProposalTitles', titles.length ? titles : DEFAULT_PROPOSAL_TITLES.slice());
            const tLines = todayEd.values();
            const uLines = upEd.values();
            await kvSet('annivLinesToday', tLines.length ? tLines : DEFAULT_TODAY_LINES.slice());
            await kvSet('annivLinesUpcoming', uLines.length ? uLines : DEFAULT_UPCOMING_LINES.slice());
            s.close();
            toast('设置已保存');
          }
        }, ['保存'])
      ])
    ])
  });
}
