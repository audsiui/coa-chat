"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { toMediaStream } from "./streams";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import type { PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";

type WebcamInfo = { deviceId: string; label: string; facingMode: "front" | "environment" };
type MicInfo = { deviceId: string; label: string };
type Quality = "low" | "med" | "high";

const QUALITY_OPTIONS: Array<{ value: Quality; label: string; hint: string }> = [
  { value: "low", label: "流畅", hint: "省流量" },
  { value: "med", label: "标清", hint: "均衡" },
  { value: "high", label: "高清", hint: "最清晰" },
];

/** 发送画质 → 采集约束（用新约束取流后经 changeWebcam 交给 SDK 广播，免重连） */
const UPSTREAM_PRESETS: Record<Quality, MediaTrackConstraints> = {
  low: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
  med: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } },
  high: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
};

/**
 * 视频通话舞台（微信式布局，须渲染在 MeetingHost 内部）：
 * - 对方画面铺满（对方关摄像头时显示占位）
 * - 我的画面为右上角画中画（我方关摄像头时显示占位，不影响对方画面）
 * - 齿轮面板：接收画质（simulcast setQuality）/ 摄像头切换 / 麦克风切换
 */
export default function CallStage({
  camOn,
  peer,
  meName,
  meColor,
}: {
  camOn: boolean;
  peer: PublicUser;
  meName: string;
  meColor: string;
}) {
  const { participants } = useMeeting();
  const entries = [...participants.values()];
  // participants 集合的元素用 local 字段（useParticipant 钩子才是 isLocal）
  const remote = entries.find((p) => !p.local);
  const local = entries.find((p) => p.local);

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
            <AvatarInitials name={meName} color={meColor} size="sm" />
            <span className="text-[11px] text-white/50">摄像头已关闭</span>
          </div>
        )}
      </div>

      <CallSettingsPanel />
    </div>
  );
}

/* ---------------- 通话设置：画质 / 摄像头 / 麦克风 ---------------- */

