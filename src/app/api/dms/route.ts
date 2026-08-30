import { and, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { dmConversations, dmParticipants, users } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { triggerSafely } from "@/lib/pusher";
import { openDmSchema } from "@/lib/validators";
import type { ConversationDTO } from "@/lib/types";

type LastMessageRow = {
  conversation_id: string;
  content: string;
  created_at: Date;
  author_id: string;
};

/** GET /api/dms —— 我的会话列表（对方信息 + 最后一条消息） */
export async function GET() {
  try {
    const me = await requireUser();
    const db = getDb();

    const myConvs = await db
      .select({ conversationId: dmParticipants.conversationId })
      .from(dmParticipants)
      .where(eq(dmParticipants.userId, me.id));

    const ids = myConvs.map((r) => r.conversationId);
    if (ids.length === 0) return ok<ConversationDTO[]>([]);

    const idList = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );

    // 每个会话的最后一条消息（DISTINCT ON，一次查询）
    const lastResult = (await db.execute(sql`
      SELECT DISTINCT ON (conversation_id)
        conversation_id, content, created_at, author_id
      FROM dm_messages
      WHERE conversation_id IN (${idList}) AND deleted_at IS NULL
      ORDER BY conversation_id, created_at DESC
    `)) as unknown;
    const lastRows: LastMessageRow[] = Array.isArray(lastResult)
      ? (lastResult as LastMessageRow[])
      : ((lastResult as { rows?: LastMessageRow[] }).rows ?? []);

    const lastMap = new Map(lastRows.map((r) => [r.conversation_id, r]));

    // 对方（1 对 1：取非自己参与者）
    const peerRows = await db
      .select({
        conversationId: dmParticipants.conversationId,
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(dmParticipants)
      .innerJoin(users, eq(users.id, dmParticipants.userId))
      .where(
        and(
          sql`${dmParticipants.conversationId} IN (${idList})`,
          ne(dmParticipants.userId, me.id),
        ),
      );

    const convRows = await db
      .select({
        id: dmConversations.id,
        createdAt: dmConversations.createdAt,
        lastMessageAt: dmConversations.lastMessageAt,
      })
      .from(dmConversations)
      .where(sql`${dmConversations.id} IN (${idList})`)
      .orderBy(sql`${dmConversations.lastMessageAt} DESC NULLS LAST`);

    const data: ConversationDTO[] = convRows
      .map((conv) => {
        const peer = peerRows.find((p) => p.conversationId === conv.id);
        if (!peer) return null;
        const last = lastMap.get(conv.id);
        return {
          id: conv.id,
          createdAt: conv.createdAt.toISOString(),
          lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
          peer: {
            id: peer.id,
            username: peer.username,
            displayName: peer.displayName,
            avatarColor: peer.avatarColor,
          },
          lastMessage: last
            ? {
                content: last.content,
                createdAt: new Date(last.created_at).toISOString(),
                authorId: last.author_id,
              }
            : null,
        } satisfies ConversationDTO;
      })
      .filter((c): c is ConversationDTO => c !== null);

    return ok(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/dms —— 打开（或创建）与某用户的 1 对 1 会话 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`dm-open:${me.id}`, 20, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "操作太频繁，请稍后再试");
    }
    const body = await parseJson(req, openDmSchema);
    const db = getDb();

    if (body.userId === me.id) {
      throw new ApiError(400, "SELF_DM", "不能和自己发起私聊");
    }

    const peerRows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(users)
      .where(eq(users.id, body.userId))
      .limit(1);
    const peer = peerRows[0];
    if (!peer) throw new ApiError(404, "USER_NOT_FOUND", "用户不存在");

    const p1 = alias(dmParticipants, "p1");
    const p2 = alias(dmParticipants, "p2");
    const existing = await db
      .select({ id: dmConversations.id })
      .from(dmConversations)
      .innerJoin(p1, eq(p1.conversationId, dmConversations.id))
      .innerJoin(p2, eq(p2.conversationId, dmConversations.id))
      .where(and(eq(p1.userId, me.id), eq(p2.userId, body.userId)))
      .limit(1);

    if (existing[0]) {
      return ok({
        id: existing[0].id,
        createdAt: new Date().toISOString(),
        lastMessageAt: null,
        peer,
        lastMessage: null,
      } satisfies ConversationDTO);
    }

    // pairKey 唯一索引：并发双方同时建会话时只保留一个，另一方回读既有会话
    const pairKey = [me.id, body.userId].sort().join(":");

    const { conversation, created } = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(dmConversations)
        .values({ pairKey })
        .onConflictDoNothing({ target: dmConversations.pairKey })
        .returning({
          id: dmConversations.id,
          createdAt: dmConversations.createdAt,
          lastMessageAt: dmConversations.lastMessageAt,
        });

      if (inserted[0]) {
        const conv = inserted[0];
        await tx.insert(dmParticipants).values([
          { conversationId: conv.id, userId: me.id },
          { conversationId: conv.id, userId: peer.id },
        ]);
        return {
          conversation: conv,
          created: true as const,
        };
      }

      const rows = await tx
        .select({
          id: dmConversations.id,
          createdAt: dmConversations.createdAt,
          lastMessageAt: dmConversations.lastMessageAt,
        })
        .from(dmConversations)
        .where(eq(dmConversations.pairKey, pairKey))
        .limit(1);
      if (!rows[0]) throw new ApiError(500, "DM_RACE", "会话创建异常，请重试");
      return { conversation: rows[0], created: false as const };
    });

    if (created) {
      await triggerSafely(ch.user(peer.id), ev.dmNew, {
        conversationId: conversation.id,
        user: {
          id: me.id,
          username: me.username,
          displayName: me.displayName,
          avatarColor: me.avatarColor,
        },
      });
    }

    return ok(
      {
        id: conversation.id,
        createdAt: conversation.createdAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        peer,
        lastMessage: null,
      } satisfies ConversationDTO,
      created ? 201 : 200,
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
