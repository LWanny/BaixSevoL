/* 小粉书 · 本地内容与梦角行为
   本地模拟的推荐流 / 搜索 / TA 发帖 / 一起看视频的配乐（无外部接口）。
   所有帖子都在 xhsPosts 表，互动状态也写回这一行。 */

import { all, put, del, bulkPut, kvGet, kvSet } from './store.js';
import { state } from './state.js';
import { uid, pick, rndInt, chance } from './util.js';
import { eligible, drawCards, joinFragments } from './engine.js';
import * as sched from './scheduler.js';

/* ---------------- 题材库 ---------------- */
const TOPICS = [
  { tag: '咖啡', glyph: '啡', a: '#f4ddcf', b: '#d6a67f',
    titles: ['巷口那家咖啡店', '一杯手冲的下午', '今天的咖啡有点甜'],
    lines: ['推门就是烘豆的味道。', '冰块碰到杯壁，声音很轻。', '坐在窗边，看了一下午的人来人往。'],
    hints: /咖啡|拿铁|美式|手冲|烘焙/ },
  { tag: '夜', glyph: '夜', a: '#cfd3e9', b: '#6f7396',
    titles: ['凌晨两点的房间', '还没睡的人', '夜色刚好'],
    lines: ['灯关掉以后，城市反而更清楚了。', '窗帘缝里漏进来一条橘色的光。', '这个点还没睡的人，大概都有自己的心事。'],
    hints: /夜|失眠|凌晨|月亮|睡不着/ },
  { tag: '海', glyph: '海', a: '#cfe6ea', b: '#6fa6b4',
    titles: ['去看一次海', '海边的风很大', '把烦恼丢进浪里'],
    lines: ['浪一层一层地推过来，又退回去。', '风里有咸味，头发被吹得乱七八糟。', '站在海边的时候，很多事都变小了。'],
    hints: /海|浪|岛|沙滩|潮/ },
  { tag: '猫', glyph: '猫', a: '#f2ddd2', b: '#c89b83',
    titles: ['今天也被猫治愈', '楼下那只橘猫', '它又来蹭我了'],
    lines: ['它在我脚边绕了两圈，然后坐下。', '伸手的时候，它把脑袋轻轻顶过来。', '什么都没说，但好像什么都懂了。'],
    hints: /猫|橘猫|猫咪|毛孩子/ },
  { tag: '书', glyph: '书', a: '#e7ddc9', b: '#a98f6d',
    titles: ['最近在读的一本书', '读到一半舍不得合上', '书页里的下午'],
    lines: ['书页翻过去的时候，房间特别安静。', '有些句子会让人停下来很久。', '把喜欢的段落折了一角，打算以后再读一遍。'],
    hints: /书|阅读|小说|页|作者/ },
  { tag: '音乐', glyph: '歌', a: '#ddd5ee', b: '#9788bb',
    titles: ['单曲循环了一整天', '耳机里的世界', '这首歌适合晚上听'],
    lines: ['前奏一响，整个人就安静下来了。', '戴上耳机以后，地铁也没那么吵了。', '有些歌不是好听，是刚好在对的时候出现。'],
    hints: /歌|音乐|耳机|旋律|单曲/ },
  { tag: '散步', glyph: '走', a: '#dbe7d4', b: '#8dab7f',
    titles: ['随便走走', '傍晚的风刚刚好', '没有目的地的散步'],
    lines: ['沿着不认识的街一直走。', '路灯一盏一盏亮起来。', '没有目的地的时候，反而看见了很多东西。'],
    hints: /散步|走走|遛弯|街|路/ },
  { tag: '雨', glyph: '雨', a: '#d5e0e8', b: '#8299ab',
    titles: ['下雨天不出门', '雨停之前', '听雨的声音'],
    lines: ['雨点敲在窗台上，节奏很乱。', '空气里有潮湿的土味。', '本来想出门的，后来决定再等等。'],
    hints: /雨|伞|潮湿|雷/ },
  { tag: '花', glyph: '花', a: '#f7dfe5', b: '#d99aae',
    titles: ['路边捡到一小束春天', '花开了', '今天的颜色'],
    lines: ['花店门口摆着刚剪下来的枝条。', '香味很淡，走近了才闻得到。', '买不买都没关系，看一会儿也很好。'],
    hints: /花|玫瑰|春天|枝|开/ },
  { tag: '电影', glyph: '影', a: '#dfd8d0', b: '#8f8278',
    titles: ['看完久久没说话', '一个人看电影', '银幕亮起来的时候'],
    lines: ['散场以后，灯亮得很突然。', '片尾曲放完才舍得站起来。', '有些镜头过了很久还会想起来。'],
    hints: /电影|银幕|片尾|导演|镜头/ },
  { tag: '旅行', glyph: '旅', a: '#d8e8e0', b: '#74a692',
    titles: ['想出发的时候', '在路上的感觉', '下一站还没想好'],
    lines: ['车票买好以后，心就先到了。', '陌生的站台，连广播声都新鲜。', '行李不用带太多，够用就好。'],
    hints: /旅行|出发|远方|车票|站台/ },
  { tag: '甜品', glyph: '甜', a: '#f7e2ea', b: '#d99ab2',
    titles: ['今天需要一点甜的', '蛋糕切面太好看了', '糖分续命'],
    lines: ['第一口下去，心情就好了。', '奶油化在舌尖上，很慢。', '明明说好只吃一半的。'],
    hints: /甜|蛋糕|糖|奶油|布丁/ },
  { tag: '城市', glyph: '城', a: '#dde1e6', b: '#8b939e',
    titles: ['城市的另一面', '高楼之间', '在地铁里发呆'],
    lines: ['玻璃幕墙把天空切成了几块。', '地铁进站的时候，风先到了。', '每天经过的路，偶尔也会觉得陌生。'],
    hints: /城市|地铁|楼|街道|霓虹/ },
  { tag: '天空', glyph: '云', a: '#d9e8f7', b: '#8db2d1',
    titles: ['今天的云很好看', '抬头的时候', '天空是最好的背景'],
    lines: ['云移动得很慢，几乎看不出来。', '蓝色干净得像刚洗过。', '抬头看了一会儿，脖子有点酸。'],
    hints: /天空|云|蓝|阳光|抬头/ }
];

