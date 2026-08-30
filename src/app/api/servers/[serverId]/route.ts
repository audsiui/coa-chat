import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { channels, serverMembers, servers, users } from "@/db/schema";
import { ApiError, ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertServerMember } from "@/lib/access";
import { listServerVoiceStates, sweepExpiredVoiceStates } from "@/lib/voice-state";
import type { ServerDetail } from "@/lib/types";

/** GET /api/servers/:serverId —— 服务器详情（频道 + 成员），仅成员可见 */
export async function GET(_req: Request, ctx: RouteContext<"/api/servers/[serverId]">) {
  try {
    const me = await requireUser();
    const { serverId } = await ctx.params;
    const db = getDb();

    const rows = await db
      .select({
        id: servers.id,
        name: servers.name,
        iconColor: servers.iconColor,
        inviteCode: servers.inviteCode,
        ownerId: servers.ownerId,
      })
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);
    const server = rows[0];
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND", "服务器不存在");

    await assertServerMember(server.id, me.id);

    const channelRows = await db
      .select({
        id: channels.id,
        serverId: channels.serverId,
        name: channels.name,
        type: channels.type,
        topic: channels.topic,
        position: channels.position,
      })
      .from(channels)
      .where(eq(channels.serverId, serverId))
      .orderBy(asc(channels.position), asc(channels.name));

    const memberRows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        role: serverMembers.role,
        joinedAt: serverMembers.joinedAt,
      })
      .from(serverMembers)
      .innerJoin(users, eq(users.id, serverMembers.userId))
      .where(eq(serverMembers.serverId, serverId))
      .orderBy(asc(serverMembers.joinedAt));

    // 语音占用状态：静默清扫过期行后读取
    await sweepExpiredVoiceStates();
    const voiceStateRows = await listServerVoiceStates(serverId);

    const detail: ServerDetail = {
      server: { ...server, memberCount: memberRows.length },
      channels: channelRows,
      members: memberRows.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
      voiceStates: voiceStateRows.map((r) => ({
        userId: r.userId,
        channelId: r.channelId,
        displayName: r.displayName,
        avatarColor: r.avatarColor,
        micOn: r.micOn,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
    return ok(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}
