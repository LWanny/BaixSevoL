/* 字卡传信 · 回复引擎
   角色不自由说话，只从启用的字卡里按参数抽取并拼接。
   引擎只产出「计划」，由聊天页负责落库与渲染。 */

import { chance, rndInt, pick, uid } from './util.js';
import { drawInspiration } from './inspiration.js';
import { randomPhrase, anchorFrom } from './pinyin.js';

/* ---------- 表情池 ---------- */
export const EMOJI = ['😢', '🥺', '😆', '😘', '💕', '😌', '😻', '😴', '😤', '🤣', '😅', '😊', '💪', '✨', '🍀', '🌙', '☀️', '🐱', '🐶'];

/** 在句子里随机位置插入随机数量（1~3 个）的 emoji。
    不再只追加句尾，看起来更自然。 */
export function injectEmoji(text, pct) {
  if (!text || !text.trim() || !chance(Number(pct) || 0)) return text;
  const count = rndInt(1, 3);
  let arr = Array.from(text);
  for (let i = 0; i < count; i++) {
    const pos = rndInt(0, arr.length);
    arr.splice(pos, 0, pick(EMOJI));
  }
  return arr.join('');
}

/* ---------- 抽卡 ---------- */
export function eligible(cards) {
  return cards.filter((c) => c.enabled && c.kind === 'text');
}
export function stickers(cards) {
  return cards.filter((c) => c.enabled && c.kind === 'sticker');
}
export function voices(cards) {
  return cards.filter((c) => c.enabled && c.kind === 'voice');
}
export function choices(cards) {
  return cards.filter((c) => c.enabled && c.kind === 'choice');
}

/** 加权抽取 n 张（纯随机模式则等概率） */
export function drawCards(pool, n, pureRandom = false) {
  const out = [];
  const local = pool.slice();
  while (out.length < n && local.length) {
    let idx;
    if (pureRandom) {
      idx = Math.floor(Math.random() * local.length);
    } else {
      const total = local.reduce((s, c) => s + (Number(c.weight) || 1), 0);
      let r = Math.random() * total;
      idx = 0;
      for (let i = 0; i < local.length; i++) {
        r -= (Number(local[i].weight) || 1);
        if (r <= 0) { idx = i; break; }
      }
    }
    out.push(local.splice(idx, 1)[0]);
  }
  return out;
}

/* ---------- 拼接 ---------- */

/** 把碎片拼成一句。
    - joinRandomSep 开启：从 joinSepList 里 enabled=true 的符号随机抽一个；
      但如果前一段已经以标点结尾，就不再插标点（只插空格或换行）。
    - 关闭：固定用一个空格。
    符号库如果全 disabled，则降级用空格。 */
export function joinFragments(parts, params = {}) {
  const list = params.joinSepList || DEFAULT_JOIN_SEPS;
  const enabledSeps = list.filter((s) => s.enabled);
  const random = !!params.joinRandomSep;

  function pickSep() {
    if (!random || !enabledSeps.length) return ' ';
    return enabledSeps[Math.floor(Math.random() * enabledSeps.length)].c;
  }

  let s = '';
  for (const p of parts) {
    const t = String(p || '').trim();
    if (!t) continue;
    if (!s) { s = t; continue; }

    let sep = pickSep();

    /* 前一段已经以标点结尾，不再补标点，只用空格或换行 */
    if (/[。！？…~～!?.,，、；;：:）)】」』"'！?\.。，]/.test(s.slice(-1))) {
      if (sep !== '\n') sep = ' ';
    }

    s += sep + t;
  }
  return s;
}

/** state.js 里默认的拼接符号库（供 params 为空时回退用） */
const DEFAULT_JOIN_SEPS = [
  { k: 'space',    c: ' ',   enabled: true  },
  { k: 'comma',    c: '，',  enabled: true  },
  { k: 'period',   c: '。',  enabled: true  },
  { k: 'excl',     c: '！',  enabled: true  },
  { k: 'q',        c: '？',  enabled: true  },
  { k: 'ellipsis', c: '……',  enabled: true  },
  { k: 'newline',  c: '\n',  enabled: false }
];

/* ---------- 单条消息 ---------- */
async function buildOne(pool, params) {
  // 灵感分支：有概率直接用拾取到的句子作为回复
  if (params.inspirationEnabled && chance(Number(params.inspirationUsePct) || 0)) {
    try {
      const ins = await drawInspiration();
      if (ins) return { text: ins.text, cardIds: [], inspirationId: ins.id };
    } catch (e) { /* 灵感表读失败时降级 */ }
  }
  const joined = chance(params.joinPct);
  const loJoin = Math.max(1, Math.round(Number(params.minJoin) || 1));
  const hiJoin = Math.max(loJoin, Math.round(Number(params.maxJoin) || loJoin));
  const n = joined ? rndInt(loJoin, hiJoin) : 1;
  const drawn = drawCards(pool, n, params.pureRandom);
  if (!drawn.length) return null;
  return {
    text: joinFragments(drawn.map((c) => c.content), params),
    cardIds: drawn.map((c) => c.id)
  };
}

