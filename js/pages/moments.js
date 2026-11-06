/* 朋友圈 · 布局参考微信朋友圈
   页面底部一栏：动态 / TA的主页 / 我的主页。
   动态流混合双方动态；每条动态：
   底部靠左「点赞 / 评论」，靠右「收藏 / 删除」，右上角「编辑」。 */

import { el, uid, openFile, compressImage, readBuf } from '../util.js';
import { iconImg } from '../icons.js';
import { normalPage } from '../shell.js';
import { go } from '../router.js';
import { state } from '../state.js';
import { all, put, del, kvGet } from '../store.js';
import { saveMedia, mediaURL, probeDuration } from '../media.js';
import { sheet, actionSheet, confirmBox, toast } from '../ui.js';
import { openMomentsManage } from '../momentManage.js';
import { resolveSongUrl, setNeteaseCookie } from '../musicapi.js';
import { maybePickInspiration } from '../inspiration.js';
import {
  normalizeMoment, scheduleReactions, scheduleReplyBack, scheduleLikeBack,
  flushReactions, onMoments, offMoments
} from '../momentsAI.js';

let timer = null;
let detach = null;
let friendMap = new Map();

export default async function pageMoments(view) {
  if (timer) clearInterval(timer);
  if (detach) { detach(); detach = null; }
  let mode = 'feed';   // feed | ta | me
  const taName = () => state.role.name || 'TA';

  await flushReactions();
  await paint();

  const onChange = () => paint();
  onMoments(onChange);
  detach = () => offMoments(onChange);
  timer = setInterval(() => { flushReactions(); }, 15000);

  /* ---------------- 顶栏 + 内容 ---------------- */
  async function paint() {
    view.innerHTML = '';
    normalPage('moments', {
      back: true,
      title: mode === 'feed' ? '朋友圈' : (mode === 'ta' ? `${taName()}的主页` : '我的主页')
    });
    const bar = document.getElementById('topbar');
    bar.appendChild(el('button', { class: 'tb-btn', title: '朋友圈字卡与朋友', onclick: () => openMomentsManage(() => paint()) }, [iconImg('IC-CRD-001')]));
    if (mode === 'feed') {
      bar.appendChild(el('button', { class: 'tb-btn', title: '相册', onclick: () => publish({ pickImage: true }) }, [iconImg('IC-MIO-015')]));
    }
    if (mode !== 'ta') {
      bar.appendChild(el('button', { class: 'tb-btn', title: '发布', onclick: () => publish() }, [iconImg('IC-MIO-022')]));
    }

    const [rawMoments, friends] = await Promise.all([all('moments'), all('friends')]);
    friendMap = new Map(friends.map((f) => [f.id, f]));
    const moments = rawMoments.map(normalizeMoment).sort((a, b) => b.ts - a.ts);
    const list = mode === 'ta' ? moments.filter((m) => m.author === 'ta')
      : mode === 'me' ? moments.filter((m) => m.author !== 'ta')
      : moments;

    const wrap = el('div', { class: 'page tight mn-page' });
    view.appendChild(wrap);

    if (mode !== 'feed') wrap.appendChild(await coverCard(mode));

    const feed = el('div', { class: 'mn-feed' });
    if (!list.length) {
      feed.appendChild(el('div', { class: 'mn-post' }, [
        el('div', { class: 'mn-empty', text: mode === 'ta' ? `${taName()}还没有发过动态。` : '还没有动态，点右上角「发布」发第一条。' })
      ]));
    } else {
      for (const m of list) feed.appendChild(await postNode(m));
    }
    wrap.appendChild(feed);
    wrap.appendChild(tabBar());
  }

  /* ---------------- 底部一栏：动态 / TA的主页 / 我的主页 ---------------- */
  function tabBar() {
    const mk = (key, label) => el('button', {
      class: 'mn-tab' + (mode === key ? ' on' : ''),
      onclick: () => { if (mode !== key) { mode = key; paint(); } }
    }, [label]);
    return el('div', { class: 'mn-tabs' }, [
      mk('feed', '动态'),
      mk('ta', `${taName()}的主页`),
      mk('me', '我的主页')
    ]);
  }

  /* ---------------- 主页资料头：TA / 我（参考微信个人主页卡片） ---------------- */
  async function coverCard(who) {
    const isMe = who !== 'ta';
    const name = isMe ? '我' : taName();
    const avSrc = isMe
      ? (state.skin?.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '')
      : (state.role.avatarId ? await mediaURL(state.role.avatarId) : '');
    const av = el('div', { class: 'mn-c-av' }, [avSrc ? el('img', { src: avSrc, alt: '头像' }) : document.createTextNode(name.slice(0, 1))]);

    const rawMoments = await all('moments');
    const mine = rawMoments.filter((m) => isMe ? m.author !== 'ta' : m.author === 'ta');
    const photoN = mine.reduce((s, m) => s + (m.mediaIds || []).length, 0);
    const likeN = mine.reduce((s, m) => s + (m.likes || []).length, 0);

    const stat = (n, label) => el('div', {}, [
      el('b', { text: String(n) }), el('span', { text: label })
    ]);

    const btns = el('div', { class: 'mn-c-btns' });
    if (isMe) {
      btns.appendChild(el('button', { onclick: () => go('/role') }, ['编辑资料']));
      btns.appendChild(el('button', { onclick: () => publish() }, ['发布动态']));
    } else {
      btns.appendChild(el('button', { onclick: () => go('/role') }, ['查看资料']));
    }

    return el('div', { class: 'mn-cover' }, [
      el('div', { class: 'mn-c-top' }, [
        av,
        el('div', { class: 'mn-c-stats' }, [
          stat(mine.length, '帖子'),
          stat(photoN, '照片'),
          stat(likeN, '获赞')
        ])
      ]),
      el('div', { class: 'mn-c-name', text: name }),
      (!isMe && state.role.sign) ? el('div', { class: 'mn-c-sign', text: state.role.sign }) : null,
      btns
    ]);
  }

  /* ---------------- 一条动态 ---------------- */
  async function postNode(m) {
    const isMe = m.author !== 'ta';
    const avSrc = isMe
      ? (state.skin?.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '')
      : (state.role.avatarId ? await mediaURL(state.role.avatarId) : '');
    const name = isMe ? '我' : taName();

    const av = el('div', { class: 'mn-av' }, [avSrc ? el('img', { src: avSrc, alt: '头像' }) : document.createTextNode(name.slice(0, 1))]);

    const nodes = [el('div', { class: 'mn-post-head' }, [
      av,
      el('div', { class: 'mn-who' }, [
        el('div', { class: 'nm', text: name }),
        el('div', { class: 'sub', text: relTime(m.ts) })
      ]),
      /* 右上角：编辑 */
      el('button', { class: 'mn-ico-btn', title: '编辑', onclick: () => openEdit(m) }, [iconImg('IC-CRD-006')])
    ])];

    if (m.text) nodes.push(el('div', { class: 'mn-txt', text: m.text }));

    const shot = !!m.shot;
    if ((m.mediaIds || []).length) nodes.push(shot ? mediaStrip(m.mediaIds, true) : mediaGrid(m.mediaIds));

    if (m.audioId) nodes.push(audioPill(m.audioId));
    else if (m.song) nodes.push(neteasePill(m.song));

    /* 互动气泡：点赞名单 + 评论（参考微信灰色气泡） */
    nodes.push(actionBubble(m));

    /* 底部操作行：左「点赞 / 评论」，右「收藏 / 删除」（纯图标按钮） */
    const likedByMe = m.likes.some((l) => l.who === 'me');
    const likeBtn = el('button', { class: 'mn-act' + (likedByMe ? ' on' : ''), title: '点赞', onclick: () => toggleLike(m) }, [
      iconImg('IC-MOM-003'),
      m.likes.length ? el('i', { class: 'n', text: String(m.likes.length) }) : null
    ]);
    const cmtBtn = el('button', { class: 'mn-act', title: '评论', onclick: () => openComment(m) }, [iconImg('IC-MOM-004')]);
    const favBtn = el('button', { class: 'mn-act' + (m.fav ? ' fav' : ''), title: m.fav ? '取消收藏' : '收藏', onclick: () => toggleFav(m) }, [iconImg('IC-MIO-038')]);
    const delBtn = el('button', { class: 'mn-act danger', title: '删除', onclick: () => removeMoment(m) }, [iconImg('IC-CRD-007')]);
    nodes.push(el('div', { class: 'mn-foot' }, [
      el('div', { class: 'l' }, [likeBtn, cmtBtn]),
      el('div', { class: 'r' }, [favBtn, delBtn])
    ]));

    return el('div', { class: 'mn-post' }, nodes);
  }

  /* 互动气泡：点赞名单 + 评论列表 + TA 正在看提示 */
  function actionBubble(m) {
    const box = el('div', { class: 'mn-bubble' });
    if (m.likes.length) {
      box.appendChild(el('div', { class: 'mn-like' }, [
        iconImg('IC-MOM-003'),
        el('span', { text: ' ' + m.likes.map((l) => whoName(l.who)).join('、') })
      ]));
    }
    if (m.comments.length) {
      const cmts = el('div', { class: 'mn-cmts' });
      m.comments.forEach((c) => {
        cmts.appendChild(el('div', { class: 'mn-cmt' }, [
          el('span', { class: 'who', text: whoName(c.who) + '：' }),
          el('span', { text: c.text })
        ]));
      });
      box.appendChild(cmts);
    }
    if (!m.likes.length && !m.comments.length) {
      if (m.pending.likeAt || m.pending.commentAt || m.pending.replyAt || m.pending.friendAt) {
        box.appendChild(el('div', { class: 'mn-cmt-hint', text: `${taName()} 正在看…` }));
      } else {
        box.appendChild(el('div', { class: 'mn-cmt-hint', text: '留下第一条评论' }));
      }
    }
    return box;
  }

  /* ---------------- 编辑（右上角） ---------------- */
  function openEdit(m) {
    const input = el('textarea', { class: 'input', placeholder: '这一刻的想法…' });
    input.value = m.text || '';
    sheet({
      title: '编辑动态',
      node: el('div', {}, [
        input,
        el('div', { class: 'hint', style: { marginTop: '8px' }, text: '只修改文字内容，配图与配乐保持不变。' })
      ]),
      actions: [
        { label: '保存', icon: 'IC-MIO-022', onSelect: async () => {
          const next = normalizeMoment(m);
          next.text = input.value.trim();
          await put('moments', next);
          toast('已保存');
          paint();
        } },
        { label: `让 ${taName()} 现在回应`, icon: 'IC-MOM-003', onSelect: async () => {
          const next = normalizeMoment(m);
          next.pending = Object.assign({}, next.pending, {
            likeAt: next.pending.likeAt || Date.now(),
            commentAt: next.pending.commentAt || Date.now()
          });
          await put('moments', next);
          await flushReactions();
          await paint();
        } }
      ]
    });
  }

  /* ---------------- 点赞 / 评论 / 收藏 / 删除 ---------------- */
  async function toggleLike(m) {
    const next = normalizeMoment(m);
    const i = next.likes.findIndex((l) => l.who === 'me');
    if (i >= 0) next.likes.splice(i, 1);
    else next.likes.push({ who: 'me', ts: Date.now() });
    await put('moments', next);
    // 我新增点赞 → TA 可能回赞
    if (i < 0) scheduleLikeBack(next).catch(() => {});
    await paint();
  }

  async function toggleFav(m) {
    const next = normalizeMoment(m);
    next.fav = !next.fav;
    await put('moments', next);
    toast(next.fav ? '已收藏' : '已取消收藏');
    await paint();
  }

  async function removeMoment(m) {
    const yes = await confirmBox({ title: '删除动态', text: '删除后无法恢复。', okText: '删除', danger: true });
    if (!yes) return;
    await del('moments', m.id);
    for (const id of (m.mediaIds || [])) await del('media', id);
    if (m.audioId) await del('media', m.audioId);
    toast('已删除');
    await paint();
  }

  function openComment(m) {
    const input = el('textarea', { class: 'input', placeholder: '写下评论…' });
    sheet({
      title: '添加评论',
      node: input,
      actions: [{ label: '发布评论', icon: 'IC-MOM-004', onSelect: async () => {
        const text = input.value.trim();
        if (!text) return toast('写点什么');
        const next = normalizeMoment(m);
        const cid = uid();
        next.comments.push({ id: cid, who: 'me', text, ts: Date.now() });
        await put('moments', next);
        await scheduleReplyBack(next, cid);
        await paint();
      } }]
    });
  }
}

