/* 气质参数 · 灵感 / 昵称头像 / 涂鸦 / 拼音打字 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { state } from '../state.js';
import { setupRoleUi, section } from './roleParts.js';

export default async function pageRoleTraits(view) {
  fullPage({ back: true, title: '气质参数' });
  const p = state.role.params;
  const { rowPct, rowNum, rowToggle, rowSeg } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  wrap.appendChild(section('灵感拾取', el('div', { class: 'set-card' }, [
    rowToggle('允许拾取灵感', '关闭后 TA 不会再收你的话', 'inspirationEnabled', p.inspirationEnabled),
    rowPct('每次可拾取概率', 'TA 在聊天/信件/朋友圈里捡走你一句话的概率', 'inspirationPct', p.inspirationPct),
    rowPct('使用灵感概率', 'TA 生成回复时直接用拾取句的概率', 'inspirationUsePct', p.inspirationUsePct)
  ])));

  wrap.appendChild(section('昵称 / 头像互动', el('div', { class: 'set-card' }, [
    el('div', {
      class: 'hint', style: { padding: '10px 12px 4px', margin: 0, lineHeight: '1.7' },
      text: '四种换改（TA 换我的 / TA 换它自己的昵称与头像）的开关、概率区间、「每天最多几次」和导入入口，都搬到「昵称 / 头像库」页面了。'
    }),
    el('div', { class: 'set-row' }, [
      el('div', { class: 'set-main' }, [el('div', { class: 'set-t', text: '打开昵称 / 头像库' })]),
      el('div', { class: 'set-ctl' }, [el('button', { class: 'btn sm primary', onclick: () => go('/avatarLib') }, ['前往'])])
    ])
  ])));

  wrap.appendChild(section('涂鸦', el('div', { class: 'set-card' }, [
    rowToggle('允许 TA 涂鸦', 'TA 只能用空心/实心图形、直线/虚线/波浪、对勾叉叉和大写字母', 'taGraffitiEnabled', p.taGraffitiEnabled),
    rowPct('涂鸦概率', '每个间隔里真的发一张涂鸦的概率', 'taGraffitiPct', p.taGraffitiPct),
    rowNum('涂鸦间隔（最短）', '', 'taGraffitiGapMin', p.taGraffitiGapMin, 1, 9999, '分'),
    rowNum('涂鸦间隔（最长）', '', 'taGraffitiGapMax', p.taGraffitiGapMax, 1, 9999, '分')
  ])));

  wrap.appendChild(section('拼音打字', el('div', { class: 'set-card' }, [
    rowToggle('允许 TA 用拼音组词', '不翻字卡库，随机敲拼音拼出一句话再发送', 'pinyinEnabled', p.pinyinEnabled),
    rowPct('每次回复用拼音的概率', '每条回复里最多出现一条拼音消息', 'pinyinPct', p.pinyinPct)
  ])));

  view.appendChild(wrap);
}
