import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { voiceStates } from "@/db/schema";
import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  broadcastServerVoiceStates,
  listChannelVoiceMembers,
  sweepAndBroadcast,
} from "@/lib/voice-state";
import { voiceSyncSchema } from "@/lib/validators";

/**
 * POST /api/voice/sync —— 语音房心跳（客户端 20s 一次）：
 * 保活自己的状态行，清扫全局过期行，返回当前房间名单。
 * 自己的状态行缺失/换房（被其它窗口接管或被清扫）时返回 evicted: true，
 * 客户端据此本地退出（不再自愈重建，避免双标签互踢震荡）。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`voice-sync:${clientIp(req)}:${me.id}`, 90, 60_000)) {
      return ok({ members: [], evicted: false });
    }
    const body = await parseJson(req, voiceSyncSchema);
    const channel = await assertChannelAccess(body.channelId, me.id);

    const db = getDb();
    const rows = await db
      .select({ channelId: voiceStates.channelId })
      .from(voiceStates)
      .where(
        and(
          eq(voiceStates.userId, me.id),
          eq(voiceStates.clientSession, body.sessionId),
        ),
      )
      .limit(1);

    if (!rows[0] || rows[0].channelId !== channel.id) {
      await sweepAndBroadcast();
      return ok({
        members: await listChannelVoiceMembers(channel.id),
        evicted: true,
      });
    }

    await db
      .update(voiceStates)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(voiceStates.userId, me.id),
          eq(voiceStates.clientSession, body.sessionId),
        ),
      );

    await sweepAndBroadcast();

    return ok({
      members: await listChannelVoiceMembers(channel.id),
      evicted: false,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
