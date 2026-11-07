/* 通牌 · 双方只用字卡/牌面交流
   - 我发一轮（1~N 张牌），对方 5~50 秒内必回一轮
   - 回牌设置：一人一句（只回 1 张）/ 随机（回 1~N 张，N 由我设 1~10）
   - 来源开关：字卡库 / 牌面图鉴（塔罗 78 + 雷诺曼 40）；未开启的来源发不了，标「未开启」
   - 聊天流里每张牌是小卡片；对方的牌是牌背，手动点击翻面才显示
   - 发牌抽屉：3 张随机牌（点击即发为一轮）+「换一批」+ 底部「字卡库」全屏多选合并发送 */

import { el, uid, rndInt, pickN } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, get, kvGet, kvSet } from '../store.js';
import { sheet, toast } from '../ui.js';
import { TAROT, LENORMAND } from '../data/tongdeck.js';
import { TAROT_BACK_SRC } from '../data/tarotfaces.js';

const CFG_KEY = 'tongCfg';
let view = null;
let alive = false;
let taTimer = null;
let cfg = { mode: 'one', randN: 5, srcLib: true, srcDeck: true };
let hand = [];          // 抽屉里的 3 张随机牌
let libCards = [];      // 字卡库可用卡

/* ---------------- 数据 ---------------- */
async function loadCfg() {
  const saved = await kvGet(CFG_KEY);
  if (saved && typeof saved === 'object') cfg = Object.assign(cfg, saved);
  if (!cfg.srcLib && !cfg.srcDeck) cfg.srcLib = true;   // 至少一个来源
}
const saveCfg = () => kvSet(CFG_KEY, cfg).catch(() => {});

async function loadLib() {
  const cards = await all('cards');
  libCards = cards.filter((c) => c.enabled && c.kind === 'text');
}

function libPool() {
  return libCards.map((c) => ({ src: 'lib', name: c.content, sub: '字卡' }));
}
function poolFor(src) {
  const parts = [];
  if ((!src || src === 'lib') && cfg.srcLib) parts.push(...libPool());
  if ((!src || src === 'tarot') && cfg.srcDeck) parts.push(...TAROT);
  if ((!src || src === 'lenormand') && cfg.srcDeck) parts.push(...LENORMAND);
  return parts;
}
function srcOpen(src) {
  return src === 'lib' ? cfg.srcLib : cfg.srcDeck;
}
function srcName(src) {
  return src === 'lib' ? '字卡库' : (src === 'tarot' ? '塔罗' : '雷诺曼');
}

