/** 全局常量 */

export const AVATAR_COLORS = [
  "#5865f2",
  "#3ba55c",
  "#faa81a",
  "#ed4245",
  "#eb459e",
  "#9b59b6",
  "#3498db",
  "#11806a",
  "#e67e22",
  "#f1c40f",
] as const;

export function pickAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export function pickIconColor(): string {
  return pickAvatarColor();
}

/* Pusher 频道命名（唯一出处，避免拼写漂移） */

export const ch = {
  user: (userId: string) => `private-user-${userId}`,
  dm: (conversationId: string) => `private-dm-${conversationId}`,
  channel: (channelId: string) => `private-channel-${channelId}`,
  server: (serverId: string) => `presence-server-${serverId}`,
  voice: (channelId: string) => `presence-voice-${channelId}`,
} as const;

/* Pusher 事件命名 */

/* Pusher 事件命名（唯一出处，避免拼写漂移）。
 * 注意：官方规范事件名仅允许字母数字、'-'、'_'（HTTP API 文档），
 * 不要使用冒号/点号——曾用 'message:new'，依赖服务端宽容属于契约外行为。 */
export const ev = {
  messageNew: "message-new",
  channelNotify: "channel-notify",
  dmNew: "dm-new",
  dmRefresh: "dm-refresh",
  micState: "mic-state",
  voiceStates: "voice-states",
  callIncoming: "call-incoming",
  callAccepted: "call-accepted",
  callRejected: "call-rejected",
  callCancelled: "call-cancelled",
  callEnded: "call-ended",
} as const;
