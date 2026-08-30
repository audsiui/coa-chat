import { eq } from "drizzle-orm";
import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { voiceStates } from "@/db/schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  broadcastServerVoiceStates,
  listChannelVoiceMembers,
  sweepAndBroadcast,
  upsertVoiceState,
} from "@/lib/voice-state";
import { voiceSyncSchema } from "@/lib/validators";

/**
 * POST /api/voice/sync —— 语音房心跳（客户端 20s 一次）：
 * 保活自己的状态行（丢失则自愈重建），清扫全局过期行，返回当前房间名单。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`voice-sync:${clientIp(req)}:${me.id}`, 90, 60_000)) {
      return ok({ members: [] });
    }
    const body = await parseJson(req, voiceSyncSchema);
    const channel = await assertChannelAccess(body.channelId, me.id);

    const db = getDb();
    const rows = await db
      .select({ channelId: voiceStates.channelId })
      .from(voiceStates)
      .where(eq(voiceStates.userId, me.id))
      .limit(1);

    if (!rows[0] || rows[0].channelId !== channel.id) {
      // 状态行丢失（数据库迁移/意外清扫）：自愈重建
      await upsertVoiceState(me.id, channel.id, channel.serverId);
      await broadcastServerVoiceStates(channel.serverId);
    } else {
      await db
        .update(voiceStates)
        .set({ updatedAt: new Date() })
        .where(eq(voiceStates.userId, me.id));
    }

    await sweepAndBroadcast();

    return ok({ members: await listChannelVoiceMembers(channel.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
