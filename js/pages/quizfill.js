/* 问卷填写页 · 双方共同作答
   - 对方回复速度：20~300 秒随机（对方的选择、开放题回答、附加评论都是这个节奏）
   - 对方的字卡回复：1~20 张随机，字卡之间用空格隔开
   - 字卡回复（选择/回答）在我答完之前一律不可见；我答完后，对方已答好就立刻揭晓
   - 附加评论在对方选择揭晓后必须出现（也走 20~300 秒）
   - 出结果后可直接点选项换答案，对方的评论与我的评论保留不动
   - 左上角 X 关闭即放弃本次填写 */

import { el, pick, rndInt } from '../util.js';
import { iconImg } from '../icons.js';
import { all, get, put, bulkPut } from '../store.js';
import { eligible, drawCards } from '../engine.js';
import { toast } from '../ui.js';
import { go, goBackTo } from '../router.js';
import { hideTopbar } from '../shell.js';

let alive = true;
let timers = [];

/* 对方回复速度：20~300 秒随机（字卡回答与附加评论都用这个节奏） */
const taReplyDelay = () => rndInt(20000, 300000);

/** 对方的字卡回复：1~20 张随机，空格隔开（导出仅供测试） */
export function taReplyFrom(pool) {
  if (!pool || !pool.length) return { text: '（沉默）', drawn: [] };
  const n = rndInt(1, Math.min(20, pool.length));
  const drawn = drawCards(pool, n, false);
  return { text: drawn.map((c) => c.content).join(' ') || '（沉默）', drawn };
}

function later(fn, ms) {
  const id = setTimeout(() => { if (alive) fn(); }, ms);
  timers.push(id);
  return id;
}
function clearTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers = [];
}

