/* 拼夕夕 · 本地拼团小卖部（戏仿某多多）
   红底搜索栏 + 热搜词 + 分类筛选 + 双列商品卡片瀑布流；
   点卡片看详情，发起拼单后订单进 orders 表（物流复用商城订单页，可送 TA）。 */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put } from '../store.js';
import { sheet, toast } from '../ui.js';
import { state } from '../state.js';

/* ---------------- 商品清单（拼多多风长标题） ---------------- */
const GOODS = [
  { id: 'p_blue',  title: '云南高山蓝莓 2盒装 当季新鲜大果 爆汁酸甜 顺丰包邮', price: 9.9,  orig: 19.9, sold: '10万+', cat: '食品', tags: ['包邮', '秒杀'], emoji: '🫐', bg: ['#e8eefc', '#9db3e6'], shop: '果滋鲜果专营店' },
  { id: 'p_socks', title: '纯棉袜子男女秋季中筒袜 10双装 防臭吸汗不掉跟', price: 8.8,  orig: 16.9, sold: '5.6万', cat: '服饰', tags: ['包邮'], emoji: '🧦', bg: ['#eee8f6', '#c5b8dd'], shop: '暖足袜业旗舰店' },
  { id: 'p_pillow', title: '抖音同款网红抱枕 毛绒绒超软 会发热的暖手抱枕', price: 15.8, orig: 29.9, sold: '2.3万', cat: '家居', tags: ['包邮', '新品'], emoji: '🧸', bg: ['#f5e6cf', '#d9b98a'], shop: '软乎乎家居旗舰店' },
  { id: 'p_cable', title: '数据线三合一 1米编织 抗拉扯 快充不弹窗', price: 3.9,  orig: 9.9,  sold: '20万+', cat: '数码', tags: ['秒杀'], emoji: '🔌', bg: ['#e2e8f0', '#a9b8cc'], shop: '极连数码专营店' },
  { id: 'p_soy',   title: '酿造酱油 1.9L 特级生抽 老抽王 炒菜提鲜', price: 6.9,  orig: 12.9, sold: '8.8万', cat: '食品', tags: ['包邮'], emoji: '🧂', bg: ['#f3dfd2', '#cfa08c'], shop: '老灶调味食品店' },
  { id: 'p_hoodie', title: '女士秋季新款卫衣 宽松oversize 加绒加厚 显瘦', price: 39,   orig: 79,   sold: '1.1万', cat: '服饰', tags: ['新品', '券'], emoji: '🧥', bg: ['#e3ecf6', '#b0c3da'], shop: '南风服饰旗舰店' },
  { id: 'p_case',  title: '手机壳硅胶软壳 全包防摔 情侣款一对 颜色随机', price: 4.5,  orig: 12,   sold: '15万+', cat: '数码', tags: ['秒杀'], emoji: '📱', bg: ['#e8f0e2', '#b3ccb4'], shop: '壳里壳气数码店' },
  { id: 'p_slip',  title: '拖鞋女夏季居家防滑静音 软底踩屎感 一踩就爱上', price: 7.7,  orig: 15.9, sold: '6.6万', cat: '家居', tags: ['包邮'], emoji: '🩴', bg: ['#fdf3d1', '#e8cf87'], shop: '步步软家居旗舰店' },
  { id: 'p_cat',   title: '猫条流质零食 20支装 营养增肥发腮 猫咪抢着吃', price: 12.9, orig: 25.9, sold: '4.9万', cat: '萌宠', tags: ['包邮', '券'], emoji: '🐱', bg: ['#fde2e4', '#f4a9b0'], shop: '喵满仓宠物用品店' },
  { id: 'p_paper', title: '抽纸40包 4层加厚 家用实惠装 母婴可用', price: 14.9, orig: 29.9, sold: '30万+', cat: '家居', tags: ['包邮', '秒杀'], emoji: '🧻', bg: ['#f0f4f0', '#b9ccbb'], shop: '绵柔纸品旗舰店' },
  { id: 'p_rose',  title: '玫瑰花苗带花苞 四季开花 好养活 阳台庭院', price: 5.1,  orig: 10.8, sold: '3.3万', cat: '家居', tags: ['新品'], emoji: '🌹', bg: ['#fbe3e0', '#e7b1a8'], shop: '花不谢园艺场' },
  { id: 'p_lip',   title: '口红小样正品大牌色号 显白不拔干 限抢1支', price: 9.9,  orig: 39,   sold: '9.9万', cat: '美妆', tags: ['秒杀', '券'], emoji: '💄', bg: ['#fce4ec', '#f0b6c8'], shop: '美妆严选折扣店' },
  { id: 'p_stick', title: '逗猫棒逗猫神器 自嗨解闷 铃铛羽毛 猫主子最爱', price: 2.8,  orig: 6.9,  sold: '7.7万', cat: '萌宠', tags: ['秒杀'], emoji: '🪶', bg: ['#e4efdd', '#b1cfa0'], shop: '喵满仓宠物用品店' },
  { id: 'p_cup',   title: '保温杯316不锈钢大容量 学生水杯 24小时保温', price: 13.2, orig: 39.9, sold: '12万+', cat: '家居', tags: ['包邮', '券'], emoji: '🥤', bg: ['#dfe6f5', '#9fb0e0'], shop: '杯子控家居专营店' },
  { id: 'p_wash',  title: '男士专用洗面奶 控油祛痘 清爽不紧绷 100g', price: 8.5,  orig: 19.9, sold: '2.8万', cat: '美妆', tags: ['包邮'], emoji: '🧴', bg: ['#e8eefc', '#a7bde8'], shop: '型男理容旗舰店' },
  { id: 'p_snack', title: '网红零食大礼包整箱30包 追剧解馋 一箱吃一个月', price: 19.9, orig: 45.9, sold: '18万+', cat: '食品', tags: ['包邮', '券'], emoji: '🍿', bg: ['#fde8d8', '#f4c197'], shop: '馋嘴熊零食专营店' },
  { id: 'p_hold',  title: '车载手机支架重力感应 万向旋转 出行必备', price: 6.6,  orig: 16.9, sold: '5.1万', cat: '数码', tags: ['包邮'], emoji: '🚗', bg: ['#eee8f6', '#bfb2dc'], shop: '极连数码专营店' },
  { id: 'p_gown',  title: '睡裙女夏季纯棉短袖宽松 舒服到不想脱 可外穿', price: 24.9, orig: 49.9, sold: '1.8万', cat: '服饰', tags: ['新品', '券'], emoji: '👗', bg: ['#efe3f7', '#cdb3e3'], shop: '南风服饰旗舰店' }
];
const CATS = ['全部', '食品', '家居', '服饰', '数码', '美妆', '萌宠'];
const HOT = ['抽纸', '猫条', '蓝莓', '手机壳', '零食大礼包', '保温杯'];

