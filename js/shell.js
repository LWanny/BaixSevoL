/* 字卡传信 · 外壳：顶栏 + 横向滑动主页面 + 底部小圆点指示器
   主页面（3 个：home / chat / me）放在同一个 swipe 容器里，
   支持手指横向左右滑动切换，也支持点小圆点跳转。子页面走 fullPage（隐藏 swipe）。
   朋友圈 / 占卜不从底部栏进入，入口在首页图标与「我的」页。 */

import { el } from './util.js';
import { go, back } from './router.js';

/** 主页面顺序（决定 swipe 里的 slot 序号）；hideBar=true 的页面不显示底部栏（专注模式） */
export const TABS = [
  { key: 'home', path: '/',     label: '首页', iconId: 'IC-NAV-001' },
  { key: 'chat', path: '/chat', label: '消息', iconId: 'IC-NAV-002', hideBar: true },
  { key: 'me',   path: '/me',   label: '我的', iconId: 'IC-NAV-005' }
];

/** 主页面路径 → slot index */
const PATH_TO_INDEX = Object.fromEntries(TABS.map((t, i) => [t.path, i]));

let unread = 0;
let _gesture = null;   // 当前手势状态
let _tabClickBound = false;   // 底部 tab 点击是否已绑定（模块级，不依赖 DOM 属性）

export function setUnread(n) {
  unread = Math.max(0, n | 0);
  // 红点还没做，指示器暂不显示角标
}

/* ============================================================
   顶栏
   ============================================================ */
export function setTopbar(opts = {}) {
  const bar = document.getElementById('topbar');
  bar.innerHTML = '';
  bar.classList.remove('hidden');

  if (opts.back) {
    bar.appendChild(el('button', { class: 'tb-btn', title: '返回', onclick: () => back() }, ['←']));
  } else if (opts.home) {
    bar.appendChild(el('div', { style: { width: '6px' } }));
  }

  bar.appendChild(el('div', { class: 'tb-title' + (opts.center ? ' center' : '') }, [
    el('div', { class: 't', text: opts.title || '' }),
    opts.sub ? el('div', { class: 's', text: opts.sub }) : null
  ]));

  (opts.actions || []).forEach((a) => {
    bar.appendChild(el('button', { class: 'tb-btn', title: a.label || '', onclick: a.onclick }, ['＋']));
  });
}

export function hideTopbar() { document.getElementById('topbar').classList.add('hidden'); }

/* ============================================================
   swipe 容器组装
   ============================================================ */
function ensureSwipe(view) {
  let track = view.querySelector('.swipe-track');
  if (track) return track;

  track = el('div', { class: 'swipe-track' });
  track.style.setProperty('--swipe-n', String(TABS.length));
  TABS.forEach((t, i) => {
    const page = el('div', { class: 'swipe-page', dataset: { tabKey: t.key, path: t.path } });
    track.appendChild(page);
  });
  view.appendChild(track);

  // 不做整屏左右滑动切 tab：只有首页自己的分页容器（.pager-track / 圆点）支持左右滑动
  return track;
}

function ensureTabPill() {
  const bar = document.getElementById('tabbar');
  let pill = bar.querySelector('.tab-pill');
  if (pill) {
    // 已存在（index.html 静态 HTML），绑定点击（只绑一次，用模块级标记避免重复）
    if (!_tabClickBound) {
      pill.querySelectorAll('.tab').forEach((btn) => {
        const key = btn.dataset.key;
        const tabDef = TABS.find((t) => t.key === key);
        if (tabDef) {
          btn.addEventListener('click', () => {
            if (location.hash !== '#' + tabDef.path) go(tabDef.path);
          });
        }
      });
      _tabClickBound = true;
    }
    return pill;
  }
  pill = el('div', { class: 'tab-pill' });
  TABS.forEach((t) => {
    pill.appendChild(el('button', { class: 'tab', dataset: { key: t.key },
      title: t.label, onclick: () => { if (location.hash !== '#' + t.path) go(t.path); } }, [
      el('span', { class: 'tab-ico', role: 'img', ariaLabel: t.label }, [
        el('span', { class: 'ico', dataset: { icon: t.iconId }, role: 'img', ariaLabel: t.label })
      ]),
      el('span', { text: t.label })
    ]));
  });
  bar.appendChild(pill);
  return pill;
}

function renderDots(activeKey) {
  // 不再画「一个主页面一个点」的底部圆点条；翻页圆点由各页面自己的分页容器提供
  document.querySelector('#tabbar .dot-bar')?.remove();
  const pill = ensureTabPill();
  pill.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('on', tab.dataset.key === activeKey);
  });
}

function scrollTo(track, index, withTransition = true) {
  const pct = -index * (100 / TABS.length);
  track.classList.toggle('no-transition', !withTransition);
  track.style.transform = `translateX(${pct}%)`;
  // 强制回流再移除 no-transition
  if (!withTransition) track.offsetWidth;
  track.classList.remove('no-transition');
}

/* ============================================================
   对外 API：setTabbar / hideTabbar
   仍保留旧名字以兼容各页面模块，但内部实现换成 dot indicator + swipe
   ============================================================ */
export function setTabbar(activeKey) {
  const bar = document.getElementById('tabbar');
  bar.classList.remove('hidden');
  renderDots(activeKey);
}

export function hideTabbar() {
  document.getElementById('tabbar').classList.add('hidden');
}

