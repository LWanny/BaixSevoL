/* 商城 · 本地小卖部
   内置商品 + 我上架的自定义商品（可删，内置的也可隐藏）；
   购物车批量结算、钱包余额支付（模拟充值）；
   购买生成订单存 orders 表，物流按经过时间自动推进：
   待发货 → 配送中 → 已签收；签收前后都可以「送给 TA」。 */

import { el, uid, fmtDay, openFile, compressImage } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del, kvGet, kvSet } from '../store.js';
import { mediaURL, saveMedia, delMedia } from '../media.js';
import { sheet, confirmBox, toast } from '../ui.js';
import { state } from '../state.js';
import * as sched from '../scheduler.js';

/* ---------------- 内置商品 ---------------- */
const GOODS = [
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
const CATS = ['零食', '礼物', '数码', '生活', '穿搭'];
const KV_CUSTOM = 'shopCustom';
const KV_CART = 'shopCart';
const KV_HIDDEN = 'shopHidden';
const KV_WALLET = 'shopWallet';
const DEFAULT_WALLET = 520;   // 首次进商城送的虚拟余额

const yuan = (n) => '¥' + Number(n || 0).toFixed(2);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---------------- 状态 ---------------- */
let custom = [];        // 我上架的商品
let cart = [];          // 购物车 [{goodsId, name, price, emoji, bg, imgId, cat, qty}]
let hidden = new Set(); // 隐藏的内置商品 id
let wallet = 0;

async function loadState4() {
  custom = (await kvGet(KV_CUSTOM, [])) || [];
  cart = (await kvGet(KV_CART, [])) || [];
  hidden = new Set((await kvGet(KV_HIDDEN, [])) || []);
  const w = await kvGet(KV_WALLET, null);
  wallet = w === null ? DEFAULT_WALLET : Number(w || 0);
  if (w === null) await kvSet(KV_WALLET, wallet);
}
const saveCustom = () => kvSet(KV_CUSTOM, custom);
const saveCart = () => kvSet(KV_CART, cart);
const saveHidden = () => kvSet(KV_HIDDEN, [...hidden]);
const saveWallet = () => kvSet(KV_WALLET, wallet);

/* 可售列表：内置（未隐藏）+ 自定义 */
function goodsList() {
  return GOODS.filter((g) => !hidden.has(g.id)).concat(custom);
}
const findGoods = (id) => goodsList().find((g) => g.id === id);
const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => round2(cart.reduce((s, i) => s + Number(i.price) * i.qty, 0));

/* 物流状态：按下单经过的时间推进 */
function stateOf(o) {
  if (o.gifted) return { key: 'gifted', label: '已送给 TA' };
  const s = Date.now() - o.ts;
  if (s < 45 * 1000) return { key: 'paid', label: '待发货' };
  if (s < 190 * 1000) return { key: 'ship', label: '配送中' };
  return { key: 'done', label: '已签收' };
}
const STATE_TONE = { paid: 'ship', ship: 'ship', done: 'done', gifted: 'gift' };

/* 商品主视觉：优先图片，其次 emoji 渐变 */
function tileVisual(g, cls) {
  if (g.imgId) {
    const img = el('img', { class: cls + ' sh-img', alt: g.name });
    mediaURL(g.imgId).then((u) => { if (u) img.src = u; });
    return img;
  }
  return el('div', { class: cls, style: { background: `linear-gradient(145deg,${g.bg?.[0] || '#f3f3f2'},${g.bg?.[1] || '#e4e4e2'})` }, text: g.emoji || '🎁' });
}

let view = null;
let tab = 'goods';       // goods | cart | orders
let cat = '全部';
let timer = 0;

export default async function pageShop(v) {
  view = v;
  fullPage({ back: true, title: '商城', sub: '本地小卖部 · 纯属虚构消费', actions: [
    { icon: 'IC-MIO-005', label: '钱包', onclick: walletSheet },
    { icon: 'IC-MIO-003', label: '上架', onclick: () => goodsForm() }
  ] });
  await loadState4();
  await paint();

  timer = setInterval(() => {
    if (view.isConnected && !document.hidden && tab === 'orders') paint();
  }, 12000);
  window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
}

async function loadOrders() {
  return (await all('orders')).sort((a, b) => b.ts - a.ts);
}

async function paint() {
  const orders = await loadOrders();
  view.innerHTML = '';
  const page = el('div', { class: 'page shop' });

  /* 顶部分栏：逛逛 / 购物车 / 订单 */
  const seg = el('div', { class: 'sh-seg' }, [
    segBtn('goods', '逛逛', null),
    segBtn('cart', '购物车', cartCount() || null),
    segBtn('orders', '订单', orders.length || null)
  ]);
  page.appendChild(seg);

  if (tab === 'goods') {
    const chips = el('div', { class: 'wt-chips' });
    ['全部', ...CATS].forEach((c) => chips.appendChild(el('button', {
      class: 'chip' + (cat === c ? ' on' : ''), type: 'button',
      onclick: () => { cat = c; paint(); }
    }, [c])));
    page.appendChild(chips);

    const list = goodsList().filter((g) => cat === '全部' || g.cat === cat);
    const grid = el('div', { class: 'sh-grid' });
    list.forEach((g) => {
      const tile = el('div', { class: 'sh-tile', onclick: () => openGoods(g) }, [
        tileVisual(g, 'sh-emoji'),
        el('div', { class: 'sh-name', text: g.name }),
        el('div', { class: 'sh-row' }, [
          el('span', { class: 'sh-price', text: yuan(g.price) }),
          el('span', { class: 'sh-cat', text: g.cat })
        ])
      ]);
      /* 快速加购：卡右下角小按钮 */
      tile.appendChild(el('button', {
        class: 'sh-add', type: 'button', title: '加入购物车',
        onclick: (e) => { e.stopPropagation(); addCart(g); }
      }, ['🛒']));
      grid.appendChild(tile);
    });
    page.appendChild(grid);
    if (!list.length) page.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-h', text: '这个分类暂时没有商品' })]));
    page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '12px' }, text: '点右下角 🛒 快速加购 · 顶栏「上架」添加你的商品' }));
  } else if (tab === 'cart') {
    paintCart(page);
  } else {
    if (!orders.length) {
      page.appendChild(el('div', { class: 'empty' }, [
        iconImg('IC-MIO-039'),
        el('div', { class: 'e-h', text: '还没有订单' }),
        el('div', { class: 'e-p', text: '去「逛逛」里挑一件，送给 TA 或留给自己' })
      ]));
    } else {
      const total = orders.reduce((s, o) => s + Number(o.price || 0), 0);
      page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', margin: '2px 0 10px' }, text: `共 ${orders.length} 单 · 合计 ${yuan(total)}（虚拟货币，不用真给）` }));
      orders.forEach((o) => page.appendChild(orderCard(o)));
    }
  }

  view.appendChild(page);
}

