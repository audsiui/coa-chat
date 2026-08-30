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
const JOIN_WATCHDOG_MS = 15_000;

/** 每个浏览器标签一个语音会话 ID（sessionStorage：刷新保留、跨标签隔离） */
function getVoiceSessionId(): string {
  try {
    let s = window.sessionStorage.getItem("coachat:voice-session");
    if (!s) {
      s =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `vs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem("coachat:voice-session", s);
    }
    return s;
  } catch {
    return `vs-${Date.now()}-fallback`;
  }
}

export function VoiceProvider({ me, children }: { me: PublicUser; children: React.ReactNode }) {
  const [channel, setChannel] = useState<VoiceChannelRef | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [micOn, setMicOn] = useState(true);
  const [meeting, setMeeting] = useState<{ meetingId: string; token: string } | null>(null);
  /** 当前房间的占用名单：来自 /api/voice/sync（DB 权威 + 心跳刷新） */
  const [roomMembers, setRoomMembers] = useState<VoiceMember[]>([]);
  /** sync 判定被其它窗口接管 */
  const [evicted, setEvicted] = useState(false);

  const controlsRef = useRef<MeetingControls | null>(null);
  const busyRef = useRef(false);
  /** join 代际号：leave/卸载时自增，使进行中的 join 异步续段全部作废 */
  const joinGenRef = useRef(0);
  const syncTimerRef = useRef<number | null>(null);
  const joinWatchdogRef = useRef<number | null>(null);
  // 主动离开/切换房间时置位：MeetingHost 卸载触发的 onLeft 不应被当作断连
  const suppressNextLeftRef = useRef(false);
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

  const stopSync = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  const disarmJoinWatchdog = useCallback(() => {
    if (joinWatchdogRef.current !== null) {
      window.clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }
  }, []);

  /** join 失败/被接管回滚 */
  const rollbackJoin = useCallback(
    (channelId: string) => {
      stopSync();
      setRoomMembers([]);
      void api
        .post(
          "/api/voice/leave",
          { sessionId: getVoiceSessionId() },
          { keepalive: true },
        )
        .catch(() => {});
      setChannel((current) => (current?.id === channelId ? null : current));
      setStatus("error");
    },
    [stopSync],
  );

  /**
   * join 失败统一收尾（SDK onError / 看门狗超时共用，借助 watchdog 句柄单次生效）：
   * 回滚本地状态，并轮换房间——下一次加入将拿到全新房间。
   */
  const failJoin = useCallback(
    (channelId: string) => {
      if (joinWatchdogRef.current === null) return;
      disarmJoinWatchdog();
      rollbackJoin(channelId);
      void api.post("/api/rtc/rooms", { channelId, rotate: true }).catch(() => {});
      toast.error("加入语音房失败，请重试");
    },
    [disarmJoinWatchdog, rollbackJoin],
  );

  // 布局卸载（退出登录等）：作废进行中的 join、停心跳并尽力离房，防止幽灵占用
  useEffect(() => {
    return () => {
      joinGenRef.current += 1;
      stopSync();
      void api
        .post(
          "/api/voice/leave",
          { sessionId: getVoiceSessionId() },
          { keepalive: true },
        )
        .catch(() => {});
    };
  }, [stopSync]);

  /* ---------------- 心跳 ---------------- */

  const startSync = useCallback(
    (targetChannelId: string, sessionId: string) => {
      stopSync();
      const tick = async () => {
        try {
          const r = await api.post<{ members: VoiceMember[]; evicted: boolean }>(
            "/api/voice/sync",
            { channelId: targetChannelId, sessionId },
          );
          if (r.evicted) {
            setEvicted(true);
            return;
          }
          setRoomMembers(r.members);
        } catch {
          /* 网络抖动忽略，下个周期重试 */
        }
      };
      void tick();
      syncTimerRef.current = window.setInterval(() => void tick(), SYNC_INTERVAL_MS);
    },
    [stopSync],
  );

  /* ---------------- 入会 ---------------- */

  const join = useCallback(
    (target: VoiceChannelRef) => {
      if (busyRef.current) return;
      if (channel?.id === target.id && (status === "live" || status === "presence")) return;
      busyRef.current = true;
      const gen = ++joinGenRef.current;
      const sessionId = getVoiceSessionId();

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
            sessionId,
          });
          if (gen !== joinGenRef.current) return;
          setRoomMembers(state.members);
          startSync(target.id, sessionId);

          const room = await api.post<RtcRoomResult>("/api/rtc/rooms", {
            channelId: target.id,
          });
          if (gen !== joinGenRef.current) return;
          if (room.rtcConfigured && room.meetingId) {
            const { token } = await api.post<{ token: string }>("/api/rtc/token", {
              meetingId: room.meetingId,
            });
            if (gen !== joinGenRef.current) return;
            setMeeting({ meetingId: room.meetingId, token });
            // join 失败看门狗：SDK onError 或 15s 未完成入会则回滚并轮换房间
            joinWatchdogRef.current = window.setTimeout(
              () => failJoin(target.id),
              JOIN_WATCHDOG_MS,
            );
            // status 保持 connecting，onJoined 后转 live
          } else {
            setStatus("presence");
            toast.info("VideoSDK 未配置：已进入仅在线模式（无实际音频）");
            busyRef.current = false;
          }
        } catch (error) {
          if (gen !== joinGenRef.current) return;
          rollbackJoin(target.id);
          toast.error(error instanceof Error ? error.message : "加入语音房失败");
          busyRef.current = false;
        }
      })();
    },
    [channel, status, startSync, markSuppressed, failJoin],
  );

  /* ---------------- 离会 / 断连 ---------------- */

  const leave = useCallback(() => {
    joinGenRef.current += 1;
    busyRef.current = false;
    disarmJoinWatchdog();
    markSuppressed();
    controlsRef.current?.leave();
    controlsRef.current = null;
    stopSync();
    void api
      .post("/api/voice/leave", { sessionId: getVoiceSessionId() })
      .catch(() => {});
    setMeeting(null);
    setChannel(null);
    setRoomMembers([]);
    setStatus("idle");
  }, [markSuppressed, stopSync, disarmJoinWatchdog]);

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
      void api
        .post("/api/voice/leave", { sessionId: getVoiceSessionId() }, { keepalive: true })
        .catch(() => {});
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
      void api
        .post("/api/voice/mic-state", {
          channelId: channel.id,
          sessionId: getVoiceSessionId(),
          micOn: next,
        })
        .catch(() => {});
      setRoomMembers((list) =>
        list.map((m) => (m.id === me.id ? { ...m, micOn: next } : m)),
      );
    }
  }, [me.id, channel, micOn]);

  // 被其它窗口接管时本地干净退出（房间行已归新窗口所有）
  useEffect(() => {
    if (!evicted) return;
    setEvicted(false);
    toast.info("语音已在其他窗口接入");
    leave();
  }, [evicted, leave]);

  // 页面刷新/关闭时尽力通知离房（keepalive 保证送达）
  useEffect(() => {
    if (!channel) return;
    const onHide = () => {
      void api
        .post(
          "/api/voice/leave",
          { sessionId: getVoiceSessionId() },
          { keepalive: true },
        )
        .catch(() => {});
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [channel]);

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
          key={meeting.meetingId}
          meetingId={meeting.meetingId}
          token={meeting.token}
          displayName={me.displayName}
          micOn={micOn}
          onJoined={() => {
            disarmJoinWatchdog();
            setStatus("live");
          }}
          onLeft={handleMeetingLeft}
          onJoinError={() => {
            if (channel) failJoin(channel.id);
          }}
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
