/* 字卡传信 · 拼音打字
   TA 不翻字卡库，而是一个音节一个音节地敲拼音、再挑字组词，最后把拼音和字一起发出来。
   纯本地规则 + 随机（无任何 AI/网络依赖）：
   1. 词库优先：1200+ 高频双字/三字词（data/pinyinwords.js），70% 直接抽词、30% 抽单字；
   2. 句式模板：按 [代词]+[动词]+[名词]+[语气] 之类预设句型填槽，句尾高概率加语气词、句首高概率加连接词；
   3. 上下文锚点：anchorFrom() 从对方的话里取一个实词拼音，随机插进生成串里，保证能接上话；
   4. 拼音转汉字走「音节级最长匹配」——词库能接上就组词，接不上才退回单字映射。 */

import { chance, rndInt, pick } from './util.js';
import { WORD_POOL } from './data/pinyinwords.js';

/* 常用字 + 带声调拼音（多音字只保留最常见读音） */
const RAW = `我 wǒ
你 nǐ
他 tā
她 tā
它 tā
们 men
的 de
了 le
是 shì
在 zài
有 yǒu
和 hé
就 jiù
不 bù
人 rén
都 dōu
一 yī
个 gè
上 shàng
也 yě
很 hěn
到 dào
说 shuō
要 yào
去 qù
会 huì
没 méi
看 kàn
好 hǎo
自 zì
天 tiān
那 nà
这 zhè
能 néng
下 xià
想 xiǎng
知 zhī
道 dào
只 zhǐ
中 zhōng
里 lǐ
来 lái
过 guò
多 duō
少 shǎo
大 dà
小 xiǎo
高 gāo
新 xīn
老 lǎo
前 qián
后 hòu
时 shí
分 fēn
年 nián
月 yuè
日 rì
今 jīn
明 míng
早 zǎo
晚 wǎn
夜 yè
午 wǔ
春 chūn
夏 xià
秋 qiū
冬 dōng
风 fēng
雨 yǔ
雪 xuě
云 yún
山 shān
水 shuǐ
河 hé
海 hǎi
花 huā
草 cǎo
树 shù
木 mù
林 lín
鸟 niǎo
鱼 yú
狗 gǒu
猫 māo
马 mǎ
牛 niú
羊 yáng
虎 hǔ
兔 tù
米 mǐ
饭 fàn
菜 cài
茶 chá
酒 jiǔ
糖 táng
甜 tián
苦 kǔ
酸 suān
辣 là
香 xiāng
臭 chòu
吃 chī
喝 hē
睡 shuì
醒 xǐng
走 zǒu
跑 pǎo
飞 fēi
坐 zuò
站 zhàn
躺 tǎng
听 tīng
读 dú
写 xiě
画 huà
唱 chàng
跳 tiào
笑 xiào
哭 kū
等 děng
找 zhǎo
买 mǎi
卖 mài
给 gěi
拿 ná
放 fàng
开 kāi
关 guān
推 tuī
拉 lā
抱 bào
打 dǎ
碰 pèng
摸 mō
记 jì
忘 wàng
懂 dǒng
学 xué
问 wèn
答 dá
教 jiāo
帮 bāng
陪 péi
聊 liáo
玩 wán
做 zuò
干 gàn
用 yòng
试 shì
换 huàn
改 gǎi
停 tíng
动 dòng
静 jìng
快 kuài
慢 màn
轻 qīng
重 zhòng
远 yuǎn
近 jìn
深 shēn
浅 qiǎn
宽 kuān
窄 zhǎi
冷 lěng
热 rè
暖 nuǎn
凉 liáng
亮 liàng
暗 àn
黑 hēi
白 bái
红 hóng
黄 huáng
蓝 lán
绿 lǜ
紫 zǐ
灰 huī
粉 fěn
真 zhēn
假 jiǎ
对 duì
错 cuò
坏 huài
美 měi
丑 chǒu
难 nán
易 yì
忙 máng
闲 xián
累 lèi
饿 è
渴 kě
困 kùn
病 bìng
疼 téng
怕 pà
急 jí
生 shēng
死 sǐ
活 huó
爱 ài
喜 xǐ
怒 nù
悲 bēi
心 xīn
眼 yǎn
耳 ěr
口 kǒu
手 shǒu
脚 jiǎo
头 tóu
脸 liǎn
身 shēn
背 bèi
腰 yāo
腿 tuǐ
血 xuè
肉 ròu
骨 gǔ
家 jiā
门 mén
窗 chuāng
床 chuáng
桌 zhuō
椅 yǐ
灯 dēng
书 shū
笔 bǐ
纸 zhǐ
包 bāo
钱 qián
车 chē
船 chuán
路 lù
街 jiē
桥 qiáo
城 chéng
村 cūn
店 diàn
校 xiào
班 bān
课 kè
题 tí
字 zì
词 cí
话 huà
语 yǔ
声 shēng
音 yīn
歌 gē
舞 wǔ
影 yǐng
图 tú
信 xìn
网 wǎng
电 diàn
机 jī
表 biǎo
钟 zhōng
线 xiàn
点 diǎn
面 miàn
边 biān
角 jiǎo
圆 yuán
方 fāng
短 duǎn
粗 cū
细 xì
厚 hòu
薄 báo
净 jìng
脏 zāng
旧 jiù
同 tóng
别 bié
各 gè
每 měi
谁 shéi
什 shén
怎 zěn
为 wèi
因 yīn
所 suǒ
以 yǐ
但 dàn
而 ér
或 huò
还 hái
又 yòu
已 yǐ
正 zhèng
刚 gāng
才 cái
最 zuì
更 gèng
太 tài
挺 tǐng
蛮 mán
常 cháng
总 zǒng
二 èr
三 sān
四 sì
五 wǔ
六 liù
七 qī
八 bā
九 jiǔ
十 shí
百 bǎi
千 qiān
万 wàn
零 líng
第 dì
次 cì
遍 biàn
回 huí
趟 tàng
份 fèn
条 tiáo
张 zhāng
片 piàn
块 kuài
颗 kē
粒 lì
双 shuāng
群 qún
堆 duī
排 pái
列 liè`;

