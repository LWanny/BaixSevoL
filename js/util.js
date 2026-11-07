/* 字卡传信 · 通用工具 */

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 轻量 DOM 构造：el('div', {class:'x'}, [child, 'text']) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  const form = /^(input|textarea|select)$/i.test(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (form && k === 'value') node.value = v;          // 表单控件：用 property，textarea 靠这个才有初始内容
    else node.setAttribute(k, v === true ? '' : v);
  }
  const list = Array.isArray(children) ? children : [children];
  const append = (arr) => {                       // 递归展平：允许 children 里嵌套数组
    for (const c of arr) {
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) { append(c); continue; }
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  };
  append(list);
  return node;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------- 随机（全站统一入口，便于调试与「纯随机模式」） ---------- */
export const rnd = () => Math.random();
export const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/* 返回乱序新数组（不改动原数组） */
export function shuffle(arr) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (pct) => Math.random() * 100 < (Number(pct) || 0);
export function pickN(arr, n) {
  const pool = arr.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/* ---------- 时间 ---------- */
const DAY = 86400000;
export function fmtDay(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  if (now - ts < DAY) return '昨天 ' + hm;
  if (d.getFullYear() === now.getFullYear())
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function daysSince(ts) {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / DAY));
}

/* ---------- 文件 ---------- */
export function readText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsText(file, 'utf-8');
  });
}
export function readBuf(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}
export function readDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function openFile({ accept = '', multiple = false, directory = false } = {}) {
  return new Promise((res) => {
    // directory 模式不能设 accept（部分浏览器会因此过滤掉整个目录选择）
    const input = el('input', { type: 'file', accept: directory ? '' : accept });
    if (multiple || directory) input.multiple = true;
    if (directory) { input.webkitdirectory = true; input.directory = true; }
    // 移动端（尤其是微信/QQ 内置 WebView）对 display:none 的 file input 不会唤起相册，
    // 改成「1px 透明 + 移出屏幕外」，既不可见又能正常唤出系统选择器
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;';
    document.body.appendChild(input);
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      window.removeEventListener('focus', onFocus);
      // 延后移除：部分 WebView 在 change 回调里立即 remove 会导致读取文件失败
      setTimeout(() => input.remove(), 800);
      res(val);
    };
    // 用户从系统选择器返回页面却没有 change → 视为取消，避免 Promise 永远挂着
    const onFocus = () => setTimeout(() => finish((multiple || directory) ? [] : null), 800);
    window.addEventListener('focus', onFocus);
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      finish((multiple || directory) ? files : files[0] || null);
    });
    input.addEventListener('cancel', () => finish((multiple || directory) ? [] : null));
    input.click();
  });
}

/* ---------- 图片压缩（长边 max，输出 jpeg/webp 的 Blob） ---------- */
export async function compressImage(fileOrBlob, max = 1080, quality = 0.86) {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = await loadImage(url);
    let { width: w, height: h } = img;
    const scale = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * scale); h = Math.round(h * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality));
    return { blob, w, h };
  } finally { URL.revokeObjectURL(url); }
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/* ---------- 其它 ---------- */
export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}
