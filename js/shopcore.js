/* 商城核心 · 商品目录 / 钱包 / 储藏室 / 心愿单 / 商城设置
   还有 TA 的自动购物行为（送我礼物、心愿单相关、送自己、囤货），
   由调度器定时来敲门；商城页、储藏室页、聊天里的【送 TA】都从这里取数据。 */

import { el, uid, chance, rndInt, pick, downloadBlob } from './util.js';
import { kvGet, kvSet } from './store.js';
import { getMedia, saveMedia, mediaURL } from './media.js';
import { addMessage, replyTo, updateMessage } from './scheduler.js';

/* ---------------- 内置商品 ---------------- */
export const GOODS = [
  { id: 'g_milk',   name: '奶茶兑换券',  price: 9.9,   cat: '零食', emoji: '🧋', bg: ['#fde8d8', '#f4c197'], desc: '买一杯，顺手也替 TA 点一杯' },
  { id: 'g_cake',   name: '小蛋糕',     price: 25.5,  cat: '零食', emoji: '🍰', bg: ['#fce4ec', '#f0b6c8'], desc: '下午茶限定，会化，得快点吃' },
  { id: 'g_choco',  name: '巧克力礼盒',  price: 69,    cat: '零食', emoji: '🍫', bg: ['#f3dfd2', '#cfa08c'], desc: '丝滑的，甜的，适合分着吃' },
  { id: 'g_bear',   name: '小熊玩偶',    price: 39.9,  cat: '礼物', emoji: '🧸', bg: ['#f5e6cf', '#d9b98a'], desc: '抱着睡刚刚好，冬天不凉手' },
  { id: 'g_flower', name: '一小束花',    price: 33,    cat: '礼物', emoji: '💐', bg: ['#efe3f7', '#cdb3e3'], desc: '没有特别的日子也可以送' },
  { id: 'g_letter', name: '手写贺卡',    price: 5.2,   cat: '礼物', emoji: '💌', bg: ['#fde2e4', '#f4a9b0'], desc: '字迹比内容更值钱' },
  { id: 'g_ear',    name: '蓝牙耳机',    price: 199,   cat: '数码', emoji: '🎧', bg: ['#e2e8f0', '#a9b8cc'], desc: '一起听歌，得一对才叫一起听' },
  { id: 'g_lamp',   name: '星空小夜灯',  price: 49.9,  cat: '数码', emoji: '🌌', bg: ['#dfe6f5', '#9fb0e0'], desc: '关灯以后，天花板就是银河' },
  { id: 'g_case',   name: '情侣手机壳',  price: 29.9,  cat: '数码', emoji: '📱', bg: ['#e8f0e2', '#b3ccb4'], desc: '一人一个，藏在口袋里的仪式感' },
  { id: 'g_plant',  name: '多肉盆栽',    price: 19.9,  cat: '生活', emoji: '🪴', bg: ['#e4efdd', '#b1cfa0'], desc: '好养活，象征意义大于实际' },
  { id: 'g_mug',    name: '马克杯',     price: 22,    cat: '生活', emoji: '☕', bg: ['#f0e8dc', '#cbb59a'], desc: '喝水喝牛奶都行，杯壁厚实' },
  { id: 'g_note',   name: '手账本+贴纸', price: 12.5,  cat: '生活', emoji: '📒', bg: ['#fdf3d1', '#e8cf87'], desc: '把日子一页一页贴起来' },
  { id: 'g_scarf',  name: '围巾',      price: 59,    cat: '穿搭', emoji: '🧣', bg: ['#fbe3e0', '#e7b1a8'], desc: '降温之前先准备好' },
  { id: 'g_hoodie', name: '连帽卫衣',    price: 119,   cat: '穿搭', emoji: '🧥', bg: ['#e3ecf6', '#b0c3da'], desc: 'oversize 一点更好看' },
  { id: 'g_socks',  name: '成对袜子',    price: 15.8,  cat: '穿搭', emoji: '🧦', bg: ['#eee8f6', '#c5b8dd'], desc: '看不见的地方也要成双' }
];
export const CATS = ['零食', '礼物', '数码', '生活', '穿搭'];

