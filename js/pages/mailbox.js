/* 信箱页 · 收到的信 / 寄出的信
   独立于聊天：这里是一封封往来书信。收到的信由 TA 写来（字卡拼句），
   寄出的信由我自由书写（可附图）。写信后 TA 会按信箱参数回信。 */

import { el, fmtDay, compressImage, openFile } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { state, roleAvatarSrc } from '../state.js';
import { mediaURL, saveMedia } from '../media.js';
import { sheet, confirmBox, toast } from '../ui.js';
import * as mail from '../letters.js';

let cleanups = [];

export default async function pageMailbox(view) {
  cleanup();
  window.addEventListener('hashchange', cleanup, { once: true });

  fullPage({
    back: true,
    title: '信箱',
    actions: [{ icon: 'IC-MIO-022', label: '写一封信', onclick: () => openCompose() }]
  });

  const avSrc = await roleAvatarSrc();
  let tab = 'in';                       // 'in' 收到的信 | 'out' 寄出的信
  let letters = await mail.allLetters();

  const segIn = segBtn('in', '收到的信');
  const segOut = segBtn('out', '寄出的信');
  const tabs = el('div', { class: 'mail-tabs' }, [segIn, segOut]);
  const writingBar = el('div', { class: 'mail-writing hidden' }, [
    el('i'), el('i'), el('i'),
    el('span', { text: (state.role.name || 'TA') + ' 正在写信…' })
  ]);
  const list = el('div', { class: 'mail-list' });
  view.appendChild(el('div', { class: 'page mailbox' }, [tabs, writingBar, list]));

  function segBtn(key, label) {
    return el('button', { class: 'mail-tab' + (key === tab ? ' on' : ''), onclick: () => { tab = key; paintTabs(); render(); } }, [label]);
  }
  function paintTabs() {
    segIn.classList.toggle('on', tab === 'in');
    segOut.classList.toggle('on', tab === 'out');
  }

  function render() {
    list.innerHTML = '';
    const items = letters.filter((l) => l.dir === tab);
    if (!items.length) {
      list.appendChild(el('div', { class: 'mail-empty' }, [
        el('div', { class: 'e-h', text: tab === 'in' ? '还没有收到信' : '还没有寄出信' }),
        el('div', { class: 'e-p', text: tab === 'in' ? 'TA 写来的信会出现在这里' : '点右上角「写一封信」，给 TA 写第一封信' })
      ]));
      return;
    }
    items.forEach((l) => list.appendChild(rowNode(l)));
  }

  function rowNode(l) {
    const mine = l.dir === 'out';
    const av = el('div', { class: 'mail-av' });
    if (mine) av.appendChild(document.createTextNode('我'));
    else if (avSrc) av.appendChild(el('img', { src: avSrc }));
    else av.appendChild(document.createTextNode((state.role.name || 'TA').slice(0, 1)));
    const preview = (l.text || '[图片]').slice(0, 44);
    return el('div', { class: 'mail-row' + (!l.read && !mine ? ' unread' : ''), onclick: () => openDetail(l) }, [
      av,
      el('div', { class: 'mail-main' }, [
        el('div', { class: 'mail-top' }, [
          el('span', { class: 'mail-name', text: mine ? '我' : (state.role.name || 'TA') }),
          l.proactive ? el('span', { class: 'mail-tag', text: '主动来信' }) : null,
          el('span', { class: 'mail-time', text: fmtDay(l.ts) })
        ]),
        el('div', { class: 'mail-prev', text: preview })
      ]),
      (!l.read && !mine) ? el('span', { class: 'mail-dot' }) : null
    ]);
  }

  /* 一封信详情 → 独立信纸页 */
  async function openDetail(l) {
    if (l.dir === 'in' && !l.read) {
      l = (await mail.updateLetter(l.id, { read: true })) || l;
      letters = letters.map((x) => (x.id === l.id ? l : x));
      render();
    }
    go('/mail?id=' + l.id);
  }

  /* 写一封信 → 独立信纸页 */
  function openCompose() {
    go('/compose');
  }

  async function viewImage(mediaId) {
    const url = await mediaURL(mediaId);
    if (!url) return;
    const mask = el('div', { style: {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.92)', zIndex: '80',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px'
    } }, [el('img', { src: url, style: { maxWidth: '100%', maxHeight: '100%', borderRadius: '10px' } })]);
    mask.onclick = () => mask.remove();
    document.getElementById('layer-root').appendChild(mask);
  }

  /* 事件订阅：新信 / 更新 / 删除 */
  const refresh = async () => { letters = await mail.allLetters(); render(); };
  const onWriting = (e) => writingBar.classList.toggle('hidden', !e.detail);
  mail.on('letter', refresh);
  mail.on('letter-updated', refresh);
  mail.on('letter-removed', refresh);
  mail.on('writing', onWriting);
  cleanups.push(() => {
    mail.off('letter', refresh);
    mail.off('letter-updated', refresh);
    mail.off('letter-removed', refresh);
    mail.off('writing', onWriting);
  });

  render();
}

function cleanup() {
  cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
  cleanups = [];
}
