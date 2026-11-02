/* 昵称 / 头像互动
   TA 可以主动在聊天里给我换昵称或头像：
   - direct 模式：直接改，同时发一条 sys 消息告诉你
   - ask 模式：发一条 choice 消息征求同意，点"同意"才改
   触发：后台定时器 + 每次聊天后检查距离上次改名/换头像的间隔
   数据来源：nicknamePool / avatarPool 表，若对应 role 库里没东西，
   则自动从字卡库拼一句/从已有 media 里抽一张做兜底。 */

import { all, put, del, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, chance, rndInt, pick } from './util.js';
import { eligible, drawCards, joinFragments } from './engine.js';
import * as sched from './scheduler.js';

const DAY = 86400000;

export async function pickTaNickname() {
  const list = (await all('nicknamePool')).filter((r) => r.role === 'ta');
  if (list.length) return pick(list).name;
  /* 兜底：从字卡库拼一句短句 */
  const cards = eligible(await all('cards'));
  if (!cards.length) return null;
  const n = chance(40) ? 2 : 1;
  const frags = drawCards(cards, n, state.role.params.pureRandom).map((c) => c.content);
  let txt = joinFragments(frags).trim();
  txt = txt.replace(/[。！？!?\.]/g, '').slice(0, 8);
  return txt || null;
}

export async function pickTaAvatar() {
  const list = (await all('avatarPool')).filter((r) => r.role === 'ta');
  if (list.length) return pick(list).mediaId;
  /* 兜底：从 media 表挑一张已有图片 */
  const medias = (await all('media')).filter((m) => m.type === 'image');
  return medias.length ? pick(medias).id : null;
}

async function dayKey(k) {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${k}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 到点了吗？距上次改动间隔是否已过上限；首次运行时直接允许 */
async function gapPassed(gapKey, gapMinMin, gapMinMax) {
  const last = Number(await kvGet(gapKey, 0)) || 0;
  const now = Date.now();
  const gap = rndInt(gapMinMin, gapMinMax) * 60000;
  if (!last) return true;
  return now - last > gap;
}

export async function maybeTaRename() {
  const p = state.role.params;
  if (!p.taRenameEnabled) return;
  if (!await gapPassed('taRenameLast', p.taRenameGapMin, p.taRenameGapMax)) return;
  if (!chance(p.taRenamePct)) return;

  const newName = await pickTaNickname();
  if (!newName) return;
  await kvSet('taRenameLast', Date.now());

  if (p.taRenameMode === 'direct') {
    state.role.chatNicknameMe = newName;
    await kvSet('role', state.role);
    await sched.addMessage({ role: 'sys', type: 'sys', text: `TA 在聊天里把你的昵称改成了「${newName}」` });
  } else {
    const choice = await sched.addMessage({
      role: 'ta',
      type: 'choice',
      proactive: true,
      text: `我想把你的聊天昵称改成「${newName}」……`,
      choice: {
        options: [`好呀，改成「${newName}」`, `不用啦，我想留着现在这个`],
        newChatNickname: newName
      }
    });
  }
}

export async function maybeTaChangeAvatar() {
  const p = state.role.params;
  if (!p.taChangeAvatarEnabled) return;
  if (!await gapPassed('taAvatarLast', p.taChangeAvatarGapMin, p.taChangeAvatarGapMax)) return;
  if (!chance(p.taChangeAvatarPct)) return;

  const newId = await pickTaAvatar();
  if (!newId) return;
  await kvSet('taAvatarLast', Date.now());

  if (p.taChangeAvatarMode === 'direct') {
    state.role.chatAvatarMeId = newId;
    await kvSet('role', state.role);
    await sched.addMessage({ role: 'sys', type: 'sys', text: 'TA 在聊天里给你换了个新头像' });
  } else {
    await sched.addMessage({
      role: 'ta',
      type: 'choice',
      proactive: true,
      text: '我存了张图，想给你当聊天里的新头像……',
      mediaId: newId,
      choice: {
        options: ['好呀，换一下', '不用啦'],
        newChatAvatarMediaId: newId
      }
    });
  }
}

/** choice 消息的同意处理由 chat.js choice 按钮调用：
     如果 option 文本里包含改成的昵称则调用这里 */
export function applyTaRename(newName) {
  state.role.chatNicknameMe = newName;
  return kvSet('role', state.role);
}
export function applyTaAvatar(mediaId) {
  state.role.chatAvatarMeId = mediaId;
  return kvSet('role', state.role);
}

/* ---------- 后台 ---------- */
let timer = null;
export function startNicknameAI() {
  if (timer) return;
  const tick = async () => {
    try {
      await maybeTaRename();
      await maybeTaChangeAvatar();
    } catch (e) { console.warn('昵称/头像 AI', e); }
  };
  setTimeout(tick, 6000);
  timer = setInterval(tick, 7 * 60 * 1000);
}
