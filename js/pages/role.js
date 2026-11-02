/* 角色档案 · 首页（分类入口）
   详细参数拆到子页面：/role/reply /role/moments /role/mailbox /role/call /role/traits */

import { el, compressImage, openFile } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { state, saveRole, DEFAULT_PARAMS, roleStatusMeta } from '../state.js';
import { saveMedia, mediaURL } from '../media.js';
import { toast, confirmBox } from '../ui.js';
import { go } from '../router.js';

export default async function pageRole(view) {
  fullPage({ back: true, title: '角色', actions: [
    { icon: 'IC-MIO-021', label: '保存', onclick: () => { saveRole(); toast('已保存'); } }
  ] });

  const r = state.role;
  const p = r.params;
  const wrap = el('div', { class: 'page' });

  /* ---- 头像 ---- */
  const avBox = el('div', { class: 'avatar lg', style: { margin: '0 auto' } });
  async function paintAvatar() {
    avBox.innerHTML = '';
    if (r.avatarId) {
      const u = await mediaURL(r.avatarId);
      if (u) avBox.appendChild(el('img', { src: u }));
    } else {
      avBox.appendChild(document.createTextNode((r.name || 'TA').slice(0, 1)));
    }
  }
  await paintAvatar();

  wrap.appendChild(el('div', { class: 'center', style: { margin: '16px 0 4px' } }, [
    avBox,
    el('div', { style: { fontSize: '18px', fontWeight: 700, marginTop: '8px' }, text: r.name || 'TA' }),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' } }, [
      el('span', { class: 'on-dot ' + roleStatusMeta(r.status).key }),
      el('span', { class: 'small muted', text: roleStatusMeta(r.status).label + ' · ' + (r.signature || '还没有签名') })
    ]),
    el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px', gap: '8px' } }, [
      el('button', { class: 'btn sm', onclick: pickAvatar }, ['更换头像']),
      el('button', { class: 'btn sm', onclick: () => go('/role/basic') }, ['基本资料'])
    ])
  ]));

  async function pickAvatar() {
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob, w, h } = await compressImage(f, 512, 0.9);
    r.avatarId = await saveMedia(blob, { type: 'image', w, h, source: 'avatar' });
    await saveRole();
    await paintAvatar();
    toast('头像已更新');
  }

  /* ---- 字卡库 ---- */
  wrap.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '字卡库' })]),
    el('div', { class: 'card', style: { padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('div', { class: 'small muted', text: '角色的全部回复都来自字卡库' }),
      el('button', { class: 'btn sm', onclick: () => go('/cards') }, ['去管理'])
    ])
  ]));

  /* ---- 分类卡片网格 ---- */
  const catGrid = el('div', { class: 'role-grid' }, [
    catCard('回话', '聊天回复 / 拼接 / 主动发送', 'IC-CHT-012', () => go('/role/reply')),
    catCard('TA的询问', 'TA 偶尔向你提问 / 我出题', 'IC-MIO-004', () => go('/role/ask')),
    catCard('朋友圈', 'TA 发动态 / 点赞评论反应', 'IC-MOM-001', () => go('/role/moments')),
    catCard('信箱', '写信封数 / 回信 / 来信内容', 'IC-MIO-011', () => go('/role/mailbox')),
    catCard('通话', '接听率 / 挂断 / 主动来电', 'IC-MIO-032', () => go('/role/call')),
    catCard('气质', '灵感 / 昵称头像 / 涂鸦 / 拼音', 'IC-MOD-005', () => go('/role/traits'))
  ]);
  wrap.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: '概率与参数' })]),
    catGrid
  ]));

  wrap.appendChild(el('div', { style: { padding: '0 2px 20px' } }, [
    el('button', { class: 'btn block', onclick: async () => {
      const yes = await confirmBox({ title: '恢复默认参数', text: '把所有回复参数改回初始默认值。', okText: '恢复默认' });
      if (!yes) return;
      r.params = { ...DEFAULT_PARAMS };
      await saveRole();
      go('/role');
      toast('已恢复默认');
    } }, ['恢复默认参数'])
  ]));

  view.appendChild(wrap);
}

function catCard(title, desc, icon, onclick) {
  return el('div', { class: 'role-cat', onclick }, [
    el('div', { class: 'role-cat-ic' }, [iconImg(icon)]),
    el('div', { class: 'role-cat-t', text: title }),
    el('div', { class: 'role-cat-d', text: desc }),
    el('span', { class: 'role-cat-arrow', text: '›' })
  ]);
}