/* ---------------- 小组件 ---------------- */
/** 评论者名字：我 / TA / 朋友 */
function whoName(who) {
  if (who === 'me') return '我';
  if (who === 'ta') return state.role.name || 'TA';
  const f = friendMap.get(who);
  return f ? f.name : '朋友';
}

/** 相对时间：21 小时前 / 10月20日 09:49 */
function relTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  const t = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getMonth() + 1}月${t.getDate()}日 ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/** 配图：微信式九宫格（1 张大图、4 张两行两列、其余三列）；聊天截图仍走横向长图 */
function mediaGrid(ids) {
  const n = Math.min(ids.length, 9);
  if (n === 1) {
    const img = el('img', { alt: '配图' });
    mediaURL(ids[0]).then((u) => { if (!u) return; img.src = u; img.onclick = () => zoom(u); });
    return el('div', { class: 'mn-media' }, [el('div', { class: 'mn-grid one' }, [img])]);
  }
  const grid = el('div', { class: 'mn-grid' + (n === 4 ? ' four' : '') });
  ids.slice(0, 9).forEach((id) => {
    const img = el('img', { alt: '配图' });
    mediaURL(id).then((u) => { if (!u) return; img.src = u; img.onclick = () => zoom(u); });
    grid.appendChild(img);
  });
  return el('div', { class: 'mn-media' }, [grid]);
}

