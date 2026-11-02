/* 小粉书 · 主页 / 搜索 / 笔记 / 一起看视频
   内容完全由本地字卡与已有记录生成，不请求外部接口。 */

import { el, rndInt, chance, pick } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { all, put, get, kvGet, kvSet } from '../store.js';
import { sheet, actionSheet, toast } from '../ui.js';
import { state } from '../state.js';
import {
  loadXhsSettings, saveXhsSettings, ensureFeed, searchPosts, getSearchHistory,
  taSearchVideo, taPostNow, createLinkPost, composeDanmaku, isBlocked, countFmt, dayKey
} from '../xhsdata.js';

const TABS = [
  { key: 'rec', label: '推荐' },
  { key: 'hot', label: '热门' },
  { key: 'follow', label: '关注' },
  { key: 'his', label: '他的' }
];

let viewEl = null;
let settings = null;
let rows = [];
let following = [];
let tab = 'rec';
let mode = 'feed';
let query = '';
let results = [];
let picked = null;
let searchInput = null;

export default async function pageXhs(view, params = {}) {
  viewEl = view;
  fullPage({ back: true, title: '小粉书', sub: '小红书 · 站 粉 版' });

  const bar = document.getElementById('topbar');
  bar.appendChild(el('button', {
    class: 'tb-btn', title: '搜索',
    onclick: () => {
      mode = 'feed';
      renderPage();
      setTimeout(() => searchInput && searchInput.focus(), 0);
    }
  }, [iconImg('IC-CRD-010')]));
  bar.appendChild(el('button', {
    class: 'tb-btn', title: '设置',
    onclick: () => openSettings()
  }, [iconImg('IC-MIO-001')]));

  settings = await loadXhsSettings();
  following = await kvGet('xhsFollowing', []);
  historyList = await getSearchHistory();
  await ensureFeed();
  await ensureTaPick();
  rows = await all('xhsPosts');

  renderPage();
  if (params.post) await openPostById(params.post);
}

/* ============================================================
   数据
   ============================================================ */
async function loadRows() {
  rows = await all('xhsPosts');
  following = await kvGet('xhsFollowing', []);
}

async function ensureTaPick() {
  const day = dayKey();
  const saved = await kvGet('xhsTaPick', null);
  if (saved && saved.day === day) {
    const post = await get('xhsPosts', saved.postId);
    if (post) { picked = { ...saved, post }; return; }
  }
  const post = await taSearchVideo(settings);
  picked = { day, postId: post.id, keyword: post.keyword, from: post.from, post };
  await kvSet('xhsTaPick', { day, postId: post.id, keyword: post.keyword, from: post.from });
}

function clean(p) {
  return !isBlocked(`${p.title} ${p.body} ${(p.tags || []).join(' ')}`, settings);
}

function visibleRows() {
  const list = rows.filter(clean);
  if (tab === 'hot') return list.filter((p) => !p.private).sort((a, b) => b.likes - a.likes);
  if (tab === 'follow') return list.filter((p) => !p.private && following.includes(p.authorName));
  if (tab === 'his') return list.filter((p) => p.author === 'ta').sort((a, b) => b.ts - a.ts);
  return list.slice().sort((a, b) => b.ts - a.ts);
}

/* ============================================================
   页面
   ============================================================ */
function renderPage() {
  viewEl.innerHTML = '';
  const page = el('div', { class: 'page xhs' });

  page.appendChild(searchBar());
  if (mode === 'search') {
    page.appendChild(searchHead());
    page.appendChild(grid(results.map((p) => rows.find((r) => r.id === p.id) || p), '没有找到相关笔记'));
  } else {
    page.appendChild(historyChips());
    page.appendChild(tabChips());
    if (tab === 'rec' && picked) page.appendChild(pickStrip());
    page.appendChild(grid(visibleRows(), '这里还没有笔记'));
  }

  page.appendChild(el('button', {
    class: 'xhs-plus', title: '一起看',
    onclick: () => openPlus()
  }, [iconImg('IC-MIO-022')]));

  viewEl.appendChild(page);
}

