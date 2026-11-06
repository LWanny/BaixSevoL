/* 昵称库 / 头像库管理
   state.role.chatNicknameMe / chatAvatarMeId 存聊天里 TA 给我换的当前值
   nicknamePool: { id, role:'ta'|'me', name, ts }
   avatarPool:   { id, role:'ta'|'me', mediaId, ts } */

import { el, uid, openFile, compressImage } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { all, put, del } from '../store.js';
import { saveMedia, mediaURL } from '../media.js';
import { sheet, toast, confirmBox } from '../ui.js';
import { state } from '../state.js';
import { setupRoleUi, section } from './roleParts.js';
import { swapDemo } from '../nicknameAI.js';

const TABS = [
  { key: 'ta',   type: 'nickname', label: 'TA 的昵称库' },
  { key: 'me',   type: 'nickname', label: '我的昵称库' },
  { key: 'taAv', type: 'avatar',   label: 'TA 的头像库' },
  { key: 'meAv', type: 'avatar',   label: '我的头像库' }
];

let rows = [];
let cur = 'ta';
let viewEl = null;

export default async function pageAvatarLib(v) {
  viewEl = v;
  fullPage({ back: true, title: '昵称 / 头像库', sub: '聊天里的互动来源' });
  await reload();
  paint();
}

async function reload() {
  rows = await all('nicknamePool');
  rows = rows.concat((await all('avatarPool')).map((r) => ({ ...r, __kind: 'avatar' })));
}

function by(role, type) {
  return rows.filter((r) => r.role === role && (type === 'avatar' ? r.__kind === 'avatar' : !r.__kind));
}

function paint() {
  viewEl.innerHTML = '';
  const page = el('div', { class: 'page tight', style: { paddingBottom: '28px' } });

  page.appendChild(el('div', { class: 'an-hint', style: { padding: '10px 14px 4px', color: 'var(--txt-mute)', fontSize: '11.5px', lineHeight: '1.7' } }, [
    'TA 的昵称库 / 头像库 → TA 给自己换时从这里抽；',
    el('br'),
    '我的昵称库 / 头像库 → TA 主动给你换时从这里抽。',
    el('br'),
    '这里空着 TA 就不会换（没有兜底），点下面按钮导入即可。'
  ]));

  const tabBar = el('div', { class: 'an-sec-h', style: { padding: '4px 14px 10px', marginTop: '0', overflowX: 'auto', display: 'flex', gap: '6px' } });
  TABS.forEach((t) => {
    tabBar.appendChild(el('button', {
      class: 'chip' + (cur === t.key ? ' on' : ''),
      style: { flex: '0 0 auto', whiteSpace: 'nowrap' },
      onclick: () => { cur = t.key; paint(); }
    }, [t.label]));
  });
  page.appendChild(tabBar);

  const tab = TABS.find((t) => t.key === cur);
  const list = by(tab.key.startsWith('me') ? 'me' : 'ta', tab.type);

  const head = el('div', { class: 'row', style: { padding: '0 14px 6px' } });
  head.appendChild(el('span', { class: 'small muted', text: `共 ${list.length} 条` }));
  head.appendChild(el('span', { class: 'spacer' }));
  head.appendChild(el('button', { class: 'btn sm primary', onclick: () => openAdd(tab) }, [tab.type === 'avatar' ? '导入头像（可多选）' : '导入昵称（可多行）']));
  page.appendChild(head);

  const wrap = el('div', { class: 'card flush', style: { margin: '0 14px' } });
  if (!list.length) {
    wrap.appendChild(el('div', { class: 'empty', style: { padding: '22px' } }, [
      el('div', { class: 'e-h', text: '还没有内容' }),
      el('div', { class: 'e-p', text: '点右上角按钮添加几条' })
    ]));
  } else if (tab.type === 'avatar') {
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', padding: '8px' } });
    list.forEach((r) => grid.appendChild(avatarTile(r)));
    wrap.appendChild(grid);
  } else {
    list.forEach((r) => wrap.appendChild(nickRow(r)));
  }
  page.appendChild(wrap);

  /* 当前生效的聊天昵称 / 头像 */
  const curBox = el('div', { class: 'card flush', style: { margin: '12px 14px 0' } });
  curBox.appendChild(el('div', { class: 'hint', text: '聊天里当前显示的"我"：', style: { fontSize: '11px', padding: '10px 12px 4px', margin: 0 } }));
  curBox.appendChild(el('div', { class: 'row', style: { padding: '4px 12px 10px', gap: '10px' } }, [
    el('div', { class: 'avatar', style: { width: '40px', height: '40px' } }, [
      state.role.chatAvatarMeId ? el('img', { src: mediaURL(state.role.chatAvatarMeId) }) : document.createTextNode('我')
    ]),
    el('div', { style: { flex: 1 } }, [
      el('div', { style: { fontSize: '13px', fontWeight: '600' }, text: state.role.chatNicknameMe || '我' }),
      el('div', { style: { fontSize: '10.5px', color: 'var(--txt-mute)', marginTop: '2px' }, text: state.role.chatNicknameMe ? 'TA 换的，点这里恢复默认' : '默认（可点这里让 TA 换）' })
    ]),
    state.role.chatNicknameMe || state.role.chatAvatarMeId
      ? el('button', { class: 'btn sm', onclick: resetChatMe }, ['恢复默认'])
      : null
  ]));
  page.appendChild(curBox);

  paintSettings(page);

  viewEl.appendChild(page);
}

