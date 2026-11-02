/* 数据 · 全量导出 / 导入
   一个 zip 包内含结构化数据（data.json）与全部媒体原文件（media/ 目录），可整包备份与恢复。 */

import { el, openFile, readBuf, downloadBlob, humanSize } from '../util.js';
import { iconImg } from '../icons.js';
import { normalPage } from '../shell.js';
import { snapshot, clearAll, bulkWrite, storageEstimate, all } from '../store.js';
import { makeZip, readZip } from '../zip.js';
import { actionSheet, confirmBox, alertBox, toast, sheet } from '../ui.js';
import { CATEGORIES, countCategory, exportCategory, importCategory, deleteCategory } from '../partial.js';

let view = null;

export default async function pageData(v) {
  view = v;
  normalPage('data', { back: true, title: '数据备份', sub: '整包导出 · 覆盖或合并导入' });
  await render();
}

async function render() {
  view.innerHTML = '';
  const wrap = el('div', { class: 'page' });

  /* 存储概况 */
  const est = await storageEstimate();
  const mediaN = await all('media');
  const totalBytes = mediaN.reduce((s, m) => s + (m.size || 0), 0);
  const usageText = est ? `已用 ${humanSize(est.usage)} / 约 ${humanSize(est.quota)}` : '浏览器未提供配额统计';

  wrap.appendChild(section('本地存储', el('div', { class: 'card' }, [
    el('div', { class: 'row between' }, [
      el('div', { class: 'small muted', text: '占用空间' }),
      el('div', { class: 'small', text: usageText })
    ]),
    el('div', { class: 'row between', style: { marginTop: '8px' } }, [
      el('div', { class: 'small muted', text: '媒体文件' }),
      el('div', { class: 'small', text: `${mediaN.length} 个 · ${humanSize(totalBytes)}` })
    ]),
    el('div', { class: 'hint', text: '全部数据只存在这台设备的浏览器里，不会上传到任何服务器。' })
  ])));

  /* 导出 */
  wrap.appendChild(section('导出备份', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px', marginBottom: '10px' } }, [
      iconImg('IC-MIO-009'),
      el('div', { class: 'small muted', text: '把聊天记录、字卡、朋友圈、占卜、装扮、替换的图标以及全部图片语音，打包成一个 zip 文件下载到本地。' })
    ]),
    el('button', { class: 'btn primary block', onclick: doExport }, [iconImg('IC-MIO-009'), '导出为 zip 备份']),
    el('div', { class: 'hint', text: '建议定期导出，清除浏览器数据会导致本地内容永久丢失。' })
  ])));

  /* 导入 */
  wrap.appendChild(section('导入备份', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px', marginBottom: '10px' } }, [
      iconImg('IC-MIO-010'),
      el('div', { class: 'small muted', text: '选择之前导出的 zip 备份恢复数据。导入前建议先导出一次当前数据作为保险。' })
    ]),
    el('button', { class: 'btn block', onclick: importChoose }, [iconImg('IC-MIO-010'), '从 zip 备份导入'])
  ])));

  /* 分类管理 */
  wrap.appendChild(section('分类管理', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px', marginBottom: '10px' } }, [
      iconImg('IC-MIO-012'),
      el('div', { class: 'small muted', text: '按模块单独导出、导入或删除某一类记录：聊天记录、信箱、朋友圈、占卜、通话、记账等等，彼此互不影响。' })
    ]),
    el('button', { class: 'btn block', onclick: openCategories }, [iconImg('IC-MIO-012'), '选择分类…']),
    el('div', { class: 'hint', text: '导入时可选「合并」或「覆盖该分类」；删除只清空这一分类的记录。' })
  ])));

  /* 清空 */
  wrap.appendChild(section('危险操作', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px', marginBottom: '10px' } }, [
      iconImg('IC-MIO-008'),
      el('div', { class: 'small muted', text: '清空后无法恢复，请务必先完成一次导出。' })
    ]),
    el('button', { class: 'btn danger block', onclick: clearAllData }, [iconImg('IC-CRD-007'), '清空全部数据'])
  ])));

  view.appendChild(wrap);
}

