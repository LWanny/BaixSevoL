/* 他的视角 · 聊天截图
   TA 从自己的手机视角截下最近一段聊天，画成一张 PNG 存进媒体库，
   再以他的身份发到朋友圈（不经过聊天，也不会有消息提醒）。 */

import { all, put } from './store.js';
import { uid } from './util.js';
import { state, roleAvatarSrc } from './state.js';
import { mediaURL, saveMedia } from './media.js';
import { pickMomentSong, scheduleFriendReplies } from './momentsAI.js';

const W = 750;
const PAD = 34;
const AV = 62;
const GAP = 22;
const FS = 26;
const LH = 40;
const BPAD_X = 22;
const BPAD_Y = 18;
const MAX_BUB = 430;
const HEADER = 116;
const TIME_H = 58;
const FOOTER = 78;
const SHOT_H = 1334;   // 最短也按一屏手机的高度来截

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
const BG = '#f1f2f4';
const HEAD_BG = '#fbfbf9';
const TXT = '#1c1e22';
const TXT_DIM = '#8f9095';
const TA_BUB = '#ffffff';
const ME_BUB = '#2f3239';

/** 截最近一段聊天，发一条他视角的朋友圈 */
export async function taPostChatShot() {
  const messages = (await all('messages'))
    .filter((m) => !m.deleted && m.state !== 'recalled' && m.role !== 'sys')
    .sort((a, b) => a.ts - b.ts)
    .slice(-14);
  if (!messages.length) throw new Error('还没有可以截的聊天');

  const shot = await renderShot(messages);
  const mediaId = await saveMedia(shot.blob, { type: 'image', w: W, h: shot.h, source: 'ta', name: '聊天截图' });

  const moment = {
    id: uid(), ts: Date.now(), author: 'ta',
    text: '', mediaIds: [mediaId], audioId: null,
    song: await pickMomentSong(), shot: true,
    likes: [], comments: [], pending: {}
  };
  await put('moments', moment);
  await scheduleFriendReplies(moment);
  return moment;
}

async function renderShot(messages) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${FS}px ${FONT}`;

  const rows = messages.map((m) => {
    const mine = m.role === 'ta';   // 他的手机里，自己的消息在右边
    const lines = wrapText(ctx, preview(m), MAX_BUB - BPAD_X * 2);
    const widest = lines.reduce((w, line) => Math.max(w, ctx.measureText(line).width), 0);
    const bubbleW = Math.max(96, Math.min(MAX_BUB, widest + BPAD_X * 2));
    const bubbleH = Math.max(52, lines.length * LH + BPAD_Y * 2);
    return { m, mine, lines, bubbleW, bubbleH, h: Math.max(AV, bubbleH) };
  });

  const bodyH = rows.reduce((sum, r) => sum + r.h + GAP, 0);
  const H = Math.max(SHOT_H, HEADER + TIME_H + bodyH + FOOTER);
  /* 消息贴底排列，上面留出聊天背景，看起来才像一屏手机截图 */
  const startY = Math.max(HEADER + TIME_H, H - FOOTER - bodyH);

  canvas.width = W * 2;
  canvas.height = H * 2;
  ctx.scale(2, 2);
  ctx.font = `${FS}px ${FONT}`;

  const myAv = await loadImage(state.skin.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '');
  const taAv = await loadImage(await roleAvatarSrc());
  const taName = state.role.name || 'TA';

  /* 背景 + 顶栏 */
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = HEAD_BG;
  ctx.fillRect(0, 0, W, HEADER);
  ctx.strokeStyle = 'rgba(0,0,0,.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER - 0.5);
  ctx.lineTo(W, HEADER - 0.5);
  ctx.stroke();

  ctx.strokeStyle = TXT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(42, HEADER / 2 + 11);
  ctx.lineTo(30, HEADER / 2);
  ctx.lineTo(42, HEADER / 2 - 11);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TXT;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(taName, W / 2, HEADER / 2 - 9);
  ctx.fillStyle = TXT_DIM;
  ctx.font = `20px ${FONT}`;
  ctx.fillText(state.role.status || '在线', W / 2, HEADER / 2 + 22);

  /* 时间分隔 */
  const lastTs = messages[messages.length - 1].ts || Date.now();
  ctx.fillStyle = TXT_DIM;
  ctx.font = `22px ${FONT}`;
  ctx.fillText(shotTime(lastTs), W / 2, startY - TIME_H / 2);

  /* 消息 */
  let y = startY;
  for (const r of rows) {
    const avX = r.mine ? W - PAD - AV : PAD;
    const avY = y + (r.h - AV) / 2;
    drawAvatar(ctx, r.mine ? taAv : myAv, avX, avY, AV,
      r.mine ? taName.slice(0, 1) : '我', r.mine ? '#2f3239' : '#e2e3e7');

    const bx = r.mine ? avX - 16 - r.bubbleW : avX + AV + 16;
    const by = y + (r.h - r.bubbleH) / 2;

    roundRect(ctx, bx, by, r.bubbleW, r.bubbleH, 20);
    ctx.fillStyle = r.mine ? ME_BUB : TA_BUB;
    ctx.fill();

    ctx.fillStyle = r.mine ? '#ffffff' : TXT;
    ctx.font = `${FS}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    r.lines.forEach((line, i) => {
      ctx.fillText(line, bx + BPAD_X, by + BPAD_Y + i * LH + 2);
    });

    y += r.h + GAP;
  }

  /* 底部水印 */
  ctx.fillStyle = '#b8b8b3';
  ctx.font = `20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('字卡传信 · 聊天截图', W / 2, H - FOOTER / 2 + 4);

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('截图生成失败');
  return { blob, h: H };
}

function preview(m) {
  if (m.type === 'image') return '[图片]';
  if (m.type === 'sticker') return '[表情]';
  if (m.type === 'voice') return '[语音]';
  if (m.type === 'transfer') return `[转账 ¥${money(m.amount)}]`;
  if (m.type === 'packet') return `[红包 ¥${money(m.amount)}]`;
  return String(m.text || '');
}

const money = (n) => Number(n || 0).toFixed(2);

function shotTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function wrapText(ctx, text, maxWidth) {
  const out = [];
  let line = '';
  for (const ch of String(text)) {
    if (ch === '\n') {
      out.push(line);
      line = '';
      continue;
    }
    const test = line + ch;
    if (line && ctx.measureText(test).width > maxWidth) {
      out.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawAvatar(ctx, img, x, y, size, fallback, bg) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = bg === '#2f3239' ? '#ffffff' : '#5c6068';
    ctx.font = `600 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallback, x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
}

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}
