/* 角色档案 · 首页（分类入口）
   详细参数拆到子页面：/role/reply /role/moments /role/mailbox /role/call /role/traits */

import { el, compressImage, openFile, rndInt, chance } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { state, saveRole, DEFAULT_PARAMS, roleStatusMeta } from '../state.js';
import { saveMedia, mediaURL } from '../media.js';
import { toast, confirmBox } from '../ui.js';
import { go } from '../router.js';
import { cfg, saveCfg, MOOD_KEYS, randRange, typingDurMs } from '../pinyinConfig.js';
import { PINYIN_POOL_SIZE, PINYIN_WORD_SIZE, WORD_STATS, SLOT_NAMES,
  builtinTemplates, templateText, randomPhrase, pickAnchor, probeText } from '../pinyin.js';

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

  /* ---- 拼音打字（pinyinConfig.js → localStorage，改完立即生效） ---- */
  wrap.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [
      el('div', { class: 'h', text: '拼音打字' }),
      el('div', { class: 'a', text: '字卡库 ›', onclick: () => go('/pinyin-lib') })
    ]),
    buildPinyinCfg()
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

/* ================= 拼音打字 · 全局配置面板 =================
   数据在 pinyinConfig.js（localStorage），每次改动 saveCfg() 即刻落盘；
   pinyin.js / engine.js / scheduler.js 每次生成/打字都会重新 cfg() 读取 → 改完立即生效。
   优先级：全部随机(forceRandom) > 心情(Mood) > 用户各项概率与区间 */
const MOOD_NAMES = { lazy: '敷衍', normal: '平常', chatty: '话唠', warm: '热情', sad: '伤心' };

function cfgRow(name, desc, ctl) {
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-main' }, [
      el('div', { class: 'set-t', text: name }),
      desc ? el('div', { class: 'set-s', text: desc }) : null
    ]),
    (ctl && ctl.length) ? el('div', { class: 'set-ctl' }, ctl) : null
  ]);
}

function cfgToggle(name, desc, get, set) {
  const sw = el('button', { class: 'sw', type: 'button' });
  const paint = () => sw.classList.toggle('on', !!get());
  paint();
  sw.addEventListener('click', () => { set(!get()); paint(); });
  return cfgRow(name, desc, [sw]);
}

/** 单条滑块（range + 数字输入，双改双同步） */
function cfgSlider(label, get, set, min, max) {
  const range = el('input', { class: 'set-range', type: 'range', min: String(min), max: String(max), step: '1' });
  const num = el('input', { class: 'set-num', type: 'number', inputmode: 'numeric', min: String(min), max: String(max), step: '1' });
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const paint = () => { const v = clamp(get()); range.value = String(v); num.value = String(v); };
  const apply = (raw) => { set(clamp(raw)); paint(); };
  range.addEventListener('input', () => apply(range.value));
  num.addEventListener('change', () => apply(num.value));
  paint();
  return el('div', { class: 'cfg-slider' }, [el('span', { class: 'cfg-sl', text: label }), range, num]);
}

/** 上下限成对滑块：下限永远 ≤ 上限；get→[lo,hi]，set(arr) 负责落盘 */
function cfgPair(name, desc, get, set, min, max) {
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const mk = (idx, lb) => {
    const range = el('input', { class: 'set-range', type: 'range', min: String(min), max: String(max), step: '1' });
    const num = el('input', { class: 'set-num', type: 'number', inputmode: 'numeric', min: String(min), max: String(max), step: '1' });
    const paint = () => { const a = get(); const v = clamp(a[idx]); range.value = String(v); num.value = String(v); };
    const apply = (raw) => {
      const a = [clamp(get()[0]), clamp(get()[1])];
      a[idx] = idx === 0 ? Math.min(clamp(raw), a[1]) : Math.max(clamp(raw), a[0]);
      set(a);
      paint();
    };
    range.addEventListener('input', () => apply(range.value));
    num.addEventListener('change', () => apply(num.value));
    paint();
    return el('div', { class: 'cfg-slider' }, [el('span', { class: 'cfg-sl', text: lb }), range, num]);
  };
  return el('div', { class: 'cfg-pair' }, [cfgRow(name, desc, []), mk(0, '下限'), mk(1, '上限')]);
}