/* ---------------- 导出 ---------------- */
async function doExport() {
  toast('正在打包，请稍候…');
  try {
    const snap = await snapshot();
    const enc = new TextEncoder();
    const files = [];
    const data = {};

    for (const [store, rows] of Object.entries(snap)) {
      if (store === 'media') {
        data.media = rows.map((r) => { const { blob, ...meta } = r; void blob; return meta; });
        for (const r of rows) {
          if (r.blob) files.push({ name: `media/${r.id}`, data: new Uint8Array(await r.blob.arrayBuffer()) });
        }
      } else {
        data[store] = rows;
      }
    }

    files.push({
      name: 'data.json',
      data: enc.encode(JSON.stringify({ version: 1, app: '字卡传信', exportedAt: Date.now(), data }))
    });

    const zip = makeZip(files);
    downloadBlob(zip, `字卡传信备份-${new Date().toISOString().slice(0, 10)}.zip`);
    const { state, saveSettings } = await import('../state.js');
    state.settings.backupRemindAt = Date.now();
    await saveSettings();
    toast('备份已导出');
  } catch (err) {
    alertBox({ title: '导出失败', text: String(err.message || err) });
  }
}

/* ---------------- 导入 ---------------- */
function importChoose() {
  actionSheet('导入方式', [
    { label: '覆盖导入', sub: '清空现有数据后完整恢复备份', icon: 'IC-MIO-011', danger: true, onSelect: () => doImport('overwrite') },
    { label: '合并导入', sub: '保留现有数据，同 id 以备份为准', icon: 'IC-MIO-022', onSelect: () => doImport('merge') }
  ]);
}

async function doImport(mode) {
  const file = await openFile({ accept: '.zip,application/zip' });
  if (!file) return;

  if (mode === 'overwrite') {
    const yes = await confirmBox({
      title: '覆盖导入',
      text: '将先清空本机现有全部数据，再用备份完整恢复。此操作无法撤销，确定继续吗？',
      okText: '清空并导入', danger: true
    });
    if (!yes) return;
  }

  toast('正在读取备份…');
  try {
    const buf = await readBuf(file);
    const files = readZip(buf);
    const dataFile = files.find((f) => f.name === 'data.json');
    if (!dataFile) throw new Error('备份里缺少 data.json，可能不是本站导出的文件');

    const parsed = JSON.parse(new TextDecoder().decode(dataFile.data));
    const data = parsed.data || parsed;

    const mediaFiles = new Map(files.filter((f) => f.name.startsWith('media/')).map((f) => [f.name.slice(6), f]));
    const mediaRows = [];
    for (const meta of (data.media || [])) {
      const f = mediaFiles.get(meta.id);
      if (!f) {
        // 外链素材没有二进制文件，只还原地址
        if (meta.url) mediaRows.push({ ...meta });
        continue;
      }
      mediaRows.push({ ...meta, blob: new Blob([f.data], { type: meta.mime || 'application/octet-stream' }) });
    }

    const plan = {
      kv: data.kv || [], groups: data.groups || [], cards: data.cards || [],
      messages: data.messages || [], letters: data.letters || [], moments: data.moments || [],
      divinations: data.divinations || [], icons: data.icons || [],
      memos: data.memos || [], songs: data.songs || [], playlists: data.playlists || [],
      quizzes: data.quizzes || [], calls: data.calls || [],
      periods: data.periods || [], ledger: data.ledger || [],
      pomodoros: data.pomodoros || [], watches: data.watches || [],
      books: data.books || [], favorites: data.favorites || [],
      photos: data.photos || [], momentCards: data.momentCards || [],
      friends: data.friends || [],
      xhsPosts: data.xhsPosts || [],
      anniversaries: data.anniversaries || [],
      inspirations: data.inspirations || [],
      nicknamePool: data.nicknamePool || [],
      avatarPool: data.avatarPool || [],
      media: mediaRows
    };

    if (mode === 'overwrite') await clearAll();
    await bulkWrite(plan);

    alertBox({ title: '导入完成', text: `已恢复 ${plan.cards.length} 张字卡、${plan.messages.length} 条消息、${mediaRows.length} 个媒体文件。即将重新载入。` });
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    alertBox({ title: '导入失败', text: String(err.message || err) });
  }
}

