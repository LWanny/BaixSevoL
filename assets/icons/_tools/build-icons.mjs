/**
 * 字卡传信 · 图标素材库生成器
 * 运行：node assets/icons/_tools/build-icons.mjs
 * 产物：assets/icons/<分类>/<编号>.svg、assets/icons/icons.json、assets/icons/README.md
 *
 * 编号规则：IC-<分类2字母>-<三位序号>
 *   NAV 导航 / CHT 聊天 / CRD 字卡 / MOM 朋友圈 / DIV 占卜 / MOD 情绪 / MIO 通用
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');           // assets/icons
const CAT_DIR = { NAV: 'nav', CHT: 'chat', CRD: 'card', MOM: 'moments', DIV: 'divine', MOD: 'mood', MIO: 'misc' };
const CAT_NAME = { NAV: '导航', CHT: '聊天', CRD: '字卡库', MOM: '朋友圈', DIV: '占卜', MOD: '情绪态度', MIO: '通用' };

const S = (d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = [
  // ---------------- NAV 导航 ----------------
  { cat:'NAV', n:1, name:'首页', desc:'主屏门户 / 返回首页', d:'<path d="M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  { cat:'NAV', n:2, name:'消息', desc:'聊天会话（底部导航）', d:'<path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.6L3 21l1.9-5.8A8.5 8.5 0 1 1 21 11.5z"/>' },
  { cat:'NAV', n:3, name:'朋友圈', desc:'朋友圈动态（底部导航）', d:'<path d="M4 5h16v11a2 2 0 0 1-2 2H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/>' },
  { cat:'NAV', n:4, name:'占卜', desc:'占卜模块（底部导航）', d:'<path d="M12 3l2.1 5.1 5.4.4-4.1 3.6 1.3 5.3L12 14.6 7.3 17.4l1.3-5.3-4.1-3.6 5.4-.4z"/>' },
  { cat:'NAV', n:5, name:'我的', desc:'设置与个人（底部导航）', d:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>' },
  { cat:'NAV', n:6, name:'更多', desc:'更多功能入口', d:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>' },

  // ---------------- CHT 聊天 ----------------
  { cat:'CHT', n:1, name:'表情', desc:'颜文字 / 表情入口', d:'<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.6 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.3h.01M15 9.3h.01"/>' },
  { cat:'CHT', n:2, name:'图片', desc:'从相册发送图片', d:'<rect x="3" y="4" width="18" height="16" rx="2.4"/><circle cx="8.6" cy="9.4" r="1.5"/><path d="M21 16.2 16 11l-9 9"/>' },
  { cat:'CHT', n:3, name:'语音', desc:'语音字卡 / 播放', d:'<path d="M12 3.5a2.6 2.6 0 0 1 2.6 2.6v5.6a2.6 2.6 0 0 1-5.2 0V6.1A2.6 2.6 0 0 1 12 3.5z"/><path d="M19 10.6v.9a7 7 0 0 1-14 0v-.9M12 18.5V21M9 21h6"/>' },
  { cat:'CHT', n:4, name:'发送', desc:'发送消息', d:'<path d="M21.5 2.5 11 13M21.5 2.5l-7 19-4.2-9.2-9.3-4.3z"/>' },
  { cat:'CHT', n:5, name:'更多', desc:'输入栏「+」更多入口', d:'<path d="M12 5v14M5 12h14"/>' },
  { cat:'CHT', n:6, name:'返回', desc:'返回上一页', d:'<path d="M15 19l-7-7 7-7"/>' },
  { cat:'CHT', n:7, name:'菜单', desc:'更多操作菜单', d:'<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>' },
  { cat:'CHT', n:8, name:'表情包', desc:'我的表情库 / 贴纸', d:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.6 14.4s1.5 1.7 3.4 1.7 3.4-1.7 3.4-1.7M9 9.6h.01M15 9.6h.01"/>' },
  { cat:'CHT', n:9, name:'引用', desc:'引用某条消息', d:'<path d="M9 7H5.5A2.5 2.5 0 0 0 3 9.5v3A2.5 2.5 0 0 0 5.5 15H7v3l4-3V9.5A2.5 2.5 0 0 0 9 7z"/><path d="M19 7h-3.5A2.5 2.5 0 0 0 13 9.5v.5"/>' },
  { cat:'CHT', n:10, name:'撤回', desc:'撤回一条消息', d:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/>' },
  { cat:'CHT', n:11, name:'拍一拍', desc:'双击头像触发拍一拍', d:'<path d="M7.5 11V5.6a1.5 1.5 0 1 1 3 0V11m0 0V4.6a1.5 1.5 0 1 1 3 0V11m0 0V6.1a1.5 1.5 0 1 1 3 0V12m0 0v-1.4a1.5 1.5 0 1 1 3 0V16a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-6-6v-3.4a1.5 1.5 0 0 1 3 0"/>' },
  { cat:'CHT', n:12, name:'通话', desc:'虚拟通话（P1）', d:'<path d="M6.5 3.5h3l1.6 4-2 1.4a11 11 0 0 0 6 6l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>' },
  { cat:'CHT', n:13, name:'录音', desc:'站内录音（P1）', d:'<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>' },
  { cat:'CHT', n:14, name:'背景', desc:'聊天壁纸 / 背景', d:'<rect x="3" y="4" width="18" height="16" rx="2.4"/><path d="M3 16.5 9 11l5 5 3-2.5 4 3.5"/><circle cx="8.4" cy="8.6" r="1.4"/>' },
  { cat:'CHT', n:15, name:'转账', desc:'给 TA 转账', d:'<path d="M3.5 8.5h13M13 5l3.5 3.5L13 12"/><path d="M20.5 15.5h-13M11 12l-3.5 3.5L11 19"/>' },
  { cat:'CHT', n:16, name:'红包', desc:'发一个红包', d:'<rect x="3.5" y="8.5" width="17" height="12" rx="2.4"/><path d="M12 8.5c-2.7-1.7-4.8-3.1-4.8-4.9A2.5 2.5 0 0 1 12 2.9a2.5 2.5 0 0 1 4.8.7c0 1.8-2.1 3.2-4.8 4.9z"/><path d="M12 8.5v12"/>' },

  // ---------------- CRD 字卡库 ----------------
  { cat:'CRD', n:1, name:'字卡库', desc:'字卡库入口', d:'<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>' },
  { cat:'CRD', n:2, name:'新建字卡', desc:'新增一张字卡', d:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>' },
  { cat:'CRD', n:3, name:'导入', desc:'导入 JSON / 纯文本', d:'<path d="M12 3v12M8 11l4 4 4-4M4.5 20h15"/>' },
  { cat:'CRD', n:4, name:'导出', desc:'导出字卡库', d:'<path d="M12 15V3M8 7l4-4 4 4M4.5 20h15"/>' },
  { cat:'CRD', n:5, name:'分组', desc:'字卡分组 / 文件夹', d:'<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.6l2 2.2h8A2.2 2.2 0 0 1 21 9.4v7.4A2.2 2.2 0 0 1 18.8 19H5.2A2.2 2.2 0 0 1 3 16.8z"/>' },
  { cat:'CRD', n:6, name:'编辑', desc:'修改字卡内容', d:'<path d="M4 20h4L20.5 7.5l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>' },
  { cat:'CRD', n:7, name:'删除', desc:'删除字卡 / 分组', d:'<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 13h9l1-13M10.5 11v6M13.5 11v6"/>' },
  { cat:'CRD', n:8, name:'启禁', desc:'启用 / 停用字卡', d:'<path d="M12 3.5v8.5"/><path d="M7.4 6.6a7 7 0 1 0 9.2 0"/>' },
  { cat:'CRD', n:9, name:'使用次数', desc:'字卡被使用次数统计', d:'<path d="M4 20.5V10M9.3 20.5V4M14.7 20.5v-7M20 20.5V8"/>' },
  { cat:'CRD', n:10, name:'查找', desc:'搜索字卡', d:'<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>' },
  { cat:'CRD', n:11, name:'排序', desc:'拖拽排序', d:'<path d="M4 7h10M4 12h7M4 17h4"/><path d="M18 4.5v15M15.5 7.5 18 5l2.5 2.5M15.5 16.5 18 19l2.5-2.5"/>' },
  { cat:'CRD', n:12, name:'复制', desc:'复制字卡内容', d:'<rect x="9" y="9" width="11.5" height="11.5" rx="2.2"/><path d="M5.5 15V5.5A2 2 0 0 1 7.5 3.5h9"/>' },

  // ---------------- MOM 朋友圈 ----------------
  { cat:'MOM', n:1, name:'朋友圈', desc:'朋友圈入口', d:'<path d="M4 5h16v11a2 2 0 0 1-2 2H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/>' },
  { cat:'MOM', n:2, name:'发布', desc:'发布一条动态', d:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
  { cat:'MOM', n:3, name:'点赞', desc:'赞 / 态度', d:'<path d="M12 20.5S4.4 15.9 2.8 11.2A5.2 5.2 0 0 1 12 6.6a5.2 5.2 0 0 1 9.2 4.6C19.6 15.9 12 20.5 12 20.5z"/>' },
  { cat:'MOM', n:4, name:'评论', desc:'评论 / 留言', d:'<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.5L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/>' },
  { cat:'MOM', n:5, name:'围观', desc:'围观 / 查看态度', d:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/>' },
  { cat:'MOM', n:6, name:'配音频', desc:'动态附音频', d:'<path d="M9 17.5V6l10.5-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>' },

  // ---------------- DIV 占卜 ----------------
  { cat:'DIV', n:1, name:'占卜', desc:'占卜模块入口', d:'<path d="M12 3l2.1 5.1 5.4.4-4.1 3.6 1.3 5.3L12 14.6 7.3 17.4l1.3-5.3-4.1-3.6 5.4-.4z"/>' },
  { cat:'DIV', n:2, name:'塔罗', desc:'塔罗牌体系', d:'<rect x="7" y="3" width="10" height="15" rx="2"/><path d="M4.5 6.5v11A2.5 2.5 0 0 0 7 20h8"/><path d="M12 7.5l.9 2.2 2.3.2-1.7 1.5.5 2.3-2-1.2-2 1.2.5-2.3-1.7-1.5 2.3-.2z"/>' },
  { cat:'DIV', n:3, name:'雷诺曼', desc:'雷诺曼牌体系', d:'<rect x="4" y="6" width="9" height="13" rx="1.8"/><rect x="12.5" y="5" width="8" height="13" rx="1.8"/><path d="M7 10h3M7 13h3M15.5 9h2.5M15.5 12h2.5"/>' },
  { cat:'DIV', n:4, name:'占星骰', desc:'占星骰体系', d:'<path d="M12 2.8 20 6.4v11.2L12 21.2 4 17.6V6.4z"/><path d="M12 12 4 6.4M12 12v9.2M12 12l8-5.6"/>' },
  { cat:'DIV', n:5, name:'洗牌', desc:'洗牌 / 投掷动画', d:'<path d="M3 6.5h4.2l6 11h5M3 17.5h4l2.4-4.4"/><path d="M17 4.2 20.3 7 17 9.8M15.5 14.6 18.8 17.5 15.5 20.3"/>' },
  { cat:'DIV', n:6, name:'翻牌', desc:'翻牌查看解读', d:'<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v5h-5"/>' },
  { cat:'DIV', n:7, name:'牌阵', desc:'牌阵选择', d:'<rect x="2.5" y="4" width="6" height="9" rx="1.4"/><rect x="9" y="8" width="6" height="9" rx="1.4"/><rect x="15.5" y="4" width="6" height="9" rx="1.4"/>' },
  { cat:'DIV', n:8, name:'追问', desc:'多轮追问 / 补牌', d:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.7.3-.9.8-.9 1.6M12 16.6h.01"/>' },
  { cat:'DIV', n:9, name:'自定义牌面', desc:'自定义牌面 / 牌阵', d:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>' },

  // ---------------- MOD 情绪态度 ----------------
  { cat:'MOD', n:1, name:'开心', desc:'心情：开心', d:'<circle cx="12" cy="12" r="9"/><path d="M8 14.2s1.6 2.3 4 2.3 4-2.3 4-2.3"/><path d="M8.6 9.4c.5-.7 1.4-.7 1.9 0M13.5 9.4c.5-.7 1.4-.7 1.9 0"/>' },
  { cat:'MOD', n:2, name:'平静', desc:'心情：平静', d:'<circle cx="12" cy="12" r="9"/><path d="M9 15.5h6M9 9.5h.01M15 9.5h.01"/>' },
  { cat:'MOD', n:3, name:'难过', desc:'心情：难过', d:'<circle cx="12" cy="12" r="9"/><path d="M8.5 16.5s1.6-2 3.5-2 3.5 2 3.5 2"/><path d="M9 9.8h.01M15 9.8h.01M9 12.5l1.2-.8M15 12.5l-1.2-.8"/>' },
  { cat:'MOD', n:4, name:'生气', desc:'心情：生气', d:'<circle cx="12" cy="12" r="9"/><path d="M8 16h8"/><path d="M8.5 7.6l2.6 2M15.5 7.6l-2.6 2"/>' },
  { cat:'MOD', n:5, name:'喜欢', desc:'心情：喜欢', d:'<path d="M12 20.5S4.4 15.9 2.8 11.2A5.2 5.2 0 0 1 12 6.6a5.2 5.2 0 0 1 9.2 4.6C19.6 15.9 12 20.5 12 20.5z"/>' },
  { cat:'MOD', n:6, name:'在意', desc:'心情：在意 / 关注', d:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>' },

  // ---------------- MIO 通用 ----------------
  { cat:'MIO', n:1, name:'设置', desc:'设置入口', d:'<circle cx="12" cy="12" r="3.2"/><path d="M19.3 14.9a1.7 1.7 0 0 0 .3 1.9 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2 2 2 0 1 1-2.8-2.8 1.7 1.7 0 0 0-1.2-2.9 2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9 2 2 0 1 1 2.8-2.8 1.7 1.7 0 0 0 2.9-1.2 2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2 2 2 0 1 1 2.8 2.8 1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.2 2.9z"/>' },
  { cat:'MIO', n:2, name:'关闭', desc:'关闭弹层 / 取消', d:'<path d="M6 6l12 12M18 6 6 18"/>' },
  { cat:'MIO', n:3, name:'勾选', desc:'确认 / 完成', d:'<path d="M4.5 12.5 9.5 17.5 20 6.5"/>' },
  { cat:'MIO', n:4, name:'右箭头', desc:'列表项箭头', d:'<path d="M9 6l6 6-6 6"/>' },
  { cat:'MIO', n:5, name:'上箭头', desc:'返回顶部 / 展开', d:'<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>' },
  { cat:'MIO', n:6, name:'应用图标', desc:'站点图标 / 桌面图标（带色，非线稿）', raw:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1c1e22"/><stop offset="1" stop-color="#4a4f57"/></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill="url(#g)"/>
      <path d="M46 30.5a14.5 14.5 0 0 1-20.9 12.8L13 46l3.1-10.3A14.5 14.5 0 1 1 46 30.5z"
            fill="#0f1116" fill-opacity=".18"/>
      <path d="M45 29.8a14 14 0 0 1-20.2 12.4L13 45l3-10A14 14 0 1 1 45 29.8z"
            fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M22.5 29.5h10M22.5 35h6.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
    </svg>` },
  { cat:'MIO', n:7, name:'信息', desc:'说明 / 提示', d:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 8h.01"/>' },
  { cat:'MIO', n:8, name:'警告', desc:'风险 / 警告提示', d:'<path d="M12 3.5 21.5 20H2.5z"/><path d="M12 9.5v5M12 17.4h.01"/>' },
  { cat:'MIO', n:9, name:'下载', desc:'导出 / 下载数据', d:'<path d="M12 3.5v12M7.5 11 12 15.5 16.5 11M4.5 20.5h15"/>' },
  { cat:'MIO', n:10, name:'上传', desc:'导入 / 上传数据', d:'<path d="M12 20.5v-12M7.5 13 12 8.5 16.5 13M4.5 4h15"/>' },
  { cat:'MIO', n:11, name:'刷新', desc:'重试 / 刷新', d:'<path d="M20.5 12a8.5 8.5 0 1 1-2.4-5.8"/><path d="M20.5 3.2v5h-5"/>' },
  { cat:'MIO', n:12, name:'铃声', desc:'通知铃声设置', d:'<path d="M18 16.5V11a6 6 0 1 0-12 0v5.5l-2 3h16z"/><path d="M10 20a2 2 0 0 0 4 0"/>' },
  { cat:'MIO', n:13, name:'调色', desc:'装扮 / 主题配色', d:'<path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.2 3H16a2 2 0 0 0-1.4 3.4A1.8 1.8 0 0 1 12 21z"/><circle cx="8" cy="10.5" r="1.1"/><circle cx="12" cy="8" r="1.1"/><circle cx="15.8" cy="10.2" r="1.1"/>' },
  { cat:'MIO', n:14, name:'用户', desc:'个人资料 / 头像', d:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20.5a7 7 0 0 1 14 0"/>' },
  { cat:'MIO', n:15, name:'相册', desc:'他的相册 / 图片库', d:'<rect x="3" y="4.5" width="18" height="15" rx="2.4"/><path d="M3 16.5 9 11l5 5 3-2.5 4 3.5"/><circle cx="8.4" cy="9" r="1.4"/>' },
  { cat:'MIO', n:16, name:'音乐', desc:'音乐 / 一起听', d:'<path d="M9 17.5V6l10.5-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>' },
  { cat:'MIO', n:17, name:'日历', desc:'日期 / 相识天数', d:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>' },
  { cat:'MIO', n:18, name:'时钟', desc:'时间 / 延迟', d:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2"/>' },
  { cat:'MIO', n:19, name:'锁', desc:'密码 / 私密', d:'<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>' },
  { cat:'MIO', n:20, name:'星标', desc:'收藏 / 重要', d:'<path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 17.2 6.6 20.1l1.1-6-4.5-4.2 6.1-.8z"/>' },
  { cat:'MIO', n:21, name:'保存', desc:'保存设置', d:'<path d="M5 3.5h11l3.5 3.5v13.5H5z"/><path d="M8.5 3.5v6h7v-6M8 20.5v-6h8v6"/>' },
  { cat:'MIO', n:22, name:'加号', desc:'新增', d:'<path d="M12 5v14M5 12h14"/>' },
  { cat:'MIO', n:23, name:'减号', desc:'移除', d:'<path d="M5 12h14"/>' },
  { cat:'MIO', n:24, name:'文字', desc:'文本 / 输入', d:'<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>' },
  { cat:'MIO', n:25, name:'全屏', desc:'全屏查看 / 展开', d:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' },
  { cat:'MIO', n:26, name:'备忘录', desc:'本地便签 / 备忘录', d:'<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>' },
  { cat:'MIO', n:27, name:'问卷', desc:'TA 提问 / 我提问 / 历史记录', d:'<rect x="5" y="4.5" width="14" height="16" rx="2.4"/><path d="M9 3h6v3H9z"/><path d="M8.4 10.4l1.2 1.2 2-2M8.4 16l1.2 1.2 2-2"/><path d="M13.6 11h3.2M13.6 16.6h3.2"/>' },
  { cat:'MIO', n:28, name:'信箱', desc:'TA 的来信 / 我写封信', d:'<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M3.4 7.2 12 13.2l8.6-6"/>' },
  { cat:'MIO', n:29, name:'播放', desc:'播放音频', d:'<path d="M8.5 5.2 18.5 12 8.5 18.8z"/>' },
  { cat:'MIO', n:30, name:'暂停', desc:'暂停播放', d:'<path d="M9.5 5.5v13M14.5 5.5v13"/>' },
  { cat:'MIO', n:31, name:'一起听', desc:'与 TA 一起听', d:'<path d="M4.5 15.5v-3.2a7.5 7.5 0 0 1 15 0v3.2"/><rect x="2.5" y="14" width="4.5" height="6.5" rx="2"/><rect x="17" y="14" width="4.5" height="6.5" rx="2"/>' },
  { cat:'MIO', n:32, name:'挂断', desc:'挂断通话', d:'<path d="M6.5 3.5h3l1.6 4-2 1.4a11 11 0 0 0 6 6l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/><path d="M3.5 3.5 20.5 20.5"/>' },
];

// ---------- 生成 ----------
const pad = (n) => String(n).padStart(3, '0');
const manifest = [];
const seen = new Set();

for (const it of ICONS) {
  const id = `IC-${it.cat}-${pad(it.n)}`;
  if (seen.has(id)) throw new Error('编号重复: ' + id);
  seen.add(id);
  const dir = CAT_DIR[it.cat];
  const svg = it.raw || S(it.d);
  const rel = `${dir}/${id}.svg`;
  mkdirSync(join(ROOT, dir), { recursive: true });
  writeFileSync(join(ROOT, rel), svg + '\n', 'utf8');
  manifest.push({
    id,
    name: it.name,
    desc: it.desc,
    category: it.cat,
    categoryName: CAT_NAME[it.cat],
    file: `assets/icons/${rel}`,
    replaced: false,   // 用户可在「装扮」中替换为自定义图片
    replacement: null  // 替换后的图片在 IndexedDB 中的 mediaId
  });
}

manifest.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(ROOT, 'icons.json'), JSON.stringify({
  version: 1,
  rule: 'IC-<分类2字母>-<三位序号>',
  categories: CAT_NAME,
  count: manifest.length,
  icons: manifest
}, null, 2) + '\n', 'utf8');

// ---------- README ----------
const byCat = {};
manifest.forEach(m => (byCat[m.category] ||= []).push(m));
let readme = `# 图标素材库 · 字卡传信

本目录是全站唯一的图标来源。**全站禁止用 Emoji 充当图标**，任何位置引用图标时一律引用编号。

## 编号规则

\`IC-<分类2字母>-<三位序号>\`

| 分类码 | 含义 | 目录 |
|---|---|---|
`;
Object.entries(CAT_DIR).forEach(([code, dir]) => { readme += `| ${code} | ${CAT_NAME[code]} | \`${dir}/\` |\n`; });
readme += `
## 引用方式

\`\`\`html
<img src="assets/icons/chat/IC-CHT-004.svg" alt="发送">
\`\`\`

换肤只需在 \`css/app.css\` 的 \`:root\` 中调整颜色；图标本身用的是 \`currentColor\`，会跟随文字颜色。

## 替换方式

1. 在网站「我的 → 装扮 → 图标替换」中选择某个编号，上传自己的图片；
2. 替换记录写入 IndexedDB 的 \`icons\` 表，原 SVG **保留不删**，可随时还原默认；
3. \`icons.json\` 中该编号的 \`replaced\` 会标记为 \`true\`。

## 新增 / 重绘

编辑 \`_tools/build-icons.mjs\` 的 \`ICONS\` 数组后执行：

\`\`\`bash
node assets/icons/_tools/build-icons.mjs
\`\`\`

## 编号总表（${manifest.length} 个）

`;
Object.entries(byCat).forEach(([cat, list]) => {
  readme += `\n### ${cat} · ${CAT_NAME[cat]}\n\n| 编号 | 名称 | 用途 | 文件 |\n|---|---|---|---|\n`;
  list.forEach(m => { readme += `| ${m.id} | ${m.name} | ${m.desc} | \`${m.file}\` |\n`; });
});
writeFileSync(join(ROOT, 'README.md'), readme, 'utf8');

console.log(`生成完成：${manifest.length} 个图标`);
Object.entries(byCat).forEach(([c, l]) => console.log(`  ${c} ${String(l.length).padStart(2)} 个`));
