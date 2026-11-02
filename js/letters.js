/* 字卡传信 · 信箱（独立于聊天的书信模块）
   信件单独存放于 letters 表，与聊天消息互不影响：
     dir:'in'  收到的信（TA 写来，由字卡库拼句生成）
     dir:'out' 寄出的信（我写的，自由文字 + 图片）
   来信规则由 state.role.params 的信箱专属参数控制（reply* / proactive* / daily* / typing*）。 */

import { put, del, all, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, rndInt, chance, pick } from './util.js';
import { eligible, drawCards, joinFragments, stickers, EMOJI, randomKaomoji } from './engine.js';
import { notify } from './notify.js';
import { maybePickInspiration } from './inspiration.js';

const bus = new EventTarget();
export const on = (evt, fn) => bus.addEventListener(evt, fn);
export const off = (evt, fn) => bus.removeEventListener(evt, fn);
const emit = (evt, detail) => bus.dispatchEvent(new CustomEvent(evt, { detail }));

/* ---------------- 读写 ---------------- */
/** 全部信件，按时间倒序（最新在前） */
export async function allLetters() {
  return (await all('letters')).sort((a, b) => b.ts - a.ts);
}

export async function addLetter(letter) {
  const l = Object.assign(
    { id: uid(), ts: Date.now(), read: false, images: [], cardIds: [], paperId: null, fav: false },
    letter
  );
  await put('letters', l);
  emit('letter', l);
  if (l.dir === 'out' && l.text) {
    maybePickInspiration({ text: l.text, source: 'letter', sourceId: l.id }).catch(() => {});
  }
  if (l.dir === 'in') {
    await notify(state.role.name || 'TA', '给你寄来了一封信', 'mail-' + l.id);
  }
  return l;
}

export async function updateLetter(id, patch) {
  const list = await all('letters');
  const l = list.find((x) => x.id === id);
  if (!l) return null;
  Object.assign(l, patch);
  await put('letters', l);
  emit('letter-updated', l);
  return l;
}

export async function removeLetter(id) {
  await del('letters', id);
  emit('letter-removed', { id });
}

/** 未读来信数（用于首页小部件角标） */
export async function unreadCount() {
  return (await all('letters')).filter((l) => l.dir === 'in' && !l.read).length;
}

/* ---------------- 每日写作计数（信箱专用，独立键） ---------------- */
const DAILY_KEY = 'mailboxDaily';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function getDaily() {
  const raw = await kvGet(DAILY_KEY, null);
  const today = todayKey();
  if (!raw || raw.date !== today) {
    const fresh = { date: today, inbox: 0, proactive: 0, reply: 0 };
    await kvSet(DAILY_KEY, fresh);
    return fresh;
  }
  return raw;
}

/* ---------------- 来信内容（从字卡库拼句） ---------------- */
async function compose(cards, n) {
  const p = state.role.params;
  if (p.inspirationEnabled && chance(Number(p.inspirationUsePct) || 0)) {
    try {
      const { drawInspiration } = await import('./inspiration.js');
      const ins = await drawInspiration();
      if (ins) return { text: ins.text, cardIds: [] };
    } catch (e) { /* 降级 */ }
  }
  const pool = eligible(cards);
  if (!pool.length) return null;
  const drawn = drawCards(pool, Math.max(1, n), p.pureRandom);
  if (!drawn.length) return null;
  return { text: joinFragments(drawn.map((c) => c.content)), cardIds: drawn.map((c) => c.id) };
}

/** 条数钳位到 [1,999]，保持与引擎一致 */
function clampCount(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(999, Math.round(n)));
}

/** 写信（打字）时长（毫秒），按分钟设置 */
function typingDelay(p) {
  const lo = Math.max(0, Number(p.typingMinMin) || 0);
  const hi = Math.max(lo, Number(p.typingMaxMin) || 0);
  return rndInt(lo, hi) * 60000;
}

/** 从概率区间 [min,max] 取一个百分比并判定命中 */
function chanceInRange(min, max) {
  const lo = Math.max(0, Number(min) || 0);
  const hi = Math.max(lo, Number(max) || 0);
  return chance(rndInt(lo, hi));
}

