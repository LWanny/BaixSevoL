/* 字卡传信 · 媒体存取（图片 / 语音 / 壁纸 / 头像）
   统一以二进制 Blob 存 IndexedDB，渲染用临时 objectURL，避免 base64 膨胀与内存常驻。 */

import { put, get, del, all, count } from './store.js';
import { uid } from './util.js';

const urlCache = new Map();   // mediaId -> objectURL

export async function saveMedia(blob, meta = {}) {
  const id = meta.id || uid();
  const row = {
    id,
    type: meta.type || (blob.type.startsWith('audio') ? 'audio' : 'image'),
    mime: blob.type || 'application/octet-stream',
    size: blob.size,
    w: meta.w || 0,
    h: meta.h || 0,
    duration: meta.duration || 0,
    source: meta.source || 'me',        // me | ta | library | skin
    name: meta.name || '',
    createdAt: Date.now(),
    blob
  };
  await put('media', row);
  return id;
}

/** 只存外链地址（跨域机器不让下载时的降级方案） */
export async function saveMediaURL(url, meta = {}) {
  const id = meta.id || uid();
  const row = {
    id,
    type: meta.type || 'image',
    mime: meta.mime || '',
    size: 0,
    w: meta.w || 0,
    h: meta.h || 0,
    duration: meta.duration || 0,
    source: meta.source || 'library',
    name: meta.name || '',
    url,
    createdAt: Date.now()
  };
  await put('media', row);
  return id;
}

export async function getMedia(id) { return id ? get('media', id) : null; }

export async function mediaURL(id) {
  if (!id) return '';
  if (urlCache.has(id)) return urlCache.get(id);
  const row = await get('media', id);
  if (!row) return '';
  if (row.blob) {
    const url = URL.createObjectURL(row.blob);
    urlCache.set(id, url);
    return url;
  }
  if (row.url) { urlCache.set(id, row.url); return row.url; }
  return '';
}

export function mediaURLSync(id) { return id ? (urlCache.get(id) || '') : ''; }

export function cacheURL(id, url) { if (id) urlCache.set(id, url); }

export async function delMedia(id) {
  if (!id) return;
  const u = urlCache.get(id);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
  await del('media', id);
}

export async function allMedia() { return all('media'); }
export async function mediaCount() { return count('media'); }

/** 生成 <img>，src 稍后异步补上 */
export function imgEl(id, cls = '', alt = '') {
  const img = document.createElement('img');
  if (cls) img.className = cls;
  img.alt = alt;
  if (id) mediaURL(id).then((u) => { if (u) img.src = u; });
  return img;
}

/** 生成 <audio controls> */
export function audioEl(id) {
  const a = document.createElement('audio');
  a.controls = true;
  a.preload = 'metadata';
  if (id) mediaURL(id).then((u) => { if (u) a.src = u; });
  return a;
}

/** 读取音频时长 */
export function probeDuration(blob) {
  return new Promise((res) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => { res(Math.round(a.duration || 0)); URL.revokeObjectURL(url); };
    a.onerror = () => { res(0); URL.revokeObjectURL(url); };
    a.src = url;
  });
}
