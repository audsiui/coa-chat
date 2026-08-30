# CoaChat — 团队即时通讯

面向团队与好友的即时通讯系统（Discord 风格）：服务器（分组）、文字频道、多人语音房、
1 对 1 私聊（文字 / 语音 / 视频）。

技术栈：Next.js 16（App Router）· React 19 · Tailwind CSS v4 · shadcn/ui（Base UI 版）·
Drizzle ORM · PostgreSQL（Neon）· Pusher（实时通道）· VideoSDK（音视频 RTC）

---

## 功能总览

| 模块 | 说明 | 实时通道 |
| --- | --- | --- |
| 账号 | 用户名 + 密码注册登录，DB 会话（可吊销），登录限流 | — |
| 服务器 | 创建 / 邀请码加入，默认频道自动生成 | — |
| 文字频道 | 多人群聊，历史分页（上滑加载），日期分组、连续消息合并 | `private-channel-{id}` |
| 私聊 | 1 对 1 文字会话，会话列表预览 | `private-dm-{id}` + `private-user-{id}` |
| 语音房 | 多人语音频道；VideoSDK 未配置时自动降级为「仅在线」模式（只同步名单） | `presence-voice-{id}` |
| 1 对 1 通话 | 音频 / 视频，来电弹窗、45 秒未接自动取消、忙碌自动拒接 | `private-user-{id}` 信令 |
| 在线状态 | 服务器成员在线/离线分组（实时） | `presence-server-{id}` |

## 目录结构

```
src/
  app/
    login/            登录 / 注册
    chat/             聊天主应用（RSC 鉴权 + 客户端外壳）
      server/[serverId]/[channelId]/   频道聊天
      dm/[conversationId]/             私聊
    api/              REST 路由（auth / servers / channels / dms / rtc / calls / pusher）
  components/
    chat/             外壳、侧栏、聊天视图、成员栏、对话框
    voice/            VoiceProvider、CallProvider、VideoSDK MeetingHost、通话弹窗
    providers/        Pusher 客户端 + 用户事件总线
  db/                 Drizzle schema、连接、seed
  lib/                认证、鉴权、限流、Pusher/RTC 服务端、校验、API 封装
  hooks/              语音在线名单等共享 hook
drizzle/              迁移文件（generate 产物）
```

## 快速开始

### 1. 准备外部服务（约 10 分钟）

**Neon Postgres（数据库）**
1. 注册 https://neon.tech → 创建 Project
2. 复制 **Pooled connection** 连接串（含 `-pooler`），填入 `.env` 的 `DATABASE_URL`

**Pusher（实时通道）**
1. 注册 https://pusher.com → Channels → Create App（Cluster 按控制台显示，如 `ap3`）
2. App Keys 页面六个值填入 `.env`：`PUSHER_APP_ID`、`PUSHER_KEY`、`PUSHER_SECRET`、`PUSHER_CLUSTER`、`NEXT_PUBLIC_PUSHER_KEY`、`NEXT_PUBLIC_PUSHER_CLUSTER`（key 属公开值，需同时给服务端 `PUSHER_KEY` 与客户端 `NEXT_PUBLIC_PUSHER_KEY`；cluster 同理两份）
3. 无需开启 Client Events——麦克风状态等全部经服务端中转广播（`/api/voice/mic-state`），不受 Client Events 开关与限流影响

**VideoSDK（语音/视频，可选）**
1. 注册 https://videosdk.live （送 $20 额度）→ Dashboard → API Key
2. 填入 `.env` 的 `VIDEOSDK_API_KEY` / `VIDEOSDK_SECRET`
3. 未配置时：文字聊天一切可用；语音房进入「仅在线」模式；1 对 1 通话按钮会提示未启用

### 2. 安装与初始化

```bash
npm install
npm run db:push        # 建表（开发期；生产用 db:generate + db:migrate）
npm run seed           # 可选：写入演示数据（alice/bob，密码 password123）
npm run dev            # http://localhost:3000
```

`.env` 参考 `.env.example`；`AUTH_SECRET` 为预留密钥（后续服务端加密扩展用），生产环境请自行生成。

### 3. 体验流程

