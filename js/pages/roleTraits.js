/* 气质参数 · 灵感 / 昵称头像 / 涂鸦 / 拼音打字 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { go } from '../router.js';
import { state } from '../state.js';
import { sheet, confirmBox, toast } from '../ui.js';
import {
  SHAPE_LIB, SHAPE_NAMES, OUTLINES, drawTaShape, createFreeCanvas,
  loadCustomShapes, addCustomShape, removeCustomShape, setCustomShapeEnabled,
  loadDisabledShapes, setShapeDisabled
} from '../graffiti.js';
import { setupRoleUi, section } from './roleParts.js';

export default async function pageRoleTraits(view) {
  fullPage({ back: true, title: '气质参数' });
  const p = state.role.params;
  const { rowPct, rowNum, rowToggle, rowSeg } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  wrap.appendChild(section('灵感拾取', el('div', { class: 'set-card' }, [
    rowToggle('允许拾取灵感', '关闭后 TA 不会再收你的话', 'inspirationEnabled', p.inspirationEnabled),
    rowPct('每次可拾取概率', 'TA 在聊天/信件/朋友圈里捡走你一句话的概率', 'inspirationPct', p.inspirationPct),
    rowPct('使用灵感概率', 'TA 生成回复时直接用拾取句的概率', 'inspirationUsePct', p.inspirationUsePct)
  ])));

  wrap.appendChild(section('昵称 / 头像互动', el('div', { class: 'set-card' }, [
    el('div', {
      class: 'hint', style: { padding: '10px 12px 4px', margin: 0, lineHeight: '1.7' },
      text: '四种换改（TA 换我的 / TA 换它自己的昵称与头像）的开关、概率区间、「每天最多几次」和导入入口，都搬到「昵称 / 头像库」页面了。'
    }),
    el('div', { class: 'set-row' }, [
      el('div', { class: 'set-main' }, [el('div', { class: 'set-t', text: '打开昵称 / 头像库' })]),
      el('div', { class: 'set-ctl' }, [el('button', { class: 'btn sm primary', onclick: () => go('/avatarLib') }, ['前往'])])
    ])
  ])));

  wrap.appendChild(section('涂鸦', el('div', { class: 'set-card' }, [
    rowToggle('允许 TA 涂鸦', 'TA 只能用空心/实心图形、直线/虚线/波浪、对勾叉叉和大写字母', 'taGraffitiEnabled', p.taGraffitiEnabled),
    rowPct('涂鸦概率', '每个间隔里真的发一张涂鸦的概率', 'taGraffitiPct', p.taGraffitiPct),
    rowNum('涂鸦间隔（最短）', '', 'taGraffitiGapMin', p.taGraffitiGapMin, 1, 9999, '分'),
    rowNum('涂鸦间隔（最长）', '', 'taGraffitiGapMax', p.taGraffitiGapMax, 1, 9999, '分'),
    el('div', { class: 'set-row' }, [
      el('div', { class: 'set-main' }, [
        el('div', { class: 'set-t', text: 'TA 的涂鸦图案库' }),
        el('div', { class: 'set-s', text: '列出全部可涂鸦图案 · 画新图案加入 · 启用 / 禁用 / 删除' })
      ]),
      el('div', { class: 'set-ctl' }, [el('button', { class: 'btn sm', onclick: openShapeLib }, ['去管理'])])
    ])
  ])));

  view.appendChild(wrap);
}

/* ================= TA 的涂鸦图案库 ================= */

function shapePreview(key, off) {
  const pv = el('canvas', { width: 56, height: 56 });
  pv.style.cssText = 'width:56px;height:56px;border-radius:10px;';
  const c = pv.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, 56, 56);
  drawTaShape(c, key, { x: 28, y: 28, size: 32, color: off ? '#c4c9d0' : '#1f2937', fill: OUTLINES.includes(key) });
  return pv;
}

function libItem({ preview, name, sub, isOff, onToggle, onDelete }) {
  const btns = [el('button', { class: 'gf-lib-btn' + (isOff ? ' off' : ''), text: isOff ? '启用' : '禁用',
    onclick: onToggle })];
  if (onDelete) btns.push(el('button', { class: 'gf-lib-btn del', text: '删除', onclick: onDelete }));
  return el('div', { class: 'gf-lib-item' + (isOff ? ' off' : '') }, [
    el('div', { class: 'gf-lib-pv' }, [preview, sub ? el('span', { class: 'gf-lib-sub', text: sub }) : null]),
    el('div', { class: 'gf-lib-name', text: name }),
    el('div', { class: 'gf-lib-acts' }, btns)
  ]);
}

