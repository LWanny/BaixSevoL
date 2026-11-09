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
let viewerList = [];    // 大图查看器的左右滑动列表（paint 时更新）

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|jfif)$/i;
const VID_RE = /\.(mov|mp4|m4v|webm|3gp|mkv|avi)$/i;
/* 实况图配对：IMG_1234.jpg 与 IMG_1234.MOV（含 -LIVE 后缀）算同名 */
const baseOf = (name) => String(name || '').replace(/\.[^.]+$/, '').replace(/[-_ ]?(live|实况)$/i, '');
const isVideoFile = (f) => (f.type || '').startsWith('video/') || (!f.type && VID_RE.test(f.name));
const isImageFile = (f) => (f.type || '').startsWith('image/') || (!f.type && IMG_RE.test(f.name));
const isVideoRow = async (p) => {
  if (p.isVideo) return true;
  const m = await getMedia(p.mediaId);
  return !!m && (m.type === 'video' || (m.mime || '').startsWith('video'));
};

export default async function pageAlbum(v, params = {}) {
  view = v;
  src = params.from === 'ta' ? 'ta' : 'all';
  fullPage({
    back: true, title: '相册', sub: '他的保存 · 他的截图 · 我导入的 · 视频/实况',
    actions: [{ label: '导入', onclick: chooseImport }]
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
  viewerList = list;      // 供大图查看器左右/滑动切换
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
  mediaURL(p.mediaId).then(async (u) => {
    if (!u) { cell.classList.add('al-miss'); return; }
    if (await isVideoRow(p)) {
      /* 视频缩略图：首帧 + 角标 */
      const v = el('video', { class: 'al-thumb', src: u, muted: true, preload: 'metadata', playsinline: true });
      v.onerror = () => cell.classList.add('al-miss');
      img.replaceWith(v);
      cell.appendChild(el('span', { class: 'al-badge vid', text: '▶ 视频' }));
    } else {
      img.src = u;
    }
  });
  cell.appendChild(img);
  cell.appendChild(el('span', { class: 'al-owner ' + (p.owner === 'me' ? 'me' : 'ta'), text: p.owner === 'me' ? '我' : '他' }));
  if (p.videoId) cell.appendChild(el('span', { class: 'al-badge live', text: '◎ 实况' }));
  if (p.caption) cell.appendChild(el('span', { class: 'al-cap', text: p.caption }));
  return cell;
}

/* ---------------- 导入 ---------------- */
function chooseImport() {
  const name = state.role.name || '他';
  actionSheet('导入（图片 / 视频 / 实况图）', [
    { label: `放进「他的相册」`, sub: `${name} 保存的图片、截图、视频（同名图片+视频会配成实况）`, icon: 'IC-MIO-015', onSelect: () => importImages('ta') },
    { label: '放进「我的相册」', sub: '我导入或保存的图片、视频', icon: 'IC-MIO-014', onSelect: () => importImages('me') }
  ]);
}

async function importImages(owner) {
  const files = await openFile({ accept: 'image/*,video/*', multiple: true });
  if (!files || !files.length) return;
  const batch = files.slice(0, 30);
  const imgs = batch.filter(isImageFile);
  const vids = batch.filter(isVideoFile);
  if (!imgs.length && !vids.length) { toast('没有可导入的图片或视频'); return; }
  const tip = topBanner({ icon: 'IC-MIO-010', title: '正在导入', sub: `0 / ${batch.length}` });

  /* 实况图 = 照片 + 同名视频（一次选中时自动配对） */
  const vidByBase = new Map();
  for (const v of vids) { const b = baseOf(v.name); if (!vidByBase.has(b)) vidByBase.set(b, v); }
  const usedVid = new Set();
  let ok = 0, liveN = 0, vidN = 0;

  for (const f of imgs) {
    let out;
    try { out = await compressImage(f, 1440, 0.86); } catch { out = { blob: f, w: 0, h: 0 }; }
    const mediaId = await saveMedia(out.blob, {
      type: 'image', w: out.w, h: out.h, source: owner, name: f.name || ''
    });
    let videoId = null;
    const v = vidByBase.get(baseOf(f.name));
    if (v && !usedVid.has(v)) {
      try {
        videoId = await saveMedia(v, { type: 'video', source: owner, name: v.name || '' });
        usedVid.add(v); liveN += 1;
      } catch { /* 视频没存上就当普通照片 */ }
    }
    await put('photos', {
      id: uid(), mediaId, videoId, owner, ts: Date.now(), caption: '', name: f.name || ''
    });
    ok += 1;
    tip.update({ sub: `${ok} / ${batch.length}` });
  }

  for (const v of vids) {                 // 没有同名照片的视频 → 独立的视频条目
    if (usedVid.has(v)) continue;
    let mediaId;
    try { mediaId = await saveMedia(v, { type: 'video', source: owner, name: v.name || '' }); } catch { continue; }
    await put('photos', {
      id: uid(), mediaId, owner, ts: Date.now(), caption: '', isVideo: true, name: v.name || ''
    });
    ok += 1; vidN += 1;
    tip.update({ sub: `${ok} / ${batch.length}` });
  }

  src = owner;
  await load();
  tip.close();
  toast(`已导入 ${ok} 项${liveN ? `（含 ${liveN} 张实况）` : ''}${vidN ? `（${vidN} 个视频）` : ''}`);
}

/* ---------------- 大图：左右按钮 + 触摸滑动 + 键盘 ←→ 切换 ---------------- */
async function openViewer(p) {
  if (!viewerList.length) return;
  let idx = viewerList.findIndex((x) => x.id === p.id);
  if (idx < 0) idx = 0;
  const cur = () => viewerList[idx];
  let overlay = null;
  let seq = 0;                       // 渲染序号：快速切换时丢弃过期的异步结果
  let tX = 0, tY = 0;

  const close = () => {
    if (overlay) overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', keyH);
  };
  const keyH = (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Escape') close();
  };

  const badge = el('span', { class: 'al-v-badge' });
  const count = el('span', { class: 'al-v-count' });
  const top = el('div', { class: 'al-v-top' }, [
    el('button', { class: 'al-v-close', title: '关闭', onclick: close }, [iconImg('IC-MIO-002')]),
    badge, count
  ]);

  const cap = el('div', { class: 'al-v-cap' });
  const meta = el('div', { class: 'al-v-meta' });
  const acts = el('div', { class: 'al-v-acts' }, [
    el('button', { type: 'button', onclick: () => toggleOwner(cur(), close) }, ['改归属']),
    el('button', { type: 'button', onclick: () => editCaption(cur(), close) }, ['说明']),
    el('button', { type: 'button', onclick: () => saveToDevice(cur()) }, ['保存']),
    el('button', { class: 'danger', type: 'button', onclick: () => removePhoto(cur(), close) }, ['删除'])
  ]);

  const imgwrap = el('div', { class: 'al-v-imgwrap' });
  const btnPrev = el('button', { class: 'al-v-nav prev', title: '上一张', onclick: () => step(-1) }, ['‹']);
  const btnNext = el('button', { class: 'al-v-nav next', title: '下一张', onclick: () => step(1) }, ['›']);

  overlay = el('div', {
    class: 'al-viewer',
    onclick: (e) => { if (e.target === overlay) close(); }
  }, [
    imgwrap, top, btnPrev, btnNext,
    el('div', { class: 'al-v-bot' }, [cap, meta, acts])
  ]);

  /* 触摸滑动：横向位移 > 50px 切换上一张/下一张 */
  overlay.addEventListener('touchstart', (e) => { const t = e.touches[0]; tX = t.clientX; tY = t.clientY; }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - tX, dy = t.clientY - tY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.getElementById('layer-root').appendChild(overlay);
  document.addEventListener('keydown', keyH);

  function step(d) {
    if (viewerList.length < 2) return;
    render(idx + d);
  }

  async function render(i) {
    const n = viewerList.length;
    const my = ++seq;
    idx = ((i % n) + n) % n;
    const photo = cur();
    const url = await mediaURL(photo.mediaId);
    if (my !== seq || !overlay) return;

    badge.className = 'al-v-badge ' + (photo.owner === 'me' ? 'me' : 'ta');
    badge.textContent = photo.owner === 'me' ? '我的相册' : '他的相册';
    count.textContent = n > 1 ? `${idx + 1} / ${n}` : '';
    btnPrev.style.display = btnNext.style.display = n > 1 ? '' : 'none';
    cap.textContent = photo.caption || '';
    cap.style.display = photo.caption ? '' : 'none';
    meta.textContent = `${fmtDateTime(photo.ts)} · ${photo.owner === 'me' ? '我导入的' : '他保存的'}`;

    if (!url) { imgwrap.replaceChildren(el('div', { class: 'al-v-miss', text: '图片已丢失' })); return; }

    const vid = await isVideoRow(photo);
    if (my !== seq || !overlay) return;

    if (vid) {
      /* 视频：内联播放器 */
      const v = el('video', { class: 'al-v-media', src: url, controls: true, autoplay: true, playsinline: true });
      v.onerror = () => v.replaceWith(el('div', { class: 'al-v-miss', text: '视频无法播放' }));
      imgwrap.replaceChildren(v);
      meta.textContent += ' · 视频';
      return;
    }

    const big = el('img', { class: 'al-v-media', src: url, alt: photo.caption || '相册图片' });
    big.onerror = () => big.replaceWith(el('div', { class: 'al-v-miss', text: '图片无法显示' }));

    if (!photo.videoId) { imgwrap.replaceChildren(big); return; }

    /* 实况图：默认静态图，点「实况」按钮播放同名视频片段 */
    const vUrl = await mediaURL(photo.videoId);
    if (my !== seq || !overlay) return;
    if (!vUrl) { imgwrap.replaceChildren(big); return; }
    const vd = el('video', { class: 'al-v-livevid', src: vUrl, muted: true, loop: true, playsinline: true, preload: 'metadata' });
    const liveBtn = el('button', { class: 'al-v-live', text: '◎ 实况 · 点按播放' });
    liveBtn.onclick = (e) => {
      e.stopPropagation();
      if (liveBtn.classList.toggle('on')) {
        vd.currentTime = 0; vd.play().catch(() => {});
        liveBtn.textContent = '■ 实况 · 看静态图';
      } else {
        vd.pause();
        liveBtn.textContent = '◎ 实况 · 点按播放';
      }
    };
    imgwrap.replaceChildren(big, vd, liveBtn);
    meta.textContent += ' · 实况';
  }

  await render(idx);
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
    const mime = m.mime || '';
    const ext = mime.includes('png') ? 'png'
      : mime.includes('gif') ? 'gif'
      : mime.includes('webm') ? 'webm'
      : mime.includes('mp4') ? 'mp4'
      : (mime.includes('quicktime') || mime.includes('mov')) ? 'mov'
      : mime.startsWith('video') ? 'mp4' : 'jpg';
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
