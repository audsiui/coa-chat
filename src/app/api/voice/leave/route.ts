import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { broadcastServerVoiceStates, removeVoiceState, sweepAndBroadcast } from "@/lib/voice-state";
import { voiceLeaveSchema } from "@/lib/validators";

/**
 * POST /api/voice/leave —— 离开语音房：删除本会话的状态行并广播。
 * 客户端在主动离开、切换房间、页面关闭（keepalive）时调用。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`voice-leave:${clientIp(req)}:${me.id}`, 30, 60_000)) {
      return ok({ done: false });
    }
    const raw = await req.json().catch(() => ({}));
    const body = voiceLeaveSchema.parse(raw ?? {});

    const removed = await removeVoiceState(me.id, body.sessionId);
    if (removed) {
      await broadcastServerVoiceStates(removed.serverId);
    }
    await sweepAndBroadcast();

    return ok({ done: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
