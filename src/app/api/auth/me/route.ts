import { ok, toErrorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { pusherConfigured, rtcConfigured } from "@/lib/env";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return ok({ user: null, features: { pusher: pusherConfigured(), rtc: rtcConfigured() } });
    }
    return ok({
      user,
      features: { pusher: pusherConfigured(), rtc: rtcConfigured() },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
