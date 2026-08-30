import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, serverMembers, users } from "@/db/schema";
import { ApiError, ok, parseJson, paramsOf, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { triggerSafely } from "@/lib/pusher";
import { paginationSchema, sendMessageSchema } from "@/lib/validators";
import type { ChannelMessageDTO } from "@/lib/types";

type RouteCtx = RouteContext<"/api/channels/[channelId]/messages">;

/** GET /api/channels/:channelId/messages?before=&limit= —— 倒序分页，返回升序数组 */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { channelId } = await paramsOf(ctx.params);
    await assertChannelAccess(channelId, me.id);

    const url = new URL(req.url);
    const query = paginationSchema.parse({
      before: url.searchParams.get("before") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const db = getDb();
    const conditions = [eq(messages.channelId, channelId), isNull(messages.deletedAt)];
    if (query.before) {
      // lte 而非 lt：同毫秒消息不因游标截断丢失，客户端按 id 合并去重
      conditions.push(lte(messages.createdAt, new Date(query.before)));
    }

    const rows = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        content: messages.content,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
        authorId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.authorId))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit).reverse();

    const data: ChannelMessageDTO[] = page.map((r) => ({
      id: r.id,
      channelId: r.channelId,
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

/** POST /api/channels/:channelId/messages —— 发送频道消息并实时广播 */
export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { channelId } = await paramsOf(ctx.params);
    const channel = await assertChannelAccess(channelId, me.id);
    if (!rateLimit(`msg:${clientIp(req)}:${me.id}`, 30, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "发送太频繁，请稍后再试");
    }
    const body = await parseJson(req, sendMessageSchema);

    const db = getDb();
    const inserted = await db
      .insert(messages)
      .values({ channelId, authorId: me.id, content: body.content })
      .returning({ id: messages.id, createdAt: messages.createdAt });

    const row = inserted[0];
    const message: ChannelMessageDTO = {
      id: row.id,
      channelId,
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

    await triggerSafely(ch.channel(channelId), ev.messageNew, message);

    // 未读通知：发给该服务器所有成员（除作者）的轻量事件；
    // 批量触发（单次 ≤90 频道），避免大服务器串行 REST 调用
    const memberRows = await db
      .select({ userId: serverMembers.userId })
      .from(serverMembers)
      .where(eq(serverMembers.serverId, channel.serverId));
    const myChannel = ch.user(me.id);
    const targets = memberRows
      .map((m) => ch.user(m.userId))
      .filter((target) => target !== myChannel);
    for (let i = 0; i < targets.length; i += 90) {
      await triggerSafely(targets.slice(i, i + 90), ev.channelNotify, {
        channelId,
        serverId: channel.serverId,
        messageId: message.id,
        senderName: me.displayName,
      });
    }

    return ok(message, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
