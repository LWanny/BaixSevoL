/* 虚拟通话 · 聊天内使用（拨出 / 来电 / 挂断 + 悬浮缩小 + 背景）
   - 入口在聊天输入栏「＋」→「通话」，不再是一个独立页面
   - 我拨给 TA：短暂呼叫后 TA 按概率接听（不接则记为未接）
   - TA 打给我：来电界面，接听 / 挂断
   - 通话中可缩小成悬浮小窗，点小窗回到全屏
   - 背景可换图（本地图片），时长上限 360000 秒
   通话记录落库到 calls 表。纯本地，没有真实音频流。 */

import { el, uid, fmtDay, compressImage, openFile, chance, rndInt } from './util.js';
import { iconImg } from './icons.js';
import { state, roleAvatarSrc } from './state.js';
import { all, put, del, kvGet, kvSet } from './store.js';
import { saveMedia, mediaURL } from './media.js';
import { sheet, actionSheet, confirmBox, toast } from './ui.js';

const MAX_SEC = 360000;   // 时长上限（秒）
const SESSION_KEY = 'callSession';   // 通话进行态持久化：刷新/重进后原地恢复

let host = null;          // 全屏通话浮层
let mini = null;          // 悬浮小窗
let session = null;       // { state, direction, startedAt, sec, bgId, answerAt }
let tickId = null;
let answerId = null;

/** 把当前通话状态写进 kv（state 变化时调用）；active 的秒数不落库，恢复时按 startedAt 算 */
function persist() {
  kvSet(SESSION_KEY, session ? { ...session } : null).catch(() => {});
}

/** 聊天「＋」面板里的通话入口 */
export function openCallMenu() {
  actionSheet('通话', [
    { label: '打给 ' + (state.role.name || 'TA'), icon: 'IC-CHT-012', onSelect: () => startOutgoing() },
    { label: '让 ' + (state.role.name || 'TA') + ' 打给我', icon: 'IC-MIO-011', onSelect: () => startIncoming() },
    { label: '通话记录', icon: 'IC-MIO-018', onSelect: () => callHistory() }
  ]);
}

/** 通话记录（从聊天更多菜单或通话面板打开） */
export async function callHistory() {
  const records = (await all('calls')).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const node = el('div');
  if (!records.length) {
    node.appendChild(el('div', { class: 'empty', style: { padding: '20px 4px' } }, [
      iconImg('IC-CHT-012'),
      el('div', { class: 'e-h', text: '还没有通话记录' }),
      el('div', { class: 'e-p', text: '拨一通给 TA，记录会留在这里' })
    ]));
  } else {
    records.forEach((r) => node.appendChild(el('div', { class: 'call-row', onclick: () => rowMenu(r, node) }, [
      el('div', { class: 'call-row-ic' + (r.status === 'missed' ? ' missed' : '') }, [iconImg('IC-CHT-012')]),
      el('div', { class: 'call-row-main' }, [
        el('div', { class: 'call-row-t', text: r.direction === 'in' ? (state.role.name || 'TA') + ' 来电' : '我拨给 ' + (state.role.name || 'TA') }),
        el('div', { class: 'call-row-s', text: (r.status === 'missed' ? '未接听' : '通话 ' + fmtSec(r.duration || 0)) + ' · ' + fmtDay(r.ts) })
      ]),
      el('span', { class: 'tiny muted', text: r.direction === 'in' ? '↙' : '↗' })
    ])));
  }
  sheet({ title: '通话记录', node });
}