1. 开两个浏览器（或无痕窗口）分别注册两个账号
2. 账号 A：创建服务器 → 服务器名下拉菜单 → 邀请成员 → 复制邀请码
3. 账号 B：侧栏 + → 加入 → 输入邀请码
4. 在文字频道互发消息（实时可见）；点击语音频道加入（同房间可见成员名单）
5. 私聊：侧栏 + → 选择对方 → 打开会话 → 右上角发起语音/视频通话

## 生产部署

- **Vercel / Node 服务器均可**：实时与 RTC 都由第三方承载，应用本身无状态
- `vercel.json` 已固定函数区域为新加坡 `sin1`（与 Neon ap-southeast-1、Pusher ap3 同区，链路延迟最低）
- 环境变量共 10 项（见 `.env.example`），**`NEXT_PUBLIC_*` 必须在首次构建前配置**（Vercel 构建期内联，后补需 Redeploy）
- 数据库迁移走正规流程：`npm run db:generate` 生成迁移 → 部署时 `npm run db:migrate`
- `AUTH_SECRET`、所有第三方密钥走部署平台的环境变量，生产环境务必使用全新生成的 `AUTH_SECRET`
- 建议在反代/平台层开启 HTTPS（会话 Cookie 生产模式强制 Secure）

## 安全设计

- 密码：scrypt + 随机盐，`timingSafeEqual` 常量时间比较
- 会话：DB-backed，cookie 只存随机 token（服务端仅存 SHA-256 哈希），30 天有效；过期行由 `instrumentation.ts` 注册的每小时清理任务回收
- 鉴权分层：`proxy.ts` 仅做 Cookie 乐观检查（Next 16 中 middleware 的新名称）；页面级 `requirePageUser`（RSC）做真实校验；API 路由 `requireUser` + `lib/access.ts` 做资源级授权——遵循官方指南"不要只在 layout 鉴权"
- 实时鉴权：所有 `private-*` / `presence-*` 频道订阅前经 `/api/pusher/auth` 校验数据权限；麦克风状态经服务端中转（不使用默认关闭的 Pusher Client Events）
- 输入校验：Zod 全量校验 + 数据库层 CHECK 约束（长度、用户名格式）；并发注册由唯一索引兜底（23505 → 409）
- 事务：注册、建服务器、开私聊等多步写入均包裹 `db.transaction`
- 限流：注册 5 次/分/IP，登录 10 次/分/IP+账号，消息 30 条/分/用户，发起通话 10 次/分/用户，麦克风状态 60 次/分/用户（进程内滑动窗口，多实例部署换 Redis）
- 服务端边界：`server-only` 标记数据库/认证/实时/RTC 模块，杜绝被客户端组件意外引入
- CSP：`next.config.ts` 配置 Content-Security-Policy（connect-src 白名单 Pusher/VideoSDK，media-src blob: 供 WebRTC）。script 侧的 `unsafe-inline` 为 Next 运行所需，生产可用 proxy 生成 nonce 收紧
- RTC 密钥安全：VideoSDK token 全部服务端签发，`VIDEOSDK_SECRET` 不下发客户端

## 有意推迟的架构项（决策记录）

- **i18n 全量文案表**：当前单一中文场景，硬编码文案集中在组件内。待出现多语言需求时引入 next-intl 一次性迁移（届时文案已稳定，机械成本低）
- **DAL 完全抽层**：所有查询为显式 select 列（从未将 `passwordHash` 等敏感列返回客户端），配合 `server-only` 边界已满足安全目标；按路由逐个抽 service 层待功能稳定后统一进行
- **CSP nonce 加固**：需要 proxy 逐请求注入，属部署期任务（取决于最终部署平台）

## 已知边界（下阶段路线）

- 消息撤回/编辑：schema 已有 `deleted_at` / `edited_at`，UI 未开放
- 已读状态与未读角标：未实现
- 服务器角色权限（管理员踢人/删频道）：表结构已支持 `owner/admin/member`，UI 未开放
- 私聊群聊化：`dm_participants` 设计已预留，仅按 1 对 1 语义查询
- 图片/文件消息：需要对象存储（如 Supabase Storage / TOS）后加入
- 水平扩展时限流需替换为 Redis 实现
