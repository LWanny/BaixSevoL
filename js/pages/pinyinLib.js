/* 拼音字卡库 · 独立管理页
   单字库 + 词库（双字/三字/四字/半截话、词性标注）在这里浏览、搜索、筛选；
   自定义词条存 localStorage（zkcx.pinyin.userwords.v1），setUserWords() 后引擎索引立即重建。 */

import { el, openFile, readText } from '../util.js';
import { fullPage } from '../shell.js';
import { toast } from '../ui.js';
import { WORD_POOL } from '../data/pinyinwords.js';
import { WORD_STATS, PINYIN_POOL_SIZE, PINYIN_WORD_SIZE, SLOT_NAMES,
  loadUserWords, setUserWords, normalizeWord } from '../pinyin.js';
import { takePending, parseImportLine } from '../pinyinConfig.js';

const POS_OPTS = [['pn', '代词'], ['tm', '时间'], ['cj', '连接'], ['dv', '程度'],
  ['pt', '语气'], ['vb', '动词'], ['nn', '名词'], ['aj', '形容词']];
const CATS = [
  ['all', '全部'], ['c1', '单字'], ['c2', '双字'], ['c3', '三字'],
  ['c4', '四字+'], ['frag', '半截话'], ['user', '自定义']
];
const STEP = 80;
const lenOf = (w) => [...w.text].length;
/* 队列条目兼容：旧格式纯字符串 / 新格式 {text, py}（试打推得拼音时带上，预填免手打） */
const normPend = (e) => (typeof e === 'string' ? { text: e, py: '' } : (e && e.text ? e : null));

