import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { channels, dmParticipants, serverMembers } from "@/db/schema";
import { ApiError } from "./api";

/** 校验用户是服务器成员；否则 403（服务器不存在则 404） */
export async function assertServerMember(serverId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ role: serverMembers.role })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(403, "NOT_MEMBER", "你不是该服务器的成员");
  return rows[0].role;
}

/** 校验频道存在且用户是其服务器成员；返回频道行 */
export async function assertChannelAccess(channelId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: channels.id,
      serverId: channels.serverId,
      name: channels.name,
      type: channels.type,
      rtcRoomId: channels.rtcRoomId,
    })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  const channel = rows[0];
  if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "频道不存在");
  await assertServerMember(channel.serverId, userId);
  return channel;
}

/** 校验私聊会话参与者 */
export async function assertConversationParticipant(conversationId: string, userId: string) {
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
  if (!rows[0]) throw new ApiError(403, "NOT_PARTICIPANT", "无权访问该会话");
}
