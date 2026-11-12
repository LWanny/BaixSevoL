/* 字卡库 · 导入 / 分组 / 拖拽排序 / 批量操作 / 使用次数 */

import { el, uid, openFile, readText, downloadBlob, esc, compressImage, readBuf } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del, bulkPut, count } from '../store.js';
import { go } from '../router.js';
import { saveMedia, mediaURL, probeDuration } from '../media.js';
import { sheet, actionSheet, confirmBox, toast, alertBox } from '../ui.js';

let groups = [];
let cards = [];
let curGroup = 'all';
let query = '';
let selected = new Set();
let sortByCount = false;

export default async function pageCards(view) {
  fullPage({ back: true, title: '字卡库', actions: [
    { icon: 'IC-CRD-010', label: '搜索', onclick: toggleSearch },
    { icon: 'IC-CRD-003', label: '导入', onclick: importMenu },
    { icon: 'IC-CRD-002', label: '新建字卡', onclick: newCard },
    { icon: 'IC-CHT-007', label: '更多', onclick: moreMenu }
  ] });

  await reload();
  render(view);
}

async function reload() {
  groups = (await all('groups')).sort((a, b) => (a.order || 0) - (b.order || 0));
  cards = await all('cards');
  if (curGroup !== 'all' && !groups.find((g) => g.id === curGroup)) curGroup = 'all';
}

function render(view) {
  view.innerHTML = '';
  const wrap = el('div', { class: 'page tight' });

  /* 分组标签 */
  const tabs = el('div', { class: 'gtabs', style: { padding: '12px 14px 6px' } });
  const allCount = cards.length;
  tabs.appendChild(gTab('全部', 'all', allCount));
  groups.forEach((g) => tabs.appendChild(gTab(g.name, g.id, cards.filter((c) => c.groupId === g.id).length)));
  tabs.appendChild(el('div', { class: 'gtab', style: { borderStyle: 'dashed' }, onclick: newGroup }, [iconImg('IC-MIO-022', '', ''), '分组']));
  wrap.appendChild(tabs);

  /* 搜索框 */
  if (query !== '' || searching) {
    const si = el('input', { class: 'input', placeholder: '搜索字卡内容…', value: query });
    si.addEventListener('input', () => { query = si.value; renderList(); });
    wrap.appendChild(el('div', { style: { padding: '0 14px 8px' } }, [si]));
    setTimeout(() => si.focus(), 0);
  }

  /* 工具行 */
  const stat = el('div', { class: 'row', style: { padding: '0 14px 8px' } });
  wrap.appendChild(stat);

  /* 列表 */
  const list = el('div', { class: 'card flush', style: { margin: '0 14px 14px' } });
  wrap.appendChild(list);

  /* 批量操作条 */
  const selbar = el('div', { class: 'selbar hidden' });
  wrap.appendChild(selbar);

  view.appendChild(wrap);
  renderList();

  function updateStat() {
    const list2 = filtered();
    const enabled = list2.filter((c) => c.enabled).length;
    stat.innerHTML = '';
    stat.appendChild(el('span', { class: 'small muted', text: `共 ${list2.length} 张 · 启用 ${enabled} 张` }));
    stat.appendChild(el('span', { class: 'spacer' }));
    stat.appendChild(el('button', {
      class: 'btn sm' + (sortByCount ? ' primary' : ''),
      onclick: () => { sortByCount = !sortByCount; renderList(); }
    }, ['按使用次数']));
    if (selected.size) stat.appendChild(el('button', { class: 'btn sm', onclick: () => { selected.clear(); renderList(); } }, ['取消选择']));
  }

  function filtered() {
    let list2 = cards;
    if (curGroup !== 'all') list2 = list2.filter((c) => c.groupId === curGroup);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list2 = list2.filter((c) => (c.content || '').toLowerCase().includes(q));
    }
    list2 = list2.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    if (sortByCount) list2.sort((a, b) => (b.count || 0) - (a.count || 0));
    return list2;
  }

  function renderList() {
    list.innerHTML = '';
    const list2 = filtered();
    if (!list2.length) {
      list.appendChild(el('div', { class: 'empty' }, [
        iconImg('IC-CRD-001'),
        el('div', { class: 'e-h', text: cards.length ? '这里没有匹配的字卡' : '字卡库还是空的' }),
        el('div', { class: 'e-p', text: cards.length ? '换个分组或清空搜索试试' : '点右上角「新建字卡」新建，或用「导入」批量加进来' }),
        cards.length ? null : el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px', gap: '8px' } }, [
          el('button', { class: 'btn sm primary', onclick: importMenu }, ['导入字卡']),
          el('button', { class: 'btn sm', onclick: newCard }, ['新建字卡'])
        ])
      ]));
      updateStat(); renderSelbar();
      return;
    }
    list2.forEach((c, i) => list.appendChild(cardNode(c, i, list2)));
    updateStat();
    renderSelbar();
  }

  function cardNode(c, index, list2) {
    const node = el('div', { class: 'card-item', dataset: { id: c.id, index } });

    const grip = el('div', { class: 'grip' }, [el('i'), el('i'), el('i')]);
    grip.addEventListener('pointerdown', (e) => startDrag(e, c, node, list2));

    const cb = el('input', { class: 'ck', type: 'checkbox' });
    cb.checked = selected.has(c.id);
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(c.id); else selected.delete(c.id);
      renderSelbar(); updateStat();
    });

    const kindBadge = { text: null, sticker: '表情', voice: '语音', choice: '选择题' }[c.kind || 'text'];

    const main = el('div', { class: 'ct' }, [
      el('span', { text: c.kind === 'sticker' ? '[表情]' : c.kind === 'voice' ? '[语音字卡]' : c.content }),
      el('div', { class: 'row', style: { gap: '6px', marginTop: '5px' } }, [
        kindBadge ? el('span', { class: 'badge', text: kindBadge }) : null,
        c.enabled ? null : el('span', { class: 'badge warn', text: '已停用' }),
        el('span', { class: 'cn', text: '用 ' + (c.count || 0) + ' 次' }),
        el('span', { class: 'cn', text: groupName(c.groupId) })
      ])
    ]);

    node.appendChild(cb);
    node.appendChild(grip);
    node.appendChild(main);
    node.addEventListener('click', () => editCard(c));
    return node;
  }

  function renderSelbar() {
    selbar.classList.toggle('hidden', selected.size === 0);
    if (!selected.size) return;
    selbar.innerHTML = '';
    selbar.appendChild(el('span', { class: 'small muted', style: { width: '100%' }, text: `已选 ${selected.size} 张` }));
    selbar.appendChild(el('button', { class: 'btn sm', onclick: () => batchSet('enabled', true) }, ['启用' ]));
    selbar.appendChild(el('button', { class: 'btn sm', onclick: () => batchSet('enabled', false) }, ['停用']));
    selbar.appendChild(el('button', { class: 'btn sm', onclick: batchMove }, ['移动分组']));
    selbar.appendChild(el('button', { class: 'btn sm', onclick: batchEdit }, ['批量改内容']));
    selbar.appendChild(el('button', { class: 'btn sm danger', onclick: batchDelete }, ['删除']));
  }
}

