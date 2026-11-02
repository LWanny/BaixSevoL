/* 朋友圈参数 · TA 发动态 + 我发布后 TA 的反应 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { state } from '../state.js';
import { setupRoleUi, section } from './roleParts.js';

export default async function pageRoleMoments(view) {
  fullPage({ back: true, title: '朋友圈参数' });
  const p = state.role.params;
  const { rowPct, rowNum, rowToggle } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  wrap.appendChild(section('对方朋友圈', el('div', { class: 'set-card' }, [
    rowToggle('允许 TA 发朋友圈', '关闭后对方不再发动态', 'taPostEnabled', p.taPostEnabled),
    rowPct('主动发朋友圈概率', '每个随机时刻真的发出来的概率', 'taPostPct', p.taPostPct),
    rowNum('每天最少发几条', '未达标时会补发', 'taPostDailyMin', p.taPostDailyMin, 0, 200, '条'),
    rowNum('每天最多发几条', '达到上限当天不再发', 'taPostDailyMax', p.taPostDailyMax, 0, 200, '条'),
    rowNum('发布间隔（最短）', '两次发布之间至少隔多久', 'taPostGapMin', p.taPostGapMin, 1, 9999, '分'),
    rowNum('发布间隔（最长）', '两次发布之间最多隔多久', 'taPostGapMax', p.taPostGapMax, 1, 9999, '分'),
    rowNum('最少使用字卡数', '一条动态最少用几张字卡', 'taPostCardMin', p.taPostCardMin, 1, 999, '张'),
    rowNum('最多使用字卡数', '一条动态最多用几张字卡', 'taPostCardMax', p.taPostCardMax, 1, 999, '张'),
    rowPct('配图概率', '从你上传过的图片里随机取一张', 'taPostImgPct', p.taPostImgPct),
    rowPct('表情包概率', '动态里带一个表情包', 'taPostStickerPct', p.taPostStickerPct),
    rowPct('Emoji 概率', '动态里带一个 emoji', 'taPostEmojiPct', p.taPostEmojiPct),
    rowPct('颜文字概率', '动态里带一个颜文字', 'taPostKaomojiPct', p.taPostKaomojiPct)
  ])));

  wrap.appendChild(section('互动设置（我发布后）', el('div', { class: 'set-card' }, [
    rowPct('TA 点赞概率', '我发完动态后对方来点赞', 'likePct', p.likePct),
    rowPct('TA 评论概率', '我发完动态后对方来评论', 'commentPct', p.commentPct),
    rowPct('回复我的回复概率', '我回复后对方再回一条', 'replyBackPct', p.replyBackPct),
    rowPct('一条评论用多个字卡概率', '否则只用一张字卡', 'multiCardPct', p.multiCardPct),
    rowNum('评论最少字卡数', '一条评论最少几张', 'commentCardMin', p.commentCardMin, 1, 999, '张'),
    rowNum('评论最多字卡数', '一条评论最多几张', 'commentCardMax', p.commentCardMax, 1, 999, '张'),
    rowNum('评论最快（秒）', 'TA 到点后最快过多久发评论', 'commentDelayMinSec', p.commentDelayMinSec, 0, 9999, '秒'),
    rowNum('评论最慢（分）', 'TA 到点后最晚过多久发评论', 'commentDelayMaxMin', p.commentDelayMaxMin, 0, 9999, '分'),
    rowNum('回复最快（秒）', 'TA 到点后最快过多久回复', 'replyDelayMinSec', p.replyDelayMinSec, 0, 9999, '秒'),
    rowNum('回复最慢（分）', 'TA 到点后最晚过多久回复', 'replyDelayMaxMin', p.replyDelayMaxMin, 0, 9999, '分'),
    rowPct('我点赞后 TA 回赞', '我点赞一条动态后，TA 也可能也来点赞那条', 'likeBackPct', p.likeBackPct),
    rowPct('回复表情包概率', '评论里带一个表情包', 'commentEmojiPct', p.commentEmojiPct),
    rowToggle('完全随机模式', '抽卡不看分组与权重', 'momentsPureRandom', p.momentsPureRandom)
  ])));

  view.appendChild(wrap);
}
