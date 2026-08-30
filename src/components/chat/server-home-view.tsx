"use client";

import type { PublicUser } from "@/lib/types";
import { useServerData } from "./server-data-provider";
import { MemberList } from "./member-list";
import { Spinner } from "@/components/ui/spinner";

/** 服务器主页：提示选择频道 + 成员列表 */
export function ServerHomeView({ me }: { me: PublicUser }) {
  const { detail, loading } = useServerData();

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {loading ? (
          <Spinner className="size-6" />
        ) : detail && detail.channels.filter((c) => c.type === "text").length > 0 ? (
          <>
            <h2 className="text-lg font-semibold">欢迎来到 {detail.server.name}</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              从左侧选择一个文字频道开始聊天，或点击语音频道加入语音房
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">还没有文字频道</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              点击左侧「文字频道」旁的 + 创建第一个频道
            </p>
          </>
        )}
      </div>
      <MemberList me={me} />
    </div>
  );
}
