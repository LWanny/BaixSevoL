/* 链接批量导入：一次粘贴多条 http(s) 直链，逐条下载后存进本地
   支持 表情包 / 音乐 / 图片素材 / 音频 四类。
   跨域站点拿不到二进制时，降级成「外链」保存（联网时仍可显示 / 播放）。 */

import { el, uid, compressImage } from './util.js';
import { saveMedia, saveMediaURL, probeDuration } from './media.js';
import { all, put } from './store.js';
import { sheet, toast } from './ui.js';

const KINDS = {
  sticker: { label: '表情包', accept: 'image' },
  image: { label: '图片素材', accept: 'image' },
  song: { label: '音乐', accept: 'audio' },
  audio: { label: '音频', accept: 'audio' }
};

/** 拆链接：换行 / 空格 / 逗号 / 分号都算分隔符，只留 http(s) 并去重 */
export function parseLinks(text) {
  const out = [];
  String(text || '').split(/[\s,，;；]+/).forEach((s) => {
    const v = s.trim();
    if (!/^https?:\/\//i.test(v)) return;
    if (!out.includes(v)) out.push(v);
  });
  return out;
}

function nameFromURL(url) {
  try {
    const u = new URL(url);
    const seg = decodeURIComponent((u.pathname.split('/').pop() || '')).replace(/\.[a-z0-9]+$/i, '');
    return seg || u.hostname;
  } catch { return '素材'; }
}

/** 同源链接改走相对路径：既省一次 CORS，也避免被浏览器当成跨域请求拦掉 */
function fetchTarget(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return u.pathname + u.search;
  } catch { /* 非法 URL 交给 fetch 报错 */ }
  return url;
}

async function fetchBlob(url) {
  let res;
  try {
    // same-origin：同源请求带上 cookie（有些站点要登录态才给文件），跨域不带
    res = await fetch(fetchTarget(url), { mode: 'cors', credentials: 'same-origin' });
  } catch (e) {
    // 跨域被拦 / 网络不通：可以降级为外链
    const err = new Error('跨域或网络被拦：' + (e.message || e));
    err.crossOrigin = true;
    throw err;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);   // 服务器明确拒绝 → 算失败
  const blob = await res.blob();
  if (!blob || !blob.size) throw new Error('空文件');
  return blob;
}

/* ---------------- 单条导入 ---------------- */
async function importImage(kind, url) {
  const source = kind === 'sticker' ? 'library' : 'me';
  const name = nameFromURL(url);
  try {
    const blob = await fetchBlob(url);
    if (blob.type && !blob.type.startsWith('image/')) throw new Error('不是图片');
    const max = kind === 'sticker' ? 480 : 1080;
    const out = await compressImage(blob, max, 0.9);
    await saveMedia(out.blob, { type: 'image', w: out.w, h: out.h, source, name });
    return 'ok';
  } catch (e) {
    if (!e.crossOrigin) throw e;          // 404 / 不是图片 → 直接算失败
    await saveMediaURL(url, { type: 'image', source, name });
    return 'link';
  }
}

async function importAudio(kind, url) {
  const name = nameFromURL(url);
  if (kind === 'song') {
    const songs = await all('songs');
    if (songs.some((s) => s.url === url)) return 'skip';
  }
  try {
    const raw = await fetchBlob(url);
    const type = raw.type && raw.type !== 'application/octet-stream' ? raw.type : 'audio/mpeg';
    if (!/^audio\//.test(type) && !/^video\//.test(type)) throw new Error('不是音频');
    const blob = new Blob([raw], { type });
    const duration = await probeDuration(blob);
    const mediaId = await saveMedia(blob, { type: 'audio', name, duration, source: 'me' });
    if (kind === 'song') {
      await put('songs', { id: uid(), title: name, artist: '', mediaId, duration, addedBy: 'me', ts: Date.now() });
    }
    return 'ok';
  } catch (e) {
    if (!e.crossOrigin) throw e;          // 404 / 不是音频 → 直接算失败
    if (kind === 'song') {
      await put('songs', { id: uid(), title: name, artist: '', url, addedBy: 'me', ts: Date.now() });
    } else {
      await saveMediaURL(url, { type: 'audio', source: 'me', name });
    }
    return 'link';
  }
}

async function importOne(kind, url) {
  return KINDS[kind].accept === 'image' ? importImage(kind, url) : importAudio(kind, url);
}

/* ---------------- 界面 ---------------- */
export function openBulkImport(kind = 'sticker', { onDone = null } = {}) {
  const meta = KINDS[kind] || KINDS.sticker;
  const ta = el('textarea', {
    class: 'input', rows: 7,
    placeholder: '每行一个链接，也可以直接一大段粘贴\nhttps://…/a.png\nhttps://…/b.png'
  });
  const list = el('div', { class: 'bulk-list' });
  const sum = el('div', { class: 'small muted', style: { marginTop: '8px' }, text: '支持 http(s) 直链。跨域站点下载不到文件时会存成外链，联网时照样能显示 / 播放。' });
  const btn = el('button', { class: 'btn block primary', style: { marginTop: '10px' } }, [`开始导入${meta.label}`]);

  const node = el('div', {}, [ta, btn, list, sum]);
  const ctl = sheet({ title: '批量导入' + meta.label, node });
  // 切换页面时收掉弹层，避免残留在别的页面上
  window.addEventListener('hashchange', () => ctl.close(), { once: true });

  btn.onclick = async () => {
    const links = parseLinks(ta.value);
    if (!links.length) { toast('先粘贴几条 http(s) 链接'); return; }
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '导入中…';
    list.innerHTML = '';

    let ok = 0, fallback = 0, fail = 0, skip = 0;
    for (let i = 0; i < links.length; i++) {
      const url = links[i];
      const st = el('span', { class: 'st', text: '…' });
      list.appendChild(el('div', { class: 'bulk-row' }, [
        el('span', { class: 'idx', text: `${i + 1}/${links.length}` }),
        el('span', { class: 'u ellipsis', text: url }),
        st
      ]));
      list.scrollTop = list.scrollHeight;
      try {
        const r = await importOne(kind, url);
        if (r === 'ok') { ok++; st.textContent = '已保存'; st.classList.add('good'); }
        else if (r === 'link') { ok++; fallback++; st.textContent = '外链'; st.classList.add('warn'); }
        else { skip++; st.textContent = '已存在'; }
      } catch (e) {
        fail++;
        st.textContent = '失败';
        st.classList.add('bad');
        st.title = String(e.message || e);
      }
    }

    btn.disabled = false;
    btn.textContent = '再导入一批';
    const bits = [`成功 ${ok} 条`];
    if (fallback) bits.push(`其中 ${fallback} 条按外链保存`);
    if (skip) bits.push(`跳过 ${skip} 条重复`);
    if (fail) bits.push(`失败 ${fail} 条`);
    sum.textContent = '完成：' + bits.join('，');
    toast(`已导入 ${ok} 条${meta.label}`);
    if (onDone) onDone();
  };

  setTimeout(() => ta.focus(), 260);
  return ctl;
}