function rowMenu(r, listNode) {
  actionSheet('通话记录', [
    { label: '删除这条记录', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      await del('calls', r.id);
      const records = (await all('calls')).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      listNode.innerHTML = '';
      if (!records.length) {
        listNode.appendChild(el('div', { class: 'empty', style: { padding: '20px 4px' } }, [
          el('div', { class: 'e-h', text: '还没有通话记录' })
        ]));
      } else {
        records.forEach((x) => listNode.appendChild(el('div', { class: 'call-row', onclick: () => rowMenu(x, listNode) }, [
          el('div', { class: 'call-row-ic' + (x.status === 'missed' ? ' missed' : '') }, [iconImg('IC-CHT-012')]),
          el('div', { class: 'call-row-main' }, [
            el('div', { class: 'call-row-t', text: x.direction === 'in' ? (state.role.name || 'TA') + ' 来电' : '我拨给 ' + (state.role.name || 'TA') }),
            el('div', { class: 'call-row-s', text: (x.status === 'missed' ? '未接听' : '通话 ' + fmtSec(x.duration || 0)) + ' · ' + fmtDay(x.ts) })
          ])
        ])));
      }
      toast('已删除');
    } }
  ]);
}

/* ---------------- 通话流程 ---------------- */
/** 呼叫后按概率接听 / 忙线 / 拒接 / 未接（可被刷新打断，剩余时间重新排程） */
function scheduleAnswer(delayMs) {
  if (answerId) clearTimeout(answerId);
  answerId = setTimeout(() => { answerId = null; resolveAnswer(); }, Math.max(0, delayMs));
}

async function resolveAnswer() {
  if (!session || session.state !== 'calling') return;
  const p = state.role.params;
  if (chance(Number(p.callAnswerPct) || 0)) beginTalk();
  else if (chance(Number(p.callBusyPct) || 0)) endCall('busy', true);
  else if (chance(Number(p.callRejectPct) || 0)) endCall('rejected', true);
  else endCall('missed', true);
}

async function startOutgoing() {
  if (session) { restore(); return; }
  session = { state: 'calling', direction: 'out', startedAt: 0, sec: 0,
    answerAt: Date.now() + rndInt(2200, 4200) };
  persist();
  paintCall();
  toast('正在呼叫…');
  scheduleAnswer(session.answerAt - Date.now());
}

function startIncoming() {
  if (session) { restore(); return; }
  session = { state: 'incoming', direction: 'in', startedAt: 0, sec: 0 };
  persist();
  paintCall();
}

/** scheduler.js 调用：TA 主动打来电（概率由 callProactivePct 控制） */
export function triggerIncoming() {
  startIncoming();
}

/** 刷新 / 重新进入应用后恢复进行中的通话（main.js 启动时调用）：
    呼叫中→补排剩余接听时间；来电→重画来电屏；通话中→按 startedAt 续上计时 */
export async function resumeCall() {
  if (session) return;
  let s = null;
  try { s = await kvGet(SESSION_KEY, null); } catch { return; }
  if (!s || !s.state) return;
  if (s.state === 'calling') {
    session = s;
    paintCall();
    const remain = Number(s.answerAt || 0) - Date.now();
    if (remain > 0) scheduleAnswer(remain);
    else resolveAnswer();
  } else if (s.state === 'incoming') {
    session = s;
    paintCall();
  } else if (s.state === 'active') {
    session = s;
    session.sec = Math.max(0, Math.floor((Date.now() - Number(s.startedAt || Date.now())) / 1000));
    if (session.sec >= MAX_SEC) { endCall('ended'); return; }
    paintCall();
    tick();
  } else {
    session = null;
    kvSet(SESSION_KEY, null).catch(() => {});
  }
}

function beginTalk() {
  session.state = 'active';
  session.startedAt = Date.now();
  session.sec = 0;
  persist();
  paintCall();
  tick();
}

function tick() {
  if (tickId) clearInterval(tickId);
  tickId = setInterval(async () => {
    if (!session || session.state !== 'active') return;
    session.sec += 1;
    if (session.sec >= MAX_SEC) { endCall('ended'); toast('已达时长上限'); return; }
    paintTimer();

    // TA 按概率提前挂断
    const hangupPct = Number(state.role.params.callHangupPct) || 0;
    if (session.sec > 8 && session.sec % 10 === 0 && chance(hangupPct)) {
      toast((state.role.name || 'TA') + ' 挂断了电话');
      endCall('ended');
    }
  }, 1000);
  paintTimer();
}

