/* 灵感拾取 · 查看 TA 悄悄收走的句子 */

import { el } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { actionSheet, confirmBox, toast } from '../ui.js';
import { listInspirations, removeInspiration, clearInspirations, SOURCE_LABEL } from '../inspiration.js';
import { state } from '../state.js';

let rows = [];
let viewEl = null;

export default async function pageInspiration(v) {
  viewEl = v;
  fullPage({
    back: true, title: '灵感拾取', sub: 'TA 悄悄收的你的话',
    actions: [{ label: '清空全部', onclick: clearAll }]
  });
  await load();
}

async function load() {
  rows = await listInspirations();
  paint();
}

function paint() {
  viewEl.innerHTML = '';
  const page = el('div', { class: 'page', style: { padding: '12px 14px 30px' } });

  const hint = state.role.params?.inspirationEnabled
    ? `TA 每次有 ${state.role.params.inspirationPct || 0}% 概率捡起你说的一句话，之后在聊天里有 ${state.role.params.inspirationUsePct || 0}% 概率直接用出来。`
    : '灵感拾取已在「角色设置」里关闭，TA 不会再收你的话。';
  page.appendChild(el('div', { class: 'hint', style: { marginBottom: '12px' }, text: hint }));

  const pending = rows.filter((r) => !r.used);
  const used = rows.filter((r) => r.used);

  if (!rows.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-020'),
      el('div', { class: 'e-h', text: '还没有被拾起的句子' }),
      el('div', { class: 'e-p', text: '多和 TA 说说话，或许哪句就被悄悄收走了' })
    ]));
    viewEl.appendChild(page);
    return;
  }

  if (pending.length) {
    page.appendChild(el('div', { class: 'an-sec-h' }, [
      el('div', { class: 'an-sec-t', text: '还没被用到' }),
      el('div', { class: 'an-sec-n', text: String(pending.length) })
    ]));
    pending.forEach((r) => page.appendChild(card(r)));
  }

  if (used.length) {
    page.appendChild(el('div', { class: 'an-sec-h' }, [
      el('div', { class: 'an-sec-t', text: '已经被用过' }),
      el('div', { class: 'an-sec-n', text: String(used.length) })
    ]));
    used.forEach((r) => page.appendChild(card(r, true)));
  }

  viewEl.appendChild(page);
}

function card(r, used = false) {
  const src = SOURCE_LABEL[r.source] || r.source;
  const date = new Date(r.ts);
  const p = (n) => String(n).padStart(2, '0');
  const time = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;

  return el('div', {
    class: 'card ins-card' + (used ? ' used' : ''),
    onclick: () => openMenu(r)
  }, [
    el('div', { class: 'ins-text', text: r.text }),
    el('div', { class: 'ins-meta' }, [
      el('span', { class: 'ins-src', text: src }),
      el('span', { text: time }),
      used ? el('span', { class: 'ins-used', text: '已用过' }) : null
    ])
  ]);
}

function openMenu(r) {
  actionSheet('灵感', [
    { label: '删除这一条', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      await removeInspiration(r.id);
      await load();
      toast('已删除');
    } }
  ]);
}

async function clearAll() {
  if (!rows.length) return toast('已经是空的');
  const yes = await confirmBox({
    title: '清空全部灵感',
    text: `删除全部 ${rows.length} 条被 TA 拾起的句子？`,
    okText: '全部删除', danger: true
  });
  if (!yes) return;
  const n = await clearInspirations();
  await load();
  toast(`已清空 ${n} 条`);
}
