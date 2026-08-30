"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import type { PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PusherProvider } from "@/components/providers/pusher-provider";
import { VoiceProvider } from "@/components/voice/voice-provider";
import { CallProvider } from "@/components/voice/call-provider";
import { Button } from "@/components/ui/button";
import { ServerRail } from "./server-rail";
import { ServerDataProvider } from "./server-data-provider";
import { ServerSidebar } from "./server-sidebar";
import { DmSidebar } from "./dm-sidebar";
import { UserPanel } from "./user-panel";
import { VoicePanel } from "@/components/voice/voice-panel";

type Features = { pusher: boolean; rtc: boolean };

const SERVER_ROUTE = /^\/chat\/server\/([0-9a-f-]{36})/;

/**
 * 聊天应用外壳。
 * 桌面（lg+）：服务器栏 + 侧栏常驻三栏。
 * 移动端（<lg）：侧栏为滑入抽屉（应用条汉堡按钮唤出，选中频道/路由变化自动收起）。
 * features 由服务端 RSC 下发（构建环境已知），无需启动期请求。
 */
export function ChatShell({
  user,
  features,
  children,
}: {
  user: PublicUser;
  features: Features;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeServerId = SERVER_ROUTE.exec(pathname)?.[1] ?? null;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 关键配置缺失时给出一次性提示
  useEffect(() => {
    if (!features.pusher) {
      toast.warning("未配置 Pusher：消息实时推送未启用（新消息仅发送方可见）");
    }
  }, [features.pusher]);

  // 路由变化（选中频道/会话）时收起移动端抽屉
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const sidebar = activeServerId ? <ServerSidebar me={user} /> : <DmSidebar me={user} />;

  return (
    <PusherProvider userId={user.id}>
      <VoiceProvider me={user}>
        <CallProvider me={user}>
          {/* Provider 必须同时覆盖侧栏与 main 区域——页面组件也消费 useServerData */}
          <ServerDataProvider serverId={activeServerId}>
            <div className="flex h-dvh w-full overflow-hidden">
              {/* 侧栏容器：桌面常驻静态列；移动端为滑入抽屉（含语音面板与用户面板） */}
              <div
                className={cn(
                  "fixed inset-y-0 left-0 z-40 flex shadow-xl transition-transform duration-200",
                  "lg:static lg:translate-x-0 lg:shadow-none",
                  drawerOpen ? "translate-x-0" : "-translate-x-full",
                )}
              >
                <ServerRail me={user} activeServerId={activeServerId} />
                <div className="flex w-60 shrink-0 flex-col bg-sidebar">
                  <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
                  <VoicePanel />
                  <UserPanel me={user} />
                </div>
              </div>

              {/* 移动端抽屉遮罩 */}
              {drawerOpen && (
                <div
                  className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                  aria-hidden
                  onClick={() => setDrawerOpen(false)}
                />
              )}

              <div className="flex min-w-0 flex-1 flex-col">
                {/* 移动端应用条（桌面隐藏） */}
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-2 lg:hidden">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="打开菜单"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <Menu />
                  </Button>
                  <span className="truncate text-sm font-semibold">CoaChat</span>
                </div>
                <main className="flex min-h-0 flex-1 flex-col">{children}</main>
              </div>
            </div>
          </ServerDataProvider>
        </CallProvider>
      </VoiceProvider>
    </PusherProvider>
  );
}
