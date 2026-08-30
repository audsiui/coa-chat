import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, toErrorResponse } from "@/lib/api";
import {
  assertChannelAccess,
  assertConversationParticipant,
  assertServerMember,
} from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { pusherAuthEndpointPayload } from "@/lib/pusher";
import { pusherConfigured } from "@/lib/env";

const uuidSchema = z.string().uuid();

function channelIdFrom(channelName: string, prefix: string): string {
  const suffix = channelName.slice(prefix.length);
  const parsed = uuidSchema.safeParse(suffix);
  if (!parsed.success) throw new ApiError(400, "BAD_CHANNEL", "频道名不合法");
  return parsed.data;
}

/**
 * Pusher 私有/在线频道鉴权端点。
 * 原则：订阅前逐频道校验当前用户的数据权限（复用 lib/access），杜绝越权监听。
 */
export async function POST(req: Request) {
  try {
    if (!pusherConfigured()) {
      throw new ApiError(501, "PUSHER_NOT_CONFIGURED", "实时通道未配置：请在 .env 填写 Pusher 密钥");
    }

    const user = await requireUser();

    const form = await req.formData();
    const socketId = String(form.get("socket_id") ?? "");
    const channelName = String(form.get("channel_name") ?? "");
    if (!socketId || !channelName) {
      throw new ApiError(400, "BAD_REQUEST", "缺少 socket_id 或 channel_name");
    }

    let presence: { user_id: string; user_info: { displayName: string; avatarColor: string } } | undefined;

    if (channelName.startsWith("private-user-")) {
      const targetId = channelName.slice("private-user-".length);
      if (targetId !== user.id) throw new ApiError(403, "FORBIDDEN", "无权订阅他人频道");
    } else if (channelName.startsWith("private-dm-")) {
      await assertConversationParticipant(channelName.slice("private-dm-".length), user.id);
    } else if (channelName.startsWith("private-channel-")) {
      await assertChannelAccess(channelName.slice("private-channel-".length), user.id);
    } else if (channelName.startsWith("presence-server-")) {
      await assertServerMember(channelName.slice("presence-server-".length), user.id);
      presence = { user_id: user.id, user_info: { displayName: user.displayName, avatarColor: user.avatarColor } };
    } else if (channelName.startsWith("presence-voice-")) {
      await assertChannelAccess(channelName.slice("presence-voice-".length), user.id);
      presence = { user_id: user.id, user_info: { displayName: user.displayName, avatarColor: user.avatarColor } };
    } else {
      throw new ApiError(403, "FORBIDDEN", "不支持的频道类型");
    }

    const payload = pusherAuthEndpointPayload(socketId, channelName, presence);
    if (!payload) {
      throw new ApiError(501, "PUSHER_NOT_CONFIGURED", "实时通道未配置");
    }
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
