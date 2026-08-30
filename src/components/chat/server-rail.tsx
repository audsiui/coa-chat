"use client";

import Link from "next/link";
import type { Route } from "next";
import useSWR from "swr";
import { Home, Plus } from "lucide-react";
import type { PublicUser, ServerSummary } from "@/lib/types";
import { swrFetcher } from "@/lib/client-api";
import { useUnread } from "@/hooks/use-unread";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { CreateServerDialog } from "./create-server-dialog";
import { cn } from "@/lib/utils";

/** 最左侧服务器切换栏 */
export function ServerRail({
  me,
  activeServerId,
}: {
  me: PublicUser;
  activeServerId: string | null;
}) {
  const { data: servers = [], mutate } = useSWR<ServerSummary[]>("/api/servers", swrFetcher);
  const { serverHasUnread } = useUnread();

  return (
    <nav className="scrollbar-slim flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3">
      <RailItem
        href="/chat"
        active={!activeServerId}
        label="私聊与主页"
        content={<Home className="size-5" />}
      />
      <Separator className="w-8 bg-border" />
      {servers.map((s) => (
        <RailItem
          key={s.id}
          href={`/chat/server/${s.id}`}
          active={activeServerId === s.id}
          label={s.name}
          dot={Boolean(serverHasUnread[s.id])}
          content={<AvatarInitials name={s.name} color={s.iconColor} size="sm" />}
        />
      ))}
      <CreateServerDialog onDone={() => void mutate()}>
        <Button
          variant="secondary"
          size="icon"
          className="size-12 rounded-2xl text-success hover:rounded-xl hover:bg-success hover:text-white"
          aria-label="创建或加入服务器"
        >
          <Plus className="size-5" />
        </Button>
      </CreateServerDialog>
      <span className="sr-only">当前用户：{me.username}</span>
    </nav>
  );
}

function RailItem({
  href,
  active,
  label,
  content,
  dot = false,
}: {
  href: string;
  active: boolean;
  label: string;
  content: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // href 由运行时的服务器 id 拼出，格式已由路由表约束
          <Link
            href={href as Route}
            className={cn(
              "relative flex size-12 items-center justify-center rounded-2xl transition-all hover:rounded-xl",
              active
                ? "rounded-xl bg-primary text-white"
                : "bg-secondary text-secondary-foreground hover:bg-primary hover:text-white",
            )}
          >
            {content}
            {dot && !active && (
              <span
                aria-hidden
                className="absolute right-1 bottom-1 size-2.5 rounded-full bg-destructive ring-2 ring-rail"
              />
            )}
          </Link>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
