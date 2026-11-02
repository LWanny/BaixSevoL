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
  fullPage({ back: true, title: '备忘录', sub: '纯本地便签 · 只存在这台设备' });
  items = await load();
  paint();
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
    listEl.appendChild(el('div', { class: 'memo-card' + (m.top ? ' top' : ''), onclick: () => openMenu(m) }, [
      el('div', { class: 'memo-t', text: lines[0].slice(0, 40) || '（空）' }),
      lines.length > 1 ? el('div', { class: 'memo-p', text: lines.slice(1).join(' ').slice(0, 60) }) : null,
      el('div', { class: 'memo-meta' }, [
        el('span', { class: 'tiny muted', text: fmtDateTime(m.ts) }),
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

  async function save() {
    const text = ta.value.trim();
    if (!text) { toast('内容不能为空'); return; }
    if (m) {
      m.text = text;
      m.updatedAt = Date.now();
      await put('memos', m);
    } else {
      await put('memos', { id: uid(), text, ts: Date.now(), updatedAt: Date.now(), top: false });
    }
    items = await load();
    paintList();
    toast('已保存');
  }

  sheet({
    title: m ? '编辑备忘录' : '新建备忘录',
    node: el('div', {}, [el('div', { class: 'field' }, [ta])]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => { void save(); } }]
  });
  setTimeout(() => ta.focus(), 260);
}