/* ---------------- 换改规则：开关 / 概率区间 / 每天最多几次 ---------------- */
function rowButton(name, desc, label, fn) {
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-main' }, [
      el('div', { class: 'set-t', text: name }),
      desc ? el('div', { class: 'set-s', text: desc }) : null
    ]),
    el('div', { class: 'set-ctl' }, [el('button', { class: 'btn sm', onclick: fn }, [label])])
  ]);
}

function paintSettings(page) {
  const p = state.role.params;
  const { rowPct, rowNum, rowToggle, rowSeg } = setupRoleUi(p);
  const group = (title, sub, rows) => page.appendChild(section(title, el('div', { class: 'set-card' }, [
    sub ? el('div', { class: 'hint', style: { padding: '8px 12px 0', margin: 0, lineHeight: '1.7' }, text: sub }) : null,
    ...rows
  ])));

  group('每天最多几次', '四种行为合计的当日上限', [
    rowNum('每天最多几次', '过了零点重新计数；默认 1', 'swapDailyMax', p.swapDailyMax, 1, 20, '次'),
    el('div', {
      class: 'hint', style: { padding: '10px 12px 12px', margin: 0 },
      text: '每次机会先按「下限~上限」随机取一个概率掷骰子，命中且当天还有次数、对应库里有货，才会真的换。'
    })
  ]);

  group('TA 主动给我换昵称', '用「我的昵称库」', [
    rowToggle('开关', '关闭后 TA 不会再动你的聊天昵称', 'taRenameEnabled', p.taRenameEnabled),
    rowPct('概率下限', '每次机会按「下限~上限」随机取一个概率', 'taRenamePctMin', p.taRenamePctMin),
    rowPct('概率上限', '默认最高 7%', 'taRenamePctMax', p.taRenamePctMax),
    rowSeg('方式', '直接换，还是先弹窗问你', 'taRenameMode', p.taRenameMode, [['direct', '直接换'], ['ask', '先问我']])
  ]);

  group('TA 主动给我换头像', '用「我的头像库」', [
    rowToggle('开关', '关闭后 TA 不会再动你的聊天头像', 'taChangeAvatarEnabled', p.taChangeAvatarEnabled),
    rowPct('概率下限', '', 'taChangeAvatarPctMin', p.taChangeAvatarPctMin),
    rowPct('概率上限', '默认最高 7%', 'taChangeAvatarPctMax', p.taChangeAvatarPctMax),
    rowSeg('方式', '直接换，还是先弹窗问你', 'taChangeAvatarMode', p.taChangeAvatarMode, [['direct', '直接换'], ['ask', '先问我']])
  ]);

  group('TA 给自己换昵称', '用「TA 的昵称库」', [
    rowToggle('开关', '关闭后 TA 永远用现在这个昵称', 'taSelfNickEnabled', p.taSelfNickEnabled),
    rowPct('概率下限', '', 'taSelfNickPctMin', p.taSelfNickPctMin),
    rowPct('概率上限', '默认最高 7%', 'taSelfNickPctMax', p.taSelfNickPctMax),
    rowSeg('方式', '直接换（发条通知），还是征求你同意', 'taSelfNickMode', p.taSelfNickMode, [['direct', '直接换'], ['ask', '先问我']])
  ]);

  group('TA 给自己换头像', '用「TA 的头像库」', [
    rowToggle('开关', '关闭后 TA 永远用现在这张头像', 'taSelfAvatarEnabled', p.taSelfAvatarEnabled),
    rowPct('概率下限', '', 'taSelfAvatarPctMin', p.taSelfAvatarPctMin),
    rowPct('概率上限', '默认最高 7%', 'taSelfAvatarPctMax', p.taSelfAvatarPctMax),
    rowSeg('方式', '直接换（发条通知），还是征求你同意', 'taSelfAvatarMode', p.taSelfAvatarMode, [['direct', '直接换'], ['ask', '先问我']])
  ]);

  group('试一试', '不用干等下一次掷骰子', [
    rowButton('让 TA 现在试一次', '不掷概率、不占当天次数，跑一个已打开的行为', '试一次', async () => {
      const msg = await swapDemo();
      toast(msg || '先把上面任意一个开关打开');
    })
  ]);
}

