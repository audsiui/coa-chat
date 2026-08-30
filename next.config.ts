import type { NextConfig } from "next";

/**
 * CSP 说明：
 * - 'unsafe-inline'/'unsafe-eval'（script）为 Next.js 运行所需（内联引导脚本与开发期 HMR）。
 *   生产加固方案：用 proxy 生成 nonce 替代 unsafe-inline（见 README"安全"一节）。
 * - connect-src 覆盖 Pusher（wss 信令）与 VideoSDK（REST + wss）。
 * - media-src blob: 为 WebRTC 本地媒体流回放所需。
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* wss://localhost:* wss://*.pusher.com wss://*.pusherapp.com https://*.videosdk.live wss://*.videosdk.live",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // 静态类型化的 Link/router.push 路由（Next 16 已 stable，opt-in）
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;
