import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { channels } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertServerMember } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/pg";
import { rateLimit } from "@/lib/rate-limit";
import { createChannelSchema } from "@/lib/validators";

/** POST /api/servers/:serverId/channels —— 创建频道（成员即可创建，后续可收紧为管理员） */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/servers/[serverId]/channels">,
) {
  try {
    const me = await requireUser();
    const { serverId } = await ctx.params;
    await assertServerMember(serverId, me.id);
    if (!rateLimit(`channel-create:${me.id}`, 10, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "创建太频繁，请稍后再试");
    }
    const body = await parseJson(req, createChannelSchema);
    const db = getDb();

    const maxPos = await db
      .select({ max: sql<number>`coalesce(max(${channels.position}), 0)` })
      .from(channels)
      .where(eq(channels.serverId, serverId));

    const inserted = await db
      .insert(channels)
      .values({
        serverId,
        name: body.name,
        type: body.type,
        position: Number(maxPos[0]?.max ?? 0) + 1,
      })
      .returning({
        id: channels.id,
        serverId: channels.serverId,
        name: channels.name,
        type: channels.type,
        topic: channels.topic,
        position: channels.position,
      });

    return ok(inserted[0], 201);
  } catch (error) {
    // 频道重名（同类型）唯一约束
    if (isUniqueViolation(error)) {
      return toErrorResponse(new ApiError(409, "CHANNEL_EXISTS", "同名频道已存在"));
    }
    return toErrorResponse(error);
  }
}
