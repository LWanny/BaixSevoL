/* 记账 · 按月收支统计
   记录存在 ledger 表：{ id, ts, kind:'out'|'in', amount, cat, note }
   纯本地计算，不联网，随「数据」页整包备份。 */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { all, put, del } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';

const OUT_CATS = ['餐饮', '交通', '购物', '居家', '娱乐', '医疗', '学习', '其他'];
const IN_CATS = ['工资', '红包', '兼职', '理财', '其他'];
const WD = '日一二三四五六';

let view = null;
let rows = [];
let cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtMoney = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default async function pageLedger(v) {
  view = v;
  fullPage({ back: true, title: '记账', sub: '本地账本 · 按月统计', actions: [
    { icon: 'IC-CRD-009', label: '统计', onclick: () => go('/ledger-stats') }
  ] });
  await load();
}

async function load() {
  rows = (await all('ledger'))
    .filter((r) => Number.isFinite(Number(r.amount)))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  paint();
}

function monthRows() {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
  return rows.filter((r) => r.ts >= start && r.ts < end);
}

/* ---------------- 渲染 ---------------- */
function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page ledger' });
  const list = monthRows();
  const income = list.filter((r) => r.kind === 'in').reduce((s, r) => s + Number(r.amount), 0);
  const expense = list.filter((r) => r.kind === 'out').reduce((s, r) => s + Number(r.amount), 0);
  const balance = income - expense;

  /* 月度结余 */
  page.appendChild(el('div', { class: 'card ld-hero' }, [
    el('div', { class: 'ld-hero-l', text: `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月结余` }),
    el('div', { class: 'ld-hero-v', text: (balance < 0 ? '−' : '') + fmtMoney(Math.abs(balance)) }),
    el('div', { class: 'ld-hero-r' }, [
      el('div', {}, [
        el('div', { class: 'ld-hi-t', text: '收入' }),
        el('div', { class: 'ld-hi-v', text: fmtMoney(income) })
      ]),
      el('div', {}, [
        el('div', { class: 'ld-hi-t', text: '支出' }),
        el('div', { class: 'ld-hi-v', text: fmtMoney(expense) })
      ]),
      el('div', { class: 'ld-hero-count', text: `${list.length} 笔` })
    ])
  ]));

  /* 月份切换 + 记一笔 */
  page.appendChild(el('div', { class: 'ld-bar' }, [
    el('div', { class: 'ld-month' }, [
      el('button', { class: 'ld-nav', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); paint(); } }, ['‹']),
      el('div', { class: 'ld-month-t', text: `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月` }),
      el('button', { class: 'ld-nav', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); paint(); } }, ['›'])
    ]),
    el('button', { class: 'btn primary sm', onclick: () => openEditor(null) }, [iconImg('IC-MIO-022'), '记一笔'])
  ]));

  /* 支出分类 */
  const byCat = new Map();
  list.filter((r) => r.kind === 'out').forEach((r) => {
    const k = r.cat || '其他';
    byCat.set(k, (byCat.get(k) || 0) + Number(r.amount));
  });
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (cats.length) {
    const max = cats[0][1] || 1;
    page.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '本月支出分类' })]),
      el('div', { class: 'card' }, cats.map(([name, amt]) => el('div', { class: 'ld-cat-row' }, [
        el('div', { class: 'ld-cat-name', text: name }),
        el('div', { class: 'ld-cat-bar' }, [el('i', { style: { width: Math.max(4, (amt / max) * 100) + '%' } })]),
        el('div', { class: 'ld-cat-amt', text: fmtMoney(amt) })
      ])))
    ]));
  }

  /* 明细 */
  if (!list.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-034'),
      el('div', { class: 'e-h', text: '这个月还没有账目' }),
      el('div', { class: 'e-p', text: '点「记一笔」，把今天的花销记下来' })
    ]));
    view.appendChild(page);
    return;
  }

  const groups = [];
  const idx = {};
  list.forEach((r) => {
    const k = ymd(new Date(r.ts));
    if (!idx[k]) { idx[k] = { key: k, rows: [] }; groups.push(idx[k]); }
    idx[k].rows.push(r);
  });

  page.appendChild(el('div', { class: 'sec-h', style: { margin: '4px 2px 9px' } }, [
    el('div', { class: 'h', text: '明细' })
  ]));

  groups.forEach((g) => {
    const dIn = g.rows.filter((r) => r.kind === 'in').reduce((s, r) => s + Number(r.amount), 0);
    const dOut = g.rows.filter((r) => r.kind === 'out').reduce((s, r) => s + Number(r.amount), 0);
    const card = el('div', { class: 'card flush ld-day' });
    card.appendChild(el('div', { class: 'ld-day-h' }, [
      el('span', { text: dayLabel(g.key) }),
      el('span', { class: 'ld-day-sum', text: [dOut ? '支出 ' + fmtMoney(dOut) : '', dIn ? '收入 ' + fmtMoney(dIn) : ''].filter(Boolean).join(' · ') })
    ]));
    g.rows.forEach((r) => card.appendChild(row(r)));
    page.appendChild(card);
  });

  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' }, text: '账目只保存在这台设备上' }));
  view.appendChild(page);
}

