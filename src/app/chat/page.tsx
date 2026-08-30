import { MessagesSquare } from "lucide-react";
import { requirePageUser } from "@/lib/rsc";

export default async function ChatHome() {
  await requirePageUser();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-input">
        <MessagesSquare className="size-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">欢迎来到 CoaChat</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        从左侧选择一个私聊会话，或点击左侧服务器进入频道。点 + 创建或加入新的圈子。
      </p>
    </div>
  );
}
