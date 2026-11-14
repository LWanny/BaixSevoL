/* 音乐 · 网易云 + 本地音频 + 一起听
   两种使用方式：
   1) 在线曲库：搜索、导入歌单链接、试听（公共接口；VIP/无版权的歌可能没有音源）
   2) 上传本地音频：mp3 / wav / m4a 等，离线可播
   TA（梦角）会自己搜歌、收藏、用字卡随机拼出歌单名并建歌单。 */

import {
  el, uid, openFile, pickN, chance, rndInt
} from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { state } from '../state.js';
import { all, put, del, kvGet, kvSet } from '../store.js';
import { saveMedia, mediaURL, delMedia } from '../media.js';
import { actionSheet, confirmBox, sheet, toast, topBanner } from '../ui.js';
import { eligible, drawCards, joinFragments } from '../engine.js';
import {
  searchNetease, fetchPlaylist, resolveSongUrl, parsePlaylistId
} from '../musicapi.js';

let view = null;
let songs = [];
/* 歌词页状态：面板开着时随播放进度逐行高亮 */
let lyricBox = null;        // 歌词滚动容器
let lyricEls = [];          // 行节点
let lyricLines = [];        // [{t, text}]
let lyricIdx = -2;
let lyricSong = null;       // 面板当前显示的歌曲
let lyricCover = null;      // 面板封面节点
let lyricTitle = null;      // 面板标题节点
let lyricArtist = null;     // 面板歌手节点
let lyricFollow = false;    // 面板是否跟随播放进度
let playlists = [];
let cards = [];
let tab = 'me';              // me | ta
let curList = 'all';         // all | playlistId
let cur = null;
let audio = null;
let together = false;
let togetherTimer = null;
let taBusy = false;
let alive = false;           // 页面存活标志：离开后丢弃所有未完成的异步渲染
let recentPlays = [];        // 近期播放 [{id, ts}]，最新在前，上限 50
let cleanups = [];

export default async function pageMusic(v) {
  cleanup();
  alive = true;
  window.addEventListener('hashchange', cleanup, { once: true });

  view = v;
  fullPage({
    back: true, title: '音乐', sub: '在线曲库 · 本地音频 · 一起听',
    actions: [
      { label: '歌词', onclick: () => openLyrics() },
      { label: '添加音乐', onclick: addMenu }
    ]
  });

  audio = new Audio();
  audio.preload = 'metadata';
  audio.addEventListener('timeupdate', () => { paintProgress(); syncLyric(); });
  audio.addEventListener('ended', () => next());
  audio.addEventListener('play', paintControls);
  audio.addEventListener('pause', paintControls);
  audio.addEventListener('error', () => {
    if (!cur) return;
    toast(cur.source === 'netease'
      ? '这首歌暂时无法播放，可能需要 VIP 或已下架'
      : '这段音频无法播放，文件可能已损坏');
  });

  await reload();
  together = !!(await kvGet('musicTogether', false));
  recentPlays = (await kvGet('recentPlays')) || [];
  if (!alive) return;                          // 等待期间已离开页面：别把 DOM 画回去
  paint();
  if (together) startTogetherLoop();
}

async function reload() {
  songs = (await all('songs')).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  playlists = (await all('playlists')).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  cards = await all('cards');
}

function cleanup() {
  alive = false;
  cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
  cleanups = [];
  if (togetherTimer) { clearInterval(togetherTimer); togetherTimer = null; }
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
}

/* ============================================================
   页面
   ============================================================ */
function paint() {
  if (!alive || !view) return;
  view.innerHTML = '';
  const page = el('div', { class: 'page music' });

  page.appendChild(cloudCard());
  page.appendChild(tabsBar());
  page.appendChild(taBar());
  page.appendChild(playlistStrip());
  page.appendChild(togetherBanner());

  const list = el('div', { class: 'music-list' });
  page.appendChild(list);
  if (cur) page.appendChild(playerBar());

  view.appendChild(page);
  renderList(list);
  paintControls();
  paintProgress();
}

function tabsBar() {
  const me = el('button', {
    class: 'mail-tab' + (tab === 'me' ? ' on' : ''),
    onclick: () => { if (tab !== 'me') { tab = 'me'; curList = 'all'; paint(); } }
  }, ['我的歌单']);
  const ta = el('button', {
    class: 'mail-tab' + (tab === 'ta' ? ' on' : ''),
    onclick: () => { if (tab !== 'ta') { tab = 'ta'; curList = 'all'; paint(); } }
  }, [(state.role.name || 'TA') + ' 的歌单']);
  return el('div', { class: 'mail-tabs' }, [me, ta]);
}

/* ---------------- 在线曲库卡 ---------------- */
function cloudCard() {
  return el('div', { class: 'card mc-cloud' }, [
    el('div', { class: 'mc-cloud-h' }, [
      el('div', { class: 'mc-cloud-ic' }, [iconImg('IC-MIO-016')]),
      el('div', { class: 'mc-cloud-main' }, [
        el('div', { class: 'mc-cloud-t', text: '在线曲库' }),
        el('div', { class: 'mc-cloud-s', text: '搜索、导入公开歌单、试听；接口解不出的歌（多为 VIP）会提示无音源' })
      ])
    ]),
    el('div', { class: 'mc-cloud-acts' }, [
      el('button', { class: 'mc-act', onclick: openGuess }, [iconImg('IC-MIO-029'), '猜你喜欢']),
      el('button', { class: 'mc-act', onclick: () => openSearch() }, [iconImg('IC-CRD-010'), '搜索歌曲']),
      el('button', { class: 'mc-act', onclick: () => openPlaylistImport() }, [iconImg('IC-MIO-022'), '导入歌单']),
      el('button', { class: 'mc-act', onclick: addByFile }, [iconImg('IC-MIO-010'), '上传音频'])
    ])
  ]);
}