let writing = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 写一封 TA 的来信并投递（受每日总量上限与写信时长约束） */
async function deliverIncoming({ proactive, lo, hi }) {
  const p = state.role.params;
  const cards = await all('cards');
  const composed = await compose(cards, rndInt(lo, hi));
  if (!composed) return false;

  /* ---- 来信内容附加 ---- */
  let text = composed.text;
  if (p.letterEmojiEnabled && chance(Number(p.letterEmojiPct) || 0)) text += ' ' + pick(EMOJI);
  if (p.letterKaomojiEnabled && chance(Number(p.letterKaomojiPct) || 0)) text += ' ' + randomKaomoji();
  const images = [];
  const stickerPool = stickers(cards);
  let extraCardIds = [];
  if (p.letterStickerEnabled && chance(Number(p.letterStickerPct) || 0) && stickerPool.length) {
    const st = pick(stickerPool);
    if (st.mediaId) {
      images.push(st.mediaId);
      extraCardIds.push(st.id);
    }
  }

  writing = true;
  emit('writing', true);
  await wait(typingDelay(p));
  emit('writing', false);
  writing = false;

  // 延迟结束后再校验一次每日总量上限
  const daily = await getDaily();
  const totalMax = Math.max(0, Number(p.dailyReplyMax) || 0);
  if (totalMax > 0 && daily.inbox >= totalMax) return false;

  await addLetter({
    dir: 'in', from: 'ta',
    text, images,
    cardIds: [...composed.cardIds, ...extraCardIds],
    proactive: !!proactive
  });
  daily.inbox += 1;
  if (proactive) daily.proactive += 1; else daily.reply += 1;
  await kvSet(DAILY_KEY, daily);
  return true;
}

/* ---------------- 我寄出一封信 ---------------- */
export async function sendMyLetter({ text = '', images = [], paperId = null } = {}) {
  const l = await addLetter({ dir: 'out', from: 'me', text, images, paperId });
  replyToMyLetter();   // 异步回信，不阻塞发送
  return l;
}

/** 收到我的信后，TA 是否回信（概率 + 延迟 + 每日上限约束） */
export async function replyToMyLetter() {
  if (writing) return;
  const p = state.role.params;

  // 回信概率判定
  if (!chanceInRange(p.letterReplyPctMin, p.letterReplyPctMax)) return;

  // 每日总量上限
  const daily = await getDaily();
  const totalMax = Math.max(0, Number(p.dailyReplyMax) || 0);
  if (totalMax > 0 && daily.inbox >= totalMax) return;

  // 回信前的等待（TA 多久才决定拿起笔写信）
  const loDelay = Math.max(0, Number(p.letterReplyDelayMin) || 0);
  const hiDelay = Math.max(loDelay, Number(p.letterReplyDelayMax) || loDelay);
  if (hiDelay > 0) await wait(rndInt(loDelay, hiDelay) * 60000);
  if (writing) return;           // 等待期间如果正在写别的，让位

  const lo = clampCount(p.replyMinCards ?? p.minCount);
  const hi = clampCount(p.replyMaxCards ?? p.maxCount, lo);
  await deliverIncoming({ proactive: false, lo, hi });
}

/* ---------------- TA 主动来信调度 ---------------- */
let timer = null;

export function startMailbox() {
  stopMailbox();
  timer = setInterval(tick, 30000);
  document.addEventListener('visibilitychange', tick);
  tick();
}

export function stopMailbox() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', tick);
}

async function tick() {
  if (writing) return;
  const p = state.role.params;
  const daily = await getDaily();

  // 每日总量上限（对方每天最多写几封）
  const totalMax = Math.max(0, Number(p.dailyReplyMax) || 0);
  if (totalMax > 0 && daily.inbox >= totalMax) return;

  // 每日总量下限（对方每天最少写几封）：未达标则强制补一封，跳过概率判定
  const totalMin = Math.max(0, Number(p.dailyReplyMin) || 0);
  const force = daily.inbox < totalMin;

  // 主动来信每日上限
  const proactiveMax = Math.max(0, Number(p.dailyProactiveMax) || 0);
  if (!force && proactiveMax > 0 && daily.proactive >= proactiveMax) return;

  // 双层概率：主动写信概率区间 + 触发概率区间，均命中才发
  if (!force) {
    if (!chanceInRange(p.proactivePctMin, p.proactivePctMax)) return;
    if (!chanceInRange(p.proactiveTriggerPctMin, p.proactiveTriggerPctMax)) return;
  }

  const lo = clampCount(p.proactiveMinCards ?? p.minCount);
  const hi = clampCount(p.proactiveMaxCards ?? p.maxCount, lo);
  await deliverIncoming({ proactive: true, lo, hi });
}
