"use client";

import { useCallback, useEffect, useState } from "react";
import { usePusherChannel } from "@/components/providers/pusher-provider";
import { ch, ev } from "@/lib/constants";
import { api } from "@/lib/client-api";
import type { VoiceMember } from "@/lib/types";

type MemberAddedData = { id: string; displayName: string; avatarColor: string };
type MicStateData = { userId: string; micOn: boolean };

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
      const d = data as MemberAddedData;
      setMembers((list) =>
        list.some((m) => m.id === d.id)
          ? list
          : [
              ...list,
              { id: d.id, displayName: d.displayName, avatarColor: d.avatarColor, micOn: true },
            ],
      );
    };
    const onRemoved = (data: unknown) => {
      const d = data as { id: string };
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
