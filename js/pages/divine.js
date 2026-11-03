/* 占卜模块 · 交互页
   流程：选体系 → 选牌阵 → 起意 → 洗牌/投掷 → 翻牌 → 解读 → 补牌 / 追问
   所有结果由本站代码在本地随机生成，不联网；解读口径可切换「解读牌意 / 传达信息」。 */

import { el, uid, pick, rndInt, fmtDateTime, downloadBlob, compressImage, openFile } from '../util.js';
import { iconImg } from '../icons.js';
import { normalPage } from '../shell.js';
import { all, put, del, kvGet, kvSet } from '../store.js';
import { actionSheet, alertBox, confirmBox, toast, sheet } from '../ui.js';
import { SYSTEMS, TAROT, LENORMAND, PLANETS, SIGNS, HOUSES, SPREADS, SHUFFLES } from '../data/divination.js';
import { eligible, drawCards } from '../engine.js';
import { addMessage } from '../scheduler.js';
import { state } from '../state.js';
import { imgEl, saveMedia, delMedia } from '../media.js';

const SYSTEM_ICON = { tarot: 'IC-DIV-002', lenormand: 'IC-DIV-003', astro: 'IC-DIV-004' };
const SYSTEM_TAG = { tarot: '象征之语', lenormand: '直白之言', astro: '星轨落定' };

/** 体系副标题：牌数 / 骰数 + 一句定位（自定义牌面会一并计入） */
function systemSub(id) {
  if (id === 'astro') return '3 骰 · ' + SYSTEM_TAG.astro;
  return deckFor(id).length + ' 张 · ' + SYSTEM_TAG[id];
}

let view = null;
let picker = null;        // 当前的卡片轮播
let sess = null;          // 当前这次占卜
let stage = 'system';     // system | spread | intent | shuffle | board
let customSpreads = [];   // 用户补充的牌阵
let customCards = [];     // 用户补充的牌面
let cardBacks = { tarot: null, lenormand: null };   // 各体系牌背 imgId（此牌组所有牌共用）
let fabOff = null;        // 悬浮按钮的清理句柄

export default async function pageDivine(v) {
  view = v;
  if (fabOff) window.removeEventListener('hashchange', fabOff);
  fabOff = () => removeFab();
  window.addEventListener('hashchange', fabOff);
  normalPage('divine', {
    back: true,
    title: '占卜',
    sub: '本地随机 · 仅供娱乐与自我梳理',
    actions: [
      { icon: 'IC-DIV-002', label: '图鉴', onclick: () => go('/decks') },
      { icon: 'IC-DIV-008', label: '记录', onclick: showHistory },
      { icon: 'IC-DIV-009', label: '自定义', onclick: customMenu }
    ]
  });
  customSpreads = await kvGet('customSpreads', []) || [];
  customCards = await kvGet('customCards', []) || [];
  cardBacks = Object.assign({ tarot: null, lenormand: null }, await kvGet('divineCardBacks', {})) || cardBacks;
  sess = null; stage = 'system';   // 每次进占卜页都从「选类」开始，不沿用上次的解读态
  render();
}

import { register, go } from '../router.js';