export const KV_CUSTOM = 'shopCustom';
export const KV_CART = 'shopCart';
export const KV_HIDDEN = 'shopHidden';
export const KV_WALLET = 'shopWallet';
export const KV_SET = 'shopSet';
export const KV_STORE = 'shopStorage';
export const KV_WISH = 'shopWish';
export const DEFAULT_WALLET = 520;   // 首次进商城送的虚拟余额

export const yuan = (n) => '¥' + Number(n || 0).toFixed(2);
export const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---------------- 商城设置（TA 的购物行为） ---------------- */
export const DEFAULT_SHOP_SET = {
  /* 他送我礼物 */
  taGiftEnabled: false,
  taGiftPctMin: 20,          // 送我礼物概率·下限 %
  taGiftPctMax: 60,          // 送我礼物概率·上限 %
  /* 心愿单功能（总开关）：TA 可能买我心愿单里的礼物送我 / TA 把想要的加进自己心愿单 */
  wishEnabled: false,
  wishBuyMineMin: 20,        // TA 买下我的心愿单商品概率·下限 %
  wishBuyMineMax: 60,        // TA 买下我的心愿单商品概率·上限 %
  wishAddTaMin: 20,          // TA 加进自己心愿单概率·下限 %
  wishAddTaMax: 60,          // TA 加进自己心愿单概率·上限 %
  wishChatMin: 20,           // TA 的心愿发到聊天概率·下限 %
  wishChatMax: 60,           // TA 的心愿发到聊天概率·上限 %
  /* TA 自己的两笔花销（不依赖心愿单开关，上限设 0 即关闭） */
  taSelfGiftMin: 0,          // TA 自己买礼物送自己·概率下限 %
  taSelfGiftMax: 0,          // TA 自己买礼物送自己·概率上限 %
  taHoardMin: 0,             // TA 自己买（囤货）·概率下限 %
  taHoardMax: 0              // TA 自己买（囤货）·概率上限 %
};

let _set = null;
export async function getShopSet() {
  if (!_set) _set = Object.assign({}, DEFAULT_SHOP_SET, (await kvGet(KV_SET, null)) || {});
  return _set;
}
export async function saveShopSet() { await kvSet(KV_SET, _set); }

/* ---------------- 商品 / 钱包 ---------------- */
/** 可售列表：内置（未隐藏）+ 我上架的自定义商品 */
export async function shopGoodsList() {
  const hidden = new Set((await kvGet(KV_HIDDEN, [])) || []);
  const custom = (await kvGet(KV_CUSTOM, [])) || [];
  return GOODS.filter((g) => !hidden.has(g.id)).concat(Array.isArray(custom) ? custom : []);
}
export async function getWallet() {
  const w = await kvGet(KV_WALLET, null);
  if (w === null) { await kvSet(KV_WALLET, DEFAULT_WALLET); return DEFAULT_WALLET; }
  return Number(w || 0);
}
export async function setWallet(n) { await kvSet(KV_WALLET, round2(n)); }

/* ---------------- 储藏室（三份库存） ---------------- */
export async function getStore() {
  const s = (await kvGet(KV_STORE, null)) || {};
  return { fromTa: s.fromTa || [], fromMe: s.fromMe || [], taOwn: s.taOwn || [] };
}
export async function saveStore(s) { await kvSet(KV_STORE, s); }
export async function addStore(side, entry) {
  const s = await getStore();
  (s[side] || (s[side] = [])).unshift(entry);
  await saveStore(s);
  return s;
}

/* ---------------- 心愿单（我 / TA 各一份） ---------------- */
export async function getWish() {
  const w = (await kvGet(KV_WISH, null)) || {};
  return { mine: w.mine || [], ta: w.ta || [] };
}
export async function saveWish(w) { await kvSet(KV_WISH, w); }