function searchBar() {
  searchInput = el('input', {
    class: 'xhs-search-input', type: 'search', placeholder: '搜索小红书',
    value: query
  });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(searchInput.value); });
  return el('div', { class: 'xhs-search' }, [
    iconImg('IC-CRD-010'),
    searchInput,
    el('button', { class: 'xhs-search-go', onclick: () => doSearch(searchInput.value) }, ['搜索'])
  ]);
}

function historyChips() {
  if (!historyList.length) return el('div', { class: 'xhs-history' });
  const box = el('div', { class: 'xhs-history' });
  historyList.slice(0, 8).forEach((h) => {
    box.appendChild(el('button', {
      class: 'xhs-hchip', type: 'button',
      onclick: () => { query = h.q; doSearch(h.q); }
    }, [h.q]));
  });
  return box;
}

let historyList = [];

function tabChips() {
  const box = el('div', { class: 'xhs-tabs' });
  TABS.forEach((t) => {
    box.appendChild(el('button', {
      class: 'xhs-tab' + (tab === t.key ? ' on' : ''), type: 'button',
      onclick: () => { mode = 'feed'; tab = t.key; renderPage(); }
    }, [t.label]));
  });
  return box;
}

function searchHead() {
  return el('div', { class: 'xhs-search-head' }, [
    el('div', { class: 'xhs-search-q', text: `搜索「${query}」` }),
    el('button', {
      class: 'xhs-clear', type: 'button',
      onclick: () => { mode = 'feed'; query = ''; renderPage(); }
    }, ['清除'])
  ]);
}

function pickStrip() {
  const p = rows.find((r) => r.id === picked.postId) || picked.post;
  if (!p || !clean(p)) return el('div');
  return el('div', {
    class: 'xhs-pick',
    onclick: () => openVideo(p, { together: true })
  }, [
    el('div', { class: 'xhs-pick-cover', style: { background: `linear-gradient(145deg,${p.cover.a},${p.cover.b})` }, text: p.cover.g }),
    el('div', { class: 'xhs-pick-main' }, [
      el('div', { class: 'xhs-pick-h' }, [
        iconImg('IC-MOM-005'),
        el('span', { text: `他刚搜到一条视频 · ${picked.from}` })
      ]),
      el('div', { class: 'xhs-pick-k', text: p.keyword ? `「${p.keyword}」` : p.title }),
      el('div', { class: 'xhs-pick-s', text: '点一下，和他一起看' })
    ]),
    iconImg('IC-MIO-004', 'chev')
  ]);
}

function grid(list, emptyText) {
  if (!list.length) {
    return el('div', { class: 'empty xhs-empty' }, [
      iconImg('IC-MOM-005'),
      el('div', { class: 'e-h', text: emptyText }),
      el('div', { class: 'e-p', text: '换个词搜搜，或者点中间的加号一起看' })
    ]);
  }
  const g = el('div', { class: 'xhs-grid' });
  list.forEach((p) => g.appendChild(card(p)));
  return g;
}

function card(p) {
  return el('div', {
    class: 'xhs-card',
    onclick: () => (p.kind === 'video' ? openVideo(p) : openDetail(p))
  }, [
    cover(p),
    el('div', { class: 'xhs-card-t', text: p.title }),
    el('div', { class: 'xhs-card-b' }, [
      el('span', { class: 'xhs-card-a', text: p.authorName }),
      el('span', { class: 'xhs-card-l' }, [iconImg('IC-MOM-003'), countFmt(p.likes)])
    ])
  ]);
}

function cover(p, extraClass = '') {
  return el('div', {
    class: 'xhs-cover' + (extraClass ? ' ' + extraClass : ''),
    style: { background: `linear-gradient(145deg,${p.cover.a},${p.cover.b})` }
  }, [
    el('div', { class: 'xhs-cover-g', text: p.cover.g }),
    el('div', { class: 'xhs-cover-l', text: p.cover.label }),
    p.kind === 'video' ? el('span', { class: 'xhs-kind' }, [iconImg('IC-MIO-029'), '视频']) : null,
    p.private ? el('span', { class: 'xhs-private', text: '仅自己可见' }) : null
  ]);
}

/* ============================================================
   搜索
   ============================================================ */
