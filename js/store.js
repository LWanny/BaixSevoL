/* 字卡传信 · IndexedDB 存储层
   结构化数据与媒体文件全部落在这里，不使用 localStorage（避开 5MB 上限）。 */

const DB_NAME = 'zikachuanxin';
const DB_VER = 14;

const STORES = {
  kv:         { keyPath: 'k' },
  groups:     { keyPath: 'id', indexes: { order: 'order' } },
  cards:      { keyPath: 'id', indexes: { groupId: 'groupId', kind: 'kind' } },
  messages:   { keyPath: 'id', indexes: { ts: 'ts' } },
  letters:    { keyPath: 'id', indexes: { ts: 'ts', dir: 'dir' } },
  media:      { keyPath: 'id' },
  moments:    { keyPath: 'id', indexes: { ts: 'ts' } },
  divinations:{ keyPath: 'id', indexes: { ts: 'ts' } },
  icons:      { keyPath: 'id' },   // 图标替换记录
  memos:      { keyPath: 'id', indexes: { ts: 'ts' } },   // 备忘录
  songs:      { keyPath: 'id', indexes: { ts: 'ts' } },   // 歌曲
  playlists:  { keyPath: 'id', indexes: { ts: 'ts', owner: 'owner' } },   // 音乐歌单（网易云 / 本地）
  quizzes:    { keyPath: 'id', indexes: { ts: 'ts' } },   // 问卷记录
  calls:      { keyPath: 'id', indexes: { ts: 'ts' } },   // 通话记录
  periods:    { keyPath: 'id', indexes: { start: 'start' } },   // 经期记录
  ledger:     { keyPath: 'id', indexes: { ts: 'ts' } },         // 记账
  pomodoros:  { keyPath: 'id', indexes: { ts: 'ts' } },         // 番茄钟
  watches:    { keyPath: 'id', indexes: { ts: 'ts' } },         // 观影
  books:      { keyPath: 'id', indexes: { ts: 'ts' } },         // 书架
  favorites:  { keyPath: 'id', indexes: { ts: 'ts', owner: 'owner' } },  // 收藏
  photos:     { keyPath: 'id', indexes: { ts: 'ts', owner: 'owner' } },  // 相册
  momentCards:{ keyPath: 'id', indexes: { ts: 'ts' } },                  // 朋友圈专属字卡
  friends:    { keyPath: 'id', indexes: { ts: 'ts' } },                  // 朋友圈里的「朋友」
  xhsPosts:   { keyPath: 'id', indexes: { ts: 'ts', source: 'source' } }, // 小粉书笔记
  anniversaries: { keyPath: 'id', indexes: { date: 'date', status: 'status' } }, // 纪念日
  inspirations:  { keyPath: 'id', indexes: { ts: 'ts', source: 'source' } },     // 灵感拾取
  nicknamePool:  { keyPath: 'id', indexes: { role: 'role', ts: 'ts' } },       // TA/我的昵称库
  avatarPool:    { keyPath: 'id', indexes: { role: 'role', ts: 'ts' } },       // TA/我的头像库
  orders:        { keyPath: 'id', indexes: { ts: 'ts' } },                      // 商城订单
  games:         { keyPath: 'id', indexes: { ts: 'ts' } },                       // 游戏战绩
  echoDecks:     { keyPath: 'id', indexes: { ts: 'ts' } },                       // 回声 · 卡组
  echoCards:     { keyPath: 'id', indexes: { deckId: 'deckId', ts: 'ts' } }      // 回声 · 组内卡
};

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: def.keyPath });
        if (def.indexes) for (const [ix, key] of Object.entries(def.indexes)) os.createIndex(ix, key);
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('数据库被其它页面占用，请关闭本站的其它标签页后重试'));
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

/* ---------- 基础读写 ---------- */
export async function get(store, key) { return wrap((await tx(store)).get(key)); }
export async function put(store, value) { return wrap((await tx(store, 'readwrite')).put(value)); }
export async function del(store, key) { return wrap((await tx(store, 'readwrite')).delete(key)); }
export async function all(store) { return wrap((await tx(store)).getAll()); }
export async function count(store) { return wrap((await tx(store)).count()); }
export async function clear(store) { return wrap((await tx(store, 'readwrite')).clear()); }

/** 按索引查询 */
export async function query(store, index, value) {
  const os = await tx(store);
  return wrap(os.index(index).getAll(value));
}
export async function queryRange(store, index, { lower = -Infinity, upper = Infinity, dir = 'next' } = {}) {
  const os = await tx(store);
  return wrap(os.index(index).getAll(IDBKeyRange.bound(lower, upper), 9999));
}

/** 批量写，一条事务完成，保证一致性 */
export async function bulkPut(store, values) {
  if (!values.length) return;
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    values.forEach((v) => os.put(v));
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

/** 多 store 一次性写入（导入恢复用） */
export async function bulkWrite(plan) {
  const db = await openDB();
  const names = Object.keys(plan);
  return new Promise((res, rej) => {
    const t = db.transaction(names, 'readwrite');
    for (const [store, values] of Object.entries(plan)) {
      const os = t.objectStore(store);
      values.forEach((v) => os.put(v));
    }
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

/* ---------- kv 单例访问 ---------- */
export async function kvGet(k, def = null) {
  const row = await get('kv', k);
  return row ? row.v : def;
}
export async function kvSet(k, v) { return put('kv', { k, v }); }

/* ---------- 存储配额 ---------- */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/* ---------- 清空全部（导入「覆盖」模式前调用） ---------- */
export async function clearAll() {
  const db = await openDB();
  const names = Object.keys(STORES);
  return new Promise((res, rej) => {
    const t = db.transaction(names, 'readwrite');
    names.forEach((n) => t.objectStore(n).clear());
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

/**
 * 全量导出用的快照：结构化数据原样，媒体以 Blob 交给 zip 层
 */
export async function snapshot() {
  const out = {};
  for (const name of Object.keys(STORES)) out[name] = await all(name);
  return out;
}
