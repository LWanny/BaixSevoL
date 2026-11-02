/* 涂鸦
   - 我可以自由画（自由画笔、颜色、粗度、擦除、清空、保存）
   - TA 只能用预定义图形库（43 种）
   Canvas 绘制 → Blob → saveMedia，消息 type:'graffiti' */

import { put, all, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, chance, rndInt, pick } from './util.js';
import { saveMedia } from './media.js';
import * as sched from './scheduler.js';

export const GRAFITTI_W = 600;
export const GRAFITTI_H = 600;

/* ---------- TA 可用的 43 种图形 ---------- */
/* 每个 shape 是 (ctx, x, y, s, color) => void，s 是基准尺寸 */
function strokeFill(ctx, draw, color, fill) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, Math.round(ctx.lineWidth || 2));
  if (fill) draw(); ctx.fill();
  draw(); ctx.stroke();
  ctx.restore();
}

const SHAPE_LIB = {
  /* 6 种 × 2（空心/实心）= 12 */
  circle: (c, x, y, s, col, fill) => {
    c.beginPath(); c.arc(x, y, s / 2, 0, Math.PI * 2);
    fill ? c.fillStyle = col : c.strokeStyle = col; c.lineWidth = 3;
    fill ? c.fill() : c.stroke();
  },
  ellipse: (c, x, y, s, col, fill) => {
    c.beginPath(); c.ellipse(x, y, s / 2, s / 3, 0, 0, Math.PI * 2);
    fill ? c.fillStyle = col : c.strokeStyle = col; c.lineWidth = 3;
    fill ? c.fill() : c.stroke();
  },
  square: (c, x, y, s, col, fill) => {
    c.beginPath(); c.rect(x - s / 2, y - s / 2, s, s);
    fill ? c.fillStyle = col : c.strokeStyle = col; c.lineWidth = 3;
    fill ? c.fill() : c.stroke();
  },
  heart: (c, x, y, s, col, fill) => {
    const a = s / 14;
    c.beginPath();
    c.moveTo(x, y + 3 * a);
    c.bezierCurveTo(x, y - 2 * a, x - 8 * a, y - 2 * a, x - 5 * a, y + a);
    c.bezierCurveTo(x - 8 * a, y + 5 * a, x - 3 * a, y + 8 * a, x, y + 11 * a);
    c.bezierCurveTo(x + 3 * a, y + 8 * a, x + 8 * a, y + 5 * a, x + 5 * a, y + a);
    c.bezierCurveTo(x + 8 * a, y - 2 * a, x, y - 2 * a, x, y + 3 * a);
    fill ? c.fillStyle = col : c.strokeStyle = col; c.lineWidth = 3;
    fill ? c.fill() : c.stroke();
  },
  star: (c, x, y, s, col, fill) => {
    const pts = 5, outer = s / 2, inner = s / 4.5;
    c.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + i * Math.PI / pts;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath();
    fill ? c.fillStyle = col : c.strokeStyle = col; c.lineWidth = 3;
    fill ? c.fill() : c.stroke();
  },
  triangle: (c, x, y, s, col, fill) => {
    const h = s * 0.9;
    c.beginPath();
    c.moveTo(x, y - h / 2);
    c.lineTo(x + s / 2, y + h / 2);
    c.lineTo(x - s / 2, y + h / 2);
    c.closePath();
    fill ? c.fillStyle = col : c.strokeStyle = col; c.lineWidth = 3;
    fill ? c.fill() : c.stroke();
  },
  /* 5 种没有空心/实心概念的线性 */
  line: (c, x, y, s, col) => {
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
    c.moveTo(x - s / 2, y); c.lineTo(x + s / 2, y); c.stroke();
  },
  wave: (c, x, y, s, col) => {
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
    const step = 6; const amp = s / 5;
    for (let i = -s / 2; i <= s / 2; i += step) {
      const px = x + i, py = y + Math.sin(i / 8) * amp;
      i === -s / 2 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.stroke();
  },
  dash: (c, x, y, s, col) => {
    c.strokeStyle = col; c.lineWidth = 3;
    c.setLineDash([8, 6]);
    c.beginPath(); c.moveTo(x - s / 2, y); c.lineTo(x + s / 2, y); c.stroke();
    c.setLineDash([]);
  },
  check: (c, x, y, s, col) => {
    c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - s * 0.38, y);
    c.lineTo(x - s * 0.08, y + s * 0.3);
    c.lineTo(x + s * 0.42, y - s * 0.28);
    c.stroke();
  },
  cross: (c, x, y, s, col) => {
    c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - s / 2, y - s / 2); c.lineTo(x + s / 2, y + s / 2);
    c.moveTo(x + s / 2, y - s / 2); c.lineTo(x - s / 2, y + s / 2);
    c.stroke();
  },
  /* 26 个字母（用 26 个独立 key 避免循环引用） */
  A: (c, x, y, s, col) => drawLetter(c, 'A', x, y, s, col),
  B: (c, x, y, s, col) => drawLetter(c, 'B', x, y, s, col),
  C: (c, x, y, s, col) => drawLetter(c, 'C', x, y, s, col),
  D: (c, x, y, s, col) => drawLetter(c, 'D', x, y, s, col),
  E: (c, x, y, s, col) => drawLetter(c, 'E', x, y, s, col),
  F: (c, x, y, s, col) => drawLetter(c, 'F', x, y, s, col),
  G: (c, x, y, s, col) => drawLetter(c, 'G', x, y, s, col),
  H: (c, x, y, s, col) => drawLetter(c, 'H', x, y, s, col),
  I: (c, x, y, s, col) => drawLetter(c, 'I', x, y, s, col),
  J: (c, x, y, s, col) => drawLetter(c, 'J', x, y, s, col),
  K: (c, x, y, s, col) => drawLetter(c, 'K', x, y, s, col),
  L: (c, x, y, s, col) => drawLetter(c, 'L', x, y, s, col),
  M: (c, x, y, s, col) => drawLetter(c, 'M', x, y, s, col),
  N: (c, x, y, s, col) => drawLetter(c, 'N', x, y, s, col),
  O: (c, x, y, s, col) => drawLetter(c, 'O', x, y, s, col),
  P: (c, x, y, s, col) => drawLetter(c, 'P', x, y, s, col),
  Q: (c, x, y, s, col) => drawLetter(c, 'Q', x, y, s, col),
  R: (c, x, y, s, col) => drawLetter(c, 'R', x, y, s, col),
  S: (c, x, y, s, col) => drawLetter(c, 'S', x, y, s, col),
  T: (c, x, y, s, col) => drawLetter(c, 'T', x, y, s, col),
  U: (c, x, y, s, col) => drawLetter(c, 'U', x, y, s, col),
  V: (c, x, y, s, col) => drawLetter(c, 'V', x, y, s, col),
  W: (c, x, y, s, col) => drawLetter(c, 'W', x, y, s, col),
  X: (c, x, y, s, col) => drawLetter(c, 'X', x, y, s, col),
  Y: (c, x, y, s, col) => drawLetter(c, 'Y', x, y, s, col),
  Z: (c, x, y, s, col) => drawLetter(c, 'Z', x, y, s, col)
};

