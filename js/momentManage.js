/* 朋友圈 · 专属字卡与「朋友」
   右上角按钮打开：添加只用在朋友圈里的梦角字卡，也可以添加朋友。
   朋友只用这些字卡回复 TA 发的朋友圈。 */

import { el, uid, openFile, compressImage } from './util.js';
import { iconImg } from './icons.js';
import { all, put, del } from './store.js';
import { saveMedia, mediaURL } from './media.js';
import { sheet, confirmBox, toast } from './ui.js';

export async function openMomentsManage(onChange = () => {}) {
  const node = el('div', { class: 'mm' });
  sheet({ title: '朋友圈字卡与朋友', node });
  await render();

  async function render() {
    node.innerHTML = '';
    const [cards, friends] = await Promise.all([all('momentCards'), all('friends')]);
    cards.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    friends.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    /* ---------- 朋友圈字卡 ---------- */
    node.appendChild(el('div', { class: 'mm-head' }, [
      el('b', { text: '朋友圈字卡' }),
      el('span', { text: cards.length ? `${cards.length} 张 · 只用在朋友圈` : '只用在朋友圈' })
    ]));
    node.appendChild(el('div', { class: 'hint', text: 'TA 发动态、回复评论和朋友留言时，会优先从这些句子里抽。' }));

    const input = el('input', { class: 'input', placeholder: '写一句 TA 会在朋友圈说的话…' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCard(); });
    node.appendChild(el('div', { class: 'row', style: { gap: '8px', margin: '10px 0' } }, [
      input,
      el('button', { class: 'btn sm primary', onclick: () => addCard() }, ['添加'])
    ]));

    const cardList = el('div', { class: 'mm-list' });
    if (!cards.length) {
      cardList.appendChild(el('div', { class: 'mm-empty', text: '还没有朋友圈字卡，先加几句吧' }));
    } else {
      cards.forEach((c) => cardList.appendChild(cardRow(c)));
    }
    node.appendChild(cardList);

    /* ---------- 朋友 ---------- */
    node.appendChild(el('div', { class: 'mm-head', style: { marginTop: '18px' } }, [
      el('b', { text: '朋友' }),
      el('span', { text: friends.length ? `${friends.length} 位` : '只会回复他的朋友圈' })
    ]));
    node.appendChild(el('div', { class: 'hint', text: '朋友会在他发朋友圈后，用上面的字卡留一两句话；不会回复你的动态。' }));

    let avatarId = null;
    const nameInput = el('input', { class: 'input', placeholder: '朋友的名字' });
    const avatarBtn = el('button', { class: 'btn sm', onclick: pickAvatar }, ['选头像']);
    node.appendChild(el('div', { class: 'row', style: { gap: '8px', margin: '10px 0' } }, [
      nameInput,
      avatarBtn,
      el('button', { class: 'btn sm primary', onclick: () => addFriend() }, ['添加'])
    ]));

    const friendList = el('div', { class: 'mm-list' });
    if (!friends.length) {
      friendList.appendChild(el('div', { class: 'mm-empty', text: '还没有朋友，加了之后朋友圈会热闹一点' }));
    } else {
      friends.forEach((f) => friendList.appendChild(friendRow(f)));
    }
    node.appendChild(friendList);

    async function pickAvatar() {
      const file = await openFile({ accept: 'image/*' });
      if (!file) return;
      const { blob, w, h } = await compressImage(file, 256, 0.9);
      avatarId = await saveMedia(blob, { type: 'image', w, h, source: 'ta', name: '朋友头像' });
      avatarBtn.textContent = '已选头像';
    }

    async function addCard() {
      const text = input.value.trim();
      if (!text) return toast('先写一句');
      await put('momentCards', {
        id: uid(), content: text, kind: 'text', enabled: true,
        weight: 1, count: 0, ts: Date.now()
      });
      await render();
      onChange();
      toast('已添加');
    }

    async function addFriend() {
      const name = nameInput.value.trim();
      if (!name) return toast('先给朋友起个名字');
      await put('friends', {
        id: uid(), name, avatarId, enabled: true, ts: Date.now()
      });
      await render();
      onChange();
      toast('已添加朋友');
    }
  }

  function cardRow(c) {
    return el('div', { class: 'mm-row' }, [
      el('div', { class: 'mm-main' }, [
        el('div', { class: 'mm-name', text: c.content }),
        el('div', { class: 'mm-sub', text: c.count ? `用过 ${c.count} 次` : '还没用过' })
      ]),
      el('button', {
        class: 'mn-ico-btn', type: 'button', title: '删除',
        onclick: async () => {
          const yes = await confirmBox({ title: '删除字卡', text: '删掉后 TA 就不会再用这句话了。', okText: '删除', danger: true });
          if (!yes) return;
          await del('momentCards', c.id);
          await render();
          onChange();
        }
      }, [iconImg('IC-CRD-007')])
    ]);
  }

  function friendRow(f) {
    const av = el('div', { class: 'mm-av', text: f.name.slice(0, 1) });
    if (f.avatarId) {
      mediaURL(f.avatarId).then((u) => {
        if (!u) return;
        av.textContent = '';
        av.appendChild(el('img', { src: u, alt: '' }));
      });
    }
    return el('div', { class: 'mm-row' }, [
      av,
      el('div', { class: 'mm-main' }, [
        el('div', { class: 'mm-name', text: f.name }),
        el('div', { class: 'mm-sub', text: '只回复他的朋友圈' })
      ]),
      el('button', {
        class: 'mn-ico-btn', type: 'button', title: '删除',
        onclick: async () => {
          const yes = await confirmBox({ title: '删除朋友', text: `确定不再让「${f.name}」出现在朋友圈吗？`, okText: '删除', danger: true });
          if (!yes) return;
          await del('friends', f.id);
          await render();
          onChange();
        }
      }, [iconImg('IC-CRD-007')])
    ]);
  }
}
