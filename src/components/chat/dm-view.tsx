"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Phone, Video } from "lucide-react";
import { ev } from "@/lib/constants";
import { swrFetcher } from "@/lib/client-api";
import { useUserEvent } from "@/components/providers/pusher-provider";
import { useCall } from "@/components/voice/call-provider";
import type { ConversationDTO, PublicUser } from "@/lib/types";
import { ChatView } from "./chat-view";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** 1 对 1 私聊页（含语音/视频通话入口） */
export function DmView({
  me,
  conversationId,
}: {
  me: PublicUser;
  conversationId: string;
}) {
  const router = useRouter();
  const call = useCall();
  const { data: conversationData, error, isLoading, mutate } = useSWR<ConversationDTO>(
    `/api/dms/${conversationId}`,
    swrFetcher,
  );
  // keepPreviousData 防串显：切换会话时旧会话数据不透传
  const conversation =
    conversationData && conversationData.id === conversationId ? conversationData : null;

  // 首条消息先于会话元数据到达时，借事件刷新头部信息
  useUserEvent<{ conversationId: string }>(ev.dmRefresh, (d) => {
    if (d.conversationId === conversationId && !conversation) void mutate();
  });

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Button variant="outline" onClick={() => router.push("/chat")}>
          返回主页
        </Button>
      </div>
    );
  }

  if (isLoading || !conversation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const peer = conversation.peer;

  return (
    <div className="flex min-w-0 flex-1">
      <ChatView
        me={me}
        title={peer.displayName}
        titleIcon={
          <AvatarInitials name={peer.displayName} color={peer.avatarColor} size="sm" />
        }
        subtitle={`@${peer.username}`}
        fetchUrl={`/api/dms/${conversationId}/messages?limit=50`}
        sendUrl={`/api/dms/${conversationId}/messages`}
        realtimeChannel={`private-dm-${conversationId}`}
        emptyHint={`这是你和 ${peer.displayName} 私聊的起点`}
        headerActions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="语音通话"
              onClick={() => void call.startCall(peer, "audio")}
            >
              <Phone />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="视频通话"
              onClick={() => void call.startCall(peer, "video")}
            >
              <Video />
            </Button>
          </>
        }
      />
    </div>
  );
}
