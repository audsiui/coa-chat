"use client";

import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ev } from "@/lib/constants";
import { swrFetcher } from "@/lib/client-api";
import { useUserEvent } from "@/components/providers/pusher-provider";
import { useUnread } from "@/hooks/use-unread";
import { prefetchMessages } from "@/lib/message-store";
import type { ConversationDTO, PublicUser } from "@/lib/types";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { StartDmDialog } from "./start-dm-dialog";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 私聊侧栏（主页视图）：SWR 缓存 + 用户事件触发刷新 */
export function DmSidebar({ me }: { me: PublicUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: conversations = [], error, mutate } = useSWR<ConversationDTO[]>(
    "/api/dms",
    swrFetcher,
  );
  const { dmUnread } = useUnread();

  // 新会话或新消息时刷新列表
  useUserEvent(ev.dmNew, () => void mutate());
  useUserEvent<{ conversationId: string }>(ev.dmRefresh, () => void mutate());

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="font-semibold">私聊</span>
        <StartDmDialog onCreated={() => void mutate()}>
          <button
            type="button"
            aria-label="发起新私聊"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        </StartDmDialog>
      </div>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error && (
          <p className="px-2 py-1 text-sm text-destructive">
            {error instanceof Error ? error.message : "加载会话失败"}
          </p>
        )}
        {conversations.length === 0 && !error && (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            还没有私聊会话，点右上角 + 发起一个吧
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {conversations.map((conv) => {
            const active = pathname === `/chat/dm/${conv.id}`;
            const unread = dmUnread[conv.id] ?? 0;
            return (
              <li key={conv.id}>
                <button
                  type="button"
                  onMouseEnter={() =>
                    void prefetchMessages(`/api/dms/${conv.id}/messages?limit=50`)
                  }
                  onClick={() => router.push(`/chat/dm/${conv.id}`)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5",
                    active
                      ? "bg-accent text-foreground"
                      : unread > 0
                        ? "bg-accent/60 text-foreground hover:bg-accent"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <AvatarInitials
                    name={conv.peer.displayName}
                    color={conv.peer.avatarColor}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {conv.peer.displayName}
                      </span>
                      {unread > 0 ? (
                        <span className="flex min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      ) : (
                        conv.lastMessage && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatRelative(conv.lastMessage.createdAt)}
                          </span>
                        )
                      )}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        unread > 0 ? "text-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {conv.lastMessage
                        ? `${conv.lastMessage.authorId === me.id ? "我：" : ""}${conv.lastMessage.content}`
                        : "开始聊天吧"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
