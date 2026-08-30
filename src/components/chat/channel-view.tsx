"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { useServerData } from "./server-data-provider";
import { ChatView } from "./chat-view";
import { MemberList } from "./member-list";
import { Spinner } from "@/components/ui/spinner";

/** 文字频道聊天页 */
export function ChannelView({
  me,
  serverId,
  channelId,
}: {
  me: PublicUser;
  serverId: string;
  channelId: string;
}) {
  const { detail, loading } = useServerData();
  const router = useRouter();
  const channel = detail?.channels.find((c) => c.id === channelId);

  useEffect(() => {
    if (!loading && detail && !channel) {
      void router.replace(`/chat/server/${serverId}`);
    }
  }, [loading, detail, channel, router, serverId]);

  useEffect(() => {
    // 语音频道不进入聊天视图（交互在侧栏完成）
    if (channel?.type === "voice") {
      void router.replace(`/chat/server/${serverId}`);
    }
  }, [channel, router, serverId]);

  if (loading || !channel || channel.type === "voice") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1">
      <ChatView
        me={me}
        title={channel.name}
        titleIcon={<Hash className="size-5 shrink-0 text-muted-foreground" />}
        subtitle={channel.topic ?? undefined}
        fetchUrl={`/api/channels/${channelId}/messages?limit=50`}
        sendUrl={`/api/channels/${channelId}/messages`}
        realtimeChannel={`private-channel-${channelId}`}
        emptyHint={`这里是 ${channel.name} 频道的起点，发出第一条消息吧`}
      />
      <MemberList me={me} />
    </div>
  );
}