/* ---------------- 清空 ---------------- */
async function clearAllData() {
  const yes = await confirmBox({
    title: '清空全部数据',
    text: '将删除本地保存的全部内容，且无法撤销。请确认已经导出过备份。',
    okText: '全部清空', danger: true
  });
  if (!yes) return;
  await clearAll();
  toast('已清空，即将重新载入');
  setTimeout(() => location.reload(), 900);
}

/* ---------------- 分类管理 ---------------- */
function openCategories() {
  const s = sheet({
    title: '选择分类',
    node: el('div', {}, CATEGORIES.map((c) => el('div', {
      class: 'list-item',
      onclick: () => { s.close(); openCategory(c); }
    }, [
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title', text: c.name }),
        el('div', { class: 'li-sub', text: c.sub })
      ]),
      iconImg('IC-MIO-004', 'chev')
    ])))
  });
}

async function openCategory(c) {
  let n = 0;
  try { n = await countCategory(c.key); } catch (e) { n = 0; }
  actionSheet(c.name, [
    { label: '导出记录', sub: `${n} 条记录 / 导出为 zip 备份`, icon: 'IC-MIO-009', onSelect: () => doCatExport(c) },
    { label: '导入记录', sub: '从这个分类的 zip 备份恢复', icon: 'IC-MIO-010', onSelect: () => doCatImport(c) },
    { label: '删除该类记录', sub: `删除 ${n} 条记录，不影响其它分类`, icon: 'IC-CRD-007', danger: true, onSelect: () => doCatDelete(c, n) }
  ]);
}

async function doCatExport(c) {
  toast('正在打包…');
  try {
    const r = await exportCategory(c.key);
    toast(`已导出「${c.name}」${r.records} 条${r.media ? ` · ${r.media} 个媒体` : ''}`);
  } catch (err) {
    alertBox({ title: '导出失败', text: String(err.message || err) });
  }
}

function doCatImport(c) {
  actionSheet('导入方式', [
    { label: '合并导入', sub: '保留现有记录，同 id 以备份为准', icon: 'IC-MIO-022', onSelect: () => runCatImport(c, 'merge') },
    { label: '覆盖导入', sub: '先清空该类记录再恢复备份', icon: 'IC-MIO-011', danger: true, onSelect: () => runCatImport(c, 'overwrite') }
  ]);
}

async function runCatImport(c, mode) {
  try {
    const r = await importCategory(c.key, mode);
    if (!r) return;
    alertBox({
      title: '导入完成',
      text: `已恢复「${r.name}」${r.records} 条记录${r.media ? `、${r.media} 个媒体文件` : ''}。即将重新载入。`
    });
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    alertBox({ title: '导入失败', text: String(err.message || err) });
  }
}

async function doCatDelete(c, n) {
  const yes = await confirmBox({
    title: `删除「${c.name}」`,
    text: `将删除 ${n} 条记录，只影响这一分类，其它数据（字卡、装扮、其它记录）不受影响。此操作无法撤销，建议先导出备份。`,
    okText: '删除', danger: true
  });
  if (!yes) return;
  try {
    const removed = await deleteCategory(c.key);
    toast(`已删除「${c.name}」${removed} 条记录`);
  } catch (err) {
    alertBox({ title: '删除失败', text: String(err.message || err) });
  }
}

/* ---------------- 小部件 ---------------- */
function section(title, node) {
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: title })]),
    node
  ]);
}
