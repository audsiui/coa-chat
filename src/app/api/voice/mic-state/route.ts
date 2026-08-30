import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { triggerSafely } from "@/lib/pusher";
import { z } from "zod";

const micStateSchema = z.object({
  channelId: z.string().uuid(),
  micOn: z.boolean(),
});

/**
 * POST /api/voice/mic-state —— 麦克风状态经服务端中转广播。
 * 不使用 Pusher Client Events（默认关闭、有限流约束），由服务器校验成员身份后触发。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    if (!rateLimit(`mic:${clientIp(req)}:${me.id}`, 60, 60_000)) {
      return ok({ relayed: false });
    }
    const body = await parseJson(req, micStateSchema);
    await assertChannelAccess(body.channelId, me.id);

    await triggerSafely(ch.voice(body.channelId), ev.micState, {
      userId: me.id,
      micOn: body.micOn,
    });

    return ok({ relayed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
