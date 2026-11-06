/* 装扮 · 全局背景 / 聊天壁纸 / 气泡样式 */

import { el, openFile, compressImage } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { state, saveSkin, applySkin, pageBgFor } from '../state.js';
import { saveMedia, mediaURL, delMedia } from '../media.js';
import { toast, confirmBox, sheet } from '../ui.js';

const BG_PRESETS = ['#f7f7f6', '#ffffff', '#f2f2f1', '#ececea', '#e6e6e4', '#dcdcda', '#1a1c20'];

let curView = null;

export default async function pageSkin(view) {
  curView = view;
  build(view);
}

function build(view) {
  view.innerHTML = '';
  fullPage({ back: true, title: '装扮', sub: '改完即时生效' });

  const wrap = el('div', { class: 'page' });
  const s = state.skin;

  /* ---- 整体背景 ---- */
  wrap.appendChild(section('整体背景', el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [
      el('label', { text: '背景颜色' }),
      el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '8px' } }, BG_PRESETS.map((c) =>
        el('span', { class: 'chip' + (s.globalBgColor === c ? ' on' : ''), style: { background: c, width: '30px', height: '22px' }, title: c, dataset: { val: c }, onclick: async (e) => {
          s.globalBgColor = c; await saveSkin(); await applySkin(); refreshChips(e.target.parentElement, c);
        } }))),
      el('input', { class: 'input', type: 'color', value: s.globalBgColor || '#f7f7f6', oninput: async (e) => { s.globalBgColor = e.target.value; await saveSkin(); await applySkin(); } })
    ]),
    imagePicker('全局背景图', '全局背景图片会铺满整个应用。', s.globalBgImageId, async (id) => { s.globalBgImageId = id; await saveSkin(); await applySkin(); }, 'bg'),
    bgAdjust('globalBgX', 'globalBgY', 'globalBgZoom', s.globalBgImageId, 'globalBgImgOp')
  ])));

  /* ---- 页面背景：每个软件单独设置，没设置的跟随全局 ---- */
  wrap.appendChild(section('页面背景', el('div', { class: 'card' }, [
    el('div', { class: 'small muted', style: { margin: '0 0 8px' }, text: '给某个软件单独设背景图 / 颜色 / 透明度；带色的表示已单独设置，没设置的跟着上面「整体背景」走。' }),
    el('div', { class: 'row wrap', style: { gap: '6px' } }, PAGE_BG_LIST.map(([p, label]) =>
      el('span', {
        class: 'chip' + ((s.pageBgs && s.pageBgs[p]) ? ' on' : ''),
        text: label, title: p,
        onclick: () => openPageBg(p, label)
      })))
  ])));

  /* ---- 聊天相关（壁纸 / 气泡 / 头像）已搬进「消息 → 更多 → 聊天装扮」 ---- */

  /* ---- 重置 ---- */
  wrap.appendChild(el('div', { style: { padding: '0 2px 20px' } }, [
    el('button', { class: 'btn block', onclick: async () => {
      const yes = await confirmBox({ title: '恢复默认装扮', text: '背景、壁纸与气泡样式都会回到初始值。头像不会被清除。', okText: '恢复默认' });
      if (!yes) return;
      const keepMe = s.avatarMeId;
      Object.assign(s, {
        globalBgColor: '#f7f7f6', globalBgImageId: null, chatWallpaperId: null,
        bubbleMe: 'linear-gradient(135deg,#1c1e22,#3c4048)', bubbleMeTxt: '#ffffff',
        bubbleTa: '#ffffff', bubbleTaTxt: '#16181c', bubbleRadius: 15,
        avatarShape: 'rounded', bubbleCss: '', avatarMeId: keepMe,
        globalBgX: 50, globalBgY: 50, globalBgZoom: 100, globalBgImgOp: 100,
        pageBgs: {},
        chatWallX: 50, chatWallY: 50, chatWallZoom: 100
      });
      await saveSkin(); await applySkin();
      renderCurrent();
      toast('已恢复默认装扮');
    } }, ['恢复默认装扮'])
  ]));

  view.appendChild(wrap);
}

