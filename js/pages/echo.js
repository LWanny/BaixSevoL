/* 回声 · 把卡拖上桌面，翻开才知道是什么
   - 底部一排卡（约 6 张可见，左右滑动看全部），只能看到背面
   - 底部左上角刷新小图标：重排底部卡的位置
   - 卡可自由拖到桌面任意位置，放好后仍可移动；点击已放置的卡翻开看内容（翻开也能拖）
   - 右上角：清空（桌面上的卡全部消失）/ 卡集（本软件独立的卡组库）
   - 卡集：新建卡组（命名 → 创建/取消）、删除卡组、批量操作；组内可上传文字/图片卡、改名、批量操作
   - 卡集底部「开始」→ 弹窗选择一个或多个卡组 → 确认后底部卡排 = 所选卡组的牌；
     拖一张上桌，底部卡排就去掉这一张 */

import { el, uid, shuffle } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, get, del, kvGet, kvSet } from '../store.js';
import { sheet, toast, confirmBox } from '../ui.js';

const KV_BOARD = 'echoBoard';
const KV_SEL = 'echoSel';

let view = null;
let boardNode = null;
let trayNode = null;
let tray = [];            // 底部卡排（卡片记录）
let board = [];           // 桌面 [{card, x, y, flipped}]

/* ---------------- 数据 ---------------- */
async function loadDecks() { return (await all('echoDecks')).sort((a, b) => (a.ts || 0) - (b.ts || 0)); }
async function loadDeckCards(deckId) {
  return (await all('echoCards')).filter((c) => c.deckId === deckId).sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

async function loadSel() {
  const v = await kvGet(KV_SEL);
  return Array.isArray(v) ? v : [];
}
async function saveSel(ids) { await kvSet(KV_SEL, ids).catch(() => {}); }

async function loadBoardCards() {
  const v = await kvGet(KV_BOARD);
  const list = Array.isArray(v) ? v : [];
  const out = [];
  for (const item of list) {
    const card = await get('echoCards', item.cardId);
    if (card) out.push({ card, x: item.x || 20, y: item.y || 20, flipped: !!item.flipped });
  }
  return out;
}
async function saveBoard() {
  await kvSet(KV_BOARD, board.map((b) => ({ cardId: b.card.id, x: Math.round(b.x), y: Math.round(b.y), flipped: !!b.flipped }))).catch(() => {});
}

async function refillTray() {
  const sel = await loadSel();
  if (!sel.length) { tray = []; return; }
  const onBoard = new Set(board.map((b) => b.card.id));
  let cards = [];
  for (const id of sel) cards.push(...await loadDeckCards(id));
  cards = cards.filter((c) => !onBoard.has(c.id));
  cards = shuffle(cards);
  tray = cards;
  saveTrayOrder(cards.map((c) => c.id));
}
let trayOrder = [];
function saveTrayOrder(ids) { trayOrder = ids; }

/* ---------------- 页面 ---------------- */
export default async function pageEcho(v) {
  view = v;
  window.addEventListener('hashchange', () => { view = null; }, { once: true });

  fullPage({ back: true, title: '回声', sub: '拖上桌 · 翻开看' });

  board = await loadBoardCards();

  view.appendChild(el('div', { class: 'page echo' }, [
    el('div', { class: 'ec-head' }, [
      el('div', { class: 'ec-head-tip', id: 'ec-head-tip' }),
      el('div', { class: 'ec-head-btns' }, [
        el('button', { class: 'ec-top-btn', onclick: clearBoard }, ['清空']),
        el('button', { class: 'ec-top-btn', onclick: openDecks }, ['卡集'])
      ])
    ]),
    el('div', { class: 'ec-board', id: 'ec-board' }),
    el('div', { class: 'ec-tray-wrap' }, [
      el('button', { class: 'ec-shuffle', title: '刷新卡排', onclick: reshuffleTray }, [iconImg('IC-MIO-016')]),
      el('div', { class: 'ec-tray' })
    ])
  ]));

  boardNode = view.querySelector('#ec-board');
  trayNode = view.querySelector('.ec-tray');

  await refillTray();
  paintBoard();
  paintTray();
}

function headTip() {
  return board.length ? `桌上有 ${board.length} 张牌` : '把下面的牌拖上桌面';
}

/* ---------------- 桌面 ---------------- */
function paintBoard() {
  if (!boardNode) return;
  boardNode.innerHTML = '';
  const bw = boardNode.clientWidth, bh = boardNode.clientHeight;
  board.forEach((b, i) => {
    /* 兜底：坐标非法或落在板外（旧数据/窗口变小）→ 收回可视区，否则牌会“消失”抓不到 */
    if (!Number.isFinite(b.x)) b.x = 20;
    if (!Number.isFinite(b.y)) b.y = 20;
    if (bw && bh) {
      b.x = Math.min(Math.max(0, b.x), Math.max(0, bw - 72));
      b.y = Math.min(Math.max(0, b.y), Math.max(0, bh - 96));
    }
    const node = cardEl(b.card, b.flipped, true);
    node.style.left = b.x + 'px';
    node.style.top = b.y + 'px';
    dragExisting(node, b, i);
    boardNode.appendChild(node);
  });
  const tip = view.querySelector('#ec-head-tip');
  if (tip) tip.textContent = headTip();
}

function cardEl(card, flipped, draggable) {
  const node = el('div', { class: 'ec-card' + (flipped ? ' open' : '') + (draggable ? ' drag' : '') });
  if (flipped) {
    if (card.type === 'img') node.appendChild(el('img', { src: card.url, alt: '' }));
    else node.appendChild(el('div', { class: 'ec-card-txt', text: card.content || '' }));
  } else {
    node.appendChild(el('div', { class: 'ec-back' }));
  }
  return node;
}

function dragExisting(node, b, idx) {
  node.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = Number.isFinite(b.x) ? b.x : 20;
    const oy = Number.isFinite(b.y) ? b.y : 20;
    const bw = boardNode.clientWidth, bh = boardNode.clientHeight;
    const cw = node.offsetWidth || 72, ch = node.offsetHeight || 96;
    const clamp = (v, max) => (max > 0 ? Math.min(Math.max(0, v), max) : Math.max(0, v));
    let moved = false;
    try { node.setPointerCapture(e.pointerId); } catch (_) {}
    boardNode.appendChild(node);        // 按下的牌提到最上层，别被后上的牌盖住抓不到
    const mv = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      moved = true;
      b.x = clamp(ox + dx, bw - cw);    // 移动中就夹在板内，拖不出可视区
      b.y = clamp(oy + dy, bh - ch);
      node.style.left = b.x + 'px';
      node.style.top = b.y + 'px';
      node.classList.add('lift');
    };
    const finish = (allowFlip) => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      node.classList.remove('lift');
      if (!moved) {
        if (allowFlip) b.flipped = !b.flipped;   // 点击翻开 / 翻回（系统打断则不翻）
        paintBoard();
        saveBoard();
        return;
      }
      /* 拖过的牌提到最上层并持久化置顶，下次进来还在这张上面 */
      const i = board.indexOf(b);
      if (i !== -1) { board.splice(i, 1); board.push(b); boardNode.appendChild(node); }
      saveBoard();
    };
    const up = () => finish(true);
    const cancel = () => finish(false);  // 系统打断（来电/切后台）：只收尾不翻转
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  });
}

