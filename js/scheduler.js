/* 字卡传信 · 消息调度器
   负责：写库、按延迟逐条发出、撤回、拍一拍、选择题、主动消息、回到前台补算。
   聊天页只订阅事件做渲染，因此离开聊天页时回复仍会继续。 */

import { put, all, bulkPut, kvGet, kvSet } from './store.js';
import { buildReply, buildProactive, eligible, drawCards, delayFor } from './engine.js';
import { state } from './state.js';
import { uid, chance, rndInt, pick } from './util.js';
import { notify } from './notify.js';
import { maybeCollectByTa } from './tafav.js';
import { maybePickInspiration } from './inspiration.js';

const bus = new EventTarget();
export const on = (evt, fn) => bus.addEventListener(evt, fn);
export const off = (evt, fn) => bus.removeEventListener(evt, fn);
const emit = (evt, detail) => bus.dispatchEvent(new CustomEvent(evt, { detail }));

let timers = new Set();
let running = false;

function wait(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { timers.delete(t); resolve(); }, ms);
    timers.add(t);
  });
}

export function cancelPending() {
  timers.forEach(clearTimeout);
  timers.clear();
  running = false;
}

/* ---------- 写库与广播 ---------- */
/** 写一条消息并广播 */
export async function addMessage(msg) {
  const m = Object.assign({ id: uid(), ts: Date.now(), read: false, state: 'sent' }, msg);
  await put('messages', m);
  emit('message', m);
  // 他说不定会悄悄收下这句话；成功与否都不打扰聊天
  if (m.role === 'me') {
    maybeCollectByTa(m).catch(() => {});
    if (m.type === 'text') maybePickInspiration({ text: m.text, source: 'chat', sourceId: m.id }).catch(() => {});
  }
  if (m.role === 'ta' || m.role === 'sys') {
    await notify(state.role.name || 'TA', m.text || '[图片]', 'zika-' + m.id);
  }
  return m;
}

export async function updateMessage(id, patch) {
  const list = await all('messages');
  const m = list.find((x) => x.id === id);
  if (!m) return null;
  Object.assign(m, patch);
  await put('messages', m);
  emit('message-updated', m);
  return m;
}

async function bumpCounts(cardIds) {
  if (!cardIds || !cardIds.length) return;
  const cards = await all('cards');
  const map = new Map(cards.map((c) => [c.id, c]));
  const updates = [];
  cardIds.forEach((id) => {
    const c = map.get(id);
    if (c) { c.count = (c.count || 0) + 1; updates.push(c); }
  });
  if (updates.length) { await bulkPut('cards', updates); emit('cards-changed'); }
}

async function runSteps(steps) {
  if (running) { emit('busy', true); return; }
  running = true;
  const created = new Map();  // stepIndex -> messageId
  emit('typing', { on: true, label: '' });

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const delay = s.kind === 'recall' ? s.delayMs : s.delayMs;
    // 拼音消息在打字期间单独提示「拼音组词中」
    emit('typing', { on: true, label: s.kind === 'pinyin' ? '拼音组词中' : '' });
    await wait(delay);

    if (s.kind === 'recall') {
      const id = created.get(s.targetIndex);
      if (id) await updateMessage(id, { state: 'recalled' });
      continue;
    }
    if (s.kind === 'pat') {
      await addMessage({ role: 'sys', type: 'sys', text: 'TA 拍了拍你' });
      continue;
    }
    if (s.kind === 'call-request') {
      await addMessage({ role: 'sys', type: 'sys', text: 'TA 发起了通话请求：' + (s.text || '') });
      emit('call-request');      // 聊天页监听后弹出通话界面
      continue;
    }
    let m = null;
    if (s.kind === 'choice') {
      m = await addMessage({ role: 'ta', type: 'choice', text: s.text, choice: { options: s.options || [], selected: null } });
    } else if (s.kind === 'sticker') {
      m = await addMessage({ role: 'ta', type: 'sticker', mediaId: s.mediaId });
    } else if (s.kind === 'voice') {
      m = await addMessage({ role: 'ta', type: 'voice', mediaId: s.mediaId });
    } else if (s.kind === 'image') {
      m = await addMessage({ role: 'ta', type: 'image', mediaId: s.mediaId });
    } else if (s.kind === 'pinyin') {
      m = await addMessage({ role: 'ta', type: 'pinyin', text: s.text, pinyin: s.pinyin });
    } else if (s.kind === 'repost') {
      m = await addMessage({ role: 'ta', type: 'text', text: s.text, quoteId: null, repost: true });
    } else if (s.text) {
      m = await addMessage({ role: 'ta', type: 'text', text: s.text, quoteId: s.quoteId || null });
    }
    if (m) created.set(i, m.id);
    await bumpCounts(s.cardIds);
  }

  emit('typing', { on: false, label: '' });
  running = false;
}

