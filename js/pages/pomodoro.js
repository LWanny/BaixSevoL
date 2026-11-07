/* 番茄钟 · 专注计时
   完成一次专注会记到 pomodoros 表：{ id, ts, minutes, label, mode }
   计时状态放在模块级，离开页面后仍然继续走。 */

import { el, uid, fmtDay, openFile, rndInt } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, kvGet, kvSet } from '../store.js';
import { beep } from '../notify.js';
import { sheet, toast, confirmBox } from '../ui.js';
import { saveMedia, delMedia, mediaURL } from '../media.js';

const CIRC = 2 * Math.PI * 54;

let view = null;
let root = null;
let refs = {};
let sessions = [];

/* 背景音乐（kv: pomoTracks / pomoMusic）与自定义颜色（kv: pomoColor） */
let tracks = [];                                  // [{ id, name, mediaId }]
let music = { mode: 'loop', volume: 70, trackId: null };   // mode: loop 单曲循环 | seq 顺序 | shuffle 随机
let colors = { ring: '', time: '' };              // '' = 跟随主题默认
let audio = null;                                 // 懒建的 Audio 实例
let playingId = null;                             // 当前装进 audio 的 mediaId

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
  tracks = (await kvGet('pomoTracks', [])) || [];
  music = Object.assign({ mode: 'loop', volume: 70, trackId: null }, await kvGet('pomoMusic', {}) || {});
  colors = Object.assign({ ring: '', time: '' }, await kvGet('pomoColor', {}) || {});

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
  applyColors();

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
    pauseMusic();
    paintTime();
    return;
  }
  if (remainSec <= 0) remainSec = totalSec;
  endAt = Date.now() + remainSec * 1000;
  running = true;
  ensureTicker();
  startMusic();
  paintTime();
}

async function resetTimer() {
  if (running) {
    const yes = await confirmBox({ title: '重置计时', text: '当前这一轮还没有完成，确定重置吗？', okText: '重置', danger: true });
    if (!yes) return;
  }
  running = false;
  stopMusic();
  totalSec = (mode === 'focus' ? focusMin : breakMin) * 60;
  remainSec = totalSec;
  paint();
}

async function finish() {
  if (!running) return;
  running = false;
  pauseMusic();
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

/* ---------------- 背景音乐：上传 / 播放模式 / 音量 ---------------- */
function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('ended', () => { nextTrack().catch(() => {}); });
  return audio;
}

function applyVolume() {
  if (audio) audio.volume = Math.min(1, Math.max(0, (Number(music.volume) || 0) / 100));
}

async function loadTrack(mediaId) {
  const u = await mediaURL(mediaId);
  if (!u) return false;
  const a = ensureAudio();
  a.src = u;
  playingId = mediaId;
  applyVolume();
  return true;
}

/** 计时开始：有曲目且音量 > 0 就播（选中曲目优先，接上次位置） */
async function startMusic() {
  if (!tracks.length || (Number(music.volume) || 0) <= 0) return;
  const a = ensureAudio();
  applyVolume();
  const sel = tracks.find((t) => t.id === music.trackId) || tracks[0];
  if (playingId !== sel.mediaId) { if (!(await loadTrack(sel.mediaId))) return; }
  try { await a.play(); } catch (e) { /* 个别浏览器首次仍会拦自动播放，再点一次开始即可 */ }
}

function pauseMusic() { if (audio) audio.pause(); }

function stopMusic() { if (audio) { audio.pause(); audio.currentTime = 0; } }

/** 一曲结束：loop 单曲循环 / seq 按列表顺序循环 / shuffle 随机下一首 */
async function nextTrack() {
  if (!tracks.length) return;
  if (tracks.length === 1 || music.mode === 'loop') {
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
    return;
  }
  let idx = tracks.findIndex((t) => t.mediaId === playingId);
  if (idx < 0) idx = 0;
  if (music.mode === 'shuffle') {
    let n = idx;
    while (n === idx) n = rndInt(0, tracks.length - 1);
    idx = n;
  } else {
    idx = (idx + 1) % tracks.length;
  }
  if (await loadTrack(tracks[idx].mediaId)) audio.play().catch(() => {});
}

