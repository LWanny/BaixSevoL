/* 音乐 · 网易云接口
   浏览器直连网易云会受跨域限制，这里默认走两个带 CORS 的公共接口：
   - GDStudio Music API：搜索 / 歌单详情 / 播放地址
   - Meting API：歌单 / 播放地址兜底
   登录 Cookie 只保存在本地，请求时一并带上，尽量读到登录态可用的歌曲。 */

const GD = 'https://music-api.gdstudio.xyz/api.php';
const METING = 'https://api.injahow.cn/meting/';

/* 登录 Cookie 由页面在读取 IndexedDB 后注入，公共接口会带上它尝试读取登录态歌曲。
   ⚠ 实测（2026-11）GD 接口不校验 cookie 参数——真/假 cookie 返回完全一致，
   登录态因此只是本地保存，不会解锁 VIP / 私密歌单。参数保留以兼容未来接口。 */
let _cookie = '';
export function setNeteaseCookie(v) { _cookie = String(v || ''); }
const withCookie = (url) => (_cookie ? url + '&cookie=' + encodeURIComponent(_cookie) : url);

async function getJSON(url, timeout = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('接口返回 HTTP ' + res.status);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('连接超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const artists = (v) => (Array.isArray(v) ? v.filter(Boolean).join(' / ') : String(v || ''));

export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s;
  let text = s;
  try { text = decodeURIComponent(s); } catch { /* 保留原文 */ }
  const m = text.match(/(?:[?&#]id=|\/playlist\/)(\d+)/i) || text.match(/"id"\s*:\s*(\d+)/);
  if (m) return m[1];
  const loose = text.match(/\b(\d{6,})\b/);
  return loose ? loose[1] : '';
}

/** 网易云搜索：返回不带本地 id 的歌曲草稿 */
export async function searchNetease(keyword, limit = 20) {
  const q = String(keyword || '').trim();
  if (!q) throw new Error('先输入要搜索的关键词');
  const url = withCookie(`${GD}?types=search&source=netease&name=${encodeURIComponent(q)}&count=${limit}&pages=1`);
  const arr = await getJSON(url);
  if (!Array.isArray(arr)) throw new Error('搜索接口返回异常');
  return arr.map((t) => ({
    neteaseId: String(t.id || ''),
    title: t.name || '未命名',
    artist: artists(t.artist),
    album: t.album || '',
    cover: '',
    duration: 0,
    source: 'netease',
    vip: false
  })).filter((t) => t.neteaseId);
}

/** 歌单详情：优先 GDStudio，失败后走 Meting 兜底 */
export async function fetchPlaylist(id) {
  const pid = parsePlaylistId(id);
  if (!pid) throw new Error('没有识别到歌单 ID');

  try {
    const raw = await getJSON(withCookie(`${GD}?types=playlist&source=netease&id=${pid}`));
    const pl = raw && raw.playlist ? raw.playlist : raw;
    const tracks = ((pl && pl.tracks) || []).map((t) => ({
      neteaseId: String(t.id || ''),
      title: t.name || '未命名',
      artist: artists((t.ar || []).map((a) => a.name)),
      album: (t.al && t.al.name) || '',
      cover: (t.al && t.al.picUrl) || '',
      duration: Math.round((t.dt || 0) / 1000),
      source: 'netease',
      vip: t.fee === 1
    })).filter((t) => t.neteaseId);
    if (tracks.length) {
      return {
        id: pid,
        name: (pl && pl.name) || ('网易云歌单 ' + pid),
        cover: (pl && pl.coverImgUrl) || '',
        trackCount: (pl && pl.trackCount) || tracks.length,
        tracks
      };
    }
  } catch { /* 继续用 Meting 兜底 */ }

  const arr = await getJSON(`${METING}?server=netease&type=playlist&id=${pid}`);
  if (!Array.isArray(arr) || !arr.length) throw new Error('歌单读取失败，可能是私密歌单或接口受限');
  const tracks = arr.map((t) => {
    const m = String(t.url || '').match(/[?&]id=(\d+)/);
    return {
      neteaseId: m ? m[1] : '',
      title: t.name || '未命名',
      artist: artists(t.artist),
      album: '',
      cover: t.pic || '',
      duration: 0,
      url: t.url || '',
      source: 'netease',
      vip: false
    };
  }).filter((t) => t.neteaseId || t.url);

  return { id: pid, name: '网易云歌单 ' + pid, cover: '', trackCount: tracks.length, tracks };
}

/** 解析播放地址：GD 128k → GD 320k → Meting 兜底；无版权 / 接口未收录的歌可能全部落空 */
export async function resolveSongUrl(song) {
  if (!song) return '';
  if (song.url) return song.url;
  const id = song.neteaseId;
  if (!id) return '';

  try {
    const data = await getJSON(withCookie(`${GD}?types=url&source=netease&id=${encodeURIComponent(id)}&br=128`));
    if (data && data.url) return data.url;
  } catch { /* 换 320k 再试 */ }

  try {
    const data = await getJSON(withCookie(`${GD}?types=url&source=netease&id=${encodeURIComponent(id)}&br=320`));
    if (data && data.url) return data.url;
  } catch { /* 用 Meting 兜底 */ }

  // Meting 的 url 是 302 重定向到音频文件，<audio> 可以直接播
  return `${METING}?server=netease&type=url&id=${encodeURIComponent(id)}`;
}

export function normalizeCookie(v) {
  const raw = String(v || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return '';
  if (/MUSIC_U=/i.test(raw)) return raw;
  return 'MUSIC_U=' + raw;
}

export function maskCookie(cookie) {
  const raw = String(cookie || '');
  const m = raw.match(/MUSIC_U=([^;]+)/i);
  const v = m ? m[1] : raw;
  if (!v) return '';
  if (v.length <= 10) return 'MUSIC_U=••••';
  return 'MUSIC_U=' + v.slice(0, 4) + '••••' + v.slice(-4);
}

/* ---------------- 扫码登录（浏览器通常会被跨域拦住） ---------------- */
export async function createQrKey() {
  const res = await fetch('https://music.163.com/api/login/qrcode/unikey?type=1', {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'type=1'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.code !== 200 || !data.unikey) throw new Error((data && data.message) || '获取二维码失败');
  return data.unikey;
}

export function qrImageURL(key) {
  const login = 'https://music.163.com/login?codekey=' + encodeURIComponent(key);
  return 'https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=8&data=' + encodeURIComponent(login);
}

export async function checkQrKey(key) {
  const res = await fetch('https://music.163.com/api/login/qrcode/client/login?type=1&key=' + encodeURIComponent(key), {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'type=1&key=' + encodeURIComponent(key)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