function segBtn(key, label, badge) {
  return el('button', {
    class: 'sh-seg-btn' + (tab === key ? ' on' : ''),
    onclick: () => { tab = key; paint(); }
  }, [
    label,
    badge ? el('span', { class: 'sh-seg-badge', text: String(badge) }) : null
  ]);
}

/* ---------------- 购物车 ---------------- */
function paintCart(page) {
  if (!cart.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-039'),
      el('div', { class: 'e-h', text: '购物车是空的' }),
      el('div', { class: 'e-p', text: '逛逛里点商品右下角的 🛒 加进来' })
    ]));
    return;
  }
  page.appendChild(el('div', { class: 'sh-cart' }, cart.map((it, idx) => el('div', { class: 'sh-cart-row' }, [
    tileVisual(it, 'sh-cart-emoji'),
    el('div', { class: 'sh-cart-main' }, [
      el('div', { class: 'sh-cart-name', text: it.name }),
      el('div', { class: 'sh-cart-price', text: yuan(it.price) })
    ]),
    el('div', { class: 'sh-cart-qty' }, [
      el('button', { class: 'qty-btn', onclick: () => changeQty(idx, -1) }, ['−']),
      el('span', { class: 'qty-n', text: String(it.qty) }),
      el('button', { class: 'qty-btn', onclick: () => changeQty(idx, 1) }, ['＋'])
    ]),
    el('button', { class: 'sh-cart-del', title: '删除', onclick: () => removeCart(idx) }, [iconImg('IC-CRD-007')])
  ]))));

  page.appendChild(el('div', { class: 'sh-cart-bar' }, [
    el('div', { class: 'sh-cart-sum' }, [
      el('span', { class: 'small muted', text: `共 ${cartCount()} 件 · 余额 ${yuan(wallet)}` }),
      el('span', { class: 'sh-cart-total', text: '合计 ' + yuan(cartTotal()) })
    ]),
    el('div', { class: 'row', style: { gap: '8px' } }, [
      el('button', { class: 'btn sm', onclick: clearCart }, ['清空']),
      el('button', { class: 'btn sm primary', onclick: checkout }, ['去结算'])
    ])
  ]));
}

