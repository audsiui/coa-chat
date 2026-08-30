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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/client-api";
import type { ServerSummary } from "@/lib/types";

/** 创建服务器 / 凭邀请码加入（同一弹窗内切换） */
export function CreateServerDialog({
  children,
  onDone,
}: {
  children: React.ReactElement;
  onDone: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const server = await api.post<ServerSummary>("/api/servers", { name: name.trim() });
      toast.success(`服务器「${server.name}」已创建`);
      setOpen(false);
      setName("");
      await onDone();
      router.push(`/chat/server/${server.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!inviteCode.trim() || busy) return;
    setBusy(true);
    try {
      const server = await api.post<ServerSummary>("/api/servers/join", {
        inviteCode: inviteCode.trim(),
      });
      toast.success(`已加入「${server.name}」`);
      setOpen(false);
      setInviteCode("");
      await onDone();
      router.push(`/chat/server/${server.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>建立你的圈子</DialogTitle>
          <DialogDescription>创建新服务器，或用邀请码加入朋友的</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="create">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">
              创建
            </TabsTrigger>
            <TabsTrigger value="join" className="flex-1">
              加入
            </TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="flex flex-col gap-3 pt-2">
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="server-name">服务器名称</Label>
                <Input
                  id="server-name"
                  name="name"
                  value={name}
                  maxLength={50}
                  placeholder="例如：产品研发组"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "创建中…" : "创建服务器"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="join" className="flex flex-col gap-3 pt-2">
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void join(); }}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-code">邀请码</Label>
                <Input
                  id="invite-code"
                  name="inviteCode"
                  value={inviteCode}
                  placeholder="粘贴朋友给你的邀请码"
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy || !inviteCode.trim()}>
                {busy ? "加入中…" : "加入服务器"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
