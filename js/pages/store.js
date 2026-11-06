/* 储藏室 · 礼物与心愿的小仓库
   三份库存：TA 送给我的 / 我送给 TA 的 / TA 自己买的；
   两份心愿单：我的（TA 可能买下送我）与 TA 的（我点【送 TA】买下送出）。
   心愿被买下送出后会自动从心愿单里移除。 */

import { el, fmtDay } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { confirmBox, toast } from '../ui.js';
import { state } from '../state.js';
import { getStore, saveStore, getWish, saveWish, buyWishForTa, tileVisual, yuan } from '../shopcore.js';
import { updateMessage } from '../scheduler.js';

const TABS = [
  ['fromTa', '他送给我的'],
  ['fromMe', '我送给他的'],
  ['taOwn', '他自己买的'],
  ['wish', '心愿单']
];
const STOCK_HINT = {
  fromTa: 'TA 买给你的心意都收在这里',
  fromMe: '你送给 TA 的礼物记录',
  taOwn: 'TA 自己买给自己 / 囤的东西'
};

let view = null;
let tab = 'fromTa';

export default async function pageStore(v) {
  view = v;
  fullPage({
    back: true, title: '储藏室', sub: '礼物存货 · 双方心愿单',
    actions: [{ icon: 'IC-MIO-039', label: '商城', onclick: () => go('/shop') }]
  });
  await paint();
}

async function paint() {
  const store = await getStore();
  const wish = await getWish();
  view.innerHTML = '';
  const page = el('div', { class: 'page store' });

  page.appendChild(el('div', { class: 'sh-seg st-seg' }, TABS.map(([k, label]) => el('button', {
    class: 'sh-seg-btn' + (tab === k ? ' on' : ''),
    onclick: () => { tab = k; paint(); }
  }, [label]))));

  if (tab === 'wish') paintWish(page, wish);
  else paintStock(page, store[tab] || [], tab);

  view.appendChild(page);
}

/* ---------------- 三份库存 ---------------- */
function paintStock(page, list, key) {
  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', margin: '0 0 10px' }, text: STOCK_HINT[key] }));

  if (!list.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-039'),
      el('div', { class: 'e-h', text: '这里还空着' }),
      el('div', { class: 'e-p', text: key === 'fromTa' ? '等 TA 按概率买件礼物送你，或在商城买下 TA 的心愿' : (key === 'fromMe' ? '去商城买下商品送给 TA，就会记在这里' : 'TA 自己买的会收在这里') })
    ]));
    return;
  }

  const box = el('div', { class: 'st-list' });
  list.forEach((it) => {
    box.appendChild(el('div', { class: 'card st-row' }, [
      tileVisual(it, 'st-emoji'),
      el('div', { class: 'st-main' }, [
        el('div', { class: 'st-name', text: it.name }),
        el('div', { class: 'st-sub' }, [
          el('span', { class: 'st-price', text: yuan(it.price) }),
          el('span', { text: ' · ' + fmtDay(it.ts) })
        ]),
        it.fromWish ? el('div', { class: 'st-tag', text: '来自心愿单' }) : null,
        it.asGift ? el('div', { class: 'st-tag gift', text: 'TA 买给自己的礼物' }) : null,
        it.note ? el('div', { class: 'st-note', text: '“' + it.note + '”' }) : null
      ]),
      el('button', { class: 'btn sm sh-del', onclick: () => removeStock(list, it, key) }, ['丢掉'])
    ]));
  });
  page.appendChild(box);
}

async function removeStock(list, it, key) {
  const ok = await confirmBox({ title: '丢掉这件', text: `「${it.name}」会从储藏室移除，确定吗？`, danger: true, okText: '丢掉' });
  if (!ok) return;
  const store = await getStore();
  store[key] = (store[key] || []).filter((x) => x.id !== it.id);
  await saveStore(store);
  toast('已丢掉：' + it.name);
  paint();
}

/* ---------------- 心愿单 ---------------- */
function paintWish(page, wish) {
  /* 我的心愿单 */
  page.appendChild(sectionHead('我的心愿单', 'TA 可能按概率买下其中一件送你'));
  if (!wish.mine.length) {
    page.appendChild(el('div', { class: 'st-empty' }, ['还没有心愿 · 去商城点商品里的「加入我的心愿单」']));
  } else {
    const box = el('div', { class: 'st-list' });
    wish.mine.forEach((it) => box.appendChild(el('div', { class: 'card st-row' }, [
      tileVisual(it, 'st-emoji'),
      el('div', { class: 'st-main' }, [
        el('div', { class: 'st-name', text: it.name }),
        el('div', { class: 'st-sub' }, [
          el('span', { class: 'st-price', text: yuan(it.price) }),
          el('span', { text: ' · 等 TA 买给我' })
        ])
      ]),
      el('button', { class: 'btn sm', onclick: () => removeWish('mine', it) }, ['移出'])
    ])));
    page.appendChild(box);
  }

  /* TA 的心愿单 */
  page.appendChild(sectionHead('TA 的心愿单', '买下送出后自动从这里移除'));
  if (!wish.ta.length) {
    page.appendChild(el('div', { class: 'st-empty' }, ['TA 还没有心愿 · 等 TA 按概率加进来，或看聊天里的卡片']));
  } else {
    const box = el('div', { class: 'st-list' });
    wish.ta.forEach((it) => box.appendChild(el('div', { class: 'card st-row' }, [
      tileVisual(it, 'st-emoji'),
      el('div', { class: 'st-main' }, [
        el('div', { class: 'st-name', text: it.name }),
        el('div', { class: 'st-sub' }, [
          el('span', { class: 'st-price', text: yuan(it.price) }),
          el('span', { text: ' · 点送 TA 买下送出' })
        ])
      ]),
      el('div', { class: 'st-acts' }, [
        el('button', { class: 'btn sm primary', onclick: () => sendToTa(it) }, [iconImg('IC-MOD-005'), '送 TA']),
        el('button', { class: 'btn sm', onclick: () => removeWish('ta', it) }, ['移出'])
      ])
    ])));
    page.appendChild(box);
  }

  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' }, text: `余额在商城钱包里充值 · ${state.role.name || 'TA'} 的心愿卡片也会发到聊天，点【送 TA】一样能买下送出` }));
}

function sectionHead(t, sub) {
  return el('div', { class: 'st-head' }, [
    el('div', { class: 't', text: t }),
    el('div', { class: 's', text: sub })
  ]);
}

async function sendToTa(it) {
  const r = await buyWishForTa(it.id);
  if (!r.ok) { toast(r.msg || '送不出去'); return; }
  toast(`已买下「${it.name}」送给 ${state.role.name || 'TA'}，聊天里有礼物卡片`);
  paint();
}

async function removeWish(side, it) {
  const ok = await confirmBox({
    title: side === 'mine' ? '移出我的心愿单' : '移出 TA 的心愿单',
    text: `「${it.name}」不再留在心愿单里，确定吗？`,
    danger: true, okText: '移出'
  });
  if (!ok) return;
  const w = await getWish();
  w[side] = (w[side] || []).filter((x) => x.id !== it.id);
  await saveWish(w);
  /* TA 的心愿若发过聊天卡片，把它置成「已移除」，按钮就点不动了 */
  if (side === 'ta' && Array.isArray(it.chatMsgIds)) {
    for (const mid of it.chatMsgIds) await updateMessage(mid, { wishGone: true }).catch(() => {});
  }
  toast('已移出心愿单');
  paint();
}
