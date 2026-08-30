import { ok, toErrorResponse } from "@/lib/api";
import { assertConversationParticipant } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { dmReadStates } from "@/db/schema";

type RouteCtx = RouteContext<"/api/dms/[conversationId]/read">;

/** POST /api/dms/:conversationId/read —— 标记私聊会话已读（upsert 水位） */
export async function POST(_req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { conversationId } = await ctx.params;
    await assertConversationParticipant(conversationId, me.id);

    await getDb()
      .insert(dmReadStates)
      .values({ userId: me.id, conversationId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [dmReadStates.userId, dmReadStates.conversationId],
        set: { lastReadAt: new Date() },
      });

    return ok({ read: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
