/* 拼音字卡库 · 独立管理页
   单字库 + 词库（双字/三字/四字/半截话、词性标注）在这里浏览、搜索、筛选；
   自定义词条存 localStorage（zkcx.pinyin.userwords.v1），setUserWords() 后引擎索引立即重建。 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { toast } from '../ui.js';
import { WORD_POOL } from '../data/pinyinwords.js';
import { WORD_STATS, PINYIN_POOL_SIZE, PINYIN_WORD_SIZE, SLOT_NAMES,
  loadUserWords, setUserWords, normalizeWord } from '../pinyin.js';

const POS_OPTS = [['pn', '代词'], ['tm', '时间'], ['cj', '连接'], ['dv', '程度'],
  ['pt', '语气'], ['vb', '动词'], ['nn', '名词'], ['aj', '形容词']];
const CATS = [
  ['all', '全部'], ['c1', '单字'], ['c2', '双字'], ['c3', '三字'],
  ['c4', '四字+'], ['frag', '半截话'], ['user', '自定义']
];
const STEP = 80;
const lenOf = (w) => [...w.text].length;

export default async function pagePinyinLib(view) {
  fullPage({ back: true, title: '拼音字卡库' });

  let cat = 'all', pos = 'all', q = '', shown = STEP, fragOn = 0;
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
    pyIn.value = ''; txtIn.value = ''; fragOn = 0; fragChip.classList.remove('on');
    cat = 'user'; shown = STEP; render();
    toast(`已加入：${w.text}`);
  };
  addBtn.addEventListener('click', doAdd);
  txtIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  pyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  fragChip.addEventListener('click', () => { fragOn = fragOn ? 0 : 1; fragChip.classList.toggle('on', !!fragOn); });

  const addCard = el('div', { class: 'pw-add' }, [
    el('div', { class: 'pw-add-h', text: '加入自定义词条（实时并入抽词与句式模板）' }),
    el('div', { class: 'pw-add-row' }, [pyIn, txtIn]),
    el('div', { class: 'pw-add-row' }, [posSel, fragChip, addBtn])
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
  wrap.appendChild(el('div', { class: 'pw-filters' }, [search]));
  wrap.appendChild(chips);
  wrap.appendChild(el('div', { class: 'pw-filters' }, [posSel2]));
  wrap.appendChild(list);
  wrap.appendChild(more);
  render();
  view.appendChild(wrap);
}
