/* 通话参数 · 接听 / 忙线 / 拒接 / 挂断 / 主动来电 */

import { el } from '../util.js';
import { fullPage } from '../shell.js';
import { state } from '../state.js';
import { setupRoleUi, section } from './roleParts.js';

export default async function pageRoleCall(view) {
  fullPage({ back: true, title: '通话参数' });
  const p = state.role.params;
  const { rowPct } = setupRoleUi(p);

  const wrap = el('div', { class: 'page' });

  wrap.appendChild(section('聊天里的通话请求', el('div', { class: 'set-card' }, [
    rowPct('聊天里发起通话请求概率', 'TA 会在聊天里说"给你打个电话"并弹出来电界面', 'callPct', p.callPct),
    rowPct('主动来电概率', 'TA 主动打给你（不通过聊天消息，直接弹来电界面）', 'callProactivePct', p.callProactivePct)
  ])));

  wrap.appendChild(section('我拨出给 TA', el('div', { class: 'set-card' }, [
    rowPct('TA 接听概率', '默认 82%。低于此值时依次尝试忙线 / 拒接 / 未接', 'callAnswerPct', p.callAnswerPct),
    rowPct('TA 忙线概率', '显示"对方忙线中"（接听未命中后）', 'callBusyPct', p.callBusyPct),
    rowPct('TA 拒接概率', '显示"对方已拒接"（忙线未命中后）', 'callRejectPct', p.callRejectPct)
  ])));

  wrap.appendChild(section('通话中', el('div', { class: 'set-card' }, [
    rowPct('TA 提前挂断概率', '每秒判定一次', 'callHangupPct', p.callHangupPct)
  ])));

  view.appendChild(wrap);
}
