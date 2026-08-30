import "server-only";

import { z } from "zod";

/**
 * 服务端环境变量：启动期 zod 校验，集中读取，避免散落的 process.env 访问。
 * NEXT_PUBLIC_* 由客户端直接读取（见 pusher-provider），不在此处。
 */
const serverEnvSchema = z.object({
  AUTH_SECRET: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PUSHER_APP_ID: z.string().optional(),
  PUSHER_KEY: z.string().optional(),
  PUSHER_SECRET: z.string().optional(),
  PUSHER_CLUSTER: z.string().optional(),
  VIDEOSDK_API_KEY: z.string().optional(),
  VIDEOSDK_SECRET: z.string().optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`环境变量不合法：${fields}`);
}
const raw = parsed.data;

export const env = {
  authSecret: raw.AUTH_SECRET ?? "",
  pusher: {
    appId: raw.PUSHER_APP_ID ?? "",
    key: raw.PUSHER_KEY ?? "",
    secret: raw.PUSHER_SECRET ?? "",
    cluster: raw.PUSHER_CLUSTER ?? "",
  },
  videosdk: {
    apiKey: raw.VIDEOSDK_API_KEY ?? "",
    secret: raw.VIDEOSDK_SECRET ?? "",
  },
} as const;

export function pusherConfigured(): boolean {
  return Boolean(env.pusher.appId && env.pusher.key && env.pusher.secret && env.pusher.cluster);
}

export function rtcConfigured(): boolean {
  return Boolean(env.videosdk.apiKey && env.videosdk.secret);
}
