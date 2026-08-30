import "server-only";

import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { users, voiceStates } from "@/db/schema";
import { ch, ev } from "./constants";
import { triggerSafely } from "./pusher";

/** 心跳超时：超过该时长没有 sync 的语音状态视为陈旧（客户端 20s 心跳一次） */
export const VOICE_STATE_STALE_MS = 90_000;

export type SweptVoiceState = { userId: string; channelId: string; serverId: string };

/** 删除过期语音状态，返回被清理的行（调用方负责对相关服务器广播） */
export async function sweepExpiredVoiceStates(): Promise<SweptVoiceState[]> {
  const db = getDb();
  const stale = await db
    .select({
      userId: voiceStates.userId,
      channelId: voiceStates.channelId,
      serverId: voiceStates.serverId,
    })
    .from(voiceStates)
    .where(lt(voiceStates.updatedAt, new Date(Date.now() - VOICE_STATE_STALE_MS)));

  if (stale.length === 0) return [];

  await db.delete(voiceStates).where(
    inArray(
      voiceStates.userId,
      stale.map((s) => s.userId),
    ),
  );
  return stale;
}

/** 读取某服务器的完整语音名单（含用户展示信息） */
export async function listServerVoiceStates(serverId: string) {
  const db = getDb();
  return db
    .select({
      userId: voiceStates.userId,
      channelId: voiceStates.channelId,
      displayName: users.displayName,
      avatarColor: users.avatarColor,
      micOn: voiceStates.micOn,
      updatedAt: voiceStates.updatedAt,
    })
    .from(voiceStates)
    .innerJoin(users, eq(users.id, voiceStates.userId))
    .where(eq(voiceStates.serverId, serverId));
}

/** 读取某语音房当前成员（VoiceMember 形态） */
export async function listChannelVoiceMembers(channelId: string) {
  const db = getDb();
  const rows = await db
    .select({
      userId: voiceStates.userId,
      displayName: users.displayName,
      avatarColor: users.avatarColor,
      micOn: voiceStates.micOn,
    })
    .from(voiceStates)
    .innerJoin(users, eq(users.id, voiceStates.userId))
    .where(eq(voiceStates.channelId, channelId));

  return rows.map((r) => ({
    id: r.userId,
    displayName: r.displayName,
    avatarColor: r.avatarColor,
    micOn: r.micOn,
  }));
}

/** 向某服务器全员广播完整语音名单（全量快照，客户端整体替换，无合并错误） */
export async function broadcastServerVoiceStates(serverId: string): Promise<void> {
  const states = await listServerVoiceStates(serverId);
  await triggerSafely(ch.server(serverId), ev.voiceStates, { serverId, states });
}

/** 清扫过期状态并对受影响的服务器广播（所有写路径共用） */
export async function sweepAndBroadcast(): Promise<void> {
  const swept = await sweepExpiredVoiceStates();
  const serverIds = [...new Set(swept.map((s) => s.serverId))];
  for (const serverId of serverIds) {
    await broadcastServerVoiceStates(serverId);
  }
}

/** 用户加入/切换语音房：upsert 单行状态；返回旧状态（供调用方广播原服务器） */
export async function upsertVoiceState(
  userId: string,
  channelId: string,
  serverId: string,
): Promise<{ prevServerId: string | null; prevChannelId: string | null }> {
  const db = getDb();
  const prev = await db
    .select({ serverId: voiceStates.serverId, channelId: voiceStates.channelId })
    .from(voiceStates)
    .where(eq(voiceStates.userId, userId))
    .limit(1);

  await db
    .insert(voiceStates)
    .values({ userId, channelId, serverId, micOn: true, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: voiceStates.userId,
      set: { channelId, serverId, micOn: true, updatedAt: new Date() },
    });

  return {
    prevServerId: prev[0]?.serverId ?? null,
    prevChannelId: prev[0]?.channelId ?? null,
  };
}

/** 用户离开语音房：删除其状态行，返回被删行所属服务器（无行则 null） */
export async function removeVoiceState(
  userId: string,
): Promise<{ serverId: string; channelId: string } | null> {
  const db = getDb();
  const deleted = await db
    .delete(voiceStates)
    .where(and(eq(voiceStates.userId, userId)))
    .returning({ serverId: voiceStates.serverId, channelId: voiceStates.channelId });
  return deleted[0] ?? null;
}
