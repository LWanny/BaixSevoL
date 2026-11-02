/* 字卡传信 · 全局状态（角色 / 设置 / 装扮） */

import { kvGet, kvSet } from './store.js';
import { mediaURL } from './media.js';

export const DEFAULT_PARAMS = {
  /* ---- 被动回复（TA 回你） ---- */
  minCount: 1,          // 回复字卡条数·最少
  maxCount: 1,          // 回复字卡条数·最多
  delayMin: 3,          // 回复速度·最短（秒）
  delayMax: 30,         // 回复速度·最长（秒）
  ignorePct: 10,        // 已读不回概率 %

  /* ---- 字卡拼接 ---- */
  joinPct: 50,          // 拼接概率 %
  minJoin: 1,           // 最少拼接卡数
  maxJoin: 3,           // 最多拼接卡数
  pureRandom: false,    // 全部随机模式（抽卡不看权重）

  /* ---- 拼接符号 ---- */
  joinRandomSep: false,      // 开启后，每两张字卡之间随机抽一个符号连接；关闭时固定用空格
  joinSepList: [
    { k: 'space',    c: ' ',   enabled: true,  label: '空格' },
    { k: 'comma',    c: '，',  enabled: true,  label: '逗号' },
    { k: 'period',   c: '。',  enabled: true,  label: '句号' },
    { k: 'excl',     c: '！',  enabled: true,  label: '感叹号' },
    { k: 'q',        c: '？',  enabled: true,  label: '问号' },
    { k: 'ellipsis', c: '……',  enabled: true,  label: '省略号' },
    { k: 'newline',  c: '\n',  enabled: false, label: '换行' }
  ],

  /* ---- 主动发送 ---- */
  proactive: false,               // 主动发送开关
  proactivePct: 100,              // 主动发送概率 %（每个随机时刻突然发来的概率）
  proactiveIntervalMin: 30,       // 主动间隔·最短（分钟）
  proactiveIntervalMax: 30,       // 主动间隔·最长（分钟）
  proactiveMinCount: 1,           // 主动发送字卡条数·最少
  proactiveMaxCount: 1,           // 主动发送字卡条数·最多

  /* ---- TA 的询问（TA 偶尔向我提问） ---- */
  taAskEnabled: false,            // 开关：关闭后 TA 不会向我提问
  taAskPctMin: 0,                 // 触发概率下限 %
  taAskPctMax: 60,                // 触发概率上限 %

  /* ---- 语气与动作 ---- */
  quotePct: 20,         // 引用历史消息概率 %
  recallPct: 5,         // 撤回概率 %
  mixPct: 0,            // 已废弃（保留兼容旧档案）；请改用下面的 5 个独立概率
  patPct: 10,           // 拍一拍触发概率 %
  choicePct: 10,        // 主动发选择题概率 %
  callPct: 5,           // TA 在聊天回复里主动发起通话请求的概率 %
  callHangupPct: 6,     // 通话中 TA 提前挂断的概率 %（每秒判定）
  callAnswerPct: 82,    // 我打给 TA 时，TA 接听概率 %
  callBusyPct: 10,      // 我打给 TA 时，TA 显示忙线的概率 %（接听未命中后）
  callRejectPct: 8,     // 我打给 TA 时，TA 显示拒接的概率 %（忙线未命中后）
  callProactivePct: 2,  // TA 主动打来电（不是通过聊天消息触发）的概率 %

  /* ---- 回复里的附加消息（独立一条，不计入条数上限） ---- */
  stickerPct: 10,       // 表情包消息概率 %（从字卡库的「表情」类里抽）
  imagePct: 5,          // 图片消息概率 %（从 media 表里抽一张已有图片）
  voicePct: 0,          // 语音消息概率 %（从字卡库的「语音」类里抽）

  /* ---- 句尾附加（追加到文字消息末尾，不独立发） ---- */
  emojiPct: 15,         // 在文字消息句尾附加 emoji 的概率 %
  kaomojiPct: 10,       // 在文字消息句尾附加颜文字的概率 %

  /* ---- 撤回补发 ---- */
  recallRepostEnabled: false,   // 撤回后再补发一条新消息
  recallRepostPct: 100,         // 开关开启后，真的补发的概率 %（100 = 必发）

  /* ---- 对方朋友圈 ---- */
  taPostEnabled: true,          // 允许 TA 主动发朋友圈
  taPostPct: 70,                // 每次到点时真的发出来的概率 %
  taPostDailyMin: 0,            // 每天最少发几条
  taPostDailyMax: 3,            // 每天最多发几条
  taPostGapMin: 60,             // 两次发布间隔·最短（分钟）
  taPostGapMax: 240,            // 两次发布间隔·最长（分钟）
  taPostCardMin: 1,             // 一条动态最少用几张字卡
  taPostCardMax: 3,             // 一条动态最多用几张字卡
  taPostImgPct: 30,             // 配图概率 %
  taPostStickerPct: 15,         // 表情包概率 %
  taPostEmojiPct: 30,           // Emoji 概率 %
  taPostKaomojiPct: 20,         // 颜文字概率 %

  /* ---- 互动设置（我发布朋友圈后） ---- */
  likePct: 60,                  // TA 点赞概率 %
  commentPct: 60,               // TA 评论概率 %
  replyBackPct: 50,             // 我回复后 TA 再回复的概率 %
  multiCardPct: 30,             // 一条评论用多个字卡的概率 %
  commentCardMin: 1,            // 一条评论最少字卡数
  commentCardMax: 3,            // 一条评论最多字卡数

  /* ---- 互动时长（朋友圈里 TA 的反应延迟） ---- */
  commentDelayMinSec: 40,      // TA 评论最快（秒）
  commentDelayMaxMin: 10,      // TA 评论最慢（分钟）
  replyDelayMinSec: 20,        // TA 回复最快（秒）
  replyDelayMaxMin: 5,         // TA 回复最慢（分钟）
  likeBackPct: 80,             // 我点赞后 TA 也回赞该条动态的概率 %

  /* ---- 灵感拾取 ---- */
  inspirationEnabled: true,      // 允许 TA 拾取我说过的话并在后续用出来
  inspirationPct: 15,            // 每次可拾取机会的概率 %
  inspirationUsePct: 25,         // TA 生成回复时直接用灵感句子的概率 %

  /* ---- TA 主动换我的昵称 / 头像 ---- */
  taRenameEnabled: true,
  taRenamePct: 30,               // 每次间隔里真的换的概率 %
  taRenameMode: 'ask',           // 'direct' 直接换 / 'ask' 先征求同意
  taRenameGapMin: 30,            // 最短间隔 分钟
  taRenameGapMax: 180,           // 最长间隔 分钟
  taChangeAvatarEnabled: true,
  taChangeAvatarPct: 25,
  taChangeAvatarMode: 'ask',
  taChangeAvatarGapMin: 60,
  taChangeAvatarGapMax: 240,

  /* ---- 涂鸦 ---- */
  taGraffitiEnabled: true,
  taGraffitiPct: 18,             // 每次聊天后概率 %
  taGraffitiGapMin: 20,
  taGraffitiGapMax: 120,

  /* ---- 拼音打字 ---- */
  pinyinEnabled: true,           // 允许 TA 用拼音随机组词（不依赖字卡库）
  pinyinPct: 12,                 // 每次回复里出现一条拼音消息的概率 %

  /* ---- 评论表情 ---- */
  commentEmojiPct: 30,          // 评论里带表情包的概率 %
  momentsPureRandom: false,     // 朋友圈完全随机（不看权重）

  /* ---- 信箱功能优化参数 ---- */
  replyMinCards: 1,        // 单封收到的信件最少包含字卡数量
  replyMaxCards: 1,        // 单封收到的信件最多包含字卡数量
  proactiveMinCards: 1,    // 单封主动信最少包含字卡数量
  proactiveMaxCards: 1,    // 单封主动信最多包含字卡数量
  dailyReplyMin: 0,        // 每天最少写信封数（回复）
  dailyReplyMax: 100,      // 每天最多写信封数（回复）
  dailyProactiveMax: 20,   // TA 每日主动写信上限
  proactivePctMin: 0,      // 主动写信概率下限 %
  proactivePctMax: 100,    // 主动写信概率上限 %
  proactiveTriggerPctMin: 0,   // 触发主动写信的概率下限 %
  proactiveTriggerPctMax: 100, // 触发主动写信的概率上限 %
  typingMinMin: 1,         // 最短写信时间（分钟）
  typingMaxMin: 2,         // 最长写信时间（分钟）

  /* ---- 信箱回信（我寄信后 TA 是否回） ---- */
  letterReplyPctMin: 0,    // 回信概率下限 %（我寄信后 TA 回信的概率）
  letterReplyPctMax: 100,  // 回信概率上限 %
  letterReplyDelayMin: 1,  // 我寄信后，TA 最短过多少分钟才开始写回信
  letterReplyDelayMax: 5,  // 我寄信后，TA 最长过多少分钟才开始写回信

  /* ---- 来信内容附加（写在信纸里的信件内容） ---- */
  letterEmojiEnabled: false,   // 来信正文句尾附加 emoji
  letterEmojiPct: 30,          // emoji 附加概率 %
  letterKaomojiEnabled: false, // 来信正文句尾附加颜文字
  letterKaomojiPct: 20,        // 颜文字附加概率 %
  letterStickerEnabled: false, // 来信夹带一张表情图片（显示在信纸内）
  letterStickerPct: 15         // 表情包附加概率 %
};