/* ---------------- 牌面图鉴（独立路由 /decks） ---------------- */
register({
  '/decks': async () => {
  const view = document.getElementById('view');
  view.innerHTML = '';
  normalPage('decks', {
    back: true, title: '牌面图鉴', sub: '塔罗 · 雷诺曼 · 占星骰 · 我的牌组',
    actions: [
      { icon: 'IC-DIV-006', label: '牌背', onclick: () => backSheet() },
      { icon: 'IC-DIV-009', label: '批量导入', onclick: () => batchImportDialog() },
      { icon: 'IC-DIV-007', label: '新建', onclick: () => cardForm() }
    ]
  });

  const customSpreads = await kvGet('customSpreads', []) || [];
  let customCards = (await kvGet('customCards', []) || []).slice();
  cardBacks = Object.assign({ tarot: null, lenormand: null }, await kvGet('divineCardBacks', {})) || cardBacks;

  let tab = 'tarot';
  let myDecks = await kvGet('divineDecks', []) || [];   // 自定义牌组（后续加的也进图鉴）
  const tabRow = el('div', { class: 'row', style: { gap: '6px', padding: '8px 14px', position: 'sticky', top: '0', background: 'var(--bg)', zIndex: '3', borderBottom: '1px solid var(--line)', overflowX: 'auto' } });
  const list = el('div', { id: 'deck-grid', style: 'padding:10px 12px 30px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;' });

  function tabDefs() {
    return [
      { key: 'tarot', label: '塔罗 78' },
      { key: 'lenormand', label: '雷诺曼 36' },
      { key: 'astro', label: '占星骰 36' },
      ...myDecks.map((d) => ({ key: 'deck:' + d.id, label: d.name }))
    ];
  }

  function drawTab() {
    tabRow.innerHTML = '';
    const defs = tabDefs();
    if (!defs.some((t) => t.key === tab)) tab = 'tarot';   // 牌组被删后回退
    defs.forEach(({ key, label }) => {
      const chip = el('div', {
        class: 'chip' + (tab === key ? ' on' : ''), text: label,
        onclick: () => { tab = key; drawTab(); paint(); }
      });
      tabRow.appendChild(chip);
    });
  }

  function paint() {
    list.innerHTML = '';
    if (tab === 'astro') { paintAstro(); return; }
    if (tab.startsWith('deck:')) { paintDeck(tab.slice(5)); return; }
    const deck = deckFor(tab);
    deck.forEach((c) => {
      const hasOverride = customCards.some((o) => o.id === c.id && o.override);
      const isPureCustom = customCards.some((o) => o.id === c.id && !o.override);   // 纯新增 custom（同名不会进 deckFor）
      // 同名 override 会替换进 deckFor，纯新增 custom 如果 system 匹配也会进 deckFor 的 added 部分
      const node = el('div', {
        class: 'dk-cell',
        onclick: () => openDeckCard(c)
      }, [
        c.imgId
          ? el('div', { class: 'dk-thumb', style: { background: '#fff' } }, [imgEl(c.imgId, 'dk-img')])
          : el('div', { class: 'dk-thumb dk-empty' }, [iconImg(tab === 'tarot' ? 'IC-DIV-002' : 'IC-DIV-003')]),
        el('div', { class: 'dk-name', text: c.name }),
        hasOverride ? el('div', { class: 'dk-tag tag-ov', text: '已覆盖' }) : null
      ]);
      list.appendChild(node);
    });
    // 纯新增 customCards（没有 override 且不在 base 里），如果 tab 匹配也展示
    const pureCustoms = customCards.filter((o) => !o.override && o.system === tab);
    const shownIds = new Set(deck.map((c) => c.id));
    pureCustoms.filter((o) => !shownIds.has(o.id)).forEach((c) => {
      const node = el('div', { class: 'dk-cell', onclick: () => openDeckCard(c) }, [
        c.imgId
          ? el('div', { class: 'dk-thumb', style: { background: '#fff' } }, [imgEl(c.imgId, 'dk-img')])
          : el('div', { class: 'dk-thumb dk-empty' }, [iconImg(tab === 'tarot' ? 'IC-DIV-002' : 'IC-DIV-003')]),
        el('div', { class: 'dk-name', text: c.name }),
        el('div', { class: 'dk-tag tag-add', text: '我加的' })
      ]);
      list.appendChild(node);
    });
  }

  /** 在图鉴里打开一张卡 —— 可能是内置 / override / 纯新增 */
  function openDeckCard(card) {
    // 先 reload customCards（可能上次别处改过）
    kvGet('customCards', []).then((cc) => {
      customCards = cc.slice();
      paint();
      // 找 override 或 builtin
      const override = customCards.find((o) => o.id === card.id && o.override);
      const builtin = (tab === 'tarot' ? TAROT : LENORMAND).find((x) => x.id === card.id);
      cardForm(override || builtin || card);
      // sheet 关闭后刷新页面
      const tick = setInterval(() => {
        if (!document.querySelector('#layer-root .sheet')) {
          clearInterval(tick);
          kvGet('customCards', []).then((cc) => {
            customCards = cc.slice();
            paint();
          });
        }
      }, 200);
    });
  }

  /* ---------- 占星骰页签：行星 / 星座 / 宫位 三组，点面编辑（存 customCards 覆盖） ---------- */
  const ASTRO_GROUPS = [
    ['行星', PLANETS, '🪐'],
    ['星座', SIGNS, '♈'],
    ['宫位', HOUSES, '🏠']
  ];
  function astroOverride(face) {
    return customCards.find((o) => o.override && o.system === 'astro' && o.cardKey === face.id) || null;
  }
  function paintAstro() {
    for (const [gname, arr, sym] of ASTRO_GROUPS) {
      list.appendChild(el('div', { class: 'dk-group', text: `${gname} · ${arr.length}` }));
      arr.forEach((face) => {
        const ov = astroOverride(face);
        const node = el('div', { class: 'dk-cell', onclick: () => astroForm(face) }, [
          el('div', { class: 'dk-thumb dk-empty' }, [el('span', { class: 'dk-astro-sym', text: sym })]),
          el('div', { class: 'dk-name', text: ov?.name || face.name }),
          ov ? el('div', { class: 'dk-tag tag-ov', text: '已改' }) : null
        ]);
        list.appendChild(node);
      });
    }
  }
  function astroForm(face) {
    const ov = astroOverride(face);
    const name = el('input', { class: 'input', value: ov?.name || face.name, placeholder: face.name });
    const meaning = el('input', { class: 'input', value: ov?.meaning || face.meaning, placeholder: face.meaning });
    sheet({
      title: '编辑骰面 · ' + (ov?.name || face.name),
      node: el('div', {}, [
        el('div', { class: 'field' }, [el('label', { text: '名称' }), name]),
        el('div', { class: 'field' }, [el('label', { text: '释义' }), meaning]),
        el('div', { class: 'small muted', text: '保存后占星骰投掷时用你改的版本。' })
      ]),
      actions: [{ label: '保存', icon: 'IC-MIO-003', onSelect: async () => {
        const n = String(name.value || '').trim() || face.name;
        const m = String(meaning.value || '').trim() || face.meaning;
        const row = { id: 'astro:' + face.id, system: 'astro', cardKey: face.id, override: true, name: n, meaning: m, ts: Date.now() };
        const idx = customCards.findIndex((o) => o.id === row.id);
        if (idx >= 0) customCards[idx] = row; else customCards.push(row);
        await kvSet('customCards', customCards);
        paint();
        toast('已保存 · 投掷时生效');
      } }]
    });
  }

  /* ---------- 自定义牌组页签：组内所有牌，点牌编辑（写回 divineDecks） ---------- */
  function paintDeck(deckId) {
    const deck = myDecks.find((d) => d.id === deckId);
    if (!deck) { tab = 'tarot'; drawTab(); paint(); return; }
    if (!deck.cards.length) { list.appendChild(el('div', { class: 'dk-group', text: '这个牌组还没有牌，去占卜选类页的「我的牌组」里加' })); return; }
    list.appendChild(el('div', { class: 'dk-group', text: `${deck.name} · ${deck.cards.length} 张` }));
    deck.cards.forEach((c) => {
      const node = el('div', { class: 'dk-cell', onclick: () => deckCardForm(deck, c) }, [
        c.imgId
          ? el('div', { class: 'dk-thumb', style: { background: '#fff' } }, [imgEl(c.imgId, 'dk-img')])
          : el('div', { class: 'dk-thumb dk-empty' }, [iconImg('IC-DIV-002')]),
        el('div', { class: 'dk-name', text: c.name }),
        el('div', { class: 'dk-tag tag-add', text: '我的牌组' })
      ]);
      list.appendChild(node);
    });
  }
  async function deckCardForm(deck, card) {
    const name = el('input', { class: 'input', value: card.name, placeholder: '牌名' });
    const kw = el('input', { class: 'input', value: card.keyword || '', placeholder: '关键词' });
    const up = el('input', { class: 'input', value: card.upright || '', placeholder: '正位释义' });
    const rv = el('input', { class: 'input', value: card.reversed || '', placeholder: '逆位释义' });
    let imgId = card.imgId || '';
    const thumb = el('div', { class: 'cc-thumb' });
    const drawThumb = () => { thumb.innerHTML = ''; thumb.appendChild(imgId ? imgEl(imgId, 'cc-img') : el('div', { class: 'cc-none', text: '未配图' })); };
    drawThumb();
    const pickImg = async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob, w, h } = await compressImage(f, 720, 0.88);
      const old = imgId;
      imgId = await saveMedia(blob, { type: 'image', w, h, source: 'library', name: name.value.trim() || '牌面' });
      if (old && old !== imgId) await delMedia(old);
      drawThumb(); toast('牌面图已换上');
    };
    const dropImg = () => { if (!imgId) return; const old = imgId; imgId = ''; drawThumb(); delMedia(old); };

    sheet({
      title: '编辑牌面 · ' + card.name,
      node: el('div', {}, [
        el('div', { class: 'field' }, [
          el('label', { text: '牌面图' }),
          el('div', { class: 'cc-pick' }, [
            el('div', { class: 'cc-thumb-btn', onclick: pickImg }, [thumb]),
            el('div', { class: 'cc-pick-hint' }, [
              el('div', { class: 'small', text: '点左侧方框选一张图' }),
              el('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, [
                el('button', { class: 'btn sm', onclick: pickImg }, [iconImg('IC-MIO-020'), '选图']),
                el('button', { class: 'btn sm', onclick: dropImg }, [iconImg('IC-MIO-002'), '去掉'])
              ])
            ])
          ])
        ]),
        el('div', { class: 'field' }, [el('label', { text: '名称' }), name]),
        el('div', { class: 'field' }, [el('label', { text: '关键词' }), kw]),
        el('div', { class: 'field' }, [el('label', { text: '正位释义' }), up]),
        el('div', { class: 'field' }, [el('label', { text: '逆位释义' }), rv])
      ]),
      actions: [{ label: '保存', icon: 'IC-MIO-003', onSelect: async () => {
        const n = String(name.value || '').trim();
        if (!n) return toast('请填写名称');
        const decks = await kvGet('divineDecks', []) || [];
        const dd = decks.find((d) => d.id === deck.id);
        const cc = dd?.cards.find((x) => x.id === card.id);
        if (!dd || !cc) return toast('牌组已变化，请重进');
        cc.name = n;
        cc.keyword = String(kw.value || '').trim();
        cc.upright = String(up.value || '').trim();
        cc.reversed = String(rv.value || '').trim();
        if (imgId !== (card.imgId || '')) cc.imgId = imgId || null;
        await kvSet('divineDecks', decks);
        myDecks = decks;
        drawTab(); paint();
        toast('已保存');
      } }]
    });
  }

  /* #view 是 overflow:hidden，只有 #view>.page 才能滚动 —— 包一层滚动容器，
     否则首屏 16 张之后（恶魔/高塔附近）全被裁掉，根本滑不动 */
  const scrollBox = el('div', { class: 'page', style: { padding: '0' } });
  scrollBox.appendChild(tabRow);
  scrollBox.appendChild(list);
  view.appendChild(scrollBox);
  drawTab(); paint();

  /* ---------- 牌背：上传一张图，此牌组（体系）所有牌共用 ---------- */
  function backSheet() {
    const pick = async (sys) => {
      const file = await openFile({ accept: 'image/*', multiple: false });
      if (!file) return;
      const { blob, w, h } = await compressImage(file, 720, 0.88);
      const imgId = await saveMedia(blob, { type: 'image', w, h, source: 'library', name: (sys === 'tarot' ? '塔罗' : '雷诺曼') + '牌背' });
      cardBacks = { ...cardBacks, [sys]: imgId };
      await kvSet('divineCardBacks', cardBacks);
      toast('牌背已设置 · 此牌组所有牌共用');
    };
    const st = (sys) => (cardBacks[sys] ? '已设置 · 点击更换' : '未设置 · 点击上传');
    actionSheet('设置牌背（此牌组所有牌面共用）', [
      { label: `塔罗 · ${st('tarot')}`, icon: 'IC-DIV-002', onSelect: () => pick('tarot') },
      { label: `雷诺曼 · ${st('lenormand')}`, icon: 'IC-DIV-003', onSelect: () => pick('lenormand') }
    ]);
  }

  /* ---------- 批量导入 ---------- */
  let numFromOne = false;   // 「编号从 1 起」开关（只影响塔罗纯编号：1→愚者 … 78→星币国王）
  function batchImportDialog() {
    actionSheet('批量导入牌面图', [
      { label: '塔罗 · 选图片文件', icon: 'IC-DIV-002', onSelect: () => batchImport('tarot', false) },
      { label: '塔罗 · 整个文件夹', icon: 'IC-DIV-002', onSelect: () => batchImport('tarot', true) },
      { label: '雷诺曼 · 选图片文件', icon: 'IC-DIV-003', onSelect: () => batchImport('lenormand', false) },
      { label: '雷诺曼 · 整个文件夹', icon: 'IC-DIV-003', onSelect: () => batchImport('lenormand', true) },
      { label: `编号从 1 起：${numFromOne ? '开' : '关'}（点切换，只影响塔罗纯编号）`, icon: 'IC-DIV-007', onSelect: () => {
        numFromOne = !numFromOne;
        toast(`编号从 1 起已${numFromOne ? '开启' : '关闭'}（1=愚者 … 78=星币国王）`);
        batchImportDialog();   // 重开让用户看到开关状态
      } },
      { label: '怎么匹配文件名？', icon: 'IC-DIV-001', onSelect: () => alertBox({
        title: '文件名匹配规则',
        text: '按文件名自动对应牌（图片文件和整个文件夹都支持）：\n\n' +
              '· 牌名：愚人.png、权杖王牌.jpg（含子串也行，如 塔罗牌-愚人.png）\n' +
              '· 体系前缀：塔罗-愚人.png、雷诺曼-骑士.jpg、tarot-00-魔术师.png\n' +
              '· 前缀序号：07-战车.png\n' +
              '· 纯编号：塔罗 00–77、雷诺曼 1–36（同名跨体系按当前页签；' +
              '塔罗编号从 0 起，如你的素材从 1 开始请打开「编号从 1 起」）\n\n' +
              '文件名可含扩展名（.jpg/.png/.webp）、可含空格和下划线。\n' +
              '匹配顺序：体系前缀 → 前缀序号（名字优先）→ 牌名 → 纯编号。\n' +
              '未识别的文件会列出来，其余照常导入。'
      }) }
    ]);
  }

  const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i;
  async function batchImport(system, folder = false) {
    const files = await openFile(folder ? { directory: true } : { accept: 'image/*', multiple: true });
    if (!files || !files.length) return;
    // 文件夹里可能混有非图片（说明文档等），只挑图片处理
    const imgs = files.filter((f) => (f.type || '').startsWith('image/') || IMG_RE.test(f.name));
    const nonImg = files.length - imgs.length;
    if (!imgs.length) { alertBox({ title: '没有图片', text: '所选内容里没有可用的图片文件。' }); return; }
    const deck = system === 'tarot' ? TAROT : LENORMAND;
    let ok = 0, skip = 0, dup = 0;
    const skipList = [];

    for (const f of imgs) {
      // 只去扩展名，保留 - _ 空格等分隔符（前缀/序号规则靠它们切分，牌名匹配时再清）
      const base = f.name.replace(/\.[^.]+$/, '').trim();
      const hit = matchBuiltinCard(base, system, deck, numFromOne);
      if (!hit) { skip++; skipList.push(f.name); continue; }
      const matched = hit.card;
      const effSys = hit.system;   // 体系前缀可改体系（如塔罗页签里导入 雷诺曼-骑士.jpg）
      // 防重复：同体系同 id 已有覆盖 → 跳过
      if (customCards.some((c) => c.override && c.system === effSys && c.id === matched.id)) { dup++; continue; }

      const { blob, w, h } = await compressImage(f, 720, 0.88);
      const imgId = await saveMedia(blob, { type: 'image', w, h, source: 'library', name: matched.name });
      const patch = { ...matched, override: true, custom: true, imgId, system: effSys };
      customCards.push(patch);
      ok++;
    }

    await kvSet('customCards', customCards);
    paint();
    const msg = `体系：${system === 'tarot' ? '塔罗' : '雷诺曼'}${folder ? ' · 文件夹' : ''}\n✓ 成功覆盖 ${ok} 张\n· 重复跳过 ${dup} 张\n· 没匹配到 ${skip} 张` +
                (folder && nonImg ? `\n· 非图片跳过 ${nonImg} 个` : '') +
                (skipList.length ? `\n\n没匹配的：\n${skipList.join('\n')}` : '');
    alertBox({ title: '批量导入完成', text: msg });
  }

  /* ---------- 返回时清理 ---------- */
  window.addEventListener('hashchange', () => { removeFab(); clearTimeout(); }, { once: true });
  }
});

