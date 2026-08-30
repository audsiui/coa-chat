import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  broadcastServerVoiceStates,
  listChannelVoiceMembers,
  sweepAndBroadcast,
  upsertVoiceState,
} from "@/lib/voice-state";
import { voiceJoinSchema } from "@/lib/validators";

/**
 * POST /api/voice/join —— 进入语音房：落库占用状态并广播。
 * 状态行按 (用户, 客户端会话) 键控；新会话加入会作废同一用户的旧会话行（单点接入）。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`voice-join:${clientIp(req)}:${me.id}`, 30, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "操作太频繁，请稍后再试");
    }
    const body = await parseJson(req, voiceJoinSchema);
    const channel = await assertChannelAccess(body.channelId, me.id);
    if (channel.type !== "voice") {
      throw new ApiError(409, "NOT_VOICE_CHANNEL", "该频道不是语音频道");
    }

    await sweepAndBroadcast();
    const affectedServers = await upsertVoiceState(
      me.id,
      body.sessionId,
      channel.id,
      channel.serverId,
    );

    for (const serverId of affectedServers) {
      await broadcastServerVoiceStates(serverId);
    }

    return ok({ members: await listChannelVoiceMembers(channel.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
