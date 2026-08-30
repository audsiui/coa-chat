import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { channels, dmParticipants, serverMembers } from "@/db/schema";
import { ApiError, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { pusherAuthEndpointPayload } from "@/lib/pusher";
import { pusherConfigured } from "@/lib/env";

/**
 * Pusher 私有/在线频道鉴权端点。
 * 原则：订阅前逐频道校验当前用户的数据权限，杜绝越权监听。
 */

type PresenceInfo = { user_id: string; user_info: { displayName: string; avatarColor: string } };

async function assertServerMember(serverId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(403, "FORBIDDEN", "无权访问该服务器");
}

async function assertChannelInMemberServer(channelId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ serverId: channels.serverId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  const channel = rows[0];
  if (!channel) throw new ApiError(404, "NOT_FOUND", "频道不存在");
  await assertServerMember(channel.serverId, userId);
  return channel.serverId;
}

async function assertConversationParticipant(conversationId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ conversationId: dmParticipants.conversationId })
    .from(dmParticipants)
    .where(
      and(
        eq(dmParticipants.conversationId, conversationId),
        eq(dmParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new ApiError(403, "FORBIDDEN", "无权访问该会话");
}

export async function POST(req: Request) {
  try {
    if (!pusherConfigured()) {
      throw new ApiError(501, "PUSHER_NOT_CONFIGURED", "实时通道未配置：请在 .env 填写 Pusher 密钥");
    }

    const user = await requireUser();

    const form = await req.formData();
    const socketId = String(form.get("socket_id") ?? "");
    const channelName = String(form.get("channel_name") ?? "");
    if (!socketId || !channelName) {
      throw new ApiError(400, "BAD_REQUEST", "缺少 socket_id 或 channel_name");
    }

    let presence: PresenceInfo | undefined;

    if (channelName.startsWith("private-user-")) {
      const targetId = channelName.slice("private-user-".length);
      if (targetId !== user.id) throw new ApiError(403, "FORBIDDEN", "无权订阅他人频道");
    } else if (channelName.startsWith("private-dm-")) {
      await assertConversationParticipant(channelName.slice("private-dm-".length), user.id);
    } else if (channelName.startsWith("private-channel-")) {
      await assertChannelInMemberServer(channelName.slice("private-channel-".length), user.id);
    } else if (channelName.startsWith("presence-server-")) {
      await assertServerMember(channelName.slice("presence-server-".length), user.id);
      presence = { user_id: user.id, user_info: { displayName: user.displayName, avatarColor: user.avatarColor } };
    } else if (channelName.startsWith("presence-voice-")) {
      await assertChannelInMemberServer(channelName.slice("presence-voice-".length), user.id);
      presence = { user_id: user.id, user_info: { displayName: user.displayName, avatarColor: user.avatarColor } };
    } else {
      throw new ApiError(403, "FORBIDDEN", "不支持的频道类型");
    }

    const payload = pusherAuthEndpointPayload(socketId, channelName, presence);
    if (!payload) {
      throw new ApiError(501, "PUSHER_NOT_CONFIGURED", "实时通道未配置");
    }
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
