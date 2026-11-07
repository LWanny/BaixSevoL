/* 经期记录 · 日历 + 周期预测 + 当天详情
   记录存在 periods 表：{ id, start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null, note }
   当天详情（经量 / 身体状况 / 情绪等，除日期外全部可选）存 kv periodLogs：[{ date, flow, body, mood, energy, ovu, note }]
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
let logs = [];          // 当天详情 [{date, flow, body, mood, energy, ovu, note}]
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
  logs = (await kvGet('periodLogs', [])) || [];
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

/** 实际记录的平均经期天数（至少 2 条有始有终的记录，否则用设置值） */
function avgPeriodLen() {
  let sum = 0, n = 0;
  items.forEach((r) => {
    if (!r.end) return;
    const d = diffDays(parseYMD(r.start), parseYMD(r.end)) + 1;
    if (d >= 1 && d <= 15) { sum += d; n++; }
  });
  return n >= 2 ? Math.round(sum / n) : periodLen;
}

/** 某天的详情（经量 / 身体状况…，可选） */
function logOf(date) { return logs.find((l) => l.date === date) || null; }

/* ---------------- 当天详情表单（除日期外全部可选） ---------------- */
const FLOW = ['少', '中', '多'];
const BODY = ['痛经', '腰酸', '头痛', '乳房胀痛', '疲劳', '长痘', '失眠', '食欲变化'];
const MOOD = ['开心', '平静', '焦虑', '烦躁', '低落', '易怒'];
const ENERGY = ['精力好', '一般', '疲惫', '嗜睡'];

function openDayForm(date) {
  const init = logOf(date) || { date, flow: '', body: [], mood: [], energy: '', ovu: false, note: '' };
  const [iy, im, id0] = date.split('-').map(Number);
  const now = new Date();
  const st = { flow: init.flow || '', body: [...(init.body || [])], mood: [...(init.mood || [])], energy: init.energy || '', ovu: !!init.ovu };

  const mkSel = (nums, val, suffix) => {
    const s = el('select', { class: 'input' });
    nums.forEach((n) => s.appendChild(el('option', { value: String(n), text: n + suffix })));
    s.value = String(val);
    return s;
  };
  const ySel = mkSel([now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1], iy, ' 年');
  const mSel = mkSel(Array.from({ length: 12 }, (_, i) => i + 1), im, ' 月');
  const rebuildDays = (keep) => {
    const dim = new Date(Number(ySel.value), Number(mSel.value), 0).getDate();
    const s = el('select', { class: 'input' });
    for (let d = 1; d <= dim; d++) s.appendChild(el('option', { value: String(d), text: d + ' 日' }));
    s.value = String(Math.min(keep, dim));
    return s;
  };
  let dSel = rebuildDays(id0);
  const dateRow = el('div', { class: 'row', style: { gap: '8px' } }, [ySel, mSel, dSel]);
  const syncDays = () => { const keep = Number(dSel.value); const s = rebuildDays(keep); dateRow.replaceChild(s, dSel); dSel = s; };
  ySel.onchange = syncDays;
  mSel.onchange = syncDays;

  /** chips 组：isOn 决定高亮，onPick 改状态后自动重画（单选/多选由 onPick 写法决定） */
  const chipGroup = (opts, isOn, onPick) => {
    const box = el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '7px' } });
    const draw = () => {
      box.innerHTML = '';
      opts.forEach((o) => {
        const c = el('div', { class: 'chip' + (isOn(o) ? ' on' : ''), text: o });
        c.onclick = () => { onPick(o); draw(); };
        box.appendChild(c);
      });
    };
    draw();
    return box;
  };
  const toggle = (arr, o) => { const i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); else arr.push(o); };
  const flowBox = chipGroup(FLOW, (o) => st.flow === o, (o) => { st.flow = st.flow === o ? '' : o; });
  const bodyBox = chipGroup(BODY, (o) => st.body.includes(o), (o) => toggle(st.body, o));
  const moodBox = chipGroup(MOOD, (o) => st.mood.includes(o), (o) => toggle(st.mood, o));
  const energyBox = chipGroup(ENERGY, (o) => st.energy === o, (o) => { st.energy = st.energy === o ? '' : o; });
  const ovuBox = chipGroup(['未确认', '已确认'], (o) => (o === '已确认') === st.ovu, (o) => { st.ovu = o === '已确认'; });
  const note = el('textarea', { class: 'input', rows: '2', placeholder: '想记点什么…' });
  note.value = init.note || '';

  sheet({
    title: logOf(date) ? '编辑记录' : '添加记录',
    node: el('div', {}, [
      el('div', { class: 'hint', text: '补记过去的经期，或添加今天 · 除日期外都可以不填' }),
      el('div', { class: 'field' }, [el('label', { text: '日期' }), dateRow]),
      el('div', { class: 'field' }, [el('label', { text: '经量' }), flowBox]),
      el('div', { class: 'field' }, [el('label', { text: '身体情况' }), bodyBox]),
      el('div', { class: 'field' }, [el('label', { text: '情绪' }), moodBox]),
      el('div', { class: 'field' }, [el('label', { text: '睡眠 / 精力' }), energyBox]),
      el('div', { class: 'field' }, [el('label', { text: '排卵确认' }), ovuBox, el('div', { class: 'hint', text: '测到强阳 / 体温升高时勾选' })]),
      el('div', { class: 'field' }, [el('label', { text: '备注' }), note])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      const pad = (n) => String(n).padStart(2, '0');
      const newDate = `${ySel.value}-${pad(Number(mSel.value))}-${pad(Number(dSel.value))}`;
      const has = st.flow || st.body.length || st.mood.length || st.energy || st.ovu || note.value.trim();
      if (!has) {
        if (logOf(date)) {
          logs = logs.filter((l) => l.date !== date);
          await kvSet('periodLogs', logs);
          await reload();
          toast('已清除这天的详情');
        } else toast('没有填写内容');
        return;
      }
      const row = { date: newDate, flow: st.flow, body: st.body, mood: st.mood, energy: st.energy, ovu: st.ovu, note: note.value.trim() };
      if (newDate !== date) logs = logs.filter((l) => l.date !== date && l.date !== newDate);
      const i = logs.findIndex((l) => l.date === newDate);
      if (i >= 0) logs[i] = row; else logs.push(row);
      await kvSet('periodLogs', logs);
      await reload();
      toast('已保存');
    } }]
  });
}