function gTab(name, id, n) {
  const t = el('div', { class: 'gtab' + (curGroup === id ? ' on' : '') }, [
    document.createTextNode(name), el('span', { class: 'n', text: String(n) })
  ]);
  t.onclick = () => { curGroup = id; render(document.getElementById('view')); };
  return t;
}
function groupName(id) {
  const g = groups.find((x) => x.id === id);
  return g ? g.name : '未分组';
}

/* ---------------- 拖拽排序 ---------------- */
let dragState = null;
function startDrag(e, card, node, list2) {
  e.preventDefault();
  dragState = { card, node, list2, moved: false };
  node.classList.add('dragging');
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd, { once: true });
}
function onDragMove(e) {
  if (!dragState) return;
  dragState.moved = true;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card-item');
  document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  if (over && over !== dragState.node) over.classList.add('drop-target');
}
async function onDragEnd(e) {
  document.removeEventListener('pointermove', onDragMove);
  if (!dragState) return;
  const { card, node } = dragState;
  node.classList.remove('dragging');
  const targetNode = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card-item');
  document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  dragState = null;
  if (!targetNode || targetNode === node) return;

  const targetId = targetNode.dataset.id;
  const list = (await all('cards')).filter((c) => c.groupId === card.groupId).sort((a, b) => (a.order || 0) - (b.order || 0));
  const from = list.findIndex((c) => c.id === card.id);
  const to = list.findIndex((c) => c.id === targetId);
  if (from < 0 || to < 0) return;
  list.splice(to, 0, list.splice(from, 1)[0]);
  const updates = list.map((c, i) => ({ ...c, order: i }));
  await bulkPut('cards', updates);
  cards = await all('cards');
  render(document.getElementById('view'));
  toast('顺序已更新');
}

