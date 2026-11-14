/* 朋友圈 · 布局参考微信朋友圈
   页面底部一栏：动态 / TA的主页 / 我的主页。
   动态流混合双方动态；每条动态：
   底部靠左「点赞 / 评论」，靠右「收藏 / 删除」，右上角「编辑」。 */

import { el, uid, openFile, compressImage, readBuf } from '../util.js';
import { iconImg } from '../icons.js';
import { normalPage } from '../shell.js';
import { state, saveSkin, saveRole } from '../state.js';
import { all, put, del, kvGet, kvSet } from '../store.js';
import { saveMedia, mediaURL, probeDuration } from '../media.js';
import { sheet, actionSheet, confirmBox, toast } from '../ui.js';
import { openMomentsManage } from '../momentManage.js';
import { resolveSongUrl } from '../musicapi.js';
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
  /* 朋友圈里「我」的显示名（设置里可改，空则用「我」） */
  const myName = () => state.skin?.mnNameMe || '我';

  await flushReactions();
  await paint();

  const onChange = () => paint();
  onMoments(onChange);
  detach = () => offMoments(onChange);
  timer = setInterval(() => { flushReactions(); }, 15000);

  /* ---------------- 顶栏 + 内容 ---------------- */
  async function paint() {
    const keepTop = view.scrollTop;      // 重画后恢复滚动位置，避免“莫名其妙”跳顶
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

    if (mode !== 'feed') {
      /* 主页：渐变封面 + 资料卡 + 日期时间线（动态流不变） */
      wrap.appendChild(await coverCard(mode));
      wrap.appendChild(el('div', { class: 'mnh-sec' }, [el('div', { class: 't', text: '动态' })]));
      wrap.appendChild(await homeTimeline(list));
    } else {
      const feed = el('div', { class: 'mn-feed' });
      if (!list.length) {
        feed.appendChild(el('div', { class: 'mn-post' }, [
          el('div', { class: 'mn-empty', text: `还没有动态，点右上角「发布」发第一条。` })
        ]));
      } else {
        for (const m of list) feed.appendChild(await postNode(m));
      }
      wrap.appendChild(feed);
    }
    wrap.appendChild(tabBar());

    /* 内容全部构建完（含头像等异步素材）再一次性换入：
       旧内容一直显示到新内容就绪，消除重建过程中的空白闪烁 */
    view.innerHTML = '';
    view.appendChild(wrap);
    view.scrollTop = keepTop;
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

  /* ---------------- 主页资料头：渐变封面 + 悬浮卡片（新版） ---------------- */
  async function coverCard(who) {
    const isMe = who !== 'ta';
    const name = isMe ? myName() : taName();
    const avSrc = isMe
      ? (state.skin?.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '')
      : (state.role.avatarId ? await mediaURL(state.role.avatarId) : '');
    const av = el('div', { class: 'mnh-av' }, [avSrc ? el('img', { src: avSrc, alt: '头像' }) : document.createTextNode(name.slice(0, 1))]);

    const rawMoments = await all('moments');
    const mine = rawMoments.filter((m) => isMe ? m.author !== 'ta' : m.author === 'ta');
    const photoN = mine.reduce((s, m) => s + (m.mediaIds || []).length, 0);
    const likeN = mine.reduce((s, m) => s + (m.likes || []).length, 0);

    /* 顶部渐变区：默认灰黑渐变；换成自定义图后仍盖同一层渐变，下摆渐白、
       图片在下半部分被白色盖住不显示（点一下即可换图 / 恢复默认） */
    const coverId = isMe ? await kvGet('mnCoverMe') : await kvGet('mnCoverTa');
    const coverSrc = coverId ? await mediaURL(coverId) : '';
    const cv = el('div', { class: 'mnh-cv' + (coverSrc ? ' has-img' : ''), title: '更换封面' });
    if (coverSrc) cv.style.backgroundImage = `url("${coverSrc}")`;
    cv.addEventListener('click', () => pickCover(isMe));

    const stat = (n, label) => el('div', { class: 'it' }, [
      el('span', { text: label }), el('b', { text: String(n) })
    ]);
    const sign = isMe ? (state.skin?.mySign || '') : (state.role.signature || '');

    return el('div', { class: 'mnh' }, [
      cv,
      el('div', { class: 'mnh-card' }, [
        av,
        el('div', { class: 'mnh-head' }, [
          el('div', { class: 'mnh-name', text: name }),
          el('button', { class: 'mnh-pen', title: '设置', onclick: () => profileMenu(isMe) }, [iconImg('IC-CRD-006')])
        ]),
        el('div', { class: 'mnh-sign' + (sign ? '' : ' mute'), text: sign || '签名' }),
        el('div', { class: 'mnh-stats' }, [stat(mine.length, '帖子'), stat(photoN, '照片'), stat(likeN, '获赞')])
      ])
    ]);
  }

  /* 主页时间线：按日期分组，左边日/月，右边小框（点开看完整动态） */
  async function homeTimeline(list) {
    const box = el('div', { class: 'mnh-feed' });
    if (!list.length) return box;
    const groups = new Map();
    for (const m of list) {
      const d = new Date(m.ts);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (!groups.has(key)) groups.set(key, { d, items: [] });
      groups.get(key).items.push(m);
    }
    for (const g of groups.values()) {
      const tiles = el('div', { class: 'mnh-tiles' });
      for (const m of g.items) tiles.appendChild(await homeTile(m));
      box.appendChild(el('div', { class: 'mnh-group' }, [
        el('div', { class: 'mnh-date' }, [
          el('div', { class: 'd', text: String(g.d.getDate()).padStart(2, '0') }),
          el('div', { class: 'm', text: (g.d.getMonth() + 1) + '月' })
        ]),
        tiles
      ]));
    }
    return box;
  }

  /* 小框：有图显示图（同时有文字就在图底部压一行开头几个字）；
     纯文字直接显示文字；点开看完整帖子 */
  async function homeTile(m) {
    const t = el('button', { class: 'mnh-tile', title: '查看动态' });
    const mid = (m.mediaIds || [])[0];
    let painted = false;
    if (mid) {
      const src = await mediaURL(mid);
      if (src) {
        const img = el('img', { src, alt: '' });
        img.addEventListener('error', () => {
          img.replaceWith(el('div', { class: 'txt', text: m.text || '' }));
          const cap = t.querySelector('.cap');
          if (cap) cap.remove();
        });
        t.appendChild(img);
        painted = true;
      }
    }
    if (painted) {
      if (m.text) t.appendChild(el('div', { class: 'cap', text: m.text.slice(0, 9) }));
    } else {
      t.appendChild(el('div', { class: 'txt', text: m.text || (m.song ? '分享了一首歌' : m.audioId ? '分享了一段语音' : '') }));
    }
    t.addEventListener('click', async () => {
      sheet({ title: '动态', node: await postNode(m) });
    });
    return t;
  }

  /* ---------------- 主页设置（卡片右上角铅笔） ---------------- */
  async function pickCover(isMe) {
    /* 注意：openFile 不带 multiple 时返回单个 File（不是数组），原来按数组判断导致直接 return、换了没反应 */
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob } = await compressImage(f, 1440);
    const id = await saveMedia(blob, { type: 'image', source: 'me' });
    await kvSet(isMe ? 'mnCoverMe' : 'mnCoverTa', id);
    await paint();
    toast('封面已更新');
  }

  async function profileMenu(isMe) {
    const key = isMe ? 'mnCoverMe' : 'mnCoverTa';
    const hasCover = !!(await kvGet(key));
    actionSheet('设置', [
      { label: '修改名字', icon: 'IC-CRD-006', onSelect: () => editName(isMe) },
      { label: '修改签名', icon: 'IC-CRD-006', onSelect: () => editSign(isMe) },
      { label: '更换封面图', icon: 'IC-MIO-015', onSelect: () => pickCover(isMe) },
      hasCover ? {
        label: '恢复默认封面',
        onSelect: async () => { await kvSet(key, null); await paint(); toast('已恢复默认封面'); }
      } : null
    ]);
  }

  function editName(isMe) {
    const cur = isMe ? myName() : taName();
    const input = el('input', { class: 'input', maxLength: 16, value: cur === '我' ? '' : cur, placeholder: '显示在朋友圈的名字' });
    sheet({
      title: '修改名字',
      node: el('div', { class: 'field' }, [input]),
      actions: [{
        label: '保存', onSelect: async () => {
          const v = input.value.trim();
          if (isMe) {
            state.skin.mnNameMe = v || '';   // 空 = 恢复默认「我」
            await saveSkin();
          } else {
            if (!v) return toast('名字不能为空');
            state.role.name = v;
            await saveRole();
          }
          await paint();
          toast('已保存');
        }
      }]
    });
  }

  function editSign(isMe) {
    const cur = isMe ? (state.skin.mySign || '') : (state.role.signature || '');
    const input = el('input', { class: 'input', maxLength: 40, value: cur, placeholder: '一句话介绍自己' });
    sheet({
      title: '修改签名',
      node: el('div', { class: 'field' }, [input]),
      actions: [{
        label: '保存', onSelect: async () => {
          const v = input.value.trim();
          if (isMe) { state.skin.mySign = v; await saveSkin(); }
          else { state.role.signature = v; await saveRole(); }
          await paint();
          toast('已保存');
        }
      }]
    });
  }

  /* ---------------- 一条动态 ---------------- */
  async function postNode(m) {
    const isMe = m.author !== 'ta';
    const avSrc = isMe
      ? (state.skin?.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '')
      : (state.role.avatarId ? await mediaURL(state.role.avatarId) : '');
    const name = isMe ? myName() : taName();

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
    const bubble = actionBubble(m);
    nodes.push(bubble);

    /* 底部操作行：左「点赞 / 评论」，右「收藏 / 删除」（纯图标按钮） */
    const likedByMe = m.likes.some((l) => l.who === 'me');
    const likeBtn = el('button', { class: 'mn-act' + (likedByMe ? ' on' : ''), title: '点赞', onclick: () => toggleLike(m, refresh) }, [
      /* 点过赞 = 红色实心爱心，不再用角标显示次数 */
      iconImg(likedByMe ? 'IC-MOM-007' : 'IC-MOM-003')
    ]);
    const cmtBtn = el('button', { class: 'mn-act', title: '评论', onclick: () => openComment(m, refresh) }, [iconImg('IC-MOM-004')]);
    const favBtn = el('button', { class: 'mn-act' + (m.fav ? ' fav' : ''), title: m.fav ? '取消收藏' : '收藏', onclick: () => toggleFav(m, refresh) }, [
      iconImg(m.fav ? 'IC-MIO-045' : 'IC-MIO-038')   /* 收藏后换实心星标 */
    ]);
    const delBtn = el('button', { class: 'mn-act danger', title: '删除', onclick: () => removeMoment(m) }, [iconImg('IC-CRD-007')]);
    nodes.push(el('div', { class: 'mn-foot' }, [
      el('div', { class: 'l' }, [likeBtn, cmtBtn]),
      el('div', { class: 'r' }, [favBtn, delBtn])
    ]));

    /* 局部刷新：点赞/收藏/评论只换自己的按钮和气泡，不整页重画（避免闪屏） */
    let bubbleNode = bubble;
    function refresh(mm) {
      const liked = mm.likes.some((l) => l.who === 'me');
      likeBtn.classList.toggle('on', liked);
      likeBtn.replaceChildren(iconImg(liked ? 'IC-MOM-007' : 'IC-MOM-003'));
      favBtn.classList.toggle('fav', !!mm.fav);
      favBtn.title = mm.fav ? '取消收藏' : '收藏';
      favBtn.replaceChildren(iconImg(mm.fav ? 'IC-MIO-045' : 'IC-MIO-038'));
      const nb = actionBubble(mm);
      bubbleNode.replaceWith(nb);
      bubbleNode = nb;
    }

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
  async function toggleLike(m, refresh) {
    const next = normalizeMoment(m);
    const i = next.likes.findIndex((l) => l.who === 'me');
    if (i >= 0) next.likes.splice(i, 1);
    else next.likes.push({ who: 'me', ts: Date.now() });
    await put('moments', next);
    // 我新增点赞 → TA 可能回赞
    if (i < 0) scheduleLikeBack(next).catch(() => {});
    Object.assign(m, next);          // 原地更新，后续操作基于最新数据
    refresh(next);                    // 只换按钮和气泡，不整页重画（闪屏根源）
  }

  async function toggleFav(m, refresh) {
    const next = normalizeMoment(m);
    next.fav = !next.fav;
    await put('moments', next);
    toast(next.fav ? '已收藏' : '已取消收藏');
    Object.assign(m, next);
    refresh(next);
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

  function openComment(m, refresh) {
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
        Object.assign(m, next);
        refresh(next);                 // 局部刷新，不整页重画
      } }]
    });
  }
}

/* ---------------- 小组件 ---------------- */
/** 评论者名字：我 / TA / 朋友 */
function whoName(who) {
  if (who === 'me') return state.skin?.mnNameMe || '我';
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
      await paint();   // 局部重画代替整页 reload（避免闪屏与滚动丢失）
      toast('已发布，TA 会来看');
    } }]
  });

  if (opts.pickImage) addImages();
}
