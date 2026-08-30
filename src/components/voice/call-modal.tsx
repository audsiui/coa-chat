"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { useCall } from "./call-provider";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/types";

const MeetingHost = dynamic(() => import("./meeting-host"), { ssr: false });
// 含 react-sdk（浏览器专用求值），只能客户端加载
const CallStage = dynamic(() => import("./call-stage"), { ssr: false });

/** 来电/去电/通话弹窗（由 CallProvider 渲染，token 就绪后挂入 MeetingHost） */
export function CallModal({ me }: { me: PublicUser }) {
  const ctx = useCall();
  const call = ctx.call;
  if (!call) return null;

  const kindLabel = call.kind === "video" ? "视频" : "语音";
  const inMeeting = call.phase !== "ringing";
  const showMeeting = inMeeting && Boolean(ctx.token);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex w-[380px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 rounded-2xl bg-card p-6 ring-1 ring-border">
        <AvatarInitials name={call.peer.displayName} color={call.peer.avatarColor} size="lg" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-lg font-semibold">{call.peer.displayName}</span>
          {call.phase === "ringing" && call.role === "callee" && (
            <span className="text-sm text-muted-foreground">邀请你进行{kindLabel}通话</span>
          )}
          {call.phase === "ringing" && call.role === "caller" && (
            <span className="animate-pulse text-sm text-muted-foreground">正在等待对方接受…</span>
          )}
          {call.phase === "connecting" && (
            <span className="text-sm text-muted-foreground">正在接通…</span>
          )}
          {call.phase === "active" && ctx.startedAt && <CallTimer startedAt={ctx.startedAt} />}
        </div>

        {call.kind === "video" && (
          <div className="min-h-[140px] w-full">
            {showMeeting && (
              <MeetingHost
                meetingId={call.meetingId}
                token={ctx.token!}
                displayName={me.displayName}
                micOn={ctx.micOn}
                camOn={ctx.camOn}
                onJoined={ctx.onMeetingJoined}
                onLeft={ctx.onMeetingLeft}
                onControls={ctx.registerControls}
              >
                <CallStage camOn={ctx.camOn} />
              </MeetingHost>
            )}
          </div>
        )}

        {call.kind === "audio" && showMeeting && (
          <MeetingHost
            meetingId={call.meetingId}
            token={ctx.token!}
            displayName={me.displayName}
            micOn={ctx.micOn}
            camOn={false}
            onJoined={ctx.onMeetingJoined}
            onLeft={ctx.onMeetingLeft}
            onControls={ctx.registerControls}
          />
        )}

        <div className="flex items-center gap-3">
          {call.phase === "ringing" && call.role === "callee" ? (
            <>
              <Button
                size="icon-lg"
                className="size-12 rounded-full bg-success text-white hover:bg-success/80"
                aria-label="接听"
                onClick={() => void ctx.accept()}
              >
                <Phone className="size-5" />
              </Button>
              <Button
                size="icon-lg"
                className="size-12 rounded-full bg-destructive text-white hover:bg-destructive/80"
                aria-label="拒绝"
                onClick={() => void ctx.reject()}
              >
                <PhoneOff className="size-5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="icon-lg"
                className={cn("size-11 rounded-full", !ctx.micOn && "text-destructive")}
                aria-label={ctx.micOn ? "关闭麦克风" : "开启麦克风"}
                onClick={ctx.toggleMic}
              >
                {ctx.micOn ? <Mic /> : <MicOff />}
              </Button>
              {call.kind === "video" && (
                <Button
                  variant="secondary"
                  size="icon-lg"
                  className={cn("size-11 rounded-full", !ctx.camOn && "text-destructive")}
                  aria-label={ctx.camOn ? "关闭摄像头" : "开启摄像头"}
                  onClick={ctx.toggleCam}
                >
                  {ctx.camOn ? <Video /> : <VideoOff />}
                </Button>
              )}
              <Button
                size="icon-lg"
                className="size-12 rounded-full bg-destructive text-white hover:bg-destructive/80"
                aria-label="挂断"
                onClick={ctx.hangup}
              >
                <PhoneOff className="size-5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const base = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const t0 = Date.now();
    setSeconds(base);
    const timer = window.setInterval(() => {
      setSeconds(base + Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="font-mono text-sm text-muted-foreground">
      {mm}:{ss}
    </span>
  );
}
