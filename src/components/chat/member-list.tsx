"use client";

import { useMemo } from "react";
import { Crown } from "lucide-react";
import { ch } from "@/lib/constants";
import { usePresenceMembers } from "@/hooks/use-presence-members";
import { useServerData } from "./server-data-provider";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import type { PublicUser } from "@/lib/types";

/** 服务器成员列表：在线（presence 实时）/ 离线分组 */
export function MemberList({ me }: { me: PublicUser }) {
  const { detail } = useServerData();
  const { members: presenceMembers, ready } = usePresenceMembers(
    detail ? ch.server(detail.server.id) : null,
  );

  const onlineIds = useMemo(() => {
    const ids = new Set(presenceMembers.map((m) => m.id));
    // 兜底：成员栏可见即本端在线（presence 数据异常时不误标自己离线）
    if (ready) ids.add(me.id);
    return ids;
  }, [presenceMembers, ready, me.id]);

  if (!detail) return null;

  const { members } = detail;
  const online = members.filter((m) => onlineIds.has(m.id));
  const offline = members.filter((m) => !onlineIds.has(m.id));

  return (
    <aside className="scrollbar-slim hidden w-56 shrink-0 overflow-y-auto bg-sidebar px-3 py-4 lg:block">
      <Group label={`在线 — ${online.length}`}>
        {online.map((m) => (
          <Row key={m.id} member={m} dimmed={false} />
        ))}
      </Group>
      <Group label={`离线 — ${offline.length}`}>
        {offline.map((m) => (
          <Row key={m.id} member={m} dimmed />
        ))}
      </Group>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

function Row({
  member,
  dimmed,
}: {
  member: { id: string; displayName: string; avatarColor: string; role: string };
  dimmed: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      <AvatarInitials name={member.displayName} color={member.avatarColor} size="xs" />
      <span className="truncate">{member.displayName}</span>
      {member.role === "owner" && <Crown className="ml-auto size-3.5 shrink-0 text-warning" />}
    </li>
  );
}
