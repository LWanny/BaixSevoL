/* 审批小钱包 · 两种审批方式：
   - buy：想买什么（商品 / 价格 / 原因 / 替代品 / 图片），审批方只有 通过 / 驳回
   - vote：纠结买什么（上传图 + 选项 + 价格 + 纠结点），审批方单选投票
   记录存 approvals 表：
   { id, type:'buy'|'vote', from:'me'|'ta', ts, status:'pending'|'approved'|'rejected'|'voted',
     decidedAt, decider:'me'|'ta', reply,
     title, price, why, alternative, imgId,
     question, options:[{id, title, price}], vote } */

import { el, uid, fmtDay } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, del } from '../store.js';
import { actionSheet, confirmBox, sheet, toast } from '../ui.js';
import { openFile, compressImage } from '../util.js';
import { saveMedia, mediaURL } from '../media.js';

let view = null;
let rows = [];
let tab = 'me';        // 'me' | 'ta'
let filter = 'all';    // all | pending | approved | rejected
let searchKey = '';

export default async function pageApproval(v) {
  view = v;
  fullPage({
    back: true, title: '审批小钱包', sub: '想买什么和纠结买什么，都在这里批',
    actions: [{ label: '发起', onclick: openNewMenu }]
  });
  await load();
}

async function load() {
  rows = (await all('approvals')).sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  paint();
}

const STAT_LABEL = { pending: '审批中', approved: '已通过', rejected: '已驳回', voted: '已投票' };
const STAT_CLS = { pending: 'pending', approved: 'approved', rejected: 'rejected', voted: 'approved' };

function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page approval' });

  /* tab：我提交的 / TA 提交的 */
  const tabs = el('div', { class: 'ap-tabs' }, [
    mkTab('我提交的', tab === 'me', () => { tab = 'me'; paint(); }),
    mkTab('TA 提交的', tab === 'ta', () => { tab = 'ta'; paint(); })
  ]);

  /* 搜索框 */
  const search = el('input', { class: 'input', placeholder: '搜索标题 / 原因 / 选项' });
  search.value = searchKey;
  search.oninput = () => { searchKey = search.value.trim(); paint(); };

  /* 状态筛选 chip */
  const chipBox = el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '8px' } });
  ['all', 'pending', 'approved', 'rejected'].forEach((k) => {
    const c = el('span', { class: 'chip' + (filter === k ? ' on' : ''), text: chipLabel(k) });
    c.onclick = () => { filter = k; paint(); };
    chipBox.appendChild(c);
  });

  const listRow = rows.filter((r) => {
    if (tab === 'me' && r.from !== 'me') return false;
    if (tab === 'ta' && r.from !== 'ta') return false;
    if (filter !== 'all' && r.status !== filter && !(filter === 'rejected' && r.status === 'voted' && false)) {
      // voted 算结束态，不进 rejected
      if (filter === 'rejected' && r.status === 'rejected') return true;
      if (filter === 'approved' && (r.status === 'approved' || r.status === 'voted')) return true;
      if (filter === 'pending' && r.status === 'pending') return true;
      return false;
    }
    if (searchKey) {
      const hay = `${r.title || ''} ${r.why || ''} ${r.alternative || ''} ${r.question || ''} ${(r.options || []).map((o) => o.title || '').join(' ')}`.toLowerCase();
      if (!hay.includes(searchKey.toLowerCase())) return false;
    }
    return true;
  });

  page.appendChild(tabs);
  page.appendChild(el('div', { class: 'ap-search' }, [search]));
  page.appendChild(chipBox);

  if (!listRow.length) {
    page.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-017'),
      el('div', { class: 'e-h', text: emptyHint() }),
      el('div', { class: 'e-p', text: tab === 'ta' ? 'TA 还没提交过审批' : '点右上角「发起」申请一次' })
    ]));
  } else {
    listRow.forEach((r) => page.appendChild(cardOf(r)));
  }
  view.appendChild(page);
}

function emptyHint() {
  if (filter !== 'all') return `没有「${chipLabel(filter)}」的记录`;
  return '还没有审批记录';
}

function chipLabel(k) {
  return { all: '全部', pending: '审批中', approved: '已通过', rejected: '已驳回' }[k];
}

function mkTab(t, on, onclick) {
  return el('button', { class: 'ap-tab' + (on ? ' on' : ''), onclick, type: 'button' }, [t]);
}