/** 近半年经期趋势：每月一行轨道，实心段=已记录经期，浅色段=预测 */
function trendCard(sets) {
  const t = today();
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(t.getFullYear(), t.getMonth() - i, 1));
  let has = false;
  const rows = months.map((m0) => {
    const y = m0.getFullYear(), m = m0.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const segs = (set, cls) => {
      const out = []; let run = null;
      for (let d = 1; d <= days; d++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (set.has(key)) { if (!run) run = { s: d, e: d }; else run.e = d; }
        else if (run) { out.push(run); run = null; }
      }
      if (run) out.push(run);
      return out.map((r) => el('i', { class: cls, style: { left: ((r.s - 1) / days * 100) + '%', width: ((r.e - r.s + 1) / days * 100) + '%' } }));
    };
    const reals = segs(sets.real, 'real');
    const pres = segs(sets.predicted, 'pre');
    if (reals.length || pres.length) has = true;
    return el('div', { class: 'pd-tr-row' }, [
      el('div', { class: 'pd-tr-m', text: `${m + 1} 月` }),
      el('div', { class: 'pd-tr' }, pres.concat(reals))
    ]);
  });
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '近半年经期趋势' })]),
    el('div', { class: 'card pd-trend' }, [
      has ? rows : el('div', { class: 'hint', style: { textAlign: 'center', padding: '8px 0', margin: 0 }, text: '还没有记录，点上面「今天来了」开始第一次记录' }),
      has ? el('div', { class: 'pd-legend' }, [
        el('span', {}, [el('i', { class: 'lg on' }), '经期']),
        el('span', {}, [el('i', { class: 'lg soft' }), '预计'])
      ]) : null
    ])
  ]);
}

