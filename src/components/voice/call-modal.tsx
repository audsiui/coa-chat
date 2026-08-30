"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { useCall } from "./call-provider";
import type { PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const MeetingHost = dynamic(() => import("./meeting-host"), { ssr: false });
// 含 react-sdk（浏览器专用求值），只能客户端加载
const CallStage = dynamic(() => import("./call-stage"), { ssr: false });

/** 来电/去电/通话弹窗（由 CallProvider 渲染）。视频为微信式全屏布局，语音为卡片式。 */
export function CallModal({ me }: { me: PublicUser }) {
  const ctx = useCall();
  const call = ctx.call;
  if (!call) return null;
  return call.kind === "video" ? (
    <VideoCallLayout me={me} />
  ) : (
    <AudioCallLayout me={me} />
  );
}

/* ---------------- 视频通话：全屏沉浸（对方大画面 + 自己画中画） ---------------- */

function VideoCallLayout({ me }: { me: PublicUser }) {
  const ctx = useCall();
  const call = ctx.call!;
  const showMeeting = call.phase !== "ringing" && Boolean(ctx.token);
  const connecting = call.phase !== "active";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0c0e] text-white">
      {/* 舞台：对方大画面 + 我的画中画 */}
      <div className="relative min-h-0 flex-1">
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
            <CallStage camOn={ctx.camOn} peer={call.peer} meName={me.displayName} meColor={me.avatarColor} />
          </MeetingHost>
        )}

        {/* 顶部信息条 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 bg-gradient-to-b from-black/60 to-transparent pb-10 pt-6">
          <span className="text-base font-semibold">{call.peer.displayName}</span>
          {call.phase === "ringing" && call.role === "callee" && (
            <span className="text-sm text-white/70">邀请你进行视频通话</span>
          )}
          {call.phase === "ringing" && call.role === "caller" && (
            <span className="animate-pulse text-sm text-white/70">正在等待对方接受…</span>
          )}
          {call.phase === "connecting" && (
            <span className="text-sm text-white/70">正在接通…</span>
          )}
          {call.phase === "active" && ctx.startedAt && (
            <CallTimer startedAt={ctx.startedAt} />
          )}
        </div>

        {/* 未接通时居中的对方头像 */}
        {!showMeeting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <AvatarInitials
              name={call.peer.displayName}
              color={call.peer.avatarColor}
              size="lg"
              className="size-24"
            />
          </div>
        )}

        {/* 接通前的提示语（不遮挡接听操作） */}
        {connecting && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 text-center text-sm text-white/60">
            {call.phase === "ringing" && call.role === "caller"
              ? "对方屏幕上会显示来电提醒"
              : call.phase === "connecting"
                ? "正在建立媒体连接…"
                : ""}
          </div>
        )}
      </div>

      {/* 控制条 */}
      <div className="z-10 flex items-center justify-center gap-4 pb-9 pt-2">
        {call.phase === "ringing" && call.role === "callee" ? (
          <>
            <ControlButton
              label="接听"
              className="size-16 bg-success text-white hover:bg-success/80"
              onClick={() => void ctx.accept()}
            >
              <Phone className="size-6" />
            </ControlButton>
            <ControlButton
              label="拒绝"
              className="size-16 bg-destructive text-white hover:bg-destructive/80"
              onClick={() => void ctx.reject()}
            >
              <PhoneOff className="size-6" />
            </ControlButton>
          </>
        ) : (
          <>
            <ControlButton
              label={ctx.micOn ? "关闭麦克风" : "开启麦克风"}
              className={cn("size-14 bg-white/10 text-white hover:bg-white/20", !ctx.micOn && "bg-white/5 text-destructive")}
              onClick={ctx.toggleMic}
            >
              {ctx.micOn ? <Mic className="size-6" /> : <MicOff className="size-6" />}
            </ControlButton>
            <ControlButton
              label={ctx.camOn ? "关闭摄像头" : "开启摄像头"}
              className={cn("size-14 bg-white/10 text-white hover:bg-white/20", !ctx.camOn && "bg-white/5 text-destructive")}
              onClick={ctx.toggleCam}
            >
              {ctx.camOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
            </ControlButton>
            <ControlButton
              label="挂断"
              className="size-16 bg-destructive text-white hover:bg-destructive/80"
              onClick={ctx.hangup}
            >
              <PhoneOff className="size-6" />
            </ControlButton>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- 语音通话：卡片式 ---------------- */

function AudioCallLayout({ me }: { me: PublicUser }) {
  const ctx = useCall();
  const call = ctx.call!;
  const inMeeting = call.phase !== "ringing";
  const showMeeting = inMeeting && Boolean(ctx.token);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex w-[380px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 rounded-2xl bg-card p-6 ring-1 ring-border">
        <AvatarInitials name={call.peer.displayName} color={call.peer.avatarColor} size="lg" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-lg font-semibold">{call.peer.displayName}</span>
          {call.phase === "ringing" && call.role === "callee" && (
            <span className="text-sm text-muted-foreground">邀请你进行语音通话</span>
          )}
          {call.phase === "ringing" && call.role === "caller" && (
            <span className="animate-pulse text-sm text-muted-foreground">正在等待对方接受…</span>
          )}
          {call.phase === "connecting" && (
            <span className="text-sm text-muted-foreground">正在接通…</span>
          )}
          {call.phase === "active" && ctx.startedAt && <CallTimer startedAt={ctx.startedAt} />}
        </div>

        {showMeeting && (
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
              <ControlButton
                label="接听"
                className="size-14 bg-success text-white hover:bg-success/80"
                onClick={() => void ctx.accept()}
              >
                <Phone className="size-5" />
              </ControlButton>
              <ControlButton
                label="拒绝"
                className="size-14 bg-destructive text-white hover:bg-destructive/80"
                onClick={() => void ctx.reject()}
              >
                <PhoneOff className="size-5" />
              </ControlButton>
            </>
          ) : (
            <>
              <ControlButton
                label={ctx.micOn ? "关闭麦克风" : "开启麦克风"}
                variant="secondary"
                className={cn("size-12 rounded-full", !ctx.micOn && "text-destructive")}
                onClick={ctx.toggleMic}
              >
                {ctx.micOn ? <Mic /> : <MicOff />}
              </ControlButton>
              <ControlButton
                label="挂断"
                className="size-14 bg-destructive text-white hover:bg-destructive/80"
                onClick={ctx.hangup}
              >
                <PhoneOff className="size-5" />
              </ControlButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 公共 ---------------- */

function ControlButton({
  label,
  className,
  variant = "default",
  onClick,
  children,
}: {
  label: string;
  className?: string;
  variant?: "default" | "secondary";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={variant}
      size="icon-lg"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("rounded-full", className)}
    >
      {children}
    </Button>
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
  return <span className="font-mono text-sm text-white/80">{mm}:{ss}</span>;
}
