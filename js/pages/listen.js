/* 语听 · 独立软件
   拼音打字整体搬到这里：TA 只用拼音打字说话（逐字母敲无声调拼音 → 落卡显示带声调拼音 + 汉字）。
   消息软件里不再有拼音打字；拼音的全部配置面板也从角色页搬进了本页。 */

import { el, rndInt, chance, uid } from '../util.js';
import { fullPage } from '../shell.js';
import { state, saveRole } from '../state.js';
import { put, all } from '../store.js';
import { toast } from '../ui.js';
import { go } from '../router.js';
import { cfg, saveCfg, randRange, typingDurMs, queuePending } from '../pinyinConfig.js';
import { randomPhrase, probeText, PINYIN_POOL_SIZE, PINYIN_WORD_SIZE, WORD_STATS,
  SLOT_NAMES, builtinTemplates, templateText } from '../pinyin.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= 页面 ================= */

export default async function pageListen(view) {
  const settingsHost = el('div', { class: 'listen-settings hidden' }, [buildPinyinCfg()]);
  fullPage({ back: true, title: '语听', sub: '只用拼音说话', actions: [
    { icon: 'IC-MIO-013', label: '设置', onclick: () => {
      settingsHost.classList.toggle('hidden');
      settingsHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }
  ] });

  const list = el('div', { class: 'listen-list' });
  const typingRow = buildTypingRow();
  typingRow.style.display = 'none';

  const input = el('input', { class: 'listen-in', type: 'text', placeholder: '说点什么…' });
  const send = () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    sendMsg(t);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  const sendBtn = el('button', { class: 'listen-send', text: '发送', onclick: send });

  const bar = el('div', { class: 'listen-bar' }, [input, sendBtn]);
  const wrap = el('div', { class: 'page listen-page' }, [settingsHost, list, typingRow, bar]);
  view.appendChild(wrap);

  /* ---- 数据与渲染 ---- */
  async function reload() {
    const msgs = (await all('listen')).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    list.innerHTML = '';
    for (const m of msgs) list.appendChild(renderMsg(m));
    list.scrollTop = list.scrollHeight;
    return msgs;
  }
  await reload();

  function renderMsg(m) {
    if (m.dir === 'me') {
      return el('div', { class: 'listen-row me' }, [el('div', { class: 'listen-bub me', text: m.text || '' })]);
    }
    if (m.type === 'pinyin') {
      const line = el('div', { class: 'py-line' });
      if (m.pysegs && m.pysegs.length) {
        m.pysegs.forEach((sg, i) => {
          if (i) line.appendChild(document.createTextNode(' '));
          line.appendChild(el('span', { class: sg.m ? 'py-w' : 'py-r', text: sg.pt || sg.p || '' }));
        });
      } else line.textContent = m.pinyin || '';
      return el('div', { class: 'listen-row ta' }, [el('div', { class: 'listen-bub ta' }, [
        el('div', { class: 'content py-card' }, [line, el('div', { class: 'py-text', text: m.text || '' })])
      ])]);
    }
    return el('div', { class: 'listen-row ta' }, [el('div', { class: 'listen-bub ta', text: m.text || '' })]);
  }

  function buildTypingRow() {
    return el('div', { class: 'listen-row ta' }, [el('div', { class: 'listen-bub ta' }, [
      el('div', { class: 'typing hypy' }, [
        el('span', { class: 'typing-l', text: '正在输入' }),
        el('span', { class: 'typing-py' }),
        el('i'), el('i'), el('i')
      ])
    ])]);
  }

  /* ---- 我发送 → TA 用拼音打字回复（排队串行） ---- */
  let chain = Promise.resolve();
  function sendMsg(text) {
    chain = chain.then(async () => {
      await put('listen', { id: 'lm_' + uid(), ts: Date.now(), dir: 'me', type: 'text', text });
      await reload();
      await taReply();
    });
  }

  async function taReply() {
    /* 回复速度与消息软件共用：delayMin（秒）~ delayMax（分钟） */
    const p = state.role.params;
    const lo = Math.max(0, Math.round(Number(p.delayMin) || 0));
    const hi = Math.max(lo, Math.round(Number(p.delayMax) || 0) * 60);
    await wait(rndInt(lo, hi) * 1000);

    const py = randomPhrase();   // 语听里 TA 只用拼音打字，直接按当前配置生成
    await typeOut(py);

    await put('listen', {
      id: 'lm_' + uid(), ts: Date.now(), dir: 'ta', type: 'pinyin',
      text: py.text, pinyin: py.pinyinTone || py.pinyin, pysegs: py.segs || null
    });
    await reload();
  }

  /* ---- 拟真打字：逐音节逐字母敲无声调拼音，typoRate 概率敲错退格，音节间偶尔停顿 ---- */
  async function typeOut(py) {
    const C = cfg();
    const typedEl = typingRow.querySelector('.typing-py');
    typingRow.style.display = '';

    const segs = (py.segs && py.segs.length) ? py.segs : [{ p: py.pinyin || '', t: py.text || '', m: false }];
    const sylls = [];
    for (const sg of segs) for (const syl of String(sg.p || '').split(' ')) if (syl) sylls.push(syl);
    if (!sylls.length) { await wait(300); typingRow.style.display = 'none'; return; }

    const [durLo, durHi] = typingDurMs();
    const target = C.forceRandom ? rndInt(400, 120000) : rndInt(durLo, durHi);
    const chars = sylls.reduce((n, x) => n + x.length, 0) || 1;
    const unit = Math.max(0.15, target / (chars * 112));   // 112 ≈ 字母延迟中位 × 溢出系数
    const KEY = 'abcdefghijklmnopqrstuvwxyz';

    let typed = '';
    for (let k = 0; k < sylls.length; k++) {
      const base = typed ? typed + ' ' : '';
      const syl = sylls[k];
      for (let j = 1; j <= syl.length; j++) {
        typed = base + syl.slice(0, j);
        typedEl.textContent = typed;
        await wait(Math.max(18, Math.round(unit * rndInt(60, 140))));
        const typoPct = C.forceRandom ? rndInt(25, 60) : Math.max(0, Math.min(100, Math.round(Number(C.typoRate) || 0)));
        if (chance(typoPct)) {
          let bad = KEY[rndInt(0, 25)];
          if (syl[j] && bad === syl[j]) bad = KEY[(KEY.indexOf(bad) + 7) % 26];
          typedEl.textContent = typed + bad;
          await wait(rndInt(150, 480));
          typedEl.textContent = typed;                    // 退格
          await wait(rndInt(120, 320));
        }
        if (j === syl.length && k < sylls.length - 1 && chance(35)) await wait(rndInt(120, 450));
      }
    }
    await wait(rndInt(350, 850));   // 打完停一下再落卡
    typingRow.style.display = 'none';
  }
}

/* ================= 拼音打字 · 全局配置面板（自角色页整体搬入） =================
   数据在 pinyinConfig.js（localStorage），每次改动 saveCfg() 即刻落盘；
   语听每次生成/打字都会重新 cfg() 读取 → 改完立即生效。
   语听里 TA 只用拼音说话，故无总开关；「主动联系」随主聊天拼音一起移除。 */

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

  /* ---- 拼音字卡库入口 ---- */
  root.appendChild(el('div', { class: 'set-row' }, [
    el('div', { class: 'set-main' }, [
      el('div', { class: 'set-t', text: '拼音字卡库' }),
      el('div', { class: 'set-s', text: '浏览内置单字/词库 · 分类筛选 · 增删自定义词条' })
    ]),
    el('div', { class: 'set-ctl' }, [el('button', { class: 'btn sm', onclick: () => go('/pinyin-lib') }, ['去管理'])])
  ]));

  /* ---- 最高优先级：全部随机 ---- */
  const forceHost = el('div', { class: 'cfg-force' }, [
    cfgToggle('全部随机', '最高优先级：忽略下面所有概率/区间 —— 字数极端、频繁打错字、秒回或几分钟不回',
      () => C().forceRandom, (v) => { saveCfg({ forceRandom: !!v }); paintOff(); })
  ]);

  /* ---- 面板 1 · 输入习惯 ---- */
  const p1 = el('div');
  const st = WORD_STATS;
  const posN = Object.keys(st.pos).filter((k) => k !== 'other').length;
  p1.appendChild(el('div', { class: 'cfg-stats', text:
    `专属字库 · 单字库 ${PINYIN_POOL_SIZE} 个 · 词 ${PINYIN_WORD_SIZE} 条（单字词 ${st.one} / 双字 ${st.two} / 三字 ${st.three} / 四字+ ${st.four} / 半截话 ${st.frag}）· 词性 ${posN} 类` }));
  p1.appendChild(cfgSlider('打错字 + 退格 %', () => C().typoRate, (v) => saveCfg({ typoRate: v }), 0, 100));
  p1.appendChild(cfgPair('回复一句话字数', '回复时拼音打字一句话的最少/最多字数（每个汉字一个音节），生成时在区间里取点',
    () => C().replyLen, (v) => saveCfg({ replyLen: v }), 1, 40));
  p1.appendChild(cfgRow('回复速度', '收到消息后隔多久开始回复（与「回话」页的设置互通）', []));
  p1.appendChild(cfgSlider('最短（秒）', () => state.role.params.delayMin,
    (v) => { state.role.params.delayMin = v; saveRole(); }, 0, 3600));
  p1.appendChild(cfgSlider('最长（分钟）', () => state.role.params.delayMax,
    (v) => { state.role.params.delayMax = v; saveRole(); }, 0, 999));
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
  p2.appendChild(cfgToggle('句尾语气词', '句尾追加语气词，拼音 UI 会连它的拼音一起显示（如 吧·ba）',
    () => C().useTailWord, (v) => saveCfg({ useTailWord: !!v })));
  p2.appendChild(cfgPair('句尾追加概率 %', '每次生成取点后掷，命中就在句尾追加 ba/ma/呢…',
    () => C().tailRate, (v) => saveCfg({ tailRate: v }), 0, 100));
  p2.appendChild(cfgPair('句首连接词', '句首加「那个 / 然后 / 不过」的概率区间',
    () => C().headRate, (v) => saveCfg({ headRate: v }), 0, 100));

  const panels = el('div', { class: 'cfg-panels' }, [
    fold('输入习惯', '专属字库 · 打错字与退格 · 一句话字数 · 回复速度', p1, true),
    fold('句式与接话', '模板与预设句型 · 句首句尾修饰', p2)
  ]);
  function paintOff() {
    panels.classList.toggle('cfg-off', !!C().forceRandom);
  }
  paintOff();

  root.appendChild(forceHost);
  root.appendChild(buildPreview());
  root.appendChild(panels);
  return root;
}

