/** 前后端共享的 DTO 类型 */

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
};

export type MePayload = {
  user: PublicUser;
  features: { pusher: boolean; rtc: boolean };
};

export type ServerSummary = {
  id: string;
  name: string;
  iconColor: string;
  inviteCode: string;
  ownerId: string;
  memberCount: number;
};

export type ChannelDTO = {
  id: string;
  serverId: string;
  name: string;
  type: "text" | "voice";
  topic: string | null;
  position: number;
};

export type MemberDTO = PublicUser & {
  role: "owner" | "admin" | "member";
  joinedAt: string;
};

export type VoiceStateDTO = {
  userId: string;
  channelId: string;
  displayName: string;
  avatarColor: string;
  micOn: boolean;
  updatedAt: string;
};

export type ServerDetail = {
  server: ServerSummary;
  channels: ChannelDTO[];
  members: MemberDTO[];
  voiceStates: VoiceStateDTO[];
};

export type ChannelMessageDTO = {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
};

export type DmMessageDTO = {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
};

/** 本地消息缓存中的消息（DTO + 乐观发送状态） */
export type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
  /** 乐观发送中（尚未收到服务端确认） */
  pending?: boolean;
};

export type ConversationDTO = {
  id: string;
  createdAt: string;
  lastMessageAt: string | null;
  /** 对方（1 对 1 场景取另一参与者） */
  peer: PublicUser;
  lastMessage: { content: string; createdAt: string; authorId: string } | null;
};

export type VoiceMember = {
  id: string;
  displayName: string;
  avatarColor: string;
  micOn: boolean;
};

export type CallKind = "audio" | "video";

export type RtcRoomResult = {
  rtcConfigured: boolean;
  meetingId: string | null;
};