const CREATORS = ['一只小满', '阿橘', '未眠', '南窗', '晚风收集者', '半糖', '山雀', '岛屿来信', '橘子汽水', '今日份发呆'];
const SHARE_LINES = ['这个好像你会喜欢。', '刚刚刷到的，你看看。', '看到这个的时候想起你了。', '这个你会感兴趣吗？', '先存着，等你有空一起看。'];
const DANMAKU_FALLBACK = ['这个画面好喜欢', '再看一遍', '嗯……', '这个镜头真好看', '好安静啊'];
const CLOSERS = ['就这样吧。', '记一下。', '今天也还行。', '下次还来。'];

/* ---------------- 设置 ---------------- */
export const DEFAULT_XHS_SETTINGS = {
  blocked: [],
  danmakuPct: 60,
  searchMode: 'mix',          // mix / manual
  sources: { cards: true, moments: true, history: true, chat: true },
  keywords: []
};

export async function loadXhsSettings() {
  const saved = await kvGet('xhsSettings', {});
  return {
    ...DEFAULT_XHS_SETTINGS,
    ...saved,
    blocked: Array.isArray(saved.blocked) ? saved.blocked : [],
    keywords: Array.isArray(saved.keywords) ? saved.keywords : [],
    sources: { ...DEFAULT_XHS_SETTINGS.sources, ...(saved.sources || {}) }
  };
}

export async function saveXhsSettings(s) { return kvSet('xhsSettings', s); }

export function isBlocked(text, settings) {
  const s = String(text || '');
  return (settings.blocked || []).some((w) => w && s.includes(w));
}

