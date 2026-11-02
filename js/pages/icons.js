/* 图标素材库 · 浏览 / 搜索 / 替换 / 还原
   全站图标一律以编号引用（IC-<分类>-<序号>），原 SVG 存于 assets/icons，
   用户替换记录存 IndexedDB 的 icons 表，原线稿保留不删，可随时还原。 */

import { el, debounce, openFile, compressImage } from '../util.js';
import { iconImg, iconList, isReplaced, replaceIcon, restoreIcon } from '../icons.js';
import { normalPage } from '../shell.js';
import { saveMedia } from '../media.js';
import { actionSheet, confirmBox, alertBox, toast } from '../ui.js';

const CATEGORIES = [
  { code: 'ALL', name: '全部' },
  { code: 'NAV', name: '导航' },
  { code: 'CHT', name: '聊天' },
  { code: 'CRD', name: '字卡库' },
  { code: 'MOM', name: '朋友圈' },
  { code: 'DIV', name: '占卜' },
  { code: 'MOD', name: '情绪态度' },
  { code: 'MIO', name: '通用' }
];

let view = null;
let gridBox = null;
let countEl = null;
let keyword = '';
let activeCat = 'ALL';

export default async function pageIcons(v) {
  view = v;
  normalPage('me', { back: true, title: '图标素材库', sub: '全站图标按编号引用' });
  render();
}

function render() {
  view.innerHTML = '';
  const wrap = el('div', { class: 'page' });

  /* ---- 搜索与分类 ---- */
  const search = el('input', { class: 'input', placeholder: '按编号或名称查找，如 IC-CHT / 表情', value: keyword });
  search.addEventListener('input', debounce(() => { keyword = search.value.trim(); paintGrid(); }, 160));

  const chips = el('div', { class: 'row wrap', style: { gap: '7px', marginTop: '10px' } },
    CATEGORIES.map((c) => el('span', {
      class: 'chip' + (activeCat === c.code ? ' on' : ''),
      text: c.name,
      onclick: () => { activeCat = c.code; render(); }
    })));

  wrap.appendChild(el('div', { class: 'card' }, [search, chips]));

  /* ---- 说明 ---- */
  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px' } }, [
      iconImg('IC-MIO-015'),
      el('div', { class: 'small muted', text: '全站禁止用 Emoji 充当图标。默认图标是线稿 SVG，会跟随文字颜色与主题自动变色；替换成图片后按原样显示。任何位置只需认准编号即可找到对应图标。' })
    ])
  ]));

  /* ---- 网格 ---- */
  countEl = el('div', { class: 'a', text: '' });
  gridBox = el('div', { class: 'ico-grid' });

  wrap.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '编号总表' }), countEl]),
    gridBox
  ]));

  view.appendChild(wrap);
  paintGrid();
}

function filtered() {
  const kw = keyword.toLowerCase();
  return iconList((m) => {
    if (activeCat !== 'ALL' && m.category !== activeCat) return false;
    if (!kw) return true;
    return `${m.id} ${m.name} ${m.desc || ''}`.toLowerCase().includes(kw);
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
}

function paintGrid() {
  if (!gridBox) return;
  gridBox.innerHTML = '';
  const list = filtered();
  const replaced = iconList((m) => isReplaced(m.id)).length;
  if (countEl) countEl.textContent = `${list.length} 个 · 已替换 ${replaced} 个`;

  if (!list.length) {
    gridBox.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-CRD-010'),
      el('div', { class: 'e-h', text: '没有找到匹配的图标' }),
      el('div', { class: 'e-p', text: '换个编号或名称再试试。' })
    ]));
    return;
  }
  list.forEach((m) => gridBox.appendChild(cell(m)));
}

function cell(m) {
  const replaced = isReplaced(m.id);
  const node = el('div', {
    class: 'ico-cell',
    style: replaced ? { borderColor: 'var(--accent)' } : {},
    onclick: () => menu(m)
  }, [
    iconImg(m.id, '', m.name),
    el('span', { class: 'nm', text: m.name }),
    el('span', { class: 'id', text: m.id }),
    replaced ? el('span', { class: 'id', style: { color: 'var(--accent-2)' }, text: '已替换' }) : null
  ]);
  return node;
}

/* ---------------- 操作 ---------------- */
function menu(m) {
  const replaced = isReplaced(m.id);
  actionSheet(`${m.id} · ${m.name}`, [
    { label: '替换为我的图片', sub: '上传一张图，全站该编号立即生效', icon: 'IC-MIO-010', onSelect: () => doReplace(m.id) },
    replaced ? { label: '还原默认图标', sub: '恢复为内置线稿 SVG', icon: 'IC-MIO-011', onSelect: () => doRestore(m.id) } : null,
    { label: '复制编号', sub: m.id, icon: 'IC-CRD-012', onSelect: () => copyId(m.id) }
  ].filter(Boolean));
}

async function doReplace(id) {
  const f = await openFile({ accept: 'image/*' });
  if (!f) return;
  const { blob } = await compressImage(f, 256, 0.9);
  const mediaId = await saveMedia(blob, { type: 'image', source: 'icon', name: id });
  await replaceIcon(id, mediaId);
  paintGrid();
  toast(`已替换 ${id}`);
}

async function doRestore(id) {
  const yes = await confirmBox({
    title: '还原默认图标',
    text: `将把 ${id} 恢复为内置线稿图标，你上传的图片仍保留在本地媒体里。`
  });
  if (!yes) return;
  await restoreIcon(id);
  paintGrid();
  toast('已还原默认');
}

async function copyId(id) {
  try {
    await navigator.clipboard.writeText(id);
    toast(`已复制 ${id}`);
  } catch {
    alertBox({ title: '编号', text: id });
  }
}