/* ---------------- 导入 / 导出 ---------------- */
function importMenu() {
  actionSheet('导入字卡', [
    { label: '从纯文本导入', icon: 'IC-CRD-003', sub: '一行一张卡；#开头为分组名', onSelect: importText },
    { label: '从 JSON 导入', icon: 'IC-CRD-003', sub: '支持 [{"content":"…","group":"…"}]', onSelect: importJSON },
    { label: '导出为 JSON', icon: 'IC-CRD-004', sub: '导出全部字卡与分组', onSelect: exportJSON }
  ]);
}

async function importText() {
  const file = await openFile({ accept: '.txt,text/plain' });
  if (!file) return;
  const txt = await readText(file);
  const lines = txt.split(/\r?\n/);
  let curGroupName = '导入';
  const byGroup = new Map();
  let added = 0, skipped = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { curGroupName = line.replace(/^#+/, '').trim() || '导入'; continue; }
    if (!byGroup.has(curGroupName)) byGroup.set(curGroupName, []);
    byGroup.get(curGroupName).push(line);
    added++;
  }
  const existing = new Set(cards.map((c) => c.content));
  const newGroups = [], newCards = [];
  let order = groups.length;
  for (const [gname, list] of byGroup) {
    let g = groups.find((x) => x.name === gname);
    if (!g) { g = { id: uid(), name: gname, order: order++, enabled: true, createdAt: Date.now() }; newGroups.push(g); }
    list.forEach((content, i) => {
      if (existing.has(content)) { skipped++; return; }
      existing.add(content);
      newCards.push({ id: uid(), groupId: g.id, content, enabled: true, count: 0, weight: 1, kind: 'text', order: i, createdAt: Date.now() });
    });
  }
  if (newGroups.length) await bulkPut('groups', newGroups);
  if (newCards.length) await bulkPut('cards', newCards);
  await reload();
  render(document.getElementById('view'));
  alertBox({ title: '导入完成', text: `新增 ${newCards.length} 张字卡${skipped ? `，跳过重复 ${skipped} 张` : ''}。` });
}

async function importJSON() {
  const file = await openFile({ accept: '.json,application/json' });
  if (!file) return;
  let data;
  try { data = JSON.parse(await readText(file)); } catch { return alertBox({ title: '导入失败', text: 'JSON 格式不正确，请检查文件内容。' }); }
  const arr = Array.isArray(data) ? data : (Array.isArray(data.cards) ? data.cards : null);
  if (!arr) return alertBox({ title: '导入失败', text: '未找到 cards 数组。支持 [{"content":"…","group":"…"}] 或 {"cards":[…]}。' });

  const newGroups = [], newCards = [];
  let order = groups.length, skipped = 0;
  const existing = new Set(cards.map((c) => c.content));
  for (const item of arr) {
    const content = String(item.content ?? item.text ?? '').trim();
    if (!content) { skipped++; continue; }
    if (existing.has(content)) { skipped++; continue; }
    existing.add(content);
    const gname = String(item.group || item.groupName || '导入');
    let g = groups.find((x) => x.name === gname) || newGroups.find((x) => x.name === gname);
    if (!g) { g = { id: uid(), name: gname, order: order++, enabled: true, createdAt: Date.now() }; newGroups.push(g); }
    newCards.push({
      id: uid(), groupId: g.id, content, enabled: true, count: 0,
      weight: Number(item.weight) || 1, kind: 'text', order: newCards.length, createdAt: Date.now()
    });
  }
  if (newGroups.length) await bulkPut('groups', newGroups);
  if (newCards.length) await bulkPut('cards', newCards);
  await reload();
  render(document.getElementById('view'));
  alertBox({ title: '导入完成', text: `新增 ${newCards.length} 张字卡${skipped ? `，跳过 ${skipped} 条` : ''}。` });
}

async function exportJSON() {
  const data = { version: 1, exportedAt: Date.now(), groups, cards };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `字卡库-${Date.now()}.json`);
}

