"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** 路由段级错误兜底（Next 16：prop 名为 retry，旧版的 reset 已更名） */
export default function ChatError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h2 className="text-lg font-semibold">页面出错了</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message || "发生了意外错误，请重试。"}
      </p>
      <Button onClick={retry}>重试</Button>
    </div>
  );
}
