import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { triggerSafely } from "@/lib/pusher";
import { createRtcRoom, requireRtcConfigured } from "@/lib/rtc";
import { callStartSchema } from "@/lib/validators";

/**
 * POST /api/calls —— 发起 1 对 1 通话
 * 服务端创建临时房间并向对方推送 call:incoming 信令，返回 callId + meetingId。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const body = await parseJson(req, callStartSchema);
    if (!rateLimit(`call:${clientIp(req)}:${me.id}`, 10, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "通话发起太频繁，请稍后再试");
    }
    requireRtcConfigured();

    const db = getDb();
    const peerRows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
      })
      .from(users)
      .where(eq(users.id, body.toUserId))
      .limit(1);
    const peer = peerRows[0];
    if (!peer) throw new ApiError(404, "USER_NOT_FOUND", "对方用户不存在");

    const meetingId = await createRtcRoom();
    const callId = randomUUID();

    await triggerSafely(ch.user(peer.id), ev.callIncoming, {
      callId,
      meetingId,
      kind: body.kind,
      from: {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        avatarColor: me.avatarColor,
      },
    });

    return ok({ callId, meetingId }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
