/* 审批小钱包 · 两种审批方式：
   - buy：想买什么（商品 / 价格 / 原因 / 替代品 / 图片），审批方只有 通过 / 驳回
   - vote：纠结买什么（上传图 + 选项 + 价格 + 纠结点），审批方单选投票
   记录存 approvals 表：
   { id, type:'buy'|'vote', from:'me'|'ta', ts, status:'pending'|'approved'|'rejected'|'voted',
     decidedAt, decider:'me'|'ta', reply,
     title, price, why, alternative, imgs:[mediaId...]（多图，imgId 为首图兼容字段）,
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
  let changed = await migrateRows(rows);
  changed = (await checkTaAuto()) || changed;
  if (changed) rows = (await all('approvals')).sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  paint();
}

/* ---------------- 权限规则 ----------------
   buy  ：我提交的只有 TA 能批；TA 提交的只有我能批（自己不能批自己发起的）
   vote ：双方各投一票，都投完才互相可见对方的票
   TA   ：提交后 3 天内随机时间、按概率处理；通过/驳回/投给谁完全随机 */

const TA_WINDOW_MIN = 10 * 60e3;               // 最早 10 分钟后
const TA_WINDOW_MAX = 3 * 24 * 3600e3;         // 最晚 3 天后
const TA_RATE = 0.85;                          // TA 会处理的比例

const TA_BUY_OK = ['行，批准了，买吧', '嗯，这个可以买', '好呀，通过～', '理由充分，准了', '买！'];
const TA_BUY_NO = ['这个先不买啦', '再想想吧，驳回～', '最近有点超支，先缓缓', '不许买，下次再说'];
const TA_VOTE_MSG = ['我选好了，你猜～', '纠结了一下，我投了一票', '嗯，我投了一个，投完你就知道'];

/** 新记录排 TA 计划：
    自定义窗口（taMin/taMax 分钟，发起时设置 → 100% 会处理）→ 在窗口内随机时间；
    未设置 → 85% 会处理，时间取 10 分钟 ~ 3 天内的随机点 */
function scheduleTaPlan(row) {
  const lo = Math.round(Number(row.taMin) || 0);
  const hi = Math.round(Number(row.taMax) || 0);
  if (lo > 0 || hi > 0) {
    const a = Math.max(1, Math.min(lo, hi || lo));
    const b = Math.max(a, Math.max(lo, hi));
    row.taWillDo = true;
    row.taPlanAt = Date.now() + a * 60e3 + Math.random() * (b - a) * 60e3;
    return;
  }
  row.taWillDo = Math.random() < TA_RATE;
  row.taPlanAt = row.taWillDo ? Date.now() + TA_WINDOW_MIN + Math.random() * (TA_WINDOW_MAX - TA_WINDOW_MIN) : 0;
}

/** 老数据迁移：单票 vote 字段拆成 myVote/taVote；老的 pending 记录补 TA 计划 */
async function migrateRows(rows) {
  let changed = false;
  for (const rec of rows) {
    const before = JSON.stringify([rec.vote, rec.myVote, rec.taVote, rec.taWillDo, rec.taPlanAt]);
    if (rec.vote && !rec.myVote && !rec.taVote) {
      if (rec.decider === 'ta') rec.taVote = rec.vote; else rec.myVote = rec.vote;
      rec.vote = null;
    }
    if (rec.taWillDo === undefined && rec.status === 'pending') {
      if (rec.type === 'buy' && rec.from === 'me') scheduleTaPlan(rec);
      if (rec.type === 'vote' && !rec.taVote) scheduleTaPlan(rec);
    }
    if (before !== JSON.stringify([rec.vote, rec.myVote, rec.taVote, rec.taWillDo, rec.taPlanAt])) {
      await put('approvals', rec);
      changed = true;
    }
  }
  return changed;
}