/** 上传音频 → 存进媒体库并登记到曲目列表（超 80MB / 非音频跳过） */
async function uploadMusic() {
  const files = await openFile({ accept: 'audio/*', multiple: true });
  if (!files || !files.length) return 0;
  let n = 0;
  for (const f of files) {
    const isAudio = (f.type || '').startsWith('audio') || /\.(mp3|m4a|aac|wav|ogg|flac|opus|webm)$/i.test(f.name);
    if (!isAudio) { toast(`「${f.name}」不是音频，已跳过`); continue; }
    if (f.size > 80 * 1024 * 1024) { toast(`「${f.name}」超过 80MB，已跳过`); continue; }
    const name = f.name.replace(/\.[^.]+$/, '');
    const mediaId = await saveMedia(f, { type: 'audio', source: 'me', name });
    tracks.push({ id: uid(), name, mediaId });
    n++;
  }
  if (!n) return 0;
  if (!music.trackId) music.trackId = tracks[0].id;
  await kvSet('pomoTracks', tracks);
  await kvSet('pomoMusic', music);
  toast(`已添加 ${n} 首背景音乐`);
  return n;
}

/** 选中曲目：只切换/加载；正在播就无缝切过去，没播则等下次开始 */
async function selectTrack(t) {
  const wasPlaying = audio && !audio.paused;
  music.trackId = t.id;
  await kvSet('pomoMusic', music);
  await loadTrack(t.mediaId);
  if (wasPlaying) audio.play().catch(() => {});
}

/** 试听 / 暂停（与计时无关的即时试听） */
async function previewTrack(t) {
  const a = ensureAudio();
  if (playingId === t.mediaId && !a.paused) { a.pause(); return; }
  if (playingId !== t.mediaId) await loadTrack(t.mediaId);
  applyVolume();
  a.play().catch(() => toast('播放失败，试试 mp3 / m4a 格式'));
}

async function removeTrack(t) {
  const yes = await confirmBox({ title: '删除音乐', text: `删除「${t.name}」？`, okText: '删除', danger: true });
  if (!yes) return false;
  if (audio && playingId === t.mediaId) { audio.pause(); audio.removeAttribute('src'); audio.load(); playingId = null; }
  tracks = tracks.filter((x) => x.id !== t.id);
  if (music.trackId === t.id) music.trackId = tracks.length ? tracks[0].id : null;
  await kvSet('pomoTracks', tracks);
  await kvSet('pomoMusic', music);
  await delMedia(t.mediaId);
  return true;
}

/* ---------------- 自定义颜色：圈圈 / 时间（'' = 跟随主题） ---------------- */
const DFT_RING = '#1a1c20';
const DFT_TIME = '#111214';

function applyColors() {
  const rw = root && root.isConnected ? root.querySelector('.pm-ring-wrap') : null;
  if (!rw) return;
  if (colors.ring) rw.style.setProperty('--pomo-ring', colors.ring); else rw.style.removeProperty('--pomo-ring');
  if (colors.time) rw.style.setProperty('--pomo-time', colors.time); else rw.style.removeProperty('--pomo-time');
}