/* 背景图 / 壁纸的位置、缩放与透明度（50 = 居中，仅在有图时生效）
   src：要改的对象（默认 state.skin，每页背景编辑传草稿）；onChange：改完怎么保存（默认存整包装扮） */
export function bgAdjust(xKey, yKey, zoomKey, hasImage, opKey = null, src = null, onChange = null) {
  const s = src || state.skin;
  const row = (label, key, min, max) => {
    const val = el('span', { class: 'pval', text: `${s[key]}%` });
    const r = el('input', { type: 'range', min: String(min), max: String(max), value: String(s[key]) });
    r.addEventListener('input', async () => {
      s[key] = Number(r.value);
      val.textContent = r.value + '%';
      if (onChange) await onChange();
      else { await saveSkin(); await applySkin(); }
    });
    return el('div', { class: 'param' }, [
      el('div', { class: 'pname' }, [el('span', { text: label })]),
      val,
      el('div', { class: 'row', style: { flex: '1 1 100%' } }, [r])
    ]);
  };
  const rows = [
    row('水平位置（50 = 居中）', xKey, 0, 100),
    row('垂直位置（50 = 居中）', yKey, 0, 100),
    row('缩放比例（100 = 铺满）', zoomKey, 50, 200)
  ];
  if (opKey) rows.push(row('透明度（100 = 原样，越小越淡）', opKey, 0, 100));
  return el('div', {}, [
    hasImage ? null : el('div', { class: 'small muted', style: { margin: '0 0 6px' }, text: '上传图片后下面几项才生效。' }),
    ...rows
  ]);
}

/* ---------------- 小部件 ---------------- */

/* 气泡颜色：马卡龙预设 + HSV 自定义（已搬进聊天装扮面板，此处保留 openHsvSheet 供其调用） */

export function openHsvSheet(side) {
  const s = state.skin;
  const key = side === 'me' ? 'bubbleMe' : 'bubbleTa';
  const txtKey = side === 'me' ? 'bubbleMeTxt' : 'bubbleTaTxt';
  const init = /^#[0-9a-fA-F]{6}$/.test(s[key] || '') ? s[key] : '#ffd8e4';
  const hsv = hexToHsv(init);

  const preview = el('div', { class: 'hsv-prev' });
  const code = el('div', { class: 'hsv-code' });
  const paint = () => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    preview.style.background = hex;
    code.textContent = hex;
  };

  const mkRow = (label, min, max, get, set, bgFn) => {
    const out = el('span', { class: 'pval', text: String(get()) });
    const r = el('input', { type: 'range', min: String(min), max: String(max), value: String(get()) });
    const setBg = () => { if (bgFn) r.style.setProperty('--grad', typeof bgFn === 'function' ? bgFn() : bgFn); };
    setBg();
    r.addEventListener('input', () => {
      set(Number(r.value));
      out.textContent = r.value;
      setBg();
      paint();
    });
    return el('div', { class: 'hsv-row' }, [el('div', { class: 'hsv-l', text: label }), r, out]);
  };

  const hueBg = 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
  const satBg = () => `linear-gradient(90deg,hsl(${hsv.h},0%,${Math.max(20, hsv.v)}%),hsl(${hsv.h},100%,${Math.max(20, hsv.v)}%))`;
  const valBg = () => `linear-gradient(90deg,#000,hsl(${hsv.h},${hsv.s}%,50%))`;

  const apply = el('button', { class: 'btn primary', style: { flex: '1' }, onclick: async () => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    s[key] = hex;
    s[txtKey] = textFor(hex);
    await saveSkin(); await applySkin();
    ctl.close();
    toast('已应用颜色');
  } }, ['应用']);

  const body = el('div', {}, [
    el('div', { class: 'hsv-top' }, [preview, code]),
    mkRow('色相', 0, 360, () => hsv.h, (v) => { hsv.h = v; }, hueBg),
    mkRow('饱和度', 0, 100, () => hsv.s, (v) => { hsv.s = v; }, satBg),
    mkRow('明度', 0, 100, () => hsv.v, (v) => { hsv.v = v; }, valBg)
  ]);

  const ctl = sheet({
    title: side === 'me' ? '我方气泡颜色' : 'TA 气泡颜色',
    node: body,
    foot: apply
  });
  paint();
}

