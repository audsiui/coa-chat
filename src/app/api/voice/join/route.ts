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
 * POST /api/voice/join —— 进入语音房：落库占用状态并全服务器广播。
 * 侧栏/面板的语音名单以此为准（DB + 心跳过期），不再依赖 presence 幻影订阅。
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
    const { prevServerId } = await upsertVoiceState(me.id, channel.id, channel.serverId);

    // 新旧服务器都要刷新名单（跨服务器切换房间时旧服务器需要看到你离开）
    await broadcastServerVoiceStates(channel.serverId);
    if (prevServerId && prevServerId !== channel.serverId) {
      await broadcastServerVoiceStates(prevServerId);
    }

    return ok({ members: await listChannelVoiceMembers(channel.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
