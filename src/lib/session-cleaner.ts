import "server-only";

import { lt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";

let started = false;

/** 每小时清理过期会话行，防止 sessions 表无限膨胀 */
export function registerSessionCleaner(): void {
  if (started) return;
  started = true;

  const sweep = async () => {
    try {
      await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
    } catch (error) {
      // 数据库未配置或暂时不可达时静默跳过，下个周期重试
      console.warn("[session-cleaner] 清理失败:", error);
    }
  };

  const timer = setInterval(() => void sweep(), 60 * 60_000);
  timer.unref?.();
}
