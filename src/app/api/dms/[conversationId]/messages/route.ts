import { and, desc, eq, isNull, lt, lte, ne, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { dmConversations, dmMessages, dmParticipants, users } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertConversationParticipant } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { triggerSafely } from "@/lib/pusher";
import { paginationSchema, sendMessageSchema } from "@/lib/validators";
import type { DmMessageDTO } from "@/lib/types";

type RouteCtx = RouteContext<"/api/dms/[conversationId]/messages">;

/** GET /api/dms/:conversationId/messages?before=&limit= —— 倒序分页，返回升序数组 */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { conversationId } = await ctx.params;
    await assertConversationParticipant(conversationId, me.id);

    const url = new URL(req.url);
    const query = paginationSchema.parse({
      before: url.searchParams.get("before") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const db = getDb();
    const conditions: (SQL<unknown> | undefined)[] = [
      eq(dmMessages.conversationId, conversationId),
      isNull(dmMessages.deletedAt),
    ];
    if (query.before) {
      const cursorAt = new Date(query.before);
      if (query.beforeId) {
        // (created_at, id) 复合游标：同毫秒多条消息不丢页、不空转
        conditions.push(
          or(
            lt(dmMessages.createdAt, cursorAt),
            and(eq(dmMessages.createdAt, cursorAt), lt(dmMessages.id, query.beforeId)),
          ),
        );
      } else {
        conditions.push(lte(dmMessages.createdAt, cursorAt));
      }
    }

    const rows = await db
      .select({
        id: dmMessages.id,
        conversationId: dmMessages.conversationId,
        content: dmMessages.content,
        createdAt: dmMessages.createdAt,
        editedAt: dmMessages.editedAt,
        authorId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(dmMessages)
      .innerJoin(users, eq(users.id, dmMessages.authorId))
      .where(and(...conditions))
      .orderBy(desc(dmMessages.createdAt), desc(dmMessages.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit).reverse();

    const data: DmMessageDTO[] = page.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      author: {
        id: r.authorId,
        username: r.username,
        displayName: r.displayName,
        avatarColor: r.avatarColor,
      },
    }));

    return ok({ messages: data, hasMore });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/dms/:conversationId/messages —— 发送私聊消息并实时广播 */
export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { conversationId } = await ctx.params;
    await assertConversationParticipant(conversationId, me.id);
    if (!rateLimit(`msg:${clientIp(req)}:${me.id}`, 30, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "发送太频繁，请稍后再试");
    }
    const body = await parseJson(req, sendMessageSchema);

    const db = getDb();
    const inserted = await db
      .insert(dmMessages)
      .values({ conversationId, authorId: me.id, content: body.content })
      .returning({ id: dmMessages.id, createdAt: dmMessages.createdAt });

    const row = inserted[0]!;
    await db
      .update(dmConversations)
      .set({ lastMessageAt: row.createdAt })
      .where(eq(dmConversations.id, conversationId));

    const message: DmMessageDTO = {
      id: row.id,
      conversationId,
      content: body.content,
      createdAt: row.createdAt.toISOString(),
      editedAt: null,
      author: {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        avatarColor: me.avatarColor,
      },
    };

    await triggerSafely(ch.dm(conversationId), ev.messageNew, message);

    // 通知对方侧边栏刷新（对方未订阅会话频道也能收到）
    const peerRows = await db
      .select({ userId: dmParticipants.userId })
      .from(dmParticipants)
      .where(
        and(
          eq(dmParticipants.conversationId, conversationId),
          ne(dmParticipants.userId, me.id),
        ),
      );
    for (const peer of peerRows) {
      await triggerSafely(ch.user(peer.userId), ev.dmRefresh, {
        conversationId,
        preview: body.content.slice(0, 60),
        from: {
          id: me.id,
          displayName: me.displayName,
          avatarColor: me.avatarColor,
        },
      });
    }

    return ok(message, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
