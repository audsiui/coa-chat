"use client";

import { useCallback, useMemo } from "react";
import { ch } from "@/lib/constants";
import { api } from "@/lib/client-api";
import { usePresenceMembers } from "./use-presence-members";
import type { VoiceMember } from "@/lib/types";

/**
 * 语音房在线名单（presence）+ 麦克风状态（服务端中转广播）。
 * 成员数据全部来自通用 usePresenceMembers（播种含自己、形状兼容、重连自愈）。
 */
export function useVoicePresence(channelId: string | null): {
  members: VoiceMember[];
  broadcastMic: (micOn: boolean) => void;
} {
  const { members: presenceMembers } = usePresenceMembers(
    channelId ? ch.voice(channelId) : null,
  );

  const members = useMemo<VoiceMember[]>(
    () =>
      presenceMembers
        .map((m) => ({
          id: m.id,
          displayName:
            typeof m.info.displayName === "string" ? m.info.displayName : "未知用户",
          avatarColor:
            typeof m.info.avatarColor === "string" ? m.info.avatarColor : "#5865f2",
          micOn: m.info.micOn === true,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh")),
    [presenceMembers],
  );

  // 经服务端中转广播麦克风状态（不使用默认关闭的 Pusher Client Events）
  const broadcastMic = useCallback(
    (micOn: boolean) => {
      if (!channelId) return;
      void api.post("/api/voice/mic-state", { channelId, micOn }).catch(() => {});
    },
    [channelId],
  );

  return { members, broadcastMic };
}
