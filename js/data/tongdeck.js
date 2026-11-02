/* 通牌 · 牌面图鉴数据：塔罗 78 张 + 雷诺曼 40 张
   每张：{ src: 'tarot'|'lenormand', name, sub } */

const MAJOR = ['愚者', '魔术师', '女祭司', '皇后', '皇帝', '教皇', '恋人', '战车', '力量', '隐士',
  '命运之轮', '正义', '倒吊人', '死神', '节制', '恶魔', '塔', '星星', '月亮', '太阳', '审判', '世界'];
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const SUITS = [['权杖', '🪄'], ['圣杯', '🏺'], ['宝剑', '⚔️'], ['星币', '🪙']];
const RANKS = ['王牌', '二', '三', '四', '五', '六', '七', '八', '九', '十', '侍从', '骑士', '王后', '国王'];

const LENORMAND_NAMES = ['骑士', '三叶草', '船', '房子', '树', '云', '蛇', '棺材', '花束', '镰刀',
  '鞭子', '鸟', '孩子', '狐狸', '熊', '星星', '鹳', '狗', '塔', '花园',
  '山', '岔路', '老鼠', '心', '戒指', '书', '信', '绅士', '女士', '百合',
  '太阳', '月亮', '钥匙', '鱼', '锚', '十字架', '时钟', '桥', '骰子', '面具'];

export const TAROT = (() => {
  const list = [];
  MAJOR.forEach((name, i) => list.push({ src: 'tarot', name, sub: ROMAN[i] }));
  SUITS.forEach(([suit, mark]) => {
    RANKS.forEach((r) => list.push({ src: 'tarot', name: suit + '·' + r, sub: mark }));
  });
  return list;   // 22 + 56 = 78
})();

export const LENORMAND = LENORMAND_NAMES.map((name, i) => ({ src: 'lenormand', name, sub: (i + 1) + '号' }));