async function openShapeLib() {
  const grid = el('div', { class: 'gf-lib-grid' });
  const countHint = el('div', { class: 'hint', style: { margin: '0 12px' } });

  async function renderLib() {
    const [disabled, customs] = await Promise.all([loadDisabledShapes(), loadCustomShapes()]);
    const off = new Set(disabled);
    const bOn = Object.keys(SHAPE_LIB).length - off.size;
    const cOn = customs.filter((s) => s.enabled !== false).length;
    countHint.textContent = `内置 ${bOn}/${Object.keys(SHAPE_LIB).length} 种启用 · 自定义 ${cOn}/${customs.length} 个启用 · TA 只涂启用中的图案（空心/实心共用一格，字母大小固定）`;

    grid.innerHTML = '';
    for (const k of Object.keys(SHAPE_LIB)) {
      const isOff = off.has(k);
      grid.appendChild(libItem({
        preview: shapePreview(k, isOff),
        name: SHAPE_NAMES[k] || (k.length === 1 ? `字母 ${k}` : k),
        isOff,
        onToggle: async () => { await setShapeDisabled(k, !isOff); renderLib(); }
      }));
    }
    for (const s of customs) {
      const isOff = s.enabled === false;
      const img = el('img', { src: s.dataURL, alt: s.name });
      img.style.cssText = 'width:56px;height:56px;border-radius:10px;background:#fff;';
      grid.appendChild(libItem({
        preview: img,
        name: s.name,
        sub: '我画的',
        isOff,
        onToggle: async () => { await setCustomShapeEnabled(s.id, isOff); renderLib(); },
        onDelete: async () => {
          const ok = await confirmBox({ text: `删除「${s.name}」？删除后 TA 不再涂这个图案。`, danger: true });
          if (!ok) return;
          await removeCustomShape(s.id);
          renderLib();
          toast('已删除');
        }
      }));
    }
  }
  await renderLib();

  sheet({
    title: 'TA 的涂鸦图案库',
    node: el('div', {}, [
      countHint,
      el('div', { style: { padding: '10px 12px' } }, [
        el('button', { class: 'btn primary block', onclick: () => openDrawNew(renderLib) }, ['＋ 画一个新图案'])
      ]),
      grid
    ]),
    actions: []
  });
}

function openDrawNew(onDone) {
  const pen = createFreeCanvas({ width: 320, height: 320, color: '#1f2937', size: 4 });
  const host = el('div', { class: 'gf-draw-host' }, [pen.canvas]);

  const colors = ['#1f2937', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'];
  const colorRow = el('div', { class: 'gf-color-row' });
  colors.forEach((c, i) => colorRow.appendChild(el('button', {
    class: 'gf-color' + (i === 0 ? ' on' : ''), style: { background: c },
    onclick: (e) => { pen.setColor(c); [...colorRow.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); }
  })));

  const sizes = [[3, '细'], [6, '中'], [10, '粗']];
  const sizeRow = el('div', { class: 'gf-size-row' });
  sizes.forEach(([n, t], i) => sizeRow.appendChild(el('button', {
    class: 'gf-size' + (i === 1 ? ' on' : ''), text: t,
    onclick: (e) => { pen.setSize(n); [...sizeRow.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); }
  })));

  const nameInput = el('input', { class: 'input', placeholder: '给图案起个名字（可不填）' });

  sheet({
    title: '画一个新图案',
    node: el('div', {}, [
      host,
      el('div', { style: { padding: '8px 12px 0' } }, [colorRow, sizeRow]),
      el('div', { class: 'gf-draw-acts' }, [
        el('button', { class: 'btn sm', onclick: () => pen.undo() }, ['撤销']),
        el('button', { class: 'btn sm', onclick: () => pen.clear() }, ['清空'])
      ]),
      el('div', { class: 'field', style: { padding: '10px 12px 0' } }, [nameInput])
    ]),
    actions: [{ label: '加入图案库', onSelect: async () => {
      if (!canvasHasInk(pen.canvas)) return toast('先画点什么吧');
      const dataURL = pen.canvas.toDataURL('image/png');
      const s = await addCustomShape(dataURL, nameInput.value);
      pen.destroy();
      toast(`已加入图案库：${s.name}`);
      if (onDone) onDone();
    } }]
  });
}

/* 粗采样判断画布上有没有笔迹（全白就不让保存） */
function canvasHasInk(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < d.length; i += 160) {
    if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) return true;
  }
  return false;
}
