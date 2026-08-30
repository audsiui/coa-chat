import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { broadcastServerVoiceStates, removeVoiceState, sweepAndBroadcast } from "@/lib/voice-state";
import { voiceLeaveSchema } from "@/lib/validators";

/**
 * POST /api/voice/leave —— 离开语音房：删状态行并广播。
 * 客户端在主动离开、切换房间时调用；页面关闭时以 fetch keepalive 调用。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`voice-leave:${clientIp(req)}:${me.id}`, 30, 60_000)) {
      return ok({ done: false });
    }
    // body 可为空（keepalive 兜底路径允许不带 channelId）
    const raw = await req
      .json()
      .catch(() => ({}));
    const body = voiceLeaveSchema.parse(raw ?? {});

    void body;
    const removed = await removeVoiceState(me.id);
    if (removed) {
      await broadcastServerVoiceStates(removed.serverId);
    }
    await sweepAndBroadcast();

    return ok({ done: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
