/* 问卷 · 大问卷（多题模板）+ 小问卷（聊天里发问卷句子）
   - 大问卷：可新建/导入多题模板，点击卡片查看详情（邀请填写/编辑/导出/删除/填写记录）
   - 小问卷：在聊天里发送「问卷：xxx」会变成问卷卡片，这里只放说明
   纯本地，不联网。 */

import { el, uid, fmtDateTime, downloadBlob, openFile, readText } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { all, put, del, bulkPut } from '../store.js';
import { sheet, toast, alertBox, confirmBox, topBanner } from '../ui.js';

/* 「对象和他人的关系你能忍到几级」的 15 级题库（内置问卷升级用） */
const LEVELS = [
  '第1级：见面打招呼',
  '第2级：有联系方式',
  '第3级：偶尔点赞',
  '第4级：私下单聊',
  '第5级：单独吃饭',
  '第6级：一起看电影',
  '第7级：深夜聊天',
  '第8级：分享心事',
  '第9级：互送礼物',
  '第10级：挽手搭肩',
  '第11级：单独旅行',
  '第12级：频繁单独见面',
  '第13级：有对象还这样',
  '第14级：瞒着你见面',
  '第15级：说「只是朋友」'
];
const LEVEL_ITEMS = LEVELS.map((content, i) => ({
  type: 'choice',
  content,
  options: ['接受', '中立', '拒绝'],
  allowComment: i === 0 || i === 6
}));

/* 内置问卷模板：首次进入且没有任何模板时写入 */
const BUILTIN = [
  {
    title: '关于我们',
    items: [
      { type: 'open', content: '我们认识的第一天，你还记得是怎样的吗？', options: [], allowComment: false },
      { type: 'choice', content: '你觉得我们之间最舒服的相处状态是？', options: ['天天黏在一起', '各自忙也安心', '想聊就聊', '一起发呆'], allowComment: true },
      { type: 'open', content: '如果用一个词形容我们，你会选哪个？', options: [], allowComment: false },
      { type: 'choice', content: '周末更想一起做什么？', options: ['出门走走', '在家待着', '看电影', '吃好吃的'], allowComment: false },
      { type: 'open', content: '最近一次因为我开心是什么时候？', options: [], allowComment: true },
      { type: 'choice', content: '你希望我多说哪一类话？', options: ['夸你', '关心你', '分享日常', '什么都行'], allowComment: false },
      { type: 'open', content: '有什么是你一直想对我说但没说出口的？', options: [], allowComment: true },
      { type: 'choice', content: '如果只能保留我们之间的一样东西，你选？', options: ['聊天记录', '一起的照片', '某句话', '某个习惯'], allowComment: true }
    ]
  },
  {
    title: '对象和他人的关系你能忍到几级',
    items: LEVEL_ITEMS
  },
  {
    title: '网站',
    items: [
      { type: 'open', content: '你平时最常逛的网站是哪个？', options: [], allowComment: false },
      { type: 'choice', content: '你更习惯用什么设备上网？', options: ['手机', '电脑', '平板', '都差不多'], allowComment: false }
    ]
  }
];

let view = null;
let templates = [];       // 大问卷模板（含 items）

export default async function pageQuiz(v) {
  view = v;
  clearInviteTimers();
  window.addEventListener('hashchange', clearInviteTimers, { once: true });
  fullPage({ back: true, title: '问卷' });
  await load();
  await seedBuiltin();
  paint();
}