export const DEFAULT_ROLE = {
  name: 'TA',
  avatarId: null,
  signature: '',
  status: '在线',
  greet: '在的。',
  metAt: Date.now(),
  chatNicknameMe: null,    // TA 在聊天里给我换的昵称；null 表示用默认
  chatAvatarMeId: null,    // TA 在聊天里给我换的头像；null 表示用默认
  params: { ...DEFAULT_PARAMS }
};

/* 实时状态：由 TA 按权重随机选择，仅保留在线 / 忙碌 / 离线三种 */
export const ROLE_STATUS = [
  { key: 'online',  label: '在线', weight: 6, color: 'var(--ok)' },
  { key: 'busy',    label: '忙碌', weight: 3, color: '#e8a13a' },
  { key: 'offline', label: '离线', weight: 1, color: 'var(--txt-dim)' }
];

export function normalizeRoleStatus(v) {
  if (v === 'busy' || v === '忙碌') return 'busy';
  if (v === 'offline' || v === '离线') return 'offline';
  return 'online';
}

export function roleStatusMeta(v) {
  const key = normalizeRoleStatus(v);
  return ROLE_STATUS.find((s) => s.key === key) || ROLE_STATUS[0];
}

export function pickRoleStatus() {
  const total = ROLE_STATUS.reduce((n, s) => n + s.weight, 0);
  let r = Math.random() * total;
  for (const s of ROLE_STATUS) {
    r -= s.weight;
    if (r < 0) return s;
  }
  return ROLE_STATUS[0];
}

