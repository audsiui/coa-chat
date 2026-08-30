import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getUnreadCounts } from "@/lib/unread";

/** GET /api/unread —— 登录后的权威未读快照（离线期间的消息由此补齐） */
export async function GET() {
  try {
    const me = await requireUser();
    return ok(await getUnreadCounts(me.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
