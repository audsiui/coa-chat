"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import type { PublicUser } from "@/lib/types";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";

/** 侧栏底部：当前用户信息 + 退出登录 */
export function UserPanel({ me }: { me: PublicUser }) {
  const router = useRouter();

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
      router.push("/login");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "退出失败");
    }
  };

  return (
    <div className="flex items-center gap-2 bg-rail px-2 py-2">
      <AvatarInitials name={me.displayName} color={me.avatarColor} size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{me.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">@{me.username}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="退出登录"
        onClick={() => void logout()}
        className="text-muted-foreground hover:text-destructive"
      >
        <LogOut />
      </Button>
    </div>
  );
}
