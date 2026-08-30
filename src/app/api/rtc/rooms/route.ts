import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { channels } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { assertChannelAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { rtcConfigured } from "@/lib/env";
import { createRtcRoom, requireRtcConfigured } from "@/lib/rtc";
import { rtcRoomSchema } from "@/lib/validators";
import type { RtcRoomResult } from "@/lib/types";

/**
 * POST /api/rtc/rooms —— 获取（或创建）VideoSDK 房间
 * - 带 channelId：语音频道房间，服务端创建一次并持久化，所有人共享同一 meetingId。
 *   未配置 VideoSDK 时返回 { rtcConfigured: false }，客户端进入"仅在线"模式。
 * - 不带 channelId：1 对 1 通话用临时房间，必须已配置 VideoSDK。
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const body = await parseJson(req, rtcRoomSchema);

    if (body.channelId) {
      const channel = await assertChannelAccess(body.channelId, me.id);
      if (channel.type !== "voice") {
        throw new ApiError(409, "NOT_VOICE_CHANNEL", "该频道不是语音频道");
      }

      if (channel.rtcRoomId) {
        const data: RtcRoomResult = { rtcConfigured: true, meetingId: channel.rtcRoomId };
        return ok(data);
      }
      if (!rtcConfigured()) {
        return ok({ rtcConfigured: false, meetingId: null } satisfies RtcRoomResult);
      }

      const meetingId = await createRtcRoom();
      await getDb()
        .update(channels)
        .set({ rtcRoomId: meetingId, updatedAt: new Date() })
        .where(eq(channels.id, channel.id));

      return ok({ rtcConfigured: true, meetingId } satisfies RtcRoomResult);
    }

    // 1 对 1 通话临时房间
    requireRtcConfigured();
    const meetingId = await createRtcRoom();
    return ok({ rtcConfigured: true, meetingId } satisfies RtcRoomResult);
  } catch (error) {
    return toErrorResponse(error);
  }
}
