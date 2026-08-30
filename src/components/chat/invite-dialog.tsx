"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** 展示服务器邀请码并复制（受控弹窗：由父级管理 open，触发器由父级渲染） */
export function InviteDialog({
  inviteCode,
  serverName,
  open,
  onOpenChange,
}: {
  inviteCode: string;
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.success("邀请码已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>邀请加入 {serverName}</DialogTitle>
          <DialogDescription>把下面的邀请码发给同事或朋友</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={inviteCode}
            className="font-mono"
            onFocus={(e) => e.target.select()}
          />
          <Button variant="secondary" size="icon" aria-label="复制邀请码" onClick={() => void copy()}>
            <Copy />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