async function addCart(g) {
  const hit = cart.find((i) => i.goodsId === g.id);
  if (hit) hit.qty += 1;
  else cart.push({ goodsId: g.id, name: g.name, price: g.price, emoji: g.emoji, bg: g.bg, imgId: g.imgId || null, cat: g.cat, qty: 1 });
  await saveCart();
  toast('已加入购物车：' + g.name);
  if (tab === 'cart') paint(); else paint();   // 刷新徽标
}

async function changeQty(idx, delta) {
  const it = cart[idx];
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) cart.splice(idx, 1);
  await saveCart();
  paint();
}

async function removeCart(idx) {
  cart.splice(idx, 1);
  await saveCart();
  paint();
}

async function clearCart() {
  if (!cart.length) return;
  const ok = await confirmBox({ title: '清空购物车', text: '全部移除，确定吗？', danger: true });
  if (!ok) return;
  cart = [];
  await saveCart();
  paint();
}

/* 结算：扣余额 → 生成一笔订单（多件合并） */
async function checkout() {
  if (!cart.length) { toast('购物车是空的'); return; }
  const total = cartTotal();
  if (wallet < total) {
    toast(`余额不足（差 ${yuan(total - wallet)}）`);
    walletSheet();
    return;
  }
  const count = cartCount();
  const first = cart[0];
  const name = cart.length === 1
    ? (first.qty > 1 ? `${first.name} x${first.qty}` : first.name)
    : `${first.name} 等 ${count} 件`;
  wallet = round2(wallet - total);
  await saveWallet();
  await put('orders', {
    id: 'ord_' + uid(),
    itemId: first.goodsId,
    name, emoji: first.emoji, bg: first.bg, imgId: first.imgId || null,
    price: total, cat: first.cat, ts: Date.now(), gifted: false,
    items: cart.map((i) => ({ name: i.name, price: i.price, qty: i.qty }))
  });
  cart = [];
  await saveCart();
  toast(`下单成功：${name}（余额 ${yuan(wallet)}）`);
  tab = 'orders';
  paint();
}

/* ---------------- 钱包 ---------------- */
async function walletSheet() {
  const orders = await loadOrders();
  const spent = round2(orders.reduce((s, o) => s + Number(o.price || 0), 0));
  const valEl = el('div', { class: 'sh-wallet-v', text: yuan(wallet) });
  const subEl = el('div', { class: 'sh-wallet-sub', text: `已消费 ${yuan(spent)} · ${orders.length} 单` });
  const node = el('div', {}, [
    el('div', { class: 'sh-wallet' }, [
      el('div', { class: 'sh-wallet-t', text: '余额（虚拟币）' }),
      valEl,
      subEl
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: '充值（模拟，无需真钱）' }),
      el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        [50, 100, 520, 1000].map((n) => el('button', {
          class: 'chip', type: 'button',
          onclick: async () => {
            wallet = round2(wallet + n);
            await saveWallet();
            valEl.textContent = yuan(wallet);
            toast(`充值 ${yuan(n)}，余额 ${yuan(wallet)}`);
          }
        }, ['+' + n])))
    ]),
    el('div', { class: 'hint', text: '余额只存在于本机，用于商城下单结算。' })
  ]);
  sheet({ title: '钱包', node, actions: [{ label: '关闭', icon: 'IC-CHT-005', onSelect: () => {} }] });
}

