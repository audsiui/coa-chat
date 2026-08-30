import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ch, ev } from "@/lib/constants";
import { triggerSafely } from "@/lib/pusher";
import { callRespondSchema } from "@/lib/validators";

type RouteCtx = RouteContext<"/api/calls/[callId]/respond">;

/** POST /api/calls/:callId/respond —— 被叫接受/拒绝 */
export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const me = await requireUser();
    const { callId } = await ctx.params;
    const body = await parseJson(req, callRespondSchema);

    await triggerSafely(
      ch.user(body.toUserId),
      body.action === "accept" ? ev.callAccepted : ev.callRejected,
      {
        callId,
        from: {
          id: me.id,
          displayName: me.displayName,
          avatarColor: me.avatarColor,
        },
      },
    );

    return ok({ done: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