function row(r) {
  return el('div', { class: 'ld-row', onclick: () => rowMenu(r) }, [
    el('div', { class: 'ld-row-ic', text: (r.cat || '其').slice(0, 1) }),
    el('div', { class: 'ld-row-main' }, [
      el('div', { class: 'ld-row-t', text: r.cat || '其他' }),
      el('div', { class: 'ld-row-s', text: r.note || (r.kind === 'out' ? '支出' : '收入') })
    ]),
    el('div', { class: 'ld-row-v' + (r.kind === 'in' ? ' in' : ''), text: (r.kind === 'in' ? '+' : '−') + fmtMoney(r.amount) })
  ]);
}

function dayLabel(key) {
  const t = new Date();
  if (key === ymd(t)) return '今天';
  if (key === ymd(new Date(t.getTime() - 86400000))) return '昨天';
  const d = new Date(key + 'T00:00:00');
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WD[d.getDay()]}`;
}

/* ---------------- 操作 ---------------- */
function rowMenu(r) {
  actionSheet(fmtMoney(r.amount), [
    { label: '编辑', icon: 'IC-CRD-006', onSelect: () => openEditor(r) },
    { label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '删除账目', text: '删除后无法恢复，确定吗？', okText: '删除', danger: true });
      if (!yes) return;
      await del('ledger', r.id);
      await load();
      toast('已删除');
    } }
  ]);
}

function openEditor(rec) {
  let kind = rec ? rec.kind : 'out';
  let cat = rec ? (rec.cat || '其他') : OUT_CATS[0];

  const amount = el('input', {
    class: 'input', type: 'number', inputmode: 'decimal', step: '0.01', placeholder: '0.00',
    value: rec ? String(rec.amount) : ''
  });
  const kindSeg = el('div', { class: 'seg-row' });
  const catSeg = el('div', { class: 'seg-row' });
  const date = el('input', { class: 'input', type: 'date', value: ymd(new Date(rec ? rec.ts : Date.now())) });
  const note = el('input', { class: 'input', placeholder: '备注（可选）', value: rec ? (rec.note || '') : '' });

  function paintKind() {
    kindSeg.innerHTML = '';
    [['out', '支出'], ['in', '收入']].forEach(([k, label]) => {
      kindSeg.appendChild(el('button', {
        class: 'chip' + (kind === k ? ' on' : ''), type: 'button',
        onclick: () => { kind = k; paintKind(); paintCats(); }
      }, [label]));
    });
  }

  function paintCats() {
    catSeg.innerHTML = '';
    const list = kind === 'out' ? OUT_CATS : IN_CATS;
    if (!list.includes(cat)) cat = list[0];
    list.forEach((c) => {
      catSeg.appendChild(el('button', {
        class: 'chip' + (cat === c ? ' on' : ''), type: 'button',
        onclick: () => { cat = c; paintCats(); }
      }, [c]));
    });
  }

  paintKind();
  paintCats();

  async function save() {
    const n = Math.round(Number(amount.value) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) { toast('请输入有效金额'); return; }
    const ts = date.value ? new Date(date.value + 'T12:00:00').getTime() : Date.now();
    const data = { amount: n, kind, cat, note: note.value.trim(), ts };
    if (rec) {
      Object.assign(rec, data);
      await put('ledger', rec);
    } else {
      await put('ledger', { id: uid(), ...data });
    }
    await load();
    toast('已保存');
  }

  sheet({
    title: rec ? '编辑账目' : '记一笔',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '金额' }), amount]),
      el('div', { class: 'field' }, [el('label', { text: '类型' }), kindSeg]),
      el('div', { class: 'field' }, [el('label', { text: '分类' }), catSeg]),
      el('div', { class: 'field' }, [el('label', { text: '日期' }), date]),
      el('div', { class: 'field' }, [el('label', { text: '备注' }), note])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => { void save(); } }]
  });
  setTimeout(() => amount.focus(), 260);
}

/* ================= 统计页 ================= */
const RANGES = [
  { k: '1', label: '本月' },
  { k: '3', label: '近3月' },
  { k: '6', label: '近6月' },
  { k: 'all', label: '全部' }
];
let statRange = '1';

function rangeStart(k) {
  const now = new Date();
  if (k === 'all') return 0;
  const back = Number(k) - 1;
  return new Date(now.getFullYear(), now.getMonth() - back, 1).getTime();
}
function rangeRows(k) {
  const s = rangeStart(k);
  return rows.filter((r) => r.ts >= s);
}
/* 时段覆盖的月份数（用于日均与趋势图） */
function rangeMonths(k) {
  if (k === 'all') {
    if (!rows.length) return 1;
    const first = Math.min(...rows.map((r) => r.ts || Infinity));
    const now = new Date();
    const start = new Date(first);
    return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);
  }
  return Number(k);
}

export async function pageLedgerStats(v) {
  view = v;
  fullPage({ back: true, title: '统计', sub: '收支分析 · 纯本地计算' });
  await load();
  paintStats();
}

function paintStats() {
  view.innerHTML = '';
  const page = el('div', { class: 'page ledger' });
  const list = rangeRows(statRange);

  const income = list.filter((r) => r.kind === 'in').reduce((s, r) => s + Number(r.amount), 0);
  const expense = list.filter((r) => r.kind === 'out').reduce((s, r) => s + Number(r.amount), 0);
  const days = Math.max(1, Math.ceil((Date.now() - rangeStart(statRange)) / 86400000)) || 1;
  const avgDay = expense / days;
  const maxOut = list.filter((r) => r.kind === 'out').sort((a, b) => Number(b.amount) - Number(a.amount))[0];

  /* 时段切换 */
  const seg = el('div', { class: 'ld-bar', style: { marginTop: '0' } }, [
    el('div', { class: 'seg-row' }, RANGES.map((r) => el('button', {
      class: 'chip' + (statRange === r.k ? ' on' : ''), type: 'button',
      onclick: () => { statRange = r.k; paintStats(); }
    }, [r.label])))
  ]);
  page.appendChild(seg);

  /* 总览 KPI */
  page.appendChild(el('div', { class: 'st-grid' }, [
    kpi('收入', fmtMoney(income), 'in'),
    kpi('支出', fmtMoney(expense), 'out'),
    kpi('结余', (income - expense < 0 ? '−' : '') + fmtMoney(Math.abs(income - expense)), income - expense >= 0 ? 'in' : 'out'),
    kpi('笔数', String(list.length), ''),
    kpi('日均支出', fmtMoney(Math.round(avgDay * 100) / 100), ''),
    kpi('最大单笔', maxOut ? fmtMoney(maxOut.amount) : '—', maxOut ? 'out' : '')
  ]));

  /* 月趋势（时段内月份，全部时最多 12 根） */
  const months = buildMonths(statRange, list);
  if (months.length) {
    const max = Math.max(...months.map((m) => Math.max(m.out, m.in)), 1);
    page.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '月度趋势' })]),
      el('div', { class: 'card' }, [
        el('div', { class: 'st-legend' }, [
          el('span', {}, [el('i', { class: 'st-dot out' }), '支出']),
          el('span', {}, [el('i', { class: 'st-dot in' }), '收入'])
        ]),
        el('div', { class: 'st-bars' }, months.map((m) => el('div', { class: 'st-col' }, [
          el('div', { class: 'st-pair' }, [
            el('i', { class: 'st-bar out', style: { height: Math.max(m.out ? 3 : 0, (m.out / max) * 100) + '%' }, title: '支出 ' + fmtMoney(m.out) }),
            el('i', { class: 'st-bar in', style: { height: Math.max(m.in ? 3 : 0, (m.in / max) * 100) + '%' }, title: '收入 ' + fmtMoney(m.in) })
          ]),
          el('div', { class: 'st-x', text: m.label })
        ])))
      ])
    ]));
  }

  /* 支出 / 收入分类占比 */
  page.appendChild(catBlock('支出分类', list, 'out'));
  page.appendChild(catBlock('收入分类', list, 'in'));

  if (!list.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-034'),
      el('div', { class: 'e-h', text: '这个时段没有账目' }),
      el('div', { class: 'e-p', text: '换个时段，或先去记一笔' })
    ]));
  }

  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' }, text: '统计只读取本机账本数据' }));
  view.appendChild(page);
}

function kpi(label, value, tone) {
  return el('div', { class: 'st-kpi' }, [
    el('div', { class: 'st-kpi-t', text: label }),
    el('div', { class: 'st-kpi-v' + (tone ? ' ' + tone : ''), text: value })
  ]);
}

function buildMonths(k, list) {
  const now = new Date();
  const n = Math.min(rangeMonths(k), 12);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const s = d.getTime();
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const inMonth = list.filter((r) => r.ts >= s && r.ts < e);
    out.push({
      label: `${d.getMonth() + 1}月`,
      out: inMonth.filter((r) => r.kind === 'out').reduce((a, r) => a + Number(r.amount), 0),
      in: inMonth.filter((r) => r.kind === 'in').reduce((a, r) => a + Number(r.amount), 0)
    });
  }
  return out;
}

function catBlock(title, list, kind) {
  const byCat = new Map();
  list.filter((r) => r.kind === kind).forEach((r) => {
    const k = r.cat || '其他';
    byCat.set(k, (byCat.get(k) || 0) + Number(r.amount));
  });
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const total = cats.reduce((s, [, a]) => s + a, 0);
  if (!cats.length) return el('div');
  const max = cats[0][1] || 1;
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: title })]),
    el('div', { class: 'card' }, cats.map(([name, amt]) => {
      const pct = total ? Math.round((amt / total) * 1000) / 10 : 0;
      return el('div', { class: 'ld-cat-row' }, [
        el('div', { class: 'ld-cat-name', text: name }),
        el('div', { class: 'ld-cat-bar' }, [el('i', {
          class: kind === 'in' ? 'in' : '',
          style: { width: Math.max(4, (amt / max) * 100) + '%' }
        })]),
        el('div', { class: 'ld-cat-amt', text: fmtMoney(amt) }),
        el('div', { class: 'st-pct', text: pct + '%' })
      ]);
    }))
  ]);
}
