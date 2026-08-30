import { randomBytes } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { channels, serverMembers, servers } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { pickIconColor } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { createServerSchema } from "@/lib/validators";

/** GET /api/servers —— 我的服务器列表（含成员数） */
export async function GET() {
  try {
    const me = await requireUser();
    const db = getDb();

    const myServers = await db
      .select({
        id: servers.id,
        name: servers.name,
        iconColor: servers.iconColor,
        inviteCode: servers.inviteCode,
        ownerId: servers.ownerId,
      })
      .from(serverMembers)
      .innerJoin(servers, eq(servers.id, serverMembers.serverId))
      .where(eq(serverMembers.userId, me.id));

    if (myServers.length === 0) return ok([]);

    const counts = await db
      .select({ serverId: serverMembers.serverId, memberCount: count() })
      .from(serverMembers)
      .where(inArray(serverMembers.serverId, myServers.map((s) => s.id)))
      .groupBy(serverMembers.serverId);

    const countMap = new Map(counts.map((c) => [c.serverId, Number(c.memberCount)]));

    return ok(
      myServers.map((s) => ({ ...s, memberCount: countMap.get(s.id) ?? 1 })),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/servers —— 创建服务器（服务器+成员+默认频道原子创建，创建者为 owner） */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`server-create:${me.id}`, 5, 60_000)) {
      return toErrorResponse(new ApiError(429, "RATE_LIMITED", "创建太频繁，请稍后再试"));
    }
    const body = await parseJson(req, createServerSchema);
    const db = getDb();

    const inviteCode = randomBytes(5).toString("base64url");
    const iconColor = pickIconColor();

    const server = await db.transaction(async (tx) => {
      const created = await tx
        .insert(servers)
        .values({
          name: body.name,
          ownerId: me.id,
          inviteCode,
          iconColor,
        })
        .returning({
          id: servers.id,
          name: servers.name,
          iconColor: servers.iconColor,
          inviteCode: servers.inviteCode,
          ownerId: servers.ownerId,
        });

      const server = created[0]!;

      await tx
        .insert(serverMembers)
        .values({ serverId: server.id, userId: me.id, role: "owner" });

      await tx.insert(channels).values([
        { serverId: server.id, name: "公告", type: "text", position: 0 },
        { serverId: server.id, name: "闲聊", type: "text", position: 1 },
        { serverId: server.id, name: "语音大厅", type: "voice", position: 2 },
      ]);

      return server;
    });

    return ok({ ...server, memberCount: 1 }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