/** 处理我发出的一条消息 → 生成 TA 的回复 */
export async function replyTo(myMsg) {
  // 我发的「问问TA」消息 → TA 选选项 + 用字卡回复
  if (myMsg.type === 'ask') return replyToAsk(myMsg);

  const [cards, history, mediaAll] = await Promise.all([all('cards'), all('messages'), all('media')]);
  const { ignored, steps } = await buildReply({
    cards,
    params: state.role.params,
    history: history.filter((m) => m.id !== myMsg.id),
    incomingText: myMsg.text || '',
    medias: mediaAll.filter((m) => m.type === 'image')
  });

  if (ignored) {
    await updateMessage(myMsg.id, { state: 'read' });
    emit('ignored');
    return { ignored: true };
  }
  runSteps(steps);
  return { ignored: false };
}

/** 处理我发的「问问TA」 */
async function replyToAsk(myMsg) {
  const cards = await all('cards');
  const p = state.role.params;

  // 回答延迟：自定义（消息自带）或随机（取角色回复延迟区间）
  const delayMs = (myMsg.askDelayMs && myMsg.askDelayMs > 0) ? myMsg.askDelayMs : delayFor(p);
  if (delayMs > 0) {
    await updateMessage(myMsg.id, { askDueTs: Date.now() + delayMs, state: 'read' });
    await wait(delayMs);
  }

  if (chance(Number(p.ignorePct))) {
    await updateMessage(myMsg.id, { askIgnored: true, askDueTs: null });
    emit('ignored');
    return { ignored: true };
  }

  const textPool = eligible(cards);
  let picked = [];
  let cardIds = [];
  let cardTexts = [];

  if (myMsg.askType === 'text') {
    // 文字题：用 1~8 张字卡回答，多张之间空一格
    if (textPool.length) {
      const n = rndInt(1, Math.min(8, textPool.length));
      const drawn = drawCards(textPool, n, p.pureRandom);
      cardIds = drawn.map((c) => c.id);
      cardTexts = drawn.map((c) => c.content);
    }
  } else {
    // 单选 / 多选
    const opts = myMsg.options || [];
    if (opts.length) {
      if (myMsg.askType === 'multi') {
        const maxN = Math.max(2, Math.min(opts.length, Number(myMsg.askMaxPick) || 2));
        const n = rndInt(Math.min(2, maxN), maxN);
        const shuffled = opts.slice().sort(() => Math.random() - 0.5);
        picked = shuffled.slice(0, n);
      } else {
        picked = [pick(opts)];
      }
    }
  }

  await updateMessage(myMsg.id, {
    askAnswered: true,
    askIgnored: false,
    askDueTs: null,
    askAnswer: picked,
    askCardsText: cardTexts,
    cardIds,
    state: 'read'
  });
  emit('ask-answered');
  await bumpCounts(cardIds);
  return { ignored: false };
}

/* ---------- 主动消息 ---------- */
let proactiveTimer = null;

export function startProactive() {
  stopProactive();
  proactiveTimer = setInterval(tickAll, 20000);
  document.addEventListener('visibilitychange', tickAll);
  tickAll();
}
export function stopProactive() {
  if (proactiveTimer) clearInterval(proactiveTimer);
  proactiveTimer = null;
  document.removeEventListener('visibilitychange', tickAll);
}

function tickAll() { tickProactive(); tickTaAsk(); }

/** 随机一个主动发送间隔（毫秒），由最短 / 最长间隔决定 */
function proactiveGap(p) {
  const lo = Math.max(1, Number(p.proactiveIntervalMin) || 1);
  const hi = Math.max(lo, Number(p.proactiveIntervalMax) || lo);
  return rndInt(lo, hi) * 60000;
}

/** 到点后按「主动发送概率」决定是否真的发 */
async function fireProactive(p) {
  if (!chance(Number(p.proactivePct))) return false;
  const [cards, mediaAll] = await Promise.all([all('cards'), all('media')]);
  const steps = await buildProactive({ cards, params: p, medias: mediaAll.filter((m) => m.type === 'image') });
  if (!steps.length) return false;
  runSteps(steps);

  // 概率触发 TA 主动来电（不通过聊天消息）
  if (chance(Number(p.callProactivePct))) {
    setTimeout(async () => {
      try {
        const { triggerIncoming } = await import('./call.js');
        triggerIncoming();
      } catch { /* 页面不在前台时忽略 */ }
    }, 1500);
  }

  return true;
}