/* ---------------- 新建 / 编辑 ---------------- */
function newGroup() {
  const input = el('input', { class: 'input', placeholder: '分组名称' });
  sheet({
    title: '新建分组',
    node: el('div', { class: 'field' }, [input]),
    actions: [{ label: '创建', icon: 'IC-MIO-003', onSelect: async () => {
      const name = input.value.trim();
      if (!name) return toast('请输入分组名称');
      await put('groups', { id: uid(), name, order: groups.length, enabled: true, createdAt: Date.now() });
      await reload();
      render(document.getElementById('view'));
      toast('分组已创建');
    } }]
  });
}

async function newCard() {
  if (!groups.length) {
    /* 还没有任何分组 → 先建一个 */
    const nameInput = el('input', { class: 'input', placeholder: '先建一个分组，例如「日常」' });
    sheet({
      title: '先建分组',
      node: el('div', { class: 'field' }, [
        el('label', { text: '还没有任何分组' }),
        nameInput,
        el('div', { class: 'hint', text: '分组是字卡的分类容器。建好后可以一次粘贴多条字卡。' })
      ]),
      actions: [{ label: '创建并继续', icon: 'IC-MIO-003', onSelect: async () => {
        const name = nameInput.value.trim();
        if (!name) return toast('请输入分组名称');
        await put('groups', { id: uid(), name, order: groups.length, enabled: true, createdAt: Date.now() });
        await reload();
        batchAddCards();
      } }]
    });
    return;
  }
  batchAddCards();
}

async function batchAddCards() {
  /* 默认分组：当前 tab 如果是具体分组就用它；否则取第一个 */
  const defaultGroupId = (curGroup !== 'all' ? curGroup : (groups[0]?.id || ''));

  const groupSel = el('select', { class: 'input' });
  const refreshGroupSel = (defId) => {
    groupSel.innerHTML = '';
    groups.forEach((g) => groupSel.appendChild(el('option', { value: g.id, selected: g.id === defId }, [g.name])));
    groupSel.appendChild(el('option', { value: '__new__' }, ['＋ 新建分组…']));
    groupSel.value = defId;
  };
  refreshGroupSel(defaultGroupId);

  const ta = el('textarea', {
    class: 'input',
    placeholder: '一行一条，可以一次添加多条。\n例如：\n在干嘛\n早点睡\n我想你了\n\n也可以带分组：【分组名】单独一行，\n下面的行都归入该分组：\n【日常关心】\n在干嘛\n早点睡\n【睡前晚安】\n晚安，做个好梦',
    rows: 10,
    style: { resize: 'vertical', minHeight: '160px', lineHeight: '1.55' }
  });

  const savedHint = el('div', { class: 'hint' });

  const ctl = sheet({
    title: '添加字卡',
    node: el('div', { class: 'field' }, [
      el('label', { text: '所属分组' }),
      groupSel,
      el('div', { class: 'hint', text: '不带【分组名】的行归到这里；粘贴内容里带了【分组名】则按它自动归组。' }),
      el('div', { style: { height: '4px' } }),
      el('label', { text: '字卡内容' }),
      ta,
      savedHint
    ]),
    actions: [{ label: '保存字卡', icon: 'IC-MIO-021', onSelect: saveBatch }]
  });

  groupSel.addEventListener('change', () => {
    if (groupSel.value !== '__new__') return;
    const nameInput = el('input', { class: 'input', placeholder: '新分组名称' });
    sheet({
      title: '新建分组',
      node: el('div', { class: 'field' }, [nameInput]),
      actions: [{ label: '创建', icon: 'IC-MIO-003', onSelect: async () => {
        const name = nameInput.value.trim();
        if (!name) return toast('请输入分组名称');
        const g = { id: uid(), name, order: groups.length, enabled: true, createdAt: Date.now() };
        await put('groups', g);
        await reload();
        refreshGroupSel(g.id);
        toast('分组已创建');
      } }]
    });
  });

  async function saveBatch() {
    const lines = ta.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return toast('请至少输入一条字卡');
    const gid = groupSel.value;
    if (!gid || gid === '__new__') return toast('请先选择或创建分组');

    /* 两种写法混着用：
       ① 一行一张 → 全部归入上面选的分组；
       ② 【分组名】单独一行 → 下面的行归入该分组（不存在会自动建），
          开头还没出现【分组名】的行仍归入选的分组 */
    const headerRe = /^【(.+)】$/;
    const existing = new Set(cards.map((c) => c.content));
    const createdGroups = [];
    const ensureGroup = (name) => {
      let g = groups.find((x) => x.name === name) || createdGroups.find((x) => x.name === name);
      if (!g) { g = { id: uid(), name, order: groups.length + createdGroups.length, enabled: true, createdAt: Date.now() }; createdGroups.push(g); }
      return g;
    };

    const buckets = new Map();   // groupId -> 内容行
    let cur = gid;
    for (const line of lines) {
      const m = line.match(headerRe);
      if (m) { cur = ensureGroup(m[1].trim()).id; continue; }
      if (!buckets.has(cur)) buckets.set(cur, []);
      buckets.get(cur).push(line);
    }

    const newCards = [];
    let skipped = 0;
    for (const [groupId, list] of buckets) {
      let order = Math.max(0, ...cards.filter((c) => c.groupId === groupId).map((c) => c.order ?? 0));
      for (const content of list) {
        if (existing.has(content)) { skipped++; continue; }
        existing.add(content);
        order++;
        newCards.push({ id: uid(), groupId, content, enabled: true, count: 0, weight: 1, kind: 'text', order, createdAt: Date.now() });
      }
    }
    if (!newCards.length && !createdGroups.length) {
      savedHint.textContent = skipped ? `这 ${skipped} 条都已存在，没有新增。` : '没有可添加的内容。';
      return toast('没有可添加的新字卡');
    }
    if (createdGroups.length) await bulkPut('groups', createdGroups);
    if (newCards.length) await bulkPut('cards', newCards);
    await reload();
    render(document.getElementById('view'));
    ctl.close();
    alertBox({
      title: '添加完成',
      text: `新增 ${newCards.length} 张字卡${createdGroups.length ? `，新建分组 ${createdGroups.length} 个` : ''}${skipped ? `，跳过重复 ${skipped} 张` : ''}。`
    });
  }
}

