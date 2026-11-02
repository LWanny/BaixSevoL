/* 我的 · 个人、通知、铃声、存储与备份入口 */

import { el, openFile, readBuf, humanSize, daysSince, compressImage } from '../util.js';
import { iconImg } from '../icons.js';
import { normalPage } from '../shell.js';
import { go } from '../router.js';
import { state, saveSettings, saveSkin, roleAvatarSrc, applySkin } from '../state.js';
import { saveMedia, mediaURL, mediaCount } from '../media.js';
import { storageEstimate, clearAll, all } from '../store.js';
import { notifySupported, requestNotifyPermission, playSound } from '../notify.js';
import { toast, confirmBox, alertBox, actionSheet, sheet } from '../ui.js';
import { openBulkImport } from '../bulkimport.js';

let view = null;

export default async function pageMe(v) {
  view = v;
  normalPage('me', {
    home: true,
    title: '我的',
    sub: '设置 · 通知 · 备份',
    actions: [{ icon: 'IC-MIO-007', label: '关于', onclick: () => go('/about') }]
  });
  await render();
}

async function render() {
  view.innerHTML = '';
  const wrap = el('div', { class: 'page' });

  /* ---- 顶部：我与 TA ---- */
  const meAv = el('div', { class: 'avatar lg' });
  const u = state.skin.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '';
  if (u) meAv.appendChild(el('img', { src: u })); else meAv.appendChild(document.createTextNode('我'));

  const taAvSrc = await roleAvatarSrc();
  const taAv = el('div', { class: 'avatar' }, [
    taAvSrc ? el('img', { src: taAvSrc }) : document.createTextNode((state.role.name || 'TA').slice(0, 1))
  ]);

  wrap.appendChild(el('div', { class: 'hero' }, [
    el('div', { class: 'row', style: { gap: '14px' } }, [
      el('div', { class: 'center', style: { cursor: 'pointer' }, onclick: pickMyAvatar }, [meAv, el('div', { class: 'tiny muted', style: { marginTop: '4px' }, text: '点击换头像' })]),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { class: 'row', style: { gap: '8px' } }, [
          taAv,
          el('div', { style: { minWidth: '0' } }, [
            el('div', { style: { fontWeight: '600' }, text: state.role.name || 'TA' }),
            el('div', { class: 'small muted ellipsis', text: state.role.signature || '还没有签名' })
          ])
        ]),
        el('div', { class: 'small muted', style: { marginTop: '8px' }, text: `已相识 ${daysSince(state.role.metAt)} 天` })
      ])
    ])
  ]));

  /* ---- 我的 ---- */
  wrap.appendChild(section('我的', el('div', { class: 'card flush' }, [
    row('IC-MIO-014', '角色档案', '头像 · 名字 · 签名 · 全部回复参数', () => go('/role')),
    row('IC-MIO-018', '我的名字', `来信抬头与写信署名：${state.settings.myName || '我'}`, editMyName),
    row('IC-MIO-013', '装扮与主题', '全局背景 · 气泡 · 壁纸 · 头像', () => go('/skin')),
    row('IC-CRD-001', '字卡库', 'TA 回复的唯一来源', () => go('/cards')),
    row('IC-MOM-001', '朋友圈', 'TA 的动态与我的主页', () => go('/moments')),
    row('IC-MIO-039', '商城', '本地小卖部 · 买点小东西送 TA', () => go('/shop')),
    row('IC-MIO-041', '拼夕夕', '拼着买 · 更便宜', () => go('/pdd')),
    row('IC-MIO-042', '通牌', '只以字卡交流', () => go('/tong')),
    row('IC-MIO-043', '回声', '拖上桌 · 翻开看', () => go('/echo')),
    row('IC-MIO-040', '游戏厅', '和 TA 玩点小游戏', () => go('/games')),
    row('IC-DIV-001', '占卜', '塔罗 · 本地随机 · 仅供娱乐', () => go('/divine')),
    row('IC-MIO-015', '图标素材库', '浏览 / 替换全站图标', () => go('/icons')),
    row('IC-MIO-010', '链接批量导入', '表情包 · 音乐 · 图片素材 · 音频', importMenu)
  ])));

  /* ---- 通知与提示音 ---- */
  const s = state.settings;
  wrap.appendChild(section('通知与提示音', el('div', { class: 'card flush' }, [
    switchRow('IC-MIO-012', '系统通知', notifySupported() ? '离开本站后也提醒新消息' : '当前浏览器不支持系统通知',
      s.notifyEnabled, toggleNotify, !notifySupported()),
    switchRow('IC-CHT-003', '页面内提示音', '收到 TA 消息时响一下', s.bubbleSound, async (on) => {
      s.bubbleSound = on; await saveSettings();
    }),
    row('IC-MIO-012', '自定义铃声', s.soundId ? '已设置（点击更换）' : '使用默认提示音', soundMenu)
  ])));

  /* ---- 数据与隐私 ---- */
  const est = await storageEstimate();
  const usageText = est
    ? `已用 ${humanSize(est.usage)} / 约 ${humanSize(est.quota)}`
    : '浏览器未提供存储统计';

  wrap.appendChild(section('数据与隐私', el('div', { class: 'card flush' }, [
    row('IC-MIO-019', '本地存储', usageText, async () => {
      // 点开时重新统计，避免导入素材后仍显示旧数字
      const n = await mediaCount();
      const [m2, c2, mo2] = await Promise.all([all('messages'), all('cards'), all('moments')]);
      alertBox({ title: '本地存储', text: `${usageText}\n\n消息 ${m2.length} 条 · 字卡 ${c2.length} 张 · 朋友圈 ${mo2.length} 条 · 媒体 ${n} 个。\n\n全部数据只存在这台设备的浏览器里，不会上传到任何服务器。` });
    }),
    row('IC-MIO-009', '全量导出 / 导入', '一个 zip 包备份所有数据', () => go('/data')),
    row('IC-MIO-008', '清空全部数据', '删除本地所有内容，无法撤销', clearAllData, '')
  ])));

  wrap.appendChild(el('div', { class: 'card', style: { marginTop: '10px' } }, [
    el('div', { class: 'row', style: { gap: '9px' } }, [
      iconImg('IC-MIO-007'),
      el('div', { class: 'small muted', text: '清除浏览器数据、换设备或系统回收存储都会导致本地数据丢失，请定期在「数据」里导出备份。' })
    ])
  ]));

  view.appendChild(wrap);
}