function taBar() {
  if (tab !== 'ta') return el('div', { class: 'hidden' });
  return el('div', { class: 'mc-ta-row' }, [
    el('div', { class: 'mc-ta-t', text: (state.role.name || 'TA') + ' 可以自己找歌、收藏，也可以建歌单' }),
    el('div', { class: 'mc-ta-acts' }, [
      el('button', { class: 'btn sm', onclick: () => taSearchAndCollect() }, ['自己找歌']),
      el('button', { class: 'btn sm primary', onclick: () => taCreatePlaylist() }, ['建歌单'])
    ])
  ]);
}

/* ---------------- 歌单条 ---------------- */
function playlistStrip() {
  const wrap = el('div', { class: 'mp-lists' });
  const owned = playlists.filter((p) => p.owner === tab);

  wrap.appendChild(listTile('全部', songs.filter((s) => (s.addedBy || 'me') === tab).length, curList === 'all', () => {
    curList = 'all'; paint();
  }));

  /* 近期播放：按最近播放排序（只在我的歌单页签展示） */
  if (tab === 'me') {
    const byId = new Map(songs.map((s) => [s.id, s]));
    const recentCount = recentPlays.filter((r) => {
      const s = byId.get(r.id);
      return s && (s.addedBy || 'me') === 'me';
    }).length;
    wrap.appendChild(listTile('近期播放', recentCount, curList === 'recent', () => {
      curList = 'recent'; paint();
    }));
  }

  owned.forEach((p) => {
    const count = p.songIds ? p.songIds.length : 0;
    wrap.appendChild(listTile(p.name || '未命名歌单', count, curList === p.id, () => {
      curList = p.id; paint();
    }, p));
  });

  wrap.appendChild(el('button', {
    class: 'mp-list mp-list-add', type: 'button',
    onclick: () => tab === 'ta' ? taCreatePlaylist() : newPlaylist('me')
  }, [
    iconImg('IC-MIO-022'),
    el('span', { class: 'mp-list-name', text: tab === 'ta' ? 'TA 建歌单' : '新建歌单' })
  ]));
  return wrap;
}

function listTile(name, count, on, onclick, pl = null) {
  const tile = el('button', {
    class: 'mp-list' + (on ? ' on' : ''), type: 'button', onclick, title: name
  }, [
    el('span', { class: 'mp-list-name', text: name }),
    el('span', { class: 'mp-list-sub', text: count + ' 首' })
  ]);
  if (pl) {
    tile.appendChild(el('span', {
      class: 'mp-list-more', text: '⋯',
      onclick: (e) => { e.stopPropagation(); playlistMenu(pl); }
    }));
  }
  return tile;
}

function playlistMenu(pl) {
  const items = [
    { label: '重命名', icon: 'IC-MIO-021', onSelect: () => renamePlaylist(pl) },
    { label: '让 TA 往里放歌', icon: 'IC-MIO-020', onSelect: () => taFillPlaylist(pl) },
    { label: '删除歌单', icon: 'IC-CRD-007', danger: true, onSelect: () => removePlaylist(pl) }
  ];
  actionSheet(pl.name || '歌单', items);
}

/* ---------------- 列表 ---------------- */
function currentRows() {
  let rows = songs.filter((s) => (s.addedBy || 'me') === tab);
  if (curList === 'recent') {
    const byId = new Map(songs.map((s) => [s.id, s]));
    return recentPlays.map((r) => byId.get(r.id)).filter(Boolean).filter((s) => (s.addedBy || 'me') === tab);
  }
  if (curList !== 'all') {
    const pl = playlists.find((p) => p.id === curList);
    const ids = new Set((pl && pl.songIds) || []);
    rows = rows.filter((s) => ids.has(s.id));
  }
  return rows;
}

function renderList(list) {
  list.innerHTML = '';
  const rows = currentRows();
  if (!rows.length) {
    const isTa = tab === 'ta';
    list.appendChild(el('div', { class: 'empty' }, [
      iconImg('IC-MIO-016'),
      el('div', { class: 'e-h', text: curList === 'recent' ? '还没播放过歌曲' : (curList === 'all' ? (isTa ? 'TA 还没有收藏歌曲' : '还没有收藏歌曲') : '这个歌单还是空的') }),
      el('div', { class: 'e-p', text: isTa ? '点「自己找歌」，TA 会去在线曲库搜；也可以把本地音频交给 TA' : '搜索歌曲、导入歌单链接，或上传本地音频' }),
      el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '8px' } }, [
        el('button', { class: 'btn sm primary', onclick: () => openSearch() }, ['搜索歌曲']),
        el('button', { class: 'btn sm', onclick: addByFile }, ['上传音频']),
        isTa ? el('button', { class: 'btn sm', onclick: () => taSearchAndCollect() }, ['让 TA 找歌']) : null
      ].filter(Boolean))
    ]));
    return;
  }
  rows.forEach((s) => list.appendChild(songRow(s)));
}

function songRow(s) {
  const playing = cur && cur.id === s.id;
  const badges = [];
  if (s.source === 'netease') badges.push('网易云');
  if (s.mediaId) badges.push('本地');
  if (s.vip) badges.push('VIP');
  const sub = [s.artist, ...badges].filter(Boolean).join(' · ');
  return el('div', { class: 'music-row' + (playing ? ' on' : '') }, [
    el('div', { class: 'music-row-ic' }, [iconImg(playing && audio && !audio.paused ? 'IC-MIO-030' : 'IC-MIO-029')]),
    el('div', { class: 'music-row-main', onclick: () => play(s) }, [
      el('div', { class: 'music-row-t', text: s.title || '未命名' }),
      el('div', { class: 'music-row-s', text: sub || '未知歌手' })
    ]),
    el('button', { class: 'music-row-more', onclick: (e) => { e.stopPropagation(); rowMenu(s); } }, ['⋯'])
  ]);
}

