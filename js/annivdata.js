/* 纪念日 · 数据、梦角的主动提议、以及在特定日子里到聊天里提起
   记录存在 anniversaries 表：
   { id, title, date:'YYYY-MM-DD', note, owner:'me'|'ta', status:'approved'|'pending', ts, decidedAt,
     pinned, remindEnabled, remindPct, remindFrom:'MM-DD', remindTo:'MM-DD', remindMax, remindedCount, lastRemindDay }
   梦角想加纪念日时先落成 pending，必须由我同意才会变成 approved。 */

import { all, put, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, pick, chance, rndInt } from './util.js';
import { eligible, drawCards, joinFragments } from './engine.js';

const DAY = 86400000;

/* 梦角提议时可选的名字（我可以在设置里增删） */
export const DEFAULT_PROPOSAL_TITLES = [
  '特殊的日子', '重要的约会', '亲亲的日子',
  '周年纪念日', '情人节', '总之就是要呆在一起的纪念日'
];

/* 提醒语录：可以在设置里改 / 加 / 删；{name} 名字、{days} 倒数天数、{passed} 已经过天数 */
export const DEFAULT_TODAY_LINES = [
  '今天就是「{name}」呀，{passed} 天了。',
  '差点忘了，今天「{name}」。我们已经一起走过 {passed} 天啦。'
];

export const DEFAULT_UPCOMING_LINES = [
  '「{name}」倒数 {days} 天就到了，记得留给我。',
  '「{name}」倒数 {days} 天就到了，已经一起 {passed} 天了呢。',
  '数了一下，「{name}」倒数 {days} 天。'
];

/** 读取提醒语录；空列表回落到默认，保证永远有话说 */
export async function remindLines() {
  const norm = (v, def) => {
    const list = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    return list.length ? list : def.slice();
  };
  return {
    today: norm(await kvGet('annivLinesToday', null), DEFAULT_TODAY_LINES),
    upcoming: norm(await kvGet('annivLinesUpcoming', null), DEFAULT_UPCOMING_LINES)
  };
}

function fillLine(tpl, name, days, passed) {
  return String(tpl)
    .replace(/\{name\}/g, name)
    .replace(/\{days\}/g, String(days))
    .replace(/\{passed\}/g, String(passed));
}

const NOTES = ['想把这个日子记下来。', '这个日子对我有点重要。', '以后每年都过一下吧。', '怕忘了，先记着。'];

export const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const md = (d = new Date()) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseYMD(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 下一次周年：返回 { next, days, years }；years 为已经过去的整年数 */
export function occurrence(dateStr, from = new Date()) {
  const d = parseYMD(dateStr);
  if (!d) return null;
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let next = new Date(base.getFullYear(), d.getMonth(), d.getDate());
  if (next < base) next = new Date(base.getFullYear() + 1, d.getMonth(), d.getDate());
  return {
    next,
    days: Math.round((next - base) / DAY),
    years: Math.max(0, base.getFullYear() - d.getFullYear())
  };
}

/** 从最初那天到今天，已经一起过了多少天（未来日期算 0） */
export function daysPassed(dateStr, to = new Date()) {
  const d = parseYMD(dateStr);
  if (!d) return 0;
  const base = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((base - start) / DAY));
}

/** 今天是否落在「提醒区间」里；没设区间就只在纪念日当天 */
export function inRemindWindow(row, now = new Date()) {
  const today = md(now);
  if (!row.remindFrom) return today === md(parseYMD(row.date) || now);
  const from = row.remindFrom;
  const to = row.remindTo || row.remindFrom;
  if (from <= to) return today >= from && today <= to;
  return today >= from || today <= to;   // 跨年：12-20 ~ 01-01
}

/* ---------------- 设置项 ---------------- */
export async function taProposePct() {
  const v = Number(await kvGet('annivTaPct', 5));
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 5));
}

export async function proposalTitles() {
  const list = await kvGet('annivProposalTitles', null);
  if (Array.isArray(list) && list.length) return list;
  return DEFAULT_PROPOSAL_TITLES.slice();
}

/* ---------------- 梦角提议 ---------------- */
/** 梦角是否要自己加一个纪念日（每天只掷一次，已有待同意的不再提） */
export async function maybeProposeAnniversary() {
  const day = ymd();
  const saved = await kvGet('annivProposalState', null);
  if (saved && saved.day === day) return null;

  const pct = await taProposePct();
  const pending = (await all('anniversaries')).filter((a) => a.status === 'pending');
  let proposal = null;
  if (pct > 0 && !pending.length && chance(pct)) proposal = await propose();

  await kvSet('annivProposalState', { day, proposed: !!proposal });
  return proposal;
}

async function propose() {
  const cards = eligible(await all('cards'));
  const title = pick(await proposalTitles());

  /* TA 自己定日子：1–12 月里随机挑一个月、该月内随机挑一天；
     若落到今天之后就取去年的那一天，避免「已经 0 天」 */
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = rndInt(1, 12);
  const day = rndInt(1, new Date(now.getFullYear(), month, 0).getDate());
  let date = new Date(now.getFullYear(), month - 1, day);
  if (date > t) {
    const prevLast = new Date(now.getFullYear() - 1, month, 0).getDate();
    date = new Date(now.getFullYear() - 1, month - 1, Math.min(day, prevLast));
  }

  let note;
  if (cards.length && chance(65)) {
    const n = chance(30) ? 2 : 1;
    note = joinFragments(drawCards(cards, n, state.role.params.pureRandom).map((c) => c.content));
  } else {
    note = pick(NOTES);
  }

  const row = {
    id: uid(),
    title,
    date: ymd(date),
    note,
    owner: 'ta',
    status: 'pending',
    ts: Date.now(),
    pinned: false,
    remindEnabled: false,   // 默认不开提醒
    remindPct: 0
  };
  await put('anniversaries', row);
  return row;
}

/* ---------------- 在聊天里提起 ---------------- */
/** 每天每个纪念日只掷一次；命中且没超过「最多提起几次」就返回一句要说的话 */
export async function maybeMentionAnniversary(now = Date.now()) {
  const d = new Date(now);
  const today = ymd(d);
  const rows = (await all('anniversaries')).filter((a) =>
    a.status === 'approved' && a.remindEnabled && Number(a.remindPct) > 0);

  for (const a of rows) {
    if (a.lastRemindDay === today) continue;
    if (Number(a.remindedCount || 0) >= Number(a.remindMax || 0)) continue;
    if (!inRemindWindow(a, d)) continue;

    /* 先记下今天已经掷过，避免同一天反复掷 */
    a.lastRemindDay = today;
    await put('anniversaries', a);
    if (!chance(Number(a.remindPct))) continue;

    a.remindedCount = Number(a.remindedCount || 0) + 1;
    a.lastRemindAt = now;
    await put('anniversaries', a);

    const occ = occurrence(a.date, d);
    const passed = daysPassed(a.date, d);
    const name = a.title || '纪念日';
    const lines = await remindLines();
    const tpl = pick(occ.days === 0 ? lines.today : lines.upcoming);
    return { row: a, text: fillLine(tpl, name, occ.days, passed) };
  }
  return null;
}

let timer = null;
export function startAnnivAI() {
  if (timer) return;
  const tick = async () => {
    try { await maybeProposeAnniversary(); }
    catch (e) { console.warn('纪念日后台任务失败', e); }
  };
  setTimeout(tick, 4200);
  timer = setInterval(tick, 10 * 60 * 1000);
}
