"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Hash, Volume2 } from "lucide-react";
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
import { api } from "@/lib/client-api";
import type { ChannelDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 创建文字/语音频道（触发器由外部传入） */
export function CreateChannelDialog({
  serverId,
  defaultType = "text",
  onDone,
  children,
}: {
  serverId: string;
  defaultType?: "text" | "voice";
  onDone: () => void | Promise<void>;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">(defaultType);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const channel = await api.post<ChannelDTO>(`/api/servers/${serverId}/channels`, {
        name: name.trim(),
        type,
      });
      toast.success(`频道 ${channel.name} 已创建`);
      setOpen(false);
      setName("");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建频道</DialogTitle>
          <DialogDescription>文字频道用于聊天，语音频道用于多人语音</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>频道类型</Label>
            <div className="flex gap-2">
              <TypeOption
                active={type === "text"}
                icon={<Hash className="size-4" />}
                label="文字"
                onClick={() => setType("text")}
              />
              <TypeOption
                active={type === "voice"}
                icon={<Volume2 className="size-4" />}
                label="语音"
                onClick={() => setType("voice")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel-name">频道名称</Label>
            <Input
              id="channel-name"
              name="name"
              value={name}
              maxLength={32}
              placeholder="例如：闲聊、项目同步"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "创建中…" : "创建频道"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TypeOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors",
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
