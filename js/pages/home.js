/* 首页 · 主屏门户（小组件化）
   固定：品牌区 + 编辑开关；其余区块皆为可移动/删除/添加/自定义样式的小组件 */

import { el, fmtDay, daysSince, uid, compressImage, openFile } from '../util.js';
import { iconImg } from '../icons.js';
import { hideTopbar, setUnread, makePager } from '../shell.js';
import { go } from '../router.js';
import { state, roleAvatarSrc, saveRole, saveSkin, saveWidgets } from '../state.js';
import { mediaURL, saveMedia } from '../media.js';
import { all } from '../store.js';
import { createWidgetHost } from '../widget.js';
import { toast } from '../ui.js';
import * as mail from '../letters.js';

const MOODS = [
  { icon: 'IC-MOD-001', name: '开心' },
  { icon: 'IC-MOD-002', name: '平静' },
  { icon: 'IC-MOD-003', name: '难过' },
  { icon: 'IC-MOD-004', name: '生气' },
  { icon: 'IC-MOD-005', name: '喜欢' },
  { icon: 'IC-MOD-006', name: '在意' }
];
const todayMood = () => {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return MOODS[seed % MOODS.length];
};

/* 应用入口：每个都是一个可单独移动的「软件图标」小组件 */
const APPS = [
  { path: '/chat',    label: '消息',     icon: 'IC-NAV-002', badge: 'unread' },
  { path: '/moments', label: '朋友圈',   icon: 'IC-MOM-001' },
  { path: '/divine',  label: '占卜',     icon: 'IC-DIV-001' },
  { path: '/music',   label: '音乐',     icon: 'IC-MIO-016' },
  { path: '/quiz',    label: '问卷',     icon: 'IC-MIO-027' },
  { path: '/memo',    label: '备忘录',   icon: 'IC-MIO-026' },
  { path: '/period',  label: '经期',     icon: 'IC-MIO-033' },
  { path: '/ledger',  label: '记账',     icon: 'IC-MIO-034' },
  { path: '/pomodoro', label: '番茄钟',  icon: 'IC-MIO-035' },
  { path: '/watch',   label: '观影',     icon: 'IC-MIO-036' },
  { path: '/books',   label: '书架',     icon: 'IC-MIO-037' },
  { path: '/favorites', label: '收藏',   icon: 'IC-MIO-020' },
  { path: '/favorites?owner=ta', label: '他的收藏', icon: 'IC-MOD-005' },
  { path: '/album',   label: '相册',     icon: 'IC-MIO-015' },
  { path: '/xhs',     label: '小粉书',   icon: 'IC-MOM-005' },
  { path: '/shop',    label: '商城',     icon: 'IC-MIO-039' },
  { path: '/pdd',     label: '拼夕夕',   icon: 'IC-MIO-041' },
  { path: '/tong',    label: '通牌',     icon: 'IC-MIO-042' },
  { path: '/echo',    label: '回声',     icon: 'IC-MIO-043' },
  { path: '/games',   label: '游戏厅',   icon: 'IC-MIO-040' },
  { path: '/anniversary', label: '纪念日', icon: 'IC-MIO-017' },
  { path: '/cards',   label: '字卡库',   icon: 'IC-CRD-001' },
  { path: '/skin',    label: '主题美化', icon: 'IC-MIO-013', tone: 'accent' },
  { path: '/role',    label: '角色',     icon: 'IC-MIO-014' },
  { path: '/data',    label: '数据',     icon: 'IC-MIO-009' },
  { path: '/about',   label: '关于',     icon: 'IC-MIO-007' }
];

