/* 字卡传信 · 启动入口 */

import { openDB } from './store.js';
import { loadState, applySkin } from './state.js';
import { loadIcons } from './icons.js';
import { register, setNotFound, start, go } from './router.js';
import { startMailbox } from './letters.js';
import { startMomentsAI } from './momentsAI.js';
import { startXhsAI } from './xhsdata.js';
import { startAnnivAI } from './annivdata.js';
import { toast } from './ui.js';

import pageHome from './pages/home.js';
import pageChat from './pages/chat.js';
import pageMailbox from './pages/mailbox.js';
import pageCards from './pages/cards.js';
import pageRole from './pages/role.js';
import pageRoleBasic from './pages/roleBasic.js';
import pageRoleReply from './pages/roleReply.js';
import pageRoleAsk from './pages/roleAsk.js';
import pageRoleMoments from './pages/roleMoments.js';
import pageRoleMailbox from './pages/roleMailbox.js';
import pageRoleCall from './pages/roleCall.js';
import pageRoleTraits from './pages/roleTraits.js';
import pageMoments from './pages/moments.js';
import pageDivine from './pages/divine.js';
import pageMe from './pages/me.js';
import pageSkin from './pages/skin.js';
import pageData from './pages/data.js';
import pageIcons from './pages/icons.js';
import pageAbout from './pages/about.js';
import pageFate from './pages/fate.js';
import pageLetter from './pages/letter.js';
import pageCompose from './pages/compose.js';
import pageMemo from './pages/memo.js';
import pageQuiz from './pages/quiz.js';
import pageQuizFill from './pages/quizfill.js';
import pageMusic from './pages/music.js';
import pagePeriod from './pages/period.js';
import pageLedger from './pages/ledger.js';
import { pageLedgerStats } from './pages/ledger.js';
import pagePomodoro from './pages/pomodoro.js';
import pageWatch from './pages/watch.js';
import pageBooks from './pages/books.js';
import pageFavorites from './pages/favorites.js';
import pageAlbum from './pages/album.js';
import pageXhs from './pages/xhs.js';
import pageShop from './pages/shop.js';
import pagePdd from './pages/pdd.js';
import pageTong from './pages/tong.js';
import pageEcho from './pages/echo.js';
import pageGames from './pages/games.js';
import pageAnniversary from './pages/anniversary.js';
import pageInspiration from './pages/inspiration.js';
import pageAvatarLib from './pages/avatarLib.js';
import { startNicknameAI } from './nicknameAI.js';
import { startGraffitiAI } from './graffiti.js';

async function boot() {
  try {
    await openDB();
  } catch (err) {
    document.getElementById('view').innerHTML =
      `<div class="empty"><div class="e-h">无法打开本地数据库</div><div class="e-p">${err.message}<br>请关闭本站的其它标签页后刷新重试。</div></div>`;
    return;
  }

  await loadState();
  try { await loadIcons(); } catch (e) { console.warn('图标库加载失败', e); }
  await applySkin();

  register({
    '/': pageHome,
    '/chat': pageChat,
    '/mailbox': pageMailbox,
    '/cards': pageCards,
    '/role': pageRole,
    '/moments': pageMoments,
    '/divine': pageDivine,
    '/me': pageMe,
    '/skin': pageSkin,
    '/data': pageData,
    '/icons': pageIcons,
    '/about': pageAbout,
    '/fate': pageFate,
    '/mail': pageLetter,
    '/compose': pageCompose,
    '/memo': pageMemo,
    '/quiz': pageQuiz,
    '/quizfill': pageQuizFill,
    '/music': pageMusic,
    '/period': pagePeriod,
    '/ledger': pageLedger,
    '/ledger-stats': pageLedgerStats,
    '/pomodoro': pagePomodoro,
    '/watch': pageWatch,
    '/books': pageBooks,
    '/favorites': pageFavorites,
    '/album': pageAlbum,
    '/xhs': pageXhs,
    '/shop': pageShop,
    '/pdd': pagePdd,
    '/games': pageGames,
    '/tong': pageTong,
    '/echo': pageEcho,
    '/anniversary': pageAnniversary,
    '/inspiration': pageInspiration,
    '/avatarLib': pageAvatarLib,
    '/role/basic': pageRoleBasic,
    '/role/reply': pageRoleReply,
    '/role/moments': pageRoleMoments,
    '/role/mailbox': pageRoleMailbox,
    '/role/call': pageRoleCall,
    '/role/traits': pageRoleTraits,
    '/role/ask': pageRoleAsk
  });
  setNotFound((view) => {
    view.innerHTML = '<div class="empty"><div class="e-h">页面不存在</div></div>';
  });

  start();
  startMailbox();
  startMomentsAI();
  startXhsAI();
  startAnnivAI();
  startNicknameAI();
  startGraffitiAI();
  maybeNotice();
}

/** 首次进入的开屏声明（可在「我的 → 关于」里重新查看） */
async function maybeNotice() {
  const { state } = await import('./state.js');
  const VER = 'v1';
  if (state.settings.noticeVersion === VER) return;
  const { showNotice } = await import('./pages/about.js');
  showNotice([{
    label: '我已了解，开始使用',
    icon: 'IC-MIO-003',
    onSelect: async () => {
      const { state: st, saveSettings } = await import('./state.js');
      st.settings.noticeVersion = VER;
      await saveSettings();
    }
  }]);
}

/** 注册 Service Worker，让站点可离线打开、可安装到桌面 */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker 注册失败', e));
  });
}

boot();
registerSW();