/* ---------------- 一起听 ---------------- */
function togetherBanner() {
  if (!together) {
    return el('div', { class: 'music-tg off', onclick: () => startTogether() }, [
      el('div', { class: 'music-tg-main' }, [
        el('div', { class: 'music-tg-t', text: '和 TA 一起听' }),
        el('div', { class: 'music-tg-s', text: 'TA 会切歌、收藏，也会用字卡拼出歌单名' })
      ]),
      el('button', { class: 'btn sm primary' }, ['开启'])
    ]);
  }
  return el('div', { class: 'music-tg on' }, [
    el('div', { class: 'music-tg-ic' }, [iconImg('IC-MIO-031')]),
    el('div', { class: 'music-tg-main' }, [
      el('div', { class: 'music-tg-t', text: (state.role.name || 'TA') + ' 也在一起听' }),
      el('div', { class: 'music-tg-s', text: cur ? ('正在听：' + (cur.title || '未命名')) : '还没开始播，随便点一首吧' })
    ]),
    el('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); stopTogether(); } }, ['结束'])
  ]);
}

async function startTogether() {
  together = true;
  await kvSet('musicTogether', true);
  if (!cur && songs.length) play(songs[0]);
  else if (cur && audio.paused) audio.play().catch(() => {});
  toast((state.role.name || 'TA') + ' 加入了一起听');
  paint();
  startTogetherLoop();
}

async function stopTogether() {
  together = false;
  await kvSet('musicTogether', false);
  if (togetherTimer) { clearInterval(togetherTimer); togetherTimer = null; }
  toast('已退出一起听');
  paint();
}

/** TA 的一起听行为：切歌 / 收藏 / 偶尔自己搜歌或建歌单 */
function startTogetherLoop() {
  if (togetherTimer) clearInterval(togetherTimer);
  togetherTimer = setInterval(async () => {
    if (!together || taBusy) return;
    const pool = songs;
    if (!pool.length) return;

    if (chance(16)) {
      const target = pool[Math.floor(Math.random() * pool.length)];
      if (!cur || target.id !== cur.id) {
        await play(target);
        toast((state.role.name || 'TA') + ' 切了一首：' + (target.title || '未命名'));
      }
    }

    if (cur && (cur.addedBy || 'me') === 'me' && chance(10)) {
      if (!songs.some((s) => s.originId === cur.id && s.addedBy === 'ta')) {
        const copy = { ...cur, id: uid(), addedBy: 'ta', originId: cur.id, ts: Date.now() };
        await put('songs', copy);
        await reload();
        toast((state.role.name || 'TA') + ' 把这首歌收进了他的歌单');
        paint();
      }
    }

    if (chance(5)) taSearchAndCollect({ silent: true });
    else if (chance(2)) taCreatePlaylist({ silent: true });
  }, 9000);
  cleanups.push(() => { if (togetherTimer) { clearInterval(togetherTimer); togetherTimer = null; } });
}

/* ---------------- 播放器 ---------------- */
function playerBar() {
  const openLyric = { onclick: () => openLyrics(), style: { cursor: 'pointer' } };
  return el('div', { class: 'music-player' }, [
    el('div', { class: 'mp-cover', ...openLyric }, [iconImg('IC-MIO-016')]),
    el('div', { class: 'mp-main', ...openLyric }, [
      el('div', { class: 'mp-t', text: cur.title || '未命名' }),
      el('div', { class: 'mp-s' }, [
        el('span', { class: 'mp-time', id: 'mp-cur', text: '00:00' }),
        el('span', { class: 'mp-bar' }, [el('i', { id: 'mp-fill', style: { width: '0%' } })]),
        el('span', { class: 'mp-time', id: 'mp-dur', text: '00:00' })
      ])
    ]),
    el('div', { class: 'mp-ctrl' }, [
      el('button', { class: 'mp-btn skip prev', title: '上一首', onclick: () => prev() }, [el('i', { class: 'mp-tri' })]),
      el('button', { class: 'mp-btn play', id: 'mp-play', title: '播放/暂停', onclick: togglePlay }, [iconImg('IC-MIO-029')]),
      el('button', { class: 'mp-btn skip next', title: '下一首', onclick: () => next() }, [el('i', { class: 'mp-tri' })])
    ])
  ]);
}

async function play(s) {
  let src = '';
  if (s.mediaId) src = await mediaURL(s.mediaId);
  if (!src) src = await resolveSongUrl(s);
  if (!src) {
    toast(s.source === 'netease' ? `「${s.title || '这首歌'}」暂时没有音源（无版权或接口未收录）` : '这首歌没有可用的播放地址');
    return;
  }
  cur = s;
  /* 近期播放：仅记录歌单里的歌（搜索草稿没有本地 id） */
  if (s.id) {
    recentPlays = [{ id: s.id, ts: Date.now() }, ...recentPlays.filter((r) => r.id !== s.id)].slice(0, 50);
    kvSet('recentPlays', recentPlays).catch(() => {});
  }
  if (!audio) audio = new Audio();
  audio.onerror = () => {
    if (cur !== s) return;                       // 已经切到别的歌，不重复报错
    toast(`「${s.title || '这首歌'}」加载失败了，地址可能过期或网络不稳，试试别的歌`);
    refreshPlayer();
  };
  audio.src = src;
  try {
    await audio.play();
  } catch (err) {
    toast(err && err.name === 'NotAllowedError'
      ? '浏览器拦住了自动播放，点一下播放键'
      : `「${s.title || '这首歌'}」没能播出来，可能没有音源`);
  }
  renderList(view.querySelector('.music-list'));
  refreshPlayer();
}

function togglePlay() {
  if (!cur) { if (songs.length) play(songs[0]); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function next(dir = 1) {
  const list = currentRows();
  if (!list.length) return;
  const i = cur ? list.findIndex((s) => s.id === cur.id) : -1;
  const n = (i + dir + list.length * 2) % list.length;
  play(list[n]);
}
function prev() {
  const list = currentRows();
  if (!list.length) return;
  if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
  const i = cur ? list.findIndex((s) => s.id === cur.id) : 0;
  const n = (i - 1 + list.length) % list.length;
  play(list[n]);
}

function refreshPlayer() {
  const bar = view.querySelector('.music-player');
  if (!bar) { if (cur) paint(); return; }
  bar.replaceWith(playerBar());
  paintControls();
  paintProgress();
}

function paintControls() {
  const btn = view.querySelector('#mp-play');
  if (!btn) return;
  btn.innerHTML = '';
  btn.appendChild(iconImg(audio && !audio.paused ? 'IC-MIO-030' : 'IC-MIO-029'));
}

function fmtSec(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), x = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
function paintProgress() {
  const fill = view.querySelector('#mp-fill');
  const t = view.querySelector('#mp-cur');
  const d = view.querySelector('#mp-dur');
  if (!fill) return;
  const dur = audio?.duration || 0;
  const pos = audio?.currentTime || 0;
  fill.style.width = dur ? Math.min(100, (pos / dur) * 100) + '%' : '0%';
  if (t) t.textContent = fmtSec(pos);
  if (d) d.textContent = fmtSec(dur);
}

/* ============================================================
   歌词页：解析（LRC / 纯文本）· 打开 · 逐行高亮 · 编辑
   ============================================================ */
function parseLyric(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (m) {
      const frac = m[3] ? Number('0.' + m[3]) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text: (m[4] || '').trim() || line });
    } else {
      out.push({ t: null, text: line });
    }
  }
  if (!out.length) return out;
  const hasStamp = out.some((l) => l.t !== null);
  if (!hasStamp) {
    /* 纯文本：按歌曲时长均分（没有时长则不随进度高亮） */
    const dur = audio?.duration || 0;
    out.forEach((l, i) => { l.t = dur ? (i / out.length) * dur : null; });
  } else {
    /* 混合：没有时间戳的行跟随前一行 */
    let last = 0;
    out.forEach((l) => { if (l.t === null) l.t = last; else last = l.t; });
  }
  return out;
}