/* ---------------- 基础 ---------------- */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const clampText = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const countFmt = (n) => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n));

function topicFor(text) {
  return TOPICS.find((t) => t.hints.test(String(text || ''))) || pick(TOPICS);
}

function makeTitle(topic, keyword) {
  if (keyword && chance(35)) return `关于「${clampText(keyword, 10)}」`;
  const t = pick(topic.titles);
  return chance(20) ? t + ' · ' + pick(['随手记', '碎片', '今天']) : t;
}

function makeBody(topic, cards, keyword) {
  const parts = [];
  if (keyword) parts.push(`最近总在搜「${clampText(keyword, 12)}」。`);
  parts.push(pick(topic.lines));
  if (cards.length && chance(80)) {
    const n = chance(30) ? 2 : 1;
    parts.push(joinFragments(drawCards(cards, n, state.role.params.pureRandom).map((c) => c.content)));
  }
  if (chance(45)) parts.push(pick(CLOSERS));
  const text = parts.filter(Boolean).join(' ');
  return text;
}

function makeCover(topic, title) {
  return { g: topic.glyph, a: topic.a, b: topic.b, label: clampText(title, 6) };
}

async function makePost({ topic, kind = 'note', source = 'feed', authorName, author, keyword = '', link = '', videoUrl = '', together = false, cards = null }) {
  const pool = cards || eligible(await all('cards'));
  const title = makeTitle(topic, keyword);
  const body = makeBody(topic, pool, keyword);
  const dur = rndInt(45, 180);
  return {
    id: uid(),
    ts: Date.now() - rndInt(0, 20 * 3600 * 1000),
    kind, source, author: author || 'creator',
    authorName: authorName || pick(CREATORS),
    title, body,
    tags: [topic.tag, pick(['日常', '碎片', '生活', '记录', '随记'])],
    cover: makeCover(topic, title),
    likes: rndInt(60, 24000),
    saves: rndInt(10, 4000),
    likedByMe: false, savedByMe: false,
    likedByTa: false, savedByTa: false,
    followingAuthor: false,
    keyword,
    link, videoUrl,
    duration: dur,
    together,
    private: author === 'ta' && source === 'ta',
    shared: false
  };
}

/* ---------------- 偏好 / 推荐流 ---------------- */
export async function taPreferences() {
  const cards = (await all('cards')).filter((c) => c.enabled && c.kind === 'text').map((c) => c.content);
  const moments = (await all('moments')).map((m) => m.text || '').filter(Boolean);
  const messages = (await all('messages')).slice(-120).map((m) => m.text || '').filter(Boolean);
  const texts = [...cards, ...moments, ...messages].join(' ');
  return TOPICS
    .map((t) => {
      const hits = (texts.match(new RegExp(t.hints.source, 'g')) || []).length;
      return { topic: t, score: 0.3 + hits * 2 + Math.random() };
    })
    .sort((a, b) => b.score - a.score);
}

function preferenceTopic(prefs) {
  const top = prefs.slice(0, 5);
  const total = top.reduce((n, p) => n + p.score, 0);
  let r = Math.random() * total;
  for (const p of top) {
    r -= p.score;
    if (r <= 0) return p.topic;
  }
  return top[0].topic;
}

export async function ensureFeed(force = false) {
  const day = dayKey();
  const savedDay = await kvGet('xhsFeedDay', '');
  const existing = (await all('xhsPosts')).filter((p) => p.source === 'feed');
  if (!force && savedDay === day && existing.length >= 12) return existing;

  const prefs = await taPreferences();
  const cards = eligible(await all('cards'));
  const fresh = [];
  for (let i = 0; i < 18; i++) {
    const usePref = i < 12;
    const topic = usePref ? preferenceTopic(prefs) : pick(TOPICS);
    fresh.push(await makePost({
      topic,
      kind: chance(26) ? 'video' : 'note',
      source: 'feed',
      authorName: pick(CREATORS),
      cards
    }));
  }
  await bulkPut('xhsPosts', fresh);
  await kvSet('xhsFeedDay', day);

  /* 旧推荐只留被人或 TA 互动过的，避免越积越多 */
  for (const p of existing) {
    const keep = p.likedByMe || p.savedByMe || p.likedByTa || p.savedByTa || p.shared;
    if (!keep) await del('xhsPosts', p.id);
  }
  return fresh;
}

