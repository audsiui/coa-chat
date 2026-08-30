"use client";

import { Mic, MicOff, PhoneOff, Signal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useVoice } from "./voice-provider";

/** 侧栏底部的语音状态条：连接状态、成员、麦克风与挂断 */
export function VoicePanel() {
  const voice = useVoice();
  if (!voice.channel) return null;

  const statusLabel =
    voice.status === "connecting"
      ? "连接中…"
      : voice.status === "live"
        ? "已连接"
        : voice.status === "presence"
          ? "仅在线"
          : voice.status === "error"
            ? "已断开"
            : "";

  return (
    <div className="border-t border-border bg-rail px-2 py-2">
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-success">
            <Signal className="size-4 shrink-0" />
            <span className="truncate">{voice.channel.name}</span>
          </div>
          <div className="flex items-center gap-1.5 pl-5.5 text-xs text-muted-foreground">
            <span className="truncate">{voice.channel.serverName}</span>
            {voice.status === "connecting" && <Spinner className="size-3" />}
            {voice.status === "presence" && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] text-warning">
                仅在线
              </Badge>
            )}
            {voice.status === "live" && (
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
            )}
            {voice.status !== "connecting" && voice.status !== "presence" && voice.status !== "live" && (
              <span>{statusLabel}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={voice.micOn ? "关闭麦克风" : "开启麦克风"}
            onClick={voice.toggleMic}
            className={voice.micOn ? "text-foreground" : "text-destructive"}
          >
            {voice.micOn ? <Mic /> : <MicOff />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="离开语音房"
            onClick={voice.leave}
            className="text-destructive hover:bg-destructive/20"
          >
            <PhoneOff />
          </Button>
        </div>
      </div>

      {voice.members.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
          {voice.members.map((m) => (
            <div key={m.id} className="relative">
              <AvatarInitials name={m.displayName} color={m.avatarColor} size="sm" />
              {!m.micOn && (
                <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-rail">
                  <MicOff className="size-2.5 text-destructive" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