const CAT_TONE = { 秒杀: 'hot', 包邮: 'free', 新品: 'new', 券: 'quan' };

let view = null;
let kw = '';
let cat = '全部';
let listEl = null;

export default async function pagePdd(v) {
  view = v;
  kw = '';
  cat = '全部';
  fullPage({ back: true, title: '拼夕夕', sub: '拼着买 · 更便宜 · 本地演出' });
  await paint();
}

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page pdd' });

  /* 红底搜索栏 */
  const input = el('input', {
    class: 'pdd-search-input', type: 'search', placeholder: '拼夕夕 · 搜一下什么都省', value: kw
  });
  input.addEventListener('input', () => { kw = input.value.trim(); paintList(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

  page.appendChild(el('div', { class: 'pdd-search' }, [
    el('div', { class: 'pdd-search-box' }, [
      iconImg('IC-MIO-016', 'pdd-ic'),
      input,
      kw ? el('button', { class: 'pdd-clear', type: 'button', onclick: () => { kw = ''; paint(); } }, ['✕']) : null
    ]),
    el('button', { class: 'pdd-search-btn', type: 'button', onclick: () => input.blur() }, ['搜索'])
  ]));

  /* 热搜词 */
  const hot = el('div', { class: 'pdd-hot' }, [el('span', { class: 'pdd-hot-t', text: '热搜：' })]);
  HOT.forEach((w) => hot.appendChild(el('button', {
    class: 'pdd-hot-word', type: 'button', onclick: () => { kw = w; paint(); }
  }, [w])));
  page.appendChild(hot);

  /* 分类 */
  const chips = el('div', { class: 'wt-chips pdd-chips' });
  CATS.forEach((c) => chips.appendChild(el('button', {
    class: 'chip' + (cat === c ? ' on' : ''), type: 'button',
    onclick: () => { cat = c; paint(); }
  }, [c])));
  page.appendChild(chips);

  listEl = el('div', { class: 'pdd-grid' });
  page.appendChild(listEl);
  paintList();

  view.appendChild(page);
}

/* 商品列表（搜索 / 分类过滤） */
function paintList() {
  if (!listEl) return;
  const k = kw.toLowerCase();
  const items = GOODS.filter((g) =>
    (cat === '全部' || g.cat === cat) &&
    (!k || g.title.toLowerCase().includes(k) || g.shop.toLowerCase().includes(k) || g.cat.toLowerCase().includes(k))
  );

  listEl.innerHTML = '';
  if (!items.length) {
    listEl.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'e-h', text: `没搜到「${kw}」` }),
      el('div', { class: 'e-p', text: '换个词试试，或者去别的分类逛逛' })
    ]));
    return;
  }
  items.forEach((g) => listEl.appendChild(card(g)));
}

