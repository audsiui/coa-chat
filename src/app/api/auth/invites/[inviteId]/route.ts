import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { registrationInvites } from "@/db/schema";
import { ApiError, ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/** DELETE /api/auth/invites/:inviteId —— 作废未使用的邀请码（回收名额） */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/auth/invites/[inviteId]">) {
  try {
    const me = await requireUser();
    const { inviteId } = await ctx.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteId)) {
      throw new ApiError(400, "VALIDATION_ERROR", "邀请 ID 不合法");
    }

    const db = getDb();
    const deleted = await db
      .delete(registrationInvites)
      .where(
        and(
          eq(registrationInvites.id, inviteId),
          eq(registrationInvites.inviterId, me.id),
          // 已使用的邀请码不可作废（是邀请历史，也占用名额）
          isNull(registrationInvites.usedById),
        ),
      )
      .returning({ id: registrationInvites.id });

    if (!deleted[0]) {
      throw new ApiError(404, "INVITE_NOT_FOUND", "邀请码不存在或已被使用");
    }
    return ok({ id: deleted[0].id });
  } catch (error) {
    return toErrorResponse(error);
  }
}