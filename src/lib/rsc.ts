import "server-only";

import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";

/**
 * 页面级鉴权守卫（Next 16 官方推荐模式：检查放在页面/DAL，而非 layout——
 * layout 不随导航重新渲染，且无法阻止 children 出现在 RSC payload 中）。
 */
export async function requirePageUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
