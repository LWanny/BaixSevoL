/* 朋友圈调度：TA 主动发动态、给我点赞 / 评论、回复我的回复
   全局常驻（离开朋友圈页面也会继续跑），通过事件让页面重绘。 */

import { all, put, bulkPut, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, chance, rndInt, pick } from './util.js';
import { eligible, drawCards, joinFragments, randomKaomoji } from './engine.js';

const bus = new EventTarget();
export const onMoments = (fn) => bus.addEventListener('change', fn);
export const offMoments = (fn) => bus.removeEventListener('change', fn);
const emit = () => bus.dispatchEvent(new CustomEvent('change'));

const EMOJI = ['😊', '🥹', '😌', '🤍', '✨', '🌙', '☕️', '🫧', '😶‍🌫️', '🌿', '🎧', '📷', '🙈', '🥲'];
const STICKERS = ['[抱抱]', '[贴贴]', '[傻笑]', '[探头]', '[比心]', '[歪头]'];

/* ---------------- 数据整理（兼容旧记录） ---------------- */
export function normalizeMoment(m) {
  const out = Object.assign({}, m);
  out.author = m.author || 'me';
  out.likes = Array.isArray(m.likes) ? m.likes.slice() : [];
  out.comments = Array.isArray(m.comments) ? m.comments.slice() : [];
  out.pending = m.pending ? Object.assign({}, m.pending) : {};
  // 旧版只有一条 ta.comment，折算成一条评论 + 一个赞
  if (!out.comments.length && m.ta && m.ta.comment) {
    const ts = m.ta.ts || m.ts;
    out.comments = [{ id: 'c-' + m.id, who: 'ta', text: m.ta.comment, ts, cards: m.ta.cardIds || [] }];
    if (!out.likes.length) out.likes = [{ who: 'ta', ts }];
  }
  return out;
}

/* ---------------- 抽卡拼句 ---------------- */
/** 朋友圈优先用「朋友圈字卡」；一张都没有时退回主字卡库，保证还能说话 */
async function momentPool() {
  const own = (await all('momentCards')).filter((c) => c.enabled !== false && c.kind === 'text');
  if (own.length) return { pool: own, store: 'momentCards' };
  return { pool: eligible(await all('cards')), store: 'cards' };
}

async function composeText({ cardMin, cardMax, multiPct, emojiPct, stickerPct, kaomojiPct }) {
  const p = state.role.params;
  const { pool, store } = await momentPool();
  if (!pool.length) return null;
  const lo = Math.max(1, Math.round(Number(cardMin) || 1));
  const hi = Math.max(lo, Math.round(Number(cardMax) || lo));
  const n = multiPct != null && !chance(multiPct) ? 1 : rndInt(lo, hi);
  const drawn = drawCards(pool, n, p.momentsPureRandom);
  if (!drawn.length) return null;
  let text = joinFragments(drawn.map((c) => c.content));
  if (emojiPct != null && chance(emojiPct)) text += ' ' + pick(EMOJI);
  if (stickerPct != null && chance(stickerPct)) text += ' ' + pick(STICKERS);
  if (kaomojiPct != null && chance(kaomojiPct)) text += ' ' + randomKaomoji();
  return { text, cardIds: drawn.map((c) => c.id), store };
}

async function bumpCounts(cardIds, store = 'cards') {
  if (!cardIds || !cardIds.length) return;
  const cards = await all(store);
  const map = new Map(cards.map((c) => [c.id, c]));
  const updates = [];
  cardIds.forEach((id) => { const c = map.get(id); if (c) { c.count = (c.count || 0) + 1; updates.push(c); } });
  if (updates.length) await bulkPut(store, updates);
}

/* ---------------- 朋友圈配乐 ----------------
   只有在一起听里连过网易云（本地存了 MUSIC_U）才会挑歌，
   优先从 TA 自己收的歌里选，没有就从他歌单里的全部网易云歌曲里选。 */
export async function pickMomentSong() {
  try {
    const cookie = await kvGet('neteaseCookie', '');
    if (!cookie) return null;
    const songs = await all('songs');
    const pool = songs.filter((s) => s && s.neteaseId);
    if (!pool.length) return null;
    const mine = pool.filter((s) => s.addedBy === 'ta');
    const chosen = pick(mine.length && chance(70) ? mine : pool);
    return {
      source: 'netease',
      neteaseId: chosen.neteaseId,
      title: chosen.title || '',
      artist: chosen.artist || '',
      url: chosen.url || ''
    };
  } catch {
    return null;
  }
}

