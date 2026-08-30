import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { hashPassword, insertSessionRow, setSessionCookie } from "@/lib/auth";
import { pickAvatarColor } from "@/lib/constants";
import { pusherConfigured, rtcConfigured } from "@/lib/env";
import { isUniqueViolation } from "@/lib/pg";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validators";

/** POST /api/auth/register —— 注册（用户与会话原子创建，并发同名由唯一索引兜底） */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`register:${ip}`, 5, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "注册太频繁，请稍后再试");
    }

    const body = await parseJson(req, registerSchema);
    const db = getDb();

    const { user, token, expiresAt } = await db.transaction(async (tx) => {
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