/** 折叠面板 */
function fold(title, desc, body, open = false) {
  const head = el('div', { class: 'set-row fold-head' }, [
    el('div', { class: 'set-main' }, [
      el('div', { class: 'set-t', text: title }),
      desc ? el('div', { class: 'set-s', text: desc }) : null
    ]),
    el('div', { class: 'set-ctl' }, [el('span', { class: 'fold-arr', text: '›' })])
  ]);
  const wrap = el('div', { class: 'cfg-fold' + (open ? ' open' : '') }, [
    head,
    el('div', { class: 'cfg-fold-body' }, [el('div', { class: 'cfg-fold-in' }, [body])])
  ]);
  head.addEventListener('click', () => wrap.classList.toggle('open'));
  return wrap;
}

function buildPinyinCfg() {
  const C = () => cfg();
  const root = el('div', { class: 'set-card cfg-root' });

  /* ---- 最高优先级：全部随机 ---- */
  const forceHost = el('div', { class: 'cfg-force' }, [
    cfgToggle('全部随机', '最高优先级：忽略下面所有概率/区间 —— 字数极端、频繁打错字、秒回或几十分钟不回',
      () => C().forceRandom, (v) => { saveCfg({ forceRandom: !!v }); paintOff(); })
  ]);

  /* ---- 面板 1 · 输入习惯（词库/单字/打错字 三个概率区间） ---- */
  const p1 = el('div');
  const st = WORD_STATS;
  const posN = Object.keys(st.pos).filter((k) => k !== 'other').length;
  p1.appendChild(el('div', { class: 'cfg-stats', text:
    `专属字库 · 单字库 ${PINYIN_POOL_SIZE} 个 · 词 ${PINYIN_WORD_SIZE} 条（单字词 ${st.one} / 双字 ${st.two} / 三字 ${st.three} / 四字+ ${st.four} / 半截话 ${st.frag}）· 词性 ${posN} 类` }));
  p1.appendChild(cfgPair('抽完整词拼音', '每次生成在区间里取点，按与「抽单字」的比例决定抽词还是抽单字',
    () => C().wordRatio, (v) => saveCfg({ wordRatio: v }), 0, 100));
  p1.appendChild(cfgPair('抽单字拼音', '与上面的比例决定混合（词 : 单字 ≈ 抽词概率 : 抽单字概率）',
    () => C().singleRatio, (v) => saveCfg({ singleRatio: v }), 0, 100));
  p1.appendChild(cfgPair('打错字 + 退格', '每个字母打错并按退格删除的概率区间',
    () => C().typoRate, (v) => saveCfg({ typoRate: v }), 0, 100));
  p1.appendChild(cfgRow('打完一句的时长',
    '从开打到落卡的总时间：区间取点随机；长句分阶段时按段平摊；预览最多演示 9 秒', []));
  p1.appendChild(cfgSlider('最短（秒）', () => C().typingDuration[0],
    (v) => saveCfg({ typingDuration: [v, C().typingDuration[1]] }), 1, 300));
  p1.appendChild(cfgSlider('最长（分钟）', () => C().typingDuration[1],
    (v) => saveCfg({ typingDuration: [C().typingDuration[0], v] }), 1, 60));

  /* ---- 面板 2 · 句式与接话 ---- */
  const p2 = el('div');
  p2.appendChild(cfgToggle('句式模板', '按「代词 + 动词 + 名词 + 语气」的预设句型填槽',
    () => C().useTemplate, (v) => saveCfg({ useTemplate: !!v })));
  p2.appendChild(cfgPair('模板使用概率 %', '开启后每次生成先取点再掷，命中才用句型',
    () => C().templateRate, (v) => saveCfg({ templateRate: v }), 0, 100));
  p2.appendChild(buildTemplateBox());
  p2.appendChild(cfgToggle('上下文锚点', '把对方话里的实词插进回复接话',
    () => C().useAnchor, (v) => saveCfg({ useAnchor: !!v })));
  p2.appendChild(cfgPair('锚点 · 尾词命中 %', '取对方话里最后一个实词的概率区间',
    () => C().anchorTailRate, (v) => saveCfg({ anchorTailRate: v }), 0, 100));
  p2.appendChild(cfgPair('锚点 · 随机命中 %', '取对方话里随机实词的概率区间',
    () => C().anchorRandomRate, (v) => saveCfg({ anchorRandomRate: v }), 0, 100));
  p2.appendChild(cfgToggle('句尾语气词', '句尾追加语气词，拼音 UI 会连它的拼音一起显示（如 吧·ba）',
    () => C().useTailWord, (v) => saveCfg({ useTailWord: !!v })));
  p2.appendChild(cfgPair('句尾追加概率 %', '每次生成取点后掷，命中就在句尾追加 ba/ma/呢…',
    () => C().tailRate, (v) => saveCfg({ tailRate: v }), 0, 100));
  p2.appendChild(cfgPair('句首连接词', '句首加「那个 / 然后 / 不过」的概率区间',
    () => C().headRate, (v) => saveCfg({ headRate: v }), 0, 100));

  /* ---- 面板 3 · 心情设定（权重区间 + 音节限制，心情优先于底层概率） ---- */
  const p3 = el('div');
  MOOD_KEYS.forEach((k) => {
    p3.appendChild(el('div', { class: 'cfg-mood-h', text: MOOD_NAMES[k] }));
    p3.appendChild(cfgPair('抽中权重概率区间 %', '每次抽心情时在区间里取点再加权',
      () => C().moodWeights[k], (v) => saveCfg({ moodWeights: { ...C().moodWeights, [k]: v } }), 0, 100));
    p3.appendChild(cfgPair('音节数（最短 ~ 最长）', null,
      () => C().moodSyll[k], (v) => saveCfg({ moodSyll: { ...C().moodSyll, [k]: v } }), 1, 16));
  });

  /* ---- 面板 4 · 主动联系（独立于普通回复的配置） ---- */
  const p4 = el('div');
  p4.appendChild(cfgToggle('主动打字', '关闭后 TA 主动联系时不再敲拼音（仍会发普通字卡消息）',
    () => C().enableProactive, (v) => saveCfg({ enableProactive: !!v })));
  p4.appendChild(cfgRow('主动发送间隔', '最短按秒、最长按分钟 —— 如 5 秒 ~ 30 分钟之间随机', []));
  p4.appendChild(cfgSlider('最短（秒）', () => C().proactiveInterval[0],
    (v) => saveCfg({ proactiveInterval: [v, C().proactiveInterval[1]] }), 1, 120));
  p4.appendChild(cfgSlider('最长（分钟）', () => C().proactiveInterval[1],
    (v) => saveCfg({ proactiveInterval: [C().proactiveInterval[0], v] }), 1, 180));
  MOOD_KEYS.forEach((k) => {
    p4.appendChild(cfgPair(`${MOOD_NAMES[k]} · 主动一句话字数`, null,
      () => C().proactiveLen[k], (v) => saveCfg({ proactiveLen: { ...C().proactiveLen, [k]: v } }), 1, 40));
  });

  const panels = el('div', { class: 'cfg-panels' }, [
    fold('输入习惯', '专属字库 · 抽词/抽单字概率 · 打错字与退格', p1, true),
    fold('句式与接话', '模板与预设句型 · 锚点命中 · 句首句尾修饰', p2),
    fold('心情设定', '五种心情的权重概率区间与音节数限制', p3),
    fold('主动联系', '主动打字开关 · 秒~分钟发送间隔 · 心情字数', p4)
  ]);
  function paintOff() { panels.classList.toggle('cfg-off', !!C().forceRandom); }
  paintOff();

  root.appendChild(forceHost);
  root.appendChild(buildPreview());
  root.appendChild(panels);
  return root;
}

