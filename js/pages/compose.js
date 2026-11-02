/* 写信页 · 独立路由 /compose
   白纸信纸（可换导入的信纸）：左上「致 TA：」，右下日期 + 我的名字，底部「寄出」。 */

import { el, compressImage, openFile } from '../util.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { state } from '../state.js';
import { mediaURL, saveMedia } from '../media.js';
import { toast } from '../ui.js';
import * as mail from '../letters.js';
import { openPaperPicker, paintPaper } from '../letterpaper.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function fmtNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} 星期${WEEK[d.getDay()]}`;
}

export default async function pageCompose(view) {
  const taName = state.role.name || 'TA';
  const myName = state.settings.myName || '我';
  const imageIds = [];
  let paperId = null;

  const dateNow = fmtNow();

  const ta = el('textarea', {
    class: 'letter-input',
    placeholder: '写点什么…',
    rows: '8',
    maxlength: '2000'
  });
  const thumbs = el('div', { class: 'letter-thumbs' });

  const paper = el('div', { class: 'letter-paper' });
  await paintPaper(paper, paperId);

  const content = el('div', { class: 'letter-content' }, [
    el('div', { class: 'letter-to', text: taName }),
    el('div', { class: 'letter-body compose' }, [ta, thumbs]),
    el('div', { class: 'letter-foot' }, [
      el('div', { class: 'letter-date-bottom', text: dateNow }),
      el('div', { class: 'letter-sign', text: myName })
    ])
  ]);
  paper.appendChild(content);

  fullPage({
    back: true,
    title: '写一封信',
    actions: [{ icon: 'IC-MIO-007', label: '信纸', onclick: () => openPaperPicker({
      currentId: paperId,
      onPick: async (pid) => {
        paperId = pid;
        await paintPaper(paper, pid);
      }
    }) }]
  });

  /* 底部按钮：添加图片 + 寄出 */
  const addImgBtn = el('button', { class: 'btn', style: { flex: '0 0 auto' }, onclick: async () => {
    const files = await openFile({ accept: 'image/*', multiple: true });
    if (!files || !files.length) return;
    for (const f of files) {
      const { blob, w, h } = await compressImage(f, 1080);
      const id = await saveMedia(blob, { type: 'image', w, h, source: 'letter' });
      imageIds.push(id);
      const img = el('img', { alt: '图片' });
      mediaURL(id).then((u) => { if (u) img.src = u; });
      thumbs.appendChild(img);
    }
  } }, ['添加图片']);

  const sendBtn = el('button', { class: 'btn primary', onclick: doSend }, ['寄出']);

  const actions = el('div', { class: 'letter-actions' }, [addImgBtn, sendBtn]);

  async function doSend() {
    const text = ta.value.trim();
    if (!text && !imageIds.length) { toast('写点什么再寄吧'); return; }
    await mail.sendMyLetter({ text, images: imageIds, paperId });
    toast('已寄出');
    go('/mailbox');
  }

  view.appendChild(el('div', { class: 'letter-page' }, [paper, actions]));
}