/* ---------------- 底部卡排 ---------------- */
function paintTray() {
  if (!trayNode) return;
  trayNode.innerHTML = '';
  const tip = view.querySelector('#ec-head-tip');
  if (!tray.length) {
    const msg = trayOrderMessage();
    if (msg) trayNode.appendChild(el('div', { class: 'ec-tray-empty', text: msg }));
  }
  tray.forEach((card) => {
    const node = el('div', { class: 'ec-card drag' }, [el('div', { class: 'ec-back' })]);
    node.addEventListener('pointerdown', (e) => dragFromTray(e, node, card));
    trayNode.appendChild(node);
  });
  if (tip) tip.textContent = headTip();
}

function trayOrderMessage() {
  if (!trayOrder.length && !board.length) return '点右上角「卡集」→ 开始，选择卡组后这里会摆出牌';
  return '';
}

function dragFromTray(e, node, card) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let ghost = null;
  let moved = false;
  try { node.setPointerCapture(e.pointerId); } catch (_) {}
  const mv = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    moved = true;
    if (!ghost) {
      ghost = el('div', { class: 'ec-ghost' }, [el('div', { class: 'ec-back' })]);
      document.body.appendChild(ghost);
      trayNode.classList.add('dragging');
    }
    ghost.style.left = (ev.clientX - 36) + 'px';
    ghost.style.top = (ev.clientY - 52) + 'px';
  };
  const cleanup = () => {
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    trayNode.classList.remove('dragging');
  };
  const up = (ev) => {
    cleanup();
    if (!ghost) return;   // 没拖动：底部牌只看背面，点击无动作
    ghost.remove();
    const bx = boardNode.getBoundingClientRect();
    const px = ev.clientX - bx.left - 36;
    const py = ev.clientY - bx.top - 52;
    if (ev.clientX >= bx.left && ev.clientX <= bx.right && ev.clientY >= bx.top && ev.clientY <= bx.bottom) {
      /* 落点夹在板内：卡心贴近边缘时也整张留在可视区，不会半张出界抓不到 */
      const maxX = Math.max(0, bx.width - 72), maxY = Math.max(0, bx.height - 96);
      board.push({ card, x: Math.min(Math.max(0, px), maxX), y: Math.min(Math.max(0, py), maxY), flipped: false });
      tray = tray.filter((c) => c.id !== card.id);   // 上桌一张，底部去掉一张
      saveBoard();
      paintBoard();
      paintTray();
    }
  };
  const cancel = () => {   // 系统打断（来电/切后台）：丢掉影子牌，不落桌
    cleanup();
    if (ghost) ghost.remove();
  };
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
}

