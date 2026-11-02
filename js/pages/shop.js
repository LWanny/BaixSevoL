/* 商城 · 本地小卖部
   商品是内置清单（无需网络），购买生成订单存 orders 表；
   物流按经过时间自动推进：待发货 → 配送中 → 已签收；
   签收前后都可以「送给 TA」——礼物会作为一条礼物消息发进聊天，TA 会回应。 */

import { el, uid, fmtDay } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { sheet, confirmBox, toast } from '../ui.js';
import { state } from '../state.js';
import * as sched from '../scheduler.js';

/* ---------------- 商品清单 ---------------- */
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
const CATS = ['全部', '零食', '礼物', '数码', '生活', '穿搭'];

const yuan = (n) => '¥' + Number(n || 0).toFixed(2);
const goodsOf = (id) => GOODS.find((g) => g.id === id);

/* 物流状态：按下单经过的时间推进 */
function stateOf(o) {
  if (o.gifted) return { key: 'gifted', label: '已送给 TA' };
  const s = Date.now() - o.ts;
  if (s < 45 * 1000) return { key: 'paid', label: '待发货' };
  if (s < 190 * 1000) return { key: 'ship', label: '配送中' };
  return { key: 'done', label: '已签收' };
}
const STATE_TONE = { paid: 'ship', ship: 'ship', done: 'done', gifted: 'gift' };

let view = null;
let tab = 'goods';       // goods | orders
let cat = '全部';
let timer = 0;

export default async function pageShop(v) {
  view = v;
  fullPage({ back: true, title: '商城', sub: '本地小卖部 · 纯属虚构消费' });
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

  /* 顶部分栏：逛逛 / 订单 */
  const seg = el('div', { class: 'sh-seg' }, [
    segBtn('goods', '逛逛', null),
    segBtn('orders', '订单', orders.length || null)
  ]);
  page.appendChild(seg);

  if (tab === 'goods') {
    const chips = el('div', { class: 'wt-chips' });
    CATS.forEach((c) => chips.appendChild(el('button', {
      class: 'chip' + (cat === c ? ' on' : ''), type: 'button',
      onclick: () => { cat = c; paint(); }
    }, [c])));
    page.appendChild(chips);

    const grid = el('div', { class: 'sh-grid' });
    GOODS.filter((g) => cat === '全部' || g.cat === cat).forEach((g) => {
      grid.appendChild(el('div', { class: 'sh-tile', onclick: () => openGoods(g) }, [
        el('div', { class: 'sh-emoji', style: { background: `linear-gradient(145deg,${g.bg[0]},${g.bg[1]})` }, text: g.emoji }),
        el('div', { class: 'sh-name', text: g.name }),
        el('div', { class: 'sh-row' }, [
          el('span', { class: 'sh-price', text: yuan(g.price) }),
          el('span', { class: 'sh-cat', text: g.cat })
        ])
      ]));
    });
    page.appendChild(grid);
    if (!grid.children.length) page.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'e-h', text: '这个分类暂时没有商品' })]));
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

/* ---------------- 商品详情 + 购买 ---------------- */
function openGoods(g) {
  sheet({
    title: g.name,
    node: el('div', { class: 'sh-detail' }, [
      el('div', { class: 'sh-detail-hero', style: { background: `linear-gradient(145deg,${g.bg[0]},${g.bg[1]})` }, text: g.emoji }),
      el('div', { class: 'sh-detail-name', text: g.name }),
      el('div', { class: 'sh-detail-desc', text: g.desc }),
      el('div', { class: 'sh-detail-price', text: yuan(g.price) })
    ]),
    actions: [
      { label: `买下来（${yuan(g.price)}）`, icon: 'IC-MIO-039', onSelect: () => buy(g) },
      { label: '买下来并送给 TA', icon: 'IC-MOD-005', sub: `作为礼物发到聊天，${state.role.name || 'TA'} 会回应`, onSelect: () => buyAndGift(g) }
    ]
  });
}

async function buy(g) {
  await put('orders', { id: 'ord_' + uid(), itemId: g.id, name: g.name, emoji: g.emoji, bg: g.bg, price: g.price, cat: g.cat, ts: Date.now(), gifted: false });
  toast('下单成功：' + g.name);
  tab = 'orders';
  paint();
}

async function buyAndGift(g) {
  await buy(g);
  const orders = await loadOrders();
  await giftOrder(orders[0]);
}

/* ---------------- 订单 ---------------- */
function orderCard(o) {
  const st = stateOf(o);
  return el('div', { class: 'card sh-order' }, [
    el('div', { class: 'sh-order-top' }, [
      el('div', { class: 'sh-order-emoji', style: { background: `linear-gradient(145deg,${o.bg?.[0] || '#eee'},${o.bg?.[1] || '#ddd'})` }, text: o.emoji }),
      el('div', { class: 'sh-order-main' }, [
        el('div', { class: 'sh-order-name', text: o.name }),
        el('div', { class: 'small muted', text: fmtDay(o.ts) }),
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