export const DEFAULT_SETTINGS = {
  noticeVersion: '',         // 已确认的开屏声明版本
  backupRemindAt: 0,         // 上次备份提醒时间
  notifyEnabled: false,      // 系统通知
  soundId: null,             // 自定义铃声 mediaId
  bubbleSound: true,         // 页面内提示音
  fontScale: 1,
  seenCardHint: false,
  myName: '我'               // 我的名字：信箱来信抬头与写信署名
};

export const DEFAULT_SKIN = {
  globalBgColor: '#f7f7f6',
  globalBgImageId: null,
  chatWallpaperId: null,
  bubbleMe: 'linear-gradient(135deg,#1c1e22,#3c4048)',
  bubbleMeTxt: '#ffffff',
  bubbleTa: '#ffffff',
  bubbleTaTxt: '#16181c',
  bubbleRadius: 15,
  avatarShape: 'rounded',        // 聊天头像形状：circle 圆形 / rounded 圆角方形
  bubbleCss: '',                 // 自定义气泡 CSS（声明或选择器两种写法）
  /* 图片位置与缩放：50 = 居中，100 = 原始铺满（仅对上传的图生效） */
  globalBgX: 50, globalBgY: 50, globalBgZoom: 100,
  chatWallX: 50, chatWallY: 50, chatWallZoom: 100,
  avatarMeId: null,
  avatarTaId: null
};

