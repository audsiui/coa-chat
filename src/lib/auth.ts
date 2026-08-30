import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb, type PostgresDb } from "@/db";
import { sessions, users } from "@/db/schema";
import type { PublicUser } from "./types";

const SESSION_COOKIE = "coachat_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

/* ---------------- 密码 ---------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* ---------------- 会话 ---------------- */

export type SessionUser = PublicUser;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 创建会话并写入 httpOnly Cookie（仅在 Route Handler / Server Action 中可用）。
 * 事务友好：insertSessionRow 可传入事务执行器，cookie 写入在事务提交后进行。
 */
export async function insertSessionRow(
  db: Pick<PostgresDb, "insert">,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: null,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** 便捷封装：创建会话行并写入 cookie（单步场景用） */
export async function createSession(userId: string): Promise<void> {
  const { token, expiresAt } = await insertSessionRow(getDb(), userId);
  await setSessionCookie(token, expiresAt);
}

/** 读取当前登录用户；未登录返回 null */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarColor: users.avatarColor,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const user = rows[0];
  if (!user) return null;

  // 滑动活跃时间（失败不影响主流程）
  try {
    await db
      .update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  } catch {
    /* ignore */
  }

  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const { ApiError } = await import("./api");
    throw new ApiError(401, "UNAUTHORIZED", "请先登录");
  }
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/* ---------------- 注册邀请码 ---------------- */

/** 邀请码字母表：去除易混淆的 0/O/1/I/L */
const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 生成 8 位随机邀请码 */
export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }
  return code;
}