/** 聊天截图：横向滑动完整长图 + 底部圆点 */
function mediaStrip(ids, shot = false) {
  const strip = el('div', { class: 'mn-strip' });
  const dots = el('div', { class: 'mn-dots' });
  ids.slice(0, 9).forEach((id, i) => {
    const img = el('img', { alt: '配图', class: shot ? 'mn-shot' : '' });
    mediaURL(id).then((u) => {
      if (!u) return;
      img.src = u;
      img.onclick = () => zoom(u);
    });
    strip.appendChild(el('div', { class: 'mn-slide' }, [img]));
    dots.appendChild(el('span', { class: 'd' + (i === 0 ? ' on' : '') }));
  });
  strip.addEventListener('scroll', () => {
    const idx = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
  }, { passive: true });
  return el('div', { class: 'mn-media' }, [strip, ids.length > 1 ? dots : null]);
}

/** 本条配乐：点击播放 / 暂停 */
function audioPill(audioId) {
  const pill = el('button', { class: 'mn-music' }, [iconImg('IC-MIO-016'), el('span', { text: '本条配乐' })]);
  const audio = new Audio();
  let loaded = '';
  let playing = false;
  pill.onclick = async () => {
    if (!loaded) {
      loaded = await mediaURL(audioId);
      if (!loaded) return toast('音频已丢失');
      audio.src = loaded;
    }
    if (playing) { audio.pause(); playing = false; } else { try { await audio.play(); playing = true; } catch { toast('播放失败'); } }
    pill.classList.toggle('on', playing);
  };
  audio.onended = () => { playing = false; pill.classList.remove('on'); };
  return pill;
}

