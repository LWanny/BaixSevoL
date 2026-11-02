/* 抉择 · 抛硬币 + 扔骰子 + 转盘
   纯前端本地随机，结果不持久化（抽签 / 历史记录 留到后续版本）。
   转盘的选项会存进 kv，下次打开还在。 */

import { el, rndInt } from '../util.js';
import { iconImg } from '../icons.js';
import { fullPage } from '../shell.js';
import { kvGet, kvSet } from '../store.js';
import { sheet, toast } from '../ui.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 转盘配置 ---------- */
const WHEEL_COLORS = ['#5b6ef2', '#7c5cf2', '#f0728f', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6', '#22c55e'];
const DEFAULT_SLICES = ['可以', '不可以', '再想想', '听你的'];
const SLICE_MIN = 2;
const SLICE_MAX = 12;
const WHEEL_SIZE = 260;
const WHEEL_DPR = 2;

export default async function pageFate(view) {
  fullPage({
    back: true,
    title: '抉择',
    sub: '抛硬币 · 扔骰子 · 转盘',
    actions: []
  });

  /* 转盘选项：读上次保存的，没有就用默认 */
  const saved = await kvGet('fateSlices', null);
  let slices = Array.isArray(saved) && saved.length >= SLICE_MIN
    ? saved.slice(0, SLICE_MAX)
    : DEFAULT_SLICES.slice();

  let tab = 'coin';
  const segCoin = segBtn('coin', '抛硬币');
  const segDice = segBtn('dice', '扔骰子');
  const segWheel = segBtn('wheel', '转盘');
  const tabs = el('div', { class: 'mail-tabs fate-tabs' }, [segCoin, segDice, segWheel]);
  const body = el('div', { class: 'fate-body' });
  view.appendChild(el('div', { class: 'page fate' }, [tabs, body]));

  function segBtn(key, label) {
    return el('button', {
      class: 'mail-tab' + (key === tab ? ' on' : ''),
      onclick: () => { tab = key; paintTabs(); render(); }
    }, [label]);
  }
  function paintTabs() {
    segCoin.classList.toggle('on', tab === 'coin');
    segDice.classList.toggle('on', tab === 'dice');
    segWheel.classList.toggle('on', tab === 'wheel');
  }

  function render() {
    body.innerHTML = '';
    body.appendChild(tab === 'coin' ? coinView() : tab === 'dice' ? diceView() : wheelView());
  }

  /* ---------- 抛硬币 ---------- */
  function coinView() {
    const coinWrap = el('div', { class: 'coin-wrap' }, [
      el('div', { class: 'coin', id: 'coin' }, [
        el('div', { class: 'face face-hei' }, ['正']),
        el('div', { class: 'face face-tail' }, ['反'])
      ])
    ]);
    const hint = el('div', { class: 'fate-hint', text: '轻点硬币抛出' });
    const btn = el('button', { class: 'btn primary block fate-btn', text: '抛 · 抛 · 抛' });
    let flipping = false;

    coinWrap.onclick = () => flip();
    btn.onclick = () => flip();

    async function flip() {
      if (flipping) return;
      flipping = true;
      const coin = document.getElementById('coin');
      hint.textContent = '…';
      coin.classList.remove('land-hei', 'land-tail');
      coin.classList.add('flipping');
      await wait(1800);
      coin.classList.remove('flipping');
      const hei = Math.random() < 0.5;
      coin.classList.add(hei ? 'land-hei' : 'land-tail');
      hint.textContent = hei ? '✦ 正 · 决定就是它了' : '✧ 反 · 换一个试试';
      flipping = false;
    }

    return el('div', { class: 'fate-panel' }, [coinWrap, hint, btn]);
  }

  /* ---------- 扔骰子 ---------- */
  function diceView() {
    const diceWrap = el('div', { class: 'dice-wrap' }, [
      el('div', { class: 'dice', id: 'dice' }, [
        face(1), face(2), face(3), face(4), face(5), face(6)
      ])
    ]);
    const hint = el('div', { class: 'fate-hint', text: '轻点骰子投掷' });
    const numOut = el('div', { class: 'dice-num', text: '—' });
    const btn = el('button', { class: 'btn primary block fate-btn', text: '扔 · 扔 · 扔' });
    let rolling = false;

    diceWrap.onclick = () => roll();
    btn.onclick = () => roll();

    async function roll() {
      if (rolling) return;
      rolling = true;
      const dice = document.getElementById('dice');
      dice.classList.remove('land-1', 'land-2', 'land-3', 'land-4', 'land-5', 'land-6');
      numOut.textContent = '—';
      hint.textContent = '…';
      dice.classList.add('rolling');
      await wait(1600);
      dice.classList.remove('rolling');
      const n = rndInt(1, 6);
      dice.classList.add('land-' + n);
      numOut.textContent = String(n);
      hint.textContent = pickComment(n);
      rolling = false;
    }

    return el('div', { class: 'fate-panel' }, [diceWrap, numOut, hint, btn]);
  }

  function face(n) {
    const translate = {
      1: 'translateZ(70px)',
      2: 'rotateY(90deg) translateZ(70px)',
      3: 'rotateY(180deg) translateZ(70px)',
      4: 'rotateY(-90deg) translateZ(70px)',
      5: 'rotateX(90deg) translateZ(70px)',
      6: 'rotateX(-90deg) translateZ(70px)'
    }[n];
    const dots = buildDots(n);
    return el('div', { class: 'dice-face', style: { transform: translate } }, dots);
  }

  function buildDots(n) {
    const map = {
      1: [[50, 50]],
      2: [[25, 25], [75, 75]],
      3: [[25, 25], [50, 50], [75, 75]],
      4: [[25, 25], [75, 25], [25, 75], [75, 75]],
      5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
      6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
    }[n];
    return map.map(([x, y]) => el('span', { class: 'dice-dot', style: { left: x + '%', top: y + '%' } }));
  }

  function pickComment(n) {
    return [
      '✦ 一点 …… 犹豫了一下',
      '✦ 两点 · 刚刚好',
      '✧ 三点 · 有选择',
      '✦ 四点 · 稳妥',
      '✦ 五点 · 有分量',
      '★ 六点 · 运气不错'
    ][n - 1];
  }

  /* ---------- 转盘 ---------- */
  function wheelView() {
    const canvas = el('canvas', { class: 'wheel-canvas' });
    const stage = el('div', { class: 'wheel-stage' }, [
      canvas,
      el('div', { class: 'wheel-pointer' })
    ]);
    const result = el('div', { class: 'wheel-result', text: '—' });
    const hint = el('div', { class: 'fate-hint', text: '轻点转盘开始' });
    const spinBtn = el('button', { class: 'btn primary block fate-btn', text: '转 · 转 · 转' });

    const countText = el('span', { class: 'small muted' });
    const meta = el('div', { class: 'wheel-meta' }, [
      countText,
      el('button', { class: 'btn sm', onclick: openEditor }, ['编辑选项'])
    ]);

    let rot = 0;          // 累计旋转角度（度）
    let spinning = false;

    /** 按当前 slices 重画转盘，并把角度归零 */
    function reset() {
      drawWheel(canvas, slices);
      rot = 0;
      canvas.style.transition = 'none';
      canvas.style.transform = 'rotate(0deg)';
      void canvas.offsetWidth;          // 强制回流，让下一次 transition 正常生效
      canvas.style.transition = '';
      result.textContent = '—';
      hint.textContent = '轻点转盘开始';
      countText.textContent = `${slices.length} 个选项`;
    }

    async function spin() {
      if (spinning) return;
      if (slices.length < SLICE_MIN) return toast('至少要有 2 个选项');
      spinning = true;
      result.textContent = '—';
      hint.textContent = '…';

      const n = slices.length;
      const stepDeg = 360 / n;
      const idx = rndInt(0, n - 1);                       // 先定结果，再让指针停在它上面
      const target = (360 - (idx + 0.5) * stepDeg) % 360; // 该扇区中心转到正上方所需角度
      const cur = ((rot % 360) + 360) % 360;
      let delta = target - cur;
      if (delta < 0) delta += 360;
      rot += 360 * 6 + delta;                             // 多转 6 圈增加手感

      canvas.style.transition = 'transform 4.2s cubic-bezier(.12,.72,.06,1)';
      canvas.style.transform = `rotate(${rot}deg)`;

      await wait(4300);
      spinning = false;
      result.textContent = slices[idx];
      hint.textContent = '就它了 · 转已停稳';
    }

    stage.addEventListener('click', spin);
    spinBtn.addEventListener('click', spin);

    /* 编辑选项 */
    function openEditor() {
      const draft = slices.slice();
      const listBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

      function repaint() {
        listBox.innerHTML = '';
        draft.forEach((s, i) => {
          const input = el('input', { class: 'input', value: s, maxlength: '14', placeholder: '选项内容' });
          input.addEventListener('input', () => { draft[i] = input.value; });
          listBox.appendChild(el('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, [
            input,
            el('button', {
              class: 'tb-btn', title: '删除',
              onclick: () => {
                if (draft.length <= SLICE_MIN) return toast('至少要留 2 个');
                draft.splice(i, 1);
                repaint();
              }
            }, [iconImg('IC-CRD-007')])
          ]));
        });
      }
      repaint();

      const addBtn = el('button', {
        class: 'btn sm block', style: { marginTop: '10px' },
        onclick: () => {
          if (draft.length >= SLICE_MAX) return toast(`最多 ${SLICE_MAX} 个`);
          draft.push('');
          repaint();
          listBox.lastChild?.querySelector('input')?.focus();
        }
      }, ['＋ 添加选项']);

      const ctl = sheet({
        title: '转盘选项',
        node: el('div', { style: { padding: '4px 0 12px' } }, [listBox, addBtn]),
        actions: [{
          label: '保存并重画', icon: 'IC-MIO-021',
          onSelect: async () => {
            const clean = draft.map((s) => String(s).trim()).filter(Boolean).slice(0, SLICE_MAX);
            if (clean.length < SLICE_MIN) return toast('至少要有 2 个非空选项');
            slices = clean;
            await kvSet('fateSlices', slices);
            ctl.close();
            reset();
            toast('已更新转盘');
          }
        }]
      });
      void ctl;
    }

    reset();
    return el('div', { class: 'wheel-wrap' }, [stage, result, hint, spinBtn, meta]);
  }

  /** 把选项画成一圈扇区：白底白线，文字沿半径朝外 */
  function drawWheel(canvas, items) {
    const size = WHEEL_SIZE;
    canvas.width = size * WHEEL_DPR;
    canvas.height = size * WHEEL_DPR;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(WHEEL_DPR, 0, 0, WHEEL_DPR, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 3;
    const n = items.length;
    const step = (Math.PI * 2) / n;
    const top = -Math.PI / 2;            // canvas 的 0 度在右侧，正上方是 -90 度

    for (let i = 0; i < n; i++) {
      const a0 = top + i * step;
      const a1 = a0 + step;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* 文字：左侧半圈的扇区翻转 180 度，避免倒着读 */
    const fs = n <= 4 ? 15 : n <= 6 ? 13.5 : n <= 8 ? 12.5 : 11.5;
    for (let i = 0; i < n; i++) {
      const mid = top + i * step + step / 2;
      const flip = Math.cos(mid) < 0;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(flip ? mid + Math.PI : mid);
      ctx.textBaseline = 'middle';
      ctx.textAlign = flip ? 'left' : 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${fs}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

      let label = String(items[i] || '');
      const maxW = r - 44;
      if (ctx.measureText(label).width > maxW) {
        while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1);
        label += '…';
      }
      ctx.fillText(label, flip ? -(r - 14) : (r - 14), 0);
      ctx.restore();
    }

    /* 中心圆点 */
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,25,.10)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = WHEEL_COLORS[0];
    ctx.fill();
  }

  render();
}