async function endCall(status, record = true) {
  if (tickId) { clearInterval(tickId); tickId = null; }
  if (answerId) { clearTimeout(answerId); answerId = null; }
  const s = session;
  session = null;
  persist();

  if (record && s) {
    await put('calls', {
      id: uid(), ts: Date.now(), direction: s.direction,
      status: s.state === 'active' ? 'answered' : status,
      duration: s.sec || 0
    });
  }

  teardown();

  // 结束浮层
  const endTitle =
    status === 'busy' ? '对方忙线中'
    : status === 'rejected' ? '对方已拒接'
    : status === 'missed' ? '对方没有接听'
    : '通话已结束';
  const done = el('div', { class: 'call-done' }, [
    iconImg('IC-MIO-032'),
    el('div', { class: 'e-h', text: endTitle }),
    el('div', { class: 'e-p', text: s && s.sec ? '通话时长 ' + fmtSec(s.sec) : '' })
  ]);
  showOverlay(el('div', { class: 'call-screen ended' }, [done]));
  setTimeout(() => teardown(), 1400);
}

/* ---------------- 全屏通话浮层 ---------------- */
function showOverlay(node) {
  teardownOverlayOnly();
  host = el('div', { class: 'call-overlay' }, [node]);
  document.getElementById('app').appendChild(host);
  return host;
}

function teardownOverlayOnly() {
  if (host) { host.remove(); host = null; }
  if (mini) { mini.remove(); mini = null; }
}

function teardown() {
  teardownOverlayOnly();
}

async function paintCall() {
  if (!session) return;
  const bg = await getBgURL();
  const s = session;

  const av = el('div', { class: 'call-av' });
  const u = await roleAvatarSrc();
  av.appendChild(u ? el('img', { src: u }) : document.createTextNode((state.role.name || 'TA').slice(0, 1)));

  let statusText = '正在呼叫…';
  if (s.state === 'incoming') statusText = '来电中…';
  else if (s.state === 'active') statusText = '通话中';
  const statusNode = el('div', { class: 'call-status', text: statusText });

  const actions = el('div', { class: 'call-btns' });
  if (s.state === 'incoming') {
    actions.appendChild(callBtn('接听', 'IC-MIO-003', 'ok', () => beginTalk()));
    actions.appendChild(callBtn('挂断', 'IC-MIO-032', 'hang', () => endCall('missed', true)));
  } else if (s.state === 'active') {
    actions.appendChild(callBtn('静音', 'IC-MIO-002', '', () => toast('已静音（模拟）')));
    actions.appendChild(callBtn('免提', 'IC-CHT-003', '', () => toast('已免提（模拟）')));
    actions.appendChild(callBtn('背景', 'IC-CHT-014', '', () => changeBg()));
    actions.appendChild(callBtn('缩小', 'IC-MIO-023', '', () => minimize()));
    actions.appendChild(callBtn('挂断', 'IC-MIO-032', 'hang', () => endCall('ended')));
  } else {
    actions.appendChild(callBtn('换背景', 'IC-CHT-014', '', () => changeBg()));
    actions.appendChild(callBtn('缩小', 'IC-MIO-023', '', () => minimize()));
    actions.appendChild(callBtn('挂断', 'IC-MIO-032', 'hang', () => endCall('missed', true)));
  }

  const screen = el('div', { class: 'call-screen' }, [
    el('div', { class: 'call-bg', style: bg ? { backgroundImage: `url("${bg}")` } : {} }),
    el('div', { class: 'call-inner' }, [
      av,
      el('div', { class: 'call-name', text: state.role.name || 'TA' }),
      statusNode,
      el('div', { class: 'call-timer', id: 'call-timer', text: s.state === 'active' ? fmtSec(s.sec) : '' }),
      actions
    ])
  ]);
  showOverlay(screen);
}

function callBtn(label, icon, tone, onclick) {
  return el('button', { class: 'call-btn' + (tone ? ' ' + tone : ''), onclick }, [
    el('span', { class: 'call-btn-ic' }, [iconImg(icon)]),
    el('span', { class: 'call-btn-t', text: label })
  ]);
}

