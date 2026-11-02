/* 字卡传信 · 通知与提示音 */

import { state } from './state.js';
import { getMedia } from './media.js';

export function notifySupported() { return 'Notification' in window; }

export async function requestNotifyPermission() {
  if (!notifySupported()) return false;
  if (Notification.permission === 'granted') return true;
  try {
    const p = await Notification.requestPermission();
    return p === 'granted';
  } catch { return false; }
}

/** 新消息提示：页面内提示音 +（授权且不在前台时）系统通知 */
export async function notify(title, body, tag = 'zika') {
  playSound();
  if (!state.settings.notifyEnabled) return;
  if (!notifySupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    new Notification(title, {
      body: body || '',
      tag,
      icon: 'assets/icons/misc/IC-MIO-006.svg'
    });
  } catch { /* 部分浏览器在非 HTTPS 下会抛错，忽略 */ }
}

let audioCtx = null;

export async function playSound() {
  if (!state.settings.bubbleSound) return;

  if (state.settings.soundId) {
    try {
      const row = await getMedia(state.settings.soundId);
      if (row && row.blob) {
        const url = URL.createObjectURL(row.blob);
        const a = new Audio(url);
        a.volume = 0.9;
        await a.play().catch(() => {});
        setTimeout(() => URL.revokeObjectURL(url), 6000);
        return;
      }
    } catch { /* 回退到默认提示音 */ }
  }
  beep();
}

/** 默认提示音：用 WebAudio 生成，不依赖素材文件 */
export function beep(freq = 880, ms = 380) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch { /* 无音频权限时静默 */ }
}