function cardOf(r) {
  const isBuy = r.type === 'buy';
  const status = STAT_LABEL[r.status] || r.status;
  const canAct = r.status === 'pending';   // pending 才能审批

  const title = r.title || (isBuy ? '未填标题' : (r.question || '纠结投票'));
  const subBits = [];
  if (isBuy) {
    if (r.price) subBits.push(`¥${r.price}`);
  } else {
    const n = (r.options || []).length;
    if (n) subBits.push(`${n} 个选项`);
    if (r.vote) subBits.push(`投给了「${(r.options || []).find((o) => o.id === r.vote)?.title || '-'}」`);
  }
  subBits.push(fmtDay(r.ts));

  return el('div', { class: 'card ap-card', onclick: () => openDetail(r) }, [
    el('div', { class: 'ap-card-top' }, [
      el('span', { class: 'ap-badge ' + (isBuy ? 'buy' : 'vote') }, [isBuy ? '直接审批' : '纠结投票']),
      el('span', { class: 'ap-status ' + STAT_CLS[r.status] }, [status]),
      r.from === 'ta' ? el('span', { class: 'ap-from' }, ['TA 提交']) : null
    ]),
    el('div', { class: 'ap-card-title', text: title }),
    el('div', { class: 'ap-card-sub', text: subBits.join(' · ') }),
    r.reply ? el('div', { class: 'ap-card-reply', text: `审批人：${r.reply}` }) : null,
    !isBuy && (r.options || []).length ? el('div', { class: 'ap-vote-row' }, (r.options || []).slice(0, 4).map((o) =>
      el('span', { class: 'ap-vote-chip' + (r.vote === o.id ? ' on' : ''), text: o.title + (o.price ? ` ¥${o.price}` : '') }))) : null,
    canAct ? el('div', { class: 'ap-card-act', text: '点我审批' }) : null
  ]);
}

/* ---------------- 发起菜单 ---------------- */
function openNewMenu() {
  actionSheet('发起审批', [
    { label: '想买什么（直接审批）', icon: 'IC-MIO-011', onSelect: () => openBuyForm(null) },
    { label: '纠结买什么（投票）', icon: 'IC-MIO-017', onSelect: () => openVoteForm(null) }
  ]);
}

/* ---------------- 直接审批表单 ---------------- */
function openBuyForm(rec) {
  const title = el('input', { class: 'input', placeholder: '想买什么（如：蓝莓2盒装）', value: rec?.title || '' });
  const price = el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: '0.01', placeholder: '价格（人民币）', value: rec?.price ?? '' });
  const why = el('textarea', { class: 'input', rows: 2, placeholder: '为什么想买' });
  why.value = rec?.why || '';
  const alt = el('textarea', { class: 'input', rows: 2, placeholder: '有替代品吗（可留空）' });
  alt.value = rec?.alternative || '';
  let imgId = rec?.imgId || null;
  const imgBox = el('div', { class: 'ap-img-box' });
  const renderImg = async () => {
    imgBox.innerHTML = '';
    if (imgId) {
      try {
        const url = await mediaURL(imgId);
        imgBox.appendChild(el('img', { src: url, class: 'ap-img' }));
      } catch {}
    }
    const addBtn = el('button', { class: 'btn sm', type: 'button', onclick: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob } = await compressImage(f, 1024, 0.85);
      imgId = await saveMedia(blob, { type: 'image', source: 'approval' });
      renderImg();
    } }, [imgId ? '换图' : '加图片']);
    const delBtn = imgId ? el('button', { class: 'btn sm', type: 'button', onclick: () => { imgId = null; renderImg(); } }) : null;
    imgBox.appendChild(addBtn);
    if (delBtn) imgBox.appendChild(delBtn);
  };
  renderImg();

  /* 从商城挑商品（选填） */
  const pickBtn = el('button', { class: 'btn sm', type: 'button' }, ['从商城挑商品']);
  pickBtn.onclick = async () => {
    const { shopGoodsList } = await import('../shopcore.js');
    const goods = await shopGoodsList();
    const filtered = goods.filter((g) => title.value.trim().toLowerCase() && g.title.toLowerCase().includes(title.value.trim().toLowerCase()));
    const pickList = filtered.length ? filtered : goods;   // 没匹配也让他挑
    const actions = pickList.slice(0, 12).map((g) => ({
      label: `${g.title} · ¥${g.price}`,
      sub: g.shop,
      onSelect: () => { title.value = g.title; price.value = String(g.price); }
    }));
    actionSheet('挑一个商城商品', actions);
  };

  const s = sheet({
    title: rec ? '编辑审批' : '发起审批 · 想买',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '想买什么' }), title, pickBtn]),
      el('div', { class: 'field' }, [el('label', { text: '价格（人民币）' }), price]),
      el('div', { class: 'field' }, [el('label', { text: '为什么想买' }), why]),
      el('div', { class: 'field' }, [el('label', { text: '有替代品吗' }), alt]),
      el('div', { class: 'field' }, [el('label', { text: '图片（可选）' }), imgBox])
    ]),
    actions: [{ label: '提交', icon: 'IC-MIO-021', onSelect: async () => {
      if (!title.value.trim()) { toast('请填写想买什么'); return; }
      const row = {
        id: uid(), type: 'buy', from: 'me', ts: Date.now(),
        status: 'pending', decidedAt: 0, decider: '', reply: '',
        title: title.value.trim(), price: Number(price.value) || 0,
        why: why.value.trim(), alternative: alt.value.trim(), imgId
      };
      await put('approvals', row);
      s.close(); await load(); toast('已提交，等 TA 审批');
    } }]
  });
  setTimeout(() => title.focus(), 260);
}

