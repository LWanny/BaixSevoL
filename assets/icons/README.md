# 图标素材库 · 字卡传信

本目录是全站唯一的图标来源。**全站禁止用 Emoji 充当图标**，任何位置引用图标时一律引用编号。

## 编号规则

`IC-<分类2字母>-<三位序号>`

| 分类码 | 含义 | 目录 |
|---|---|---|
| NAV | 导航 | `nav/` |
| CHT | 聊天 | `chat/` |
| CRD | 字卡库 | `card/` |
| MOM | 朋友圈 | `moments/` |
| DIV | 占卜 | `divine/` |
| MOD | 情绪态度 | `mood/` |
| MIO | 通用 | `misc/` |

## 引用方式

```html
<img src="assets/icons/chat/IC-CHT-004.svg" alt="发送">
```

换肤只需在 `css/app.css` 的 `:root` 中调整颜色；图标本身用的是 `currentColor`，会跟随文字颜色。

## 替换方式

1. 在网站「我的 → 装扮 → 图标替换」中选择某个编号，上传自己的图片；
2. 替换记录写入 IndexedDB 的 `icons` 表，原 SVG **保留不删**，可随时还原默认；
3. `icons.json` 中该编号的 `replaced` 会标记为 `true`。

## 新增 / 重绘

编辑 `_tools/build-icons.mjs` 的 `ICONS` 数组后执行：

```bash
node assets/icons/_tools/build-icons.mjs
```

## 编号总表（87 个）


### CHT · 聊天

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-CHT-001 | 表情 | 颜文字 / 表情入口 | `assets/icons/chat/IC-CHT-001.svg` |
| IC-CHT-002 | 图片 | 从相册发送图片 | `assets/icons/chat/IC-CHT-002.svg` |
| IC-CHT-003 | 语音 | 语音字卡 / 播放 | `assets/icons/chat/IC-CHT-003.svg` |
| IC-CHT-004 | 发送 | 发送消息 | `assets/icons/chat/IC-CHT-004.svg` |
| IC-CHT-005 | 更多 | 输入栏「+」更多入口 | `assets/icons/chat/IC-CHT-005.svg` |
| IC-CHT-006 | 返回 | 返回上一页 | `assets/icons/chat/IC-CHT-006.svg` |
| IC-CHT-007 | 菜单 | 更多操作菜单 | `assets/icons/chat/IC-CHT-007.svg` |
| IC-CHT-008 | 表情包 | 我的表情库 / 贴纸 | `assets/icons/chat/IC-CHT-008.svg` |
| IC-CHT-009 | 引用 | 引用某条消息 | `assets/icons/chat/IC-CHT-009.svg` |
| IC-CHT-010 | 撤回 | 撤回一条消息 | `assets/icons/chat/IC-CHT-010.svg` |
| IC-CHT-011 | 拍一拍 | 双击头像触发拍一拍 | `assets/icons/chat/IC-CHT-011.svg` |
| IC-CHT-012 | 通话 | 虚拟通话（P1） | `assets/icons/chat/IC-CHT-012.svg` |
| IC-CHT-013 | 录音 | 站内录音（P1） | `assets/icons/chat/IC-CHT-013.svg` |
| IC-CHT-014 | 背景 | 聊天壁纸 / 背景 | `assets/icons/chat/IC-CHT-014.svg` |
| IC-CHT-015 | 转账 | 给 TA 转账 | `assets/icons/chat/IC-CHT-015.svg` |
| IC-CHT-016 | 红包 | 发一个红包 | `assets/icons/chat/IC-CHT-016.svg` |

### CRD · 字卡库

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-CRD-001 | 字卡库 | 字卡库入口 | `assets/icons/card/IC-CRD-001.svg` |
| IC-CRD-002 | 新建字卡 | 新增一张字卡 | `assets/icons/card/IC-CRD-002.svg` |
| IC-CRD-003 | 导入 | 导入 JSON / 纯文本 | `assets/icons/card/IC-CRD-003.svg` |
| IC-CRD-004 | 导出 | 导出字卡库 | `assets/icons/card/IC-CRD-004.svg` |
| IC-CRD-005 | 分组 | 字卡分组 / 文件夹 | `assets/icons/card/IC-CRD-005.svg` |
| IC-CRD-006 | 编辑 | 修改字卡内容 | `assets/icons/card/IC-CRD-006.svg` |
| IC-CRD-007 | 删除 | 删除字卡 / 分组 | `assets/icons/card/IC-CRD-007.svg` |
| IC-CRD-008 | 启禁 | 启用 / 停用字卡 | `assets/icons/card/IC-CRD-008.svg` |
| IC-CRD-009 | 使用次数 | 字卡被使用次数统计 | `assets/icons/card/IC-CRD-009.svg` |
| IC-CRD-010 | 查找 | 搜索字卡 | `assets/icons/card/IC-CRD-010.svg` |
| IC-CRD-011 | 排序 | 拖拽排序 | `assets/icons/card/IC-CRD-011.svg` |
| IC-CRD-012 | 复制 | 复制字卡内容 | `assets/icons/card/IC-CRD-012.svg` |

