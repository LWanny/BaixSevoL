/* 基本资料 · 头像 / 名字 / 签名 / 状态 / 相识日期 */

import { el, compressImage, openFile } from '../util.js';
import { fullPage } from '../shell.js';
import { state, saveRole, roleStatusMeta } from '../state.js';
import { saveMedia, mediaURL } from '../media.js';
import { toast } from '../ui.js';

export default async function pageRoleBasic(view) {
  fullPage({ back: true, title: '基本资料' });
  const r = state.role;
  const wrap = el('div', { class: 'page' });

  const avBox = el('div', { class: 'avatar lg', style: { margin: '12px auto' } });
  async function paintAvatar() {
    avBox.innerHTML = '';
    if (r.avatarId) {
      const u = await mediaURL(r.avatarId);
      if (u) avBox.appendChild(el('img', { src: u }));
    } else {
      avBox.appendChild(document.createTextNode((r.name || 'TA').slice(0, 1)));
    }
  }
  await paintAvatar();

  wrap.appendChild(el('div', { class: 'card', style: { padding: '16px' } }, [
    avBox,
    el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '8px', gap: '8px' } }, [
      el('button', { class: 'btn sm', onclick: pickAvatar }, ['更换头像']),
      r.avatarId ? el('button', { class: 'btn sm', onclick: async () => { r.avatarId = null; await saveRole(); await paintAvatar(); toast('已使用默认头像'); } }, ['还原默认']) : null
    ])
  ]));

  const nameInput = el('input', { class: 'input', value: r.name || '', maxlength: '20' });
  nameInput.addEventListener('input', () => { r.name = nameInput.value; saveRole(); });

  const signInput = el('input', { class: 'input', value: r.signature || '', maxlength: '50' });
  signInput.addEventListener('input', () => { r.signature = signInput.value; saveRole(); });

  const dateInput = el('input', { class: 'input', type: 'date', value: new Date(r.metAt || Date.now()).toISOString().slice(0, 10) });
  dateInput.addEventListener('change', () => {
    const d = new Date(dateInput.value);
    if (!isNaN(d)) { r.metAt = d.getTime(); saveRole(); toast('相识日期已更新'); }
  });

  const st = roleStatusMeta(r.status);

  wrap.appendChild(el('div', { class: 'set-card' }, [
    field('名字', nameInput),
    field('签名', signInput),
    el('div', { class: 'set-row' }, [
      el('div', { class: 'set-main' }, [
        el('div', { class: 'set-t', text: '实时状态' }),
        el('div', { class: 'set-s', text: '由 TA 随机切换' })
      ]),
      el('div', { class: 'set-ctl' }, [
        el('div', { class: 'small', style: { display: 'flex', alignItems: 'center' } }, [
          el('span', { class: 'on-dot ' + st.key }),
          el('span', { text: st.label })
        ])
      ])
    ]),
    el('div', { class: 'set-row' }, [
      el('div', { class: 'set-main' }, [
        el('div', { class: 'set-t', text: '相识日期' }),
        el('div', { class: 'set-s', text: '首页会显示相识天数' })
      ]),
      el('div', { class: 'set-ctl' }, [dateInput])
    ])
  ]));

  view.appendChild(wrap);

  async function pickAvatar() {
    const f = await openFile({ accept: 'image/*' });
    if (!f) return;
    const { blob, w, h } = await compressImage(f, 512, 0.9);
    r.avatarId = await saveMedia(blob, { type: 'image', w, h, source: 'avatar' });
    await saveRole();
    await paintAvatar();
    toast('头像已更新');
  }

  function field(label, input) {
    return el('div', { class: 'set-row' }, [
      el('div', { class: 'set-main' }, [el('div', { class: 'set-t', text: label })]),
      el('div', { class: 'set-ctl', style: { flex: 1 } }, [input])
    ]);
  }
}
