import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { serverMembers, users } from "@/db/schema";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import type { PublicUser } from "@/lib/types";

/** GET /api/dms/candidates —— 可私聊用户：与我共享至少一个服务器的其他用户 */
export async function GET() {
  try {
    const me = await requireUser();
    const db = getDb();

    const myServers = await db
      .select({ serverId: serverMembers.serverId })
      .from(serverMembers)
      .where(eq(serverMembers.userId, me.id));

    const ids = myServers.map((s) => s.serverId);
    if (ids.length === 0) return ok<PublicUser[]>([]);

    const rows = await db
      .selectDistinct({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(serverMembers)
      .innerJoin(users, eq(users.id, serverMembers.userId))
      .where(and(inArray(serverMembers.serverId, ids), ne(serverMembers.userId, me.id)));

    return ok(rows);
  } catch (error) {
    return toErrorResponse(error);
  }
}