/* 打开歌词面板（s 默认当前播放；rowMenu 里可指定某首歌） */
function openLyrics(s) {
  const song = s || cur;
  if (!song) { toast('先放一首歌'); return; }
  const box = el('div', { class: 'ml-box', id: 'ml-box' });
  lyricBox = box;
  lyricCover = el('div', { class: 'ml-cover' });
  lyricTitle = el('div', { class: 'ml-title' });
  lyricArtist = el('div', { class: 'ml-artist' });
  lyricSong = song;
  lyricFollow = song === cur;      // 打开的正是当前播放的歌才跟着进度走
  lyricHeader(song);
  rebuildLyric();

  sheet({
    title: '歌词',
    node: el('div', { class: 'ml-wrap' }, [lyricCover, lyricTitle, lyricArtist, box]),
    actions: [
      { label: '编辑歌词', icon: 'IC-CRD-006', sub: '支持 LRC [00:12.34] 或每行一句', onSelect: () => editLyricSheet(lyricSong || song) },
      { label: '关闭', icon: 'IC-CHT-005', onSelect: () => {} }
    ],
    onClose: () => {
      lyricBox = null; lyricEls = []; lyricIdx = -2;
      lyricSong = null; lyricCover = null; lyricTitle = null; lyricArtist = null;
      lyricFollow = false;
    }
  });
}

/* 面板头部：封面 / 标题 / 歌手（面板开着切歌时跟着换） */
function lyricHeader(song) {
  if (lyricTitle) lyricTitle.textContent = song.title || '未命名';
  if (lyricArtist) lyricArtist.textContent = song.artist || '未知歌手';
  const cov = lyricCover;
  if (!cov) return;
  cov.innerHTML = '';
  cov.appendChild(iconImg('IC-MIO-016'));   // 图没来之前先占位
  if (!song.mediaId) return;
  const img = el('img', { alt: '' });
  mediaURL(song.mediaId).then((u) => { if (u && cov.isConnected) { img.src = u; cov.replaceChildren(img); } });
}

/* 重建歌词行（没有歌词给空态） */
function rebuildLyric() {
  const box = lyricBox;
  if (!box) return;
  lyricLines = parseLyric((lyricSong && lyricSong.lyric) || '');
  lyricIdx = -2;
  box.innerHTML = '';
  lyricEls = [];
  if (!lyricLines.length) {
    box.appendChild(el('div', { class: 'ml-empty' }, [
      el('div', { text: '还没有歌词' }),
      el('div', { class: 'small muted', style: { marginTop: '6px' }, text: '点下面「编辑歌词」粘贴 LRC 或每行一句' })
    ]));
  } else {
    lyricLines.forEach((l) => {
      const n = el('div', { class: 'ml-line', text: l.text });
      box.appendChild(n);
      lyricEls.push(n);
    });
  }
  syncLyric(true);
}

/* 播放进度 → 高亮当前行并滚动到中间（面板开着才跑） */
function syncLyric(force = false) {
  if (!lyricBox || !lyricBox.isConnected) return;
  /* 面板开着时切了歌 → 换绑新歌的歌词与头部 */
  if (cur && lyricSong && lyricSong.id !== cur.id) {
    if (!lyricFollow) return;        // 面板看的是另一首歌，不跟着播
    lyricSong = cur;
    lyricHeader(cur);
    rebuildLyric();
    return;
  }
  if (cur && lyricSong) lyricFollow = true;   // 面板的歌正好在播 → 开始跟随
  if (!lyricFollow || !lyricLines.length) return;
  const t = audio?.currentTime || 0;
  let idx = -1;
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].t !== null && lyricLines[i].t <= t + 0.08) idx = i;
  }
  if (!force && idx === lyricIdx) return;
  lyricIdx = idx;
  lyricEls.forEach((n, i) => n.classList.toggle('on', i === idx));
  const line = lyricEls[idx];
  if (line && lyricBox) {
    const top = Math.max(0, line.offsetTop - lyricBox.clientHeight / 2 + line.clientHeight / 2);
    if (typeof lyricBox.scrollTo === 'function') lyricBox.scrollTo({ top, behavior: force ? 'auto' : 'smooth' });
    else lyricBox.scrollTop = top;
  }
}