async function doSearch(q) {
  const word = String(q || '').trim();
  if (!word) { mode = 'feed'; query = ''; renderPage(); return; }
  query = word;
  mode = 'search';
  const found = await searchPosts(word);
  await loadRows();
  results = found.map((p) => rows.find((r) => r.id === p.id) || p);
  historyList = await getSearchHistory();
  renderPage();
  viewEl.scrollTop = 0;
}

/* ============================================================
   笔记详情
   ============================================================ */
async function openDetail(p) {
  const { panel, close } = overlay('xhs-detail');
  panel.appendChild(detailHead(close));

  const scroll = el('div', { class: 'xhs-d-scroll' });
  scroll.appendChild(cover(p, 'detail'));
  scroll.appendChild(el('div', { class: 'xhs-d-title', text: p.title }));

  const authorRow = el('div', { class: 'xhs-d-author' }, [
    el('div', { class: 'xhs-d-av', text: p.authorName.slice(0, 1) }),
    el('div', { class: 'xhs-d-an' }, [
      el('div', { text: p.authorName }),
      el('div', { class: 'xhs-d-time', text: p.private ? '仅自己可见' : '小粉书 · 笔记' })
    ]),
    followBtn(p)
  ]);
  scroll.appendChild(authorRow);
  scroll.appendChild(el('div', { class: 'xhs-d-body', text: p.body }));

  if ((p.tags || []).length) {
    const tags = el('div', { class: 'xhs-d-tags' });
    p.tags.forEach((t) => tags.appendChild(el('span', { class: 'xhs-tag', text: '#' + t })));
    scroll.appendChild(tags);
  }

  if (p.kind === 'video') {
    scroll.appendChild(el('button', {
      class: 'btn primary xhs-watch', onclick: () => { close(); openVideo(p); }
    }, ['和他一起看这条视频']));
  }

  panel.appendChild(scroll);
  panel.appendChild(el('div', { class: 'xhs-d-foot' }, [actionRow(p)]));
}

function detailHead(close) {
  return el('div', { class: 'xhs-d-head' }, [
    el('button', { class: 'tb-btn', title: '返回', onclick: close }, [iconImg('IC-CHT-006')]),
    el('div', { class: 'xhs-d-head-t', text: '笔记' }),
    el('span', { class: 'xhs-d-head-gap' })
  ]);
}

function followBtn(p) {
  const on = following.includes(p.authorName);
  return el('button', {
    class: 'xhs-follow' + (on ? ' on' : ''), type: 'button', text: on ? '已关注' : '关注',
    onclick: async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      await toggleFollow(p.authorName);
      btn.classList.toggle('on', following.includes(p.authorName));
      btn.textContent = following.includes(p.authorName) ? '已关注' : '关注';
    }
  });
}

async function toggleFollow(name) {
  let list = await kvGet('xhsFollowing', []);
  if (!Array.isArray(list)) list = [];
  if (list.includes(name)) list = list.filter((x) => x !== name);
  else list.push(name);
  await kvSet('xhsFollowing', list);
  following = list;
}

/* 点赞 / 收藏 */
function actionRow(p) {
  const likeBtn = el('button', {
    class: 'xhs-act' + (p.likedByMe ? ' on' : ''), type: 'button',
    onclick: () => { toggleLike(p); sync(); }
  }, [iconImg('IC-MOM-003'), el('span', { class: 'n', text: countFmt(p.likes) })]);
  const saveBtn = el('button', {
    class: 'xhs-act' + (p.savedByMe ? ' on' : ''), type: 'button',
    onclick: () => { toggleSave(p); sync(); }
  }, [iconImg('IC-MIO-020'), el('span', { class: 'n', text: countFmt(p.saves) })]);

  function sync() {
    likeBtn.classList.toggle('on', p.likedByMe || p.likedByTa);
    saveBtn.classList.toggle('on', p.savedByMe || p.savedByTa);
    likeBtn.querySelector('.n').textContent = countFmt(p.likes);
    saveBtn.querySelector('.n').textContent = countFmt(p.saves);
  }

  return el('div', { class: 'xhs-acts' }, [likeBtn, saveBtn, el('span', { class: 'xhs-acts-sp' })]);
}