function drawLetter(ctx, ch, x, y, s, col) {
  ctx.save();
  ctx.fillStyle = col;
  ctx.font = `bold ${s * 0.9}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
  ctx.restore();
}

/* 这是给 TA 用的：TA 选一个图形时，随机决定画空心还是实心 */
export const OUTLINES = ['circle', 'ellipse', 'square', 'heart', 'star', 'triangle'];

const TA_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#0ea5e9', '#1f2937'];

export function pickTaShape() {
  const all = Object.keys(SHAPE_LIB);
  const k = pick(all);
  const fill = OUTLINES.includes(k) ? chance(50) : false;
  return { key: k, fill };
}

/* 在 canvas 上画一个 TA 随机图形 */
export function drawTaShape(ctx, shapeKey, { x, y, size, color, fill }) {
  const fn = SHAPE_LIB[shapeKey];
  if (!fn) return;
  fn(ctx, x, y, size, color, !!fill);
}

/* 生成一张 TA 的涂鸦（一张 canvas 上 3~10 个图形，每次随机） */
export function renderTaGraffiti() {
  const canvas = document.createElement('canvas');
  canvas.width = GRAFITTI_W;
  canvas.height = GRAFITTI_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const n = rndInt(3, 10);
  for (let i = 0; i < n; i++) {
    const x = rndInt(60, canvas.width - 60);
    const y = rndInt(60, canvas.height - 60);
    const size = rndInt(50, 130);
    const color = pick(TA_COLORS);
    const { key, fill } = pickTaShape();
    drawTaShape(ctx, key, { x, y, size, color, fill });
  }
  return canvas;
}

export async function taSendGraffiti() {
  const canvas = renderTaGraffiti();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png', 0.92));
  const id = await saveMedia(blob, { type: 'image', w: GRAFITTI_W, h: GRAFITTI_H, source: 'ta', name: '涂鸦' });
  return sched.addMessage({ role: 'ta', type: 'graffiti', mediaId: id, proactive: true });
}

/* ---------- 我自由涂鸦的 Canvas 工具 ---------- */
export function createFreeCanvas({ width = GRAFITTI_W, height = GRAFITTI_H, color = '#1f2937', size = 3, eraser = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  // CSS 尺寸：填满父容器 + 严格正方形 + 禁止默认滚动手势抢事件
  canvas.style.cssText = 'display:block;width:100%;aspect-ratio:1/1;touch-action:none;border-radius:0;';
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // 初始白底
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);

  const state = { color, size, eraser, drawing: false, last: null };
  const history = [];
  history.push(canvas.toDataURL());

  function onDown(e) {
    e.preventDefault();
    const pt = point(e, canvas);
    state.drawing = true; state.last = pt;
    history.push(canvas.toDataURL());
    if (history.length > 40) history.shift();
    // setPointerCapture 让后续 move/up 即使手指移到 canvas 外也继续接收
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  }
  function onMove(e) {
    if (!state.drawing) return;
    e.preventDefault();
    const pt = point(e, canvas);
    ctx.strokeStyle = state.eraser ? '#ffffff' : state.color;
    ctx.lineWidth = state.eraser ? state.size * 3 : state.size;
    ctx.beginPath();
    ctx.moveTo(state.last.x, state.last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    state.last = pt;
  }
  function onUp(e) {
    state.drawing = false; state.last = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  // 注意：不监听 pointerleave —— 手机上手指稍微划出边界就结束绘制，
  // 这是"画短横"的主因。setPointerCapture 已保证事件不丢。

  return {
    canvas,
    setColor: (c) => { state.color = c; state.eraser = false; },
    setSize: (n) => { state.size = n; },
    eraserOn: () => { state.eraser = true; },
    penOn: () => { state.eraser = false; },
    clear: () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); },
    undo: () => {
      if (history.length < 2) return;
      history.pop();
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = history[history.length - 1];
    },
    toBlob: (type = 'image/png', quality = 0.92) =>
      new Promise((r) => canvas.toBlob(r, type, quality)),
    destroy: () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    }
  };
}

function point(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  // pointer 事件统一用 clientX/Y（e.touches 在 pointer 事件下是空数组，别再用）
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  return { x: px * scaleX, y: py * scaleY };
}

/* ---------- 后台 ---------- */
let timer = null;
const DAY_KEY = 'taGraffitiLast';
export async function maybeTaGraffiti() {
  const p = state.role.params;
  if (!p.taGraffitiEnabled) return;
  const last = Number(await kvGet(DAY_KEY, 0)) || 0;
  const gap = rndInt(p.taGraffitiGapMin, p.taGraffitiGapMax) * 60000;
  if (!last || Date.now() - last > gap) {
    if (!chance(p.taGraffitiPct)) return;
    await kvSet(DAY_KEY, Date.now());
    await taSendGraffiti();
  }
}
export function startGraffitiAI() {
  if (timer) return;
  const tick = async () => { try { await maybeTaGraffiti(); } catch (e) { console.warn('涂鸦 AI', e); } };
  setTimeout(tick, 8000);
  timer = setInterval(tick, 6 * 60 * 1000);
}
