/* 番茄钟 · 专注计时
   完成一次专注会记到 pomodoros 表：{ id, ts, minutes, label, mode }
   计时状态放在模块级，离开页面后仍然继续走。 */

import { el, uid, fmtDay } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, kvGet, kvSet } from '../store.js';
import { beep } from '../notify.js';
import { sheet, toast, confirmBox } from '../ui.js';

const CIRC = 2 * Math.PI * 54;

let view = null;
let root = null;
let refs = {};
let sessions = [];

let focusMin = 25;
let breakMin = 5;
let mode = 'focus';          // focus | break
let totalSec = focusMin * 60;
let remainSec = totalSec;
let running = false;
let endAt = 0;
let label = '';
let inited = false;
let ticker = null;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (ts) => ymd(new Date(ts)) === ymd(new Date());
const clampNum = (v, lo, hi, dft) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dft;
};

export default async function pagePomodoro(v) {
  view = v;
  fullPage({ back: true, title: '番茄钟', sub: '一次只做一件事' });

  focusMin = clampNum(await kvGet('pomoFocus', 25), 1, 120, 25);
  breakMin = clampNum(await kvGet('pomoBreak', 5), 1, 60, 5);
  sessions = (await all('pomodoros')).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  if (!inited) {
    mode = 'focus';
    totalSec = focusMin * 60;
    remainSec = totalSec;
    inited = true;
  }

  paint();
  ensureTicker();
}

/* ---------------- 渲染 ---------------- */
function paint() {
  if (!view) return;
  view.innerHTML = '';
  root = el('div', { class: 'page pomo' });

  /* 模式切换 */
  const tabs = el('div', { class: 'pm-tabs' });
  [['focus', '专注'], ['break', '休息']].forEach(([k, t]) => {
    tabs.appendChild(el('button', {
      class: 'pm-tab' + (mode === k ? ' on' : ''), type: 'button',
      onclick: () => setMode(k)
    }, [t]));
  });
  root.appendChild(tabs);

  /* 圆环计时 */
  const ringWrap = el('div', {
    class: 'pm-ring-wrap' + (mode === 'break' ? ' break' : ''),
    html: `<svg class="pm-ring" viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="54"></circle><circle class="fg" cx="60" cy="60" r="54"></circle></svg>`
  });
  const timeV = el('div', { class: 'pm-time-v', text: mmss(remainSec) });
  const timeS = el('div', { class: 'pm-time-s', text: mode === 'focus' ? '专注' : '休息' });
  ringWrap.appendChild(el('div', { class: 'pm-time' }, [timeV, timeS]));
  root.appendChild(ringWrap);

  /* 任务名 */
  root.appendChild(el('div', { class: 'pm-label', onclick: editLabel }, [
    iconImg('IC-MIO-026'),
    el('span', { class: 'pm-label-t' + (label ? '' : ' blank'), text: label || '给这次专注起个名字' }),
    iconImg('IC-CRD-006', 'chev')
  ]));

  /* 控制按钮 */
  const startBtn = el('button', { class: 'btn primary pm-start', onclick: toggleTimer }, ['开始']);
  const resetBtn = el('button', { class: 'btn pm-ghost', onclick: resetTimer }, ['重置']);
  const cfgBtn = el('button', { class: 'btn pm-ghost', onclick: openConfig }, [iconImg('IC-MIO-001')]);
  root.appendChild(el('div', { class: 'pm-btns' }, [resetBtn, startBtn, cfgBtn]));

  /* 快捷时长 */
  const durs = el('div', { class: 'pm-durs' });
  const presets = mode === 'focus' ? [15, 25, 45, 60] : [5, 10, 15];
  const cur = mode === 'focus' ? focusMin : breakMin;
  presets.forEach((n) => {
    durs.appendChild(el('button', {
      class: 'chip' + (n === cur ? ' on' : ''), type: 'button',
      onclick: () => setDuration(n)
    }, [`${n} 分钟`]));
  });
  root.appendChild(durs);

  /* 今日统计 */
  const today = sessions.filter((s) => sameDay(s.ts));
  const todayMin = Math.round(today.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0));
  const allMin = Math.round(sessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0));
  root.appendChild(el('div', { class: 'card pm-stat' }, [
    el('div', {}, [
      el('div', { class: 'pm-stat-v', text: String(today.length) }),
      el('div', { class: 'pm-stat-l', text: '今日番茄' })
    ]),
    el('div', {}, [
      el('div', { class: 'pm-stat-v', text: todayMin + '′' }),
      el('div', { class: 'pm-stat-l', text: '今日专注' })
    ]),
    el('div', {}, [
      el('div', { class: 'pm-stat-v', text: allMin + '′' }),
      el('div', { class: 'pm-stat-l', text: '累计专注' })
    ])
  ]));

  /* 最近专注 */
  const recent = sessions.slice(0, 6);
  const listCard = el('div', { class: 'card flush' });
  if (!recent.length) {
    listCard.appendChild(el('div', { class: 'empty', style: { padding: '26px 18px' } }, [
      iconImg('IC-MIO-035'),
      el('div', { class: 'e-h', text: '还没有完成的专注' }),
      el('div', { class: 'e-p', text: '点「开始」，25 分钟后会自动记下来' })
    ]));
  } else {
    recent.forEach((s) => {
      listCard.appendChild(el('div', { class: 'list-item' }, [
        iconImg('IC-MIO-035'),
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title', text: s.label || '专注' }),
          el('div', { class: 'li-sub', text: `${fmtDay(s.ts)} · ${Math.round(Number(s.minutes) || 0)} 分钟` })
        ])
      ]));
    });
  }
  root.appendChild(el('div', { class: 'sec', style: { marginTop: '18px' } }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '最近专注' })]),
    listCard
  ]));

  root.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '4px' }, text: '计时在离开页面后仍会继续' }));
  view.appendChild(root);

  refs = { time: timeV, status: timeS, ring: ringWrap.querySelector('.fg'), start: startBtn };
  paintTime();
}

