/* 商城 · 本地小卖部
   内置商品 + 我上架的自定义商品（可删，内置的也可隐藏）；
   分类筛选 + 搜索、购物车批量结算、钱包余额支付（模拟充值）；
   购买生成订单存 orders 表，物流按经过时间自动推进：
   待发货 → 配送中 → 已签收；签收前后都可以「送给 TA」（还能附一句话）。
   顶栏「设置」管 TA 的送礼 / 心愿单 / 自己购物概率与商品数据导入导出。 */

import { el, uid, fmtDay, openFile, readText, compressImage } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { all, put, del, kvGet, kvSet } from '../store.js';
import { mediaURL, saveMedia, delMedia } from '../media.js';
import { sheet, confirmBox, toast } from '../ui.js';
import { state } from '../state.js';
import * as sched from '../scheduler.js';
import {
  GOODS, CATS, KV_CUSTOM, KV_CART, KV_HIDDEN, KV_WALLET, DEFAULT_WALLET,
  yuan, round2, tileVisual, getShopSet, saveShopSet,
  toggleWishMine, inWishMine, shopDemo, exportShopData, importShopData
} from '../shopcore.js';
import { section } from './roleParts.js';

let view = null;
let tab = 'goods';       // goods | cart | orders
let cat = '全部';
let q = '';              // 搜索词（逛逛页）
let timer = 0;

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
const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => round2(cart.reduce((s, i) => s + Number(i.price) * i.qty, 0));

/* 所有出现过的分类（内置 + 自定义，去重保序） */
function allCats() {
  const out = [...CATS];
  goodsList().forEach((g) => { if (g.cat && !out.includes(g.cat)) out.push(g.cat); });
  return out;
}

/* 物流状态：按下单经过的时间推进 */
function stateOf(o) {
  if (o.gifted) return { key: 'gifted', label: '已送给 TA' };
  const s = Date.now() - o.ts;
  if (s < 45 * 1000) return { key: 'paid', label: '待发货' };
  if (s < 190 * 1000) return { key: 'ship', label: '配送中' };
  return { key: 'done', label: '已签收' };
}
const STATE_TONE = { paid: 'ship', ship: 'ship', done: 'done', gifted: 'gift' };

export default async function pageShop(v) {
  view = v;
  fullPage({ back: true, title: '商城', sub: '本地小卖部 · 纯属虚构消费', actions: [
    { icon: 'IC-MIO-005', label: '钱包', onclick: walletSheet },
    { icon: 'IC-MIO-001', label: '设置', onclick: () => settingsSheet() },
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

  /* 顶部分栏：逛逛 / 购物车 / 订单 + 储藏室入口（订单后面不再挂数字） */
  const seg = el('div', { class: 'sh-seg' }, [
    segBtn('goods', '逛逛', null),
    segBtn('cart', '购物车', cartCount() || null),
    segBtn('orders', '订单', null),
    el('button', { class: 'sh-seg-btn sh-seg-store', title: '储藏室', onclick: () => go('/store') }, ['储藏室'])
  ]);
  page.appendChild(seg);

  if (tab === 'goods') {
    await paintGoods(page);
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

/* ---------------- 逛逛：搜索 + 分类 + 商品网格 ---------------- */
async function paintGoods(page) {
  /* 搜索框：只重画下面的列表，输入时不会丢焦点 */
  const search = el('input', { class: 'input sh-search', placeholder: '搜商品 / 分类 / 描述', value: q });
  page.appendChild(el('div', { class: 'sh-tools' }, [search]));

  const chipsBox = el('div', { class: 'wt-chips sh-chips' });
  page.appendChild(chipsBox);

  const listBox = el('div', { class: 'sh-list' });
  page.appendChild(listBox);

  const filtered = () => {
    const k = q.trim().toLowerCase();
    return goodsList().filter((g) =>
      (cat === '全部' || g.cat === cat) &&
      (!k ||
        String(g.name || '').toLowerCase().includes(k) ||
        String(g.desc || '').toLowerCase().includes(k) ||
        String(g.cat || '').toLowerCase().includes(k) ||
        (g.emoji || '') === k)
    );
  };

  function repaintChips() {
    chipsBox.innerHTML = '';
    ['全部', ...allCats()].forEach((c) => chipsBox.appendChild(el('button', {
      class: 'chip' + (cat === c ? ' on' : ''), type: 'button',
      onclick: () => { cat = c; repaintChips(); repaintList(); }
    }, [c])));
  }

  function repaintList() {
    const list = filtered();
    listBox.innerHTML = '';
    const grid = el('div', { class: 'sh-grid' });
    list.forEach((g) => {
      const addBtn = el('button', {
        class: 'sh-add', type: 'button', title: '加入购物车',
        onclick: (e) => { e.stopPropagation(); addCart(g); }
      }, ['🛒']);
      /* 卡片结构：图 / 名字 / （价格 …… 分类 + 快速加购）
         分类角标和购物车按钮排在一行的两端，不再叠在一起 */
      grid.appendChild(el('div', { class: 'sh-tile', onclick: () => openGoods(g) }, [
        tileVisual(g, 'sh-emoji'),
        el('div', { class: 'sh-name', text: g.name }),
        el('div', { class: 'sh-row' }, [
          el('span', { class: 'sh-price', text: yuan(g.price) }),
          el('span', { class: 'sh-row-r' }, [
            el('span', { class: 'sh-cat', text: g.cat }),
            addBtn
          ])
        ])
      ]));
    });
    listBox.appendChild(grid);
    if (!list.length) {
      listBox.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'e-h', text: cat === '全部' && q ? '没找到相关商品' : '这个分类暂时没有商品' }),
        el('div', { class: 'e-p', text: cat !== '全部' || q ? '换个分类或搜索词试试' : '点顶栏「上架」添加你的商品' })
      ]));
    }
    listBox.appendChild(el('div', {
      class: 'hint', style: { textAlign: 'center', marginTop: '12px' },
      text: '点价格旁的 🛒 快速加购 · 顶栏「设置」管 TA 的送礼与心愿 · 首页「储藏室」收着所有礼物'
    }));
  }

  search.addEventListener('input', () => { q = search.value; repaintList(); });
  repaintChips();
  repaintList();
}