/** 网易云配乐：只在「一起听」里连过账号时才会出现 */
function neteasePill(song) {
  const label = song.artist ? `${song.title || '网易云音乐'} · ${song.artist}` : (song.title || '网易云音乐');
  const pill = el('button', { class: 'mn-music', title: '播放配乐' }, [iconImg('IC-MIO-016'), el('span', { text: label })]);
  const audio = new Audio();
  let url = '';
  let playing = false;
  pill.onclick = async () => {
    if (!url) {
      const cookie = await kvGet('neteaseCookie', '');
      setNeteaseCookie(cookie);
      try { url = await resolveSongUrl(song); } catch { url = ''; }
      if (!url) return toast('这首暂时播不了');
      audio.src = url;
    }
    if (playing) {
      audio.pause();
      playing = false;
    } else {
      try { await audio.play(); playing = true; } catch { return toast('播放失败，可能需要 VIP'); }
    }
    pill.classList.toggle('on', playing);
  };
  audio.onended = () => { playing = false; pill.classList.remove('on'); };
  return pill;
}

/** 大图查看 */
function zoom(url) {
  if (!url) return;
  const mask = el('div', {
    style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.92)', zIndex: '80', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' },
    onclick: (e) => { if (e.target === mask) mask.remove(); }
  }, [el('img', { src: url, style: { maxWidth: '100%', maxHeight: '100%', borderRadius: '10px' } })]);
  document.getElementById('layer-root').appendChild(mask);
}