const POOL = RAW.split('\n').map((line) => {
  const [c, p] = line.trim().split(/\s+/);
  return { c, p };
}).filter((x) => x.c && x.p);

/* ---------- 声调归一：单字表带声调、词库无声调，统一转无声调（贴近真实敲键） ---------- */
const TONE_MAP = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i', ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v',
  ň: 'n', ń: 'n', ǹ: 'n', ḿ: 'm'
};
const stripTones = (s) => s.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜňńǹḿ]/g, (ch) => TONE_MAP[ch] || ch);

/* 需求1 · 无声调音节 → 带调音节：打字过程显示无声调（贴近真实敲键），
   打完落卡时用它把拼音还原成带声调的一行 */
const TONE_OF = new Map();
for (const x of POOL) {
  const k = stripTones(x.p);
  if (!TONE_OF.has(k)) TONE_OF.set(k, x.p);
}
/* 补充声调表：332 单字表没收录、但词库会用到的音节（取最常见读音；
   a/o/me/ne 等本来就是轻声，保持无调） */
const TONE_EXTRA = {
  ao: 'ào', ben: 'běn', beng: 'bèng', bo: 'bō', ca: 'cā', can: 'cán', cang: 'cáng',
  ce: 'cè', chai: 'chái', chao: 'chāo', chen: 'chén', chong: 'chóng', chu: 'chū',
  cong: 'cóng', dai: 'dài', dang: 'dāng', diao: 'diào', ding: 'dìng', en: 'ēn',
  fa: 'fā', fu: 'fù', gong: 'gōng', gua: 'guā', guai: 'guǎi', guang: 'guǎng',
  gui: 'guī', ha: 'hā', han: 'hán', hang: 'háng', heng: 'hēng', jian: 'jiàn',
  ju: 'jù', juan: 'juān', jue: 'jué', jun: 'jūn', ka: 'kǎ', kang: 'kāng', kao: 'kǎo',
  ken: 'kěn', kong: 'kōng', kua: 'kuā', kuang: 'kuàng', lia: 'liǎ', lun: 'lùn',
  luo: 'luò', meng: 'méng', miao: 'miào', nai: 'nǎi', nang: 'náng', nao: 'nǎo',
  nar: 'nǎr', nei: 'nèi', niang: 'niáng', nong: 'nóng', nuo: 'nuò', nv: 'nǚ',
  ou: 'ǒu', pang: 'páng', pi: 'pí', piao: 'piào', pin: 'pǐn', ping: 'píng',
  po: 'pō', pu: 'pǔ', qiang: 'qiáng', qie: 'qiě', qin: 'qīn', quan: 'quán',
  que: 'què', ran: 'rán', rang: 'rǎng', rong: 'róng', ru: 'rù', ruan: 'ruǎn',
  sai: 'sài', sao: 'sǎo', se: 'sè', sha: 'shā', shai: 'shǎi', she: 'shè',
  shua: 'shuā', shuai: 'shuài', shun: 'shùn', song: 'sòng', sou: 'sōu', su: 'sù',
  sui: 'suì', tan: 'tán', tao: 'táo', te: 'tè', tie: 'tiē', tuo: 'tuō',
  wa: 'wā', wai: 'wài', wawa: 'wá wa', xiu: 'xiū', xu: 'xǔ', xuan: 'xuǎn',
  ya: 'yá', yo: 'yō', za: 'zá', zan: 'zán', ze: 'zé', zeng: 'zēng', zhou: 'zhōu',
  zhu: 'zhū', zhuan: 'zhuān', zhuang: 'zhuāng', zhui: 'zhuī', zhun: 'zhǔn', zu: 'zǔ'
};
for (const [k, v] of Object.entries(TONE_EXTRA)) if (!TONE_OF.has(k)) TONE_OF.set(k, v);
const toTone = (syl) => TONE_OF.get(syl) || syl;
const withTone = (pyStr) => String(pyStr || '').split(' ').filter(Boolean).map(toTone).join(' ');