/* ---------------- 朋友回复 ----------------
   朋友只出现在 TA 发的朋友圈下面，用朋友圈字卡回一两句。 */
export async function scheduleFriendReplies(m) {
  const next = normalizeMoment(m);
  if (next.author !== 'ta') return null;
  const friends = (await all('friends')).filter((f) => f.enabled !== false);
  if (!friends.length) return null;
  const picked = friends.filter(() => chance(55)).slice(0, 3);
  if (!picked.length) return null;
  next.pending = Object.assign({}, next.pending, {
    friendAt: Date.now() + rndInt(40, 360) * 1000,
    friendIds: picked.map((f) => f.id)
  });
  await put('moments', next);
  return next;
}

/* ---------------- TA 发朋友圈 ---------------- */
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function taGapMs(p) {
  const lo = Math.max(1, Number(p.taPostGapMin) || 1);
  const hi = Math.max(lo, Number(p.taPostGapMax) || lo);
  return rndInt(lo, hi) * 60000;
}

async function maybeTaPost() {
  const p = state.role.params;
  if (!p.taPostEnabled) return;

  const now = Date.now();
  const today = dayKey(now);
  let savedDay = await kvGet('taPostDay', '');
  let count = Number(await kvGet('taPostCount', 0)) || 0;
  if (savedDay !== today) {
    savedDay = today;
    count = 0;
    await kvSet('taPostDay', today);
    await kvSet('taPostCount', 0);
  }

  const dailyMax = Math.max(0, Number(p.taPostDailyMax) || 0);
  if (count >= dailyMax) return;

  let due = Number(await kvGet('nextTaPostAt', 0)) || 0;
  if (!due) { await kvSet('nextTaPostAt', now + taGapMs(p)); return; }
  if (now < due) return;
  await kvSet('nextTaPostAt', now + taGapMs(p));

  // 还没到「每天最少条数」时必发，之后按概率掷骰子
  const dailyMin = Math.max(0, Number(p.taPostDailyMin) || 0);
  const mustPost = count < dailyMin;
  if (!mustPost && !chance(Number(p.taPostPct))) return;

  const composed = await composeText({
    cardMin: p.taPostCardMin,
    cardMax: p.taPostCardMax,
    multiPct: null,
    emojiPct: p.taPostEmojiPct,
    stickerPct: p.taPostStickerPct,
    kaomojiPct: p.taPostKaomojiPct
  });
  if (!composed) return;

  let mediaIds = [];
  if (chance(Number(p.taPostImgPct))) {
    const media = await all('media');
    const imgs = media.filter((x) => x && x.type === 'image' && x.blob);
    if (imgs.length) mediaIds = [pick(imgs).id];
  }

  const m = {
    id: uid(), ts: now, author: 'ta',
    text: composed.text, mediaIds, audioId: null,
    song: await pickMomentSong(),
    likes: [], comments: [], pending: {}
  };
  await put('moments', m);
  await kvSet('taPostCount', count + 1);
  await bumpCounts(composed.cardIds, composed.store);
  await scheduleFriendReplies(m);
  emit();
}

/* ---------------- 我发完 → TA 点赞 / 评论 ---------------- */

/** 评论/回复的随机延迟（毫秒）：最快按秒、最慢按分钟 */
function commentDelayMs(p) {
  const lo = Math.max(0, Number(p.commentDelayMinSec) || 0);
  const hiMin = Math.max(0, Number(p.commentDelayMaxMin) || 0);
  return rndInt(lo, hiMin * 60);
}
function replyDelayMs(p) {
  const lo = Math.max(0, Number(p.replyDelayMinSec) || 0);
  const hiMin = Math.max(0, Number(p.replyDelayMaxMin) || 0);
  return rndInt(lo, hiMin * 60);
}

export async function scheduleReactions(m) {
  const p = state.role.params;
  const now = Date.now();
  const pending = {};
  if (chance(Number(p.likePct))) pending.likeAt = now + rndInt(20, 300) * 1000;
  if (chance(Number(p.commentPct))) pending.commentAt = now + commentDelayMs(p) * 1000;
  const next = normalizeMoment(m);
  next.pending = Object.assign({}, next.pending, pending);
  await put('moments', next);
  return next;
}

/** 我点赞了一条动态 → TA 可能反过来也点一下 */
export async function scheduleLikeBack(m) {
  const p = state.role.params;
  if (!chance(Number(p.likeBackPct))) return false;
  const next = normalizeMoment(m);
  if (next.likes.some((l) => l.who === 'ta')) return false;   // TA 已经点过了就不重复
  next.pending = Object.assign({}, next.pending, { likeBackAt: Date.now() + rndInt(15, 240) * 1000 });
  await put('moments', next);
  return true;
}

