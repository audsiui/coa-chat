"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import type { PublicUser, RtcRoomResult } from "@/lib/types";
import { useVoicePresence } from "@/hooks/use-voice-presence";
import type { MeetingControls } from "./meeting-host";

const MeetingHost = dynamic(() => import("./meeting-host"), { ssr: false });

export type VoiceStatus = "idle" | "connecting" | "presence" | "live" | "error";

export type VoiceChannelRef = {
  id: string;
  name: string;
  serverName: string;
};

type VoiceContextValue = {
  channel: VoiceChannelRef | null;
  status: VoiceStatus;
  micOn: boolean;
  members: ReturnType<typeof useVoicePresence>["members"];
  join: (channel: VoiceChannelRef) => void;
  leave: () => void;
  toggleMic: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ me, children }: { me: PublicUser; children: React.ReactNode }) {
  const [channel, setChannel] = useState<VoiceChannelRef | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [micOn, setMicOn] = useState(true);
  const [meeting, setMeeting] = useState<{ meetingId: string; token: string } | null>(null);

  const controlsRef = useRef<MeetingControls | null>(null);
  const busyRef = useRef(false);
  // 主动离开/切换房间时置位：MeetingHost 卸载触发的 onLeft 不应被当作断连
  const suppressNextLeftRef = useRef(false);

  // 在线名单：仅在已加入某个语音频道时订阅
  const { members, broadcastMic } = useVoicePresence(channel?.id ?? null);

  /* ---------------- 入会 / 离会 ---------------- */

  const join = useCallback(
    (target: VoiceChannelRef) => {
      if (busyRef.current) return;
      if (channel?.id === target.id) return;
      busyRef.current = true;

      // 切换房间：标记主动离开，清掉旧状态（MeetingHost 卸载时自动退会）
      suppressNextLeftRef.current = true;
      controlsRef.current = null;
      setMeeting(null);
      setChannel(target);
      setStatus("connecting");
      setMicOn(true);

      void (async () => {
        try {
          const room = await api.post<RtcRoomResult>("/api/rtc/rooms", {
            channelId: target.id,
          });
          if (room.rtcConfigured && room.meetingId) {
            const { token } = await api.post<{ token: string }>("/api/rtc/token", {
              meetingId: room.meetingId,
            });
            setMeeting({ meetingId: room.meetingId, token });
            // status 保持 connecting，onJoined 后转 live
          } else {
            setStatus("presence");
            toast.info("VideoSDK 未配置：已进入仅在线模式（无实际音频）");
          }
        } catch (error) {
          setChannel(null);
          setStatus("error");
          toast.error(error instanceof Error ? error.message : "加入语音房失败");
        } finally {
          busyRef.current = false;
        }
      })();
    },
    [channel],
  );

  const leave = useCallback(() => {
    suppressNextLeftRef.current = true;
    controlsRef.current?.leave();
    controlsRef.current = null;
    setMeeting(null);
    setChannel(null);
    setStatus("idle");
  }, []);

  // 意外断连兜底；主动离开已用 suppressNextLeftRef 抑制
  const handleMeetingLeft = useCallback(() => {
    controlsRef.current = null;
    setMeeting(null);
    if (suppressNextLeftRef.current) {
      suppressNextLeftRef.current = false;
      return;
    }
    if (channel) {
      setChannel(null);
      setStatus("error");
      toast.warning("语音连接已断开");
    }
  }, [channel]);

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev;
      controlsRef.current?.toggleMic();
      broadcastMic(next);
      return next;
    });
  }, [broadcastMic]);

  /* ---------------- 上下文 ---------------- */

  const value = useMemo<VoiceContextValue>(
    () => ({ channel, status, micOn, members, join, leave, toggleMic }),
    [channel, status, micOn, members, join, leave, toggleMic],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {meeting && (
        <MeetingHost
          meetingId={meeting.meetingId}
          token={meeting.token}
          displayName={me.displayName}
          micOn={micOn}
          onJoined={() => setStatus("live")}
          onLeft={handleMeetingLeft}
          onControls={(c) => {
            controlsRef.current = c;
          }}
        />
      )}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice 必须在 VoiceProvider 内使用");
  return ctx;
}
