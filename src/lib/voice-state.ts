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

/**
 * 读取某服务器的语音占用名单（含用户展示信息）。
 * 同一用户多标签时按 updatedAt 取最新一行去重（单点接入语义）。
 */
export async function listServerVoiceStates(serverId: string) {
  const db = getDb();
  const rows = await db
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

  const unique = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = unique.get(r.userId);
    if (!cur || r.updatedAt > cur.updatedAt) unique.set(r.userId, r);
  }
  return [...unique.values()];
}

/** 读取某语音房当前成员（VoiceMember 形态，按用户去重） */
export async function listChannelVoiceMembers(channelId: string) {
  const db = getDb();
  const rows = await db
    .select({
      userId: voiceStates.userId,
      displayName: users.displayName,
      avatarColor: users.avatarColor,
      micOn: voiceStates.micOn,
      updatedAt: voiceStates.updatedAt,
    })
    .from(voiceStates)
    .innerJoin(users, eq(users.id, voiceStates.userId))
    .where(eq(voiceStates.channelId, channelId));

  const unique = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = unique.get(r.userId);
    if (!cur || r.updatedAt > cur.updatedAt) unique.set(r.userId, r);
  }
  return [...unique.values()].map((r) => ({
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

/**
 * 用户加入/切换语音房：写入 (userId, clientSession) 状态行，
 * 并作废该用户其它客户端会话的行（单点接入：新标签接管旧标签）。
 * 返回被作废行涉及的服务器（调用方负责广播它们）。
 */
export async function upsertVoiceState(
  userId: string,
  clientSession: string,
  channelId: string,
  serverId: string,
): Promise<string[]> {
  const db = getDb();
  const prev = await db
    .select({
      clientSession: voiceStates.clientSession,
      serverId: voiceStates.serverId,
    })
    .from(voiceStates)
    .where(eq(voiceStates.userId, userId));

  await db
    .insert(voiceStates)
    .values({ userId, clientSession, channelId, serverId, micOn: true, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [voiceStates.userId, voiceStates.clientSession],
      set: { channelId, serverId, micOn: true, updatedAt: new Date() },
    });

  const staleSessions = prev
    .filter((p) => p.clientSession !== clientSession)
    .map((p) => p.clientSession);
  if (staleSessions.length > 0) {
    await db
      .delete(voiceStates)
      .where(
        and(
          eq(voiceStates.userId, userId),
          inArray(voiceStates.clientSession, staleSessions),
        ),
      );
  }

  const affected = new Set<string>([serverId, ...prev.map((p) => p.serverId)]);
  return [...affected];
}

/** 用户离开语音房：删除其会话状态行，返回被删行所属服务器（无行则 null） */
export async function removeVoiceState(
  userId: string,
  clientSession: string,
): Promise<{ serverId: string; channelId: string } | null> {
  const db = getDb();
  const deleted = await db
    .delete(voiceStates)
    .where(
      and(eq(voiceStates.userId, userId), eq(voiceStates.clientSession, clientSession)),
    )
    .returning({ serverId: voiceStates.serverId, channelId: voiceStates.channelId });
  return deleted[0] ?? null;
}
