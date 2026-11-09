/* 备忘录 · 纯本地便签（新建 / 编辑 / 置顶 / 删除 / 搜索）
   数据存在 IndexedDB 的 memos 表，随「数据」页的整包备份一起导出。 */

import { el, uid, fmtDateTime } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';

let view = null;
let items = [];
let keyword = '';
let listEl = null;

export default async function pageMemo(v) {
  view = v;
  fullPage({ back: true, title: '备忘录', sub: '纯本地便签 · 可设到点弹窗 / 聊天随机提醒' });
  items = await load();
  paint();
}

/** datetime-local 需要的本地时间串 */
function localDT(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 角标用的短时间：06 15:03 */
function shortTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  const rows = await all('memos');
  return rows.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || (b.ts || 0) - (a.ts || 0));
}

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page memo' });

  const input = el('input', { class: 'input', placeholder: '搜索备忘录…', value: keyword });
  input.addEventListener('input', () => { keyword = input.value; paintList(); });

  page.appendChild(el('div', { class: 'memo-bar' }, [
    el('div', { class: 'memo-search' }, [iconImg('IC-CRD-010'), input]),
    el('button', { class: 'btn primary sm', onclick: () => openEditor(null) }, [iconImg('IC-MIO-022'), '新建'])
  ]));

  listEl = el('div', { class: 'memo-list' });
  page.appendChild(listEl);
  view.appendChild(page);
  paintList();
}

function paintList() {
  listEl.innerHTML = '';
  const kw = keyword.trim().toLowerCase();
  const rows = kw ? items.filter((m) => (m.text || '').toLowerCase().includes(kw)) : items;

  if (!rows.length) {
    listEl.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-026'),
      el('div', { class: 'e-h', text: kw ? '没有匹配的备忘录' : '还没有备忘录' }),
      el('div', { class: 'e-p', text: kw ? '换个关键词试试' : '点右上角「新建」记下第一件事' })
    ]));
    return;
  }

  rows.forEach((m) => {
    const lines = String(m.text || '').split('\n');
    const flags = [];
    if (m.remindAt && !m.remindDone) flags.push(el('span', { class: 'memo-flag on', text: '⏰ ' + shortTime(m.remindAt) }));
    if (m.chatRemind && Number(m.chatPct) > 0) flags.push(el('span', { class: 'memo-flag chat', text: '💬 ' + Number(m.chatPct) + '%' }));
    listEl.appendChild(el('div', { class: 'memo-card' + (m.top ? ' top' : ''), onclick: () => openMenu(m) }, [
      el('div', { class: 'memo-t', text: lines[0].slice(0, 40) || '（空）' }),
      lines.length > 1 ? el('div', { class: 'memo-p', text: lines.slice(1).join(' ').slice(0, 60) }) : null,
      el('div', { class: 'memo-meta' }, [
        el('div', { class: 'row wrap', style: { gap: '6px', alignItems: 'center' } }, [
          el('span', { class: 'tiny muted', text: fmtDateTime(m.ts) }),
          ...flags
        ]),
        m.top ? iconImg('IC-MIO-020', 'memo-star') : null
      ])
    ]));
  });
}

function openMenu(m) {
  actionSheet('备忘录', [
    { label: '编辑', icon: 'IC-CRD-006', onSelect: () => openEditor(m) },
    { label: m.top ? '取消置顶' : '置顶', icon: 'IC-MIO-020', onSelect: () => toggleTop(m) },
    { label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: () => remove(m) }
  ]);
}

async function toggleTop(m) {
  m.top = !m.top;
  await put('memos', m);
  items = await load();
  paintList();
  toast(m.top ? '已置顶' : '已取消置顶');
}

async function remove(m) {
  const yes = await confirmBox({ title: '删除备忘录', text: '删除后无法恢复，确定吗？', okText: '删除', danger: true });
  if (!yes) return;
  await del('memos', m.id);
  items = await load();
  paintList();
  toast('已删除');
}

function openEditor(m) {
  const ta = el('textarea', { class: 'input', rows: 8, placeholder: '记点什么…' });
  ta.value = m ? m.text : '';

  /* 到点弹窗提醒（可选） */
  const remindInput = el('input', {
    class: 'input', type: 'datetime-local',
    value: m && m.remindAt ? localDT(m.remindAt) : ''
  });

  /* 聊天中随机提醒：开关 + 概率（默认 2%） */
  let chatOn = !!(m && m.chatRemind);
  const pctInput = el('input', {
    class: 'input', type: 'number', min: '0', max: '100', step: '0.5',
    value: String(Math.max(0, Number(m && m.chatPct != null ? m.chatPct : 2))),
    style: { width: '78px' }
  });
  const chatChip = el('button', {
    class: 'chip' + (chatOn ? ' on' : ''), type: 'button',
    onclick: () => { chatOn = !chatOn; chatChip.classList.toggle('on', chatOn); }
  }, [chatOn ? '开' : '关']);

  async function save() {
    const text = ta.value.trim();
    if (!text) { toast('内容不能为空'); return; }
    const parsed = remindInput.value ? Date.parse(remindInput.value) : null;
    const remindAt = parsed && !Number.isNaN(parsed) ? parsed : null;
    let pct = Number(pctInput.value);
    if (Number.isNaN(pct)) pct = 2;
    pct = Math.min(100, Math.max(0, pct));
    if (m) {
      m.text = text;
      m.updatedAt = Date.now();
      m.remindAt = remindAt;
      m.remindDone = false;                 // 改了时间就重新开始提醒
      m.chatRemind = chatOn;
      m.chatPct = pct;
      await put('memos', m);
    } else {
      await put('memos', {
        id: uid(), text, ts: Date.now(), updatedAt: Date.now(), top: false,
        remindAt, remindDone: false, chatRemind: chatOn, chatPct: pct
      });
    }
    items = await load();
    paintList();
    toast('已保存');
  }

  sheet({
    title: m ? '编辑备忘录' : '新建备忘录',
    node: el('div', {}, [
      el('div', { class: 'field' }, [ta]),
      el('div', { class: 'field' }, [
        el('label', { text: '⏰ 到点弹窗提醒' }),
        remindInput,
        el('div', { class: 'hint', text: '留空＝不提醒。到点时弹窗并在消息页发一条系统提醒：「知道了」完成本轮；「推迟 10 分钟」或直接关掉＝稍后再提醒。' })
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '💬 聊天中随机提醒' }),
        el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [chatChip, pctInput, '%']),
        el('div', { class: 'hint', text: '默认 2%：你每发一条消息掷一次骰子，命中后 TA 会在聊天里提醒这条备忘；每条备忘每天最多提醒一次。' })
      ])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => { void save(); } }]
  });
  setTimeout(() => ta.focus(), 260);
}
