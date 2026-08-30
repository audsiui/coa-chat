import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { serverMembers, servers } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { joinServerSchema } from "@/lib/validators";

/** POST /api/servers/join —— 凭邀请码加入服务器（幂等） */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const body = await parseJson(req, joinServerSchema);
    const db = getDb();

    const rows = await db
      .select({ id: servers.id, name: servers.name, iconColor: servers.iconColor, inviteCode: servers.inviteCode, ownerId: servers.ownerId })
      .from(servers)
      .where(eq(servers.inviteCode, body.inviteCode))
      .limit(1);

    const server = rows[0];
    if (!server) throw new ApiError(404, "INVITE_INVALID", "邀请码无效");

    await db
      .insert(serverMembers)
      .values({ serverId: server.id, userId: me.id, role: "member" })
      .onConflictDoNothing();

    return ok(server);
  } catch (error) {
    return toErrorResponse(error);
  }
}
