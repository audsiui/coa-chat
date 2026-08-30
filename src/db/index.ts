import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type PostgresDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * 惰性单例：import 与建库实例时都不发起连接，首次查询才握手（构建期安全）。
 * - prepare: false —— 兼容 Neon Pooler（PgBouncer 事务模式）
 * - idle_timeout / max_lifetime —— 回收陈旧连接，避免被网络/NAT 断开的死连接
 * - 连接串带 sslmode=require 时由 postgres 自动启用 TLS
 */
let instance: PostgresDb | null = null;

export function getDb(): PostgresDb {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("数据库未配置：请在 .env 中设置 DATABASE_URL（参考 .env.example）");
  }

  const client = postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
  instance = drizzle(client, { schema });
  return instance;
}

export { schema };
