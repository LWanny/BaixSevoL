/* 回话参数 · 被动回复 / 拼接 / 主动发送 / 语气动作 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { state } from '../state.js';
import { setupRoleUi, section } from './roleParts.js';

export default async function pageRoleReply(view) {
  fullPage({ back: true, title: '回话参数' });
  const p = state.role.params;
  const { rowPct, rowNum, rowToggle, rowSeg, joinSepRow } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  wrap.appendChild(section('被动回复（TA 回你）', el('div', { class: 'set-card' }, [
    rowNum('回复字卡条数（最少）', '一次回复至少发几条', 'minCount', p.minCount, 1, 999),
    rowNum('回复字卡条数（最多）', '上限，须不少于最少条数', 'maxCount', p.maxCount, 1, 999),
    rowNum('回复速度（最短）', '收到消息后至少等多久', 'delayMin', p.delayMin, 0, 3600, '秒'),
    rowNum('回复速度（最长）', '收到消息后最多等多久', 'delayMax', p.delayMax, 0, 3600, '秒'),
    rowPct('已读不回概率', 'TA 可能不回复你', 'ignorePct', p.ignorePct)
  ])));

  wrap.appendChild(section('字卡拼接', el('div', { class: 'set-card' }, [
    rowPct('拼接概率', '多张字卡拼成一条消息', 'joinPct', p.joinPct),
    rowNum('最少拼接卡数', '一条消息最少拼几张', 'minJoin', p.minJoin, 1, 999),
    rowNum('最多拼接卡数', '一条消息最多拼几张，可自由填写', 'maxJoin', p.maxJoin, 1, 999),
    rowToggle('全部随机模式', '抽卡完全随机，不看分组与权重', 'pureRandom', p.pureRandom),
    rowToggle('随机拼接符号', '开启后每两张字卡之间从下方符号库随机抽一个连接；关闭时固定用空格', 'joinRandomSep', p.joinRandomSep),
    joinSepRow('拼接符号库', '点一下启用 / 停用某个符号；换行默认关闭，避免段落被拆散')
  ])));

  wrap.appendChild(section('主动发送', el('div', { class: 'set-card' }, [
    rowToggle('主动发送', '开启后 TA 会主动找你', 'proactive', p.proactive),
    rowPct('主动发送概率', '每个随机时刻突然发来字卡消息的概率', 'proactivePct', p.proactivePct),
    rowNum('主动间隔（最短）', '两次主动之间至少隔多久', 'proactiveIntervalMin', p.proactiveIntervalMin, 1, 9999, '分'),
    rowNum('主动间隔（最长）', '两次主动之间最多隔多久', 'proactiveIntervalMax', p.proactiveIntervalMax, 1, 9999, '分'),
    rowNum('主动发送条数（最少）', '一次主动至少发几条', 'proactiveMinCount', p.proactiveMinCount, 1, 999),
    rowNum('主动发送条数（最多）', '一次主动最多发几条', 'proactiveMaxCount', p.proactiveMaxCount, 1, 999)
  ])));

  wrap.appendChild(section('语气与动作', el('div', { class: 'set-card' }, [
    rowPct('引用历史消息概率', '回话时引用你前面说过的话', 'quotePct', p.quotePct),
    rowPct('拍一拍触发概率', 'TA 可能拍拍你', 'patPct', p.patPct),
    rowPct('表情包概率', '从字卡库「表情」类抽一张独立发出（不计入回复条数上限）', 'stickerPct', p.stickerPct),
    rowPct('图片概率', '从你上传过的图片里抽一张独立发出（不计入回复条数上限）', 'imagePct', p.imagePct),
    rowPct('语音概率', '从字卡库「语音」类抽一条独立发出（不计入回复条数上限）', 'voicePct', p.voicePct),
    rowPct('Emoji 概率', '在文字消息句尾附加一个 emoji', 'emojiPct', p.emojiPct),
    rowPct('颜文字附加概率', '在文字消息句尾附加一个颜文字', 'kaomojiPct', p.kaomojiPct),
    rowPct('撤回概率', 'TA 可能撤回刚发的消息', 'recallPct', p.recallPct),
    rowToggle('撤回后补发消息', '撤回后再发一条新消息（补发消息不计入回复条数上限）', 'recallRepostEnabled', p.recallRepostEnabled),
    rowPct('撤回补发概率', '开关开启后，真的补发的概率', 'recallRepostPct', p.recallRepostPct),
    rowPct('主动发选择题概率', 'TA 可能主动问你想什么', 'choicePct', p.choicePct)
  ])));

  view.appendChild(wrap);
}
