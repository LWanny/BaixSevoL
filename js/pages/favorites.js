/* 收藏 · 他的收藏 / 我的收藏
   记录存在 favorites 表：{ id, owner:'ta'|'me', title, content, source, ts, updatedAt }
   「他的收藏」按四类模块展示：他喜欢的 / 他不高兴的 / 他想收藏的 / 他想告诉你的。
   聊天里发给 TA 的文字，每天有随机小概率被他自动收进来（见 tafav.js）。 */

import { el, uid, fmtDay } from '../util.js';
import { iconImg } from '../icons.js';
import { state, roleAvatarSrc } from '../state.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { mediaURL } from '../media.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';
import { TA_FAV_CATS, taFavCat } from '../tafav.js';

let view = null;
let rows = [];
let owner = 'ta';        // ta | me
let openId = null;       // 当前展开的收藏

const stamp = (r) => r.updatedAt || r.ts || 0;

export default async function pageFavorites(v, params = {}) {
  view = v;
  if (params.owner === 'me' || params.owner === 'ta') owner = params.owner;
  fullPage({
    back: true, title: '收藏', sub: '他的收藏 · 我的收藏',
    actions: [{ label: '新增收藏', onclick: () => openEditor(null) }]
  });
  await load();
}

async function load() {
  rows = (await all('favorites')).sort((a, b) => stamp(b) - stamp(a));
  // 旧数据没有分类，统一归到「他想收藏的」，只补一次
  const legacy = rows.filter((r) => r.owner !== 'me' && !r.category);
  for (const r of legacy) {
    r.category = 'wanted';
    await put('favorites', r);
  }
  await paint();
}

async function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page favorites' });

  const taRows = rows.filter((r) => r.owner !== 'me');
  const meRows = rows.filter((r) => r.owner === 'me');
  const list = owner === 'ta' ? taRows : meRows;

  /* 归属卡 */
  const avSrc = owner === 'ta'
    ? await roleAvatarSrc()
    : (state.skin.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '');
  const av = el('div', { class: 'fav-hero-av' });
  if (avSrc) av.appendChild(el('img', { src: avSrc, alt: '' }));
  else av.textContent = owner === 'ta' ? (state.role.name || '他').slice(0, 1) : '我';

  page.appendChild(el('div', { class: 'card fav-hero' }, [
    av,
    el('div', { class: 'fav-hero-main' }, [
      el('div', { class: 'fav-hero-t', text: owner === 'ta' ? '他的收藏' : '我的收藏' }),
      el('div', { class: 'fav-hero-s', text: owner === 'ta' ? '他会悄悄收下你发来的话，分放在四个角落' : '我留住的片段，只在这台设备上' })
    ]),
    el('div', { class: 'fav-hero-n' }, [
      el('b', { text: String(list.length) }),
      el('span', { text: '条' })
    ])
  ]));

  /* 归属切换 */
  page.appendChild(el('div', { class: 'fav-tabs' }, [
    tabBtn('ta', '他的收藏', taRows.length),
    tabBtn('me', '我的收藏', meRows.length)
  ]));

  if (owner === 'ta') {
    page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginBottom: '12px' }, text: '他偶尔会收下你说的话，但不会在聊天里提醒你' }));
    TA_FAV_CATS.forEach((cat) => {
      const items = list.filter((r) => taFavCat(r.category).key === cat.key);
      page.appendChild(catSection(cat, items));
    });
  } else if (!list.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-020'),
      el('div', { class: 'e-h', text: '我还没有收藏' }),
      el('div', { class: 'e-p', text: '点右上角「新增收藏」，留住想记住的片段' })
    ]));
  } else {
    list.forEach((r) => page.appendChild(card(r)));
  }

  page.appendChild(el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' }, text: '收藏只保存在这台设备上' }));
  view.appendChild(page);
}

function tabBtn(key, label, n) {
  return el('button', {
    class: 'fav-tab' + (owner === key ? ' on' : ''), type: 'button',
    onclick: () => { owner = key; openId = null; paint(); }
  }, [label, el('span', { class: 'fav-tab-n', text: String(n) })]);
}

function catSection(cat, items) {
  return el('div', { class: 'fav-sec' }, [
    el('div', { class: 'fav-sec-h' }, [
      el('span', { class: 'fav-sec-ic' }, [iconImg(cat.icon)]),
      el('div', { class: 'fav-sec-t', text: cat.label }),
      el('span', { class: 'fav-sec-n', text: items.length ? items.length + ' 条' : '还没有' })
    ]),
    items.length
      ? el('div', { class: 'fav-sec-body' }, items.map((r) => card(r)))
      : el('div', { class: 'fav-sec-empty', text: cat.hint })
  ]);
}