/** 按文件名匹配内置牌。返回 { card, system }（system 会被体系前缀覆盖），未识别返回 null。
    匹配规则（按优先级）：
      1. 体系前缀：塔罗-/雷诺曼-/tarot-/lenormand-（可覆盖当前页签的体系）
      2. 前缀序号：07-战车.png → 先用名字「战车」匹配，名字没中才用序号 7
      3. 牌名（含子串双向包含，同义词归一：王牌→Ace）：愚人.png / 塔罗牌-愚人.png / 权杖王牌.jpg
      4. 纯编号：塔罗 00–77 = 数组索引（numFromOne 开启时 1–78 → 索引-1）；雷诺曼 1–36 → 索引-1
      同名跨体系（塔/星星/月亮/太阳）按无前缀时传入的当前页签体系。 */
export function matchBuiltinCard(rawBase, system, deck, numFromOne = false) {
  if (!rawBase) return null;
  let base = String(rawBase).trim();
  let effSys = system;

  // 1. 体系前缀（覆盖当前体系，deck 换成对应内置）
  const pre = base.match(/^(塔罗|雷诺曼|tarot|lenormand)[-_–—:\s]*/i);
  if (pre) {
    effSys = /雷诺曼|lenormand/i.test(pre[1]) ? 'lenormand' : 'tarot';
    base = base.slice(pre[0].length).trim();
    deck = effSys === 'tarot' ? TAROT : LENORMAND;
  }

  // 2. 前缀序号：07-战车 / 00-魔术师（名字优先，序号兜底）
  let prefixNum = null;
  const pn = base.match(/^(\d{1,2})[-_–—:\s]+/);
  if (pn) { prefixNum = Number(pn[1]); base = base.slice(pn[0].length).trim(); }
  if (!base) return null;

  // 3. 牌名：先清掉残留分隔符（塔罗牌-愚人 → 牌愚人），同义词归一（愚人→愚者、王牌→Ace）
  //    后精确 → 双向包含（至少 2 字，避免单字乱配）
  const norm = (s) => String(s || '').replace(/愚人/g, '愚者').replace(/王牌/g, 'Ace');
  const nb = base.replace(/[-_–—:\s]+/g, '');
  const nnb = norm(nb);
  let m = deck.find((c) => c.name === nb || norm(c.name) === nnb)
       || (nnb.length >= 2 && deck.find((c) => norm(c.name).includes(nnb) || nnb.includes(norm(c.name))));
  if (m) return { card: m, system: effSys };

  // 4. 序号：前缀序号，或纯数字文件名
  const n = prefixNum !== null ? prefixNum : (/^\d+$/.test(nb) ? Number(nb) : null);
  if (n !== null) {
    if (effSys === 'tarot') {
      // 塔罗编号从 0 起（00=愚者 … 77=星币国王），即数组索引；「从 1 起」时 1→0
      const idx = numFromOne ? n - 1 : n;
      if (idx >= 0 && idx < TAROT.length) return { card: TAROT[idx], system: 'tarot' };
    } else if (n >= 1 && n <= LENORMAND.length) {
      // 雷诺曼 1–36 → 索引-1
      return { card: LENORMAND[n - 1], system: 'lenormand' };
    }
  }
  return null;
}



/* ---------------- 数据组装 ---------------- */
/** 牌面覆盖机制：customCards 里 override:true 且 id 与内置一致的，
    会替换掉内置 deck 里的同名牌；不带 override 的 customCards 是新增牌，拼在后面。 */
function deckFor(system) {
  const base = system === 'tarot' ? TAROT : system === 'lenormand' ? LENORMAND : [];
  const over = new Map(customCards.filter((c) => c.override && c.system === system).map((c) => [c.id, c]));
  const added = customCards.filter((c) => !c.override && c.system === system);
  return base.map((c) => over.get(c.id) || c).concat(added);
}
function spreadsFor(system) {
  return SPREADS.filter((s) => s.system === system).concat(customSpreads.filter((s) => s.system === system));
}
function stripPrefix(text) { return String(text || '').replace(/^(正位|逆位)：/, ''); }

function buildDraws() {
  if (sess.system === 'astro') {
    // 图鉴里改过的骰面（customCards 覆盖）在此生效
    const cov = (face) => {
      const ov = customCards.find((k) => k.override && k.system === 'astro' && k.cardKey === face.id);
      return ov ? { ...face, name: ov.name || face.name, meaning: ov.meaning || face.meaning } : face;
    };
    const p = cov(pick(PLANETS)), s = cov(pick(SIGNS)), h = cov(pick(HOUSES));
    sess.draws = [
      { pos: '行星', name: p.name, meaning: p.meaning },
      { pos: '星座', name: s.name, meaning: s.meaning },
      { pos: '宫位', name: h.name, meaning: h.meaning }
    ];
    sess.revealed = sess.draws.map(() => true);   // 占星骰没有翻牌环节，直接出结果
    return;
  }
  const deck = deckFor(sess.system).slice();
  const positions = sess.spread.positions;
  const out = [];
  for (let i = 0; i < positions.length && deck.length; i++) {
    const card = deck.splice(rndInt(0, deck.length - 1), 1)[0];
    const rev = Math.random() < 0.5;
    out.push({
      pos: positions[i], id: card.id, name: card.name, poker: card.poker, imgId: card.imgId,
      keywords: card.keywords, reversed: rev, orient: card.system === 'astro' ? '' : (rev ? '逆位' : '正位'),
      text: stripPrefix(rev ? card.reversed : card.upright)
    });
  }
  sess.draws = out;
  sess.revealed = out.map(() => false);   // 每次抽牌都重新盖好，等用户逐张或一键翻开
}

/* ---------------- 渲染 ---------------- */
function render() {
  picker?.destroy();
  picker = null;
  removeFab();
  view.innerHTML = '';
  const wrap = el('div', { class: 'page div-page' });
  view.appendChild(wrap);
  wrap.appendChild(ritualBar());
  if (stage === 'system') renderSystem(wrap);
  else if (stage === 'spread') renderSpread(wrap);
  else if (stage === 'intent') renderIntent(wrap);
  else if (stage === 'shuffle') renderShuffle(wrap);
  else renderBoard(wrap);
}

/* 仪式流：塔罗 / 雷诺曼六步，占星骰四步；当前这一步点亮 */
const RITUAL = {
  full: ['选类', '设阵', '起意', '洗牌', '翻牌', '解读'],
  astro: ['选类', '起意', '投掷', '解读']
};
const STEP_INDEX = {
  full: { system: 0, spread: 1, intent: 2, shuffle: 3, board: 4 },
  astro: { system: 0, intent: 1, shuffle: 2, board: 3 }
};
function ritualBar() {
  const astro = sess?.system === 'astro';
  const steps = astro ? RITUAL.astro : RITUAL.full;
  let i = (astro ? STEP_INDEX.astro : STEP_INDEX.full)[stage] ?? 0;
  if (stage === 'board' && sess?.revealed.every(Boolean)) i = steps.length - 1;   // 牌翻完就是解读
  return el('div', { class: 'ritual' }, steps.map((s, k) => el('span', {
    class: 'ritual-step' + (k === i ? ' on' : (k < i ? ' done' : '')),
    text: s
  })));
}