/* ---------------- 上架（添加商品） ---------------- */
function goodsForm(g) {   // 传 g=编辑，不传=新建
  let name = g?.name || '';
  let price = g?.price ?? '';
  let desc = g?.desc || '';
  let catV = g?.cat || CATS[0];
  let emoji = g?.emoji || '🎁';
  let imgId = g?.imgId || null;
  let imgEl = null;

  const nameIn = el('input', { class: 'input', placeholder: '商品名称', value: name });
  const priceIn = el('input', { class: 'input', type: 'number', inputmode: 'decimal', placeholder: '价格（元）', value: String(price) });
  const descIn = el('input', { class: 'input', placeholder: '一句话描述（可空）', value: desc });
  const emojiIn = el('input', { class: 'input', style: 'max-width:90px', value: emoji, maxlength: '4' });

  const catChips = el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } });
  const paintCats = () => {
    catChips.innerHTML = '';
    CATS.forEach((c) => catChips.appendChild(el('button', {
      class: 'chip' + (catV === c ? ' on' : ''), type: 'button',
      onclick: () => { catV = c; paintCats(); }
    }, [c])));
  };
  paintCats();

  const preview = el('div', { class: 'sh-form-preview' });
  const paintPreview = () => {
    preview.innerHTML = '';
    if (imgId) {
      imgEl = el('img', { class: 'sh-form-img' });
      mediaURL(imgId).then((u) => { if (u) imgEl.src = u; });
      preview.appendChild(imgEl);
    } else {
      preview.appendChild(el('div', { class: 'sh-form-emoji', text: emoji || '🎁' }));
    }
  };
  paintPreview();
  emojiIn.addEventListener('input', () => { emoji = emojiIn.value.trim() || '🎁'; if (!imgId) paintPreview(); });

  const pickImg = async () => {
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob } = await compressImage(f, 720, 0.85);
    const id = await saveMedia(blob, { type: 'image', source: 'shop' });
    if (imgId) await delMedia(imgId).catch(() => {});
    imgId = id;
    paintPreview();
    toast('已选商品图');
  };

  sheet({
    title: g ? '编辑商品' : '上架商品',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '预览' }), preview,
        el('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, [
          el('button', { class: 'btn sm', onclick: pickImg }, ['选图片']),
          imgId ? el('button', { class: 'btn sm', onclick: async () => { await delMedia(imgId).catch(() => {}); imgId = null; paintPreview(); } }, ['用 emoji']) : null
        ])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '名称' }), nameIn]),
      el('div', { class: 'field' }, [el('label', { text: '价格' }), priceIn]),
      el('div', { class: 'field' }, [el('label', { text: '分类' }), catChips]),
      el('div', { class: 'field' }, [el('label', { text: 'emoji（选图片后忽略）' }), emojiIn]),
      el('div', { class: 'field' }, [el('label', { text: '描述' }), descIn])
    ]),
    actions: [
      {
        label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
          name = nameIn.value.trim();
          price = Number(priceIn.value);
          desc = descIn.value.trim();
          if (!name) { toast('给商品起个名字'); return; }
          if (!(price >= 0)) { toast('填个价格'); return; }
          if (g) {
            Object.assign(g, { name, price, desc, cat: catV, emoji, imgId });
            await saveCustom();
            toast('已更新');
          } else {
            custom.push({ id: 'cg_' + uid(), name, price, desc, cat: catV, emoji, imgId, ts: Date.now() });
            await saveCustom();
            toast('已上架：' + name);
          }
          tab = 'goods';
          await paint();
        }
      }
    ]
  });
}

/* ---------------- 商品详情 + 购买 ---------------- */
function openGoods(g) {
  const mine = g.id.startsWith('cg_');
  sheet({
    title: g.name,
    node: el('div', { class: 'sh-detail' }, [
      el('div', { class: 'sh-detail-hero' }, [tileVisual(g, 'sh-detail-visual')]),
      el('div', { class: 'sh-detail-name', text: g.name }),
      el('div', { class: 'sh-detail-desc', text: g.desc || '（没有描述）' }),
      el('div', { class: 'sh-detail-price', text: yuan(g.price) }),
      mine ? el('div', { class: 'hint', text: '我上架的商品' }) : null
    ]),
    actions: [
      { label: '加入购物车', icon: 'IC-MIO-039', sub: '到「购物车」页签一起结算', onSelect: () => addCart(g) },
      { label: `直接购买（${yuan(g.price)}）`, icon: 'IC-MIO-039', onSelect: () => buy(g) },
      { label: '买下来并送给 TA', icon: 'IC-MOD-005', sub: `作为礼物发到聊天，${state.role.name || 'TA'} 会回应`, onSelect: () => buyAndGift(g) },
      { label: mine ? '编辑商品' : null, icon: 'IC-CRD-006', onSelect: mine ? () => goodsForm(g) : undefined },
      { label: '删除商品', icon: 'IC-CRD-007', danger: true, sub: mine ? '从商城移除我上架的这件' : '从列表隐藏这件内置商品', onSelect: () => removeGoods(g) }
    ].filter((a) => a.label)
  });
}