export default async function pagePinyinLib(view) {
  fullPage({ back: true, title: '拼音字卡库' });

  let cat = 'all', pos = 'all', q = '', shown = STEP, fragOn = 0;
  let pend = [];                       // 试打报告跳转带来的缺字队列（逐个预填补词）
  const wrap = el('div', { class: 'page pw-page' });

  /* ---- 统计条 ---- */
  const stats = el('div', { class: 'pw-stats' });

  /* ---- 添加词条 ---- */
  const pyIn = el('input', { class: 'cfg-add-in', type: 'text', placeholder: '拼音（空格分隔，可带声调）' });
  const txtIn = el('input', { class: 'cfg-add-in', type: 'text', placeholder: '汉字（音节数=字数）' });
  const posSel = el('select', { class: 'cfg-add-in' },
    POS_OPTS.map(([v, t]) => el('option', { value: v, text: t })));
  const fragChip = el('button', { class: 'chip', type: 'button', text: '半截话' });
  const addBtn = el('button', { class: 'btn sm primary', type: 'button', text: '加入' });

  const doAdd = () => {
    const w = normalizeWord({ py: pyIn.value, text: txtIn.value, pos: posSel.value, frag: fragOn });
    if (!w) { toast('格式有误：拼音空格分隔、音节数须等于汉字数（如 xi huan ni / 喜欢你）'); return; }
    if (WORD_POOL.some((x) => x.text === w.text || x.py === w.py)) { toast('这个词库里已经有了'); return; }
    setUserWords([...loadUserWords(), w]);
    pyIn.value = ''; fragOn = 0; fragChip.classList.remove('on');
    if (pend.length) {                       // 缺字补词：消耗当前预填的，接着填下一个（带拼音）
      pend.shift();
      if (pend.length) {
        txtIn.value = pend[0].text;
        pyIn.value = pend[0].py || '';
        toast(`已加入：${w.text}（缺字还剩 ${pend.length} 个）`);
        pyIn.focus();
      } else {
        txtIn.value = '';
        toast(`已加入：${w.text}，缺字补词完成`);
      }
      paintPend();
    } else {
      txtIn.value = '';
      toast(`已加入：${w.text}`);
    }
    cat = 'user'; shown = STEP; render();
  };
  addBtn.addEventListener('click', doAdd);
  txtIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  pyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  fragChip.addEventListener('click', () => { fragOn = fragOn ? 0 : 1; fragChip.classList.toggle('on', !!fragOn); });

  const ADD_H0 = '加入自定义词条（实时并入抽词与句式模板）';
  const addH = el('div', { class: 'pw-add-h', text: ADD_H0 });
  const paintPend = () => {
    addH.textContent = pend.length ? `${ADD_H0} · 缺字补词中（还剩 ${pend.length} 个待补）` : ADD_H0;
    addH.classList.toggle('pw-pend', !!pend.length);
  };
  const addCard = el('div', { class: 'pw-add' }, [
    addH,
    el('div', { class: 'pw-add-row' }, [pyIn, txtIn]),
    el('div', { class: 'pw-add-row' }, [posSel, fragChip, addBtn])
  ]);

  /* ---- 批量导入 ---- */
  const impText = el('textarea', { class: 'pw-imp-ta', rows: '6',
    placeholder: '每行一条，写法任选：\n喜欢 xi huan vb\nxi huan 喜欢\nxi huan,喜欢,动词\n尾字段可写词性（vb / 动词 …）或 半截话；# 开头是注释' });
  const impRes = el('div', { class: 'pw-imp-res' });
  const impBtn = el('button', { class: 'btn sm primary', type: 'button', text: '批量导入' });
  const fileBtn = el('button', { class: 'btn sm', type: 'button', text: '从文件导入 (.txt)' });
  const doImport = () => {
    const lines = impText.value.split(/\r?\n/);
    let dup = 0, err = 0; const errs = []; const add = [];
    const texts = new Set(WORD_POOL.map((w) => w.text));
    const pys = new Set(WORD_POOL.map((w) => w.py));
    const seenT = new Set(), seenP = new Set();
    lines.forEach((ln, i) => {
      const t = ln.trim();
      if (!t || t.startsWith('#')) return;
      const cand = parseImportLine(t);
      if (!cand) { err++; errs.push(`第 ${i + 1} 行无法识别（至少要有汉字+拼音）`); return; }
      const w = normalizeWord(cand);
      if (!w) { err++; errs.push(`第 ${i + 1} 行「${t.slice(0, 24)}」：拼音空格分隔且音节数=字数`); return; }
      if (texts.has(w.text) || pys.has(w.py)) { dup++; return; }
      if (seenT.has(w.text) || seenP.has(w.py)) { dup++; return; }
      seenT.add(w.text); seenP.add(w.py); add.push(w);
    });
    if (add.length) setUserWords([...loadUserWords(), ...add]);
    impRes.innerHTML = '';
    impRes.appendChild(el('div', { class: 'pw-imp-sum',
      text: `成功 ${add.length} 条${dup ? ` · 重复跳过 ${dup}` : ''}${err ? ` · 失败 ${err}` : ''}` }));
    for (const e of errs.slice(0, 8)) impRes.appendChild(el('div', { class: 'pw-imp-err', text: e }));
    if (add.length) { render(); toast(`批量导入成功 ${add.length} 条`); impText.value = ''; }
    else toast('没有可导入的条目');
  };
  impBtn.addEventListener('click', doImport);
  fileBtn.addEventListener('click', async () => {
    const f = await openFile({ accept: '.txt,text/plain' });
    if (!f) return;
    impText.value = await readText(f);
    doImport();
  });
  const impCard = el('div', { class: 'pw-add pw-imp' }, [
    el('div', { class: 'pw-add-h', text: '批量导入（每行一条，导入后立即并入引擎）' }),
    impText,
    el('div', { class: 'pw-add-row' }, [impBtn, fileBtn]),
    impRes
  ]);

  /* ---- 搜索 + 分类筛选 ---- */
  const search = el('input', { class: 'cfg-add-in pw-search', type: 'search', placeholder: '搜索汉字 / 无声调拼音' });
  search.addEventListener('input', () => { q = search.value; shown = STEP; render(); });
  const chips = el('div', { class: 'seg-row pw-cats' });
  const posSel2 = el('select', { class: 'cfg-add-in pw-pos' },
    [el('option', { value: 'all', text: '全部词性' }),
      ...POS_OPTS.map(([v, t]) => el('option', { value: v, text: t }))]);
  posSel2.addEventListener('change', () => { pos = posSel2.value; shown = STEP; render(); });

  /* ---- 列表 + 底部 ---- */
  const list = el('div', { class: 'pw-list' });
  const more = el('div', { class: 'pw-more' });
  const del = (w) => {
    setUserWords(loadUserWords().filter((x) => !(x.text === w.text && x.py === w.py)));
    render();
    toast('已删除');
  };

  function match(w) {
    if (cat === 'user' && !w.u) return false;
    if (cat === 'frag' && !w.frag) return false;
    if (cat === 'c1' && (w.frag || lenOf(w) !== 1)) return false;
    if (cat === 'c2' && (w.frag || lenOf(w) !== 2)) return false;
    if (cat === 'c3' && (w.frag || lenOf(w) !== 3)) return false;
    if (cat === 'c4' && (w.frag || lenOf(w) < 4)) return false;
    if (pos !== 'all' && w.pos !== pos) return false;
    if (q) {
      const s = q.trim().toLowerCase();
      if (s && !w.py.includes(s) && !w.text.includes(q.trim())) return false;
    }
    return true;
  }

  function render() {
    const st = WORD_STATS;
    stats.textContent = `共 ${PINYIN_WORD_SIZE} 条 · 内置 ${PINYIN_WORD_SIZE - st.user} · 自定义 ${st.user}`
      + `　|　单字库 ${PINYIN_POOL_SIZE} 个 · 单字词 ${st.one} · 双字 ${st.two} · 三字 ${st.three} · 四字+ ${st.four} · 半截话 ${st.frag}`;

    chips.innerHTML = '';
    for (const [k, t] of CATS) {
      const on = cat === k;
      chips.appendChild(el('div', { class: 'chip' + (on ? ' on' : ''), text: t,
        onclick: () => { cat = k; shown = STEP; render(); } }));
    }

    const rows = WORD_POOL.filter(match);
    list.innerHTML = '';
    if (!rows.length) {
      list.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'e-h', text: '没有匹配的词条' }),
        el('div', { class: 'e-p', text: '换个分类或搜索词，也可以在上面添加新词条' })
      ]));
    }
    for (const w of rows.slice(0, shown)) {
      const badges = [
        el('span', { class: 'pw-tag' + (w.pos === 'other' ? '' : ' pos'), text: SLOT_NAMES[w.pos] || '其他' })
      ];
      if (w.frag) badges.push(el('span', { class: 'pw-tag frag', text: '半截话' }));
      badges.push(el('span', { class: 'pw-tag' + (w.u ? ' own' : ''), text: w.u ? '自定义' : '内置' }));
      list.appendChild(el('div', { class: 'pw-row' }, [
        el('div', { class: 'pw-main' }, [
          el('div', { class: 'pw-t' }, [el('span', { class: 'pw-txt', text: w.text }), ...badges]),
          el('div', { class: 'pw-p', text: w.py })
        ]),
        w.u ? el('button', { class: 'pw-del', text: '✕', onclick: () => del(w) }) : null
      ]));
    }
    more.innerHTML = '';
    if (rows.length > shown) {
      more.appendChild(el('button', { class: 'btn block', text: `加载更多（已显示 ${shown} / ${rows.length}）`,
        onclick: () => { shown += STEP; render(); } }));
    }
  }

  wrap.appendChild(stats);
  wrap.appendChild(addCard);
  wrap.appendChild(impCard);
  wrap.appendChild(el('div', { class: 'pw-filters' }, [search]));
  wrap.appendChild(chips);
  wrap.appendChild(el('div', { class: 'pw-filters' }, [posSel2]));
  wrap.appendChild(list);
  wrap.appendChild(more);
  /* 试打报告缺字交接：预填第一个缺字与其拼音（只窥不取，添加成功才消耗队列） */
  pend = takePending().map(normPend).filter(Boolean);
  if (pend.length) {
    txtIn.value = pend[0].text;
    if (pend[0].py) pyIn.value = pend[0].py;
  }
  paintPend();
  render();
  view.appendChild(wrap);
}