/* 首页小组件默认布局（顺序即 order）。
   span=1 表示占宫格一列（手机式应用图标），span=4 表示整行通栏。 */
export const DEFAULT_WIDGETS = {
  home: [
    { id: 'pair',  type: 'pair',  order: 1, span: 4, config: {} },
    { id: 'mood',  type: 'mood',  order: 2, span: 4, config: {} },
    { id: 'mail',  type: 'mailbox', order: 3, span: 4, config: {} },
    { id: 'stat_met',   type: 'stat', order: 4, span: 2, config: { kind: 'met' } },
    { id: 'stat_mood',  type: 'stat', order: 5, span: 2, config: { kind: 'mood' } },
    { id: 'stat_last',  type: 'stat', order: 6, span: 2, config: { kind: 'last' } },
    { id: 'stat_cards', type: 'stat', order: 7, span: 2, config: { kind: 'cards' } },
    { id: 'app_chat',    type: 'app', order: 8,  span: 1, config: { path: '/chat',    label: '消息',     icon: 'IC-NAV-002', badge: 'unread' } },
    { id: 'app_moments', type: 'app', order: 9,  span: 1, config: { path: '/moments', label: '朋友圈',   icon: 'IC-MOM-001' } },
    { id: 'app_divine',  type: 'app', order: 10, span: 1, config: { path: '/divine',  label: '占卜',     icon: 'IC-DIV-001' } },
    { id: 'app_music',   type: 'app', order: 11, span: 1, config: { path: '/music',   label: '音乐',     icon: 'IC-MIO-016' } },
    { id: 'app_quiz',    type: 'app', order: 12, span: 1, config: { path: '/quiz',    label: '问卷',     icon: 'IC-MIO-027' } },
    { id: 'app_memo',    type: 'app', order: 13, span: 1, config: { path: '/memo',    label: '备忘录',   icon: 'IC-MIO-026' } },
    { id: 'app_period',  type: 'app', order: 14, span: 1, config: { path: '/period',  label: '经期',     icon: 'IC-MIO-033' } },
    { id: 'app_ledger',  type: 'app', order: 15, span: 1, config: { path: '/ledger',  label: '记账',     icon: 'IC-MIO-034' } },
    { id: 'app_pomodoro',type: 'app', order: 16, span: 1, config: { path: '/pomodoro', label: '番茄钟',  icon: 'IC-MIO-035' } },
    { id: 'app_watch',   type: 'app', order: 17, span: 1, config: { path: '/watch',   label: '观影',     icon: 'IC-MIO-036' } },
    { id: 'app_books',   type: 'app', order: 18, span: 1, config: { path: '/books',   label: '书架',     icon: 'IC-MIO-037' } },
    { id: 'app_favorites', type: 'app', order: 19, span: 1, config: { path: '/favorites', label: '收藏',   icon: 'IC-MIO-020' } },
    { id: 'app_ta_favorites', type: 'app', order: 19.5, span: 1, config: { path: '/favorites?owner=ta', label: '他的收藏', icon: 'IC-MOD-005' } },
    { id: 'app_album',   type: 'app', order: 20, span: 1, config: { path: '/album',   label: '相册',     icon: 'IC-MIO-015' } },
    { id: 'app_xhs',     type: 'app', order: 20.5, span: 1, config: { path: '/xhs',   label: '小粉书',   icon: 'IC-MOM-005' } },
    { id: 'app_shop',    type: 'app', order: 20.6, span: 1, config: { path: '/shop',  label: '商城',     icon: 'IC-MIO-039' } },
    { id: 'app_games',   type: 'app', order: 20.7, span: 1, config: { path: '/games', label: '游戏厅',   icon: 'IC-MIO-040' } },
    { id: 'app_pdd',     type: 'app', order: 20.8, span: 1, config: { path: '/pdd',   label: '拼夕夕',   icon: 'IC-MIO-041' } },
    { id: 'app_tong',    type: 'app', order: 20.9, span: 1, config: { path: '/tong',  label: '通牌',     icon: 'IC-MIO-042' } },
    { id: 'app_echo',    type: 'app', order: 21.0, span: 1, config: { path: '/echo',  label: '回声',     icon: 'IC-MIO-043' } },
    { id: 'app_anniversary', type: 'app', order: 20.7, span: 1, config: { path: '/anniversary', label: '纪念日', icon: 'IC-MIO-017' } },
    { id: 'app_fate',    type: 'app', order: 21, span: 1, config: { path: '/fate',    label: '抉择',     icon: 'IC-MIO-022' } },
    { id: 'app_cards',   type: 'app', order: 22, span: 1, config: { path: '/cards',   label: '字卡库',   icon: 'IC-CRD-001' } },
    { id: 'app_skin',    type: 'app', order: 23, span: 1, config: { path: '/skin',    label: '主题美化', icon: 'IC-MIO-013', tone: 'accent' } },
    { id: 'app_role',    type: 'app', order: 24, span: 1, config: { path: '/role',    label: '角色',     icon: 'IC-MIO-014' } },
    { id: 'app_data',    type: 'app', order: 25, span: 1, config: { path: '/data',    label: '数据',     icon: 'IC-MIO-009' } },
    { id: 'app_about',   type: 'app', order: 26, span: 1, config: { path: '/about',   label: '关于',     icon: 'IC-MIO-007' } },
    { id: 'tip',   type: 'tip',   order: 27, span: 4, config: {} }
  ]
};

