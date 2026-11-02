/* 字卡传信 · 极简 hash 路由
   主页面（3 个：home/chat/me）共享 swipe 容器，
   懒加载进 slot 后不再重建；子页面走 fullPage（清空 view 独立渲染）。
   朋友圈 / 占卜作为子页面进入（首页图标 / 「我的」页入口）。 */

const routes = new Map();
let notFound = null;
let currentPath = '/';
let prevPath = null;   // 上一条路由，用于「返回到某页且不留栈」

/** 主页面 key 集合（和 shell.js 保持一致） */
const MAIN_PATHS = new Set(['/', '/chat', '/me']);

export function register(map) {
  for (const [path, fn] of Object.entries(map)) routes.set(path, fn);
}
export function setNotFound(fn) { notFound = fn; }

export function go(path) {
  const target = '#' + path;
  if (location.hash === target) return resolve();
  location.hash = target;
}

export function back() {
  if (history.length > 1) history.back();
  else go('/');
}

/** 回到某个来路页面：来路正是它就 history.back()（不留栈），否则正常 push */
export function goBackTo(path) {
  if (prevPath === path && history.length > 1) { history.back(); return; }
  go(path);
}

export function path() { return currentPath; }

export function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q] = raw.split('?');
  const params = {};
  if (q) q.split('&').forEach((kv) => { const [k, v] = kv.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return { path: p || '/', params };
}

/* 渲染串行化：页面模块是异步的（先 await 数据再 appendChild），
   若两次 resolve 并发，各自清空 view 后都会把内容追加进去，就会出现上下重复的两份页面。 */
let running = false;
let pending = false;
let lastRenderKey = '';   // 去重：相同 path+params 不再重复 render

function renderKey(path, params) {
  const qs = Object.entries(params || {}).sort().map(([k,v]) => `${k}=${v}`).join('&');
  return path + (qs ? '?' + qs : '');
}

async function resolve() {
  if (running) { pending = true; return; }
  running = true;
  try {
    do {
      pending = false;
      await renderRoute();
    } while (pending);
  } finally {
    running = false;
  }
}

/** 主页面 slot 每次进入都重新 render（清 slot + 跑 fn），保持数据新鲜。
 *  swipe-track 常驻 view，不重建；只有子页面才清空 view 并隐藏 swipe。 */
async function renderRoute() {
  const { path: p, params } = parse();
  if (p !== currentPath) prevPath = currentPath;
  currentPath = p;
  const view = document.getElementById('view');

  // ==== 保险：去重 + 彻底清空 view ====
  const key = renderKey(p, params);
  if (key === lastRenderKey && !pending) {
    // 完全相同的连续两次 resolve，且没有 pending 变更，跳过
    return;
  }
  // 无论主/子页面，先把 view 彻底清干净（包括残留的旧 swipe-track）
  // 主页面 ensureSwipe 会重建 track，子页面独立渲染
  view.innerHTML = '';
  view.style.cssText = '';
  view.classList.remove('full');
  view.scrollTop = 0;

  if (MAIN_PATHS.has(p)) {
    // ===== 主页面：重建 swipe 容器，清对应 slot 重 render =====
    const { activateSwipe, getSlot } = await import('./shell.js');
    activateSwipe(view, p);

    await new Promise((r) => requestAnimationFrame(r));

    const slotKey = p === '/' ? 'home' : p.slice(1);
    const slot = getSlot(slotKey);
    if (!slot) return;

    slot.innerHTML = '';
    slot.style.cssText = '';
    const fn = routes.get(p);
    if (!fn) return;
    try {
      await fn(slot, params);
      // fn 会生成带 data-icon 的新 .ico 元素 → loadIcons 给它们补 --ico SVG URL
      try { (await import('./icons.js')).loadIcons(); } catch {}
      lastRenderKey = key;   // 标记成功 render
    } catch (err) {
      console.error(err);
      slot.innerHTML = `<div class="empty"><div class="e-h">页面加载出错</div><div class="e-p">${String(err.message || err)}</div></div>`;
    }

  } else {
    // ===== 子页面：清 view（已做），独立 render =====
    const { hideTabbar } = await import('./shell.js');
    hideTabbar();
    view.classList.add('full');

    const fn = routes.get(p) || notFound;
    if (!fn) { view.innerHTML = '<div class="empty"><div class="e-h">页面不存在</div></div>'; return; }
    try {
      await fn(view, params);
      try { (await import('./icons.js')).loadIcons(); } catch {}
      lastRenderKey = key;
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="empty"><div class="e-h">页面加载出错</div><div class="e-p">${String(err.message || err)}</div></div>`;
    }
  }
}

export function start() {
  // 只注册一次 hashchange，不管当前有没有 hash 都统一走 resolve()。
  // location.replace('#/') 本身会触发 hashchange → resolve()，
  // 不再手动调 resolve()，避免双触发导致主页面 swipe-track 内 slot 内容叠加两份。
  window.addEventListener('hashchange', resolve);
  if (!location.hash) {
    location.replace('#/');
  } else {
    // 用 macrotask 让出注册/状态初始化阶段，保证首次 renderRoute 时所有模块已 ready
    queueMicrotask(resolve);
  }
}
