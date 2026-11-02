/* 游戏厅 · 和 TA 玩的小游戏
   内置三个小游戏：猜拳（三局两胜）/ 猜数字 / 翻牌配对；
   战绩存 games 表，可以把结果发给 TA（TA 会回应），
   也能在「数据 → 分类管理」里单独导出 / 导入 / 删除。 */

import { el, uid, fmtDay, rndInt } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del, clear } from '../store.js';
import { confirmBox, toast } from '../ui.js';
import { state } from '../state.js';
import * as sched from '../scheduler.js';

/* ---------------- 游戏清单 ---------------- */
const GAMES = {
  rps:    { name: '猜拳',     emoji: '✊', bg: ['#fde8d8', '#f4c197'], desc: '和 TA 三局两胜' },
  guess:  { name: '猜数字',   emoji: '🔢', bg: ['#e2e8f0', '#a9b8cc'], desc: '1~100 藏了个数' },
  memory: { name: '翻牌配对', emoji: '🃏', bg: ['#e4efdd', '#b1cfa0'], desc: '用最少步数配成 8 对' }
};

const RPS_HANDS = ['✊', '✌️', '✋'];
const RPS_NAMES = ['石头', '剪刀', '布'];

let view = null;
let tab = 'hall';   // hall | records | rps | guess | memory

export default async function pageGames(v) {
  view = v;
  fullPage({ back: true, title: '游戏厅', sub: '和 TA 玩点小游戏' });
  await paint();
}

/* ---------------- 框架 ---------------- */
async function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page gm' });

  if (tab === 'hall' || tab === 'records') {
    page.appendChild(segBar());
    page.appendChild(tab === 'hall' ? await hallNode() : await recordsNode());
  } else {
    page.appendChild(el('div', { class: 'gm-back' }, [
      el('button', { class: 'chip', type: 'button', onclick: () => { tab = 'hall'; paint(); } }, ['← 回大厅'])
    ]));
    page.appendChild(tab === 'rps' ? rpsGame() : tab === 'guess' ? guessGame() : memoryGame());
  }

  view.appendChild(page);
}

function segBar() {
  const rec = el('button', {
    class: 'sh-seg-btn' + (tab === 'records' ? ' on' : ''),
    onclick: () => { tab = 'records'; paint(); }
  }, ['战绩']);
  const hall = el('button', {
    class: 'sh-seg-btn' + (tab === 'hall' ? ' on' : ''),
    onclick: () => { tab = 'hall'; paint(); }
  }, ['游戏']);
  return el('div', { class: 'sh-seg' }, [hall, rec]);
}

/* ---------------- 大厅 ---------------- */
async function hallNode() {
  const recs = await all('games');
  const grid = el('div', { class: 'gm-grid' });

  for (const [key, g] of Object.entries(GAMES)) {
    const mine = recs.filter((r) => r.type === key);
    let best = '';
    if (key === 'rps') {
      const wins = mine.filter((r) => r.result === 'win').length;
      if (mine.length) best = `${mine.length} 战 ${wins} 胜`;
    } else if (key === 'guess') {
      const att = mine.map((r) => r.attempts).filter(Boolean);
      if (att.length) best = `最少 ${Math.min(...att)} 次猜中`;
    } else {
      const mv = mine.map((r) => r.moves).filter(Boolean);
      if (mv.length) best = `最少 ${Math.min(...mv)} 步`;
    }
    grid.appendChild(el('div', { class: 'sh-tile gm-tile', onclick: () => { tab = key; paint(); } }, [
      el('div', { class: 'sh-emoji', style: { background: `linear-gradient(145deg,${g.bg[0]},${g.bg[1]})` }, text: g.emoji }),
      el('div', { class: 'sh-name', text: g.name }),
      el('div', { class: 'gm-desc', text: g.desc }),
      best ? el('div', { class: 'gm-best', text: best }) : null
    ]));
  }
  return grid;
}