const VALID_HOME_TYPES = new Set(['pair', 'mood', 'stat', 'app', 'tip', 'mailbox']);

/** 校验单个小组件是否可用（app 组件必须有跳转路径，stat 组件必须有数据项） */
const validHomeWidget = (w) => {
  if (!w || !VALID_HOME_TYPES.has(w.type)) return false;
  if (w.type === 'app') return !!(w.config && w.config.path);
  if (w.type === 'stat') return !!(w.config && w.config.kind);
  return true;
};

export const state = {
  role: { ...DEFAULT_ROLE, params: { ...DEFAULT_PARAMS } },
  settings: { ...DEFAULT_SETTINGS },
  skin: { ...DEFAULT_SKIN },
  widgets: JSON.parse(JSON.stringify(DEFAULT_WIDGETS))
};

export async function loadState() {
  state.role = Object.assign({}, DEFAULT_ROLE, await kvGet('role', {}));
  state.role.params = Object.assign({}, DEFAULT_PARAMS, state.role.params || {});
  // 旧的自由状态文案统一归入在线 / 忙碌 / 离线
  state.role.status = roleStatusMeta(state.role.status).label;
  // 旧的单一「主动消息间隔」升级为最短 / 最长两项
  const sp = state.role.params;
  const oldGap = Number(sp.proactiveInterval);
  if (Number.isFinite(oldGap) && oldGap > 0) {
    if (sp.proactiveIntervalMin === DEFAULT_PARAMS.proactiveIntervalMin
      && sp.proactiveIntervalMax === DEFAULT_PARAMS.proactiveIntervalMax) {
      sp.proactiveIntervalMin = oldGap;
      sp.proactiveIntervalMax = oldGap;
    }
    delete sp.proactiveInterval;
  }
  // 写信时长从「秒」升级为「分钟」
  if (sp.typingMinSec != null || sp.typingMaxSec != null) {
    const toMin = (v, dft) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n / 60)) : dft;
    };
    if (sp.typingMinSec != null) sp.typingMinMin = toMin(sp.typingMinSec, DEFAULT_PARAMS.typingMinMin);
    if (sp.typingMaxSec != null) sp.typingMaxMin = toMin(sp.typingMaxSec, DEFAULT_PARAMS.typingMaxMin);
    sp.typingMaxMin = Math.max(sp.typingMinMin, sp.typingMaxMin);
    delete sp.typingMinSec;
    delete sp.typingMaxSec;
  }
  state.settings = Object.assign({}, DEFAULT_SETTINGS, await kvGet('settings', {}));
  state.skin = Object.assign({}, DEFAULT_SKIN, await kvGet('skin', {}));
  state.widgets = JSON.parse(JSON.stringify(DEFAULT_WIDGETS));
  const saved = await kvGet('widgets', {});
  for (const k of Object.keys(DEFAULT_WIDGETS)) {
    if (Array.isArray(saved[k]) && saved[k].length) {
      if (k === 'home' && saved[k].some((w) => !validHomeWidget(w))) {
        // 旧版布局（宫格 entry / 拆分 stat 等）不兼容，回退到默认
        continue;
      }
      state.widgets[k] = saved[k];
    }
  }
  await migrateHomeApps();
}

