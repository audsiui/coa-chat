import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type UnreadCounts = {
  channels: Array<{ id: string; serverId: string; count: number }>;
  dms: Array<{ id: string; count: number }>;
};

/**
 * 权威未读计数：
 * - 已读水位表无行视为全部已读（COALESCE 到 9999 年，使 JOIN 条件恒假）
 * - 排除自己发的消息与已删除消息
 */
export async function getUnreadCounts(userId: string): Promise<UnreadCounts> {
  const db = getDb();

  const channelResult = (await db.execute(sql`
    SELECT c.id, c.server_id, COUNT(m.id)::int AS unread
    FROM channels c
    JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ${userId}
    LEFT JOIN channel_read_states r ON r.channel_id = c.id AND r.user_id = ${userId}
    LEFT JOIN messages m
      ON m.channel_id = c.id
     AND m.deleted_at IS NULL
     AND m.author_id <> ${userId}
     AND m.created_at > COALESCE(r.last_read_at, TIMESTAMPTZ '9999-12-31')
    WHERE c.type = 'text'
    GROUP BY c.id, c.server_id
    HAVING COUNT(m.id) > 0
  `)) as unknown;

  const dmResult = (await db.execute(sql`
    SELECT p.conversation_id AS id, COUNT(m.id)::int AS unread
    FROM dm_participants p
    LEFT JOIN dm_read_states r ON r.conversation_id = p.conversation_id AND r.user_id = ${userId}
    LEFT JOIN dm_messages m
      ON m.conversation_id = p.conversation_id
     AND m.deleted_at IS NULL
     AND m.author_id <> ${userId}
     AND m.created_at > COALESCE(r.last_read_at, TIMESTAMPTZ '9999-12-31')
    WHERE p.user_id = ${userId}
    GROUP BY p.conversation_id
    HAVING COUNT(m.id) > 0
  `)) as unknown;

  const channelRows = Array.isArray(channelResult)
    ? (channelResult as Array<{ id: string; server_id: string; unread: number }>)
    : ((channelResult as { rows?: Array<{ id: string; server_id: string; unread: number }> }).rows ?? []);
  const dmRows = Array.isArray(dmResult)
    ? (dmResult as Array<{ id: string; unread: number }>)
    : ((dmResult as { rows?: Array<{ id: string; unread: number }> }).rows ?? []);

  return {
    channels: channelRows.map((r) => ({ id: r.id, serverId: r.server_id, count: Number(r.unread) })),
    dms: dmRows.map((r) => ({ id: r.id, count: Number(r.unread) })),
  };
}