/** 到点的 TA 计划：buy 随机通过/驳回；vote 均匀随机投一票。scheduler 每 20 秒也会调 */
async function checkTaAuto() {
  const now = Date.now();
  let changed = false;
  for (const rec of await all('approvals')) {
    if (rec.taDone || !rec.taWillDo || !rec.taPlanAt || rec.taPlanAt > now) continue;
    if (rec.type === 'buy') {
      if (rec.from === 'me' && rec.status === 'pending') {
        rec.status = Math.random() < 0.5 ? 'approved' : 'rejected';
        rec.decider = 'ta';
        rec.decidedAt = now;
        rec.reply = Math.random() < 0.6 ? TA_BUY_OK[Math.floor(Math.random() * TA_BUY_OK.length)] : (rec.status === 'rejected' ? TA_BUY_NO[Math.floor(Math.random() * TA_BUY_NO.length)] : '');
      }
    } else if (!rec.taVote && (rec.options || []).length) {
      const opt = rec.options[Math.floor(Math.random() * rec.options.length)];
      rec.taVote = opt?.id || null;
      rec.taVoteAt = now;
      rec.reply = rec.reply || (Math.random() < 0.4 ? TA_VOTE_MSG[Math.floor(Math.random() * TA_VOTE_MSG.length)] : '');
      if (rec.myVote && rec.taVote) rec.status = 'voted';
    }
    rec.taDone = true;
    await put('approvals', rec);
    changed = true;
  }
  return changed;
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
  const bothVoted = !!(r.myVote && r.taVote);
  const vs = !isBuy && (r.myVote || r.taVote) && !bothVoted
    ? (r.myVote ? '我已投票' : 'TA 已投票') : null;
  const status = vs || STAT_LABEL[r.status] || r.status;
  const canAct = r.status === 'pending';

  const title = r.title || (isBuy ? '未填标题' : (r.question || '纠结投票'));
  const optTitle = (id) => (r.options || []).find((o) => o.id === id)?.title || '-';
  const subBits = [];
  if (isBuy) {
    if (r.price) subBits.push(`¥${r.price}`);
  } else {
    const n = (r.options || []).length;
    if (n) subBits.push(`${n} 个选项`);
    if (r.myVote) subBits.push(`我投了「${optTitle(r.myVote)}」`);
    if (bothVoted) subBits.push(`TA 投了「${optTitle(r.taVote)}」`);
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
      el('span', {
        class: 'ap-vote-chip'
          + (r.myVote === o.id ? ' on' : '')
          + (bothVoted && r.taVote === o.id ? ' ta' : ''),
        text: o.title + (o.price ? ` ¥${o.price}` : '')
      }))) : null,
    canAct && (isBuy ? r.from === 'ta' : !r.myVote) ? el('div', { class: 'ap-card-act', text: '点我审批' }) : null
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
  /* 多图（可选）：imgs 存 mediaId 列表；旧记录的单张 imgId 自动并入 */
  let imgs = (rec?.imgs?.length) ? [...rec.imgs] : (rec?.imgId ? [rec.imgId] : []);
  const imgBox = el('div', { class: 'ap-img-box' });
  const renderImg = () => {
    imgBox.innerHTML = '';
    imgs.forEach((id, idx) => {
      const wrap = el('div', { class: 'ap-img-item' });
      const im = el('img', { class: 'ap-img' });
      mediaURL(id).then((u) => { if (u) im.src = u; }).catch(() => {});
      wrap.appendChild(im);
      wrap.appendChild(el('button', { class: 'ap-img-del', type: 'button', title: '删除', onclick: () => { imgs.splice(idx, 1); renderImg(); } }, ['×']));
      imgBox.appendChild(wrap);
    });
    imgBox.appendChild(el('button', { class: 'btn sm', type: 'button', onclick: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob } = await compressImage(f, 1024, 0.85);
      imgs.push(await saveMedia(blob, { type: 'image', source: 'approval' }));
      renderImg();
    } }, [imgs.length ? '＋ 加图' : '加图片']));
  };
  renderImg();

  /* TA 审批时间（可选）：最快 / 最晚几分钟处理；留空默认 3 天内随机 */
  const taMinIn = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, placeholder: '最快（分钟）', value: rec?.taMin || '' });
  const taMaxIn = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, placeholder: '最晚（分钟）', value: rec?.taMax || '' });

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
      el('div', { class: 'field' }, [el('label', { text: '图片（可选）' }), imgBox]),
      el('div', { class: 'field' }, [
        el('label', { text: 'TA 审批时间（可选，留空默认 3 天内随机）' }),
        el('div', { class: 'row', style: { gap: '8px' } }, [taMinIn, taMaxIn])
      ])
    ]),
    actions: [{ label: '提交', icon: 'IC-MIO-021', onSelect: async () => {
      if (!title.value.trim()) { toast('请填写想买什么'); return; }
      const row = {
        ...(rec || {}),
        id: rec?.id || uid(), type: 'buy', from: rec?.from || 'me', ts: rec?.ts || Date.now(),
        status: rec?.status || 'pending', decidedAt: rec?.decidedAt || 0, decider: rec?.decider || '', reply: rec?.reply || '',
        title: title.value.trim(), price: Number(price.value) || 0,
        why: why.value.trim(), alternative: alt.value.trim(), imgs, imgId: imgs[0] || null,
        taMin: Number(taMinIn.value) || 0, taMax: Number(taMaxIn.value) || 0
      };
      if (!rec) scheduleTaPlan(row);   // 新记录：排 TA 的审批计划（有窗口用窗口，无窗口默认 3 天内随机）
      await put('approvals', row);
      s.close(); await load();
      const wLo = Math.round(Number(taMinIn.value) || 0), wHi = Math.round(Number(taMaxIn.value) || 0);
      toast(wLo > 0 || wHi > 0
        ? `已提交，TA 会在 ${Math.max(1, Math.min(wLo, wHi || wLo))}~${Math.max(wLo, wHi)} 分钟内审批`
        : '已提交，TA 会在 3 天内找时间审批');
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
      /* 选项配图：每个选项可带一张图 */
      const thumb = opt.imgId ? el('img', { class: 'ap-opt-thumb' }) : null;
      if (thumb) mediaURL(opt.imgId).then((u) => { if (u) thumb.src = u; }).catch(() => {});
      const imgBtn = el('button', { class: 'btn sm', type: 'button', onclick: async () => {
        const f = await openFile({ accept: 'image/*' });
        if (!f) return;
        const { blob } = await compressImage(f, 512, 0.85);
        opt.imgId = await saveMedia(blob, { type: 'image', source: 'approval' });
        renderOpts();
      } }, [opt.imgId ? '换图' : '配图']);
      const imgRow = el('div', { class: 'row', style: { gap: '6px', alignItems: 'center', marginTop: '6px' } }, [
        imgBtn,
        thumb,
        opt.imgId ? el('button', { class: 'btn sm', type: 'button', title: '删除配图', onclick: () => { opt.imgId = null; renderOpts(); } }, ['×']) : null
      ]);
      const row = el('div', { class: 'ap-vote-opt' }, [
        el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [t, p,
          el('button', { class: 'btn sm', type: 'button', title: '删除', disabled: options.length <= 2, onclick: () => {
            options.splice(i, 1); renderOpts();
          } }, ['×'])
        ]),
        imgRow
      ]);
      optBox.appendChild(row);
    });
  };
  renderOpts();

  /* 多图（可选）：imgs 存 mediaId 列表；旧记录的单张 imgId 自动并入 */
  let imgs = (rec?.imgs?.length) ? [...rec.imgs] : (rec?.imgId ? [rec.imgId] : []);
  const imgBox = el('div', { class: 'ap-img-box' });
  const renderImg = () => {
    imgBox.innerHTML = '';
    imgs.forEach((id, idx) => {
      const wrap = el('div', { class: 'ap-img-item' });
      const im = el('img', { class: 'ap-img' });
      mediaURL(id).then((u) => { if (u) im.src = u; }).catch(() => {});
      wrap.appendChild(im);
      wrap.appendChild(el('button', { class: 'ap-img-del', type: 'button', title: '删除', onclick: () => { imgs.splice(idx, 1); renderImg(); } }, ['×']));
      imgBox.appendChild(wrap);
    });
    imgBox.appendChild(el('button', { class: 'btn sm', type: 'button', onclick: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob } = await compressImage(f, 1024, 0.85);
      imgs.push(await saveMedia(blob, { type: 'image', source: 'approval' }));
      renderImg();
    } }, [imgs.length ? '＋ 加图' : '加图片']));
  };
  renderImg();

  /* TA 投票时间（可选）：最快 / 最晚几分钟投票；留空默认 3 天内随机 */
  const taMinIn = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, placeholder: '最快（分钟）', value: rec?.taMin || '' });
  const taMaxIn = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, placeholder: '最晚（分钟）', value: rec?.taMax || '' });

  const s = sheet({
    title: rec ? '编辑投票' : '发起审批 · 纠结投票',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '纠结点是什么' }), question]),
      el('div', { class: 'field' }, [
        el('label', { text: '选项（至少 2 个）' }),
        optBox,
        el('button', { class: 'btn sm', type: 'button', onclick: () => { options.push({ id: uid(), title: '', price: '' }); renderOpts(); } }, ['＋ 加一项'])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '图片（可选）' }), imgBox]),
      el('div', { class: 'field' }, [
        el('label', { text: 'TA 投票时间（可选，留空默认 3 天内随机）' }),
        el('div', { class: 'row', style: { gap: '8px' } }, [taMinIn, taMaxIn])
      ])
    ]),
    actions: [{ label: '提交', icon: 'IC-MIO-021', onSelect: async () => {
      const opts = options.filter((o) => o.title);
      if (!question.value.trim()) { toast('请填写纠结点'); return; }
      if (opts.length < 2) { toast('至少 2 个选项'); return; }
      const row = {
        ...(rec || {}),
        id: rec?.id || uid(), type: 'vote', from: rec?.from || 'me', ts: rec?.ts || Date.now(),
        status: rec?.status || 'pending', decidedAt: rec?.decidedAt || 0, decider: rec?.decider || '', reply: rec?.reply || '',
        question: question.value.trim(), options: opts, myVote: rec?.myVote || null, taVote: rec?.taVote || null, imgs, imgId: imgs[0] || null,
        taMin: Number(taMinIn.value) || 0, taMax: Number(taMaxIn.value) || 0
      };
      if (!rec) scheduleTaPlan(row);   // 新记录：排 TA 的投票计划（有窗口用窗口，无窗口默认 3 天内随机）
      await put('approvals', row);
      s.close(); await load();
      const wLo = Math.round(Number(taMinIn.value) || 0), wHi = Math.round(Number(taMaxIn.value) || 0);
      toast(wLo > 0 || wHi > 0
        ? `已提交，TA 会在 ${Math.max(1, Math.min(wLo, wHi || wLo))}~${Math.max(wLo, wHi)} 分钟内投票`
        : '已提交，双方各投一票，TA 也会投');
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
    const reveal = !!(rec.myVote && rec.taVote);   // 双方都投完才互相可见
    const box = el('div', { class: 'ap-vote-list' });
    (rec.options || []).forEach((o) => {
      const marks = [];
      if (rec.myVote === o.id) marks.push(el('span', { class: 'ap-vote-mark', text: '✓ 我投给这里' }));
      if (reveal && rec.taVote === o.id) marks.push(el('span', { class: 'ap-vote-mark ta', text: '✓ TA 投给这里' }));
      const th = o.imgId ? el('img', { class: 'ap-opt-thumb' }) : null;
      if (th) mediaURL(o.imgId).then((u) => { if (u) th.src = u; }).catch(() => {});
      box.appendChild(el('div', { class: 'ap-vote-item' + ((rec.myVote === o.id || (reveal && rec.taVote === o.id)) ? ' on' : '') }, [
        th,
        el('span', { text: o.title }),
        o.price ? el('span', { class: 'right', text: `¥${o.price}` }) : null,
        ...marks
      ]));
    });
    node.appendChild(box);
    if (!reveal) {
      node.appendChild(el('div', { class: 'ap-row-txt', text: rec.taVote
        ? 'TA 已投票。投完你的票后才能看到 TA 的选择'
        : (rec.myVote ? 'TA 还没投票，投完你们就能互相看到结果' : '双方各投一票，都投完后互相可见') }));
    }
  }
  const detailImgs = (rec.imgs?.length) ? rec.imgs : (rec.imgId ? [rec.imgId] : []);
  for (const id of detailImgs) {
    try {
      const url = await mediaURL(id);
      node.appendChild(el('img', { src: url, class: 'ap-img-big' }));
    } catch {}
  }
  node.appendChild(el('div', { class: 'ap-status-line', text: `状态：${STAT_LABEL[rec.status] || rec.status} · ${rec.from === 'ta' ? 'TA 提交' : '我提交'} · ${fmtDay(rec.ts)}` }));
  if (rec.reply) node.appendChild(el('div', { class: 'ap-reply-box' }, [el('div', { class: 'ap-reply-t', text: rec.decider === 'ta' ? 'TA 留言' : '我的留言' }), el('div', { text: rec.reply })]));

  const actions = [];
  if (rec.type === 'buy') {
    if (rec.from === 'ta' && rec.status === 'pending') {
      actions.push({ label: '通过 / 驳回', icon: 'IC-MIO-021', onSelect: () => openAct(rec) });
    } else if (rec.from === 'me' && rec.status === 'pending') {
      actions.push({ label: '等 TA 审批', icon: 'IC-MIO-014', onSelect: () => toast('自己发起的审批由 TA 来批，TA 会在 3 天内找时间处理') });
    }
  } else if (!rec.myVote) {
    actions.push({ label: '投票', icon: 'IC-MIO-021', onSelect: () => openAct(rec) });
  }
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
    /* 自己不能审批自己发起的 */
    if (rec.from === 'me') { toast('自己发起的审批由 TA 来批'); return; }
    if (rec.status !== 'pending') { toast('这条已审批完成'); return; }
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

  /* 投票审批：双方各投一票，都投完才互相可见 */
  if (rec.myVote) { toast('你已经投过票了'); return; }
  const box = el('div');
  let picked = null;
  const draw = () => {
    box.innerHTML = '';
    (rec.options || []).forEach((o) => {
      const th = o.imgId ? el('img', { class: 'ap-opt-thumb' }) : null;
      if (th) mediaURL(o.imgId).then((u) => { if (u) th.src = u; }).catch(() => {});
      const row = el('div', { class: 'ap-vote-item' + (picked === o.id ? ' on' : ''), style: { cursor: 'pointer' } }, [
        th,
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
      rec.myVote = picked;
      rec.myVoteAt = Date.now();
      rec.decider = 'me';
      rec.reply = reply.value.trim() || rec.reply || '';
      rec.status = (rec.myVote && rec.taVote) ? 'voted' : 'pending';
      rec.decidedAt = rec.status === 'voted' ? Date.now() : (rec.decidedAt || 0);
      await put('approvals', rec);
      s.close(); await load();
      toast(rec.status === 'voted' ? '已投票，双方都投完了，结果互相可见' : '已投票，等 TA 投票后互相可见');
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
