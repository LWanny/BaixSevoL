/* 昵称 / 头像互动（头像昵称库）
   四种换改，各自开关 + 概率区间 + 「直接换 / 先问我」方式：
     1) TA 主动给我换昵称   ← 我的昵称库
     2) TA 主动给我换头像   ← 我的头像库
     3) TA 给自己换昵称     ← TA 的昵称库
     4) TA 给自己换头像     ← TA 的头像库
   只从你导入的库里抽（库是空的就不换，没有兜底）；
   四种行为合计每天最多换 swapDailyMax 次（默认 1），按天重新计数；
   direct = 直接换 + 发条通知，ask = 弹一条选择消息征求你同意。 */

import { all, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { chance, rndInt, pick } from './util.js';
import * as sched from './scheduler.js';

/** 从库里抽一个：kind='nick' 返回昵称文本，kind='avatar' 返回 mediaId；库空返回 null */
async function libPick(kind, role) {
  const table = kind === 'avatar' ? 'avatarPool' : 'nicknamePool';
  const list = (await all(table)).filter((r) => r.role === role);
  if (!list.length) return null;
  const r = pick(list);
  return kind === 'avatar' ? r.mediaId : r.name;
}

/** 按「下限~上限」随机取一个概率再掷骰子 */
function draw(loKey, hiKey) {
  const p = state.role.params;
  const lo = Math.max(0, Number(p[loKey]) || 0);
  const hi = Math.max(lo, Number(p[hiKey]) || 0);
  return chance(rndInt(lo, hi));
}

function dayKey(d = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** 占一个「今天」的名额；用完返回 false（force=true 试一试时不限次数） */
async function takeQuota(force) {
  if (force) return true;
  const max = Math.max(0, Number(state.role.params.swapDailyMax) || 0);
  if (!max) return false;
  const today = dayKey();
  const cur = await kvGet('swapDaily', null);
  const used = (cur && cur.day === today) ? Number(cur.n || 0) : 0;
  if (used >= max) return false;
  await kvSet('swapDaily', { day: today, n: used + 1 });
  return true;
}

/* ---------------- 1) TA 主动给我换昵称 ---------------- */
export async function maybeMyRename(force = false) {
  const p = state.role.params;
  if (!p.taRenameEnabled) return false;
  if (!force && !draw('taRenamePctMin', 'taRenamePctMax')) return false;
  const name = await libPick('nick', 'me');
  if (!name) return false;
  if (!await takeQuota(force)) return false;

  if (p.taRenameMode === 'direct') {
    state.role.chatNicknameMe = name;
    await kvSet('role', state.role);
    await sched.addMessage({ role: 'sys', type: 'sys', text: `TA 在聊天里把你的昵称改成了「${name}」` });
  } else {
    await sched.addMessage({
      role: 'ta', type: 'choice', proactive: true,
      text: `我想把你的聊天昵称改成「${name}」……`,
      choice: { options: [`好呀，改成「${name}」`, `不用啦，我想留着现在这个`], newChatNickname: name }
    });
  }
  return true;
}

/* ---------------- 2) TA 主动给我换头像 ---------------- */
export async function maybeMyAvatar(force = false) {
  const p = state.role.params;
  if (!p.taChangeAvatarEnabled) return false;
  if (!force && !draw('taChangeAvatarPctMin', 'taChangeAvatarPctMax')) return false;
  const mediaId = await libPick('avatar', 'me');
  if (!mediaId) return false;
  if (!await takeQuota(force)) return false;

  if (p.taChangeAvatarMode === 'direct') {
    state.role.chatAvatarMeId = mediaId;
    await kvSet('role', state.role);
    await sched.addMessage({ role: 'sys', type: 'sys', text: 'TA 在聊天里给你换了个新头像' });
  } else {
    await sched.addMessage({
      role: 'ta', type: 'choice', proactive: true,
      text: '我存了张图，想给你当聊天里的新头像……',
      mediaId,
      choice: { options: ['好呀，换一下', '不用啦'], newChatAvatarMediaId: mediaId }
    });
  }
  return true;
}

/* ---------------- 3) TA 给自己换昵称 ---------------- */
export async function maybeTaSelfRename(force = false) {
  const p = state.role.params;
  if (!p.taSelfNickEnabled) return false;
  if (!force && !draw('taSelfNickPctMin', 'taSelfNickPctMax')) return false;
  const name = await libPick('nick', 'ta');
  if (!name) return false;
  if (!await takeQuota(force)) return false;

  if (p.taSelfNickMode === 'direct') {
    await applyTaSelfRename(name);
    await sched.addMessage({ role: 'sys', type: 'sys', text: `TA 把自己的昵称改成了「${name}」` });
  } else {
    await sched.addMessage({
      role: 'ta', type: 'choice', proactive: true,
      text: `我想给自己换个昵称，叫「${name}」，好不好？`,
      choice: { options: [`好呀，换成「${name}」`, '先别换，我喜欢你现在这个'], newTaNickname: name }
    });
  }
  return true;
}

/* ---------------- 4) TA 给自己换头像 ---------------- */
export async function maybeTaSelfAvatar(force = false) {
  const p = state.role.params;
  if (!p.taSelfAvatarEnabled) return false;
  if (!force && !draw('taSelfAvatarPctMin', 'taSelfAvatarPctMax')) return false;
  const mediaId = await libPick('avatar', 'ta');
  if (!mediaId) return false;
  if (!await takeQuota(force)) return false;

  if (p.taSelfAvatarMode === 'direct') {
    await applyTaSelfAvatar(mediaId);
    await sched.addMessage({ role: 'sys', type: 'sys', text: 'TA 换了一张自己的新头像' });
  } else {
    await sched.addMessage({
      role: 'ta', type: 'choice', proactive: true,
      text: '我找了张图，想当我的新头像……',
      mediaId,
      choice: { options: ['好呀，换上', '不用，现在这张挺好'], newTaAvatarMediaId: mediaId }
    });
  }
  return true;
}

/* ---------------- 落地（同意后由 chat.js 调用） ---------------- */
/** TA 给我换的聊天昵称 / 头像 */
export function applyTaRename(newName) {
  state.role.chatNicknameMe = newName;
  return kvSet('role', state.role);
}
export function applyTaAvatar(mediaId) {
  state.role.chatAvatarMeId = mediaId;
  return kvSet('role', state.role);
}
/** TA 换它自己的昵称 / 头像（影响角色名与聊天里 TA 的头像） */
export function applyTaSelfRename(newName) {
  state.role.name = newName;
  return kvSet('role', state.role);
}
export function applyTaSelfAvatar(mediaId) {
  state.role.avatarId = mediaId;
  return kvSet('role', state.role);
}

/* ---------------- 后台 ---------------- */
let timer = null;
export function startNicknameAI() {
  if (timer) return;
  const tick = async () => {
    try {
      await maybeMyRename();
      await maybeMyAvatar();
      await maybeTaSelfRename();
      await maybeTaSelfAvatar();
    } catch (e) { console.warn('昵称/头像 AI', e); }
  };
  setTimeout(tick, 6000);
  timer = setInterval(tick, 7 * 60 * 1000);
}

/** 设置页「试一次」：不掷概率、不占当天次数，跑第一个已打开的行为 */
export async function swapDemo() {
  const p = state.role.params;
  const jobs = [
    [p.taRenameEnabled, () => maybeMyRename(true), '给你换个昵称'],
    [p.taChangeAvatarEnabled, () => maybeMyAvatar(true), '给你换个头像'],
    [p.taSelfNickEnabled, () => maybeTaSelfRename(true), '给自己换个昵称'],
    [p.taSelfAvatarEnabled, () => maybeTaSelfAvatar(true), '给自己换个头像']
  ];
  const on = jobs.filter(([en]) => en);
  if (!on.length) return null;
  for (const [, fn, label] of on) {
    if (await fn()) return '已执行：TA' + label;
  }
  return '这次没换成——先去上面的库里导入对应内容（昵称或头像）';
}
