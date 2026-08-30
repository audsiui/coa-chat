"use client";

import { useEffect, useRef } from "react";
import { useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { toMediaStream } from "./streams";

/**
 * 通话画面网格（音频通话返回 null）。
 * 必须渲染在 MeetingHost（MeetingProvider）内部才能取到参会者。
 * 本模块含 react-sdk，只能经 next/dynamic ssr:false 加载。
 */
export default function CallStage({ camOn }: { camOn: boolean }) {
  const { participants } = useMeeting();
  if (!camOn) return null;
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {[...participants.keys()].map((id) => (
        <VideoTile key={id} participantId={id} />
      ))}
    </div>
  );
}

function VideoTile({ participantId }: { participantId: string }) {
  const { webcamStream, webcamOn, isLocal, displayName } = useParticipant(participantId);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = toMediaStream(webcamStream);
  }, [webcamStream]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black/60">
      {webcamOn ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={isLocal}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          摄像头未开启
        </div>
      )}
      <span className="absolute bottom-1 left-1.5 text-[11px] text-white/80">
        {isLocal ? "我" : displayName}
      </span>
    </div>
  );
}