/* ---------------- 渲染 ---------------- */
function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page period' });
  const sets = markSets();
  const next = nextStartDate();

  /* 概览 */
  const dd = next ? diffDays(today(), next) : null;
  page.appendChild(el('div', { class: 'card pd-hero' }, [
    el('div', { class: 'pd-hero-ic' }, [iconImg('IC-MIO-033')]),
    el('div', { class: 'pd-hero-main' }, [
      el('div', { class: 'pd-hero-t', text: next ? (dd === 0 ? '距下次经期就是今天' : `距下次经期还有 ${dd} 天`) : '还没有记录' }),
      el('div', { class: 'pd-hero-s', text: next ? `预计 ${next.getMonth() + 1} 月 ${next.getDate()} 日 开始` : '点下面「今天来了」开始第一次记录' })
    ]),
    el('button', { class: 'btn sm', onclick: openConfig }, ['设置'])
  ]));

  /* 四项统计：预计开始 / 平均周期 / 经期天数 / 距下次 */
  const stat = (k, v) => el('div', { class: 'pd-stat' }, [
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v', text: v })
  ]);
  page.appendChild(el('div', { class: 'pd-stats' }, [
    stat('预计什么时候开始', next ? `${next.getMonth() + 1} 月 ${next.getDate()} 日` : '—'),
    stat('平均周期', `${avgCycle()} 天`),
    stat('经期天数', `${avgPeriodLen()} 天`),
    stat('距下次', dd === null ? '—' : (dd === 0 ? '就是今天' : `${dd} 天`))
  ]));

  /* 两个快捷按钮 */
  const open = items.find((r) => !r.end);
  page.appendChild(el('div', { class: 'row pd-quick' }, [
    el('button', { class: 'btn primary', onclick: () => startToday() }, ['今天来了']),
    el('button', { class: 'btn', onclick: () => endToday() }, [open ? '今天结束了' : '结束经期'])
  ]));

  /* 日历 */
  page.appendChild(calendar(sets));

  /* 近半年趋势 */
  page.appendChild(trendCard(sets));

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
      const lg = logOf(rec.start);
      const bits = [`持续 ${len} 天`];
      if (lg) {
        if (lg.flow) bits.push('量' + lg.flow);
        if (lg.body && lg.body.length) bits.push(lg.body.slice(0, 2).join('、') + (lg.body.length > 2 ? ` 等 ${lg.body.length} 项` : ''));
        else if (lg.note) bits.push(lg.note);
      } else if (rec.note) bits.push(rec.note);
      listCard.appendChild(el('div', { class: 'list-item', onclick: () => recMenu(rec) }, [
        iconImg('IC-MIO-033'),
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title', text: `${rec.start} → ${rec.end || '进行中'}` }),
          el('div', { class: 'li-sub', text: bits.join(' · ') })
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
  logs = (await kvGet('periodLogs', [])) || [];
  paint();
}

function quickMenu() {
  actionSheet('经期记录', [
    { label: '今天来了', icon: 'IC-MIO-033', onSelect: startToday },
    { label: '今天结束了', icon: 'IC-MIO-003', onSelect: endToday },
    { label: '添加记录（经量 / 身体状况）', icon: 'IC-CRD-006', onSelect: () => openDayForm(ymd(today())) },
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
  acts.push({ label: logOf(key) ? '编辑这天的详情' : '记录这天的详情（经量 / 身体状况）', icon: 'IC-CRD-006', onSelect: () => openDayForm(key) });
  if (logOf(key)) {
    acts.push({ label: '清除这天的详情', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '清除详情', text: `清除 ${key} 的经量 / 身体状况等详情？`, okText: '清除', danger: true });
      if (!yes) return;
      logs = logs.filter((l) => l.date !== key);
      await kvSet('periodLogs', logs);
      await reload();
      toast('已清除');
    } });
  }
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
    { label: '查看当天详情（经量 / 身体状况）', icon: 'IC-MIO-033', onSelect: () => openDayForm(rec.start) },
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