function hexToHsv(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  if (d) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  return {
    h: Math.round(hh),
    s: Math.round((max ? d / max : 0) * 100),
    v: Math.round(max * 100)
  };
}

function hsvToHex(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  const seg = Math.floor(h / 60) % 6;
  if (seg === 0) { r = c; g = x; }
  else if (seg === 1) { r = x; g = c; }
  else if (seg === 2) { g = c; b = x; }
  else if (seg === 3) { g = x; b = c; }
  else if (seg === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

/* 浅色气泡配深色字，深色气泡配白字 */
function textFor(color) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color || '')) return '#ffffff';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#16181c' : '#ffffff';
}

function refreshChips(container, active) {
  if (!container) return;
  Array.from(container.querySelectorAll('.chip')).forEach((c) => c.classList.toggle('on', c.title === active || c.dataset.val === active));
}

/* ---------------- 页面背景：每个软件可单独设置（不设置就跟随全局） ---------------- */
const PAGE_BG_LIST = [
  ['/mailbox', '信箱'], ['/moments', '朋友圈'], ['/cards', '字卡库'], ['/divine', '占卜'],
  ['/decks', '牌面图鉴'], ['/music', '音乐'], ['/shop', '商城'], ['/store', '储藏室'], ['/ledger', '记账'],
  ['/ledger-stats', '记账统计'], ['/games', '游戏厅'], ['/favorites', '收藏'], ['/anniversary', '纪念日'],
  ['/books', '书架'], ['/watch', '观影'], ['/xhs', '小粉书'], ['/pdd', '拼夕夕'],
  ['/album', '相册'], ['/memo', '备忘录'], ['/fate', '抉择'], ['/period', '经期记录'],
  ['/pomodoro', '番茄钟'], ['/tong', '通牌'], ['/echo', '回声'], ['/inspiration', '灵感拾取'],
  ['/compose', '写信']
];

