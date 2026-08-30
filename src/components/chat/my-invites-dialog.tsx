"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import type { InvitesPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** 我的注册邀请码：查看 / 生成 / 作废（受控弹窗：由父级管理 open） */
export function MyInvitesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<InvitesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<InvitesPayload>("/api/auth/invites"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载邀请码失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const create = async () => {
    setBusyId("__create__");
    try {
      await api.post("/api/auth/invites");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await api.delete(`/api/auth/invites/${id}`);
      toast.success("邀请码已作废");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "作废失败");
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("邀请码已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const remaining = data ? data.quota.total - data.quota.used : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>邀请好友注册</DialogTitle>
          <DialogDescription>
            {data
              ? `每人最多邀请 ${data.quota.total} 人，剩余名额 ${remaining} 个`
              : "每人最多邀请 5 人"}
          </DialogDescription>
        </DialogHeader>

        <Button
          variant="secondary"
          onClick={() => void create()}
          disabled={loading || busyId !== null || (remaining !== null && remaining <= 0)}
        >
          {busyId === "__create__" ? <Spinner /> : <Plus />}
          生成邀请码
        </Button>

        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto scrollbar-slim">
            {data?.invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-2">
                <Input readOnly value={invite.code} className="font-mono" onFocus={(e) => e.target.select()} />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="复制邀请码"
                  onClick={() => void copy(invite.code)}
                >
                  <Copy />
                </Button>
                {invite.usedBy ? (
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                    已被 {invite.usedBy.displayName} 使用
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="作废邀请码"
                    disabled={busyId !== null}
                    onClick={() => void revoke(invite.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {busyId === invite.id ? <Spinner /> : <Trash2 />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}