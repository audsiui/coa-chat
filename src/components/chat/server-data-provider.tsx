"use client";

import { createContext, useContext, useMemo } from "react";
import useSWR from "swr";
import type { ServerDetail } from "@/lib/types";
import { swrFetcher } from "@/lib/client-api";

type ServerDataValue = {
  detail: ServerDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ServerDataContext = createContext<ServerDataValue | null>(null);

/**
 * 当前激活服务器的详情（频道 + 成员），侧栏与右侧聊天页共用。
 * Provider 常驻包裹整个外壳（含 main 区域）；serverId 为 null（主页视图）时不请求。
 * SWR 提供 key 级缓存/去重/重试；serverId 变化即自动重新请求。
 */
export function ServerDataProvider({
  serverId,
  children,
}: {
  serverId: string | null;
  children: React.ReactNode;
}) {
  const { data, error, isLoading, mutate } = useSWR<ServerDetail>(
    serverId ? `/api/servers/${serverId}` : null,
    swrFetcher,
  );

  const value = useMemo<ServerDataValue>(
    () => ({
      detail: data ?? null,
      loading: isLoading,
      error: error instanceof Error ? error.message : null,
      refresh: async () => {
        await mutate();
      },
    }),
    [data, isLoading, error, mutate],
  );

  return <ServerDataContext.Provider value={value}>{children}</ServerDataContext.Provider>;
}

export function useServerData(): ServerDataValue {
  const ctx = useContext(ServerDataContext);
  if (!ctx) throw new Error("useServerData 必须在 ServerDataProvider 内使用");
  return ctx;
}
