/* 关于 · 声明 / 安全边界 / 版本 */

import { el } from '../util.js';
import { iconImg } from '../icons.js';
import { normalPage } from '../shell.js';
import { go } from '../router.js';
import { sheet } from '../ui.js';

const APP_VERSION = 'v1.0';

export default async function pageAbout(view) {
  normalPage('me', { back: true, title: '关于', sub: '字卡传信' });
  render(view);
}

/** 开屏声明内容（关于页与首屏共用） */
export function noticeNode() {
  return el('div', {}, [
    el('p', { class: 'small muted', text: '本站是纯代码随机触发的「字卡传信」，没有 AI，也不联网上传任何数据。所有 TA 的回复都由你导入的字卡随机拼接而成，纯属虚构娱乐。' }),
    el('p', { class: 'small muted', text: '你的聊天、字卡、图片、语音全部只保存在这台设备的浏览器里。清除浏览器数据、换设备或系统回收存储都会导致数据丢失——请定期在「我的 → 数据」里导出备份。' }),
    el('p', { class: 'small', style: { color: 'var(--warn)' }, text: '本站面向成年人。虚拟互动不能替代真实的人际交往与专业帮助；如遇情绪困扰请向亲友或正规机构求助。' })
  ]);
}

/** 打开使用声明弹层 */
export function showNotice(actions = [{ label: '知道了' }]) {
  return sheet({ title: '使用前请先了解', node: noticeNode(), actions });
}

function render(view) {
  const wrap = el('div', { class: 'page' });

  /* ---- 顶部 ---- */
  wrap.appendChild(el('div', { class: 'hero center', style: { paddingBottom: '0' } }, [
    el('img', {
      src: 'assets/icons/misc/IC-MIO-006.svg',
      alt: '字卡传信',
      style: { width: '66px', height: '66px', borderRadius: '16px', margin: '0 auto 10px' }
    }),
    el('div', { style: { fontSize: '19px', fontWeight: '700' }, text: '字卡传信' }),
    el('div', { class: 'sub', text: `${APP_VERSION} · 纯本地 · 不联网 · 可整包备份` })
  ]));

  /* ---- 这是什么 ---- */
  wrap.appendChild(section('这是什么', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px' } }, [
      iconImg('IC-MIO-007'),
      el('div', { class: 'small muted', text: '一个 1 对 1 的「字卡传信」网站。你的 TA 不会自由说话，只从你导入的字卡库里随机拼接碎片来回复你——是写字卡的人，而不是被写好的角色。' })
    ])
  ])));

  /* ---- 你的数据在哪 ---- */
  wrap.appendChild(section('你的数据存在哪里', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px', marginBottom: '10px' } }, [
      iconImg('IC-MIO-019'),
      el('div', { class: 'small muted', text: '没有服务器、没有账号、没有联网上传。聊天、字卡、图片、语音、装扮与替换的图标，全部存在这台设备浏览器的 IndexedDB 里，不上传、不共享，也无需登录。' })
    ]),
    el('div', { class: 'row', style: { gap: '9px' } }, [
      iconImg('IC-MIO-008'),
      el('div', { class: 'small muted', text: '代价是：清除浏览器数据、换设备或系统回收存储都会让数据永久丢失，请定期在「数据」里导出备份。' })
    ])
  ])));

  /* ---- 图标与素材 ---- */
  wrap.appendChild(section('图标与素材', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px' } }, [
      iconImg('IC-MIO-015'),
      el('div', { class: 'small muted', text: '全站禁止用 Emoji 充当图标。所有图标集中在一个素材库里，按「IC-<分类>-<序号>」统一编号并写好说明，说到编号即可找到，也可以替换成自己的图片随时还原。' })
    ]),
    el('div', { class: 'row', style: { marginTop: '10px' } }, [
      el('button', { class: 'btn sm', onclick: () => go('/icons') }, [iconImg('IC-MIO-015'), '打开图标素材库'])
    ])
  ])));

  /* ---- 使用边界 ---- */
  wrap.appendChild(section('使用边界', el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { gap: '9px' } }, [
      iconImg('IC-MIO-007'),
      el('div', { class: 'small muted', style: { color: 'var(--txt-dim)' }, text: '本站面向成年人，纯属虚构娱乐。虚拟互动不能替代真实的人际交往与专业帮助；如遇情绪困扰，请向亲友或正规机构求助。' })
    ])
  ])));

  /* ---- 快捷入口 ---- */
  wrap.appendChild(section('更多', el('div', { class: 'card flush' }, [
    row('IC-MIO-007', '重新查看使用声明', '开屏时提示过的三条声明', () => showNotice()),
    row('IC-MIO-015', '图标素材库', '浏览 / 替换全站图标', () => go('/icons')),
    row('IC-MIO-009', '数据备份', '整包导出与导入', () => go('/data'))
  ])));

  wrap.appendChild(el('div', { class: 'center tiny', style: { color: 'var(--txt-mute)', padding: '4px 0 20px' }, text: `${APP_VERSION} · 纯静态部署，无后端` }));

  view.appendChild(wrap);
}

/* ---------------- 小部件 ---------------- */
function section(title, node) {
  return el('div', { class: 'sec' }, [
    el('div', { class: 'sec-h' }, [el('div', { class: 'h', text: title })]),
    node
  ]);
}

function row(icon, title, sub, onclick) {
  return el('div', { class: 'list-item', onclick }, [
    iconImg(icon),
    el('div', { class: 'li-main' }, [
      el('div', { class: 'li-title', text: title }),
      sub ? el('div', { class: 'li-sub', text: sub }) : null
    ]),
    iconImg('IC-MIO-004', 'chev')
  ]);
}
