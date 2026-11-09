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
  wordRatio: [60, 80],        // 抽完整词库拼音的概率区间 %（与单字按比例混合）
  singleRatio: [20, 40],      // 抽单字拼音的概率区间 %
  typoRate: [0, 10],          // 打错字并退格的概率区间 %

  /* ---- 2 句式模板与上下文锚点 ---- */
  useTemplate: true,          // 是否启用句式模板
  templateRate: [40, 80],     // 启用后抽中模板的概率区间 %（每次生成取点）
  useAnchor: true,            // 是否用对方的话作锚点接话
  anchorTailRate: [55, 85],   // 尾词命中率区间 %：锚点取对方话里最后一个实词
  anchorRandomRate: [15, 45], // 随机命中率区间 %：锚点取对方话里随机一个实词

  /* ---- 3 句首 / 句尾修饰 ---- */
  useTailWord: true,          // 句尾追加语气词开关（拼音 UI 会一并显示，如 ba）
  tailRate: [65, 95],         // 追加语气词的概率区间 %
  headRate: [50, 70],         // 句首加连接词（那个/然后/不过）的概率区间 %

  /* ---- 4 心情状态：权重区间 + 音节数限制（心情优先于基础概率） ---- */
  moodWeights: {              // 每种心情的抽中权重区间 %（每次抽心情时取点）
    lazy: [12, 24], normal: [22, 38], chatty: [12, 24], warm: [12, 24], sad: [10, 22]
  },
  moodSyll: {                // 每种心情的音节数 [最短, 最长]
    lazy: [1, 3], normal: [2, 6], chatty: [8, 14], warm: [3, 7], sad: [2, 5]
  },

  /* ---- 5 主动拼音打字（独立配置） ---- */
  enableProactive: true,     // 主动打字开关（关闭后主动消息不再敲拼音）
  proactiveInterval: [5, 30],// 发送间隔 [最短秒, 最长分钟]
  typingDuration: [3, 1],    // 打完一句的总时长 [最短秒, 最长分钟]（从开打到落卡）
  proactiveLen: {            // 不同心情下主动一句话的 [最短, 最长] 字数
    lazy: [2, 4], normal: [4, 8], chatty: [8, 14], warm: [5, 10], sad: [3, 6]
  },

  /* ---- 句式模板 · 用户自定义预设句型（词性槽位数组，如 ['pn','vb','nn','pt']） ---- */
  customTemplates: [],

  /* ---- 6 全局「全部随机」开关（最高优先级） ---- */
  forceRandom: false
};

/* 区间型字段：读档时统一归一成 [lo, hi]（老版本存过单值的自动包成 [v,v]） */
const RANGE_KEYS = ['wordRatio', 'singleRatio', 'typoRate', 'templateRate',
  'anchorTailRate', 'anchorRandomRate', 'tailRate', 'headRate', 'proactiveInterval', 'typingDuration'];

function normRange(v, dflt) {
  if (typeof v === 'number' && Number.isFinite(v)) return [v, v];
  if (Array.isArray(v) && Number.isFinite(Number(v[0]))) {
    const a = Number(v[0]);
    return [a, Number.isFinite(Number(v[1])) ? Number(v[1]) : a];
  }
  return Array.isArray(dflt) ? dflt.slice() : [0, 0];
}

function normalize(c) {
  for (const k of RANGE_KEYS) c[k] = normRange(c[k], DEFAULT_PCFG[k]);
  const mw = {};
  for (const k of MOOD_KEYS) mw[k] = normRange(c.moodWeights && c.moodWeights[k], DEFAULT_PCFG.moodWeights[k]);
  c.moodWeights = mw;
  if (!Array.isArray(c.customTemplates)) c.customTemplates = [];
  c.customTemplates = c.customTemplates.filter((t) => Array.isArray(t) && t.length >= 2);
  return c;
}

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
    return normalize(cache);
  }
  if (raw && raw !== lastRaw) {          // 外部（设置页 / devtools）改过 → 重新合并
    lastRaw = raw;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    cache = deepMerge(DEFAULT_PCFG, parsed);
  }
  return normalize(cache);
}

/** 写入（patch 会浅合入当前配置），并同步落 localStorage */
export function saveCfg(patch = {}) {
  const c = cfg();
  Object.assign(c, patch);
  normalize(c);
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

/** 在 [lo, hi] 区间里掷一个整数（传单值则直接返回；区间非法时退化为 lo） */
export function randRange(range, fallback = 0) {
  if (typeof range === 'number' && Number.isFinite(range)) return Math.round(range);
  if (!range) return fallback;
  const lo = Number(range[0]);
  const hi = Number(range[1]);
  if (!Number.isFinite(lo)) return fallback;
  if (!Number.isFinite(hi) || hi < lo) return Math.round(lo);
  return rndInt(Math.round(lo), Math.round(hi));
}

/** 掷一个概率 %（单值）；区间先用 randRange 随机取点再判定 */
export function chanceIn(v) {
  const pct = Array.isArray(v) || typeof v === 'number' ? randRange(v, 0) : (Number(v) || 0);
  return Math.random() * 100 < pct;
}

/** 打完一句的总时长 → 毫秒区间 [lo, hi]：
    配置按 [最短秒, 最长分钟] 存（与主动发送间隔同一套单位习惯），这里统一换算并保证 hi ≥ lo */
export function typingDurMs() {
  const r = cfg().typingDuration || DEFAULT_PCFG.typingDuration;
  const lo = Math.max(400, (Number(r[0]) || 3) * 1000);
  const hi = Math.max(lo, (Number(r[1]) || 1) * 60000);
  return [lo, hi];
}

/** 抽当前心情：forceRandom 时忽略权重、等概率；否则把每种心情的权重区间取点后加权 */
export function pickMood() {
  const c = cfg();
  if (c.forceRandom) return MOOD_KEYS[rndInt(0, MOOD_KEYS.length - 1)];
  const w = MOOD_KEYS.map((k) => Math.max(0, randRange(c.moodWeights && c.moodWeights[k], 0)));
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
