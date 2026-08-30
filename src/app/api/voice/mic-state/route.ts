import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { voiceStates } from "@/db/schema";
import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { triggerSafely } from "@/lib/pusher";
import { micStateSchema } from "@/lib/validators";

/**
 * POST /api/voice/mic-state —— 麦克风状态：更新语音状态行并经服务器广播。
 * 广播走 private-server 频道（服务器维度），客户端按 channelId 过滤。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`mic:${clientIp(req)}:${me.id}`, 60, 60_000)) {
      return ok({ relayed: false });
    }
    const body = await parseJson(req, micStateSchema);
    const channel = await assertChannelAccess(body.channelId, me.id);
    const db = getDb();

    // 只更新在场者的状态行；不在场则忽略
    await db
      .update(voiceStates)
      .set({ micOn: body.micOn, updatedAt: new Date() })
      .where(and(eq(voiceStates.userId, me.id), eq(voiceStates.channelId, channel.id)));

    await triggerSafely(ch.server(channel.serverId), ev.micState, {
      serverId: channel.serverId,
      userId: me.id,
      channelId: channel.id,
      micOn: body.micOn,
    });

    return ok({ relayed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
