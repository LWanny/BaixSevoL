/* 经期记录 · 日历 + 周期预测
   记录存在 periods 表：{ id, start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null, note }
   周期 / 经期天数存在 kv，纯本地计算，不联网。 */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del, kvGet, kvSet } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';

const DAY = 86400000;
const WD = ['日', '一', '二', '三', '四', '五', '六'];

let view = null;
let items = [];
let cycleLen = 28;
let periodLen = 5;
let cursor = null;          // 当前显示的月份（Date，取每月 1 号）

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYMD = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diffDays = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
const today = () => dayStart(new Date());

export default async function pagePeriod(v) {
  view = v;
  fullPage({
    back: true, title: '经期记录', sub: '纯本地计算 · 只存在这台设备',
    actions: [{ label: '记录', onclick: quickMenu }]
  });
  cycleLen = Number(await kvGet('periodCycle', 28)) || 28;
  periodLen = Number(await kvGet('periodDays', 5)) || 5;
  items = (await all('periods')).sort((a, b) => String(b.start).localeCompare(String(a.start)));
  cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  paint();
}

/* ---------------- 日期集合 ---------------- */
function eachDay(startStr, endStr, cb) {
  const s = parseYMD(startStr);
  const e = parseYMD(endStr);
  for (let d = dayStart(s); d <= e; d = new Date(d.getTime() + DAY)) cb(ymd(d));
}

function recordEnd(rec) {
  if (rec.end) return parseYMD(rec.end);
  const s = parseYMD(rec.start);
  const guess = new Date(s.getTime() + (periodLen - 1) * DAY);
  const t = today();
  return guess > t ? t : guess;
}

function markSets() {
  const real = new Set();
  const predicted = new Set();
  const fertile = new Set();

  items.forEach((rec) => eachDay(rec.start, ymd(recordEnd(rec)), (k) => real.add(k)));

  if (items.length) {
    const lastStart = parseYMD(items[0].start);
    let next = new Date(lastStart.getTime() + cycleLen * DAY);
    const t = today();
    // 把预测推到「今天及以后」的那一个周期
    while (next.getTime() + (periodLen - 1) * DAY < t.getTime()) next = new Date(next.getTime() + cycleLen * DAY);
    eachDay(ymd(next), ymd(new Date(next.getTime() + (periodLen - 1) * DAY)), (k) => predicted.add(k));

    const ovu = new Date(next.getTime() - 14 * DAY);
    eachDay(ymd(new Date(ovu.getTime() - 4 * DAY)), ymd(new Date(ovu.getTime() + 3 * DAY)), (k) => fertile.add(k));
  }
  return { real, predicted, fertile };
}

function nextStartDate() {
  if (!items.length) return null;
  const lastStart = parseYMD(items[0].start);
  let next = new Date(lastStart.getTime() + cycleLen * DAY);
  const t = today();
  while (next < t) next = new Date(next.getTime() + cycleLen * DAY);
  return next;
}

function avgCycle() {
  if (items.length < 2) return cycleLen;
  let sum = 0, n = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const d = diffDays(parseYMD(items[i + 1].start), parseYMD(items[i].start));
    if (d > 10 && d < 90) { sum += d; n++; }
  }
  return n ? Math.round(sum / n) : cycleLen;
}

/* ---------------- 渲染 ---------------- */
function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page period' });
  const sets = markSets();
  const next = nextStartDate();

  /* 概览 */
  page.appendChild(el('div', { class: 'card pd-hero' }, [
    el('div', { class: 'pd-hero-ic' }, [iconImg('IC-MIO-033')]),
    el('div', { class: 'pd-hero-main' }, [
      el('div', { class: 'pd-hero-t', text: next ? (diffDays(today(), next) === 0 ? '就是今天' : `预计还有 ${diffDays(today(), next)} 天`) : '还没有记录' }),
      el('div', { class: 'pd-hero-s', text: next ? `下次预计 ${next.getMonth() + 1} 月 ${next.getDate()} 日 · 周期 ${avgCycle()} 天` : '点下面「今天来了」开始第一次记录' })
    ]),
    el('button', { class: 'btn sm', onclick: openConfig }, ['设置'])
  ]));

  /* 两个快捷按钮 */
  const open = items.find((r) => !r.end);
  page.appendChild(el('div', { class: 'row pd-quick' }, [
    el('button', { class: 'btn primary', onclick: () => startToday() }, ['今天来了']),
    el('button', { class: 'btn', onclick: () => endToday() }, [open ? '今天结束了' : '结束经期'])
  ]));

  /* 日历 */
  page.appendChild(calendar(sets));

  /* 记录列表 */
  const listCard = el('div', { class: 'card flush' });
  if (!items.length) {
    listCard.appendChild(el('div', { class: 'empty', style: { padding: '30px 18px' } }, [
      el('div', { class: 'e-h', text: '还没有记录' }),
      el('div', { class: 'e-p', text: '每次进来点一下「今天来了」，周期会越算越准' })
    ]));
  } else {
    items.slice(0, 24).forEach((rec) => {
      const end = recordEnd(rec);
      const len = diffDays(parseYMD(rec.start), end) + 1;
      listCard.appendChild(el('div', { class: 'list-item', onclick: () => recMenu(rec) }, [
        iconImg('IC-MIO-033'),
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title', text: `${rec.start} → ${rec.end || '进行中'}` }),
          el('div', { class: 'li-sub', text: `持续 ${len} 天${rec.note ? ' · ' + rec.note : ''}` })
        ]),
        el('span', { class: 'li-val', text: rec.end ? '' : '进行中' })
      ]));
    });
  }
  page.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '我的记录' })]),
    listCard
  ]));

  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' }, text: '预测仅供参考，身体情况请以自己感受为准' }));
  view.appendChild(page);
}