export default async function pageHome(view) {
  hideTopbar();

  const [messages, cards] = await Promise.all([all('messages'), all('cards')]);
  const unread = messages.filter((m) => m.role === 'ta' && !m.read).length;
  setUnread(unread);

  const inbox = (await mail.allLetters()).filter((l) => l.dir === 'in');
  const unreadMail = inbox.filter((l) => !l.read).length;
  const lastInbox = inbox[0] || null;

  const last = messages.length ? messages.reduce((a, b) => (a.ts > b.ts ? a : b)) : null;
  const mood = todayMood();
  const metDays = daysSince(state.role.metAt);
  const enabledCards = cards.filter((c) => c.enabled).length;

  /* 头像（点击可直接更换） */
  async function getAv() { return await roleAvatarSrc(); }
  async function getMy() { return state.skin.avatarMeId ? await mediaURL(state.skin.avatarMeId) : ''; }

  async function pickAvatar(which) {
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob, w, h } = await compressImage(f, 512, 0.9);
    const id = await saveMedia(blob, { type: 'image', w, h, source: 'avatar' });
    if (which === 'ta') { state.role.avatarId = id; await saveRole(); }
    else { state.skin.avatarMeId = id; await saveSkin(); }
    toast('头像已更换');
    rerender();
  }

  /* ---------------- 小组件渲染器 ---------------- */
  function renderPair() {
    const av = el('div', { class: 'pair-av', onclick: (e) => { e.stopPropagation(); pickAvatar('ta'); } });
    const my = el('div', { class: 'pair-av', onclick: (e) => { e.stopPropagation(); pickAvatar('me'); } });
    const fillAv = async () => {
      const [a, m] = await Promise.all([getAv(), getMy()]);
      av.innerHTML = '';
      av.appendChild(a ? el('img', { src: a }) : document.createTextNode((state.role.name || 'TA').slice(0, 1)));
      my.innerHTML = '';
      my.appendChild(m ? el('img', { src: m }) : document.createTextNode('我'));
    };
    fillAv();
    return el('div', { class: 'pair-card', onclick: () => go('/chat') }, [
      el('div', { class: 'pair-side' }, [av, el('span', { class: 'pair-tag', text: state.role.name || 'TA' })]),
      el('div', { class: 'pair-link' }, [iconImg('IC-MOD-005')]),
      el('div', { class: 'pair-side' }, [my, el('span', { class: 'pair-tag', text: '我' })])
    ]);
  }

  function renderMood() {
    return el('div', { class: 'hm-pill' }, [
      el('span', { class: 'hm-pill-ic' }, [iconImg('IC-MOD-005')]),
      el('div', { class: 'hm-pill-tx', text: state.role.signature || '和 TA 一起 · 今天也要甜' }),
      el('button', { class: 'hm-pill-btn', onclick: (e) => { e.stopPropagation(); go('/chat'); } }, [iconImg('IC-CHT-004'), el('span', { text: '聊一句' })])
    ]);
  }

  /* 单张数据卡（拆成四个独立小组件，每个可单独移动/删除） */
  function renderStat(w) {
    switch (w.config?.kind) {
      case 'met':
        return statCard('相识', '01', String(metDays), '天', '点击可修改日期', () => go('/role'));
      case 'mood':
        return statCard('今日心情', '02', mood.name, '', 'TA 那边', null, mood.icon);
      case 'last':
        return statCard('最后一条', '03', last ? (last.text || '[图片]').slice(0, 8) : '还没有消息', '', last ? fmtDay(last.ts) : '去聊一句', () => go('/chat'));
      case 'cards':
        return statCard('字卡', '04', String(enabledCards), '张', '已启用 / 共 ' + cards.length, () => go('/cards'));
      default:
        return el('div', { class: 'card', text: '未知数据卡' });
    }
  }

  /* 单个应用图标小组件（手机主屏式的独立图标，可单独移动） */
  function renderApp(w) {
    const c = w.config || {};
    const badge = c.badge === 'unread' ? unread : 0;
    return el('div', {
      class: 'app' + (c.tone === 'accent' ? ' accent' : ''),
      onclick: (e) => { e.stopPropagation(); go(c.path); }
    }, [
      el('span', { class: 'app-ic' }, [iconImg(c.icon)]),
      el('span', { class: 'app-t', text: c.label || '' }),
      badge > 0 ? el('span', { class: 'dot', text: badge > 99 ? '99+' : String(badge) }) : null
    ]);
  }

  function renderTip() {
    return el('div', { class: 'card' }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'small muted', text: '数据只在本地，定期导出备份最稳妥' }),
        el('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); go('/data'); } }, ['去备份'])
      ])
    ]);
  }

  /* 信箱小部件：显示未读来信数 + 最近一封来信摘要，点击进入信箱 */
  function renderMailbox() {
    return el('div', { class: 'mail-card', onclick: (e) => { e.stopPropagation(); go('/mailbox'); } }, [
      el('div', { class: 'mail-card-ic' }, [iconImg('IC-CHT-004')]),
      el('div', { class: 'mail-card-main' }, [
        el('div', { class: 'mail-card-t', text: '信箱' }),
        el('div', { class: 'mail-card-s', text: lastInbox ? (lastInbox.text || '[图片]').slice(0, 24) : '还没有来信' })
      ]),
      unreadMail > 0
        ? el('span', { class: 'mail-card-dot', text: unreadMail > 99 ? '99+' : String(unreadMail) })
        : el('span', { class: 'mail-card-chev' }, [iconImg('IC-MIO-004')])
    ]);
  }

  const RENDERERS = { pair: renderPair, mood: renderMood, stat: renderStat, app: renderApp, tip: renderTip, mailbox: renderMailbox };

  /* ---------------- 小组件：自适应横向分页（每页一屏，放不下顺延到下一页） ---------------- */
  let homeRoot = null;
  let pages = [];          // [{ arr, wm }]
  let curWm = null;

  const appWidget = (a) => ({
    id: 'app_' + uid(), type: 'app', order: 0, span: 1,
    config: { path: a.path, label: a.label, icon: a.icon, badge: a.badge, tone: a.tone }
  });
  const statWidget = (kind) => ({ id: 'stat_' + uid(), type: 'stat', order: 0, span: 2, config: { kind } });

  const renderWidget = (w) => (RENDERERS[w.type] ? RENDERERS[w.type](w) : el('div', { class: 'card', text: '未知组件：' + w.type }));

  const CATALOG = [
    { type: 'pair',   label: '配对卡',   icon: 'IC-MIO-014', create: () => ({ id: 'pair_' + uid(),   type: 'pair',   order: 0, span: 4, config: {} }) },
    { type: 'mood',   label: '心情胶囊', icon: 'IC-MOD-005', create: () => ({ id: 'mood_' + uid(),   type: 'mood',   order: 0, span: 4, config: {} }) },
    { type: 'mailbox', label: '信箱',    icon: 'IC-CHT-004', create: () => ({ id: 'mail_' + uid(),   type: 'mailbox',order: 0, span: 4, config: {} }) },
    { type: 'stat',   label: '相识天数', icon: 'IC-MIO-005', create: () => statWidget('met') },
    { type: 'stat',   label: '今日心情', icon: 'IC-MOD-005', create: () => statWidget('mood') },
    { type: 'stat',   label: '最后一条', icon: 'IC-CHT-001', create: () => statWidget('last') },
    { type: 'stat',   label: '字卡统计', icon: 'IC-CRD-001', create: () => statWidget('cards') },
    { type: 'tip',    label: '备份提示', icon: 'IC-MIO-009', create: () => ({ id: 'tip_' + uid(), type: 'tip', order: 0, span: 4, config: {} }) },
    ...APPS.map((a) => ({ type: 'app', label: a.label, icon: a.icon, create: () => appWidget(a) }))
  ];

  /* 排序：卡片类在前、应用类（含备份提示）在后 —— 应用部件自然排到后面的滑动页 */
  const isAppGroup = (w) => w.type === 'app' || w.type === 'tip';
  const buildOrder = () => {
    const list = state.widgets.home.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list.filter((w) => !isAppGroup(w)).concat(list.filter(isAppGroup));
  };

  /* ---------------- 固定头部：品牌区 + 编辑/添加按钮 ---------------- */
  const editBtn = el('button', { class: 'hm-edit', title: '编辑主页' }, [iconImg('IC-CRD-006')]);
  const addBtn = el('button', { class: 'hm-edit hm-add hidden', title: '添加组件' }, [iconImg('IC-CHT-005')]);
  const batchBtn = el('button', { class: 'hm-edit hm-batch hidden', title: '批量样式' }, [iconImg('IC-MIO-013')]);
  editBtn.onclick = () => curWm?.setEditing(!curWm.isEditing());
  addBtn.onclick = () => curWm?.addWidget();
  batchBtn.onclick = () => curWm?.batchConfig();

  const head = el('div', { class: 'hm-head' }, [
    el('div', { class: 'hm-top' }, [
      el('div', { class: 'hm-brand' }, [
        el('div', { class: 'hm-kicker', text: '纯本地 · 不联网 · 可整包备份' }),
        el('div', { class: 'hm-title', text: '字卡传信.' })
      ]),
      el('div', { class: 'hm-edit-row' }, [batchBtn, addBtn, editBtn])
    ])
  ]);

  function paintEdit(on) {
    editBtn.innerHTML = '';
    editBtn.appendChild(iconImg(on ? 'IC-MIO-003' : 'IC-CRD-006'));
    editBtn.title = on ? '完成' : '编辑主页';
    addBtn.classList.toggle('hidden', !on);
    batchBtn.classList.toggle('hidden', !on);
  }

  /* 某页组件被增删/拖动后：合并回源数组并持久化，避免改动丢失 */
  function mergeAndSave() {
    const merged = [];
    pages.forEach((pg) => pg.arr.forEach((w, k) => { w.order = k + 1; merged.push(w); }));
    state.widgets.home = merged;
    saveWidgets();
  }

  function build() {
    if (homeRoot) homeRoot.remove();
    pages = [];
    curWm = null;

    homeRoot = el('div', { class: 'page home pager-home' }, [head]);
    const area = el('div', {});
    homeRoot.appendChild(area);
    view.appendChild(homeRoot);

    /* ---- 测量：按顺序把组件往一页里塞，塞不下就开新页 ---- */
    const list = buildOrder();
    const headH = head.getBoundingClientRect().height || 88;
    const slotH = homeRoot.clientHeight || view.clientHeight || 700;
    const avail = Math.max(180, slotH - headH - 30);

    const measure = el('div', { style: 'position:absolute;left:-9999px;top:0;visibility:hidden;width:' + Math.max(200, (homeRoot.clientWidth || 390) - 28) + 'px' });
    homeRoot.appendChild(measure);
    const mArr = [];
    const mHost = createWidgetHost(measure, { widgets: mArr, render: renderWidget, catalog: [], onChange() {} });
    const mH = () => (measure.querySelector('.widget-host')?.getBoundingClientRect().height || 0);

    const groups = [];
    let i = 0;
    while (i < list.length) {
      mArr.length = 0;
      let fit = 0;
      for (let k = i; k < list.length; k++) {
        mArr.push(list[k]);
        mHost.render();
        if (mH() > avail && fit > 0) { mArr.pop(); mHost.render(); break; }
        fit++;
      }
      if (fit === 0) fit = 1;
      groups.push(list.slice(i, i + fit));
      i += fit;
    }
    if (!groups.length) groups.push([]);
    measure.remove();

    /* ---- 真实分页 + 底部圆点（点数 = 页数，黑条 = 当前页） ---- */
    const dots = el('div', { class: 'pager-indicator' });
    const pageEls = groups.map((group, gi) => {
      const arr = group.slice();
      const body = el('div', { class: 'p-body' });
      const wm = createWidgetHost(body, {
        widgets: arr,
        render: renderWidget,
        catalog: CATALOG,
        onChange: () => mergeAndSave(),
        onEditing: (on) => paintEdit(on)
      });
      pages.push({ arr, wm });
      dots.appendChild(el('span', { class: 'dot' + (gi === 0 ? ' on' : '') }));
      return el('div', {}, [body]);
    });

    const pager = makePager(area, pageEls, {
      indicator: false,
      onIndexChange: (idx) => {
        dots.querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('on', k === idx));
        const wm = (pages[idx] && pages[idx].wm) || null;
        if (curWm && curWm !== wm && curWm.isEditing()) curWm.setEditing(false);
        curWm = wm;
        paintEdit(curWm ? curWm.isEditing() : false);
      }
    });
    if (groups.length > 1) area.appendChild(el('div', { class: 'p-foot' }, [dots]));
    dots.querySelectorAll('.dot').forEach((d, k) => { d.onclick = () => pager.goTo(k, true); });
  }

  function rerender() { build(); }

  build();
}

function statCard(label, num, value, unit, sub, onclick, icon) {
  return el('div', { class: 'stat2', onclick: onclick || undefined, style: onclick ? { cursor: 'pointer' } : {} }, [
    el('div', { class: 'stat2-h' }, [
      el('div', { class: 'stat2-l' }, [icon ? iconImg(icon, '', '') : null, el('span', { text: label })]),
      el('span', { class: 'stat2-n', text: num })
    ]),
    el('div', { class: 'stat2-v' }, [el('span', { text: value }), unit ? el('span', { class: 'u', text: unit }) : null]),
    el('div', { class: 'stat2-s', text: sub })
  ]);
}
