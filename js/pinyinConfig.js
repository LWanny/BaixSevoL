/* 拼音打字 · 全局配置模块
   - 全部参数落 localStorage（key: zkcx.pinyin.cfg.v1），纯前端、无任何外部依赖
   - 运行时通过 cfg() 实时读取：设置页每次改动都 saveCfg() 回写，
     pinyin.js / engine.js / scheduler.js 下一次调用即拿到新值，改完立即生效
   - 优先级（从高到低）：
     1) forceRandom 全局全部随机 —— 忽略下面所有用户概率/区间，走内置极端逻辑
     2) 心情状态 —— 覆盖 / 限制底层的字数设定
     3) 用户设定的各项概率与区间 */

import { rndInt } from './util.js';

export const PCFG_KEY = 'zkcx.pinyin.cfg.v1';

export const MOOD_KEYS = ['lazy', 'normal', 'chatty', 'warm', 'sad'];

export const DEFAULT_PCFG = {
  /* ---- 1 基础概率 ---- */
  wordRatio: [60, 80],        // 抽完整词库的概率区间 %（剩余概率抽单字）
  typoRate: [0, 10],          // 打错字并退格的概率区间 %

  /* ---- 2 句式模板与上下文锚点 ---- */
  useTemplate: true,          // 是否启用句式模板
  templateRate: 60,           // 启用后抽中模板的概率 %
  useAnchor: true,            // 是否用对方的话作锚点接话
  anchorTailRate: 70,         // 尾词命中率 %：锚点取对方话里最后一个实词
  anchorRandomRate: 30,       // 随机命中率 %：锚点取对方话里随机一个实词

  /* ---- 3 句首 / 句尾修饰 ---- */
  useTailWord: true,          // 句尾追加语气词开关（拼音 UI 会一并显示，如 ba）
  tailRate: 80,               // 追加语气词的概率 %
  headRate: [50, 70],         // 句首加连接词（那个/然后/不过）的概率区间 %

  /* ---- 4 心情状态：权重 + 音节数限制（心情优先于基础概率） ---- */
  moodWeights: { lazy: 18, normal: 30, chatty: 18, warm: 18, sad: 16 },
  moodSyll: {                // 每种心情的音节数 [最短, 最长]
    lazy: [1, 3], normal: [2, 6], chatty: [8, 14], warm: [3, 7], sad: [2, 5]
  },

  /* ---- 5 主动拼音打字（独立配置） ---- */
  enableProactive: true,     // 主动打字开关（关闭后主动消息不再敲拼音）
  proactiveInterval: [5, 30],// 主动发送间隔区间，单位分钟
  proactiveLen: {            // 不同心情下主动一句话的 [最短, 最长] 字数
    lazy: [2, 4], normal: [4, 8], chatty: [8, 14], warm: [5, 10], sad: [3, 6]
  },

  /* ---- 6 全局「全部随机」开关（最高优先级） ---- */
  forceRandom: false
};

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

/** 默认值 ⊕ 用户存档（数组整体覆盖，对象递归合并） */
function deepMerge(base, over) {
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    if (isObj(v)) out[k] = deepMerge(v, isObj(over && over[k]) ? over[k] : {});
    else if (over && Object.prototype.hasOwnProperty.call(over, k) && over[k] !== undefined) out[k] = over[k];
    else out[k] = Array.isArray(v) ? v.slice() : v;
  }
  return out;
}

let cache = null;
let lastRaw = '';

function readStorage() {
  try { return localStorage.getItem(PCFG_KEY) || ''; } catch { return ''; }
}
function writeStorage(raw) {
  try { localStorage.setItem(PCFG_KEY, raw); } catch { /* 隐私模式下静默失败，仅用内存缓存 */ }
}

/** 实时读取当前配置（检测到存储被改动会自动合并进来） */
export function cfg() {
  const raw = readStorage();
  if (!cache) {
    let parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = null; } }
    cache = deepMerge(DEFAULT_PCFG, parsed);
    lastRaw = raw;
    return cache;
  }
  if (raw && raw !== lastRaw) {          // 外部（设置页 / devtools）改过 → 重新合并
    lastRaw = raw;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    cache = deepMerge(DEFAULT_PCFG, parsed);
  }
  return cache;
}

/** 写入（patch 会浅合入当前配置），并同步落 localStorage */
export function saveCfg(patch = {}) {
  const c = cfg();
  Object.assign(c, patch);
  lastRaw = JSON.stringify(c);
  writeStorage(lastRaw);
  return c;
}

/** 恢复默认配置 */
export function resetCfg() {
  cache = deepMerge(DEFAULT_PCFG, null);
  lastRaw = JSON.stringify(cache);
  writeStorage(lastRaw);
  return cache;
}

/** 在 [lo, hi] 区间里掷一个整数（区间非法时退化为 lo） */
export function randRange(range, fallback = 0) {
  if (!range) return fallback;
  const lo = Number(range[0]);
  const hi = Number(range[1]);
  if (!Number.isFinite(lo)) return fallback;
  if (!Number.isFinite(hi) || hi < lo) return Math.round(lo);
  return rndInt(Math.round(lo), Math.round(hi));
}

/** 掷一个概率 %（单值）；区间先用 randRange 随机取点再判定 */
export function chanceIn(v) {
  const pct = Array.isArray(v) ? randRange(v, 0) : (Number(v) || 0);
  return Math.random() * 100 < pct;
}

/** 抽当前心情：forceRandom 时忽略权重、等概率；否则按 moodWeights 加权 */
export function pickMood() {
  const c = cfg();
  if (c.forceRandom) return MOOD_KEYS[rndInt(0, MOOD_KEYS.length - 1)];
  const w = MOOD_KEYS.map((k) => Math.max(0, Number(c.moodWeights && c.moodWeights[k]) || 0));
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) return 'normal';
  let r = Math.random() * total;
  for (let i = 0; i < MOOD_KEYS.length; i++) {
    r -= w[i];
    if (r <= 0) return MOOD_KEYS[i];
  }
  return 'normal';
}

/** 心情的音节区间 [min, max]（forceRandom 时由调用方走极端区间，不走这里） */
export function moodSyllRange(mood) {
  const c = cfg();
  const r = c.moodSyll && c.moodSyll[mood];
  const lo = Math.max(1, Number(r && r[0]) || 2);
  const hi = Math.max(lo, Number(r && r[1]) || 6);
  return [lo, hi];
}

/** 心情的主动一句话字数区间 [min, max] */
export function moodLenRange(mood) {
  const c = cfg();
  const r = c.proactiveLen && c.proactiveLen[mood];
  const lo = Math.max(1, Number(r && r[0]) || 4);
  const hi = Math.max(lo, Number(r && r[1]) || 8);
  return [lo, hi];
}