/* ---------------- 数据 ---------------- */
async function load() {
  const rows = await all('quizzes');
  templates = rows.filter((r) => r && Array.isArray(r.items))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

async function seedBuiltin() {
  if (!templates.length) {
    const now = Date.now();
    const seeds = BUILTIN.map((t, i) => ({
      id: uid(),
      kind: 'template',
      title: t.title,
      items: t.items,
      builtin: true,
      tplVer: 2,
      fillCount: 0,
      records: [],
      ts: now - i * 1000
    }));
    await bulkPut('quizzes', seeds);
    templates = seeds;
    return;
  }
  /* 老版本的内置问卷题目不对，升级成 15 级题库（保留填写记录与次数，只升级一次） */
  const old = templates.find((t) => t.builtin && t.title === '对象和他人的关系你能忍到几级' && t.tplVer !== 2);
  if (old) {
    old.items = LEVEL_ITEMS;
    old.tplVer = 2;
    await put('quizzes', old);
  }
}

/* ---------------- 首页 ---------------- */
function paint() {
  view.innerHTML = '';
  const page = el('div', { class: 'page quiz' });

  /* 顶部双按钮 */
  page.appendChild(el('div', { class: 'qz-top' }, [
    el('button', { class: 'qz-top-btn', onclick: () => openCreate() }, [iconImg('IC-MIO-022'), '新建问卷']),
    el('button', { class: 'qz-top-btn', onclick: importJSON }, ['导入'])
  ]));

  /* 大问卷 */
  page.appendChild(el('div', { class: 'qz-sec-h' }, [el('span', { text: '大问卷' })]));

  const grid = el('div', { class: 'qz-grid' });
  templates.forEach((t) => grid.appendChild(cardNode(t)));
  page.appendChild(grid);

  view.appendChild(page);
}

function cardNode(t) {
  const meta = [
    `${t.items.length} 题`,
    `已填 ${t.fillCount || 0} 次`
  ];
  if (t.builtin) meta.push('内置');
  return el('div', { class: 'qz-card', onclick: () => openDetail(t) }, [
    el('div', { class: 'qz-card-ic' }, [iconImg('IC-MIO-028')]),
    el('div', { class: 'qz-card-title', text: t.title }),
    el('div', { class: 'qz-card-meta', text: meta.join(' · ') })
  ]);
}

/* ---------------- 新建 / 编辑问卷 ---------------- */
function openCreate(editTpl = null) {
  const isEdit = !!editTpl;
  const titleInput = el('input', { class: 'input', placeholder: '问卷标题', value: editTpl ? editTpl.title : '' });

  const itemsWrap = el('div', { class: 'qz-items' });
  /* 初始题目数据：编辑时复制原 items，新建时给一道空题 */
  const items = (editTpl ? editTpl.items : [{ type: 'open', content: '', options: [], allowComment: false }])
    .map((it) => ({ type: it.type, content: it.content || '', options: (it.options || []).slice(), allowComment: !!it.allowComment }));

  function renderItems() {
    itemsWrap.innerHTML = '';
    items.forEach((it, idx) => itemsWrap.appendChild(itemRow(it, idx)));
  }

  function itemRow(it, idx) {
    const delBtn = el('span', {
      class: 'qz-item-del',
      onclick: () => { if (items.length <= 1) { toast('至少保留一道题'); return; } items.splice(idx, 1); renderItems(); }
    }, '删除');

    const contentInput = el('textarea', {
      class: 'input', rows: 2, placeholder: '题目内容', value: it.content,
      oninput: (e) => { it.content = e.target.value; }
    });

    /* 类型切换：选项 / 附加评论 */
    const choiceBtn = el('button', {
      class: 'qz-toggle' + (it.type === 'choice' ? ' on' : ''),
      onclick: () => { it.type = (it.type === 'choice') ? 'open' : 'choice'; renderItems(); }
    }, ['选项']);

    const commentBtn = el('button', {
      class: 'qz-toggle' + (it.allowComment ? ' on' : ''),
      onclick: () => { it.allowComment = !it.allowComment; renderItems(); }
    }, ['附加评论']);

    const row = el('div', { class: 'qz-item' }, [
      el('div', { class: 'qz-item-head' }, [
        el('span', { class: 'qz-item-idx', text: `题目 ${idx + 1}` }),
        delBtn
      ]),
      contentInput,
      el('div', { class: 'qz-item-toggles' }, [choiceBtn, commentBtn])
    ]);

    /* 选项题：显示选项输入 */
    if (it.type === 'choice') {
      const optsInput = el('textarea', {
        class: 'input qz-opts-input', rows: 2,
        placeholder: '选项，一行一个',
        value: (it.options || []).join('\n'),
        oninput: (e) => { it.options = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); }
      });
      row.appendChild(optsInput);
    }

    return row;
  }

  const addBtn = el('button', { class: 'btn block qz-add-btn', onclick: () => {
    items.push({ type: 'open', content: '', options: [], allowComment: false });
    renderItems();
  } }, [iconImg('IC-MIO-022'), '添加题目']);

  const saveBtn = el('button', { class: 'btn primary block qz-save-btn', onclick: save }, [isEdit ? '保存修改' : '保存问卷']);

  renderItems();

  const body = el('div', {}, [
    titleInput,
    itemsWrap,
    addBtn,
    saveBtn
  ]);

  const s = sheet({ title: isEdit ? '编辑问卷' : '新建问卷', node: body });

  async function save() {
    const title = titleInput.value.trim();
    if (!title) { toast('请输入问卷标题'); return; }
    const valid = items.filter((it) => it.content.trim());
    if (!valid.length) { toast('至少写一道题'); return; }
    valid.forEach((it) => {
      it.content = it.content.trim();
      if (it.type !== 'choice') it.options = [];   // 关掉「选项」开关后不再残留旧选项
    });

    const rec = {
      id: editTpl ? editTpl.id : uid(),
      kind: 'template',
      title,
      items: valid,
      builtin: editTpl ? !!editTpl.builtin : false,
      fillCount: editTpl ? editTpl.fillCount || 0 : 0,
      records: editTpl ? (editTpl.records || []) : [],
      ts: Date.now()
    };
    try {
      await put('quizzes', rec);
    } catch (err) {
      alertBox({ title: '保存失败', text: String(err && err.message || err) });
      return;
    }
    toast(isEdit ? '已保存' : '问卷已创建');
    s.close();
    await load();
    paint();
  }
}

