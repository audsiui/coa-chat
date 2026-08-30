"use client";

import { useEffect, useRef } from "react";
import { useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { toMediaStream } from "./streams";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import type { PublicUser } from "@/lib/types";

/**
 * 视频通话舞台（微信式布局，须渲染在 MeetingHost 内部）：
 * - 对方画面铺满（对方关摄像头时显示占位）
 * - 我的画面为右上角画中画（我方关摄像头时显示占位，不影响对方画面）
 */
export default function CallStage({
  camOn,
  peer,
  meName,
}: {
  camOn: boolean;
  peer: PublicUser;
  meName: string;
}) {
  const { participants } = useMeeting();
  const entries = [...participants.values()];
  const remote = entries.find((p) => !p.isLocal);
  const local = entries.find((p) => p.isLocal);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0c0e]">
      {/* 对方大画面 */}
      {remote ? (
        <RemoteBigView participantId={remote.id} fallbackName={remote.displayName} />
      ) : (
        <CenterHint name={peer.displayName} color={peer.avatarColor} text="等待对方加入…" />
      )}

      {/* 我的画中画 */}
      <div className="absolute right-3 top-3 aspect-video w-28 overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl sm:right-5 sm:top-5 sm:w-44">
        {camOn && local ? (
          <LocalVideo participantId={local.id} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
            <AvatarInitials name={meName} color={me.avatarColor} size="sm" />
            <span className="text-[11px] text-white/50">摄像头已关闭</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 对方大画面：铺满舞台 */
function RemoteBigView({
  participantId,
  fallbackName,
}: {
  participantId: string;
  fallbackName: string;
}) {
  const { webcamStream, webcamOn } = useParticipant(participantId);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = toMediaStream(webcamStream);
  }, [webcamStream]);

  if (webcamOn) {
    return <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />;
  }
  return <CenterHint name={fallbackName} color="#5865f2" text="对方摄像头未开启" />;
}

function LocalVideo({ participantId }: { participantId: string }) {
  const { webcamStream } = useParticipant(participantId);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = toMediaStream(webcamStream);
  }, [webcamStream]);

  return <video ref={ref} autoPlay playsInline muted className="h-full w-full object-cover" />;
}

function CenterHint({
  name,
  color,
  text,
}: {
  name: string;
  color: string;
  text: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#15161a] to-[#0b0c0e]">
      <AvatarInitials name={name} color={color} size="lg" />
      <span className="text-sm text-white/60">{text}</span>
    </div>
  );
}
