import { z } from "zod";

/* ---------------- 认证 ---------------- */

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{2,20}$/, "用户名需为 2-20 位字母、数字或下划线"),
  password: z.string().min(8, "密码至少 8 位").max(72, "密码过长"),
  displayName: z.string().trim().min(1, "请填写昵称").max(24, "昵称最多 24 字"),
  inviteCode: z.string().trim().min(4, "请输入有效的邀请码").max(20, "邀请码格式不正确"),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名").max(20),
  password: z.string().min(1, "请输入密码").max(72),
});

/* ---------------- 服务器 / 频道 ---------------- */

export const createServerSchema = z.object({
  name: z.string().trim().min(1, "请输入服务器名称").max(50, "名称最多 50 字"),
});

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(4, "邀请码格式不正确").max(20),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入频道名称")
    .max(32, "频道名最多 32 字")
    .regex(/^[\w\u4e00-\u9fa5 -]+$/, "频道名只能包含中文、字母、数字、连字符与空格"),
  type: z.enum(["text", "voice"]),
});

/* ---------------- 消息 ---------------- */

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "消息不能为空").max(4000, "消息最多 4000 字"),
});

/* ---------------- 私聊 ---------------- */

export const openDmSchema = z.object({
  userId: z.string().uuid("用户 ID 不合法"),
});

/* ---------------- RTC / 通话 ---------------- */

export const rtcRoomSchema = z.object({
  channelId: z.string().uuid().optional(),
  /** 语音房加入失败后强制轮换房间（旧房疑似已失效） */
  rotate: z.boolean().optional(),
});

export const rtcTokenSchema = z.object({
  meetingId: z.string().min(1, "缺少 meetingId"),
});

export const voiceJoinSchema = z.object({
  channelId: z.string().uuid(),
  sessionId: z.string().min(8).max(64),
});

export const voiceSyncSchema = z.object({
  channelId: z.string().uuid(),
  sessionId: z.string().min(8).max(64),
});

export const voiceLeaveSchema = z.object({
  sessionId: z.string().min(8).max(64),
});

export const micStateSchema = z.object({
  channelId: z.string().uuid(),
  sessionId: z.string().min(8).max(64),
  micOn: z.boolean(),
});

export const callStartSchema = z.object({
  toUserId: z.string().uuid(),
  kind: z.enum(["audio", "video"]),
});

export const paginationSchema = z.object({
  before: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const callRespondSchema = z.object({
  toUserId: z.string().uuid(),
  action: z.enum(["accept", "reject"]),
});

export const callEndSchema = z.object({
  peerUserId: z.string().uuid(),
});