/* 选类：卡片轮播，左右滑动挑选体系，轻触中央卡即可进入下一步 */
function renderSystem(wrap) {
  picker = createPicker({
    items: SYSTEMS,
    start: Math.max(0, SYSTEMS.findIndex((s) => s.id === sess?.system)),
    kicker: '选 类',
    sub: '选择你想倾听的语言',
    hint: '左右滑动 · 轻触中央卡以确认',
    renderCard: (s) => [
      el('div', { class: 'pk-frame' }, [iconImg(SYSTEM_ICON[s.id], 'pk-ico')]),
      el('div', { class: 'pk-name', text: s.name }),
      el('div', { class: 'pk-sub2', text: systemSub(s.id) })
    ],
    onConfirm: (s) => startSystem(s.id)
  });
  wrap.appendChild(picker.node);
  picker.layout();
  fabButton();
}

/** 右下角悬浮「+」：自定义牌面 / 牌阵（挂在 #app 上，避免被轮播 transform 影响定位） */
function fabButton() {
  removeFab();
  const btn = el('button', { class: 'div-fab', id: 'div-fab', title: '自定义牌面 / 牌阵', onclick: customMenu }, [iconImg('IC-MIO-022')]);
  document.getElementById('app').appendChild(btn);
  return btn;
}
function removeFab() {
  document.getElementById('div-fab')?.remove();
}

function startSystem(system) {
  sess = { id: uid(), system, spread: null, question: '', mode: 'meaning', shuffle: pick(SHUFFLES), draws: [], revealed: [], ts: Date.now(), saved: false };
  stage = system === 'astro' ? 'intent' : 'spread';
  render();
}

/* 设阵：同样是卡片轮播，底部按钮确认本次牌阵 */
function renderSpread(wrap) {
  const list = spreadsFor(sess.system);
  const start = Math.max(0, list.findIndex((s) => s.id === sess.spread?.id));

  picker = createPicker({
    items: list,
    start,
    kicker: '设 阵',
    sub: '为这次提问选一个牌阵',
    hint: '左右滑动 · 轻触中央卡以确认',
    renderCard: (sp) => [
      el('div', { class: 'pk-frame' }, [miniLayout(sp)]),
      el('div', { class: 'pk-name', text: sp.name }),
      el('div', { class: 'pk-desc', text: sp.positions.join(' · ') })
    ],
    onConfirm: chooseSpread
  });

  wrap.appendChild(stepbar('选择牌阵', () => { stage = 'system'; render(); }));
  wrap.appendChild(picker.node);
  picker.layout();

  wrap.appendChild(el('div', { class: 'pk-cta' }, [
    el('button', { class: 'pk-btn', onclick: () => chooseSpread(picker.current()) }, ['选择此牌阵'])
  ]));
  wrap.appendChild(el('div', { class: 'pk-random', text: '随 机 来 一 局', onclick: () => chooseSpread(pick(list)) }));
  fabButton();
}

function chooseSpread(sp) {
  sess.spread = sp;
  stage = 'intent';
  render();
}

function renderIntent(wrap) {
  const q = el('textarea', { class: 'input', placeholder: '写下你想问的事（可留空，只做一次梳理）', text: sess.question });
  q.addEventListener('input', () => { sess.question = q.value; });

  const modeRow = el('div', { class: 'row wrap' });
  const modes = [['meaning', '解读牌意', '只看牌面本身的象征'], ['message', '传达信息', '让 TA 借着牌面回应你']];
  modes.forEach(([m, label, sub]) => {
    modeRow.appendChild(el('div', {
      class: 'chip' + (sess.mode === m ? ' on' : ''), title: sub,
      onclick: (e) => { sess.mode = m; Array.from(modeRow.children).forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); }
    }, [label]));
  });

  const shuffleRow = el('div', { class: 'row between', style: { marginTop: '2px' } }, [
    el('div', { class: 'small muted', text: '洗牌 / 投掷方式' }),
    el('button', { class: 'btn sm', onclick: pickShuffle }, [iconImg('IC-DIV-005'), '更换'])
  ]);
  const shuffleName = el('div', { class: 'row', style: { gap: '7px', marginTop: '6px' } }, [
    el('span', { class: 'badge', text: sess.shuffle.name })
  ]);

  const spreadLine = sess.system === 'astro'
    ? '占星骰 · 行星 × 星座 × 宫位'
    : `${sess.spread.name} · ${sess.spread.positions.length} 张`;

  wrap.appendChild(stepbar(spreadLine, () => { stage = sess.system === 'astro' ? 'system' : 'spread'; render(); }));
  wrap.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'field' }, [el('label', { text: '起意（你想问什么）' }), q]),
    el('div', { class: 'field' }, [el('label', { text: '解读口径' }), modeRow]),
    el('div', { class: 'field' }, [shuffleRow, shuffleName])
  ]));
  wrap.appendChild(el('div', { class: 'row', style: { justifyContent: 'center', gap: '10px' } }, [
    el('button', { class: 'btn primary', onclick: () => { stage = 'shuffle'; render(); } },
      [iconImg('IC-DIV-005'), sess.system === 'astro' ? '开始投掷' : '开始洗牌'])
  ]));
}

function pickShuffle() {
  actionSheet('洗牌 / 投掷方式', SHUFFLES.map((s) => ({
    label: s.name, sub: `动作：${s.anim}`,
    onSelect: () => { sess.shuffle = s; render(); toast('已改为「' + s.name + '」'); }
  })));
}

function renderShuffle(wrap) {
  const astro = sess.system === 'astro';
  const anim = 'sh-' + sess.shuffle.anim;

  /* 塔罗 / 雷诺曼：一整叠牌同时洗；占星骰：三颗骰子同时掷出 */
  const stack = astro
    ? el('div', { class: 'sh-stack dice' }, [0, 1, 2].map((i) => el('div', { class: 'sh-slot', style: { '--i': String(i - 1) } }, [
        el('div', { class: 'sh-die ' + anim, style: { animationDelay: i * 110 + 'ms' } }, [dieFace(rndInt(1, 6))])
      ])))
    : el('div', { class: 'sh-stack' }, Array.from({ length: 7 }, (_, i) => el('div', { class: 'sh-slot', style: { '--i': String(i - 3) } }, [
        el('div', { class: 'sh-mini ' + anim, style: { animationDelay: Math.abs(i - 3) * 80 + 'ms' } }, [iconImg('IC-DIV-006')])
      ])));

  wrap.appendChild(el('div', { class: 'divine-stage' }, [
    stack,
    el('div', { class: 'sh-cap' }, [
      el('div', { text: astro ? '正在投掷…' : '正在' + sess.shuffle.name + '…' }),
      el('div', { class: 'small muted', text: astro ? sess.shuffle.name + ' · 三骰一并掷出' : '整叠一起洗 · 洗好后自动抽牌' })
    ])
  ]));

  const delay = 1250;
  setTimeout(() => {
    if (stage !== 'shuffle' || !view.isConnected) return;
    buildDraws();
    stage = 'board';
    render();
  }, delay);
}

/** 骰面：按点数摆骰子的小圆点 */
const PIP_CELLS = {
  1: ['2/2'],
  2: ['1/1', '3/3'],
  3: ['1/1', '2/2', '3/3'],
  4: ['1/1', '1/3', '3/1', '3/3'],
  5: ['1/1', '1/3', '2/2', '3/1', '3/3'],
  6: ['1/1', '1/3', '2/1', '2/3', '3/1', '3/3']
};
function dieFace(n) {
  return el('div', { class: 'die-face' }, (PIP_CELLS[n] || PIP_CELLS[1]).map((cell) => {
    const [r, c] = cell.split('/');
    return el('span', { class: 'die-pip', style: { gridArea: `${r} / ${c}` } });
  }));
}

function renderBoard(wrap) {
  const head = sess.question
    ? el('div', { class: 'reading', style: { marginBottom: '14px' }, text: '问：' + sess.question })
    : (sess.system === 'astro' ? el('div', {}) : el('div', { class: 'small muted center', style: { marginBottom: '14px' }, text: '心里默想一遍你要问的事，然后逐张翻牌。' }));

  const rows = rowsFor(sess.spread?.layoutKind || 'auto', sess.draws.length, sess.spread?.layoutCells);
  const board = el('div', { class: 'spread board' });
  rows.forEach((r) => {
    const line = el('div', { class: 'spread-row' });
    r.forEach((v) => {
      if (v == null || v > sess.draws.length) { line.appendChild(el('div', { class: 'dcard blank' })); return; }
      const i = v - 1;
      const d = sess.draws[i];
      line.appendChild(el('div', {
        class: 'dcard' + (sess.revealed[i] ? ' flipped' : '') + (d.reversed ? ' rev' : '') + (d.imgId ? ' has-img' : ''),
        'data-i': String(i),
        onclick: (e) => flipCard(i, e.currentTarget)
      }, [sess.revealed[i] ? cardFace(d, i) : cardBack()]));
    });
    board.appendChild(line);
  });

  wrap.appendChild(head);
  wrap.appendChild(el('div', { class: 'divine-stage' }, [board]));

  if (!sess.revealed.every(Boolean)) {
    wrap.appendChild(el('div', { class: 'flip-bar' }, [
      el('div', { class: 'small muted', text: '逐张轻触翻牌' }),
      el('button', { class: 'btn', onclick: flipAll }, [iconImg('IC-DIV-006'), '一键全翻'])
    ]));
  }

  if (sess.revealed.every(Boolean)) appendReading(wrap);
}

