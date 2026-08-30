"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { api } from "@/lib/client-api";
import type { ConversationDTO, PublicUser } from "@/lib/types";

/** 发起私聊：列出与我共享服务器的用户 */
export function StartDmDialog({
  children,
  onCreated,
}: {
  children: React.ReactElement;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PublicUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCandidates = async () => {
    setCandidates(null);
    try {
      setCandidates(await api.get<PublicUser[]>("/api/dms/candidates"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载用户失败");
      setCandidates([]);
    }
  };

  const openDm = async (user: PublicUser) => {
    if (busyId) return;
    setBusyId(user.id);
    try {
      const conv = await api.post<ConversationDTO>("/api/dms", { userId: user.id });
      setOpen(false);
      onCreated?.();
      router.push(`/chat/dm/${conv.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "打开会话失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void loadCandidates();
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发起私聊</DialogTitle>
          <DialogDescription>与你在同一服务器的用户会显示在这里</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto scrollbar-slim">
          {candidates === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              还没有可以私聊的用户，先邀请他们加入你的服务器吧
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => void openDm(u)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-accent disabled:opacity-50"
                  >
                    <AvatarInitials name={u.displayName} color={u.avatarColor} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{u.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{u.username}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StartDmButton(props: { onCreated?: () => void }) {
  return (
    <StartDmDialog {...props}>
      <Button variant="ghost" size="icon-xs" aria-label="发起新私聊">
        +
      </Button>
    </StartDmDialog>
  );
}