async function editCard(c) { cardEditor(c); }

async function cardEditor(card) {
  const isNew = !card;
  const c = card || { kind: 'text', content: '', groupId: curGroup === 'all' ? (groups[0]?.id || '') : curGroup, enabled: true, weight: 1 };

  const typeRow = el('div', { class: 'row wrap' });
  const kinds = [['text', '文本'], ['sticker', '表情'], ['voice', '语音'], ['choice', '选择题']];
  let kind = c.kind || 'text';
  let mediaId = c.mediaId || null;
  const contentInput = el('textarea', { class: 'input', placeholder: '这一张字卡要说的话', text: c.content || '' });
  const optInput = el('input', { class: 'input', placeholder: '选项用 | 分隔，留空则用默认', value: (c.options || []).join('|') });
  const groupSel = el('select', { class: 'input' });
  groups.forEach((g) => groupSel.appendChild(el('option', { value: g.id, selected: g.id === c.groupId }, [g.name])));
  const weightInput = el('input', { class: 'input', type: 'number', min: '1', max: '99', value: String(c.weight || 1) });
  const enabledSw = el('button', { class: 'sw' + (c.enabled ? ' on' : ''), onclick: (e) => e.target.classList.toggle('on') });

  const mediaBox = el('div', {});
  const optField = el('div', { class: 'field hidden' }, [el('label', { text: '选项' }), optInput]);
  const contentField = el('div', { class: 'field' }, [el('label', { text: '内容' }), contentInput]);

  function paintKinds() {
    typeRow.innerHTML = '';
    kinds.forEach(([k, label]) => {
      typeRow.appendChild(el('span', { class: 'chip' + (kind === k ? ' on' : ''), onclick: () => { kind = k; paintKinds(); paintKindFields(); } }, [label]));
    });
  }
  function paintKindFields() {
    contentField.classList.toggle('hidden', kind === 'sticker' || kind === 'voice');
    optField.classList.toggle('hidden', kind !== 'choice');
    mediaBox.innerHTML = '';
    if (kind === 'sticker' || kind === 'voice') {
      mediaBox.appendChild(el('button', { class: 'btn block', onclick: pickMedia }, [kind === 'sticker' ? '选择表情图片' : '导入 mp3 语音']));
      if (mediaId) {
        const box = el('div', { style: { marginTop: '10px' } });
        if (kind === 'sticker') { const img = el('img', { style: { maxWidth: '120px', borderRadius: '8px' } }); mediaURL(mediaId).then((u) => { if (u) img.src = u; }); box.appendChild(img); }
        else box.appendChild(el('div', { class: 'small muted', text: '语音已导入' }));
        mediaBox.appendChild(box);
      }
    }
  }

  async function pickMedia() {
    if (kind === 'sticker') {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob, w, h } = await compressImage(f, 512, 0.9);
      mediaId = await saveMedia(blob, { type: 'image', w, h, source: 'me' });
    } else {
      const f = await openFile({ accept: 'audio/*' });
      if (!f) return;
      const buf = await readBuf(f);
      const blob = new Blob([buf], { type: f.type || 'audio/mpeg' });
      const dur = await probeDuration(blob);
      mediaId = await saveMedia(blob, { type: 'audio', duration: dur, source: 'me', name: f.name });
    }
    paintKindFields();
  }

  paintKinds(); paintKindFields();

  const node = el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: '类型' }), typeRow]),
    contentField,
    optField,
    mediaBox,
    el('div', { class: 'field' }, [el('label', { text: '所属分组' }), groupSel]),
    el('div', { class: 'field' }, [
      el('label', { text: '权重（越大越容易被抽到）' }), weightInput,
      el('div', { class: 'hint', text: '「纯随机模式」开启时权重不生效。' })
    ]),
    el('div', { class: 'row between' }, [ el('span', { text: '启用' }), enabledSw ])
  ]);

  const ctl = sheet({
    title: isNew ? '新建字卡' : '编辑字卡',
    node,
    actions: [
      isNew ? null : { label: '删除这张字卡', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
        await del('cards', card.id); await reload(); render(document.getElementById('view')); toast('已删除');
      } },
      { label: '保存', icon: 'IC-MIO-003', onSelect: save }
    ].filter(Boolean)
  });

  async function save() {
    const payload = {
      id: c.id || uid(),
      groupId: groupSel.value,
      kind,
      content: contentInput.value.trim(),
      options: optInput.value.split('|').map((s) => s.trim()).filter(Boolean),
      mediaId,
      enabled: enabledSw.classList.contains('on'),
      weight: Math.max(1, Number(weightInput.value) || 1),
      count: c.count || 0,
      order: c.order ?? cards.length,
      createdAt: c.createdAt || Date.now()
    };
    if (kind === 'text' || kind === 'choice') {
      if (!payload.content) return toast('请填写内容');
    } else if (!payload.mediaId) {
      return toast('请先选择素材');
    }
    await put('cards', payload);
    await reload();
    render(document.getElementById('view'));
    ctl.close();
    toast(isNew ? '字卡已添加' : '已保存');
  }
}

