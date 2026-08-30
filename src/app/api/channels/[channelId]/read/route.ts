import { ok, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { channelReadStates } from "@/db/schema";

type RouteCtx = RouteContext<"/api/channels/[channelId]/read">;

/** POST /api/channels/:channelId/read —— 标记文字频道已读（upsert 水位） */
export async function POST(_req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { channelId } = await ctx.params;
    await assertChannelAccess(channelId, me.id);

    await getDb()
      .insert(channelReadStates)
      .values({ userId: me.id, channelId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [channelReadStates.userId, channelReadStates.channelId],
        set: { lastReadAt: new Date() },
      });

    return ok({ read: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
