"use client";

import { useEffect, useRef, useState } from "react";
import { MeetingProvider, useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { toMediaStream } from "./streams";

export type MeetingControls = {
  toggleMic: () => void;
  toggleCam: () => void;
  leave: () => void;
};

type MeetingHostProps = {
  meetingId: string;
  token: string;
  displayName: string;
  micOn: boolean;
  camOn?: boolean;
  onJoined?: () => void;
  onLeft?: () => void;
  onControls?: (controls: MeetingControls) => void;
  children?: React.ReactNode;
};

/** 挂载即自动入会；向父级暴露控制句柄；卸载时确保断开会议连接 */
function JoinAndRegister({
  onJoined,
  onLeft,
  onControls,
}: Pick<MeetingHostProps, "onJoined" | "onLeft" | "onControls">) {
  const { leave, toggleMic, toggleWebcam } = useMeeting({
    onMeetingJoined: onJoined,
    onMeetingLeft: onLeft,
  });
  const methodsRef = useRef({ leave, toggleMic, toggleWebcam });

  useEffect(() => {
    methodsRef.current = { leave, toggleMic, toggleWebcam };
  });

  const registeredRef = useRef(false);
  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;
    onControls?.({ toggleMic, toggleCam: toggleWebcam, leave });
    // 卸载（含切换房间/退出登录）时必须断开，否则产生幽灵连接
    return () => {
      try {
        void methodsRef.current.leave();
      } catch {
        /* 已离开时的重复调用 */
      }
    };
    // 仅在挂载时注册一次控制句柄与卸载清理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** 自动播放所有远端成员的麦克风音频 */
function AudioLayer() {
  const { participants } = useMeeting();
  return (
    <>
      {[...participants.keys()].map((id) => (
        <ParticipantAudio key={id} participantId={id} />
      ))}
    </>
  );
}

function ParticipantAudio({ participantId }: { participantId: string }) {
  const { micStream, isLocal } = useParticipant(participantId);
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = isLocal ? null : toMediaStream(micStream);
  }, [micStream, isLocal]);

  if (isLocal) return null;
  return <audio ref={ref} autoPlay playsInline />;
}

/**
 * VideoSDK 会议宿主：MeetingProvider + 自动入会 + 远端音频。
 * config 只取挂载初值，麦克风/摄像头切换通过 controls 完成，避免重建会议。
 */
export default function MeetingHost({
  meetingId,
  token,
  displayName,
  micOn,
  camOn = false,
  onJoined,
  onLeft,
  onControls,
  children,
}: MeetingHostProps) {
  const [initial] = useState(() => ({
    meetingId,
    micEnabled: micOn,
    webcamEnabled: camOn,
  }));

  return (
    <MeetingProvider
      config={{
        meetingId: initial.meetingId,
        micEnabled: initial.micEnabled,
        webcamEnabled: initial.webcamEnabled,
        name: displayName,
        mode: "SEND_AND_RECV",
        multiStream: false,
        debugMode: false,
      }}
      token={token}
      joinWithoutUserInteraction
    >
      <JoinAndRegister onJoined={onJoined} onLeft={onLeft} onControls={onControls} />
      <AudioLayer />
      {children}
    </MeetingProvider>
  );
}
