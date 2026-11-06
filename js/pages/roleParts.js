/* 角色参数页面 · 共享控件构造
   被 role.js 首页和 roleReply.js / roleMoments.js 等子页面共同引用。
   每个子页面调一次 setupRoleUi(p) 拿到 { rowPct, rowNum, rowToggle, rowSeg, commit, section, ... } */

import { el } from '../util.js';
import { state, saveRole } from '../state.js';

/** min→max 配对表，用于交叉校验（下限不能超过上限）
    所有 role 子页共享这一份 */
export const PAIR_MAX = {
  minCount: 'maxCount',
  minJoin: 'maxJoin',
  proactiveMinCount: 'proactiveMaxCount',
  proactiveIntervalMin: 'proactiveIntervalMax',
  /* delayMin（秒）与 delayMax（分钟）单位不同，不参与交叉校验，由 delayFor 内部取大 */
  replyMinCards: 'replyMaxCards',
  proactiveMinCards: 'proactiveMaxCards',
  dailyReplyMin: 'dailyReplyMax',
  proactivePctMin: 'proactivePctMax',
  proactiveTriggerPctMin: 'proactiveTriggerPctMax',
  taAskPctMin: 'taAskPctMax',
  /* 头像昵称库 · 四种换改的概率区间 */
  taRenamePctMin: 'taRenamePctMax',
  taChangeAvatarPctMin: 'taChangeAvatarPctMax',
  taSelfNickPctMin: 'taSelfNickPctMax',
  taSelfAvatarPctMin: 'taSelfAvatarPctMax',
  typingMinMin: 'typingMaxMin',
  letterReplyPctMin: 'letterReplyPctMax',
  letterReplyDelayMin: 'letterReplyDelayMax',
  taPostDailyMin: 'taPostDailyMax',
  taPostGapMin: 'taPostGapMax',
  taPostCardMin: 'taPostCardMax',
  commentCardMin: 'commentCardMax',
  commentDelayMinSec: 'commentDelayMaxMin',
  replyDelayMinSec: 'replyDelayMaxMin',
  taGraffitiGapMin: 'taGraffitiGapMax'
};
const PAIR_MIN = {};
for (const [lo, hi] of Object.entries(PAIR_MAX)) PAIR_MIN[hi] = lo;

/** 为某个 params 对象创建一套控件构造函数。
    每个子页面单独调一次，各自维护 ui 映射表。 */