function openConfig() {
  const f = el('input', { class: 'input', type: 'number', min: '1', max: '120', value: String(focusMin) });
  const b = el('input', { class: 'input', type: 'number', min: '1', max: '60', value: String(breakMin) });

  /* --- 曲目列表：点行选中，可试听 / 删除 --- */
  const trackList = el('div', { class: 'pm-tracks' });
  const modeRow = el('div', { class: 'row wrap', style: { gap: '6px' } });
  const refresh = () => { refreshTracks(); refreshModes(); };
  function refreshTracks() {
    trackList.innerHTML = '';
    if (!tracks.length) {
      trackList.appendChild(el('div', { class: 'small muted', text: '还没有音乐 · 上传后计时开始会自动播放' }));
      return;
    }
    tracks.forEach((t) => {
      const on = music.trackId === t.id;
      const playing = audio && playingId === t.mediaId && !audio.paused;
      trackList.appendChild(el('div', { class: 'pm-trk' + (on ? ' on' : ''), onclick: () => selectTrack(t).then(refresh) }, [
        el('span', { class: 'pm-trk-dot', text: on ? '●' : '' }),
        el('span', { class: 't', text: t.name }),
        el('button', { class: 'pm-trk-act', title: '试听 / 暂停', onclick: (e) => { e.stopPropagation(); previewTrack(t).then(refresh).catch(() => {}); } }, [playing ? '暂停' : '试听']),
        el('button', { class: 'pm-trk-act', title: '删除', onclick: async (e) => { e.stopPropagation(); if (await removeTrack(t)) refresh(); } }, ['删除'])
      ]));
    });
  }

  /* --- 播放模式 --- */
  const MODES = [['loop', '单曲循环'], ['seq', '顺序播放'], ['shuffle', '随机播放']];
  function refreshModes() {
    modeRow.innerHTML = '';
    MODES.forEach(([k, t]) => modeRow.appendChild(el('button', {
      class: 'chip' + (music.mode === k ? ' on' : ''), type: 'button',
      onclick: async () => { music.mode = k; await kvSet('pomoMusic', music); refreshModes(); }
    }, [t])));
  }

  /* --- 音量 --- */
  const volV = el('span', { class: 'pm-vol-v', text: String(music.volume) + '%' });
  const vol = el('input', {
    type: 'range', min: '0', max: '100', step: '5', value: String(music.volume), class: 'pm-vol',
    oninput: () => { music.volume = Number(vol.value); volV.textContent = music.volume + '%'; applyVolume(); kvSet('pomoMusic', music); }
  });

  /* --- 颜色：改动即生效并保存 --- */
  const ringIn = el('input', { type: 'color', class: 'pm-color', value: colors.ring || DFT_RING });
  ringIn.oninput = () => { colors.ring = ringIn.value; applyColors(); kvSet('pomoColor', colors); };
  const timeIn = el('input', { type: 'color', class: 'pm-color', value: colors.time || DFT_TIME });
  timeIn.oninput = () => { colors.time = timeIn.value; applyColors(); kvSet('pomoColor', colors); };
  const resetColor = (key, input, dft) => async () => {
    colors[key] = '';
    applyColors();
    await kvSet('pomoColor', colors);
    input.value = dft;
  };

  sheet({
    title: '计时设置',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '专注时长（分钟）' }), f]),
      el('div', { class: 'field' }, [el('label', { text: '休息时长（分钟）' }), b]),

      el('div', { class: 'pm-sec-h', text: '背景音乐' }),
      el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', marginBottom: '8px' } }, [
        el('button', { class: 'btn sm', onclick: async () => { if (await uploadMusic()) refresh(); } }, [iconImg('IC-CRD-003'), '上传音乐']),
        el('div', { class: 'small muted', style: { flex: '1', lineHeight: 1.5 }, text: '计时开始自动播放，暂停即停' })
      ]),
      trackList,
      el('div', { class: 'field' }, [el('label', { text: '播放模式' }), modeRow]),
      el('div', { class: 'field' }, [el('label', { text: '音量' }), el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [vol, volV])]),

      el('div', { class: 'pm-sec-h', text: '颜色' }),
      el('div', { class: 'row between', style: { padding: '3px 0' } }, [
        el('span', { class: 'small', text: '圈圈颜色' }),
        el('div', { class: 'row', style: { gap: '8px' } }, [ringIn, el('button', { class: 'chip', type: 'button', onclick: resetColor('ring', ringIn, DFT_RING) }, ['默认'])])
      ]),
      el('div', { class: 'row between', style: { padding: '3px 0' } }, [
        el('span', { class: 'small', text: '时间颜色' }),
        el('div', { class: 'row', style: { gap: '8px' } }, [timeIn, el('button', { class: 'chip', type: 'button', onclick: resetColor('time', timeIn, DFT_TIME) }, ['默认'])])
      ]),
      el('div', { class: 'small muted', style: { marginTop: '6px' }, text: '颜色一改就生效；点「默认」恢复主题色。' })
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
  refresh();
}
