/* 聊天页 · QQ 风格布局
   顶部：TA 头像 + 名字 + 状态；中部：消息区；底部：输入栏 + 底部导航 */

import { el, uid, compressImage, openFile, fmtDay, readBuf, chance, rndInt, downloadBlob } from '../util.js';
import { iconImg } from '../icons.js';
import { setUnread } from '../shell.js';
import { go } from '../router.js';
import { state, roleAvatarSrc, pickRoleStatus, roleStatusMeta, applySkin, saveSkin, saveRole } from '../state.js';
import { all, put, get, bulkPut, kvGet, kvSet } from '../store.js';
import { mediaURL, saveMedia, audioEl, probeDuration, delMedia } from '../media.js';
import { sheet, actionSheet, confirmBox, toast, alertBox } from '../ui.js';
import { openCallMenu, callHistory, triggerIncoming } from '../call.js';
import { openBulkImport } from '../bulkimport.js';
import { taPostChatShot } from '../momentShot.js';
import * as sched from '../scheduler.js';
import { state as S } from '../state.js';
import { createFreeCanvas, GRAFITTI_W, GRAFITTI_H } from '../graffiti.js';
import { applyTaRename, applyTaAvatar } from '../nicknameAI.js';
import { makeZip, readZip } from '../zip.js';

let cleanups = [];

/* 金额格式化：转账 / 红包消息的渲染与输入弹层共用。
   必须放在 pageChat 之外——初次 rerenderAll() 早于 pageChat 内的语句执行，
   若挂在函数体里会因 TDZ 报错。 */
const money = (n) => Number(n || 0).toFixed(2);

/* 骰子：与「抉择 · 扔骰子」同款的 3D 立方体——连续翻滚 1.6s，再落定到结果面。
   同样必须放在 pageChat 之外——msgNode 在首次 rerenderAll() 时就会用到 */
const DICE_DOTS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
};
const DICE_FACE_TF = {
  1: 'translateZ(27px)',
  2: 'rotateY(90deg) translateZ(27px)',
  3: 'rotateY(180deg) translateZ(27px)',
  4: 'rotateY(-90deg) translateZ(27px)',
  5: 'rotateX(90deg) translateZ(27px)',
  6: 'rotateX(-90deg) translateZ(27px)'
};
const DICE_ROLL_MS = 1600;   // 翻滚时长（与抉择页一致）
const DICE_LAND_MS = 1000;   // 落定过渡时长
const diceAnim = new Map();  // 消息 id → 动画结束时间戳，重绘也不会让动画提前中断

function buildDiceCube() {
  const cube = el('div', { class: 'cdice' });
  for (let n = 1; n <= 6; n++) {
    cube.appendChild(el('div', { class: 'cface', style: { transform: DICE_FACE_TF[n] } },
      DICE_DOTS[n].map(([x, y]) => el('i', { style: { left: x + '%', top: y + '%' } }))));
  }
  return cube;
}

function landDice(cube, value, instant = false) {
  cube.classList.remove('rolling');
  cube.classList.remove('land-1', 'land-2', 'land-3', 'land-4', 'land-5', 'land-6');
  if (instant) cube.classList.add('no-anim');
  cube.classList.add('land-' + value);
}

/* 掷出后立方体连续翻滚，之后落定为结果面 */
function playDiceRoll(cube, m) {
  let end = diceAnim.get(m.id);
  if (!end) { end = m.ts + DICE_ROLL_MS + DICE_LAND_MS; diceAnim.set(m.id, end); }
  const remain = end - Date.now();
  if (remain <= DICE_LAND_MS) { landDice(cube, m.value); return; }
  cube.classList.add('rolling');
  cube.style.animationDuration = (remain - DICE_LAND_MS) + 'ms';
  setTimeout(() => {
    cube.style.animationDuration = '';
    landDice(cube, m.value);
  }, remain - DICE_LAND_MS);
}

/* 问问TA 的草稿：「重复提问」开启时下次打开还在 */
let askDraft = null;

/* TA 的询问：我回答后 TA 会附加评论，随机 10~120 秒送达（每回都不一样） */
const taqTimers = new Map();   // 消息 id → setTimeout
const TAQ_FALLBACK = ['收到啦', '好，知道了', '这样啊～', '了解了解', '嗯嗯，记下了'];
const taqCommentDelay = () => 10_000 + rndInt(0, 110_000);

async function taqCommentText() {
  try {
    const cards = (await all('cards')).filter((c) => c.enabled && c.content);
    if (cards.length) return cards[rndInt(0, cards.length - 1)].content;
  } catch {}
  return TAQ_FALLBACK[rndInt(0, TAQ_FALLBACK.length - 1)];
}

async function deliverTaqComment(m) {
  try {
    const list = await all('messages');
    const cur = list.find((x) => x.id === m.id);
    if (!cur || !cur.taqAnswered || cur.taqComment) return;
    if (cur.taqDueTs && cur.taqDueTs > Date.now()) { scheduleTaqComment(cur); return; }   // 重选后已推迟
    await sched.updateMessage(m.id, { taqComment: await taqCommentText() });
  } catch {}
}

function scheduleTaqComment(m) {
  if (!m.taqAnswered || m.taqComment) return;
  const remain = (m.taqDueTs || 0) - Date.now();
  if (remain <= 0) { deliverTaqComment(m).catch(() => {}); return; }
  if (taqTimers.has(m.id)) return;
  taqTimers.set(m.id, setTimeout(() => {
    taqTimers.delete(m.id);
    deliverTaqComment(m).catch(() => {});
  }, remain));
}