/** 单条消息的回复延迟（毫秒）：最短按秒、最长按分钟存储 */
export function delayFor(params) {
  const lo = Math.max(0, Number(params.delayMin) || 0);
  const hi = Math.max(lo, (Number(params.delayMax) || 0) * 60);
  return rndInt(lo, hi) * 1000;
}

/** 需求4+5 · 把一次拼音生成摊成若干 step：
    - 长文按 parts（标点小句）分阶段逐句打出发送，第 2 句起用短间隔，节奏像真人连续敲
    - 生造词（词库接不上的段）紧跟着补发一句 [dǎ cuò le]
    extra 用于附带 proactive 等标记 */
function pushPinyinSteps(steps, py, firstDelay, extra = {}) {
  const parts = (Array.isArray(py.parts) && py.parts.length)
    ? py.parts
    : [{ text: py.text, pinyin: py.pinyin, pinyinTone: py.pinyinTone, segs: py.segs }];
  parts.forEach((pt, i) => {
    steps.push({
      kind: 'pinyin',
      delayMs: i === 0 ? firstDelay : rndInt(1500, 5200),
      text: pt.text,
      pinyin: pt.pinyin,
      pinyinTone: pt.pinyinTone,
      pysegs: pt.segs,
      ...extra
    });
  });
  if (py.madeUp) {
    steps.push({ kind: 'message', delayMs: rndInt(600, 2400), text: '[dǎ cuò le]', cardIds: [], ...extra });
  }
}

/**
 * 生成 TA 对我某条消息的回复计划。
 * 返回 { ignored:boolean, steps:[{kind,delayMs,...}] }
 */
export async function buildReply({ cards, params, history = [], incomingText = '', medias = [] }) {
  const textPool = eligible(cards);

  if (chance(params.ignorePct)) {
    return { ignored: true, steps: [] };
  }

  // 单次回复的消息条数（旧字段 minCount/maxCount）
  const lo = clampCount(params.minCount);
  const hi = clampCount(params.maxCount, lo);
  const count = rndInt(lo, hi);
  const steps = [];
  let pinyinUsed = false;

  for (let i = 0; i < count; i++) {
    // 拼音打字：不翻字卡库，随机敲拼音组一句话（每批最多一条）
    if (!pinyinUsed && params.pinyinEnabled && chance(Number(params.pinyinPct) || 0)) {
      pinyinUsed = true;
      // 上下文锚点：优先取对方刚说的这句的实词，兜底取我方上一条，保证能接上话
      const lastMe = [...history].reverse().find((m) => m.role === 'me' && m.text);
      const anchor = anchorFrom(incomingText) || (lastMe ? anchorFrom(lastMe.text) : null);
      const py = randomPhrase(anchor);
      pushPinyinSteps(steps, py, delayFor(params));
      continue;
    }
    const one = await buildOne(textPool, params);
    if (!one) break;

    /* ---- 随机位置注入 emoji / 句尾附加颜文字 ---- */
    let text = one.text;
    text = injectEmoji(text, Number(params.emojiPct) || 0);
    if (chance(Number(params.kaomojiPct) || 0)) text += ' ' + randomKaomoji();

    const cardIds = one.cardIds.slice();

    const step = { kind: 'message', delayMs: delayFor(params), text, cardIds };

    // 引用历史消息
    if (chance(params.quotePct)) {
      const quotable = history.filter((m) => m.role === 'me' && (m.text || m.type === 'image'));
      if (quotable.length) step.quoteId = pick(quotable).id;
    }
    steps.push(step);

    /* ---- 独立附加消息（不计入 count 上限） ---- */
    const stkPool = stickers(cards);
    const voiPool = voices(cards);
    if (stkPool.length && chance(Number(params.stickerPct) || 0)) {
      const st = pick(stkPool);
      cardIds.push(st.id);
      steps.push({ kind: 'sticker', delayMs: delayFor(params), mediaId: st.mediaId, cardIds: [st.id] });
    }
    if (voiPool.length && chance(Number(params.voicePct) || 0)) {
      const v = pick(voiPool);
      steps.push({ kind: 'voice', delayMs: delayFor(params), mediaId: v.mediaId, cardIds: [v.id] });
    }
    if (medias && medias.length && chance(Number(params.imagePct) || 0)) {
      const m = pick(medias);
      steps.push({ kind: 'image', delayMs: delayFor(params), mediaId: m.id, cardIds: [] });
    }

    /* ---- 撤回 + 可选补发 ---- */
    if (chance(params.recallPct)) {
      const recallDelay = 800 + rndInt(0, 1500);
      steps.push({ kind: 'recall', delayMs: recallDelay, targetIndex: steps.length - 1 });
      if (params.recallRepostEnabled && chance(Number(params.recallRepostPct) || 0)) {
        // 补发的新消息在撤回发生之后（delay 更大），且不计入 count 上限
        const repostOne = await buildOne(textPool, params);
        if (repostOne) {
          steps.push({
            kind: 'repost',
            delayMs: recallDelay + 1200 + rndInt(0, 1800),
            text: repostOne.text,
            cardIds: repostOne.cardIds
          });
        }
      }
    }
  }

  // 拍一拍
  if (chance(params.patPct)) {
    steps.push({ kind: 'pat', delayMs: delayFor(params), by: 'ta' });
  }

  // TA 主动发起通话请求（概率 callPct）
  if (chance(Number(params.callPct) || 0)) {
    steps.push({
      kind: 'call-request',
      delayMs: delayFor(params),
      text: '给你打个电话'
    });
  }

  // 主动发选择题
  if (chance(params.choicePct)) {
    const choicePool = choices(cards);
    if (choicePool.length) {
      const c = pick(choicePool);
      steps.push({
        kind: 'choice',
        delayMs: delayFor(params),
        text: c.content,
        options: normalizeOptions(c.options),
        cardIds: [c.id]
      });
    }
  }

  if (!steps.length) {
    // 库里没卡时给一句兜底，避免完全沉默
    steps.push({
      kind: 'message',
      delayMs: delayFor(params),
      text: textPool.length ? '' : '（字卡库是空的，去「字卡库」添加几张吧）',
      cardIds: []
    });
  }
  return { ignored: false, steps };
}