/** 打开某个软件的背景编辑面板（改完立刻按该页背景预览） */
function openPageBg(path, label) {
  const sk = state.skin;
  let dirty = false;
  const draft = { ...pageBgFor(path) };

  const commit = async () => {
    dirty = true;
    sk.pageBgs = sk.pageBgs || {};
    sk.pageBgs[path] = {
      imgId: draft.imgId || null,
      color: draft.color || '',
      op: Number(draft.op), zoom: Number(draft.zoom),
      x: Number(draft.x), y: Number(draft.y)
    };
    await saveSkin();
    await applySkin(path);      // 预览目标页的背景
  };

  /* 图片：只换绑定，不删媒体（这张图可能和全局 / 别的页面共用） */
  const imgBox = el('div', { class: 'field' }, [el('label', { text: '背景图片' })]);
  const preview = el('div', { style: { marginBottom: '8px', borderRadius: '10px', overflow: 'hidden', background: '#f0f0ee' } });
  imgBox.appendChild(preview);
  const pickBtn = el('button', { class: 'btn sm', onclick: async () => {
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob, w, h } = await compressImage(f, 1600, 0.86);
    const id = await saveMedia(blob, { type: 'image', w, h, source: 'pagebg' });
    draft.imgId = id;
    paint();
    await commit();
    toast('已应用');
  } }, [draft.imgId ? '更换' : '选择图片']);
  const rmBtn = el('button', { class: 'btn sm', onclick: async () => {
    draft.imgId = null;
    paint();
    await commit();
    toast('已移除图片');
  } }, ['移除图片']);
  imgBox.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [pickBtn, rmBtn]));
  imgBox.appendChild(el('div', { class: 'hint', text: '不选图就只用下面的颜色。「移除图片」只是解除本页绑定，不会删掉共用的图片。' }));

  const paint = () => {
    preview.innerHTML = '';
    const has = !!draft.imgId;
    preview.style.display = has ? 'block' : 'none';
    preview.style.height = has ? '120px' : '0';
    pickBtn.textContent = has ? '更换' : '选择图片';
    rmBtn.style.display = has ? '' : 'none';
    if (has) mediaURL(draft.imgId).then((u) => { if (u && draft.imgId) preview.appendChild(el('img', { src: u, style: { width: '100%', height: '100%', objectFit: 'cover' } })); });
  };
  paint();

  /* 颜色 */
  const colorInput = el('input', { class: 'input', type: 'color', value: draft.color || '#f7f7f6', oninput: async (e) => { draft.color = e.target.value; await commit(); } });
  const chips = el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '8px' } }, BG_PRESETS.map((c) =>
    el('span', {
      class: 'chip' + ((draft.color || '') === c ? ' on' : ''), style: { background: c, width: '30px', height: '22px' }, title: c, dataset: { val: c },
      onclick: async (e) => { draft.color = c; colorInput.value = c; await commit(); refreshChips(e.target.parentElement, c); }
    })));
  const colorField = el('div', { class: 'field' }, [el('label', { text: '背景颜色' }), chips, colorInput]);

  sheet({
    title: '页面背景 · ' + label,
    node: el('div', {}, [
      el('div', { class: 'small muted', style: { margin: '0 0 8px' }, text: '只改「' + label + '」这一个页面，改完立刻预览，其它页面不受影响。' }),
      imgBox,
      colorField,
      bgAdjust('x', 'y', 'zoom', !!draft.imgId, 'op', draft, commit)
    ]),
    actions: [{
      label: '恢复跟随全局背景',
      sub: '取消这个页面的单独设置',
      danger: true,
      onSelect: async () => {
        dirty = true;
        delete (sk.pageBgs || {})[path];
        await saveSkin();
        await applySkin();
        toast('已恢复跟随全局');
      }
    }],
    onClose: () => {
      applySkin().catch(() => {});   // 关掉后回到装扮页自己的背景
      if (dirty) renderCurrent();    // 刷新「已单独设置」的标记
    }
  });
}

function imagePicker(label, desc, mediaId, onSet, kind) {
  const box = el('div', { class: 'field' });
  box.appendChild(el('label', { text: label }));

  const preview = el('div', { style: { marginBottom: '8px', borderRadius: '10px', overflow: 'hidden', height: mediaId ? '120px' : '0', background: '#f0f0ee', display: mediaId ? 'block' : 'none' } });
  if (mediaId) mediaURL(mediaId).then((u) => { if (u) preview.appendChild(el('img', { src: u, style: { width: '100%', height: '100%', objectFit: 'cover' } })); });
  box.appendChild(preview);

  box.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [
    el('button', { class: 'btn sm', onclick: async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob, w, h } = await compressImage(f, 1600, 0.86);
      const id = await saveMedia(blob, { type: 'image', w, h, source: 'skin' });
      await onSet(id);
      toast('已应用');
    } }, mediaId ? ['更换'] : ['选择图片']),
    mediaId ? el('button', { class: 'btn sm', onclick: async () => {
      await delMedia(mediaId); await onSet(null); toast('已移除');
    } }, ['移除']) : null
  ]));

  if (desc) box.appendChild(el('div', { class: 'hint', text: desc }));
  void kind;
  return box;
}

function section(title, node) {
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: title })]),
    node
  ]);
}

function renderCurrent() {
  if (curView) build(curView);
}