/* ---------------- 时钟 ---------------- */
function ensureTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    if (!running) return;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (left !== remainSec) {
      remainSec = left;
      if (root && root.isConnected) paintTime();
    }
    if (left <= 0) finish();
  }, 300);
}

function paintTime() {
  const left = running ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : remainSec;
  if (refs.time) refs.time.textContent = mmss(left);
  if (refs.status) {
    refs.status.textContent = running
      ? (mode === 'focus' ? '专注中' : '休息中')
      : (left <= 0 ? '已完成' : (left === totalSec ? (mode === 'focus' ? '专注' : '休息') : '已暂停'));
  }
  if (refs.ring) {
    refs.ring.style.strokeDasharray = String(CIRC);
    refs.ring.style.strokeDashoffset = String(CIRC * (1 - left / Math.max(1, totalSec)));
  }
  if (refs.start) refs.start.textContent = running ? '暂停' : (left === totalSec ? '开始' : '继续');
}

function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------------- 计时操作 ---------------- */
function toggleTimer() {
  if (running) {
    remainSec = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    running = false;
    paintTime();
    return;
  }
  if (remainSec <= 0) remainSec = totalSec;
  endAt = Date.now() + remainSec * 1000;
  running = true;
  ensureTicker();
  paintTime();
}

async function resetTimer() {
  if (running) {
    const yes = await confirmBox({ title: '重置计时', text: '当前这一轮还没有完成，确定重置吗？', okText: '重置', danger: true });
    if (!yes) return;
  }
  running = false;
  totalSec = (mode === 'focus' ? focusMin : breakMin) * 60;
  remainSec = totalSec;
  paint();
}

async function finish() {
  if (!running) return;
  running = false;
  remainSec = 0;
  const finishedMode = mode;
  const onPage = !!(root && root.isConnected);

  if (finishedMode === 'focus') {
    await put('pomodoros', {
      id: uid(), ts: Date.now(), minutes: Math.round(totalSec / 60), label: label || '', mode: 'focus'
    });
    sessions = (await all('pomodoros')).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    beep(880, 260);
    setTimeout(() => beep(1175, 420), 320);
    if (onPage) toast('专注完成，休息一下吧');
    mode = 'break';
    totalSec = breakMin * 60;
    remainSec = totalSec;
  } else {
    beep(700, 300);
    if (onPage) toast('休息结束，继续加油');
    mode = 'focus';
    totalSec = focusMin * 60;
    remainSec = totalSec;
  }

  if (onPage) paint();
}

function setMode(next) {
  if (next === mode) return;
  if (running) { toast('先暂停计时再切换'); return; }
  mode = next;
  totalSec = (mode === 'focus' ? focusMin : breakMin) * 60;
  remainSec = totalSec;
  paint();
}

async function setDuration(n) {
  if (running) { toast('先暂停计时再调整'); return; }
  if (mode === 'focus') { focusMin = n; await kvSet('pomoFocus', n); }
  else { breakMin = n; await kvSet('pomoBreak', n); }
  totalSec = n * 60;
  remainSec = totalSec;
  paint();
}

/* ---------------- 弹层 ---------------- */
function editLabel() {
  const input = el('input', { class: 'input', placeholder: '比如：写方案 / 读书', value: label });
  sheet({
    title: '这次专注做什么',
    node: el('div', { class: 'field' }, [input]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => {
      label = input.value.trim();
      paint();
      toast(label ? '已设置' : '已清除');
    } }]
  });
  setTimeout(() => input.focus(), 260);
}

function openConfig() {
  const f = el('input', { class: 'input', type: 'number', min: '1', max: '120', value: String(focusMin) });
  const b = el('input', { class: 'input', type: 'number', min: '1', max: '60', value: String(breakMin) });
  sheet({
    title: '计时设置',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '专注时长（分钟）' }), f]),
      el('div', { class: 'field' }, [el('label', { text: '休息时长（分钟）' }), b])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      focusMin = clampNum(f.value, 1, 120, 25);
      breakMin = clampNum(b.value, 1, 60, 5);
      await kvSet('pomoFocus', focusMin);
      await kvSet('pomoBreak', breakMin);
      if (!running) {
        totalSec = (mode === 'focus' ? focusMin : breakMin) * 60;
        remainSec = totalSec;
      }
      paint();
      toast('已保存');
    } }]
  });
}