/* 编辑歌词：LRC 或纯文本 → 存回歌曲 */
function editLyricSheet(song) {
  const ta = el('textarea', {
    class: 'input', style: 'min-height:170px;white-space:pre;font-family:monospace;font-size:12.5px',
    placeholder: '[00:12.34]第一句\n[00:16.00]第二句\n\n或者每行一句（无时间戳）'
  });
  ta.value = song.lyric || '';
  sheet({
    title: '编辑歌词 · ' + (song.title || ''),
    node: el('div', {}, [
      el('div', { class: 'hint', text: '支持 LRC 时间戳；纯文本会按歌曲时长自动均分滚动。' }),
      el('div', { class: 'field' }, [ta])
    ]),
    actions: [
      {
        label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
          const v = ta.value.trim();
          await put('songs', { ...song, lyric: v });
          const i = songs.findIndex((x) => x.id === song.id);
          if (i >= 0) songs[i] = { ...songs[i], lyric: v };
          Object.assign(song, { lyric: v });
          toast('歌词已保存');
          /* 编辑面板是从歌词页里开的（会先关歌词页）→ 保存后自动重开 */
          setTimeout(() => openLyrics(song), 300);
        }
      }
    ]
  });
}

/* ============================================================
   添加 / 导入
   ============================================================ */
function addMenu() {
  actionSheet('添加音乐', [
    { label: '搜索歌曲', sub: '按歌名、歌手或关键词搜索', icon: 'IC-CRD-010', onSelect: () => openSearch() },
    { label: '导入在线歌单', sub: '粘贴歌单链接，整单收藏', icon: 'IC-MIO-022', onSelect: () => openPlaylistImport() },
    { label: '上传本地音频', sub: 'mp3 / wav / m4a 等，可离线播放', icon: 'IC-MIO-010', onSelect: addByFile }
  ]);
}

async function addByFile() {
  const files = await openFile({ accept: 'audio/*', multiple: true });
  if (!files || !files.length) return;
  const batch = files.slice(0, 20);
  const owner = tab;
  const tip = topBanner({ icon: 'IC-MIO-010', title: '正在导入音频', sub: `0 / ${batch.length}` });
  let ok = 0;

  for (const f of batch) {
    try {
      const blob = new Blob([f], { type: f.type || 'audio/mpeg' });
      const dur = await probeDurationSafe(blob);
      const mediaId = await saveMedia(blob, { type: 'audio', name: f.name, duration: dur, source: 'me' });
      const base = f.name.replace(/\.[^.]+$/, '');
      const [title, artist] = base.split(' - ').reverse();
      await put('songs', {
        id: uid(), title: (title || base).trim(), artist: (artist || '').trim(),
        mediaId, duration: dur, source: 'local', addedBy: owner, ts: Date.now()
      });
      ok += 1;
      tip.update({ sub: `${ok} / ${batch.length}` });
    } catch { /* 单条失败不影响其余 */ }
  }

  await reload();
  paint();
  tip.close();
  toast(ok ? `已导入 ${ok} 首本地音频` : '没有成功导入音频');
}

function probeDurationSafe(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    let done = false;
    const fin = (v) => {
      if (done) return;
      done = true;
      a.src = '';
      URL.revokeObjectURL(url);
      resolve(v || 0);
    };
    a.addEventListener('loadedmetadata', () => fin(a.duration));
    a.addEventListener('error', () => fin(0));
    setTimeout(() => fin(a.duration), 4000);
    a.src = url;
  });
}