export function setupRoleUi(p) {
  const ui = {};   // key → { sync(v) }

  /** 仅把数值写入 params 并保存，不做跨对校验 —— 用于「输入中」的瞬时提交 */
  function writeOnly(key, v) {
    p[key] = v;
    saveRole();
    return v;
  }

  /** 完整提交：写入 + 跨对校验 —— 用于 blur 时最终落盘 */
  function commit(key, v) {
    const loKey = PAIR_MIN[key];
    if (loKey && v < p[loKey]) v = p[loKey];
    const hiKey = PAIR_MAX[key];
    if (hiKey && v > p[hiKey]) { p[hiKey] = v; ui[hiKey]?.sync(p[hiKey]); }
    p[key] = v;
    saveRole();
    return v;
  }

  function rowMain(name, desc) {
    return el('div', { class: 'set-main' }, [
      el('div', { class: 'set-t', text: name }),
      desc ? el('div', { class: 'set-s', text: desc }) : null
    ]);
  }

  /** 概率行：滑杆 + 右侧数字输入框（两者双向联动） */
  function rowPct(name, desc, key, value) {
    const range = el('input', { class: 'set-range', type: 'range', min: '0', max: '100', step: '1' });
    range.value = String(value);
    const num = el('input', {
      class: 'set-num set-pct-num', type: 'number', inputmode: 'numeric',
      min: '0', max: '100', step: '1', value: String(value)
    });
    num.style.width = '54px';
    num.addEventListener('focus', () => num.select());
    const sync = (v) => {
      range.value = String(v);
      num.value = String(v);
    };
    let fromSlider = false, fromNum = false;
    range.addEventListener('input', () => {
      const v = Number(range.value);
      fromSlider = true; sync(v); writeOnly(key, v);
    });
    range.addEventListener('change', () => { commit(key, Number(range.value)); });
    num.addEventListener('input', () => {
      const raw = num.value.trim();
      if (raw === '') return;
      let v = Number(raw);
      if (!Number.isFinite(v)) return;
      v = Math.min(100, Math.max(0, Math.round(v)));
      fromNum = true; sync(v); writeOnly(key, v);
    });
    num.addEventListener('blur', () => { sync(commit(key, p[key])); });
    ui[key] = { sync };
    return el('div', { class: 'set-row' }, [
      rowMain(name, desc),
      el('div', { class: 'set-ctl' }, [range, num, el('span', { class: 'set-val set-pct-suf', text: '%' })])
    ]);
  }

  /** 数量/时长行：右侧圆角数字框 + 单位
      输入期间只保存当前值（不做跨对校验），失焦时再 cross-validate。
      焦点进入时自动全选，方便直接打新数字替换旧值。 */
  function rowNum(name, desc, key, value, min, max, unit = '') {
    const input = el('input', { class: 'set-num', type: 'number', inputmode: 'numeric', min: String(min), max: String(max) });
    input.value = String(value);
    const sync = (v) => { input.value = String(v); };
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      if (raw === '') { p[key] = min; saveRole(); return; }
      let v = Number(raw);
      if (!Number.isFinite(v)) return;
      v = Math.min(max, Math.max(min, Math.round(v)));
      writeOnly(key, v);
    });
    input.addEventListener('blur', () => { sync(commit(key, p[key])); });
    ui[key] = { sync };
    return el('div', { class: 'set-row' }, [
      rowMain(name, desc),
      el('div', { class: 'set-ctl' }, [input, unit ? el('span', { class: 'set-unit', text: unit }) : null])
    ]);
  }

  /** 开关行：右侧拨动开关 */
  function rowToggle(name, desc, key, value) {
    const sw = el('button', { class: 'sw' + (value ? ' on' : '') });
    sw.addEventListener('click', () => {
      sw.classList.toggle('on');
      p[key] = sw.classList.contains('on');
      saveRole();
    });
    return el('div', { class: 'set-row' }, [rowMain(name, desc), el('div', { class: 'set-ctl' }, [sw])]);
  }

  /** 分段选择行：右侧一排 chip 按钮 */
  function rowSeg(name, desc, key, value, options) {
    const chips = options.map(([v, label]) =>
      el('button', { class: 'chip' + (v === value ? ' on' : ''), 'data-v': v, text: label })
    );
    const sync = (v) => {
      chips.forEach((c) => c.classList.toggle('on', c.dataset.v === v));
    };
    chips.forEach((c) => c.addEventListener('click', () => {
      p[key] = c.dataset.v;
      saveRole();
      sync(p[key]);
    }));
    ui[key] = { sync };
    return el('div', { class: 'set-row' }, [rowMain(name, desc), el('div', { class: 'set-ctl seg-row' }, chips)]);
  }

  /** 拼接符号库行：默认收起只占一行，点开是紧凑符号网格 */
  function joinSepRow(name, desc) {
    const list = p.joinSepList || [];
    const count = () => list.filter((s) => s.enabled).length;

    const stat = el('span', { class: 'join-sep-stat', text: `已启用 ${count()} / ${list.length}` });
    const grid = el('div', { class: 'join-sep-grid' }, list.map((s) => {
      const face = s.c === '\n' ? '↵' : s.c === ' ' ? '␣' : s.c;
      const btn = el('button', { class: 'join-sep-chip' + (s.enabled ? ' on' : ''), type: 'button' }, [
        el('b', { text: face }),
        el('span', { text: s.label })
      ]);
      btn.addEventListener('click', () => {
        s.enabled = !s.enabled;
        btn.classList.toggle('on', s.enabled);
        stat.textContent = `已启用 ${count()} / ${list.length}`;
        saveRole();
      });
      return btn;
    }));

    const head = el('div', { class: 'set-row join-sep-head' }, [
      rowMain(name, desc),
      el('div', { class: 'set-ctl' }, [stat, el('span', { class: 'join-sep-arrow', text: '›' })])
    ]);
    head.addEventListener('click', () => wrap.classList.toggle('open'));

    const wrap = el('div', { class: 'join-sep-wrap' }, [
      head,
      el('div', { class: 'join-sep-body' }, [grid])
    ]);
    return wrap;
  }

  return { rowPct, rowNum, rowToggle, rowSeg, joinSepRow, commit, ui };
}

/** 分组区块 */
export function section(title, node) {
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: title })]),
    node
  ]);
}