/* ---------------- 发布 ---------------- */
async function publish(opts = {}) {
  let mediaIds = [];
  let audioId = null;
  const textInput = el('textarea', { class: 'input', placeholder: '这一刻的想法…' });
  const imgBox = el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '8px' } });
  const audioBox = el('div', { class: 'small muted', style: { marginTop: '8px' } });

  function paintImgs() {
    imgBox.innerHTML = '';
    mediaIds.forEach((id, i) => {
      const cell = el('div', { style: { position: 'relative' } });
      const img = el('img', { style: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px' } });
      mediaURL(id).then((u) => { if (u) img.src = u; });
      const x = el('span', { style: { position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(20,20,25,.62)', color: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }, text: '×' });
      x.onclick = () => { mediaIds.splice(i, 1); paintImgs(); };
      cell.appendChild(img); cell.appendChild(x);
      imgBox.appendChild(cell);
    });
    imgBox.appendChild(el('button', { class: 'btn sm', onclick: addImages }, ['+ 图片']));
  }

  async function addImages() {
    const files = await openFile({ accept: 'image/*', multiple: true });
    if (!files || !files.length) return;
    for (const f of files.slice(0, 9)) {
      const { blob, w, h } = await compressImage(f, 1080);   // 统一压到 1080px 长边
      mediaIds.push(await saveMedia(blob, { type: 'image', w, h, source: 'me' }));
    }
    paintImgs();
  }

  async function addAudio() {
    const f = await openFile({ accept: 'audio/*' });
    if (!f) return;
    const buf = await readBuf(f);
    const blob = new Blob([buf], { type: f.type || 'audio/mpeg' });
    audioId = await saveMedia(blob, { type: 'audio', duration: await probeDuration(blob), source: 'me' });
    audioBox.textContent = '已附加音频：' + (f.name || '');
  }

  paintImgs();

  const node = el('div', {}, [
    textInput,
    imgBox,
    el('div', { class: 'row', style: { marginTop: '10px', gap: '8px' } }, [
      el('button', { class: 'btn sm', onclick: addAudio }, ['附加音频']),
      audioBox
    ]),
    el('div', { class: 'hint', style: { marginTop: '10px' }, text: '图片会本地压缩到 1080px 后保存，全程不联网。' })
  ]);

  sheet({
    title: '发布动态',
    node,
    actions: [{ label: '发布', icon: 'IC-MOM-002', onSelect: async () => {
      const text = textInput.value.trim();
      if (!text && !mediaIds.length) return toast('写点什么或选一张图');
      const m = {
        id: uid(), ts: Date.now(), author: 'me',
        text, mediaIds, audioId,
        likes: [], comments: [], pending: {}
      };
      await put('moments', m);
      if (text) maybePickInspiration({ text, source: 'moment', sourceId: m.id }).catch(() => {});
      await scheduleReactions(m);
      location.reload();
      toast('已发布，TA 会来看');
    } }]
  });

  if (opts.pickImage) addImages();
}
