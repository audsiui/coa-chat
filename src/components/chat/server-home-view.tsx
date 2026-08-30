"use client";

import type { PublicUser } from "@/lib/types";
import { useServerData } from "./server-data-provider";
import { MemberList } from "./member-list";

/** 服务器主页：布局稳定不闪烁——加载期间用通用文案占位，数据到达后渐进填充 */
export function ServerHomeView({ me }: { me: PublicUser }) {
  const { detail } = useServerData();

  const textChannelCount = detail?.channels.filter((c) => c.type === "text").length ?? null;
  const title = detail ? `欢迎来到 ${detail.server.name}` : "欢迎";
  const hint =
    detail === null
      ? "加载频道信息…"
      : (textChannelCount ?? 0) > 0
        ? "从左侧选择一个文字频道开始聊天，或点击语音频道加入语音房"
        : "点击左侧「文字频道」旁的 + 创建第一个频道";

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>
      </div>
      <MemberList me={me} />
    </div>
  );
}