/* ---------------- 批量操作 ---------------- */
async function batchSet(field, value) {
  const list = (await all('cards')).filter((c) => selected.has(c.id));
  const updates = list.map((c) => ({ ...c, [field]: value }));
  await bulkPut('cards', updates);
  selected.clear();
  await reload();
  render(document.getElementById('view'));
  toast('已更新');
}

function batchMove() {
  const sel = el('select', { class: 'input' });
  groups.forEach((g) => sel.appendChild(el('option', { value: g.id }, [g.name])));
  sheet({
    title: '移动到分组',
    node: el('div', { class: 'field' }, [el('label', { text: '目标分组' }), sel]),
    actions: [
      { label: '新建分组并移入', icon: 'IC-CRD-005', onSelect: async () => {
        const input = el('input', { class: 'input', placeholder: '新分组名称' });
        sheet({ title: '新建分组', node: el('div', { class: 'field' }, [input]), actions: [{ label: '创建并移入', icon: 'IC-MIO-003', onSelect: async () => {
          const name = input.value.trim();
          if (!name) return toast('请输入分组名称');
          const g = { id: uid(), name, order: groups.length, enabled: true, createdAt: Date.now() };
          await put('groups', g);
          const list = (await all('cards')).filter((c) => selected.has(c.id));
          await bulkPut('cards', list.map((c, i) => ({ ...c, groupId: g.id, order: i })));
          selected.clear(); await reload(); render(document.getElementById('view')); toast('已移动');
        } }] });
      } },
      { label: '移动', icon: 'IC-MIO-003', onSelect: async () => {
        const list = (await all('cards')).filter((c) => selected.has(c.id));
        await bulkPut('cards', list.map((c, i) => ({ ...c, groupId: sel.value, order: i })));
        selected.clear(); await reload(); render(document.getElementById('view')); toast('已移动');
      } }
    ]
  });
}