function reshuffleTray() {
  if (!tray.length) { toast('卡排没有牌'); return; }
  tray = shuffle(tray);
  paintTray();
}

async function clearBoard() {
  if (!board.length) { toast('桌面上还没有牌'); return; }
  const okGo = await confirmBox({ title: '清空桌面', text: '桌面上的牌会全部消失，确定吗？', danger: true });
  if (!okGo) return;
  board = [];
  await saveBoard();
  await refillTray();
  paintBoard();
  paintTray();
  toast('已清空');
}

/* ---------------- 卡集 ---------------- */
async function openDecks() {
  const body = el('div');
  const s = sheet({ title: '卡集', node: body });

  async function refreshAll() {
    body.innerHTML = '';
    const decks = await loadDecks();
    let batch = false;
    const picked = new Set();
    const list = el('div');

    const addBtn = el('button', { class: 'ec-op-btn', onclick: () => newDeckSheet(refreshAll) }, ['＋ 新建卡组']);
    const batchBtn = el('button', {
      class: 'ec-op-btn',
      onclick: () => {
        batch = !batch; picked.clear();
        batchBtn.classList.toggle('on', batch);
        batchBtn.textContent = batch ? '完成' : '批量操作';
        delBtn.style.display = batch ? 'block' : 'none';
        paintList();
      }
    }, ['批量操作']);
    const delBtn = el('button', {
      class: 'btn danger block', style: 'display:none;margin-top:10px',
      onclick: async () => {
        if (!picked.size) { toast('先勾选卡组'); return; }
        const okGo = await confirmBox({ title: '删除卡组', text: `删除选中的 ${picked.size} 个卡组及其所有牌，不可恢复，确定吗？`, danger: true });
        if (!okGo) return;
        for (const id of picked) {
          for (const c of await loadDeckCards(id)) await del('echoCards', c.id);
          await del('echoDecks', id);
        }
        picked.clear(); refreshAll();
      }
    }, ['删除选中']);

    body.appendChild(el('div', { class: 'ec-deck-ops' }, [addBtn, batchBtn]));
    body.appendChild(list);
    body.appendChild(delBtn);
    body.appendChild(el('button', {
      class: 'btn primary block', style: 'margin-top:10px',
      onclick: () => startSheet(refreshAll)
    }, ['开始 ▸']));

    function paintList() {
      list.innerHTML = '';
      if (!decks.length) list.appendChild(el('div', { class: 'ec-deck-empty', text: '还没有卡组，先新建一个' }));
      decks.forEach((d) => {
        const row = el('div', { class: 'ec-deck-row' }, [
          el('input', { type: 'checkbox', style: batch ? '' : 'display:none' }),
          el('div', { class: 'ec-deck-name', text: d.name }),
          el('span', { class: 'ec-deck-n', text: '…' })
        ]);
        row.addEventListener('click', async () => {
          if (batch) {
            const cb = row.querySelector('input');
            cb.checked = !cb.checked;
            if (cb.checked) picked.add(d.id); else picked.delete(d.id);
            row.classList.toggle('on', cb.checked);
            return;
          }
          openDeckDetail(d, refreshAll);
        });
        loadDeckCards(d.id).then((cs) => { const n = row.querySelector('.ec-deck-n'); if (n) n.textContent = cs.length + ' 张'; });
        list.appendChild(row);
      });
    }
    paintList();
  }
  await refreshAll();
}

