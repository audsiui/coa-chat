import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { registrationInvites, users } from "@/db/schema";
import { ApiError, ok, toErrorResponse } from "@/lib/api";
import { generateInviteCode, requireUser } from "@/lib/auth";
import { MAX_INVITES_PER_USER } from "@/lib/constants";
import { isUniqueViolation } from "@/lib/pg";
import type { InvitesPayload } from "@/lib/types";

/** GET /api/auth/invites —— 我的注册邀请码与剩余名额 */
export async function GET() {
  try {
    const me = await requireUser();
    const db = getDb();

    const rows = await db
      .select({
        id: registrationInvites.id,
        code: registrationInvites.code,
        usedAt: registrationInvites.usedAt,
        usedByUsername: users.username,
        usedByDisplayName: users.displayName,
        usedByAvatarColor: users.avatarColor,
        createdAt: registrationInvites.createdAt,
      })
      .from(registrationInvites)
      .leftJoin(users, eq(users.id, registrationInvites.usedById))
      .where(eq(registrationInvites.inviterId, me.id))
      .orderBy(desc(registrationInvites.createdAt));

    const payload: InvitesPayload = {
      invites: rows.map((r) => ({
        id: r.id,
        code: r.code,
        usedAt: r.usedAt?.toISOString() ?? null,
        usedBy: r.usedByUsername
          ? {
              username: r.usedByUsername,
              displayName: r.usedByDisplayName!,
              avatarColor: r.usedByAvatarColor!,
            }
          : null,
        createdAt: r.createdAt.toISOString(),
      })),
      quota: {
        used: rows.filter((r) => r.usedAt !== null).length,
        total: MAX_INVITES_PER_USER,
      },
    };
    return ok(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/auth/invites —— 生成新的注册邀请码（每人最多 MAX_INVITES_PER_USER 个） */
export async function POST() {
  try {
    const me = await requireUser();
    const db = getDb();

    const created = await db.transaction(async (tx) => {
      // 锁定邀请人行：串行化名额检查，防止并发生成绕过上限
      await tx.select({ id: users.id }).from(users).where(eq(users.id, me.id)).for("update");
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(registrationInvites)
        .where(eq(registrationInvites.inviterId, me.id));
      if (count >= MAX_INVITES_PER_USER) {
        throw new ApiError(
          403,
          "INVITE_QUOTA_EXCEEDED",
          `邀请码名额已用完（每人最多 ${MAX_INVITES_PER_USER} 个，可作废未使用的邀请码回收名额）`,
        );
      }

      // 随机码撞唯一索引时重试（8 位字母表 31^8，概率可忽略）
      for (let attempt = 0; ; attempt++) {
        try {
          const [row] = await tx
            .insert(registrationInvites)
            .values({ code: generateInviteCode(), inviterId: me.id })
            .returning({ id: registrationInvites.id, code: registrationInvites.code });
          return row!;
        } catch (error) {
          if (attempt < 4 && isUniqueViolation(error)) continue;
          throw error;
        }
      }
    });

    return ok(created, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}