/* ---------------- 投票审批表单 ---------------- */
function openVoteForm(rec) {
  const question = el('input', { class: 'input', placeholder: '纠结点是什么（如：买哪个保温杯）', value: rec?.question || '' });
  let options = (rec?.options || []).length ? rec.options.map((o) => ({ ...o })) : [{ id: uid(), title: '', price: '' }, { id: uid(), title: '', price: '' }];

  const optBox = el('div');
  const renderOpts = () => {
    optBox.innerHTML = '';
    options.forEach((opt, i) => {
      const t = el('input', { class: 'input', placeholder: `选项 ${i + 1} 名字（如：316 保温杯）`, value: opt.title || '' });
      const p = el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: '0.01', placeholder: '价格', value: opt.price || '' });
      t.oninput = () => opt.title = t.value.trim();
      p.oninput = () => opt.price = Number(p.value) || 0;
      const row = el('div', { class: 'ap-vote-opt' }, [
        el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [t, p,
          el('button', { class: 'btn sm', type: 'button', title: '删除', disabled: options.length <= 2, onclick: () => {
            options.splice(i, 1); renderOpts();
          } }, ['×'])
        ])
      ]);
      optBox.appendChild(row);
    });
  };
  renderOpts();

  let imgId = rec?.imgId || null;
  const imgBox = el('div', { class: 'ap-img-box' });
  const renderImg = async () => {
    imgBox.innerHTML = '';
    if (imgId) {
      try {
        const url = await mediaURL(imgId);
        imgBox.appendChild(el('img', { src: url, class: 'ap-img' }));
      } catch {}
    }
    const addBtn = el('button', { class: 'btn sm', type: 'button', onclick: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob } = await compressImage(f, 1024, 0.85);
      imgId = await saveMedia(blob, { type: 'image', source: 'approval' });
      renderImg();
    } }, [imgId ? '换图' : '加图片']);
    imgBox.appendChild(addBtn);
    if (imgId) imgBox.appendChild(el('button', { class: 'btn sm', type: 'button', onclick: () => { imgId = null; renderImg(); } }));
  };
  renderImg();

  const s = sheet({
    title: rec ? '编辑投票' : '发起审批 · 纠结投票',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '纠结点是什么' }), question]),
      el('div', { class: 'field' }, [
        el('label', { text: '选项（至少 2 个）' }),
        optBox,
        el('button', { class: 'btn sm', type: 'button', onclick: () => { options.push({ id: uid(), title: '', price: '' }); renderOpts(); } }, ['＋ 加一项'])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '图片（可选）' }), imgBox])
    ]),
    actions: [{ label: '提交', icon: 'IC-MIO-021', onSelect: async () => {
      const opts = options.filter((o) => o.title);
      if (!question.value.trim()) { toast('请填写纠结点'); return; }
      if (opts.length < 2) { toast('至少 2 个选项'); return; }
      const row = {
        id: uid(), type: 'vote', from: 'me', ts: Date.now(),
        status: 'pending', decidedAt: 0, decider: '', reply: '',
        question: question.value.trim(), options: opts, vote: null, imgId
      };
      await put('approvals', row);
      s.close(); await load(); toast('已提交，等 TA 投票');
    } }]
  });
  setTimeout(() => question.focus(), 260);
}