/* ---------------- 搜索 ---------------- */
export async function getSearchHistory() {
  const list = await kvGet('xhsSearchHistory', []);
  return Array.isArray(list) ? list : [];
}

async function pushHistory(q, source = 'me') {
  const text = clampText(q, 24);
  if (!text) return;
  const list = await getSearchHistory();
  const next = [{ q: text, source, ts: Date.now() }, ...list.filter((h) => h.q !== text)].slice(0, 24);
  await kvSet('xhsSearchHistory', next);
}

export async function searchPosts(q) {
  const word = clampText(q, 30);
  if (!word) return [];
  await pushHistory(word, 'me');
  let allPosts = await all('xhsPosts');
  const lower = word.toLowerCase();
  let hits = allPosts.filter((p) => !p.private &&
    `${p.title} ${p.body} ${(p.tags || []).join(' ')} ${p.authorName}`.toLowerCase().includes(lower)
  );

  if (hits.length < 6) {
    const prefs = await taPreferences();
    const cards = eligible(await all('cards'));
    const need = 6 - hits.length;
    for (let i = 0; i < need; i++) {
      const topic = i === 0 ? topicFor(word) : (chance(50) ? preferenceTopic(prefs) : pick(TOPICS));
      hits.push(await makePost({
        topic, kind: chance(30) ? 'video' : 'note',
        source: 'search', authorName: pick(CREATORS), keyword: word, cards
      }));
    }
    await bulkPut('xhsPosts', hits.filter((p) => p.source === 'search'));
  }
  allPosts = null;
  return hits.sort((a, b) => b.likes - a.likes);
}