/** 商品 → 存货 / 心愿的快照（商品被删除后礼物依然完好） */
export function snap(g) {
  return {
    goodsId: g.id || g.goodsId || '',
    name: g.name || '一件商品',
    price: round2(Number(g.price) || 0),
    emoji: g.emoji || '🎁',
    bg: Array.isArray(g.bg) && g.bg.length >= 2 ? g.bg : ['#f3f3f2', '#e4e4e2'],
    imgId: g.imgId || null,
    cat: g.cat || ''
  };
}

/** 把商品加进我的心愿单，返回 true = 加进去了，false = 已经在里面（则移出） */
export async function toggleWishMine(g) {
  const w = await getWish();
  const i = w.mine.findIndex((x) => x.goodsId === g.id);
  if (i >= 0) { w.mine.splice(i, 1); await saveWish(w); return false; }
  w.mine.unshift(Object.assign(snap(g), { id: uid(), ts: Date.now() }));
  await saveWish(w);
  return true;
}
export async function inWishMine(goodsId) {
  const w = await getWish();
  return w.mine.some((x) => x.goodsId === goodsId);
}

/* ---------------- 商品主视觉：优先图片，其次 emoji 渐变 ----------------
   图片永远装进固定尺寸的小盒子里，长图也不会把价格挤到图标下面去 */
export function tileVisual(g, cls) {
  if (g.imgId) {
    const box = el('div', { class: cls + ' sh-visual', title: g.name || '' });
    const img = el('img', { class: 'sh-img', alt: g.name || '' });
    mediaURL(g.imgId).then((u) => { if (u) img.src = u; });
    box.appendChild(img);
    return box;
  }
  return el('div', {
    class: cls,
    style: { background: `linear-gradient(145deg,${g.bg?.[0] || '#f3f3f2'},${g.bg?.[1] || '#e4e4e2'})` },
    text: g.emoji || '🎁'
  });
}

/* ============================================================
   TA 的自动购物行为（由调度器 tickShop 每 20 秒来敲一次门）
   ============================================================ */
const WISH_TEXT = [
  '我好想要这个…',
  '刷到这个，突然很想要',
  '先记进心愿单了，你会懂的吧',
  '这个好好看，偷偷加进心愿单了'
];

/** 每个行为一份「下一次机会」时间戳：到点才掷骰子，避免每 20 秒就判一次 */
async function rollLoop(key, gapMin, gapMax, lo, hi, run) {
  const loV = Math.max(0, Number(lo) || 0);
  const hiV = Math.max(loV, Number(hi) || 0);
  if (hiV <= 0) return;                 // 上限为 0 = 这个行为关着
  const now = Date.now();
  const next = Number(await kvGet('shopNext_' + key, 0)) || 0;
  if (!next) { await kvSet('shopNext_' + key, now + rndInt(gapMin, gapMax) * 60000); return; }
  if (now < next) return;
  await kvSet('shopNext_' + key, now + rndInt(gapMin, gapMax) * 60000);
  if (!chance(rndInt(loV, hiV))) return;
  await run();
}

/* 1) TA 买一件礼物送给我 → 进「他送给我的」+ 聊天礼物卡片 */
async function taGiftMe() {
  const list = await shopGoodsList();
  if (!list.length) return false;
  const g = pick(list);
  await addStore('fromTa', Object.assign(snap(g), { id: uid(), ts: Date.now(), gift: true }));
  await addMessage({
    role: 'ta', type: 'gift',
    giftName: g.name, emoji: g.emoji, bg: g.bg, price: g.price, imgId: g.imgId || null,
    giftSub: '路过商城看到的，买给你'
  });
  return true;
}

/* 2) TA 把想要的商品加进自己的心愿单（按概率再发一张心愿卡到聊天） */
async function wishAddTa(forceChat = false) {
  const list = await shopGoodsList();
  if (!list.length) return false;
  const w = await getWish();
  const have = new Set(w.ta.map((x) => x.goodsId));
  const pool = list.filter((g) => !have.has(g.id));
  if (!pool.length) return false;
  const item = Object.assign(snap(pick(pool)), { id: uid(), ts: Date.now() });
  w.ta.unshift(item);
  await saveWish(w);
  if (forceChat) { await sendWishCard(item); return true; }
  const s = await getShopSet();
  if (chance(rndInt(Math.max(0, Number(s.wishChatMin) || 0), Math.max(0, Number(s.wishChatMax) || 0)))) {
    await sendWishCard(item);
  }
  return true;
}