/* ---- 预览：模拟 TA 的拼音打字（逐字母 + 按当前 typoRate 敲错退格）→ 落卡 ----
   全部读取当前配置（心情/区间/forceRandom），改完设置点一下即可看效果；
   打字气泡与落卡样式直接复用聊天页的 typing.hypy / py-card，所见即所得。 */
function buildPreview() {
  /* 两种模式：随机句预览（配置驱动） / 感同身受·试打（输入一句话，模拟对方逐字母打出来
     并报告词库能切出哪些词、哪些字打不出来 → 补词线索） */
  let mode = 'random';
  const chipRand = el('div', { class: 'chip on', text: '随机句预览' });
  const chipProbe = el('div', { class: 'chip', text: '感同身受 · 试打' });
  const input = el('input', { class: 'cfg-add-in', type: 'text',
    placeholder: '对方说的话（试接话锚点，留空随机）' });
  const btn = el('button', { class: 'btn sm', type: 'button', text: '预览效果' });
  const stage = el('div', { class: 'cv-stage' });

  let timers = [];
  const stop = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  const setMode = (m) => {
    mode = m;
    chipRand.classList.toggle('on', m === 'random');
    chipProbe.classList.toggle('on', m === 'probe');
    input.placeholder = m === 'random'
      ? '对方说的话（试接话锚点，留空随机）'
      : '输入任意一句话，看词库能打出什么（缺字=补词线索）';
    btn.textContent = m === 'random' ? '预览效果' : '试打';
    stop(); stage.innerHTML = ''; stage.classList.remove('on');
  };
  chipRand.addEventListener('click', () => setMode('random'));
  chipProbe.addEventListener('click', () => setMode('probe'));

  /* 打字动画：逐字符打出（无声调拼音），按当前 typoRate 敲错+退格 → 落卡 */
  const typeAndCard = (py, opts = {}) => {
    const typing = el('div', { class: 'typing hypy' }, [
      el('span', { class: 'typing-l', text: '正在输入' }),
      el('span', { class: 'typing-py' }),
      el('i'), el('i'), el('i')
    ]);
    const typed = typing.querySelector('.typing-py');
    const typingBub = el('div', { class: 'bub ta' }, [typing]);
    const card = el('div', { class: 'bub ta cv-bub' }, [
      el('div', { class: 'content py-card' }, [
        el('div', { class: 'py-line' }, opts.line || []),
        el('div', { class: 'py-text', text: opts.text || py.text || '' })
      ])
    ]);
    card.style.display = 'none';
    stage.appendChild(typingBub);
    stage.appendChild(card);

    const txt = opts.stream || py.pinyin || '';
    const C = cfg();
    const typoPct = C.forceRandom ? rndInt(25, 60) : randRange(C.typoRate, 5);
    /* 总时长读 typingDuration（最短秒~最长分钟取点；forceRandom 走极端）——预览最多演示 9 秒 */
    const [durLo, durHi] = typingDurMs();
    const total = Math.min(C.forceRandom ? rndInt(400, 120000) : rndInt(durLo, durHi), 9000);
    const step = Math.max(18, Math.min(360, Math.round(total / Math.max(1, txt.length))));
    let t = 420;
    for (let i = 0; i < txt.length; i++) {
      if (chance(typoPct)) {
        const wrong = 'abcdefghijklmnopqrstuvwxyz'[rndInt(0, 25)];
        later(() => { typed.textContent += wrong; }, t); t += step;
        later(() => { typed.textContent = typed.textContent.slice(0, -1); }, t); t += Math.round(step * 1.4);
      }
      const ch = txt[i];
      later(() => { typed.textContent += ch; }, t); t += step;
    }
    later(() => { typingBub.style.display = 'none'; card.style.display = ''; }, t + 340);
  };

  /* 模式一：随机句（完整读取当前配置） */
  const playRandom = () => {
    const incoming = input.value.trim();
    const anchor = incoming ? pickAnchor(incoming) : null;
    const py = randomPhrase(anchor);
    stage.appendChild(el('div', { class: 'cv-meta' }, [
      el('span', { class: 'pw-tag pos', text: '心情 · ' + (py.stateLabel || '平常') }),
      anchor ? el('span', { class: 'pw-tag', text: '锚点 · ' + anchor.text }) : null,
      py.madeUp ? el('span', { class: 'pw-tag frag', text: '含生造词 · 发送后补 [dǎ cuò le]' }) : null
    ]));
    const line = (py.segs || []).flatMap((sg, i) => [
      i ? document.createTextNode(' ') : null,
      el('span', { class: sg.m ? 'py-w' : 'py-r', text: sg.pt || sg.p || '' })
    ]);
    typeAndCard(py, { line, text: py.text });
  };

  /* 模式二：感同身受 · 试打（模拟把这句话打出来 + 词库拆解报告） */
  const playProbe = () => {
    const txt = input.value.trim();
    const pr = probeText(txt);
    stage.appendChild(el('div', { class: 'cv-meta' }, [
      el('span', { class: 'pw-tag pos', text: '感同身受 · 模拟对方打字' }),
      el('span', { class: 'pw-tag' + (pr.missing.length ? ' frag' : ''), text: `词库可打 ${pr.hit}/${pr.total} 字` }),
      pr.missing.length ? el('span', { class: 'pw-tag frag', text: '缺字：' + pr.missing.join('、') }) : null
    ]));
    /* 打字流：命中部分打无声调拼音，打不出的字直接打出原字 */
    const stream = pr.segs
      .filter((x) => x.kind !== 'punct')
      .map((x) => (x.kind === 'miss' ? x.text : x.py))
      .join(' ');
    /* 落卡：带调拼音行（词写实、单字常规、缺字标红 ?）+ 原文行 */
    const line = pr.segs.flatMap((x) => {
      if (x.kind === 'punct') return [];
      if (x.kind === 'miss') return [el('span', { class: 'py-r cv-miss', text: '?' })];
      if (x.kind === 'word') return [el('span', { class: 'py-w', text: x.tone })];
      return [el('span', { class: 'py-r', text: x.tone })];
    }).flatMap((n, i) => (i ? [document.createTextNode(' '), n] : [n]));
    typeAndCard({ text: txt }, { line, text: txt, stream });
    /* 词库试打报告：每个能打的词/字都列出来，缺字标红 → 方便后续补词 */
    const segsRow = el('div', { class: 'cv-segs' }, pr.segs
      .filter((x) => x.kind !== 'punct')
      .map((x) => el('span', { class: 'cv-seg ' + (x.kind === 'word' ? 'w' : x.kind === 'miss' ? 'miss' : 'c') }, [
        el('span', { class: 'cv-seg-t', text: x.text }),
        el('span', { class: 'cv-seg-p', text: x.kind === 'miss' ? '打不出' : x.tone })
      ])));
    stage.appendChild(el('div', { class: 'cv-cov' }, [
      el('div', { class: 'cv-cov-h', text: pr.missing.length
        ? `词库试打报告 · ${pr.hit}/${pr.total} 字可打，缺 ${pr.missing.length} 字`
        : `词库试打报告 · ${pr.total} 字全部可打` }),
      segsRow,
      pr.missing.length
        ? el('button', { class: 'btn sm', onclick: () => go('/pinyin-lib') }, ['去拼音字卡库补词'])
        : null
    ]));
  };

  const play = () => {
    if (mode === 'probe' && !input.value.trim()) {
      toast('先输入一句话，比如「我们今晚也试试拼音打字」'); return;
    }
    stop(); stage.innerHTML = ''; stage.classList.add('on');
    (mode === 'random' ? playRandom : playProbe)();
  };

  btn.addEventListener('click', play);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
  return el('div', { class: 'cfg-prev' }, [
    el('div', { class: 'cv-modes' }, [chipRand, chipProbe]),
    el('div', { class: 'cfg-prev-bar' }, [
      el('span', { class: 'cfg-prev-l', text: '预览' }), input, btn
    ]),
    stage
  ]);
}