export default async function pageChat(view) {
  cleanup();
  window.addEventListener('hashchange', cleanup, { once: true });

  /* 读取上次的提问草稿（「重复提问」开启时生效） */
  kvGet('askDraft').then((d) => { if (d && typeof d === 'object') askDraft = d; }).catch(() => {});

  const topbar = document.getElementById('topbar');
  topbar.classList.remove('hidden');
  view.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';

  /* ---------------- 顶栏 ---------------- */
  let avSrc = await roleAvatarSrc();
  let defaultMyAvSrc = state.skin.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '';
  let myAvSrc = state.role.chatAvatarMeId ? await mediaURL(state.role.chatAvatarMeId) : defaultMyAvSrc;
  const avatar = el('div', { class: 'avatar' }, [
    avSrc ? el('img', { src: avSrc }) : document.createTextNode((state.role.name || 'TA').slice(0, 1))
  ]);
  let tapTimer = null;
  avatar.addEventListener('click', () => {
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; patMe(); return; }
    tapTimer = setTimeout(() => { tapTimer = null; openProfile(); }, 260);
  });

  topbar.innerHTML = '';
  topbar.appendChild(el('button', { class: 'tb-btn', title: '返回首页', onclick: () => go('/') }, [iconImg('IC-CHT-006')]));
  topbar.appendChild(avatar);
  /* 实时状态由 TA 随机选择，并每隔几分钟重新掷一次 */
  const stNow = pickRoleStatus();
  state.role.status = stNow.label;
  const statusDot = el('span', { class: 'on-dot ' + stNow.key });
  const statusTxt = el('span', { text: stNow.label });
  topbar.appendChild(el('div', { class: 'tb-title' }, [
    el('div', { class: 't', text: state.role.name || 'TA' }),
    el('div', { class: 's' }, [statusDot, statusTxt])
  ]));

  let statusTimer = 0;
  const rollStatus = () => {
    const next = pickRoleStatus();
    state.role.status = next.label;
    statusDot.className = 'on-dot ' + next.key;
    statusTxt.textContent = next.label;
    statusTimer = setTimeout(rollStatus, 120000 + Math.random() * 120000);
  };
  statusTimer = setTimeout(rollStatus, 120000 + Math.random() * 120000);
  cleanups.push(() => clearTimeout(statusTimer));
  topbar.appendChild(el('button', { class: 'tb-btn', title: '角色设置', onclick: () => go('/role') }, [iconImg('IC-MIO-014')]));
  topbar.appendChild(el('button', { class: 'tb-btn', title: '更多', onclick: () => moreMenu() }, [iconImg('IC-CHT-007')]));

  /* ---------------- 消息区 ---------------- */
  const scroll = el('div', { class: 'chat-scroll', id: 'chat-scroll' });
  const inputBar = buildInputBar();
  view.appendChild(scroll);
  view.appendChild(inputBar.bar);

  const typingLabel = el('span', { class: 'typing-l' });
  const typing = el('div', { class: 'typing hidden' }, [typingLabel, el('i'), el('i'), el('i')]);

  let messages = (await all('messages')).sort((a, b) => a.ts - b.ts);
  const byId = new Map(messages.map((m) => [m.id, m]));

  /* 时间分隔：首条 / 跨天 / 间隔超过 5 分钟时插入（参考图 2） */
  function needsDivider(prev, m) {
    if (!prev) return true;
    if (new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString()) return true;
    return m.ts - prev.ts > 5 * 60 * 1000;
  }
  function dividerNode(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return el('div', { class: 'divider', text: `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` });
  }

  function rerenderAll() {
    scroll.innerHTML = '';
    let prev = null;
    messages.forEach((m) => {
      if (needsDivider(prev, m)) scroll.appendChild(dividerNode(m.ts));
      scroll.appendChild(msgNode(m));
      prev = m;
    });
    scroll.appendChild(typing);
    scrollToBottom();
  }

  function scrollToBottom() { scroll.scrollTop = scroll.scrollHeight; }

  /* ---------------- 单条消息节点 ---------------- */
  function avNode(mine) {
    const av = el('div', { class: 'av' });
    const src = mine ? myAvSrc : avSrc;
    if (src) av.appendChild(el('img', { src }));
    else av.appendChild(document.createTextNode(mine ? (state.role.chatNicknameMe || '我').slice(0, 1) : (state.role.name || 'TA').slice(0, 1)));
    return av;
  }

  function msgNode(m) {
    if (m.role === 'sys') return el('div', { class: 'sys', dataset: { id: m.id } }, [m.text]);
    const mine = m.role === 'me';
    const body = el('div', { class: 'body' });

    /* 撤回仍以气泡呈现（参考图 3） */
    if (m.state === 'recalled') {
      body.appendChild(el('div', { class: 'bub ' + (mine ? 'me' : 'ta') }, [
        el('div', { class: 'content', style: { opacity: '.68' }, text: mine ? '你撤回了一条消息' : '对方撤回了一条消息' })
      ]));
      return el('div', { class: 'msg ' + (mine ? 'me' : 'ta'), dataset: { id: m.id } }, [avNode(mine), body]);
    }

    if (!mine) body.appendChild(el('div', { class: 'nm', text: state.role.name || 'TA' }));
    else if (state.role.chatNicknameMe) body.appendChild(el('div', { class: 'nm me', text: state.role.chatNicknameMe }));

    const content = el('div', { class: 'content' });

    if (m.quoteId) {
      const q = byId.get(m.quoteId);
      content.appendChild(el('div', { class: 'quote' }, [q ? (q.text || (q.type === 'image' ? '[图片]' : '[语音]')) : '原消息已删除']));
    }

    if (m.type === 'image') {
      const img = el('img', { alt: '图片' });
      mediaURL(m.mediaId).then((u) => { if (u) img.src = u; });
      img.onclick = () => viewImage(m.mediaId);
      content.appendChild(img);
    } else if (m.type === 'sticker') {
      const img = el('img', { alt: '表情', style: { width: '110px', borderRadius: '8px' } });
      mediaURL(m.mediaId).then((u) => { if (u) img.src = u; });
      img.onclick = () => viewImage(m.mediaId);
      content.style.background = 'transparent';
      content.style.padding = '0';
      content.appendChild(img);
    } else if (m.type === 'voice') {
      content.appendChild(audioEl(m.mediaId));
    } else if (m.type === 'gift') {
      /* 商城礼物：一份小小的礼物卡片 */
      const bg = m.bg || ['#fde8d8', '#f4c197'];
      content.classList.add('gift-msg');
      content.appendChild(el('div', { class: 'gift-emoji', style: { background: `linear-gradient(145deg,${bg[0]},${bg[1]})` }, text: m.emoji || '🎁' }));
      content.appendChild(el('div', { class: 'gift-main' }, [
        el('div', { class: 'gift-name', text: m.giftName || '一份小礼物' }),
        el('div', { class: 'gift-sub', text: '来自商城 · ¥' + money(m.price) })
      ]));
    } else if (m.type === 'transfer') {
      content.classList.add('pay', 'pay-transfer');
      content.appendChild(el('span', { class: 'pay-ic' }, [iconImg('IC-CHT-015')]));
      content.appendChild(el('div', { class: 'pay-body' }, [
        el('div', { class: 'pay-amt', text: '¥' + money(m.amount) }),
        el('div', { class: 'pay-note', text: m.note || '转账' }),
        el('div', { class: 'pay-st', text: m.pay === 'done' ? '已收款' : '待对方收款' })
      ]));
    } else if (m.type === 'packet') {
      content.classList.add('pay', 'pay-packet');
      content.appendChild(el('span', { class: 'pay-ic' }, [iconImg('IC-CHT-016')]));
      content.appendChild(el('div', { class: 'pay-body' }, [
        el('div', { class: 'pay-note', text: m.note || '恭喜发财，大吉大利' }),
        el('div', { class: 'pay-amt', text: '¥' + money(m.amount) }),
        el('div', { class: 'pay-st', text: m.pay === 'done' ? '已领取' : '未领取' })
      ]));
    } else if (m.type === 'xhs') {
      content.classList.add('xhs-msg');
      const cv = m.xhsCover || { g: '粉', a: '#f3dfe4', b: '#cf9aa8' };
      content.appendChild(el('div', {
        class: 'xhs-msg-card',
        onclick: () => go('/xhs?post=' + m.xhsId)
      }, [
        el('div', {
          class: 'xhs-msg-cover',
          style: { background: `linear-gradient(145deg,${cv.a},${cv.b})` },
          text: cv.g
        }),
        el('div', { class: 'xhs-msg-main' }, [
          el('div', { class: 'xhs-msg-tag', text: '小粉书' }),
          el('div', { class: 'xhs-msg-title', text: m.xhsTitle || '一条笔记' })
        ])
      ]));
      if (m.text) content.appendChild(el('div', { class: 'xhs-msg-text', text: m.text }));
    } else if (m.type === 'pinyin') {
      /* 拼音打字：像一张小字卡，上面一行是 TA 敲出来的拼音，下面是对应的字 */
      content.classList.add('py-card');
      content.appendChild(el('div', { class: 'py-line', text: m.pinyin || '' }));
      content.appendChild(el('div', { class: 'py-text', text: m.text || '' }));
    } else if (m.type === 'graffiti') {
      content.classList.add('chat-graffiti');
      const img = el('img', { alt: '涂鸦' });
      img.style.maxWidth = '220px';
      img.style.borderRadius = '10px';
      img.style.background = '#fff';
      img.style.display = 'block';
      mediaURL(m.mediaId).then((u) => { if (u) img.src = u; });
      img.onclick = () => viewImage(m.mediaId);
      content.style.background = 'transparent';
      content.style.padding = '0';
      content.appendChild(img);
    } else if (m.type === 'choice') {
      content.appendChild(el('div', { text: m.text }));
      const opts = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' } });
      (m.choice?.options || []).forEach((o) => {
        const chosen = m.choice?.selected === o;
        opts.appendChild(el('button', {
          class: 'btn sm' + (chosen ? ' primary' : ''),
          style: { padding: '4px 10px' },
          onclick: async (e) => {
            e.stopPropagation();
            if (m.choice?.selected) return;
            m.choice.selected = o;
            await put('messages', m);
            rerenderAll();
            await sched.addMessage({ role: 'sys', type: 'sys', text: `你选择了「${o}」` });
            /* TA 征求同意的昵称 / 头像：同意（选项含"好"）就生效 */
            if (/好|同意/.test(o)) {
              if (m.choice?.newChatNickname) {
                await applyTaRename(m.choice.newChatNickname);
                rerenderAll();
                refreshMyAvatars();
              }
              if (m.choice?.newChatAvatarMediaId) {
                await applyTaAvatar(m.choice.newChatAvatarMediaId);
                rerenderAll();
                refreshMyAvatars();
              }
            }
          }
        }, [o]));
      });
      /* 如果是 TA 想给我换头像，在文字下面先预览一下图 */
      if (m.mediaId) {
        const p = el('div', { style: { marginTop: '8px' } });
        const img = el('img', { style: { maxWidth: '110px', borderRadius: '10px', display: 'block', background: '#f0f0ee' } });
        mediaURL(m.mediaId).then((u) => { if (u) img.src = u; });
        p.appendChild(img);
        content.appendChild(p);
      }
      content.appendChild(opts);
    } else if (m.type === 'ask') {
      content.appendChild(el('div', { class: 'ask-head' }, [
        el('span', { class: 'ask-tag', text: '问问TA' }),
        askStatusEl(m)
      ]));
      content.appendChild(el('div', { class: 'ask-q', text: m.text || '' }));
      if (m.options && m.options.length) {
        const opts = el('div', { class: 'ask-opts' });
        m.options.forEach((o, i) => {
          const chosen = (m.askAnswer || []).includes(o);
          opts.appendChild(el('div', { class: 'ask-opt' + (chosen ? ' picked' : '') }, [
            el('span', { class: 'ask-letter', text: String.fromCharCode(65 + i) }),
            el('span', { class: 'ask-circle' + (chosen ? ' on' : '') }),
            el('span', { class: 'ask-opt-t', text: o })
          ]));
        });
        content.appendChild(opts);
      }
      if (m.askType === 'text' && m.askAnswered) {
        const n = (m.askCardsText || []).length;
        content.appendChild(el('div', { class: 'ask-sub-line', text: `${state.role.name || 'TA'} 用 ${n} 张字卡回复了你` }));
        if (n) {
          const chips = el('div', { class: 'ask-chips' });
          m.askCardsText.forEach((t) => chips.appendChild(el('span', { class: 'ask-chip', text: t })));
          content.appendChild(chips);
        }
      }
    } else if (m.type === 'taAsk') {
      const maxPick = Math.max(1, Number(m.taqMaxPick) || 1);
      const picked = new Set(m.taqAnswer || []);
      const answered = !!m.taqAnswered;

      content.appendChild(el('div', { class: 'ask-head' }, [
        el('span', { class: 'ask-tag', text: 'TA的询问' }),
        el('span', { class: 'ask-status', text: answered ? '已回答' : '待回答' })
      ]));
      content.appendChild(el('div', { class: 'ask-q', text: m.text || '' }));

      /* 选项：随时想改就点——单选点了直接换，多选满了自动挤掉最早选的那个 */
      const opts = el('div', { class: 'ask-opts' });
      const optNodes = [];
      const countEl = el('div', { class: 'taq-count', text: `已选 ${picked.size}/${maxPick}` });
      const repaint = () => {
        optNodes.forEach(({ o, node }) => node.classList.toggle('picked', picked.has(o)));
        countEl.textContent = `已选 ${picked.size}/${maxPick}`;
      };
      const persistPick = async () => {
        await sched.updateMessage(m.id, {
          taqAnswered: true,
          taqAnswer: [...picked],
          taqAnswerTs: Date.now(),
          taqDueTs: Date.now() + taqCommentDelay(),
          taqComment: ''
        });
      };
      (m.options || []).forEach((o, i) => {
        const node = el('div', { class: 'ask-opt' + (picked.has(o) ? ' picked' : ''), onclick: async () => {
          if (picked.has(o)) {
            picked.delete(o);
          } else if (maxPick === 1) {
            picked.clear(); picked.add(o);
          } else if (picked.size >= maxPick) {
            picked.delete(picked.values().next().value);   // 挤掉最早选的
            picked.add(o);
          } else {
            picked.add(o);
          }
          repaint();
          await persistPick();
        } }, [
          el('span', { class: 'ask-letter', text: String.fromCharCode(65 + i) }),
          el('span', { class: 'ask-circle' + (picked.has(o) ? ' on' : '') }),
          el('span', { class: 'ask-opt-t', text: o })
        ]);
        optNodes.push({ o, node });
        opts.appendChild(node);
      });
      content.appendChild(opts);
      content.appendChild(countEl);

      let textInput = null;
      if (m.taqAllowText) {
        textInput = el('input', { class: 'input taq-input', maxlength: '120', placeholder: '文字回答（可选，算一个选项）', value: m.taqText || '' });
        content.appendChild(textInput);
      }

      content.appendChild(el('button', { class: 'btn primary sm taq-btn', onclick: async () => {
        if (!picked.size) { toast('至少勾一个选项'); return; }
        const text = textInput ? textInput.value.trim() : '';
        if (text && picked.size + 1 > maxPick) { toast(`文字也算一个选项，最多选 ${maxPick} 个`); return; }
        await sched.updateMessage(m.id, {
          taqAnswered: true,
          taqAnswer: [...picked],
          taqText: text,
          taqAnswerTs: Date.now(),
          taqDueTs: Date.now() + taqCommentDelay(),
          taqComment: ''
        });
      } }, [answered ? '更新回答' : '回答']));

      if (m.taqText) content.appendChild(el('div', { class: 'ask-sub-line', text: `我：${m.taqText}` }));
      if (m.taqComment) content.appendChild(el('div', { class: 'ask-sub-line taq-comment', text: `TA：${m.taqComment}` }));
      scheduleTaqComment(m);
    } else if (m.type === 'dice') {
      const cube = buildDiceCube();
      if (Date.now() - m.ts < DICE_ROLL_MS + DICE_LAND_MS + 500) playDiceRoll(cube, m);
      else landDice(cube, m.value, true);
      content.appendChild(el('div', { class: 'cdice-wrap' }, [cube]));
    } else {
      content.appendChild(el('span', { text: m.text || '' }));
    }

    const meta = el('div', { class: 'meta' }, [
      el('span', { text: fmtDay(m.ts) }),
      el('span', { class: 'more', title: '消息操作', onclick: (e) => { e.stopPropagation(); msgMenu(m); } }, [iconImg('IC-CHT-007')]),
      mine && stateLabel(m) ? el('span', { text: stateLabel(m) }) : null
    ]);

    body.appendChild(el('div', { class: 'bub ' + (mine ? 'me' : 'ta') }, [content, meta]));

    const node = el('div', { class: 'msg ' + (mine ? 'me' : 'ta'), dataset: { id: m.id } }, [avNode(mine), body]);
    attachLongPress(node, () => msgMenu(m));
    return node;
  }

  function stateLabel(m) {
    if (m.role !== 'me') return '';
    if (m.type === 'ask') return '';
    if (m.state === 'read') return '已读';
    return m.type === 'text' ? '已发送' : '';
  }

  /* 问问TA 气泡右上角状态：等待倒计时 / 已回答 */
  function askStatusEl(m) {
    const s = el('span', { class: 'ask-status' });
    if (m.askAnswered) {
      s.textContent = '已回答';
    } else if (m.askIgnored) {
      s.textContent = '没有回答';
    } else if (m.askDueTs) {
      s.dataset.due = String(m.askDueTs);
      s.textContent = `等待 ${Math.max(1, Math.ceil((m.askDueTs - Date.now()) / 1000))} 回答…`;
    } else {
      s.textContent = '等待回答…';
    }
    return s;
  }

  /* typing 指示器是消息区的收尾节点，新消息一律插在它前面；
     若它已不在消息区（例如渲染中途出错被摘掉），退化为直接追加，避免 insertBefore 抛错。 */
  function insertBeforeTyping(node) {
    if (typing.parentNode === scroll) scroll.insertBefore(node, typing);
    else scroll.appendChild(node);
  }

  function appendMessage(m) {
    if (byId.has(m.id)) return;
    const prev = messages.length ? messages[messages.length - 1] : null;
    byId.set(m.id, m);
    messages.push(m);
    if (needsDivider(prev, m)) insertBeforeTyping(dividerNode(m.ts));
    insertBeforeTyping(msgNode(m));
    scrollToBottom();
  }

  function updateNode(m) {
    byId.set(m.id, m);
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx >= 0) messages[idx] = m; else messages.push(m);
    const old = scroll.querySelector(`[data-id="${m.id}"]`);
    const fresh = msgNode(m);
    if (old) old.replaceWith(fresh); else insertBeforeTyping(fresh);
  }

  /* ---------------- 事件订阅 ---------------- */
  const onMsg = (e) => appendMessage(e.detail);
  const onUpd = (e) => updateNode(e.detail);
  const onTyping = (e) => {
    const d = e.detail;
    const on = typeof d === 'object' && d !== null ? !!d.on : !!d;
    const label = typeof d === 'object' && d !== null ? (d.label || '') : '';
    typing.classList.toggle('hidden', !on);
    typing.classList.toggle('labeled', !!label);
    typingLabel.textContent = label;
  };
  sched.on('message', onMsg);
  sched.on('message-updated', onUpd);
  sched.on('typing', onTyping);
  const onCallReq = () => triggerIncoming();
  sched.on('call-request', onCallReq);
  const onAskAnswered = async () => {
    // 重新拉取 messages（更新后的 ask 消息已落库），rerender 聊天气泡
    const fresh = await all('messages');
    messages.splice(0, messages.length, ...fresh);
    rerenderAll();
  };
  sched.on('ask-answered', onAskAnswered);
  cleanups.push(() => {
    sched.off('message', onMsg);
    sched.off('message-updated', onUpd);
    sched.off('typing', onTyping);
    sched.off('call-request', onCallReq);
    sched.off('ask-answered', onAskAnswered);
  });

  /* 问问TA 倒计时：每秒刷新「等待 N 回答…」 */
  const askTick = setInterval(() => {
    view.querySelectorAll('.ask-status[data-due]').forEach((s) => {
      const left = Math.max(0, Math.ceil((Number(s.dataset.due) - Date.now()) / 1000));
      if (left > 0) s.textContent = `等待 ${left} 回答…`;
    });
  }, 1000);
  cleanups.push(() => clearInterval(askTick));

  /* ---------------- 标记已读 ---------------- */
  const unreadList = messages.filter((m) => m.role === 'ta' && !m.read);
  if (unreadList.length) {
    unreadList.forEach((m) => { m.read = true; });
    await bulkPut('messages', unreadList);
    setUnread(0);
  }

  rerenderAll();

  /* ---------------- 输入栏 ----------------
     最右侧按钮：没有输入时是「＋」，点开功能面板；有输入时变成「发送」。 */
  function buildInputBar() {
    const text = el('input', { class: 'txt', type: 'text', placeholder: '说点什么…' });
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });

    const tail = el('button', { class: 'ci', title: '更多功能' }, [iconImg('IC-CHT-005')]);
    const sync = () => {
      const has = !!text.value.trim();
      tail.className = has ? 'send-pill' : 'ci';
      tail.title = has ? '发送' : '更多功能';
      tail.innerHTML = '';
      tail.appendChild(has ? document.createTextNode('发送') : iconImg('IC-CHT-005'));
      tail.onclick = has ? sendText : openPlusPanel;
    };
    text.addEventListener('input', sync);
    sync();

    const bar = el('div', { class: 'chat-input' }, [
      el('div', { class: 'chat-tools' }, [
        el('button', { class: 'ci', title: '发送语音', onclick: sendVoice }, [iconImg('IC-CHT-003')]),
        text,
        el('button', { class: 'ci', title: '表情', onclick: openStickerPicker }, [iconImg('IC-CHT-001')]),
        tail
      ])
    ]);
    return { bar, text, sync };
  }

  async function sendText() {
    const t = inputBar.text.value.trim();
    if (!t) return;
    inputBar.text.value = '';
    inputBar.sync();
    const m = await sched.addMessage({ role: 'me', type: 'text', text: t });
    await sched.replyTo(m);
  }

  async function sendImage() {
    const file = await openFile({ accept: 'image/*' });
    if (!file) return;
    // 手机相册里的大图 / HEIC 在 canvas 解码可能失败，失败就原图发送
    let out;
    try { out = await compressImage(file, 1080); } catch { out = { blob: file, w: 0, h: 0 }; }
    const id = await saveMedia(out.blob, { type: 'image', w: out.w, h: out.h, source: 'me' });
    const m = await sched.addMessage({ role: 'me', type: 'image', mediaId: id });
    await sched.replyTo(m);
  }

  async function sendSticker(mediaId) {
    const m = await sched.addMessage({ role: 'me', type: 'sticker', mediaId });
    await sched.replyTo(m);
  }

  async function openStickerPicker() {
    const loadMedias = async () => (await all('media')).filter((m) => m.source === 'library' && m.type === 'image');
    let medias = await loadMedias();
    let batch = false;
    const sel = new Set();

    const node = el('div');
    const ctlRef = { close: () => {} };

    function render() {
      node.innerHTML = '';

      /* ---- 顶部工具条 ---- */
      const bar = el('div', { class: 'lib-bar' });
      bar.appendChild(el('div', { class: 'lib-count', text: batch ? `已选 ${sel.size} / ${medias.length}` : `共 ${medias.length} 个表情` }));
      const acts = el('div', { class: 'row', style: { gap: '6px' } });
      if (batch) {
        const allOn = medias.length > 0 && sel.size === medias.length;
        acts.appendChild(el('button', { class: 'btn sm', onclick: () => {
          if (allOn) sel.clear(); else medias.forEach((m) => sel.add(m.id));
          render();
        } }, [allOn ? '取消全选' : '全选']));
        acts.appendChild(el('button', {
          class: 'btn sm', style: { color: 'var(--danger)' },
          onclick: async () => {
            if (!sel.size) return toast('还没有选择表情');
            const ok = await confirmBox({ title: '删除表情', text: `确定删除选中的 ${sel.size} 个表情吗？`, okText: '删除', danger: true });
            if (!ok) return;
            const ids = [...sel];
            for (const id of ids) await delMedia(id);
            medias = medias.filter((m) => !sel.has(m.id));
            const n = ids.length;
            sel.clear();
            toast(`已删除 ${n} 个表情`);
            render();
          }
        }, [`删除${sel.size ? ' ' + sel.size : ''}`]));
        acts.appendChild(el('button', { class: 'btn sm', onclick: () => { batch = false; sel.clear(); render(); } }, ['退出批量管理']));
      } else if (medias.length) {
        acts.appendChild(el('button', { class: 'btn sm', onclick: () => { batch = true; sel.clear(); render(); } }, ['批量管理']));
      }
      bar.appendChild(acts);
      node.appendChild(bar);

      /* ---- 表情网格 ---- */
      if (!medias.length) {
        node.appendChild(el('div', { class: 'empty', style: { padding: '22px' } }, [
          el('div', { class: 'e-h', text: '表情库还是空的' }),
          el('div', { class: 'e-p', text: '把常用表情加进来，发送时可以一键调用' })
        ]));
      } else {
        const grid = el('div', { class: 'picker' });
        if (batch) grid.classList.add('picker-batch');
        medias.forEach((md) => {
          const img = el('img', { alt: '表情' });
          mediaURL(md.id).then((u) => { if (u) img.src = u; });
          if (batch) {
            const on = sel.has(md.id);
            const cell = el('div', { class: 'pick-cell' + (on ? ' on' : ''), onclick: () => {
              if (sel.has(md.id)) sel.delete(md.id); else sel.add(md.id);
              render();
            } }, [img, el('span', { class: 'pick-check' + (on ? ' on' : '') })]);
            grid.appendChild(cell);
          } else {
            img.onclick = () => { ctlRef.close(); sendSticker(md.id); };
            grid.appendChild(img);
          }
        });
        node.appendChild(grid);
      }

      /* ---- 底部按钮（非批量模式才显示）---- */
      if (!batch) {
        node.appendChild(el('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: async () => {
          await addMyStickers();
          medias = await loadMedias();
          render();
        } }, ['添加表情到我的表情库']));
        node.appendChild(el('button', { class: 'btn block', style: { marginTop: '8px' }, onclick: () => {
          ctlRef.close();
          openBulkImport('sticker', { onDone: () => toast('已导入，下次打开表情面板就能看到') });
        } }, ['链接批量导入表情包']));
      }
    }

    render();
    const ctl = sheet({ title: '我的表情库', node });
    ctlRef.close = ctl.close;
  }

  async function addMyStickers() {
    const files = await openFile({ accept: 'image/*', multiple: true });
    if (!files || !files.length) return;
    for (const f of files) {
      let out;
      try { out = await compressImage(f, 512, 0.9); } catch { out = { blob: f, w: 0, h: 0 }; }
      await saveMedia(out.blob, { type: 'image', w: out.w, h: out.h, source: 'library', name: f.name });
    }
    toast(`已添加 ${files.length} 个表情`);
  }

  /* ---------------- 骰子 ---------------- */
  async function rollDice() {
    const m = await sched.addMessage({ role: 'me', type: 'dice', value: rndInt(1, 6) });
    await sched.replyTo(m);
  }

  /* ---------------- 「＋」功能面板 ---------------- */
  function openPlusPanel() {
    const items = [
      { label: '问问TA', icon: 'IC-MIO-004', onSelect: openAskSheet },
      { label: '昵称 / 头像库', icon: 'IC-MIO-020', onSelect: () => go('/avatarLib') },
      { label: '涂鸦',   icon: 'IC-MOM-005', onSelect: openGraffitiSheet },
      { label: '相册',   icon: 'IC-MIO-015', onSelect: sendImage },
      { label: '表情包', icon: 'IC-CHT-008', onSelect: openStickerPicker },
      { label: '转账',   icon: 'IC-CHT-015', onSelect: sendTransfer },
      { label: '红包',   icon: 'IC-CHT-016', onSelect: sendPacket },
      { label: '骰子',   icon: 'IC-DIV-004', onSelect: rollDice },
      { label: '通话',   icon: 'IC-CHT-012', onSelect: openCallMenu },
      { label: '一起听', icon: 'IC-MIO-031', onSelect: () => go('/music') },
      { label: '语音',   icon: 'IC-CHT-003', onSelect: sendVoice },
      { label: '拍一拍', icon: 'IC-CHT-011', onSelect: patTa }
    ];
    const grid = el('div', { class: 'plus-grid' });
    items.forEach((it) => grid.appendChild(el('button', {
      class: 'plus-item',
      onclick: () => { ctl.close(); it.onSelect(); }
    }, [
      el('span', { class: 'plus-ic' }, [iconImg(it.icon)]),
      el('span', { class: 'plus-t', text: it.label })
    ])));
    const ctl = sheet({ title: '更多功能', node: grid });
    void ctl;
  }

  /* ---------------- 刷新当前聊天内显示的我的头像 ---------------- */
  async function refreshMyAvatars() {
    defaultMyAvSrc = state.skin.avatarMeId ? await mediaURL(state.skin.avatarMeId) : '';
    myAvSrc = state.role.chatAvatarMeId ? await mediaURL(state.role.chatAvatarMeId) : defaultMyAvSrc;
  }

  /* ---------------- 涂鸦 ---------------- */
  async function openGraffitiSheet() {
    const c = createFreeCanvas({ width: GRAFITTI_W, height: GRAFITTI_H, color: '#1f2937', size: 3 });

    const colors = ['#1f2937', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#ffffff'];
    const sizes = [2, 4, 7, 12];
    let curColor = colors[0], curSize = sizes[1];

    const sizeChips = el('div', { class: 'row', style: { gap: '6px' } });
    sizes.forEach((s) => {
      const b = el('button', {
        class: 'btn sm' + (s === curSize ? ' primary' : ''),
        style: { padding: '4px 10px' },
        onclick: () => {
          curSize = s; c.setSize(s);
          sizeChips.querySelectorAll('button').forEach((x) => x.classList.remove('primary'));
          b.classList.add('primary');
        }
      }, [`粗 ${s}`]);
      sizeChips.appendChild(b);
    });

    const colorRow = el('div', { class: 'row', style: { gap: '6px', marginTop: '8px' } });
    colors.forEach((col) => {
      const b = el('button', {
        class: 'btn sm',
        style: { padding: '0', width: '26px', height: '26px', borderRadius: '50%', background: col, border: col === '#ffffff' ? '1px solid var(--line)' : 'none' },
        onclick: () => {
          curColor = col; c.setColor(col);
          colorRow.querySelectorAll('button').forEach((x) => { x.style.outline = 'none'; x.style.outlineOffset = '0'; });
          b.style.outline = '2px solid var(--accent)'; b.style.outlineOffset = '2px';
        }
      });
      colorRow.appendChild(b);
    });
    colorRow.querySelector('button')?.style?.setProperty('outline', '2px solid var(--accent)');

    const btns = el('div', { class: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
    btns.appendChild(el('button', { class: 'btn sm', onclick: () => c.penOn() }, ['画笔']));
    btns.appendChild(el('button', { class: 'btn sm', onclick: () => c.eraserOn() }, ['橡皮']));
    btns.appendChild(el('button', { class: 'btn sm', onclick: () => c.undo() }, ['撤销']));
    btns.appendChild(el('button', { class: 'btn sm', onclick: () => c.clear() }, ['清空']));

    const canvasWrap = el('div', {
      style: { width: 'min(360px, 92vw)', margin: '12px auto 0', aspectRatio: '1 / 1', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--line)', background: '#fff' }
    });
    canvasWrap.appendChild(c.canvas);

    const sendBtn = el('button', {
      class: 'btn primary block', style: { marginTop: '14px' },
      onclick: async () => {
        const blob = await c.toBlob('image/png', 0.92);
        const id = await saveMedia(blob, { type: 'image', w: GRAFITTI_W, h: GRAFITTI_H, source: 'me', name: '涂鸦' });
        ctl.close(); c.destroy();
        const m = await sched.addMessage({ role: 'me', type: 'graffiti', mediaId: id });
        await sched.replyTo(m);
      }
    }, ['发送涂鸦']);

    const ctl = sheet({
      title: '涂鸦',
      node: el('div', { style: { padding: '4px 4px 14px' } }, [
        sizeChips, colorRow, btns, canvasWrap, sendBtn
      ]),
      onClose: () => c.destroy()
    });
  }

  /* ---------------- 转账 / 红包 ---------------- */
  /** 金额 + 留言的输入弹层，确认返回 { amount, note }，取消返回 null */
  function askMoney({ title, noteDefault }) {
    return new Promise((resolve) => {
      let done = false;
      const amt = el('input', { class: 'txt', type: 'number', inputmode: 'decimal', placeholder: '0.00', min: '0', step: '0.01' });
      const note = el('input', { class: 'txt', type: 'text', placeholder: '留言', value: noteDefault || '' });
      const node = el('div', {}, [
        el('div', { class: 'money-form' }, [
          el('div', { class: 'mf-row' }, [el('div', { class: 'mf-lb', text: '金额（元）' }), amt]),
          el('div', { class: 'mf-row' }, [el('div', { class: 'mf-lb', text: '留言' }), note])
        ]),
        el('div', { class: 'money-btns' }, [
          el('button', { class: 'btn block', onclick: () => { done = true; ctl.close(); resolve(null); } }, ['取消']),
          el('button', { class: 'btn block primary', onclick: () => {
            const v = Number(amt.value);
            if (!v || v <= 0) { toast('请输入有效金额'); return; }
            done = true;
            ctl.close();
            resolve({ amount: Math.round(v * 100) / 100, note: (note.value || '').trim() || noteDefault || '' });
          } }, ['确认'])
        ])
      ]);
      const ctl = sheet({ title, center: true, node, onClose: () => { if (!done) resolve(null); } });
      void ctl;
    });
  }

  /* ---------------- 问问 TA ---------------- */
  function openAskSheet() {
    const draft = Object.assign({
      askType: 'single',
      text: '',
      options: '',
      maxPick: 2,
      repeat: true,
      delayMode: 'random',
      delayValue: 5,
      delayUnit: 'sec'
    }, askDraft || {});

    const node = el('div', { class: 'ask-form' });

    /* ---- 题型分段 ---- */
    const typeTabs = [
      { key: 'single', label: '单选题' },
      { key: 'multi', label: '多选题' },
      { key: 'text', label: '文字题' }
    ];
    let type = draft.askType;
    const segTypes = el('div', { class: 'ask-seg' });
    const typeBtns = typeTabs.map((t) => {
      const b = el('button', { class: 'ask-seg-btn' + (t.key === type ? ' on' : ''), onclick: () => {
        type = t.key;
        typeBtns.forEach((x) => x.classList.toggle('on', x.dataset.k === t.key));
        syncType();
      } }, [t.label]);
      b.dataset.k = t.key;
      segTypes.appendChild(b);
      return b;
    });
    node.appendChild(segTypes);

    /* ---- 提示语 ---- */
    const hint = el('div', { class: 'ask-hint' });
    node.appendChild(hint);

    /* ---- 重复提问 ---- */
    let repeat = !!draft.repeat;
    const repeatCk = el('div', { class: 'ask-ck' + (repeat ? ' on' : ''), onclick: () => {
      repeat = !repeat;
      repeatCk.classList.toggle('on', repeat);
    } }, [el('i')]);
    node.appendChild(el('div', { class: 'ask-ck-row' }, [
      el('div', { class: 'ask-ck-main' }, [
        el('div', { class: 'ask-lb', text: '重复提问' }),
        el('div', { class: 'ask-sub', text: '留着这道题和选项，下次打开还在' })
      ]),
      repeatCk
    ]));

    /* ---- 你想问什么 ---- */
    const qInput = el('input', { class: 'input', placeholder: '', maxlength: '80', value: draft.text || '' });
    node.appendChild(el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', text: '你想问什么' }),
      qInput,
      el('div', { class: 'ask-sub', text: 'TA 的回答就贴在题目下面' })
    ]));

    /* ---- 答案（单选/多选）---- */
    const optsInput = el('textarea', {
      class: 'input', style: { minHeight: '130px', resize: 'vertical' },
      placeholder: '一行一个答案\n例如：\n在\n不在\n嗯嗯嗯', maxlength: '600'
    });
    optsInput.value = draft.options || '';
    const answerField = el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', style: { display: 'inline-flex', gap: '8px' } }, [
        el('span', { text: '答案' }),
        el('span', { class: 'ask-sub inline', text: 'TA 会从里面选一个回答' })
      ]),
      optsInput
    ]);
    node.appendChild(answerField);

    /* ---- 多选题：最多选几个 ---- */
    let maxPick = Number(draft.maxPick) || 2;
    const maxInput = el('input', { class: 'input', type: 'number', min: '2', max: '8', value: String(maxPick), style: { width: '88px', textAlign: 'center' } });
    maxInput.addEventListener('input', () => { maxPick = Number(maxInput.value) || 2; });
    const maxField = el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', style: { display: 'inline-flex', gap: '8px' } }, [
        el('span', { text: '最多选几个' }),
        el('span', { class: 'ask-sub inline', text: 'TA 至少勾 2 个' })
      ]),
      el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [maxInput, el('span', { class: 'ask-sub', text: '个' })])
    ]);
    node.appendChild(maxField);

    /* ---- 回答时间 ---- */
    let delayMode = draft.delayMode === 'custom' ? 'custom' : 'random';
    const segDelay = el('div', { class: 'ask-seg' });
    const delayBtns = [['random', '随机'], ['custom', '自定义']].map(([k, label]) => {
      const b = el('button', { class: 'ask-seg-btn' + (k === delayMode ? ' on' : ''), onclick: () => {
        delayMode = k;
        delayBtns.forEach((x) => x.classList.toggle('on', x.dataset.k === k));
        syncDelay();
      } }, [label]);
      b.dataset.k = k;
      segDelay.appendChild(b);
      return b;
    });
    let delayValue = Number(draft.delayValue) || 5;
    let delayUnit = draft.delayUnit === 'min' ? 'min' : 'sec';
    const delayNum = el('input', { class: 'input', type: 'number', min: '1', max: '9999', value: String(delayValue), style: { flex: '1', minWidth: '0' } });
    delayNum.addEventListener('input', () => { delayValue = Number(delayNum.value) || 1; });
    const unitBtns = [['sec', '秒'], ['min', '分钟']].map(([k, label]) => {
      const b = el('button', { class: 'ask-seg-btn' + (k === delayUnit ? ' on' : ''), onclick: () => {
        delayUnit = k;
        unitBtns.forEach((x) => x.classList.toggle('on', x.dataset.k === k));
      } }, [label]);
      b.dataset.k = k;
      return b;
    });
    const unitSeg = el('div', { class: 'ask-seg tight' }, unitBtns);
    const delayCustom = el('div', { class: 'row', style: { gap: '8px' } }, [delayNum, unitSeg]);
    node.appendChild(el('div', { class: 'ask-field' }, [
      el('div', { class: 'ask-lb', style: { display: 'inline-flex', gap: '8px' } }, [
        el('span', { text: '回答时间' }),
        el('span', { class: 'ask-sub inline', text: 'TA 要隔多久才回答你' })
      ]),
      segDelay,
      delayCustom
    ]));

    /* ---- 题型联动 ---- */
    function syncType() {
      const isText = type === 'text';
      hint.textContent = isText
        ? 'TA 会用字卡库「主字卡」里的字卡回答（1~8 张，多张之间空一格）'
        : type === 'multi'
          ? `TA 会从下面的答案里勾几个回答（2~${Math.max(2, maxPick)} 个）`
          : 'TA 会从下面的答案里选一个回答';
      answerField.style.display = isText ? 'none' : '';
      maxField.style.display = type === 'multi' ? '' : 'none';
      qInput.placeholder = isText ? '写下你想问 TA 的话…' : '写下你的问题…';
      optsInput.placeholder = '一行一个答案\n例如：\n在\n不在\n嗯嗯嗯';
      if (type === 'multi') {
        const sub = answerField.querySelector('.ask-sub.inline');
        if (sub) sub.textContent = 'TA 会从里面勾几个回答';
      } else {
        const sub = answerField.querySelector('.ask-sub.inline');
        if (sub) sub.textContent = 'TA 会从里面选一个回答';
      }
    }
    function syncDelay() {
      delayCustom.style.display = delayMode === 'custom' ? '' : 'none';
    }
    syncType();
    syncDelay();

    /* ---- 底部按钮 ---- */
    function submit() {
      const q = qInput.value.trim();
      if (!q) return toast('先写一下你想问什么');
      let options = null;
      if (type !== 'text') {
        options = (optsInput.value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (options.length < 2) return toast('至少写两个答案');
        if (options.length > 8) return toast('答案不要超过 8 个');
      }
      if (type === 'multi') {
        maxPick = Math.max(2, Math.min(options.length, Number(maxPick) || 2));
      }
      let askDelayMs = null;
      if (delayMode === 'custom') {
        const v = Math.max(1, Number(delayValue) || 1);
        askDelayMs = v * (delayUnit === 'min' ? 60000 : 1000);
      }
      // 记住草稿
      askDraft = {
        askType: type,
        text: repeat ? q : '',
        options: repeat ? (optsInput.value || '') : '',
        maxPick,
        repeat,
        delayMode,
        delayValue,
        delayUnit
      };
      kvSet('askDraft', askDraft).catch(() => {});

      const payload = {
        askType: type,
        text: q,
        options,
        askMaxPick: type === 'multi' ? maxPick : 1,
        askDelayMs
      };
      sendAsk(payload);
      ctl.close();
    }

    const foot = el('div', { class: 'ask-foot' }, [
      el('button', { class: 'btn ask-cancel', onclick: () => ctl.close() }, ['取消']),
      el('button', { class: 'btn ask-send', onclick: submit }, ['发送提问'])
    ]);

    const ctl = sheet({ title: '问问TA', node, foot: foot });
  }

  async function sendAsk({ askType, text, options, askMaxPick, askDelayMs }) {
    const m = await sched.addMessage({
      role: 'me', type: 'ask', askType, text, options,
      askMaxPick: askMaxPick || 1, askDelayMs: askDelayMs || null,
      askAnswered: false
    });
    await sched.replyTo(m);
  }

  async function sendTransfer() {
    const name = state.role.name || 'TA';
    const r = await askMoney({ title: '转账给 ' + name, noteDefault: '给你花' });
    if (!r) return;
    const m = await sched.addMessage({ role: 'me', type: 'transfer', amount: r.amount, note: r.note, pay: 'pending' });
    // TA 按概率收下
    setTimeout(async () => {
      if (!chance(78)) return;
      const cur = (await all('messages')).find((x) => x.id === m.id);
      if (!cur || cur.pay === 'done') return;
      await sched.updateMessage(m.id, { pay: 'done' });
    }, rndInt(2500, 6000));
    await sched.replyTo(m);
  }

  async function sendPacket() {
    const name = state.role.name || 'TA';
    const r = await askMoney({ title: '发红包 · ' + name, noteDefault: '恭喜发财，大吉大利' });
    if (!r) return;
    const m = await sched.addMessage({ role: 'me', type: 'packet', amount: r.amount, note: r.note, pay: 'pending' });
    // TA 按概率领取
    setTimeout(async () => {
      if (!chance(85)) return;
      const cur = (await all('messages')).find((x) => x.id === m.id);
      if (!cur || cur.pay === 'done') return;
      await sched.updateMessage(m.id, { pay: 'done' });
    }, rndInt(1500, 4000));
    await sched.replyTo(m);
  }

  /* ---------------- 更多菜单 ---------------- */
  /* ---------- 聊天装扮：就地改背景 / 头像 / 气泡，不用跳去装扮页 ---------- */
  async function openDressSheet() {
    const s = state.skin;

    /* 改完任何一项：刷 CSS 变量 + 重读头像 + 重绘消息区（即时生效） */
    const refresh = async () => {
      await applySkin();
      avSrc = await roleAvatarSrc();
      defaultMyAvSrc = s.avatarMeId ? await mediaURL(s.avatarMeId) : '';
      myAvSrc = state.role.chatAvatarMeId ? await mediaURL(state.role.chatAvatarMeId) : defaultMyAvSrc;
      avatar.innerHTML = '';
      if (avSrc) avatar.appendChild(el('img', { src: avSrc }));
      else avatar.appendChild(document.createTextNode((state.role.name || 'TA').slice(0, 1)));
      rerenderAll();
    };

    /* 头像：TA = role.avatarId，我 = skin.avatarMeId */
    const pickAvatar = async (who) => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob, w, h } = await compressImage(f, 480, 0.88);
      if (who === 'ta') {
        const old = state.role.avatarId;
        state.role.avatarId = await saveMedia(blob, { type: 'image', w, h, source: 'avatar', name: 'TA头像' });
        await saveRole();
        if (old && old !== state.role.avatarId) delMedia(old);
      } else {
        const old = s.avatarMeId;
        s.avatarMeId = await saveMedia(blob, { type: 'image', w, h, source: 'avatar', name: '我的头像' });
        await saveSkin();
        if (old && old !== s.avatarMeId) delMedia(old);
      }
      await refresh(); toast('头像已换');
    };
    const resetAvatar = async (who) => {
      if (who === 'ta') { state.role.avatarId = null; await saveRole(); }
      else { if (s.avatarMeId) delMedia(s.avatarMeId); s.avatarMeId = null; await saveSkin(); }
      await refresh(); toast('已还原默认头像');
    };

    /* 聊天背景（chatWallpaperId） */
    const pickWall = async () => {
      const f = await openFile({ accept: 'image/*' });
      if (!f) return;
      const { blob, w, h } = await compressImage(f, 1080, 0.86);
      const old = s.chatWallpaperId;
      s.chatWallpaperId = await saveMedia(blob, { type: 'image', w, h, source: 'wallpaper', name: '聊天背景' });
      await saveSkin();
      if (old && old !== s.chatWallpaperId) delMedia(old);
      await refresh(); toast('背景已换上');
    };
    const clearWall = async () => {
      if (!s.chatWallpaperId) { toast('当前就是默认背景'); return; }
      const old = s.chatWallpaperId;
      s.chatWallpaperId = null; await saveSkin(); delMedia(old);
      await refresh(); toast('已恢复默认背景');
    };

    /* 色板 chip 行（点一下即存即生效并重画高亮） */
    const chipRow = (colors, getVal, setVal) => {
      const row = el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } });
      const paintRow = () => {
        row.innerHTML = '';
        colors.forEach((c) => {
          row.appendChild(el('div', {
            class: 'chip' + (getVal() === c.v ? ' on' : ''),
            style: { background: c.bg || c.v, width: '32px', height: '24px', border: c.border ? '1px solid #d0d0cc' : 'none' },
            title: c.label,
            onclick: async () => { setVal(c.v); await saveSkin(); await refresh(); paintRow(); }
          }));
        });
      };
      paintRow();
      return row;
    };
    const section = (title, ...nodes) => el('div', { class: 'field', style: { marginBottom: '14px' } }, [
      el('label', { text: title }), ...nodes
    ]);

    const ME_COLORS = [
      { v: 'linear-gradient(135deg,#1c1e22,#3c4048)', label: '默认深灰' },
      { v: '#16181c', label: '纯黑', border: true },
      { v: '#1f6feb', label: '蓝' },
      { v: '#7c3aed', label: '紫' },
      { v: '#db2777', label: '玫红' },
      { v: '#059669', label: '绿' }
    ];
    const TA_COLORS = [
      { v: '#ffffff', label: '白', border: true },
      { v: '#fff7e6', label: '米黄', border: true },
      { v: '#e8f4ff', label: '浅蓝', border: true },
      { v: '#ffeef5', label: '浅粉', border: true },
      { v: '#f3ecff', label: '浅紫', border: true },
      { v: '#16181c', label: '纯黑' }
    ];
    const RADIUSES = [{ v: 8, label: '小' }, { v: 15, label: '中' }, { v: 24, label: '大' }, { v: 30, label: '圆润' }];
    const SHAPES = [{ v: 'circle', label: '圆形' }, { v: 'rounded', label: '圆角方' }];

    const wallUrl = s.chatWallpaperId ? await mediaURL(s.chatWallpaperId) : '';
    const taAvUrl = state.role.avatarId ? await mediaURL(state.role.avatarId) : '';
    const myAvUrl = s.avatarMeId ? await mediaURL(s.avatarMeId) : '';

    const avPreview = (url, fallback) => el('div', {
      style: {
        width: '44px', height: '44px', borderRadius: 'var(--avatar-radius)', flex: 'none',
        background: '#f0efea', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', fontSize: '17px', color: 'var(--txt-mute)'
      }
    }, [url ? el('img', { src: url, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : fallback]);
    const avLine = (label, url, fallback, pick, reset) => el('div', {
      class: 'row', style: { gap: '10px', alignItems: 'center', marginBottom: '8px' }
    }, [
      avPreview(url, fallback),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { class: 'small', text: label }),
        el('div', { class: 'small muted', text: url ? '已设置 · 点替换' : '默认文字头像' })
      ]),
      el('button', { class: 'btn sm', onclick: pick }, ['选图']),
      url ? el('button', { class: 'btn sm', onclick: reset }, ['还原']) : null
    ]);

    sheet({
      title: '聊天装扮',
      node: el('div', {}, [
        section('聊天背景',
          el('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, [
            el('div', {
              style: {
                width: '64px', height: '44px', borderRadius: '8px', flex: 'none', border: '1px solid var(--line)',
                background: wallUrl ? `url("${wallUrl}") center/cover` : 'var(--bg-soft)'
              }
            }),
            el('div', { style: { flex: '1', minWidth: '0' } }, [
              el('div', { class: 'small', text: wallUrl ? '自定义背景' : '默认背景' }),
              el('div', { class: 'small muted', text: '铺在消息区后面' })
            ]),
            el('button', { class: 'btn sm', onclick: pickWall }, ['选图']),
            wallUrl ? el('button', { class: 'btn sm', onclick: clearWall }, ['清除']) : null
          ])),

        section('头像',
          avLine('TA 的头像', taAvUrl, (state.role.name || 'TA').slice(0, 1), () => pickAvatar('ta'), () => resetAvatar('ta')),
          avLine('我的头像', myAvUrl, (state.role.chatNicknameMe || '我').slice(0, 1), () => pickAvatar('me'), () => resetAvatar('me')),
          el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [
            el('span', { class: 'small muted', style: { flex: 'none' }, text: '形状' }),
            chipRow(SHAPES, () => s.avatarShape, (v) => { s.avatarShape = v; })
          ])),

        section('气泡 · 我方',
          chipRow(ME_COLORS, () => s.bubbleMe, (v) => { s.bubbleMe = v; }),
          el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', marginTop: '8px' } }, [
            el('span', { class: 'small muted', style: { flex: 'none' }, text: '文字' }),
            chipRow([{ v: '#ffffff', label: '白', border: true }, { v: '#16181c', label: '黑' }],
              () => s.bubbleMeTxt, (v) => { s.bubbleMeTxt = v; })
          ])),

        section('气泡 · TA方',
          chipRow(TA_COLORS, () => s.bubbleTa, (v) => { s.bubbleTa = v; }),
          el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', marginTop: '8px' } }, [
            el('span', { class: 'small muted', style: { flex: 'none' }, text: '文字' }),
            chipRow([{ v: '#16181c', label: '黑' }, { v: '#ffffff', label: '白', border: true }],
              () => s.bubbleTaTxt, (v) => { s.bubbleTaTxt = v; })
          ])),

        section('气泡圆角',
          chipRow(RADIUSES, () => s.bubbleRadius, (v) => { s.bubbleRadius = v; })),

        el('div', { class: 'small muted', text: '背景位置缩放、气泡自定义 CSS 等更多项在「装扮与主题」里。' })
      ]),
      actions: [{
        label: '更多装扮项（完整装扮页）', icon: 'IC-MIO-013',
        onSelect: () => go('/skin')
      }]
    });
  }

  function moreMenu() {
    actionSheet('更多', [
      { label: '聊天装扮', icon: 'IC-MIO-013', onSelect: openDressSheet },
      { label: '让他截图发朋友圈', icon: 'IC-MOM-001', onSelect: taShotMoments },
      { label: '我的表情库', icon: 'IC-CHT-008', onSelect: openStickerPicker },
      { label: '让 TA 随机发一张字卡', icon: 'IC-CRD-002', onSelect: forceRandomCard },
      { label: '拍一拍', icon: 'IC-CHT-011', onSelect: patTa },
      { label: '通话记录', icon: 'IC-MIO-018', onSelect: () => callHistory() },
      { label: '发送语音', icon: 'IC-CHT-003', onSelect: sendVoice },
      { label: '他的相册', icon: 'IC-MIO-015', onSelect: () => go('/album?from=ta') },
      { label: '角色设置', icon: 'IC-MIO-014', onSelect: () => go('/role') },
      { label: '导出聊天记录', icon: 'IC-MIO-009', onSelect: exportChat },
      { label: '导入聊天记录', icon: 'IC-MIO-010', onSelect: importChat },
      { label: '删除全部聊天记录', icon: 'IC-CRD-007', danger: true, onSelect: clearChat }
    ]);
  }

  /** 让 TA 用自己的视角截图，发成一条朋友圈 */
  async function taShotMoments() {
    try {
      await taPostChatShot();
      toast('TA 把这段聊天发到了朋友圈');
    } catch (err) {
      toast(err && err.message ? err.message : '截图失败');
    }
  }

  async function forceRandomCard() {
    const cards = (await all('cards')).filter((c) => c.enabled && c.kind === 'text');
    if (!cards.length) { alertBox({ title: '字卡库是空的', text: '先去「字卡库」添加几张字卡，TA 才有话可说。' }); return; }
    const c = cards[Math.floor(Math.random() * cards.length)];
    await sched.addMessage({ role: 'ta', type: 'text', text: c.content });
    c.count = (c.count || 0) + 1;
    await put('cards', c);
  }

  async function patTa() {
    await sched.addMessage({ role: 'sys', type: 'sys', text: '你拍了拍 TA' });
  }
  async function patMe() {
    await sched.addMessage({ role: 'sys', type: 'sys', text: '你拍了拍 TA' });
  }

  /* ---------------- 语音 ----------------
     手机端直接录音（MediaRecorder），不支持录音的环境退回到「从文件选择音频」。 */
  async function sendVoice() {
    if (!canRecord()) {
      // 手机浏览器只在 https（或 localhost）下才允许调用麦克风
      const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
      toast(secure ? '这个浏览器不支持录音，改成从文件里选音频' : '录音需要 https 打开页面（当前是 http），先改成从文件里选音频');
      return sendVoiceFile();
    }
    openVoiceSheet();
  }

  function canRecord() {
    return typeof MediaRecorder !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function';
  }

  function pickRecMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
    for (const m of list) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {}
    }
    return '';
  }

  async function sendVoiceFile() {
    const file = await openFile({ accept: 'audio/*' });
    if (!file) return;
    const buf = await readBuf(file);
    const blob = new Blob([buf], { type: file.type || 'audio/mpeg' });
    const dur = await probeDuration(blob);
    await postVoice(blob, dur, file.name);
  }

  async function postVoice(blob, dur, name) {
    const id = await saveMedia(blob, { type: 'audio', duration: dur, source: 'me', name: name || '录音' });
    const m = await sched.addMessage({ role: 'me', type: 'voice', mediaId: id });
    await sched.replyTo(m);
  }

  function openVoiceSheet() {
    let stream = null, rec = null, chunks = [], t0 = 0, timer = null, blob = null, dur = 0, url = null;

    const timeEl = el('div', { class: 'rec-time', text: '00:00' });
    const pulse = el('div', { class: 'rec-pulse' }, [el('span'), el('span'), el('span')]);
    pulse.style.visibility = 'hidden';
    const hint = el('div', { class: 'rec-hint', text: '点「开始录音」，对着手机说话' });
    const audio = el('audio', { class: 'rec-audio' });
    audio.controls = true;
    audio.style.display = 'none';
    const mainBtn = el('button', { class: 'btn block', text: '开始录音' });
    const ops = el('div', { class: 'rec-ops' });
    ops.style.display = 'none';

    const node = el('div', { class: 'rec-box' }, [timeEl, pulse, hint, audio, mainBtn, ops]);
    let closed = false;
    const ctl = sheet({ title: '发送语音', node, onClose: () => {
      closed = true;
      if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); rec = null; }
      stopStream();
      if (url) URL.revokeObjectURL(url);
    } });

    const paint = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      timeEl.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      if (s >= 60) stop();
    };

    function stopStream() {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (timer) { clearInterval(timer); timer = null; }
    }

    mainBtn.onclick = async () => {
      if (rec) return stop();
      mainBtn.disabled = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickRecMime();
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = finish;
        rec.start();
        t0 = Date.now();
        timer = setInterval(paint, 200);
        paint();
        mainBtn.textContent = '停止录音';
        mainBtn.classList.add('danger');
        hint.textContent = '正在录音…';
        pulse.style.visibility = 'visible';
      } catch (err) {
        stopStream();
        hint.textContent = '没能打开麦克风，可以改用文件里的音频';
        mainBtn.textContent = '从文件选择';
        mainBtn.classList.remove('danger');
        mainBtn.onclick = () => { ctl.close(); sendVoiceFile(); };
        toast('无法使用麦克风：' + (err && err.message ? err.message : err));
      } finally {
        mainBtn.disabled = false;
      }
    };

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      dur = Math.max(1, Math.round((Date.now() - t0) / 100) / 10);
      if (rec && rec.state !== 'inactive') rec.stop();
      stopStream();
    }

    function finish() {
      if (closed) return;
      rec = null;
      pulse.style.visibility = 'hidden';
      const type = (chunks[0] && chunks[0].type) || 'audio/webm';
      blob = new Blob(chunks, { type });
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      audio.src = url;
      audio.style.display = '';
      timeEl.textContent = dur.toFixed(1) + ' 秒';
      hint.textContent = '试听一下，不满意可以重录';
      mainBtn.style.display = 'none';
      ops.style.display = 'flex';
      ops.innerHTML = '';
      ops.appendChild(el('button', { class: 'btn block', text: '重录', onclick: reset }));
      ops.appendChild(el('button', { class: 'btn block primary', text: '发送', onclick: async () => {
        if (!blob) return;
        const b = blob, d = dur;
        ctl.close();
        await postVoice(b, d, '录音');
      } }));
    }

    function reset() {
      if (url) { URL.revokeObjectURL(url); url = null; }
      blob = null; dur = 0; chunks = [];
      audio.removeAttribute('src');
      audio.style.display = 'none';
      timeEl.textContent = '00:00';
      hint.textContent = '点「开始录音」，对着手机说话';
      ops.style.display = 'none';
      mainBtn.style.display = '';
      mainBtn.textContent = '开始录音';
      mainBtn.classList.remove('danger');
    }
  }

  /* ---------------- 聊天记录导出 / 导入 ---------------- */
  async function exportChat() {
    const list = await all('messages');
    if (!list.length) { toast('还没有聊天记录'); return; }
    toast('正在打包…');
    try {
      // 只带上消息里实际用到的媒体（表情包 / 语音 / 图片）
      const used = new Set();
      list.forEach((m) => { if (m.mediaId) used.add(m.mediaId); });
      const mediaRows = (await all('media')).filter((r) => used.has(r.id));

      const files = [];
      for (const r of mediaRows) {
        if (!r.blob) continue;
        files.push({ name: `media/${r.id}`, data: new Uint8Array(await r.blob.arrayBuffer()) });
      }
      const mediaMeta = mediaRows.map((r) => { const { blob, ...meta } = r; void blob; return meta; });

      files.push({
        name: 'chat.json',
        data: new TextEncoder().encode(JSON.stringify({
          app: '字卡传信', kind: 'chat', version: 1, exportedAt: Date.now(),
          count: list.length, messages: list, media: mediaMeta
        }))
      });

      const name = `字卡传信-聊天记录-${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(makeZip(files), name);
      toast(`已导出 ${list.length} 条消息`);
    } catch (err) {
      alertBox({ title: '导出失败', text: String(err.message || err) });
    }
  }

  async function importChat() {
    const file = await openFile({ accept: '.zip,application/zip' });
    if (!file) return;
    toast('正在读取…');
    try {
      const files = readZip(await readBuf(file));
      const chatFile = files.find((f) => f.name === 'chat.json');
      if (!chatFile) throw new Error('备份里没有 chat.json，可能不是聊天记录备份');

      const parsed = JSON.parse(new TextDecoder().decode(chatFile.data));
      const incoming = parsed.messages || [];
      if (!incoming.length) throw new Error('备份里没有消息');

      const mediaFiles = new Map(files.filter((f) => f.name.startsWith('media/')).map((f) => [f.name.slice(6), f]));
      const mediaRows = (parsed.media || []).map((meta) => {
        const f = mediaFiles.get(meta.id);
        return f ? { ...meta, blob: new Blob([f.data], { type: meta.mime || 'application/octet-stream' }) } : { ...meta };
      }).filter((r) => r.blob || r.url);

      const yes = await confirmBox({
        title: '导入聊天记录',
        text: `将导入 ${incoming.length} 条消息${mediaRows.length ? `与 ${mediaRows.length} 个媒体文件` : ''}。现有聊天记录会保留，重复消息自动跳过。`,
        okText: '导入'
      });
      if (!yes) return;

      if (mediaRows.length) await bulkPut('media', mediaRows);

      const existIds = new Set((await all('messages')).map((m) => m.id));
      const add = incoming.filter((m) => m && m.id && !existIds.has(m.id));
      await bulkPut('messages', add);

      messages = (await all('messages')).sort((a, b) => a.ts - b.ts);
      byId.clear();
      messages.forEach((m) => byId.set(m.id, m));
      rerenderAll();
      toast(add.length ? `已导入 ${add.length} 条消息` : '没有新的消息（全部已存在）');
    } catch (err) {
      alertBox({ title: '导入失败', text: String(err.message || err) });
    }
  }

  async function clearChat() {
    const yes = await confirmBox({ title: '删除全部聊天记录', text: '将删除全部聊天消息（字卡、相册、朋友圈不受影响）。此操作不可撤销，建议先导出备份。', okText: '全部删除', danger: true });
    if (!yes) return;
    const list = await all('messages');
    await Promise.all(list.map((m) => sched.updateMessage(m.id, { deleted: true })));
    // 直接从库里移除
    const { del } = await import('../store.js');
    await Promise.all(list.map((m) => del('messages', m.id)));
    messages = []; byId.clear(); rerenderAll();
    toast('聊天记录已清空');
  }

  /* ---------------- 消息长按菜单 ---------------- */
  function msgMenu(m) {
    if (m.role === 'sys' || m.state === 'recalled') return;
    const items = [];
    if (m.type === 'text' || m.type === 'pinyin') items.push({ label: '复制', icon: 'IC-CRD-012', onSelect: () => { navigator.clipboard?.writeText(m.text || ''); toast('已复制'); } });
    items.push({ label: '引用', icon: 'IC-CHT-009', onSelect: () => { pendingQuote = m; inputBar.text.focus(); toast('已引用，输入你要说的话'); } });
    if (m.role === 'me') items.push({ label: '撤回', icon: 'IC-CHT-010', onSelect: () => sched.updateMessage(m.id, { state: 'recalled' }) });
    items.push({ label: '删除', icon: 'IC-CRD-007', danger: true, onSelect: async () => {
      const { del } = await import('../store.js');
      await del('messages', m.id);
      messages = messages.filter((x) => x.id !== m.id); byId.delete(m.id);
      rerenderAll();
    } });
    actionSheet((m.type === 'text' || m.type === 'pinyin') ? m.text.slice(0, 18) : '消息操作', items);
  }

  let pendingQuote = null;

  /* ---------------- 资料卡 ---------------- */
  async function openProfile() {
    const av2 = await roleAvatarSrc();
    const node = el('div', {}, [
      el('div', { class: 'row', style: { gap: '12px', marginBottom: '12px' } }, [
        el('div', { class: 'avatar lg' }, [ av2 ? el('img', { src: av2 }) : document.createTextNode((state.role.name || 'TA').slice(0, 1)) ]),
        el('div', {}, [
          el('div', { style: { fontSize: '17px', fontWeight: '600' }, text: state.role.name || 'TA' }),
          el('div', { class: 'small muted', text: state.role.signature || '（没有签名）' }),
          el('div', { class: 'small', style: { color: roleStatusMeta(state.role.status).color, marginTop: '4px' }, text: state.role.status || '在线' })
        ])
      ]),
      el('div', { class: 'small muted', text: '相识 ' + Math.max(1, Math.floor((Date.now() - (state.role.metAt || Date.now())) / 86400000)) + ' 天' })
    ]);
    sheet({
      title: '资料卡',
      node,
      actions: [
        { label: '让 TA 随机发一张字卡', icon: 'IC-CRD-002', onSelect: forceRandomCard },
        { label: '拍一拍', icon: 'IC-CHT-011', onSelect: patTa },
        { label: '编辑角色', icon: 'IC-MIO-014', onSelect: () => go('/role') }
      ]
    });
  }

  /* ---------------- 图片全屏 ---------------- */
  async function viewImage(mediaId) {
    const url = await mediaURL(mediaId);
    if (!url) return;
    const mask = el('div', { style: {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.92)', zIndex: '80',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px'
    } }, [ el('img', { src: url, style: { maxWidth: '100%', maxHeight: '100%', borderRadius: '10px' } }) ]);
    mask.onclick = () => mask.remove();
    document.getElementById('layer-root').appendChild(mask);
  }

  /* ---------------- 长按 ---------------- */
  function attachLongPress(node, fn) {
    let timer = null, moved = false;
    node.addEventListener('touchstart', (e) => {
      moved = false;
      timer = setTimeout(() => { fn(); }, 480);
    }, { passive: true });
    node.addEventListener('touchmove', () => { moved = true; clearTimeout(timer); }, { passive: true });
    node.addEventListener('touchend', () => clearTimeout(timer));
    node.addEventListener('contextmenu', (e) => { e.preventDefault(); fn(); });
  }
}

function cleanup() {
  cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
  cleanups = [];
}