/* 心愿卡片发到聊天：我点【送 TA】就买下送出 */
async function sendWishCard(item) {
  const wt = pick(WISH_TEXT);
  const m = await addMessage({
    role: 'ta', type: 'wish', text: wt,
    wishId: item.id, wishSide: 'ta',
    goodsId: item.goodsId, name: item.name, price: item.price,
    emoji: item.emoji, bg: item.bg, imgId: item.imgId || null,
    wishText: wt
  });
  const w = await getWish();
  const it = w.ta.find((x) => x.id === item.id);
  if (it) { it.chatMsgIds = (it.chatMsgIds || []).concat(m.id); await saveWish(w); }
  return m;
}

/* 3) TA 买下我心愿单里的商品送给我 → 心愿自动移除 */
async function wishBuyMine() {
  const w = await getWish();
  if (!w.mine.length) return false;
  const item = w.mine[rndInt(0, w.mine.length - 1)];
  w.mine.splice(w.mine.indexOf(item), 1);
  await saveWish(w);
  await addStore('fromTa', Object.assign({}, item, { id: uid(), ts: Date.now(), gift: true, fromWish: true }));
  await addMessage({
    role: 'ta', type: 'gift',
    giftName: item.name, emoji: item.emoji, bg: item.bg, price: item.price, imgId: item.imgId || null,
    giftSub: '你心愿单里的那个，我买下送你啦'
  });
  return true;
}

/* 4) TA 自己买礼物送自己 → 进「他自己买的」，并在聊天里说一声 */
async function taSelfGift() {
  const list = await shopGoodsList();
  if (!list.length) return false;
  const g = pick(list);
  await addStore('taOwn', Object.assign(snap(g), { id: uid(), ts: Date.now(), asGift: true }));
  await addMessage({ role: 'ta', type: 'text', text: `给自己买了个${g.emoji || ''}${g.name}，开心` });
  return true;
}

/* 5) TA 囤货：随机买一件商品存着，不打扰聊天 */
async function taHoard() {
  const list = await shopGoodsList();
  if (!list.length) return false;
  const g = pick(list);
  await addStore('taOwn', Object.assign(snap(g), { id: uid(), ts: Date.now() }));
  return true;
}

/** 调度器每 20 秒调一次 */
export async function tickShop() {
  try {
    const s = await getShopSet();
    if (s.taGiftEnabled) await rollLoop('taGift', 6, 30, s.taGiftPctMin, s.taGiftPctMax, taGiftMe);
    if (s.wishEnabled) {
      await rollLoop('wishBuyMine', 6, 30, s.wishBuyMineMin, s.wishBuyMineMax, wishBuyMine);
      await rollLoop('wishAddTa', 6, 30, s.wishAddTaMin, s.wishAddTaMax, wishAddTa);
    }
    /* 下面两个跟心愿单无关，自己按概率跑（上限 0 就是关着） */
    await rollLoop('taSelfGift', 8, 40, s.taSelfGiftMin, s.taSelfGiftMax, taSelfGift);
    await rollLoop('taHoard', 8, 40, s.taHoardMin, s.taHoardMax, taHoard);
  } catch (e) {
    /* 后台小动作失败也不打扰使用 */
  }
}

/** 设置页「让 TA 现在试一次」：按当前开关直接演示一回，不掷概率 */
export async function shopDemo() {
  const s = await getShopSet();
  if (s.taGiftEnabled) return await taGiftMe() ? 'TA 刚买了件礼物送你，去聊天看看' : '商城里没有可送的商品';
  if (s.wishEnabled) return await wishAddTa(true) ? 'TA 加了一份心愿，并把卡片发到聊天了' : '可选的商品都进了 TA 的心愿单';
  return null;
}

