import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiError, ok, parseJson, toErrorResponse } from "@/lib/api";
import { insertSessionRow, setSessionCookie, verifyPassword } from "@/lib/auth";
import { pusherConfigured, rtcConfigured } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const body = await parseJson(req, loginSchema);
    // 按账号维度限流，避免撞库
    if (!rateLimit(`login:${ip}:${body.username.toLowerCase()}`, 10, 60_000)) {
      throw new ApiError(429, "RATE_LIMITED", "尝试次数过多，请一分钟后再试");
    }

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(sql`lower(${users.username}) = ${body.username.toLowerCase()}`)
      .limit(1);

    const row = rows[0];
    if (!row || !verifyPassword(body.password, row.passwordHash)) {
      throw new ApiError(401, "BAD_CREDENTIALS", "用户名或密码不正确");
    }

    const { token, expiresAt } = await insertSessionRow(db, row.id);
    await setSessionCookie(token, expiresAt);

    const user = {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      avatarColor: row.avatarColor,
    };
    return ok({
      user,
      features: { pusher: pusherConfigured(), rtc: rtcConfigured() },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