/** 一键全翻：把所有未翻的牌一次翻开 */
function flipAll() {
  sess.revealed = sess.draws.map(() => true);
  render();
  toast('牌面已全部翻开');
}

function cardBack() {
  const bkId = cardBacks[sess?.system];
  if (bkId) {
    // 自定义牌背：整张铺图 + 底部半透明「点击翻牌」提示
    return el('div', { class: 'dback' }, [
      imgEl(bkId, 'dback-img', '牌背'),
      el('div', { class: 'back-lbl', text: '点击翻牌' })
    ]);
  }
  return el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } }, [
    iconImg('IC-DIV-006'),
    el('div', { class: 'back-lbl', text: '点击翻牌' })
  ]);
}

function cardFace(d, i) {
  const root = el('div', { class: 'dface-root' });
  const wrap = el('div', { class: 'dface-body' });
  if (d.imgId) {
    wrap.appendChild(el('div', { class: 'dface-img' }, [
      imgEl(d.imgId, 'dcard-img', d.name),
      el('div', { class: 'dcard-cap' }, [
        el('span', { text: d.name }),
        d.orient ? el('span', { class: 'cap-ori', text: ' · ' + d.orient }) : null
      ])
    ]));
  } else {
    wrap.appendChild(el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' } }, [
      el('div', { class: 'nm', text: d.name }),
      d.poker ? el('div', { class: 'pos', text: d.poker }) : null,
      d.orient ? el('div', { class: 'pos', text: d.orient }) : (d.pos ? el('div', { class: 'pos', text: d.pos }) : null)
    ]));
  }
  root.appendChild(wrap);
  if (sess?.system !== 'astro') {
    const editBtn = el('button', { class: 'dface-edit', title: '编辑这张牌', onclick: (e) => { e.stopPropagation(); openDrawEditor(i); } }, [iconImg('IC-MIO-022')]);
    root.appendChild(editBtn);
  }
  return root;
}

function flipCard(i, node) {
  if (sess.revealed[i]) return;
  sess.revealed[i] = true;
  node.classList.add('flipped');
  node.classList.toggle('rev', !!sess.draws[i].reversed);
  node.classList.toggle('has-img', !!sess.draws[i].imgId);
  node.innerHTML = '';
  node.appendChild(cardFace(sess.draws[i], i));
  if (sess.revealed.every(Boolean)) { render(); toast('牌面已全部翻开'); }
}

/** 在 board 上编辑某张已抽到的牌 —— 保存为 override 后刷新当前卡与解读 */
function openDrawEditor(i) {
  const d = sess.draws[i];
  // 找出对应的 builtin / override
  const builtin = findBuiltinCard(d.id);
  const override = customCards.find((c) => c.id === d.id && c.override);
  cardForm(override || builtin || { ...d, custom: true });

  // 等 sheet 关闭 + reloadCustom 完成后刷新
  const tryRefresh = setInterval(() => {
    // 最简单的检测：sheet 消失 / customCards 里存在 id === d.id 的 override
    const nowOverride = customCards.find((c) => c.id === d.id && c.override);
    const sheetEl = document.querySelector('#layer-root .sheet');
    if (!sheetEl) {     // sheet 关了 → 刷新
      clearInterval(tryRefresh);
      const cur = customCards.find((c) => c.id === d.id && c.override) || builtin;
      if (cur) {
        Object.assign(sess.draws[i], {
          name: cur.name, keywords: cur.keywords, imgId: cur.imgId || d.imgId,
          poker: cur.poker || d.poker,
          text: stripPrefix(d.reversed ? (cur.reversed || cur.upright) : (cur.upright || cur.reversed)),
          ...(d.reversed ? { reversed: d.reversed } : {})
        });
        // 如果改过正逆，这里也跟着——实际上 reversed 不会因为 override 变，留着
      }
      render();
    } else if (nowOverride && !document.querySelector('#layer-root .sheet')) {
      clearInterval(tryRefresh);
      render();
    }
  }, 200);
}

function appendReading(wrap) {
  const meaning = sess.system === 'astro' ? astroReading() : cardReading();

  wrap.appendChild(el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [
      el('div', { class: 'h', text: sess.mode === 'message' ? 'TA 借着牌面想对你说的' : '牌面解读' })
    ]),
    meaning
  ]));

  wrap.appendChild(el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '16px' } }, [
    el('button', { class: 'btn sm', onclick: drawExtra }, [iconImg('IC-MIO-022'), '补牌（求变局）']),
    el('button', { class: 'btn sm', onclick: again }, [iconImg('IC-DIV-005'), '再抽一次']),
    el('button', { class: 'btn sm', onclick: askAgain }, [iconImg('IC-DIV-008'), '追问']),
    el('button', { class: 'btn sm primary', onclick: taSpeak }, [iconImg('IC-DIV-001'), '让 TA 借牌说一句'])
  ]));

  if (!sess.saved) { sess.saved = true; saveRecord(); }
}

/** 关键词 / 释义统一用「·」分隔 */
const dots = (s) => String(s || '').replace(/\s*\/\s*/g, ' · ');

function cardReading() {
  const box = el('div', { class: 'card' });
  sess.draws.forEach((d) => {
    box.appendChild(el('div', { style: { paddingBottom: '11px', marginBottom: '11px', borderBottom: '1px dashed var(--line-soft)' } }, [
      el('div', { class: 'row', style: { gap: '7px', justifyContent: 'space-between' } }, [
        el('div', { style: { fontWeight: '600' }, text: d.pos }),
        el('div', { class: 'row', style: { gap: '6px' } }, [
          el('span', { class: 'badge', text: d.name }),
          d.orient ? el('span', { class: 'badge' + (d.reversed ? ' warn' : ' ok'), text: d.orient }) : null
        ])
      ]),
      el('div', { class: 'kw', text: dots(d.keywords) }),
      el('div', { class: 'small', text: sess.mode === 'message' ? `TA：${d.text}` : d.text })
    ]));
  });
  box.appendChild(summaryBlock());
  return box;
}

function astroReading() {
  const [p, s, h] = sess.draws;
  const box = el('div', { class: 'card' });
  box.appendChild(el('div', { class: 'row', style: { gap: '8px', marginBottom: '10px' }, html:
    `<span class="badge">${p.name}</span><span class="badge">${s.name}</span><span class="badge">${h.name}</span>` }));
  const lines = [
    ['行星 · 动力', p.name, p.meaning],
    ['星座 · 方式', s.name, s.meaning],
    ['宫位 · 落点', h.name, h.meaning]
  ];
  lines.forEach(([label, name, mean]) => {
    box.appendChild(el('div', { style: { marginBottom: '9px' } }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'small muted', text: label }),
        el('div', { style: { fontWeight: '600' }, text: name })
      ]),
      el('div', { class: 'small', text: sess.mode === 'message' ? `TA：${dots(mean)}` : dots(mean) })
    ]));
  });
  box.appendChild(summaryBlock());
  return box;
}

function summaryBlock() {
  const d = sess.draws;
  let text = '';
  if (sess.system === 'astro') {
    text = `这件事的底色是「${d[0].name}」——${dots(d[0].meaning)}；推进方式是「${d[1].name}」——${dots(d[1].meaning)}；落点在「${d[2].name}」——${dots(d[2].meaning)}。`;
  } else {
    const rev = d.filter((x) => x.reversed).length;
    text = rev >= d.length - rev
      ? '整套牌偏逆位：先别急着推进，适合停下来、向内看一看，等一个更清楚的信号再动。'
      : '牌面偏正：眼下可以顺着已有的势头往前一步，不必反复掂量。';
    text = d.map((x) => `${x.pos}是「${x.name}${x.orient ? '·' + x.orient : ''}」`).join('；') + '。' + text;
  }
  return el('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)' } }, [
    el('div', { class: 'small muted', style: { marginBottom: '4px' }, text: '综合' }),
    el('div', { text })
  ]);
}

/* ---------------- 读取后的动作 ---------------- */
function drawExtra() {
  if (sess.system === 'astro') { toast('占星骰不支持补牌，可「再抽一次」'); return; }
  const deck = deckFor(sess.system);
  if (!deck.length) return;
  const card = deck[rndInt(0, deck.length - 1)];
  const rev = Math.random() < 0.5;
  sess.draws.push({
    pos: '补牌 · 变局', id: card.id, name: card.name, poker: card.poker, imgId: card.imgId, keywords: card.keywords,
    reversed: rev, orient: rev ? '逆位' : '正位', text: stripPrefix(rev ? card.reversed : card.upright)
  });
  sess.revealed.push(true);
  sess.saved = false;
  render();
  toast('已补一张：' + card.name);
}

function again() {
  sess.shuffle = pick(SHUFFLES);
  sess.draws = []; sess.revealed = []; sess.saved = false; sess.ts = Date.now();
  stage = 'shuffle'; render();
}

function askAgain() {
  sess.question = ''; sess.draws = []; sess.revealed = []; sess.saved = false; sess.ts = Date.now();
  stage = 'intent'; render();
}

