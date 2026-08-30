"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client-api";
import { ev } from "@/lib/constants";
import { playNotifySound } from "@/lib/sound";
import { usePusher, useUserEvent } from "@/components/providers/pusher-provider";

type UnreadContextValue = {
  /** 文字频道未读：channelId -> count */
  channelUnread: Record<string, number>;
  /** 私聊未读：conversationId -> count */
  dmUnread: Record<string, number>;
  /** 服务器是否有任一频道未读（rail 圆点） */
  serverHasUnread: Record<string, boolean>;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

const CHANNEL_ROUTE = /^\/chat\/server\/[0-9a-f-]{36}\/([0-9a-f-]{36})/;
const DM_ROUTE = /^\/chat\/dm\/([0-9a-f-]{36})/;

/**
 * 未读中枢：服务端权威快照（登录时拉取）+ private-user 事件增量维护。
 * - 打开频道/会话（路由变化）与回到可见时自动标记已读并清零
 * - 非当前会话的新消息：计数 +1、提示音、标题闪烁
 */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({});
  const [dmUnread, setDmUnread] = useState<Record<string, number>>({});
  const [channelServer, setChannelServer] = useState<Record<string, string>>({});

  const activeChannelId = CHANNEL_ROUTE.exec(pathname)?.[1] ?? null;
  const activeDmId = DM_ROUTE.exec(pathname)?.[1] ?? null;
  const activeRef = useRef({ channelId: activeChannelId, dmId: activeDmId });
  useEffect(() => {
    activeRef.current = { channelId: activeChannelId, dmId: activeDmId };
  });

  const markChannelRead = useCallback((channelId: string) => {
    setChannelUnread((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
    void api.post(`/api/channels/${channelId}/read`).catch(() => {});
  }, []);

  const markDmRead = useCallback((conversationId: string) => {
    setDmUnread((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    void api.post(`/api/dms/${conversationId}/read`).catch(() => {});
  }, []);

  // 登录后的权威未读快照（离线期间的消息在这里补齐）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{
          channels: Array<{ id: string; serverId: string; count: number }>;
          dms: Array<{ id: string; count: number }>;
        }>("/api/unread");
        if (cancelled) return;
        setChannelUnread(Object.fromEntries(data.channels.map((c) => [c.id, c.count])));
        setChannelServer(Object.fromEntries(data.channels.map((c) => [c.id, c.serverId])));
        setDmUnread(Object.fromEntries(data.dms.map((d) => [d.id, d.count])));
      } catch {
        /* 未登录或网络异常时静默；事件增量仍可用 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 打开频道/会话即清零
  useEffect(() => {
    if (activeChannelId) markChannelRead(activeChannelId);
  }, [activeChannelId, markChannelRead]);
  useEffect(() => {
    if (activeDmId) markDmRead(activeDmId);
  }, [activeDmId, markDmRead]);

  // 从后台回到可见：当前频道/会话立即标记已读
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const { channelId, dmId } = activeRef.current;
      if (channelId) markChannelRead(channelId);
      if (dmId) markDmRead(dmId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markChannelRead, markDmRead]);

  // Pusher 断线重连后刷新权威未读快照（掉线期间的事件与离线消息一并补齐；
  // 与本地计数取较大值——快照之后到达的事件增量不被覆盖）
  const pusher = usePusher();
  useEffect(() => {
    if (!pusher) return;
    let everConnected = false;
    const onStateChange = ({ current }: { current: string }) => {
      if (current !== "connected") return;
      if (everConnected) {
        void (async () => {
          try {
            const data = await api.get<{
              channels: Array<{ id: string; serverId: string; count: number }>;
              dms: Array<{ id: string; count: number }>;
            }>("/api/unread");
            setChannelServer((prev) => ({
              ...prev,
              ...Object.fromEntries(data.channels.map((c) => [c.id, c.serverId])),
            }));
            setChannelUnread((prev) => {
              const next = { ...prev };
              for (const c of data.channels) {
                next[c.id] = Math.max(prev[c.id] ?? 0, c.count);
              }
              return next;
            });
            setDmUnread((prev) => {
              const next = { ...prev };
              for (const d of data.dms) {
                next[d.id] = Math.max(prev[d.id] ?? 0, d.count);
              }
              return next;
            });
            // 当前打开的会话重连后立即重新标记已读（离线期间已读上报可能失败，
            // 避免快照把红点"复活"到正在看的会话上）
            const { channelId, dmId } = activeRef.current;
            if (channelId) markChannelRead(channelId);
            if (dmId) markDmRead(dmId);
          } catch {
            /* 静默，下次重连或刷新自愈 */
          }
        })();
      }
      everConnected = true;
    };
    pusher.connection.bind("state_change", onStateChange);
    return () => {
      pusher.connection.unbind("state_change", onStateChange);
    };
  }, [pusher, markChannelRead, markDmRead]);

  // 频道新消息通知
  useUserEvent<{ channelId: string; serverId: string }>(ev.channelNotify, (d) => {
    const { channelId } = activeRef.current;
    if (d.channelId === channelId && document.visibilityState === "visible") {
      markChannelRead(d.channelId);
      return;
    }
    setChannelServer((prev) =>
      prev[d.channelId] === d.serverId ? prev : { ...prev, [d.channelId]: d.serverId },
    );
    setChannelUnread((prev) => ({ ...prev, [d.channelId]: (prev[d.channelId] ?? 0) + 1 }));
    playNotifySound();
  });

  // 私聊新消息（复用 dm:refresh 广播）
  useUserEvent<{ conversationId: string }>(ev.dmRefresh, (d) => {
    const { dmId } = activeRef.current;
    if (d.conversationId === dmId && document.visibilityState === "visible") {
      markDmRead(d.conversationId);
      return;
    }
    setDmUnread((prev) => ({ ...prev, [d.conversationId]: (prev[d.conversationId] ?? 0) + 1 }));
    playNotifySound();
  });

  const serverHasUnread = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [channelId, count] of Object.entries(channelUnread)) {
      if (count > 0) {
        const sid = channelServer[channelId];
        if (sid) map[sid] = true;
      }
    }
    return map;
  }, [channelUnread, channelServer]);

  const total = useMemo(
    () =>
      Object.values(channelUnread).reduce((a, b) => a + b, 0) +
      Object.values(dmUnread).reduce((a, b) => a + b, 0),
    [channelUnread, dmUnread],
  );

  // 标签页标题闪烁：`(n) CoaChat ↔ ● CoaChat`
  useEffect(() => {
    const base = "CoaChat — 团队即时通讯";
    if (total === 0) {
      document.title = base;
      return;
    }
    let on = true;
    document.title = `(${total}) ${base}`;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? `(${total}) ${base}` : `● ${base}`;
    }, 900);
    return () => {
      window.clearInterval(timer);
      document.title = base;
    };
  }, [total]);

  const value = useMemo(
    () => ({ channelUnread, dmUnread, serverHasUnread }),
    [channelUnread, dmUnread, serverHasUnread],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadContextValue {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error("useUnread 必须在 UnreadProvider 内使用");
  return ctx;
}