/** 主动发送计划 */
export async function buildProactive({ cards, params, history = [], medias = [] }) {
  const textPool = eligible(cards);
  const stkPool = stickers(cards);
  const voiPool = voices(cards);
  const steps = [];
  // 主动发送的条数由 proactiveMinCount / proactiveMaxCount 决定
  const lo = clampCount(params.proactiveMinCount);
  const hi = clampCount(params.proactiveMaxCount, lo);
  const count = rndInt(lo, hi);
  let pinyinUsed = false;
  for (let i = 0; i < count; i++) {
    if (!pinyinUsed && params.pinyinEnabled && chance(Number(params.pinyinPct) || 0)) {
      pinyinUsed = true;
      // 主动消息没有 incomingText，锚点取我方上一条
      const lastMe = [...history].reverse().find((m) => m.role === 'me' && m.text);
      const anchor = lastMe ? anchorFrom(lastMe.text) : null;
      const py = randomPhrase(anchor);
      pushPinyinSteps(steps, py, i === 0 ? 0 : delayFor(params), { proactive: true });
      continue;
    }
    const one = await buildOne(textPool, params);
    if (!one) break;
    let text = one.text;
    text = injectEmoji(text, Number(params.emojiPct) || 0);
    if (chance(Number(params.kaomojiPct) || 0)) text += ' ' + randomKaomoji();
    steps.push({ kind: 'message', delayMs: i === 0 ? 0 : delayFor(params), text, cardIds: one.cardIds, proactive: true });

    /* ---- 独立附加（不计入条数上限） ---- */
    if (stkPool.length && chance(Number(params.stickerPct) || 0)) {
      const st = pick(stkPool);
      steps.push({ kind: 'sticker', delayMs: delayFor(params), mediaId: st.mediaId, cardIds: [st.id], proactive: true });
    }
    if (voiPool.length && chance(Number(params.voicePct) || 0)) {
      const v = pick(voiPool);
      steps.push({ kind: 'voice', delayMs: delayFor(params), mediaId: v.mediaId, cardIds: [v.id], proactive: true });
    }
    if (medias && medias.length && chance(Number(params.imagePct) || 0)) {
      const m = pick(medias);
      steps.push({ kind: 'image', delayMs: delayFor(params), mediaId: m.id, cardIds: [], proactive: true });
    }
  }
  if (chance(params.patPct)) steps.push({ kind: 'pat', delayMs: 1200, by: 'ta' });
  if (chance(Number(params.callPct) || 0)) {
    steps.push({ kind: 'call-request', delayMs: 1200, text: '给你打个电话', proactive: true });
  }
  return steps;
}

export function clampCount(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(999, Math.round(n)));
}

function normalizeOptions(opts) {
  if (Array.isArray(opts) && opts.length) return opts.map(String).slice(0, 4);
  // 未显式配置选项时，用「|」或「/」拆一分段
  return ['好', '不好', '再想想'];
}

/** 表情/颜文字混入时可用的通用颜文字（当字卡库里没有贴纸时） */
const KAOMOJI = ['( ˘ω˘ )', '(๑•̀ㅂ•́)و', '(＞﹏＜)', '(・_・;)', 'ヽ(￣ω￣〃)ゞ', '(づ｡◕‿‿◕｡)づ'];
export function randomKaomoji() { return pick(KAOMOJI); }
