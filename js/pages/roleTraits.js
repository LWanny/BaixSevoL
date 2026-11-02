/* 气质参数 · 灵感 / 昵称头像 / 涂鸦 / 拼音打字 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
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
    rowToggle('允许 TA 换我的昵称', '只在聊天里生效；通话、占卜等仍显示桌面昵称', 'taRenameEnabled', p.taRenameEnabled),
    rowPct('换昵称概率', '每个间隔里真的换的概率', 'taRenamePct', p.taRenamePct),
    rowSeg('换昵称方式', '直接换 / 先征求同意', 'taRenameMode', p.taRenameMode, [['direct', '直接换'], ['ask', '征求同意']]),
    rowNum('换昵称间隔（最短）', '', 'taRenameGapMin', p.taRenameGapMin, 1, 9999, '分'),
    rowNum('换昵称间隔（最长）', '', 'taRenameGapMax', p.taRenameGapMax, 1, 9999, '分'),
    rowToggle('允许 TA 换我的头像', '只在聊天里生效', 'taChangeAvatarEnabled', p.taChangeAvatarEnabled),
    rowPct('换头像概率', '', 'taChangeAvatarPct', p.taChangeAvatarPct),
    rowSeg('换头像方式', '直接换 / 先征求同意', 'taChangeAvatarMode', p.taChangeAvatarMode, [['direct', '直接换'], ['ask', '征求同意']]),
    rowNum('换头像间隔（最短）', '', 'taChangeAvatarGapMin', p.taChangeAvatarGapMin, 1, 9999, '分'),
    rowNum('换头像间隔（最长）', '', 'taChangeAvatarGapMax', p.taChangeAvatarGapMax, 1, 9999, '分')
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