/* ---------------- 详情 / 审批 ---------------- */
async function openDetail(r) {
  const rec = rows.find((x) => x.id === r.id);
  if (!rec) return;

  const node = el('div');
  node.appendChild(el('div', { class: 'field' }, [
    el('label', { text: rec.type === 'buy' ? '想买什么' : '纠结点' }),
    el('div', { class: 'ap-big-t', text: rec.type === 'buy' ? (rec.title || '-') : (rec.question || '-') })
  ]));
  if (rec.type === 'buy') {
    if (rec.price) node.appendChild(el('div', { class: 'ap-row-txt', text: `价格：¥${rec.price}` }));
    if (rec.why) node.appendChild(el('div', { class: 'ap-row-txt', text: `为什么想买：${rec.why}` }));
    if (rec.alternative) node.appendChild(el('div', { class: 'ap-row-txt', text: `替代品：${rec.alternative}` }));
  } else {
    const box = el('div', { class: 'ap-vote-list' });
    (rec.options || []).forEach((o) => box.appendChild(el('div', { class: 'ap-vote-item' + (rec.vote === o.id ? ' on' : '') }, [
      el('span', { text: o.title }),
      o.price ? el('span', { class: 'right', text: `¥${o.price}` }) : null,
      rec.vote === o.id ? el('span', { class: 'ap-vote-mark', text: '✓ TA 投给这里' }) : null
    ])));
    node.appendChild(box);
  }
  if (rec.imgId) {
    try {
      const url = await mediaURL(rec.imgId);
      node.appendChild(el('img', { src: url, class: 'ap-img-big' }));
    } catch {}
  }
  node.appendChild(el('div', { class: 'ap-status-line', text: `状态：${STAT_LABEL[rec.status] || rec.status} · ${rec.from === 'ta' ? 'TA 提交' : '我提交'} · ${fmtDay(rec.ts)}` }));
  if (rec.reply) node.appendChild(el('div', { class: 'ap-reply-box' }, [el('div', { class: 'ap-reply-t', text: rec.decider === 'ta' ? 'TA 留言' : '我的留言' }), el('div', { text: rec.reply })]));

  const actions = [];
  actions.push({ label: rec.type === 'buy' ? '通过 / 驳回' : '投票', icon: 'IC-MIO-021', onSelect: () => openAct(rec) });
  actions.push({ label: '编辑', icon: 'IC-CRD-006', onSelect: () => {
    if (rec.type === 'buy') openBuyForm(rec); else openVoteForm(rec);
  } });
  actions.push({ label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
    const yes = await confirmBox({ title: '删除审批', text: '确定删除这条审批？', okText: '删除', danger: true });
    if (!yes) return;
    await del('approvals', rec.id);
    await load();
    toast('已删除');
  } });

  sheet({ title: '审批详情', node, actions });
}

async function openAct(r) {
  const rec = rows.find((x) => x.id === r.id);
  if (!rec) return;

  if (rec.type === 'buy') {
    const reply = el('textarea', { class: 'input', rows: 2, placeholder: '留言（可选）' });
    const s = sheet({
      title: '审批：' + rec.title,
      node: el('div', {}, [el('div', { class: 'field' }, [el('label', { text: '留言' }), reply])]),
      actions: [
        { label: '通过', danger: false, onSelect: async () => { await doBuyDecide(rec, 'approved', reply.value.trim()); s.close(); } },
        { label: '驳回', danger: true, onSelect: async () => { await doBuyDecide(rec, 'rejected', reply.value.trim()); s.close(); } }
      ]
    });
    return;
  }

  /* 投票审批：单选 */
  const box = el('div');
  let picked = rec.vote || null;
  const draw = () => {
    box.innerHTML = '';
    (rec.options || []).forEach((o) => {
      const row = el('div', { class: 'ap-vote-item' + (picked === o.id ? ' on' : ''), style: { cursor: 'pointer' } }, [
        el('span', { text: o.title }),
        o.price ? el('span', { class: 'right', text: `¥${o.price}` }) : null
      ]);
      row.onclick = () => { picked = o.id; draw(); };
      box.appendChild(row);
    });
  };
  draw();
  const reply = el('textarea', { class: 'input', rows: 2, placeholder: '留言（可选）' });
  const s = sheet({
    title: '投票审批',
    node: el('div', {}, [box, el('div', { class: 'field', style: { marginTop: '10px' } }, [el('label', { text: '留言' }), reply])]),
    actions: [{ label: '提交投票', icon: 'IC-MIO-021', onSelect: async () => {
      if (!picked) { toast('请先选一个选项'); return; }
      rec.status = 'voted';
      rec.vote = picked;
      rec.reply = reply.value.trim();
      rec.decider = 'me';
      rec.decidedAt = Date.now();
      await put('approvals', rec);
      s.close(); await load(); toast('已投票');
    } }]
  });
}

async function doBuyDecide(rec, status, reply) {
  rec.status = status;
  rec.reply = reply;
  rec.decider = 'me';
  rec.decidedAt = Date.now();
  await put('approvals', rec);
  await load();
  toast(status === 'approved' ? '已通过' : '已驳回');
}
