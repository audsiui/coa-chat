"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import type { PublicUser } from "@/lib/types";
import { PusherProvider } from "@/components/providers/pusher-provider";
import { VoiceProvider } from "@/components/voice/voice-provider";
import { CallProvider } from "@/components/voice/call-provider";
import { ServerRail } from "./server-rail";
import { ServerDataProvider } from "./server-data-provider";
import { ServerSidebar } from "./server-sidebar";
import { DmSidebar } from "./dm-sidebar";
import { UserPanel } from "./user-panel";
import { VoicePanel } from "@/components/voice/voice-panel";

type Features = { pusher: boolean; rtc: boolean };

const SERVER_ROUTE = /^\/chat\/server\/([0-9a-f-]{36})/;

/**
 * 聊天应用外壳：服务器栏 + 会话侧栏（语音/用户面板常驻底部）+ 主区域。
 * Provider 顺序：Pusher（用户事件总线）→ 语音 → 通话（含全局弹窗）。
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

  // 关键配置缺失时给出一次性提示
  useEffect(() => {
    if (!features.pusher) {
      toast.warning("未配置 Pusher：消息实时推送未启用（新消息仅发送方可见）");
    }
  }, [features.pusher]);

  return (
    <PusherProvider userId={user.id}>
      <VoiceProvider me={user}>
        <CallProvider me={user}>
          {/* Provider 必须同时覆盖侧栏与 main 区域——页面组件也消费 useServerData */}
          <ServerDataProvider serverId={activeServerId}>
            <div className="flex h-dvh w-full overflow-hidden">
              <ServerRail me={user} activeServerId={activeServerId} />
              <div className="flex w-60 shrink-0 flex-col bg-sidebar">
                <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
                  {activeServerId ? (
                    <ServerSidebar me={user} />
                  ) : (
                    <DmSidebar me={user} />
                  )}
                </div>
                <VoicePanel />
                <UserPanel me={user} />
              </div>
              <main className="flex min-w-0 flex-1 flex-col">{children}</main>
            </div>
          </ServerDataProvider>
        </CallProvider>
      </VoiceProvider>
    </PusherProvider>
  );
}