/** 我回复了 TA 的评论 → 按概率让 TA 再回一条 */
export async function scheduleReplyBack(m, myCommentId) {
  const p = state.role.params;
  const next = normalizeMoment(m);
  if (!chance(Number(p.replyBackPct))) {
    next.pending = Object.assign({}, next.pending, { replyAt: 0 });
    await put('moments', next);
    return false;
  }
  next.pending = Object.assign({}, next.pending, {
    replyAt: Date.now() + replyDelayMs(p) * 1000,
    replyTo: myCommentId || null
  });
  await put('moments', next);
  return true;
}

/* ---------------- 到点处理点赞 / 评论 / 回复 ---------------- */
export async function flushReactions() {
  const p = state.role.params;
  const list = await all('moments');
  const now = Date.now();
  let changed = false;

  for (const raw of list) {
    const m = normalizeMoment(raw);
    const pend = m.pending || {};
    let dirty = false;

    if (pend.likeAt && now >= pend.likeAt) {
      delete pend.likeAt;
      if (!m.likes.some((l) => l.who === 'ta')) m.likes.push({ who: 'ta', ts: now });
      dirty = true;
    }

    if (pend.likeBackAt && now >= pend.likeBackAt) {
      delete pend.likeBackAt;
      // 我点赞了 → TA 也回赞；双重确认一下还没赞过
      if (!m.likes.some((l) => l.who === 'ta') && m.likes.some((l) => l.who === 'me')) {
        m.likes.push({ who: 'ta', ts: now });
        dirty = true;
      }
    }

    if (pend.commentAt && now >= pend.commentAt) {
      delete pend.commentAt;
      const c = await composeText({
        cardMin: p.commentCardMin,
        cardMax: p.commentCardMax,
        multiPct: p.multiCardPct,
        emojiPct: p.commentEmojiPct,
        stickerPct: p.commentEmojiPct,
        kaomojiPct: null
      });
      if (c) {
        m.comments.push({ id: uid(), who: 'ta', text: c.text, ts: now, cards: c.cardIds });
        await bumpCounts(c.cardIds, c.store);
      }
      dirty = true;
    }

    if (pend.replyAt && now >= pend.replyAt) {
      const replyTo = pend.replyTo || null;
      delete pend.replyAt;
      delete pend.replyTo;
      const c = await composeText({
        cardMin: p.commentCardMin,
        cardMax: p.commentCardMax,
        multiPct: p.multiCardPct,
        emojiPct: p.commentEmojiPct,
        stickerPct: p.commentEmojiPct,
        kaomojiPct: null
      });
      if (c) {
        m.comments.push({ id: uid(), who: 'ta', text: c.text, ts: now, cards: c.cardIds, replyTo });
        await bumpCounts(c.cardIds, c.store);
      }
      dirty = true;
    }

    /* 朋友只回 TA 自己发的动态，不出现在我的朋友圈下面 */
    if (pend.friendAt && now >= pend.friendAt) {
      const ids = Array.isArray(pend.friendIds) ? pend.friendIds : [];
      delete pend.friendAt;
      delete pend.friendIds;
      if (m.author === 'ta') {
        for (const fid of ids) {
          const c = await composeText({
            cardMin: 1,
            cardMax: Math.max(1, Number(p.commentCardMax) || 2),
            multiPct: 40,
            emojiPct: p.commentEmojiPct,
            stickerPct: p.commentEmojiPct,
            kaomojiPct: null
          });
          if (!c) continue;
          m.comments.push({ id: uid(), who: fid, text: c.text, ts: now, cards: c.cardIds, friend: true });
          await bumpCounts(c.cardIds, c.store);
        }
      }
      dirty = true;
    }

    if (dirty) {
      m.pending = pend;
      await put('moments', m);
      changed = true;
    }
  }
  if (changed) emit();
  return changed;
}

/* ---------------- 常驻循环 ---------------- */
let timer = null;

export function startMomentsAI() {
  stopMomentsAI();
  timer = setInterval(tick, 30000);
  document.addEventListener('visibilitychange', tick);
  tick();
}
export function stopMomentsAI() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', tick);
}

async function tick() {
  try {
    await flushReactions();
    await maybeTaPost();
  } catch (e) {
    console.warn('朋友圈调度失败', e);
  }
}