/* 单字池（无声调）＋ 音节/汉字索引 */
const CHARS = POOL.map((x) => ({ c: x.c, p: stripTones(x.p) }));
const CHAR_BY_PY = new Map();
const CHAR_BY_TEXT = new Map();
for (const x of CHARS) {
  if (!CHAR_BY_PY.has(x.p)) CHAR_BY_PY.set(x.p, x.c);
  if (!CHAR_BY_TEXT.has(x.c)) CHAR_BY_TEXT.set(x.c, x.p);
}

/* ---------- 词库索引：拼音串 → 词（音节级最长匹配用）、汉字 → 词（锚点提取用） ---------- */
const WORD_MAP = new Map();
const TEXT_MAP = new Map();
let MAX_SYL = 1;      // 词库最长音节数
let MAX_TXT = 1;      // 词库最长汉字数
for (const w of WORD_POOL) {
  if (!WORD_MAP.has(w.py)) WORD_MAP.set(w.py, w);
  if (!TEXT_MAP.has(w.text)) TEXT_MAP.set(w.text, w);
  const n = w.py.split(' ').length;
  if (n > MAX_SYL) MAX_SYL = n;
  if (w.text.length > MAX_TXT) MAX_TXT = w.text.length;
}

/* 按词性分池（句式模板选槽用） */
const POOLS = { pn: [], tm: [], cj: [], dv: [], pt: [], vb: [], nn: [], aj: [] };
for (const w of WORD_POOL) if (POOLS[w.pos]) POOLS[w.pos].push(w);

/* ---------- 拼音句式模板（槽位 = 词性，随机抽一个后逐槽填词） ---------- */
const TEMPLATES = [
  ['pn', 'vb', 'nn', 'pt'],   // wo xiang chi fan a  → 我想吃饭啊
  ['cj', 'pn', 'aj', 'pt'],   // ran hou ni hao lei ma → 然后你好累吗
  ['pn', 'vb', 'pt'],         // wo xiang shui le
  ['pn', 'nn', 'pt'],         // wo chi fan le
  ['cj', 'pn', 'vb', 'nn'],
  ['tm', 'pn', 'vb', 'pt'],   // jin tian wo xiang shui a
  ['pn', 'dv', 'aj', 'pt'],
  ['cj', 'pn', 'aj', 'pt'],
  ['pn', 'vb', 'nn', 'nn'],
  ['tm', 'cj', 'pn', 'vb']
];

/* 高频语气词（句尾 80% 追加）与高频连接词（句首 65% 追加） */
const MOODS = [
  { py: 'ba', text: '吧' }, { py: 'ma', text: '吗' }, { py: 'a', text: '啊' },
  { py: 'ne', text: '呢' }, { py: 'de', text: '的' }, { py: 'le', text: '了' }
];
const CONNECTORS = [
  { py: 'na ge', text: '那个' }, { py: 'ran hou', text: '然后' },
  { py: 'suo yi', text: '所以' }, { py: 'bu guo', text: '不过' }
];

/* ---------- 需求3 · 心情状态：每次生成先抽一个状态，决定长度/语气/断句节奏 ---------- */
const STATES = [
  { key: 'normal', label: '平常', w: 30 },
  { key: 'lazy', label: '敷衍', w: 18 },   // 拼音最多 3 个音节
  { key: 'chatty', label: '话唠', w: 18 }, // 强制随机长句 + 更密的断句
  { key: 'warm', label: '热情', w: 18 },   // 语气词/连接词几乎必出、句子偏长
  { key: 'sad', label: '伤心', w: 16 }     // 短句、少连接词、多叹气语气
];
function drawState() {
  const total = STATES.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of STATES) { r -= x.w; if (r <= 0) return x; }
  return STATES[0];
}

