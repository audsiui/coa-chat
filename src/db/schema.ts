import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* 枚举                                                                */
/* ------------------------------------------------------------------ */

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const channelTypeEnum = pgEnum("channel_type", ["text", "voice"]);

/* ------------------------------------------------------------------ */
/* 用户与会话                                                           */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    avatarColor: text("avatar_color").notNull().default("#5865f2"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 用户名大小写不敏感唯一（登录与注册均按小写匹配）
    uniqueIndex("users_username_lower_key").on(sql`lower(${t.username})`),
    check(
      "users_username_format",
      sql`${t.username} ~ '^[a-zA-Z0-9_]{2,20}$'`,
    ),
    check("users_display_name_length", sql`char_length(${t.displayName}) BETWEEN 1 AND 24`),
  ],
);

/**
 * DB-backed 会话：cookie 只保存随机 token，库里存 SHA-256 哈希。
 * 好处：改密码/踢人/全局下线只需删行，无需换签名密钥。
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* 服务器（分组）与成员                                                 */
/* ------------------------------------------------------------------ */

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    iconColor: text("icon_color").notNull().default("#5865f2"),
    inviteCode: text("invite_code").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("servers_invite_code_key").on(t.inviteCode),
    check("servers_name_length", sql`char_length(${t.name}) BETWEEN 1 AND 50`),
  ],
);

export const serverMembers = pgTable(
  "server_members",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serverId, t.userId] }),
    index("server_members_user_id_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* 频道与消息                                                           */
/* ------------------------------------------------------------------ */

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: channelTypeEnum("type").notNull(),
    topic: text("topic"),
    position: smallint("position").notNull().default(0),
    // 语音频道的 VideoSDK 房间 ID（首次进入时创建并复用）
    rtcRoomId: text("rtc_room_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("channels_server_type_name_key").on(t.serverId, t.type, t.name),
    index("channels_server_id_idx").on(t.serverId),
    check("channels_name_length", sql`char_length(${t.name}) BETWEEN 1 AND 32`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // 软删除：保留主键便于将来做"删除消息"占位与审计
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_channel_created_idx").on(t.channelId, t.createdAt.desc()),
    index("messages_author_idx").on(t.authorId),
    check("messages_content_length", sql`char_length(${t.content}) BETWEEN 1 AND 4000`),
  ],
);

/** 文字频道已读水位（无行 = 全部已读，不回溯历史） */
export const channelReadStates = pgTable(
  "channel_read_states",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
);

/** 私聊会话已读水位 */
export const dmReadStates = pgTable(
  "dm_read_states",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => dmConversations.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conversationId] })],
);

/* ------------------------------------------------------------------ */
/* 私聊（1 对 1，参与人表设计预留将来扩展群聊）                          */
/* ------------------------------------------------------------------ */

export const dmConversations = pgTable("dm_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
});

export const dmParticipants = pgTable(
  "dm_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => dmConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("dm_participants_user_id_idx").on(t.userId),
  ],
);

export const dmMessages = pgTable(
  "dm_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => dmConversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("dm_messages_conversation_created_idx").on(t.conversationId, t.createdAt.desc()),
    check("dm_messages_content_length", sql`char_length(${t.content}) BETWEEN 1 AND 4000`),
  ],
);

/* ------------------------------------------------------------------ */
/* 语音房占用状态（谁在哪个语音频道）                                    */
/* 每用户至多一行（主键 user_id）；靠心跳保活，超时由服务端清扫          */
/* ------------------------------------------------------------------ */

export const voiceStates = pgTable(
  "voice_states",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    micOn: boolean("mic_on").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("voice_states_server_idx").on(t.serverId),
    index("voice_states_channel_idx").on(t.channelId),
    index("voice_states_updated_idx").on(t.updatedAt),
  ],
);
