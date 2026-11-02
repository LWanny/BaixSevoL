/* 纪念日 · 数据与梦角的主动提议
   记录存在 anniversaries 表：
   { id, title, date:'YYYY-MM-DD', note, owner:'me'|'ta', status:'approved'|'pending', ts, decidedAt }
   梦角想加纪念日时先落成 pending，必须由我同意才会变成 approved。 */

import { all, put, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, pick, chance, rndInt } from './util.js';
import { eligible, drawCards, joinFragments } from './engine.js';

const DAY = 86400000;

export const AN_TITLES = [
  '第一次见面', '第一次说话', '第一次一起熬夜', '第一次叫我的名字',
  '第一次一起听歌', '第一次吵架又和好', '第一次说晚安', '第一次收到你的字卡',
  '第一次一起看电影', '第一次一起吃饭', '第一次牵手', '第一次说喜欢'
];

const NOTES = ['想把这个日子记下来。', '这个日子对我有点重要。', '以后每年都过一下吧。', '怕忘了，先记着。'];

export const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

/** 梦角是否要自己加一个纪念日（每天只掷一次，已有待同意的不再提） */
export async function maybeProposeAnniversary() {
  const day = ymd();
  const saved = await kvGet('annivProposalState', null);
  if (saved && saved.day === day) return null;

  const pending = (await all('anniversaries')).filter((a) => a.status === 'pending');
  let proposal = null;
  if (!pending.length && chance(12)) proposal = await propose();

  await kvSet('annivProposalState', { day, proposed: !!proposal });
  return proposal;
}

async function propose() {
  const cards = eligible(await all('cards'));
  const title = pick(AN_TITLES);

  /* 优先围绕「认识的那天」挑日子，否则在过去或近期里随机 */
  let date;
  const met = Number(state.role.metAt) || 0;
  if (met && chance(55)) {
    date = new Date(met + rndInt(-20, 20) * DAY);
  } else {
    const offset = chance(50) ? rndInt(-400, -5) : rndInt(0, 45);
    date = new Date(Date.now() + offset * DAY);
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
    ts: Date.now()
  };
  await put('anniversaries', row);
  return row;
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
