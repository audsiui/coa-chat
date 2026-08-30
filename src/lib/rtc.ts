import "server-only";

import { SignJWT } from "jose";
import { env, rtcConfigured } from "./env";
import { ApiError } from "./api";

/**
 * VideoSDK 服务端集成：
 * - createRtcToken()  生成用户级 JWT（HS256，官方自签 token 规范）
 * - createRtcRoom()   通过 REST 创建房间，返回 roomId（即 meetingId）
 */

const ROOMS_API = "https://api.videosdk.live/v2/rooms";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.videosdk.secret);
}

export async function createRtcToken(): Promise<string> {
  return new SignJWT({
    apikey: env.videosdk.apiKey,
    permissions: ["allow_join", "allow_mod"],
    version: 2,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey());
}

/** 创建 VideoSDK 房间，返回 meetingId */
export async function createRtcRoom(): Promise<string> {
  const token = await createRtcToken();
  const res = await fetch(ROOMS_API, {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`VideoSDK 建房失败 (HTTP ${res.status}) ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { roomId?: string };
  if (!data.roomId) throw new Error("VideoSDK 建房响应缺少 roomId");
  return data.roomId;
}

/** 供 API 使用的守卫：未配置时抛出友好错误 */
export function requireRtcConfigured(): void {
  if (!rtcConfigured()) {
    throw new ApiError(
      501,
      "RTC_NOT_CONFIGURED",
      "语音/视频未启用：请在 .env 配置 VIDEOSDK_API_KEY 与 VIDEOSDK_SECRET",
    );
  }
}
