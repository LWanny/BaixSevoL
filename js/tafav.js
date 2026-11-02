/* 他的收藏 · TA 的悄悄收藏
   你发给 TA 的文字消息，每天有一个随机的小概率被他收进「他的收藏」，
   分到四个模块里。概率每天重掷一次：可能为 0，最高不超过 7%。
   整个收集过程不发消息、不弹提示，只在收藏页里留下痕迹。 */

import { put, all, kvGet, kvSet } from './store.js';
import { uid } from './util.js';

export const TA_FAV_CATS = [
  { key: 'liked',  label: '他喜欢的',    icon: 'IC-MOD-005', hint: '看着顺眼，就悄悄留下了' },
  { key: 'upset',  label: '他不高兴的',  icon: 'IC-MOD-004', hint: '有点在意，也有点气' },
  { key: 'wanted', label: '他想收藏的',  icon: 'IC-MIO-020', hint: '没什么理由，就是想留着' },
  { key: 'told',   label: '他想告诉你的', icon: 'IC-NAV-002', hint: '想找个时候，再慢慢和你说起' }
];

export function taFavCat(key) {
  return TA_FAV_CATS.find((c) => c.key === key) || TA_FAV_CATS[2];
}

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 今天 TA 收藏消息的概率（0–7%，三成日子为 0） */
export async function todayTaFavChance() {
  const day = dayKey();
  const saved = await kvGet('taFavChance', null);
  if (saved && saved.day === day) return Number(saved.pct) || 0;
  const pct = Math.random() < 0.3 ? 0 : +(Math.random() * 7).toFixed(1);
  await kvSet('taFavChance', { day, pct });
  return pct;
}

/** 我发出的消息，按今天的概率被 TA 收藏；不广播、不提示 */
export async function maybeCollectByTa(msg) {
  if (!msg || msg.role !== 'me' || msg.type !== 'text') return null;
  const text = String(msg.text || '').trim();
  if (text.length < 2) return null;

  const pct = await todayTaFavChance();
  if (!pct || Math.random() * 100 >= pct) return null;

  const exists = (await all('favorites')).some((f) => f.msgId === msg.id);
  if (exists) return null;

  const cat = TA_FAV_CATS[Math.floor(Math.random() * TA_FAV_CATS.length)];
  const rec = {
    id: uid(),
    owner: 'ta',
    title: '你说的话',
    content: text,
    source: '聊天',
    category: cat.key,
    msgId: msg.id,
    auto: true,
    ts: msg.ts || Date.now(),
    updatedAt: Date.now()
  };
  await put('favorites', rec);
  return rec;
}