async function removeGoods(g) {
  const mine = g.id.startsWith('cg_');
  const ok = await confirmBox({
    title: '删除商品',
    text: mine ? `「${g.name}」会从商城移除，确定吗？` : `「${g.name}」会从列表隐藏（内置商品，可再恢复），确定吗？`,
    danger: true, okText: '删除'
  });
  if (!ok) return;
  if (mine) {
    custom = custom.filter((x) => x.id !== g.id);
    if (g.imgId) await delMedia(g.imgId).catch(() => {});
    cart = cart.filter((i) => i.goodsId !== g.id);
    await saveCart();
    await saveCustom();
  } else {
    hidden.add(g.id);
    await saveHidden();
    cart = cart.filter((i) => i.goodsId !== g.id);
    await saveCart();
  }
  toast('已删除：' + g.name);
  await paint();
}

async function buy(g) {
  const price = Number(g.price);
  if (wallet < price) {
    toast(`余额不足（差 ${yuan(price - wallet)}）`);
    walletSheet();
    return false;
  }
  wallet = round2(wallet - price);
  await saveWallet();
  await put('orders', {
    id: 'ord_' + uid(), itemId: g.id, name: g.name, emoji: g.emoji, bg: g.bg,
    imgId: g.imgId || null, price, cat: g.cat, ts: Date.now(), gifted: false
  });
  toast('下单成功：' + g.name + `（余额 ${yuan(wallet)}）`);
  tab = 'orders';
  paint();
  return true;
}

async function buyAndGift(g) {
  const done = await buy(g);
  if (!done) return;
  const orders = await loadOrders();
  await giftOrder(orders[0]);
}

/* ---------------- 订单 ---------------- */
function orderCard(o) {
  const st = stateOf(o);
  const visual = o.imgId
    ? (() => { const img = el('img', { class: 'sh-order-emoji sh-img', alt: '' }); mediaURL(o.imgId).then((u) => { if (u) img.src = u; }); return img; })()
    : el('div', { class: 'sh-order-emoji', style: { background: `linear-gradient(145deg,${o.bg?.[0] || '#eee'},${o.bg?.[1] || '#ddd'})` }, text: o.emoji });
  return el('div', { class: 'card sh-order' }, [
    el('div', { class: 'sh-order-top' }, [
      visual,
      el('div', { class: 'sh-order-main' }, [
        el('div', { class: 'sh-order-name', text: o.name }),
        el('div', { class: 'small muted', text: fmtDay(o.ts) + (o.items?.length > 1 ? ` · ${o.items.length} 种` : '') }),
        el('div', { class: 'sh-order-price', text: yuan(o.price) })
      ]),
      el('span', { class: 'badge sh-state st-' + STATE_TONE[st.key], text: st.label })
    ]),
    el('div', { class: 'sh-order-acts' }, [
      st.key === 'paid' ? el('span', { class: 'small muted', text: '商家拣货中…' }) : null,
      st.key === 'ship' ? el('span', { class: 'small muted', text: '包裹正在路上…' }) : null,
      !o.gifted ? el('button', { class: 'btn sm', onclick: () => giftOrder(o) }, [iconImg('IC-MOD-005'), '送给 TA']) : null,
      st.key === 'done' && !o.gifted ? el('span', { class: 'small muted', text: '也可以留给自己哦' }) : null,
      el('button', { class: 'btn sm sh-del', onclick: () => removeOrder(o) }, [iconImg('IC-CRD-007'), '删除'])
    ])
  ]);
}

async function removeOrder(o) {
  const ok = await confirmBox({ title: '删除订单', text: `「${o.name}」的订单记录会被删掉，确定吗？`, danger: true, okText: '删除' });
  if (!ok) return;
  await del('orders', o.id);
  paint();
}

/* ---------------- 送给 TA：礼物消息进聊天，TA 会回应 ---------------- */
async function giftOrder(o) {
  const m = await sched.addMessage({
    role: 'me', type: 'gift',
    giftName: o.name, emoji: o.emoji, bg: o.bg || ['#eee', '#ddd'], price: o.price
  });
  await put('orders', Object.assign({}, o, { gifted: true }));
  toast(`已把「${o.name}」送给 ${state.role.name || 'TA'}`);
  tab = 'orders';
  paint();
  await sched.replyTo(m);   // TA 慢慢想怎么回应，不挡订单状态
}
