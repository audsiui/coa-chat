import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createRtcToken, requireRtcConfigured } from "@/lib/rtc";
import { rtcTokenSchema } from "@/lib/validators";

/** POST /api/rtc/token —— 为已登录用户签发 VideoSDK 入会 JWT */
export async function POST(req: Request) {
  try {
    await requireUser();
    await parseJson(req, rtcTokenSchema);
    requireRtcConfigured();
    const token = await createRtcToken();
    return ok({ token });
  } catch (error) {
    return toErrorResponse(error);
  }
}