/* ---- 预览：模拟 TA 的拼音打字（逐字母 + 按当前 typoRate 敲错退格）→ 落卡 ----
   全部读取当前配置（区间/forceRandom），改完设置点一下即可看效果；
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
    const py = randomPhrase();
    stage.appendChild(el('div', { class: 'cv-meta' }, [
      py.madeUp ? el('span', { class: 'pw-tag frag', text: '含生造词' }) : null
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
      if (x.kind === 'miss') return [...x.text].map(() => el('span', { class: 'py-r cv-miss', text: '?' }));
      if (x.kind === 'word') return [el('span', { class: 'py-w', text: x.tone })];
      return [el('span', { class: 'py-r', text: x.tone })];
    }).flatMap((n, i) => (i ? [document.createTextNode(' '), n] : [n]));
    typeAndCard({ text: txt }, { line, text: txt, stream });
    /* 词库试打报告：每个能打的词/字都列出来，缺字标红 → 方便后续补词 */
    const segsRow = el('div', { class: 'cv-segs' }, pr.segs
      .filter((x) => x.kind !== 'punct')
      .map((x) => {
        const kids = [
          el('span', { class: 'cv-seg-t', text: x.text }),
          el('span', { class: 'cv-seg-p', text: x.kind === 'miss'
            ? (x.merged ? `${x.tone} · 词未入库 · 点此补词`
              : x.infer ? `${x.tone} · 单字未入库 · 点此补词` : '打不出 · 点此补词')
            : x.tone })
        ];
        if (x.kind === 'word' && x.pos) kids.push(el('span', { class: 'cv-seg-pos', text: SLOT_NAMES[x.pos] || '其他' }));
        return el('span', {
          class: 'cv-seg ' + (x.kind === 'word' ? 'w' : x.kind === 'miss' ? 'miss' : 'c'),
          title: x.kind === 'miss' ? '点击去补词' : '',
          onclick: x.kind === 'miss'
            ? () => { queuePending([{ text: x.text, py: x.py || null }]); go('/pinyin-lib'); }
            : null
        }, kids);
      }));
    stage.appendChild(el('div', { class: 'cv-cov' }, [
      el('div', { class: 'cv-cov-h', text: pr.missing.length
        ? `词库试打报告 · ${pr.hit}/${pr.total} 字可打，缺 ${pr.missing.length} 字`
        : `词库试打报告 · ${pr.total} 字全部可打` }),
      segsRow,
      pr.missing.length
        ? el('button', { class: 'btn sm', onclick: () => {
          queuePending(pr.segs.filter((x) => x.kind === 'miss')
            .map((x) => ({ text: x.text, py: x.py || null })));
          go('/pinyin-lib');
        } }, ['去拼音字卡库补词'])
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