function card(r) {
  const open = openId === r.id;
  const long = String(r.content || '').length > 96;
  const ico = r.owner === 'me' ? 'IC-MIO-020' : taFavCat(r.category).icon;
  return el('div', {
    class: 'card fav-card' + (open ? ' open' : ''),
    onclick: () => { openId = open ? null : r.id; paint(); }
  }, [
    el('div', { class: 'fav-title-row' }, [
      iconImg(ico, 'fav-star'),
      el('div', { class: 'fav-title', text: r.title || '未命名收藏' }),
      el('button', {
        class: 'fav-more', type: 'button', title: '更多',
        onclick: (e) => { e.stopPropagation(); openMenu(r); }
      }, [iconImg('IC-CHT-007')])
    ]),
    el('div', { class: 'fav-text', text: r.content || '' }),
    el('div', { class: 'fav-foot' }, [
      el('span', { class: 'fav-src', text: r.source ? '来源 · ' + r.source : (r.owner === 'me' ? '我的收藏' : '他的收藏') }),
      el('span', { class: 'fav-date', text: fmtDay(r.ts) }),
      long ? el('span', { class: 'fav-toggle', text: open ? '收起' : '展开' }) : null
    ])
  ]);
}

/* ---------------- 操作 ---------------- */
function openMenu(r) {
  const other = r.owner === 'me' ? 'ta' : 'me';
  actionSheet(r.title || '收藏', [
    { label: '编辑', icon: 'IC-CRD-006', onSelect: () => openEditor(r) },
    r.owner !== 'me'
      ? { label: '改分类', icon: 'IC-CRD-006', sub: taFavCat(r.category).label, onSelect: () => pickCategory(r) }
      : null,
    { label: '复制内容', icon: 'IC-MIO-024', onSelect: () => copyText(r.content || '') },
    { label: other === 'me' ? '移到「我的收藏」' : '移到「他的收藏」', icon: 'IC-MIO-003', onSelect: async () => {
      r.owner = other;
      r.updatedAt = Date.now();
      await put('favorites', r);
      openId = null;
      await load();
      toast('已移动');
    } },
    { label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '删除收藏', text: '删除后无法恢复，确定吗？', okText: '删除', danger: true });
      if (!yes) return;
      await del('favorites', r.id);
      openId = null;
      await load();
      toast('已删除');
    } }
  ]);
}

function pickCategory(r) {
  actionSheet('改分类', TA_FAV_CATS.map((c) => ({
    label: c.label,
    icon: c.icon,
    sub: taFavCat(r.category).key === c.key ? '当前分类' : c.hint,
    onSelect: async () => {
      r.category = c.key;
      r.updatedAt = Date.now();
      await put('favorites', r);
      openId = null;
      await load();
      toast('已改分类');
    }
  })));
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    const ta = el('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制'); } catch { toast('复制失败'); }
    ta.remove();
  }
}

function openEditor(rec) {
  let target = rec ? (rec.owner === 'me' ? 'me' : 'ta') : owner;
  let cat = rec ? (rec.category || 'wanted') : 'wanted';

  const title = el('input', { class: 'input', placeholder: '标题（可选）', value: rec ? (rec.title || '') : '' });
  const content = el('textarea', { class: 'input', rows: 5, placeholder: '想收藏的话、片段或说明…' });
  content.value = rec ? (rec.content || '') : '';
  const source = el('input', { class: 'input', placeholder: '来源（可选）：聊天 / 书 / 歌', value: rec ? (rec.source || '') : '' });
  const ownerSeg = el('div', { class: 'seg-row' });
  const catSeg = el('div', { class: 'seg-row' });
  const catField = el('div', { class: 'field' }, [el('label', { text: '归到哪个模块' }), catSeg]);

  function paintCat() {
    catSeg.innerHTML = '';
    TA_FAV_CATS.forEach((c) => {
      catSeg.appendChild(el('button', {
        class: 'chip' + (cat === c.key ? ' on' : ''), type: 'button',
        onclick: () => { cat = c.key; paintCat(); }
      }, [c.label]));
    });
    catField.classList.toggle('hidden', target !== 'ta');
  }

  function paintOwner() {
    ownerSeg.innerHTML = '';
    [['ta', '他的收藏'], ['me', '我的收藏']].forEach(([k, label]) => {
      ownerSeg.appendChild(el('button', {
        class: 'chip' + (target === k ? ' on' : ''), type: 'button',
        onclick: () => { target = k; paintOwner(); }
      }, [label]));
    });
    paintCat();
  }
  paintOwner();

  async function save() {
    const text = content.value.trim();
    if (!text) { toast('写点什么再收藏'); return; }
    const data = {
      owner: target,
      title: title.value.trim(),
      content: text,
      source: source.value.trim(),
      updatedAt: Date.now()
    };
    if (target === 'ta') data.category = cat;
    if (rec) {
      Object.assign(rec, data);
      await put('favorites', rec);
    } else {
      await put('favorites', { id: uid(), ts: Date.now(), ...data });
    }
    owner = target;
    openId = null;
    await load();
    toast('已收藏');
  }

  sheet({
    title: rec ? '编辑收藏' : '新增收藏',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '收藏到' }), ownerSeg]),
      catField,
      el('div', { class: 'field' }, [el('label', { text: '标题' }), title]),
      el('div', { class: 'field' }, [el('label', { text: '内容' }), content]),
      el('div', { class: 'field' }, [el('label', { text: '来源' }), source])
    ]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: () => { void save(); } }]
  });
  setTimeout(() => content.focus(), 260);
}
