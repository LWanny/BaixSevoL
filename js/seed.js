/* 字卡传信 · 首次使用的预置内容（仅在没有字卡时写入一次） */

import { count, bulkPut } from './store.js';
import { uid, rndInt } from './util.js';

const SEED = {
  '日常': [
    '在的。', '今天过得怎么样？', '我一直在想你说的话', '早点睡，别熬夜',
    '有点想你了', '刚忙完，现在有空', '你说，我听着', '嗯，然后呢？'
  ],
  '情绪': [
    '嗯……', '（沉默）', '其实我有点难过', '别问，问就是没事',
    '今天心情还不错', '有点累，但看到你就好了'
  ],
  '回应': [
    '我懂', '真的吗？', '那挺好的', '陪着你', '别想太多', '换个话题吧',
    '我在', '你也要好好的'
  ],
  '颜文字': [
    '( ˘ω˘ )', '(๑•̀ㅂ•́)و', '(＞﹏＜)', '(・_・;)', '(づ｡◕‿‿◕｡)づ', 'ヽ(￣ω￣〃)ゞ'
  ]
};

export async function seedIfEmpty() {
  if (await count('cards') > 0) return;

  const groups = [];
  const cards = [];
  let order = 0;
  for (const [name, list] of Object.entries(SEED)) {
    const gid = uid();
    groups.push({ id: gid, name, order: order++, enabled: true, createdAt: Date.now() });
    list.forEach((content, i) => {
      cards.push({
        id: uid(),
        groupId: gid,
        content,
        enabled: true,
        count: 0,
        weight: 1,
        order: i,
        kind: /[（）()]{1}|[˘ω•ㅂ＞＜・_｡◕‿づ].*/.test(content) ? 'text' : 'text',
        createdAt: Date.now()
      });
    });
  }
  await bulkPut('groups', groups);
  await bulkPut('cards', cards);
}
