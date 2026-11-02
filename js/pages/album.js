/* 相册 · 他的图片、他的截图，以及我导入的图片
   图片本体存在 media 表，归属信息存在 photos 表：
   { id, mediaId, owner:'ta'|'me', caption, name, ts } */

import {
  el, uid, openFile, compressImage, fmtDateTime, downloadBlob
} from '../util.js';
import { iconImg } from '../icons.js';
import { state } from '../state.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { saveMedia, mediaURL, getMedia, delMedia } from '../media.js';
import { actionSheet, confirmBox, sheet, toast, topBanner } from '../ui.js';

let view = null;
let rows = [];
let src = 'all';        // all | ta | me

export default async function pageAlbum(v, params = {}) {
  view = v;
  src = params.from === 'ta' ? 'ta' : 'all';
  fullPage({
    back: true, title: '相册', sub: '他的保存 · 他的截图 · 我导入的',
    actions: [{ label: '导入图片', onclick: chooseImport }]
  });
  await load();
}

async function load() {
  rows = (await all('photos')).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  paint();
}

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page album' });

  const taRows = rows.filter((r) => r.owner !== 'me');
  const meRows = rows.filter((r) => r.owner === 'me');

  page.appendChild(el('div', { class: 'card al-hero' }, [
    stat(taRows.length, '他的相册'),
    stat(meRows.length, '我的相册'),
    stat(rows.length, '全部图片')
  ]));

  const chips = el('div', { class: 'wt-chips' });
  [
    { key: 'all', label: '全部', n: rows.length },
    { key: 'ta', label: '他的', n: taRows.length },
    { key: 'me', label: '我的', n: meRows.length }
  ].forEach((c) => {
    chips.appendChild(el('button', {
      class: 'chip' + (src === c.key ? ' on' : ''), type: 'button',
      onclick: () => { src = c.key; paint(); }
    }, [`${c.label} ${c.n}`]));
  });
  page.appendChild(chips);

  const list = src === 'all' ? rows : rows.filter((r) => r.owner === src);
  const grid = el('div', { class: 'al-grid' });
  grid.appendChild(el('button', { class: 'al-add', type: 'button', onclick: chooseImport }, [
    iconImg('IC-MIO-022'),
    el('span', { text: '导入' })
  ]));
  list.forEach((p) => grid.appendChild(tile(p)));

  if (!list.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-015'),
      el('div', { class: 'e-h', text: rows.length ? '这一栏还没有图片' : '相册还是空的' }),
      el('div', { class: 'e-p', text: '把对方保存的图片、截图，或你手边的照片放进来' })
    ]));
    page.appendChild(grid);
  } else {
    page.appendChild(grid);
  }

  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' }, text: '图片会本地压缩后保存，不会上传' }));
  view.appendChild(page);
}

function stat(n, label) {
  return el('div', { class: 'al-stat' }, [
    el('div', { class: 'al-stat-v', text: String(n) }),
    el('div', { class: 'al-stat-l', text: label })
  ]);
}

function tile(p) {
  const cell = el('button', { class: 'al-cell', type: 'button', onclick: () => openViewer(p) });
  const img = el('img', { alt: p.caption || '相册图片', loading: 'lazy' });
  img.onerror = () => cell.classList.add('al-miss');
  mediaURL(p.mediaId).then((u) => {
    if (u) img.src = u;
    else cell.classList.add('al-miss');
  });
  cell.appendChild(img);
  cell.appendChild(el('span', { class: 'al-owner ' + (p.owner === 'me' ? 'me' : 'ta'), text: p.owner === 'me' ? '我' : '他' }));
  if (p.caption) cell.appendChild(el('span', { class: 'al-cap', text: p.caption }));
  return cell;
}

/* ---------------- 导入 ---------------- */
function chooseImport() {
  const name = state.role.name || '他';
  actionSheet('导入图片', [
    { label: `放进「他的相册」`, sub: `${name} 保存的图片、发来的截图`, icon: 'IC-MIO-015', onSelect: () => importImages('ta') },
    { label: '放进「我的相册」', sub: '我导入或保存的图片', icon: 'IC-MIO-014', onSelect: () => importImages('me') }
  ]);
}