/* 商品卡片 */
function card(g) {
  return el('div', { class: 'pdd-card', onclick: () => openGoods(g) }, [
    el('div', { class: 'pdd-cover', style: { background: `linear-gradient(145deg,${g.bg[0]},${g.bg[1]})` } }, [
      el('span', { text: g.emoji }),
      g.tags.includes('秒杀') ? el('i', { class: 'pdd-corner', text: '秒杀' }) : null
    ]),
    el('div', { class: 'pdd-title', text: g.title }),
    priceRow(g),
    el('div', { class: 'pdd-sold', text: `已拼 ${g.sold} 件` }),
    el('div', { class: 'pdd-tags' }, [
      ...g.tags.map((t) => el('span', { class: 'pdd-tag ' + (CAT_TONE[t] || ''), text: t })),
      el('span', { class: 'pdd-shop', text: g.shop })
    ])
  ]);
}

/* 拼夕夕价格分级：¥ 小、整数大、小数小、单买价划线 */
function priceRow(g) {
  const [int, dec] = g.price.toFixed(2).split('.');
  return el('div', { class: 'pdd-price-row' }, [
    el('span', { class: 'pdd-price' }, [
      el('i', { text: '¥' }),
      el('b', { text: int }),
      el('i', { text: '.' + dec })
    ]),
    el('span', { class: 'pdd-orig', text: `单买 ¥${g.orig.toFixed(2)}` })
  ]);
}

/* 详情 + 发起拼单 */
function openGoods(g) {
  const reviews = [
    el('div', { class: 'pdd-review' }, [
      el('div', { class: 'pdd-review-h' }, [
        el('b', { text: '物**流' }), el('span', { class: 'pdd-review-star', text: '★★★★★' })
      ]),
      el('div', { class: 'pdd-review-t', text: '好耶！和图片一样，拼着买果然便宜，隔壁 TA 都羡慕了。' })
    ]),
    el('div', { class: 'pdd-review' }, [
      el('div', { class: 'pdd-review-h' }, [
        el('b', { text: '路**人' }), el('span', { class: 'pdd-review-star', text: '★★★★☆' })
      ]),
      el('div', { class: 'pdd-review-t', text: '物流很快，包装严实。就是拼单得找人，还好 TA 秒拼。' })
    ])
  ];

  const node = el('div', { class: 'pdd-detail' }, [
    el('div', { class: 'pdd-detail-cover', style: { background: `linear-gradient(145deg,${g.bg[0]},${g.bg[1]})` }, text: g.emoji }),
    el('div', { class: 'pdd-detail-title', text: g.title }),
    priceRow(g),
    el('div', { class: 'pdd-detail-meta' }, [
      el('span', { text: `已拼 ${g.sold} 件` }),
      el('span', { text: g.shop }),
      el('span', { text: '顺丰包邮 · 假一赔十' })
    ]),
    el('div', { class: 'pdd-reviews' }, reviews)
  ]);

  sheet({
    title: '拼单详情',
    node,
    actions: [
      { label: `发起拼单（¥${g.price.toFixed(2)}）`, icon: 'IC-MIO-041', sub: `单买要 ¥${g.orig.toFixed(2)}，拼着买立省 ¥${(g.orig - g.price).toFixed(2)}`, onSelect: () => buy(g) },
      { label: '先逛逛再说', icon: 'IC-MIO-004' }
    ]
  });
}

async function buy(g) {
  await put('orders', {
    id: 'ord_' + uid(), source: 'pdd', itemId: g.id,
    name: g.title, emoji: g.emoji, bg: g.bg, price: g.price, cat: g.cat,
    ts: Date.now(), gifted: false
  });
  toast(`已发起拼单，等 ${state.role.name || 'TA'} 来拼！`);
}