async function toggleLike(p) {
  p.likedByMe = !p.likedByMe;
  p.likes = Math.max(0, p.likes + (p.likedByMe ? 1 : -1));
  await put('xhsPosts', p);
  syncRow(p);
}
async function toggleSave(p) {
  p.savedByMe = !p.savedByMe;
  p.saves = Math.max(0, p.saves + (p.savedByMe ? 1 : -1));
  await put('xhsPosts', p);
  syncRow(p);
}
function syncRow(p) {
  const i = rows.findIndex((r) => r.id === p.id);
  if (i >= 0) rows[i] = p;
  const j = results.findIndex((r) => r.id === p.id);
  if (j >= 0) results[j] = p;
}

/* ============================================================
   一起看视频
   ============================================================ */
function openVideo(p, opts = {}) {
  const together = opts.together !== false;
  const { mask, panel, close } = overlay('xhs-player', () => {
    if (video) { try { video.pause(); } catch { /* noop */ } }
    if (raf) cancelAnimationFrame(raf);
    clearInterval(taTimer);
    clearTimeout(danmakuTimer);
    closed = true;
  });

  let closed = false;
  let video = null;
  let raf = null;
  let danmakuTimer = null;
  let playing = true;
  let userPaused = false;
  let cur = 0;
  let dur = Number(p.duration) || 90;

  /* ---- 顶栏 ---- */
  panel.appendChild(el('div', { class: 'xhs-p-head' }, [
    el('button', { class: 'tb-btn', title: '返回', onclick: close }, [iconImg('IC-CHT-006')]),
    el('div', { class: 'xhs-p-head-t', text: p.title }),
    together ? el('span', { class: 'xhs-together' }, ['一起看']) : null
  ]));

  /* ---- 画面 ---- */
  const stage = el('div', {
    class: 'xhs-stage',
    style: { background: `linear-gradient(160deg,${p.cover.a},${p.cover.b})` }
  });
  stage.appendChild(el('div', { class: 'xhs-stage-art' }, [
    el('div', { class: 'xhs-stage-g', text: p.cover.g }),
    el('div', { class: 'xhs-stage-l', text: p.cover.label }),
    el('div', { class: 'xhs-stage-t', text: p.title })
  ]));

  if (p.videoUrl) {
    video = el('video', { playsinline: true, preload: 'metadata' });
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1';
    video.src = p.videoUrl;
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration) && video.duration > 0) dur = video.duration;
      paintProgress();
    });
    video.addEventListener('timeupdate', () => { cur = video.currentTime; paintProgress(); });
    video.addEventListener('ended', () => { playing = false; paintPlay(); });
    video.addEventListener('error', () => { video.style.display = 'none'; flash('这个链接暂时播不了'); });
    stage.appendChild(video);
  }

  const dmLayer = el('div', { class: 'xhs-dm-layer' });
  stage.appendChild(dmLayer);
  const hint = el('div', { class: 'xhs-stage-hint' });
  stage.appendChild(hint);
  panel.appendChild(stage);

  /* ---- 控制条 ---- */
  const playBtn = el('button', { class: 'xhs-ctrl', title: '播放/暂停' }, [iconImg('IC-MIO-030')]);
  const backBtn = el('button', { class: 'xhs-ctrl', title: '回退 10 秒', onclick: () => seek(cur - 10) }, ['−10s']);
  const bar = el('div', { class: 'xhs-progress' }, [el('div', { class: 'xhs-progress-fill' })]);
  const time = el('div', { class: 'xhs-time', text: '00:00 / 00:00' });
  const fill = bar.firstChild;

  bar.addEventListener('click', (e) => {
    const r = bar.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * dur);
  });
  playBtn.addEventListener('click', () => { userPaused = playing; setPlaying(!playing); });

  panel.appendChild(el('div', { class: 'xhs-controls' }, [playBtn, backBtn, bar, time]));

  /* ---- 底部信息 / 互动 ---- */
  panel.appendChild(el('div', { class: 'xhs-p-info' }, [
    el('div', { class: 'xhs-p-author' }, [
      el('div', { class: 'xhs-d-av', text: p.authorName.slice(0, 1) }),
      el('div', {}, [
        el('div', { class: 'xhs-p-an', text: p.authorName }),
        el('div', { class: 'xhs-p-sub', text: together ? `${state.role.name || 'TA'} 也在看` : '小粉书视频' })
      ])
    ])
  ]));

  const likeBtn = el('button', {
    class: 'xhs-act' + (p.likedByMe || p.likedByTa ? ' on' : ''), type: 'button',
    onclick: () => { toggleLike(p).then(sync); }
  }, [iconImg('IC-MOM-003'), el('span', { class: 'n', text: countFmt(p.likes) })]);
  const saveBtn = el('button', {
    class: 'xhs-act' + (p.savedByMe || p.savedByTa ? ' on' : ''), type: 'button',
    onclick: () => { toggleSave(p).then(sync); }
  }, [iconImg('IC-MIO-020'), el('span', { class: 'n', text: countFmt(p.saves) })]);
  const fBtn = followBtn(p);
  panel.appendChild(el('div', { class: 'xhs-p-acts' }, [likeBtn, saveBtn, el('span', { class: 'xhs-acts-sp' }), fBtn]));

  function sync() {
    likeBtn.classList.toggle('on', p.likedByMe || p.likedByTa);
    saveBtn.classList.toggle('on', p.savedByMe || p.savedByTa);
    likeBtn.querySelector('.n').textContent = countFmt(p.likes);
    saveBtn.querySelector('.n').textContent = countFmt(p.saves);
    fBtn.classList.toggle('on', following.includes(p.authorName));
    fBtn.textContent = following.includes(p.authorName) ? '已关注' : '关注';
  }

  function flash(text) {
    hint.textContent = text;
    hint.classList.add('on');
    clearTimeout(hint._t);
    hint._t = setTimeout(() => hint.classList.remove('on'), 1800);
  }

  function paintPlay() {
    playBtn.innerHTML = '';
    playBtn.appendChild(iconImg(playing ? 'IC-MIO-030' : 'IC-MIO-029'));
    stage.classList.toggle('paused', !playing);
  }

  function paintProgress() {
    const d = dur || 1;
    fill.style.width = Math.min(100, (cur / d) * 100) + '%';
    time.textContent = `${mmss(cur)} / ${mmss(d)}`;
  }

  function setPlaying(on) {
    playing = on;
    if (video) {
      if (on) video.play().catch(() => { playing = false; paintPlay(); });
      else video.pause();
    }
    paintPlay();
  }

  function seek(t) {
    cur = Math.max(0, Math.min(dur, t));
    if (video) { try { video.currentTime = cur; } catch { /* noop */ } }
    paintProgress();
  }

  const start = performance.now();
  let last = start;
  function frame(now) {
    if (closed) return;
    const dt = (now - last) / 1000;
    last = now;
    if (playing) {
      if (!video) {
        cur = Math.min(dur, cur + dt);
        if (cur >= dur) { playing = false; paintPlay(); }
      }
      paintProgress();
    }
    raf = requestAnimationFrame(frame);
  }

  if (video) {
    video.play().catch(() => { playing = false; paintPlay(); });
  }
  paintPlay();
  paintProgress();
  raf = requestAnimationFrame(frame);

  /* ---- TA 的小动作 ---- */
  const taTimer = setInterval(async () => {
    if (closed) return;
    if (!p.likedByTa && chance(4)) {
      p.likedByTa = true;
      p.likes += 1;
      await put('xhsPosts', p); syncRow(p); sync();
      flash('TA 点了个赞');
      return;
    }
    if (!p.savedByTa && chance(3)) {
      p.savedByTa = true;
      p.saves += 1;
      await put('xhsPosts', p); syncRow(p); sync();
      flash('TA 收藏了这条');
      return;
    }
    if (!following.includes(p.authorName) && chance(2)) {
      await toggleFollow(p.authorName);
      sync();
      flash('TA 关注了作者');
      return;
    }
    if (playing && chance(5)) {
      setPlaying(false);
      flash('TA 暂停了一下');
      setTimeout(() => { if (!closed && !userPaused) setPlaying(true); }, 2600);
      return;
    }
    if (playing && cur > 8 && chance(4)) {
      seek(cur - rndInt(5, 12));
      flash('TA 往回拖了一点');
    }
  }, 6200);

  /* ---- 字卡弹幕 ---- */
  function dmInterval() {
    const pct = Number(settings.danmakuPct) || 0;
    if (!pct) return 0;
    return Math.max(2400, 9500 - pct * 70);
  }
  async function sendDanmaku() {
    if (closed || !playing) return;
    const text = await composeDanmaku(settings);
    if (!text || closed) return;
    const node = el('div', { class: 'xhs-dm', text, style: { top: `${rndInt(8, 72)}%` } });
    dmLayer.appendChild(node);
    setTimeout(() => node.remove(), 11000);
  }
  function loopDanmaku() {
    const ms = dmInterval();
    if (!ms) return;
    danmakuTimer = setTimeout(async () => {
      await sendDanmaku();
      if (!closed) loopDanmaku();
    }, ms + rndInt(-400, 700));
  }
  loopDanmaku();

  void mask;
}