async function resetChatMe() {
  const role = state.role;
  if (!role.chatNicknameMe && !role.chatAvatarMeId) return;
  const yes = await confirmBox({ title: '恢复聊天昵称/头像', text: '恢复后，聊天里的"我"将回到默认值。', okText: '恢复' });
  if (!yes) return;
  role.chatNicknameMe = null;
  role.chatAvatarMeId = null;
  await import('../store.js').then(({ kvSet }) => kvSet('role', role));
  paint();
  toast('已恢复');
}

function nickRow(r) {
  return el('div', { class: 'list-item' }, [
    el('div', { class: 'li-main' }, [
      el('div', { class: 'li-title', text: r.name })
    ]),
    el('button', {
      class: 'tb-btn', title: '删除',
      onclick: async () => {
        const yes = await confirmBox({ title: '删除', text: `删除「${r.name}」？`, okText: '删除', danger: true });
        if (!yes) return;
        await del('nicknamePool', r.id); await reload(); paint();
      }
    }, [iconImg('IC-CRD-007')])
  ]);
}

function avatarTile(r) {
  const img = el('img', { alt: '头像', style: { width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '10px', background: '#f0f0ee', display: 'block' } });
  mediaURL(r.mediaId).then((u) => { if (u) img.src = u; });
  return el('div', { class: 'av-tile', style: { position: 'relative', cursor: 'pointer' }, onclick: async () => {
    const yes = await confirmBox({ title: '删除头像', text: '从库里删除这张？', okText: '删除', danger: true });
    if (!yes) return;
    await del('avatarPool', r.id); await reload(); paint();
  } }, [img]);
}

function openAdd(tab) {
  if (tab.type === 'nickname') return openAddNick(tab.key.startsWith('me') ? 'me' : 'ta');
  return openAddAv(tab.key.startsWith('me') ? 'me' : 'ta');
}

function openAddNick(role) {
  const input = el('textarea', {
    class: 'input', style: { minHeight: '96px', lineHeight: '1.7', resize: 'vertical' },
    placeholder: '每行一个昵称（每个不超过 8 字，最多一次 50 条）'
  });
  const ctl = sheet({
    title: role === 'ta' ? '导入昵称到 TA 昵称库' : '导入昵称到我的昵称库',
    node: el('div', { style: { padding: '4px 0 10px' } }, [
      input,
      el('div', { class: 'hint', text: '粘贴一串昵称，用换行 / 逗号 / 顿号隔开都行。' })
    ]),
    actions: [{
      label: '导入', icon: 'IC-MIO-021',
      onSelect: async () => {
        const lines = String(input.value || '')
          .split(/[\n,，、;；]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 50);
        if (!lines.length) return toast('写个昵称吧');
        for (const t of lines) {
          await put('nicknamePool', { id: uid(), role, name: t.slice(0, 8), ts: Date.now() });
        }
        ctl.close(); await reload(); paint();
        toast(`已导入 ${lines.length} 条昵称`);
      }
    }]
  });
  setTimeout(() => input.focus(), 240);
}

async function openAddAv(role) {
  const file = await openFile({ accept: 'image/*', multiple: true });
  if (!file) return;
  const list = Array.isArray(file) ? file : [file];
  let ok = 0;
  for (const f of list) {
    let out; try { out = await compressImage(f, 512, 0.85); } catch { out = { blob: f, w: 0, h: 0 }; }
    const mediaId = await saveMedia(out.blob, { type: 'image', w: out.w, h: out.h, source: 'library', name: f.name });
    await put('avatarPool', { id: uid(), role, mediaId, ts: Date.now() });
    ok++;
  }
  await reload(); paint();
  toast(`已添加 ${ok} 张`);
}