/* ---- 预设句型管理：内置句型只读展示 + 自定义句型添加/删除 ---- */
function buildTemplateBox() {
  const CODE_BY_CN = Object.fromEntries(Object.entries(SLOT_NAMES).map(([c, n]) => [n, c]));
  const parse = (str) => {
    const tokens = String(str || '').split(/[\s,，、+＋·\-—>›>]+/).filter(Boolean);
    const codes = [];
    for (let t of tokens) {
      if (SLOT_NAMES[t]) codes.push(t);
      else if (CODE_BY_CN[t]) codes.push(CODE_BY_CN[t]);
      else return null;
    }
    return (codes.length >= 2 && codes.length <= 8) ? codes : null;
  };
  const list = el('div', { class: 'cfg-tpl-list' });
  const render = () => {
    list.innerHTML = '';
    for (const t of builtinTemplates()) {
      list.appendChild(el('div', { class: 'cfg-tpl' }, [
        el('span', { class: 'cfg-tpl-x', text: '内置' }),
        el('span', { class: 'cfg-tpl-t', text: t })
      ]));
    }
    (cfg().customTemplates || []).forEach((t, i) => {
      list.appendChild(el('div', { class: 'cfg-tpl' }, [
        el('span', { class: 'cfg-tpl-x own', text: '自定义' }),
        el('span', { class: 'cfg-tpl-t', text: templateText(t) }),
        el('button', { class: 'cfg-tpl-del', text: '✕', onclick: () => {
          saveCfg({ customTemplates: cfg().customTemplates.filter((_, j) => j !== i) });
          render();
        } })
      ]));
    });
  };
  render();

  const inp = el('input', { class: 'cfg-add-in', type: 'text', placeholder: '代词 动词 名词 语气 或 pn vb nn pt' });
  const add = () => {
    const codes = parse(inp.value);
    if (!codes) { toast('句型写法：槽位用空格隔开，如「代词 动词 名词 语气」（2~8 个槽）'); return; }
    saveCfg({ customTemplates: [...(cfg().customTemplates || []), codes] });
    inp.value = '';
    render();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  return el('div', { class: 'cfg-tpl-box' }, [
    el('div', { class: 'cfg-tpl-h', text: '预设句型（内置 + 自定义，抽中模板时从中随机取一条）' }),
    list,
    el('div', { class: 'cfg-add' }, [inp, el('button', { class: 'btn sm', text: '添加', onclick: add })])
  ]);
}

function catCard(title, desc, icon, onclick) {
  return el('div', { class: 'role-cat', onclick }, [
    el('div', { class: 'role-cat-ic' }, [iconImg(icon)]),
    el('div', { class: 'role-cat-t', text: title }),
    el('div', { class: 'role-cat-d', text: desc }),
    el('span', { class: 'role-cat-arrow', text: '›' })
  ]);
}
