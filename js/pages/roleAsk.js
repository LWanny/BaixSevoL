/* TA 的询问 · 设置页
   开关 + 触发概率（下限 / 上限）+ 问题库（我出题：问题 / 选项 / 最多选几个 / 可否附加文字回答）。
   TA 到点后按概率从问题库里抽一题发到聊天里，我随时想答就答，不答也不影响。 */

import { el, uid } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { kvGet, kvSet } from '../store.js';
import { state } from '../state.js';
import { sheet, confirmBox, toast } from '../ui.js';
import { taAskNow } from '../scheduler.js';
import { setupRoleUi, section } from './roleParts.js';

const BANK_KEY = 'taAskBank';
const p2 = (n) => String(n).padStart(2, '0');

export default async function pageRoleAsk(view) {
  fullPage({ back: true, title: 'TA的询问', sub: 'TA 偶尔向你提问 · 我出题' });
  const p = state.role.params;
  const { rowPct, rowToggle } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  /* ---- 触发 ---- */
  const planLine = el('div', { class: 'hint', style: { padding: '2px 14px 0' } });
  async function paintPlan() {
    const plan = await kvGet('taAskPlan', null);
    const today = (() => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; })();
    if (!plan || plan.date !== today) {
      planLine.textContent = p.taAskEnabled ? '今天的提问时间还没抽出来，稍等片刻。' : '开关关闭中，不会提问。';
      return;
    }
    const t = new Date(plan.at);
    planLine.textContent = `今天：${p2(t.getHours())}:${p2(t.getMinutes())} 抽了 ${plan.pct}% 的概率，${plan.done ? '已经掷过这一次了' : '到点后掷一次决定问不问'}`;
  }

  const testBtn = el('button', { class: 'btn block', style: { margin: '10px 14px 12px', width: 'calc(100% - 28px)' }, onclick: async () => {
    const ok = await taAskNow();
    toast(ok ? 'TA 已经在问了，去聊天看看' : '现在没法问：已有没回答的问题，或问题库是空的');
  } }, ['让 TA 现在问一次']);

  wrap.appendChild(section('触发', el('div', { class: 'set-card' }, [
    rowToggle('TA 偶尔向你提问', '关闭后 TA 不会向你提问', 'taAskEnabled', p.taAskEnabled),
    rowPct('触发概率下限', '每天在这个区间里抽一个概率', 'taAskPctMin', p.taAskPctMin),
    rowPct('触发概率上限', '', 'taAskPctMax', p.taAskPctMax),
    planLine,
    testBtn,
    el('div', { class: 'hint', style: { padding: '2px 14px 12px' }, text: '每天随机抽一个时刻和概率；到点后掷一次，命中就从问题库里挑一题发到聊天。同一时间最多一条没回答的问题，回答与否由我随时决定，没有时限。' })
  ])));

  await paintPlan();

  /* ---- 问题库 ---- */
  const listBox = el('div', { class: 'set-card', style: { padding: '6px 0' } });
  const bankSec = section('问题库', listBox);
  wrap.appendChild(bankSec);

  async function loadBank() {
    const bank = (await kvGet(BANK_KEY, [])) || [];
    return Array.isArray(bank) ? bank : [];
  }
  async function saveBank(bank) { await kvSet(BANK_KEY, bank); }

  async function paintBank() {
    const bank = await loadBank();
    listBox.innerHTML = '';
    if (!bank.length) {
      listBox.appendChild(el('div', { class: 'hint', style: { padding: '12px 14px' }, text: '还没有问题。新建几道题，TA 就会按概率挑一道来问你。' }));
    }
    bank.forEach((q, i) => {
      listBox.appendChild(el('div', { class: 'set-row', style: { cursor: 'pointer' }, onclick: () => editQuestion(bank, i) }, [
        el('div', { class: 'set-main' }, [
          el('div', { class: 'set-t', text: q.text || '（未写问题）' }),
          el('div', { class: 'set-s', text: `${(q.options || []).length} 个选项 · 最多选 ${q.maxPick || 1} 个 · ${q.allowText ? '可附加文字回答' : '仅选项'}` })
        ]),
        el('div', { class: 'set-ctl' }, [iconImg('IC-MIO-004', 'chev')])
      ]));
    });
    listBox.appendChild(el('button', { class: 'btn block', style: { margin: '8px 14px 12px', width: 'calc(100% - 28px)' }, onclick: () => editQuestion(bank, -1) }, ['＋ 新建问题']));
  }

  /* ---- 新建 / 编辑一道题 ---- */
  function editQuestion(bank, idx) {
    const q = idx >= 0 ? Object.assign({ id: uid(), text: '', options: [], maxPick: 1, allowText: false }, bank[idx]) : { id: uid(), text: '', options: [], maxPick: 1, allowText: false };

    const node = el('div', { class: 'ask-form' });

    const qInput = el('input', { class: 'input', maxlength: '80', value: q.text || '', placeholder: '写下 TA 要问你的问题…' });
    node.appendChild(el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', text: '问题' }),
      qInput
    ]));

    const optsInput = el('textarea', {
      class: 'input', style: { minHeight: '120px', resize: 'vertical' },
      placeholder: '一行一个选项\n例如：\n在忙\n还好\n想你了', maxlength: '600'
    });
    optsInput.value = (q.options || []).join('\n');
    node.appendChild(el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', text: '选项（一行一个，2~8 个）' }),
      optsInput
    ]));

    let maxPick = Number(q.maxPick) || 1;
    const maxInput = el('input', { class: 'input', type: 'number', min: '1', max: '8', value: String(maxPick), style: { width: '88px', textAlign: 'center' } });
    maxInput.addEventListener('input', () => { maxPick = Number(maxInput.value) || 1; });
    node.appendChild(el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', style: { display: 'inline-flex', gap: '8px' } }, [
        el('span', { text: '最多选几个' }),
        el('span', { class: 'ask-sub inline', text: '至少勾一个' })
      ]),
      el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [maxInput, el('span', { class: 'ask-sub', text: '个' })])
    ]));

    let allowText = !!q.allowText;
    const textCk = el('div', { class: 'ask-ck' + (allowText ? ' on' : ''), onclick: () => { allowText = !allowText; textCk.classList.toggle('on', allowText); } }, [el('i')]);
    node.appendChild(el('div', { class: 'ask-ck-row' }, [
      el('div', { class: 'ask-ck-main' }, [
        el('div', { class: 'ask-lb', text: '可附加文字回答' }),
        el('div', { class: 'ask-sub', text: '回答时可以再打一行字，文字也算一个选项' })
      ]),
      textCk
    ]));

    const foot = el('div', { class: 'ask-foot' }, [
      el('button', { class: 'btn ask-cancel', onclick: () => ctl.close() }, ['取消']),
      el('button', { class: 'btn ask-send', onclick: async () => {
        const text = qInput.value.trim();
        if (!text) { toast('先写下问题'); return; }
        const options = (optsInput.value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (options.length < 2) { toast('至少写两个选项'); return; }
        if (options.length > 8) { toast('选项不要超过 8 个'); return; }
        const item = {
          id: q.id,
          text,
          options,
          maxPick: Math.max(1, Math.min(options.length, Number(maxPick) || 1)),
          allowText
        };
        if (idx >= 0) bank[idx] = item; else bank.push(item);
        await saveBank(bank);
        await paintBank();
        ctl.close();
        toast('已保存');
      } }, ['保存'])
    ]);
    if (idx >= 0) {
      foot.insertBefore(el('button', { class: 'btn ask-cancel', style: { color: 'var(--danger)' }, onclick: async () => {
        const yes = await confirmBox({ title: '删除这道题', text: '删除后 TA 不会再问这一题。', danger: true });
        if (!yes) return;
        bank.splice(idx, 1);
        await saveBank(bank);
        await paintBank();
        ctl.close();
        toast('已删除');
      } }, ['删除']), foot.firstChild);
    }

    const ctl = sheet({ title: idx >= 0 ? '编辑问题' : '新建问题', node, foot });
  }

  await paintBank();
  view.appendChild(wrap);
}