/* ---------------- 战绩页 ---------------- */
async function recordsNode() {
  const recs = (await all('games')).sort((a, b) => b.ts - a.ts);
  const wrap = el('div');

  if (!recs.length) {
    wrap.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-040'),
      el('div', { class: 'e-h', text: '还没有战绩' }),
      el('div', { class: 'e-p', text: '去玩一局，赢过 TA' })
    ]));
    return wrap;
  }

  recs.forEach((r) => {
    const g = GAMES[r.type] || { name: '游戏', emoji: '🎮' };
    wrap.appendChild(el('div', { class: 'card rec-card' }, [
      el('div', { class: 'rec-emoji', style: { background: `linear-gradient(145deg,${g.bg?.[0] || '#eee'},${g.bg?.[1] || '#ddd'})` }, text: g.emoji }),
      el('div', { class: 'sh-order-main' }, [
        el('div', { class: 'sh-order-name', text: g.name }),
        el('div', { class: 'small muted', text: fmtDay(r.ts) }),
        el('div', { class: 'rec-text', text: r.text })
      ]),
      el('span', { class: 'badge sh-state ' + recTone(r.result), text: recLabel(r.result) })
    ]));
  });

  wrap.appendChild(el('button', { class: 'btn block gm-clear', onclick: clearRecords }, [iconImg('IC-CRD-007'), '清空战绩']));
  return wrap;
}

function recTone(res) {
  return { win: 'st-done', lose: 'st-ship', draw: 'st-ship', ok: 'st-gift' }[res] || 'st-ship';
}
function recLabel(res) {
  return { win: '胜', lose: '负', draw: '平', ok: '完成' }[res] || '—';
}

async function clearRecords() {
  const ok = await confirmBox({ title: '清空战绩', text: '所有游戏记录都会被删掉，确定吗？', danger: true, okText: '清空' });
  if (!ok) return;
  await clear('games');
  toast('战绩已清空');
  paint();
}

/* ---------------- 战绩入库 + 发给 TA ---------------- */
async function saveRecord(rec) {
  await put('games', Object.assign({ id: 'gm_' + uid(), ts: Date.now() }, rec));
}

async function shareRecord(rec) {
  const g = GAMES[rec.type] || { name: '游戏' };
  await sched.addMessage({ role: 'me', text: `🎮 游戏厅 · ${g.name}：${rec.text}` });
  toast('战绩已发给 TA');
}

/* ---------------- 猜拳：三局两胜 ---------------- */
function rpsGame() {
  let my = 0, ta = 0, round = 0, locked = false;

  const myHand = el('div', { class: 'rps-hand', text: '❔' });
  const taHand = el('div', { class: 'rps-hand', text: '❔' });
  const mid = el('div', { class: 'rps-mid' });
  const scoreLine = el('div', { class: 'gm-score', text: '我 0 : 0 TA' });
  const roundLine = el('div', { class: 'hint', style: { textAlign: 'center' }, text: '先赢两局的获胜，出个手吧' });
  const arena = el('div', { class: 'rps-arena' }, [
    el('div', { class: 'rps-side' }, [myHand, el('div', { class: 'rps-who', text: '我' })]),
    mid,
    el('div', { class: 'rps-side' }, [taHand, el('div', { class: 'rps-who', text: state.role.name || 'TA' })])
  ]);
  const btns = el('div', { class: 'rps-btns' });

  root();
  function root() {
    mid.textContent = 'VS';
    btns.innerHTML = '';
    RPS_HANDS.forEach((h, i) => btns.appendChild(el('button', { class: 'rps-btn', onclick: () => play(i) }, [h, el('span', { text: RPS_NAMES[i] })])));
  }

  function play(i) {
    if (locked) return;
    locked = true;
    const t = rndInt(0, 2);
    myHand.textContent = RPS_HANDS[i];
    taHand.textContent = RPS_HANDS[t];
    const win = (t - i + 3) % 3 === 1;   // 石头赢剪刀、剪刀赢布、布赢石头
    round++;
    if (win) my++;
    else if (i !== t) ta++;
    mid.textContent = win ? '赢！' : i === t ? '平' : '输';
    scoreLine.textContent = `我 ${my} : ${ta} ${state.role.name || 'TA'}`;
    void round;

    if (my >= 2 || ta >= 2) {
      const result = my >= 2 ? 'win' : 'lose';
      const rec = { type: 'rps', result, text: `三局两胜 ${my}-${ta}${result === 'win' ? ' 赢了' : ' 输了'}`, win: my, lose: ta };
      saveRecord(rec);
      roundLine.textContent = result === 'win' ? `这一局赢了 ${state.role.name || 'TA'}！` : `被 ${state.role.name || 'TA'} 赢了，再来一局？`;
      finish(rec);
    } else {
      roundLine.textContent = `${RPS_NAMES[i]} 对 ${RPS_NAMES[t]}，继续！`;
      locked = false;
    }
  }

  function finish(rec) {
    btns.innerHTML = '';
    btns.appendChild(el('button', { class: 'btn primary block', onclick: () => shareRecord(rec) }, [iconImg('IC-MOM-005'), '把战绩发给 TA']));
    btns.appendChild(el('button', { class: 'btn block', style: { marginTop: '9px' }, onclick: () => { tab = 'rps'; paint(); } }, ['再来一局']));
  }

  return el('div', { class: 'gm-area' }, [
    el('div', { class: 'card gm-card' }, [arena, scoreLine, roundLine]),
    btns
  ]);
}

