/* 信件详情页（独立路由 /mail/:id）
   白纸信纸（可换导入的信纸）：左上「致 XXX：」，右下日期 + 署名。
   收信（dir:in）：收藏 / 回信 / 删除
   寄信（dir:out）：收藏 / 删除 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { state } from '../state.js';
import { go } from '../router.js';
import { mediaURL } from '../media.js';
import { toast, confirmBox } from '../ui.js';
import * as mail from '../letters.js';
import { openPaperPicker, paintPaper } from '../letterpaper.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function fmtLetterDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} 星期${WEEK[d.getDay()]}`;
}

async function findLetter(id) {
  const allList = await mail.allLetters();
  return allList.find((l) => l.id === id) || null;
}

export default async function pageLetter(view, params) {
  const id = params && params.id;
  if (!id) { go('/mailbox'); return; }

  const letter = await findLetter(id);
  if (!letter) {
    fullPage({ back: true, title: '信件' });
    view.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'e-h', text: '这封信找不到了' }),
      el('div', { class: 'e-p', text: '可能已被删除，或数据被清空。' }),
      el('button', { class: 'btn sm', style: { marginTop: '14px' }, onclick: () => go('/mailbox') }, ['回到信箱'])
    ]));
    return;
  }

  const isIn = letter.dir === 'in';
  const taName = state.role.name || 'TA';
  const myName = state.settings.myName || '我';
  const toName = isIn ? myName : taName;      // 收信：致我；寄信：致 TA
  const fromName = isIn ? taName : myName;    // 署名是寄信人
  let paperId = letter.paperId || null;

  fullPage({
    back: true,
    title: isIn ? `${taName} 的来信` : '已寄出的信',
    actions: [{ icon: 'IC-MIO-007', label: '信纸', onclick: () => openPaperPicker({
      currentId: paperId,
      onPick: async (pid) => {
        paperId = pid;
        await mail.updateLetter(letter.id, { paperId: pid });
        await paintPaper(paper, pid);
      }
    }) }]
  });

  /* 信纸 */
  const paper = el('div', { class: 'letter-paper' });
  await paintPaper(paper, paperId);

  const content = el('div', { class: 'letter-content' }, [
    el('div', { class: 'letter-to', text: toName }),
    letter.text ? el('div', { class: 'letter-body', text: letter.text }) : null,
    ...(letter.images || []).map((mid) => {
      const img = el('img', { alt: '图片' });
      mediaURL(mid).then((u) => { if (u) img.src = u; });
      img.onclick = () => viewImage(mid);
      return img;
    }),
    el('div', { class: 'letter-foot' }, [
      el('div', { class: 'letter-date-bottom', text: fmtLetterDate(letter.ts) }),
      el('div', { class: 'letter-sign', text: fromName })
    ])
  ]);
  paper.appendChild(content);

  /* 底部按钮 */
  let fav = !!letter.fav;
  const favBtn = el('button', { class: 'btn' + (fav ? ' primary' : ''), onclick: async () => {
    fav = !fav;
    await mail.updateLetter(letter.id, { fav });
    favBtn.textContent = fav ? '已收藏' : '收藏';
    favBtn.classList.toggle('primary', fav);
    toast(fav ? '已收藏' : '已取消收藏');
  } }, [fav ? '已收藏' : '收藏']);

  const delBtn = el('button', { class: 'btn', onclick: async () => {
    const yes = await confirmBox({ title: '删除这封信', text: '删除后无法恢复。', okText: '删除', danger: true });
    if (!yes) return;
    await mail.removeLetter(letter.id);
    toast('已删除');
    go('/mailbox');
  } }, ['删除']);

  const replyBtn = isIn
    ? el('button', { class: 'btn primary', onclick: () => go('/compose') }, ['回信'])
    : null;

  const actions = el('div', { class: 'letter-actions' }, [favBtn, replyBtn, delBtn].filter(Boolean));

  view.appendChild(el('div', { class: 'letter-page' }, [paper, actions]));
}

function viewImage(mediaId) {
  mediaURL(mediaId).then((u) => {
    if (!u) return;
    const mask = el('div', { class: 'img-viewer', onclick: (e) => { if (e.target === mask) mask.remove(); } }, [
      el('img', { src: u })
    ]);
    document.getElementById('layer-root').appendChild(mask);
  });
}
