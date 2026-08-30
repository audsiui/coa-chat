"use client";

import { useEffect, useMemo, useState } from "react";
import { usePusherChannel } from "@/components/providers/pusher-provider";

export type PresenceMember = { id: string; info: Record<string, unknown> };

type RawMember = { id?: unknown; info?: unknown } & Record<string, unknown>;

/**
 * pusher-js 成员对象形态兼容：
 * - 现行版本：{ id, info: {...user_info} }
 * - 旧版本平铺：{ id, ...user_info }
 * 字段不完整返回 null（调用方忽略，绝不因脏数据崩渲染）。
 */
export function parsePresenceMember(data: unknown): PresenceMember | null {
  if (!data || typeof data !== "object") return null;
  const d = data as RawMember;
  const id = typeof d.id === "string" ? d.id : undefined;
  if (!id) return null;
  const info = d.info && typeof d.info === "object" ? (d.info as Record<string, unknown>) : d;
  return { id, info };
}

type PresenceChannelLike = {
  members?: {
    each?: (cb: (member: unknown) => void) => void;
    me?: unknown;
  };
};

/**
 * Pusher presence 频道成员名单——全应用唯一实现，所有在线名单 UI 共用。
 *
 * 关键语义（pusher-js 客户端怪癖的集中处理）：
 * - 订阅成功（含断线重连后的重订阅）用 channel.members.each() 全量播种，
 *   其中【包含自己】——pusher-js 不会为自己的加入触发 member_added；
 * - member_added / member_removed 仅做增量维护；
 * - 成员对象做 {id,info} / 平铺双形态兼容，脏数据忽略。
 */
export function usePresenceMembers(channelName: string | null): {
  members: PresenceMember[];
  ready: boolean;
} {
  const channel = usePusherChannel(channelName);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 切换频道时立即复位，避免上一频道的成员串显
    setMembers([]);
    setReady(false);
    if (!channel) return;

    const seed = () => {
      const like = channel as unknown as PresenceChannelLike;
      const seedList: PresenceMember[] = [];
      like.members?.each?.((member) => {
        const parsed = parsePresenceMember(member);
        if (parsed) seedList.push(parsed);
      });
      // 双保险：播种结果缺自己时用 members.me 补上
      const me = parsePresenceMember(like.members?.me);
      if (me && !seedList.some((m) => m.id === me.id)) seedList.push(me);
      setMembers(seedList);
      setReady(true);
    };

    const onAdded = (data: unknown) => {
      const parsed = parsePresenceMember(data);
      if (!parsed) return;
      setMembers((list) => (list.some((m) => m.id === parsed.id) ? list : [...list, parsed]));
    };
    const onRemoved = (data: unknown) => {
      const parsed = parsePresenceMember(data);
      const id = parsed?.id ?? (data as { id?: string } | null)?.id;
      if (!id) return;
      setMembers((list) => list.filter((m) => m.id !== id));
    };

    channel.bind("pusher:subscription_succeeded", seed);
    channel.bind("pusher:member_added", onAdded);
    channel.bind("pusher:member_removed", onRemoved);
    return () => {
      channel.unbind("pusher:subscription_succeeded", seed);
      channel.unbind("pusher:member_added", onAdded);
      channel.unbind("pusher:member_removed", onRemoved);
    };
  }, [channel]);

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.id.localeCompare(b.id)),
    [members],
  );

  return { members: sorted, ready };
}
