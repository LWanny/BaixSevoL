/* 字卡传信 · Service Worker
   目的：让站点可离线打开、可安装到桌面。
   策略：本站资源走 stale-while-revalidate（先用缓存、后台更新）；导航请求优先网络，失败回落缓存。
   说明：本 SW 只缓存静态外壳，不接触 IndexedDB 里的聊天、字卡与媒体数据。 */

const VERSION = 'zkcx-v96';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './assets/icons/icons.json',
  './assets/icons/misc/IC-MIO-006.svg'
];

/* 代码类资源走「网络优先」：每次都拉最新，失败才回落缓存。
   图片/图标等静态资源仍走 stale-while-revalidate，保证离线可用。 */
const isCode = (url) => /\.(js|mjs|css|html|json|webmanifest)$/i.test(url.pathname) || url.pathname === '/';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 只处理本站资源

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })   // 每次都向服务器确认，部署完立刻拿到新版外壳
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 代码类资源：绕过浏览器 HTTP 缓存（GitHub Pages max-age=600 会让旧 js 残留 10 分钟），网络优先，失败回落缓存
  if (isCode(url)) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 静态资源（图片/图标）：stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});

function cachePut(req, res) {
  if (!res || !res.ok) return;
  caches.open(VERSION).then((c) => c.put(req, res)).catch(() => {});
}
