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
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { ev } from "@/lib/constants";
import { useUserEvent } from "@/components/providers/pusher-provider";
import type { CallKind, PublicUser } from "@/lib/types";
import { CallModal } from "./call-modal";

type CallPhase = "ringing" | "connecting" | "active";

export type CallState = {
  callId: string;
  meetingId: string;
  kind: CallKind;
  role: "caller" | "callee";
  peer: PublicUser;
  phase: CallPhase;
};

type CallContextValue = {
  call: CallState | null;
  token: string | null;
  micOn: boolean;
  camOn: boolean;
  startedAt: number | null;
  startCall: (peer: PublicUser, kind: CallKind) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  hangup: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  registerControls: (controls: { toggleMic: () => void; toggleCam: () => void; leave: () => void } | null) => void;
  onMeetingJoined: () => void;
  onMeetingLeft: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

type IncomingPayload = {
  callId: string;
  meetingId: string;
  kind: CallKind;
  from: PublicUser;
};
type SignalPayload = { callId: string; from: { id: string } };

export function CallProvider({ me, children }: { me: PublicUser; children: React.ReactNode }) {
  const [call, setCall] = useState<CallState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const controlsRef = useRef<{ toggleMic: () => void; toggleCam: () => void; leave: () => void } | null>(null);
  const callRef = useRef<CallState | null>(null);
  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const clear = useCallback(() => {
    controlsRef.current = null;
    setCall(null);
    setToken(null);
    setStartedAt(null);
  }, []);

  // 页面关闭/布局卸载（登出等）：尽力终结通话，否则对端响铃或"通话中"永久挂死
  useEffect(() => {
    const terminate = () => {
      const c = callRef.current;
      if (!c) return;
      void api
        .post(`/api/calls/${c.callId}/end`, { peerUserId: c.peer.id }, { keepalive: true })
        .catch(() => {});
    };
    window.addEventListener("pagehide", terminate);
    return () => {
      window.removeEventListener("pagehide", terminate);
      terminate();
    };
  }, []);

  /* ---------------- 信令事件 ---------------- */

  useUserEvent<IncomingPayload>(ev.callIncoming, (d) => {
    if (callRef.current) {
      void api
        .post(`/api/calls/${d.callId}/respond`, { toUserId: d.from.id, action: "reject" })
        .catch(() => {});
      toast.info(`${d.from.displayName} 的来电已自动拒绝（通话中）`);
      return;
    }
    setCall({
      callId: d.callId,
      meetingId: d.meetingId,
      kind: d.kind,
      role: "callee",
      peer: d.from,
      phase: "ringing",
    });
    setMicOn(true);
    setCamOn(d.kind === "video");
  });

  useUserEvent<SignalPayload>(ev.callAccepted, (d) => {
    const c = callRef.current;
    if (c?.role === "caller" && c.callId === d.callId) {
      setCall({ ...c, phase: "connecting" });
    }
  });

  useUserEvent<SignalPayload>(ev.callRejected, (d) => {
    const c = callRef.current;
    if (c?.role === "caller" && c.callId === d.callId) {
      toast.info("对方已拒绝通话");
      clear();
    }
  });

  useUserEvent<{ callId: string }>(ev.callEnded, (d) => {
    const c = callRef.current;
    if (c?.callId === d.callId) {
      toast.info("通话已结束");
      clear();
    }
  });

  /* ---------------- 被叫响铃超时（主叫可能已崩溃，无 end 信令可收） ---------------- */

  useEffect(() => {
    if (call?.phase !== "ringing" || call.role !== "callee") return;
    const timer = window.setTimeout(() => {
      const c = callRef.current;
      if (c?.phase !== "ringing" || c.role !== "callee") return;
      toast.info("未响应，已自动挂断");
      void api
        .post(`/api/calls/${c.callId}/respond`, { toUserId: c.peer.id, action: "reject" })
        .catch(() => {});
      clear();
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [call?.phase, call?.role, call?.callId, clear]);

  /* ---------------- 主叫 45 秒无应答自动取消 ---------------- */

  useEffect(() => {
    if (call?.phase !== "ringing" || call.role !== "caller") return;
    const timer = window.setTimeout(() => {
      const c = callRef.current;
      if (c?.phase !== "ringing" || c.role !== "caller") return;
      void api.post(`/api/calls/${c.callId}/end`, { peerUserId: c.peer.id }).catch(() => {});
      toast.info("无人接听");
      clear();
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [call?.phase, call?.role, call?.callId, clear]);

  /* ---------------- 接通超时：对端取消/信令丢失时收尾 ---------------- */

  useEffect(() => {
    if (call?.phase !== "connecting") return;
    const timer = window.setTimeout(() => {
      const c = callRef.current;
      if (c?.phase !== "connecting") return;
      toast.info("对方未能接通，通话已结束");
      void api.post(`/api/calls/${c.callId}/end`, { peerUserId: c.peer.id }).catch(() => {});
      controlsRef.current?.leave();
      clear();
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [call?.phase, call?.callId, clear]);

  /* ---------------- 接通后取入会 token ---------------- */

  useEffect(() => {
    if (call?.phase !== "connecting" || token) return;
    let cancelled = false;
    void (async () => {
      try {
        const { token: t } = await api.post<{ token: string }>("/api/rtc/token", {
          meetingId: call.meetingId,
        });
        if (!cancelled) setToken(t);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "接通失败");
        clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [call?.phase, call?.meetingId, token, clear]);

  /* ---------------- 动作 ---------------- */

  const startCall = useCallback(async (peer: PublicUser, kind: CallKind) => {
    if (callRef.current) {
      toast.warning("当前正在通话中");
      return;
    }
    try {
      const res = await api.post<{ callId: string; meetingId: string }>("/api/calls", {
        toUserId: peer.id,
        kind,
      });
      setCall({
        callId: res.callId,
        meetingId: res.meetingId,
        kind,
        role: "caller",
        peer,
        phase: "ringing",
      });
      setMicOn(true);
      setCamOn(kind === "video");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发起通话失败");
    }
  }, []);

  const accept = useCallback(async () => {
    const c = callRef.current;
    // 先行置为 connecting：既是状态转移，也天然防双击重复应答
    if (!c || c.role !== "callee" || c.phase !== "ringing") return;
    setCall({ ...c, phase: "connecting" });
    try {
      await api.post(`/api/calls/${c.callId}/respond`, {
        toUserId: c.peer.id,
        action: "accept",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "接听失败");
      clear();
    }
  }, [clear]);

  const reject = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    void api
      .post(`/api/calls/${c.callId}/respond`, { toUserId: c.peer.id, action: "reject" })
      .catch(() => {});
    clear();
  }, [clear]);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    void api.post(`/api/calls/${c.callId}/end`, { peerUserId: c.peer.id }).catch(() => {});
    controlsRef.current?.leave();
    clear();
  }, [clear]);

  const toggleMic = useCallback(() => {
    controlsRef.current?.toggleMic();
    setMicOn((p) => !p);
  }, []);

  const toggleCam = useCallback(() => {
    controlsRef.current?.toggleCam();
    setCamOn((p) => !p);
  }, []);

  const registerControls = useCallback(
    (c: { toggleMic: () => void; toggleCam: () => void; leave: () => void } | null) => {
      controlsRef.current = c;
    },
    [],
  );

  const onMeetingJoined = useCallback(() => {
    setCall((c) => (c ? { ...c, phase: "active" } : c));
    setStartedAt(Date.now());
  }, []);

  // 本地掉线兜底；对端挂断走 call:ended 信令
  const onMeetingLeft = useCallback(() => {
    const c = callRef.current;
    if (c && c.phase === "active") {
      toast.info("通话连接已断开");
      clear();
    }
  }, [clear]);

  const value = useMemo<CallContextValue>(
    () => ({
      call,
      token,
      micOn,
      camOn,
      startedAt,
      startCall,
      accept,
      reject,
      hangup,
      toggleMic,
      toggleCam,
      registerControls,
      onMeetingJoined,
      onMeetingLeft,
    }),
    [
      call,
      token,
      micOn,
      camOn,
      startedAt,
      startCall,
      accept,
      reject,
      hangup,
      toggleMic,
      toggleCam,
      registerControls,
      onMeetingJoined,
      onMeetingLeft,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallModal me={me} />
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall 必须在 CallProvider 内使用");
  return ctx;
}
