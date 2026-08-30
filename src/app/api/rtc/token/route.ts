import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { channels } from "@/db/schema";
import { ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertServerMember } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { createRtcToken, requireRtcConfigured } from "@/lib/rtc";
import { rtcTokenSchema } from "@/lib/validators";

/** POST /api/rtc/token —— 为已登录用户签发与指定房间绑定的 VideoSDK 入会 JWT */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const body = await parseJson(req, rtcTokenSchema);
    requireRtcConfigured();

    // 房间归属校验：meetingId 属于某个语音频道时，要求请求者是该频道服务器的成员
    const rows = await getDb()
      .select({ serverId: channels.serverId })
      .from(channels)
      .where(eq(channels.rtcRoomId, body.meetingId))
      .limit(1);
    if (rows[0]) await assertServerMember(rows[0].serverId, me.id);

    const token = await createRtcToken(body.meetingId);
    return ok({ token });
  } catch (error) {
    return toErrorResponse(error);
  }
}