export default async function pageQuizFill(view, params = {}) {
  alive = true;
  clearTimers();
  window.addEventListener('hashchange', () => { alive = false; clearTimers(); }, { once: true });

  hideTopbar();

  const tpl = await get('quizzes', params.id || '');
  if (!tpl || !Array.isArray(tpl.items) || !tpl.items.length) {
    view.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'e-h', text: '问卷不存在' }),
        el('div', { class: 'e-p', text: '这份问卷可能已经被删除了' })
      ])
    ]));
    return;
  }

  const items = tpl.items;
  let idx = 0;
  const myAns = items.map(() => ({ answer: '', comment: '' }));
  const taAns = items.map(() => ({ answer: '', comment: '' }));

  const prog = el('div', { class: 'qf-prog' });
  const head = el('div', { class: 'qf-head' }, [
    el('button', { class: 'qf-x', onclick: () => goBackTo('/quiz') }, [iconImg('IC-MIO-002')]),
    el('div', { class: 'qf-title', text: tpl.title }),
    prog
  ]);
  const body = el('div', { class: 'qf-body' });
  view.appendChild(el('div', { class: 'page qf' }, [head, body]));

  renderQ();

  /* ---------------- 一题 ---------------- */
  function renderQ() {
    clearTimers();
    body.innerHTML = '';
    prog.textContent = `${idx + 1} / ${items.length}`;

    const it = items[idx];
    const opts = (it.type === 'choice' && Array.isArray(it.options)) ? it.options.slice() : [];
    const slots = {
      ta: el('div'),
      taCmt: el('div'),
      cmt: el('div'),
      acts: el('div')
    };
    body.appendChild(el('div', { class: 'qf-q', text: it.content }));

    if (opts.length) renderChoice(it, opts, slots);
    else renderOpen(slots);
  }

  /* 选择题：双方各选一个。对方在后台 20~300 秒内答好；
     但我答完之前永远看不到对方的结果，答完后（对方已答好则立刻）揭晓 */
  function renderChoice(it, opts, slots) {
    const allowCmt = !!it.allowComment;
    let phase = 'idle';      // idle | wait | both | cmtWait | cmtDone
    let taReady = false;     // 对方是否已在后台答好

    const wrap = el('div', { class: 'qf-opts' });
    const btns = opts.map((o) => {
      const b = el('button', { class: 'qf-opt', text: o, onclick: () => choose(o) });
      wrap.appendChild(b);
      return b;
    });
    body.append(wrap, slots.ta, slots.taCmt, slots.cmt, slots.acts);

    /* 对方后台作答：内容先不渲染 */
    later(() => {
      taAns[idx].answer = pick(opts);
      taReady = true;
      if (phase === 'wait') revealTa();   // 我已答完 → 揭晓
    }, taReplyDelay());

    function paintTa(label, value, muted) {
      slots.ta.innerHTML = '';
      slots.ta.appendChild(el('div', { class: 'qf-block' }, [
        el('div', { class: 'qf-block-l', text: label }),
        el('div', { class: 'qf-block-v' + (muted ? ' muted' : ''), text: value })
      ]));
    }

    function paintTaComment(text) {
      slots.taCmt.innerHTML = '';
      slots.taCmt.appendChild(el('div', { class: 'qf-block' }, [
        el('div', { class: 'qf-block-l', text: '对方 评论' }),
        el('div', { class: 'qf-block-v', text: text })
      ]));
    }

    function showTyping() {
      slots.taCmt.innerHTML = '';
      slots.taCmt.appendChild(el('div', { class: 'qf-typing' }, [
        el('span', { class: 'qf-dots' }, [el('i'), el('i'), el('i')]),
        el('span', { text: '对方正在输入评论…' })
      ]));
    }

    function paintMyCmt() {
      slots.cmt.innerHTML = '';
      const ta = el('textarea', { class: 'qf-cmt', rows: 3, placeholder: '写下你的评论…（可留空）' });
      ta.addEventListener('input', () => { myAns[idx].comment = ta.value; });
      slots.cmt.appendChild(ta);
    }

    /* 揭晓对方的选择；设置了附加评论 → 评论必须出现 */
    function revealTa() {
      paintTa('对方 选择', taAns[idx].answer);
      if (!allowCmt) { phase = 'both'; paintActs(); return; }
      phase = 'cmtWait';
      slots.cmt.innerHTML = '';
      showTyping();
      paintActs();
      later(async () => {
        taAns[idx].comment = await drawLine();
        paintTaComment(taAns[idx].comment);
        phase = 'cmtDone';
        paintMyCmt();
        paintActs();
      }, taReplyDelay());
    }

    function paintActs() {
      slots.acts.innerHTML = '';
      const list = [];
      if (phase === 'wait' || phase === 'both') {
        list.push(el('button', { class: 'qf-btn', text: '重选', onclick: resetQ }));
      }
      if (phase === 'both' || phase === 'cmtDone') {
        list.push(el('button', { class: 'qf-btn', text: idx === items.length - 1 ? '完成' : '下一步', onclick: next }));
      }
      if (list.length) slots.acts.appendChild(el('div', { class: 'qf-acts' }, list));
    }

    function choose(o) {
      /* 对方选择/评论中，先等 */
      if (phase === 'wait' || phase === 'cmtWait') return;

      /* 出结果后想换：直接点选项就行，对方的评论和你已写的评论都保留不动 */
      if (phase === 'both' || phase === 'cmtDone') {
        if (myAns[idx].answer === o) return;
        myAns[idx].answer = o;
        btns.forEach((b) => b.classList.toggle('on', b.textContent === o));
        return;
      }

      phase = 'wait';
      myAns[idx].answer = o;
      btns.forEach((b) => b.classList.toggle('on', b.textContent === o));
      if (taReady) { revealTa(); return; }   // 对方已答好 → 这一刻才可见
      paintTa('对方 选择', '还在选择中…', true);
      paintActs();
    }
  }

  /* 开放题：我写回答并提交，之后才可能看到对方（20~300 秒内答好的）字卡回应 */
  function renderOpen(slots) {
    let phase = 'draft';     // draft | waitTa | done
    let taReady = false;
    const ta = el('textarea', { class: 'qf-cmt', rows: 3, placeholder: '写下你的回答…' });
    ta.addEventListener('input', () => { myAns[idx].answer = ta.value; });
    slots.cmt.appendChild(ta);
    body.append(slots.cmt, slots.ta, slots.acts);

    function paintTaAnswer() {
      slots.ta.innerHTML = '';
      slots.ta.appendChild(el('div', { class: 'qf-block' }, [
        el('div', { class: 'qf-block-l', text: '对方 回答' }),
        el('div', { class: 'qf-block-v', text: taAns[idx].answer })
      ]));
    }

    function reveal() {
      paintTaAnswer();
      phase = 'done';
      paintActs();
    }

    function paintActs() {
      slots.acts.innerHTML = '';
      const isLast = idx === items.length - 1;
      if (phase === 'draft') {
        slots.acts.appendChild(el('div', { class: 'qf-acts' }, [
          el('button', { class: 'qf-btn', text: '提交回答', onclick: submit })
        ]));
      } else if (phase === 'done') {
        slots.acts.appendChild(el('div', { class: 'qf-acts' }, [
          el('button', { class: 'qf-btn', text: isLast ? '完成' : '下一步', onclick: next })
        ]));
      }
    }

    function submit() {
      if (!ta.value.trim()) { toast('先写下你的回答'); return; }
      myAns[idx].answer = ta.value.trim();
      phase = 'waitTa';
      paintActs();
      if (taReady) { reveal(); return; }   // 对方已答好 → 这一刻才可见
      slots.ta.innerHTML = '';
      slots.ta.appendChild(el('div', { class: 'qf-typing' }, [
        el('span', { class: 'qf-dots' }, [el('i'), el('i'), el('i')]),
        el('span', { text: '对方正在作答…' })
      ]));
    }

    paintActs();
    later(async () => {
      taAns[idx].answer = await drawLine();
      taReady = true;
      if (phase === 'waitTa') reveal();    // 我已提交 → 揭晓
    }, taReplyDelay());
  }

  /* ---------------- 推进 ---------------- */
  function resetQ() {
    myAns[idx] = { answer: '', comment: '' };
    taAns[idx] = { answer: '', comment: '' };
    renderQ();
  }

  function next() {
    if (idx >= items.length - 1) { finish(); return; }
    idx += 1;
    renderQ();
  }

  async function finish() {
    clearTimers();
    tpl.records = Array.isArray(tpl.records) ? tpl.records : [];
    tpl.records.push({ ts: Date.now(), answers: myAns, ta: taAns });
    tpl.fillCount = (tpl.fillCount || 0) + 1;
    await put('quizzes', tpl);
    alive = false;
    toast('问卷已完成');
    goBackTo('/quiz');
  }

  /* ---------------- 对方的话由字卡拼出 ---------------- */
  async function drawLine() {
    const cards = await all('cards');
    const r = taReplyFrom(eligible(cards));
    const map = new Map(cards.map((c) => [c.id, c]));
    const updates = [];
    r.drawn.forEach((c) => {
      const row = map.get(c.id);
      if (row) { row.count = (row.count || 0) + 1; updates.push(row); }
    });
    if (updates.length) await bulkPut('cards', updates);
    return r.text;
  }
}