/* 新建卡组 */
function newDeckSheet(done) {
  const input = el('input', { class: 'input', placeholder: '给卡组起个名字' });
  const body = el('div', {}, [
    el('div', { class: 'ec-new-tip', text: '创建后可以在里面上传文字或图片作为牌面' }),
    input,
    el('div', { class: 'ec-new-btns' }, [
      el('button', { class: 'btn', onclick: () => s.close() }, ['取消']),
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          const name = input.value.trim();
          if (!name) { toast('先起个名字'); return; }
          await put('echoDecks', { id: uid(), name, ts: Date.now() });
          s.close();
          toast('已创建「' + name + '」');
          done && done();
        }
      }, ['创建'])
    ])
  ]);
  const s = sheet({ title: '新建卡组', node: body });
  setTimeout(() => input.focus(), 60);
}

/* 卡组详情：上传内容 / 改名 / 批量 */
function openDeckDetail(deck, refreshOuter) {
  let batch = false;
  const picked = new Set();
  const grid = el('div', { class: 'ec-detail-grid' });

  function cardFace(c) {
    if (c.type === 'img') return el('img', { src: c.url, alt: '' });
    return el('div', { class: 'ec-card-txt', text: c.content || '' });
  }

  async function paintGrid() {
    grid.innerHTML = '';
    const cards = await loadDeckCards(deck.id);
    if (!cards.length) {
      grid.appendChild(el('div', { class: 'ec-deck-empty', text: '还没有牌，下面添加一张' }));
    }
    cards.forEach((c) => {
      const cell = el('div', { class: 'ec-detail-cell' + (batch && picked.has(c.id) ? ' picked' : '') }, [
        cardFace(c),
        el('input', { type: 'checkbox', style: batch ? '' : 'display:none', checked: picked.has(c.id) })
      ]);
      cell.addEventListener('click', () => {
        if (!batch) return;
        if (picked.has(c.id)) picked.delete(c.id); else picked.add(c.id);
        cell.classList.toggle('picked', picked.has(c.id));
        cell.querySelector('input').checked = picked.has(c.id);
      });
      grid.appendChild(cell);
    });
  }

  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files || []];
    if (!files.length) return;
    for (const f of files) {
      const url = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(f);
      });
      await put('echoCards', { id: uid(), deckId: deck.id, type: 'img', url, ts: Date.now() });
    }
    fileInput.value = '';
    await paintGrid();
    toast('已添加 ' + files.length + ' 张图片牌');
  });

  const body = el('div', {}, [
    el('div', { class: 'ec-deck-ops' }, [
      el('button', {
        class: 'ec-op-btn',
        onclick: () => renameSheet(deck, async (newName) => {
          deck.name = newName;
          await put('echoDecks', deck);
          body.querySelector('.ec-detail-title').textContent = newName;
          refreshOuter && refreshOuter();
        })
      }, ['改名']),
      el('button', {
        class: 'ec-op-btn',
        onclick: () => {
          batch = !batch; picked.clear();
          delBtn.style.display = batch ? 'block' : 'none';
          paintGrid();
        }
      }, ['批量操作'])
    ]),
    grid,
    el('div', { class: 'ec-add-btns' }, [
      el('button', {
        class: 'btn block',
        onclick: () => addTextSheet(deck, async () => { await paintGrid(); toast('已添加文字牌'); })
      }, ['＋ 添加文字牌']),
      el('button', { class: 'btn block', onclick: () => fileInput.click() }, ['＋ 添加图片牌'])
    ]),
    el('button', {
      class: 'btn danger block', id: 'ec-detail-del', style: 'display:none;margin-top:10px',
      onclick: async () => {
        if (!picked.size) { toast('先勾选牌'); return; }
        const okGo = await confirmBox({ title: '删除', text: `删除选中的 ${picked.size} 张牌，确定吗？`, danger: true });
        if (!okGo) return;
        for (const id of picked) await del('echoCards', id);
        picked.clear();
        await paintGrid();
      }
    }, ['删除选中']),
    fileInput
  ]);
  const s = sheet({ title: '', node: body });
  body.insertBefore(el('div', { class: 'ec-detail-title', text: deck.name }), body.firstChild);
  const delBtn = body.querySelector('#ec-detail-del');
  paintGrid();
}