### DIV · 占卜

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-DIV-001 | 占卜 | 占卜模块入口 | `assets/icons/divine/IC-DIV-001.svg` |
| IC-DIV-002 | 塔罗 | 塔罗牌体系 | `assets/icons/divine/IC-DIV-002.svg` |
| IC-DIV-003 | 雷诺曼 | 雷诺曼牌体系 | `assets/icons/divine/IC-DIV-003.svg` |
| IC-DIV-004 | 占星骰 | 占星骰体系 | `assets/icons/divine/IC-DIV-004.svg` |
| IC-DIV-005 | 洗牌 | 洗牌 / 投掷动画 | `assets/icons/divine/IC-DIV-005.svg` |
| IC-DIV-006 | 翻牌 | 翻牌查看解读 | `assets/icons/divine/IC-DIV-006.svg` |
| IC-DIV-007 | 牌阵 | 牌阵选择 | `assets/icons/divine/IC-DIV-007.svg` |
| IC-DIV-008 | 追问 | 多轮追问 / 补牌 | `assets/icons/divine/IC-DIV-008.svg` |
| IC-DIV-009 | 自定义牌面 | 自定义牌面 / 牌阵 | `assets/icons/divine/IC-DIV-009.svg` |

### MIO · 通用

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-MIO-001 | 设置 | 设置入口 | `assets/icons/misc/IC-MIO-001.svg` |
| IC-MIO-002 | 关闭 | 关闭弹层 / 取消 | `assets/icons/misc/IC-MIO-002.svg` |
| IC-MIO-003 | 勾选 | 确认 / 完成 | `assets/icons/misc/IC-MIO-003.svg` |
| IC-MIO-004 | 右箭头 | 列表项箭头 | `assets/icons/misc/IC-MIO-004.svg` |
| IC-MIO-005 | 上箭头 | 返回顶部 / 展开 | `assets/icons/misc/IC-MIO-005.svg` |
| IC-MIO-006 | 应用图标 | 站点图标 / 桌面图标（带色，非线稿） | `assets/icons/misc/IC-MIO-006.svg` |
| IC-MIO-007 | 信息 | 说明 / 提示 | `assets/icons/misc/IC-MIO-007.svg` |
| IC-MIO-008 | 警告 | 风险 / 警告提示 | `assets/icons/misc/IC-MIO-008.svg` |
| IC-MIO-009 | 下载 | 导出 / 下载数据 | `assets/icons/misc/IC-MIO-009.svg` |
| IC-MIO-010 | 上传 | 导入 / 上传数据 | `assets/icons/misc/IC-MIO-010.svg` |
| IC-MIO-011 | 刷新 | 重试 / 刷新 | `assets/icons/misc/IC-MIO-011.svg` |
| IC-MIO-012 | 铃声 | 通知铃声设置 | `assets/icons/misc/IC-MIO-012.svg` |
| IC-MIO-013 | 调色 | 装扮 / 主题配色 | `assets/icons/misc/IC-MIO-013.svg` |
| IC-MIO-014 | 用户 | 个人资料 / 头像 | `assets/icons/misc/IC-MIO-014.svg` |
| IC-MIO-015 | 相册 | 他的相册 / 图片库 | `assets/icons/misc/IC-MIO-015.svg` |
| IC-MIO-016 | 音乐 | 音乐 / 一起听 | `assets/icons/misc/IC-MIO-016.svg` |
| IC-MIO-017 | 日历 | 日期 / 相识天数 | `assets/icons/misc/IC-MIO-017.svg` |
| IC-MIO-018 | 时钟 | 时间 / 延迟 | `assets/icons/misc/IC-MIO-018.svg` |
| IC-MIO-019 | 锁 | 密码 / 私密 | `assets/icons/misc/IC-MIO-019.svg` |
| IC-MIO-020 | 星标 | 收藏 / 重要 | `assets/icons/misc/IC-MIO-020.svg` |
| IC-MIO-021 | 保存 | 保存设置 | `assets/icons/misc/IC-MIO-021.svg` |
| IC-MIO-022 | 加号 | 新增 | `assets/icons/misc/IC-MIO-022.svg` |
| IC-MIO-023 | 减号 | 移除 | `assets/icons/misc/IC-MIO-023.svg` |
| IC-MIO-024 | 文字 | 文本 / 输入 | `assets/icons/misc/IC-MIO-024.svg` |
| IC-MIO-025 | 全屏 | 全屏查看 / 展开 | `assets/icons/misc/IC-MIO-025.svg` |
| IC-MIO-026 | 备忘录 | 本地便签 / 备忘录 | `assets/icons/misc/IC-MIO-026.svg` |
| IC-MIO-027 | 问卷 | TA 提问 / 我提问 / 历史记录 | `assets/icons/misc/IC-MIO-027.svg` |
| IC-MIO-028 | 信箱 | TA 的来信 / 我写封信 | `assets/icons/misc/IC-MIO-028.svg` |
| IC-MIO-029 | 播放 | 播放音频 | `assets/icons/misc/IC-MIO-029.svg` |
| IC-MIO-030 | 暂停 | 暂停播放 | `assets/icons/misc/IC-MIO-030.svg` |
| IC-MIO-031 | 一起听 | 与 TA 一起听 | `assets/icons/misc/IC-MIO-031.svg` |
| IC-MIO-032 | 挂断 | 挂断通话 | `assets/icons/misc/IC-MIO-032.svg` |