/* ============================================================
   加号：粘贴链接 / 让 TA 搜 / 让 TA 发
   ============================================================ */
function openPlus() {
  actionSheet('一起看', [
    { label: '粘贴链接一起看', icon: 'IC-CRD-012', sub: '从小粉书复制来的链接都行', onSelect: openLink },
    { label: '让他搜个视频', icon: 'IC-CRD-010', sub: '按设置里的来源随手搜一条', onSelect: taFindVideo },
    { label: '让他发一篇', icon: 'IC-MOM-002', sub: '只在这个小粉书里自己看', onSelect: taPublish }
  ]);
}

function openLink() {
  const input = el('textarea', { class: 'input', rows: 3, placeholder: '粘贴链接，例如 https://…' });
  sheet({
    title: '粘贴链接一起看',
    node: el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '链接' }), input]),
      el('div', { class: 'hint', text: '直链视频会直接播放；小粉书页面链接会生成一条一起看的视频。' })
    ]),
    actions: [{
      label: '一起看', icon: 'IC-MIO-029',
      onSelect: async () => {
        const url = input.value.trim();
        if (!/^https?:\/\//i.test(url)) { toast('请粘贴 http 或 https 开头的链接'); return; }
        const post = await createLinkPost(url);
        await loadRows();
        renderPage();
        openVideo(post, { together: true });
      }
    }]
  });
  setTimeout(() => input.focus(), 260);
}