function addTextSheet(deck, done) {
  const ta = el('textarea', { class: 'input', rows: 4, placeholder: '写下这张牌的内容' });
  const body = el('div', {}, [
    ta,
    el('div', { class: 'ec-new-btns' }, [
      el('button', { class: 'btn', onclick: () => s.close() }, ['取消']),
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          const content = ta.value.trim();
          if (!content) { toast('先写点内容'); return; }
          await put('echoCards', { id: uid(), deckId: deck.id, type: 'text', content, ts: Date.now() });
          s.close();
          done && done();
        }
      }, ['保存'])
    ])
  ]);
  const s = sheet({ title: '添加文字牌', node: body });
  setTimeout(() => ta.focus(), 60);
}

function renameSheet(deck, done) {
  const input = el('input', { class: 'input', value: deck.name });
  const body = el('div', {}, [
    input,
    el('div', { class: 'ec-new-btns' }, [
      el('button', { class: 'btn', onclick: () => s.close() }, ['取消']),
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          const name = input.value.trim();
          if (!name) { toast('名字不能为空'); return; }
          s.close();
          done && done(name);
        }
      }, ['保存'])
    ])
  ]);
  const s = sheet({ title: '修改名称', node: body });
}

/* 开始：选择卡组 */
async function startSheet(refreshOuter) {
  const decks = await loadDecks();
  if (!decks.length) { toast('还没有卡组'); return; }
  const picked = new Set(await loadSel());

  const list = el('div');
  function paintList() {
    list.innerHTML = '';
    decks.forEach((d) => {
      const row = el('div', { class: 'ec-deck-row' + (picked.has(d.id) ? ' on' : '') }, [
        el('input', { type: 'checkbox', checked: picked.has(d.id) }),
        el('div', { class: 'ec-deck-name', text: d.name }),
        el('span', { class: 'ec-deck-n', text: '…' })
      ]);
      row.addEventListener('click', () => {
        if (picked.has(d.id)) picked.delete(d.id); else picked.add(d.id);
        row.classList.toggle('on', picked.has(d.id));
        row.querySelector('input').checked = picked.has(d.id);
      });
      loadDeckCards(d.id).then((cs) => { const n = row.querySelector('.ec-deck-n'); if (n) n.textContent = cs.length + ' 张'; });
      list.appendChild(row);
    });
  }
  paintList();

  const body = el('div', {}, [
    el('div', { class: 'ec-new-tip', text: '选择一个或多个卡组，确认后底部卡排就是这些卡组里的牌' }),
    list,
    el('div', { class: 'ec-new-btns' }, [
      el('button', { class: 'btn', onclick: () => s.close() }, ['取消']),
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          if (!picked.size) { toast('至少选一个卡组'); return; }
          await saveSel([...picked]);
          board = [];
          await saveBoard();
          await refillTray();
          paintBoard();
          paintTray();
          s.close();
          refreshOuter && refreshOuter();
          toast('已开始，把牌拖上桌面吧');
        }
      }, ['确认'])
    ])
  ]);
  const s = sheet({ title: '选择卡组开始', node: body });
}
