import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { registrationInvites, users } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { hashPassword, insertSessionRow, setSessionCookie } from "@/lib/auth";
import { MAX_INVITES_PER_USER, pickAvatarColor } from "@/lib/constants";
import { pusherConfigured, rtcConfigured } from "@/lib/env";
import { isUniqueViolation } from "@/lib/pg";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validators";

/** POST /api/auth/register —— 邀请制注册（用户与会话原子创建，并发同名由唯一索引兜底） */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`register:${ip}`, 5, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "注册太频繁，请稍后再试");
    }

    const body = await parseJson(req, registerSchema);
    const db = getDb();

    const { user, token, expiresAt } = await db.transaction(async (tx) => {
      // 锁定邀请码行：防止同一邀请码被并发使用
      const inviteRows = await tx
        .select()
        .from(registrationInvites)
        .where(eq(registrationInvites.code, body.inviteCode.toUpperCase()))
        .limit(1)
        .for("update");
      const invite = inviteRows[0];
      if (!invite) throw new ApiError(400, "INVALID_INVITE", "邀请码不存在");
      if (invite.usedById) throw new ApiError(400, "INVITE_USED", "该邀请码已被使用");

      // 锁定邀请人行：串行化配额检查，防止并发注册绕过“每人最多 5 人”限制
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, invite.inviterId))
        .for("update");
      const [{ usedCount }] = await tx
        .select({ usedCount: sql<number>`count(*)::int` })
        .from(registrationInvites)
        .where(
          and(
            eq(registrationInvites.inviterId, invite.inviterId),
            isNotNull(registrationInvites.usedById),
          ),
        );
      if (usedCount >= MAX_INVITES_PER_USER) {
        throw new ApiError(403, "INVITE_QUOTA_EXCEEDED", "邀请人的邀请名额已用完");
      }

      const inserted = await tx
        .insert(users)
        .values({
          username: body.username,
          passwordHash: hashPassword(body.password),
          displayName: body.displayName,
          avatarColor: pickAvatarColor(),
        })
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarColor: users.avatarColor,
        });

      const user = inserted[0]!;

      await tx
        .update(registrationInvites)
        .set({ usedById: user.id, usedAt: new Date() })
        .where(eq(registrationInvites.id, invite.id));

      const session = await insertSessionRow(tx, user.id);
      return { user, token: session.token, expiresAt: session.expiresAt };
    });

    await setSessionCookie(token, expiresAt);

    return ok({
      user,
      features: { pusher: pusherConfigured(), rtc: rtcConfigured() },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toErrorResponse(new ApiError(409, "USERNAME_TAKEN", "该用户名已被占用"));
    }
    return toErrorResponse(error);
  }
}