async function taFindVideo() {
  const post = await taSearchVideo(settings);
  await loadRows();
  renderPage();
  toast(`TA 搜到了「${post.keyword}」`);
  openVideo(post, { together: true });
}

async function taPublish() {
  const post = await taPostNow();
  await loadRows();
  renderPage();
  toast(post.kind === 'video' ? 'TA 发了一条视频' : 'TA 发了一篇笔记');
  openDetail(post);
}

/* ============================================================
   设置
   ============================================================ */
async function openSettings() {
  const node = el('div', { class: 'xhs-set' });
  sheet({ title: '小粉书设置', node });

  async function renderSet() {
    node.innerHTML = '';

    node.appendChild(el('div', { class: 'xhs-set-hint', text: '他会偶尔分享一条笔记给你：概率每天随机，最高 10%，也可能一整天都不分享。' }));

    /* 屏蔽词 */
    node.appendChild(el('div', { class: 'xhs-set-h', text: '屏蔽词' }));
    const blockedInput = el('input', { class: 'input', placeholder: '不想看到的词' });
    blockedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBlocked(); });
    node.appendChild(el('div', { class: 'row', style: { gap: '8px', margin: '8px 0' } }, [
      blockedInput,
      el('button', { class: 'btn sm primary', onclick: () => addBlocked() }, ['添加'])
    ]));
    const blockedList = el('div', { class: 'xhs-tag-list' });
    if (!settings.blocked.length) blockedList.appendChild(el('div', { class: 'xhs-set-empty', text: '还没有屏蔽词' }));
    else settings.blocked.forEach((w) => blockedList.appendChild(el('button', {
      class: 'xhs-tag x' + ' ', type: 'button', title: '移除',
      onclick: async () => {
        settings.blocked = settings.blocked.filter((x) => x !== w);
        await saveXhsSettings(settings);
        await renderSet();
        renderPage();
      }
    }, [`${w} ×`])));
    node.appendChild(blockedList);

    /* 弹幕频率 */
    node.appendChild(el('div', { class: 'xhs-set-h', text: '角色弹幕回复频率' }));
    const pctLabel = el('span', { class: 'xhs-set-pct', text: `${settings.danmakuPct}%` });
    const range = el('input', {
      class: 'xhs-range', type: 'range', min: '0', max: '100', step: '5',
      value: String(settings.danmakuPct)
    });
    range.addEventListener('input', () => { pctLabel.textContent = range.value + '%'; });
    range.addEventListener('change', async () => {
      settings.danmakuPct = Number(range.value) || 0;
      await saveXhsSettings(settings);
    });
    node.appendChild(el('div', { class: 'xhs-range-row' }, [range, pctLabel]));
    node.appendChild(el('div', { class: 'hint', text: '0% 表示一起看时不发弹幕。' }));

    /* 搜索方式 */
    node.appendChild(el('div', { class: 'xhs-set-h', text: '梦角搜索视频的方式' }));
    const modeRow = el('div', { class: 'seg-row' });
    [['mix', '自动混搭'], ['manual', '只用手动关键词']].forEach(([k, label]) => {
      modeRow.appendChild(el('button', {
        class: 'chip' + (settings.searchMode === k ? ' on' : ''), type: 'button',
        onclick: async () => {
          settings.searchMode = k;
          await saveXhsSettings(settings);
          await renderSet();
        }
      }, [label]));
    });
    node.appendChild(modeRow);

    node.appendChild(el('div', { class: 'xhs-set-sub', text: '自动混搭时，从这些来源里随机抽取内容去搜：' }));
    const srcBox = el('div', { class: 'xhs-checks' });
    [['cards', '他的字卡'], ['moments', '朋友圈'], ['history', '同屏搜索记录'], ['chat', '聊天记录']].forEach(([k, label]) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!settings.sources[k];
      cb.addEventListener('change', async () => {
        settings.sources[k] = cb.checked;
        await saveXhsSettings(settings);
      });
      srcBox.appendChild(el('label', { class: 'xhs-check' }, [cb, el('span', { text: label })]));
    });
    node.appendChild(srcBox);

    /* 手动关键词 */
    node.appendChild(el('div', { class: 'xhs-set-sub', text: '手动关键词（只用手动模式时优先用它们）' }));
    const kwInput = el('input', { class: 'input', placeholder: '添加一个搜索关键词' });
    kwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });
    node.appendChild(el('div', { class: 'row', style: { gap: '8px', margin: '8px 0' } }, [
      kwInput,
      el('button', { class: 'btn sm primary', onclick: () => addKeyword() }, ['添加'])
    ]));
    const kwList = el('div', { class: 'xhs-tag-list' });
    if (!settings.keywords.length) kwList.appendChild(el('div', { class: 'xhs-set-empty', text: '还没有关键词' }));
    else settings.keywords.forEach((w) => kwList.appendChild(el('button', {
      class: 'xhs-tag x', type: 'button', title: '移除',
      onclick: async () => {
        settings.keywords = settings.keywords.filter((x) => x !== w);
        await saveXhsSettings(settings);
        await renderSet();
      }
    }, [`${w} ×`])));
    node.appendChild(kwList);

    async function addBlocked() {
      const w = blockedInput.value.trim();
      if (!w) return toast('先写一个词');
      if (!settings.blocked.includes(w)) settings.blocked.push(w);
      await saveXhsSettings(settings);
      await renderSet();
      renderPage();
    }
    async function addKeyword() {
      const w = kwInput.value.trim();
      if (!w) return toast('先写一个关键词');
      if (!settings.keywords.includes(w)) settings.keywords.push(w);
      await saveXhsSettings(settings);
      await renderSet();
    }
  }

  await renderSet();
}

/* ============================================================
   工具
   ============================================================ */
function overlay(extra = '', onClose = null) {
  const mask = el('div', { class: 'xhs-mask' });
  const panel = el('div', { class: 'xhs-panel ' + extra });
  mask.appendChild(panel);
  document.getElementById('layer-root').appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('on'));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (onClose) onClose();
    mask.classList.remove('on');
    setTimeout(() => mask.remove(), 220);
  }
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  return { mask, panel, close };
}

async function openPostById(id) {
  let p = rows.find((r) => r.id === id);
  if (!p) p = await get('xhsPosts', id);
  if (!p) return toast('这条笔记已经不在了');
  if (p.kind === 'video') openVideo(p);
  else openDetail(p);
}

function mmss(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