function CallSettingsPanel() {
  const { getWebcams, getMics, changeWebcam, changeMic, participants, localParticipant } =
    useMeeting();
  const [open, setOpen] = useState(false);
  const [cams, setCams] = useState<WebcamInfo[]>([]);
  const [mics, setMics] = useState<MicInfo[]>([]);
  const [activeCam, setActiveCam] = useState<string | null>(null);
  const [activeMic, setActiveMic] = useState<string | null>(null);
  const [quality, setQualityState] = useState<Quality>("high");
  /** 我发出的画质："default" 为入会默认，选择后用自定义约束重新采集并替换轨道 */
  const [upQuality, setUpQuality] = useState<Quality | "default">("default");
  const [switching, setSwitching] = useState(false);
  const myStreamRef = useRef<MediaStream | null>(null);

  // 画质变化或新的远端加入时，对该远端应用接收画质
  useEffect(() => {
    participants.forEach((p) => {
      if (!p.local) void p.setQuality(quality);
    });
  }, [participants, quality]);

  const loadDevices = useCallback(async () => {
    try {
      const [webcamList, micList] = await Promise.all([getWebcams(), getMics()]);
      setCams(webcamList);
      setMics(micList);
    } catch {
      /* 设备枚举失败时面板显示空列表 */
    }
  }, [getWebcams, getMics]);

  useEffect(() => {
    if (open) void loadDevices();
  }, [open, loadDevices]);

  const applyUpstreamQuality = useCallback(
    async (q: Quality) => {
      if (switching) return;
      setSwitching(true);
      try {
        // 用新分辨率约束重新取流，交给 SDK 替换广播轨道（免重连）
        const stream = await navigator.mediaDevices.getUserMedia({ video: UPSTREAM_PRESETS[q] });
        await changeWebcam(stream);
        // 成功后停掉上一条由我们自己创建的旧轨，避免摄像头占用泄漏
        myStreamRef.current?.getTracks().forEach((t) => t.stop());
        myStreamRef.current = stream;
        setUpQuality(q);
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? `切换失败：${error.message}`
            : "切换失败，请重试",
        );
      } finally {
        setSwitching(false);
      }
    },
    [changeWebcam, switching],
  );

  const camAvailable = localParticipant?.webcamOn ?? false;

  return (
    <>
      <button
        type="button"
        aria-label="通话设置"
        title="通话设置"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "absolute left-3 top-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60 sm:left-5 sm:top-5",
          open && "bg-white/25",
        )}
      >
        <Settings className="size-4" />
      </button>

      {open && (
        <div className="absolute left-3 top-16 z-20 w-64 rounded-xl bg-black/75 p-3 text-[13px] text-white shadow-2xl backdrop-blur-md sm:left-5 sm:top-[4.5rem]">
          <SettingsSection label="画质（接收）">
            <div className="flex gap-1.5">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => setQualityState(q.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-center transition-colors",
                    quality === q.value
                      ? "border-white/70 bg-white/15"
                      : "border-white/15 hover:bg-white/10",
                  )}
                >
                  <span className="block font-medium">{q.label}</span>
                  <span className="block text-[10px] text-white/50">{q.hint}</span>
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            label={
              switching
                ? "画质（发送）— 切换中…"
                : camAvailable
                  ? "画质（发送）"
                  : "画质（发送）— 开启摄像头后可调"
            }
          >
            <div className="flex gap-1.5">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  disabled={!camAvailable || switching}
                  onClick={() => void applyUpstreamQuality(q.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-center transition-colors",
                    upQuality === q.value
                      ? "border-[#7dd3fc] bg-[#7dd3fc]/15"
                      : "border-white/15 hover:bg-white/10",
                    (!camAvailable || switching) && "pointer-events-none opacity-40",
                  )}
                >
                  <span className="block font-medium">{q.label}</span>
                  <span className="block text-[10px] text-white/50">
                    {q.value === "low" ? "360p" : q.value === "med" ? "540p" : "720p"}
                  </span>
                </button>
              ))}
            </div>
            {upQuality === "default" && camAvailable && (
              <p className="mt-1 text-[10px] text-white/40">当前为入会默认画质</p>
            )}
          </SettingsSection>

          <SettingsSection label="摄像头">
            {cams.length <= 1 ? (
              <p className="text-white/50">
                {cams.length === 0 ? "未检测到摄像头" : "只有一个摄像头"}
                {cams[0]?.facingMode && cams.length === 1
                  ? cams[0].facingMode === "environment"
                    ? "（后置）"
                    : "（前置）"
                  : ""}
              </p>
            ) : (
              <ul className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                {cams.map((c) => (
                  <li key={c.deviceId}>
                    <button
                      type="button"
                      onClick={() => {
                        void changeWebcam(c.deviceId);
                        setActiveCam(c.deviceId);
                      }}
                      className={cn(
                        "w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-white/10",
                        activeCam === c.deviceId && "text-[#7dd3fc]",
                      )}
                    >
                      {c.label ||
                        (c.facingMode === "environment" ? "后置摄像头" : "前置摄像头")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SettingsSection>

          <SettingsSection label="麦克风">
            {mics.length <= 1 ? (
              <p className="text-white/50">
                {mics.length === 0 ? "未检测到麦克风" : "只有一个麦克风"}
              </p>
            ) : (
              <ul className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                {mics.map((mi) => (
                  <li key={mi.deviceId}>
                    <button
                      type="button"
                      onClick={() => {
                        void changeMic(mi.deviceId);
                        setActiveMic(mi.deviceId);
                      }}
                      className={cn(
                        "w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-white/10",
                        activeMic === mi.deviceId && "text-[#7dd3fc]",
                      )}
                    >
                      {mi.label || "麦克风"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SettingsSection>
        </div>
      )}
    </>
  );
}

function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-white/50 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ---------------- 画面渲染 ---------------- */

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
