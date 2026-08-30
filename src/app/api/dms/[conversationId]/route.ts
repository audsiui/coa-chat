import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { dmConversations, dmParticipants, users } from "@/db/schema";
import { ApiError, ok, toErrorResponse } from "@/lib/api";
import { assertConversationParticipant } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { ConversationDTO } from "@/lib/types";

/** GET /api/dms/:conversationId —— 会话详情（仅参与者可见） */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/dms/[conversationId]">,
) {
  try {
    const me = await requireUser();
    const { conversationId } = await ctx.params;
    await assertConversationParticipant(conversationId, me.id);
    const db = getDb();

    const convRows = await db
      .select({
        id: dmConversations.id,
        createdAt: dmConversations.createdAt,
        lastMessageAt: dmConversations.lastMessageAt,
      })
      .from(dmConversations)
      .where(eq(dmConversations.id, conversationId))
      .limit(1);
    const conv = convRows[0];
    if (!conv) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "会话不存在");

    const peerRows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(dmParticipants)
      .innerJoin(users, eq(users.id, dmParticipants.userId))
      .where(
        and(
          eq(dmParticipants.conversationId, conversationId),
          ne(dmParticipants.userId, me.id),
        ),
      )
      .limit(1);
    const peer = peerRows[0];
    if (!peer) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "会话不存在");

    const data: ConversationDTO = {
      id: conv.id,
      createdAt: conv.createdAt.toISOString(),
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      peer,
      lastMessage: null,
    };
    return ok(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
