/* 灵感拾取 · TA 可能把你说过的话悄悄收起来，之后在聊天里自己用
   存储：inspirations 表 { id, text, source, sourceId, used:false, usedAt, ts }
   触发点：scheduler / letters / moments 三个出口
   使用：engine.js buildOne 有一个概率直接从已拾取里抽一句 */

import { put, all, del } from './store.js';
import { uid, chance } from './util.js';
import { state } from './state.js';

export const SOURCE_LABEL = {
  chat: '聊天',
  letter: '信件',
  moment: '朋友圈'
};

const MIN_LEN = 3;
const MAX_LEN = 80;
const BORING = /^[\s，。！？!?,、…~～·.]{1,10}$/;

/** 主入口：按当前开关/概率决定是否拾取 */
export async function maybePickInspiration({ text, source, sourceId }) {
  if (!state.role.params?.inspirationEnabled) return null;

  const clean = String(text || '').trim();
  if (clean.length < MIN_LEN || clean.length > MAX_LEN) return null;
  if (BORING.test(clean)) return null;
  const pct = Number(state.role.params?.inspirationPct) || 0;
  if (!chance(pct)) return null;

  const list = await all('inspirations');
  if (list.some((x) => x.text === clean)) return null; // 精确去重

  const rec = {
    id: uid(),
    text: clean,
    source,
    sourceId: sourceId || null,
    used: false,
    usedAt: null,
    ts: Date.now()
  };
  await put('inspirations', rec);
  return rec;
}

/** 挑一条可用的灵感（used=false），used 后标 true */
export async function drawInspiration(markUsed = true) {
  const list = (await all('inspirations')).filter((x) => !x.used);
  if (!list.length) return null;
  const pick = list[Math.floor(Math.random() * list.length)];
  if (markUsed) {
    pick.used = true;
    pick.usedAt = Date.now();
    await put('inspirations', pick);
  }
  return pick;
}

export async function listInspirations() {
  return (await all('inspirations')).sort((a, b) => b.ts - a.ts);
}

export async function removeInspiration(id) {
  return del('inspirations', id);
}

export async function clearInspirations() {
  const rows = await all('inspirations');
  await Promise.all(rows.map((r) => del('inspirations', r.id)));
  return rows.length;
}