function batchEdit() {
  const modeRow = el('div', { class: 'row wrap' });
  let mode = 'suffix';
  const aInput = el('input', { class: 'input', placeholder: '要追加 / 查找的文字' });
  const bInput = el('input', { class: 'input', placeholder: '替换为（仅「查找替换」需要）' });
  const hint = el('div', { class: 'hint' });
  const modes = [['prefix', '加前缀'], ['suffix', '加后缀'], ['replace', '查找替换']];

  function paint() {
    modeRow.innerHTML = '';
    modes.forEach(([m, label]) => modeRow.appendChild(el('span', { class: 'chip' + (mode === m ? ' on' : ''), onclick: () => { mode = m; paint(); } }, [label])));
    aInput.placeholder = mode === 'replace' ? '要查找的文字' : (mode === 'prefix' ? '前缀内容' : '后缀内容');
    bInput.classList.toggle('hidden', mode !== 'replace');
    hint.textContent = mode === 'replace' ? '把每张字卡里的「查找文字」替换成「替换为」。' : '在每张字卡的' + (mode === 'prefix' ? '开头' : '末尾') + '追加内容。';
  }
  paint();

  sheet({
    title: `批量改内容（${selected.size} 张）`,
    node: el('div', {}, [el('div', { class: 'field' }, [el('label', { text: '方式' }), modeRow]), el('div', { class: 'field' }, [aInput]), el('div', { class: 'field' }, [bInput]), hint]),
    actions: [{ label: '应用到选中字卡', icon: 'IC-MIO-003', onSelect: async () => {
      const a = aInput.value; const b = bInput.value;
      if (!a) return toast('请填写内容');
      const list = (await all('cards')).filter((c) => selected.has(c.id));
      const updates = list.map((c) => {
        let content = c.content || '';
        if (mode === 'prefix') content = a + content;
        else if (mode === 'suffix') content = content + a;
        else content = content.split(a).join(b);
        return { ...c, content };
      });
      await bulkPut('cards', updates);
      selected.clear(); await reload(); render(document.getElementById('view')); toast('已修改');
    } }]
  });
}

async function batchDelete() {
  const yes = await confirmBox({ title: '删除字卡', text: `将删除选中的 ${selected.size} 张字卡，无法撤销。`, okText: '删除', danger: true });
  if (!yes) return;
  const ids = Array.from(selected);
  await Promise.all(ids.map((id) => del('cards', id)));
  selected.clear();
  await reload();
  render(document.getElementById('view'));
  toast('已删除');
}

/* ---------------- 顶栏交互 ---------------- */
let searching = false;
function toggleSearch() {
  searching = !searching;
  if (!searching) query = '';
  render(document.getElementById('view'));
  toast(searching ? '输入关键词搜索' : '已退出搜索');
}

function moreMenu() {
  actionSheet('字卡库', [
    { label: '灵感拾取', sub: 'TA 悄悄收的你的话', icon: 'IC-MIO-020', onSelect: () => go('/inspiration') },
    { label: '导入字卡（TXT / JSON 批量）', icon: 'IC-CRD-003', sub: '一行一张卡 · 或 JSON 数组', onSelect: importMenu },
    { label: '导出为 JSON', icon: 'IC-CRD-004', onSelect: exportJSON },
    { label: '按使用次数排序 / 从未使用', icon: 'IC-CRD-009', onSelect: () => { sortByCount = !sortByCount; render(document.getElementById('view')); } },
    { label: '显示全部字卡', icon: 'IC-CRD-001', onSelect: () => { curGroup = 'all'; render(document.getElementById('view')); } },
    { label: '删除全部字卡', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '删除全部字卡', text: `将删除全部 ${cards.length} 张字卡与所有分组，无法撤销。建议先导出 JSON。`, okText: '全部删除', danger: true });
      if (!yes) return;
      const gs = await all('groups');
      await Promise.all(cards.map((c) => del('cards', c.id)));
      await Promise.all(gs.map((g) => del('groups', g.id)));
      await reload(); render(document.getElementById('view')); toast('已清空字卡库');
    } }
  ]);
}
