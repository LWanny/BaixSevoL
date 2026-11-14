/* 音乐 · 在线曲库接口
   浏览器直连音乐平台会受跨域限制，这里走带 CORS 的公共接口：
   - GDStudio Music API：搜索 / 歌单详情 / 播放地址
   - Meting API：歌单 / 播放地址兜底
   ⚠ 实测（2026-11）：QQ 音乐（tencent）、酷狗、酷我等源在上述公共接口均已下线，
   仅网易云通道还能解析出音源；热门 VIP 歌曲多数解不出（url 为空）。
   登录功能已按需求移除——公共接口本就不校验个人 Cookie。 */

const GD = 'https://music-api.gdstudio.xyz/api.php';
const METING = 'https://api.injahow.cn/meting/';

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

/** 在线搜索：返回不带本地 id 的歌曲草稿 */
export async function searchNetease(keyword, limit = 20) {
  const q = String(keyword || '').trim();
  if (!q) throw new Error('先输入要搜索的关键词');
  const url = `${GD}?types=search&source=netease&name=${encodeURIComponent(q)}&count=${limit}&pages=1`;
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
    const raw = await getJSON(`${GD}?types=playlist&source=netease&id=${pid}`);
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
        name: (pl && pl.name) || ('在线歌单 ' + pid),
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

  return { id: pid, name: '在线歌单 ' + pid, cover: '', trackCount: tracks.length, tracks };
}

/** 解析播放地址：GD 128k → GD 320k → Meting 兜底。
    VIP / 无版权的歌可能三级全空（GD 返回 url:""）→ 返回 '' 由页面提示无音源。 */
export async function resolveSongUrl(song) {
  if (!song) return '';
  if (song.url) return song.url;
  const id = song.neteaseId;
  if (!id) return '';

  try {
    const data = await getJSON(`${GD}?types=url&source=netease&id=${encodeURIComponent(id)}&br=128`);
    if (data && data.url) return data.url;
  } catch { /* 换 320k 再试 */ }

  try {
    const data = await getJSON(`${GD}?types=url&source=netease&id=${encodeURIComponent(id)}&br=320`);
    if (data && data.url) return data.url;
  } catch { /* 用 Meting 兜底 */ }

  // Meting 的 url 是 302 重定向到音频文件，<audio> 可以直接播
  return `${METING}?server=netease&type=url&id=${encodeURIComponent(id)}`;
}

/* ---------- 网易云真登录（NeteaseCloudMusicApi 实例客户端） ----------
   浏览器无法直连 music.163.com（跨域），登录必须经由一个
   NeteaseCloudMusicApi 实例（开源项目，可免费部署到 Vercel）。
   base = 实例根地址（页面内可填写，如 https://your-app.vercel.app）。
   登录成功后实例把 Cookie 作为 JSON 返回（非 Set-Cookie），前端可保存使用：
   显示昵称 / 拉取私密歌单 / 用自己账号解析 VIP 歌曲。 */

export async function ncmFetch(base, path, params = {}, cookie = '') {
  const root = String(base || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(root)) throw new Error('接口地址要以 http(s):// 开头');
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  if (cookie) qs.set('cookie', cookie);
  const data = await getJSON(`${root}${path}${qs.toString() ? '?' + qs : ''}`, 15000);
  if (data && typeof data.code === 'number' && data.code !== 200 && data.code !== 301) {
    throw new Error(data.message || data.msg || `接口返回 code ${data.code}`);
  }
  return data;
}

/** 发送短信验证码（注意：会真的发短信） */
export async function ncmCaptchaSent(base, phone, ctcode = '86') {
  await ncmFetch(base, '/captcha/sent', { phone, ctcode, timestamp: Date.now() });
}

/** 手机号 + 验证码登录，返回 {cookie, profile} */
export async function ncmLoginCellphone(base, phone, captcha, ctcode = '86') {
  const d = await ncmFetch(base, '/login/cellphone', { phone, captcha, countrycode: ctcode, timestamp: Date.now() });
  if (!d.cookie) throw new Error('登录成功但没有拿到凭据');
  return { cookie: d.cookie, profile: d.profile || null };
}

export async function ncmQrKey(base) {
  const d = await ncmFetch(base, '/login/qr/key', { timestamp: Date.now() });
  return d.data && d.data.unikey;
}

export async function ncmQrCreate(base, key) {
  const d = await ncmFetch(base, '/login/qr/create', { key, qrimg: true, timestamp: Date.now() });
  return d.data || {};
}

/** 轮询扫码状态：800 过期 / 801 等待 / 802 已扫待确认 / 803 成功（带 cookie） */
export async function ncmQrCheck(base, key) {
  const d = await ncmFetch(base, '/login/qr/check', { key, timestamp: Date.now() });
  return { code: d.code, cookie: d.cookie || '' };
}

/** 校验 Cookie 有效性，返回 profile 或 null */
export async function ncmAccount(base, cookie) {
  const d = await ncmFetch(base, '/user/account', { timestamp: Date.now() }, cookie);
  return d.profile || null;
}

/** 账号的歌单列表（含私密歌单） */
export async function ncmUserPlaylists(base, cookie, uid) {
  const d = await ncmFetch(base, '/user/playlist', { uid, limit: 30, timestamp: Date.now() }, cookie);
  return (d.playlist || []).map((p) => ({
    id: p.id, name: p.name, trackCount: p.trackCount,
    cover: p.coverImgUrl || '', userId: p.userId
  }));
}

/** 歌单内歌曲（登录后可读私密歌单） */
export async function ncmPlaylistTracks(base, cookie, id) {
  const d = await ncmFetch(base, '/playlist/track/all', { id, limit: 300, timestamp: Date.now() }, cookie);
  return (d.songs || []).map((t) => ({
    neteaseId: String(t.id || ''),
    title: t.name || '未命名',
    artist: artists((t.ar || []).map((a) => a.name)),
    album: (t.al && t.al.name) || '',
    cover: (t.al && t.al.picUrl) || '',
    duration: Math.round((t.dt || 0) / 1000),
    source: 'netease',
    vip: t.fee === 1
  })).filter((t) => t.neteaseId);
}

/** 用登录账号解析播放地址（VIP 歌曲可用账号权益），失败/无版权返回 '' */
export async function ncmSongUrl(base, cookie, id, level = 'standard') {
  const d = await ncmFetch(base, '/song/url/v1', { id, level, realIP: '116.25.146.177', timestamp: Date.now() }, cookie);
  const item = (d.data || [])[0];
  return (item && item.url) || '';
}