/** 激活 swipe 容器：ensure + 滚到 index + 点亮指示器
 *  主页面每次路由切换时调用 */
export function activateSwipe(view, path, opts = {}) {
  const idx = PATH_TO_INDEX[path];
  if (idx === undefined) return;

  if (opts.topbar !== false) {
    // 主页面通常带顶栏，由各页面模块自行调 setTopbar；
    // 这里只确保 tabbar 显示
  }

  const track = ensureSwipe(view);
  setTabbar(TABS[idx].key);
  // 专注模式的页面（如聊天）不显示底部栏，靠页面自己的返回键回到首页
  if (TABS[idx].hideBar) hideTabbar();

  // 滚动到位（带过渡，因为这是路由切换动画）
  scrollTo(track, idx, true);
}

export function hideSwipe() {
  const track = document.querySelector('.swipe-track');
  if (track) track.remove();
  hideTabbar();
}

/* ============================================================
   页面快捷函数
   ============================================================ */
/** 全屏子页面（mailbox / cards / fate / role / skin 等）：隐藏底部 tab + swipe */
export function fullPage(opts = {}) {
  hideTopbar();
  // 先 hideSwipe，再 setTopbar（后者会把顶栏加回来）
  const view = document.getElementById('view');
  view.innerHTML = '';     // 清空 swipe-track
  view.classList.add('full');
  setTopbar(opts);
  hideSwipe();
}

/** 主页面（home/chat/moments/divine/me）：保留底部 swipe 容器 + 小圆点指示器
 *  入口先由 router ensureSwipe + activateSwipe，然后页面模块再调 setTopbar；
 *  子页面（about/data/icons 等）调 normalPage 时会自动检测 swipe-track 存在与否，
 *  没有就隐藏 tabbar。 */
export function normalPage(activeTab, opts = {}) {
  const view = document.getElementById('view');
  view.classList.remove('full');
  setTopbar(opts);
  // 如果 view 里有 swipe-track 就是主页面（show tabbar），否则 hide
  const hasTrack = !!view.querySelector('.swipe-track');
  if (hasTrack) setTabbar(activeTab);
  else hideTabbar();
}

/** 允许外部直接拿到 swipe-track 某一个 slot，用来懒加载 */
export function getSlot(tabKey) {
  const track = document.querySelector('.swipe-track');
  if (!track) return null;
  return track.querySelector(`.swipe-page[data-tab-key="${tabKey}"]`);
}

/* ============================================================
   页面内部分页容器（通用）
   parent: 外层容器（会被 position:relative; overflow:hidden）
   pageEls: 每个分页的 DOM 元素
   opts.onIndexChange(idx): 翻页回调
   opts.initialIndex: 初始页（默认 0）
   返回 { goTo(idx, animated), track, indicator }
   ============================================================ */
export function makePager(parent, pageEls, opts = {}) {
  const n = pageEls.length;
  if (!n) return null;
  parent.classList.add('pager-host');

  // track：宽度保持一屏（100%），各页 flex-basis 100% 并排溢出，靠 translateX 翻页
  const track = el('div', { class: 'pager-track' });
  pageEls.forEach((p) => {
    p.classList.add('pager-page');
    track.appendChild(p);
  });
  parent.appendChild(track);

  let indicator = null;
  if (opts.indicator !== false) {
    indicator = el('div', { class: 'pager-indicator' });
    pageEls.forEach((_, i) => {
      const d = el('span', { class: 'dot' });
      d.onclick = () => goTo(i, true);
      indicator.appendChild(d);
    });
    parent.appendChild(indicator);
  }

  let idx = opts.initialIndex || 0;

  function paintIndicator() {
    if (!indicator) return;
    indicator.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === idx));
  }

  function goTo(i, animated = true) {
    idx = Math.max(0, Math.min(n - 1, i));
    track.classList.toggle('no-transition', !animated);
    track.style.transform = `translateX(${-idx * 100}%)`;
    // force reflow 让 no-transition 生效
    if (!animated) track.offsetWidth;
    paintIndicator();
    opts.onIndexChange?.(idx);
  }

  paintIndicator();
  goTo(idx, false);

  // 手势：只作用于本页自己的分页 track（首页圆点分页用）
  let startX = 0, startY = 0, dragging = false, lastDx = 0;
  const thresholdRatio = 0.22;

  function onStart(e) {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    dragging = false; lastDx = 0;
  }

  function onMoveCapture(e) {
    if (!dragging) {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) dragging = true;
    }
    if (dragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - startX;
      lastDx = dx;
      const w = parent.clientWidth || 390;
      // 边界阻尼
      let adj = dx;
      if ((idx === 0 && dx > 0) || (idx === n - 1 && dx < 0)) adj = dx * 0.4;
      track.classList.add('no-transition');
      track.style.transform = `translateX(calc(${-idx * 100}% + ${adj}px))`;
      void track.offsetWidth;
    }
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    const w = parent.clientWidth || 390;
    const threshold = w * thresholdRatio;
    let target = idx;
    if (lastDx < -threshold && idx < n - 1) target = idx + 1;
    else if (lastDx > threshold && idx > 0) target = idx - 1;
    goTo(target, true);
  }

  track.addEventListener('touchstart', onStart, { passive: true });
  track.addEventListener('touchmove', onMoveCapture, { passive: false, capture: true });
  track.addEventListener('touchend', onEnd);
  track.addEventListener('touchcancel', onEnd);

  return { goTo, track, indicator, getIndex: () => idx };
}