### MOD · 情绪态度

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-MOD-001 | 开心 | 心情：开心 | `assets/icons/mood/IC-MOD-001.svg` |
| IC-MOD-002 | 平静 | 心情：平静 | `assets/icons/mood/IC-MOD-002.svg` |
| IC-MOD-003 | 难过 | 心情：难过 | `assets/icons/mood/IC-MOD-003.svg` |
| IC-MOD-004 | 生气 | 心情：生气 | `assets/icons/mood/IC-MOD-004.svg` |
| IC-MOD-005 | 喜欢 | 心情：喜欢 | `assets/icons/mood/IC-MOD-005.svg` |
| IC-MOD-006 | 在意 | 心情：在意 / 关注 | `assets/icons/mood/IC-MOD-006.svg` |

### MOM · 朋友圈

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-MOM-001 | 朋友圈 | 朋友圈入口 | `assets/icons/moments/IC-MOM-001.svg` |
| IC-MOM-002 | 发布 | 发布一条动态 | `assets/icons/moments/IC-MOM-002.svg` |
| IC-MOM-003 | 点赞 | 赞 / 态度 | `assets/icons/moments/IC-MOM-003.svg` |
| IC-MOM-004 | 评论 | 评论 / 留言 | `assets/icons/moments/IC-MOM-004.svg` |
| IC-MOM-005 | 围观 | 围观 / 查看态度 | `assets/icons/moments/IC-MOM-005.svg` |
| IC-MOM-006 | 配音频 | 动态附音频 | `assets/icons/moments/IC-MOM-006.svg` |

### NAV · 导航

| 编号 | 名称 | 用途 | 文件 |
|---|---|---|---|
| IC-NAV-001 | 首页 | 主屏门户 / 返回首页 | `assets/icons/nav/IC-NAV-001.svg` |
| IC-NAV-002 | 消息 | 聊天会话（底部导航） | `assets/icons/nav/IC-NAV-002.svg` |
| IC-NAV-003 | 朋友圈 | 朋友圈动态（底部导航） | `assets/icons/nav/IC-NAV-003.svg` |
| IC-NAV-004 | 占卜 | 占卜模块（底部导航） | `assets/icons/nav/IC-NAV-004.svg` |
| IC-NAV-005 | 我的 | 设置与个人（底部导航） | `assets/icons/nav/IC-NAV-005.svg` |
| IC-NAV-006 | 更多 | 更多功能入口 | `assets/icons/nav/IC-NAV-006.svg` |