/* ---------------- 我点【送 TA】：买下 TA 的心愿 ---------------- */
export async function buyWishForTa(wishId) {
  const w = await getWish();
  const item = w.ta.find((x) => x.id === wishId);
  if (!item) return { ok: false, msg: '这份心愿已经不在心愿单里了' };
  const wallet = await getWallet();
  if (wallet < Number(item.price || 0)) {
    return { ok: false, needMoney: true, msg: `余额不足（差 ${yuan(Number(item.price || 0) - wallet)}），去商城充值` };
  }
  await setWallet(wallet - Number(item.price || 0));
  w.ta.splice(w.ta.indexOf(item), 1);
  await saveWish(w);
  await addStore('fromMe', Object.assign({}, item, { id: uid(), ts: Date.now(), fromWish: true }));
  /* 聊天里那张心愿卡改成「已送出」 */
  for (const mid of (item.chatMsgIds || [])) {
    await updateMessage(mid, { wishTaken: true, wishTakenTs: Date.now() }).catch(() => {});
  }
  const m = await addMessage({
    role: 'me', type: 'gift',
    giftName: item.name, emoji: item.emoji, bg: item.bg, price: item.price, imgId: item.imgId || null,
    giftSub: '你心愿单里的，我买下送你啦'
  });
  await replyTo(m);
  return { ok: true, item };
}

/* ---------------- 商品数据导出 / 导入（含自定义商品图片） ---------------- */
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
async function dataURLToMedia(u) {
  const blob = await (await fetch(u)).blob();
  const type = blob.type || 'image/png';
  return saveMedia(new Blob([blob], { type }), { type: 'image', source: 'shop' });
}

/** 导出：自定义商品（图片转 base64 一起带走）+ 被隐藏的内置商品 */
export async function exportShopData() {
  const custom = (await kvGet(KV_CUSTOM, [])) || [];
  const hidden = (await kvGet(KV_HIDDEN, [])) || [];
  const list = [];
  for (const g of custom) {
    const c = Object.assign({}, g);
    if (g.imgId) {
      const row = await getMedia(g.imgId);
      if (row && row.blob) c.img = await blobToDataURL(row.blob);
    }
    list.push(c);
  }
  const data = { type: 'zika-shop', ver: 1, ts: Date.now(), custom: list, hidden };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `商城商品-${new Date().toISOString().slice(0, 10)}.json`);
  return list.length;
}

/** 导入：同 id 覆盖更新，其余追加；图片能还原就还原 */
export async function importShopData(data) {
  if (!data || data.type !== 'zika-shop' || !Array.isArray(data.custom)) {
    throw new Error('这不是商城导出的商品 JSON');
  }
  const custom = (await kvGet(KV_CUSTOM, [])) || [];
  let added = 0, updated = 0;
  for (const g of data.custom) {
    if (!g || !g.name) continue;
    const old = custom.find((x) => x.id === g.id);
    let imgId = null;
    if (g.imgId && (await getMedia(g.imgId))) imgId = g.imgId;          // 同一台设备导出又导入
    else if (g.img) imgId = await dataURLToMedia(g.img).catch(() => null);   // 换设备：从 base64 还原
    else if (old) imgId = old.imgId || null;
    const item = {
      id: old ? old.id : (g.id || 'cg_' + uid()),
      name: g.name,
      price: round2(Number(g.price) || 0),
      desc: g.desc || '',
      cat: g.cat || CATS[0],
      emoji: g.emoji || '🎁',
      imgId,
      ts: old ? old.ts : (g.ts || Date.now())
    };
    if (old) { Object.assign(old, item); updated++; }
    else { custom.push(item); added++; }
  }
  await kvSet(KV_CUSTOM, custom);
  if (Array.isArray(data.hidden) && data.hidden.length) {
    const hidden = new Set((await kvGet(KV_HIDDEN, [])) || []);
    data.hidden.forEach((id) => hidden.add(id));
    await kvSet(KV_HIDDEN, [...hidden]);
  }
  return { added, updated };
}