/* ---------- 上下文锚点：从对方的话里抽「最后一个实词」（70% 尾词 / 30% 随机命中） ---------- */
export function anchorFrom(text) {
  if (!text) return null;
  const s = String(text);
  const hits = [];
  for (let i = 0; i < s.length;) {
    let found = null;
    for (let len = Math.min(MAX_TXT, s.length - i); len >= 2; len--) {
      const w = TEXT_MAP.get(s.substr(i, len));
      if (w) { found = w; break; }
    }
    if (found) { hits.push(found); i += found.text.length; } else i++;
  }
  if (hits.length) return chance(70) ? hits[hits.length - 1] : pick(hits);
  /* 兜底：最后一个汉字的拼音（单字表里有才收） */
  const m = s.match(/[\u4e00-\u9fa5]/g);
  if (m) {
    const ch = m[m.length - 1];
    const py = CHAR_BY_TEXT.get(ch);
    if (py) return { py, text: ch };
  }
  return null;
}

/** 随机拼一句（anchor 可选：对方上一句话里的实词拼音，会被强制插进句中）
    需求3：先抽心情状态（敷衍/平常/话唠/热情/伤心），状态决定长度、语气与断句密度。
    返回 { text, pinyin, pinyinTone, segs, parts, state, stateLabel, madeUp }
    - segs：分段 [{p, t, pt, m}]，p=无声调（打字过程显示）、pt=带声调（落卡显示）、m=词库命中
    - parts：按标点切成的小句（分阶段逐句发送用），每段自带 text/pinyin/pinyinTone/segs
    - madeUp：存在词库接不上的「生造词」段 → engine 会补一句 [dǎ cuò le] */