/* ---------------- 猜数字 ---------------- */
function guessGame() {
  const target = rndInt(1, 100);
  let attempts = 0;

  const input = el('input', { class: 'input', type: 'number', min: '1', max: '100', placeholder: '1 ~ 100' });
  const hint = el('div', { class: 'hint', style: { textAlign: 'center' }, text: `${state.role.name || 'TA'} 在 1~100 里藏了个数，猜吧` });
  const count = el('div', { class: 'gm-score', text: '已猜 0 次' });
  const log = el('div', { class: 'guess-log' });

  function submit() {
    const v = parseInt(input.value, 10);
    if (!v || v < 1 || v > 100) { toast('要填 1~100 之间的数字'); return; }
    attempts++;
    count.textContent = `已猜 ${attempts} 次`;
    const line = el('div', { class: 'guess-line' }, [
      el('b', { text: String(v) }),
      el('span', { text: v === target ? '· 猜中了！' : v < target ? '· 太小了，往上' : '· 太大了，往下' })
    ]);
    log.insertBefore(line, log.firstChild);
    input.value = '';

    if (v === target) {
      const rec = { type: 'guess', result: 'ok', text: `猜中 ${target}，用了 ${attempts} 次`, attempts };
      saveRecord(rec);
      input.disabled = true;
      const btns = el('div', { style: { marginTop: '12px' } }, [
        el('button', { class: 'btn primary block', onclick: () => shareRecord(rec) }, [iconImg('IC-MOM-005'), '把战绩发给 TA']),
        el('button', { class: 'btn block', style: { marginTop: '9px' }, onclick: () => { tab = 'guess'; paint(); } }, ['再玩一次'])
      ]);
      root.appendChild(btns);
    } else {
      input.focus();
    }
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const go = el('button', { class: 'btn primary', onclick: submit }, ['猜']);
  const root = el('div', { class: 'gm-area' }, [
    el('div', { class: 'card gm-card' }, [
      hint, count,
      el('div', { class: 'guess-row' }, [input, go]),
      log
    ])
  ]);
  return root;
}

/* ---------------- 翻牌配对 ---------------- */
function memoryGame() {
  const emojis = ['🍎', '🍋', '🍇', '🍓', '🥝', '🍑', '🍍', '🥑'];
  const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  let open = [];        // 当前翻开的两张
  let matched = 0;
  let moves = 0;
  let started = 0;
  let locked = false;

  const status = el('div', { class: 'gm-score', text: '步数 0 · 配对 0/8' });
  const board = el('div', { class: 'mem-board' });
  const card = el('div', { class: 'card gm-card' }, [status, board]);

  deck.forEach((em) => {
    const card = el('button', { class: 'mem-card', dataset: { em }, onclick: () => flip(card) }, [
      el('span', { class: 'mem-front', text: '?' }),
      el('span', { class: 'mem-back', text: em })
    ]);
    board.appendChild(card);
  });

  function flip(card) {
    if (locked || card.classList.contains('open') || card.classList.contains('done')) return;
    if (!started) started = Date.now();
    card.classList.add('open');
    open.push(card);

    if (open.length < 2) return;
    moves++;
    const [a, b] = open;
    if (a.dataset.em === b.dataset.em) {
      a.classList.add('done'); b.classList.add('done');
      matched++;
      open = [];
      status.textContent = `步数 ${moves} · 配对 ${matched}/8`;
      if (matched === 8) finish();
    } else {
      locked = true;
      status.textContent = `步数 ${moves} · 配对 ${matched}/8`;
      setTimeout(() => {
        a.classList.remove('open'); b.classList.remove('open');
        open = []; locked = false;
      }, 650);
    }
  }

  function finish() {
    const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    const rec = { type: 'memory', result: 'ok', text: `${moves} 步配成 8 对 · 用时 ${seconds} 秒`, moves, seconds };
    saveRecord(rec);
    card.appendChild(el('div', { class: 'btns', style: { marginTop: '12px' } }, [
      el('button', { class: 'btn primary block', onclick: () => shareRecord(rec) }, [iconImg('IC-MOM-005'), '把战绩发给 TA']),
      el('button', { class: 'btn block', style: { marginTop: '9px' }, onclick: () => { tab = 'memory'; paint(); } }, ['再来一把'])
    ]));
  }

  return el('div', { class: 'gm-area' }, [card]);
}
