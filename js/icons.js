/* 字卡传信 · 图标注册表
   全站图标一律通过编号引用：iconUrl('IC-CHT-004')
   用户替换的记录存在 IndexedDB 的 icons 表，原 SVG 保留不删。

   注意：本模块可能因 import 路径不同（带 / 不带 ?v= 版本号）被浏览器加载成多个实例，
   因此把注册表状态挂在 globalThis 上共享，避免某个实例 meta 为空时
   iconImg 生成 .ico 但取不到 mask → 图标被 currentColor 填成黑块。 */

import { all, put, del } from './store.js';
import { mediaURL } from './media.js';

const G = (globalThis.__zcIconsState = globalThis.__zcIconsState || { meta: {}, overrides: {}, loaded: false });

export async function loadIcons() {
  const res = await fetch('assets/icons/icons.json');
  const data = await res.json();
  G.meta = {};
  data.icons.forEach((i) => { G.meta[i.id] = i; });

  const saved = await all('icons');
  for (const row of saved) {
    if (row && row.mediaId) {
      const url = await mediaURL(row.mediaId);
      if (url) G.overrides[row.id] = url;
    }
  }
  G.loaded = true;
  // 启动时扫全 DOM，给所有带 data-icon 的元素补上 --ico URL
  refreshAllIcons();
  return data;
}

/** 给所有现有 [data-icon] 元素设置 --ico；每次路由切换后也调 */
export function refreshAllIcons() {
  document.querySelectorAll('[data-icon]').forEach((node) => {
    const id = node.dataset.icon;
    if (!id) return;
    const url = iconUrl(id);
    if (node.tagName === 'IMG') {
      if (url) node.src = url;
    } else {
      node.style.setProperty('--ico', url ? `url("${url}")` : 'none');
    }
  });
}

export function isLoaded() { return G.loaded; }

export function iconUrl(id) {
  if (G.overrides[id]) return G.overrides[id];
  const m = G.meta[id];
  return m ? absolute(m.file) : '';
}

/** 把 SVG 相对路径转成绝对地址：
    自定义属性里的 url() 会按样式表所在目录解析（如 /css/），必须转绝对路径才不会 404。 */
function absolute(path) {
  if (!path || /^(https?:|blob:|data:|\/)/.test(path)) return path;
  try { return new URL(path, document.baseURI).href; } catch { return path; }
}

export function iconMeta(id) { return G.meta[id] || null; }

export function iconList(filter = null) {
  const arr = Object.values(G.meta);
  return filter ? arr.filter(filter) : arr;
}

export function iconIds() { return Object.keys(G.meta); }

export function isReplaced(id) { return !!G.overrides[id]; }

/**
 * 生成图标元素。
 * 默认图标是线稿 SVG，用 CSS mask + currentColor 上色，因此会跟随文字颜色与主题变化；
 * 用户替换成自己的图片时，直接以 <img> 原样显示。
 * 若注册表还没加载（meta 为空），返回的 .ico 会遮蔽自己，避免短暂显示成黑块。
 */
export function iconImg(id, cls = '', alt = '') {
  const label = alt || (G.meta[id]?.name || id);
  const url = iconUrl(id);
  if (isReplaced(id) && url) return makeImg(id, cls, label, url);
  return makeIco(id, cls, label, url);
}

function makeIco(id, cls, label, url) {
  const span = document.createElement('span');
  span.className = 'ico' + (cls ? ' ' + cls : '');
  span.dataset.icon = id;
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', label);
  // 有 URL 就设 mask；没有则先隐藏，等 refreshAllIcons 补上，避免渲染成实心黑块
  if (url) span.style.setProperty('--ico', `url("${url}")`);
  else span.style.visibility = 'hidden';
  return span;
}

function makeImg(id, cls, label, url) {
  const img = document.createElement('img');
  img.className = 'ico-img' + (cls ? ' ' + cls : '');
  img.dataset.icon = id;
  img.alt = label;
  img.src = url;
  return img;
}

/** 替换 / 还原后，就地刷新页面上所有引用该编号的图标 */
function refreshIcon(id) {
  const url = iconUrl(id);
  const replaced = isReplaced(id) && url;
  document.querySelectorAll(`[data-icon="${id}"]`).forEach((node) => {
    if (node.tagName === 'IMG') {
      if (replaced) { node.src = url; return; }
      const next = makeIco(id, '', node.alt || id, url);
      next.className = node.className.replace(/\bico-img\b/g, 'ico').trim() || 'ico';
      node.replaceWith(next);
      return;
    }
    if (replaced) {
      const next = makeImg(id, '', node.getAttribute('aria-label') || id, url);
      next.className = node.className.replace(/\bico\b/g, 'ico-img').trim() || 'ico-img';
      node.replaceWith(next);
    } else {
      node.style.visibility = '';
      node.style.setProperty('--ico', `url("${url}")`);
    }
  });
}

/** 替换图标 */
export async function replaceIcon(id, mediaId) {
  await put('icons', { id, mediaId, replaced: true, ts: Date.now() });
  G.overrides[id] = await mediaURL(mediaId);
  refreshIcon(id);
}

/** 还原默认 */
export async function restoreIcon(id) {
  await del('icons', id);
  delete G.overrides[id];
  refreshIcon(id);
}
