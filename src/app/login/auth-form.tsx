"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MePayload } from "@/lib/types";

export function AuthForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (mode: "login" | "register") => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "register") {
        await api.post<MePayload>("/api/auth/register", {
          username: username.trim(),
          password,
          displayName: displayName.trim(),
          inviteCode: inviteCode.trim().toUpperCase(),
        });
      } else {
        await api.post<MePayload>("/api/auth/login", {
          username: username.trim(),
          password,
        });
      }
      router.push("/chat");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-rail via-background to-rail p-4">
      <div className="w-full max-w-sm rounded-xl bg-card p-4 ring-1 ring-border sm:p-6">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
            <MessagesSquare className="size-6" />
          </div>
          <h1 className="text-lg font-semibold">CoaChat</h1>
          <p className="text-sm text-muted-foreground">与同事朋友保持连接</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="login" className="flex-1">
              登录
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1">
              注册
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("login");
              }}
            >
              <Field htmlFor="login-username" label="用户名">
                <Input
                  id="login-username"
                  name="username"
                  value={username}
                  autoComplete="username"
                  placeholder="your_name"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field htmlFor="login-password" label="密码">
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy || !username.trim() || !password}>
                {busy ? "登录中…" : "登录"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("register");
              }}
            >
              <Field htmlFor="reg-username" label="用户名（字母、数字、下划线）">
                <Input
                  id="reg-username"
                  name="username"
                  value={username}
                  autoComplete="username"
                  placeholder="your_name"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field htmlFor="reg-display-name" label="昵称">
                <Input
                  id="reg-display-name"
                  name="displayName"
                  value={displayName}
                  placeholder="大家怎么称呼你"
                  maxLength={24}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field htmlFor="reg-password" label="密码（至少 8 位）">
                <Input
                  id="reg-password"
                  name="password"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field htmlFor="reg-invite-code" label="邀请码（向邀请人索取）">
                <Input
                  id="reg-invite-code"
                  name="inviteCode"
                  value={inviteCode}
                  placeholder="XXXXXXXX"
                  className="font-mono uppercase"
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
              </Field>
              <Button
                type="submit"
                disabled={
                  busy || !username.trim() || !displayName.trim() || password.length < 8 || !inviteCode.trim()
                }
              >
                {busy ? "注册中…" : "创建账号"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
