"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import type { ServerDetail, VoiceStateDTO } from "@/lib/types";
import { swrFetcher } from "@/lib/client-api";
import { ch, ev } from "@/lib/constants";
import { usePusherChannel } from "@/components/providers/pusher-provider";

type ServerDataValue = {
  detail: ServerDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** 语音房占用名单（DB 权威数据 + 实时事件 + 新鲜度过滤） */
  voiceStates: VoiceStateDTO[];
};

const ServerDataContext = createContext<ServerDataValue | null>(null);

/** 心跳 20s 一次，超过该时长的状态行视为陈旧，不参与展示 */
const FRESH_MS = 90_000;

/**
 * 当前激活服务器的详情（频道 + 成员 + 语音占用名单），侧栏与聊天页共用。
 * SWR 提供 key 级缓存/去重/重试；serverId 变化即自动重新请求。
 * 语音名单额外订阅 private-server 频道接收全量快照与麦克风增量。
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
  const serverChannel = usePusherChannel(serverId ? ch.server(serverId) : null);
  const [voiceStates, setVoiceStates] = useState<VoiceStateDTO[]>([]);

  // 服务端数据到达/变化时作为语音名单的基准
  useEffect(() => {
    setVoiceStates(data?.voiceStates ?? []);
  }, [data]);

  // 实时：全量快照（进/出/切换房间）与麦克风增量
  useEffect(() => {
    if (!serverChannel) return;

    const onStates = (payload: unknown) => {
      const d = payload as { serverId: string; states: VoiceStateDTO[] };
      if (d.serverId === serverId) setVoiceStates(d.states);
    };
    const onMic = (payload: unknown) => {
      const d = payload as {
        serverId: string;
        userId: string;
        channelId: string;
        micOn: boolean;
      };
      if (d.serverId !== serverId) return;
      setVoiceStates((list) =>
        list.map((s) => (s.userId === d.userId ? { ...s, micOn: d.micOn } : s)),
      );
    };

    serverChannel.bind(ev.voiceStates, onStates);
    serverChannel.bind(ev.micState, onMic);
    return () => {
      serverChannel.unbind(ev.voiceStates, onStates);
      serverChannel.unbind(ev.micState, onMic);
    };
  }, [serverChannel, serverId]);

  // 定期剪除陈旧状态行（心跳 20s，超过 90s 未续期的不展示）
  useEffect(() => {
    const timer = window.setInterval(() => {
      setVoiceStates((list) => {
        const now = Date.now();
        const fresh = list.filter(
          (s) => now - new Date(s.updatedAt).getTime() < FRESH_MS,
        );
        return fresh.length === list.length ? list : fresh;
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const value = useMemo<ServerDataValue>(
    () => ({
      detail: data ?? null,
      loading: isLoading,
      error: error instanceof Error ? error.message : null,
      refresh: async () => {
        await mutate();
      },
      voiceStates,
    }),
    [data, isLoading, error, mutate, voiceStates],
  );

  return <ServerDataContext.Provider value={value}>{children}</ServerDataContext.Provider>;
}

export function useServerData(): ServerDataValue {
  const ctx = useContext(ServerDataContext);
  if (!ctx) throw new Error("useServerData 必须在 ServerDataProvider 内使用");
  return ctx;
}