export function randomPhrase(anchor) {
  const st = drawState();          // 需求3 · 心情状态
  const pieces = [];
  let tpl = null;
  if (st.key !== 'chatty' && chance(55)) {
    /* 句式模板：按 [代词]+[动词]+[名词]+[语气] 之类预设句型填槽 */
    tpl = pick(TEMPLATES);
    for (const slot of tpl) {
      const w = pick(POOLS[slot]);
      pieces.push({ py: w.py, text: w.text });
    }
  } else {
    /* 自由拼：70% 抽完整词拼音、30% 抽单字（允许重复，取消同句不重复限制） */
    let n;
    if (st.key === 'chatty') n = rndInt(8, 13);            // 话唠：强制随机长句
    else if (st.key === 'lazy') n = rndInt(1, 2);           // 敷衍：能少打就少打
    else if (st.key === 'warm') n = chance(45) ? rndInt(2, 3) : rndInt(4, 6);
    else if (st.key === 'sad') n = chance(60) ? rndInt(2, 3) : rndInt(4, 5);
    else n = chance(58) ? rndInt(2, 3) : rndInt(4, 6);
    const wordPct = st.key === 'chatty' ? 75 : 70;
    for (let k = 0; k < n; k++) {
      if (chance(wordPct)) {
        const w = pick(WORD_POOL);
        pieces.push({ py: w.py, text: w.text });
      } else {
        const { c, p } = pick(CHARS);
        pieces.push({ py: p, text: c });
      }
    }
  }
  /* 开头高概率加连接词（模板本身以连接词开头则不重复加） */
  const connPct = st.key === 'warm' ? 78 : st.key === 'sad' ? 45 : st.key === 'lazy' ? 0 : 65;
  if (!(tpl && tpl[0] === 'cj') && chance(connPct)) {
    const c = pick(CONNECTORS);
    pieces.unshift({ py: c.py, text: c.text });
  }
  /* 锚点：把对方话里的实词强制插进随机位置，保证能接上话 */
  let anchorIdx = -1;
  if (anchor && anchor.py) {
    anchorIdx = rndInt(0, pieces.length);
    pieces.splice(anchorIdx, 0, { py: anchor.py, text: anchor.text });
  }
  /* 结尾高概率加语气词（模板本身以语气词收尾则不重复加） */
  const moodPct = st.key === 'warm' ? 95 : st.key === 'sad' ? 90 : st.key === 'lazy' ? 40 : 80;
  if (!(tpl && tpl[tpl.length - 1] === 'pt') && chance(moodPct)) {
    const m = pick(MOODS);
    pieces.push({ py: m.py, text: m.text });
  }
  if (!pieces.length) {
    const w = pick(WORD_POOL);
    pieces.push({ py: w.py, text: w.text });
  }

  /* 扁平化成音节序列（附带已知汉字，供未命中时兜底） */
  const sylls = [];
  const known = [];
  for (const pc of pieces) {
    const ss = pc.py.split(' ');
    for (let i = 0; i < ss.length; i++) {
      sylls.push(ss[i]);
      known.push(pc.text[i] || CHAR_BY_PY.get(ss[i]) || pc.text || '字');
    }
  }

  /* 需求3 · 敷衍状态：拼音最多 3 个音节——以锚点为窗口裁剪，锚点音节永远保留 */
  if (st.key === 'lazy' && sylls.length > 3) {
    let s = 0;
    let e = 3;
    if (anchorIdx >= 0) {
      let a0 = 0;
      for (let k = 0; k < anchorIdx; k++) a0 += pieces[k].py.split(' ').length;
      const aLen = pieces[anchorIdx].py.split(' ').length;
      s = a0;
      e = a0 + Math.min(aLen, 3);
      let room = 3 - (e - s);
      const pre = Math.min(room, s);
      s -= pre;
      room -= pre;
      e = Math.min(sylls.length, e + room);
      if (e - s < 3 && e < sylls.length) e = Math.min(sylls.length, s + 3);
    }
    const keptS = sylls.slice(s, e);
    const keptK = known.slice(s, e);
    sylls.length = 0; sylls.push(...keptS);
    known.length = 0; known.push(...keptK);
  }

  /* 音节级最长匹配重组：词库优先组词，匹配不到才退回单字（保证可解析、无死循环） */
  const segs = [];
  let i = 0;
  while (i < sylls.length) {
    let hit = null;
    let hitLen = 0;
    for (let len = Math.min(MAX_SYL, sylls.length - i); len >= 1; len--) {
      const key = sylls.slice(i, i + len).join(' ');
      const w = WORD_MAP.get(key);
      if (w) { hit = { p: key, t: w.text, pt: withTone(key), m: true }; hitLen = len; break; }
    }
    if (hit) { segs.push(hit); i += hitLen; }
    else { segs.push({ p: sylls[i], t: known[i], pt: toTone(sylls[i]), m: false }); i++; }
  }

  /* 需求5 · 断句与节奏：长句按小句补标点（逗号为主、偶尔句号），供 engine 分阶段逐句发送 */
  const SPLIT_PUNCT = /[，。！？…~～、；;!?]$/;
  if (sylls.length >= 6 && segs.length >= 3) {
    const clauseProb = st.key === 'chatty' ? 70 : st.key === 'sad' ? 40 : 48;
    let acc = 0;
    let sylSeen = 0;
    const totalSyl = sylls.length;
    for (let k = 0; k < segs.length; k++) {
      const n = segs[k].p ? segs[k].p.split(' ').filter(Boolean).length : 0;
      acc += n;
      sylSeen += n;
      const remain = totalSyl - sylSeen;
      if (k < segs.length - 1 && remain >= 2 && acc >= 3 && chance(clauseProb)) {
        segs[k].t += chance(30) ? pick(['。', '！', '？']) : '，';
        acc = 0;
      }
    }
  }

  /* 按标点切成小句（需求5 · 分阶段发送的最小单位） */
  const parts = [];
  let cur = [];
  for (const sg of segs) {
    cur.push(sg);
    if (SPLIT_PUNCT.test(sg.t)) { parts.push(cur); cur = []; }
  }
  if (cur.length) parts.push(cur);
  const toPart = (g) => ({
    text: g.map((x) => x.t).join(''),
    pinyin: g.map((x) => x.p).join(' '),
    pinyinTone: g.map((x) => x.pt).join(' '),
    segs: g
  });

  return {
    text: segs.map((s) => s.t).join(''),
    pinyin: segs.map((s) => s.p).join(' '),
    pinyinTone: segs.map((s) => s.pt).join(' '),
    segs,
    parts: parts.map(toPart),
    state: st.key,
    stateLabel: st.label,
    madeUp: segs.some((s) => !s.m)   // 需求4：词库接不上的「生造词」
  };
}

/** 单字池大小，设置页用来提示「能打出多少字」 */
export const PINYIN_POOL_SIZE = POOL.length;
/** 词库大小 */
export const PINYIN_WORD_SIZE = WORD_POOL.length;
