/* 字卡传信 · 分类数据管理（按模块单独导出 / 导入 / 删除）
   与整包备份互不影响：每个分类只读写自己声明的那几张表，
   导出时自动带上记录里引用到的媒体（表情包 / 语音 / 图片）。 */

import { all, clear, bulkWrite } from './store.js';
import { makeZip, readZip } from './zip.js';
import { openFile, readBuf, downloadBlob } from './util.js';

export const CATEGORIES = [
  { key: 'messages',  name: '聊天记录',   stores: ['messages'], sub: '全部聊天消息，含用到的表情 / 语音 / 图片' },
  { key: 'letters',   name: '信箱',       stores: ['letters'],  sub: '收到的信和寄出的信' },
  { key: 'moments',   name: '朋友圈',     stores: ['moments', 'momentCards', 'friends'], sub: '动态、朋友圈字卡和朋友' },
  { key: 'divine',    name: '占卜',       stores: ['divinations'], sub: '占卜记录' },
  { key: 'quiz',      name: '问卷',       stores: ['quizzes'], sub: '问卷与作答记录' },
  { key: 'calls',     name: '通话记录',   stores: ['calls'], sub: '通话与来电记录' },
  { key: 'memo',      name: '备忘录',     stores: ['memos'], sub: '备忘录' },
  { key: 'ledger',    name: '记账',       stores: ['ledger'], sub: '收支记录' },
  { key: 'pomodoro',  name: '番茄钟',     stores: ['pomodoros'], sub: '专注记录' },
  { key: 'watch',     name: '观影',       stores: ['watches'], sub: '看过的电影与剧集' },
  { key: 'books',     name: '书架',       stores: ['books'], sub: '在读与读完的书' },
  { key: 'period',    name: '经期',       stores: ['periods'], sub: '经期记录' },
  { key: 'anniversary', name: '纪念日',   stores: ['anniversaries'], sub: '纪念日' },
  { key: 'favorites', name: '收藏',       stores: ['favorites'], sub: '收藏的内容' },
  { key: 'album',     name: '相册',       stores: ['photos'], sub: '相册照片' },
  { key: 'xhs',       name: '小粉书',     stores: ['xhsPosts'], sub: '小粉书笔记' },
  { key: 'music',     name: '音乐',       stores: ['songs', 'playlists'], sub: '歌曲与歌单' },
  { key: 'inspiration', name: '灵感',     stores: ['inspirations'], sub: '灵感拾取' },
  { key: 'shop',      name: '商城订单',   stores: ['orders'], sub: '商城购买与送出的礼物' },
  { key: 'games',     name: '游戏战绩',   stores: ['games'], sub: '游戏厅的胜负与通关记录' },
  { key: 'cards',     name: '字卡库',     stores: ['cards', 'groups'], sub: '字卡与分组' }
];

const findCat = (key) => {
  const c = CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error('未知的分类');
  return c;
};

/* ---------------- 媒体引用扫描 ---------------------------- */

/** 深扫记录里出现的、确实存在于媒体库的 id */
function collectMediaIds(value, known, out, depth = 0) {
  if (value == null || depth > 6) return;
  if (typeof value === 'string') {
    if (known.has(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectMediaIds(v, known, out, depth + 1));
    return;
  }
  if (typeof value === 'object' && !(typeof Blob !== 'undefined' && value instanceof Blob)) {
    Object.keys(value).forEach((k) => collectMediaIds(value[k], known, out, depth + 1));
  }
}

/* ---------------- 统计 ---------------- */

export async function countCategory(key) {
  const cat = findCat(key);
  let n = 0;
  for (const s of cat.stores) n += (await all(s)).length;
  return n;
}

/* ---------------- 导出 ---------------- */

export async function exportCategory(key) {
  const cat = findCat(key);
  const stores = {};
  let records = 0;
  for (const s of cat.stores) {
    stores[s] = await all(s);
    records += stores[s].length;
  }
  if (!records) throw new Error(`「${cat.name}」还没有记录`);

  const mediaRowsAll = await all('media');
  const known = new Set(mediaRowsAll.map((r) => r.id));
  const used = new Set();
  for (const s of cat.stores) stores[s].forEach((r) => collectMediaIds(r, known, used));
  const mediaRows = mediaRowsAll.filter((r) => used.has(r.id));

  const files = [];
  for (const r of mediaRows) {
    if (!r.blob) continue;
    files.push({ name: `media/${r.id}`, data: new Uint8Array(await r.blob.arrayBuffer()) });
  }
  const mediaMeta = mediaRows.map((r) => { const { blob, ...meta } = r; void blob; return meta; });

  files.push({
    name: 'data.json',
    data: new TextEncoder().encode(JSON.stringify({
      version: 1, app: '字卡传信', kind: 'partial',
      category: key, categoryName: cat.name,
      exportedAt: Date.now(), stores, media: mediaMeta
    }))
  });

  const zip = makeZip(files);
  downloadBlob(zip, `字卡传信-${cat.name}-${new Date().toISOString().slice(0, 10)}.zip`);
  return { records, media: mediaRows.length };
}

/* ---------------- 导入 ---------------- */

export async function importCategory(key, mode = 'merge', fileIn = null) {
  const cat = findCat(key);
  const file = fileIn || await openFile({ accept: '.zip,application/zip' });
  if (!file) return null;

  const files = readZip(await readBuf(file));
  const dataFile = files.find((f) => f.name === 'data.json');
  if (!dataFile) throw new Error('备份里缺少 data.json，可能不是本站导出的文件');

  const parsed = JSON.parse(new TextDecoder().decode(dataFile.data));
  if (parsed.kind !== 'partial') throw new Error('这是整包备份，请到上方「导入备份」里恢复');
  if (parsed.category !== key) {
    throw new Error(`这个备份属于「${parsed.categoryName || parsed.category}」，与当前分类不一致`);
  }

  const data = parsed.stores || {};
  const mediaFiles = new Map(files.filter((f) => f.name.startsWith('media/')).map((f) => [f.name.slice(6), f]));
  const mediaRows = (parsed.media || []).map((meta) => {
    const f = mediaFiles.get(meta.id);
    return f ? { ...meta, blob: new Blob([f.data], { type: meta.mime || 'application/octet-stream' }) } : { ...meta };
  }).filter((r) => r.blob || r.url);

  const plan = { media: mediaRows };
  for (const s of cat.stores) plan[s] = Array.isArray(data[s]) ? data[s] : [];

  if (mode === 'overwrite') {
    for (const s of cat.stores) await clear(s);
  }
  await bulkWrite(plan);

  const records = cat.stores.reduce((n, s) => n + plan[s].length, 0);
  return { records, media: mediaRows.length, name: cat.name };
}

/* ---------------- 删除 ---------------- */

export async function deleteCategory(key) {
  const cat = findCat(key);
  let n = 0;
  for (const s of cat.stores) {
    n += (await all(s)).length;
    await clear(s);
  }
  return n;
}