/* ---------------- 购物车 ---------------- */
function paintCart(page) {
  if (!cart.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-039'),
      el('div', { class: 'e-h', text: '购物车是空的' }),
      el('div', { class: 'e-p', text: '逛逛里点商品价格旁的 🛒 加进来' })
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
  paint();   // 刷新徽标
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

/* ============================================================
   商城设置：TA 的送礼 / 心愿单 / 自己购物概率 + 数据导入导出
   ============================================================ */
function setRow(title, desc, ...ctl) {
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-main' }, [
      el('div', { class: 'set-t', text: title }),
      desc ? el('div', { class: 'set-s', text: desc }) : null
    ]),
    el('div', { class: 'set-ctl' }, ctl)
  ]);
}

async function settingsSheet() {
  const s = await getShopSet();
  const ui = {};                       // 概率 key → { sync(v) }，上下限互相拖动时同步对面
  const save = () => saveShopSet();

  const toggleRow = (key, title, desc) => {
    const sw = el('button', { class: 'sw' + (s[key] ? ' on' : ''), type: 'button' });
    sw.addEventListener('click', () => {
      sw.classList.toggle('on');
      s[key] = sw.classList.contains('on');
      save();
    });
    return setRow(title, desc, sw);
  };

  /* 概率行：滑杆 + 数字输入双向联动；下限拖过上限会把上限一起抬上去（反之亦然） */
  const pctRow = (key, loKey, hiKey, title, desc) => {
    const range = el('input', { class: 'set-range', type: 'range', min: '0', max: '100', step: '1' });
    const num = el('input', { class: 'set-num set-pct-num', type: 'number', inputmode: 'numeric', min: '0', max: '100', step: '1' });
    num.style.width = '54px';
    range.value = String(s[key]);
    num.value = String(s[key]);
    const sync = (v) => { range.value = String(v); num.value = String(v); };
    const commit = (v) => {
      v = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
      if (key === loKey && v > s[hiKey]) { s[hiKey] = v; ui[hiKey]?.sync(v); }
      if (key === hiKey && v < s[loKey]) { s[loKey] = v; ui[loKey]?.sync(v); }
      s[key] = v;
      save();
      return v;
    };
    range.addEventListener('input', () => { const v = Number(range.value); sync(v); s[key] = v; save(); });
    range.addEventListener('change', () => sync(commit(range.value)));
    num.addEventListener('focus', () => num.select());
    num.addEventListener('input', () => {
      const raw = num.value.trim();
      if (raw === '') return;
      const v = Number(raw);
      if (!Number.isFinite(v)) return;
      const c = Math.min(100, Math.max(0, Math.round(v)));
      sync(c); s[key] = c; save();
    });
    num.addEventListener('blur', () => sync(commit(num.value)));
    ui[key] = { sync };
    return setRow(title, desc, range, num, el('span', { class: 'set-val set-pct-suf', text: '%' }));
  };

  const btnRow = (title, desc, label, fn) => setRow(title, desc,
    el('button', { class: 'btn sm', type: 'button', onclick: fn }, [label]));

  const node = el('div', { class: 'shop-set' }, [
    section('他送我礼物', el('div', { class: 'set-card' }, [
      toggleRow('taGiftEnabled', '让 TA 主动送我礼物', '打开后 TA 会隔三差五买件礼物送你，礼物进储藏室「他送给我的」，聊天里也会收到卡片'),
      pctRow('taGiftPctMin', 'taGiftPctMin', 'taGiftPctMax', '送我礼物概率 · 下限', '每次机会都在「下限~上限」之间抽一个概率'),
      pctRow('taGiftPctMax', 'taGiftPctMin', 'taGiftPctMax', '送我礼物概率 · 上限', '设为 0 即不会送')
    ])),

    section('心愿单', el('div', { class: 'set-card' }, [
      toggleRow('wishEnabled', '心愿单功能', 'TA 可能买我心愿单里的礼物送我；TA 也会把想要的商品加进自己的心愿单'),
      pctRow('wishBuyMineMin', 'wishBuyMineMin', 'wishBuyMineMax', 'TA 买下我心愿单商品的概率 · 下限', '命中后 TA 买下它送我，这份心愿自动从心愿单移除'),
      pctRow('wishBuyMineMax', 'wishBuyMineMin', 'wishBuyMineMax', 'TA 买下我心愿单商品的概率 · 上限', ''),
      pctRow('wishAddTaMin', 'wishAddTaMin', 'wishAddTaMax', 'TA 加进自己心愿单的概率 · 下限', 'TA 挑一件想要的商品记进「TA 的心愿单」'),
      pctRow('wishAddTaMax', 'wishAddTaMin', 'wishAddTaMax', 'TA 加进自己心愿单的概率 · 上限', ''),
      pctRow('wishChatMin', 'wishChatMin', 'wishChatMax', 'TA 的心愿发到聊天的概率 · 下限', 'TA 加心愿时按概率发一张卡片到聊天，你点【送 TA】即可买下送出'),
      pctRow('wishChatMax', 'wishChatMin', 'wishChatMax', 'TA 的心愿发到聊天的概率 · 上限', '')
    ])),

    section('TA 自己的花销', el('div', { class: 'set-card' }, [
      pctRow('taSelfGiftMin', 'taSelfGiftMin', 'taSelfGiftMax', 'TA 自己买礼物给自己的概率 · 下限', '命中后 TA 买一件给自己，进储藏室「他自己买的」，并在聊天里说一声'),
      pctRow('taSelfGiftMax', 'taSelfGiftMin', 'taSelfGiftMax', 'TA 自己买礼物给自己的概率 · 上限', '上限设 0 = 关闭'),
      pctRow('taHoardMin', 'taHoardMin', 'taHoardMax', 'TA 自己买（囤货）的概率 · 下限', '随机囤一件商品存着，不发消息'),
      pctRow('taHoardMax', 'taHoardMin', 'taHoardMax', 'TA 自己买（囤货）的概率 · 上限', '上限设 0 = 关闭')
    ])),

    section('试一试', el('div', { class: 'set-card' }, [
      btnRow('让 TA 现在试一次', '按当前打开的开关直接演示一回，不用干等', '试一次', async () => {
        const msg = await shopDemo();
        toast(msg || '先把上面的开关打开，我才知道演哪一出');
      }),
      el('div', { class: 'hint', style: { padding: '10px 0 14px' }, text: '每个行为每隔几分钟掷一次骰子，命中才发生；所有礼物都收在首页「储藏室」。' })
    ])),

    section('商品数据', el('div', { class: 'set-card' }, [
      btnRow('导出商品数据', '我上架的商品 + 图片 + 被隐藏的内置商品，存成一个 JSON', '导出', async () => {
        try {
          const n = await exportShopData();
          toast(n ? `已导出 ${n} 件自定义商品` : '没有自定义商品可导出');
        } catch (e) { toast('导出失败：' + (e && e.message)); }
      }),
      btnRow('导入商品数据', '选择之前导出的 JSON，同 id 覆盖、其余追加，图片一起还原', '导入', async () => {
        const f = await openFile({ accept: '.json,application/json' });
        if (!f) return;
        try {
          const data = JSON.parse(await readText(f));
          const r = await importShopData(data);
          await loadState4();
          tab = 'goods';
          await paint();
          toast(`导入完成：新增 ${r.added} 件 · 更新 ${r.updated} 件`);
        } catch (e) { toast('导入失败：' + (e && e.message)); }
      })
    ]))
  ]);

  sheet({
    title: '商城设置',
    node,
    actions: [{ label: '完成', icon: 'IC-MIO-021', onSelect: () => {} }]
  });
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
    allCats().forEach((c) => catChips.appendChild(el('button', {
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
async function openGoods(g) {
  const mine = g.id.startsWith('cg_');
  const inWish = await inWishMine(g.id);
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
      { label: '买下来并送给 TA', icon: 'IC-MOD-005', sub: '可以带一句话给 TA（也可以不写）', onSelect: () => buyAndGift(g) },
      {
        label: inWish ? '移出我的心愿单' : '加入我的心愿单', icon: 'IC-MIO-020',
        sub: inWish ? 'TA 就不会买它送你了' : 'TA 可能按概率买下它送给你',
        onSelect: async () => {
          const added = await toggleWishMine(g);
          toast(added ? '已加入我的心愿单' : '已移出我的心愿单');
        }
      },
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
  await giftFlow(orders[0]);
}

/* ---------------- 订单 ---------------- */
function orderCard(o) {
  const st = stateOf(o);
  return el('div', { class: 'card sh-order' }, [
    el('div', { class: 'sh-order-top' }, [
      tileVisual(o, 'sh-order-emoji'),
      el('div', { class: 'sh-order-main' }, [
        el('div', { class: 'sh-order-name', text: o.name }),
        el('div', { class: 'small muted', text: fmtDay(o.ts) + (o.items?.length > 1 ? ` · ${o.items.length} 种` : '') }),
        el('div', { class: 'sh-order-price', text: yuan(o.price) })
      ]),
      el('span', { class: 'badge sh-state st-' + STATE_TONE[st.key], text: st.label })
    ]),
    o.note ? el('div', { class: 'sh-order-note', text: '带的话：' + o.note }) : null,
    el('div', { class: 'sh-order-acts' }, [
      st.key === 'paid' ? el('span', { class: 'small muted', text: '商家拣货中…' }) : null,
      st.key === 'ship' ? el('span', { class: 'small muted', text: '包裹正在路上…' }) : null,
      !o.gifted ? el('button', { class: 'btn sm', onclick: () => giftFlow(o) }, [iconImg('IC-MOD-005'), '送给 TA']) : null,
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

/* ---------------- 送给 TA：先问要不要带一句话 ---------------- */
function giftFlow(o) {
  const ta = state.role.name || 'TA';
  const note = el('textarea', {
    class: 'input', style: { minHeight: '78px', resize: 'vertical', lineHeight: '1.6' },
    maxlength: '120', placeholder: `给 ${ta} 留一句话（可不写）`
  });
  note.value = o.note || '';
  sheet({
    title: '送礼物给 ' + ta,
    node: el('div', {}, [
      el('div', { class: 'hint', style: { padding: '4px 0 12px' }, text: `「${o.name}」· ${yuan(o.price)}，会以礼物卡片发到聊天` }),
      el('div', { class: 'field' }, [el('label', { text: '带给他的话（选填）' }), note])
    ]),
    actions: [
      { label: '写一句话送出', icon: 'IC-MOD-005', onSelect: () => giftOrder(o, note.value.trim()) },
      { label: '不写了，直接送', icon: 'IC-MIO-005', onSelect: () => giftOrder(o, '') }
    ]
  });
}

/* 礼物消息进聊天，TA 会回应 */
async function giftOrder(o, note = '') {
  const m = await sched.addMessage({
    role: 'me', type: 'gift',
    giftName: o.name, emoji: o.emoji, bg: o.bg || ['#eee', '#ddd'],
    price: o.price, imgId: o.imgId || null, note: note || ''
  });
  await put('orders', Object.assign({}, o, { gifted: true, note: note || '' }));
  toast(note ? `已把「${o.name}」和你的话送给 ${state.role.name || 'TA'}` : `已把「${o.name}」送给 ${state.role.name || 'TA'}`);
  tab = 'orders';
  paint();
  await sched.replyTo(m);   // TA 慢慢想怎么回应，不挡订单状态
}