/** 每 20 秒检查一次；到点就发，并把下一次排上 */
async function tickProactive() {
  const p = state.role.params;
  if (!p.proactive) return;
  if (running) return;
  const now = Date.now();
  const due = Number(await kvGet('nextProactiveAt', 0)) || 0;
  if (!due) {
    await kvSet('lastProactive', now);
    await kvSet('nextProactiveAt', now + proactiveGap(p));
    return;
  }
  if (now < due) return;
  await kvSet('lastProactive', now);
  await kvSet('nextProactiveAt', now + proactiveGap(p));
  await fireProactive(p);
}

/** 打开网站时补算「离开期间」应发生的主动消息 */
export async function catchUpProactive() {
  const p = state.role.params;
  if (!p.proactive) return;
  const now = Date.now();
  const due = Number(await kvGet('nextProactiveAt', 0)) || 0;
  if (!due) {
    await kvSet('lastProactive', now);
    await kvSet('nextProactiveAt', now + proactiveGap(p));
    return;
  }
  if (now < due) return;
  const last = Number(await kvGet('lastProactive', due)) || due;
  const lo = Math.max(1, Number(p.proactiveIntervalMin) || 1);
  const hi = Math.max(lo, Number(p.proactiveIntervalMax) || lo);
  const avg = ((lo + hi) / 2) * 60000;
  const missed = Math.max(1, Math.min(3, Math.floor((now - last) / Math.max(1, avg)) || 1));
  await kvSet('lastProactive', now);
  await kvSet('nextProactiveAt', now + proactiveGap(p));
  for (let i = 0; i < missed; i++) await fireProactive(p);
}

/* ---------- TA 的询问：每天随机时间、按当日随机概率提一问 ---------- */
function dayKey(d = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** 为「今天」抽一个提问计划：当天随机时刻 + 概率区间内的随机概率 */
async function planTaAsk() {
  const p = state.role.params;
  const today = dayKey();
  const plan = await kvGet('taAskPlan', null);
  if (plan && plan.date === today) return plan;
  const lo = Math.max(0, Number(p.taAskPctMin) || 0);
  const hi = Math.max(lo, Number(p.taAskPctMax) || lo);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const at = start.getTime() + rndInt(0, 24 * 60 - 1) * 60000 + rndInt(0, 59) * 1000;
  const fresh = { date: today, at, pct: rndInt(lo, hi), done: false };
  await kvSet('taAskPlan', fresh);
  return fresh;
}

async function tickTaAsk() {
  const p = state.role.params;
  if (!p.taAskEnabled) return;
  const bank = await kvGet('taAskBank', []);
  if (!Array.isArray(bank) || !bank.length) return;

  // 已有一条没回答的提问就不再追加
  const msgs = await all('messages');
  if (msgs.some((m) => m.type === 'taAsk' && !m.taqAnswered)) return;

  const plan = await planTaAsk();
  if (plan.done || Date.now() < plan.at) return;
  await kvSet('taAskPlan', { ...plan, done: true });   // 无论命中与否，今天只掷这一次
  if (!chance(plan.pct)) return;
  await sendTaAsk(bank);
}

/** 从问题库里抽一题发给 TA */
async function sendTaAsk(bank) {
  const list = bank && bank.length ? bank : await kvGet('taAskBank', []);
  if (!Array.isArray(list) || !list.length) return false;
  const q = pick(list);
  await addMessage({
    role: 'ta', type: 'taAsk',
    text: q.text || '',
    options: Array.isArray(q.options) ? q.options : [],
    taqMaxPick: Math.max(1, Number(q.maxPick) || 1),
    taqAllowText: !!q.allowText,
    taqAnswered: false
  });
  return true;
}

/** 让 TA 现在问一次（设置页的测试按钮）；已有未回答的问题或问题库为空时不发 */
export async function taAskNow() {
  const bank = await kvGet('taAskBank', []);
  if (!Array.isArray(bank) || !bank.length) return false;
  const msgs = await all('messages');
  if (msgs.some((m) => m.type === 'taAsk' && !m.taqAnswered)) return false;
  return sendTaAsk(bank);
}
