import "server-only";

/** Postgres 错误码判断（postgres.js 抛出的错误带 code 属性） */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}