/* ---------------- 交互 ---------------- */
function editMyName() {
  const input = el('input', { class: 'input', maxlength: '12', value: state.settings.myName || '我' });
  const save = el('button', { class: 'btn primary', style: { flex: '1' }, onclick: async () => {
    const v = input.value.trim() || '我';
    state.settings.myName = v;
    await saveSettings();
    toast('已保存');
    ctl.close();
    await render();
  } }, ['保存']);
  const ctl = sheet({
    title: '我的名字',
    node: el('div', { class: 'field' }, [
      el('label', { text: '名字' }),
      input,
      el('div', { class: 'hint', text: '来信抬头「致 XXX：」与写信署名都会用这个名字' })
    ]),
    foot: save
  });
}

async function pickMyAvatar() {
  const f = await openFile({ accept: 'image/*' });
  if (!f) return;
  const { blob, w, h } = await compressImage(f, 512, 0.9);
  state.skin.avatarMeId = await saveMedia(blob, { type: 'image', w, h, source: 'avatar' });
  await saveSkin();
  await applySkin();
  await render();
  toast('头像已更新');
}

async function toggleNotify(on) {
  if (!on) { state.settings.notifyEnabled = false; await saveSettings(); return; }
  const ok = await requestNotifyPermission();
  if (!ok) { toast('未获得通知权限，请在浏览器设置里允许'); return; }
  state.settings.notifyEnabled = true;
  await saveSettings();
  await render();
  toast('已开启系统通知');
}

function importMenu() {
  actionSheet('链接批量导入', [
    { label: '表情包', sub: '导入到「我的表情库」，聊天里可一键发送', icon: 'IC-CHT-008', onSelect: () => openBulkImport('sticker') },
    { label: '音乐', sub: '导入到「我的歌单」，可离线播放', icon: 'IC-MIO-016', onSelect: () => openBulkImport('song') },
    { label: '图片素材', sub: '存进媒体库，发朋友圈 / 聊天时选用', icon: 'IC-MIO-015', onSelect: () => openBulkImport('image') },
    { label: '音频', sub: '只存进媒体库，不加入歌单', icon: 'IC-MIO-010', onSelect: () => openBulkImport('audio') }
  ]);
}

function soundMenu() {
  actionSheet('铃声', [
    { label: '从本地导入一段音频', icon: 'IC-MIO-010', sub: 'mp3 / wav 等', onSelect: pickSound },
    { label: '试听当前铃声', icon: 'IC-CHT-003', onSelect: () => { playSound(); } },
    state.settings.soundId ? { label: '恢复默认提示音', icon: 'IC-MIO-011', onSelect: async () => {
      state.settings.soundId = null; await saveSettings(); await render(); toast('已恢复默认');
    } } : null
  ].filter(Boolean));
}

async function pickSound() {
  const f = await openFile({ accept: 'audio/*' });
  if (!f) return;
  const buf = await readBuf(f);
  const blob = new Blob([buf], { type: f.type || 'audio/mpeg' });
  state.settings.soundId = await saveMedia(blob, { type: 'audio', source: 'me', name: f.name });
  await saveSettings();
  await render();
  toast('铃声已更换');
}

async function clearAllData() {
  const yes = await confirmBox({
    title: '清空全部数据',
    text: '将删除本地保存的聊天记录、字卡、朋友圈、占卜记录、图片语音与全部设置，且无法撤销。建议先到「数据」里导出备份。',
    okText: '全部清空', danger: true
  });
  if (!yes) return;
  await clearAll();
  toast('已清空，即将重新载入');
  setTimeout(() => location.reload(), 900);
}

/* ---------------- 小部件 ---------------- */
function section(title, node) {
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: title })]),
    node
  ]);
}

function row(icon, title, sub, onclick, right = 'chev') {
  return el('div', { class: 'list-item', onclick }, [
    iconImg(icon),
    el('div', { class: 'li-main' }, [
      el('div', { class: 'li-title', text: title }),
      sub ? el('div', { class: 'li-sub', text: sub }) : null
    ]),
    right === 'chev' ? iconImg('IC-MIO-004', 'chev') : null
  ]);
}

function switchRow(icon, title, sub, on, onToggle, disabled = false) {
  const sw = el('button', { class: 'sw' + (on ? ' on' : '') });
  sw.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (disabled) { toast(sub); return; }
    sw.classList.toggle('on');
    await onToggle(sw.classList.contains('on'));
  });
  return el('div', { class: 'list-item', style: { cursor: 'default' } }, [
    iconImg(icon),
    el('div', { class: 'li-main' }, [
      el('div', { class: 'li-title', text: title }),
      sub ? el('div', { class: 'li-sub', text: sub }) : null
    ]),
    sw
  ]);
}
