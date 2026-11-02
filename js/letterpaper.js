/* 字卡传信 · 信纸
   信纸以 media(source='letterpaper') 存放，最多 8 张；
   paperId = null 表示默认的白纸（无任何抬头 / 虚线装饰）。 */

import { el, compressImage, openFile } from './util.js';
import { all } from './store.js';
import { mediaURL, saveMedia, delMedia } from './media.js';
import { sheet, confirmBox, toast } from './ui.js';

export const MAX_PAPERS = 8;
const SOURCE = 'letterpaper';

/** 已导入的信纸（按导入时间正序） */
export async function listPapers() {
  return (await all('media'))
    .filter((m) => m.source === SOURCE && m.type === 'image')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** 导入信纸 PNG；受 8 张上限约束 */
export async function importPapers(files) {
  let papers = await listPapers();
  if (papers.length >= MAX_PAPERS) throw new Error('MAX');
  const added = [];
  for (const f of files) {
    if (papers.length >= MAX_PAPERS) break;
    const { blob, w, h } = await compressImage(f, 1400);
    const id = await saveMedia(blob, { type: 'image', w, h, source: SOURCE, name: f.name || '' });
    added.push(id);
    papers.push({ id });
  }
  return added;
}

export async function deletePaper(id) {
  await delMedia(id);
}

/** 信纸背景 URL（null / 不存在 → 空串） */
export async function paperUrl(id) {
  if (!id) return '';
  return mediaURL(id);
}

/** 把信纸铺到信纸元素上；id 为空则恢复白纸 */
export async function paintPaper(node, id) {
  const url = await paperUrl(id);
  if (url) {
    node.classList.add('has-paper');
    node.style.backgroundImage = `url("${url}")`;
  } else {
    node.classList.remove('has-paper');
    node.style.backgroundImage = '';
  }
}

/** 信纸选择 / 管理弹层 */
export async function openPaperPicker({ currentId = null, onPick } = {}) {
  let papers = await listPapers();
  let cur = currentId || null;

  const grid = el('div', { class: 'paper-grid' });
  const node = el('div', {}, [grid]);

  function render() {
    grid.innerHTML = '';
    grid.appendChild(cell(null, '空白白纸'));
    papers.forEach((p) => grid.appendChild(cell(p.id, '')));
  }

  function cell(id, label) {
    const sw = el('div', { class: 'paper-sw' + (id ? '' : ' blank') });
    if (id) mediaURL(id).then((u) => { if (u) sw.style.backgroundImage = `url("${u}")`; });

    const c = el('div', { class: 'paper-cell' + (cur === id ? ' on' : '') }, [sw]);
    if (label) c.appendChild(el('div', { class: 'paper-cap', text: label }));

    if (id) {
      c.appendChild(el('button', { class: 'paper-del', text: '×', onclick: async (e) => {
        e.stopPropagation();
        const ok = await confirmBox({ title: '删除信纸', text: '删除后无法恢复，已用这张信纸的信会变回白纸。', okText: '删除', danger: true });
        if (!ok) return;
        await deletePaper(id);
        papers = (await listPapers()).filter((p) => p.id !== id);
        if (cur === id) { cur = null; onPick && onPick(null); }
        render();
        toast('已删除信纸');
      } }));
    }

    c.onclick = () => {
      cur = id;
      onPick && onPick(id);
      render();
    };
    return c;
  }

  async function doImport() {
    if (papers.length >= MAX_PAPERS) {
      toast(`最多保存 ${MAX_PAPERS} 张信纸，请先删一张`);
      return;
    }
    const files = await openFile({ accept: 'image/png', multiple: true });
    if (!files || !files.length) return;
    try {
      const ids = await importPapers(files.slice(0, MAX_PAPERS - papers.length));
      papers = await listPapers();
      render();
      if (ids.length && ids[0]) { cur = ids[0]; onPick && onPick(ids[0]); render(); }
      toast(`已导入 ${ids.length} 张信纸`);
    } catch (e) {
      toast(`最多保存 ${MAX_PAPERS} 张信纸，请先删一张`);
    }
  }

  const foot = el('div', { class: 'paper-foot' }, [
    el('button', { class: 'btn', onclick: doImport }, ['导入信纸 PNG']),
    el('button', { class: 'btn primary', onclick: () => ctl.close() }, ['完成'])
  ]);

  const ctl = sheet({
    title: '信纸',
    node: el('div', {}, [
      node,
      el('div', { class: 'paper-tip', text: `默认是空白白纸；已存 ${papers.length}/${MAX_PAPERS} 张` })
    ]),
    foot
  });
  render();
}