/* ---------------- 网易云搜索 ---------------- */
function openSearch(prefill = '') {
  const input = el('input', { class: 'input', placeholder: '搜歌名 / 歌手 / 关键词', value: prefill });
  const status = el('div', { class: 'mc-note', text: '搜索由公共音乐接口提供；VIP 或无版权歌曲可能无法播放。' });
  const results = el('div', { class: 'mc-results' });
  const btn = el('button', { class: 'btn sm primary', onclick: run }, ['搜索']);
  const s = sheet({ title: '搜索歌曲', node: el('div', { class: 'mc-search' }, [
    el('div', { class: 'mc-search-row' }, [input, btn]), status, results
  ]) });

  async function run() {
    const q = input.value.trim();
    if (!q) { toast('先输入关键词'); return; }
    btn.disabled = true; btn.textContent = '搜索中…';
    status.textContent = '正在搜索…';
    results.innerHTML = '';
    try {
      const list = await searchNetease(q, 20);
      status.textContent = list.length ? `找到 ${list.length} 首，点「收藏」放进${tab === 'ta' ? ' TA 的' : '我的'}歌单` : '没有搜到，换个关键词试试';
      list.forEach((t) => results.appendChild(resultRow(t, s)));
    } catch (err) {
      status.textContent = '搜索失败：' + (err.message || '接口连不上');
      results.appendChild(el('div', { class: 'mc-fail' }, [
        el('div', { class: 'small', text: '稍后再试，或改用「上传本地音频」。' })
      ]));
    } finally {
      btn.disabled = false; btn.textContent = '搜索';
    }
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  setTimeout(() => input.focus(), 260);
}

function resultRow(t, sheetRef) {
  return el('div', { class: 'mc-res' }, [
    el('div', { class: 'mc-res-main' }, [
      el('div', { class: 'mc-res-t', text: t.title }),
      el('div', { class: 'mc-res-s', text: [t.artist, t.album, t.vip ? 'VIP' : ''].filter(Boolean).join(' · ') || '网易云' })
    ]),
    el('button', { class: 'btn sm primary', onclick: async () => {
      await collectSong(t, tab);
      sheetRef.close();
      await reload();
      paint();
      toast('已收藏「' + t.title + '」');
    } }, ['收藏'])
  ]);
}

async function collectSong(t, owner) {
  const exists = songs.find((s) => s.neteaseId && s.neteaseId === t.neteaseId && (s.addedBy || 'me') === owner);
  if (exists) return exists;
  const row = {
    id: uid(), title: t.title, artist: t.artist, album: t.album || '',
    neteaseId: t.neteaseId, url: t.url || '', cover: t.cover || '',
    duration: t.duration || 0, vip: !!t.vip,
    source: 'netease', addedBy: owner, ts: Date.now()
  };
  await put('songs', row);
  songs.unshift(row);
  if (curList !== 'all') await addToPlaylist(row.id, curList);
  return row;
}

/* ---------------- 猜你喜欢：随机挑歌直接播 ---------------- */
const GUESS_SEEDS = [
  '周杰伦', '林俊杰', '陈奕迅', '薛之谦', '邓紫棋', '五月天', '孙燕姿', '梁静茹',
  '王心凌', '许嵩', '毛不易', '周深', '李荣浩', '陶喆', '告五人', '万能青年旅店',
  'KTV必点', '华语经典', '90后金曲', '网易云热歌', '小众宝藏', '粤语经典',
  '民谣', '轻快节奏', '抒情慢歌', '深夜电台', '夏日微风', '雨天心情', '通勤路上'
];

function openGuess() {
  const status = el('div', { class: 'mc-note', text: '正在随机挑歌…' });
  const results = el('div', { class: 'mc-results' });
  let batch = [];

  const shuffleBtn = el('button', { class: 'btn sm', onclick: () => gen(true) }, ['换一批']);
  const playBtn = el('button', { class: 'btn sm primary', onclick: playRandom }, ['随机播放']);
  const s = sheet({ title: '猜你喜欢', node: el('div', { class: 'mc-search' }, [
    status, results,
    el('div', { class: 'mc-search-row', style: { marginTop: '10px' } }, [shuffleBtn, playBtn])
  ]) });

  function playRandom() {
    if (!batch.length) { toast('还没挑到歌，稍等一下'); return; }
    const t = batch[rndInt(0, batch.length - 1)];
    s.close();
    play(t);
  }

  async function gen(swap) {
    shuffleBtn.disabled = true;
    playBtn.disabled = true;
    status.textContent = swap ? '换一批中…' : '正在随机挑歌…';
    results.innerHTML = '';
    try {
      const seed = GUESS_SEEDS[rndInt(0, GUESS_SEEDS.length - 1)];
      const list = await searchNetease(seed, 30);
      const have = new Set(songs.filter((x) => x.source === 'netease').map((x) => x.neteaseId));
      const fresh = list.filter((t) => !have.has(t.neteaseId));
      batch = pickN(fresh.length >= 4 ? fresh : list, 8);
      status.textContent = `按「${seed}」随机挑了 ${batch.length} 首 · 点歌名播放，或收藏进歌单`;
      batch.forEach((t) => results.appendChild(guessRow(t, s)));
    } catch (err) {
      status.textContent = '挑歌失败：' + (err.message || '网易云接口连不上');
      results.appendChild(el('div', { class: 'mc-fail' }, [
        el('div', { class: 'small', text: '稍后再试一次，或直接用搜索挑歌。' })
      ]));
    } finally {
      shuffleBtn.disabled = false;
      playBtn.disabled = false;
    }
  }

  function guessRow(t, sheetRef) {
    const row = el('div', { class: 'mc-res' }, [
      el('div', { class: 'mc-res-main', onclick: () => { sheetRef.close(); play(t); } }, [
        el('div', { class: 'mc-res-t', text: t.title }),
        el('div', { class: 'mc-res-s', text: [t.artist, t.album, t.vip ? 'VIP' : ''].filter(Boolean).join(' · ') || '网易云' })
      ]),
      el('button', { class: 'btn sm', onclick: async () => {
        await collectSong(t, tab);
        sheetRef.close();
        await reload();
        paint();
        toast('已收藏「' + t.title + '」');
      } }, ['收藏'])
    ]);
    row.querySelector('.mc-res-main').style.cursor = 'pointer';
    return row;
  }

  gen(false);
}

/* ---------------- 导入网易云歌单 ---------------- */
function openPlaylistImport(prefill = '') {
  const input = el('input', { class: 'input', placeholder: 'https://music.163.com/#/playlist?id=…', value: prefill });
  const owner = { v: tab };
  const ownerRow = el('div', { class: 'seg-row' });
  const status = el('div', { class: 'mc-note', text: '支持网易云歌单链接或直接粘贴歌单 ID。' });
  const preview = el('div', { class: 'mc-import-preview' });
  const btn = el('button', { class: 'btn sm primary block', onclick: load }, ['读取歌单']);

  const s = sheet({ title: '导入网易云歌单', node: el('div', {}, [
    el('div', { class: 'field' }, [el('div', { class: 'field-l', text: '歌单链接' }), input]),
    el('div', { class: 'field' }, [el('div', { class: 'field-l', text: '放进' }), ownerRow]),
    btn, status, preview
  ]) });

  function paintOwner() {
    ownerRow.innerHTML = '';
    [{ k: 'me', l: '我的歌单' }, { k: 'ta', l: (state.role.name || 'TA') + ' 的歌单' }].forEach((o) => {
      ownerRow.appendChild(el('button', {
        class: 'chip' + (owner.v === o.k ? ' on' : ''), type: 'button',
        onclick: () => { owner.v = o.k; paintOwner(); }
      }, [o.l]));
    });
  }
  paintOwner();

  async function load() {
    const id = parsePlaylistId(input.value);
    if (!id) { toast('没有识别到歌单 ID'); return; }
    btn.disabled = true; btn.textContent = '读取中…';
    status.textContent = '正在读取歌单…';
    preview.innerHTML = '';
    try {
      const pl = await fetchPlaylist(id);
      status.textContent = `《${pl.name}》· ${pl.tracks.length} 首`;
      const list = el('div', { class: 'mc-import-list' });
      pl.tracks.slice(0, 6).forEach((t, i) => {
        list.appendChild(el('div', { class: 'mc-import-line', text: `${i + 1}. ${t.title}${t.artist ? ' · ' + t.artist : ''}` }));
      });
      if (pl.tracks.length > 6) list.appendChild(el('div', { class: 'mc-note', text: `…还有 ${pl.tracks.length - 6} 首` }));
      preview.appendChild(list);
      preview.appendChild(el('button', { class: 'btn sm primary block', onclick: async () => {
        await importPlaylist(pl, owner.v);
        s.close();
      } }, [`导入到${owner.v === 'ta' ? ' TA 的' : '我的'}歌单`]));
    } catch (err) {
      status.textContent = '读取失败：' + (err.message || '接口连不上');
      preview.appendChild(el('div', { class: 'mc-fail' }, [
        el('div', { class: 'small', text: '公开歌单一般能直接导入；私密歌单可能读取不了。' })
      ]));
    } finally {
      btn.disabled = false; btn.textContent = '读取歌单';
    }
  }

  setTimeout(() => input.focus(), 260);
}

async function importPlaylist(pl, owner) {
  const name = uniquePlaylistName(pl.name || '网易云歌单', owner);
  const songIds = [];
  let added = 0;
  for (const t of pl.tracks) {
    let row = songs.find((s) => s.neteaseId && s.neteaseId === t.neteaseId && (s.addedBy || 'me') === owner);
    if (!row) {
      row = {
        id: uid(), title: t.title, artist: t.artist, album: t.album || '',
        neteaseId: t.neteaseId, url: t.url || '', cover: t.cover || '',
        duration: t.duration || 0, vip: !!t.vip,
        source: 'netease', addedBy: owner, ts: Date.now()
      };
      await put('songs', row);
      songs.unshift(row);
      added += 1;
    }
    if (row.id && !songIds.includes(row.id)) songIds.push(row.id);
  }
  const rec = { id: uid(), owner, name, songIds, ts: Date.now() };
  await put('playlists', rec);
  playlists.push(rec);
  await reload();
  tab = owner;
  curList = rec.id;
  paint();
  toast(`已导入 ${songIds.length} 首到「${name}」${added ? '' : '（全部已存在）'}`);
}

/* ============================================================
   歌单管理
   ============================================================ */
function uniquePlaylistName(name, owner) {
  const base = String(name || '未命名歌单').trim() || '未命名歌单';
  const used = new Set(playlists.filter((p) => p.owner === owner).map((p) => p.name));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base} · ${i}`)) i += 1;
  return `${base} · ${i}`;
}

function newPlaylist(owner) {
  const input = el('input', { class: 'input', placeholder: '给歌单起个名字' });
  sheet({
    title: '新建歌单',
    node: el('div', { class: 'field' }, [input]),
    actions: [{ label: '创建', icon: 'IC-MIO-022', onSelect: async () => {
      const name = input.value.trim();
      if (!name) { toast('先写一个歌单名'); return; }
      const rec = { id: uid(), owner, name: uniquePlaylistName(name, owner), songIds: [], ts: Date.now() };
      await put('playlists', rec);
      playlists.push(rec);
      tab = owner; curList = rec.id;
      paint();
      toast('歌单已创建');
    } }]
  });
  setTimeout(() => input.focus(), 260);
}

function renamePlaylist(pl) {
  const input = el('input', { class: 'input', value: pl.name || '' });
  sheet({
    title: '重命名歌单',
    node: el('div', { class: 'field' }, [input]),
    actions: [{ label: '保存', icon: 'IC-MIO-021', onSelect: async () => {
      const name = input.value.trim();
      if (!name) { toast('歌单名不能为空'); return; }
      pl.name = uniquePlaylistName(name, pl.owner);
      await put('playlists', pl);
      await reload();
      paint();
      toast('已重命名');
    } }]
  });
  setTimeout(() => input.focus(), 260);
}

async function removePlaylist(pl) {
  const yes = await confirmBox({ title: '删除歌单', text: `确定删除「${pl.name}」？歌曲本身会保留。`, okText: '删除', danger: true });
  if (!yes) return;
  await del('playlists', pl.id);
  if (curList === pl.id) curList = 'all';
  await reload();
  paint();
  toast('歌单已删除');
}

async function addToPlaylist(songId, playlistId) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  pl.songIds = pl.songIds || [];
  if (!pl.songIds.includes(songId)) {
    pl.songIds.push(songId);
    await put('playlists', pl);
  }
}

async function pickPlaylistFor(song) {
  const owner = song.addedBy || 'me';
  const list = playlists.filter((p) => p.owner === owner);
  const items = list.map((pl) => ({
    label: pl.name,
    sub: (pl.songIds || []).includes(song.id) ? '已在歌单中' : ((pl.songIds || []).length + ' 首'),
    icon: 'IC-MIO-016',
    onSelect: async () => {
      await addToPlaylist(song.id, pl.id);
      await reload();
      toast('已放进「' + pl.name + '」');
      paint();
    }
  }));
  items.push({ label: '新建歌单并放入', icon: 'IC-MIO-022', onSelect: async () => {
    const rec = { id: uid(), owner, name: uniquePlaylistName('新歌单', owner), songIds: [song.id], ts: Date.now() };
    await put('playlists', rec);
    playlists.push(rec);
    await reload();
    toast('已新建歌单并放入');
    paint();
  } });
  actionSheet('放进歌单', items);
}

/* ---------------- 歌曲菜单 ---------------- */
function rowMenu(s) {
  const items = [{ label: '播放', icon: 'IC-MIO-029', onSelect: () => play(s) }];
  items.push({ label: '编辑歌词', icon: 'IC-CRD-006', sub: s.lyric ? '已有歌词，点击修改' : '还没有歌词', onSelect: () => openLyrics(s) });
  items.push({ label: '放进歌单', icon: 'IC-MIO-022', onSelect: () => pickPlaylistFor(s) });

  if ((s.addedBy || 'me') === 'me') {
    items.push({ label: '让 TA 也收藏一份', icon: 'IC-MIO-020', onSelect: async () => {
      if (songs.some((x) => x.originId === s.id && x.addedBy === 'ta')) { toast('TA 已经收过了'); return; }
      await put('songs', { ...s, id: uid(), addedBy: 'ta', originId: s.id, ts: Date.now() });
      await reload();
      toast((state.role.name || 'TA') + ' 收进了他的歌单');
      paint();
    } });
  }

  items.push({ label: '删除这首歌', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
    const yes = await confirmBox({ title: '删除歌曲', text: '确定删除这首吗？它会从所有歌单里移除。', okText: '删除', danger: true });
    if (!yes) return;
    if (cur && cur.id === s.id) { audio?.pause(); cur = null; }
    if (s.mediaId) await delMedia(s.mediaId);
    await del('songs', s.id);
    for (const pl of playlists) {
      if ((pl.songIds || []).includes(s.id)) {
        pl.songIds = pl.songIds.filter((id) => id !== s.id);
        await put('playlists', pl);
      }
    }
    await reload();
    paint();
    toast('已移除');
  } });

  actionSheet(s.title || '歌曲', items);
}

/* ============================================================
   TA：自己搜歌 / 收藏 / 字卡随机命名歌单
   ============================================================ */
function randomKeywords(n = 3) {
  const pool = eligible(cards);
  const out = [];
  drawCards(pool, Math.min(n, pool.length), false).forEach((c) => {
    const text = String(c.content || '').replace(/[。！？…~～!?.,，、；;：:"'“”‘’（）()【】\[\]]/g, ' ').trim();
    if (text && !out.includes(text)) out.push(text.slice(0, 10));
  });
  return out;
}

function randomPlaylistName() {
  const pool = eligible(cards);
  if (!pool.length) return uniquePlaylistName((state.role.name || 'TA') + ' 的歌单', 'ta');
  const n = Math.max(2, rndInt(2, 5));
  const parts = drawCards(pool, Math.min(n, pool.length), false).map((c) => c.content);
  let name = joinFragments(parts)
    .replace(/[。！？…~～!?.,，、；;：:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) name = (state.role.name || 'TA') + ' 的歌单';
  if (name.length > 24) name = name.slice(0, 24);
  return uniquePlaylistName(name, 'ta');
}

async function taAddSong(t, owner = 'ta') {
  const exists = songs.find((s) => s.neteaseId && s.neteaseId === t.neteaseId && (s.addedBy || 'me') === owner);
  if (exists) return exists;
  const row = {
    id: uid(), title: t.title || '未命名', artist: t.artist || '', album: t.album || '',
    neteaseId: t.neteaseId || '', url: t.url || '', duration: t.duration || 0,
    source: t.source || (t.neteaseId ? 'netease' : 'local'),
    addedBy: owner, originId: t.originId || null, ts: Date.now()
  };
  await put('songs', row);
  songs.unshift(row);
  return row;
}

/** TA 自己搜索并收藏 1–2 首；网络失败时从我的歌单里收。
    外层只管互斥，真正的动作在 doTaSearchAndCollect 里，方便建歌单时直接复用。 */
async function taSearchAndCollect({ silent = false } = {}) {
  if (taBusy) return [];
  taBusy = true;
  try {
    return await doTaSearchAndCollect(silent);
  } finally {
    taBusy = false;
  }
}

async function doTaSearchAndCollect(silent) {
  const tip = silent ? null : topBanner({ icon: 'IC-CRD-010', title: 'TA 正在找歌', sub: '在网易云翻一翻…' });
  const picked = [];
  try {
    const keywords = randomKeywords(3);
    const attempts = keywords.length ? keywords : ['轻音乐', '夜晚', '安静'];
    for (const kw of attempts) {
      if (picked.length) break;
      try {
        const list = await searchNetease(kw, 12);
        const got = pickN(list, Math.min(2, list.length));
        got.forEach((t) => picked.push(t));
      } catch { /* 换下一个关键词 */ }
    }
  } catch { /* 走本地兜底 */ }

  if (picked.length) {
    const rows = [];
    for (const t of picked) rows.push(await taAddSong(t, 'ta'));
    await reload();
    if (tab === 'ta') paint();
    if (!silent) toast((state.role.name || 'TA') + ' 收藏了「' + (rows[0].title || '一首歌') + '」' + (rows.length > 1 ? ` 等 ${rows.length} 首` : ''));
    if (tip) tip.close();
    return rows;
  }

  // 网易云连不上：从我的收藏里收一两首
  const localPool = songs.filter((s) => (s.addedBy || 'me') === 'me');
  const pickedLocal = pickN(localPool, Math.min(2, localPool.length));
  const rows = [];
  for (const src of pickedLocal) {
    if (songs.some((s) => s.originId === src.id && s.addedBy === 'ta')) continue;
    const copy = { ...src, id: uid(), addedBy: 'ta', originId: src.id, ts: Date.now() };
    await put('songs', copy);
    rows.push(copy);
  }
  await reload();
  if (tab === 'ta') paint();
  if (!silent) toast(rows.length ? '网易云暂时连不上，TA 从你的歌单里收了几首' : 'TA 翻了翻，什么也没找到');
  if (tip) tip.close();
  return rows;
}

/** TA 用字卡随机拼名建歌单，并往里放几首 */
async function taCreatePlaylist({ silent = false } = {}) {
  if (taBusy) return null;
  taBusy = true;
  try {
    const pool = songs.filter((s) => (s.addedBy || 'me') === 'ta');
    let picks = pickN(pool, Math.min(4, pool.length));
    if (!picks.length) picks = await doTaSearchAndCollect(true);
    if (!picks.length) {
      if (!silent) toast('TA 还没找到歌，先让他自己找几首吧');
      return null;
    }
    const name = randomPlaylistName();
    const rec = { id: uid(), owner: 'ta', name, songIds: picks.map((s) => s.id), ts: Date.now() };
    await put('playlists', rec);
    await reload();
    if (tab === 'ta') { curList = rec.id; paint(); }
    if (!silent) toast((state.role.name || 'TA') + ' 建了一个歌单：' + name);
    return rec;
  } finally {
    taBusy = false;
  }
}

/** TA 往指定歌单里放几首 */
async function taFillPlaylist(pl) {
  const pool = songs.filter((s) => (s.addedBy || 'me') === pl.owner);
  let picks = pickN(pool, Math.min(3, pool.length));
  if (!picks.length && pl.owner === 'ta') picks = await taSearchAndCollect({ silent: true });
  if (!picks.length) { toast('还没有歌可以放进去'); return; }
  const ids = new Set((pl.songIds || []).concat(picks.map((s) => s.id)));
  pl.songIds = Array.from(ids);
  await put('playlists', pl);
  await reload();
  paint();
  toast('已放进 ' + picks.length + ' 首');
}