/* ---------------- TA 的搜索来源 ---------------- */
export async function taSearchSource(settings) {
  if (settings.searchMode === 'manual') {
    const k = pick((settings.keywords || []).filter(Boolean));
    if (k) return { keyword: k, from: '手动关键词' };
  }
  const pool = [];
  if (settings.sources.cards) {
    (await all('cards')).filter((c) => c.enabled && c.kind === 'text' && c.content)
      .forEach((c) => pool.push({ text: c.content, from: '他的字卡' }));
  }
  if (settings.sources.moments) {
    (await all('moments')).filter((m) => m.text)
      .forEach((m) => pool.push({ text: m.text, from: '朋友圈' }));
  }
  if (settings.sources.history) {
    (await getSearchHistory()).forEach((h) => pool.push({ text: h.q, from: '搜索记录' }));
  }
  if (settings.sources.chat) {
    (await all('messages')).filter((m) => m.text && m.role !== 'sys')
      .slice(-160)
      .forEach((m) => pool.push({ text: m.text, from: '聊天记录' }));
  }
  if (!pool.length) {
    const k = pick((settings.keywords || []).filter(Boolean));
    if (k) return { keyword: k, from: '手动关键词' };
    return { keyword: pick(TOPICS).tag, from: '随手一搜' };
  }
  const picked = pick(pool);
  const cleaned = clampText(picked.text.replace(/[。！？!?，,、；;：:…~～"']/g, ' '), 18).split(' ').filter(Boolean).join(' ');
  return { keyword: cleaned || pick(TOPICS).tag, from: picked.from };
}

export async function taSearchVideo(settings) {
  const { keyword, from } = await taSearchSource(settings);
  const topic = topicFor(keyword);
  const post = await makePost({
    topic, kind: 'video', source: 'ta-search',
    author: 'ta', authorName: state.role.name || 'TA',
    keyword, together: true
  });
  await put('xhsPosts', post);
  await pushHistory(keyword, 'ta');
  return { ...post, from };
}

/* ---------------- TA 发帖 / 分享 ---------------- */
export async function taPostNow(kind = '') {
  const prefs = await taPreferences();
  const topic = preferenceTopic(prefs);
  const post = await makePost({
    topic,
    kind: kind || (chance(30) ? 'video' : 'note'),
    source: 'ta',
    author: 'ta',
    authorName: state.role.name || 'TA'
  });
  await put('xhsPosts', post);
  return post;
}

export async function maybeTaPostDaily() {
  const day = dayKey();
  const saved = await kvGet('xhsTaPostState', null);
  if (saved && saved.day === day) return null;
  let post = null;
  if (chance(45)) post = await taPostNow();
  await kvSet('xhsTaPostState', { day, posted: !!post });
  return post;
}

async function shareChanceToday() {
  const day = dayKey();
  const saved = await kvGet('xhsShareChance', null);
  if (saved && saved.day === day) return Number(saved.pct) || 0;
  const pct = Math.random() < 0.3 ? 0 : +(Math.random() * 10).toFixed(1);
  await kvSet('xhsShareChance', { day, pct });
  return pct;
}

export async function maybeShareDaily() {
  const day = dayKey();
  const saved = await kvGet('xhsShareState', null);
  if (saved && saved.day === day) return null;

  const pct = await shareChanceToday();
  let shared = false;
  let message = null;

  if (pct > 0 && chance(pct)) {
    let posts = await all('xhsPosts');
    if (!posts.length) { await ensureFeed(); posts = await all('xhsPosts'); }
    const liked = posts.filter((p) => p.likedByTa || p.savedByTa);
    const publicOnes = posts.filter((p) => !p.private && p.author !== 'ta');
    const post = pick(liked.length ? liked : (publicOnes.length ? publicOnes : posts));
    if (post) {
      const text = pick(SHARE_LINES);
      message = await sched.addMessage({
        role: 'ta', type: 'xhs', text,
        xhsId: post.id, xhsTitle: post.title, xhsCover: post.cover
      });
      post.shared = true;
      await put('xhsPosts', post);
      shared = true;
    }
  }

  await kvSet('xhsShareState', { day, pct, shared });
  return message;
}

let aiTimer = null;
export function startXhsAI() {
  if (aiTimer) return;
  const tick = async () => {
    try {
      await maybeTaPostDaily();
      await maybeShareDaily();
    } catch (e) {
      console.warn('小粉书后台任务失败', e);
    }
  };
  setTimeout(tick, 3500);
  aiTimer = setInterval(tick, 5 * 60 * 1000);
}

/* ---------------- 一起看 ---------------- */
export async function composeDanmaku(settings) {
  const cards = eligible(await all('cards'));
  for (let i = 0; i < 4; i++) {
    const drawn = drawCards(cards, 1, true);
    const text = drawn.length ? joinFragments(drawn.map((c) => c.content)) : pick(DANMAKU_FALLBACK);
    if (!isBlocked(text, settings)) return clampText(text, 26);
  }
  return '';
}

export function isDirectVideo(url) {
  return /^data:video\//i.test(url) || /\.(mp4|webm|ogg)(\?|#|$)/i.test(url);
}

export async function createLinkPost(url) {
  const topic = pick(TOPICS);
  const host = (() => { try { return new URL(url).hostname; } catch { return '链接'; } })();
  const direct = isDirectVideo(url);
  const post = await makePost({
    topic, kind: 'video', source: 'link',
    author: 'link', authorName: host,
    keyword: '', link: url,
    videoUrl: direct ? url : '',
    together: true
  });
  post.title = direct ? '一起看这段视频' : '一起看这个链接';
  post.body = `从 ${host} 打开的链接。`;
  post.cover = makeCover(topic, post.title);
  await put('xhsPosts', post);
  await pushHistory(host, 'link');
  return post;
}

export { TOPICS, countFmt, dayKey };