/* 新增软件（音乐 / 问卷 / 备忘录 / 经期 / 记账 / 番茄钟 / 观影 / 书架 / 收藏 / 相册）：
   把老的已保存主屏布局也补上这几个入口，只补一次。
   通话已改为聊天内的功能（输入栏「＋」→ 通话），不再作为独立软件，
   因此历史布局里遗留的 app_call 入口会被移除。 */
const HOME_APPS_VER = 14;
const NEW_HOME_APP_IDS = [
  'app_music', 'app_quiz', 'app_memo',
  'app_period', 'app_ledger', 'app_pomodoro', 'app_watch', 'app_books',
  'app_favorites', 'app_ta_favorites', 'app_album', 'app_xhs', 'app_anniversary',
  'app_shop', 'app_games', 'app_pdd', 'app_tong', 'app_echo'
];
async function migrateHomeApps() {
  const home = state.widgets.home || [];
  const kept = home.filter((w) => w.id !== 'app_call');
  if (kept.length !== home.length) {
    state.widgets.home = kept;
    await saveWidgets();
  }

  if ((await kvGet('homeAppsVer', 1)) >= HOME_APPS_VER) return;
  const cur = state.widgets.home || [];
  const missing = DEFAULT_WIDGETS.home.filter((w) => NEW_HOME_APP_IDS.includes(w.id) && !cur.some((x) => x.id === w.id));
  if (missing.length) {
    const tipIdx = cur.findIndex((w) => w.type === 'tip');
    if (tipIdx >= 0) cur.splice(tipIdx, 0, ...missing);
    else cur.push(...missing);
    state.widgets.home = cur;
    await saveWidgets();
  }
  await kvSet('homeAppsVer', HOME_APPS_VER);
}

export const saveRole = () => kvSet('role', state.role);
export const saveSettings = () => kvSet('settings', state.settings);
export const saveSkin = () => kvSet('skin', state.skin);
export const saveWidgets = () => kvSet('widgets', state.widgets);