async function taSpeak() {
  const cards = await all('cards');
  const pool = eligible(cards);
  if (!pool.length) { toast('字卡库还是空的，去「字卡库」加几张再试'); return; }
  const [c] = drawCards(pool, 1, state.role.params.pureRandom);
  const frame = sess.system === 'astro'
    ? `TA 借着「${sess.draws[0].name}·${sess.draws[1].name}·${sess.draws[2].name}」对你说——`
    : `TA 借着这一局「${sess.spread.name}」对你说——`;
  await addMessage({ role: 'sys', type: 'sys', text: '【占卜】' + frame });
  await addMessage({ role: 'ta', type: 'text', text: c.content, cardIds: [c.id] });
  toast('已让 TA 借着牌面对你说了一句');
}

/* ---------------- 记录 ---------------- */
function recordBody() {
  return {
    id: sess.id, ts: sess.ts, system: sess.system, mode: sess.mode,
    spreadId: sess.spread ? sess.spread.id : 'astro',
    spreadName: sess.spread ? sess.spread.name : '占星骰',
    question: sess.question,
    shuffleName: sess.shuffle.name,
    draws: sess.draws.map((d) => ({ pos: d.pos, name: d.name, orient: d.orient || '', reversed: !!d.reversed, text: d.text, keywords: d.keywords || '', meaning: d.meaning || '' }))
  };
}

async function saveRecord() {
  try { await put('divinations', recordBody()); } catch (e) { console.warn('记录保存失败', e); }
}

async function showHistory() {
  const list = (await all('divinations')).sort((a, b) => b.ts - a.ts);
  if (!list.length) return alertBox({ title: '还没有记录', text: '做完一次占卜后会自动保存到本地，在这里可以回看。' });
  sheet({
    title: '占卜记录',
    node: el('div', { class: 'card flush' }, list.slice(0, 40).map((r) =>
      el('div', { class: 'list-item', onclick: () => viewRecord(r) }, [
        iconImg(SYSTEM_ICON[r.system] || 'IC-DIV-001'),
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title ellipsis', text: r.question || '（未写问题）' }),
          el('div', { class: 'li-sub', text: `${r.spreadName} · ${fmtDateTime(r.ts)}` })
        ]),
        iconImg('IC-MIO-004', 'chev')
      ])
    )),
    actions: [{ label: '导出为 JSON', icon: 'IC-MIO-009', onSelect: exportHistory }]
  });
}

function viewRecord(r) {
  const box = el('div', { class: 'card' });
  if (r.question) box.appendChild(el('div', { class: 'small muted', style: { marginBottom: '8px' }, text: '问：' + r.question }));
  (r.draws || []).forEach((d) => {
    box.appendChild(el('div', { style: { marginBottom: '10px' } }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'small muted', text: d.pos }),
        el('div', { class: 'row', style: { gap: '6px' } }, [
          el('span', { class: 'badge', text: d.name }),
          d.orient ? el('span', { class: 'badge', text: d.orient }) : null
        ])
      ]),
      el('div', { class: 'small', text: d.text || d.meaning || '' })
    ]));
  });
  sheet({
    title: `${r.spreadName} · ${fmtDateTime(r.ts)}`,
    node: box,
    actions: [
      { label: '删除这条记录', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
        const yes = await confirmBox({ title: '删除记录', text: '删除后无法恢复。', okText: '删除', danger: true });
        if (yes) { await del('divinations', r.id); toast('已删除'); }
      } }
    ]
  });
}

function exportHistory() {
  all('divinations').then((list) => {
    downloadBlob(new Blob([JSON.stringify({ version: 1, exportedAt: Date.now(), divinations: list }, null, 2)], { type: 'application/json' }), `占卜记录-${Date.now()}.json`);
  });
}

/* ---------------- 自定义牌面 / 牌阵 ---------------- */
const LAYOUT_KINDS = [
  { id: 'auto', name: '自动' },
  { id: 'line', name: '一字排开' },
  { id: 'two', name: '两列' },
  { id: 'three', name: '三列' },
  { id: 'pyramid', name: '金字塔' },
  { id: 'cross', name: '十字' }
];

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 按排布样式把 n 个位置排成若干行，返回可渲染的二维数组（null 为空格）。
    若牌阵自带 layoutCells（用户用格子编辑器自己摆的），直接返回那个 */
function rowsFor(kind, n, layoutCells) {
  if (layoutCells && layoutCells.length) return layoutCells;
  if (n <= 0) return [[1]];
  if (kind === 'line') return [range(n)];
  if (kind === 'two') return chunk(range(n), 2);
  if (kind === 'three') return chunk(range(n), 3);
  if (kind === 'pyramid') {
    const rows = []; let i = 1, w = 1;
    while (i <= n) { const r = []; for (let c = 0; c < w && i <= n; c++) r.push(i++); rows.push(r); w++; }
    return rows;
  }
  if (kind === 'cross' && n === 5) return [[null, 1, null], [2, 3, 4], [null, 5, null]];
  return TILE_ROWS[n] || chunk(range(n), 3);
}

function customMenu() {
  actionSheet('自定义占卜内容', [
    { label: '新建牌阵', icon: 'IC-DIV-007', sub: '自定位置与排布，塔罗 / 雷诺曼都用', onSelect: () => spreadForm() },
    { label: '新建牌面', icon: 'IC-DIV-009', sub: '自定牌名、配图与释义，会洗进牌组', onSelect: () => cardForm() },
    { label: '管理自定义内容', icon: 'IC-CRD-006', sub: `现有 ${customSpreads.length} 个牌阵 · ${customCards.length} 张牌面`, onSelect: manageCustom }
  ]);
}

/** 内容改完后重新载入并刷新当前页面 */
async function reloadCustom() {
  customSpreads = (await kvGet('customSpreads', [])) || [];
  customCards = (await kvGet('customCards', [])) || [];
  if (view?.isConnected) render();
}

