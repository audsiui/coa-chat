import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { triggerSafely } from "@/lib/pusher";
import { callEndSchema } from "@/lib/validators";

type RouteCtx = RouteContext<"/api/calls/[callId]/end">;

/** POST /api/calls/:callId/end —— 挂断（通知对端结束信令） */
export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { callId } = await ctx.params;
    const body = await parseJson(req, callEndSchema);

    await triggerSafely(ch.user(body.peerUserId), ev.callEnded, {
      callId,
      from: { id: me.id },
    });

    return ok({ done: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