/* ---------------- 问卷详情 ---------------- */
function openDetail(t) {
  const stat = `共 ${t.items.length} 道题目 · ${t.builtin ? '内置问卷' : '自定义问卷'}`;

  const records = (t.records || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const recList = el('div', { class: 'qz-rec-list' });
  if (records.length) {
    records.forEach((r) => {
      recList.appendChild(el('div', { class: 'qz-rec', onclick: () => showRecord(t, r) }, [
        el('span', { class: 'qz-rec-time', text: fmtDateTime(r.ts) }),
        iconImg('IC-MIO-004', 'chev')
      ]));
    });
  } else {
    recList.appendChild(el('div', { class: 'qz-rec-empty', text: '还没有填写记录' }));
  }

  const body = el('div', {}, [
    el('div', { class: 'qz-d-stat', text: stat }),
    el('button', { class: 'btn block qz-d-btn', onclick: () => inviteFill(t, s) }, ['邀请对方填写']),
    el('button', { class: 'btn block qz-d-btn', onclick: () => { s.close(); openCreate(t); } }, ['编辑问卷']),
    el('button', { class: 'btn block qz-d-btn', onclick: () => { exportOne(t); } }, ['导出问卷']),
    el('button', { class: 'btn block qz-d-btn danger', onclick: () => removeTpl(t) }, ['删除问卷']),
    el('div', { class: 'qz-rec-h', text: '填写记录' }),
    recList
  ]);

  const s = sheet({ title: t.title, node: body });
}

/* ---------------- 邀请对方填写 ---------------- */
let inviteTimers = [];
function clearInviteTimers() {
  inviteTimers.forEach((id) => clearTimeout(id));
  inviteTimers = [];
}

/* 顶部横幅：已发出邀请 → 对方接受 / 对方拒绝 → 接受后打开填写页 */
function inviteFill(t, s) {
  if (s) s.close();
  const banner = topBanner({
    icon: 'IC-CHT-004', tone: 'invite',
    title: '已发出邀请',
    sub: `《${t.title}》· 等待对方回应...`
  });

  inviteTimers.push(setTimeout(() => {
    if (Math.random() < 0.8) {
      banner.update({ icon: 'IC-MIO-003', tone: 'ok', title: '对方接受了邀请', sub: '正在打开问卷...' });
      inviteTimers.push(setTimeout(() => {
        banner.close();
        go('/quizfill?id=' + encodeURIComponent(t.id));
      }, 1000));
    } else {
      banner.update({ icon: 'IC-MIO-002', tone: 'no', title: '对方拒绝了邀请', sub: `《${t.title}》· 稍后再试一次吧` });
      inviteTimers.push(setTimeout(() => banner.close(), 2400));
    }
  }, 1800 + Math.random() * 900));
}

/* 一条填写记录：逐题列出双方的选择与评论 */
function showRecord(t, r) {
  const body = el('div', {});

  if (!Array.isArray(r.answers) || !r.answers.length) {
    body.appendChild(el('div', { class: 'qz-rec-empty', text: `${fmtDateTime(r.ts)} · 这次只发出了邀请，没有完成填写` }));
    sheet({ title: '填写记录', node: body });
    return;
  }

  body.appendChild(el('div', { class: 'qz-d-stat', text: fmtDateTime(r.ts) }));

  t.items.forEach((it, i) => {
    const mine = r.answers[i] || {};
    const ta = (r.ta || [])[i] || {};
    const card = el('div', { class: 'qz-rec-d' }, [
      el('div', { class: 'qz-rec-dq', text: `${i + 1}. ${it.content}` })
    ]);
    card.appendChild(el('div', { class: 'qz-rec-row' }, [
      el('span', { class: 'qz-rec-who', text: '我' }),
      el('span', { class: 'qz-rec-val', text: mine.answer || '（未填）' })
    ]));
    if (ta.answer) {
      card.appendChild(el('div', { class: 'qz-rec-row ta' }, [
        el('span', { class: 'qz-rec-who', text: '对方' }),
        el('span', { class: 'qz-rec-val', text: ta.answer })
      ]));
    }
    if (mine.comment) card.appendChild(el('div', { class: 'qz-rec-cmt', text: '我的评论：' + mine.comment }));
    if (ta.comment) card.appendChild(el('div', { class: 'qz-rec-cmt', text: '对方评论：' + ta.comment }));
    body.appendChild(card);
  });

  sheet({ title: '填写记录', node: body });
}

async function removeTpl(t) {
  const ok = await confirmBox({ title: '删除问卷', text: `确定删除「${t.title}」吗？此操作不可恢复。`, okText: '删除', danger: true });
  if (!ok) return;
  await del('quizzes', t.id);
  toast('已删除');
  await load();
  paint();
}

/* ---------------- 导入 / 导出 ---------------- */
async function exportOne(t) {
  const blob = new Blob([JSON.stringify({ app: '字卡传信', kind: 'quiz-template', exportedAt: Date.now(), items: [t] }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `问卷-${t.title}.json`);
  toast('已导出');
}

async function exportJSON() {
  const rows = templates;
  const blob = new Blob([JSON.stringify({ app: '字卡传信', kind: 'quiz-template', exportedAt: Date.now(), items: rows }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `字卡传信问卷-${new Date().toISOString().slice(0, 10)}.json`);
  toast('已导出');
}

async function importJSON() {
  const f = await openFile({ accept: '.json,application/json' });
  if (!f) return;
  try {
    const obj = JSON.parse(await readText(f));
    const rows = Array.isArray(obj) ? obj : (obj.items || []);
    const valid = rows.filter((r) => r && r.title && Array.isArray(r.items)).map((r) => ({
      id: r.id || uid(),
      kind: 'template',
      title: String(r.title),
      items: r.items.map((it) => ({
        type: it.type === 'choice' ? 'choice' : 'open',
        content: String(it.content || ''),
        options: Array.isArray(it.options) ? it.options.map(String) : [],
        allowComment: !!it.allowComment
      })),
      builtin: !!r.builtin,
      fillCount: r.fillCount || 0,
      records: Array.isArray(r.records) ? r.records : [],
      ts: r.ts || Date.now()
    }));
    if (!valid.length) { alertBox({ title: '导入失败', text: '文件里没有可用的问卷模板' }); return; }
    await bulkPut('quizzes', valid);
    toast(`已导入 ${valid.length} 个问卷`);
    await load();
    paint();
  } catch (err) {
    alertBox({ title: '导入失败', text: String(err.message || err) });
  }
}