/* ---------------- 轮次 ---------------- */
async function loadMsgs() {
  return (await all('messages')).filter((m) => m.type === 'tong').sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function lastRound(msgs) { return msgs.length ? msgs[msgs.length - 1] : null; }
function waitingTa(msgs) {
  const last = lastRound(msgs);
  return !!(last && last.role === 'me' && last.tongDueTs);
}
function nextRound(msgs) {
  const last = lastRound(msgs);
  return last ? (last.round || 1) + 1 : 1;
}

/* 对方回牌：5~50 秒随机；张数按回牌模式 */
async function genTaRound() {
  const msgs = await loadMsgs();
  const last = lastRound(msgs);
  if (!last || last.role !== 'me' || !last.tongDueTs) return;
  const pool = poolFor();
  if (!pool.length) return;
  const n = cfg.mode === 'one' ? 1 : rndInt(1, Math.max(1, Math.min(10, Number(cfg.randN) || 5)));
  const items = pickN(pool, Math.min(n, pool.length));
  delete last.tongDueTs;
  await put('messages', last);
  await put('messages', {
    id: uid(), role: 'ta', type: 'tong',
    round: last.round, items, flipped: [], ts: Date.now()
  });
  if (alive) { await paintStream(); paintDrawer(); }
}

function scheduleTa(msgs) {
  if (taTimer) { clearTimeout(taTimer); taTimer = null; }
  const last = lastRound(msgs);
  if (!last || last.role !== 'me' || !last.tongDueTs) return;
  const waitMs = Math.max(0, last.tongDueTs - Date.now());
  taTimer = setTimeout(() => { taTimer = null; if (alive) genTaRound(); }, waitMs);
}

async function sendRound(items) {
  if (!items || !items.length) { toast('先选几张牌'); return; }
  const msgs = await loadMsgs();
  await put('messages', {
    id: uid(), role: 'me', type: 'tong',
    round: nextRound(msgs), items, ts: Date.now(),
    tongDueTs: Date.now() + rndInt(5000, 50000)
  });
  scheduleTa(await loadMsgs());
  await paintStream();
  paintDrawer();
  toast('已出牌，等对方回牌');
}

/* ---------------- 页面 ---------------- */
export default async function pageTong(v) {
  view = v;
  alive = true;
  window.addEventListener('hashchange', () => {
    alive = false;
    if (taTimer) { clearTimeout(taTimer); taTimer = null; }
  }, { once: true });

  fullPage({ back: true, title: '通牌', sub: '只以字卡交流' });

  await loadCfg();
  await loadLib();

  view.appendChild(el('div', { class: 'page tong' }, [
    el('div', { class: 'tg-head' }, [
      el('button', { class: 'tg-gear', onclick: openSettings }, [iconImg('IC-MIO-012')]),
      el('div', { class: 'tg-head-t' }, [
        el('div', { class: 'tg-head-name', text: '通牌' }),
        el('div', { class: 'tg-head-sub', id: 'tg-head-sub', text: '回牌：' + modeText() + ' · 来源：' + srcText() })
      ])
    ]),
    el('div', { class: 'tg-stream-wrap' }, [el('div', { class: 'tg-stream' })]),
    el('div', { class: 'tg-drawer' })
  ]));

  const msgs = await loadMsgs();
  /* 兜底：上次发牌后对方该回没回（刷新/退出过）→ 到点立即补回 */
  const last = lastRound(msgs);
  if (last && last.role === 'me' && last.tongDueTs && Date.now() >= last.tongDueTs) {
    await genTaRound();
  } else {
    scheduleTa(msgs);
  }

  await paintStream();
  redeal();
  paintDrawer();
}

function modeText() {
  return cfg.mode === 'one' ? '一人一句' : `随机 1~${Math.min(10, Number(cfg.randN) || 5)} 张`;
}
function srcText() {
  const s = [];
  if (cfg.srcLib) s.push('字卡库');
  if (cfg.srcDeck) s.push('牌面图鉴');
  return s.length ? s.join(' + ') : '无';
}
function refreshHeadSub() {
  const node = view.querySelector('#tg-head-sub');
  if (node) node.textContent = '回牌：' + modeText() + ' · 来源：' + srcText();
}

/* ---------------- 聊天流 ---------------- */
async function paintStream() {
  const stream = view.querySelector('.tg-stream');
  if (!stream) return;
  const msgs = await loadMsgs();
  cachedMsgs = msgs;
  stream.innerHTML = '';

  if (!msgs.length) {
    stream.appendChild(el('div', { class: 'tg-empty' }, [
      el('div', { class: 'e-h', text: '还没有出过牌' }),
      el('div', { class: 'e-p', text: '点下面 3 张里的一张，或打开字卡库多选合并发送，各为一轮' })
    ]));
  }

  msgs.forEach((m) => stream.appendChild(roundNode(m)));

  if (waitingTa(msgs)) {
    stream.appendChild(el('div', { class: 'tg-wait' }, [
      el('span', { class: 'qf-dots' }, [el('i'), el('i'), el('i')]),
      el('span', { text: '对方回牌中…' })
    ]));
  }
  stream.scrollTop = stream.scrollHeight;
}

/** 塔罗牌面图：item 自带 face（新数据），老消息按牌名从图鉴反查 */
function faceOf(item) {
  if (!item || item.src !== 'tarot') return null;
  if (item.face) return item.face;
  const t = TAROT.find((x) => x.name === item.name);
  return (t && t.face) || null;
}

function cardNode(item, faceUp, onClick) {
  const back = !faceUp;
  /* 塔罗：正面显示牌面图、背面显示牌背图；字卡 / 雷诺曼没有图，维持文字卡 */
  const face = back ? (item && item.src === 'tarot' ? TAROT_BACK_SRC : null) : faceOf(item);
  const node = el('div', { class: 'tg-card' + (back ? ' back' : '') + (face ? ' face' : '') + (onClick ? ' tap' : '') }, [
    face ? el('img', {
      class: 'tg-card-img', src: face, alt: item && item.name ? item.name : '牌背', loading: 'lazy',
      onerror: (e) => {           /* 图加载失败退回文字卡 */
        const img = e.target;
        if (img && img.parentNode) { img.parentNode.classList.remove('face'); img.remove(); }
      }
    }) : null,
    el('div', { class: 'tg-card-nm', text: back ? '' : (item.name || '') }),
    el('div', { class: 'tg-card-sub', text: back ? '' : (item.sub || '') })
  ]);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function roundNode(m) {
  const mine = m.role === 'me';
  const wrap = el('div', { class: 'tg-round ' + (mine ? 'me' : 'ta') }, [
    el('div', { class: 'tg-round-tag', text: (mine ? '我' : '对方') + ' · 第 ' + m.round + ' 轮' })
  ]);
  const row = el('div', { class: 'tg-row' });
  (m.items || []).forEach((item, i) => {
    const faceUp = mine || ((m.flipped || [])[i] === true);
    const makeNode = (up) => cardNode(item, up, mine ? null : async () => {
      const cur = await get('messages', m.id);
      if (!cur) return;
      const fl = Array.isArray(cur.flipped) ? cur.flipped.slice() : [];
      fl[i] = !fl[i];
      cur.flipped = fl;
      await put('messages', cur);
      row.replaceChild(makeNode(fl[i] === true), node);
    });
    const node = makeNode(faceUp);
    row.appendChild(node);
  });
  wrap.appendChild(row);
  return wrap;
}

/* ---------------- 发牌抽屉 ---------------- */
function redeal() {
  const pool = poolFor();
  hand = pickN(pool, Math.min(3, pool.length));
}

function paintDrawer() {
  const drawer = view.querySelector('.tg-drawer');
  if (!drawer) return;
  const wait = waitingTaSync();
  drawer.innerHTML = '';

  const handRow = el('div', { class: 'tg-hand' + (wait ? ' off' : '') });
  hand.forEach((item) => handRow.appendChild(cardNode(item, true, wait ? null : () => sendRound([item]))));
  handRow.appendChild(el('button', {
    class: 'tg-redeal' + (wait ? ' off' : ''),
    onclick: () => { if (waitingTaSync()) { toast('等对方回牌'); return; } redeal(); paintDrawer(); }
  }, ['换一批']));

  drawer.appendChild(el('div', { class: 'tg-drawer-tip', text: wait ? '等对方回牌后再出' : '点牌即出 · 一张或合并发送各算一轮' }));
  drawer.appendChild(handRow);
  drawer.appendChild(el('button', {
    class: 'btn block tg-lib-btn',
    onclick: () => { if (waitingTaSync()) { toast('等对方回牌'); return; } openPicker(); }
  }, [iconImg('IC-MIO-028'), '字卡库 · 全部牌面']));
}

let cachedMsgs = [];
function waitingTaSync() {
  const last = lastRound(cachedMsgs);
  return !!(last && last.role === 'me' && last.tongDueTs);
}

/* ---------------- 字卡库全屏选择器 ---------------- */
function openPicker() {
  let kw = '';
  let cat = '全部';
  const picked = [];    // {src, name, sub}

  const grid = el('div', { class: 'tg-pick-grid' });
  const countBtn = el('button', {
    class: 'btn primary block',
    onclick: async () => {
      if (!picked.length) { toast('还没有选中任何牌'); return; }
      s.close();
      await sendRound(picked.map((p) => ({ src: p.src, name: p.name, sub: p.sub })));
    }
  }, ['合并发送']);
  const clearBtn = el('button', {
    class: 'btn block',
    onclick: () => { picked.length = 0; refresh(); }
  }, ['清空']);

  const searchInput = el('input', { class: 'input', placeholder: '搜牌名 / 字卡内容' });
  searchInput.addEventListener('input', () => { kw = searchInput.value.trim(); refresh(); });

  const chips = el('div', { class: 'chips' });
  ['全部', '字卡库', '塔罗', '雷诺曼'].forEach((c) => {
    chips.appendChild(el('button', {
      class: 'chip' + (cat === c ? ' on' : ''),
      onclick: (e) => {
        cat = c;
        [...chips.children].forEach((n) => n.classList.remove('on'));
        e.currentTarget.classList.add('on');
        refresh();
      }
    }, [c]));
  });

  const body = el('div', {}, [
    searchInput,
    chips,
    grid,
    el('div', { class: 'tg-pick-foot' }, [clearBtn, countBtn])
  ]);
  const s = sheet({ title: '字卡库 · 全部牌面', node: body });

  function refresh() {
    grid.innerHTML = '';
    const srcFilter = cat === '全部' ? null : (cat === '字卡库' ? 'lib' : (cat === '塔罗' ? 'tarot' : 'lenormand'));
    let pool = poolForAll();
    if (srcFilter) pool = pool.filter((p) => p.src === srcFilter);
    if (kw) pool = pool.filter((p) => (p.name || '').includes(kw));

    if (!pool.length) {
      grid.appendChild(el('div', { class: 'tg-empty' }, [
        el('div', { class: 'e-p', text: '没有匹配的牌' })
      ]));
    }
    pool.slice(0, 300).forEach((p) => {
      const open = srcOpen(p.src);
      const isPicked = picked.some((x) => x.src === p.src && x.name === p.name);
      const node = el('div', {
        class: 'tg-card tap' + (p.face ? ' face' : '') + (isPicked ? ' picked' : '') + (open ? '' : ' disabled')
      }, [
        p.face ? el('img', { class: 'tg-card-img', src: p.face, alt: p.name, loading: 'lazy' }) : null,
        el('div', { class: 'tg-card-nm', text: p.name }),
        el('div', { class: 'tg-card-sub', text: open ? (p.sub || srcName(p.src)) : '未开启' })
      ]);
      node.addEventListener('click', () => {
        if (!open) { toast('该来源未开启，去右上角设置里打开'); return; }
        const idx = picked.findIndex((x) => x.src === p.src && x.name === p.name);
        if (idx >= 0) picked.splice(idx, 1);
        else picked.push(p);
        node.classList.toggle('picked');
        countBtn.textContent = `合并发送（${picked.length}）`;
      });
      grid.appendChild(node);
    });
    countBtn.textContent = `合并发送（${picked.length}）`;
  }
  refresh();
}

/* 选择器要展示所有来源（未开启的标灰），与 poolFor 不同 */
function poolForAll() {
  return [
    ...libCards.map((c) => ({ src: 'lib', name: c.content, sub: '字卡' })),
    ...TAROT,
    ...LENORMAND
  ];
}

/* ---------------- 设置 ---------------- */
function openSettings() {
  const sub = el('div', { class: 'tg-set-sub', id: 'tg-set-sub' });

  function renderSub() {
    sub.innerHTML = '';
    if (cfg.mode === 'rand') {
      const val = Math.max(1, Math.min(10, Number(cfg.randN) || 5));
      sub.appendChild(el('div', { class: 'tg-set-row' }, [
        el('span', { text: '每轮回 1~N 张' }),
        el('span', { class: 'tg-step' }, [
          el('button', { onclick: () => { cfg.randN = Math.max(1, val - 1); saveCfg(); renderSub(); paintDrawer(); } }, ['−']),
          el('b', { text: String(val) }),
          el('button', { onclick: () => { cfg.randN = Math.min(10, val + 1); saveCfg(); renderSub(); paintDrawer(); } }, ['＋'])
        ])
      ]));
    }
  }

  const modeOne = el('button', {
    class: 'qz-toggle' + (cfg.mode === 'one' ? ' on' : ''),
    onclick: () => { cfg.mode = 'one'; saveCfg(); syncSetUI(); }
  }, ['一人一句']);
  const modeRand = el('button', {
    class: 'qz-toggle' + (cfg.mode === 'rand' ? ' on' : ''),
    onclick: () => { cfg.mode = 'rand'; saveCfg(); syncSetUI(); }
  }, ['随机回牌']);

  const swLib = el('button', {
    class: 'qz-toggle' + (cfg.srcLib ? ' on' : ''),
    onclick: () => {
      if (cfg.srcLib && !cfg.srcDeck) { toast('至少保留一个来源'); return; }
      cfg.srcLib = !cfg.srcLib; saveCfg(); syncSetUI();
    }
  }, ['开']);
  const swDeck = el('button', {
    class: 'qz-toggle' + (cfg.srcDeck ? ' on' : ''),
    onclick: () => {
      if (cfg.srcDeck && !cfg.srcLib) { toast('至少保留一个来源'); return; }
      cfg.srcDeck = !cfg.srcDeck; saveCfg(); syncSetUI();
    }
  }, ['开']);

  function syncSetUI() {
    modeOne.classList.toggle('on', cfg.mode === 'one');
    modeRand.classList.toggle('on', cfg.mode === 'rand');
    swLib.classList.toggle('on', cfg.srcLib);
    swDeck.classList.toggle('on', cfg.srcDeck);
    swLib.textContent = cfg.srcLib ? '开' : '关';
    swDeck.textContent = cfg.srcDeck ? '开' : '关';
    renderSub();
    refreshHeadSub();
    redeal();
    paintDrawer();
  }

  const body = el('div', {}, [
    el('div', { class: 'tg-set-h', text: '回牌' }),
    el('div', { class: 'tg-set-toggles' }, [modeOne, modeRand]),
    sub,
    el('div', { class: 'tg-set-h', text: '来源（决定哪些能互发）' }),
    el('div', { class: 'tg-set-row' }, [
      el('span', { text: '字卡库' }),
      swLib
    ]),
    el('div', { class: 'tg-set-row' }, [
      el('span', { text: '牌面图鉴（塔罗 78 + 雷诺曼 40）' }),
      swDeck
    ]),
    el('div', { class: 'tg-set-note', text: '关掉的来源不能再出牌；抽屉与对方回牌都只用开启的来源。' })
  ]);
  sheet({ title: '通牌设置', node: body });
  renderSub();
}