function spreadForm(existing) {
  const isNew = !existing;
  // 内置牌阵直接 edit：克隆一份做 custom 副本再改，保留 baseId 指向原牌阵
  const builtinBase = !isNew && !existing.custom;
  let target = existing ? (builtinBase ? {
    id: 'cs-' + uid(), name: existing.name + '（我改的）', system: existing.system,
    positions: [...existing.positions], layoutKind: 'custom', layoutCells: null,
    custom: true, baseId: existing.id
  } : { ...existing }) : null;

  const name = el('input', { class: 'input', placeholder: '牌阵名称，如「我和 TA 的下一步」', value: target?.name || existing?.name || '' });
  const sys = el('select', { class: 'input' }, [
    el('option', { value: 'tarot' }, ['塔罗']),
    el('option', { value: 'lenormand' }, ['雷诺曼'])
  ]);
  if (target) sys.value = target.system;
  else if (existing) sys.value = existing.system;

  const pos = el('input', { class: 'input', placeholder: '位置用「/」分隔，如：现状/我的想法/对方想法/建议',
    value: (target ? target.positions : existing?.positions)?.join('/') || '' });
  const positionsOf = () => pos.value.split(/[\/、,，]/).map((s) => s.trim()).filter(Boolean);

  /* ---------- 格子编辑器 ---------- */
  let kind = target?.layoutKind || existing?.layoutKind || 'custom';
  let rowsN = 3, colsN = 3;      // 默认格子 3×3
  let cells = (target || existing)?.layoutCells;
  // 从 kind 自动推导初始 cells
  function autoCellsFor(n) {
    const base = rowsFor(kind === 'custom' ? 'auto' : kind, n, null);
    return base.map((r) => r.slice());
  }
  if (!cells) cells = autoCellsFor((target || existing)?.positions?.length || positionsOf().length || 3);

  const rowsSelect = el('select', { class: 'input', style: { width: '70px' } });
  const colsSelect = el('select', { class: 'input', style: { width: '70px' } });
  [3, 4, 5].forEach((n) => {
    rowsSelect.appendChild(el('option', { value: String(n), text: n + ' 行' }));
    colsSelect.appendChild(el('option', { value: String(n), text: n + ' 列' }));
  });
  // 从现有 cells 推断尺寸
  rowsN = Math.max(rowsN, cells.length);
  colsN = Math.max(colsN, ...cells.map((r) => r.length || 0));
  rowsSelect.value = String(rowsN);
  colsSelect.value = String(colsN);

  // 所有已摆位置的集合
  const placed = () => new Set(cells.flat().filter((v) => v != null));

  // 格子 DOM 容器
  const gridWrap = el('div', { class: 'sf-grid-wrap' });
  const poolWrap = el('div', { class: 'sf-pool' });

  /** 重建 cells 尺寸（保留内容） */
  function resizeCells(rn, cn) {
    const old = cells;
    const out = [];
    for (let r = 0; r < rn; r++) {
      const row = [];
      for (let c = 0; c < cn; c++) row.push(old[r]?.[c] ?? null);
      out.push(row);
    }
    cells = out;
  }

  /** 渲染整格编辑器（格子 + 位置池） */
  function paintEditor() {
    const list = positionsOf();
    const placeSet = placed();

    // 1. 格子网
    gridWrap.innerHTML = '';
    const grid = el('div', { class: 'sf-grid', style: {
      gridTemplateColumns: `repeat(${colsN}, minmax(0,1fr))`,
      gridTemplateRows: `repeat(${rowsN}, 1fr)`
    } });
    cells.forEach((row, r) => row.forEach((v, c) => {
      const cell = el('div', { class: 'sf-cell' });
      if (v != null) {
        const label = list[v - 1] || `位置 ${v}`;
        cell.appendChild(el('div', { class: 'sf-cell-tile', draggable: 'true', dataset: { kind: 'cell', r: r, c: c, v: String(v) } }, [
          el('div', { class: 'sf-idx', text: String(v) }),
          el('div', { class: 'sf-pos', text: label })
        ]));
      }
      setupCellDrop(cell, r, c);
      grid.appendChild(cell);
    }));
    gridWrap.appendChild(grid);

    // 2. 位置池（没摆的）
    poolWrap.innerHTML = '';
    const poolTitle = el('div', { class: 'small muted', style: { marginBottom: '6px' }, text: '下面的位置可拖到格子里' });
    poolWrap.appendChild(poolTitle);
    const poolRow = el('div', { class: 'sf-pool-row' });
    list.forEach((name, i) => {
      const n = i + 1;
      const chip = el('div', { class: 'sf-pool-chip' + (placeSet.has(n) ? ' off' : ''),
        draggable: String(!placeSet.has(n)), dataset: { kind: 'pool', v: String(n) } }, [
        el('span', { class: 'sf-idx', text: String(n) }),
        el('span', { text: name })
      ]);
      poolRow.appendChild(chip);
    });
    poolWrap.appendChild(poolRow);
    setupDropZones();
  }

  /* ---- 拖拽：HTML5 Drag & Drop（比 pointerdown 更简洁，移动端在安卓浏览器同样可用） ---- */
  let dragData = null;

  function setupCellDrop(cell, r, c) {
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault(); cell.classList.remove('over');
      if (!dragData) return;
      const v = Number(dragData.v);
      if (dragData.kind === 'pool') {
        // 从池拖来：如果 cell 有值就交换回去
        const old = cells[r][c];
        cells[r][c] = v;
        if (old != null && !cells.flat().includes(old)) {
          // 旧值在其它 cell 里 → 不处理（交换逻辑在下面），若只剩它一个就保持
        }
        // 如果 pool 本来是这个格子里的挪来（dragData.kind === 'cell'），先清空旧位置
        if (dragData.kind === 'cell') {
          const sr = Number(dragData.r), sc = Number(dragData.c);
          cells[sr][sc] = null;
        }
      } else if (dragData.kind === 'cell') {
        // cell → cell：交换
        const sr = Number(dragData.r), sc = Number(dragData.c);
        cells[r][c] = cells[sr][sc];
        cells[sr][sc] = v;
      }
      paintEditor();
    });
  }

  function setupDropZones() {
    // pool 里的 chip draggable
    poolWrap.querySelectorAll('[data-kind=pool]').forEach((el) => {
      if (el.classList.contains('off')) return;
      el.addEventListener('dragstart', (e) => {
        dragData = { kind: 'pool', v: el.dataset.v };
        e.dataTransfer.effectAllowed = 'move';
      });
    });
    // cell 里的 tile
    gridWrap.querySelectorAll('[data-kind=cell]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragData = { kind: 'cell', v: el.dataset.v, r: el.dataset.r, c: el.dataset.c };
        e.dataTransfer.effectAllowed = 'move';
      });
      // 双击格子里的位置编号 → 清空
      el.addEventListener('dblclick', () => {
        const r = Number(el.dataset.r), c = Number(el.dataset.c);
        cells[r][c] = null;
        paintEditor();
      });
    });
  }

  rowsSelect.addEventListener('change', () => { rowsN = Number(rowsSelect.value); resizeCells(rowsN, colsN); paintEditor(); });
  colsSelect.addEventListener('change', () => { colsN = Number(colsSelect.value); resizeCells(rowsN, colsN); paintEditor(); });
  pos.addEventListener('input', paintEditor);

  // 初始渲染
  paintEditor();

  sheet({
    title: isNew ? '新建牌阵' : (builtinBase ? ('编辑（基于内置：' + existing.name + '）') : '编辑牌阵'),
    node: el('div', { class: 'sf-form' }, [
      el('div', { class: 'field' }, [el('label', { text: '名称' }), name]),
      el('div', { class: 'field' }, [el('label', { text: '所属体系' }), sys]),
      el('div', { class: 'field' }, [el('label', { text: '位置（每行一个 / 或用顿号分隔）' }), pos]),
      el('div', { class: 'field' }, [
        el('label', { text: '格子尺寸' }),
        el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [
          rowsSelect, el('span', { text: '×' }), colsSelect
        ])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '摆位（拖下面的位置号到格子里；双击格子里的位置可清空）' }),
        gridWrap
      ]),
      poolWrap
    ]),
    actions: [{ label: isNew ? '保存牌阵' : '保存修改', icon: 'IC-MIO-003', onSelect: async () => {
      const n = name.value.trim();
      const p = positionsOf();
      if (!n) return toast('请填写名称');
      if (!p.length) return toast('至少写一个位置');
      // 校验：cells 里所有位置编号都在 1..p.length 范围内，且无重复
      const flat = cells.flat().filter((v) => v != null).map(Number).sort((a, b) => a - b);
      const expected = Array.from({ length: Math.min(flat.length, p.length) }, (_, i) => i + 1);
      // 如果用户还没把全部位置摆完就保存，允许（至少摆一个）
      if (flat.some((v) => v < 1 || v > p.length)) return toast('格子里有无效位置号');
      if (flat.length >= 2 && new Set(flat).size !== flat.length) return toast('格子里有重复的位置号，请调整');

      let store = target;
      if (!store) store = { id: 'cs-' + uid(), custom: true };
      Object.assign(store, {
        name: n, system: sys.value, positions: p,
        layoutKind: 'custom', layoutCells: cells.map((r) => r.slice())
      });
      if (!customSpreads.find((s) => s.id === store.id)) customSpreads.push(store);
      await kvSet('customSpreads', customSpreads);
      if (stage === 'spread' && sess && sess.system === store.system) sess.spread = store;
      await reloadCustom();
      toast(isNew || builtinBase ? '牌阵已添加' : '牌阵已更新');
    } }]
  });
}

/** 判断一张卡是否是内置牌（id 在 TAROT 或 LENORMAND 里）。
    返回对应内置对象，否则 null。 */
function findBuiltinCard(id) {
  if (!id) return null;
  const t = TAROT.find((c) => c.id === id);
  if (t) return t;
  const l = LENORMAND.find((c) => c.id === id);
  if (l) return l;
  return null;
}

function cardForm(existing) {
  // 内置牌第一次编辑 → 克隆成 customCard（override:true）再改
  const builtinBase = existing && !existing.custom && findBuiltinCard(existing.id);
  let target = existing;
  if (builtinBase) {
    const found = customCards.find((c) => c.id === existing.id && c.override);
    target = found || { ...builtinBase, override: true };
    if (!found) customCards.push(target);
  }

  const isNew = !target || !target.id;
  const sys = el('select', { class: 'input' }, [
    el('option', { value: 'tarot' }, ['塔罗']),
    el('option', { value: 'lenormand' }, ['雷诺曼'])
  ]);
  if (target) sys.value = target.system;
  else if (existing) sys.value = existing.system;

  const name = el('input', { class: 'input', placeholder: '牌名', value: (target || existing)?.name || '' });
  const kw = el('input', { class: 'input', placeholder: '关键词，如：犹豫 / 等待',
    value: (target || existing)?.keywords || '' });
  const up = el('input', { class: 'input', placeholder: '正位释义',
    value: (target || existing)?.upright === '（未填写）' ? '' : ((target || existing)?.upright || '') });
  const rv = el('input', { class: 'input', placeholder: '逆位释义（可留空）',
    value: (target || existing)?.reversed === '（未填写）' ? '' : ((target || existing)?.reversed || '') });
  const poker = el('input', { class: 'input', placeholder: '对应扑克牌（雷诺曼常用，选填）',
    value: (target || existing)?.poker || '' });

  let imgId = (target || existing)?.imgId || '';
  const thumb = el('div', { class: 'cc-thumb' });
  const drawThumb = () => {
    thumb.innerHTML = '';
    thumb.appendChild(imgId ? imgEl(imgId, 'cc-img') : el('div', { class: 'cc-none', text: '未配图' }));
  };
  drawThumb();

  const pickImg = async () => {
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob, w, h } = await compressImage(f, 720, 0.88);
    const old = imgId;
    imgId = await saveMedia(blob, { type: 'image', w, h, source: 'library', name: name.value.trim() || '牌面' });
    if (old && old !== imgId) await delMedia(old);
    drawThumb(); toast('牌面图已换上');
  };
  const dropImg = () => { if (!imgId) return; const old = imgId; imgId = ''; drawThumb(); delMedia(old); };

  const savingText = builtinBase ? (target.override ? '保存覆盖' : '保存为覆盖版') : (isNew ? '保存牌面' : '保存修改');

  sheet({
    title: isNew ? '新建牌面' : (builtinBase ? ('编辑内置牌：' + builtinBase.name) : '编辑牌面'),
    node: el('div', {}, [
      el('div', { class: 'field' }, [
        el('label', { text: '牌面图' }),
        el('div', { class: 'cc-pick' }, [
          el('div', { class: 'cc-thumb-btn', onclick: pickImg }, [thumb]),
          el('div', { class: 'cc-pick-hint' }, [
            el('div', { class: 'small', text: '点左侧方框选一张图当作牌面' }),
            el('div', { class: 'small muted', text: '不配图也可以，翻牌时会显示牌名与释义。' }),
            el('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, [
              el('button', { class: 'btn sm', onclick: pickImg }, [iconImg('IC-MIO-020'), '选图']),
              el('button', { class: 'btn sm', onclick: dropImg }, [iconImg('IC-MIO-002'), '去掉'])
            ])
          ])
        ])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '所属体系' }), sys]),
      el('div', { class: 'field' }, [el('label', { text: '牌名' }), name]),
      el('div', { class: 'field' }, [el('label', { text: '关键词' }), kw]),
      el('div', { class: 'field' }, [el('label', { text: '正位释义' }), up]),
      el('div', { class: 'field' }, [el('label', { text: '逆位释义' }), rv]),
      el('div', { class: 'field' }, [el('label', { text: '对应扑克牌' }), poker])
    ]),
    actions: [{ label: savingText, icon: 'IC-MIO-003', onSelect: async () => {
      const n = name.value.trim();
      if (!n) return toast('请填写牌名');
      const patch = {
        system: sys.value, name: n, keywords: kw.value.trim(),
        upright: up.value.trim() || '（未填写）', reversed: rv.value.trim() || '（未填写）',
        poker: poker.value.trim(), imgId
      };
      let store = target;
      if (!store) { store = { id: 'cc-' + uid(), custom: true }; customCards.push(store); }
      else { store.override = builtinBase ? true : (store.override || false); }
      Object.assign(store, patch);
      await kvSet('customCards', customCards);
      await reloadCustom();
      toast(builtinBase ? '已覆盖内置牌（以后抽到这张都用你改的版本）' : (isNew ? '牌面已添加' : '牌面已更新'));
    } }]
  });
}