function calendar(sets) {
  const t = today();
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startWeek = first.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const head = el('div', { class: 'pd-cal-h' }, [
    el('button', { class: 'pd-nav', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); paint(); } }, ['‹']),
    el('div', { class: 'pd-cal-t', text: `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月` }),
    el('button', { class: 'pd-nav', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); paint(); } }, ['›'])
  ]);

  const grid = el('div', { class: 'pd-grid' });
  WD.forEach((w) => grid.appendChild(el('div', { class: 'pd-wd', text: w })));

  for (let i = 0; i < startWeek; i++) grid.appendChild(el('div', { class: 'pd-blank' }));

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    const key = ymd(date);
    const cls = ['pd-day'];
    if (sets.real.has(key)) cls.push('on');
    else if (sets.predicted.has(key)) cls.push('pre');
    if (sets.fertile.has(key) && !sets.real.has(key)) cls.push('fertile');
    if (key === ymd(t)) cls.push('today');
    grid.appendChild(el('div', { class: cls.join(' ') }, [el('span', { text: String(d) })]));
    grid.lastChild.onclick = () => dayMenu(key);
  }

  return el('div', { class: 'card pd-cal' }, [
    head,
    grid,
    el('div', { class: 'pd-legend' }, [
      el('span', {}, [el('i', { class: 'lg on' }), '经期']),
      el('span', {}, [el('i', { class: 'lg pre' }), '预计']),
      el('span', {}, [el('i', { class: 'lg fertile' }), '易孕期'])
    ])
  ]);
}

/* ---------------- 操作 ---------------- */
async function reload() {
  items = (await all('periods')).sort((a, b) => String(b.start).localeCompare(String(a.start)));
  paint();
}

function quickMenu() {
  actionSheet('经期记录', [
    { label: '今天来了', icon: 'IC-MIO-033', onSelect: startToday },
    { label: '今天结束了', icon: 'IC-MIO-003', onSelect: endToday },
    { label: '周期与经期天数', icon: 'IC-MIO-001', onSelect: openConfig }
  ]);
}

async function startToday() {
  const key = ymd(today());
  const covered = items.some((r) => {
    const s = parseYMD(r.start), e = recordEnd(r);
    return parseYMD(key) >= s && parseYMD(key) <= e;
  });
  if (covered) { toast('今天已经记录过了'); return; }
  await put('periods', { id: uid(), start: key, end: null, note: '', ts: Date.now() });
  await reload();
  toast('已记录，好好休息');
}

async function endToday() {
  const open = items.find((r) => !r.end);
  if (!open) { toast('当前没有进行中的经期'); return; }
  open.end = ymd(today());
  await put('periods', open);
  await reload();
  toast('已记为结束');
}

function dayMenu(key) {
  const rec = items.find((r) => {
    const s = parseYMD(r.start), e = recordEnd(r);
    return parseYMD(key) >= s && parseYMD(key) <= e;
  });
  const acts = [];
  acts.push({ label: `从 ${key} 开始`, icon: 'IC-MIO-033', onSelect: async () => {
    await put('periods', { id: uid(), start: key, end: null, note: '', ts: Date.now() });
    await reload();
    toast('已添加');
  } });
  if (rec) {
    acts.push({ label: '把这一天记为结束', icon: 'IC-MIO-003', onSelect: async () => {
      rec.end = key;
      await put('periods', rec);
      await reload();
      toast('已更新');
    } });
    acts.push({ label: '删除这一条记录', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '删除记录', text: `删除从 ${rec.start} 开始的这条记录？`, okText: '删除', danger: true });
      if (!yes) return;
      await del('periods', rec.id);
      await reload();
      toast('已删除');
    } });
  }
  actionSheet(key, acts);
}

function recMenu(rec) {
  actionSheet(rec.start, [
    { label: '编辑备注', icon: 'IC-CRD-006', onSelect: () => editNote(rec) },
    { label: '标记结束在今天', icon: 'IC-MIO-003', onSelect: async () => {
      rec.end = ymd(today());
      await put('periods', rec);
      await reload();
      toast('已更新');
    } },
    { label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '删除记录', text: '删除后无法恢复。', okText: '删除', danger: true });
      if (!yes) return;
      await del('periods', rec.id);
      await reload();
      toast('已删除');
    } }
  ]);
}

function editNote(rec) {
  const input = el('input', { class: 'input', placeholder: '比如：量多 / 腹痛', value: rec.note || '' });
  sheet({
    title: '编辑备注',
    node: el('div', { class: 'field' }, [input]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      rec.note = input.value.trim();
      await put('periods', rec);
      await reload();
      toast('已保存');
    } }]
  });
  setTimeout(() => input.focus(), 260);
}

function openConfig() {
  const c = el('input', { class: 'input', type: 'number', min: '15', max: '60', value: String(cycleLen) });
  const p = el('input', { class: 'input', type: 'number', min: '1', max: '15', value: String(periodLen) });
  sheet({
    title: '周期设置',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '平均周期（天）' }), c, el('div', { class: 'hint', text: '两次经期第一天之间的天数，常见 21–35 天' })]),
      el('div', { class: 'field' }, [el('label', { text: '经期天数' }), p, el('div', { class: 'hint', text: '每次持续几天，用来推算结束日' })])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      cycleLen = clampInt(c.value, 15, 60, 28);
      periodLen = clampInt(p.value, 1, 15, 5);
      await kvSet('periodCycle', cycleLen);
      await kvSet('periodDays', periodLen);
      await reload();
      toast('已保存');
    } }]
  });
}

function clampInt(v, lo, hi, def) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
