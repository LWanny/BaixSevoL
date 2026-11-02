/* 信箱参数 · 回信概率 + 来信内容附加 + 主动来信 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { state } from '../state.js';
import { setupRoleUi, section } from './roleParts.js';

export default async function pageRoleMailbox(view) {
  fullPage({ back: true, title: '信箱参数' });
  const p = state.role.params;
  const { rowPct, rowNum, rowToggle } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  wrap.appendChild(section('单封信件字卡数量', el('div', { class: 'set-card' }, [
    rowNum('回复·最少字卡数', '单封收到的信件最少包含字卡数量', 'replyMinCards', p.replyMinCards, 1, 999, '张'),
    rowNum('回复·最多字卡数', '单封收到的信件最多包含字卡数量', 'replyMaxCards', p.replyMaxCards, 1, 999, '张'),
    rowNum('主动信·最少字卡数', '单封主动信最少包含字卡数量', 'proactiveMinCards', p.proactiveMinCards, 1, 999, '张'),
    rowNum('主动信·最多字卡数', '单封主动信最多包含字卡数量', 'proactiveMaxCards', p.proactiveMaxCards, 1, 999, '张')
  ])));

  wrap.appendChild(section('每日写信封数', el('div', { class: 'set-card' }, [
    rowNum('每天最少回复封数', '未达标时 TA 会强制回复', 'dailyReplyMin', p.dailyReplyMin, 0, 100, '封'),
    rowNum('每天最多回复封数', '超过后 TA 已读不回', 'dailyReplyMax', p.dailyReplyMax, 0, 200, '封'),
    rowNum('TA 每日主动写信上限', '达到上限后当天不再主动发信', 'dailyProactiveMax', p.dailyProactiveMax, 0, 100, '封')
  ])));

  wrap.appendChild(section('主动写信概率', el('div', { class: 'set-card' }, [
    rowPct('主动写信概率下限', '', 'proactivePctMin', p.proactivePctMin),
    rowPct('主动写信概率上限', '', 'proactivePctMax', p.proactivePctMax),
    rowPct('触发概率下限', '触发主动写信的概率下限', 'proactiveTriggerPctMin', p.proactiveTriggerPctMin),
    rowPct('触发概率上限', '触发主动写信的概率上限', 'proactiveTriggerPctMax', p.proactiveTriggerPctMax)
  ])));

  wrap.appendChild(section('写信时长', el('div', { class: 'set-card' }, [
    rowNum('最短写信时间', 'TA 坐在书桌前写这封信花的时间', 'typingMinMin', p.typingMinMin, 0, 9999, '分'),
    rowNum('最长写信时间', '', 'typingMaxMin', p.typingMaxMin, 0, 9999, '分')
  ])));

  wrap.appendChild(section('我寄信后 TA 回信', el('div', { class: 'set-card' }, [
    rowPct('回信概率（下限）', '我寄出一封信后，TA 回信的概率下限', 'letterReplyPctMin', p.letterReplyPctMin),
    rowPct('回信概率（上限）', '上限，须不少于下限', 'letterReplyPctMax', p.letterReplyPctMax),
    rowNum('最短回信时间', '我寄信后 TA 最短过多久才开始写信（不含写信时长）', 'letterReplyDelayMin', p.letterReplyDelayMin, 0, 9999, '分'),
    rowNum('最长回信时间', '上限，须不少于最短', 'letterReplyDelayMax', p.letterReplyDelayMax, 0, 9999, '分')
  ])));

  wrap.appendChild(section('来信内容附加', el('div', { class: 'set-card' }, [
    rowToggle('来信带颜文字', '来信正文句尾有概率追加一个颜文字', 'letterKaomojiEnabled', p.letterKaomojiEnabled),
    rowPct('颜文字附加概率', '只有开关开启时才生效', 'letterKaomojiPct', p.letterKaomojiPct),
    rowToggle('来信带 Emoji', '来信正文里随机位置插入 1~3 个 emoji', 'letterEmojiEnabled', p.letterEmojiEnabled),
    rowPct('Emoji 附加概率', '只有开关开启时才生效', 'letterEmojiPct', p.letterEmojiPct),
    rowToggle('来信夹带表情包', '信纸里多一张从字卡库抽的表情图片', 'letterStickerEnabled', p.letterStickerEnabled),
    rowPct('表情包附加概率', '只有开关开启时才生效', 'letterStickerPct', p.letterStickerPct)
  ])));

  view.appendChild(wrap);
}