function manageCustom() {
  const box = el('div', {});
  if (!customSpreads.length && !customCards.length) {
    box.appendChild(el('div', { class: 'small muted', text: '还没有自定义内容，先「新建牌阵」或「新建牌面」。' }));
  }

  customSpreads.forEach((s) => {
    const row = el('div', { class: 'list-item' }, [
      el('div', { class: 'cc-mini' }, [miniLayout(s)]),
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title ellipsis', text: s.name }),
        el('div', { class: 'li-sub', text: `${s.system === 'tarot' ? '塔罗' : '雷诺曼'} · ${s.positions.length} 张 · ${s.positions.join(' / ')}` })
      ]),
      el('div', { class: 'row', style: { gap: '6px', flex: 'none' } }, [
        el('button', { class: 'btn sm', onclick: () => { sh.close(); spreadForm(s); } }, ['编辑']),
        el('button', { class: 'btn sm danger', onclick: async () => {
          customSpreads = customSpreads.filter((x) => x.id !== s.id);
          await kvSet('customSpreads', customSpreads);
          row.remove();
          await reloadCustom();
          toast('已删除');
        } }, ['删除'])
      ])
    ]);
    box.appendChild(row);
  });

  customCards.forEach((c) => {
    const row = el('div', { class: 'list-item' }, [
      el('div', { class: 'cc-mini' }, [c.imgId ? imgEl(c.imgId, 'cc-img') : iconImg('IC-DIV-009')]),
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title ellipsis', text: c.name }),
        el('div', { class: 'li-sub ellipsis', text: `${c.system === 'tarot' ? '塔罗' : '雷诺曼'} · ${c.keywords || '（无关键词）'}${c.imgId ? ' · 有配图' : ''}` })
      ]),
      el('div', { class: 'row', style: { gap: '6px', flex: 'none' } }, [
        el('button', { class: 'btn sm', onclick: () => { sh.close(); cardForm(c); } }, ['编辑']),
        el('button', { class: 'btn sm danger', onclick: async () => {
          customCards = customCards.filter((x) => x.id !== c.id);
          await kvSet('customCards', customCards);
          await delMedia(c.imgId);
          row.remove();
          await reloadCustom();
          toast('已删除');
        } }, ['删除'])
      ])
    ]);
    box.appendChild(row);
  });

  const sh = sheet({ title: '管理自定义内容', node: box });
}

/* ---------------- 更多 ---------------- */
function moreMenu() {
  actionSheet('占卜', [
    { label: '关于结果', icon: 'IC-DIV-001', sub: '本地随机生成 · 仅供娱乐与自我梳理', onSelect: () => alertBox({ title: '关于结果', text: '结果由本站代码在本地随机生成，仅供娱乐与自我梳理，不构成任何现实建议。' }) },
    { label: '查看记录', icon: 'IC-DIV-008', onSelect: showHistory },
    { label: '导出记录为 JSON', icon: 'IC-MIO-009', onSelect: exportHistory },
    { label: '补充牌阵 / 牌面', icon: 'IC-DIV-009', onSelect: customMenu },
    { label: '清空全部占卜记录', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const yes = await confirmBox({ title: '清空记录', text: '将删除本地保存的全部占卜记录，无法撤销。', okText: '清空', danger: true });
      if (!yes) return;
      const list = await all('divinations');
      await Promise.all(list.map((r) => del('divinations', r.id)));
      toast('已清空');
    } }
  ]);
}

/* ---------------- 卡片轮播 ----------------
   左右滑动切换，轻触中央卡确认；两侧卡片缩放淡出，形成层叠感。 */
const PICK_SPACING = 0.56;   // 相邻卡片的水平位移（相对卡片宽度）
const TILE_ROWS = {
  3: [[1, 2, 3]],
  4: [[1, 2], [3, 4]],
  5: [[1, null, 3], [null, 5, null], [2, null, 4]],
  7: [[1, 2, 3], [4, 5, 6], [null, 7, null]],
  9: [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
};

/** 牌阵小样：把位置画成编号小牌，排布按牌阵自己的样式（自定义牌阵可自选） */
function miniLayout(sp) {
  const rows = rowsFor(sp.layoutKind || 'auto', (sp.positions || []).length, sp.layoutCells);
  return el('div', { class: 'pk-rows' }, rows.map((row) => el('div', { class: 'pk-row' },
    row.map((v) => el('span', { class: 'pk-tile' + (v == null ? ' blank' : ''), text: v == null ? '' : String(v) })))));
}

function createPicker({ items, start = 0, kicker, sub, hint, renderCard, onConfirm }) {
  let index = Math.max(0, Math.min(items.length - 1, start));
  let drag = null;

  const cards = [];
  const dots = [];
  const stage = el('div', { class: 'picker-stage' });
  const dotRow = el('div', { class: 'pk-dots' });

  items.forEach((it, i) => {
    cards.push(el('div', { class: 'pk-card', dataset: { i: String(i) } }, renderCard(it, i)));
    stage.appendChild(cards[i]);
    dots.push(el('span', { class: 'pk-dot' }));
    dotRow.appendChild(dots[i]);
  });

  const node = el('div', { class: 'pkbox' }, [
    el('div', { class: 'pk-head' }, [
      el('div', { class: 'pk-kicker', text: kicker }),
      el('div', { class: 'pk-sub', text: sub })
    ]),
    stage,
    dotRow,
    el('div', { class: 'pk-hint', text: hint })
  ]);

  const stepW = () => (cards[0]?.offsetWidth || 240) * PICK_SPACING;

  function layout(dx = 0) {
    const s = stepW();
    const base = index - dx / s;                                       // 连续位置（拖拽时为小数）
    const near = Math.max(0, Math.min(cards.length - 1, Math.round(base)));
    cards.forEach((c, i) => {
      const d = i - base;
      const ad = Math.abs(d);
      c.style.transform = `translate(-50%,0) translateX(${(d * s).toFixed(1)}px)`
        + ` scale(${Math.max(0.74, 1 - ad * 0.13).toFixed(3)}) rotateY(${(-d * 7).toFixed(2)}deg)`;
      c.style.opacity = Math.max(0.14, 1 - ad * 0.42).toFixed(3);
      c.style.zIndex = String(60 - Math.round(ad * 10));
      c.classList.toggle('on', i === near);
    });
    dots.forEach((d, i) => d.classList.toggle('on', i === near));
  }

  function goTo(i) {
    index = Math.max(0, Math.min(cards.length - 1, i));
    layout(0);
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) return;
    const card = e.target.closest('.pk-card');
    drag = { x0: e.clientX, dx: 0, moved: false, i: card ? Number(card.dataset.i) : -1 };
    stage.classList.add('dragging');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function onMove(e) {
    if (!drag) return;
    drag.dx = e.clientX - drag.x0;
    if (Math.abs(drag.dx) > 4) drag.moved = true;
    if (drag.moved) { e.preventDefault(); layout(drag.dx); }
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    if (!drag) return;
    const { moved, dx, i } = drag;
    drag = null;
    stage.classList.remove('dragging');
    if (moved) return goTo(index + Math.round(-dx / stepW()));
    if (i >= 0 && i !== index) return goTo(i);                        // 轻触旁边的卡 → 移到它
    layout(0);
    if (i === index) onConfirm?.(items[index], index);
  }

  stage.addEventListener('pointerdown', onDown);

  const onResize = () => layout(0);
  window.addEventListener('resize', onResize);

  return {
    node,
    layout,
    goTo,
    current: () => items[index],
    destroy: () => window.removeEventListener('resize', onResize)
  };
}

/* ---------------- 小部件 ---------------- */
function stepbar(label, onBack) {
  return el('div', { class: 'row between', style: { marginBottom: '12px' } }, [
    el('button', { class: 'btn sm', onclick: onBack }, [iconImg('IC-CHT-006'), '上一步']),
    el('div', { class: 'small muted ellipsis', style: { textAlign: 'right' }, text: label })
  ]);
}
