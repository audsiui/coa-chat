"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import type { PublicUser, RtcRoomResult, VoiceMember } from "@/lib/types";
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
  members: VoiceMember[];
  join: (channel: VoiceChannelRef) => void;
  leave: () => void;
  toggleMic: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

const SYNC_INTERVAL_MS = 20_000;

export function VoiceProvider({ me, children }: { me: PublicUser; children: React.ReactNode }) {
  const [channel, setChannel] = useState<VoiceChannelRef | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [micOn, setMicOn] = useState(true);
  const [meeting, setMeeting] = useState<{ meetingId: string; token: string } | null>(null);
  /** 当前房间的占用名单：来自 /api/voice/sync（DB 权威 + 心跳刷新） */
  const [roomMembers, setRoomMembers] = useState<VoiceMember[]>([]);

  const controlsRef = useRef<MeetingControls | null>(null);
  const busyRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  // 主动离开/切换房间时置位：MeetingHost 卸载触发的 onLeft 不应被当作断连
  const suppressNextLeftRef = useRef(false);

  const stopSync = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  /** 心跳循环：保活状态行 + 拉取房间名单（20s） */
  const startSync = useCallback((targetChannelId: string) => {
    stopSync();
    const tick = async () => {
      try {
        const r = await api.post<{ members: VoiceMember[] }>("/api/voice/sync", {
          channelId: targetChannelId,
        });
        setRoomMembers(r.members);
      } catch {
        /* 网络抖动忽略，下个周期重试 */
      }
    };
    void tick();
    syncTimerRef.current = window.setInterval(() => void tick(), SYNC_INTERVAL_MS);
  }, [stopSync]);

  // 页面刷新/关闭时尽力通知离房（keepalive 保证送达）
  useEffect(() => {
    if (!channel) return;
    const onHide = () => {
      void api.post("/api/voice/leave", undefined, { keepalive: true });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [channel]);

  const suppressTimerRef = useRef<number | null>(null);
  const markSuppressed = useCallback(() => {
    suppressNextLeftRef.current = true;
    // 兜底清除：若卸载清理未触发 meeting-left，避免标记泄漏吞掉真实断连
    if (suppressTimerRef.current !== null) window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressNextLeftRef.current = false;
      suppressTimerRef.current = null;
    }, 5000);
  }, []);

  // 布局卸载（退出登录等）：停心跳并尽力离房，防止幽灵占用
  useEffect(() => {
    return () => {
      stopSync();
      void api.post("/api/voice/leave", undefined, { keepalive: true }).catch(() => {});
    };
  }, [stopSync]);

  /* ---------------- 入会 / 离会 ---------------- */

  const join = useCallback(
    (target: VoiceChannelRef) => {
      if (busyRef.current) return;
      if (channel?.id === target.id) return;
      busyRef.current = true;

      // 切换房间：标记主动离开，清掉旧状态（MeetingHost 卸载时自动退会）
      markSuppressed();
      controlsRef.current = null;
      setMeeting(null);
      setChannel(target);
      setStatus("connecting");
      setMicOn(true);

      void (async () => {
        try {
          // 占用状态先落库（RTC 未配置时也保持"仅在线"占位语义）
          const state = await api.post<{ members: VoiceMember[] }>("/api/voice/join", {
            channelId: target.id,
          });
          setRoomMembers(state.members);
          startSync(target.id);

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
          // 失败回滚：清状态行 + 停心跳
          stopSync();
          setRoomMembers([]);
          void api.post("/api/voice/leave", undefined, { keepalive: true }).catch(() => {});
          setChannel(null);
          setStatus("error");
          toast.error(error instanceof Error ? error.message : "加入语音房失败");
        } finally {
          busyRef.current = false;
        }
      })();
    },
    [channel, startSync, stopSync],
  );

  const leave = useCallback(() => {
    markSuppressed();
    controlsRef.current?.leave();
    controlsRef.current = null;
    stopSync();
    void api.post("/api/voice/leave").catch(() => {});
    setMeeting(null);
    setChannel(null);
    setRoomMembers([]);
    setStatus("idle");
  }, [markSuppressed, stopSync]);


  // 意外断连兜底；主动离开已用 suppressNextLeftRef 抑制
  const handleMeetingLeft = useCallback(() => {
    controlsRef.current = null;
    setMeeting(null);
    if (suppressNextLeftRef.current) {
      suppressNextLeftRef.current = false;
      return;
    }
    if (channel) {
      stopSync();
      setRoomMembers([]);
      void api.post("/api/voice/leave", undefined, { keepalive: true }).catch(() => {});
      setChannel(null);
      setStatus("error");
      toast.warning("语音连接已断开");
    }
  }, [channel, stopSync]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    setMicOn(next);
    controlsRef.current?.toggleMic();
    if (channel) {
      void api.post("/api/voice/mic-state", { channelId: channel.id, micOn: next }).catch(() => {});
      setRoomMembers((list) =>
        list.map((m) => (m.id === me.id ? { ...m, micOn: next } : m)),
      );
    }
  }, [me.id, channel, micOn]);

  /* ---------------- 上下文 ---------------- */

  const value = useMemo<VoiceContextValue>(
    () => ({ channel, status, micOn, members: roomMembers, join, leave, toggleMic }),
    [channel, status, micOn, roomMembers, join, leave, toggleMic],
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