/** 把装扮写进 CSS 变量 */
export async function applySkin() {
  const s = state.skin;
  const r = document.documentElement.style;
  r.setProperty('--global-bg-color', s.globalBgColor || '#f7f7f6');
  r.setProperty('--bubble-me', s.bubbleMe || DEFAULT_SKIN.bubbleMe);
  r.setProperty('--bubble-me-txt', s.bubbleMeTxt || '#fff');
  r.setProperty('--bubble-ta', s.bubbleTa || DEFAULT_SKIN.bubbleTa);
  r.setProperty('--bubble-ta-txt', s.bubbleTaTxt || '#16181c');
  r.setProperty('--bubble-radius', (s.bubbleRadius || 15) + 'px');
  r.setProperty('--avatar-radius', s.avatarShape === 'circle' ? '50%' : '9px');

  const bgUrl = s.globalBgImageId ? await mediaURL(s.globalBgImageId) : '';
  r.setProperty('--global-bg-image', bgUrl ? `url("${bgUrl}")` : 'none');
  r.setProperty('--global-bg-size', bgUrl ? imgSize(s.globalBgZoom) : 'cover');
  r.setProperty('--global-bg-pos', bgUrl ? imgPos(s.globalBgX, s.globalBgY) : 'center');

  const wpUrl = s.chatWallpaperId ? await mediaURL(s.chatWallpaperId) : '';
  r.setProperty('--chat-wallpaper', wpUrl ? `url("${wpUrl}")` : 'none');
  r.setProperty('--chat-wallpaper-size', wpUrl ? imgSize(s.chatWallZoom) : 'cover');
  r.setProperty('--chat-wallpaper-pos', wpUrl ? imgPos(s.chatWallX, s.chatWallY) : 'center');

  document.getElementById('app').style.backgroundColor = s.globalBgColor || '#f7f7f6';

  applyBubbleCss(s.bubbleCss);
}

/* 背景图缩放：100 沿用 cover（和之前一致），其余按百分比缩放 */
function imgSize(z) {
  const n = Number(z);
  return !Number.isFinite(n) || n === 100 ? 'cover' : `${n}%`;
}

/* 背景图位置：50/50 即居中 */
function imgPos(x, y) {
  const nx = Number.isFinite(Number(x)) ? Number(x) : 50;
  const ny = Number.isFinite(Number(y)) ? Number(y) : 50;
  return nx === 50 && ny === 50 ? 'center' : `${nx}% ${ny}%`;
}

/* 自定义气泡 CSS：支持两种写法
   1) 只写声明（不含 {）→ 自动套到双方气泡
   2) 写选择器 → 把常见模板类名映射到本应用的 .msg/.bub 结构 */
const BUBBLE_ALIAS = {
  'msg-out': '.msg.me',
  'msg-in': '.msg.ta',
  'message-me': '.bub.me',
  'message-ta': '.bub.ta',
  'message-friend': '.bub.ta',
  'msg-bubble': '.content',
  friend: '.bub.ta',
  bubble: '.content',
  me: '.bub.me',
  ta: '.bub.ta'
};

function applyBubbleCss(raw) {
  let node = document.getElementById('custom-bubble-css');
  const css = String(raw || '').replace(/<\/?style[^>]*>/gi, '').trim();
  if (!node) {
    node = document.createElement('style');
    node.id = 'custom-bubble-css';
    document.head.appendChild(node);
  }
  if (!css) { node.textContent = ''; return; }
  if (css.indexOf('{') === -1) {
    node.textContent = `.bub.me .content,.bub.ta .content{${css}}`;
    return;
  }
  let out = css.replace(
    /(^|[\s,>+~({}])\.(msg-out|msg-in|message-me|message-ta|message-friend|msg-bubble|friend|bubble|me|ta)\b/g,
    (m, pre, key) => pre + BUBBLE_ALIAS[key]
  );
  /* 兜底：只写到气泡容器（.bub）时，自动指向内部 .content；单独写的 .content 补上 .bub 作用域 */
  out = out.replace(/([^{}]+)\{/g, (m, sel) => sel.split(',').map(fixBubbleSel).join(',') + '{');
  node.textContent = out;
}

function fixBubbleSel(s) {
  const t = s.trim();
  if (!t) return t;
  if (t === '.content') return '.bub > .content';
  if (!t.includes('.bub') || t.includes('.content')) return t;
  return t + ' > .content';
}

/** 角色头像元素的 HTML 生成 */
export async function roleAvatarSrc() {
  if (state.role.avatarId) return await mediaURL(state.role.avatarId);
  return '';
}
