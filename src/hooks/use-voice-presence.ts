"use client";

import { useCallback, useEffect, useState } from "react";
import { usePusherChannel } from "@/components/providers/pusher-provider";
import { ch, ev } from "@/lib/constants";
import { api } from "@/lib/client-api";
import type { VoiceMember } from "@/lib/types";

type MemberInfo = { displayName: string; avatarColor: string };
type MicStateData = { userId: string; micOn: boolean };

/** pusher-js 的成员对象：{ id, info: {...user_info} }（旧版本为平铺），此处两种形态都兼容 */
function parseMember(data: unknown): { id: string; info: MemberInfo } | null {
  const d = data as { id?: string; info?: MemberInfo } & Partial<MemberInfo>;
  const info = d.info ?? d;
  if (!d.id || !info?.displayName) return null;
  return { id: d.id, info: { displayName: info.displayName, avatarColor: info.avatarColor ?? "#5865f2" } };
}

/**
 * 语音频道的在线名单（Pusher presence）+ 麦克风状态（服务端中转广播）。
 * 同时被 VoiceProvider（当前所在房间）与 ServerSidebar（全部语音频道）使用。
 */
export function useVoicePresence(channelId: string | null): {
  members: VoiceMember[];
  broadcastMic: (micOn: boolean) => void;
} {
  const presenceChannel = usePusherChannel(channelId ? ch.voice(channelId) : null);
  const [members, setMembers] = useState<VoiceMember[]>([]);

  useEffect(() => {
    if (!presenceChannel) {
      setMembers([]);
      return;
    }

    const onAdded = (data: unknown) => {
      const parsed = parseMember(data);
      if (!parsed) return;
      const { id, info } = parsed;
      setMembers((list) =>
        list.some((m) => m.id === id)
          ? list
          : [...list, { id, displayName: info.displayName, avatarColor: info.avatarColor, micOn: true }],
      );
    };
    const onRemoved = (data: unknown) => {
      const d = data as { id?: string };
      if (!d.id) return;
      setMembers((list) => list.filter((m) => m.id !== d.id));
    };
    const onMic = (data: unknown) => {
      const d = data as MicStateData;
      setMembers((list) =>
        list.map((m) => (m.id === d.userId ? { ...m, micOn: d.micOn } : m)),
      );
    };

    presenceChannel.bind("pusher:member_added", onAdded);
    presenceChannel.bind("pusher:member_removed", onRemoved);
    presenceChannel.bind(ev.micState, onMic);
    return () => {
      presenceChannel.unbind("pusher:member_added", onAdded);
      presenceChannel.unbind("pusher:member_removed", onRemoved);
      presenceChannel.unbind(ev.micState, onMic);
    };
  }, [presenceChannel]);

  // 经服务端中转广播（Pusher Client Events 默认关闭，不依赖它）
  const broadcastMic = useCallback(
    (micOn: boolean) => {
      if (!channelId) return;
      void api.post("/api/voice/mic-state", { channelId, micOn }).catch(() => {});
    },
    [channelId],
  );

  return { members, broadcastMic };
}
