"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import { toast } from "sonner";
import { ch, ev } from "@/lib/constants";

const PusherContext = createContext<Pusher | null>(null);

export function PusherProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  const client = useMemo(() => {
    if (!key || !cluster) return null;
    return new Pusher(key, {
      cluster,
      authEndpoint: "/api/pusher/auth",
      // 会话 Cookie 同源自动携带
      auth: { params: {} },
    });
  }, [key, cluster]);

  useEffect(() => {
    return () => client?.disconnect();
  }, [client]);

  return (
    <PusherContext.Provider value={client}>
      <UserEventsBus userId={userId} />
      {children}
    </PusherContext.Provider>
  );
}

export function usePusher(): Pusher | null {
  return useContext(PusherContext);
}

/** 订阅/退订生命周期封装 */
export function usePusherChannel(channelName: string | null): Channel | null {
  const pusher = usePusher();
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!pusher || !channelName) {
      setChannel(null);
      return;
    }
    const ch = pusher.subscribe(channelName);
    setChannel(ch);
    return () => {
      pusher.unsubscribe(channelName);
      setChannel(null);
    };
  }, [pusher, channelName]);

  return channel;
}

/* ------------------------------------------------------------------ */
/* 用户事件总线：private-user-{id} 全应用只订阅一次，避免组件间互踢      */
/* ------------------------------------------------------------------ */

type Listener = (data: unknown) => void;

const UserEventsContext = createContext<{
  on: (event: string, cb: Listener) => () => void;
} | null>(null);

const USER_EVENTS: string[] = [
  ev.dmNew,
  ev.dmRefresh,
  ev.callIncoming,
  ev.callAccepted,
  ev.callRejected,
  ev.callCancelled,
  ev.callEnded,
];

function UserEventsBus({ userId }: { userId: string }) {
  const channel = usePusherChannel(ch.user(userId));
  const listenersRef = useRef(new Map<string, Set<Listener>>());

  useEffect(() => {
    if (!channel) return;
    const makeHandler = (event: string): Listener => (data) => {
      listenersRef.current.get(event)?.forEach((cb) => cb(data));
    };
    const handlers = new Map(USER_EVENTS.map((e) => [e, makeHandler(e)] as const));
    handlers.forEach((handler, event) => channel.bind(event, handler));

    // 订阅失败不再静默：直接提示用户刷新（曾导致"来电不弹窗"类问题难排查）
    const onSubscriptionError = (err: unknown) => {
      console.error("[pusher] private-user 订阅失败", err);
      toast.error("实时通道订阅失败，请刷新页面重试");
    };
    channel.bind("pusher:subscription_error", onSubscriptionError);

    return () => {
      handlers.forEach((handler, event) => channel.unbind(event, handler));
      channel.unbind("pusher:subscription_error", onSubscriptionError);
    };
  }, [channel]);

  const value = useMemo(
    () => ({
      on: (event: string, cb: Listener) => {
        let set = listenersRef.current.get(event);
        if (!set) {
          set = new Set();
          listenersRef.current.set(event, set);
        }
        set.add(cb);
        return () => {
          set?.delete(cb);
        };
      },
    }),
    [],
  );

  return <UserEventsContext.Provider value={value}>{null}</UserEventsContext.Provider>;
}

/** 订阅发给我的用户级事件（私聊刷新、通话信令等） */
export function useUserEvent<T = unknown>(event: string, cb: (data: T) => void): void {
  const bus = useContext(UserEventsContext);
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    return bus?.on(event, (data) => cbRef.current(data as T));
  }, [bus, event]);
}
