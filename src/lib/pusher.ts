import "server-only";

import Pusher from "pusher";
import { env, pusherConfigured } from "./env";

let client: Pusher | null = null;

function getPusher(): Pusher | null {
  if (!pusherConfigured()) return null;
  if (!client) {
    client = new Pusher({
      appId: env.pusher.appId,
      key: env.pusher.key,
      secret: env.pusher.secret,
      cluster: env.pusher.cluster,
      useTLS: true,
    });
  }
  return client;
}

/**
 * 触发实时事件。未配置 Pusher 时只打日志不抛错——
 * 文字链路降级为"发送方可见"，避免整站不可用。
 */
export async function triggerSafely(
  channel: string,
  event: string,
  data: unknown,
): Promise<void> {
  const p = getPusher();
  if (!p) {
    console.warn(`[pusher] 未配置，跳过触发 ${event} @ ${channel}`);
    return;
  }
  try {
    await p.trigger(channel, event, data);
  } catch (error) {
    console.error(`[pusher] 触发失败 ${event} @ ${channel}:`, error);
  }
}

export function pusherAuthEndpointPayload(
  socketId: string,
  channel: string,
  presenceData?: { user_id: string; user_info?: Record<string, unknown> },
) {
  const p = getPusher();
  if (!p) return null;
  return p.authorizeChannel(socketId, channel, presenceData);
}