async function importImages(owner) {
  const files = await openFile({ accept: 'image/*', multiple: true });
  if (!files || !files.length) return;
  const batch = files.slice(0, 20);
  const tip = topBanner({ icon: 'IC-MIO-010', title: '正在导入', sub: `0 / ${batch.length}` });

  let ok = 0;
  for (const f of batch) {
    let out;
    try { out = await compressImage(f, 1440, 0.86); } catch { out = { blob: f, w: 0, h: 0 }; }
    const mediaId = await saveMedia(out.blob, {
      type: 'image', w: out.w, h: out.h, source: owner, name: f.name || ''
    });
    await put('photos', {
      id: uid(), mediaId, owner, ts: Date.now(), caption: '', name: f.name || ''
    });
    ok += 1;
    tip.update({ sub: `${ok} / ${batch.length}` });
  }

  src = owner;
  await load();
  tip.close();
  toast(`已导入 ${ok} 张`);
}

/* ---------------- 大图 ---------------- */
async function openViewer(p) {
  const url = await mediaURL(p.mediaId);
  if (!url) { toast('图片已丢失'); return; }

  let overlay = null;
  const close = () => { if (overlay) overlay.remove(); overlay = null; };

  const top = el('div', { class: 'al-v-top' }, [
    el('button', { class: 'al-v-close', title: '关闭', onclick: close }, [iconImg('IC-MIO-002')]),
    el('span', { class: 'al-v-badge ' + (p.owner === 'me' ? 'me' : 'ta'), text: p.owner === 'me' ? '我的相册' : '他的相册' })
  ]);

  const capText = p.caption || '';
  const cap = capText ? el('div', { class: 'al-v-cap', text: capText }) : null;
  const meta = el('div', {
    class: 'al-v-meta',
    text: `${fmtDateTime(p.ts)} · ${p.owner === 'me' ? '我导入的' : '他保存的'}`
  });

  const acts = el('div', { class: 'al-v-acts' }, [
    el('button', { type: 'button', onclick: () => toggleOwner(p, close) }, ['改归属']),
    el('button', { type: 'button', onclick: () => editCaption(p, close) }, ['说明']),
    el('button', { type: 'button', onclick: () => saveToDevice(p) }, ['保存']),
    el('button', { class: 'danger', type: 'button', onclick: () => removePhoto(p, close) }, ['删除'])
  ]);

  const big = el('img', { src: url, alt: p.caption || '相册图片' });
  big.onerror = () => { big.replaceWith(el('div', { class: 'al-v-miss', text: '图片无法显示' })); };

  overlay = el('div', {
    class: 'al-viewer',
    onclick: (e) => { if (e.target === overlay) close(); }
  }, [
    el('div', { class: 'al-v-imgwrap' }, [big]),
    top,
    el('div', { class: 'al-v-bot' }, [cap, meta, acts])
  ]);

  document.getElementById('layer-root').appendChild(overlay);
}

async function toggleOwner(p, close) {
  p.owner = p.owner === 'me' ? 'ta' : 'me';
  await put('photos', p);
  close();
  await load();
  toast(p.owner === 'me' ? '已移到我的相册' : '已移到他的相册');
}

function editCaption(p, close) {
  const input = el('input', { class: 'input', placeholder: '给这张图写一句说明', value: p.caption || '' });
  sheet({
    title: '图片说明',
    node: el('div', { class: 'field' }, [input]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      p.caption = input.value.trim();
      await put('photos', p);
      close();
      await load();
      toast('已保存');
    } }]
  });
  setTimeout(() => input.focus(), 260);
}

async function saveToDevice(p) {
  const m = await getMedia(p.mediaId);
  if (m && m.blob) {
    const ext = (m.mime || '').includes('png') ? 'png' : 'jpg';
    const d = new Date(p.ts || Date.now());
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(m.blob, `${p.owner === 'me' ? '我的相册' : '他的相册'}-${stamp}.${ext}`);
    toast('已保存到本地');
  } else if (m && m.url) {
    window.open(m.url, '_blank');
  } else {
    toast('图片已丢失');
  }
}

async function removePhoto(p, close) {
  const yes = await confirmBox({ title: '删除图片', text: '从相册删除这张图片？删除后无法恢复。', okText: '删除', danger: true });
  if (!yes) return;
  await del('photos', p.id);
  await delMedia(p.mediaId);
  close();
  await load();
  toast('已删除');
}