function paintTimer() {
  const t = document.getElementById('call-timer');
  if (t && session) t.textContent = fmtSec(session.sec);
  const mt = mini?.querySelector('.call-mini-time');
  if (mt && session) mt.textContent = fmtSec(session.sec);
}

/* ---------------- 悬浮小窗 ---------------- */
async function minimize() {
  if (!session) return;
  if (host) { host.remove(); host = null; }
  const u = await roleAvatarSrc();
  const av = el('div', { class: 'call-mini-av' });
  av.appendChild(u ? el('img', { src: u }) : document.createTextNode((state.role.name || 'TA').slice(0, 1)));
  mini = el('div', { class: 'call-mini' }, [
    el('div', { class: 'call-mini-main' }, [
      av,
      el('div', {}, [
        el('div', { class: 'call-mini-t', text: state.role.name || 'TA' }),
        el('div', { class: 'call-mini-time', text: session.state === 'active' ? fmtSec(session.sec) : '呼叫中' })
      ])
    ]),
    el('button', { class: 'call-mini-hang', title: '挂断', onclick: () => endCall(session.state === 'active' ? 'ended' : 'missed', true) }, [iconImg('IC-MIO-032')])
  ]);
  document.getElementById('app').appendChild(mini);
  dragMini(mini);
}

/** 悬浮小窗：可拖动；没拖动就抬手算一次点击，回到全屏。
    移动/抬手监听挂在 window 上（不用 setPointerCapture），
    否则 pointerup/click 的 target 会被重定向到小窗根节点，子节点的 onclick 收不到。 */
function dragMini(node) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;

  const parentBox = () => {
    const p = node.offsetParent || node.parentElement;
    return { el: p, r: p.getBoundingClientRect() };
  };

  function down(e) {
    if (e.target.closest && e.target.closest('.call-mini-hang')) return;   // 挂断按钮不参与拖动
    const { r } = parentBox();
    const box = node.getBoundingClientRect();
    ox = box.left - r.left;
    oy = box.top - r.top;
    sx = e.clientX;
    sy = e.clientY;
    dragging = true;
    moved = false;
    node.classList.add('dragging');
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
  }

  function move(e) {
    if (!dragging) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;   // 小抖动不算拖动

    if (!moved) {
      // 第一次真正移动时才把定位从 right/bottom 换成 left/top，避免抬指前闪一下
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.left = ox + 'px';
      node.style.top = oy + 'px';
      moved = true;
    }

    const { el: p, r } = parentBox();
    const maxL = Math.max(0, p.clientWidth - node.offsetWidth);
    const maxT = Math.max(0, p.clientHeight - node.offsetHeight);
    node.style.left = Math.min(Math.max(ox + dx, 0), maxL) + 'px';
    node.style.top = Math.min(Math.max(oy + dy, 0), maxT) + 'px';
    e.preventDefault();
  }

  function up(e) {
    if (!dragging) return;
    dragging = false;
    node.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (moved) { moved = false; return; }   // 拖过就不算点击
    if (e.type === 'pointerup') restore();  // 单纯点一下 → 回到全屏
  }

  node.addEventListener('pointerdown', down);
}

function restore() {
  if (mini) { mini.remove(); mini = null; }
  if (session) paintCall();
}

/* ---------------- 背景 ---------------- */
async function getBgURL() {
  const id = await kvGet('callBg', null) || session?.bgId;
  return id ? await mediaURL(id) : '';
}

async function changeBg() {
  actionSheet('通话背景', [
    { label: '从相册选一张', icon: 'IC-MIO-015', onSelect: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob, w, h } = await compressImage(f, 1080, 0.86);
      const id = await saveMedia(blob, { type: 'image', w, h, source: 'skin' });
      await kvSet('callBg', id);
      if (session) session.bgId = id;
      paintCall();
      toast('背景已更换');
    } },
    { label: '恢复默认背景', icon: 'IC-MIO-011', onSelect: async () => {
      await kvSet('callBg', null);
      if (session) session.bgId = null;
      paintCall();
      toast('已恢复默认');
    } }
  ]);
}

/* ---------------- 其他 ---------------- */
function fmtSec(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
