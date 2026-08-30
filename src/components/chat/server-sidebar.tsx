"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Hash, MicOff, Plus, UserRoundPlus, Volume2 } from "lucide-react";
import type { ChannelDTO, PublicUser, VoiceMember } from "@/lib/types";
import { useServerData } from "./server-data-provider";
import { CreateChannelDialog } from "./create-channel-dialog";
import { InviteDialog } from "./invite-dialog";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVoice } from "@/components/voice/voice-provider";
import { useUnread } from "@/hooks/use-unread";
import { cn } from "@/lib/utils";

/** 服务器频道侧栏（文字频道 + 语音频道） */
export function ServerSidebar({ me }: { me: PublicUser }) {
  const { detail, loading, error, refresh } = useServerData();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-accent" />
        ))}
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-sm text-muted-foreground">
        <span>{error ?? "服务器信息加载失败"}</span>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          重试
        </Button>
      </div>
    );
  }

  const { server, channels } = detail;
  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  return (
    <div className="flex h-full flex-col">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex h-12 w-full items-center justify-between border-b border-border px-4 text-left font-semibold text-foreground hover:bg-accent"
            >
              <span className="truncate">{server.name}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setInviteOpen(true)}>
            <UserRoundPlus className="size-4" />
            邀请成员
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 弹窗必须渲染在菜单树之外：菜单关闭会卸载内容，嵌套触发器会被连带你掉 */}
      {detail && (
        <InviteDialog
          inviteCode={detail.server.inviteCode}
          serverName={detail.server.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <SectionLabel label="文字频道">
          <CreateChannelDialog serverId={server.id} defaultType="text" onDone={refresh}>
            <Button variant="ghost" size="icon-xs" aria-label="创建文字频道">
              <Plus />
            </Button>
          </CreateChannelDialog>
        </SectionLabel>
        <ul className="flex flex-col gap-0.5">
          {textChannels.map((c) => (
            <TextChannelItem key={c.id} channel={c} serverId={server.id} />
          ))}
        </ul>

        <SectionLabel label="语音频道">
          <CreateChannelDialog serverId={server.id} defaultType="voice" onDone={refresh}>
            <Button variant="ghost" size="icon-xs" aria-label="创建语音频道">
              <Plus />
            </Button>
          </CreateChannelDialog>
        </SectionLabel>
        <ul className="flex flex-col gap-0.5">
          {voiceChannels.map((c) => (
            <VoiceChannelItem key={c.id} channel={c} serverName={server.name} />
          ))}
        </ul>
      </div>
      <span className="sr-only">{me.username}</span>
    </div>
  );
}

function SectionLabel({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pt-3 pb-1 first:pt-0">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function TextChannelItem({ channel, serverId }: { channel: ChannelDTO; serverId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { channelUnread } = useUnread();
  const unread = channelUnread[channel.id] ?? 0;
  const active = pathname === `/chat/server/${serverId}/${channel.id}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => router.push(`/chat/server/${serverId}/${channel.id}`)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
          active
            ? "bg-accent text-foreground"
            : unread > 0
              ? "font-semibold text-foreground hover:bg-accent"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Hash className="size-4 shrink-0 opacity-70" />
        <span className="truncate">{channel.name}</span>
        {unread > 0 && (
          <span className="ml-auto flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </li>
  );
}

function VoiceChannelItem({
  channel,
  serverName,
}: {
  channel: ChannelDTO;
  serverName: string;
}) {
  const router = useRouter();
  const voice = useVoice();
  const { voiceStates } = useServerData();
  // 名单来自 DB 占用状态（join/leave/心跳），不再订阅 presence
  const members = voiceStates
    .filter((s) => s.channelId === channel.id)
    .map((s) => ({ id: s.userId, displayName: s.displayName, avatarColor: s.avatarColor, micOn: s.micOn }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh"));
  const active = voice.channel?.id === channel.id;

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (!active) voice.join({ id: channel.id, name: channel.name, serverName });
          router.push(`/chat/server/${channel.serverId}`);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Volume2 className="size-4 shrink-0 opacity-70" />
        <span className="truncate">{channel.name}</span>
        {members.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{members.length}</span>
        )}
      </button>
      {members.length > 0 && (
        <ul className="mb-1 ml-6 flex flex-col gap-0.5">
          {members.map((m) => (
            <VoiceMemberRow key={m.id} member={m} />
          ))}
        </ul>
      )}
    </li>
  );
}

function VoiceMemberRow({ member }: { member: VoiceMember }) {
  return (
    <li className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground">
      <AvatarInitials name={member.displayName} color={member.avatarColor} size="xs" />
      <span className="truncate">{member.displayName}</span>
      {!member.micOn && <MicOff className="ml-auto size-3 shrink-0 text-destructive" />}
    </li>
  );
}
