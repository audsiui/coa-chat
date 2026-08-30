import { requirePageUser } from "@/lib/rsc";
import { pusherConfigured, rtcConfigured } from "@/lib/env";
import { SwrPersistProvider } from "@/components/providers/swr-persist-provider";
import { ChatShell } from "@/components/chat/chat-shell";

/**
 * 布局只负责取用户与 feature 开关并下发 props。
 * 鉴权决策在各级页面（requirePageUser）与 proxy.ts 乐观检查中——见官方
 * authentication 指南："be cautious when doing checks in Layouts"。
 */
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const user = await requirePageUser();
  const features = { pusher: pusherConfigured(), rtc: rtcConfigured() };
  return (
    <SwrPersistProvider>
      <ChatShell user={user} features={features}>
        {children}
      </ChatShell>
    </SwrPersistProvider>
  );
}
